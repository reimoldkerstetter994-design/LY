#!/usr/bin/env bash
# One-shot environment setup: Blender 4.2 LTS + MPFB 2 add-on + MakeHuman CC0 asset packs.
#
# Usage:
#   scripts/setup.sh              # install into $TOOLS_DIR (default: ~/tools)
#   TOOLS_DIR=/opt/tools scripts/setup.sh
#
# After it finishes, run e.g.
#   ~/tools/blender-4.2.9-linux-x64/blender -b --python scripts/build_humans.py -- --list
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-$HOME/tools}"
BLENDER_VERSION="${BLENDER_VERSION:-4.2.9}"
BLENDER_SERIES="${BLENDER_VERSION%.*}"
BLENDER_DIR="$TOOLS_DIR/blender-${BLENDER_VERSION}-linux-x64"
BLENDER="$BLENDER_DIR/blender"

MPFB_URL="https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip"

# Asset packs (all CC0). makehuman_system_assets contains skins, eyes, teeth, tongue,
# eyebrows, eyelashes, hair and the basic clothes; the others add more skins / clothes / poses.
ASSET_PACKS=(
  makehuman_system_assets/makehuman_system_assets_cc0
  skins01/skins01_cc0
  shirts01/shirts01_cc0
  pants01/pants01_cc0
  shoes01/shoes01_cc0
  dress01/dress01_cc0
  poses01/poses01_cc0
)
ASSET_BASE="https://files.makehumancommunity.org/asset_packs"

mkdir -p "$TOOLS_DIR/assets"

# --- Blender -----------------------------------------------------------------------------
if [ ! -x "$BLENDER" ]; then
  echo ">> downloading Blender $BLENDER_VERSION"
  curl -L --fail -o "$TOOLS_DIR/blender.tar.xz" \
    "https://download.blender.org/release/Blender${BLENDER_SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz"
  tar xf "$TOOLS_DIR/blender.tar.xz" -C "$TOOLS_DIR"
  rm "$TOOLS_DIR/blender.tar.xz"
fi

# Headless Blender still needs a few GL libraries (Workbench/OpenImageDenoise). Ignore failures
# on systems without apt or without sudo.
if command -v apt-get >/dev/null 2>&1; then
  (sudo apt-get install -y libegl1 libgl1 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 >/dev/null 2>&1) || true
fi

# --- MPFB add-on -------------------------------------------------------------------------
if [ ! -f "$TOOLS_DIR/mpfb.zip" ]; then
  echo ">> downloading MPFB"
  curl -L --fail -o "$TOOLS_DIR/mpfb.zip" "$MPFB_URL"
fi
echo ">> installing MPFB extension"
"$BLENDER" -b --command extension install-file "$TOOLS_DIR/mpfb.zip" --repo user_default --enable >/dev/null

# MPFB keeps user assets below its extension user directory; ask Blender where that is.
MPFB_DATA="$("$BLENDER" -b --python-expr "
from bl_ext.user_default.mpfb.services.locationservice import LocationService
print('MPFB_DATA=' + LocationService.get_user_data())
" 2>/dev/null | sed -n 's/^MPFB_DATA=//p')"
if [ -z "$MPFB_DATA" ]; then
  echo "could not determine the MPFB user data directory" >&2
  exit 1
fi
mkdir -p "$MPFB_DATA"
echo ">> MPFB user data: $MPFB_DATA"

# --- asset packs -------------------------------------------------------------------------
for pack in "${ASSET_PACKS[@]}"; do
  zip="$TOOLS_DIR/assets/$(basename "$pack").zip"
  if [ ! -f "$zip" ]; then
    echo ">> downloading $(basename "$pack")"
    curl -L --fail -o "$zip" "$ASSET_BASE/$pack.zip"
  fi
  unzip -qo "$zip" -d "$MPFB_DATA"
done

echo
echo "Done. Blender: $BLENDER"
echo "Try:  $BLENDER -b --python scripts/build_humans.py -- --list"
