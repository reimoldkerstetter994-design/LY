# DevWorld — 3D 开发世界

可玩的 3D 沙盒建造游戏，使用 **Three.js** 构建运行时，**Blender** 作为专业 3D 资产工具链。

## 功能

- 第一人称探索：WASD 移动、鼠标视角、空格跳跃
- 方块建造：左键放置、右键拆除，5 种材质
- 程序化地形生成 + 示例建筑（树、平台）
- 自动存档（localStorage）与 JSON 导出
- Blender → glTF 资产管线与示例脚本

## 快速开始

```bash
cd game
npm install
npm run dev
```

浏览器打开 http://localhost:5173 ，点击「点击进入世界」开始游戏。

### 操作说明

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| 空格 | 跳跃 |
| 鼠标 | 视角 |
| 左键 | 放置方块 |
| 右键 | 拆除方块 |
| 1-5 | 切换方块类型 |
| Esc | 暂停菜单 |

## 项目结构

```
├── game/           # Three.js 游戏（Vite + TypeScript）
├── blender/        # Blender 导出脚本与资产管线文档
├── assets/         # 游戏资产（GLTF 模型、纹理）
└── README.md
```

## Blender 资产工作流

详见 [blender/README.md](blender/README.md)。

```bash
# 生成示例 GLTF 资产（需要安装 Blender）
blender --background --python blender/generate_sample.py
```

## 构建部署

```bash
cd game
npm run build
npm run preview
```

构建产物在 `game/dist/`，可部署到任意静态托管服务。

## 技术栈

- **Three.js** — WebGL 3D 渲染
- **Vite** — 开发服务器与打包
- **TypeScript** — 类型安全
- **Blender** — 3D 建模与 glTF 导出
