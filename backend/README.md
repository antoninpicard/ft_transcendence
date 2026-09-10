# Backend API

REST API for ft_transcendence, built with **Express 5** on **Node 22**
(JavaScript, ESM) and **PostgreSQL 17**, accessed through plain SQL with `pg`.

The `users` resource is implemented end to end and is meant to be **copied** as
the template for every new resource: migration → service → controller → route.

---

## Requirements

| Tool | Version | Why |
|---|---|---|
| Node | **>= 22.9** | `--env-file`, `--env-file-if-exists`, `node --watch`, built-in test runner |
| Docker + Compose | any recent | runs PostgreSQL locally |

Enforced through the `engines` field in `package.json`. The binding constraint is
`--env-file-if-exists`, added in Node 22.9.

---

## Quick start

```bash
cp .env.example .env   # at the repository root
cd backend
npm install
npm run db:up          # start PostgreSQL 17 in Docker
npm run migrate        # apply pending SQL migrations
npm run dev            # start the API with hot reload
```

`.env`, `.env.example` and `docker-compose.yml` live at the **repository root**,
not in `backend/`: the subject requires the whole project to start from there,
and Compose reads the `.env` sitting next to the compose file. The npm scripts
below run from `backend/` and reach up to both.

The API listens on `http://localhost:3000` and every route is served under the
`/api` prefix.

Verify it is alive:

```bash
curl -s http://localhost:3000/api/health
```

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the API with `node --watch`, loading the root `../.env`. |
| `npm start` | Starts the API **without** loading `.env` — variables must come from the real environment (Docker, systemd). This is intentional: production configuration does not live in a file inside the image. |
| `npm run migrate` | Applies every migration that has not been applied yet. |
| `npm run db:up` | Starts the PostgreSQL container in the background, from the root `../docker-compose.yml`. |
| `npm run db:down` | Stops the container. **Data is kept.** |
| `npm test` | Runs the tests that need no database. |
| `npm run test:db` | Runs the tests that need PostgreSQL. Start it first with `npm run db:up`. |
| `npm run db:reset` | Destroys the volume and recreates an empty database. Guarded — see [Resetting the database](#resetting-the-database). |

---

## Environment variables

Configuration is read from the environment and validated by zod at startup
(`src/config/env.js`). If anything is missing or malformed the process prints
the offending keys and **exits immediately** rather than failing later on a
user request.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | One of `development`, `test`, `production`. |
| `PORT` | no | `3000` | `0`–`65535`. `0` asks the OS for an ephemeral port. |
| `CORS_ORIGIN` | no | `*` | Comma-separated list of allowed origins, or `*`. **Rejected at startup when `NODE_ENV=production`**, where explicit origins are required. |
| `DATABASE_URL` | **yes** | — | `postgres://` or `postgresql://` connection string. |
| `DB_POOL_MAX` | no | `10` | Max pooled connections, 1–100. |
| `POSTGRES_USER` | **yes** | — | Read by the root `docker-compose.yml`. Must match `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | **yes** | — | Read by the root `docker-compose.yml`. Must match `DATABASE_URL`. |
| `POSTGRES_DB` | **yes** | — | Read by the root `docker-compose.yml`. Must match `DATABASE_URL`. |

Real values live in `.env` **at the repository root**, which is git-ignored.
`.env.example` sits beside it, is committed, and documents every key — copy it
to `.env` before the first `npm run db:up`, since Compose reads the database
credentials from there and refuses to start without them.

`credentials` is only advertised to the browser when `CORS_ORIGIN` lists
explicit origins: `*` combined with credentials is rejected by every browser, so
announcing both would silently break authenticated requests.

---

## Architecture

### The layers

```
route        declares the URL and validates the request
controller   reads the request, writes the response — nothing else
service      makes decisions and talks SQL — knows nothing about HTTP
```

**A service never receives `req` or `res`.** That single rule is what makes the
business logic testable in isolation and reusable from a WebSocket handler,
a CLI script or a background job — anywhere that is not an HTTP request.

If you ever find yourself writing SQL inside a controller, something belongs in
a service instead.

### Request lifecycle

```
client
  │
  ▼
app.js         helmet → cors → express.json(100kb) → morgan
  │
  ▼
routes/        matches the URL, runs validate({ body, params, query })
  │
  ▼
controllers/   reads req.body / req.params / req.validatedQuery
  │
  ▼
services/      business rules + parameterised SQL
  │
  ▼
db/pool.js ──► PostgreSQL
  │
  ▼
controller     res.status(...).json(...)
```

Anything thrown at any point jumps straight to `errorHandler`, including
rejected promises from `async` handlers — Express 5 forwards those
automatically, so handlers need no `try/catch` wrapper.

### Project layout

```
src/
├── server.js              # checks the DB, listens, graceful shutdown
├── app.js                 # Express assembly: middlewares, routes, error handling
├── config/env.js          # environment variables, validated with zod
├── db/
│   ├── pool.js            # shared pg pool: query, queryOne, transaction
│   ├── errors.js          # PostgreSQL error codes (23505…)
│   ├── migrate.js         # migration runner
│   ├── reset.js           # guarded database reset
│   └── migrations/*.sql   # schema, versioned, applied in filename order
├── routes/                # URLs, wired to schemas and controllers
├── schemas/               # zod schemas, shared with the frontend
├── controllers/           # request in, response out
├── services/              # business logic and SQL
├── middlewares/           # validate, notFound, methodNotAllowed, errorHandler
└── utils/AppError.js      # business errors carrying an HTTP status

tests/
└── http.test.js           # node --test against createApp(), no network, no DB
```

`app.js` exports `createApp()` — a factory — instead of starting a server.
Network listening lives in `server.js`. This separation is what lets the test
suite exercise the whole HTTP stack without opening a fixed port or a database
connection.

### Startup and shutdown

`server.js` runs `SELECT 1` before listening. If the database is unreachable the
process exits with a clear message instead of serving 500s.

On `SIGINT` / `SIGTERM` it stops accepting new requests, lets in-flight ones
finish, releases the connection pool, then exits. A 10-second timer forces the
exit if a request hangs.

---

## Database

PostgreSQL 17, queried directly with `pg`. **No ORM** — queries stay explicit,
window functions and PostgreSQL error codes remain available, and the SQL is
what we defend during evaluation.

### Query helpers — `src/db/pool.js`

| Helper | Returns | Use it for |
|---|---|---|
| `query(sql, params)` | `{ rows, rowCount }` | anything that returns several rows, or where `rowCount` matters |
| `queryOne(sql, params)` | first row, or `undefined` | "fetch this one record" |
| `transaction(fn)` | whatever `fn` returns | several writes that must all succeed or all fail |

A **single pool** is shared by the whole process. Opening a connection per
request would overwhelm PostgreSQL; `pg` recycles connections instead.

Inside a transaction, **every query must go through the `client` argument**.
A call to the module-level `query()` would run on a different pooled
connection, outside the transaction:

```js
await transaction(async (client) => {
  await client.query('INSERT INTO matches ...');  // correct
  await query('UPDATE users ...');                // WRONG — not in the transaction
});
```

### Two non-negotiable rules

**1. Always use parameterised queries.** Values travel separately from the SQL
text, so PostgreSQL can never mistake data for an instruction. This is what
closes the door to SQL injection.

```js
await queryOne('SELECT ... FROM users WHERE id = $1', [id]);   // yes
query(`SELECT ... FROM users WHERE id = '${id}'`);             // never
```

**2. The database speaks `snake_case`, the API speaks `camelCase`.** The
conversion happens once, in the `SELECT`, so controllers never think about it:

```js
const COLUMNS = 'id, username, email, created_at AS "createdAt", updated_at AS "updatedAt"';
```

The double quotes are required — without them PostgreSQL lowercases the alias.

### Schema conventions

Choices made in `001_create_users.sql`, and worth repeating in new tables:

- **`uuid` primary keys** (`gen_random_uuid()`, from `pgcrypto`) rather than
  sequential integers, which leak signup order and are trivially enumerable.
- **`citext`** for `username` and `email`, so `Lucas` and `lucas` collide under
  the `UNIQUE` constraint and nobody can impersonate a nickname by changing case.
- **`timestamptz`**, never bare `timestamp` — the time zone is part of the value.
- **An `updated_at` trigger** (`set_updated_at()`) so the column is maintained by
  the database and cannot be forgotten by application code.

---

## Migrations

Every `.sql` file in `src/db/migrations/` is applied **once**, in filename
order, inside its own transaction, and recorded in the `schema_migrations`
table. A PostgreSQL advisory lock prevents two runners from migrating
concurrently.

```bash
npm run migrate
```

The command is idempotent: run it as often as you like.

### Adding a migration

Create the next numbered file and run the command again:

```sql
-- src/db/migrations/002_create_matches.sql
CREATE TABLE matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player2_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player1_score integer NOT NULL DEFAULT 0,
  player2_score integer NOT NULL DEFAULT 0,
  played_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT different_players CHECK (player1_id <> player2_id)
);

CREATE INDEX matches_player1_idx ON matches (player1_id);
CREATE INDEX matches_player2_idx ON matches (player2_id);
```

Use zero-padded numbers (`002`, not `2`): ordering is alphabetical, so `10_`
would otherwise sort before `2_`.

> **Never edit a migration that has already been applied.** It is recorded in
> `schema_migrations` and will not run again, so your database and your
> teammates' would silently diverge. Add a new migration instead.

The only exception is a migration you have just written, have not pushed, and
can replay from scratch with `npm run db:reset`.

Migration `002` adds a `NOT NULL` column without a default, so it fails if the
`users` table already holds rows. Run `npm run db:reset` first in development.

### Resetting the database

```bash
npm run db:reset
```

Destroys the Docker volume and recreates an empty database, then you re-run
`npm run migrate`. Because this is irreversible, `src/db/reset.js` enforces
three independent guards and refuses with exit code 1 if any fails:

1. `NODE_ENV` must be **explicitly** `development` or `test`. An unset variable
   blocks — deliberately not reusing `env.NODE_ENV`, whose `.default('development')`
   would make a missing variable look like a development machine.
2. `DATABASE_URL` must point at a local host (`localhost`, `127.0.0.1`, `::1`, `db`).
3. A confirmation must be typed by hand. `--yes` skips it for scripts; outside a
   terminal and without `--yes`, the command refuses rather than assuming consent.

---

## Error handling

### Response format

Every error, whatever its origin, comes back in the same shape:

```json
{
  "error": {
    "message": "Human-readable message",
    "details": [{ "path": "email", "message": "Invalid email address" }]
  }
}
```

`details` is present only for validation failures. **A stack trace is never
serialised into the response**, in any environment: it is already logged
server-side, and `NODE_ENV` is too easy to forget at deploy time for a leak of
filesystem paths and database hosts to depend on it.

### Raising errors

Throw an `AppError` from anywhere — service, controller, middleware. No
`try/catch` plumbing is needed:

```js
import { AppError } from '../utils/AppError.js';

throw AppError.notFound(`User ${id} not found`);
throw AppError.conflict('This username is already taken');
```

| Factory | Status |
|---|---|
| `AppError.badRequest(message, details)` | 400 |
| `AppError.unauthorized(message)` | 401 |
| `AppError.forbidden(message)` | 403 |
| `AppError.notFound(message)` | 404 |
| `AppError.methodNotAllowed(message)` | 405 |
| `AppError.conflict(message, details)` | 409 |

### What reaches the client

`errorHandler` treats an error as **known** — and therefore safe to expose — in
exactly two cases:

1. it is an `AppError`, i.e. we raised it deliberately;
2. it follows the `http-errors` convention used by Express and `body-parser`:
   a 4xx status **and** `expose: true`, meaning its author marked the message as
   safe. This is what turns malformed JSON into a `400` and an oversized body
   into a `413` instead of a `500`.

Anything else — a bug, a raw PostgreSQL failure — becomes an anonymous `500`.
Its message is never sent to the client, only logged server-side. Exposing it
would hand out table names, SQL fragments and filesystem paths.

Known 4xx errors are **not** logged, so a client sending garbage cannot flood
the logs.

### Status codes in use

| Code | When |
|---|---|
| `200` | successful read or update |
| `201` | resource created (with a `Location` header) |
| `204` | successful delete, no body |
| `400` | validation failed, or malformed JSON |
| `404` | unknown route, or missing resource |
| `405` | known path, unsupported method — carries an `Allow` header |
| `409` | unique constraint violated |
| `413` | request body larger than 100 kB |
| `500` | unexpected server error |
| `503` | `/api/health` only — the database is unreachable |

### Conflicts are arbitrated by the database

Creating a user does **not** `SELECT` first to check whether the name is taken.
It attempts the `INSERT` and translates PostgreSQL error `23505` into a `409`,
distinguishing which constraint failed:

```js
function toConflict(err) {
  if (isUniqueViolation(err, 'users_username_key')) return AppError.conflict('This username is already taken');
  if (isUniqueViolation(err, 'users_email_key'))    return AppError.conflict('This email is already in use');
  return null;
}
```

Checking before inserting would leave a race window between the two queries.
Letting the `UNIQUE` constraint decide is atomic by construction — which is also
how this API satisfies the "no race conditions with simultaneous users"
requirement.

---

## Validation

Schemas live in `src/schemas/`, one module per resource, and the route file
wires them to the URLs they protect. They are deliberately **not** declared
inline: the subject requires the same validation on the frontend and the
backend, so a single shared definition is what keeps the two from drifting —
and `z.toJSONSchema()` can later generate the OpenAPI document from these very
schemas instead of a hand-written copy.

```js
// src/schemas/users.schema.js
export const userBody = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.email(),
});

// src/routes/users.routes.js
usersRouter.post('/', validate({ body: userBody }), controller.create);
usersRouter.patch('/:id', validate({ params: idParams, body: userPatchBody }), controller.update);
```

`userPatchBody` is `userBody.partial()`: the same rules with every field
optional — exactly the semantics of `PATCH`, with no duplication.

`validate({ body, params, query })` **replaces the raw value with the parsed
one**. Two consequences worth knowing:

- Unknown keys are stripped. A request carrying `{"username":"x","isAdmin":true}`
  loses `isAdmin` before it reaches any handler — real protection against mass
  assignment.
- `req.query` is read-only in Express 5, so the parsed query lands in
  **`req.validatedQuery`**. Controllers must read it from there.

---

## API reference

All routes are prefixed with `/api`.

### `GET /health`

Liveness probe. Returns `503` when the database is unreachable, so an
orchestrator can tell "up" from "usable".

```json
{ "status": "ok", "uptime": 42.7, "database": "ok" }
```

### `GET /users`

Paginated list.

| Query | Type | Default | Range |
|---|---|---|---|
| `limit` | integer | `20` | 1–100 |
| `offset` | integer | `0` | >= 0 |

```json
{
  "total": 137,
  "items": [
    {
      "id": "3f2b…",
      "username": "lucas",
      "email": "lucas@42.fr",
      "createdAt": "2026-09-03T01:32:11.114Z",
      "updatedAt": "2026-09-03T01:32:11.114Z"
    }
  ]
}
```

`total` is computed by a `count(*) OVER ()` window function inside the same
query, so a page and its total cost **one** round-trip instead of two.

### `POST /auth/register`

Creates the account and opens a session. Responds `201` with the created user
and a session cookie.

```json
{ "username": "lucas", "email": "lucas@42.fr", "password": "SecurePass123" }
```

Returns `409` if the username or email already exists (case-insensitively).

### `POST /auth/login`

Opens a session. Accepts either email or username as the identifier.

```json
{ "identifier": "lucas", "password": "SecurePass123" }
```

Returns `200` with the authenticated user and a session cookie, or `401` if the
credentials are invalid.

### `POST /auth/logout`

Revokes the current session. Returns `204` with no body, even if called without
an active session.

### `GET /auth/me`

Returns the authenticated user including their email address. Requires a valid
session cookie. Returns `401` if unauthenticated.

`GET /users` and `GET /users/:id` expose a public projection — `id`,
`username`, `createdAt` — with no email address. `PATCH` and `DELETE` require a
session and reject anyone but the account owner with a `403`.

### `GET /users/:id`

Returns the user, or `404`. `:id` must be a UUID, otherwise `400`.

### `PATCH /users/:id`

Partial update — send only the fields you want to change. Returns the updated
resource, `404` if it does not exist, `409` on a uniqueness conflict.

### `DELETE /users/:id`

Returns `204` with no body, or `404`.

---

## Adding a new resource

Four files and one line, always in this order. Copy `users` and rename.

**1. Migration** — `src/db/migrations/002_create_matches.sql`, then
`npm run migrate`.

**2. Service** — `src/services/matches.service.js`. Business rules and SQL. No
`req`, no `res`.

```js
import { query, queryOne } from '../db/pool.js';
import { AppError } from '../utils/AppError.js';

const COLUMNS = 'id, player1_id AS "player1Id", player2_id AS "player2Id", played_at AS "playedAt"';

export async function getMatch(id) {
  const match = await queryOne(`SELECT ${COLUMNS} FROM matches WHERE id = $1`, [id]);
  if (!match) throw AppError.notFound(`Match ${id} not found`);
  return match;
}
```

**3. Controller** — `src/controllers/matches.controller.js`. Translation only.

```js
import * as matchesService from '../services/matches.service.js';

export async function getOne(req, res) {
  res.json(await matchesService.getMatch(req.params.id));
}
```

**4. Routes** — `src/routes/matches.routes.js`. URLs and schemas.

```js
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import * as controller from '../controllers/matches.controller.js';

const idParams = z.object({ id: z.uuid() });

export const matchesRouter = Router();
matchesRouter.get('/:id', validate({ params: idParams }), controller.getOne);
```

**5. Mount it** in `src/routes/index.js`:

```js
apiRouter.use('/matches', matchesRouter);
```

---

## Testing

```bash
npm test
```

`tests/http.test.js` uses the built-in `node:test` runner and global `fetch` —
no extra dependency. It boots `createApp()` on an ephemeral port and exercises
the full HTTP chain: routing, validation, 404 and 405 handling, CORS and cache
headers, and error translation. **It needs no database**, because none of the
covered paths reach one — the `npm test` script passes a dummy `DATABASE_URL`
inline and reads no `.env` file at all.

Two cases are asserted directly against `errorHandler` rather than over HTTP:
triggering a real `500` would depend on the database being down, so the result
would change from one machine to the next.

Integration tests that do touch SQL are still missing, and that is the real gap
in the suite: the SQL layer is the part you will defend at evaluation. When you
add them, point them at a dedicated database — never the development one — and
create it explicitly rather than assuming it exists.

### Manual requests

`requests/api.http` is a ready-made collection for the JetBrains HTTP Client
(open it in WebStorm and click the green arrow next to any request). It covers
every endpoint plus the documented failure modes, and the `POST /users` request
stores the created id so the following requests reuse it.

Pick the environment (`dev` or `docker`) from the selector at the top right;
values live in `requests/http-client.env.json`. Secrets belong in
`requests/http-client.private.env.json`, which is git-ignored.

---

## Conventions summary

- Business errors are `AppError`s; everything else is an anonymous `500`.
- Validation lives in the route file, never inside a controller.
- Services never see `req` or `res`.
- SQL values are always parameterised (`$1`, `$2`…).
- The database is `snake_case`; the JSON API is `camelCase`.
- Applied migrations are immutable; corrections are new migrations.
- Secrets belong in `.env`, which is never committed.

---

## Not implemented yet

| Area | Plan |
|---|---|
| Rate limiting | `express-rate-limit`, primarily on login and on the public API. |
| HTTPS | Terminated by a reverse proxy in front of this service; in-cluster traffic stays plain, as the subject allows. |
| Containerisation | `Dockerfile` (multi-stage, non-root user) plus `.dockerignore`, added as a service to the root `docker-compose.yml`, which currently declares only `db`. |
| Real-time | `ws` mounted on the HTTP server created in `server.js`, reusing the existing services. |
| Linting | ESLint + Prettier, to be agreed on before several people commit. |
