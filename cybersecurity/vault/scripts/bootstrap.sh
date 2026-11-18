#!/usr/bin/env bash
set -euo pipefail

INIT_FILE="${VAULT_INIT_FILE:-$HOME/vault-init.json}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

vault_cmd() {
  docker compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 \
    ${VAULT_TOKEN:+-e VAULT_TOKEN="$VAULT_TOKEN"} vault vault "$@"
}

# "vault status" exits with 2 when sealed: neutralize it so pipefail/set -e do not trigger
vault_status() { vault_cmd status -format=json || true; }

# 1. Wait until Vault answers (status exit code: 0 unsealed, 1 error, 2 sealed)
until vault_cmd status >/dev/null 2>&1 || [ $? -eq 2 ]; do
  sleep 1
done

# 2. Initialize only if it has not been done yet
status="$(vault_status)"
if grep -q '"initialized": false' <<<"$status"; then
  if [ -e "$INIT_FILE" ]; then
    echo "Refusing to overwrite existing $INIT_FILE" >&2
    exit 1
  fi
  # umask 077: the file is created readable by the owner only
  (umask 077; vault_cmd operator init -key-shares=3 -key-threshold=2 -format=json > "$INIT_FILE")
fi

# 3. Unseal if needed (2 key shares out of 3)
status="$(vault_status)"
if grep -q '"sealed": true' <<<"$status"; then
  for i in 0 1; do
    key="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["unseal_keys_b64"][int(sys.argv[2])])' "$INIT_FILE" "$i")"
    vault_cmd operator unseal "$key" >/dev/null
  done
fi

# 4. Configure Vault (idempotent: every command can run again safely)
# Root token is read from the init file, only inside this script
export VAULT_TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["root_token"])' "$INIT_FILE")"

# 4a. KV v2 engine at secret/
mounts="$(vault_cmd secrets list -format=json)"
grep -q '"secret/"' <<<"$mounts" || vault_cmd secrets enable -path=secret kv-v2

# 4b. AppRole auth method
auths="$(vault_cmd auth list -format=json)"
grep -q '"approle/"' <<<"$auths" || vault_cmd auth enable approle

# 4c. One policy and one AppRole role per file in vault/policies/
for f in "$SCRIPT_DIR"/../policies/*.hcl; do
  name="$(basename "$f" .hcl)"        
  svc="${name%-read}"                 
  vault_cmd policy write "$name" - < "$f"
  vault_cmd write "auth/approle/role/$svc" \
    token_policies="$name" token_ttl=1h token_max_ttl=4h >/dev/null
done

# 4d. Load secrets: vault/secrets/<service>.env -> secret/<service>/app
for f in "$SCRIPT_DIR"/../secrets/*.env; do
  [ -e "$f" ] || continue
  svc="$(basename "$f" .env)"
  args=()
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    args+=("$line")
  done < "$f"
  if [ "${#args[@]}" -gt 0 ]; then
    vault_cmd kv put -mount=secret "$svc/app" "${args[@]}" >/dev/null
  fi
done

unset VAULT_TOKEN

# 5. Final check
status="$(vault_status)"
grep -q '"sealed": false' <<<"$status" || { echo "Vault is still sealed" >&2; exit 1; }