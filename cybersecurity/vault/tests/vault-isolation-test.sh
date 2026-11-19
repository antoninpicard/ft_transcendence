#!/usr/bin/env bash
# Vault isolation tests: each service reads only its own secret, read-only,
# and only the app can reach Vault on the network.
# Usage (stack started with make): bash cybersecurity/vault/tests/vault-isolation-test.sh
# Only HTTP status codes are printed: never a role_id, secret_id, token or secret value.
set -u

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
# Same Compose files as the Makefile
export COMPOSE_FILE="${COMPOSE_FILE:-cybersecurity/docker-compose.yml:contbuild/docker-compose.yml:cybersecurity/docker-compose.app.yml}"
pass=0
fail=0

ok() { printf 'PASS  %-52s -> %s\n' "$1" "$2"; pass=$((pass + 1)); }
ko() { printf 'FAIL  %-52s -> %s\n' "$1" "$2"; fail=$((fail + 1)); }

# check <name> <expected> <got>
check() { if [ "$3" = "$2" ]; then ok "$1" "$3"; else ko "$1" "$3 (expected: $2)"; fi; }

echo "== App AppRole (policy app-read) =="
# Runs inside the app container with its own AppRole credentials (/run/vault).
# Prints one line per request: "<name>|<HTTP status>"
results="$(docker compose exec -T app node - <<'EOF'
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
  console.log(`read_own|${(await call('GET', 'secret/data/app/app', token)).status}`);
  console.log(`read_backend|${(await call('GET', 'secret/data/backend/app', token)).status}`);
  console.log(`write_own|${(await call('POST', 'secret/data/app/app', token, { data: { X: 'y' } })).status}`);
  console.log(`list_all|${(await call('LIST', 'secret/metadata/', token)).status}`);
  console.log(`read_policy|${(await call('GET', 'sys/policies/acl/app-read', token)).status}`);
  console.log(`read_mounts|${(await call('GET', 'sys/mounts', token)).status}`);
  // Clean up: revoke the test token, then check it no longer works
  console.log(`revoke|${(await call('POST', 'auth/token/revoke-self', token)).status}`);
  console.log(`after_revoke|${(await call('GET', 'secret/data/app/app', token)).status}`);
})().catch((err) => { console.log(`error|${err.message}`); });
EOF
)"
get() { printf '%s\n' "$results" | sed -n "s/^$1|//p"; }

check "App logs in with its AppRole" 200 "$(get login)"
check "App reads its own secret" 200 "$(get read_own)"
check "App reads the backend secret" 403 "$(get read_backend)"
check "App writes its own secret (read-only)" 403 "$(get write_own)"
check "App lists all secrets" 403 "$(get list_all)"
check "App reads its policy" 403 "$(get read_policy)"
check "App lists the secret engines" 403 "$(get read_mounts)"
check "Test token revoked" 204 "$(get revoke)"
check "Revoked token is refused" 403 "$(get after_revoke)"

echo "== Backend AppRole (policy backend-read, demo service) =="
if docker compose --profile demo run --rm -T secret-demo secret/data/app/app 2>&1 | grep -q "403 Forbidden"; then
  ok "Backend reads the app secret" "403"
else
  ko "Backend reads the app secret" "not refused"
fi

echo "== Network =="
if docker compose exec -T nginx getent hosts vault >/dev/null 2>&1; then
  ko "WAF cannot resolve vault" "resolved"
else
  ok "WAF cannot resolve vault" "not found"
fi
if docker compose exec -T vault wget -q -T 3 -O /dev/null https://example.com >/dev/null 2>&1; then
  ko "Vault has no Internet access" "reachable"
else
  ok "Vault has no Internet access" "unreachable"
fi

echo
echo "Result: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
