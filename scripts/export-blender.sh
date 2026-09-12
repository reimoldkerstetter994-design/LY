#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/assets/models"
mkdir -p "$OUT"

candidates=(
  "${BLENDER_BIN:-}"
  "$HOME/blender/blender"
  "$HOME/blender/blender-4.2.23-linux-x64/blender"
  /usr/bin/blender
)

BLENDER=""
for c in "${candidates[@]}"; do
  if [[ -n "$c" && -x "$c" ]]; then
    BLENDER="$c"
    break
  fi
done

if [[ -z "$BLENDER" ]]; then
  echo "Blender not found. Set BLENDER_BIN or install Blender 4.2+." >&2
  exit 1
fi

echo "Using Blender: $BLENDER"
"$BLENDER" --background --factory-startup --python "$ROOT/tools/blender/export_devworld.py" -- --out "$OUT"
echo "Export complete: $OUT"
