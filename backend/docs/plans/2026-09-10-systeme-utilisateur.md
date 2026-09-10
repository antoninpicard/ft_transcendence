# Système utilisateur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter inscription, connexion, déconnexion et utilisateur courant à l'API, et réserver au propriétaire les écritures sur son compte.

**Architecture:** Session opaque en base — 32 octets aléatoires envoyés dans un cookie `httpOnly`, seul leur SHA-256 est stocké. Mots de passe en argon2id. Routes sous `/api/auth`, séparées du CRUD `users`. Un middleware `requireAuth` résout le cookie et pose `req.user`.

**Tech Stack:** Node 22.9+, Express 5, PostgreSQL 17, zod 4, argon2, cookie-parser, `node:test`.

**Spec:** `backend/docs/specs/2026-09-10-systeme-utilisateur-design.md`

## Global Constraints

- Tous les chemins sont relatifs à `backend/`. Les commandes se lancent depuis `backend/`.
- **Le code ne porte aucun commentaire.** Règle en vigueur sur ce dépôt : si un passage a besoin d'être expliqué, le rendre lisible par le nommage.
- Messages d'erreur en français, comme le reste du code.
- Modules ES (`"type": "module"`), imports avec extension `.js` explicite.
- **Aucune mention d'assistant** dans les messages de commit.
- `npm test` ne doit jamais exiger de base de données. Les tests qui en ont besoin vivent dans `tests/db/` et se lancent avec `npm run test:db`.
- Longueur de mot de passe : minimum 8, maximum 128. Aucune règle de composition.
- Nom du cookie : `sid`. Durée : 7 jours.

## Résolution d'une contradiction de la spec

La spec liste `POST /api/auth/logout` comme « connecté » et « idempotent ». Les deux
sont incompatibles : `requireAuth` renverrait 401 en l'absence de session. Ce plan
retient l'idempotence — la route est publique, révoque le cookie présent s'il y en
a un, et répond 204 dans tous les cas. Se déconnecter deux fois ne doit pas être
une erreur.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/db/migrations/002_add_auth.sql` | Colonne `password_hash`, table `sessions` |
| `src/config/cookies.js` | Nom et attributs du cookie de session |
| `src/services/sessions.service.js` | Jetons : création, résolution, révocation. Ne connaît pas les mots de passe |
| `src/services/auth.service.js` | Inscription et vérification des identifiants. Seul module à lire `password_hash` |
| `src/middlewares/requireAuth.js` | Résout le cookie, pose `req.user` |
| `src/middlewares/requireSelf.js` | 403 si `req.user.id` diffère de `req.params.id` |
| `src/schemas/auth.schema.js` | Corps de `register` et `login` |
| `src/controllers/auth.controller.js` | Traduction HTTP, pose et efface le cookie |
| `src/routes/auth.routes.js` | Montage de `/api/auth` |
| `tests/db/*.db.test.js` | Tests exigeant Postgres |
| `tests/unit/http.test.js` | Tests sans base (déplacé) |

---

### Task 1 : Séparer les tests, poser la migration

**Files:**
- Create: `src/db/migrations/002_add_auth.sql`
- Create: `tests/db/helpers.js`
- Create: `tests/db/schema.db.test.js`
- Move: `tests/http.test.js` → `tests/unit/http.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: rien
- Produces: `uniqueUser()` → `{ username, email, password }` ; `cleanupUsers(usernames)` → `Promise<void>` ; table `sessions` ; colonne `users.password_hash`

- [ ] **Step 1 : Installer les dépendances**

```bash
npm install argon2 cookie-parser
```

- [ ] **Step 2 : Déplacer le test existant et corriger ses imports**

```bash
mkdir -p tests/unit tests/db
git mv tests/http.test.js tests/unit/http.test.js
sed -i "s|'../src/|'../../src/|g" tests/unit/http.test.js
```

- [ ] **Step 3 : Séparer les scripts de test dans `package.json`**

Remplacer la ligne `"test"` par ces deux lignes :

```json
    "test": "NODE_ENV=test DATABASE_URL=postgresql://unused@127.0.0.1:5432/unused node --test tests/unit/",
    "test:db": "NODE_ENV=test node --env-file=../.env --test tests/db/",
```

- [ ] **Step 4 : Vérifier que la séparation tient**

Run: `npm test`
Expected: PASS, 13 tests. Aucune base démarrée n'est nécessaire.

- [ ] **Step 5 : Écrire le test de schéma qui échoue**

Create `tests/db/schema.db.test.js` :

```javascript
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';

after(async () => {
  await closePool();
});

describe('schéma d authentification', () => {
  it('ajoute password_hash sur users', async () => {
    const row = await queryOne(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password_hash'`,
    );
    assert.ok(row, 'la colonne password_hash doit exister');
    assert.equal(row.is_nullable, 'NO');
  });

  it('crée la table sessions', async () => {
    const row = await queryOne(
      `SELECT count(*) AS count FROM information_schema.columns
        WHERE table_name = 'sessions'
          AND column_name IN ('id', 'user_id', 'token_hash', 'created_at', 'last_seen_at', 'expires_at')`,
    );
    assert.equal(Number(row.count), 6);
  });

  it('révoque les sessions quand le compte disparaît', async () => {
    const row = await queryOne(
      `SELECT rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.table_constraints tc
           ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'sessions'`,
    );
    assert.equal(row.delete_rule, 'CASCADE');
  });
});
```

- [ ] **Step 6 : Lancer le test pour le voir échouer**

Run: `npm run db:up && npm run test:db`
Expected: FAIL — `la colonne password_hash doit exister`

- [ ] **Step 7 : Écrire la migration**

Create `src/db/migrations/002_add_auth.sql` :

```sql
ALTER TABLE users ADD COLUMN password_hash text NOT NULL;

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
```

- [ ] **Step 8 : Repartir d'une base vide, puis migrer**

La colonne est `NOT NULL` sans valeur par défaut : la migration échoue si `users`
contient déjà des lignes. C'est voulu.

Run: `npm run db:reset -- --yes && npm run migrate`
Expected: `✓ 001_create_users.sql`, `✓ 002_add_auth.sql`

- [ ] **Step 9 : Lancer le test pour le voir passer**

Run: `npm run test:db`
Expected: PASS, 3 tests

- [ ] **Step 10 : Écrire les utilitaires de test**

Create `tests/db/helpers.js` :

```javascript
import { randomBytes } from 'node:crypto';
import { query } from '../../src/db/pool.js';

export function uniqueUser() {
  const suffix = randomBytes(6).toString('hex');
  return {
    username: `test-${suffix}`,
    email: `test-${suffix}@example.test`,
    password: 'motdepasse-de-test',
  };
}

export async function cleanupUsers(usernames) {
  if (usernames.length === 0) return;
  await query('DELETE FROM users WHERE username = ANY($1)', [usernames]);
}
```

- [ ] **Step 11 : Commit**

```bash
git add package.json package-lock.json src/db/migrations/002_add_auth.sql tests/
git commit -m "add auth schema and split database-backed tests

Sessions table and password_hash column. Tests needing Postgres move to
tests/db/ so npm test keeps running without a database."
```

---

### Task 2 : Service de sessions

**Files:**
- Create: `src/services/sessions.service.js`
- Test: `tests/db/sessions.db.test.js`

**Interfaces:**
- Consumes: `query`, `queryOne` de `src/db/pool.js` ; `uniqueUser`, `cleanupUsers` de `tests/db/helpers.js`
- Produces: `SESSION_TTL_MS: number` ; `createSession(userId: string)` → `{ token: string, expiresAt: Date }` ; `resolveSession(token: string | undefined)` → `{ id: string, userId: string } | null` ; `revokeSession(token: string | undefined)` → `Promise<void>`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `tests/db/sessions.db.test.js` :

```javascript
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { createSession, resolveSession, revokeSession } from '../../src/services/sessions.service.js';

const created = [];
let userId;

before(async () => {
  const user = uniqueUser();
  created.push(user.username);
  const row = await queryOne(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, 'x') RETURNING id`,
    [user.username, user.email],
  );
  userId = row.id;
});

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('sessions', () => {
  it('ne stocke jamais le jeton en clair', async () => {
    const { token } = await createSession(userId);
    const row = await queryOne(
      'SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    assert.equal(row.token_hash.includes(token), false);
    assert.equal(row.token_hash.length, 32);
  });

  it('résout un jeton valide vers son utilisateur', async () => {
    const { token } = await createSession(userId);
    const session = await resolveSession(token);
    assert.equal(session.userId, userId);
  });

  it('refuse un jeton inconnu', async () => {
    assert.equal(await resolveSession('jeton-inexistant'), null);
  });

  it('refuse une absence de jeton', async () => {
    assert.equal(await resolveSession(undefined), null);
  });

  it('refuse et supprime une session expirée', async () => {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    const { token } = await createSession(userId);
    await query(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [userId],
    );
    assert.equal(await resolveSession(token), null);
    const row = await queryOne('SELECT count(*) AS count FROM sessions WHERE user_id = $1', [userId]);
    assert.equal(Number(row.count), 0);
  });

  it('révoque une session', async () => {
    const { token } = await createSession(userId);
    await revokeSession(token);
    assert.equal(await resolveSession(token), null);
  });

  it('supprime les sessions avec le compte', async () => {
    await createSession(userId);
    await query('DELETE FROM users WHERE id = $1', [userId]);
    const row = await queryOne('SELECT count(*) AS count FROM sessions WHERE user_id = $1', [userId]);
    assert.equal(Number(row.count), 0);
  });
});
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `npm run test:db`
Expected: FAIL — `Cannot find module .../sessions.service.js`

- [ ] **Step 3 : Écrire le service**

Create `src/services/sessions.service.js` :

```javascript
import { randomBytes, createHash } from 'node:crypto';
import { query, queryOne } from '../db/pool.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest();
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt };
}

export async function resolveSession(token) {
  if (!token) return null;

  const session = await queryOne(
    `SELECT id, user_id AS "userId", expires_at AS "expiresAt"
       FROM sessions WHERE token_hash = $1`,
    [hashToken(token)],
  );
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await query('DELETE FROM sessions WHERE id = $1', [session.id]);
    return null;
  }

  await query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [session.id]);
  return { id: session.id, userId: session.userId };
}

export async function revokeSession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}
```

- [ ] **Step 4 : Lancer pour voir passer**

Run: `npm run test:db`
Expected: PASS, 10 tests

- [ ] **Step 5 : Commit**

```bash
git add src/services/sessions.service.js tests/db/sessions.db.test.js
git commit -m "add session service backed by hashed tokens

Only the SHA-256 of a session token reaches the database, so leaking the
sessions table grants access to no account."
```

---

### Task 3 : Projections publique et privée sur les utilisateurs

**Files:**
- Modify: `src/services/users.service.js`
- Test: `tests/db/users.db.test.js`

**Interfaces:**
- Consumes: `uniqueUser`, `cleanupUsers`
- Produces: `PUBLIC_COLUMNS: string` ; `PRIVATE_COLUMNS: string` ; `toConflict(err)` → `AppError | null` ; `getPublicUser(id)` ; `getPrivateUser(id)` ; `listUsers({ limit, offset })` ; `updateUser(id, patch)` ; `deleteUser(id)`. `createUser` disparaît.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `tests/db/users.db.test.js` :

```javascript
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { listUsers, getPublicUser, getPrivateUser } from '../../src/services/users.service.js';

const created = [];

async function insertUser() {
  const user = uniqueUser();
  created.push(user.username);
  const row = await queryOne(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, 'x') RETURNING id`,
    [user.username, user.email],
  );
  return { id: row.id, ...user };
}

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('projections utilisateur', () => {
  it("n'expose pas les emails dans l'annuaire", async () => {
    await insertUser();
    const { items } = await listUsers({ limit: 100, offset: 0 });
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.equal('email' in item, false);
      assert.equal('password_hash' in item, false);
      assert.equal('passwordHash' in item, false);
    }
  });

  it("n'expose pas l'email sur la fiche publique", async () => {
    const user = await insertUser();
    const found = await getPublicUser(user.id);
    assert.equal(found.username, user.username);
    assert.equal('email' in found, false);
  });

  it("expose l'email sur la fiche privée", async () => {
    const user = await insertUser();
    const found = await getPrivateUser(user.id);
    assert.equal(found.email, user.email);
    assert.equal('passwordHash' in found, false);
  });
});
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `npm run test:db`
Expected: FAIL — `getPublicUser is not a function`

- [ ] **Step 3 : Réécrire le service**

Replace the whole of `src/services/users.service.js` :

```javascript
import { query, queryOne } from '../db/pool.js';
import { isUniqueViolation } from '../db/errors.js';
import { AppError } from '../utils/AppError.js';

export const PUBLIC_COLUMNS = 'id, username, created_at AS "createdAt"';
export const PRIVATE_COLUMNS =
  'id, username, email, created_at AS "createdAt", updated_at AS "updatedAt"';

const UPDATABLE = Object.freeze({
  username: 'username',
  email: 'email',
});

export async function listUsers({ limit, offset }) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, count(*) OVER () AS "totalCount"
       FROM users
      ORDER BY created_at, id
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  const total = rows.length > 0 ? Number(rows[0].totalCount) : await countUsers();
  return { total, items: rows.map(({ totalCount, ...user }) => user) };
}

async function countUsers() {
  const row = await queryOne('SELECT count(*) AS count FROM users');
  return Number(row.count);
}

export async function getPublicUser(id) {
  return findUser(id, PUBLIC_COLUMNS);
}

export async function getPrivateUser(id) {
  return findUser(id, PRIVATE_COLUMNS);
}

async function findUser(id, columns) {
  const user = await queryOne(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
  if (!user) throw AppError.notFound(`Utilisateur ${id} introuvable`);
  return user;
}

export async function updateUser(id, patch) {
  const entries = Object.entries(patch).filter(([field]) => field in UPDATABLE);
  if (entries.length === 0) return getPrivateUser(id);

  const assignments = entries
    .map(([field], i) => `${UPDATABLE[field]} = $${i + 2}`)
    .join(', ');
  const values = entries.map(([, value]) => value);

  try {
    const user = await queryOne(
      `UPDATE users SET ${assignments} WHERE id = $1 RETURNING ${PRIVATE_COLUMNS}`,
      [id, ...values],
    );
    if (!user) throw AppError.notFound(`Utilisateur ${id} introuvable`);
    return user;
  } catch (err) {
    throw toConflict(err) ?? err;
  }
}

export async function createUser({ username, email }) {
  try {
    return await queryOne(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING ${PRIVATE_COLUMNS}`,
      [username, email],
    );
  } catch (err) {
    throw toConflict(err) ?? err;
  }
}

export async function deleteUser(id) {
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  if (rowCount === 0) throw AppError.notFound(`Utilisateur ${id} introuvable`);
}

export function toConflict(err) {
  if (isUniqueViolation(err, 'users_username_key')) {
    return AppError.conflict("Ce nom d'utilisateur est déjà pris");
  }
  if (isUniqueViolation(err, 'users_email_key')) {
    return AppError.conflict('Cet email est déjà utilisé');
  }
  return null;
}
```

- [ ] **Step 4 : Adapter la seule ligne du contrôleur qui référence `getUser`**

In `src/controllers/users.controller.js`, replace the body of `getOne` :

```javascript
export async function getOne(req, res) {
  res.json(await usersService.getPublicUser(req.params.id));
}
```

`createUser` et `controller.create` restent en place jusqu'à la Task 5, qui les
retire au moment où elle rebranche les tests sur `/api/auth/register`. Les
supprimer ici laisserait `usersRouter.post` sans callback, donc un dépôt cassé
entre deux commits.

- [ ] **Step 5 : Lancer les deux suites**

Run: `npm run test:db && npm test`
Expected: `test:db` PASS 13 tests, `npm test` PASS 13 tests.

- [ ] **Step 6 : Commit**

```bash
git add src/services/users.service.js src/controllers/users.controller.js tests/db/users.db.test.js
git commit -m "split public and private user projections

The directory no longer leaks every user's email address."
```

---

### Task 4 : Service d'authentification

**Files:**
- Create: `src/services/auth.service.js`
- Test: `tests/db/auth-service.db.test.js`

**Interfaces:**
- Consumes: `PRIVATE_COLUMNS`, `toConflict` de `users.service.js`
- Produces: `register({ username, email, password })` → utilisateur privé ; `verifyCredentials(identifier, password)` → utilisateur privé, lève `AppError` 401 sinon

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `tests/db/auth-service.db.test.js` :

```javascript
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryOne, closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';
import { register, verifyCredentials } from '../../src/services/auth.service.js';

const created = [];

async function registered() {
  const user = uniqueUser();
  created.push(user.username);
  await register(user);
  return user;
}

after(async () => {
  await cleanupUsers(created);
  await closePool();
});

describe('service d authentification', () => {
  it('ne renvoie jamais le hash', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email, user.password);
    assert.equal('passwordHash' in result, false);
    assert.equal('password_hash' in result, false);
  });

  it('ne stocke pas le mot de passe en clair', async () => {
    const user = await registered();
    const row = await queryOne('SELECT password_hash FROM users WHERE username = $1', [user.username]);
    assert.equal(row.password_hash.includes(user.password), false);
    assert.match(row.password_hash, /^\$argon2id\$/);
  });

  it('accepte la connexion par email', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email, user.password);
    assert.equal(result.username, user.username);
  });

  it('accepte la connexion par pseudo', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.username, user.password);
    assert.equal(result.email, user.email);
  });

  it('ignore la casse de l identifiant', async () => {
    const user = await registered();
    const result = await verifyCredentials(user.email.toUpperCase(), user.password);
    assert.equal(result.username, user.username);
  });

  it('refuse un mauvais mot de passe et un compte inconnu avec le même message', async () => {
    const user = await registered();
    const wrong = await verifyCredentials(user.email, 'mauvais-mot-de-passe').catch((e) => e);
    const unknown = await verifyCredentials('personne@example.test', user.password).catch((e) => e);

    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.message, unknown.message);
  });

  it('refuse un pseudo déjà pris', async () => {
    const user = await registered();
    const err = await register({ ...uniqueUser(), username: user.username }).catch((e) => e);
    assert.equal(err.statusCode, 409);
  });

  it('refuse un email déjà pris', async () => {
    const user = await registered();
    const err = await register({ ...uniqueUser(), email: user.email }).catch((e) => e);
    assert.equal(err.statusCode, 409);
  });
});
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `npm run test:db`
Expected: FAIL — `Cannot find module .../auth.service.js`

- [ ] **Step 3 : Écrire le service**

Create `src/services/auth.service.js` :

```javascript
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { queryOne } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';
import { PRIVATE_COLUMNS, toConflict } from './users.service.js';

const HASH_OPTIONS = { type: argon2.argon2id };
const INVALID_CREDENTIALS = 'Identifiants invalides';

let decoyHash = null;

function decoy() {
  decoyHash ??= argon2.hash(randomBytes(32).toString('hex'), HASH_OPTIONS);
  return decoyHash;
}

export async function register({ username, email, password }) {
  const passwordHash = await argon2.hash(password, HASH_OPTIONS);

  try {
    return await queryOne(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3) RETURNING ${PRIVATE_COLUMNS}`,
      [username, email, passwordHash],
    );
  } catch (err) {
    throw toConflict(err) ?? err;
  }
}

export async function verifyCredentials(identifier, password) {
  const row = await queryOne(
    `SELECT ${PRIVATE_COLUMNS}, password_hash AS "passwordHash"
       FROM users WHERE email = $1 OR username = $1`,
    [identifier],
  );

  if (!row) {
    await verify(await decoy(), password);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const { passwordHash, ...user } = row;
  if (!(await verify(passwordHash, password))) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  return user;
}

async function verify(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4 : Lancer pour voir passer**

Run: `npm run test:db`
Expected: PASS, 21 tests

- [ ] **Step 5 : Commit**

```bash
git add src/services/auth.service.js tests/db/auth-service.db.test.js
git commit -m "add argon2id authentication service

An unknown identifier is still checked against a decoy hash, so response
timing does not reveal which accounts exist."
```

---

### Task 5 : Routes d'authentification et cookie

**Files:**
- Create: `src/config/cookies.js`, `src/middlewares/requireAuth.js`, `src/schemas/auth.schema.js`, `src/controllers/auth.controller.js`, `src/routes/auth.routes.js`
- Modify: `src/app.js`, `src/routes/index.js`, `tests/unit/http.test.js`
- Test: `tests/db/auth-http.db.test.js`

**Interfaces:**
- Consumes: `register`, `verifyCredentials` ; `createSession`, `revokeSession`, `SESSION_TTL_MS` ; `getPrivateUser`
- Produces: `SESSION_COOKIE = 'sid'` ; `sessionCookieOptions` ; `requireAuth` posant `req.user` (projection privée) et `req.sessionId` ; `authRouter`

- [ ] **Step 1 : Écrire les tests HTTP qui échouent**

Create `tests/db/auth-http.db.test.js` :

```javascript
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';
import { uniqueUser, cleanupUsers } from './helpers.js';

const created = [];
let server;
let base;

before(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanupUsers(created);
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await closePool();
});

function json(path, body, cookie) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function cookieOf(res) {
  return res.headers.get('set-cookie').split(';')[0];
}

async function signUp() {
  const user = uniqueUser();
  created.push(user.username);
  const res = await json('/api/auth/register', user);
  return { user, res, cookie: cookieOf(res) };
}

describe('inscription', () => {
  it('crée le compte et ouvre la session', async () => {
    const { user, res } = await signUp();
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.username, user.username);
    assert.equal(body.email, user.email);
    assert.equal('password' in body, false);
    assert.match(res.headers.get('set-cookie'), /^sid=/);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
  });

  it('refuse un mot de passe trop court', async () => {
    const res = await json('/api/auth/register', { ...uniqueUser(), password: 'court' });
    assert.equal(res.status, 400);
  });

  it('refuse un pseudo déjà pris', async () => {
    const { user } = await signUp();
    const res = await json('/api/auth/register', { ...uniqueUser(), username: user.username });
    assert.equal(res.status, 409);
  });
});

describe('connexion', () => {
  it('accepte email ou pseudo', async () => {
    const { user } = await signUp();
    for (const identifier of [user.email, user.username]) {
      const res = await json('/api/auth/login', { identifier, password: user.password });
      assert.equal(res.status, 200);
    }
  });

  it('renvoie 401 sans distinguer les deux échecs', async () => {
    const { user } = await signUp();
    const wrong = await json('/api/auth/login', { identifier: user.email, password: 'faux-mot-de-passe' });
    const unknown = await json('/api/auth/login', { identifier: 'absent@example.test', password: user.password });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });

  it('ne renvoie pas 400 sur un mot de passe court mais faux', async () => {
    const { user } = await signUp();
    const res = await json('/api/auth/login', { identifier: user.email, password: 'x' });
    assert.equal(res.status, 401);
  });
});

describe('session', () => {
  it('expose le compte courant', async () => {
    const { user, cookie } = await signUp();
    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).email, user.email);
  });

  it('refuse me sans cookie', async () => {
    const res = await fetch(`${base}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  it('invalide la session à la déconnexion', async () => {
    const { cookie } = await signUp();
    const out = await json('/api/auth/logout', {}, cookie);
    assert.equal(out.status, 204);

    const res = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    assert.equal(res.status, 401);
  });

  it('accepte une déconnexion sans session', async () => {
    const res = await json('/api/auth/logout', {});
    assert.equal(res.status, 204);
  });
});

describe('propriété du compte', () => {
  it('laisse modifier son propre compte', async () => {
    const { user, cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();

    const res = await fetch(`${base}/api/users/${me.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ username: `${user.username}-b` }),
    });
    created.push(`${user.username}-b`);
    assert.equal(res.status, 200);
  });

  it('refuse de modifier le compte d un autre', async () => {
    const other = await signUp();
    const mine = await signUp();
    const target = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: other.cookie } })).json();

    const res = await fetch(`${base}/api/users/${target.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: mine.cookie },
      body: JSON.stringify({ username: 'pirate' }),
    });
    assert.equal(res.status, 403);
  });

  it('refuse de supprimer sans session', async () => {
    const { cookie } = await signUp();
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
    const res = await fetch(`${base}/api/users/${me.id}`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  });
});
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `npm run test:db`
Expected: FAIL — les routes `/api/auth/*` renvoient 404

- [ ] **Step 3 : Écrire la configuration du cookie**

Create `src/config/cookies.js` :

```javascript
import { env } from './env.js';
import { SESSION_TTL_MS } from '../services/sessions.service.js';

export const SESSION_COOKIE = 'sid';

export const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
};

export const sessionCookieOptions = {
  ...clearCookieOptions,
  maxAge: SESSION_TTL_MS,
};
```

Le navigateur n'efface un cookie que si les attributs présentés correspondent à
ceux de la pose. `clearCookieOptions` les reprend sans `maxAge`, qu'Express
remplace par une date d'expiration passée.

- [ ] **Step 4 : Écrire les middlewares**

Create `src/middlewares/requireAuth.js` :

```javascript
import { AppError } from '../utils/AppError.js';
import { resolveSession } from '../services/sessions.service.js';
import { getPrivateUser } from '../services/users.service.js';
import { SESSION_COOKIE } from '../config/cookies.js';

export async function requireAuth(req, _res, next) {
  try {
    const session = await resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) return next(AppError.unauthorized());

    req.user = await getPrivateUser(session.userId);
    req.sessionId = session.id;
    return next();
  } catch (err) {
    return next(err);
  }
}
```

Create `src/middlewares/requireSelf.js` :

```javascript
import { AppError } from '../utils/AppError.js';

export function requireSelf(req, _res, next) {
  if (req.user.id !== req.params.id) {
    return next(AppError.forbidden('Ce compte ne vous appartient pas'));
  }
  return next();
}
```

- [ ] **Step 5 : Écrire les schémas**

Create `src/schemas/auth.schema.js` :

```javascript
import { z } from 'zod';
import { USERNAME_MIN, USERNAME_MAX, USERNAME_PATTERN } from './users.schema.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const registerBody = z.object({
  username: z.string().trim().min(USERNAME_MIN).max(USERNAME_MAX).regex(USERNAME_PATTERN),
  email: z.email(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const loginBody = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});
```

La borne basse de `loginBody.password` est 1 et non `PASSWORD_MIN` : renvoyer 400
sur un mot de passe court à la connexion révèlerait la politique et distinguerait
les échecs. Tout échec de connexion doit être un 401 identique.

- [ ] **Step 6 : Écrire le contrôleur**

Create `src/controllers/auth.controller.js` :

```javascript
import * as authService from '../services/auth.service.js';
import { createSession, revokeSession } from '../services/sessions.service.js';
import { SESSION_COOKIE, sessionCookieOptions, clearCookieOptions } from '../config/cookies.js';

async function openSession(res, user) {
  const { token } = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function register(req, res) {
  const user = await authService.register(req.body);
  await openSession(res, user);
  res.status(201).location(`/api/users/${user.id}`).json(user);
}

export async function login(req, res) {
  const user = await authService.verifyCredentials(req.body.identifier, req.body.password);
  await openSession(res, user);
  res.json(user);
}

export async function logout(req, res) {
  await revokeSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, clearCookieOptions);
  res.status(204).end();
}

export async function me(req, res) {
  res.json(req.user);
}
```

- [ ] **Step 7 : Écrire le routeur**

Create `src/routes/auth.routes.js` :

```javascript
import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { registerBody, loginBody } from '../schemas/auth.schema.js';
import * as controller from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', validate({ body: registerBody }), controller.register);
authRouter.post('/login', validate({ body: loginBody }), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);

authRouter.all('/register', methodNotAllowed('POST'));
authRouter.all('/login', methodNotAllowed('POST'));
authRouter.all('/logout', methodNotAllowed('POST'));
authRouter.all('/me', methodNotAllowed('GET'));
```

- [ ] **Step 8 : Brancher le cookie et le routeur**

In `src/app.js`, add after line 4 :

```javascript
import cookieParser from 'cookie-parser';
```

and add after the `express.json` line :

```javascript
  app.use(cookieParser());
```

In `src/routes/index.js`, add to the imports :

```javascript
import { authRouter } from './auth.routes.js';
```

and add as the last line :

```javascript
apiRouter.use('/auth', authRouter);
```

- [ ] **Step 9 : Retirer l'ancienne inscription**

In `src/services/users.service.js`, delete the whole `createUser` function.
In `src/controllers/users.controller.js`, delete the whole `create` function.

- [ ] **Step 10 : Protéger les écritures sur `users`**

Replace `src/routes/users.routes.js` with :

```javascript
import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireSelf } from '../middlewares/requireSelf.js';
import { idParams, listQuery, userPatchBody } from '../schemas/users.schema.js';
import * as controller from '../controllers/users.controller.js';

export const usersRouter = Router();

usersRouter.get('/', validate({ query: listQuery }), controller.list);
usersRouter.get('/:id', validate({ params: idParams }), controller.getOne);
usersRouter.patch(
  '/:id',
  validate({ params: idParams, body: userPatchBody }),
  requireAuth,
  requireSelf,
  controller.update,
);
usersRouter.delete(
  '/:id',
  validate({ params: idParams }),
  requireAuth,
  requireSelf,
  controller.remove,
);

usersRouter.all('/', methodNotAllowed('GET'));
usersRouter.all('/:id', methodNotAllowed('GET', 'PATCH', 'DELETE'));
```

- [ ] **Step 11 : Rebrancher les tests sans base sur `/api/auth/register`**

In `tests/unit/http.test.js`, replace the `post` helper with :

```javascript
const post = (body) =>
  fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
```

In the test `rejette un corps invalide en 400 avec le détail des champs`, replace
the request body so only `username` and `email` are at fault :

```javascript
    const res = await post(JSON.stringify({ username: 'ab', email: 'nope', password: 'motdepasse' }));
```

In the test `traite un corps trop volumineux en 413, pas en 500`, replace the body :

```javascript
    const res = await post(
      JSON.stringify({ username: 'x'.repeat(200_000), email: 'a@b.fr', password: 'motdepasse' }),
    );
```

Ces trois cas échouent avant d'atteindre la base : `validate` et `express.json`
tranchent en amont du contrôleur. La garantie « `npm test` sans base » tient.

- [ ] **Step 12 : Lancer les deux suites**

Run: `npm test && npm run test:db`
Expected: `npm test` PASS 13 tests. `npm run test:db` PASS 34 tests.

- [ ] **Step 13 : Commit**

```bash
git add src/ tests/
git commit -m "add registration, login, logout and current user

Session cookie is httpOnly and carries an opaque token. Writes on a user
account now require an authenticated owner; logout stays idempotent."
```

---

### Task 6 : Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: rien

- [ ] **Step 1 : Retirer l'authentification des chantiers à venir**

In `README.md`, in the `## Not implemented yet` table, delete the `Authentication`
row and the `Public/private field split` row. Both are done.

- [ ] **Step 2 : Documenter les routes**

In the endpoint table of `README.md`, delete the `POST /api/users` row and add :

```markdown
| `POST` | `/api/auth/register` | public | Creates the account and opens a session. `201`, `409` on a taken username or email. |
| `POST` | `/api/auth/login` | public | `{ identifier, password }`, where `identifier` is an email or a username. `200`, `401` otherwise. |
| `POST` | `/api/auth/logout` | public | Revokes the current session. Always `204`, including without one. |
| `GET` | `/api/auth/me` | session | The current account, email included. `401` otherwise. |
```

Then add this sentence below the table :

```markdown
`GET /api/users` and `GET /api/users/:id` expose a public projection — `id`,
`username`, `createdAt` — with no email address. `PATCH` and `DELETE` require a
session and reject anyone but the account owner with a `403`.
```

- [ ] **Step 3 : Documenter les deux commandes de test**

Replace the `npm test` row of the scripts table with these two :

```markdown
| `npm test` | Runs the tests that need no database. |
| `npm run test:db` | Runs the tests that need PostgreSQL. Start it first with `npm run db:up`. |
```

- [ ] **Step 4 : Signaler le piège de la migration**

Add below the migrations section :

```markdown
Migration `002` adds a `NOT NULL` column without a default, so it fails if the
`users` table already holds rows. Run `npm run db:reset` first in development.
```

- [ ] **Step 5 : Vérifier que rien n'est cassé**

Run: `npm test && npm run test:db`
Expected: PASS both

- [ ] **Step 6 : Commit**

```bash
git add README.md
git commit -m "document the user system"
```
