*This project has been created as part of the 42 curriculum by allefran, fdeleard, lucnavar, anpicard, tmarion.*

# ft_transcendence

## Description

TODO (team): project name and goal.

ft_transcendence is a web application where users create an account with a
username, an email and a password, or log in with their 42 account. They can link a
physical NFC badge to their account: the badge is read by an ESP32 device and, once
linked, logs them in at the kiosk without typing a password.

Key features:

- Sign up, then log in with the username or the email and the password (argon2id
  hashes, server-side sessions), or with the 42 intranet (OAuth 2.0).
- Two-factor authentication (TOTP) on every login method.
- Link, check and unlink an NFC badge from the settings page; log in by scanning it,
  with real-time feedback over WebSocket.
- Public profiles, friends and direct messages between friends.
- A public REST API, usable by scripts with a personal API key.
- A scratch-ticket game.

The application is served over HTTPS only, behind a Web Application Firewall
(nginx + ModSecurity + OWASP Core Rule Set). Its secrets are stored in
HashiCorp Vault and are never written in the image or in the Compose files.

## Instructions

### Prerequisites

- Docker with Docker Compose v2 (tested with Compose 2.40)
- `make`, `bash`, `openssl`
- `python3` on the host (used by the Vault bootstrap script to read its init file)

On Debian/Ubuntu, Docker can be installed with:

```sh
sudo apt update
sudo apt install docker.io docker-compose-v2 -y
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### First run

1. **Configuration files.** Copy the four example files and fill in real values.
   They are ignored by Git, and `make` stops with a message if one is missing.

   ```sh
   cp contbuild/.env.example contbuild/.env
   # edit contbuild/.env: POSTGRES_USER, POSTGRES_DB, CORS_ORIGIN (https://localhost:8443), ...
   cp cybersecurity/vault/secrets/app.env.example cybersecurity/vault/secrets/app.env
   # edit cybersecurity/vault/secrets/app.env: SESSION_SECRET, DEVICE_TOKEN
   cp cybersecurity/vault/secrets/backend.env.example cybersecurity/vault/secrets/backend.env
   # edit cybersecurity/vault/secrets/backend.env: DEVICE_TOKEN, BADGE_UID_SECRET, FORTYTWO_CLIENT_SECRET
   cp cybersecurity/vault/secrets/db.env.example cybersecurity/vault/secrets/db.env
   # edit cybersecurity/vault/secrets/db.env: POSTGRES_PASSWORD (openssl rand -hex 32)
   ```

   - `contbuild/.env` holds the configuration, read by Compose and by the `api` and
     `db` services. The `app` service does not read it. In the integrated stack, the
     secrets written there are ignored (`DEVICE_TOKEN`, `BADGE_UID_SECRET`,
     `FORTYTWO_CLIENT_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`).
     `POSTGRES_PASSWORD` must still be non-empty, because
     `contbuild/docker-compose.yml` requires it; it is only used by
     `npm run db:up` (local development of the API).
   - `cybersecurity/vault/secrets/*.env` are only read by the bootstrap script, which
     loads them into Vault. The app, the API and the database get their secrets from
     Vault. `DEVICE_TOKEN` must be the same in `app.env` and `backend.env`.

2. **TLS certificate:** nothing to do. If `cybersecurity/waf/certs/server.crt` is
   missing, `make` creates a self-signed certificate for `localhost` with `openssl`
   (development only; the certificate and its key are ignored by Git).

3. **Start everything** with a single command:

   ```sh
   make
   ```

   `make` starts Vault, runs `cybersecurity/vault/scripts/bootstrap.sh`
   (init on first run, unseal, configuration, secrets loading), then builds and
   starts the app, the API, the database and the WAF, and restarts the WAF so that
   it uses the current address of the app.

4. Open **https://localhost:8443** (accept the self-signed certificate).
   It is the only published port: the app, the API, the database and Vault are only
   reachable inside Docker, so every request goes through the WAF.

On the first run, the bootstrap writes the Vault unseal keys and root token to
`~/vault-init.json` (mode 600, outside the repository). Keep this file: without it,
Vault cannot be unsealed after a restart.

### Login with 42 and badge reader

- **42:** create an application on the 42 intranet (Settings > API) with the Redirect URI
  `https://localhost:8443/api/auth/42/callback`, then set `FORTYTWO_CLIENT_ID`,
  `FORTYTWO_REDIRECT_URI` (same address) and `FRONT_URL=https://localhost:8443` in
  `contbuild/.env`, and `FORTYTWO_CLIENT_SECRET` in `cybersecurity/vault/secrets/backend.env`.
- **Badge reader:** flash `firmware/esp32_rfid.ino` (Arduino IDE, library `MFRC522_I2C`),
  plug the ESP32 into the kiosk PC over USB, then start the bridge there:

  ```sh
  cd webapp/badge-bridge
  cp .env.example .env   # SERIAL_PORT, API_URL=https://localhost:8443, DEVICE_TOKEN (same as backend.env)
  npm install
  NODE_EXTRA_CA_CERTS=../../cybersecurity/waf/certs/server.crt npm start
  ```

  Badge login is only accepted from `BADGE_LOGIN_ALLOWED_IPS` (`contbuild/.env`). A
  browser on the machine that runs the stack is seen as `172.30.0.1`.

### Other commands

| Command | Effect |
|---|---|
| `make stop` / `make clean` | Stop and remove the containers. The Vault data volume is kept. |
| `make fclean` | Also remove the database volume and the built images (asks for confirmation). The Vault data volume is kept. |
| `make re` | `clean` then `make` |
| `make a_wish` | Show images, containers and the logs of every service |
| `bash cybersecurity/waf/tests/waf-app-test.sh` | WAF tests against the running app |
| `bash cybersecurity/vault/tests/vault-isolation-test.sh` | Vault isolation tests (policies and network) |

### Notes on the Compose setup

- The stack is made of three Compose files, listed in `COMPOSE_FILE` in the Makefile.
  `cybersecurity/docker-compose.yml` comes first: it sets the project directory and the
  project name (`cybersecurity`), so the Vault volume stays the same between runs.
- `context: ..` in `contbuild/docker-compose.yml` uses the repository root as build
  context; `dockerfile: contbuild/Dockerfile` points to the Dockerfile.
- `HOST: 0.0.0.0` lets Express listen on every interface inside its container.

## Team Information

TODO (team): role(s) and responsibilities of each member.

## Project Management

TODO (team): work organization, tools, communication channels.

## Technical Stack

- **Frontend:** **Vue 3** + Vue Router, built with **Vite** (`webapp/frontend/`), served
  by a small Express server (`webapp/frontend/server.js`, the `app` service). Styling
  solution: hand-written CSS with design tokens (`src/style.css`, `src/game.css`).
- **Backend:** Node.js 22 with **Express 5** (`webapp/backend/`), see
  `webapp/backend/README.md`.
  - `argon2`: password hashing (argon2id, salted).
  - Sessions stored in the database, only as a hash of the session token.
  - `zod`: validation of every request body, query and parameter.
  - `ws`: WebSocket server, used for the badge pairing and badge login feedback.
- **Database:** **PostgreSQL 17** through `pg`, with plain SQL migrations
  (`webapp/backend/src/db/migrations/`).
- **Device:** an ESP32 with an NFC reader, plugged in over USB; `webapp/badge-bridge`
  sends each scanned UID to `/api/scan`, authenticated with a shared device token
  (`DEVICE_TOKEN`, compared in constant time).
- TODO (team): justification of the major technical choices.

Security layer:

- **nginx + ModSecurity v3 + OWASP CRS 4.25** (`owasp/modsecurity-crs:4.25-nginx-lts`):
  maintained image with a well-known rule set, configured through environment variables.
- **HashiCorp Vault 2.1** (`hashicorp/vault:2.1.2`): secrets storage, encrypted at rest,
  with per-service access through AppRole.

## Database Schema

PostgreSQL database, created by the migrations in `webapp/backend/src/db/migrations/`.
Every table points to `users` with `ON DELETE CASCADE`: deleting an account deletes
its sessions, badge, API keys, friendships and messages.

| Table | Key fields | Relations |
|---|---|---|
| `users` | `id` uuid PK, `username` and `email` unique (case-insensitive), `password_hash` (null for 42 accounts), `fortytwo_id` unique, `totp_secret`, `totp_enabled`, `totp_last_step` | — |
| `sessions` | `id` uuid PK, `token_hash` unique, `expires_at` | `user_id` → `users` |
| `badges` | `id` uuid PK, `uid_hash` unique (HMAC of the badge UID) | `user_id` → `users`, one badge per user |
| `api_keys` | `id` uuid PK, `name`, `key_hash` unique, `prefix`, `last_used_at` | `user_id` → `users` |
| `friendships` | `id` uuid PK, `status` | `requester_id`, `addressee_id` → `users` |
| `messages` | `id` uuid PK, `body`, `created_at` | `sender_id`, `recipient_id` → `users` |

- `users`: one row per account. Only the argon2id hash of the password is stored
  (`password_hash` is null for accounts created with 42).
- `badges`: at most one badge per user (`user_id` is unique) and one user per badge
  (`uid_hash` is unique). Only a hash of the badge UID is stored. Deleting a user
  deletes their badge link.

## Features List

| Feature | Member(s) | Description |
|---|---|---|
| Sign up / log in | anpicard (front), lucnavar (API) | Email or username + password (argon2id), validation in the front and in the API, session cookie (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`). |
| Login with 42 | anpicard, lucnavar | OAuth 2.0 authorization code flow with the 42 intranet (`/api/auth/42`). |
| Two-factor authentication | anpicard | TOTP (Google Authenticator, FreeOTP...): QR code in Settings, code asked on every login method (`/api/auth/2fa/*`). |
| Badge pairing / unlink | anpicard, lucnavar | Settings page: link the next scanned badge to the account, or unlink it (`/api/badge/pairing`, `/api/badge`). |
| Badge login | anpicard, lucnavar | Login page: tap a linked badge at the kiosk (`/api/badge/login`), then the 2FA code if enabled. |
| Real-time feedback | anpicard, lucnavar | WebSocket `/ws` bound to a pending badge action by its random code. |
| Badge reader | anpicard | ESP32 + MFRC522 over USB (`firmware/`), USB bridge on the kiosk PC (`webapp/badge-bridge`), `/api/hello` and `/api/scan` protected by `DEVICE_TOKEN`. |
| Scratch-ticket game | tmarion | Ticket choice, key sequence to scratch, revealed prize (`/game`). |
| Profiles and user directory | lucnavar | Public profile of any user and paginated list of accounts; the owner edits their username and email (`/api/users`, `/api/users/:id`). A profile shows how the viewer stands with that user (`relation`). |
| Friends | lucnavar | Send, accept, decline or cancel a friend request, remove a friend, list friends and pending requests (`/api/friends`). |
| Direct messages | lucnavar | Messages between friends, conversation list, history paginated by cursor (`/api/messages`). |
| Public API and API keys | lucnavar | Personal API keys for scripts, created and revoked from the session, rate limited, documented in `webapp/backend/README.md` (`/api/keys`). |
| WAF and Vault | allefran | See the Cybersecurity module below. |

## Modules

| Module | Type | Points | Member(s) |
|---|---|---|---|
| Cybersecurity: WAF/ModSecurity (hardened) + HashiCorp Vault for secrets | Major | 2 | allefran |
| Module of choice: NFC badge login (ESP32 reader) | Major | 2 | anpicard |
| Remote authentication with OAuth 2.0 (42) | Minor | 1 | anpicard, lucnavar |
| Complete 2FA system (TOTP) | Minor | 1 | anpicard |
| Public API with a secured API key, rate limiting and documentation | Major | 2 | lucnavar |
| Allow users to interact with other users (profiles, friends, chat) | Major | 2 | lucnavar |
| TODO (team): other modules | | | |

### Cybersecurity: WAF/ModSecurity + Vault

**Why:** every request reaches the app through a strict WAF, and no secret is stored
in the image, in the Compose files or in Git.

**Architecture:**

```
                                                     /api/..., /ws
browser --HTTPS:8443--> nginx + ModSecurity (WAF) ----------------> api:3000 --> db:5432
                                                 \                     \           |
                                                  \ everything else     \ (vault-net)
                                                   `--------> app:3000 --+--> vault:8200
```

The app, the API and the database each read their own secrets from Vault, on the
internal `vault-net` network.

The WAF port (8443) is the only published port. In the integrated stack, the ports of
the API (3001) and of the database (5432) are removed (`ports: !reset []` in
`docker-compose.app.yml`); `npm run db:up` in `webapp/backend`, which uses
`contbuild/docker-compose.yml` alone, still publishes the database on `127.0.0.1:5432`
for local development.

**WAF (`cybersecurity/docker-compose.yml`, `cybersecurity/waf/`):**

- `MODSEC_RULE_ENGINE=On`: attacks are blocked (403), not only logged.
- `BLOCKING_PARANOIA=2`: stricter than the default level 1. The detection level
  follows the blocking level (CRS rule 901125), so it is also 2.
- `ALLOWED_METHODS=GET HEAD POST PUT PATCH DELETE OPTIONS`: any other method is
  refused (CRS rule 911100). `TRACE` is refused by nginx itself (405).
- Local rule `10001` (`waf/rules/before-crs.conf`): blocks `/.env` and `/.git`
  paths, case-insensitive.
- Routing (`waf/nginx/location_common.conf.template`, integrated stack only):
  `/api/...` and the `/ws` WebSocket go to the API, everything else to the app.
  ModSecurity is enabled for the whole server, so both are filtered.
- TLS 1.2 and 1.3 only; plain HTTP is not published.
- Audit log in JSON on stdout, `MODSEC_AUDIT_LOG_PARTS=ABJDFHZ`: no request or
  response body in the logs, but the triggered rules are kept.

**Vault (`cybersecurity/vault/`):**

- Storage `file`, encrypted at rest by Vault; Shamir unseal with 3 key shares,
  threshold 2.
- Isolated: Vault is only on the `vault-net` network (`internal: true`), its port is
  not published, and the WAF cannot even resolve its name.
- One AppRole and one read-only policy per service:

  | AppRole | Used by | Can read |
  |---|---|---|
  | `app` | app (`webapp/frontend/server.js`) | `secret/app/*` |
  | `backend` | API (`webapp/backend`) | `secret/backend/*`, `secret/db/*` (to build its `DATABASE_URL`) |
  | `db` | Postgres | `secret/db/*` |
- `scripts/bootstrap.sh` is idempotent: it initializes Vault only once, unseals it,
  enables KV v2 and AppRole, writes the policies and roles, and loads
  `secrets/<service>.env` into `secret/<service>/app`.
- The app and the API start through `wrapper/vault-exec.js`: it logs in with the
  service's AppRole credentials (mounted read-only from `vault/run/<service>/`), reads
  its secrets (one or more paths in `VAULT_SECRET_PATH`) and starts the real command
  with them in its environment. The values never appear in `docker inspect` or in the
  image. For the API and the database, the secret keys are also emptied in the
  Compose file, so a value left in `contbuild/.env` never reaches the container.
- The API runs `wrapper/api-start.sh`, which builds its `DATABASE_URL` from
  `POSTGRES_PASSWORD` (URL-encoded) before the migrations and the server.
- Postgres has no Node: it starts through `wrapper/vault-exec.sh`, a POSIX shell
  version (wget and sed) that exports `POSTGRES_PASSWORD`, then runs the normal
  entrypoint of the image.

**Tests:** `waf/tests/waf-test.sh` (WAF alone, with the `whoami` test backend) and
`waf/tests/waf-app-test.sh` (integrated app): legitimate traffic must pass, SQL
injection, XSS, path traversal, command injection, scanner user agents and access to
sensitive files must be blocked. `vault/tests/vault-isolation-test.sh` checks that the
app reads its own secret (200) but gets 403 on the backend secret, on writes and on
Vault administration paths; that the backend gets 403 on the app secret; and that the
WAF cannot resolve Vault, which has no Internet access. It prints status codes only.

**Known limitations:**

- ModSecurity copies the matched value into the `data` and `match` fields of the
  audit log. A password that triggers a rule therefore appears in the logs.
- Paranoia level 2 has false positives on some free text (for example
  "select ... from", "--", "1 OR 2") and on passwords with many symbols. Targeted
  exclusions are still to be written for the real fields.
- The certificate is self-signed (development only).
- Postgres only uses `POSTGRES_PASSWORD` when its data volume is created. Changing
  it in Vault does not change the password of an existing database: it must also be
  changed in Postgres (`ALTER USER`), or the volume recreated (`make fclean`).
- The Postgres image trusts connections from inside its own container
  (`127.0.0.1`, without password); connections from other containers need the
  password (`scram-sha-256`).
- `wrapper/vault-exec.sh` parses JSON with `sed`: secret values must not contain
  double quotes or backslashes (generated hex values are fine).
- `~/vault-init.json` holds both the unseal keys and the root token, and the
  bootstrap keeps using the root token to stay idempotent. In production, the keys
  would be split between several people and the root token revoked.
- Traffic between the app and Vault is not encrypted. The subject allows this for
  connections inside the backend (III.3); the secrets themselves are encrypted at rest.
- The WAF image adds CORS headers with permissive default values
  (`Access-Control-Allow-Headers: *` on every response, `Access-Control-Allow-Origin: *`
  on 403 responses). They can be restricted with the image's `CORS_HEADER_*` variables.

### Module of choice: NFC badge login (Major, 2 points)

**What it is:** users log in by tapping an NFC badge (for example their 42 student
card) on a reader built with an ESP32 and an MFRC522 module. In the Settings page, a
logged-in user links or unlinks a badge; on the login page, "Se connecter avec mon
badge" logs them in as soon as they tap it.

**Why we chose it:** at 42, everybody already carries an NFC card. Logging in with it at
a shared kiosk is faster than typing a password, and it makes the project reach outside
the browser: a real physical device talks to the backend.

**Technical challenges:**

- **Hardware and firmware:** the ESP32 reads the card UID over I2C (MFRC522) and prints
  it on its USB serial link (`UID read: <UID>`). It holds no secret.
- **From a USB device to the API:** `webapp/badge-bridge`, on the kiosk PC, reads the
  serial port, checks the UID format and sends each UID to `POST /api/scan` with the
  device token, over HTTPS behind the WAF (the WAF's self-signed certificate is trusted
  with `NODE_EXTRA_CA_CERTS`, certificate checks stay on). At startup it calls
  `POST /api/hello` to check the address and the token.
- **Choosing the transport:** a first version sent the scans over Wi-Fi (HTTPS with a
  certificate pinned in the firmware, NTP, mDNS). The campus Wi-Fi isolates devices and
  blocks mDNS, so the reader could not reach the server: we moved to USB, which works
  on any network and keeps the device token off the device.
- **Pairing a scan with the right browser:** the reader does not know which browser is
  waiting. The browser opens a WebSocket (`/ws`) and starts an action (`pair` or
  `login`); the API answers with a random 128-bit code that the browser sends on the
  socket. The next scan is matched to that action and the result is pushed to that
  browser only. Actions expire after 30 seconds and only one runs at a time.
- **Security:** a card UID is public and can be cloned, so the badge is a login
  shortcut, never a proof on its own:
  - the device authenticates with a shared secret (`X-Device-Token`), compared in
    constant time;
  - the UID is never stored or logged: the database keeps an HMAC-SHA-256 of it with a
    server secret (`BADGE_UID_SECRET`), so a database dump cannot be brute-forced;
  - badge login is only accepted from the kiosk IP (`BADGE_LOGIN_ALLOWED_IPS`), so a
    remote attacker cannot open a login window and wait for someone else's scan;
  - **when the account has 2FA, a badge scan is not enough**: the user still has to
    type the TOTP code. A cloned badge alone never opens a session.

**Value for the project:** a fast login at a shared kiosk, a concrete use of the
student card, and a full chain from a physical device to the web app.

**Why it deserves Major status:** it is a full feature across four layers (embedded C++
firmware, a serial bridge, REST + WebSocket backend, Vue front) with real-time
pairing, its own threat model (cloning, replay, remote hijack of the login window) and
the countermeasures listed above. It is comparable in size to the listed Major modules.

### OAuth 2.0 with 42 (Minor, 1 point)

- "Se connecter avec 42" sends the user to the 42 intranet (authorization code flow),
  then `GET /api/auth/42/callback` exchanges the code for a token and reads the profile.
- The `state` parameter is random, kept in an `httpOnly` cookie for 10 minutes and
  compared in constant time (CSRF protection).
- An account is found by its 42 id, or created with the 42 login as username. It is
  never attached to a local account only because the email matches, since emails are
  not verified at signup.
- Errors come back to the login page as `?oauth_error=...` and are shown to the user.

### Two-factor authentication with TOTP (Minor, 1 point)

- **Standard:** TOTP (RFC 6238), the codes of Google Authenticator, FreeOTP, etc.:
  HMAC-SHA1 of the current 30-second step, truncated to 6 digits. The computation is
  written by hand in `webapp/backend/src/utils/totp.js` with Node's `crypto` module and
  tested against the RFC test vectors (`tests/unit/totp.test.js`).
- **Activation (Settings):** the API creates a random 160-bit secret and the front shows
  it as a QR code (`otpauth://` link) and as text. 2FA is only turned on after a first
  valid code, which proves the secret was scanned. Turning it off also needs a code.
- **Login:** password, 42 and badge logins all end in `openSessionOrAskCode`. With 2FA
  on, no session is created: the API keeps a pending login for 5 minutes (random token
  in an `httpOnly` cookie) and the front asks for the code
  (`POST /api/auth/2fa/verify`). The session is only opened with a valid code.
- **Protections:** one step of clock drift accepted each way; a code that was already
  used is refused (`totp_last_step`, updated with a conditional `UPDATE` so that two
  simultaneous requests cannot both use it); 5 wrong codes cancel the pending login;
  the 2FA routes are rate limited.

### Public API with a secured API key (Major, 2 points)

**What it is:** besides the browser session, every account can create personal API
keys and call the API from a script or a third-party client with
`Authorization: Bearer <key>`. 15 endpoints accept a key: health, the user directory
and profiles, reading and updating one's own account, friends and messages (full list
in `webapp/backend/README.md`, section "Public API").

**Secured API key:**

- A key is `trk_` followed by 256 random bits (base64url). It is shown **once**, when
  it is created; the database only keeps its SHA-256 hash and a 12-character prefix to
  recognise it in the list. A database dump gives no usable key.
- Keys are created, listed and revoked only from a logged-in browser session
  (`/api/keys`), at most 10 per account (checked under a row lock, so two parallel
  requests cannot exceed it). Revocation is immediate; `lastUsedAt` shows when a key
  was last used.
- Routes that touch the account's security are **session only**: creating keys,
  linking a badge, managing 2FA, deleting the account. A stolen key can read and write
  the owner's data, but cannot spread to new keys, lock the owner out or delete the
  account.
- When an `Authorization` header is present it is the only credential looked at. An
  invalid, revoked or malformed key answers `401` on every route instead of silently
  falling back to the cookie or to an anonymous request, so a script learns at once
  that its key is wrong.

**Rate limiting:** 60 requests per minute per key, on top of the per-route limits
(for example 30 messages per minute per user). Responses carry the standard
`RateLimit-*` headers, and `429` comes with `Retry-After`.

**Documentation:** `webapp/backend/README.md` describes every route: body and query
rules, status codes, the order in which checks are made, error messages, limits. The
request collection `webapp/backend/requests/api.http` runs the whole flow, key
creation and use included.

### User interactions: profiles, friends and chat (Major, 2 points)

**Profiles:** `GET /api/users` lists every account (paginated, with the total in the
same SQL query), `GET /api/users/:id` shows a public profile. When the caller is
logged in, the profile carries `relation` (`self`, `friends`, `request-sent`,
`request-received`, `none`), so the front knows which button to show. Only the owner
can edit their username and email (`PUT` / `PATCH`), or delete their account.

**Friends:** send a request, accept or decline it, cancel it, remove a friend, list
friends and pending requests (`/api/friends`). A friendship is **one row per pair of
users**, whatever the direction, protected by a unique index on the ordered pair:
the database itself refuses a duplicate, even for two requests sent at the same
instant. When both users ask each other, the second request accepts the first
instead of creating a new one.

**Chat:** direct messages between friends (`/api/messages`): the list of
conversations with their last message, and the history of one conversation. Only
friends can write to each other; the history stays readable after the friendship
ends. The history is paginated by cursor on `(created_at, id)` with `after` and
`before` instead of an offset, so new messages never shift the pages, and the front
polls `after=<last message>` to get the new ones. Sending is limited to 30 messages per
minute per user.

**Integrity:** deleting an account removes its friendships and messages by cascade;
every rule that could race (unique pair, key limit, unique username and email) is
enforced by the database, not by a check made before the write.

TODO (team): front pages for profiles, friends and chat.

## Individual Contributions

TODO (team): each member's contributions.

- **anpicard**:
  - Login page, signup page, settings page and 2FA pages in Vue (`webapp/frontend`), and
    the `app` service that serves them.
  - 42 OAuth and badge reader, first in a standalone server, then ported into the team API
    with lucnavar (`webapp/backend`), who reviewed and hardened them.
  - 2FA (TOTP) in the API and in the front.
  - ESP32 firmware (branch `Firmware_ESP32_Anto`) and the USB bridge.
  - **Challenges:** the campus Wi-Fi isolates devices and blocks mDNS, so the Wi-Fi reader
    could not find the server: solved by moving to USB. A badge UID can be cloned:
    solved by treating the badge as a shortcut protected by 2FA, the device token and the
    kiosk IP restriction.
- **lucnavar** (tech lead): architecture of the backend and the database, and the
  API in `webapp/backend`.
  - Express 5 API on PostgreSQL 17 with plain SQL: layers (routes, controllers,
    services), validation of every request with zod, one error format, numbered
    migrations, and the test suites (`node:test`, with and without a database).
  - Accounts and sessions: registration, login by username or email (argon2id),
    sessions stored as hashes, rate limits on login and registration.
  - 42 OAuth and badge reader routes in the team API, from anpicard's standalone
    server.
  - Public API with API keys, profiles, friends and direct messages.
  - The `api` and `db` services in `contbuild/`, and the backend documentation
    (`webapp/backend/README.md`, `requests/api.http`).
  - **Challenges:**
    - Two users can send each other a friend request at the same moment. Checking
      first and inserting after would leave a race window: the pair is stored once,
      under a unique index on the ordered pair, and a crossed request accepts the
      pending one.
    - Paginating a conversation that keeps growing: an offset shifts as soon as a
      message arrives, so the history uses a cursor on `(created_at, id)`. The front
      must also not move its cursor to its own sent message, or it would skip a
      message from the friend sent just before.
    - A key and a cookie on the same request: a wrong key falling back to the cookie
      would hide the error from a script. The header always wins, and an invalid one is
      a `401` everywhere.
- **allefran**: Cybersecurity module (WAF configuration and tests, Vault setup,
  bootstrap script, app integration through `vault-exec.js`, isolation tests,
  single-command startup in the Makefile). Challenges:
  - The WAF logged attacks but did not block them: the Compose file still said
    `DetectionOnly`. Lesson: check the configuration Docker really uses
    (`docker compose config`, `docker inspect`), not the file in the editor.
  - Requests failed right after `docker compose up` (`SSL_ERROR_SYSCALL`): nginx was
    not ready yet. The tests now wait for the container to be healthy.
  - The audit log copied request and response bodies, including passwords. Removing
    the body parts (`MODSEC_AUDIT_LOG_PARTS=ABJDFHZ`) fixed most of it; the copy of
    the matched value in `data`/`match` remains and is documented above.
  - `vault status` exits with code 2 when Vault is sealed. With `set -o pipefail`,
    this silently broke the unseal step of the bootstrap script; the status is now
    captured with `|| true` before being tested.
  - With several Compose files, the first one sets the project directory and name.
    The order was chosen so that the Vault data volume stays the same.
  - A fresh clone has no TLS certificate (it is ignored by Git): `make` now creates
    one, readable by the nginx user of the container.

## Resources

- OWASP CRS documentation: https://coreruleset.org/docs/
- OWASP ModSecurity CRS Docker image: https://github.com/coreruleset/modsecurity-crs-docker
- ModSecurity v3 reference manual: https://github.com/owasp-modsecurity/ModSecurity/wiki
- HashiCorp Vault documentation (AppRole, KV v2, seal/unseal): https://developer.hashicorp.com/vault/docs
- Docker Compose documentation (merging files, `COMPOSE_FILE`): https://docs.docker.com/compose/

