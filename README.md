# Realistic Human Body Models (Blender)

Procedural pipeline that builds **photorealistic human body models** in [Blender](https://www.blender.org/) using the open-source [MB-Lab](https://github.com/animate1978/MB-Lab) character system, then dresses them in simple athletic clothing and renders a studio set.

MB-Lab provides anatomically based base meshes, ethnic phenotypes, skin shaders with subsurface scattering, and anthropometric morphs. This repo wraps that into a headless generator so you can recreate a diverse lineup of adult humans without clicking through the add-on UI.

## What you get

Eight adult figures covering sex, ancestry, age, and body type:

| Key | Description |
| --- | --- |
| `caucasian_male_adult` | Athletic adult Caucasian male |
| `caucasian_female_adult` | Average adult Caucasian female |
| `asian_male_adult` | Average adult Asian male |
| `asian_female_adult` | Slender adult Asian female |
| `afro_male_adult` | Athletic adult Afro male |
| `afro_female_adult` | Average adult Afro female |
| `latino_male_mature` | Mature Latino male, heavier build |
| `latino_female_young` | Younger Latino female |

Each character is exported as:

- Full-body studio render (`output/renders/<key>_fullbody.png`)
- Head-and-shoulders portrait (`output/renders/<key>_portrait.png`)

A lineup render is written to `output/renders/gallery_full_lineup.png`. The generated Blender scene is saved as `output/blend/realistic_humans.blend`.

Figures wear a fitted base layer, T-shirt, and shorts so the models stay suitable for a public repository while still showing realistic proportion, skin, and facial structure.

## Requirements

- Linux (tested on Ubuntu 24.04)
- [Blender 4.2 LTS](https://download.blender.org/release/Blender4.2/) (MB-Lab 1.8.1 needs Blender 4.0+)
- [MB-Lab 1.8.1](https://github.com/animate1978/MB-Lab) cloned locally
- CPU render is enough; no GPU required (Cycles + OpenImageDenoise)

Default paths expected by `scripts/run_generate.sh`:

```text
~/tools/blender-4.2.9-linux-x64/blender
~/tools/MB-Lab
```

Override with `BLENDER=` and `MBLAB_SRC=`.

## Generate

```bash
chmod +x scripts/run_generate.sh
./scripts/run_generate.sh
```

Useful flags (everything after `--` is passed to the Python script):

```bash
# Fast low-sample check of a single character
./scripts/run_generate.sh --preview --only caucasian_male_adult

# Custom sample count
./scripts/run_generate.sh --samples 48
```

The wrapper enables the add-on as `MBLab` (Blender rejects dots in add-on folder names) and runs Blender in background mode.

## Pipeline (what the script does)

1. Enable MB-Lab and clear the default scene.
2. For each character: create the ethnic template, apply a body-type preset, add realistic facial variation, set age / mass / muscle tone, switch to an A-pose, and finalize to a standard Blender mesh + armature.
3. Build fitted clothing and a short hair cap from the body surface, then bind them to the armature.
4. Load a standing laboratory / portrait pose.
5. Light a three-point studio and render Cycles stills with denoising.

## License notes

- Generator scripts in this repository: MIT (see below).
- MB-Lab itself and characters derived from its base meshes / textures are **AGPL-3.0**. Keep that license if you redistribute the `.blend` files or MB-Lab assets.
- Do not vendor MB-Lab into this repo; clone it separately.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files to use, copy, modify, and
distribute it, subject to the AGPL terms of any MB-Lab derived assets.
```
