#!/usr/bin/env bash
# Render store/promo.html to the 440x280 Chrome Web Store promo tile (macOS, Google Chrome).
set -euo pipefail
cd "$(dirname "$0")/.."
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=440,280 --screenshot="$PWD/store/promo-440x280.png" "file://$PWD/store/promo.html" 2>/dev/null
sips -g pixelWidth -g pixelHeight store/promo-440x280.png | tail -2
