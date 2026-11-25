# Authentication modules (anpicard)

Text to merge into the **Modules**, **Features List** and **Individual Contributions**
sections of the README.

## Modules table rows

| Module | Type | Points | Member(s) |
|---|---|---|---|
| Module of choice: NFC badge login (ESP32 reader) | Major | 2 | anpicard |
| Remote authentication with OAuth 2.0 (42) | Minor | 1 | anpicard (API port: Lucas) |
| Complete 2FA system (TOTP) | Minor | 1 | anpicard |

## Module of choice: NFC badge login (Major, 2 points)

**What it is:** users log in by tapping an NFC badge (for example their 42 student
card) on a reader built with an ESP32 and an MFRC522 module. In the Settings page, a
logged-in user links or unlinks a badge; on the login page, "Se connecter avec mon
badge" logs them in as soon as they tap it.

**Why we chose it:** at 42, everybody already carries an NFC card. Logging in with it at
a shared kiosk is faster than typing a password, and it makes the project reach outside
the browser: a real physical device talks to the backend.

**Technical challenges:**

- **Hardware and firmware:** the ESP32 reads the card UID over I2C (MFRC522) and sends
  it to the API. Over Wi-Fi it uses HTTPS with the server certificate pinned in the
  firmware (`setCACert`, no `setInsecure`), with the clock synced by NTP so that the
  certificate dates can be checked. It finds the server with mDNS.
- **Networks that isolate devices:** the campus Wi-Fi blocks mDNS and device-to-device
  traffic. We added a second transport: the ESP32 is plugged into the kiosk PC over
  USB and `webapp/badge-bridge` reads the UIDs on the serial port and sends them to the
  same `POST /api/scan` route. The backend does not depend on the transport.
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

## OAuth 2.0 with 42 (Minor, 1 point)

- "Se connecter avec 42" sends the user to the 42 intranet (authorization code flow),
  then `GET /api/auth/42/callback` exchanges the code for a token and reads the profile.
- The `state` parameter is random, kept in an `httpOnly` cookie for 10 minutes and
  compared in constant time (CSRF protection).
- An account is found by its 42 id, or created with the 42 login as username. It is
  never attached to a local account only because the email matches, since emails are
  not verified at signup.
- Errors come back to the login page as `?oauth_error=...` and are shown to the user.

## Two-factor authentication with TOTP (Minor, 1 point)

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

## Features list rows

| Feature | Member(s) | Description |
|---|---|---|
| Login page | anpicard | Email or username + password, 42 login, badge login, input validation in the front and in the API |
| 2FA | anpicard | Settings section with QR code, code step on every login method |
| Badge settings | anpicard | Link and unlink a badge in real time (WebSocket) |
| Badge USB bridge | anpicard | Serial-to-API bridge for the kiosk PC |
| Front server | anpicard | `app` service: serves the Vue front, relays `/api` and `/ws` |

## Individual contributions (anpicard)

- Login page, signup page, settings page and 2FA pages in Vue (`webapp/frontend`), and
  the `app` service that serves them.
- 42 OAuth and badge reader, first in a standalone server, then ported into the team API
  with Lucas (`webapp/backend`), who reviewed and hardened them.
- 2FA (TOTP) in the API and in the front.
- ESP32 firmware (separate branch `Firmware_ESP32_Anto`) and the USB bridge.
- **Challenges:** the campus Wi-Fi isolates devices and blocks mDNS, so the reader could
  not find the server: solved with the USB transport. A badge UID can be cloned:
  solved by treating the badge as a shortcut protected by 2FA, the device token and the
  kiosk IP restriction.

## Setup notes for the Instructions section

In `contbuild/.env`:

- `FORTYTWO_CLIENT_ID`, `FORTYTWO_CLIENT_SECRET`: from the application created on the 42
  intranet (Settings > API).
- `FORTYTWO_REDIRECT_URI`: `https://localhost:8443/api/auth/42/callback` behind the WAF
  (`http://localhost:3000/api/auth/42/callback` without it); it must be listed, exactly,
  in the Redirect URI field of the intranet application.
- `FRONT_URL`: address of the site, where the API sends the user back after a 42 login.
- `DEVICE_TOKEN`: same value as in the firmware `secrets.h` and in the bridge `.env`.
- `BADGE_UID_SECRET`: at least 32 characters (`openssl rand -hex 32`).
- `BADGE_LOGIN_ALLOWED_IPS`: IP of the kiosk PC, as seen by the API.

Badge reader over USB, on the kiosk PC:

```bash
cd webapp/badge-bridge
cp .env.example .env    # then fill in SERIAL_PORT, API_URL, DEVICE_TOKEN
npm install
npm start
```

## Known limitations

- Badge and pending 2FA logins are kept in the memory of the API process: a restart
  cancels them (the user simply starts again), and the API must run as one process.
- Only one badge action (pairing or login) can run at a time.
- If someone else taps a badge during the 30 seconds of a pairing, their badge is linked
  to the account: pairing needs to be done at the reader.
