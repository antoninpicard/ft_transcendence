import { env } from './config/env.js';
import { createApp } from './app.js';
import { checkConnection, closePool } from './db/pool.js';

try {
  await checkConnection();
  console.log('Connexion à la base établie.');
} catch (err) {
  console.error('Impossible de joindre la base de données :', err.message);
  console.error('La base est-elle démarrée ? `npm run db:up`');
  process.exit(1);
}

const server = createApp().listen(env.PORT, () => {
  console.log(`API à l'écoute sur http://localhost:${server.address().port} (${env.NODE_ENV})`);
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} reçu, arrêt du serveur...`);

    server.close(async (err) => {
      if (err) console.error('Erreur à la fermeture du serveur :', err);
      try {
        await closePool();
      } catch (poolErr) {
        console.error('Erreur à la fermeture du pool :', poolErr);
        process.exit(1);
      }
      process.exit(err ? 1 : 0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
