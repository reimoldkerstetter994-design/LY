#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Building Dev World 3D assets with Blender ==="

if ! command -v blender &>/dev/null; then
  echo "Error: Blender not found. Install with: sudo apt install blender"
  exit 1
fi

mkdir -p assets/models assets/textures

blender --background --python blender/generate_blocks.py
blender --background --python blender/generate_world_props.py

echo "=== Asset build complete ==="
ls -la assets/models/
