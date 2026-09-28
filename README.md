*This project has been created as part of the 42 curriculum by [login1], [login2], [login3], [login4].*

# ft_transcendence

## Description

ft_transcendence is a real-time multiplayer Pong web application built as the final common-core project at 42. Beyond the mandatory game, the team implements a set of optional modules covering user management, security and hardware integration.

Key features of the part covered in this document (see [Modules](#modules) below for point breakdown):

- Email/password authentication with server-side sessions.
- Physical NFC badge login (custom ESP32 hardware reader) as a Module of choice.
- 42 OAuth login *(planned)*.
- Two-factor authentication (TOTP) *(planned)*.
- HTTPS on all connections to the backend, including from the ESP32 badge reader.

[TODO: complete this section with the game itself and any other module implemented by the rest of the team.]

## Instructions

### Prerequisites

- Node.js (v18+) and npm.
- A modern browser (Chrome recommended, per subject requirements).
- For the NFC badge feature: an ESP32 board flashed with the firmware from the `Firmware_ESP32_Anto` branch, and an MFRC522 RFID reader.

### Setup

```bash
git clone https://github.com/antoninpicard/ft_transcendence.git
cd ft_transcendence
npm install
```

Create `infra/.env` from the example file and fill in the values:

```bash
cp infra/.env.example infra/.env
```

| Variable         | Description                                              |
|------------------|------------------------------------------------------------|
| `SESSION_SECRET` | Secret used to sign session cookies.                       |
| `PORT`           | Port the server listens on (default `3000`).                |
| `DEVICE_TOKEN`   | Shared secret the ESP32 badge reader must send in `X-Device-Token`. |

The server runs over HTTPS using a self-signed certificate (`infra/certs/`, issued for `transcendence.local`). The first connection will trigger a browser warning ("not secure" / "your connection is not private") — this is expected with a self-signed cert and can be bypassed ("Advanced" → "Proceed").

### Running

```bash
npm start
```

The server starts at `https://localhost:3000` (or `https://transcendence.local:3000` — the server announces itself over mDNS so the ESP32 badge reader can find it on the local network without a hardcoded IP).

[TODO: add instructions for whatever the rest of the team builds (game server, other services, Docker setup if the team adds one, etc.).]

## Resources

- [MDN — WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Express session documentation](https://expressjs.com/en/resources/middleware/session.html)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [multicast-dns (npm)](https://www.npmjs.com/package/multicast-dns)
- [MFRC522 RFID reader documentation](https://github.com/miguelbalboa/rfid)

**AI usage**: Claude (Anthropic) was used as a pair-programming assistant throughout this part of the project (login, sessions, badge NFC feature, HTTPS). It was used to: explain Node.js/Express/WebSocket concepts to a developer new to this stack (JavaScript beginner, background in C/C++); scaffold and directly write the `infra/` layer (a stand-in for infrastructure normally owned by the team's shared server — session/WebSocket/mDNS setup, database connection); review implemented code for security issues (an AI-assisted code review found and led to fixes for session fixation, a WebSocket token race condition, a fail-open device-token check, and CSRF exposure). All logic under `webapp/` (routes, authentication, badge pairing business logic, frontend) was written by hand by the author after being walked through the concepts, specifically so it could be defended line by line during evaluation.

[TODO: each teammate should add their own AI usage disclosure for their part.]

## Team Information

[TODO — fill in for each team member:]

| Login | Role(s) | Responsibilities |
|-------|---------|-------------------|
| [login1] | | |
| [login2] | | |
| [login3] | | |
| [login4] | | |

## Project Management

[TODO: task distribution method, meetings cadence, PM tool (GitHub Issues / Trello / etc.), communication channel (Discord / Slack / etc.).]

## Technical Stack

- **Backend**: Node.js + Express.
- **Database**: SQLite (`better-sqlite3`) — lightweight, zero-config, file-based, sufficient for the project's scale and easy to inspect/reset during development.
- **Sessions**: `express-session`, cookie-based, `httpOnly` + `sameSite: strict` + `secure` (HTTPS-only cookies).
- **Real-time**: `ws` (WebSocketServer) — used to push live badge-pairing/login status to the browser without polling.
- **Security**: `helmet` (standard HTTP security headers), `bcrypt` (password hashing), TLS via a self-signed certificate.
- **Hardware**: ESP32 (Arduino framework) + MFRC522 RFID reader for the NFC badge module; discovered on the local network via mDNS (`multicast-dns`), authenticated via a shared device token.
- **Frontend**: plain HTML/CSS/JavaScript for the parts covered here (login/signup/settings pages).

[TODO: complete with the frontend framework and any other stack decision made by the rest of the team.]

## Database Schema

The schema below covers the tables owned by the authentication/badge part of the project (`infra/db.js`):

```
users
├── id             INTEGER PRIMARY KEY AUTOINCREMENT
├── email          TEXT UNIQUE NOT NULL
├── password_hash  TEXT NOT NULL            -- bcrypt hash, never the plaintext password
└── created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

badges
├── id             INTEGER PRIMARY KEY AUTOINCREMENT
├── uid_hash       TEXT UNIQUE NOT NULL     -- SHA-256 hash of the badge's physical UID
├── user_id        INTEGER NOT NULL         -- FOREIGN KEY -> users(id)
└── created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

One badge can be linked to at most one account at a time (`uid_hash UNIQUE`), and one account can have at most one badge linked (enforced in application code, see `webapp/routes/pairing.js`). The badge UID is hashed rather than stored in the clear because the physical UID on this class of card is not a secret (it can be read or cloned by any nearby reader) — the badge is a convenience login shortcut, never sole proof of identity.

[TODO: add tables owned by the rest of the team (game, chat, tournaments, etc.).]

## Features List

- **Signup / Login (email + password)** — `webapp/routes/auth.js`. Server-side email format and password-length validation, `bcrypt` password hashing, rate-limited against brute force. *(Antonin)*
- **Sessions** — cookie-based session, regenerated on login to prevent session fixation. *(Antonin)*
- **NFC badge pairing** — link a physical badge to a logged-in account via a live WebSocket status update (`webapp/routes/pairing.js`, `webapp/public/script/settings.js`). *(Antonin)*
- **NFC badge login** — log in by scanning a paired badge instead of typing credentials (`webapp/public/script/badge-login.js`). *(Antonin)*
- **Badge settings screen** — view link status, link or unlink a badge (`webapp/public/settings.html`). *(Antonin)*
- **HTTPS** — all connections to the backend (browser and ESP32 device) go over TLS. *(Antonin)*
- OAuth 42 login *(planned)*. *(Antonin)*
- 2FA TOTP *(planned)*. *(Antonin)*

[TODO: add features implemented by the rest of the team.]

## Modules

| Module | Type | Points | Status |
|--------|------|--------|--------|
| NFC Badge Login (Module of choice) | Major | 2 | Done |
| 42 OAuth login | Minor | 1 | Planned |
| Two-factor authentication (TOTP) | Minor | 1 | Planned |

[TODO: add modules implemented by the rest of the team, and update the total.]

### NFC Badge Login — Module of choice (Major, 2 points)

**Why this module.** None of the modules listed in the subject cover physical/hardware authentication. Building a real NFC badge reader (ESP32 + MFRC522) that talks to the web app turns the project into something that spans embedded firmware, networking and web security, rather than staying entirely inside the browser/server boundary — which is why it was chosen as the Module of choice instead of picking another purely web-based Minor/Major.

**Technical challenges addressed.**
- *Discovery without a fixed IP*: the ESP32 cannot be reflashed in front of an evaluator on a different network each time, so the server address can't be hardcoded. Solved with an mDNS responder (`infra/mdns.js`) — the server announces itself as `transcendence.local`, and the firmware resolves that hostname at runtime.
- *Device authentication*: any device on the same network could otherwise POST fake badge scans. Every request from the ESP32 carries a shared secret (`X-Device-Token`), checked with a constant-time comparison (`crypto.timingSafeEqual`) to avoid timing side-channels, with a startup assertion so the check cannot silently fail open if the secret is unset.
- *Linking a physical scan to a browser session with no display/keyboard on the device*: the firmware has no way to show a code or accept input. The chosen design instead opens a WebSocket from the browser, has the server hold a single global "pending pairing/login" slot (only one physical reader exists, so only one badge action can be in flight at a time), and pushes a live status update over the socket the instant the ESP32 posts a scan — no polling, no code to type on the device side.
- *Badge cloning*: the UID on this class of RFID tag is not a secret — it can be copied with an off-the-shelf writer (tested). The badge is therefore treated strictly as a login *convenience*, never as sole proof of identity, and the UID is stored as a SHA-256 hash rather than in the clear so a database leak alone doesn't expose usable UIDs.
- *Session-hijack via the pairing WebSocket*: an attacker could otherwise open a competing WebSocket connection and race the legitimate one to claim the pairing. Fixed by requiring the client to echo a one-time code (returned only over the already-authenticated HTTPS `POST /api/pairing/start` response) as the first message on the socket before the server trusts it.
- *Transactional badge re-linking*: linking a badge that's already tied to another account must not silently delete the previous owner's link if the new insert fails. The unlink-then-relink is wrapped in a single SQLite transaction so it's all-or-nothing.

**Value added to the project.** It gives the app a login method that doesn't exist in any browser and can't be replicated by just writing more frontend/backend code — a tangible, physical demonstration during evaluation (scan a badge, watch the login happen live) that few other groups will have.

**Why it deserves Major status.** It required building and flashing separate embedded firmware (C++/Arduino) in addition to the web application, implementing a custom network discovery protocol (mDNS) instead of a hardcoded config, designing a novel pairing protocol to work around the device's lack of I/O, and addressing several non-trivial security properties specific to physical credentials (cloning, device spoofing, race conditions) that have no equivalent in the other catalog modules.

## Individual Contributions

### Antonin

- Email/password authentication (signup, login, server-side validation, session management).
- NFC badge login module: ESP32 + MFRC522 firmware, mDNS discovery, device authentication, pairing/login protocol, settings screen.
- HTTPS setup for the backend.
- 42 OAuth and 2FA TOTP *(planned)*.

**Challenges faced**: designing a pairing protocol for a device with no display or keyboard (see the Module of choice section above); a security review surfaced session fixation, a WebSocket token race and a fail-open device-token check, all fixed and re-tested against the real hardware.

[TODO: add each teammate's individual contributions section.]
