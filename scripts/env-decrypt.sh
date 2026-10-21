#!/usr/bin/env bash
# Restores every .env.gpg in the repo to its .env (prompts for the GPG key
# passphrase, or the symmetric passphrase, as appropriate).
set -euo pipefail
cd "$(dirname "$0")/.."

found=0
for enc in .env.gpg src/functions/.env.gpg src/ui/.env.gpg; do
  [ -f "$enc" ] || continue
  found=1
  env="${enc%.gpg}"
  if [ -f "$env" ] && [ "${1:-}" != "--force" ]; then
    echo "skipping $env (exists; pass --force to overwrite)"
    continue
  fi
  gpg --yes --quiet --decrypt --output "$env" "$enc"
  chmod 600 "$env"
  echo "decrypted $enc -> $env"
done
[ "$found" = 1 ] || { echo "no .env.gpg files found"; exit 1; }
