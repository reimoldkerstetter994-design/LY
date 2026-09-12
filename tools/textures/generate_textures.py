#!/usr/bin/env python3
"""Stylized tileable albedo maps for the Devworld glTF materials."""

from __future__ import annotations

import argparse
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


def _clamp(v: float) -> int:
    return max(0, min(255, int(v)))


def _hash(ix: int, iy: int, seed: int = 0) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 4294967295.0


def _noise(x: float, y: float, seed: int) -> float:
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    u = fx * fx * (3 - 2 * fx)
    v = fy * fy * (3 - 2 * fy)
    n00 = _hash(x0, y0, seed)
    n10 = _hash(x0 + 1, y0, seed)
    n01 = _hash(x0, y0 + 1, seed)
    n11 = _hash(x0 + 1, y0 + 1, seed)
    nx0 = n00 * (1 - u) + n10 * u
    nx1 = n01 * (1 - u) + n11 * u
    return nx0 * (1 - v) + nx1 * v


def fbm(x: float, y: float, seed: int, octaves: int = 5) -> float:
    amp, freq, total, norm = 1.0, 1.0, 0.0, 0.0
    for _ in range(octaves):
        total += amp * _noise(x * freq, y * freq, seed)
        norm += amp
        amp *= 0.5
        freq *= 2.05
    return total / norm


def _save(img: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print(f"wrote {path} {img.size[0]}x{img.size[1]}")


def grass(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 48.0, y / 48.0, 11)
            n2 = fbm(x / 12.0, y / 12.0, 19)
            g = 78 + 70 * n + 24 * n2
            r = 42 + 30 * n - 8 * n2
            b = 68 + 36 * n
            if ((x * 17 + y * 13) % 47) == 0:
                g += 40
                r += 18
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img.filter(ImageFilter.GaussianBlur(0.4))


def dirt(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 36.0, y / 36.0, 3)
            r = 92 + 48 * n
            g = 64 + 28 * n
            b = 46 + 16 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def rock(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 40.0, y / 40.0, 7)
            c = 96 + 70 * n
            if n > 0.62:
                c += 18
            px[x, y] = (_clamp(c), _clamp(c * 0.98), _clamp(c * 0.94))
    return img.filter(ImageFilter.SMOOTH)


def cobble(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (118, 112, 104))
    draw = ImageDraw.Draw(img)
    rng = random.Random(42)
    cell = 28
    for gy in range(-1, size // cell + 2):
        for gx in range(-1, size // cell + 2):
            ox = gx * cell + rng.randint(-4, 4)
            oy = gy * cell + rng.randint(-4, 4)
            jitter = rng.randint(-10, 12)
            col = (126 + jitter, 120 + jitter, 112 + jitter // 2)
            draw.rounded_rectangle(
                (ox + 2, oy + 2, ox + cell - 4, oy + cell - 5),
                radius=6,
                fill=col,
                outline=(72, 68, 62),
                width=2,
            )
    return img.filter(ImageFilter.SMOOTH)


def plaster(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 64.0, y / 64.0, 29)
            grain = _hash(x, y, 4) * 10
            r = 214 + 18 * n + grain * 0.2
            g = 208 + 14 * n
            b = 196 + 10 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def roof(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (36, 92, 96))
    draw = ImageDraw.Draw(img)
    for y in range(0, size, 10):
        shade = 8 if (y // 10) % 2 == 0 else 0
        draw.rectangle((0, y, size, y + 9), fill=(28 + shade, 108 + shade, 112 + shade))
        draw.line((0, y, size, y), fill=(18, 64, 70))
    return img


def metal(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 28.0, y / 10.0, 41)
            c = 58 + 40 * n
            if x % 32 < 2:
                c *= 0.55
            px[x, y] = (_clamp(c), _clamp(c + 6), _clamp(c + 10))
    return img


def wood(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            grain = math.sin((x + 8 * math.sin(y / 18.0)) / 6.5)
            n = 0.5 + 0.5 * grain + 0.15 * fbm(x / 20.0, y / 20.0, 17)
            r = 118 + 50 * n
            g = 78 + 28 * n
            b = 46 + 12 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def bark(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 10.0, y / 28.0, 23)
            r = 72 + 40 * n
            g = 48 + 22 * n
            b = 34 + 10 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def leaves(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (28, 110, 86))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 18.0, y / 18.0, 31)
            r = 22 + 40 * n
            g = 96 + 90 * n
            b = 70 + 40 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def sand(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = fbm(x / 40.0, y / 40.0, 5)
            r = 198 + 32 * n
            g = 176 + 24 * n
            b = 128 + 16 * n
            px[x, y] = (_clamp(r), _clamp(g), _clamp(b))
    return img


def neon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), (8, 22, 32))
    draw = ImageDraw.Draw(img)
    for i in range(6):
        y = 20 + i * 18
        draw.rectangle((16, y, size - 16, y + 6), fill=(40, 230, 220))
    draw.rectangle((size // 2 - 8, 12, size // 2 + 8, size - 12), fill=(255, 196, 64))
    return ImageEnhance.Brightness(img).enhance(1.15)


GENERATORS = {
    "grass": grass,
    "dirt": dirt,
    "rock": rock,
    "cobble": cobble,
    "plaster": plaster,
    "roof": roof,
    "metal": metal,
    "wood": wood,
    "bark": bark,
    "leaves": leaves,
    "sand": sand,
    "neon": neon,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="assets/textures")
    parser.add_argument("--size", type=int, default=512)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for name, fn in GENERATORS.items():
        _save(fn(args.size), os.path.join(args.out, f"{name}.png"))


if __name__ == "__main__":
    main()
