#!/usr/bin/env bash
# Generate a dev-only RSA key + self-signed cert for Quokka SAML SP env vars.
# Outputs PEM files next to this script under saml-sp/ (gitignored).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/saml-sp"
mkdir -p "$OUT"
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 \
  -keyout "$OUT/sp-key.pem" -out "$OUT/sp-cert.pem" -nodes \
  -subj "/CN=quokkaq-local-saml-sp/O=dev"
chmod 600 "$OUT/sp-key.pem"
echo "Wrote:"
echo "  $OUT/sp-key.pem  -> SAML_SP_PRIVATE_KEY_PEM (file contents)"
echo "  $OUT/sp-cert.pem -> SAML_SP_CERT_PEM (file contents)"
