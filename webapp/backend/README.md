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

The API lives in `webapp/backend/`. It runs in two ways: inside the full stack
started by `make` (behind the WAF, secrets in Vault), or alone with `npm run dev`
while developing.

### Run everything

From the repository root:

```bash
cp contbuild/.env.example contbuild/.env
cp cybersecurity/vault/secrets/app.env.example cybersecurity/vault/secrets/app.env
cp cybersecurity/vault/secrets/backend.env.example cybersecurity/vault/secrets/backend.env
cp cybersecurity/vault/secrets/db.env.example cybersecurity/vault/secrets/db.env
# fill in the four files, then:
make
```

`make` stops with a message if one of these files is missing. It starts Vault,
loads the secrets into it (`cybersecurity/vault/scripts/bootstrap.sh`), then
builds and starts the stack:

| Service | Reachable at | What it is |
|---|---|---|
| `nginx` | **`https://localhost:8443`**, the only published port | WAF (nginx + ModSecurity + OWASP CRS); sends `/api/…` and `/ws` to `api`, everything else to `app` |
| `app` | inside the stack | the Vue front (`webapp/frontend/`) |
| `api` | inside the stack | this API; applies pending migrations, then starts |
| `db` | inside the stack | PostgreSQL 17, data in the `cybersecurity_db-data` volume |
| `vault` | inside the stack | HashiCorp Vault, holds the secrets |

In this stack:

- The API runs with `NODE_ENV=production`: `CORS_ORIGIN` must list explicit
  origins (`https://localhost:8443`), and the session cookie is `Secure`.
- Its secrets come **from Vault only**: `DEVICE_TOKEN`, `BADGE_UID_SECRET` and
  `FORTYTWO_CLIENT_SECRET` from `cybersecurity/vault/secrets/backend.env`,
  `POSTGRES_PASSWORD` from `cybersecurity/vault/secrets/db.env`. The same keys
  written in `contbuild/.env` are ignored. `DATABASE_URL` is built at startup by
  `cybersecurity/vault/wrapper/api-start.sh`.
- The rest of the configuration (`CORS_ORIGIN`, `FRONT_URL`, `POSTGRES_USER`,
  `POSTGRES_DB`, `FORTYTWO_CLIENT_ID`, `FORTYTWO_REDIRECT_URI`,
  `BADGE_LOGIN_ALLOWED_IPS`…) is still read from `contbuild/.env`.
- Logs: `docker logs cybersecurity-api-1`.

The root `README.md` describes the WAF and Vault in detail.

```bash
curl -sk https://localhost:8443/api/health
```

### Develop locally

```bash
cd webapp/backend
npm install
npm run db:up          # start only the db service
npm run migrate        # apply pending SQL migrations
npm run dev            # start the API with hot reload on PORT (3001)
```

The npm scripts read `../../contbuild/.env` and use `contbuild/docker-compose.yml`
**alone**: `npm run db:up` starts its `db` service, published on
`127.0.0.1:5432`, with its own `contbuild_db-data` volume. It is a different
database from the full stack's (`cybersecurity_db-data`), and both can run at
the same time. Here every value, secrets included, comes from
`contbuild/.env`.

Every route is served under the `/api` prefix. Verify the API is alive:

```bash
curl -s http://localhost:3001/api/health
```

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the API with `node --watch`, loading `../../contbuild/.env`. |
| `npm start` | Starts the API **without** loading `.env` — variables must come from the real environment (Docker, systemd). This is intentional: production configuration does not live in a file inside the image. |
| `npm run migrate` | Applies every migration that has not been applied yet. |
| `npm run db:up` | Starts only the `db` service of `contbuild/docker-compose.yml`. |
| `npm run db:down` | Stops only the `db` service. **Data is kept.** The rest of the stack keeps running. |
| `npm test` | Runs the tests that need no database. |
| `npm run test:db` | Runs the tests that need PostgreSQL. Start it first with `npm run db:up`. |
| `npm run db:reset` | Destroys the database volume and recreates an empty database, leaving the other services running. Guarded — see [Resetting the database](#resetting-the-database). |

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
| `POSTGRES_USER` | **yes** | — | Read by the `db` service of `contbuild/docker-compose.yml`. Must match `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | **yes** | — | Read by the `db` service of `contbuild/docker-compose.yml`. Must match `DATABASE_URL`. |
| `POSTGRES_DB` | **yes** | — | Read by the `db` service of `contbuild/docker-compose.yml`. Must match `DATABASE_URL`. |
| `FORTYTWO_CLIENT_ID` | no | — | UID of the 42 application. |
| `FORTYTWO_CLIENT_SECRET` | no | — | Secret of the 42 application. |
| `FORTYTWO_REDIRECT_URI` | no | — | Callback registered on the 42 application: `https://localhost:8443/api/auth/42/callback` behind the WAF, `http://localhost:3001/api/auth/42/callback` with `npm run dev`. |
| `FORTYTWO_API_URL` | no | `https://api.intra.42.fr` | Base URL of the intra API (tests point it at a fake server). A trailing slash is dropped. |
| `FRONT_URL` | no | empty | Base URL of the frontend, e.g. `https://localhost:8443` behind the WAF. The OAuth callback redirects the browser to `FRONT_URL/home`, `FRONT_URL/login/2fa` (account with 2FA on) or `FRONT_URL/login?oauth_error=…`. When empty the redirects are relative (`/home`, `/login/2fa`, `/login?…`). A trailing slash is dropped. |
| `DEVICE_TOKEN` | no | — | Secret shared with the ESP32, sent in the `X-Device-Token` header. |
| `BADGE_UID_SECRET` | no | — | Secret used to hash badge UIDs before they are stored. **At least 32 characters.** |
| `BADGE_LOGIN_ALLOWED_IPS` | no | — | Comma-separated IP addresses (spaces allowed) of the kiosk PC, the only machines allowed to log in with a badge, e.g. `10.11.12.13`. IPv4-mapped IPv6 (`::ffff:10.11.12.13`) and IPv6 written in any form are normalised; anything that is not an IP address (host name, CIDR range) is rejected at startup. Empty: badge login answers `503`. In development, `127.0.0.1,::1`. In the full stack, a browser on the machine running the project is seen as `172.30.0.1` on Linux and Windows (WSL), the gateway of the fixed subnet set in `cybersecurity/docker-compose.app.yml`, and as `192.168.65.1` with Docker Desktop on macOS. |

An empty value (`KEY=`) is treated as unset for the optional keys above.
`.env.example` leaves the secrets empty on purpose: a value committed to the
repository is public, and would turn the feature on with a known secret. Generate
each secret with `openssl rand -hex 32`. A value of the 42 and badge variables
that still contains an example placeholder such as `<secret>` is **rejected at
startup**. `DEVICE_TOKEN` has no minimum length, because it is shared with the
firmware and changing it means reflashing the ESP32.

**Optional features answer `503` when not configured.** The 42 login is enabled
only when `FORTYTWO_CLIENT_ID`, `FORTYTWO_CLIENT_SECRET` and
`FORTYTWO_REDIRECT_URI` are **all** set; otherwise `GET /api/auth/42` responds
`503` and `GET /api/auth/42/callback` redirects to
`/login?oauth_error=oauth_unavailable`. The badge reader is enabled only when
**both** `DEVICE_TOKEN` and `BADGE_UID_SECRET` are set; otherwise every
`/api/badge` route, `POST /api/hello` and `POST /api/scan` respond `503`. Badge
login additionally needs `BADGE_LOGIN_ALLOWED_IPS`: without it
`POST /api/badge/login` and `POST /api/badge/login/confirm` respond `503` —
badge login is then disabled, never open to everyone. The rest of the API is
unaffected.

Real values live in `contbuild/.env`, which is git-ignored.
`contbuild/.env.example` sits beside it, is committed, and documents every key —
copy it to `contbuild/.env` before the first `make` or `npm run db:up`, since
Compose reads the database credentials from there and refuses to start without
them (keep a non-empty `POSTGRES_PASSWORD` there even for `make`, which ignores
it). In the full stack, the secrets come from Vault instead (see
[Run everything](#run-everything)) and `DATABASE_URL` is built at startup so
that it targets the `db` service; with `contbuild/docker-compose.yml` alone, the
`api` container replaces `DATABASE_URL` for the same reason.

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
app.js         helmet → cors → express.json(100kb) → cookieParser → morgan
  │
  ▼
noStore        Cache-Control: no-store on every /api response
  │
  ▼
authenticate   Bearer key or session cookie → req.user (anonymous if neither)
  │
  ▼
rate limits    per API key, then per route (login, register, badge login, 2FA, messages)
  │
  ▼
routes/        matches the URL, runs validate({ body, params, query }) and the
               guards (requireAuth, requireSession, requireSelf…) in the order
               each route declares them
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
├── realtime/badgeSocket.js # WebSocket (`/ws`) that reports badge results to the browser
├── routes/                # URLs, wired to schemas and controllers
├── schemas/               # zod schemas, shared with the frontend
├── controllers/           # request in, response out
├── services/              # business logic and SQL
├── middlewares/           # authenticate, requireAuth, requireSession, validate, notFound, methodNotAllowed, errorHandler, badge guards
└── utils/
    ├── AppError.js        # business errors carrying an HTTP status
    ├── apiKey.js          # API key generation, format check and hashing
    ├── ip.js              # IP address normalisation (badge kiosk allowlist)
    └── totp.js            # TOTP codes (RFC 6238) and base32, for the 2FA

tests/
├── unit/*.test.js         # node --test, no database: HTTP chain, env, cookies, keys, badge logic, TOTP
└── db/*.db.test.js        # node --test against a real Postgres, run with `npm run test:db`
```

`app.js` exports `createApp({ rateLimit })` — a factory — instead of starting a server.
Network listening lives in `server.js`. This separation is what lets the test
suite exercise the whole HTTP stack without opening a fixed port or a database
connection.

### Startup and shutdown

`server.js` runs `SELECT 1` before listening. If the database is unreachable the
process exits with a clear message instead of serving 500s.

On `SIGINT` / `SIGTERM` it terminates the open badge WebSockets and closes the
WebSocket server, stops accepting new requests, lets in-flight ones finish,
releases the connection pool, then exits. A 10-second timer forces the
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
-- src/db/migrations/007_create_matches.sql
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

Use zero-padded numbers (`007`, not `7`): ordering is alphabetical, so `10_`
would otherwise sort before `2_`.

The migrations in place today:

| File | What it creates |
|---|---|
| `001_create_users.sql` | `users` (`citext` username and email, `updated_at` trigger) |
| `002_add_auth.sql` | `users.password_hash`, `sessions` (hashed token, expiry, `last_seen_at`) |
| `003_add_oauth_and_badges.sql` | nullable `password_hash` for 42-only accounts, `users.fortytwo_id`, `badges` |
| `004_add_api_keys_friends_messages.sql` | `api_keys`, `friendships` (one row per pair, `pending` or `accepted`), `messages` |
| `005_index_friendships_messages_api_keys.sql` | indexes on the foreign keys and lookup columns of the three tables above |
| `006_add_two_factor.sql` | `users.totp_secret` (base32; `NULL` until the first setup and after 2FA is turned off), `users.totp_enabled` (default `false`), `users.totp_last_step` (last accepted code, against replays) |

Every table that points at `users` does so with `ON DELETE CASCADE`: deleting an
account removes its sessions, badge, API keys, friendships and messages.

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

Removes only the `db` container of `contbuild/docker-compose.yml` and its
`contbuild_db-data` volume — the development database — then recreates an empty
one; nothing else is stopped. Then re-run `npm run migrate`. The full stack's
database (`cybersecurity_db-data`) is **not** touched: `make fclean` resets that
one. Because this is irreversible, `src/db/reset.js` enforces
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
    "message": "Données invalides dans body",
    "details": [{ "path": "email", "message": "Invalid email address" }]
  }
}
```

`message` is always in French and meant to be shown to a person; a client
should branch on the **status code**, never on the text. `details` is present
only for validation failures (`400` raised by `validate`): `message` is then
`Données invalides dans body`, `… dans params` or `… dans query`, and each entry
of `details` names the offending field (`path`, dot-separated for nested
fields, empty for a rule on the whole object) with zod's own message, in
English. **A stack trace is never
serialised into the response**, in any environment: it is already logged
server-side, and `NODE_ENV` is too easy to forget at deploy time for a leak of
filesystem paths and database hosts to depend on it.

### Raising errors

Throw an `AppError` from anywhere — service, controller, middleware. No
`try/catch` plumbing is needed:

```js
import { AppError } from '../utils/AppError.js';

throw AppError.notFound(`Utilisateur ${id} introuvable`);
throw AppError.conflict("Ce nom d'utilisateur est déjà pris");
```

| Factory | Status |
|---|---|
| `AppError.badRequest(message, details)` | 400 |
| `AppError.unauthorized(message)` | 401 |
| `AppError.forbidden(message)` | 403 |
| `AppError.notFound(message)` | 404 |
| `AppError.methodNotAllowed(message)` | 405 |
| `AppError.conflict(message, details)` | 409 |
| `AppError.tooManyRequests(message)` | 429 |
| `AppError.serviceUnavailable(message)` | 503 |

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
| `200` | successful read or update; also a friend request that is accepted on the spot, and a login (password or badge) that still waits for the 2FA code (`{ "twoFactorRequired": true }`) |
| `201` | resource created (account, API key, friend request, message); registration also sets a `Location` header |
| `204` | successful delete or logout, turning 2FA on or off, no body |
| `400` | validation failed (body, params or query), malformed JSON, a body sent without `Content-Type: application/json`, a friend request or message to yourself, an unknown pagination cursor, or, for 2FA, a wrong code, `enable` before any `setup`, or `disable` while 2FA is off |
| `401` | a route that needs a login called without valid credentials; wrong login credentials; a wrong device token or badge login token; a missing, expired or wrong 2FA login code; or **any** `/api` request carrying an invalid `Authorization` header |
| `403` | authenticated, but not the account owner; a route reserved to a browser session called with an API key; writing to someone who is not your friend; or a badge login from an address outside `BADGE_LOGIN_ALLOWED_IPS` |
| `404` | unknown route; missing user or API key; no pending friend request, or no friendship, with this user |
| `405` | known path, unsupported method — carries an `Allow` header |
| `409` | unique constraint violated, a friend request already pending or accepted, the 10-key limit reached, a badge action is already in progress, or 2FA already on (`setup`, `enable`) |
| `413` | request body larger than 100 kB |
| `429` | rate limit exceeded (see [Rate limiting](#rate-limiting)) |
| `500` | unexpected server error |
| `503` | `/api/health` — the database is unreachable; or an optional feature (42 login, badge reader, badge login without `BADGE_LOGIN_ALLOWED_IPS`) is not configured |

### Conflicts are arbitrated by the database

Creating a user does **not** `SELECT` first to check whether the name is taken.
It attempts the `INSERT` and translates PostgreSQL error `23505` into a `409`,
distinguishing which constraint failed:

```js
function toConflict(err) {
  if (isUniqueViolation(err, 'users_username_key')) return AppError.conflict("Ce nom d'utilisateur est déjà pris");
  if (isUniqueViolation(err, 'users_email_key'))    return AppError.conflict('Cet email est déjà utilisé');
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
usersRouter.get('/:id', validate({ params: idParams }), controller.getOne);
usersRouter.patch(
  '/:id',
  validate({ params: idParams, body: userPatchBody }),
  requireAuth,
  requireSelf,
  controller.update,
);
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

## Using the API

What holds for every route, before the details of each one.

### Requests and responses

- **Base path**: every route lives under `/api` (`http://localhost:3001/api`
  with `npm run dev`, `https://localhost:8443/api` behind the WAF with `make`). The WebSocket is `/ws`, outside
  `/api`.
- **Bodies are JSON.** Send `Content-Type: application/json`; a body sent with
  any other type is not parsed and fails validation with `400`. Malformed JSON
  is `400`, a body over 100 kB is `413`.
- **Unknown fields are dropped** before reaching the code, so they are never
  an error and never stored.
- **Field names are `camelCase`**, ids are UUIDs, dates are ISO 8601 strings in
  UTC (`2026-11-19T10:00:00.000Z`).
- **UUIDs are case-insensitive on input** (`:id`, `:userId`, `userId` in a body,
  `after` / `before`): they are lowercased before use, and always returned
  lowercase.
- **Every `/api` response carries `Cache-Control: no-store`**, so no browser or
  proxy keeps a copy of personal data. `helmet` adds the usual security headers,
  and `X-Powered-By` is removed.
- **A known path with the wrong method answers `405`** with an `Allow` header
  listing the accepted methods; an unknown path answers `404`.
- **Errors** always have the shape described in [Error handling](#error-handling).

### Users as the API shows them

A user appears in two projections, and never with its password hash:

| Projection | Fields | Returned by |
|---|---|---|
| public | `id`, `username`, `createdAt` | `GET /users`, `GET /users/:id`, every `user` inside friends and messages responses |
| private | `id`, `username`, `email`, `createdAt`, `updatedAt` | the account owner only: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /auth/session` (inside `user`), `PUT` / `PATCH /users/:id`, `POST /badge/login/confirm`, `POST /auth/2fa/verify` |

The 2FA columns (`totp_secret`, `totp_enabled`, `totp_last_step`) are in
neither projection: the account owner reads the 2FA state with `GET /auth/2fa`.

### Logging in: session cookie or API key

A request is authenticated in one of two ways, decided by `authenticate` before
any route runs:

1. **An `Authorization` header is present** → it must be `Bearer <API key>`
   (see [Public API](#public-api)). Valid: the caller is the key's owner.
   Anything else: `401` `Clé d'API invalide`, on every route. The cookie is then
   **ignored**, even if it is valid.
2. **No `Authorization` header** → the `sid` cookie is looked up. Valid: the
   caller is the session's owner. Missing, unknown or expired: the caller is
   anonymous — not an error by itself.

Routes that need a login then answer `401` `Authentification requise` to an
anonymous caller. Public routes (`GET /health`, `GET /users`, `GET /users/:id`,
`POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
`GET /auth/session`, `POST /auth/2fa/verify`, the 42 login, the kiosk and
device routes) also work anonymously.

**The session.** `POST /auth/register`, `POST /auth/login`, the 42 callback and
`POST /badge/login/confirm` open one and set the cookie. For an account with
two-factor authentication on, the last three only start a **pending login**
instead, and the session is opened by `POST /auth/2fa/verify` once the code is
right (see [Two-factor authentication](#two-factor-authentication-totp)):

| Property | Value |
|---|---|
| name | `sid` |
| value | 32 random bytes, base64url; only its SHA-256 hash is stored in `sessions` |
| flags | `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` unless `NODE_ENV` is `development` or `test` |
| lifetime | 7 days from login, **not** extended by activity (the cookie's `Max-Age` matches) |

An expired session is deleted the next time it is presented. Each login opens a
new session, so a user can be logged in on several devices at once;
`POST /auth/logout` revokes only the session of the cookie it receives. Since
the cookie is `HttpOnly`, the front-end cannot read it: the browser sends it by
itself, which needs `credentials: 'include'` with `fetch` from another origin
(and `CORS_ORIGIN` listing that origin).

---

## Public API

Besides the browser session, the API can be called with a personal **API key**,
for scripts and third-party clients. Every route that does not touch the
account's security accepts one; the few that do are reserved to the session.

### Getting a key

The examples below target `npm run dev` (`http://localhost:3001`); behind the
WAF, use `https://localhost:8443` and `curl -k` for the self-signed certificate.

Keys are managed from a logged-in session (a key cannot create other keys, so a
stolen one cannot spread). Create one, with a free name of 1 to 50 characters:

```bash
curl -c jar.txt -H 'Content-Type: application/json' \
  -d '{"identifier":"lucas","password":"SecurePass123"}' \
  http://localhost:3001/api/auth/login

curl -b jar.txt -H 'Content-Type: application/json' \
  -d '{"name":"my script"}' \
  http://localhost:3001/api/keys
```

```json
{
  "id": "9c1e…",
  "name": "my script",
  "prefix": "trk_AbCd1234",
  "createdAt": "2026-11-19T10:00:00.000Z",
  "lastUsedAt": null,
  "key": "trk_AbCd1234…"
}
```

The full `key` (`trk_` followed by 43 URL-safe characters) is shown **once**, in
this response. Only its SHA-256 hash is stored: it can never be listed or
recovered, so keep it somewhere safe and create a new one if it is lost.
`prefix` (the first 12 characters) lets you recognise a key in `GET /keys`.
An account holds at most **10** keys (`409` beyond). Revoking a key
(`DELETE /keys/:id`) takes effect immediately.

### Authenticating with a key

```bash
curl -H "Authorization: Bearer $API_KEY" http://localhost:3001/api/auth/me
```

- The scheme is `Bearer`, spelled exactly like that (case-sensitive), followed
  by one space and the key.
- When an `Authorization` header is present it is the only credential looked
  at: the session cookie is ignored.
- **A present but invalid header answers `401` on every `/api` route**,
  public ones, `POST /auth/logout` and the device routes included: a client
  sending a key must learn that it is wrong instead of silently being treated
  as anonymous. Invalid means: not `Bearer <key>`, malformed, unknown or
  revoked.
- Without an `Authorization` header, the `sid` cookie is used as before; no
  cookie, or an expired one, is an anonymous caller, not an error.
- A valid key updates its `lastUsedAt`.

### Session-only routes

A valid key is refused with `403` (`Cette action exige une session`) on:

| Route | Why |
|---|---|
| `POST /keys`, `GET /keys`, `DELETE /keys/:id` | a stolen key must not create more keys |
| `POST /badge/pairing`, `GET /badge`, `DELETE /badge` | a stolen key must not link an attacker's badge to the account |
| `DELETE /users/:id` | deleting the account is irreversible |
| `GET /auth/2fa`, `POST /auth/2fa/setup`, `POST /auth/2fa/enable`, `POST /auth/2fa/disable` | a stolen key must not replace the 2FA secret or turn 2FA off |

Routes that need a login answer `401` without credentials, before any `403`.
The kiosk routes `POST /badge/login` and `POST /badge/login/confirm`, the device
routes (`/hello`, `/scan`) and the OAuth routes read no `Authorization` header
for authentication: they stay as documented below (kiosk address, device
token). Note that an invalid `Authorization` header is still refused with `401`
before reaching them.

### Rate limit

**60 requests per minute per key**, one counter for every request carrying the
key, error responses included. Beyond that, `429` in the usual error format with
the `RateLimit-*` and `Retry-After` headers (see
[Rate limiting](#rate-limiting)). Requests not authenticated by a key (session,
anonymous, invalid key) are not counted here. The per-route limits still apply
on top: a key sending messages is also bound by the 30 messages per minute of
its owner.

### Errors

Same format as everywhere (see [Error handling](#error-handling)); messages are
in French:

```json
{ "error": { "message": "Clé d'API invalide" } }
```

Validation failures (`400`) add `details`. The order of the checks differs by
group of routes, which decides the status of a request that is wrong in several
ways at once:

| Routes | Order |
|---|---|
| `PUT` / `PATCH /users/:id` | validation → login (`401`) → owner (`403`) |
| `DELETE /users/:id` | validation → login (`401`) → session (`403`) → owner (`403`) |
| `POST /keys`, `DELETE /keys/:id` | validation → login (`401`) → session (`403`) |
| `GET /keys` | login (`401`) → session (`403`) |
| `GET /auth/2fa`, `POST /auth/2fa/setup` | login (`401`) → session (`403`) → business rules |
| `POST /auth/2fa/enable`, `POST /auth/2fa/disable` | login (`401`) → session (`403`) → validation (`400`) → business rules |
| `POST /auth/2fa/verify` | validation (`400`) → pending login (`401`) → code (`401`) |
| friends and messages | login (`401`) → validation (`400`) → business rules |

So an invalid body on `PUT /users/:id` gets `400` even without credentials,
while an invalid body on `POST /friends/requests` without credentials gets
`401`.

### Endpoints usable with a key

| Method and route | Statuses |
|---|---|
| `GET /health` | `200`, `503` |
| `GET /users` | `200`, `400` |
| `GET /users/:id` | `200` (with `relation`), `400`, `404` |
| `PUT /users/:id` | `200`, `400`, `401`, `403` (any id but your own), `409` |
| `PATCH /users/:id` | `200`, `400`, `401`, `403` (any id but your own), `409` |
| `GET /auth/me` | `200`, `401` |
| `GET /friends` | `200`, `401` |
| `GET /friends/requests` | `200`, `401` |
| `POST /friends/requests` | `201`, `200` (crossed request), `400`, `401`, `404`, `409` |
| `POST /friends/requests/:userId/accept` | `200`, `400`, `401`, `404` |
| `DELETE /friends/requests/:userId` | `204`, `400`, `401`, `404` |
| `DELETE /friends/:userId` | `204`, `400`, `401`, `404` |
| `GET /messages` | `200`, `401` |
| `GET /messages/:userId` | `200`, `400`, `401` |
| `POST /messages/:userId` | `201`, `400`, `401`, `403` (not friends), `404`, `429` |

Every route also answers `401` for an invalid key, `405` for a wrong method,
and `429` once the key's limit is reached. Not listed, because they ignore the
key or refuse it: the session-only routes above, `POST /auth/register`,
`POST /auth/login` and `POST /auth/logout` (they work on the cookie),
`GET /auth/session` (it answers `{ "user": null }` to a key) and
`POST /auth/2fa/verify` (it works on the pending-login cookie), the 42 login,
and the kiosk and device routes. Details of each route are in the [API reference](#api-reference).

```bash
curl -H "Authorization: Bearer $API_KEY" \
  'http://localhost:3001/api/users?limit=5'

curl -X PUT -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"username":"lucas","email":"lucas@42.fr"}' \
  http://localhost:3001/api/users/$USER_ID

curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$FRIEND_ID\"}" \
  http://localhost:3001/api/friends/requests

curl -X POST -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"body":"Salut !"}' \
  http://localhost:3001/api/messages/$FRIEND_ID
```

---

## API reference

All routes are prefixed with `/api`.

### `GET /health`

Liveness probe, public. `uptime` is the process uptime in seconds. When the
database does not answer, the status is `503` and the body says so, so an
orchestrator can tell "up" from "usable":

```json
{ "status": "ok", "uptime": 42.7, "database": "ok" }
{ "status": "degraded", "uptime": 42.7, "database": "ko" }
```

Like every route, it goes through `authenticate` first: probe it **without**
cookie or `Authorization` header, otherwise an invalid header gives `401`, and a
database outage turns the credential lookup into a `500` before the probe runs.

### `GET /users`

Paginated list of every account, public projection, **oldest first** (order of
creation, then `id`). Public: no login needed.

| Query | Type | Default | Range |
|---|---|---|---|
| `limit` | integer | `20` | 1–100 |
| `offset` | integer | `0` | 0–10 000 |

```json
{
  "total": 137,
  "items": [
    {
      "id": "3f2b…",
      "username": "lucas",
      "createdAt": "2026-09-03T01:32:11.114Z"
    }
  ]
}
```

`total` is the number of accounts, whatever the page. It is computed by a
`count(*) OVER ()` window function inside the same query, so a page and its
total cost **one** round-trip instead of two. `items` is empty past the last
page. `400` if `limit` or `offset` is not an integer in range.

### `GET /users/:id`

Public. Returns the public user, or `404` if no account has this id. `:id`
must be a UUID, otherwise `400`. When the caller is authenticated (session or
valid key), the response also carries `relation`, how the caller stands with
this user:

```json
{ "id": "3f2b…", "username": "lucas", "createdAt": "2026-09-03T01:32:11.114Z", "relation": "friends" }
```

| `relation` | Meaning | What the front can offer |
|---|---|---|
| `self` | it is the caller's own profile | edit the profile |
| `friends` | an accepted friendship | send a message, remove the friend |
| `request-sent` | the caller asked, no answer yet | cancel the request |
| `request-received` | this user asked the caller | accept or decline |
| `none` | no relation | send a friend request |

Anonymous callers, or ones with an expired cookie, get the user without
`relation`; an invalid `Authorization` header gets `401`.

### `PUT /users/:id`

Replaces the modifiable fields at once: `username` (same rule as at
registration) and `email`, **both required**. Account owner only, with a
session or an API key. Returns `200` with the updated private user (`updatedAt`
moves forward). `400` if a field is missing or invalid, `401` if
unauthenticated, `403` for any `:id` other than your own — an id that does not
exist included, so the answer never reveals whether an account exists — and
`409` if the username or email is already taken by another account. The
password cannot be changed here.

```json
{ "username": "lucas", "email": "lucas@42.fr" }
```

### `PATCH /users/:id`

Partial update — send only the fields you want to change, with the same rules
as `PUT`. Same access rules and statuses as `PUT`; returns the updated private
user. An empty body `{}` changes nothing and returns the current private user.

### `DELETE /users/:id`

Deletes the account and, by cascade, its sessions, badge, API keys,
friendships and messages — the other users' conversations with it disappear
too. Returns `204` with no body. Session only: `401` if unauthenticated, `403`
if called with an API key, or for any `:id` other than your own. The session
cookie is not cleared by this response, but the session no longer exists, so
the next request is anonymous.

### `POST /auth/register`

Creates the account and opens a session.

```json
{ "username": "lucas", "email": "lucas@42.fr", "password": "SecurePass123" }
```

| Field | Rule |
|---|---|
| `username` | trimmed, 3 to 20 characters, letters, digits, `_` and `-` |
| `email` | a valid email address |
| `password` | 8 to 128 characters; hashed with argon2id, never stored in clear |

Responds `201` with the private user, a `Location: /api/users/:id` header, and
the `sid` session cookie. `400` if a field breaks its rule, `409` if the
username or the email is already taken — compared case-insensitively, so
`Lucas` and `lucas` collide. Limited to 5 per minute per IP.

### `POST /auth/login`

Opens a session. `identifier` is the username **or** the email, trimmed (1 to
254 characters), matched case-insensitively; `password` is 1 to 128 characters.

```json
{ "identifier": "lucas", "password": "SecurePass123" }
```

Returns `200` with the private user and the `sid` cookie. `401`
`Identifiants invalides` covers every failure on purpose — unknown account,
wrong password, or an account created through 42 that has no password — so the
answer never tells whether an account exists (an unknown account even pays the
cost of a password hash check, so the response time does not tell either).
Limited to 10 per minute per IP and identifier.

**Account with two-factor authentication on.** Right credentials do **not**
open a session. The answer is `200` with only:

```json
{ "twoFactorRequired": true }
```

and a `twofa_pending` cookie instead of `sid`. The client then asks the user for
the 6-digit code and sends it to `POST /auth/2fa/verify`, which returns the
private user and opens the session (see
[Two-factor authentication](#two-factor-authentication-totp)). A client must
therefore check for `twoFactorRequired` before treating the body as a user.
Wrong credentials stay a plain `401`, without a pending login.

### `POST /auth/logout`

Revokes the session of the `sid` cookie and clears the cookie. Returns `204`
with no body, even without a cookie or with an already expired one. It only
looks at the cookie, but a request carrying an invalid `Authorization` header
is refused with `401` first (see [Public API](#public-api)).

### `GET /auth/me`

Returns the caller's private user. Requires a valid session cookie or API key,
`401` otherwise.

```json
{
  "id": "3f2b…",
  "username": "lucas",
  "email": "lucas@42.fr",
  "createdAt": "2026-09-03T01:32:11.114Z",
  "updatedAt": "2026-09-03T01:32:11.114Z"
}
```

### `GET /auth/session`

Tells the front, without an error, whether the browser holds a session. Public,
always `200`:

```json
{ "user": { "id": "3f2b…", "username": "lucas", "email": "lucas@42.fr", "createdAt": "…", "updatedAt": "…" } }
{ "user": null }
```

`user` is the private user when the `sid` cookie is valid, and `null` when the
caller is anonymous, holds only a pending 2FA login, or is authenticated by an
API key (this route is about the browser session). Unlike `GET /auth/me`, it
never answers `401` to an anonymous caller, so a page can check the session
silently on load; an invalid `Authorization` header is still refused with `401`.

### `GET /auth/42`

Starts the 42 login. Sets a short-lived `oauth_state` cookie (`HttpOnly`,
`SameSite=Lax`, path `/api/auth/42`, 10 minutes) holding a random anti-CSRF
`state`, then redirects (`302`) to the 42 authorize URL. Responds `503` if the
42 variables are not all set.

### `GET /auth/42/callback`

The URL registered as `FORTYTWO_REDIRECT_URI`. 42 sends the browser back here
with `code` and `state` (or `error`). The `state` is compared with the cookie,
the code is exchanged for a token, the profile is fetched, the local account is
found or created, and the same `sid` session cookie as a password login is
opened. The browser is then redirected (`302`) to the frontend:

- success: `FRONT_URL/home`;
- success on an account with 2FA on: `FRONT_URL/login/2fa`, **without** a
  session: the callback sets the `twofa_pending` cookie instead of `sid`, and
  the page at `/login/2fa` sends the code to `POST /auth/2fa/verify`;
- failure: `FRONT_URL/login?oauth_error=<code>`.

| `oauth_error` | Meaning |
|---|---|
| `oauth_state` | `state` missing, or different from the `oauth_state` cookie; also a missing `code`. Checked first: a callback carrying `error` with a bad `state` gets `oauth_state`, not `oauth_denied` |
| `oauth_denied` | the user refused on 42 (the query carries `error`), with a valid `state` |
| `oauth_email_taken` | the 42 email already belongs to another account |
| `oauth_unavailable` | 42 login not configured; 42 unreachable, slow or in error; a 42 profile without an integer `id` or without an email; or any other failure |

The callback always answers with a redirect and always clears the
`oauth_state` cookie, even when the 42 login is not configured: raising an
error there would log the request URL, which carries the one-time `code`. For
the same reason the callback is excluded from the request logs.

### Two-factor authentication (TOTP)

An account can require a 6-digit code from an authenticator app (Google
Authenticator, FreeOTP, Aegis…) **after** any first factor: password, 42 login
or badge. The codes follow RFC 6238: HMAC-SHA1, 6 digits, 30-second steps,
computed by `src/utils/totp.js` without any dependency.

| Route | Auth | Body | Responses |
|---|---|---|---|
| `GET /auth/2fa` | session | — | `200` `{ "enabled": boolean }`, `401`, `403` |
| `POST /auth/2fa/setup` | session | — | `200` `{ "secret", "otpauthUrl" }`, `401`, `403`, `409` |
| `POST /auth/2fa/enable` | session | `{ "code" }` | `204`, `400`, `401`, `403`, `409` |
| `POST /auth/2fa/disable` | session | `{ "code" }` | `204`, `400`, `401`, `403` |
| `POST /auth/2fa/verify` | `twofa_pending` cookie | `{ "code" }` | `200` private user + `sid` cookie, `400`, `401` |

`code` is a string of exactly 6 digits (`"042137"`, not `42137`): anything else
is `400` `Données invalides dans body`. The four management routes are
**session only** — a key gets `403`, so a stolen key can neither replace the
secret nor turn 2FA off.

**Turning it on** takes two steps, so that an account is never locked by a
secret the user did not actually save:

1. `POST /auth/2fa/setup` creates a new random secret (160 bits, base32) and
   stores it, still **inactive**. The response holds the secret, to type by
   hand, and the `otpauth://` link to show as a QR code:

   ```json
   {
     "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
     "otpauthUrl": "otpauth://totp/CLB%20Private%20Club%3Alucas?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CLB%20Private%20Club"
   }
   ```

   Calling it again before step 2 replaces the secret: only the last QR code
   works. `409` `La double authentification est déjà activée` once 2FA is on.
2. `POST /auth/2fa/enable` with the first code shown by the app proves the
   secret was saved, and turns 2FA on (`204`). `400` `Code invalide` for a wrong
   code, `400` `Commence par générer le QR code` without step 1, `409` if 2FA is
   already on.

**Logging in** with 2FA on:

1. The first factor succeeds — `POST /auth/login`, the 42 callback or
   `POST /badge/login/confirm`. No session is opened: the response is
   `{ "twoFactorRequired": true }` (a redirect to `FRONT_URL/login/2fa` for 42),
   with a `twofa_pending` cookie.
2. `POST /auth/2fa/verify` with the code. Right code: `200` with the private
   user, the `sid` session cookie, and the `twofa_pending` cookie cleared.

| `twofa_pending` cookie | Value |
|---|---|
| value | 32 random bytes, hex, naming the pending login |
| flags | `HttpOnly`, `SameSite=Lax`, `Path=/api/auth/2fa`; `Secure` unless `NODE_ENV` is `development` or `test` |
| lifetime | 5 minutes (`Max-Age=300`), the lifetime of the pending login |

The pending login grants **nothing** by itself: every route still treats the
caller as anonymous, and `GET /auth/session` answers `{ "user": null }`. Its
cookie is only sent to `/api/auth/2fa…`. `POST /auth/2fa/verify` answers:

- `401` `Connexion expirée, recommence depuis le début` when the cookie is
  missing, unknown, older than 5 minutes, already used, or after 5 wrong codes:
  the user must go through the first factor again;
- `401` `Code invalide` for a wrong code, which counts one failed attempt; the
  5th failure drops the pending login.

**Turning it off**: `POST /auth/2fa/disable` with a valid code (`204`) forgets
the secret; the next login needs no code. `400` `Code invalide` for a wrong code,
`400` `La double authentification n'est pas activée` when it is off.

**Which codes are accepted.** The code of the current 30-second step, or of the
step just before or after it, to absorb a clock drift of about 30 seconds. A
code is accepted **once**: `totp_last_step` keeps the step of the last accepted
code, and only a later step passes afterwards — for enable, verify and disable
alike. The check and the update are one conditional `UPDATE`, so two requests
racing with the same code cannot both pass. In practice, after using a code the
user waits for the next one.

`POST /auth/2fa/verify`, `/enable` and `/disable` are each limited to 10 requests
per minute per IP (see [Rate limiting](#rate-limiting)).

### `POST /hello`

Device route, called by the ESP32 to announce itself. Requires the
`X-Device-Token` header. Responds `200` `{ "message": "Bonjour" }`.

### `POST /scan`

Device route, called by the ESP32 for every scanned badge. Requires the
`X-Device-Token` header.

```json
{ "uid": "04A1B2C3D4E5F6" }
```

`uid` is 8 to 20 hexadecimal characters (`400` otherwise). The UID is hashed
with `BADGE_UID_SECRET` and never stored in clear.

Once the token is accepted, **every business outcome is a `200`** with a French
`message`, so the firmware never has to interpret an error: badge paired, badge
already linked to an account, login ready, unknown badge, or no badge action in
progress. What happened is reported to the browser through the
[WebSocket](#websocket-ws). Error statuses are limited to `401` (missing or
wrong token), `400` (invalid body), `405` (a method other than `POST`), `503`
(badge reader not configured) and `500` (the database failed while linking or
looking up the badge).

### Badge routes (browser)

All of them answer `503` when `DEVICE_TOKEN` or `BADGE_UID_SECRET` is missing
(checked before authentication).

| Route | Auth | Responses |
|---|---|---|
| `POST /badge/pairing` | session | `200` `{ "code" }`, `401`, `409` |
| `POST /badge/login` | kiosk address | `200` `{ "code" }`, `403`, `409`, `429`, `503` |
| `POST /badge/login/confirm` | kiosk address | `200` the authenticated user + session cookie (or `{ "twoFactorRequired": true }`), `400`, `401`, `403`, `503` |
| `GET /badge` | session | `200` `{ "linked": boolean }`, `401` |
| `DELETE /badge` | session | `204`, `401` |

- **`POST /badge/pairing`** opens a 30-second window in which the next scanned
  badge is linked to the authenticated account. A badge already linked to the
  account is replaced. Starting a pairing cancels a pending anonymous login
  window; it answers `409` only when another pairing is in progress.
- **Badge login is reserved to the kiosk.** Badges are physical and badge login
  happens from one known, fixed PC, so `POST /badge/login` and
  `POST /badge/login/confirm` are accepted only from an address listed in
  `BADGE_LOGIN_ALLOWED_IPS`: `403` from any other address, `503` when the
  variable is unset. The address is `req.ip` (see
  [Rate limiting](#rate-limiting) for how it is read), with an IPv4-mapped
  `::ffff:` prefix removed. The check runs after the `503` of an unconfigured
  badge reader and before body validation. Pairing, status, unlinking, the
  device routes and the WebSocket are not restricted: pairing already needs a
  session, and the `code` of a login window is only ever handed to the kiosk.
- **`POST /badge/login`** opens a 30-second anonymous window in which the next
  scanned badge logs in. `409` if any badge action is already in progress.
- **`POST /badge/login/confirm`** takes `{ "token": "…" }`, the one-time token
  received over the WebSocket. It is valid for 10 seconds and can be used once;
  otherwise `401`. On success the response is the same private user as
  `GET /auth/me`, with a `sid` session cookie — or, for an account with 2FA on,
  `{ "twoFactorRequired": true }` with a `twofa_pending` cookie, exactly like
  `POST /auth/login`: the badge is the first factor, the code the second.
- **`GET /badge`** says whether the account has a badge; **`DELETE /badge`**
  unlinks it (idempotent).

Only one badge action exists at a time, because there is a single reader.

### WebSocket `/ws`

The browser learns the outcome of a pairing or a login window here. The
connection is served by the same HTTP server and port as the API.

1. Call `POST /api/badge/pairing` or `POST /api/badge/login` and keep the `code`.
2. Open the WebSocket (`wss://localhost:8443/ws` behind the WAF,
   `ws://localhost:3001/ws` with `npm run dev`) and send **one** JSON message:
   `{ "code": "<code>" }`.
3. The server replies with **one** message, then closes the connection:
   `{ "status": "<status>" }`, or `{ "status": "login-ready", "token": "<token>" }`.
4. For a login, send the `token` to `POST /api/badge/login/confirm`.

| `status` | Meaning |
|---|---|
| `paired` | the badge was linked to the account |
| `already-linked` | the badge belongs to another account; nothing changed |
| `login-ready` | a known badge was scanned; comes with `token` |
| `unknown-badge` | the badge is linked to no account |
| `not-pairing` | the account disappeared before the badge was linked |

The result is kept for 5 seconds if the scan happens before the socket is
attached, so a fast scan is not lost. A window holds at most one socket at a
time; when that socket closes (a page reload, a dropped connection), the window
is freed and a new socket can attach with the same `code` while the window is
still open.

The server closes the socket **without any message** when: the first message is
not JSON with a non-empty string `code` (messages are limited to 1 kB), the
`code` is unknown, expired or already held by another open socket, no first
message arrives within 10 seconds, or 35 seconds have elapsed in total. The
30-second window expires lazily: nothing fires at the 30-second mark; the
socket of an expired window is closed by the next pairing or badge login
start, the next scan, or the next socket that sends a `code`, and at the latest
by the 35-second cap.

### Rate limiting

Counted in memory, over a fixed window that starts with the first counted
request. Every counted response carries `RateLimit-Policy`, `RateLimit-Limit`,
`RateLimit-Remaining` and `RateLimit-Reset` (seconds until the window resets;
IETF draft 6 headers). Beyond the limit the answer is `429`
`Trop de requêtes, réessayez plus tard` in the usual error format, with a
`Retry-After` header in seconds:

| Route | Limit | Counted per |
|---|---|---|
| `POST /auth/login` | 10 per minute | client IP **and** identifier |
| `POST /auth/register` | 5 per minute | client IP |
| `POST /badge/login` | 1 per 10 seconds | client IP |
| `POST /auth/2fa/verify` | 10 per minute | client IP |
| `POST /auth/2fa/enable` | 10 per minute | client IP |
| `POST /auth/2fa/disable` | 10 per minute | client IP |
| every `/api` request carrying a valid API key | 60 per minute | API key |
| `POST /messages/:userId` | 30 per minute | authenticated user |

The key counter counts every request made with the key, errors included, and
ignores session and anonymous requests. The message counter is shared between
the session and the keys of the same user, and counts every attempt, refused
ones included (an anonymous attempt, answered `401`, is counted per IP). Several
limits can apply to the same request: a message sent with a key counts both for
the key and for its owner. Every limiter is checked before the route itself, so
a `429` comes before any validation or business error; only an invalid
`Authorization` header is refused earlier, with `401`.

The login counter is keyed by the client IP plus `identifier` from the body,
trimmed and lowercased (the IP alone when `identifier` is not a string). Behind
the school's NAT the whole campus shares one address: with a per-IP limit, one
student typing ten wrong passwords would lock everyone out. Ten attempts on one
identifier now block only that identifier from that address.

`trust proxy` is set to `1`, so the IP is read from `X-Forwarded-For` as set by
the single reverse proxy in front of the API. Rate limiting is **off by default
when `NODE_ENV=test`**, so the suites can chain logins freely; `createApp({
rateLimit: true })` turns it on (the rate-limit test does).

### `GET /keys`

Session only. Lists the caller's keys, newest first. The key itself is never
returned.

```json
{
  "items": [
    {
      "id": "9c1e…",
      "name": "my script",
      "prefix": "trk_AbCd1234",
      "createdAt": "2026-11-19T10:00:00.000Z",
      "lastUsedAt": "2026-11-19T10:05:00.000Z"
    }
  ]
}
```

`lastUsedAt` is `null` for a key that was never used. `401` without a session,
`403` with an API key.

### `POST /keys`

Session only. Body `{ "name": "my script" }` (trimmed, 1 to 50 characters).
Responds `201` with the same object as the list plus `key`, the only time the
full key is shown. `400` on an invalid name (checked before authentication),
`401`, `403` with an API key, `409` when the account already has 10 keys.

### `DELETE /keys/:id`

Session only. Revokes the key immediately and responds `204`. `404` if the key
does not exist **or belongs to someone else** (its existence is not revealed),
`400` if `:id` is not a UUID, `401`, `403` with an API key.

### Friends

Every friends route needs a session or an API key (`401` otherwise, checked
before validation). A user is always the public projection
`{ id, username, createdAt }`. There is one relation per pair of users, stored
once whatever its direction, in one of two states: `pending` (a request from one
to the other) or `accepted`. Declining, cancelling or removing deletes it, and a
new request can be sent afterwards, by either side. `:userId` must be a UUID
(`400`). The lists are not paginated: they are bounded by the number of
friends.

The typical flow, A asking B:

1. A: `POST /friends/requests` `{ "userId": "<B>" }` → `201` `pending`.
2. B sees it in `GET /friends/requests` under `incoming`, A under `outgoing`.
3. B: `POST /friends/requests/<A>/accept` → `200` `accepted`, or
   `DELETE /friends/requests/<A>` to decline. A can cancel with
   `DELETE /friends/requests/<B>` while it is pending.
4. Both see each other in `GET /friends`; either can end it with
   `DELETE /friends/<other>`.

| Route | Success | Other statuses |
|---|---|---|
| `GET /friends` | `200` `{ "items": [{ "user", "since" }] }`, `since` = acceptance date, newest first | |
| `GET /friends/requests` | `200` `{ "incoming": [{ "user", "createdAt" }], "outgoing": [{ "user", "createdAt" }] }`, newest first | |
| `POST /friends/requests` | `201` `{ "status": "pending", "user" }`; `200` `{ "status": "accepted", "user" }` if the other user had already asked me | `400` (invalid body, or myself), `404` (unknown user), `409` (already friends, or a request I sent is pending) |
| `POST /friends/requests/:userId/accept` | `200` `{ "status": "accepted", "user" }` | `404` (no pending request received from this user) |
| `DELETE /friends/requests/:userId` | `204`: declines the request received from `:userId` or cancels the one sent to them | `404` (no pending request with this user) |
| `DELETE /friends/:userId` | `204` | `404` (not friends) |

`POST /friends/requests` takes `{ "userId": "<uuid>" }`. If that user had
already sent me a request, sending mine accepts theirs instead of creating a
second one (`200` `accepted`); two crossed requests sent at the same instant
also end as friends, one answered `201` and the other `200`. Only the user who
**received** a request can accept it. Accepting when already friends, removing
a friend who is only a pending request, and declining a request when already
friends all answer `404`: the expected state does not exist. Other users'
requests are invisible: acting on a request between two other people is a
`404`, as if it did not exist.

### Messages

Chat between friends, one conversation per pair. Every messages route needs a
session or an API key (`401` otherwise, checked before validation). A message
is:

```json
{
  "id": "5d7a…",
  "senderId": "3f2b…",
  "recipientId": "8e41…",
  "body": "Salut !",
  "createdAt": "2026-11-19T10:00:00.000Z"
}
```

| Route | Success | Other statuses |
|---|---|---|
| `GET /messages` | `200` `{ "items": [{ "user", "lastMessage" }] }`, newest conversation first, not paginated | |
| `GET /messages/:userId` | `200` `{ "items": [message, …] }`, oldest first | `400` (invalid `:userId` or query, unknown or foreign cursor, `after` with `before`) |
| `POST /messages/:userId` | `201` the created message | `400` (invalid body, or myself), `404` (unknown user), `403` (not friends), `429` |

`GET /messages` lists one entry per person you have exchanged at least one
message with — former friends included —, `user` being that person and
`lastMessage` the most recent message of the conversation (a message object,
sent by either side). It is the list to show as an inbox.

`POST` takes `{ "body": "…" }`: a string trimmed at both ends, then 1 to 2000
characters, so a body made only of spaces is a `400`. The trimmed text is
stored as is; escaping HTML is up to the front-end (Vue escapes by default).
The checks run in this order: myself (`400`), unknown user (`404`), not friends
(`403`). Sending requires being friends, **reading does not**: history stays
readable after the friendship ends. A conversation with nobody, or with an
unknown `:userId`, reads as an empty `items`. Only your own conversations are
ever readable: there is no way to name someone else's.

`GET /messages/:userId` pagination: the cursor is a message `id`, ordered by
`(createdAt, id)` inside the conversation. `items` is always chronological.

| Query | Result |
|---|---|
| none | the `limit` most recent messages |
| `after=<id>` | the `limit` oldest messages after that one (polling for new messages) |
| `before=<id>` | the `limit` most recent messages before that one (older history) |
| `limit` | 1 to 100, default 50 |

An unknown cursor, one from another conversation, or `after` together with
`before`, answers `400`. Sending is limited to 30 messages per minute per user
(see [Rate limiting](#rate-limiting)).

How a chat screen uses it:

1. Open the conversation: `GET /messages/<friend>` → the 50 latest messages,
   oldest first; keep the `id` of the last one.
2. Every few seconds: `GET /messages/<friend>?after=<last id>` → only what is
   new (often `[]`); append it and move the cursor to the new last `id`.
3. Scrolling up: `GET /messages/<friend>?before=<first id>` → the 50 previous
   ones; prepend them. An empty `items` means the beginning was reached.
4. Sending: `POST /messages/<friend>` → show the returned message right away,
   but **do not** move the cursor to it: a message from the friend may have
   been sent between the last poll and yours, and `after=<your id>` would skip
   it. The next poll returns your message again among the new ones; skip the
   ids already shown.

---

## Adding a new resource

Four files and one line, always in this order. Copy `users` and rename.

**1. Migration** — `src/db/migrations/007_create_matches.sql`, then
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
npm run test:db
```

Both suites use the built-in `node:test` runner and global `fetch` — no extra
dependency.

`tests/unit/` **needs no database**, because none of the covered paths reach
one — the `npm test` script passes a dummy `DATABASE_URL` inline and reads no
`.env` file at all. `http.test.js` boots `createApp()` on an ephemeral port and
exercises the full HTTP chain: routing, validation, 404 and 405 handling, CORS
and cache headers, and error translation. The other files cover what can be
checked without SQL: environment parsing (`env`), cookie flags (`cookies`),
API key format and hashing (`apiKey`), `Authorization` header rejection
(`authenticate`), the login, registration and 2FA limits (`rate-limit`), IP
normalisation (`ip`), TOTP codes against the RFC 6238 test vectors (`totp`),
the badge state machine, the kiosk guard and the `503`s of
an unconfigured badge reader (`badge*`), and the `503` / redirect of an
unconfigured 42 login (`oauth`).
This is the property `npm test` (and only `npm test`) has: `npm run test:db`,
below, does need a database.

Two cases are asserted directly against `errorHandler` rather than over HTTP:
triggering a real `500` would depend on the database being down, so the result
would change from one machine to the next.

`tests/db/*.db.test.js` are the integration tests that do touch SQL: the
schema and its constraints (`schema`), registration, login, logout and `me`
(`auth-*`), session lifecycle (`sessions`), users and ownership on `PUT`,
`PATCH` and `DELETE` (`users*`), API keys and key authentication (`apiKeys*`,
`authenticate`), friends and profile relation (`friends`), messages and their
pagination (`messages`), two-factor authentication and `GET /auth/session`
(`twoFactor-http`), the 42 login (`oauth-*`), the badge reader and its
WebSocket (`badge*`) — the last two including their 2FA step — and graceful
shutdown (`server-shutdown`). Run them with
`npm run test:db` against a running database (`npm run db:up`, then
`npm run migrate`). Each test creates its own accounts with random usernames
and deletes them on exit, so the suite never needs an empty database and never
leaves one dirty — point it at the development database without fear, but
never at production.

### Manual requests

`requests/api.http` is a ready-made collection for the JetBrains HTTP Client
(open it in WebStorm and click the green arrow next to any request). It covers
registration, login, `me`, the public directory, an owner `PATCH`, logout, and
the documented failure modes; the register request stores the created id and
session cookie so the following requests reuse them.

It also covers the 42 login start, the device routes (`/hello`, `/scan`), the
badge routes, API keys (creation from the session, use on `GET /auth/me` and
`PUT /users/:id`, revocation) and the friends and messages flows.

Pick the environment (`dev` or `docker`) from the selector at the top right;
values live in `requests/http-client.env.json`: `dev` targets `npm run dev`
(`http://localhost:3001`), `docker` the full stack behind the WAF
(`https://localhost:8443`). For `docker`, accept the self-signed certificate
with `"SSLConfiguration": { "verifyHostCertificate": false }` in that
environment of the private file below. Secrets belong in
`requests/http-client.private.env.json`, which is git-ignored. The device
requests use a `{{deviceToken}}` variable that must match `DEVICE_TOKEN`: define
it there, for each environment:

```json
{
  "dev": { "deviceToken": "<same value as DEVICE_TOKEN in .env>" }
}
```

The API key requests use `{{apiKey}}`, the `key` returned when the key is
created. The create request stores it in a global variable for the following
requests; to reuse a key across sessions, define `apiKey` in the same private
file. Never put a real key in `api.http`.

The friends and messages flow needs a second account: `{{friendId}}` is the id
of another user, and `{{friendCookie}}` its session cookie (the "second
account" requests register and log it in).

The 2FA routes are not in the collection: `enable`, `disable` and `verify` need
a fresh code from an authenticator app, so they cannot run unattended.

`GET /auth/42` answers `302` to 42 and the request is marked `# @no-redirect`, so
the redirect is not followed and its `Location` header can be inspected; run it
from a browser to complete the whole flow. The WebSocket cannot be exercised
from this file: use a browser, or a tool such as `websocat`.

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

## Known limitations

- **Pairing hijack by physical presence.** If someone scans their own badge
  during the 30 seconds in which you pair yours, their badge is linked to your
  account and they can then log in as you. This is inherent to the "next scan
  wins" model.
- **Badge login windows block each other.** While one `POST /badge/login`
  window is open, another one gets `409`; since badge login is reserved to the
  kiosk addresses, only the kiosk can cause this.
- **A logged-in account can hold the reader.** Pairing needs a session but is
  not limited: an account reopening a pairing every 30 seconds keeps the single
  badge slot busy and blocks the badge reader for everyone.
- **Email squatting on the 42 login.** 42 emails are predictable and local
  emails are not verified. Someone can register a local account with a
  student's 42 email before that student's first 42 login; the student then
  gets `oauth_email_taken` with no way around it. This is the price of
  refusing automatic linking by email, which would otherwise allow an account
  takeover.
- **The kiosk restriction relies on the WAF.** `BADGE_LOGIN_ALLOWED_IPS` is
  compared with `req.ip`, read from `X-Forwarded-For` because `trust proxy` is
  `1`. That is only trustworthy behind the team's WAF: the API must never be
  reachable directly, or anyone can forge the header and pass as the kiosk.
- **No cap on WebSocket connections per IP.** `/ws` limits each socket's
  message size and lifetime, but not how many sockets one client opens; that
  belongs to the WAF.
- **Badge state and pending 2FA logins live in memory.** Pending windows,
  results, login tokens and pending 2FA logins exist only inside one API
  process: run a single instance. A restart drops the pending 2FA logins, and
  those users type their password again.
- **The badge reader goes through a USB bridge.** The ESP32 sends each scan
  over USB to `webapp/badge-bridge/` on the kiosk PC, which calls `/api/hello`
  and `/api/scan` with the device token. Without the bridge, test the device
  routes with `requests/api.http` or `curl`.
- **The 2FA secret is stored in clear.** `users.totp_secret` must be readable to
  compute codes; anyone who can read the database can generate them. It is
  never returned by the API.
- **No recovery codes.** A user who loses their authenticator app cannot log in
  any more, and turning 2FA off needs a code: an administrator has to clear the
  2FA columns in the database.
- **Turning 2FA on does not close the other sessions.** Sessions opened before
  stay valid until they expire or are logged out.
- **Guessing a 2FA code is slowed, not impossible.** A pending login allows 5
  wrong codes, `POST /auth/2fa/verify` 10 requests per minute per IP, and
  starting a new pending login needs the password again (10 logins per minute
  per IP and identifier). That leaves about 10 guesses per minute per address
  for someone who already knows the password, against 3 valid codes out of a
  million at any time.
- **Messages are polled.** There is no push: a client asks for new messages
  every few seconds with `GET /messages/:userId?after=<id>`, so they appear
  with a short delay.
- **No blocking.** An unwanted friend is removed, and can then no longer write;
  they can send a new friend request, though.
- **Rate limits live in memory.** Counters (login, registration, API keys,
  messages) exist inside one API process and reset on restart: run a single
  instance.
- **API keys do not expire.** A key is valid until it is revoked.
- **Polling can skip a message committed out of order.** `after=<id>` returns
  messages created after the cursor message. Two messages sent at almost the
  same instant can be committed in the opposite order of their timestamps, so
  a client may in rare cases miss one: the front should re-fetch the last few
  messages from time to time.
