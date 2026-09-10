#!/usr/bin/env python3
"""Build and render figures with Cycles.  Must be run inside Blender.

    /opt/blender/blender -b --python scripts/render.py -- --preset male_average
    /opt/blender/blender -b --python scripts/render.py -- --all --shot full
    /opt/blender/blender -b --python scripts/render.py -- \
        --preset female_average --shot portrait --samples 400 --voxel 0.003

Anything after the bare ``--`` is passed here; Blender itself consumes the rest.
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    import bpy
except ImportError:  # pragma: no cover - the message is the whole point
    raise SystemExit(
        "This script needs Blender's Python.  Run it as:\n"
        "  blender -b --python scripts/render.py -- --preset male_average"
    )

import numpy as np

from humanforge import presets
from humanforge.blend import looks
from humanforge.blend.render import RenderSettings, configure, render
from humanforge.blend.scene import SHOTS, Studio, add_camera, relight, stage
from humanforge.figure import build_figure
from humanforge.metrics import implied_bmi, implied_mass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", action="append", default=[], help="may be repeated")
    parser.add_argument("--all", action="store_true", help="render every preset")
    parser.add_argument(
        "--shot", action="append", default=[], choices=sorted(SHOTS), help="may be repeated"
    )
    parser.add_argument("--out", type=Path, default=ROOT / "out")
    parser.add_argument(
        "--voxel",
        type=float,
        default=0.0042,
        help="isosurface cell size in metres; 0.003 for close-ups",
    )
    parser.add_argument("--samples", type=int, default=220)
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1620)
    parser.add_argument("--exposure", type=float, default=0.0)
    parser.add_argument(
        "--key-power",
        type=float,
        help="watts at two metres; defaults to Studio.key_power",
    )
    parser.add_argument("--no-backdrop", action="store_true")
    parser.add_argument("--smoothing", type=int, default=4)
    parser.add_argument(
        "--draft",
        action="store_true",
        help="low samples and a coarse grid, for checking framing",
    )
    parser.add_argument(
        "--clay",
        action="store_true",
        help="matte grey instead of skin, for judging form rather than shading",
    )
    parser.add_argument(
        "--crop",
        choices=("head",),
        help="mesh only this region, so a close-up can afford a fine voxel",
    )
    parser.add_argument("--save-blend", action="store_true")
    return parser.parse_args(argv)


def head_region(figure) -> tuple[np.ndarray, np.ndarray]:
    """A box round the head, wide enough that its cut edges stay out of frame.

    Meshing cost goes as the cube of the resolution, so the spacing a face needs is
    one a whole figure cannot afford.  Restricting the volume is what makes a
    portrait at 1.3 mm cheaper than a full figure at 4 mm.
    """
    centre = figure.landmarks["head_centre"]
    reach = figure.measures.head_height * 1.35
    return (
        centre - np.array([reach, reach, reach * 1.9]),
        centre + np.array([reach, reach, reach * 0.75]),
    )


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    names = presets.names() if args.all else (args.preset or ["male_average"])
    shots = args.shot or ["full"]

    voxel = 0.007 if args.draft else args.voxel
    settings = RenderSettings(
        width=args.width // 2 if args.draft else args.width,
        height=args.height // 2 if args.draft else args.height,
        samples=24 if args.draft else args.samples,
        exposure=args.exposure,
    )
    studio = Studio(backdrop=not args.no_backdrop)
    if args.key_power is not None:
        studio = replace(studio, key_power=args.key_power)

    for name in names:
        started = time.time()
        figure = build_figure(presets.get(name))
        staged = stage(
            figure,
            skin=looks.skin(name),
            eyes=looks.eyes(name),
            voxel=voxel,
            hair=looks.hair(name),
            studio=studio,
            smoothing=args.smoothing,
            clay=args.clay,
            region=head_region(figure) if args.crop == "head" else None,
        )
        volume = staged.mesh.volume()
        print(
            f"[{name}] {staged.mesh.n_tris} triangles, "
            f"{implied_mass(volume):.1f} kg implied "
            f"(BMI {implied_bmi(volume, figure.height):.1f}), "
            f"built in {time.time() - started:.1f} s",
            flush=True,
        )

        scene = bpy.context.scene
        configure(scene, settings)
        aspect = settings.width / settings.height
        for shot_name in shots:
            shot = SHOTS[shot_name]
            relight(figure, studio, shot, aspect)
            camera = add_camera(figure, shot, aspect=aspect)
            started = time.time()
            suffix = "_clay" if args.clay else ""
            path = render(
                scene, camera, args.out / f"{name}_{shot_name}{suffix}.png", settings
            )
            print(f"[{name}] {shot_name} -> {path} in {time.time() - started:.1f} s", flush=True)

        if args.save_blend:
            blend = args.out / f"{name}.blend"
            blend.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=str(blend))
            print(f"[{name}] scene -> {blend}", flush=True)

    return 0


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    raise SystemExit(main(argv))
