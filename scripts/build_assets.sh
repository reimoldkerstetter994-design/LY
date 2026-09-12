#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLENDER="${BLENDER:-$HOME/blender/blender}"
if [[ ! -x "$BLENDER" ]]; then
  echo "Blender not found at $BLENDER" >&2
  exit 1
fi
python3 "$ROOT/tools/textures/generate_textures.py" --out "$ROOT/assets/textures"
"$BLENDER" -b --factory-startup -noaudio --python "$ROOT/tools/blender/build_devworld.py" -- --out "$ROOT/assets"
echo "Assets ready under $ROOT/assets"
