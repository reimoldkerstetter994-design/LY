# DevForge · 源码港

一座**可以玩**的 3D 游戏工作室世界：用 **Blender 4.2** 程序化建模并导出 glTF，再用 **Three.js** 做第一人称值班玩法。

你不是在看演示片。你要在黄昏的源码港里走动、对话、收集、编译、烘焙、打 Bug，最后把 v1.0 送上线。

## 玩法

1. 广场找制作人 **Mira Chen** 领简报
2. 捡齐至少 **6** 枚 Commit 晶体
3. 进入西侧 **引擎馆 Kernel Hall**，在三台终端上编译
4. 东侧 **美术馆 Mesh Atelier** 为两座雕塑烘焙
5. 西南 **QA 竞技场** 用左键调试器 squash 10 只 Bug
6. 东南 **发版码头** 提交构建并点火

隐藏：东北灌木里有一只橡胶鸭，找到后调试器伤害加倍。

### 操作

| 键 | 作用 |
| --- | --- |
| WASD / ↑ | 移动 |
| Shift | 冲刺 |
| Space | 跳 / 推进对话 |
| 鼠标 / ← → | 视角 |
| R | 重置俯仰 |
| E | 交互、对话 |
| 鼠标左键 | 调试器 |
| Esc | 暂停 |

未锁定鼠标时，方向键也可转向，方便无 Pointer Lock 的环境。

## 专业工具管线

- **Blender 4.2 LTS**（`tools/blender/export_devworld.py`）：校园、建筑、NPC、灯、交互锚点、碰撞体
- **glTF 2.0 / GLB** + `devworld_meta.json`：运行时场景与任务数据
- **Three.js** + WebGL2：渲染、阴影、ACES 色调映射
- **Web Audio**：程序化配乐与音效（无版权采样）

重新导出资产：

```bash
# 需要本机 Blender 4.2+，或设置 BLENDER_BIN
npm run blender:export
```

产物写到 `public/assets/models/`：

- `devworld.glb` — 可视场景
- `devworld_meta.json` — 出生点、NPC、任务、AABB 碰撞
- `devworld.blend` — 可回 Blender 再编

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端里给出的地址（默认 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

## 世界地图

```
        引擎馆 Kernel          美术馆 Atelier
                 \              /
                  \            /
                   广场 · 喷泉
                  /            \
                 /              \
        QA 竞技场              发版码头 Ship Dock
```
