"""Render the finished gallery: one full-body sheet plus a portrait per preset.

    blender -b --factory-startup -noaudio --python render_all.py -- \
        --presets all --samples 220 --voxel 0.0020 --out renders

Every figure is built from scratch, lit with the same studio rig and shot on the
same lenses, so the sheet reads as one series rather than eight unrelated images.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from humanlab import bl, build, proportions, scene  # noqa: E402

ORDER = [
    "adult_male",
    "athletic_male",
    "slim_male",
    "heavy_male",
    "adult_female",
    "athletic_female",
    "child",
    "elderly_male",
]

# per-preset eye colour, so the series does not look like clones
IRIS = {
    "adult_male": "brown",
    "athletic_male": "hazel",
    "slim_male": "blue",
    "heavy_male": "brown",
    "adult_female": "green",
    "athletic_female": "brown",
    "child": "blue",
    "elderly_male": "grey",
}


def views_for(P, tall):
    """Camera setups in metres, keyed by view name."""
    H = P.height
    head_z = P.z_chin * H + 0.50 * (1 - P.z_chin) * H
    return {
        "front": dict(az=0, el=2, fit=1.10 * tall, lens=105,
                      target=(0, 0, 0.52 * tall)),
        "three": dict(az=34, el=3, fit=1.10 * tall, lens=105,
                      target=(0, 0, 0.52 * tall)),
        "side": dict(az=90, el=2, fit=1.10 * tall, lens=105,
                     target=(0, 0, 0.52 * tall)),
        "back": dict(az=180, el=2, fit=1.10 * tall, lens=105,
                     target=(0, 0, 0.52 * tall)),
        # A bust rather than a tight head shot: the face is a clean sculpt but not
        # a photograph, and it holds up far better with the hair, neck and
        # shoulders in frame than filled to the edges.
        "portrait": dict(az=24, el=1, fit=0.52, lens=135,
                         target=(0, -0.010 * H, head_z - 0.10 * H), dof=True),
        "torso": dict(az=26, el=1, fit=0.62 * H, lens=105,
                      target=(0, 0, 0.67 * H)),
    }


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--presets", default="all")
    ap.add_argument("--views", default="front,three,portrait")
    ap.add_argument("--voxel", type=float, default=0.0020)
    ap.add_argument("--samples", type=int, default=200)
    ap.add_argument("--res", default="760x1100")
    ap.add_argument("--portrait-res", default="820x1000")
    ap.add_argument("--out", default="renders")
    ap.add_argument("--hair", type=int, default=1)
    ap.add_argument("--blend", type=float, default=0.21)
    ap.add_argument("--backdrop", type=int, default=1)
    a = ap.parse_args(argv)

    names = ORDER if a.presets == "all" else a.presets.split(",")
    views = a.views.split(",")
    body_res = tuple(int(v) for v in a.res.split("x"))
    head_res = tuple(int(v) for v in a.portrait_res.split("x"))
    # the whole series shares one framing height so figures compare honestly
    tall = max(proportions.get(n).height for n in names)
    os.makedirs(a.out, exist_ok=True)

    for name in names:
        t_all = time.time()
        bl.clear_scene()
        scene.setup_render(res=body_res, samples=a.samples, denoise=True)
        scene.world_ambient(0.05)
        ch = build.build_character(name, voxel=a.voxel, clay=False,
                                  with_hair=bool(a.hair), smooth_iters=2,
                                  iris=IRIS.get(name, "brown"), blend=a.blend)
        P = ch["P"]
        if a.backdrop:
            scene.backdrop()
        scene.studio_lights(target=(0, 0, 0.60 * P.height), scale=1.35, key=3.2)
        cfg_all = views_for(P, tall)

        for v in views:
            cfg = cfg_all[v]
            res = head_res if cfg.get("dof") else body_res
            sc = scene.setup_render(res=res, samples=a.samples, denoise=True)
            del sc
            dist = scene.frame_distance(cfg["fit"], cfg["lens"], res)
            loc = scene.orbit_position(cfg["target"], dist, cfg["az"], cfg["el"])
            scene.camera(loc, cfg["target"], lens=cfg["lens"], name=f"cam_{v}",
                         dof_target=cfg["target"] if cfg.get("dof") else None,
                         fstop=3.5)
            t0 = time.time()
            p = scene.render(os.path.join(a.out, f"{name}_{v}.png"))
            print(f"[render] {p} ({time.time()-t0:.0f}s)", flush=True)
        print(f"[render] {name} done in {time.time()-t_all:.0f}s", flush=True)


main()
