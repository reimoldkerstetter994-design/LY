#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLENDER="${BLENDER:-$HOME/tools/blender/blender}"
if [[ ! -x "$BLENDER" ]]; then
  echo "Blender not found at $BLENDER. Set BLENDER=/path/to/blender" >&2
  exit 1
fi
exec "$BLENDER" -b --python "$ROOT/scripts/generate_realistic_humans.py" -- "$@"
