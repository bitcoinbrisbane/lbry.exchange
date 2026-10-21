#!/usr/bin/env bash
# Encrypts every .env in the repo to .env.gpg so secrets can travel between
# machines (the .gpg files are safe to commit; the .env files are gitignored).
#
#   scripts/env-encrypt.sh                 # to the default GPG key below
#   scripts/env-encrypt.sh --symmetric     # passphrase instead of a key
#   GPG_RECIPIENT=<keyid> scripts/env-encrypt.sh
set -euo pipefail
cd "$(dirname "$0")/.."

RECIPIENT="${GPG_RECIPIENT:-C61F975DEBDEDC6B}"   # Bitcoin Brisbane <lucas@bitcoinbrisbane.com.au>
MODE=(--encrypt --recipient "$RECIPIENT")
[ "${1:-}" = "--symmetric" ] && MODE=(--symmetric --cipher-algo AES256)

found=0
for env in .env src/functions/.env src/ui/.env; do
  [ -f "$env" ] || continue
  found=1
  gpg --yes --quiet "${MODE[@]}" --output "$env.gpg" "$env"
  echo "encrypted $env -> $env.gpg"
done
[ "$found" = 1 ] || { echo "no .env files found"; exit 1; }
