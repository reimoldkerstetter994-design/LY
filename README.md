# DevWorld 3D — 开发世界

一个可玩的 3D 沙盒建造游戏，使用 **Blender** 生成 3D 资产，**Three.js** 驱动实时渲染。

## 功能

- 程序化地形生成（草地、泥土、石头）
- 8 种可放置方块（草地、泥土、石头、木材、玻璃、砖块、金属、发光块）
- 4 种 Blender 制作的装饰道具（树木、水晶、工作台、灯）
- 第一人称视角：WASD 移动、鼠标视角、跳跃、冲刺
- 左键放置 / 右键拆除方块
- 按 E 切换道具放置模式
- 自动保存到浏览器本地存储

## 技术栈

| 工具 | 用途 |
|------|------|
| Blender 4.0 | 3D 模型与材质制作，导出 GLB |
| Three.js | WebGL 3D 渲染引擎 |
| Vite | 开发服务器与构建工具 |

## 快速开始

```bash
# 安装依赖
npm install

# 生成 Blender 资产（需已安装 Blender）
npm run assets

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

打开浏览器访问 `http://localhost:5173`，点击「进入世界」开始游戏。

## 操作说明

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| 鼠标 | 视角 |
| 空格 | 跳跃 |
| Shift | 冲刺 |
| 左键 | 放置方块/道具 |
| 右键 | 拆除方块 |
| 1-8 | 选择方块类型 |
| E | 切换道具（树/水晶/工作台/灯） |
| R | 重置世界 |

## 项目结构

```
├── tools/blender/          # Blender 资产生成脚本
│   └── generate_assets.py
├── public/assets/models/   # 导出的 GLB 模型
├── src/
│   ├── game/
│   │   ├── World.js        # 世界与方块管理
│   │   ├── Player.js       # 第一人称控制器
│   │   ├── BlockTypes.js   # 方块与道具定义
│   │   └── UI.js           # 游戏界面
│   ├── main.js             # 游戏入口
│   └── style.css           # UI 样式
└── index.html
```

## 资产管线

Blender 脚本 `tools/blender/generate_assets.py` 自动生成所有游戏模型：

```bash
blender --background --python tools/blender/generate_assets.py
```

生成的 GLB 文件保存在 `public/assets/models/`，游戏运行时通过 GLTFLoader 加载。
