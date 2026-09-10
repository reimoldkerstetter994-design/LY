#!/usr/bin/env bash
# 一键安装：Blender 4.5 LTS + MPFB2（MakeHuman Plugin For Blender）+ MakeHuman CC0 资源包
#
# 用法:
#   bash setup/install.sh            # 安装到 ~/tools（默认）
#   TOOLS_DIR=/opt/tools bash setup/install.sh
#
# 安装完成后，可通过 `source setup/env.sh` 把 blender 加入 PATH。
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-$HOME/tools}"
BLENDER_VERSION="${BLENDER_VERSION:-4.5.13}"
BLENDER_SERIES="${BLENDER_VERSION%.*}"                  # 4.5
MPFB_VERSION="${MPFB_VERSION:-2.0.17}"
BLENDER_DIR="$TOOLS_DIR/blender-$BLENDER_VERSION-linux-x64"
BLENDER_BIN="$BLENDER_DIR/blender"

# MPFB 的用户数据目录（资源包解压到这里的 data/ 子目录下）
MPFB_USER_DATA="$HOME/.config/blender/$BLENDER_SERIES/extensions/.user/user_default/mpfb/data"

mkdir -p "$TOOLS_DIR"
cd "$TOOLS_DIR"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- Blender
if [ ! -x "$BLENDER_BIN" ]; then
  log "下载 Blender $BLENDER_VERSION"
  curl -L --retry 4 -o blender.tar.xz \
    "https://download.blender.org/release/Blender$BLENDER_SERIES/blender-$BLENDER_VERSION-linux-x64.tar.xz"
  tar xf blender.tar.xz && rm -f blender.tar.xz
else
  log "Blender 已存在: $BLENDER_BIN"
fi
"$BLENDER_BIN" -b --version | head -1

# ---------------------------------------------------------------- MPFB2
if ! "$BLENDER_BIN" -b --command extension list 2>/dev/null | grep -q 'mpfb \[installed\]'; then
  log "下载并安装 MPFB $MPFB_VERSION"
  curl -L --retry 4 -o mpfb-src.zip \
    "https://github.com/makehumancommunity/mpfb2/archive/refs/tags/v$MPFB_VERSION.zip"
  rm -rf "mpfb2-$MPFB_VERSION" && unzip -q mpfb-src.zip
  (cd "mpfb2-$MPFB_VERSION/src" && rm -f ../../mpfb.zip && zip -qr ../../mpfb.zip mpfb)
  "$BLENDER_BIN" -b --command extension install-file -r user_default -e "$TOOLS_DIR/mpfb.zip"
  rm -f mpfb-src.zip
else
  log "MPFB 已安装"
fi

# ---------------------------------------------------------------- 资源包 (全部 CC0)
mkdir -p "$MPFB_USER_DATA" "$TOOLS_DIR/mh_assets"
cd "$TOOLS_DIR/mh_assets"

ASSET_PACKS=(
  "asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"  # 皮肤/眼睛/牙齿/基础服装
  "asset_packs/skins01/skins01_cc0.zip"                                  # 更多皮肤
  "asset_packs/skins02/skins02_cc0.zip"
  "asset_packs/hair01/hair01_cc0.zip"                                    # 头发
  "asset_packs/eyebrows01/eyebrows01_cc0.zip"
  "asset_packs/eyelashes01/eyelashes01_cc0.zip"
  "asset_packs/poses01/poses01_cc0.zip"                                  # BVH 姿势
  "asset_packs/poses02/poses02_cc0.zip"
  "functional/faceunits01.zip"                                           # 面部表情单元 (ARKit)
)

for pack in "${ASSET_PACKS[@]}"; do
  f="$(basename "$pack")"
  if [ ! -f "$f" ]; then
    log "下载资源包 $f"
    curl -L --retry 4 -o "$f" "https://files.makehumancommunity.org/$pack"
  fi
  unzip -qo "$f" -d "$MPFB_USER_DATA"
done

log "资源目录: $MPFB_USER_DATA"
ls "$MPFB_USER_DATA"

cat > "$(dirname "$0")/env.sh" <<EOF
# 由 setup/install.sh 生成
export PATH="$BLENDER_DIR:\$PATH"
export MPFB_USER_DATA="$MPFB_USER_DATA"
EOF

log "安装完成。运行: source setup/env.sh && bash scripts/build_all.sh"
