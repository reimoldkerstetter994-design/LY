#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/wallpaper"
PORT="${PORT:-4173}"
echo "Starting Moonlit Silver dynamic wallpaper at http://127.0.0.1:${PORT}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
