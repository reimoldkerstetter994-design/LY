# Blender 资产管线

DevWorld 使用 Blender 作为 3D 资产创作工具，导出 GLB 格式供 Three.js 加载。

## 前置要求

- [Blender 3.6+](https://www.blender.org/download/)
- glTF 2.0 导出插件（Blender 内置）

## 快速生成资产

```bash
# 在项目根目录执行
blender --background --python blender/generate_assets.py
```

导出的 GLB 文件会保存到 `public/models/`：

| 文件 | 用途 |
|------|------|
| `tree.glb` | 世界装饰树木 |
| `terminal.glb` | 可交互代码终端 |
| `bug.glb` | 可收集的 Bug 道具 |
| `crystal.glb` | 能量水晶装饰 |

## 手动创作流程

1. 在 Blender 中建模
2. 设置 Principled BSDF 材质
3. 选择所有对象 → File → Export → glTF 2.0 (.glb)
4. 保存到 `public/models/`
5. 在 `src/game/World.js` 的 `loadAssets()` 中注册新模型

## 无 Blender 环境

运行 `npm run generate-assets` 使用 Three.js 程序化生成备用 GLB 资产。
