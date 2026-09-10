# Blender 写实人体模型

使用 **Blender 4.5 LTS** 与开源人体生成插件 **MPFB 2**（MakeHuman Community）批量建造多套**成年**写实人体，并做工作室灯光下的 Cycles 渲染。

所有角色均为成人（MakeHuman 年龄参数 ≥ 0.5，对应青年 / 中年 / 老年，不包含儿童形态），并穿着完整服装。

## 角色一览

| ID | 描述 | 服装 |
| --- | --- | --- |
| `young_east_asian_woman` | 东亚青年女性 | 休闲套装 |
| `young_caucasian_man` | 高加索青年男性 | 休闲套装 |
| `young_african_woman` | 非洲裔青年女性 | 运动套装 |
| `young_african_man` | 非洲裔青年男性 | 工装 |
| `middle_age_east_asian_man` | 东亚中年男性 | 正装 |
| `middle_age_caucasian_woman` | 高加索中年女性 | 礼服套装 |
| `older_caucasian_man` | 高加索老年男性 | 休闲套装 |
| `young_mixed_heritage_woman` | 混血青年女性 | 休闲套装 |

体型通过性别、年龄、肌肉、体重、身高、种族等宏观参数控制；皮肤使用对应族群/年龄的照片扫描漫反射贴图，并启用 MPFB 的 **Enhanced SSS** 次表面散射材质。

## 输出

- `human_models/realistic_humans_lineup.blend` — 含全部角色的 Blender 场景
- `human_models/*.glb` — 单角色 glTF 二进制，可导入游戏引擎或其它 DCC
- `renders/*_portrait.png` — 三分之四侧面半身渲染
- `renders/*_fullbody.png` — 全身渲染
- `renders/lineup_fullbody.png` — 八人并排全身

## 本地复现

1. 安装 [Blender 4.5+](https://www.blender.org/download/)
2. 从 [Blender Extensions](https://extensions.blender.org/add-ons/mpfb/) 安装 MPFB 2.0.17+
3. 下载 [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)（CC0），解压到 MPFB 用户数据目录的 `data/`（需包含 `clothes/`、`skins/`、`hair/` 等子目录）
4. 运行：

```bash
blender -b --python scripts/generate_realistic_humans.py -- --samples 48
```

可选：

```bash
# 只生成网格，不渲染
blender -b --python scripts/generate_realistic_humans.py -- --skip-render

# 只生成指定角色
blender -b --python scripts/generate_realistic_humans.py -- --only young_east_asian_woman young_caucasian_man
```

本仓库的 `scripts/run_generate.sh` 会在已安装本机工具链（`~/tools/blender`）时调用上述命令。

## 许可

- 生成脚本：与本仓库相同
- MakeHuman 系统资源与皮肤贴图：CC0
- 生成的网格/渲染图：基于 CC0 资源与开源工具产出，可自由使用
