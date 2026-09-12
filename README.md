# KERNEL RIDGE · 源码岭

可玩的第三人称 **3D 开放世界**。场景、建筑、角色与道具由 **Blender 4** 程序化建模并导出为 glTF；运行时使用 **Three.js**（ACES 色调映射、软阴影、Bloom）；音效由 Python 合成。

## 怎么玩

本地运行：

```bash
npm install
npm run dev
```

打开提示的本地地址。点击 **进入源码岭**。

有 Blender 时可用 `npm run assets` 重建模型，`npm run audio` 重建音效。有 Chrome 时可用 `npm run test:play` 自动走一遍主线。

| 操作 | 作用 |
| --- | --- |
| WASD / 方向键 | 移动 |
| 鼠标 | 视角（点击画布锁定指针，也可按住拖拽） |
| 空格 | 跳跃 |
| Shift | 冲刺 |
| E | 对话 / 拾取 / 读终端 / 编译 |
| 左键 | 驱散空值虫 |
| Esc | 暂停 |

主线：在引导营地与 **BOOT** 对话 → 在五个地标收集核心碎片 → 回到编译之塔终端 **编译内核**。

地标：引导营地、编译之塔、包市场、版本峡谷、运行时竞技场、内存湖、空值之林。

## 重新生成资产

需要已安装的 Blender（headless）与 Python 3：

```bash
npm run assets
npm run audio
```

脚本入口：

- `blender/generate_assets.py` — 岛屿地形、建筑、碰撞体、碎片、玩家与敌人 GLB
- `tools/generate_audio.py` — `public/assets/audio/*.wav`
