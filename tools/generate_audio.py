#!/usr/bin/env python3
"""Procedural game audio for KERNEL RIDGE (stdlib only)."""
from __future__ import annotations

import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "audio")
os.makedirs(OUT, exist_ok=True)

SR = 44100
rng = random.Random(3)


def clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def write_wav(name: str, samples: list[float]) -> None:
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", int(clamp(s) * 32767)) for s in samples)
        w.writeframes(frames)
    print(f"audio {name} {os.path.getsize(path)} bytes")


def env(i: int, n: int, a: float, d: float) -> float:
    t = i / max(1, n)
    if t < a:
        return t / max(1e-6, a)
    if t > 1.0 - d:
        return max(0.0, (1.0 - t) / max(1e-6, d))
    return 1.0


def tone(freq, n, amp=0.3, a=0.02, d=0.2):
    return [
        amp * env(i, n, a, d) * math.sin(2 * math.pi * freq * i / SR)
        for i in range(n)
    ]


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def pickup():
    n = int(SR * 0.35)
    return mix(
        tone(660, n, 0.22, 0.01, 0.5),
        tone(990, n, 0.16, 0.02, 0.55),
        tone(1320, n, 0.1, 0.04, 0.6),
    )


def hurt():
    n = int(SR * 0.28)
    out = []
    for i in range(n):
        t = i / SR
        out.append(
            0.28 * env(i, n, 0.005, 0.4) * math.sin(2 * math.pi * (180 - t * 220) * t)
            + 0.08 * rng.uniform(-1, 1) * env(i, n, 0.0, 0.5)
        )
    return out


def hit():
    n = int(SR * 0.18)
    return [
        0.3 * env(i, n, 0.002, 0.5) * math.sin(2 * math.pi * (420 + i * 0.4) * i / SR)
        + 0.12 * rng.uniform(-1, 1) * env(i, n, 0.0, 0.6)
        for i in range(n)
    ]


def jump():
    n = int(SR * 0.22)
    return [
        0.2 * env(i, n, 0.01, 0.4) * math.sin(2 * math.pi * (220 + 540 * i / n) * i / SR)
        for i in range(n)
    ]


def step():
    n = int(SR * 0.09)
    return [0.12 * rng.uniform(-1, 1) * env(i, n, 0.005, 0.55) for i in range(n)]


def talk():
    n = int(SR * 0.16)
    return [
        0.14 * env(i, n, 0.01, 0.3) * math.sin(2 * math.pi * (520 + 80 * math.sin(i / 80)) * i / SR)
        for i in range(n)
    ]


def click():
    n = int(SR * 0.07)
    return [
        0.18 * env(i, n, 0.001, 0.6) * math.sin(2 * math.pi * 1400 * i / SR) for i in range(n)
    ]


def compile_sfx():
    n = int(SR * 1.4)
    out = []
    for i in range(n):
        t = i / SR
        out.append(
            0.16 * env(i, n, 0.05, 0.25) * math.sin(2 * math.pi * (110 + t * 40) * t * 8)
            + 0.12 * env(i, n, 0.1, 0.3) * math.sin(2 * math.pi * 330 * t)
            + 0.08 * env(i, n, 0.2, 0.2) * math.sin(2 * math.pi * 660 * t)
        )
    return out


def win():
    n = int(SR * 2.2)
    freqs = [523.25, 659.25, 783.99, 1046.5]
    out = [0.0] * n
    for k, f in enumerate(freqs):
        start = int(SR * (0.12 * k))
        for i in range(n - start):
            out[start + i] += 0.14 * env(i, n - start, 0.02, 0.35) * math.sin(
                2 * math.pi * f * i / SR
            )
    return out


def ambient():
    n = int(SR * 12)
    out = []
    for i in range(n):
        t = i / SR
        drone = 0.05 * math.sin(2 * math.pi * 55 * t)
        drone += 0.04 * math.sin(2 * math.pi * 82.4 * t + 0.4)
        pad = 0.03 * math.sin(2 * math.pi * 220 * t + math.sin(t * 0.3))
        wind = 0.02 * math.sin(2 * math.pi * 0.15 * t) * rng.uniform(0.4, 1.0)
        out.append(drone + pad + wind)
    return out


def main() -> None:
    write_wav("pickup.wav", pickup())
    write_wav("hurt.wav", hurt())
    write_wav("hit.wav", hit())
    write_wav("jump.wav", jump())
    write_wav("step.wav", step())
    write_wav("talk.wav", talk())
    write_wav("click.wav", click())
    write_wav("compile.wav", compile_sfx())
    write_wav("win.wav", win())
    write_wav("ambient.wav", ambient())
    print("audio pipeline complete")


if __name__ == "__main__":
    main()
