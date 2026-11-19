#!/usr/bin/env bash
# WAF tests against the real app (integrated stack). Local use only: -k accepts the self-signed cert.
set -uo pipefail

BASE="${BASE:-https://localhost:8443}"
pass=0; fail=0; info=0
JSON='Content-Type: application/json'

code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }
ok()   { echo "PASS  $1"; pass=$((pass+1)); }
ko()   { echo "FAIL  $1 (got $2)"; fail=$((fail+1)); }

# expect_code NAME WANTED_CODE CURL_ARGS...
expect_code() {
  local name="$1" want="$2"; shift 2
  local got; got="$(code "$@")"
  [ "$got" = "$want" ] && ok "$name" || ko "$name" "$got"
}

# expect_not_blocked NAME CURL_ARGS...  (the app may answer 200/400/401/409: anything but the WAF's 403)
expect_not_blocked() {
  local name="$1"; shift
  local got; got="$(code "$@")"
  [ "$got" != "403" ] && ok "$name (app answered $got)" || ko "$name" "$got"
}

# info_not_blocked NAME CURL_ARGS...  (informational: a 403 here is a false positive to analyse)
info_not_blocked() {
  local name="$1"; shift
  local got; got="$(code "$@")"
  if [ "$got" = "403" ]; then echo "INFO  FALSE POSITIVE? $name -> 403"; info=$((info+1))
  else echo "INFO  ok: $name (app answered $got)"; fi
}

echo "== Legitimate traffic: static pages =="
for p in / /login.html /signup.html /settings.html /app.html /style.css /script/login.js; do
  expect_code "GET $p" 200 "$BASE$p"
done
expect_code "GET /health" 200 "$BASE/health"

echo "== Legitimate traffic: auth routes (must not be blocked by the WAF) =="
expect_not_blocked "GET /auth/me without session" "$BASE/auth/me"
expect_not_blocked "POST /auth/signup (JSON)" -X POST -H "$JSON" \
  -d '{"email":"waf-test@example.com","password":"Tr0ub4dor-and-3-horses"}' "$BASE/auth/signup"
expect_not_blocked "POST /auth/login wrong password (JSON)" -X POST -H "$JSON" \
  -d '{"email":"waf-test@example.com","password":"wrong-password-123"}' "$BASE/auth/login"
expect_not_blocked "POST /auth/login (form-urlencoded)" -X POST \
  -d 'email=waf-test@example.com&password=wrong-password-123' "$BASE/auth/login"

echo "== Possible false positives: passwords with special characters =="
info_not_blocked "password with symbols" -X POST -H "$JSON" \
  -d '{"email":"fp@example.com","password":"P@ssw0rd!#$%&*()_+-=[]{};:,.<>?/~"}' "$BASE/auth/login"
info_not_blocked "password with apostrophe" -X POST -H "$JSON" \
  -d "{\"email\":\"fp@example.com\",\"password\":\"It's-a-Strong#Pass1\"}" "$BASE/auth/login"
info_not_blocked "email with plus tag" -X POST -H "$JSON" \
  -d '{"email":"first.last+tag@example.com","password":"correct-horse-battery"}' "$BASE/auth/login"

echo "== Attacks (must be blocked: 403) =="
expect_code "SQLi in JSON password" 403 -X POST -H "$JSON" \
  -d "{\"email\":\"a@b.co\",\"password\":\"x' OR '1'='1\"}" "$BASE/auth/login"
expect_code "SQLi in JSON email" 403 -X POST -H "$JSON" \
  -d "{\"email\":\"admin'--\",\"password\":\"x\"}" "$BASE/auth/login"
expect_code "XSS in signup email" 403 -X POST -H "$JSON" \
  -d '{"email":"<script>alert(1)</script>@x.co","password":"abcdefgh1"}' "$BASE/auth/signup"
expect_code "XSS in query string" 403 "$BASE/?q=<script>alert(1)</script>"
expect_code "Path traversal" 403 "$BASE/auth/me?f=../../etc/passwd"
expect_code "GET /.env" 403 "$BASE/.env"
expect_code "GET /.git/config" 403 "$BASE/.git/config"
expect_code "Scanner user-agent (sqlmap)" 403 -A "sqlmap/1.7" "$BASE/"

echo
echo "RESULT: $pass passed, $fail failed, $info informational"
[ "$fail" -eq 0 ]