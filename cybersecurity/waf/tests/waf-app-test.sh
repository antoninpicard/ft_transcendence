#!/usr/bin/env bash
# WAF tests against the integrated stack (make): the Vue front (app) and the API (api),
# both behind nginx + ModSecurity. Local use only: -k accepts the self-signed certificate.
#
# Every answer is classified by who sent it:
#   WAF = 403 with the HTML page of nginx (the request never reached the app or the API)
#   app/API = anything else (the API answers JSON, even its own 401/403/404)
# so "not blocked" really means "reached the application", and a 404 cannot pass for a success.
#
# Creates 2 users (wafuser-<random>) and makes them friends. The API allows 5 sign-ups per
# minute and per IP: if "register" answers 429, wait one minute and run the script again.
set -uo pipefail

BASE="${BASE:-https://localhost:8443}"
JSON='Content-Type: application/json'
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0; info=0

# req CURL_ARGS... -> sets CODE and BY (WAF or app/API); the body is kept in $TMP/body
req() {
  CODE="$(curl -sk -o "$TMP/body" -w '%{http_code}' "$@")"
  if [ "$CODE" = "403" ] && grep -qi '<html' "$TMP/body"; then BY="WAF"; else BY="app/API"; fi
}
ok() { printf 'PASS  %-58s -> %s %s\n' "$1" "$CODE" "$BY"; pass=$((pass + 1)); }
ko() { printf 'FAIL  %-58s -> %s %s (expected: %s)\n' "$1" "$CODE" "$BY" "$2"; fail=$((fail + 1)); }

# expect_app NAME WANTED_CODE CURL_ARGS...  (must reach the app/API and get exactly this code)
expect_app() {
  local name="$1" want="$2"; shift 2
  req "$@"
  if [ "$BY" = "app/API" ] && [ "$CODE" = "$want" ]; then ok "$name"; else ko "$name" "$want from app/API"; fi
}

# expect_waf NAME CURL_ARGS...  (must be blocked by the WAF itself)
expect_waf() {
  local name="$1"; shift
  req "$@"
  if [ "$BY" = "WAF" ]; then ok "$name"; else ko "$name" "403 from the WAF"; fi
}

# info_app NAME CURL_ARGS...  (informational: a WAF 403 here is a false positive to analyse)
info_app() {
  local name="$1"; shift
  req "$@"
  if [ "$BY" = "WAF" ]; then printf 'INFO  FALSE POSITIVE? %-46s -> 403 WAF\n' "$name"; info=$((info + 1))
  else printf 'INFO  ok: %-58s -> %s %s\n' "$name" "$CODE" "$BY"; fi
}

# register NAME JAR -> prints the new user's id; the session cookie is kept in JAR
register() {
  curl -sk -c "$2" -X POST -H "$JSON" \
    -d "{\"username\":\"$1\",\"email\":\"$1@example.com\",\"password\":\"Tr0ub4dor-and-3-horses\"}" \
    "$BASE/api/auth/register" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p'
}

echo "== Front (Vue) through the WAF =="
for p in / /login /signup /settings /privacy /terms /game /2fa; do
  expect_app "GET $p" 200 "$BASE$p"
done
req "$BASE/"
if grep -q 'id="app"' "$TMP/body"; then ok "GET / is the Vue page (div#app)"; else ko "GET / is the Vue page (div#app)" "div#app in the HTML"; fi
assets="$(grep -o -E '/assets/[^"]+' "$TMP/body" | sort -u)"
[ -n "$assets" ] || ko "assets listed in index.html" "at least one /assets/ file"
for a in $assets; do expect_app "GET $a" 200 "$BASE$a"; done

echo "== Routing: /api and /ws go to the API =="
expect_app "GET /api/health" 200 "$BASE/api/health"
req "$BASE/api/no-such-route"
if [ "$CODE" = "404" ] && grep -q '"error"' "$TMP/body"; then ok "GET /api/no-such-route answered by the API (JSON 404)"
else ko "GET /api/no-such-route answered by the API (JSON 404)" "JSON 404"; fi
req --http1.1 -m 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$BASE/ws"
if [ "$CODE" = "101" ]; then ok "WebSocket /ws upgrade"; else ko "WebSocket /ws upgrade" "101"; fi

echo "== Legitimate API traffic (must reach the API) =="
suffix="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
ida="$(register "wafusera$suffix" "$TMP/a")"
idb="$(register "wafuserb$suffix" "$TMP/b")"
CODE="$([ -n "$ida" ] && [ -n "$idb" ] && echo 201 || echo "no id")"; BY="app/API"
[ "$CODE" = "201" ] && ok "POST /api/auth/register (2 users)" || ko "POST /api/auth/register (2 users)" "201 (429 = wait 1 min)"
expect_app "GET /api/auth/me with session" 200 -b "$TMP/a" "$BASE/api/auth/me"
expect_app "GET /api/auth/me without session" 401 "$BASE/api/auth/me"
expect_app "POST /api/auth/login wrong password" 401 -X POST -H "$JSON" \
  -d "{\"identifier\":\"wafusera$suffix\",\"password\":\"wrong-password-123\"}" "$BASE/api/auth/login"
expect_app "GET /api/users?limit=5" 200 "$BASE/api/users?limit=5"
expect_app "POST /api/friends/requests" 201 -b "$TMP/a" -X POST -H "$JSON" -d "{\"userId\":\"$idb\"}" "$BASE/api/friends/requests"
expect_app "POST /api/friends/requests/<id>/accept" 200 -b "$TMP/b" -X POST "$BASE/api/friends/requests/$ida/accept"

echo "== Free text in messages (exclusion 10010: must reach the API) =="
for text in "Salut, ça va ?" "Tu peux select un film from la liste ?" "On se voit demain -- ok pour toi ?" \
            "On sera 1 OR 2 personnes" "Il a dit 'non' -- puis il est parti" \
            "Comment faire SELECT * FROM users WHERE id = 1 en SQL ?"; do
  body="$(python3 -c 'import json,sys; print(json.dumps({"body": sys.argv[1]}))' "$text")"
  expect_app "message: $text" 201 -b "$TMP/a" -X POST -H "$JSON" -d "$body" "$BASE/api/messages/$idb"
done

echo "== Possible false positives (informational) =="
info_app "login, password with symbols" -X POST -H "$JSON" \
  -d '{"identifier":"nobody","password":"P@ssw0rd!#$%&*()_+-=[]{};:,.<>?/~"}' "$BASE/api/auth/login"
info_app "login, password with apostrophe" -X POST -H "$JSON" \
  -d "{\"identifier\":\"nobody\",\"password\":\"It's-a-Strong#Pass1\"}" "$BASE/api/auth/login"
info_app "login, email with plus tag" -X POST -H "$JSON" \
  -d '{"identifier":"first.last+tag@example.com","password":"correct-horse-battery"}' "$BASE/api/auth/login"

echo "== Attacks (must be blocked by the WAF) =="
expect_waf "SQLi in login identifier" -X POST -H "$JSON" \
  -d "{\"identifier\":\"admin' OR '1'='1\",\"password\":\"x\"}" "$BASE/api/auth/login"
expect_waf "SQLi in login password" -X POST -H "$JSON" \
  -d "{\"identifier\":\"admin\",\"password\":\"x' OR '1'='1\"}" "$BASE/api/auth/login"
expect_waf "SQLi in query string (API)" "$BASE/api/users?limit=1%20UNION%20SELECT%20password%20FROM%20users--"
expect_waf "SQLi in a message body" -b "$TMP/a" -X POST -H "$JSON" \
  -d "{\"body\":\"' OR '1'='1\"}" "$BASE/api/messages/$idb"
expect_waf "XSS in register username" -X POST -H "$JSON" \
  -d '{"username":"<script>alert(1)</script>","email":"x@example.com","password":"Tr0ub4dor-and-3"}' "$BASE/api/auth/register"
expect_waf "XSS in a message body" -b "$TMP/a" -X POST -H "$JSON" \
  -d '{"body":"<script>alert(1)</script>"}' "$BASE/api/messages/$idb"
expect_waf "XSS in query string (front)" "$BASE/?q=<script>alert(1)</script>"
expect_waf "Path traversal in a parameter" "$BASE/api/users?file=../../../../etc/passwd"
expect_waf "Command injection" "$BASE/api/users?limit=1;cat%20/etc/passwd"
expect_waf "GET /.env" "$BASE/.env"
expect_waf "GET /.git/config" "$BASE/.git/config"
expect_waf "Scanner user-agent (sqlmap)" -A "sqlmap/1.7" "$BASE/api/health"
expect_waf "Method not allowed (PROPFIND)" -X PROPFIND "$BASE/api/health"

echo
echo "RESULT: $pass passed, $fail failed, $info informational"
[ "$fail" -eq 0 ]
