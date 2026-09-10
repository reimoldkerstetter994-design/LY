# Realistic Human Studies for Blender

一个程序化生成的 Blender 成人体型研究场景，包含四种具有明显差异的角色：

- 运动型男性
- 丰满型女性
- 纤细型女性
- 成熟/老年男性

模型基于 MB-Lab 1.8.1 的连续高密度人体拓扑和皮肤贴图，保留真实面部、手指、脚趾
和身体结构，并加入年龄、体脂、肌肉量及体型差异。场景另配简洁遮挡服饰、三点式
影棚灯光和相机，适合通用展示、比例参考、绑定或继续雕刻。

## 文件

- `create_human_models.py`：可重复运行的完整生成脚本
- `realistic_human_lineup.blend`：生成后的可编辑场景
- `realistic_human_lineup.png`：1100×700 影棚预览图

## 重新生成

需要 Blender 4.0 和 MB-Lab 1.8.1。先获取 MB-Lab：

```bash
git clone --depth 1 https://github.com/animate1978/MB-Lab.git /tmp/MB-Lab
```

然后生成：

```bash
blender --background --python create_human_models.py
```

脚本会在项目根目录覆盖生成 `.blend` 和 `.png` 文件。场景中的每个解剖部件均有
清晰命名，方便在 Blender 中按角色继续合并、重拓扑、绑定骨骼或雕刻。生成的
`.blend` 会内嵌所用贴图，不依赖本机的 `/tmp/MB-Lab` 路径。

## 许可说明

生成器脚本为本仓库内容；基础人体网格和纹理来自
[MB-Lab](https://github.com/animate1978/MB-Lab)，其角色配置标注为 AGPL-3.0。
分发或改作生成的 `.blend` 时请同时遵守 MB-Lab 项目的许可要求。
