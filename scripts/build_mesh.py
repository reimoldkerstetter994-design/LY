#!/usr/bin/env python3
"""Build a figure's mesh without Blender: fast loop for checking geometry.

    python3 scripts/build_mesh.py male_average --voxel 0.004 --obj /tmp/body.obj
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.polygonize import polygonize, taubin_smooth


def write_obj(path: Path, verts, tris) -> None:
    with path.open("w") as handle:
        handle.write("# humanforge\n")
        for v in verts:
            handle.write(f"v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n")
        for t in tris:
            handle.write(f"f {t[0] + 1} {t[1] + 1} {t[2] + 1}\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("preset", nargs="?", default="male_average")
    parser.add_argument("--voxel", type=float, default=0.004)
    parser.add_argument("--smooth", type=int, default=4)
    parser.add_argument("--obj", type=Path)
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    chosen = presets.names() if args.all else [args.preset]
    for name in chosen:
        params = presets.get(name)
        start = time.perf_counter()
        figure = build_figure(params)
        built = time.perf_counter()
        mesh = polygonize(figure.body, voxel=args.voxel)
        meshed = time.perf_counter()
        mesh = taubin_smooth(mesh, iterations=args.smooth)
        done = time.perf_counter()

        lo, hi = mesh.bounds()
        print(figure.measures.describe())
        print(
            f"  ops={len(figure.body):4d}  verts={mesh.n_verts:8d}  "
            f"tris={mesh.n_tris:8d}  closed={mesh.is_closed()}"
        )
        print(
            f"  bounds x[{lo[0]:+.3f},{hi[0]:+.3f}] "
            f"y[{lo[1]:+.3f},{hi[1]:+.3f}] z[{lo[2]:+.3f},{hi[2]:+.3f}]"
        )
        print(
            f"  volume={mesh.volume() * 1000:.1f} L  "
            f"build={built - start:.2f}s mesh={meshed - built:.2f}s "
            f"smooth={done - meshed:.2f}s"
        )
        if args.obj:
            target = args.obj if not args.all else args.obj.with_stem(
                f"{args.obj.stem}_{name}"
            )
            write_obj(target, mesh.verts, mesh.tris)
            print(f"  wrote {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
