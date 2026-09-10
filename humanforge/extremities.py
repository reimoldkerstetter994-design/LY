"""Hands and feet.

These are the parts that give a figure away fastest, so both are built from
their real skeletal layout: a palm that widens towards the knuckles, four
fingers of three phalanges each with a progressive curl and a slight fan, an
opposed two-phalanx thumb rising off the thenar mass, and a foot with a raised
medial arch, a ball, and five splayed toes resting on the ground.

Fingers are deliberately unioned with a very small blend radius so that they
touch at the knuckles and separate towards the tips instead of fusing into a
mitten, and nails are emitted as placed attachments because they are far
thinner than the voxel grid can resolve.
"""

from __future__ import annotations

import numpy as np

from .sdf import (
    Ellipsoid,
    Field,
    RoundCone,
    Sphere,
    Vec3,
    frame_with_axis,
    normalize,
    rotation,
    v3,
)
from .parts import Attachment
from .skeleton import Segment, Skeleton

# Fraction of the hand length and breadth for each finger: where the knuckle
# sits along the palm, how far across it sits, total length and thickness.
FINGERS = (
    ("index", 0.99, 0.315, 0.420, 1.00, 4.5),
    ("middle", 1.03, 0.105, 0.455, 1.02, 1.2),
    ("ring", 1.00, -0.105, 0.425, 0.97, -1.8),
    ("little", 0.92, -0.315, 0.345, 0.85, -5.5),
)

PHALANX_SPLIT = (0.42, 0.31, 0.27)
PHALANX_CURL = (0.9, 1.5, 1.2)

# Toes, as fractions of the foot length: position along the foot, offset from
# the mid line towards the medial side, length and radius.
TOES = (
    ("hallux", 0.775, 0.115, 0.150, 0.048),
    ("toe2", 0.800, 0.040, 0.115, 0.032),
    ("toe3", 0.795, -0.022, 0.100, 0.029),
    ("toe4", 0.780, -0.080, 0.083, 0.026),
    ("toe5", 0.755, -0.132, 0.062, 0.023),
)


def _hand_frame(hand: Segment, side: float, pronation_deg: float) -> np.ndarray:
    """Frame with columns (towards the thumb, out of the palm, along the fingers).

    The palm starts facing the thigh and pronation rolls it about the forearm,
    which is what makes both hands mirror each other correctly.
    """
    axis = normalize(hand.end - hand.start)
    medial = v3(-side, 0.0, 0.0)
    palm = medial - axis * float(np.dot(medial, axis))
    palm = normalize(palm)
    palm = rotation(axis, side * pronation_deg) @ palm
    thumb = side * np.cross(axis, palm)
    return np.column_stack((normalize(thumb), palm, axis))


def build_hand(
    field: Field,
    skeleton: Skeleton,
    side: float,
    attachments: list[Attachment],
) -> None:
    m = skeleton.measures
    pose = m.params.pose
    tag = "l" if side > 0 else "r"
    hand = skeleton.s("hand", side)

    length = m.b("hand_length")
    breadth = m.b("hand_breadth")
    thickness = 0.300 * breadth
    palm_len = 0.55 * length
    frame = _hand_frame(hand, side, pose.forearm_pronation)
    thumb_dir, palm_dir, axis = frame[:, 0], frame[:, 1], frame[:, 2]
    wrist = hand.start
    weld = 0.30 * thickness

    def place(along: float, across: float, out: float) -> Vec3:
        return wrist + axis * along + thumb_dir * across + palm_dir * out

    # -- palm -------------------------------------------------------------
    section = (1.0, thickness / (breadth * 0.90))
    field.add(
        RoundCone(
            wrist,
            place(palm_len, 0.0, 0.0),
            breadth * 0.335,
            breadth * 0.455,
            section=section,
            frame=frame,
        ),
        blend=weld,
        name=f"palm_{tag}",
    )
    field.add(
        Ellipsoid(
            place(palm_len * 0.34, breadth * 0.215, -thickness * 0.10),
            v3(breadth * 0.165, thickness * 0.52, palm_len * 0.36),
            rot=frame,
        ),
        blend=weld * 1.4,
        name=f"thenar_{tag}",
    )
    field.add(
        Ellipsoid(
            place(palm_len * 0.52, -breadth * 0.275, -thickness * 0.08),
            v3(breadth * 0.115, thickness * 0.42, palm_len * 0.44),
            rot=frame,
        ),
        blend=weld * 1.4,
        name=f"hypothenar_{tag}",
    )
    # Dorsal knuckle pads, so the back of the hand is not a flat slab.
    field.add(
        Ellipsoid(
            place(palm_len * 0.80, 0.0, thickness * 0.16),
            v3(breadth * 0.400, thickness * 0.36, palm_len * 0.30),
            rot=frame,
        ),
        blend=weld * 1.2,
        name=f"metacarpals_{tag}",
    )

    # -- fingers ----------------------------------------------------------
    for name, base_t, across, rel_len, girth, splay in FINGERS:
        knuckle = place(palm_len * base_t, breadth * across, thickness * 0.02)
        radius = breadth * 0.100 * girth
        finger_len = length * rel_len
        jitter = skeleton.asym.factor(f"{name}{tag}", side, 0.03)

        direction = rotation(palm_dir, -side * splay) @ axis
        field.add(
            Sphere(knuckle, radius * 1.08),
            blend=weld * 0.5,
            name=f"knuckle_{name}_{tag}",
        )

        start = knuckle
        curl_total = 0.0
        local_frame = frame.copy()
        for index, (split, curl_scale) in enumerate(zip(PHALANX_SPLIT, PHALANX_CURL)):
            curl_total += pose.finger_curl * curl_scale * jitter
            direction = rotation(thumb_dir, curl_total) @ (
                rotation(palm_dir, -side * splay) @ axis
            )
            seg_len = finger_len * split
            end = start + direction * seg_len
            r0 = radius * (1.0 - 0.10 * index)
            r1 = radius * (1.0 - 0.10 * (index + 1))
            field.add(
                RoundCone(start, end, r0, r1, section=(1.0, 0.92)),
                blend=radius * 0.22,
                name=f"{name}_{index}_{tag}",
            )
            if index < 2:
                field.add(
                    Sphere(end, r1 * 1.06),
                    blend=radius * 0.35,
                    name=f"{name}_joint{index}_{tag}",
                )
            local_frame = np.column_stack(
                (
                    thumb_dir,
                    np.cross(direction, thumb_dir),
                    direction,
                )
            )
            start = end

        _add_nail(
            attachments,
            f"nail_{name}_{tag}",
            start - direction * finger_len * PHALANX_SPLIT[2] * 0.45,
            local_frame,
            width=radius * 1.25,
            length=finger_len * PHALANX_SPLIT[2] * 0.55,
            lift=radius * 0.82,
        )

    # -- thumb ------------------------------------------------------------
    thumb_base = place(palm_len * 0.24, breadth * 0.330, -thickness * 0.05)
    spread = rotation(palm_dir, -side * pose.thumb_spread) @ axis
    thumb_axis = normalize(rotation(np.cross(spread, palm_dir), -22.0) @ spread)
    radius = breadth * 0.132
    segments = ((0.215, 1.00, 12.0), (0.150, 0.90, 20.0), (0.115, 0.80, 16.0))

    start = thumb_base
    direction = thumb_axis
    curl_axis = normalize(np.cross(thumb_axis, palm_dir))
    local_frame = frame.copy()
    for index, (rel_len, girth, curl) in enumerate(segments):
        direction = normalize(rotation(curl_axis, -curl) @ direction)
        end = start + direction * length * rel_len
        field.add(
            RoundCone(start, end, radius * girth, radius * girth * 0.88),
            blend=radius * (0.55 if index == 0 else 0.30),
            name=f"thumb_{index}_{tag}",
        )
        local_frame = np.column_stack(
            (curl_axis, np.cross(direction, curl_axis), direction)
        )
        start = end

    _add_nail(
        attachments,
        f"nail_thumb_{tag}",
        start - direction * length * segments[-1][0] * 0.45,
        local_frame,
        width=radius * 1.15,
        length=length * segments[-1][0] * 0.5,
        lift=radius * 0.78,
    )


def _add_nail(
    attachments: list[Attachment],
    name: str,
    centre: Vec3,
    frame: np.ndarray,
    width: float,
    length: float,
    lift: float,
) -> None:
    """Place a nail plate on the dorsal side of a digit."""
    normal = frame[:, 1]
    attachments.append(
        Attachment(
            kind="nail",
            name=name,
            centre=centre + normal * lift,
            size=np.array([width * 0.5, 0.0007, length * 0.5]),
            frame=frame,
            curvature=0.12,
        )
    )


def build_foot(
    field: Field,
    skeleton: Skeleton,
    side: float,
    attachments: list[Attachment],
) -> None:
    m = skeleton.measures
    tag = "l" if side > 0 else "r"
    foot = skeleton.s("foot", side)
    ankle = skeleton.p(f"ankle_{tag}")

    fl = m.b("foot_length")
    up = v3(0.0, 0.0, 1.0)
    axis = normalize(v3(foot.axis[0], foot.axis[1], 0.0))
    medial = normalize(side * np.cross(up, axis))
    frame = np.column_stack((medial, up, axis))
    heel = foot.start
    weld = 0.042 * fl

    def place(along: float, across: float, height: float) -> Vec3:
        return heel + axis * fl * along + medial * fl * across + up * fl * height

    # -- heel and midfoot -------------------------------------------------
    field.add(
        Sphere(place(0.075, 0.0, 0.105), fl * 0.100),
        blend=weld * 0.6,
        name=f"heel_{tag}",
    )
    field.add(
        RoundCone(
            ankle + up * fl * 0.02,
            place(0.075, 0.0, 0.105),
            m.r("ankle") * 0.95,
            fl * 0.085,
        ),
        blend=weld,
        name=f"tarsus_{tag}",
    )
    midfoot_a = place(0.115, 0.0, 0.070)
    midfoot_b = place(0.700, 0.0, 0.052)
    field.add(
        RoundCone(
            midfoot_a,
            midfoot_b,
            fl * 0.115,
            fl * 0.150,
            section=(1.0, 0.62),
            frame=frame_with_axis(midfoot_b - midfoot_a, medial),
        ),
        blend=weld,
        name=f"midfoot_{tag}",
    )
    # Instep: the ramp from the ball up to the ankle.
    field.add(
        Ellipsoid(
            place(0.360, 0.0, 0.115),
            v3(fl * 0.135, fl * 0.115, fl * 0.230),
            rot=frame,
        ),
        blend=weld * 1.3,
        name=f"instep_{tag}",
    )
    field.add(
        Ellipsoid(
            place(0.700, 0.005, 0.060),
            v3(fl * 0.180, fl * 0.070, fl * 0.130),
            rot=frame,
        ),
        blend=weld,
        name=f"ball_{tag}",
    )
    # Achilles tendon, flat across the back of the heel.
    achilles_top = ankle + up * fl * 0.28 - axis * fl * 0.035
    achilles_foot = place(0.050, 0.0, 0.135)
    field.add(
        RoundCone(
            achilles_top,
            achilles_foot,
            m.r("ankle") * 0.52,
            fl * 0.062,
            section=(1.0, 0.72),
            frame=frame_with_axis(achilles_foot - achilles_top, medial),
        ),
        blend=weld * 1.1,
        name=f"achilles_{tag}",
    )
    # Malleoli: the medial one sits higher than the lateral one on every foot.
    field.add(
        Sphere(ankle + medial * m.r("ankle") * 0.72 + up * fl * 0.030, m.r("ankle") * 0.44),
        blend=m.r("ankle") * 0.5,
        name=f"malleolus_med_{tag}",
    )
    field.add(
        Sphere(ankle - medial * m.r("ankle") * 0.80, m.r("ankle") * 0.40),
        blend=m.r("ankle") * 0.5,
        name=f"malleolus_lat_{tag}",
    )
    # Medial longitudinal arch: carved out so the inner sole lifts off the floor.
    field.subtract(
        Ellipsoid(
            place(0.400, 0.105, -0.010),
            v3(fl * 0.105, fl * 0.075, fl * 0.190),
            rot=frame,
        ),
        blend=weld * 0.9,
        name=f"arch_{tag}",
    )

    # -- toes -------------------------------------------------------------
    for name, along, across, rel_len, rel_r in TOES:
        radius = fl * rel_r
        base = place(along, across, 0.0) + up * radius * 1.05
        splay = np.degrees(np.arctan2(across, 0.9)) * 0.35
        direction = normalize(rotation(up, -side * splay) @ axis)
        # Toes lie almost flat with a slight upward tilt at the tip.
        direction = normalize(direction + up * 0.10)
        tip = base + direction * fl * rel_len

        field.add(
            RoundCone(base, tip, radius, radius * 0.86, section=(1.0, 0.90)),
            blend=radius * 0.30,
            name=f"{name}_{tag}",
        )
        local_frame = np.column_stack(
            (
                normalize(np.cross(up, direction)),
                normalize(np.cross(direction, np.cross(up, direction))),
                direction,
            )
        )
        _add_nail(
            attachments,
            f"nail_{name}_{tag}",
            tip - direction * fl * rel_len * 0.30,
            local_frame,
            width=radius * 1.20,
            length=fl * rel_len * 0.42,
            lift=radius * 0.80,
        )
