"""Complexion, eye colour and skin age for each preset figure.

Kept apart from the body presets on purpose: stature and build are anthropometry
and belong with the measurements, while complexion is appearance and belongs with
the shading.  Splitting them is also what lets the same body be rendered with any
of the tones in :data:`humanforge.blend.materials.TONES`.
"""

from __future__ import annotations

from .materials import HAIR_COLOURS, IRISES, TONES, EyeLook, HairLook, SkinLook


def _look(tone: str, age: float, oiliness: float = 0.5) -> SkinLook:
    return SkinLook(tone=TONES[tone], age=age, oiliness=oiliness)


SKIN: dict[str, SkinLook] = {
    "male_average": _look("fair", 0.42, 0.55),
    "male_athletic": _look("olive", 0.30, 0.70),
    "male_lean": _look("porcelain", 0.28, 0.45),
    "male_heavy": _look("fair", 0.52, 0.65),
    "female_average": _look("olive", 0.30, 0.40),
    "female_athletic": _look("tan", 0.26, 0.55),
    "female_curvy": _look("porcelain", 0.30, 0.35),
    "elder_male": _look("fair", 0.96, 0.30),
    "elder_female": _look("porcelain", 0.92, 0.25),
    "teen_female": _look("brown", 0.12, 0.75),
    "teen_male": _look("deep", 0.14, 0.80),
    "child": _look("fair", 0.02, 0.35),
}

EYES: dict[str, EyeLook] = {
    "male_average": IRISES["brown"],
    "male_athletic": IRISES["hazel"],
    "male_lean": IRISES["blue"],
    "male_heavy": IRISES["grey"],
    "female_average": IRISES["dark_brown"],
    "female_athletic": IRISES["amber"],
    "female_curvy": IRISES["green"],
    "elder_male": IRISES["grey"],
    "elder_female": IRISES["blue"],
    "teen_female": IRISES["dark_brown"],
    "teen_male": IRISES["dark_brown"],
    "child": IRISES["blue"],
}

HAIR: dict[str, HairLook] = {
    "male_average": HAIR_COLOURS["dark_brown"],
    "male_athletic": HAIR_COLOURS["black"],
    "male_lean": HAIR_COLOURS["blond"],
    "male_heavy": HAIR_COLOURS["brown"],
    "female_average": HAIR_COLOURS["black"],
    "female_athletic": HAIR_COLOURS["brown"],
    "female_curvy": HAIR_COLOURS["auburn"],
    "elder_male": HAIR_COLOURS["grey"],
    "elder_female": HAIR_COLOURS["white"],
    "teen_female": HAIR_COLOURS["black"],
    "teen_male": HAIR_COLOURS["black"],
    "child": HAIR_COLOURS["blond"],
}

_DEFAULT_SKIN = _look("fair", 0.40)


def skin(name: str) -> SkinLook:
    return SKIN.get(name, _DEFAULT_SKIN)


def eyes(name: str) -> EyeLook:
    return EYES.get(name, IRISES["brown"])


def hair(name: str) -> HairLook:
    return HAIR.get(name, HAIR_COLOURS["dark_brown"])
