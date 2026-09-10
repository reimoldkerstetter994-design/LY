#!/usr/bin/env bash
# 批量生成 characters/ 下所有角色并渲染。
#
# 用法:
#   bash scripts/build_all.sh                 # 正式质量（1200x1800 全身 + 1400x1400 头像，160 spp）
#   PREVIEW=1 bash scripts/build_all.sh       # 快速预览（半分辨率，32 spp）
#   bash scripts/build_all.sh mei_lin diego_ramirez   # 只生成指定角色
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f setup/env.sh ]; then
  # shellcheck disable=SC1091
  source setup/env.sh
fi
command -v blender >/dev/null || { echo "找不到 blender，请先运行 bash setup/install.sh"; exit 1; }

if [ "${PREVIEW:-0}" = "1" ]; then
  EXTRA=(--samples 32 --scale 0.5 --outdir renders/tests --no-save)
else
  EXTRA=(--samples "${SAMPLES:-160}" --scale "${SCALE:-1.0}" --outdir renders)
fi
SHOTS="${SHOTS:-full,portrait}"

if [ "$#" -gt 0 ]; then
  SPECS=()
  for name in "$@"; do SPECS+=("characters/$name.json"); done
else
  mapfile -t SPECS < <(ls characters/*.json)
fi

for spec in "${SPECS[@]}"; do
  echo "=================================================================== $spec"
  blender -b --python scripts/build_human.py -- --spec "$spec" --shots "$SHOTS" "${EXTRA[@]}" 2>&1 \
    | grep -E "^\[(build|render)\]|Error|Traceback|^  File|Exception|WARN" | grep -v "bumpTexture" || true
done
echo "全部完成。"
