"""Ready-made body types.

Each preset is a plausible combination of stature, build and pose rather than a
sweep of extremes: statures follow population medians (a 176 cm average male, a
163 cm average female), and the muscle/fat pairs are chosen so that the
resulting waist and limb girths land inside normal anthropometric ranges.
"""

from __future__ import annotations

from .anatomy import BodyParams, Pose

_RELAXED = Pose()
_A_POSE = Pose(arm_abduction=62.0, arm_forward=4.0, elbow_flex=4.0, finger_curl=10.0)
_CONTRAPPOSTO_L = Pose(
    arm_abduction=48.0,
    arm_forward=9.0,
    elbow_flex=14.0,
    finger_curl=22.0,
    weight_shift=0.85,
    leg_spread=7.0,
    head_turn=-9.0,
    head_tilt=3.0,
)
_CONTRAPPOSTO_R = Pose(
    arm_abduction=50.0,
    arm_forward=8.0,
    elbow_flex=12.0,
    finger_curl=20.0,
    weight_shift=-0.85,
    leg_spread=6.0,
    head_turn=7.0,
)

PRESETS: dict[str, BodyParams] = {
    "male_average": BodyParams(
        name="male_average",
        height=1.760,
        sex="male",
        muscle=0.50,
        fat=0.42,
        pose=_RELAXED,
        seed=11,
    ),
    "male_athletic": BodyParams(
        name="male_athletic",
        height=1.820,
        sex="male",
        muscle=0.88,
        fat=0.17,
        shoulder=1.055,
        waist=0.915,
        pose=_CONTRAPPOSTO_L,
        seed=23,
    ),
    "male_lean": BodyParams(
        name="male_lean",
        height=1.790,
        sex="male",
        muscle=0.40,
        fat=0.16,
        shoulder=0.975,
        waist=0.930,
        limb_length=1.030,
        pose=_A_POSE,
        seed=31,
    ),
    "male_heavy": BodyParams(
        name="male_heavy",
        height=1.745,
        sex="male",
        muscle=0.46,
        fat=0.88,
        waist=1.170,
        hip=1.070,
        sag=0.55,
        pose=Pose(arm_abduction=58.0, arm_forward=8.0, elbow_flex=10.0, leg_spread=8.0),
        seed=43,
    ),
    "female_average": BodyParams(
        name="female_average",
        height=1.632,
        sex="female",
        muscle=0.42,
        fat=0.52,
        bust=0.95,
        pose=_CONTRAPPOSTO_R,
        seed=57,
    ),
    "female_athletic": BodyParams(
        name="female_athletic",
        height=1.702,
        sex="female",
        muscle=0.80,
        fat=0.25,
        shoulder=1.030,
        waist=0.905,
        bust=0.90,
        pose=_CONTRAPPOSTO_L,
        seed=61,
    ),
    "female_curvy": BodyParams(
        name="female_curvy",
        height=1.655,
        sex="female",
        muscle=0.44,
        fat=0.64,
        hip=1.095,
        waist=0.940,
        bust=1.28,
        sag=0.25,
        pose=_CONTRAPPOSTO_R,
        seed=73,
    ),
    "elder_male": BodyParams(
        name="elder_male",
        height=1.702,
        sex="male",
        age="elder",
        muscle=0.32,
        fat=0.60,
        waist=1.115,
        sag=0.85,
        stoop=0.70,
        pose=Pose(
            arm_abduction=44.0,
            arm_forward=12.0,
            elbow_flex=18.0,
            finger_curl=26.0,
            spine_lean=4.0,
            knee_flex=6.0,
        ),
        seed=89,
    ),
    "elder_female": BodyParams(
        name="elder_female",
        height=1.578,
        sex="female",
        age="elder",
        muscle=0.28,
        fat=0.55,
        hip=1.040,
        bust=0.95,
        sag=0.90,
        stoop=0.60,
        pose=Pose(
            arm_abduction=42.0,
            arm_forward=11.0,
            elbow_flex=16.0,
            finger_curl=24.0,
            spine_lean=3.0,
        ),
        seed=97,
    ),
    "teen_female": BodyParams(
        name="teen_female",
        height=1.585,
        sex="female",
        age="teen",
        muscle=0.40,
        fat=0.40,
        hip=0.975,
        bust=0.78,
        limb_length=1.020,
        pose=_CONTRAPPOSTO_R,
        seed=103,
    ),
    "teen_male": BodyParams(
        name="teen_male",
        height=1.700,
        sex="male",
        age="teen",
        muscle=0.44,
        fat=0.28,
        shoulder=0.965,
        limb_length=1.035,
        pose=_A_POSE,
        seed=109,
    ),
    "child": BodyParams(
        name="child",
        height=1.215,
        sex="neutral",
        age="child",
        muscle=0.30,
        fat=0.46,
        head_size=1.020,
        pose=Pose(
            arm_abduction=66.0,
            arm_forward=6.0,
            elbow_flex=8.0,
            finger_curl=14.0,
            leg_spread=8.0,
        ),
        seed=127,
    ),
}


def names() -> list[str]:
    return list(PRESETS)


def get(name: str) -> BodyParams:
    try:
        return PRESETS[name]
    except KeyError:
        raise KeyError(
            f"unknown preset {name!r}; available: {', '.join(names())}"
        ) from None
