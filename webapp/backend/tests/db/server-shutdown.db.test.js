import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const serverPath = fileURLToPath(new URL('../../src/server.js', import.meta.url));
const children = [];

after(() => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

function startServer() {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /localhost:(\d+)/.exec(output);
      if (match) resolve({ child, port: Number(match[1]) });
    });
    child.once('exit', (code) => reject(new Error(`serveur arrêté au démarrage (${code})`)));
  });
}

describe('arrêt du serveur', () => {
  it('s arrête sans attendre une socket badge ouverte', async () => {
    const { child, port } = await startServer();
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    client.on('error', () => {});
    await once(client, 'open');

    const exited = once(child, 'exit');
    const began = Date.now();
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0);
    assert.ok(Date.now() - began < 3000, `arrêt en ${Date.now() - began} ms`);
    if (client.readyState !== WebSocket.CLOSED) await once(client, 'close');
  });
});
