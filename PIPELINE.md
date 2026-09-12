# 源码岛资产管线

用专业 DCC / 运行时工具，而不是在游戏代码里堆立方体。

## 工具

| 环节 | 工具 | 作用 |
| --- | --- | --- |
| 纹理 | Python + Pillow | 生成 512px 可平铺 albedo |
| 建模 / 材质 / 导出 | Blender 4.2 LTS | 高度场岛屿、建筑、PBR、glTF |
| 交换格式 | glTF 2.0 / GLB | Khronos 标准，含法线、UV、自发光 |
| 关卡数据 | JSON（Blender 写出） | 出生点、AABB 碰撞、交互物、街区 |
| 运行时 | Three.js r170 + WebGL | 第一人称控制、光照、任务 |
| 开发服务器 | Vite 6 | 模块、热更新、静态资源 |

## 目录

```
tools/textures/generate_textures.py   纹理
tools/blender/build_devworld.py       世界生成
assets/textures/                      albedo PNG
assets/models/devworld.glb            场景网格
assets/data/world.json                玩法数据
game/src/                             游戏
```

## 坐标

Blender 是 Z-up。导出时打开 `export_yup`，JSON 里的点已经换成 glTF 的 Y-up：

```
gltf.x = blender.x
gltf.y = blender.z
gltf.z = -blender.y
```

碰撞盒在 Blender 里用 `COL_*` 物体求世界 AABB，再写入 JSON。运行时不依赖隐藏网格做墙体碰撞；地面高度对地形网格做向下射线。

## 重跑

```bash
python3 tools/textures/generate_textures.py --out assets/textures
blender -b --factory-startup -noaudio --python tools/blender/build_devworld.py -- --out assets
python3 tools/tests/test_world.py
```

无 GPU / 无 EGL 的环境不要加 `--preview`（Workbench 预览需要 OpenGL）。
