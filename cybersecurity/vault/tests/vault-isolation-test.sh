#!/usr/bin/env bash
# Vault isolation tests: each service reads only the secrets it needs, read-only, and only
# the services that need Vault can reach it on the network.
#   api (AppRole backend, policy backend-read): secret/backend/* and secret/db/*
#   db  (AppRole db, policy db-read):           secret/db/* only
#   app (Vue front): needs no secret, so no AppRole and not on vault-net
# Usage (stack started with make): bash cybersecurity/vault/tests/vault-isolation-test.sh
# Only HTTP status codes are printed: never a role_id, secret_id, token or secret value.
set -u

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
# Same Compose files as the Makefile
export COMPOSE_FILE="${COMPOSE_FILE:-cybersecurity/docker-compose.yml:contbuild/docker-compose.yml:cybersecurity/docker-compose.app.yml}"
export COMPOSE_ENV_FILES="${COMPOSE_ENV_FILES:-contbuild/.env}"
pass=0
fail=0

ok() { printf 'PASS  %-52s -> %s\n' "$1" "$2"; pass=$((pass + 1)); }
ko() { printf 'FAIL  %-52s -> %s\n' "$1" "$2"; fail=$((fail + 1)); }

# check <name> <expected> <got>
check() { if [ "$3" = "$2" ]; then ok "$1" "$3"; else ko "$1" "${3:-no answer} (expected: $2)"; fi; }
# get <results> <name>: the status printed as "<name>|<status>"
get() { printf '%s\n' "$1" | sed -n "s/^$2|//p"; }

echo "== API AppRole (backend, policy backend-read) =="
# Runs inside the api container with its own AppRole credentials (/run/vault)
api="$(docker compose exec -T api node - <<'EOF'
const fs = require('fs');
const V = process.env.VAULT_ADDR;
async function call(method, path, token, body) {
  const res = await fetch(`${V}/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Vault-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
(async () => {
  const login = await call('POST', 'auth/approle/login', null, {
    role_id: fs.readFileSync('/run/vault/role_id', 'utf8').trim(),
    secret_id: fs.readFileSync('/run/vault/secret_id', 'utf8').trim(),
  });
  console.log(`login|${login.status}`);
  const token = login.json.auth.client_token;
  console.log(`read_own|${(await call('GET', 'secret/data/backend/app', token)).status}`);
  console.log(`read_db|${(await call('GET', 'secret/data/db/app', token)).status}`);
  console.log(`read_other|${(await call('GET', 'secret/data/other/app', token)).status}`);
  console.log(`write_own|${(await call('POST', 'secret/data/backend/app', token, { data: { X: 'y' } })).status}`);
  console.log(`write_db|${(await call('POST', 'secret/data/db/app', token, { data: { X: 'y' } })).status}`);
  console.log(`list_all|${(await call('LIST', 'secret/metadata/', token)).status}`);
  console.log(`read_policy|${(await call('GET', 'sys/policies/acl/backend-read', token)).status}`);
  console.log(`read_mounts|${(await call('GET', 'sys/mounts', token)).status}`);
  // Clean up: revoke the test token, then check it no longer works
  console.log(`revoke|${(await call('POST', 'auth/token/revoke-self', token)).status}`);
  console.log(`after_revoke|${(await call('GET', 'secret/data/backend/app', token)).status}`);
})().catch((err) => { console.log(`error|${err.message}`); });
EOF
)"
check "API logs in with its AppRole" 200 "$(get "$api" login)"
check "API reads its own secret" 200 "$(get "$api" read_own)"
check "API reads the database password (needed)" 200 "$(get "$api" read_db)"
check "API reads a path outside its policy" 403 "$(get "$api" read_other)"
check "API writes its own secret (read-only)" 403 "$(get "$api" write_own)"
check "API writes the database secret (read-only)" 403 "$(get "$api" write_db)"
check "API lists all secrets" 403 "$(get "$api" list_all)"
check "API reads its policy" 403 "$(get "$api" read_policy)"
check "API lists the secret engines" 403 "$(get "$api" read_mounts)"
check "Test token revoked" 204 "$(get "$api" revoke)"
check "Revoked token is refused" 403 "$(get "$api" after_revoke)"

echo "== Postgres AppRole (db, policy db-read) =="
# Runs inside the db container (no Node: busybox wget); same rules, status codes only
db="$(docker compose exec -T db sh -s <<'EOF'
V="$VAULT_ADDR"
# st METHOD-ARGS... -> HTTP status of the request (wget prints it on stderr)
st() { wget -S -q -O /dev/null "$@" 2>&1 | grep -o 'HTTP/[0-9.]* [0-9]*' | tail -1 | awk '{print $2}'; }
T="$(wget -q -O - --header 'Content-Type: application/json' \
  --post-data "{\"role_id\":\"$(cat /run/vault/role_id)\",\"secret_id\":\"$(cat /run/vault/secret_id)\"}" \
  "$V/v1/auth/approle/login" | sed -n 's/.*"client_token":"\([^"]*\)".*/\1/p')"
[ -n "$T" ] && echo "login|200" || echo "login|failed"
echo "read_own|$(st --header "X-Vault-Token: $T" "$V/v1/secret/data/db/app")"
echo "read_backend|$(st --header "X-Vault-Token: $T" "$V/v1/secret/data/backend/app")"
echo "write_own|$(st --header "X-Vault-Token: $T" --header 'Content-Type: application/json' --post-data '{"data":{"X":"y"}}' "$V/v1/secret/data/db/app")"
echo "read_mounts|$(st --header "X-Vault-Token: $T" "$V/v1/sys/mounts")"
echo "revoke|$(st --header "X-Vault-Token: $T" --post-data '' "$V/v1/auth/token/revoke-self")"
EOF
)"
check "Postgres logs in with its AppRole" 200 "$(get "$db" login)"
check "Postgres reads its own secret" 200 "$(get "$db" read_own)"
check "Postgres reads the API secret" 403 "$(get "$db" read_backend)"
check "Postgres writes its own secret (read-only)" 403 "$(get "$db" write_own)"
check "Postgres lists the secret engines" 403 "$(get "$db" read_mounts)"
check "Test token revoked" 204 "$(get "$db" revoke)"

echo "== Network =="
if docker compose exec -T nginx getent hosts vault >/dev/null 2>&1; then
  ko "WAF cannot resolve vault" "resolved"
else
  ok "WAF cannot resolve vault" "not found"
fi
if docker compose exec -T app getent hosts vault >/dev/null 2>&1; then
  ko "App (front, no secret) cannot resolve vault" "resolved"
else
  ok "App (front, no secret) cannot resolve vault" "not found"
fi
if docker compose exec -T app test -e /run/vault >/dev/null 2>&1; then
  ko "App has no AppRole credentials mounted" "/run/vault exists"
else
  ok "App has no AppRole credentials mounted" "none"
fi
if docker compose exec -T vault wget -q -T 3 -O /dev/null https://example.com >/dev/null 2>&1; then
  ko "Vault has no Internet access" "reachable"
else
  ok "Vault has no Internet access" "unreachable"
fi

echo
echo "Result: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
