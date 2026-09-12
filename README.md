# Dev World 3D — 3D 开发世界

一个可玩的 3D 方块建造沙盒游戏，使用 **Blender** 生成 3D 资产，**Three.js** 驱动实时渲染，**Vite** 提供开发服务器。

## 功能特性

- 程序化地形生成（平原、森林、沙漠生物群系）
- 9 种方块类型：草、泥土、石头、木头、树叶、沙子、砖块、玻璃、水
- 第一人称视角：行走、跳跃、飞行模式
- 方块放置与破坏（射线检测）
- 世界保存/加载（本地存储）
- Blender 资产管线：自动生成方块模型与世界道具

## 快速开始

```bash
# 安装依赖
cd game && npm install

# 生成 Blender 3D 资产（可选）
chmod +x scripts/build-assets.sh
./scripts/build-assets.sh

# 启动开发服务器
npm run dev
```

打开 http://localhost:5173 开始游戏。

## 操作说明

| 按键 | 功能 |
|------|------|
| W A S D | 移动 |
| 鼠标 | 视角 |
| 空格 | 跳跃 / 上升（飞行） |
| Shift | 下降（飞行模式） |
| 左键 | 破坏方块 |
| 右键 | 放置方块 |
| 1-9 | 选择方块类型 |
| E | 切换飞行模式 |
| R | 重置世界 |
| Ctrl+S | 保存世界 |

## 项目结构

```
├── game/                  # Three.js 游戏客户端
│   ├── src/
│   │   ├── main.js        # 入口
│   │   ├── game/          # 游戏逻辑
│   │   │   ├── Game.js    # 主游戏循环
│   │   │   ├── World.js   # 区块世界与地形
│   │   │   ├── Player.js  # 玩家物理与控制
│   │   │   ├── BlockTypes.js
│   │   │   └── Noise.js   # 地形噪声
│   │   └── styles/
│   └── index.html
├── blender/               # Blender Python 脚本
│   ├── generate_blocks.py      # 方块模型生成
│   └── generate_world_props.py # 世界道具生成
├── assets/                # 生成的 3D 资产
│   └── models/            # GLB 模型文件
└── scripts/
    └── build-assets.sh    # 资产构建脚本
```

## Blender 资产管线

使用 Blender 4.x 无头模式批量生成 GLB 模型：

```bash
# 生成所有方块模型
blender --background --python blender/generate_blocks.py

# 生成世界道具（长椅、路灯、喷泉）
blender --background --python blender/generate_world_props.py
```

生成的模型保存在 `assets/models/` 目录，可直接导入 Three.js 使用。

### 自定义方块

编辑 `blender/generate_blocks.py` 中的 `BLOCKS` 列表，添加新方块定义后重新运行构建脚本。

## 技术栈

- **Three.js** — WebGL 3D 渲染
- **Vite** — 开发服务器与构建工具
- **Blender** — 3D 模型与资产创建
- **GLB/glTF** — 3D 资产交换格式

## 构建生产版本

```bash
cd game && npm run build
npm run preview
```
