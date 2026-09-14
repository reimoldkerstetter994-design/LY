#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/wallpaper"
PORT="${PORT:-4173}"
echo "NIGHTFALL  http://127.0.0.1:${PORT}"
echo "Workshop   http://127.0.0.1:${PORT}/?we=1"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
