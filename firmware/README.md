# NFC Badge Reader (ESP32) — Module of Choice

## Description

Hardware badge reader for ft_transcendence: an ESP32 with an MFRC522 NFC reader lets a
user link a physical badge to their account and then log in by tapping it. This
directory contains the firmware only. The rest of the chain lives on the web app
branch: `webapp/badge-bridge` (USB bridge on the kiosk PC), `webapp/backend` (API) and
`webapp/frontend` (pages).

## Hardware

- ESP32 dev board, plugged into the kiosk PC with a USB cable
- MFRC522 RFID/NFC reader (I2C, address `0x28`), wired on pins 21/22 (`Wire.begin(21, 22)`)
- Any MIFARE-compatible NFC badge or card (for example a 42 student card)

## Prerequisites

- Arduino IDE (or PlatformIO) with the ESP32 board package installed
- Library: `MFRC522_I2C`

## Setup

1. Flash `esp32_rfid.ino` to the board.
2. Leave it plugged into the kiosk PC and start the bridge there (see
   `webapp/badge-bridge/.env.example` on the web app branch).

The firmware holds no secret: no Wi-Fi password, no device token. The token lives on
the kiosk PC, in the bridge's `.env`.

## How it works

1. On boot, the ESP32 opens the USB serial link at 115200 bauds and prints
   `Badge reader ready`.
2. On every badge tap, it prints one line: `UID read: <UID in hexadecimal>`.
3. The bridge reads that line and sends the UID to the API (`POST /api/scan`, with the
   `X-Device-Token` header). The API decides what the scan means: linking the badge to
   an account, or logging someone in. The firmware has no notion of pairing or login.

## Why USB and not Wi-Fi

A first version sent the scans itself over Wi-Fi (HTTPS with a pinned certificate,
server found with mDNS). The campus Wi-Fi isolates devices and blocks mDNS, so the
reader could not reach the server there. Over USB the reader works on any network,
needs no secret in the firmware, and cannot be reached by other devices.
