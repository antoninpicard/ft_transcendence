#!/usr/bin/env bash
# Tests du WAF : le trafic légitime doit passer, les attaques doivent être bloquées.
# Usage (depuis cybersecurity/) : bash waf/tests/waf-test.sh
# Prérequis : le WAF tourne (docker compose up -d), python3 et openssl installés.
set -u

HOST="${WAF_HOST:-localhost}"
HTTPS_PORT="${WAF_HTTPS_PORT:-8443}"
HTTP_PORT="${WAF_HTTP_PORT:-8080}"
BASE="https://${HOST}:${HTTPS_PORT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERT="$COMPOSE_DIR/waf/certs/server.crt"
pass=0
fail=0

ok() { printf 'PASS  %-48s -> %s\n' "$1" "$2"; pass=$((pass + 1)); }
ko() { printf 'FAIL  %-48s -> %s\n' "$1" "$2"; fail=$((fail + 1)); }

# check <nom> <code attendu (regex)> <arguments curl...>
# -k : le certificat est auto-signé en développement.
check() {
  local name="$1" expected="$2" code re
  shift 2
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$@")
  re="^(${expected})\$"
  if [[ "$code" =~ $re ]]; then ok "$name" "$code"; else ko "$name" "$code (attendu : $expected)"; fi
}

# info <nom> <arguments curl...> : affiche le code sans compter le test.
info() {
  local name="$1" code
  shift
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$@")
  printf 'INFO  %-48s -> %s\n' "$name" "$code"
}

echo "== Attente du WAF =="
ready=0
for _ in $(seq 1 30); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 "$BASE/")
  if [ "$code" = "200" ]; then ready=1; break; fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Le WAF ne répond pas sur $BASE : lance d'abord docker compose up -d"
  exit 2
fi
echo "WAF prêt."

echo "== A. Trafic légitime (attendu : 200) =="
check "GET /" 200 "$BASE/"
check "GET avec paramètres normaux" 200 -G "$BASE/api/tickets" --data-urlencode "page=2" --data-urlencode "sort=desc"
check "POST JSON (gratter un ticket)" 200 -X POST -H 'Content-Type: application/json' \
  -d '{"ticketId":"abc123","cell":4}' "$BASE/api/tickets/scratch"
check "PUT /" 200 -X PUT "$BASE/"
check "DELETE /api/tickets/1" 200 -X DELETE "$BASE/api/tickets/1"
check "POST JSON avec apostrophe" 200 -X POST -H 'Content-Type: application/json' \
  -d "{\"name\":\"l'été de Théo\"}" "$BASE/api/test"

echo "== B. Attaques (attendu : 403) =="
check "SQLi : tautologie" 403 -G "$BASE/" --data-urlencode "id=1' OR '1'='1"
check "SQLi : UNION SELECT" 403 -G "$BASE/" --data-urlencode "id=1 UNION SELECT username,password FROM users--"
check "XSS : balise script" 403 -G "$BASE/" --data-urlencode "q=<script>alert(1)</script>"
check "Traversée de chemin" 403 -G "$BASE/" --data-urlencode "file=../../../../etc/passwd"
check "Injection de commande" 403 -G "$BASE/" --data-urlencode "cmd=;cat /etc/passwd"
check "User-Agent de scanner (sqlmap)" 403 -A "sqlmap/1.7" "$BASE/"
check "Méthode PROPFIND (règle 911100)" 403 -X PROPFIND "$BASE/"
check "Méthode TRACE (refusée par nginx : 405)" "403|405" -X TRACE "$BASE/"

echo "== C. Règle locale 10001 et fichiers sensibles =="
check "/.env" 403 "$BASE/.env"
check "/.env.local" 403 "$BASE/.env.local"
check "/.git/config" 403 "$BASE/.git/config"
check "/.ENV (casse)" 403 "$BASE/.ENV"
check "/.gitignore (règle CRS 930130)" 403 "$BASE/.gitignore"
check "/.well-known/test doit passer" 200 "$BASE/.well-known/test"
check "/.github/test doit passer" 200 "$BASE/.github/test"

echo "== D. Transport =="
if curl -s -o /dev/null --max-time 3 "http://${HOST}:${HTTP_PORT}/"; then
  ko "Port HTTP en clair fermé" "le port ${HTTP_PORT} répond"
else
  ok "Port HTTP en clair fermé" "connexion refusée"
fi
check "TLS 1.3 accepté" 200 --tlsv1.3 "$BASE/"
check "TLS 1.2 accepté" 200 --tlsv1.2 --tls-max 1.2 "$BASE/"
if [ -f "$CERT" ]; then
  served=$(openssl s_client -connect "${HOST}:${HTTPS_PORT}" -servername "$HOST" </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256)
  mine=$(openssl x509 -in "$CERT" -noout -fingerprint -sha256)
  if [ -n "$served" ] && [ "$served" = "$mine" ]; then
    ok "Le certificat servi est celui de waf/certs" "empreintes identiques"
  else
    ko "Le certificat servi est celui de waf/certs" "empreintes différentes"
  fi
else
  ko "Certificat waf/certs/server.crt présent" "introuvable"
fi

echo "== E. Journal d'audit =="
marker="audit${RANDOM}${RANDOM}"
curl -sk -o /dev/null -X POST "$BASE/login?t=${marker}" -d "password=FAUXSECRET123&id=1' OR '1'='1"
sleep 1
entry=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" logs --no-log-prefix nginx 2>/dev/null \
  | grep '^{"transaction"' | grep "$marker" | tail -1)
if [ -z "$entry" ]; then
  ko "Entrée d'audit retrouvée" "introuvable"
else
  ok "Entrée d'audit retrouvée" "oui"
  keys=$(printf '%s' "$entry" | python3 -c 'import sys,json; d=json.load(sys.stdin)["transaction"]; print(" ".join(d.get("response", {})))')
  case " $keys " in
    *" body "*) ko "Pas de corps de réponse dans l'audit" "body présent" ;;
    *) ok "Pas de corps de réponse dans l'audit" "clés : $keys" ;;
  esac
  nrules=$(printf '%s' "$entry" | python3 -c 'import sys,json; d=json.load(sys.stdin)["transaction"]; print(len(d.get("messages", [])))')
  if [ "$nrules" -gt 0 ]; then
    ok "Règles déclenchées visibles dans l'audit" "$nrules règles"
  else
    ko "Règles déclenchées visibles dans l'audit" "aucune"
  fi
  leak=$(printf '%s' "$entry" | grep -o 'FAUXSECRET123' | wc -l | tr -d ' ')
  echo "INFO  Limite connue : FAUXSECRET123 apparaît ${leak} fois dans l'audit (champs data et match)"
fi

echo "== F. Faux positifs connus en paranoia 2 (informatif, non compté) =="
for msg in "I want to select a ticket from the list" "ok -- see you; bye" "1 OR 2 gagnants"; do
  info "POST chat : ${msg}" -X POST -H 'Content-Type: application/json' -d "{\"msg\":\"${msg}\"}" "$BASE/api/chat"
done

echo
echo "Résultat : ${pass} réussis, ${fail} échoués"
[ "$fail" -eq 0 ]