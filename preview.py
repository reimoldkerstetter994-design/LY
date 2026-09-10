"""Fast clay preview used while dialling in the anatomy.

    blender -b --factory-startup --python preview.py -- \
        --preset athletic_male --voxel 0.003 --samples 20 --views front,side,face
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from humanlab import bl, build, scene  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="athletic_male")
    ap.add_argument("--voxel", type=float, default=0.003)
    ap.add_argument("--samples", type=int, default=20)
    ap.add_argument("--res", default="520x760")
    ap.add_argument("--views", default="front,side,back,face")
    ap.add_argument("--out", default="out/preview")
    ap.add_argument("--clay", type=int, default=1)
    ap.add_argument("--hair", type=int, default=0)
    ap.add_argument("--smooth", type=int, default=2)
    ap.add_argument("--blend", type=float, default=0.24)
    a = ap.parse_args(argv)

    rx, ry = (int(v) for v in a.res.split("x"))
    bl.clear_scene()
    scene.setup_render(res=(rx, ry), samples=a.samples, denoise=True)
    scene.world_ambient(0.06)

    t0 = time.time()
    ch = build.build_character(a.preset, voxel=a.voxel, clay=bool(a.clay),
                              with_hair=bool(a.hair), smooth_iters=a.smooth,
                              blend=a.blend)
    print(f"[preview] build took {time.time()-t0:.1f}s", flush=True)
    P = ch["P"]
    H = P.height
    scene.studio_lights(target=(0, 0, 0.62 * H), scale=1.3, key=3.4)

    head_z = P.z_chin * H + 0.52 * (1 - P.z_chin) * H
    views = {
        "front": dict(az=0, el=3, fit=1.16 * H, lens=85, target=(0, 0, 0.53 * H)),
        "side": dict(az=90, el=3, fit=1.16 * H, lens=85, target=(0, 0, 0.53 * H)),
        "back": dict(az=180, el=3, fit=1.16 * H, lens=85, target=(0, 0, 0.53 * H)),
        "three": dict(az=38, el=5, fit=1.16 * H, lens=85, target=(0, 0, 0.53 * H)),
        "face": dict(az=16, el=0, fit=0.30, lens=105, target=(0, -0.01 * H, head_z)),
        "torso": dict(az=22, el=2, fit=0.55 * H, lens=85, target=(0, 0, 0.68 * H)),
        "hand": dict(az=115, el=-4, fit=0.27, lens=100,
                     target=((P.shoulder_x + P.arm_abduct) * H, -0.015 * H,
                             (P.z_wrist - 0.058) * H)),
        "palm": dict(az=-62, el=-4, fit=0.27, lens=100,
                     target=((P.shoulder_x + P.arm_abduct) * H, -0.015 * H,
                             (P.z_wrist - 0.058) * H)),
        "foot": dict(az=45, el=10, fit=0.34, lens=90,
                     target=(P.ankle_x * H, -0.03 * H, 0.035 * H)),
        "foot_in": dict(az=-88, el=6, fit=0.32, lens=90,
                        target=(P.ankle_x * H, -0.03 * H, 0.040 * H)),
    }
    os.makedirs(a.out, exist_ok=True)
    for v in a.views.split(","):
        cfg = views[v]
        dist = scene.frame_distance(cfg["fit"], cfg["lens"], (rx, ry))
        loc = scene.orbit_position(cfg["target"], dist, cfg["az"], cfg["el"])
        scene.camera(loc, cfg["target"], lens=cfg["lens"], name=f"cam_{v}")
        t0 = time.time()
        p = scene.render(os.path.join(a.out, f"{a.preset}_{v}.png"))
        print(f"[preview] {v} -> {p} ({time.time()-t0:.1f}s)", flush=True)


main()
