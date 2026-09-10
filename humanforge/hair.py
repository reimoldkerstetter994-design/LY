"""Hair, as a solid shell offset from the skull.

Nothing else on a figure changes how human it reads as much as this.  A bald,
featureless cranium is read as an artefact almost regardless of how well the
skull underneath is proportioned -- partly because real bald heads have
stubble, temporal recession and a hairline scar's worth of texture, and partly
because the vault is the largest smooth area on a body and so shows every
approximation.  Adding hair covers that area with something whose silhouette the
eye expects to be soft, and it moves the head's read from "mannequin" to
"person" in one step.

It is a separate field from the body rather than part of it, because the two need
different materials -- hair is dark, rough and almost opaque, skin is pale and
translucent -- and no amount of shading trickery on a single mesh substitutes for
that.  Keeping it separate also means the hairline is a real edge in the geometry
rather than a painted line, which is what makes it survive a raking light.

Strand-level hair is out of scope: this is a shell, and it is shaped so that its
*silhouette* is right, since at any distance where individual strands would be
resolved the shell would be wrong anyway.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .head import FACE_Y, FACE_Z, HEAD_STATIONS, HeadFrame, relax, spline
from .sdf import (
    Ellipsoid,
    Field,
    HalfSpace,
    Loft,
    Op,
    RoundCone,
    frame_with_axis,
    normalize,
    surface_along,
    v3,
)
from .skeleton import LEFT, RIGHT, Skeleton

SEGMENTS = 192


CENTRE = 0.55
"""Height the shell is scaled about, as a fraction of head height.

Roughly the middle of the braincase, which is what makes the scaled copy sit
concentrically around the skull rather than sliding off the top of it.
"""

WIDEST = 0.492
"""The widest half breadth in :data:`~humanforge.head.HEAD_STATIONS`.

Only used to turn a clearance at the side of the head into a scale factor, so that
the style table can be written in millimetres of hair rather than in ratios.
"""


@dataclass(frozen=True)
class HairStyle:
    """One haircut, described by its silhouette rather than by its strands."""

    crown: float
    """Clearance between hair and scalp at the vertex, in head heights."""

    sides: float
    """Clearance at the widest part of the head, in head breadths."""

    nape: float
    """Height the shell reaches down to, as a fraction of head height."""

    fade: float
    """Height over which the shell thins away to nothing at its bottom edge.

    Without this the shell simply stops, and a shell that stops is a cliff with a
    lip on it running round the head above the ears -- the single thing that most
    made an early version read as a swim cap.  Real hair has no such edge on a
    short cut: it thins into the skin over a couple of centimetres at the nape and
    in front of the ear, and that fade *is* the sideburn.  A blunt cut does have an
    edge, so a bob sets this small rather than to zero.
    """

    hairline: float
    """Height of the hairline on the midline of the forehead."""

    recession: float = 0.5
    """How far the temples are cut back behind the midline hairline, 0 to 1."""

    fall: float = 0.0
    """How far below the chin the hair hangs behind the neck, in head heights."""

    ear_clearance: float = 1.0
    """How much of the ear is left uncovered; 0 buries it."""


STYLES: dict[str, HairStyle] = {
    # About 12 mm of hair on top is a short cut; 5 mm is a clipper cut, and at that
    # length what carries the style is the hairline, not the volume.
    "short": HairStyle(
        crown=0.052, sides=0.062, nape=0.400, fade=0.150, hairline=0.756
    ),
    "cropped": HairStyle(
        crown=0.022,
        sides=0.026,
        nape=0.380,
        fade=0.140,
        hairline=0.744,
        recession=0.35,
    ),
    "receded": HairStyle(
        crown=0.040, sides=0.048, nape=0.410, fade=0.150, hairline=0.812, recession=1.0
    ),
    "thinning": HairStyle(
        crown=0.026,
        sides=0.032,
        nape=0.420,
        fade=0.160,
        hairline=0.800,
        recession=0.85,
    ),
    # A woman's hairline is rounder and a little lower, and the shell is much
    # thicker at the sides than on top, because that is where the length hangs.
    "bob": HairStyle(
        crown=0.095,
        sides=0.150,
        nape=0.205,
        fade=0.075,
        hairline=0.742,
        recession=0.15,
        fall=0.04,
    ),
    "long": HairStyle(
        crown=0.105,
        sides=0.185,
        nape=0.175,
        fade=0.055,
        hairline=0.738,
        recession=0.10,
        fall=0.34,
        ear_clearance=0.35,
    ),
    "ponytail": HairStyle(
        crown=0.058,
        sides=0.080,
        nape=0.345,
        fade=0.120,
        hairline=0.748,
        recession=0.12,
        fall=0.10,
    ),
}


BROW_STATIONS = (
    # Half breadth from the midline, height, and how thick the brow is there.
    # A brow is not an arc struck about the eye: it rises from a blunt medial head,
    # peaks about two thirds of the way out and falls away to a thin tail.  Getting
    # the peak wrong is what makes drawn-on eyebrows look drawn on.
    (0.048, 0.5405, 0.50),
    (0.105, 0.5555, 0.98),
    (0.163, 0.5655, 1.00),
    (0.220, 0.5695, 0.86),
    (0.268, 0.5595, 0.54),
    (0.308, 0.5465, 0.20),
)


def build_hair(
    skeleton: Skeleton, style_name: str | None, body: Field | None = None
) -> Field:
    """Everything on a head that is hair rather than skin.

    Always returns a field, even for a bald figure, because the eyebrows live in it
    too: they have to be shaded as hair and not as skin, and a face without them
    reads as a shop mannequin however good the rest of it is.

    ``body`` is the finished skin field, used only to find where the brows have to
    sit.  Without it they are placed on the station table's idea of the forehead,
    which the brow ridge masses have already moved by several millimetres.
    """
    h = HeadFrame(skeleton)
    style = STYLES[style_name] if style_name else None
    field = Field(f"hair_{style_name or 'brows'}")
    if style is None:
        _add_brows(field, skeleton, h, body)
        return field

    # The shell is the skull's own profile *scaled up*, not offset outwards, and
    # that is the whole trick.  Offsetting fails at the crown: the station table
    # tapers to a point at the vertex, so adding a constant to its half breadths
    # leaves a stub of exactly that constant sitting on top of a profile that has
    # already closed -- which meshes as a teat on the crown, and no amount of
    # smoothing removes it, because the geometry really is that shape.  Scaling has
    # no such seam anywhere: wherever the skull closes, so does the shell.
    #
    # Vertically the stretch acts only above :data:`CENTRE`, so that the lower half
    # of the shell sits at exactly the heights it was measured at and thickens
    # sideways alone.  Stretching the whole thing would lift the nape section into
    # the profile of a wider one above it and leave a lip round the bottom edge.
    grow_z = 1.0 + style.crown / (1.0 - CENTRE)
    grow_xy = 1.0 + style.sides / WIDEST

    rows = np.asarray(HEAD_STATIONS, dtype=np.float64)
    knots = rows[:, 0]
    top = CENTRE + (1.0 - CENTRE) * grow_z
    zs = np.linspace(style.nape, top, SEGMENTS + 1)
    scalp = np.clip(
        np.minimum(zs, CENTRE) + np.maximum(zs - CENTRE, 0.0) / grow_z,
        knots[0],
        knots[-1],
    )
    widths, fronts, backs, powers = (
        spline(knots, rows[:, c], scalp) for c in (1, 2, 3, 4)
    )

    # Sideways the shell grows to full thickness over `fade`, from nothing at its
    # bottom edge, which is what keeps that edge from being a rim.
    ramp = np.clip((zs - style.nape) / max(style.fade, 1.0e-6), 0.0, 1.0)
    grow = 1.0 + (grow_xy - 1.0) * ramp * ramp * (3.0 - 2.0 * ramp)

    field.add(
        Loft(
            origin=h.origin,
            rot=h.orientation,
            heights=zs * h.height,
            half_width=np.maximum(relax(widths * grow * h.width), 1.0e-4),
            half_depth=np.maximum(
                relax(0.5 * (fronts - backs) * grow * h.depth), 1.0e-4
            ),
            offset=relax(0.5 * (fronts + backs) * grow * h.depth),
            exponent=np.maximum(relax(powers), 2.0),
        ),
        name="scalp",
    )

    _add_fall(field, h, style, grow_xy)
    _cut_hairline(field, h, style)
    _clear_ears(field, h, style)
    # After the cuts, or the hairline plane would shave the brows off with the
    # forehead -- they sit well below it, but the plane reaches to infinity.
    _add_brows(field, skeleton, h, body)
    return field


def _add_brows(
    field: Field, skeleton: Skeleton, h: HeadFrame, body: Field | None
) -> None:
    """A band of hair laid along each brow ridge, following the actual skin.

    Placed by marching out from the middle of the head until the skin is crossed,
    rather than by trusting the station table: the brow ridge masses stand three or
    four millimetres proud of the lofted forehead, and a brow floating that far off
    the face in a raking light is unmistakable.

    Each segment's axis lies *on* the surface it was found on, so half its thickness
    is buried in the head and half stands out.  Being a separate solid, the buried
    half costs nothing -- there is no boolean to go wrong, and no seam.
    """
    p = skeleton.measures.params
    female = 1.0 if p.sex == "female" else (0.5 if p.sex == "neutral" else 0.0)
    weight = (1.0 - 0.30 * female) * (0.80 if p.age in ("child", "teen") else 1.0)
    thick = 0.019 * h.height * weight
    ops: list[Op] = list(body.ops) if body is not None else []
    forward = normalize(h.orientation @ v3(0.0, 1.0, 0.0))

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        points = []
        for x, z, _ in BROW_STATIONS:
            inner = h.point(side * x, 0.0, z)
            if ops:
                points.append(surface_along(ops, inner, forward, 0.75 * h.depth))
            else:
                points.append(h.point(side * x, FACE_Y["brow"], z))

        for index in range(len(BROW_STATIONS) - 1):
            a, b = points[index], points[index + 1]
            ra = thick * BROW_STATIONS[index][2]
            rb = thick * BROW_STATIONS[index + 1][2]
            field.add(
                RoundCone(
                    a,
                    b,
                    ra,
                    rb,
                    # Flattened against the face: a brow is a couple of millimetres
                    # of relief over a centimetre of height, and a round section
                    # that tall would stand off the forehead like a welt.
                    section=(0.42, 1.0),
                    frame=frame_with_axis(b - a, forward),
                ),
                # Generous next to the segment radii, because the six stations are
                # a polyline through a curve: blended tightly, every join stands as
                # its own bead and the brow reads as a chain of sausages.
                blend=0.013 * h.height,
                name=f"brow_{tag}_{index}",
            )


def _add_fall(field: Field, h: HeadFrame, style: HairStyle, grow_xy: float) -> None:
    """Hang hair down the back of the neck for the styles that have length.

    The scaled shell cannot do this on its own.  Below the chin the station table
    has run out, and holding its last section -- the point of the chin -- would put
    a spike of hair in front of the throat rather than a fall of it behind.  So the
    fall is its own loft, sitting behind the neck, wide and shallow the way a mass
    of hair lying against a back is.
    """
    if style.fall <= 0.0:
        return
    zs = np.linspace(-style.fall, 0.34, 96)
    # 0 at the bottom of the fall, 1 where it meets the shell, so the fall can
    # narrow towards its end without the taper showing as a crease at the top.
    along = (zs + style.fall) / (0.34 + style.fall)
    width = (0.30 + 0.14 * along) * grow_xy
    field.add(
        Loft(
            origin=h.origin,
            rot=h.orientation,
            heights=zs * h.height,
            half_width=width * h.width,
            half_depth=(0.075 + 0.045 * along) * h.depth,
            offset=(-0.315 - 0.055 * along) * h.depth,
            exponent=2.6,
        ),
        blend=0.030 * h.height,
        name="fall",
    )


def _cut_hairline(field: Field, h: HeadFrame, style: HairStyle) -> None:
    """Remove the shell from the face side of the hairline.

    A plane does the bulk of it, tilted so that it leans back as it descends.  That
    is not a stylistic choice: the plane has to diverge from the skull *upwards*
    from the hairline, or it keeps cutting into the scalp above it and the hairline
    ends up somewhere near the crown.

    A plane cannot give temporal recession, though -- the receding corners either
    side of the widow's peak -- and a hairline without them is the flat band across
    the forehead that reads as a wig.  Those are two more masses, and they are what
    most of the difference between a young and an old hairline is.
    """
    plane = h.point(0.0, FACE_Y["forehead"], style.hairline)
    lean = np.radians(32.0)
    normal = h.orientation @ v3(0.0, -np.cos(lean), np.sin(lean))
    field.subtract(HalfSpace(plane, normal), blend=0.014 * h.height, name="hairline")

    if style.recession <= 0.02:
        return
    # The temples are cut by two more planes, yawed outwards, and specifically not
    # by a pair of masses: a mass sunk into a 12 mm shell removes a disc from the
    # middle of it and leaves a round bald patch, which is a far worse artefact than
    # the flat hairline it was meant to fix.  A half space cannot do that -- whatever
    # it removes reaches out to infinity, so it can only ever take a bite off an
    # edge.
    lean = np.radians(20.0)
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            HalfSpace(
                h.point(
                    side * 0.330,
                    FACE_Y["forehead"] - 0.010,
                    style.hairline + 0.030 * style.recession,
                ),
                h.rotated(v3(0.0, 0.0, 1.0), -side * 52.0)
                @ v3(0.0, -np.cos(lean), np.sin(lean)),
            ),
            blend=0.018 * h.height,
            name=f"temple_{tag}",
        )


def _clear_ears(field: Field, h: HeadFrame, style: HairStyle) -> None:
    """Cut the shell back off the ears.

    The scalp offset does not know about them, so without this the shell runs
    straight over the top of each ear and the head grows a pair of covered lumps --
    which is worse than no hair, because the ear is still there in silhouette and
    now appears to be under a swim cap.
    """
    if style.ear_clearance <= 0.0:
        return
    reach = style.ear_clearance
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            Ellipsoid(
                h.point(side * (0.560 + 0.10 * reach), FACE_Y["ear"], 0.430),
                h.size(0.230 * reach, 0.150, 0.145 * reach),
                rot=h.rotated(v3(0.0, 1.0, 0.0), -side * 8.0),
            ),
            blend=0.008 * h.height,
            name=f"ear_clear_{tag}",
        )
