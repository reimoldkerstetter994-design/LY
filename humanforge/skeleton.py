"""Joint positions and limb frames for a posed figure.

Segment *lengths* come from anthropometry and are the invariant; joint
*heights* are only correct for a figure standing with its arms straight down.
So the skeleton solves simple forward kinematics from the pose angles: the
elbow of an abducted arm ends up wherever the upper arm length puts it, which
is how a real shoulder behaves.

Every limb also carries an orthonormal frame.  Column 2 runs along the limb,
column 1 points to the front of the limb and column 0 to its side, so muscle
bellies can be placed as "40 % along the thigh, 35 mm forward" instead of in
raw world coordinates.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np

from .anatomy import BodyParams, Measures, measure
from .sdf import Vec3, frame_from_axis, normalize, rotation, v3

LEFT = 1.0
RIGHT = -1.0


def _rotate(vector: Vec3, axis: Vec3, angle_deg: float) -> Vec3:
    return rotation(axis, angle_deg) @ vector


def _limb_direction(side: float, abduction_deg: float, forward_deg: float) -> Vec3:
    """Direction of a limb hanging down, swung out sideways then forwards."""
    a = np.radians(abduction_deg)
    f = np.radians(forward_deg)
    return normalize(
        v3(side * np.sin(a) * np.cos(f), np.sin(f), -np.cos(a) * np.cos(f))
    )


def _flex(direction: Vec3, angle_deg: float) -> Vec3:
    """Bend a limb towards the front of the body, as a knee or elbow does."""
    axis = np.cross(direction, v3(0.0, 1.0, 0.0))
    if np.linalg.norm(axis) < 1e-6:
        axis = v3(1.0, 0.0, 0.0)
    return _rotate(direction, axis, angle_deg)


@dataclass
class Segment:
    """A bone-like span with a local frame for placing soft tissue."""

    name: str
    start: Vec3
    end: Vec3
    frame: np.ndarray

    @property
    def length(self) -> float:
        return float(np.linalg.norm(self.end - self.start))

    @property
    def axis(self) -> Vec3:
        return self.frame[:, 2]

    @property
    def front(self) -> Vec3:
        return self.frame[:, 1]

    @property
    def side(self) -> Vec3:
        return self.frame[:, 0]

    def at(self, t: float, front: float = 0.0, side: float = 0.0) -> Vec3:
        """Point at fraction ``t`` along the segment, offset in its frame."""
        base = self.start + (self.end - self.start) * t
        return base + self.front * front + self.side * side


def _segment(name: str, start: Vec3, end: Vec3) -> Segment:
    return Segment(name, start, end, frame_from_axis(end - start))


class Asymmetry:
    """Deterministic millimetre-scale noise, per landmark and per side.

    Perfect bilateral symmetry is one of the strongest tells that a render is
    synthetic, so a seeded offset nudges paired features apart very slightly.
    """

    def __init__(self, seed: int) -> None:
        self._seed = seed

    def factor(self, key: str, side: float, amount: float = 0.02) -> float:
        digest = hashlib.blake2b(
            f"{self._seed}:{key}:{side:+.0f}".encode(), digest_size=8
        ).digest()
        unit = int.from_bytes(digest, "big") / float(1 << 64)  # in [0, 1)
        return 1.0 + amount * (2.0 * unit - 1.0)

    def offset(self, key: str, side: float, amount: float) -> float:
        return (self.factor(key, side, 1.0) - 1.0) * amount


@dataclass
class Skeleton:
    """Resolved joint positions, limb segments and spine curve for a figure."""

    measures: Measures
    points: dict[str, Vec3] = field(default_factory=dict)
    segments: dict[str, Segment] = field(default_factory=dict)
    frames: dict[str, np.ndarray] = field(default_factory=dict)
    spine: list[Vec3] = field(default_factory=list)
    asym: Asymmetry = field(default_factory=lambda: Asymmetry(0))

    @property
    def params(self) -> BodyParams:
        return self.measures.params

    def p(self, name: str) -> Vec3:
        return self.points[name]

    def s(self, name: str, side: float) -> Segment:
        return self.segments[f"{name}_{'l' if side > 0 else 'r'}"]

    def spine_offset_at(self, z: float) -> tuple[float, float]:
        """Horizontal position of the spine at height ``z``.

        Torso cross sections hang off this curve, which is how the lumbar arch
        and thoracic rounding reach the silhouette.
        """
        heights = [p[2] for p in self.spine]
        xs = np.interp(z, heights, [p[0] for p in self.spine])
        ys = np.interp(z, heights, [p[1] for p in self.spine])
        return float(xs), float(ys)

    def spine_at(self, t: float) -> Vec3:
        """Sample the spine curve, ``t`` running from sacrum (0) to atlas (1)."""
        if not self.spine:
            raise ValueError("spine has not been built")
        u = float(np.clip(t, 0.0, 1.0)) * (len(self.spine) - 1)
        i = min(int(u), len(self.spine) - 2)
        frac = u - i
        return self.spine[i] * (1.0 - frac) + self.spine[i + 1] * frac


def build_skeleton(params: BodyParams) -> Skeleton:
    """Solve the pose into joint positions."""
    m = measure(params)
    pose = params.pose
    height = m.height
    skeleton = Skeleton(measures=m, asym=Asymmetry(params.seed))
    pts = skeleton.points

    shift = pose.weight_shift
    pelvis_x = shift * 0.012 * height

    # -- spine ------------------------------------------------------------
    # Sagittal curvature: the lumbar spine arches forward and the thorax back.
    lordosis = 0.021 * height
    kyphosis = (0.013 + 0.030 * params.stoop) * height
    sacrum = v3(pelvis_x, -0.020 * height, m.h("hip_joint"))
    lean = np.radians(pose.spine_lean)

    stations = [
        (0.00, 0.000),
        (0.22, lordosis * 0.55),
        (0.42, lordosis),
        (0.60, lordosis * 0.30),
        (0.78, -kyphosis * 0.75),
        (0.90, -kyphosis),
        (1.00, -kyphosis * 0.35),
    ]
    top_z = m.h("cervicale")
    spine: list[Vec3] = []
    for t, forward in stations:
        z = sacrum[2] + (top_z - sacrum[2]) * t
        y = sacrum[1] + forward
        # Leaning pivots the whole column about the sacrum.
        dz = z - sacrum[2]
        spine.append(
            v3(
                sacrum[0] + shift * 0.006 * height * t,
                sacrum[1] + (y - sacrum[1]) + dz * np.sin(lean),
                sacrum[2] + dz * np.cos(lean),
            )
        )
    skeleton.spine = spine

    pts["sacrum"] = spine[0]
    pts["waist"] = skeleton.spine_at(0.45)
    pts["chest"] = skeleton.spine_at(0.80)
    pts["cervicale"] = spine[-1]

    # -- head and neck ----------------------------------------------------
    neck_top = pts["cervicale"] + v3(0.0, 0.012 * height, 0.055 * height)
    chin_z = m.h("chin")
    head_h = m.b("head_height")
    # Depths below are fractions of the occiput-to-nose-tip span, the same units
    # humanforge.head lays the face out in, so these landmarks land on the
    # features they name rather than a sixth of a head length behind them.
    head_depth = m.face_depth
    tilt = rotation((1.0, 0.0, 0.0), -pose.head_tilt) @ rotation(
        (0.0, 0.0, 1.0), pose.head_turn
    )

    def head_local(local: Vec3) -> Vec3:
        return head_origin + tilt @ local

    head_origin = v3(neck_top[0], neck_top[1], chin_z)
    # The neck column starts level with the top of the trunk loft, well below
    # the cervicale, so the front of the neck is as long as it is on a real
    # figure instead of starting at the jaw.
    neck_x, neck_y = skeleton.spine_offset_at(0.822 * height)
    pts["neck_base"] = v3(neck_x, neck_y + 0.010 * height, 0.822 * height)
    pts["neck_top"] = neck_top
    pts["head_origin"] = head_origin
    pts["skull"] = head_local(v3(0.0, -0.045 * head_depth, head_h * 0.720))
    pts["face"] = head_local(v3(0.0, 0.175 * head_depth, head_h * 0.375))
    pts["chin"] = head_local(v3(0.0, 0.340 * head_depth, head_h * 0.040))
    pts["mouth"] = head_local(v3(0.0, 0.415 * head_depth, head_h * 0.156))
    pts["nose"] = head_local(v3(0.0, 0.470 * head_depth, head_h * 0.278))
    pts["brow"] = head_local(v3(0.0, 0.365 * head_depth, head_h * 0.556))
    pts["vertex"] = head_local(v3(0.0, 0.0, head_h))
    skeleton.segments["neck"] = _segment("neck", pts["neck_base"], neck_top)
    skeleton.frames["head"] = tilt

    eye_sep = 0.202 * m.b("head")
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        jitter = skeleton.asym.factor(f"eye{tag}", side, 0.012)
        pts[f"eye_{tag}"] = head_local(
            v3(
                side * eye_sep * jitter,
                0.360 * head_depth,
                head_h * 0.495,
            )
        )
        pts[f"ear_{tag}"] = head_local(
            v3(side * 0.485 * m.b("head"), -0.070 * head_depth, head_h * 0.408)
        )
        pts[f"cheek_{tag}"] = head_local(
            v3(side * 0.330 * m.b("head"), 0.290 * head_depth, head_h * 0.410)
        )
        pts[f"jaw_{tag}"] = head_local(
            v3(side * 0.356 * m.b("head"), -0.095 * head_depth, head_h * 0.152)
        )

    # -- arms -------------------------------------------------------------
    upper_arm_len = (m.h("acromion") - m.h("elbow")) * 1.0
    forearm_len = m.h("elbow") - m.h("wrist")
    hand_len = m.b("hand_length")
    half_shoulders = m.b("biacromial") * 0.5

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        shrug = pose.shoulder_shrug * 0.018 * height
        acromion = v3(
            side * half_shoulders,
            pts["chest"][1] + 0.010 * height,
            m.h("acromion") + shrug,
        )
        shoulder = acromion + v3(-side * 0.022 * height, 0.0, -0.026 * height)
        pts[f"acromion_{tag}"] = acromion
        pts[f"shoulder_{tag}"] = shoulder

        abduction = pose.arm_abduction * skeleton.asym.factor(
            f"abduct{tag}", side, 0.03
        )
        upper_dir = _limb_direction(side, abduction, pose.arm_forward)
        elbow = shoulder + upper_dir * upper_arm_len
        fore_dir = _flex(upper_dir, pose.elbow_flex)
        wrist = elbow + fore_dir * forearm_len
        hand_dir = _flex(fore_dir, pose.wrist_flex)
        hand_end = wrist + hand_dir * hand_len

        pts[f"elbow_{tag}"] = elbow
        pts[f"wrist_{tag}"] = wrist
        pts[f"hand_end_{tag}"] = hand_end

        upper = _segment(f"upper_arm_{tag}", shoulder, elbow)
        fore = _segment(f"forearm_{tag}", elbow, wrist)
        hand = _segment(f"hand_{tag}", wrist, hand_end)
        # Pronation twists the palm about the forearm axis; the sign follows
        # the side so that both palms rotate towards the thighs.
        twist = rotation(hand_dir, side * pose.forearm_pronation)
        hand.frame = twist @ hand.frame
        fore.frame = rotation(fore_dir, side * pose.forearm_pronation * 0.5) @ fore.frame

        skeleton.segments[f"upper_arm_{tag}"] = upper
        skeleton.segments[f"forearm_{tag}"] = fore
        skeleton.segments[f"hand_{tag}"] = hand

    # -- legs -------------------------------------------------------------
    thigh_len = m.h("hip_joint") - m.h("knee")
    shank_len = m.h("knee") - m.h("ankle")
    # Femoral head centres, not the trochanters: about a quarter of the hip
    # breadth out from the mid line, so the thighs meet just under the pelvis
    # and the widest part of the figure stays at buttock level.
    hip_half = m.b("hip") * 0.256

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        loaded = shift * side > 0.0
        hip = v3(
            side * hip_half + pelvis_x,
            sacrum[1] + 0.012 * height,
            m.h("hip_joint") + (0.008 * height * abs(shift) if loaded else 0.0),
        )
        pts[f"hip_{tag}"] = hip

        # Femurs converge slightly; most of the gap that opens between the
        # thighs comes from the limb tapering, not from the bone angle.
        converge = 1.2 - pose.leg_spread
        thigh_dir = _limb_direction(-side, converge, 0.0)
        knee = hip + thigh_dir * thigh_len
        flex = pose.knee_flex + (0.0 if loaded else 5.0 * abs(shift))
        shank_dir = _limb_direction(
            side, -np.degrees(np.arcsin(thigh_dir[0] * side)) * 0.55, -flex * 0.35
        )
        shank_dir = _flex(shank_dir, -flex * 0.5)
        ankle = knee + shank_dir * shank_len
        ankle[2] = max(ankle[2], m.h("ankle") * 0.9)

        pts[f"knee_{tag}"] = knee
        pts[f"ankle_{tag}"] = ankle
        skeleton.segments[f"thigh_{tag}"] = _segment(f"thigh_{tag}", hip, knee)
        skeleton.segments[f"shank_{tag}"] = _segment(f"shank_{tag}", knee, ankle)

        splay = np.radians(side * pose.foot_splay)
        heel = v3(ankle[0], ankle[1] - 0.055 * m.b("foot_length"), 0.0)
        toe = heel + v3(
            np.sin(splay) * m.b("foot_length"),
            np.cos(splay) * m.b("foot_length"),
            0.0,
        )
        pts[f"heel_{tag}"] = heel
        pts[f"toe_{tag}"] = toe
        skeleton.segments[f"foot_{tag}"] = _segment(f"foot_{tag}", heel, toe)

    return skeleton
