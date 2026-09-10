"""Anthropometry.

Every length is stored as a fraction of standing height so that a preset can
be re-used at any stature.  Defaults describe an average adult male built on
the realistic 7.5-head canon; the presets at the bottom override whatever
differs (a 6-head child, wider female pelvis, sagging elderly soft tissue...).

Vertical landmarks are measured from the sole, horizontal ones are half widths
(distance from the median plane), depths are split into front (-Y) and back
(+Y) because no part of a body is an ellipse centred on the spine.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass
class Proportions:
    name: str = "adult_male"
    sex: str = "m"
    height: float = 1.78

    # ---- vertical landmarks (fraction of height) ----
    z_knee: float = 0.285
    z_crotch: float = 0.480
    z_hip: float = 0.520          # greater trochanter
    z_iliac: float = 0.608
    z_waist: float = 0.632
    z_ribs: float = 0.668         # lower edge of the ribcage
    z_nipple: float = 0.720
    z_armpit: float = 0.752
    z_shoulder: float = 0.796     # gleno-humeral joint centre
    z_acromion: float = 0.818
    z_neck: float = 0.828         # where the neck leaves the shoulders
    z_chin: float = 0.867
    z_elbow: float = 0.625
    z_wrist: float = 0.487
    z_ankle: float = 0.048
    z_pelvic_floor: float = 0.452

    # ---- torso cross sections (half width / front depth / back depth) ----
    pelvis_w: float = 0.070
    pelvis_f: float = 0.055
    pelvis_b: float = 0.062
    hip_w: float = 0.092
    hip_f: float = 0.058
    hip_b: float = 0.070
    iliac_w: float = 0.086
    iliac_f: float = 0.056
    iliac_b: float = 0.059
    waist_w: float = 0.079
    waist_f: float = 0.057
    waist_b: float = 0.052
    ribs_w: float = 0.087
    ribs_f: float = 0.063
    ribs_b: float = 0.053
    chest_w: float = 0.094
    chest_f: float = 0.067
    chest_b: float = 0.056
    girdle_w: float = 0.086
    girdle_f: float = 0.052
    girdle_b: float = 0.058

    torso_exp: float = 2.6        # cross-section squareness
    spine_sway: float = 0.010     # lumbar lordosis amplitude

    # ---- shoulders / arms ----
    shoulder_x: float = 0.096     # joint centre offset from median plane
    deltoid_r: float = 0.033
    upperarm_r: float = 0.030
    elbow_r: float = 0.023
    forearm_r: float = 0.026
    wrist_r: float = 0.017
    arm_abduct: float = 0.048     # x offset added by the time we reach the wrist
    hand_len: float = 0.108
    hand_w: float = 0.045

    # ---- pelvis / legs ----
    hip_joint_x: float = 0.050
    thigh_r: float = 0.053
    knee_r: float = 0.034
    calf_r: float = 0.038
    ankle_r: float = 0.021
    ankle_x: float = 0.043
    foot_len: float = 0.152
    foot_w: float = 0.055
    glute_r: float = 0.052

    # ---- neck / head ----
    neck_w: float = 0.033
    neck_d: float = 0.036
    head_w: float = 0.0435        # half width of the skull
    head_d: float = 0.054         # half depth of the skull
    head_tilt: float = 0.0

    # ---- soft tissue / build modifiers (0..1 unless noted) ----
    muscle: float = 0.45          # how much muscular relief is carved in
    softness: float = 0.35        # fat: larger fillets, softer transitions
    belly: float = 0.0            # abdominal protrusion, fraction of height
    breast: float = 0.0           # breast radius, fraction of height
    breast_drop: float = 0.0
    sag: float = 0.0              # elderly: soft tissue drops and slackens
    skin: str = "medium"          # key into materials.SKIN_TONES
    hair: str = "short_dark"      # key into hair.STYLES

    def scaled(self, attr: str) -> float:
        return getattr(self, attr) * self.height


# --------------------------------------------------------------------------- #
# presets
# --------------------------------------------------------------------------- #
_ADULT_MALE = Proportions()

_ATHLETIC_MALE = replace(
    _ADULT_MALE,
    name="athletic_male",
    height=1.83,
    chest_w=0.099, chest_f=0.070, chest_b=0.058,
    ribs_w=0.089, waist_w=0.075, waist_f=0.054, waist_b=0.050,
    girdle_w=0.092, hip_w=0.089,
    shoulder_x=0.100, deltoid_r=0.038,
    upperarm_r=0.033, elbow_r=0.024, forearm_r=0.029, wrist_r=0.018,
    thigh_r=0.057, knee_r=0.035, calf_r=0.041, glute_r=0.054,
    neck_w=0.036, neck_d=0.039,
    muscle=0.95, softness=0.14,
    skin="tan", hair="short_dark",
)

_SLIM_MALE = replace(
    _ADULT_MALE,
    name="slim_male",
    height=1.75,
    chest_w=0.086, chest_f=0.060, chest_b=0.052,
    ribs_w=0.080, waist_w=0.070, waist_f=0.050, waist_b=0.047,
    iliac_w=0.078, hip_w=0.083, hip_f=0.053, hip_b=0.063,
    girdle_w=0.079, shoulder_x=0.089, deltoid_r=0.029,
    upperarm_r=0.026, elbow_r=0.020, forearm_r=0.023, wrist_r=0.016,
    thigh_r=0.046, knee_r=0.031, calf_r=0.034, ankle_r=0.020, glute_r=0.045,
    neck_w=0.030, neck_d=0.033,
    muscle=0.55, softness=0.18,
    skin="pale", hair="curly_dark",
)

_HEAVY_MALE = replace(
    _ADULT_MALE,
    name="heavy_male",
    height=1.77,
    chest_w=0.101, chest_f=0.080, chest_b=0.062,
    ribs_w=0.100, ribs_f=0.082, ribs_b=0.060,
    waist_w=0.099, waist_f=0.086, waist_b=0.060,
    iliac_w=0.098, hip_w=0.101, hip_f=0.070, hip_b=0.078,
    girdle_w=0.092, shoulder_x=0.097, deltoid_r=0.037,
    upperarm_r=0.036, elbow_r=0.026, forearm_r=0.030, wrist_r=0.019,
    thigh_r=0.062, knee_r=0.038, calf_r=0.043, glute_r=0.060,
    neck_w=0.038, neck_d=0.041, torso_exp=2.3,
    muscle=0.22, softness=0.85, belly=0.030,
    skin="medium", hair="bald",
)

_ADULT_FEMALE = replace(
    _ADULT_MALE,
    name="adult_female",
    sex="f",
    height=1.65,
    z_waist=0.640, z_ribs=0.672, z_nipple=0.722,
    z_shoulder=0.794, z_acromion=0.815, z_neck=0.826, z_chin=0.866,
    pelvis_w=0.072, pelvis_f=0.055, pelvis_b=0.064,
    hip_w=0.099, hip_f=0.060, hip_b=0.075,
    iliac_w=0.086, iliac_f=0.055, iliac_b=0.060,
    waist_w=0.070, waist_f=0.052, waist_b=0.049,
    ribs_w=0.079, ribs_f=0.057, ribs_b=0.050,
    chest_w=0.083, chest_f=0.058, chest_b=0.052,
    girdle_w=0.077, girdle_f=0.048, girdle_b=0.053,
    torso_exp=2.4, spine_sway=0.014,
    shoulder_x=0.087, deltoid_r=0.029,
    upperarm_r=0.028, elbow_r=0.021, forearm_r=0.024, wrist_r=0.015,
    hand_len=0.104, hand_w=0.041,
    hip_joint_x=0.052, thigh_r=0.055, knee_r=0.032, calf_r=0.037,
    ankle_r=0.019, ankle_x=0.040, foot_len=0.145, foot_w=0.049,
    glute_r=0.055,
    neck_w=0.028, neck_d=0.031,
    head_w=0.0425, head_d=0.052,
    muscle=0.34, softness=0.52,
    breast=0.043, breast_drop=0.006,
    skin="light", hair="long_dark",
)

_ATHLETIC_FEMALE = replace(
    _ADULT_FEMALE,
    name="athletic_female",
    height=1.72,
    chest_w=0.086, waist_w=0.066, waist_f=0.049,
    hip_w=0.094, girdle_w=0.082,
    shoulder_x=0.090, deltoid_r=0.032,
    upperarm_r=0.029, forearm_r=0.025,
    thigh_r=0.056, calf_r=0.039, glute_r=0.056,
    muscle=0.82, softness=0.22,
    breast=0.036, breast_drop=0.003,
    skin="deep", hair="ponytail_dark",
)

_CHILD = replace(
    _ADULT_MALE,
    name="child",
    sex="c",
    height=1.18,
    z_knee=0.275, z_crotch=0.450, z_hip=0.495, z_iliac=0.585,
    z_waist=0.608, z_ribs=0.645, z_nipple=0.700, z_armpit=0.730,
    z_shoulder=0.772, z_acromion=0.795, z_neck=0.805, z_chin=0.833,
    z_elbow=0.600, z_wrist=0.462, z_pelvic_floor=0.425,
    pelvis_w=0.072, pelvis_f=0.058, pelvis_b=0.064,
    hip_w=0.086, hip_f=0.062, hip_b=0.068,
    iliac_w=0.085, iliac_f=0.062, iliac_b=0.058,
    waist_w=0.083, waist_f=0.064, waist_b=0.054,
    ribs_w=0.085, ribs_f=0.065, ribs_b=0.054,
    chest_w=0.086, chest_f=0.064, chest_b=0.055,
    girdle_w=0.079, girdle_f=0.050, girdle_b=0.055,
    torso_exp=2.3,
    shoulder_x=0.085, deltoid_r=0.030,
    upperarm_r=0.032, elbow_r=0.025, forearm_r=0.028, wrist_r=0.019,
    hand_len=0.100, hand_w=0.044,
    hip_joint_x=0.048, thigh_r=0.056, knee_r=0.038, calf_r=0.040,
    ankle_r=0.024, ankle_x=0.042, foot_len=0.145, foot_w=0.055,
    glute_r=0.050,
    neck_w=0.030, neck_d=0.032,
    head_w=0.058, head_d=0.070,
    muscle=0.10, softness=0.75, belly=0.012,
    skin="light", hair="short_light",
)

_ELDERLY_MALE = replace(
    _ADULT_MALE,
    name="elderly_male",
    height=1.72,
    z_shoulder=0.788, z_acromion=0.808, z_neck=0.818, z_chin=0.860,
    chest_w=0.090, chest_f=0.064, chest_b=0.060,
    ribs_w=0.088, waist_w=0.090, waist_f=0.074, waist_b=0.056,
    iliac_w=0.088, hip_w=0.092, hip_b=0.070,
    girdle_w=0.083, shoulder_x=0.092, deltoid_r=0.029,
    upperarm_r=0.027, elbow_r=0.021, forearm_r=0.024, wrist_r=0.017,
    thigh_r=0.048, knee_r=0.034, calf_r=0.034, glute_r=0.046,
    neck_w=0.031, neck_d=0.034,
    spine_sway=0.006,
    muscle=0.30, softness=0.62, belly=0.020, sag=1.0,
    skin="pale", hair="short_grey",
)

PRESETS = {
    p.name: p
    for p in (
        _ADULT_MALE,
        _ATHLETIC_MALE,
        _SLIM_MALE,
        _HEAVY_MALE,
        _ADULT_FEMALE,
        _ATHLETIC_FEMALE,
        _CHILD,
        _ELDERLY_MALE,
    )
}


def get(name: str) -> Proportions:
    if name not in PRESETS:
        raise KeyError(f"unknown preset {name!r}; available: {sorted(PRESETS)}")
    return PRESETS[name]
