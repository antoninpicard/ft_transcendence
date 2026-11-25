#!/bin/sh
# Start command of the API in the integrated stack, run by vault-exec.js.
# Builds DATABASE_URL from POSTGRES_PASSWORD (from Vault) and POSTGRES_USER/POSTGRES_DB
# (from contbuild/.env), URL-encoded, so the password is never written in a Compose file.
set -eu
DATABASE_URL="$(node -e '
  const e = encodeURIComponent, p = process.env;
  console.log(`postgresql://${e(p.POSTGRES_USER)}:${e(p.POSTGRES_PASSWORD)}@db:5432/${e(p.POSTGRES_DB)}`);
')"
export DATABASE_URL
unset POSTGRES_PASSWORD
# Same commands as contbuild/api.Dockerfile
node src/db/migrate.js
exec node src/server.js
