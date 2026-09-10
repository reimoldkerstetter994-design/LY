# Realistic Human Studies for Blender

一个程序化生成的 Blender 成人体型研究场景，包含四种具有明显差异的角色：

- 运动型男性
- 丰满型女性
- 纤细型女性
- 成熟/老年男性

模型采用符合人体比例的分段解剖体块、平滑过渡、皮肤次表面散射、微表面纹理、
眼睛/虹膜/眉毛/头发细节，以及三点式影棚灯光。敏感部位使用简洁运动短裤遮盖，
适合通用展示、比例参考和进一步雕刻。

## 文件

- `create_human_models.py`：可重复运行的完整生成脚本
- `realistic_human_lineup.blend`：生成后的可编辑场景
- `realistic_human_lineup.png`：1100×700 影棚预览图

## 重新生成

需要 Blender 4.0 或更新版本：

```bash
blender --background --python create_human_models.py
```

脚本会在项目根目录覆盖生成 `.blend` 和 `.png` 文件。场景中的每个解剖部件均有
清晰命名，方便在 Blender 中按角色继续合并、重拓扑、绑定骨骼或雕刻。
