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

## Flashing with Arduino IDE

1. In *File → Preferences → Additional boards manager URLs*, add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`, then install
   **esp32** (Espressif Systems) in *Tools → Board → Boards Manager*.
2. Install the `MFRC522_I2C` library (*Sketch → Include Library → Manage Libraries*).
3. Open `esp32_rfid.ino` (the IDE asks to move it into an `esp32_rfid` folder: accept).
4. Plug the ESP32 in, select *Tools → Board → esp32 → ESP32 Dev Module* and its port in
   *Tools → Port*.
5. Click *Upload*. If it stays on `Connecting.....`, hold the **BOOT** button of the board.
6. Check in *Tools → Serial Monitor* at 115200 bauds: `Badge reader ready` on reset, then
   `UID read: <UID>` on every badge tap.

### Finding the serial port

- Windows: `COM3`, `COM4`... (the one that appears in *Tools → Port* when the board is plugged in)
- Linux: `/dev/ttyUSB0`
- macOS: run `ls /dev/cu.*` with the board unplugged, then plugged in: the new line is the
  port, usually `/dev/cu.usbserial-XXXX` (use `cu.`, not `tty.`)

No port at all: install the driver of the USB chip of the board (CP210x or CH340), or try
another cable (some cables only charge).

## Setup

1. Flash `esp32_rfid.ino` to the board (see above).
2. **Close the Serial Monitor** (or Arduino IDE): only one program at a time can open the
   serial port, and the bridge would fail with `Access denied` / `Resource busy`.
3. Leave the board plugged into the kiosk PC and start the bridge there, with the port
   found above in `SERIAL_PORT` (see `webapp/badge-bridge/.env.example` on the web app branch).

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
