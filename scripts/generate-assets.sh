#!/usr/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/assets"
mkdir -p "$OUT"

BLENDER="${BLENDER:-}"
if [[ -z "$BLENDER" ]]; then
  for candidate in \
    "$HOME/blender/blender-4.2.23-linux-x64/blender" \
    "$HOME/blender/blender/blender" \
    /usr/bin/blender \
    blender
  do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then
      BLENDER="$candidate"
      break
    fi
  done
fi

if [[ -z "${BLENDER}" || ! -x "$BLENDER" ]]; then
  echo "Blender not found. Set BLENDER=/path/to/blender" >&2
  exit 1
fi

echo "Using $BLENDER"
"$BLENDER" -b --factory-startup -noaudio --python "$ROOT/blender/generate_world.py" -- --out "$OUT"
echo "Assets written to $OUT"
