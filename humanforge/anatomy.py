"""Anthropometry: body parameters and the measurements derived from them.

Realistic proportions are the single biggest factor in whether a figure reads
as human, so every length here is expressed as a fraction of stature taken
from standard anthropometric tables (Drillis & Contini segment lengths,
NASA-STD-3000 / ANSUR breadth and girth percentiles) rather than being dialled
in by eye.  A few of the familiar consequences fall out automatically: the
wrist lands at crotch height, the elbow at the bottom of the ribcage, and the
head is roughly one seventh and a half of the standing height.

Girths respond to the ``muscle`` and ``fat`` parameters with a per-measurement
sensitivity, because real bodies do not scale uniformly: a heavier figure gains
far more at the waist than at the wrist, where the bone dominates.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal

Sex = Literal["male", "female", "neutral"]
Age = Literal["child", "teen", "adult", "elder"]


@dataclass(frozen=True)
class Pose:
    """Joint angles in degrees; zero is a straight, symmetric standing pose."""

    arm_abduction: float = 52.0
    """Angle of the upper arm away from the body (90 would be a T-pose)."""

    arm_forward: float = 6.0
    """How far the upper arms swing towards the front."""

    elbow_flex: float = 8.0
    forearm_pronation: float = 20.0
    wrist_flex: float = 4.0
    finger_curl: float = 18.0
    thumb_spread: float = 32.0

    leg_spread: float = 5.0
    knee_flex: float = 3.0
    foot_splay: float = 7.0

    spine_lean: float = 0.0
    """Forward lean of the whole torso."""

    weight_shift: float = 0.0
    """Contrapposto: -1 rests on the right leg, +1 on the left."""

    head_turn: float = 0.0
    head_tilt: float = 0.0
    shoulder_shrug: float = 0.0


@dataclass(frozen=True)
class BodyParams:
    """Everything that defines one figure."""

    name: str = "figure"
    height: float = 1.75
    sex: Sex = "male"
    age: Age = "adult"

    muscle: float = 0.5
    """0 sedentary, 0.5 average, 1 heavily trained."""

    fat: float = 0.4
    """0 very lean, 0.4 average, 1 heavy."""

    shoulder: float = 1.0
    waist: float = 1.0
    hip: float = 1.0
    bust: float = 1.0
    limb_length: float = 1.0
    head_size: float = 1.0
    hand_size: float = 1.0
    foot_size: float = 1.0

    sag: float = 0.0
    """Soft-tissue droop; rises with age and body fat."""

    stoop: float = 0.0
    """Thoracic kyphosis, i.e. a rounded upper back."""

    seed: int = 7
    """Drives millimetre-scale left/right asymmetry."""

    pose: Pose = field(default_factory=Pose)

    def variant(self, **changes) -> "BodyParams":
        return replace(self, **changes)


REFERENCE_STATURE = 1.75
"""Stature the tables are written for; allometry is measured from here."""


@dataclass(frozen=True)
class Girth:
    """A measure and how it responds to stature and build."""

    base: float
    """Size as a fraction of stature, for an average adult of reference height."""

    muscle: float = 0.0
    fat: float = 0.0

    allometry: float = 1.0
    """Exponent relating this measure to stature.

    Not everything scales with height.  Across a population a head grows far
    more slowly than stature -- a 163 cm adult's head is within a centimetre of
    a 183 cm adult's -- which is exactly why a short figure built by uniform
    scaling looks like a doll and a child built that way looks like a shrunken
    adult.  Heads use roughly 0.35, hands and feet roughly 0.85.
    """

    def resolve(self, height: float, muscle: float, fat: float) -> float:
        build = 1.0 + self.muscle * (muscle - 0.5) + self.fat * (fat - 0.4)
        size = (
            self.base
            * REFERENCE_STATURE
            * (height / REFERENCE_STATURE) ** self.allometry
        )
        return size * build


# Landmark heights as a fraction of stature, for an adult.
LANDMARK_HEIGHTS = {
    "vertex": 1.000,
    "eye": 0.936,
    "chin": 0.870,
    "cervicale": 0.855,
    "acromion": 0.818,
    "nipple": 0.720,
    "xiphoid": 0.700,
    "elbow": 0.630,
    "waist": 0.620,
    "iliac_crest": 0.600,
    "hip_joint": 0.530,
    "crotch": 0.485,
    "wrist": 0.485,
    "fingertip": 0.377,
    "knee": 0.285,
    "calf": 0.180,
    "ankle": 0.039,
}

# Horizontal breadths, again as a fraction of stature.
BREADTHS = {
    "biacromial": Girth(0.228, muscle=0.09),
    "chest": Girth(0.174, muscle=0.12, fat=0.16),
    "chest_depth": Girth(0.140, muscle=0.10, fat=0.30),
    "waist": Girth(0.145, muscle=0.04, fat=0.55),
    "waist_depth": Girth(0.122, muscle=0.02, fat=0.75),
    "hip": Girth(0.191, muscle=0.03, fat=0.32),
    "hip_depth": Girth(0.140, muscle=0.04, fat=0.40),
    "head": Girth(0.0905, allometry=0.35),
    "head_depth": Girth(0.1125, allometry=0.35),
    "head_height": Girth(0.130, allometry=0.35),
    "neck": Girth(0.064, muscle=0.14, fat=0.18, allometry=0.85),
    "hand_length": Girth(0.108, allometry=0.85),
    "hand_breadth": Girth(0.049, allometry=0.85),
    "foot_length": Girth(0.152, allometry=0.85),
    "foot_breadth": Girth(0.055, allometry=0.85),
}

# Limb radii (lateral half-widths) as a fraction of stature.
LIMB_RADII = {
    "deltoid": Girth(0.042, muscle=0.30, fat=0.10),
    "upper_arm": Girth(0.029, muscle=0.30, fat=0.22),
    "elbow": Girth(0.0225, muscle=0.10, fat=0.08),
    "forearm": Girth(0.026, muscle=0.26, fat=0.16),
    "wrist": Girth(0.0158, muscle=0.06, fat=0.06),
    "thigh": Girth(0.0485, muscle=0.24, fat=0.34),
    "knee": Girth(0.0335, muscle=0.08, fat=0.10),
    "calf": Girth(0.0345, muscle=0.26, fat=0.20),
    "ankle": Girth(0.0205, muscle=0.05, fat=0.08),
}

# Multipliers applied to the tables above for female and neutral figures.
SEX_SCALE: dict[str, dict[str, float]] = {
    "male": {},
    "female": {
        "biacromial": 0.935,
        "chest": 0.945,
        "chest_depth": 0.960,
        "waist": 0.965,
        "waist_depth": 0.955,
        "hip": 1.045,
        "hip_depth": 1.035,
        "neck": 0.900,
        "head": 0.965,
        "head_depth": 0.970,
        "head_height": 0.975,
        "hand_length": 0.945,
        "hand_breadth": 0.905,
        "foot_length": 0.945,
        "foot_breadth": 0.925,
        "deltoid": 0.910,
        "upper_arm": 0.930,
        "forearm": 0.915,
        "wrist": 0.905,
        "elbow": 0.930,
        "thigh": 1.020,
        "calf": 0.955,
        "ankle": 0.930,
        "knee": 0.950,
    },
    "neutral": {
        "biacromial": 0.968,
        "hip": 1.020,
        "neck": 0.950,
    },
}

# Age changes proportions, not just size: a child is roughly six heads tall
# while an adult is seven and a half.
AGE_SCALE: dict[str, dict[str, float]] = {
    "adult": {},
    "elder": {
        "biacromial": 0.975,
        "deltoid": 0.930,
        "upper_arm": 0.945,
        "forearm": 0.950,
        "thigh": 0.940,
        "calf": 0.930,
        "neck": 0.945,
    },
    "teen": {
        "biacromial": 0.955,
        "chest": 0.955,
        "chest_depth": 0.945,
        "head_height": 1.000,
        "head": 1.010,
        "deltoid": 0.900,
        "upper_arm": 0.900,
        "forearm": 0.905,
        "thigh": 0.945,
        "calf": 0.935,
    },
    "child": {
        "biacromial": 0.900,
        "chest": 0.985,
        "chest_depth": 1.020,
        "waist": 1.045,
        "waist_depth": 1.060,
        "hip": 0.945,
        "head_height": 1.005,
        "head": 1.020,
        "head_depth": 1.015,
        "neck": 0.900,
        "hand_length": 0.985,
        "foot_length": 0.985,
        "deltoid": 0.880,
        "upper_arm": 0.960,
        "forearm": 0.960,
        "thigh": 1.020,
        "calf": 0.950,
        "wrist": 0.960,
        "ankle": 0.960,
    },
}

# Shorter limbs and a longer trunk for younger figures: landmark heights shift.
AGE_HEIGHT_SHIFT: dict[str, dict[str, float]] = {
    "adult": {},
    "elder": {"vertex": 0.0},
    "teen": {
        "acromion": 0.810,
        "crotch": 0.478,
        "wrist": 0.480,
        "knee": 0.281,
    },
    "child": {
        "eye": 0.925,
        "chin": 0.845,
        "cervicale": 0.830,
        "acromion": 0.795,
        "nipple": 0.700,
        "xiphoid": 0.680,
        "elbow": 0.615,
        "waist": 0.610,
        "iliac_crest": 0.590,
        "hip_joint": 0.515,
        "crotch": 0.455,
        "wrist": 0.465,
        "fingertip": 0.355,
        "knee": 0.265,
    },
}


@dataclass(frozen=True)
class Measures:
    """Absolute measurements, in metres, for one set of body parameters."""

    params: BodyParams
    heights: dict[str, float]
    breadths: dict[str, float]
    radii: dict[str, float]

    def h(self, name: str) -> float:
        return self.heights[name]

    def b(self, name: str) -> float:
        return self.breadths[name]

    def r(self, name: str) -> float:
        return self.radii[name]

    @property
    def height(self) -> float:
        return self.params.height

    @property
    def head_height(self) -> float:
        return self.breadths["head_height"]

    def describe(self) -> str:
        heads = self.height / self.head_height
        return (
            f"{self.params.name}: {self.height * 100:.0f} cm, "
            f"{self.params.sex}/{self.params.age}, "
            f"{heads:.1f} heads tall, "
            f"shoulders {self.b('biacromial') * 100:.0f} cm, "
            f"waist breadth {self.b('waist') * 100:.0f} cm, "
            f"hips {self.b('hip') * 100:.0f} cm"
        )


def _combined_scale(name: str, params: BodyParams) -> float:
    scale = SEX_SCALE.get(params.sex, {}).get(name, 1.0)
    scale *= AGE_SCALE.get(params.age, {}).get(name, 1.0)
    return scale


def measure(params: BodyParams) -> Measures:
    """Resolve ``params`` into absolute measurements."""
    height = params.height
    muscle, fat = params.muscle, params.fat

    heights = dict(LANDMARK_HEIGHTS)
    heights.update(AGE_HEIGHT_SHIFT.get(params.age, {}))

    # Longer or shorter limbs move the joints without moving the shoulders:
    # the trunk absorbs the difference, as it does across real populations.
    if params.limb_length != 1.0:
        stretch = params.limb_length
        crotch = heights["crotch"]
        for key in ("knee", "ankle", "calf"):
            heights[key] = crotch - (crotch - heights[key]) * stretch
        acromion = heights["acromion"]
        for key in ("elbow", "wrist", "fingertip"):
            heights[key] = acromion - (acromion - heights[key]) * stretch

    heights = {name: value * height for name, value in heights.items()}

    breadths = {
        name: girth.resolve(height, muscle, fat) * _combined_scale(name, params)
        for name, girth in BREADTHS.items()
    }
    radii = {
        name: girth.resolve(height, muscle, fat) * _combined_scale(name, params)
        for name, girth in LIMB_RADII.items()
    }

    breadths["biacromial"] *= params.shoulder
    breadths["chest"] *= 1.0 + 0.55 * (params.shoulder - 1.0)
    breadths["waist"] *= params.waist
    breadths["waist_depth"] *= params.waist
    breadths["hip"] *= params.hip
    breadths["hip_depth"] *= params.hip
    for name in ("head", "head_depth", "head_height"):
        breadths[name] *= params.head_size
    for name in ("hand_length", "hand_breadth"):
        breadths[name] *= params.hand_size
    for name in ("foot_length", "foot_breadth"):
        breadths[name] *= params.foot_size

    return Measures(params=params, heights=heights, breadths=breadths, radii=radii)
