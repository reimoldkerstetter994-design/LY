# 角色描述文件格式

每个 `*.json` 描述一个角色，由 `scripts/build_human.py` 读取后交给 MPFB 生成。

```jsonc
{
  "name": "mei_lin",                    // 文件名/输出名（可省略，默认取文件名）
  "display_name": "梅琳 · 25 岁东亚女性",
  "description": "……",

  // 宏参数（MakeHuman 语义，全部 0~1）
  "phenotype": {
    "gender": 0.0,        // 0 = 女性, 1 = 男性
    "age": 0.5,           // 0 ≈ 1 岁, 0.1875 ≈ 11 岁, 0.5 = 25 岁, 1 ≈ 90 岁
    "muscle": 0.5,        // 肌肉量
    "weight": 0.5,        // 体重/脂肪
    "proportions": 0.5,   // 0 = 常见比例, 1 = 理想化比例
    "height": 0.5,
    "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.33, "caucasian": 0.33, "african": 0.33}
  },

  // 细节修形目标（MakeHuman target 名 → 权重）。左右对称的目标带 l-/r- 前缀。
  // 可用名称见 MPFB 的 data/targets/*/ 目录，例如 nose-hump-incr、l-eye-bag-incr、torso-vshape-incr。
  "targets": {"head-oval": 0.35, "chin-width-decr": 0.25},

  "skin": "young_asian_female.mhmat",   // 皮肤材质（skins 资源包中的 .mhmat 文件名）
  "skin_settings": {                    // 覆盖 Enhanced SSS 皮肤节点组的参数（按材质槽）
    "body": {"Roughness": 0.4, "SSS strength": 0.3, "Pore strength": 0.4}
  },

  "eyes": "high-poly.mhclo",            // 可省略
  "eye_color": "brown",                 // blue / bluegreen / brown / brownlight / deepblue / green / grey / ice / lightblue
  "eyebrows": "eyebrow006.mhclo",
  "eyelashes": "eyelashes02.mhclo",
  "hair": "long01.mhclo",               // hair 资源包中的 .mhclo
  "hair_color": {"hue": 0.5, "saturation": 0.55, "value": 0.35},   // 可选：HSV 调色（0.5 = 不改变色相）
  "clothes": ["female_casualsuit01.mhclo", "shoes02.mhclo"],
  "clothes_colors": {"female_casualsuit01.mhclo": {"hue": 0.32, "saturation": 0.8, "value": 0.9}},

  // 表情：ARKit 52 个面部单元（faceunits01 资源包），名称如 mouthSmileLeft、eyeBlinkLeft、jawOpen、browInnerUp
  "expression": {"mouthSmileLeft": 0.35, "mouthSmileRight": 0.35},

  // 姿势：预设（scripts/poses.py 中的 relaxed / contrapposto / hands_on_hips / casual / athletic / apose）
  // 或 BVH 文件（poses01/poses02 资源包），可再叠加 extra 步骤微调
  "pose": {"preset": "relaxed", "extra": [["world", "head", [0, 0, 1], 10.0]]},
  // "pose": {"bvh": "callharvey3d_lotus.bvh"},

  // 镜头覆盖（可省略）：full / portrait / three_quarter
  "shots": {"full": {"azimuth": 25.0, "elevation": 5.0}},

  // 场景：Blender 自带 HDRI（studio / interior / courtyard / forest / city / sunset / sunrise / night .exr）
  "scene": {"hdri": "studio.exr", "hdri_strength": 0.25, "backdrop_color": [0.22, 0.22, 0.24], "key_energy": 300}
}
```
