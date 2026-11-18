#!/usr/bin/env bash
set -euo pipefail

INIT_FILE="${VAULT_INIT_FILE:-$HOME/vault-init.json}"

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

# 4. Final check
status="$(vault_status)"
grep -q '"sealed": false' <<<"$status" || { echo "Vault is still sealed" >&2; exit 1; }