#!/usr/bin/env bash
# Build the store/release zip: dist/bettermoodle-<version>.zip
# The same zip goes to the Chrome Web Store, Firefox Add-ons and GitHub Releases.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/bettermoodle-${version}.zip"

mkdir -p dist
rm -f "$out"
# Only runtime files; manifest.json must sit at the zip root.
zip -rqX "$out" manifest.json icons popup src -x '*.DS_Store'
echo "Built $out"
unzip -l "$out" | tail -1
