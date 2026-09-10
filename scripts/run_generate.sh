#!/usr/bin/env bash
# Generate realistic human body models with Blender + MB-Lab.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLENDER="${BLENDER:-${HOME}/tools/blender-4.2.9-linux-x64/blender}"
MBLAB_SRC="${MBLAB_SRC:-${HOME}/tools/MB-Lab}"
ADDON_DIR="${HOME}/.config/blender/4.2/scripts/addons"

if [[ ! -x "${BLENDER}" ]]; then
  echo "Blender not found at ${BLENDER}" >&2
  echo "Download Blender 4.2 LTS and set BLENDER=..." >&2
  exit 1
fi

if [[ ! -d "${MBLAB_SRC}" ]]; then
  echo "MB-Lab not found at ${MBLAB_SRC}" >&2
  echo "Clone https://github.com/animate1978/MB-Lab and set MBLAB_SRC=..." >&2
  exit 1
fi

mkdir -p "${ADDON_DIR}"
if [[ ! -e "${ADDON_DIR}/MBLab" ]]; then
  ln -s "${MBLAB_SRC}" "${ADDON_DIR}/MBLab"
fi

export PYTHONUNBUFFERED=1
exec "${BLENDER}" --background --factory-startup --python "${ROOT}/scripts/generate_humans.py" -- "$@"
