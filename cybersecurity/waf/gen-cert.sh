#!/bin/sh
# Creates the WAF's self-signed TLS certificate, ONLY if none exists yet.
# To reuse the certificate already pinned in the ESP32 firmware (ca_cert.h),
# copy its cert.pem/key.pem to waf/certs/server.crt and waf/certs/server.key.
set -eu

CERT=/certs/server.crt
KEY=/certs/server.key

if [ -f "$KEY" ]; then
    echo "gen-cert: existing certificate kept"
    exit 0
fi

# Elliptic-curve key (P-256), certificate valid for 825 days (max accepted by browsers).
# The SAN lists the names under which the site is reached.
openssl req -x509 -nodes -days 825 \
    -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -subj "/CN=transcendence.local" \
    -addext "subjectAltName=DNS:transcendence.local,DNS:localhost,IP:127.0.0.1" \
    -keyout "$KEY" -out "$CERT"

# The WAF runs as nginx (uid 101): it is the only one allowed to read the key.
chown 101:101 "$KEY" "$CERT"
chmod 400 "$KEY"
chmod 444 "$CERT"
echo "gen-cert: certificate created (CN=transcendence.local)"
