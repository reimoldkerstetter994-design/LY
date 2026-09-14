#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/dist/NIGHTFALL-workshop.zip"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
# Workshop zip: player + stills + preview. Exclude pose-morph leftovers.
cd "$ROOT"
zip -r -q "$OUT" wallpaper \
  -x "wallpaper/assets/act/*" \
  -x "wallpaper/assets/vid/*" \
  -x "wallpaper/.DS_Store"
echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
echo "Import wallpaper/ (or unzip) in Wallpaper Engine → Open in Editor → File → Export."
