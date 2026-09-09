import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { env } from '../config/env.js';

const ALLOWED_ENVS = new Set(['development', 'test']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db']);

function abort(reason, hint) {
  console.error(`\n✗ ${reason}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

function refuse(reason) {
  abort(
    `db:reset refusé : ${reason}`,
    "Cette commande détruit toutes les données ; elle ne tourne qu'en local.",
  );
}

const nodeEnv = process.env.NODE_ENV;
if (!ALLOWED_ENVS.has(nodeEnv)) {
  refuse(
    `NODE_ENV vaut ${nodeEnv ? `« ${nodeEnv} »` : '(non défini)'}, attendu ` +
      [...ALLOWED_ENVS].map((name) => `« ${name} »`).join(' ou '),
  );
}

const { hostname, port, pathname } = new URL(env.DATABASE_URL);
if (!LOCAL_HOSTS.has(hostname)) {
  refuse(`DATABASE_URL pointe vers « ${hostname} », qui n'est pas une base locale.`);
}
if (port && port !== '5432') {
  refuse(`DATABASE_URL vise le port ${port} et non 5432 : cible inattendue pour la base locale.`);
}

const target = `${pathname.slice(1)} @ ${hostname}`;

if (!process.argv.includes('--yes')) {
  if (!stdin.isTTY) {
    refuse("pas de terminal pour confirmer (ajoute --yes en connaissance de cause).");
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `\n⚠  Toutes les données de « ${target} » vont être détruites.\n   Tape "reset" pour confirmer : `,
  );
  rl.close();

  if (answer.trim() !== 'reset') {
    console.log("Annulé, rien n'a été touché.");
    process.exit(0);
  }
}

const REDIRECTING_VARS = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'];
const COMPOSE_FILE = new URL('../../../docker-compose.yml', import.meta.url).pathname;
const COMPOSE_PROJECT = 'trans';

function dockerEnv() {
  const clean = { ...process.env };
  for (const name of REDIRECTING_VARS) delete clean[name];
  for (const name of Object.keys(clean)) {
    if (name.startsWith('COMPOSE_')) delete clean[name];
  }
  return clean;
}

function docker(...args) {
  const { status, error } = spawnSync('docker', args, { stdio: 'inherit', env: dockerEnv() });
  if (error) abort(`Impossible de lancer docker : ${error.message}`);
  if (status !== 0) abort(`\`docker ${args.join(' ')}\` a échoué (code ${status}).`);
}

const compose = ['compose', '-f', COMPOSE_FILE, '-p', COMPOSE_PROJECT];

docker(...compose, 'down', '-v');
docker(...compose, 'up', '-d', 'db');

console.log(`\n✓ Base « ${target} » réinitialisée. Prochaine étape : npm run migrate`);
