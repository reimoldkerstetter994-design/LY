# LY · Blender 写实人体模型生成与渲染

用 **Blender 4.2 LTS + MPFB 2（MakeHuman Plugin for Blender）** 以纯脚本方式批量构建多种真实人体模型，并用 Cycles 渲染出全身照、头部特写和合影。所有资源（人体网格、皮肤、眼睛、头发、服装、姿势）均来自 MakeHuman 社区的 CC0 资产包，可以自由使用。

## 效果一览

| 全身 | 特写 | 全身 | 特写 |
| --- | --- | --- | --- |
| ![](renders/lin_yu_full.jpg) | ![](renders/lin_yu_portrait.jpg) | ![](renders/wang_qiang_full.jpg) | ![](renders/wang_qiang_portrait.jpg) |
| ![](renders/amara_full.jpg) | ![](renders/amara_portrait.jpg) | ![](renders/kwame_full.jpg) | ![](renders/kwame_portrait.jpg) |
| ![](renders/emma_full.jpg) | ![](renders/emma_portrait.jpg) | ![](renders/lars_full.jpg) | ![](renders/lars_portrait.jpg) |
| ![](renders/priya_full.jpg) | ![](renders/priya_portrait.jpg) | ![](renders/rosa_full.jpg) | ![](renders/rosa_portrait.jpg) |
| ![](renders/chen_nainai_full.jpg) | ![](renders/chen_nainai_portrait.jpg) | ![](renders/tom_full.jpg) | ![](renders/tom_portrait.jpg) |
| ![](renders/yusuf_full.jpg) | ![](renders/yusuf_portrait.jpg) | ![](renders/mei_full.jpg) | ![](renders/mei_portrait.jpg) |

合影：

![](renders/group.jpg)

## 角色列表

| id | 名称 | 描述 | 姿势 | 场景 |
| --- | --- | --- | --- | --- |
| `lin_yu` | 林雨 | 24 岁亚洲女性，身材纤细，休闲装 | 放松站姿 | 中性影棚 |
| `wang_qiang` | 王强 | 45 岁亚洲男性，中等体格 | 行走 | 户外日光 |
| `amara` | Amara | 27 岁非洲女性，运动员体型，运动装 | contrapposto | 暗色影棚 |
| `kwame` | Kwame | 68 岁非洲男性，灰白短发，正装 | 坐在木凳上（BVH） | 暖色影棚 |
| `emma` | Emma | 22 岁欧洲女性，雀斑、红发编发，夏裙 | 挥手 | 户外日光 |
| `lars` | Lars | 30 岁北欧男性，高大健壮，Polo 衫工装裤 | 手托下巴 | 中性影棚 |
| `priya` | Priya | 29 岁南亚女性，吊带上衣与哈伦裤 | 莲花坐（BVH） | 亮色影棚 |
| `rosa` | Rosa | 52 岁南欧女性，丰满体型，职业套装 | 放松站姿 | 暖色影棚 |
| `chen_nainai` | 陈奶奶 | 78 岁亚洲女性，银色短发，和服 | 放松站姿 | 亮色影棚 |
| `tom` | Tom | 10 岁欧洲男孩，T 恤短裤 | 挥手 | 户外日光 |
| `yusuf` | Yusuf | 35 岁中东/欧亚混血男性，工作服 | 放松站姿 | 户外黄昏 |
| `mei` | Mei | 35 岁欧亚混血女性，马尾，毛衣长裤 | 坐在地上（BVH） | 中性影棚 |

每个角色都由 **宏参数**（性别、年龄、肌肉、体重、身高、比例、人种混合）+ **细节 target**（脸型、鼻子、眼睛、嘴、体态等几十个可调 morph）+ **表情单元** + 皮肤 / 虹膜颜色 / 发型发色 / 服装 / 姿势 / 灯光环境 组合而成，定义在 `scripts/humanlib/characters.py`。

## 目录结构

```
scripts/
  setup.sh              一键安装 Blender 4.2、MPFB 2 扩展和 CC0 资产包
  build_humans.py       入口脚本：blender -b --python scripts/build_humans.py -- [选项]
  humanlib/
    characters.py       角色库（12 个角色的完整参数）
    builder.py          调用 MPFB 构建人体、微调皮肤/眼睛/头发材质、摆姿势、贴地、导出预设
    poses.py            手工姿势（相对 MPFB default 骨架的欧拉角）+ BVH 姿势加载
    scene.py            渲染设置（Cycles + AgX）、影棚/户外灯光、相机构图、木凳道具
characters/             每个角色导出的 MPFB 预设 human.<id>.json（可在 Blender 的 MPFB 面板直接载入）
renders/                渲染结果（1080×1620 全身，宽幅坐姿自动改为 1620×1080；1080×1350 特写；2400×1000 合影）
```

## 快速开始

```bash
# 1. 安装 Blender 4.2.9 + MPFB 2.0.17 + 资产包（约 700 MB 下载，装到 ~/tools）
scripts/setup.sh

# 2. 列出角色
~/tools/blender-4.2.9-linux-x64/blender -b --python scripts/build_humans.py -- --list

# 3. 低分辨率快速预览两个角色
~/tools/blender-4.2.9-linux-x64/blender -b --python scripts/build_humans.py -- \
    --only lin_yu,amara --scale 40 --samples 32 --out /tmp/preview

# 4. 完整渲染全部角色 + 合影（CPU 4 核约 1.5 小时）
~/tools/blender-4.2.9-linux-x64/blender -b --python scripts/build_humans.py -- --samples 96 --group

# 5. 同时保存 .blend 文件方便在 Blender 里继续编辑
~/tools/blender-4.2.9-linux-x64/blender -b --python scripts/build_humans.py -- --only kwame --blend output/blend
```

`--` 之后的所有选项：

| 选项 | 说明 |
| --- | --- |
| `--only ID[,ID...]` | 只构建指定角色 |
| `--list` | 列出角色后退出 |
| `--out DIR` | 渲染输出目录（默认 `renders/`） |
| `--presets DIR` | MPFB 预设导出目录（默认 `characters/`，传空串可关闭） |
| `--blend DIR` | 额外保存每个角色的 `.blend` |
| `--samples N` | Cycles 采样数（默认 128） |
| `--scale PCT` | 分辨率百分比（默认 100；预览用 25–50） |
| `--subdiv N` | 身体与服装的渲染细分级别（默认 2） |
| `--no-full` / `--no-portrait` | 跳过全身 / 特写 |
| `--group` / `--group-only` | 追加 / 仅渲染合影 |
| `--threads N` | 限制渲染线程数 |

## 实现要点

- **人体生成**：`HumanService.deserialize_from_dict()` 一次性完成基础网格 + 宏参数 morph + 细节 target + 骨架（MPFB `default` 骨架，含手指和面部骨骼）+ 眼睛/牙齿/舌头/眉毛/睫毛/头发 + 服装的自动贴合与遮罩。
- **皮肤**：使用 MPFB 的 *Enhanced SSS* 皮肤节点组（次表面散射 + 程序化毛孔凹凸），脚本按年龄自动调节粗糙度、毛孔强度和 SSS 强度，也可在角色里逐项覆盖。
- **眼睛**：MPFB 程序化眼球材质，脚本提供 brown / dark_brown / hazel / amber / green / blue / grey 七种虹膜预设。
- **头发**：MakeHuman 网格头发，脚本通过材质里的颜色混合节点重新着色（深色乘法、浅色混合），并降低高光避免塑料感。
- **姿势**：`poses.py` 里的手工姿势直接旋转 pose bone；`bvh:<name>` 则通过 MPFB 的 `AnimationService.import_bvh_file_as_pose()` 加载 *poses01* 资产包里的 MakeHuman 坐姿。摆好姿势后按评估后的网格包围盒把角色贴到地面；坐姿角色会自动生成一张木凳。
- **渲染**：Cycles CPU + OpenImageDenoise 降噪，AgX 色彩管理（Medium High Contrast），三点式影棚灯 + 弧形背景墙，或 Nishita 物理天空 + 太阳灯。相机按角色包围盒自动构图，特写使用 105 mm 焦段和 f/2.8 景深。

## 添加新角色

在 `scripts/humanlib/characters.py` 的 `CHARACTERS` 列表里新增一个字典即可，字段说明见文件顶部的 docstring。可用的资源名称：

- 皮肤：`<MPFB 用户数据>/skins/*/*.mhmat`（如 `young_asian_female.mhmat`、`toigo_light_skin_female_freckles.mhmat`）
- 头发：`afro01 bob01 bob02 braid01 long01 ponytail01 short01–short04`
- 眉毛：`eyebrow001–eyebrow012`，睫毛：`eyelashes01–03`
- 服装：`makehuman_system_assets` 与 `shirts01/pants01/shoes01/dress01` 里的 70 余件 `.mhclo`
- 细节 target：MPFB 自带的 `targets/` 目录（`nose-*`, `l-eye-*`, `chin-*`, `torso-*` …）
- 姿势：`relaxed_stand contrapposto walk wave thinking` 或 `bvh:<poses01 里的目录名>`
- 环境：`studio studio_warm studio_dark studio_bright outdoor outdoor_evening`

## 许可

- 脚本：MIT。
- Blender：GPL；MPFB 2：GPL-3.0-or-later（作为外部扩展调用，未包含在本仓库）。
- MakeHuman 资产包（`makehuman_system_assets`、`skins01`、`shirts01`、`pants01`、`shoes01`、`dress01`、`poses01`）：CC0，由 MakeHuman 社区发布。渲染图由这些资产生成，可自由使用。
