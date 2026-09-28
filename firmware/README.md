# NFC Badge Reader (ESP32) — Module of Choice

## Description

Custom hardware badge reader for ft_transcendence: an ESP32 with an MFRC522 RFID reader lets a user link a physical badge to their account and then log in by scanning it, instead of typing credentials. This directory contains the firmware only — the web application it talks to lives on the `Webapp_Anto` branch (`infra/` + `webapp/`).

## Hardware

- ESP32 dev board
- MFRC522 RFID/NFC reader (I2C, address `0x28`), wired on pins 21/22 (`Wire.begin(21, 22)`)
- Any MIFARE-compatible NFC badge/card

## Prerequisites

- Arduino IDE (or PlatformIO) with the ESP32 board package installed
- Libraries: `MFRC522_I2C`, `ESPmDNS`, `HTTPClient`, `WiFiClientSecure` (bundled with the ESP32 core)
- The backend server running and reachable on the same local network (see `Webapp_Anto` branch)

## Setup

1. Copy `secrets.h.example` to `secrets.h` and fill in your WiFi credentials and `DEVICE_TOKEN` (must match `DEVICE_TOKEN` in the server's `infra/.env`). `secrets.h` is gitignored — never commit it.
2. `ca_cert.h` contains the backend's self-signed TLS certificate, pinned so the firmware only trusts that exact certificate (see the "Why Major" section below). It's already checked in — no setup needed unless the server's certificate is regenerated, in which case this file must be regenerated to match.
3. Flash `esp32_rfid.ino` to the board.

## How it works

1. On boot, the ESP32 connects to WiFi, syncs its clock over NTP (needed for TLS certificate validation — the board has no battery-backed RTC), and resolves the backend's address via mDNS (`transcendence.local`) instead of a hardcoded IP.
2. It sends an HTTPS `POST /api/hello` to announce itself, authenticated with `X-Device-Token`.
3. On every badge scan, it reads the UID and sends it via HTTPS `POST /api/scan`. The backend decides what that scan means (pairing a badge to an account, or logging someone in) — the firmware itself has no notion of "pairing" or "login", it just reports UIDs.
4. If a request fails, it re-resolves the server's IP via mDNS before retrying (handles the backend restarting with a new IP).

## Module of Choice — Justification

**Why this module.** None of the modules listed in the subject cover physical/hardware authentication. Building a real NFC badge reader that talks to the web app turns the project into something that spans embedded firmware, networking and web security, rather than staying entirely inside the browser/server boundary — which is why it was chosen as the Module of choice instead of picking another purely web-based Minor/Major.

**Technical challenges addressed.**
- *Discovery without a fixed IP*: the ESP32 cannot be reflashed in front of an evaluator on a different network each time, so the server address can't be hardcoded. Solved with mDNS — the server announces itself as `transcendence.local`, and the firmware resolves that hostname at runtime, re-resolving automatically if a request ever fails.
- *Device authentication*: any device on the same network could otherwise POST fake badge scans. Every request from the ESP32 carries a shared secret (`X-Device-Token`), checked server-side with a constant-time comparison to avoid timing side-channels.
- *Encrypting a device with no display or keyboard*: TLS on a microcontroller with no user interface has its own problems. The backend uses a self-signed certificate (no public CA involved), so the firmware pins that exact certificate as its trusted root (`ca_cert.h`) rather than skipping validation with `setInsecure()` — a MITM presenting any other certificate, even a valid one from a real CA, gets rejected. This required solving a second, less obvious problem: certificate validity-date checking needs a roughly correct clock, and the ESP32 boots at 1970 with no RTC — solved with an NTP time sync before any HTTPS request is made.
- *Linking a physical scan to a browser session with no display/keyboard on the device*: the firmware has no way to show a code or accept input, so it can't participate in any pairing protocol beyond "here is a UID I just read." The backend handles the whole pairing/login protocol (WebSocket-based, live status pushed to the browser) around that one primitive — the firmware needed zero changes between the pairing feature and the badge-login feature.
- *Badge cloning*: the UID on this class of RFID tag is not a secret — it can be copied with an off-the-shelf writer (tested). The firmware only ever reports raw UIDs; the backend treats the badge strictly as a login *convenience*, never as sole proof of identity, and stores the UID hashed rather than in the clear.

**Value added to the project.** It gives the app a login method that doesn't exist in any browser and can't be replicated by just writing more frontend/backend code — a tangible, physical demonstration during evaluation (scan a badge, watch the login happen live) that few other groups will have.

**Why it deserves Major status.** It required building and flashing separate embedded firmware (C++/Arduino) in addition to the web application, implementing a custom network discovery protocol (mDNS) instead of a hardcoded config, running a full TLS stack (certificate pinning + NTP-dependent validation) on a microcontroller, and designing a novel pairing protocol to work around the device's lack of I/O — none of which have an equivalent in the other catalog modules.
