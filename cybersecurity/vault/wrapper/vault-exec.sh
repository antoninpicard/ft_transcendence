#!/bin/sh
# POSIX version of vault-exec.js, for images without Node (Postgres).
# Logs in with the AppRole credentials mounted in /run/vault, reads VAULT_SECRET_PATH,
# exports the keys listed in VAULT_SECRET_KEYS, then runs the real command.
# Values must not contain double quotes or backslashes (JSON is parsed with sed).
set -eu

ROLE_ID="$(cat /run/vault/role_id)"
SECRET_ID="$(cat /run/vault/secret_id)"

TOKEN="$(wget -qO- --header 'Content-Type: application/json' \
  --post-data "{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
  "$VAULT_ADDR/v1/auth/approle/login" \
  | sed -n 's/.*"client_token":"\([^"]*\)".*/\1/p')"
unset ROLE_ID SECRET_ID
[ -n "$TOKEN" ] || { echo "vault-exec: login failed" >&2; exit 1; }

DATA="$(wget -qO- --header "X-Vault-Token: $TOKEN" "$VAULT_ADDR/v1/$VAULT_SECRET_PATH")" \
  || { echo "vault-exec: cannot read $VAULT_SECRET_PATH" >&2; exit 1; }
unset TOKEN

n=0
for k in $VAULT_SECRET_KEYS; do
  v="$(printf '%s' "$DATA" | sed -n "s/.*\"$k\":\"\([^\"]*\)\".*/\1/p")"
  [ -n "$v" ] || { echo "vault-exec: $k missing in $VAULT_SECRET_PATH" >&2; exit 1; }
  export "$k=$v"
  n=$((n + 1))
done
unset DATA v
echo "vault-exec: loaded $n secrets"

exec "$@"
