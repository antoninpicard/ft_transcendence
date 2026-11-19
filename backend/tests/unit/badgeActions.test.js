import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBadgeActions } from '../../src/services/badgeActions.js';

const hash = Buffer.from('aa'.repeat(32), 'hex');

function fakeSocket() {
  return {
    sent: [],
    closed: 0,
    send(message) {
      this.sent.push(message);
    },
    close() {
      this.closed += 1;
    },
  };
}

let clock;
let store;
let linkCalls;
let actions;

beforeEach(() => {
  clock = 1_000_000;
  linkCalls = [];
  store = {
    linkResult: 'paired',
    knownUser: null,
    async linkBadge(userId, uidHash) {
      linkCalls.push([userId, uidHash]);
      return this.linkResult;
    },
    async findUserIdByUidHash() {
      return this.knownUser;
    },
  };
  actions = createBadgeActions({ store, now: () => clock });
});

describe('badgeActions', () => {
  it('lie le badge scanné pendant un appairage', async () => {
    actions.start('pair', 'u1');
    assert.equal(await actions.handleScan(hash), 'paired');
    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0][0], 'u1');
    assert.deepEqual(linkCalls[0][1], hash);
  });

  it('signale un badge déjà lié', async () => {
    store.linkResult = 'already-linked';
    actions.start('pair', 'u1');
    assert.equal(await actions.handleScan(hash), 'already-linked');
  });

  it('produit un jeton de connexion pour un badge connu', async () => {
    store.knownUser = 'u2';
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    assert.equal(await actions.handleScan(hash), 'login-ready');
    assert.equal(socket.sent.length, 1);
    const message = JSON.parse(socket.sent[0]);
    assert.equal(message.status, 'login-ready');
    assert.equal(typeof message.token, 'string');
    assert.equal(socket.closed, 1);
    assert.equal(actions.consumeLoginToken(message.token), 'u2');
  });

  it('signale un badge inconnu', async () => {
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    assert.equal(await actions.handleScan(hash), 'unknown-badge');
    assert.deepEqual(JSON.parse(socket.sent[0]), { status: 'unknown-badge' });
  });

  it('ignore un scan sans action', async () => {
    assert.equal(await actions.handleScan(hash), 'not-pairing');
  });

  it('expire une action après 30 s', async () => {
    actions.start('pair', 'u1');
    clock += 30_001;
    assert.equal(await actions.handleScan(hash), 'not-pairing');
    assert.equal(linkCalls.length, 0);
  });

  it('refuse une seconde action', () => {
    actions.start('login');
    assert.throws(() => actions.start('login'), { statusCode: 409 });

    const second = createBadgeActions({ store, now: () => clock });
    second.start('pair', 'u1');
    assert.throws(() => second.start('pair', 'u2'), { statusCode: 409 });
    assert.throws(() => second.start('login'), { statusCode: 409 });
  });

  it('accepte une nouvelle action une fois la précédente expirée', () => {
    actions.start('pair', 'u1');
    clock += 30_001;
    assert.doesNotThrow(() => actions.start('login'));
  });

  it('laisse un appairage remplacer une connexion en cours', async () => {
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    assert.doesNotThrow(() => actions.start('pair', 'u1'));
    assert.equal(socket.closed, 1);
    assert.equal(socket.sent.length, 0);
    assert.equal(await actions.handleScan(hash), 'paired');
  });

  it('consomme le jeton une seule fois', async () => {
    store.knownUser = 'u2';
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    await actions.handleScan(hash);
    const { token } = JSON.parse(socket.sent[0]);
    assert.equal(actions.consumeLoginToken(token), 'u2');
    assert.equal(actions.consumeLoginToken(token), null);
  });

  it('expire le jeton après 10 s', async () => {
    store.knownUser = 'u2';
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    await actions.handleScan(hash);
    const { token } = JSON.parse(socket.sent[0]);
    clock += 10_001;
    assert.equal(actions.consumeLoginToken(token), null);
  });

  it('garde le résultat 5 s pour une socket en retard', async () => {
    store.knownUser = 'u2';
    const first = actions.start('login');
    await actions.handleScan(hash);
    const socket = fakeSocket();
    clock += 1_000;
    actions.attachSocket(first.code, socket);
    assert.equal(JSON.parse(socket.sent[0]).status, 'login-ready');
    assert.equal(socket.closed, 1);

    const second = actions.start('login');
    await actions.handleScan(hash);
    clock += 5_001;
    const late = fakeSocket();
    actions.attachSocket(second.code, late);
    assert.equal(late.sent.length, 0);
    assert.equal(late.closed, 1);
  });

  it('ne livre un résultat en attente qu\'une fois', async () => {
    const { code } = actions.start('login');
    await actions.handleScan(hash);
    actions.attachSocket(code, fakeSocket());
    const again = fakeSocket();
    actions.attachSocket(code, again);
    assert.equal(again.sent.length, 0);
    assert.equal(again.closed, 1);
  });

  it('ferme une socket au code inconnu', () => {
    const socket = fakeSocket();
    actions.attachSocket('0'.repeat(32), socket);
    assert.equal(socket.sent.length, 0);
    assert.equal(socket.closed, 1);
  });

  it('génère un code de 16 octets', () => {
    const { code } = actions.start('login');
    assert.match(code, /^[0-9a-f]{32}$/);
  });

  it('ne traite qu\'un scan quand deux arrivent ensemble', async () => {
    actions.start('pair', 'u1');
    const results = await Promise.all([actions.handleScan(hash), actions.handleScan(hash)]);
    assert.deepEqual([...results].sort(), ['not-pairing', 'paired']);
    assert.equal(linkCalls.length, 1);
  });

  it('ignore un scan si le compte a disparu', async () => {
    store.linkResult = 'user-gone';
    actions.start('pair', 'u1');
    assert.equal(await actions.handleScan(hash), 'not-pairing');
  });

  it('exige un compte pour un appairage', () => {
    assert.throws(() => actions.start('pair'));
  });

  it('ferme la socket d\'une action expirée au prochain start', () => {
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    clock += 30_001;
    actions.start('login');
    assert.equal(socket.closed, 1);
    assert.equal(socket.sent.length, 0);
  });

  it('ferme la socket d\'une action expirée au prochain scan', async () => {
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    clock += 30_001;
    assert.equal(await actions.handleScan(hash), 'not-pairing');
    assert.equal(socket.closed, 1);
    assert.equal(socket.sent.length, 0);
  });

  it('tolère une fermeture qui échoue sur une action expirée', () => {
    const { code } = actions.start('login');
    const socket = fakeSocket();
    socket.close = () => {
      throw new Error('fermeture impossible');
    };
    actions.attachSocket(code, socket);
    clock += 30_001;
    assert.doesNotThrow(() => actions.start('login'));
  });

  it('ferme la socket et propage l\'erreur quand le store échoue', async () => {
    store.findUserIdByUidHash = async () => {
      throw new Error('base indisponible');
    };
    const { code } = actions.start('login');
    const socket = fakeSocket();
    actions.attachSocket(code, socket);
    await assert.rejects(actions.handleScan(hash), { message: 'base indisponible' });
    assert.equal(socket.closed, 1);
    assert.equal(socket.sent.length, 0);
  });

  it('consomme l\'action quand l\'appairage échoue côté store', async () => {
    store.linkBadge = async () => {
      throw new Error('base indisponible');
    };
    actions.start('pair', 'u1');
    await assert.rejects(actions.handleScan(hash), { message: 'base indisponible' });
    assert.equal(await actions.handleScan(hash), 'not-pairing');
  });
});
