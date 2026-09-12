# DevWorld — 3D 开发世界游戏

一个可玩的 3D 沙盒游戏，融合开发主题玩法。使用 **Three.js** 作为游戏引擎，**Blender** 作为 3D 资产创作工具。

## 特性

- **3D 浮岛世界** — 可自由探索的程序化地形
- **FPS 操控** — WASD 移动、鼠标环顾、跳跃
- **方块建造** — 放置/拆除草地、石头、代码块、玻璃
- **代码终端** — 交互式终端，完成 commit → build → deploy 谜题
- **任务系统** — 收集 Bug、提交 Commit、建造基地
- **Blender 资产管线** — 专业 3D 工具链，GLB 格式导入

## 快速开始

```bash
cd devworld-game
npm install
npm run generate-assets   # 生成 GLB 模型
npm run dev               # 启动开发服务器
```

打开 http://localhost:5173 开始游戏。

## 操作说明

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| 鼠标 | 环顾 |
| 空格 | 跳跃 |
| 左键 | 放置方块 |
| 右键 | 拆除方块 |
| E | 交互（终端/Bug） |
| 1-4 | 切换方块类型 |

## 技术栈

| 工具 | 用途 |
|------|------|
| Three.js | 3D 渲染与游戏逻辑 |
| Vite | 构建与开发服务器 |
| Blender | 3D 资产建模与导出 |
| glTF/GLB | 3D 资产交换格式 |

## 项目结构

```
devworld-game/
├── src/
│   ├── game/          # 游戏核心逻辑
│   │   ├── Game.js    # 主游戏循环
│   │   ├── Player.js  # 玩家控制
│   │   ├── World.js   # 3D 世界生成
│   │   ├── BlockSystem.js  # 方块放置
│   │   ├── Terminal.js     # 终端谜题
│   │   └── QuestSystem.js  # 任务系统
│   └── styles/        # UI 样式
├── blender/           # Blender 资产管线
├── public/models/     # GLB 3D 模型
└── scripts/           # 资产生成脚本
```

## 生产构建

```bash
npm run build
npm run preview
```

构建产物在 `dist/` 目录，可部署到任意静态托管服务。
