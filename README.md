*This project has been created as part of the 42 curriculum by allefran, fdeleard, lucnavar, anpicard, tmarion.*

# ft_transcendence

## Description

TODO (team): project name, goal and key features.

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

1. **Secrets.** Copy the example file and fill in real values. The `.env` file is
   ignored by Git; it is only read by the bootstrap script, which loads it into Vault.

   ```sh
   cp cybersecurity/vault/secrets/app.env.example cybersecurity/vault/secrets/app.env
   # edit cybersecurity/vault/secrets/app.env: SESSION_SECRET, DEVICE_TOKEN
   ```

2. **TLS certificate** (self-signed, for local development; ignored by Git):

   ```sh
   openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
     -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
     -keyout cybersecurity/waf/certs/server.key \
     -out cybersecurity/waf/certs/server.crt
   ```

3. **Start everything** with a single command:

   ```sh
   make
   ```

   `make` starts Vault, runs `cybersecurity/vault/scripts/bootstrap.sh`
   (init on first run, unseal, configuration, secrets loading), then builds and
   starts the app and the WAF.

4. Open **https://localhost:8443** (accept the self-signed certificate).
   The app port (3000) is not published: the WAF is the only entry point.

On the first run, the bootstrap writes the Vault unseal keys and root token to
`~/vault-init.json` (mode 600, outside the repository). Keep this file: without it,
Vault cannot be unsealed after a restart.

### Other commands

| Command | Effect |
|---|---|
| `make stop` / `make clean` | Stop and remove the containers. The Vault data volume is kept. |
| `make re` | `clean` then `make` |
| `make a_wish` | Show images, containers and app logs |
| `bash cybersecurity/waf/tests/waf-app-test.sh` | WAF tests against the running app |

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

TODO (team): frontend, backend, database and justification.

Security layer:

- **nginx + ModSecurity v3 + OWASP CRS 4.25** (`owasp/modsecurity-crs:4.25-nginx-lts`):
  maintained image with a well-known rule set, configured through environment variables.
- **HashiCorp Vault 2.1** (`hashicorp/vault:2.1.2`): secrets storage, encrypted at rest,
  with per-service access through AppRole.

## Database Schema

TODO (team).

## Features List

TODO (team).

## Modules

| Module | Type | Points | Member(s) |
|---|---|---|---|
| Cybersecurity: WAF/ModSecurity (hardened) + HashiCorp Vault for secrets | Major | 2 | <login> |
| TODO (team): other modules | | | |

### Cybersecurity: WAF/ModSecurity + Vault

**Why:** every request reaches the app through a strict WAF, and no secret is stored
in the image, in the Compose files or in Git.

**Architecture:**

```
browser --HTTPS:8443--> nginx + ModSecurity (WAF) --HTTP--> app:3000 --HTTP--> vault:8200
                         (only published port)           (default net)   (internal vault-net)
```

**WAF (`cybersecurity/docker-compose.yml`, `cybersecurity/waf/`):**

- `MODSEC_RULE_ENGINE=On`: attacks are blocked (403), not only logged.
- `BLOCKING_PARANOIA=2`: stricter than the default level 1. The detection level
  follows the blocking level (CRS rule 901125), so it is also 2.
- `ALLOWED_METHODS=GET HEAD POST PUT PATCH DELETE OPTIONS`: any other method is
  refused (CRS rule 911100). `TRACE` is refused by nginx itself (405).
- Local rule `10001` (`waf/rules/before-crs.conf`): blocks `/.env` and `/.git`
  paths, case-insensitive.
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
- The app starts through `wrapper/vault-exec.js`: it logs in with its AppRole
  credentials (mounted read-only from `vault/run/app/`), reads its secrets and starts
  `npm start` with them in its environment. The values never appear in
  `docker inspect` or in the image.

**Tests:** `waf/tests/waf-test.sh` (WAF alone, with the `whoami` test backend) and
`waf/tests/waf-app-test.sh` (integrated app): legitimate traffic must pass, SQL
injection, XSS, path traversal, command injection, scanner user agents and access to
sensitive files must be blocked.

**Known limitations:**

- ModSecurity copies the matched value into the `data` and `match` fields of the
  audit log. A password that triggers a rule therefore appears in the logs.
- Paranoia level 2 has false positives on some free text (for example
  "select ... from", "--", "1 OR 2") and on passwords with many symbols. Targeted
  exclusions are still to be written for the real fields.
- The certificate is self-signed (development only).
- `~/vault-init.json` holds both the unseal keys and the root token, and the
  bootstrap keeps using the root token to stay idempotent. In production, the keys
  would be split between several people and the root token revoked.
- Traffic between the app and Vault is not encrypted. The subject allows this for
  connections inside the backend (III.3); the secrets themselves are encrypted at rest.

## Individual Contributions

TODO (team): each member's contributions.

- <login>: Cybersecurity module (WAF configuration and tests, Vault setup, bootstrap
  script, app integration through `vault-exec.js`, single-command startup in the
  Makefile). Challenges: TODO.

## Resources

- OWASP CRS documentation: https://coreruleset.org/docs/
- OWASP ModSecurity CRS Docker image: https://github.com/coreruleset/modsecurity-crs-docker
- ModSecurity v3 reference manual: https://github.com/owasp-modsecurity/ModSecurity/wiki
- HashiCorp Vault documentation (AppRole, KV v2, seal/unseal): https://developer.hashicorp.com/vault/docs
- Docker Compose documentation (merging files, `COMPOSE_FILE`): https://docs.docker.com/compose/

