'use strict';
const fs = require('fs');
const { spawn } = require('child_process');

const VAULT_ADDR = process.env.VAULT_ADDR;
// One or more Vault paths, separated by commas (e.g. the API reads its own secret and the
// database password). Later paths win if a key appears twice.
const SECRET_PATHS = (process.env.VAULT_SECRET_PATH || '').split(',').map((p) => p.trim()).filter(Boolean);

async function vaultRequest(path, token, body) {
  const res = await fetch(`${VAULT_ADDR}/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Vault-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Only the status is reported: never the response body, which may hold secrets
  if (!res.ok) throw new Error(`Vault ${path}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const roleId = fs.readFileSync('/run/vault/role_id', 'utf8').trim();
  const secretId = fs.readFileSync('/run/vault/secret_id', 'utf8').trim();

  const login = await vaultRequest('auth/approle/login', null, {
    role_id: roleId,
    secret_id: secretId,
  });
  const values = {};
  for (const path of SECRET_PATHS) {
    const secret = await vaultRequest(path, login.auth.client_token);
    Object.assign(values, secret.data.data);
  }
  console.log(`vault-exec: loaded ${Object.keys(values).length} secrets`);

  // Start the real command with the secrets added to its environment
  const [cmd, ...args] = process.argv.slice(2);
  const child = spawn(cmd, args, { env: { ...process.env, ...values }, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => child.kill(sig));
  }
}

main().catch((err) => {
  console.error(`vault-exec: ${err.message}`);
  process.exit(1);
});