#!/usr/bin/env python3
"""Turn action keyframes into looping 30fps videos via motion interpolation."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace/wallpaper")
ACT = ROOT / "assets" / "act"
OUT = ROOT / "assets" / "vid"
OUT.mkdir(parents=True, exist_ok=True)

SCENES = {
    "storm": {
        "beat": [0, 1, 2, 3, 4],
        "sizeL": (1280, 720),
        "sizeP": (720, 1280),
    },
    "sakura": {
        "beat": [0, 1, 2, 3, 4],
        "sizeL": (1280, 720),
        "sizeP": (720, 1280),
    },
    "hanabi": {
        "beat": [0, 1, 2, 3, 4],
        "sizeL": (1280, 720),
        "sizeP": (720, 1280),
    },
    "tide": {
        "beat": [0, 1, 2, 3, 4],
        "sizeL": (1280, 720),
        "sizeP": (720, 1280),
    },
    "moonlit": {
        "beat": [0, 1, 2, 3, 4],
        "sizeL": (1280, 720),
        "sizeP": (720, 1280),
    },
}


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = max(tw / im.width, th / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def write_sequence(scene: str, orient: str, dest: Path) -> int:
    spec = SCENES[scene]
    size = spec["sizeL"] if orient == "l" else spec["sizeP"]
    beat = spec["beat"][:]
    if beat[-1] != beat[0]:
        beat.append(beat[0])
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    for pose in beat:
        src = ACT / f"{scene}-{orient}-{pose + 1}.jpg"
        im = cover(Image.open(src).convert("RGB"), size)
        n += 1
        im.save(dest / f"{n:03d}.jpg", "JPEG", quality=90)
    return n


def encode(seq_dir: Path, out_file: Path, size: tuple[int, int]) -> None:
    w, h = size
    vf = (
        f"minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,"
        f"scale={w}:{h}:flags=lanczos"
    )
    cmd = [
        "ffmpeg", "-y",
        "-framerate", "1.2",
        "-i", str(seq_dir / "%03d.jpg"),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an",
        str(out_file),
    ]
    print("encode", out_file.name)
    subprocess.run(cmd, check=True)


def build(only: str | None = None) -> None:
    jobs = []
    for scene in SCENES:
        if only and scene != only:
            continue
        for orient in ("l", "p"):
            jobs.append((scene, orient))
    for scene, orient in jobs:
        size = SCENES[scene]["sizeL"] if orient == "l" else SCENES[scene]["sizeP"]
        out_file = OUT / f"{scene}-{orient}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            n = write_sequence(scene, orient, Path(tmp))
            print(scene, orient, "stills", n)
            encode(Path(tmp), out_file, size)
        print("wrote", out_file, out_file.stat().st_size // 1024, "KB")
    print("done")


if __name__ == "__main__":
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else None)
