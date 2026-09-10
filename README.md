# Blender 高逼真三维人体模型生成与渲染系统
## Blender Realistic Human Body Generator & Photorealistic Studio Pipeline

本项目为基于 **Blender 4.0+ Python API** 构建的模块化、参数化高逼真三维人体生成与影棚摄影级渲染系统。系统遵循古典解剖人体比例法则（Canon of Proportions，7.5 ~ 8.2 头身比），结合基于物理的真实着色器（PBR Random Walk 次表面散射皮肤、多层眼球虹膜/角膜、各向异性毛发、真实织物），支持 5 种不同性别与体态特征的高逼真角色构建、自动化多机位摄影棚布光渲染，并能一键导出工业标准 3D 资产（`.blend`、`.glb`、`.obj`）。

---

## 目录
1. [系统核心特性](#1-系统核心特性)
2. [5 种逼真人种与体态原型](#2-5-种逼真人种与体态原型)
3. [解剖学建模与五官细节](#3-解剖学建模与五官细节)
4. [物理真实 PBR 材质系统](#4-物理真实-pbr-材质系统)
5. [影棚灯光与多机位构图](#5-影棚灯光与多机位构图)
6. [快速上手与 CLI 使用指南](#6-快速上手与-cli-使用指南)
7. [项目目录结构与资产说明](#7-项目目录结构与资产说明)
8. [二次开发与骨骼绑定（Rigging）指南](#8-二次开发与骨骼绑定rigging指南)

---

## 1. 系统核心特性

- **严格解剖学比例与多样性体态**：基于古典雕塑与人体测量学（Anthropometry），支持 8.0 头身比健美男性、7.7 头身比自然匀称女性、7.5 头身比魁梧硬汉、8.2 头身比修长超模以及 7.6 头身比成熟稳重男士。
- **精细微观几何体**：
  - 头部与面部：额骨、眉弓、鼻梁、鼻翼、鼻孔凹槽、人中（Philtrum）、丘比特唇弓（Cupid's Bow）、下颌颏结节与耳廓立体造型；
  - 躯干与肌群：胸大肌（/自然乳房）、胸骨剑突、腹直肌六块肌沟、外斜肌、腹股沟韧带、背阔肌、斜方肌、臀大肌；
  - 四肢与手脚：三角肌、二头肌、三头肌、肱桡肌、尺骨小头、手掌大鱼际肌与五指三节分段；股四头肌、髌骨（膝盖）、腓肠肌、内外踝骨与足弓五趾。
- **物理精确次表面散射（Random Walk SSS）**：模拟真实人体真皮层与皮下脂肪对红黄光波段的穿透散射（Subsurface Radius），并搭配双层皮脂膜高光（Coat Layer）。
- **复合眼球系统**：外层高透平滑透明角膜（Cornea，IOR 1.376）与内层微凹多环渐变虹膜（Iris，含瞳孔、自主神经环 Collarette、虹膜纤维与角膜缘环 Limbal Ring）。
- **发型、毛发与合身服饰**：内置寸头、高马尾、背头、波浪卷发、三七分短发；立体眉毛、上下睫毛及胡茬/络腮胡；配备根据身体围度动态贴合的运动压缩短裤、专业瑜伽内衣/裤、工装短裤及休闲衬衫长裤。
- **影棚级渲染与多格式资产交付**：配备大弧度平滑地台（Cyclorama）、五点摄影打光（主光、辅光、轮廓逆光、柔和顶光、地面反射补光）；一键输出 `.blend` 工程源码、标准 `.glb`（含 PBR 材质）以及 `.obj`（附带材质库）。

---

## 2. 5 种逼真人种与体态原型

| 角色标识 (`key`) | 角色名称与原型 | 性别 | 身高 / 头身比 | 解剖与体态特征 | 发型与面部毛发 | 服饰配置 | 皮肤与眼睛预设 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `male_athletic` | **Marcus**<br>健美型男性 | 男 | 1.85m<br>8.0 头身 | 宽肩窄腰 V 字倒三角躯干，胸肌分块分明，腹直肌沟清晰，下颌角线条刚毅棱角分明 | 极简寸头 (Crew Cut)<br>下巴与面颊微青胡茬 (Stubble) | 深蓝运动速干压缩短裤 (Athletic Shorts) | 暖色健康小麦肌 (`fair_warm`)<br>湛蓝瞳孔 (`azure_blue`) |
| `female_natural` | **Elena**<br>自然匀称女性 | 女 | 1.72m<br>7.7 头身 | 黄金腰臀比例（0.70），柔和自然胸弧，腿部线条修长匀称，面部线条柔和微尖 | 运动利落高马尾 (Ponytail)<br>精细柳叶眉与浓密睫毛 | 运动背心 + 高腰无缝瑜伽裤 (Sports Bra & Leggings) | 白皙红润肤质 (`fair_rosy`)<br>祖母绿瞳孔 (`emerald_green`) |
| `male_stocky` | **Viktor**<br>魁梧强壮型男性 | 男 | 1.82m<br>7.5 头身 | 宽厚胸腔与厚实背阔肌，粗壮四肢与粗犷骨骼，方正坚毅的大下颌骨与粗眉 | 现代两边铲背头 (Undercut)<br>浓密络腮胡 (Full Beard) | 重磅橄榄绿工装短裤 (Cargo Shorts) | 阳光日光棕褐肤色 (`sun_kissed`)<br>琥珀榛果褐瞳 (`hazel`) |
| `female_slender` | **Chloe**<br>修长超模女性 | 女 | 1.79m<br>8.2 头身 | 九头身超模骨相，清晰锁骨线条，纤细修长的腰肢与笔直大长腿，高颧骨 | 飘逸波浪长卷发 (Long Wavy)<br>修长立体挑眉与纤长睫毛 | 珊瑚红修身露脐短上衣 + 紧身打底裤 | 瓷白微透冷白皮 (`porcelain`)<br>晶莹浅金琥珀瞳 (`amber`) |
| `male_mature` | **Arthur**<br>成熟稳重型男性 | 男 | 1.77m<br>7.6 头身 | 饱满沉稳躯干，自然成熟体态与稳重轮廓，眉眼深邃带有学者与绅士气质 | 经典复古商务三七分 (Side Part)<br>修剪得体的雅痞短胡 | 藏灰商务针织上衣 + 修身直筒休闲长裤 | 暖调成熟肤质 (`mature_warm`)<br>深邃黑褐瞳孔 (`dark_brown`) |

---

## 3. 解剖学建模与五官细节

### 3.1 坐标系与人体朝向规范
- **正面朝向**：`-Y` 轴；
- **背部朝向**：`+Y` 轴；
- **左右对称轴**：`X` 轴（`+X` 为模型自身左手侧，`-X` 为模型自身右手侧）；
- **高度垂直轴**：`+Z` 轴（从脚底 `Z = 0.0` 至头顶 `Z = Height`）。

### 3.2 头面部骨相与微雕几何
1. **面部各层横截面推进**：从发际线、额骨、眉心、眶下缘、鼻翼基底、上唇结节、唇红裂到下颌角与颏结节，沿 `-Y` 深度递进外凸，彻底杜绝扁平感。
2. **立体鼻部构造**：精确鼻根鼻梁（Nasal Bridge）坡度、鼻尖中凸与两侧鼻翼外展（Alar of Nose），并在底部向内凹陷生成鼻孔结构。
3. **唇弓与口轮匝肌**：上唇塑造丘比特弓（Cupid's Bow）双峰起伏，人中浅沟下凹，下唇饱满双圆垫并收紧至口角。
4. **眼球与眼眶**：独立几何眼球（直径 24mm），角膜表面朝向 `-Y`，并嵌于眼眶环内，内外眦自然收口。
5. **手掌五指与足部五趾**：
   - 手掌掌心呈内弧勺状，外展大鱼际肌（Thenar Eminence）与对生拇指；四指依次递进长度（食指、中指、无名指、小指），各手指均具备近节、中节、末节分段网格。
   - 足部具备内侧拱形纵弓（Medial Arch）、跟骨结节与外踝/内踝高低差骨突，五趾分明。

---

## 4. 物理真实 PBR 材质系统

### 4.1 皮肤材质（Principled BSDF v2 + Random Walk SSS）
真实人类皮肤具有多层半透光学特性。本工程采用 Blender 4.0 最新的 Random Walk (Skin) 次表面散射模型：
- **Subsurface Weight**: 0.15 ~ 0.22（提供柔和透光，避免塑料塑胶感）；
- **Subsurface Scale**: 0.015（精确对应真实人体真皮散射平均自由程）；
- **Subsurface Radius**: `(0.50, 0.25, 0.15)`（红光穿透最深，呈现微血管鲜红透光感，绿蓝光迅速衰减）；
- **Coat Layer**: 重量 0.14 ~ 0.20，粗糙度 0.20 ~ 0.25，完美还原天然皮脂膜（Sebum Coat）的各向同性微弱菲涅尔反光；
- **微孔隙凹凸节点**：程序化多尺度噪波纹理叠加细微真皮微孔起伏。

### 4.2 眼球材质（角膜 + 渐变多环虹膜）
- **高透角膜**：Transmission = 1.0, Roughness = 0.02, IOR = 1.376，具备水润反光高光点；
- **渐变微凹虹膜**：
  - 核心瞳孔（Pupil）：纯黑（吸光孔径，直径约 3.5mm）；
  - 自主神经环（Collarette）：高对比度过渡环带；
  - 虹膜基质纤丝：各色系专属颜色（天蓝、翠绿、琥珀金、深褐）搭配径向噪波纹理；
  - 角膜缘环（Limbal Ring）：最外围的深色渐变收边环，强化眼神灵动感。

### 4.3 毛发与织物着色
- **头发材质**：低粗糙度（Roughness 0.30 ~ 0.40），高各向异性高光（Anisotropic 0.80 ~ 0.90），还原发丝天然顺滑光泽与双层高光高低反射。
- **服饰布料**：高粗糙度（Roughness 0.55 ~ 0.75），配合 Sheen（织物微绒光泽）与各向同性纤维微反光，区分主布料与撞色滚边/腰带。

---

## 5. 影棚灯光与多机位构图

### 5.1 影棚无缝地台与布光系统
- **Studio Cyclorama**：宽 12m、深 10m、高 4.5m，在底部转折处设计 1.2m 大半径光滑贝塞尔圆角过度，消除地平线阴影截断。
- **5 点专业摄影灯光系统**：
  1. **主光 (Key Light)**：暖白柔光箱（4800K ~ 5200K），位于左前方 40°，照射面部与肌肉阴影结构；
  2. **辅光 (Fill Light)**：冷青柔光箱（6500K），位于右前方 -35°，提亮暗部死黑阴影；
  3. **轮廓逆光 (Rim / Kicker Light)**：强劲锐利边缘光，位于后方 135°，勾勒发丝、肩颈与体侧边缘曲线；
  4. **顶柔光 (Soft Hair Top Light)**：悬吊大型柔光天幕，从头顶向下补充微光；
  5. **地台反光 (Bounce Light)**：下方大面积柔光，模拟高档浅灰地台对躯干与下颌的漫反射补光。

### 5.2 多视角摄像机机位
所有摄像机均面向 `+Y` 轴瞄准模型：
- **`beauty_34`**：黄金 3/4 全身构图视角（焦距 70mm，仰视 1.15m），展现整体身姿与肌肉轮廓；
- **`portrait`**：半身特写头像视角（焦距 85mm，平视 1.60m），展现五官细节、眼眸神采与发丝质感；
- **`front_full`**：正前方全身站姿（焦距 65mm）；
- **`side_profile`**：纯侧面剪影视角（焦距 80mm），检验侧面骨相、鼻唇下巴坡度及背部臀腿曲线。
- **`human_models_lineup`**：大广角全景机位（焦距 42mm），横向排布 5 位模特，展示全家福对比。

---

## 6. 快速上手与 CLI 使用指南

### 6.1 环境要求
- 操作系统：Linux / Windows / macOS
- Blender 版本：**Blender 4.0.0 或更高版本**（必须支持 Principled BSDF v2）
- Python 版本：3.10+

### 6.2 命令行一键生成

#### 1. 批量生成全部 5 款角色及 5 人全景同台（全量导出与渲染）
```bash
python3 run_generator.py --mode all --engine eevee
```
或者使用 Cycles 物理光追引擎（可调节采样率）：
```bash
python3 run_generator.py --mode all --engine cycles --samples 32
```
显式通过 Blender 后台调用：
```bash
blender -b -P run_generator.py -- --mode all --engine eevee
```

#### 2. 生成单个角色（例如自然匀称女性 Elena）
```bash
python3 run_generator.py --mode single --model female_natural --engine eevee
```

#### 3. 仅构建 5 人同台影棚大展
```bash
python3 run_generator.py --mode lineup --engine eevee
```

#### 4. 高速模式（仅导出 3D 模型与工程，跳过渲染）
```bash
python3 run_generator.py --mode all --no-render
```

#### 5. 高清超清采样渲染（自定义画质与分辨率）
```bash
python3 run_generator.py --mode single --model male_athletic --engine cycles --samples 64 --resolution 1920 1080 --views portrait beauty_34
```

---

## 7. 项目目录结构与资产说明

```text
/workspace/
├── human_generator/                 # 核心模块源码目录
│   ├── __init__.py                  # 模块顶层 API 导出
│   ├── config.py                    # 5 大角色解剖参数、肤色/眼球/毛发/布料预设字典
│   ├── anatomy_mesh.py              # BMesh 算法生成躯干、头面骨相、五官、手掌手趾、足弓足趾
│   ├── hair_styles.py               # 5 款特色发型、立体眉毛、上下睫毛、胡茬与浓密胡须
│   ├── clothing.py                  # 贴合人体几何的压缩短裤、专业瑜伽裤、工装短裤、长裤
│   ├── materials.py                 # Blender 4.0 Principled BSDF v2 节点材质构建器
│   ├── studio.py                    # 大弧度影棚地台、5点灯光系统、多视角相机、Cycles引擎配置
│   └── builder.py                   # 角色总装、单人场景与多人全景场景、3D 文件导出逻辑
├── run_generator.py                 # 跨平台 CLI 自动化脚本执行入口
├── models/                          # 导出的 3D 资产库
│   ├── male_athletic.blend          # Blender 完整源文件（含独立集合、灯光、材质）
│   ├── male_athletic.glb            # 标准 glTF 二进制格式（含网格与 PBR 材质）
│   ├── male_athletic.obj / .mtl     # Wavefront OBJ 几何与材质文件
│   ├── female_natural.blend / .glb / .obj
│   ├── male_stocky.blend / .glb / .obj
│   ├── female_slender.blend / .glb / .obj
│   ├── male_mature.blend / .glb / .obj
│   └── human_models_lineup.blend / .glb / .obj  # 5 人同台全景资产
└── renders/                         # 摄影棚渲染生成图
    ├── male_athletic_beauty_34.png
    ├── male_athletic_portrait.png
    ├── female_natural_beauty_34.png
    ├── female_natural_portrait.png
    ├── male_stocky_beauty_34.png
    ├── male_stocky_portrait.png
    ├── female_slender_beauty_34.png
    ├── female_slender_portrait.png
    ├── male_mature_beauty_34.png
    ├── male_mature_portrait.png
    └── human_models_lineup_showcase.png
```

---

## 8. 二次开发与骨骼绑定（Rigging）指南

### 8.1 在 Blender 中打开与二次雕刻
1. 双击或使用 Blender 打开 `models/<model_name>.blend`；
2. 在大纲视图（Outliner）中选中 `Body_<model_name>`；
3. 按 `Ctrl + Tab` 选择 **Sculpt Mode（雕刻模式）**；
4. 建议开启 `Dyntopo`（动态拓扑）或添加 `Multiresolution`（多级精度修改器），即可基于现有高精度解剖走向进行面部表情微雕或血管细节刻画。

### 8.2 快速自动骨骼绑定（Rigify 或 AccuRig）
本系统生成的网格在原点以标准 T-Pose / A-Pose 站立，四肢伸展舒畅，非常适于快速自动绑定：
1. 开启 Blender 内置插件 `Rigify`；
2. `Shift + A` -> `Armature` -> `Human (Meta-Rig)`；
3. 缩放 Meta-Rig 骨架匹配角色的身高与手肘关节位置；
4. 点击 `Generate Rig` 生成高级控制器；
5. 选中角色部件后加选生成的 Rig，按 `Ctrl + P` 选择 `With Automatic Weights` 即可完成高拟真动画驱动绑定。
