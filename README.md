*This project has been created as part of the 42 curriculum by allefran, fdeleard, lucnavar, anpicard, tmarion.*

# ft_transcendence

## Description

TODO (team): project name and goal.

ft_transcendence is a web application where users create an account with an email
and a password, and can link a physical RFID badge to their account. The badge is
read by an ESP32 device; once linked, it can be used to log in without typing a
password.

Key features:

- Sign up and log in with email and password (bcrypt-hashed passwords, server-side sessions).
- Link, check and unlink an RFID badge from the settings page.
- Log in by scanning a linked badge, with real-time feedback over WebSocket.
- HTTPS only, behind a Web Application Firewall, with secrets stored in Vault.

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

1. **Configuration files.** Copy the three example files and fill in real values.
   They are ignored by Git, and `make` stops with a message if one is missing.

   ```sh
   cp contbuild/.env.example contbuild/.env
   # edit contbuild/.env: POSTGRES_*, CORS_ORIGIN (https://localhost:8443), ...
   cp cybersecurity/vault/secrets/app.env.example cybersecurity/vault/secrets/app.env
   # edit cybersecurity/vault/secrets/app.env: SESSION_SECRET, DEVICE_TOKEN
   cp cybersecurity/vault/secrets/backend.env.example cybersecurity/vault/secrets/backend.env
   # edit cybersecurity/vault/secrets/backend.env: DEVICE_TOKEN, BADGE_UID_SECRET, FORTYTWO_CLIENT_SECRET
   ```

   - `contbuild/.env` holds the configuration: it is read by Compose (database
     credentials) and by the `api` and `db` services. The `app` service does not read
     it, and the API ignores the secrets written there (`DEVICE_TOKEN`,
     `BADGE_UID_SECRET`, `FORTYTWO_CLIENT_SECRET`): leave them empty.
   - `cybersecurity/vault/secrets/*.env` are only read by the bootstrap script, which
     loads them into Vault. The app and the API get their secrets from Vault.
     `DEVICE_TOKEN` must be the same in `app.env` and `backend.env`.

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

- **Frontend:** static HTML pages with plain JavaScript (`webapp/frontend/public/`).
  TODO (team): CSS framework or styling solution (required by the subject, III.3).
- **Backend:** Node.js 22 with **Express 5** (`infra/app.js`, `webapp/routes/`).
  - `express-session`: server-side sessions; the session id is regenerated at login.
  - `bcrypt`: password hashing (cost 10).
  - `ws`: WebSocket server, used for the badge pairing and badge login feedback.
- **Database:** **SQLite** through `better-sqlite3` (`infra/db.js`).
  TODO (team): why SQLite was chosen.
- **Device:** an ESP32 with an RFID reader calls `/badge/hello` and `/badge/scan`,
  authenticated with a shared device token (`DEVICE_TOKEN`, compared in constant time).
- TODO (team): justification of the major technical choices.

Security layer:

- **nginx + ModSecurity v3 + OWASP CRS 4.25** (`owasp/modsecurity-crs:4.25-nginx-lts`):
  maintained image with a well-known rule set, configured through environment variables.
- **HashiCorp Vault 2.1** (`hashicorp/vault:2.1.2`): secrets storage, encrypted at rest,
  with per-service access through AppRole.

## Database Schema

SQLite database created by `infra/db.js`, with foreign keys enabled.

```
users                                badges
+---------------+---------+          +-----------+---------+
| id            | INTEGER | PK  <----| user_id   | INTEGER | FK -> users.id, UNIQUE, ON DELETE CASCADE
| email         | TEXT    | UNIQUE   | id        | INTEGER | PK
| password_hash | TEXT    |          | uid_hash  | TEXT    | UNIQUE
+---------------+---------+          +-----------+---------+
```

- `users`: one row per account. Only the bcrypt hash of the password is stored.
- `badges`: at most one badge per user (`user_id` is unique) and one user per badge
  (`uid_hash` is unique). Only a hash of the badge UID is stored. Deleting a user
  deletes their badge link.

## Features List

TODO (team): which member(s) worked on each feature.

| Feature | Description |
|---|---|
| Sign up | `POST /auth/signup`: validates the email format and a password of at least 8 characters, stores a bcrypt hash. |
| Log in / session | `POST /auth/login`, `GET /auth/me`: checks the credentials and opens a session (session id regenerated). |
| Badge pairing | `POST /pairing/start`: opens a 30 s window; the next scanned badge is linked to the logged-in user. |
| Badge login | `POST /badge-login/start`, `POST /badge-login/confirm`: opens a 30 s window; scanning a linked badge gives a one-time token, exchanged for a session. |
| Badge status / unlink | `GET /badge/status`, `POST /badge/unlink`: shows or removes the user's badge link. |
| Real-time feedback | WebSocket attached to a pending pairing or login action, only after it proves it knows the action's code. |
| Device endpoints | `POST /badge/hello`, `POST /badge/scan`: used by the ESP32, protected by `DEVICE_TOKEN`. |
| WAF and Vault | See the Cybersecurity module below. |

## Modules

| Module | Type | Points | Member(s) |
|---|---|---|---|
| Cybersecurity: WAF/ModSecurity (hardened) + HashiCorp Vault for secrets | Major | 2 | allefran |
| TODO (team): other modules | | | |

### Cybersecurity: WAF/ModSecurity + Vault

**Why:** every request reaches the app through a strict WAF, and no secret is stored
in the image, in the Compose files or in Git.

**Architecture:**

```
                                                     /api/..., /ws
browser --HTTPS:8443--> nginx + ModSecurity (WAF) ----------------> api:3000 --> db:5432
                                                 \                     \
                                                  \ everything else     \ (vault-net)
                                                   `--------> app:3000 --+--> vault:8200
```

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
- One AppRole and one read-only policy per service
  (`policies/app-read.hcl` gives read access to `secret/data/app/*` only).
- `scripts/bootstrap.sh` is idempotent: it initializes Vault only once, unseals it,
  enables KV v2 and AppRole, writes the policies and roles, and loads
  `secrets/<service>.env` into `secret/<service>/app`.
- The app and the API start through `wrapper/vault-exec.js`: it logs in with the
  service's AppRole credentials (mounted read-only from `vault/run/app/` or
  `vault/run/backend/`), reads its secrets (`secret/app/app` or `secret/backend/app`)
  and starts the real command with them in its environment. The values never appear
  in `docker inspect` or in the image. For the API, the secret keys are also emptied
  in the Compose file, so a value left in `contbuild/.env` never reaches the container.

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
- The database password is still in `contbuild/.env`: the `db` service and the
  `DATABASE_URL` of the API get it from Compose, so it is visible in `docker inspect`.
- `~/vault-init.json` holds both the unseal keys and the root token, and the
  bootstrap keeps using the root token to stay idempotent. In production, the keys
  would be split between several people and the root token revoked.
- Traffic between the app and Vault is not encrypted. The subject allows this for
  connections inside the backend (III.3); the secrets themselves are encrypted at rest.
- The WAF image adds CORS headers with permissive default values
  (`Access-Control-Allow-Headers: *` on every response, `Access-Control-Allow-Origin: *`
  on 403 responses). They can be restricted with the image's `CORS_HEADER_*` variables.

## Individual Contributions

TODO (team): each member's contributions.

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

