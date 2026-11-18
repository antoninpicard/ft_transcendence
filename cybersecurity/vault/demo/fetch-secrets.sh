#!/bin/sh
set -eu

VAULT=http://vault:8200

# Credentials mounted read-only by compose (never in the image or in an env var)
ROLE_ID="$(cat /run/vault/role_id)"
SECRET_ID="$(cat /run/vault/secret_id)"

# 1. Log in with AppRole and keep only the client token
TOKEN="$(wget -qO- \
  --header 'Content-Type: application/json' \
  --post-data "{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
  "$VAULT/v1/auth/approle/login" \
  | sed -n 's/.*"client_token":"\([^"]*\)".*/\1/p')"
[ -n "$TOKEN" ] || { echo "login failed" >&2; exit 1; }
echo "login OK (token length: ${#TOKEN})"

# 2. Read this service's secrets
DATA="$(wget -qO- --header "X-Vault-Token: $TOKEN" "$VAULT/v1/secret/data/backend/app")"

# 3. Prove we got them without printing the values
for k in DB_PASSWORD JWT_SECRET; do
  v="$(printf '%s' "$DATA" | sed -n "s/.*\"$k\":\"\([^\"]*\)\".*/\1/p")"
  echo "$k loaded (length: ${#v})"
done