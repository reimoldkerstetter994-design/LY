#!/usr/bin/env python3
"""Compare the built figures against published anthropometric ranges.

Run this after touching anything that changes shape.  Every measurement is
compared with the range a real body of that stature and build occupies, so a
tweak that makes a preset look better but pushes its waist to 120 cm shows up
immediately.

    python3 scripts/calibrate.py
    python3 scripts/calibrate.py male_average female_curvy
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.metrics import body_metrics, implied_bmi, implied_mass
from humanforge.polygonize import polygonize

# Acceptable ranges in centimetres, plus the target BMI band.  Values follow
# ANSUR II percentiles scaled to each preset's stature and build, widened to
# roughly one standard deviation: the point is to catch a girth that no real
# body of that size has, not to pin each preset to a population mean.
TARGETS: dict[str, dict[str, tuple[float, float]]] = {
    "male_average": {
        "bmi": (22.0, 25.5),
        "neck_girth": (36.0, 41.0),
        "chest_girth": (94.0, 104.0),
        "waist_girth": (80.0, 92.0),
        "hip_girth": (92.0, 102.0),
        "upper_arm_girth": (29.0, 35.0),
        "forearm_girth": (26.0, 30.0),
        "wrist_girth": (16.0, 19.0),
        "thigh_girth": (49.0, 58.0),
        "knee_girth": (35.0, 41.0),
        "calf_girth": (34.0, 40.0),
        "ankle_girth": (21.0, 25.0),
        "head_girth": (54.0, 60.0),
        "shoulder_width": (44.0, 51.0),
        "crotch_height": (0.465, 0.505),
    },
    "female_average": {
        "bmi": (20.5, 24.5),
        "neck_girth": (30.0, 35.0),
        "chest_girth": (84.0, 98.0),
        "waist_girth": (66.0, 86.0),
        "hip_girth": (92.0, 102.0),
        "upper_arm_girth": (25.0, 31.0),
        "forearm_girth": (22.0, 26.0),
        "wrist_girth": (14.0, 17.0),
        "thigh_girth": (47.0, 57.0),
        "knee_girth": (33.0, 39.0),
        "calf_girth": (31.0, 37.0),
        "ankle_girth": (19.0, 23.0),
        "head_girth": (52.0, 58.0),
        "shoulder_width": (39.0, 45.0),
        "crotch_height": (0.455, 0.500),
    },
    "male_athletic": {
        "bmi": (23.0, 27.0),
        "waist_girth": (74.0, 86.0),
        "chest_girth": (98.0, 112.0),
        "upper_arm_girth": (32.0, 39.0),
        "thigh_girth": (53.0, 64.0),
        "calf_girth": (36.0, 43.0),
    },
    "male_heavy": {
        "bmi": (29.0, 36.0),
        "waist_girth": (105.0, 128.0),
        "chest_girth": (108.0, 124.0),
    },
    "female_curvy": {
        "bmi": (24.0, 29.0),
        "waist_girth": (76.0, 96.0),
        "hip_girth": (100.0, 118.0),
    },
    "child": {
        "bmi": (14.0, 18.5),
        "head_girth": (50.0, 55.0),
        "waist_girth": (52.0, 64.0),
    },
    "elder_male": {
        "bmi": (23.0, 29.0),
        "waist_girth": (88.0, 104.0),
    },
}


def main() -> int:
    wanted = sys.argv[1:] or list(TARGETS)
    failures = 0

    for name in wanted:
        params = presets.get(name)
        figure = build_figure(params)
        volume = polygonize(figure.body, voxel=0.007).volume()
        metrics = body_metrics(figure)
        metrics["bmi"] = implied_bmi(volume, params.height)

        print(f"{name}  ({params.height * 100:.0f} cm, {implied_mass(volume):.1f} kg)")
        for key, (low, high) in TARGETS.get(name, {}).items():
            ratio = key == "crotch_height"
            value = metrics[key] if ratio or key == "bmi" else metrics[key] * 100.0
            ok = low <= value <= high
            failures += 0 if ok else 1
            flag = "  " if ok else "<<"
            digits = 3 if ratio else 1
            print(
                f"  {flag} {key:18s} {value:7.{digits}f}"
                f"   want {low:6.{digits}f} - {high:6.{digits}f}"
            )
        print()

    print("all measurements inside range" if not failures else f"{failures} out of range")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
