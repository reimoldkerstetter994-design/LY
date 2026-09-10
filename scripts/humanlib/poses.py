"""Pose definitions and pose application for the MPFB "default" skeleton.

Two kinds of poses are supported:

* Hand-made poses: a dictionary ``bone -> (x, y, z)`` in degrees (Euler XYZ, bone
  local space).  A bone name ending in ``.*`` is expanded to ``.L`` and ``.R``; the
  right side gets mirrored Y/Z angles so the pose stays symmetric.
* ``bvh:<name>`` poses: a MakeHuman pose from the *poses01* asset pack
  (``<mpfb user data>/poses/<name>/<name>.bvh``) imported through MPFB.

Axis conventions of the MPFB default rig (found empirically, see README):

* ``upperarm01``: +X swings the arm forward, -Z (left side) pulls the arm toward
  the body (adduction), +Z lifts it.
* ``lowerarm01``: +X bends the elbow.  ``lowerarm02`` Y twists the forearm.
* ``upperleg01``: -X swings the leg forward, +X backward.
* ``lowerleg01``: +X bends the knee.
* ``finger*``: +X curls the finger toward the palm.
* ``head``/``neck``: X nods, Y turns (yaw), Z tilts.
* ``spine*``: X bends forward/backward, Y twists, Z bends sideways.
"""

import math
import os

import bpy


def _fingers(curl, thumb=None, sides="*"):
    """Return rotations that curl all fingers by ``curl`` degrees (thumb separately)."""
    if thumb is None:
        thumb = curl * 0.4
    rot = {}
    for finger in range(2, 6):
        for seg, factor in ((1, 0.7), (2, 1.0), (3, 0.9)):
            rot[f"finger{finger}-{seg}.{sides}"] = (curl * factor, 0.0, 0.0)
    for seg, factor in ((1, 0.3), (2, 0.8), (3, 0.8)):
        rot[f"finger1-{seg}.{sides}"] = (thumb * factor, 0.0, 0.0)
    return rot


def _merge(*dicts):
    out = {}
    for d in dicts:
        out.update(d)
    return out


# Arms hanging naturally, weight slightly on the right leg, head turned a bit.
RELAXED_STAND = _merge(
    {
        "upperarm01.*": (4.0, 0.0, -40.0),
        "lowerarm01.*": (14.0, 0.0, 0.0),
        "lowerarm02.*": (0.0, 12.0, 0.0),
        "wrist.*": (6.0, 0.0, -4.0),
        "spine05": (0.0, 0.0, 2.0),
        "spine03": (0.0, 0.0, -2.0),
        "spine01": (2.0, 0.0, 0.0),
        "upperleg01.L": (-3.0, 0.0, -3.0),
        "lowerleg01.L": (6.0, 0.0, 0.0),
        "neck01": (0.0, 6.0, 0.0),
        "head": (2.0, 8.0, -2.0),
    },
    _fingers(30.0),
)

# Classic contrapposto: hip pushed to one side, opposite shoulder dropped.
CONTRAPPOSTO = _merge(
    {
        "spine05": (0.0, 0.0, 7.0),
        "spine04": (0.0, 0.0, -3.0),
        "spine02": (0.0, 0.0, -4.0),
        "spine01": (3.0, 0.0, -2.0),
        "upperleg01.L": (-4.0, 0.0, -10.0),
        "lowerleg01.L": (14.0, 0.0, 0.0),
        "upperleg01.R": (-2.0, 0.0, 3.0),
        "upperarm01.L": (6.0, 0.0, -36.0),
        "upperarm01.R": (10.0, 0.0, 42.0),
        "lowerarm01.L": (10.0, 0.0, 0.0),
        "lowerarm01.R": (25.0, 0.0, 0.0),
        "lowerarm02.*": (0.0, 12.0, 0.0),
        "wrist.*": (8.0, 0.0, 0.0),
        "neck01": (0.0, -8.0, 0.0),
        "head": (-3.0, -10.0, 4.0),
    },
    _fingers(25.0),
)

# Mid stride walking pose.
WALK = _merge(
    {
        "upperleg01.L": (-24.0, 0.0, -2.0),
        "lowerleg01.L": (10.0, 0.0, 0.0),
        "foot.L": (-8.0, 0.0, 0.0),
        "upperleg01.R": (18.0, 0.0, 2.0),
        "lowerleg01.R": (22.0, 0.0, 0.0),
        "foot.R": (12.0, 0.0, 0.0),
        "spine05": (0.0, 6.0, 0.0),
        "spine02": (0.0, -4.0, 0.0),
        "spine01": (4.0, 0.0, 0.0),
        "upperarm01.L": (-18.0, 0.0, -38.0),
        "lowerarm01.L": (14.0, 0.0, 0.0),
        "upperarm01.R": (22.0, 0.0, 38.0),
        "lowerarm01.R": (25.0, 0.0, 0.0),
        "lowerarm02.*": (0.0, 8.0, 0.0),
        "wrist.*": (6.0, 0.0, 0.0),
        "neck01": (0.0, 4.0, 0.0),
        "head": (-2.0, 5.0, 0.0),
    },
    _fingers(28.0),
)

# Right hand raised in a friendly wave, left arm relaxed.
WAVE = _merge(
    {
        "upperarm01.L": (4.0, 0.0, -40.0),
        "lowerarm01.L": (14.0, 0.0, 0.0),
        "lowerarm02.L": (0.0, 12.0, 0.0),
        "wrist.L": (6.0, 0.0, -4.0),
        "clavicle.R": (0.0, 0.0, -8.0),
        "shoulder01.R": (0.0, 0.0, -10.0),
        "upperarm01.R": (8.0, 20.0, 62.0),
        "lowerarm01.R": (100.0, 0.0, 0.0),
        "lowerarm02.R": (0.0, -30.0, 0.0),
        "wrist.R": (-10.0, 0.0, 15.0),
        "spine05": (0.0, 0.0, -3.0),
        "spine02": (0.0, 0.0, 3.0),
        "upperleg01.R": (-3.0, 0.0, 4.0),
        "lowerleg01.R": (8.0, 0.0, 0.0),
        "neck01": (0.0, 5.0, 0.0),
        "head": (-4.0, 6.0, 6.0),
    },
    _fingers(22.0, sides="L"),
    _fingers(4.0, thumb=6.0, sides="R"),
)

# Right hand brought to the chin, thoughtful head tilt.
THINKING = _merge(
    {
        "upperarm01.L": (4.0, 0.0, -40.0),
        "lowerarm01.L": (14.0, 0.0, 0.0),
        "lowerarm02.L": (0.0, 12.0, 0.0),
        "wrist.L": (6.0, 0.0, -4.0),
        "upperarm01.R": (20.0, 0.0, 15.0),
        "lowerarm01.R": (108.0, 0.0, 0.0),
        "lowerarm02.R": (0.0, -20.0, 0.0),
        "wrist.R": (15.0, 0.0, 5.0),
        "spine01": (3.0, 0.0, 0.0),
        "spine05": (0.0, 0.0, 3.0),
        "upperleg01.L": (-2.0, 0.0, -4.0),
        "lowerleg01.L": (8.0, 0.0, 0.0),
        "neck01": (6.0, -6.0, 0.0),
        "head": (10.0, -8.0, -8.0),
    },
    _fingers(30.0, sides="L"),
    _fingers(40.0, thumb=10.0, sides="R"),
)

MANUAL_POSES = {
    "relaxed_stand": RELAXED_STAND,
    "contrapposto": CONTRAPPOSTO,
    "walk": WALK,
    "wave": WAVE,
    "thinking": THINKING,
}


def expand_pose(pose):
    """Expand ``.*`` bone names into ``.L``/``.R`` entries (mirroring Y and Z)."""
    out = {}
    for name, rot in pose.items():
        if name.endswith(".*"):
            base = name[:-2]
            x, y, z = rot
            out[base + ".L"] = (x, y, z)
            out[base + ".R"] = (x, -y, -z)
        else:
            out[name] = tuple(rot)
    return out


def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)


def apply_manual_pose(rig, pose):
    reset_pose(rig)
    for name, rot in expand_pose(pose).items():
        pb = rig.pose.bones.get(name)
        if pb is None:
            print(f"[poses] bone not found: {name}")
            continue
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = tuple(math.radians(a) for a in rot)


def apply_bvh_pose(rig, pose_name):
    from bl_ext.user_default.mpfb.services.animationservice import AnimationService
    from bl_ext.user_default.mpfb.services.locationservice import LocationService

    bvh = os.path.join(LocationService.get_user_data(), "poses", pose_name, pose_name + ".bvh")
    if not os.path.exists(bvh):
        raise FileNotFoundError(f"BVH pose not found: {bvh} (is the poses01 asset pack installed?)")
    AnimationService.import_bvh_file_as_pose(rig, bvh)
    # The BVH importer leaves the temporary source armature selected/active.
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_pose(rig, pose_spec):
    """Apply a pose given either a manual pose name or ``bvh:<pose_name>``."""
    if not pose_spec or pose_spec == "rest":
        reset_pose(rig)
        return
    if pose_spec.startswith("bvh:"):
        apply_bvh_pose(rig, pose_spec[4:])
        return
    if pose_spec not in MANUAL_POSES:
        raise KeyError(f"Unknown pose '{pose_spec}'. Known: {sorted(MANUAL_POSES)} or bvh:<name>")
    apply_manual_pose(rig, MANUAL_POSES[pose_spec])
