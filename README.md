# LY · Blender 写实人体模型库

用 **Blender 4.5 LTS + MPFB2（MakeHuman Plugin For Blender）** 以纯脚本方式生成多种真实感人体模型，
并用 Cycles 渲染。全部流程无需打开 Blender 界面，`bash` 一条命令即可从零重建所有模型和渲染图。

- 模型基于 MakeHuman 解剖学正确的参数化人体：性别、年龄（1~90 岁）、肌肉量、体重、身高、比例、族裔等宏参数，
  再叠加数百个局部修形目标（鼻梁、眼袋、下颌、腰围……）。
- 皮肤使用 MPFB 的 **Enhanced SSS** 材质（次表面散射 + 程序化毛孔 + 清漆层），眼睛加角膜清漆，
  头发/眉毛/睫毛为 alpha 贴图发片，服装与鞋子来自 MakeHuman CC0 资源包。
- 每个角色都带有完整骨架（MPFB default rig），脚本用“骨骼指向”的方式摆出自然站姿，或直接导入 BVH 姿势。
- 表情基于 ARKit 52 面部单元（faceunits01）。
- 渲染：弧形无缝背景 + HDRI 环境光 + 五灯人像布光（主/补/轮廓/发光/背景），85~105mm 人像镜头带浅景深，AgX 色彩管理。

## 渲染结果

| 角色 | 全身 | 头像 |
| --- | --- | --- |
| 梅琳 · 25 岁东亚女性 | ![](renders/mei_lin_full.png) | ![](renders/mei_lin_portrait.png) |
| 马库斯 · 32 岁西非男性 | ![](renders/marcus_okafor_full.png) | ![](renders/marcus_okafor_portrait.png) |
| 亨里克 · 48 岁北欧男性 | ![](renders/henrik_lindqvist_full.png) | ![](renders/henrik_lindqvist_portrait.png) |
| 阿玛拉 · 45 岁非洲女性 | ![](renders/amara_nwosu_full.png) | ![](renders/amara_nwosu_portrait.png) |
| 玛格丽特 · 74 岁英国女性 | ![](renders/margaret_holloway_full.png) | ![](renders/margaret_holloway_portrait.png) |
| 田中浩 · 68 岁日本男性 | ![](renders/tanaka_hiroshi_full.png) | ![](renders/tanaka_hiroshi_portrait.png) |
| 迭戈 · 28 岁拉美男性（健身体型） | ![](renders/diego_ramirez_full.png) | ![](renders/diego_ramirez_portrait.png) |
| 索菲亚 · 35 岁北欧女性（丰满体型） | ![](renders/sofia_bergstrom_full.png) | ![](renders/sofia_bergstrom_portrait.png) |
| 普丽娅 · 22 岁南亚女性（莲花坐） | ![](renders/priya_sharma_full.png) | ![](renders/priya_sharma_portrait.png) |
| 陈立奥 · 10 岁混血男孩 | ![](renders/leo_chen_full.png) | ![](renders/leo_chen_portrait.png) |

体型对比阵列（纤瘦 / 标准 / 健美 / 丰满 × 男女，以及儿童与老人，穿 MakeHuman 紧身衣皮肤以展示解剖比例）：

![](renders/body_types_lineup.png)

## 目录结构

```
setup/install.sh        一键安装 Blender 4.5 LTS、MPFB 2.0.17 与 MakeHuman CC0 资源包（皮肤/头发/眼睛/服装/姿势/表情）
scripts/build_human.py  角色 JSON -> MPFB 人体 -> 材质增强 -> 表情 -> 姿势 -> 摄影棚 -> .blend + 渲染
scripts/studio.py       弧形背景、HDRI、五灯布光、相机取景、Cycles 渲染参数
scripts/poses.py        站姿预设（relaxed / contrapposto / hands_on_hips / casual / athletic）与 BVH 导入
scripts/render_lineup.py 体型对比阵列
scripts/build_all.sh    批量生成全部角色
characters/*.json       角色定义（格式见 characters/README.md）
renders/                渲染输出（入库）
output/                 生成的 .blend 工程文件（体积大，不入库；可随时重建）
```

## 快速开始

```bash
# 1. 安装依赖（Linux x64；约 1.2 GB 下载）
bash setup/install.sh
source setup/env.sh

# 2. 生成并渲染单个角色（默认输出 全身 1200x1800 + 头像 1400x1400）
blender -b --python scripts/build_human.py -- --spec characters/mei_lin.json

# 3. 批量生成全部角色；PREVIEW=1 为半分辨率快速预览
bash scripts/build_all.sh
PREVIEW=1 bash scripts/build_all.sh

# 4. 体型阵列
blender -b --python scripts/render_lineup.py -- --samples 128
```

常用参数：`--shots full,portrait,three_quarter`、`--samples 160`、`--scale 0.5`、`--no-save`、`--time-limit 300`。

生成的 `output/<name>.blend` 已打包全部贴图，可直接在 Blender 中打开继续编辑：调整 MPFB 面板中的宏参数/修形目标、换装、
改姿势、或用 Rigify 转换骨架。

## 新增角色

复制 `characters/` 下任意 JSON，修改 `phenotype`（宏参数）、`targets`（细节修形）、`skin`、`hair`、`clothes`、`expression`、`pose`
即可，字段说明见 [characters/README.md](characters/README.md)。可用资源：

- 皮肤：`~/.config/blender/4.5/extensions/.user/user_default/mpfb/data/skins/*/*.mhmat`（60+ 种，覆盖不同族裔、年龄、纹身、雀斑等）
- 头发：`.../data/hair/*/*.mhclo`（35 种）
- 服装：`.../data/clothes/*/*.mhclo`（休闲/西装/运动/工装 + 6 款鞋）
- 姿势：`.../data/poses/*/*.bvh`（坐姿、瑜伽、运动等 40 余种）
- 修形目标：MPFB 内置 `data/targets/*/`（如 `nose-hump-incr`、`l-eye-bag-incr`、`torso-vshape-incr`）

## 硬件与耗时

在 4 核 CPU、无 GPU 的机器上（Cycles CPU + OpenImageDenoise）：建模约 1 秒/角色；128 spp 下全身图约 4~6 分钟、头像约 3~5 分钟。
有 GPU 时把 `scripts/studio.py` 中 `cycles.device` 改为 `GPU` 即可。

## 许可

代码为 MIT。MakeHuman 基础网格、修形目标与本仓库使用的全部资源包（皮肤、头发、服装、姿势、表情单元）均为 CC0；
MPFB2 为 GPL-3.0；Blender 自带 HDRI 为 CC0。
