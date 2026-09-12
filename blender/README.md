# Blender 资产管线

本目录包含 DevWorld 3D 开发世界游戏的 Blender 工作流文档与自动化脚本。

## 工具链

| 工具 | 用途 |
|------|------|
| **Blender 4.x** | 3D 建模、材质、动画 |
| **glTF 2.0** | 运行时资产格式（Three.js 原生支持） |
| **Three.js** | Web 端 3D 渲染引擎 |
| **Vite** | 开发与构建工具 |

## 快速开始

### 1. 在 Blender 中创建资产

推荐工作流：

1. 新建项目，单位设为 **Metric**，比例 1 Blender Unit = 1 米
2. 模型原点放在底部中心（便于放置到地面）
3. 使用 Principled BSDF 材质，颜色/金属度/粗糙度与游戏方块风格一致
4. 多边形数：装饰物 < 2000 三角面，建筑模块 < 500 三角面

### 2. 导出 GLTF

**方式 A — 使用自带脚本（推荐）：**

```bash
blender your_scene.blend --background --python blender/export_gltf.py -- /path/to/output.gltf
```

**方式 B — 手动导出：**

1. File → Export → glTF 2.0 (.glb/.gltf)
2. 格式选 **glTF Separate** 或 **glTF Binary (.glb)**
3. 勾选：Apply Modifiers、UVs、Normals、Materials (Export)
4. 输出到 `assets/models/` 目录

### 3. 在游戏中加载

将导出的 `.glb` 文件放入 `assets/models/`，然后在 `Game.ts` 中使用 GLTFLoader：

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load('/models/your_asset.glb', (gltf) => {
  scene.add(gltf.scene);
});
```

## 示例资产

`blender/sample_scene.blend` 可通过 `generate_sample.py` 在无头模式下生成：

```bash
blender --background --python blender/generate_sample.py
```

生成的资产包括：

- `assets/models/lamp_post.glb` — 路灯装饰
- `assets/models/crystal.glb` — 水晶装饰
- `assets/models/workbench.glb` — 工作台（开发世界主题）

## 命名规范

```
assets/models/
  deco_<name>.glb      # 装饰物
  block_<type>.glb     # 自定义方块模型
  struct_<name>.glb    # 建筑结构
```

## 性能建议

- 合并同材质网格以减少 Draw Call
- 纹理使用 512×512 或 1024×1024，格式 PNG/WebP
- 装饰物使用 Draco 压缩（导出时勾选 Draco Mesh Compression）
- 大世界使用 InstancedMesh 复用相同模型

## 与程序化几何体的关系

当前游戏使用 Three.js 程序化几何体作为默认方块和占位装饰。Blender 导出的 GLTF 资产可逐步替换这些占位物，无需修改核心玩法逻辑。
