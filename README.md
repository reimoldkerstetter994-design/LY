# humanforge

Procedurally built human figures, meshed from signed distance fields and
rendered in Blender with Cycles.

There is no sculpting and no scanned base mesh. Every figure is defined by about
a dozen numbers -- stature, sex, age, muscle, fat, sag -- from which the whole
body is derived: segment lengths from anthropometric tables, girths from ANSUR
percentiles, then a solid built out of lofted cross sections with muscle bellies,
fat pads and skeletal landmarks blended onto it. The result is polygonised on a
voxel grid and shaded with subsurface-scattering skin under a studio rig.

```
/opt/blender/blender -b --python scripts/render.py -- --all --shot full
```

## Why distance fields

The alternative is a base mesh with shape keys, and it puts the anatomy out of
reach: you can only ever deform what someone already sculpted. A distance field
is a function, so a figure can be *described* -- "the vastus lateralis is an
ellipsoid 44 % of a thigh radius outboard, scaled by the muscle parameter" -- and
the description is what varies between figures. Blending two solids is a
`min` with a soft corner, which means tissue can be joined where it really is
continuous and creased where the body actually has a crease.

The cost is that a distance field has no vertices to check. Nothing tells you a
mass ended up inside another one, or on the wrong side of a limb, so the
correctness has to come from measurement and from looking.

## Layout

| Module | What it holds |
| --- | --- |
| `humanforge/sdf.py` | Primitives, smooth booleans, the loft, surface ray marching |
| `humanforge/polygonize.py` | Marching tetrahedra, component selection, Taubin smoothing |
| `humanforge/anatomy.py` | Body parameters and every measurement derived from them |
| `humanforge/skeleton.py` | Joint positions and a local frame per limb segment |
| `humanforge/figure.py` | The torso loft plus all the soft tissue on it |
| `humanforge/head.py` | Skull loft, jaw, brow, nose, mouth, eyes, ears |
| `humanforge/hair.py` | The hair shell and the eyebrows |
| `humanforge/extremities.py` | Hands and feet, phalanx by phalanx |
| `humanforge/shading.py` | Per-vertex anatomical attributes for the skin shader |
| `humanforge/metrics.py` | Girths and heights measured off the finished solid |
| `humanforge/blend/` | Mesh import, materials, studio lighting, cameras, Cycles |

`humanforge` itself imports nothing but numpy and runs outside Blender;
`humanforge/blend` is the only part that needs `bpy`.

## The twelve figures

`humanforge/presets.py` holds a spread wide enough to exercise the parameters
rather than a set of variations on one body: `male_average`, `male_athletic`,
`male_lean`, `male_heavy`, `female_average`, `female_athletic`, `female_curvy`,
`elder_male`, `elder_female`, `teen_female`, `teen_male`, `child`.

Complexion is kept in `humanforge/blend/looks.py`, separately from the body, so
that any figure can be rendered with any of the six skin tones. Stature and
girth are anthropometry; skin colour is not.

## Checking the result

Four things, in increasing order of how much they catch.

**`scripts/calibrate.py`** measures the built solid -- girths on planes cut
perpendicular to each limb, heights off the silhouette -- and compares them
against percentile ranges per preset. This is what keeps a heavy figure heavy
without making it a sphere.

**`scripts/face_metrics.py`** does the same for twelve craniofacial
measurements: bizygomatic and bigonial breadth, nose protrusion and breadth,
mouth breadth, ear length, interpupillary distance and the rest.

**`pytest`** covers the field sampler and the mesher, and then asserts things
about *shape* rather than about code paths: that a thigh is deeper than it is
wide, that its bulge is on the lateral side, that a calf stands behind the shin,
that paired features are mirrored to within the seeded asymmetry, that the
cranium is widest above the ear rather than near the crown.

**Clay renders.** The most important one, and there is no way round it. Every
figure passed all twelve craniofacial measurements and the whole girth
calibration while the head still looked grotesque -- because a scalar cannot see
a shape. `--clay --crop head` gives a matte grey close-up at a voxel fine enough
to judge form, and that is what surfaced almost every fault worth fixing.

```
/opt/blender/blender -b --python scripts/render.py -- \
    --preset male_average --shot head_front --crop head --voxel 0.0016 --clay
```

The `scripts/probe_*.py` scripts sit between the two: given a fault a render has
shown, they report numbers along a section so it can be located. `probe_limb.py`
is the clearest example -- it prints where the skin is in four directions around
each limb, and four numbers within a percent of each other mean the limb is a
tube whatever its silhouette looks like.

## Things that turned out to matter

Most of these were learned by getting them wrong, and they are recorded in the
code at the point where each one applies.

*A mass standing as far proud as its blend radius is wide raises a ring around
its rim.* A smooth union pushes the surface out by up to a quarter of the blend
radius, so a two-millimetre feature -- a lip, a brow, an eyelid -- needs a blend
well under two millimetres or it becomes a bead.

*A mass that only just breaks the surface crosses it at a glancing angle,* over a
wide thin sliver that the mesher renders as a broken dotted line. The same thing
happens to a cut whose axis sits behind the skin: it breaks through in patches.
Concave features are therefore placed against the surface *as built* -- found by
marching a ray out from inside -- and never against the loft they started from,
which the muscle masses have already moved by a couple of centimetres.

*A muscle offset from a limb axis by less than its own radius is invisible.* It
never reaches the surface of the cone it was blended onto, so it adds volume
nothing can see. Every muscle in both arms and both legs was in this state at
one point, and the limbs were smooth tubes with a named belly for each muscle
group buried inside them.

*A limb frame's transverse axis is not mirrored between sides.* It points the
same way in the world for a left limb and a right one, so it is medial on one
side and lateral on the other, and only multiplying by the limb's own sign makes
an offset mean the same thing on both.

*Hair has to be a scaled copy of the skull, not an offset one.* The station
table tapers to a point at the vertex, so adding a constant to its half breadths
leaves a stub of exactly that constant standing on a profile that has already
closed. Scaling closes wherever the skull closes.

*Half-spaces are the only safe way to cut back an edge of a shell.* A mass sunk
into a 12 mm hair shell removes a disc from the middle of it and leaves a round
bald patch; a half space reaches to infinity and so can only ever bite an edge.

*Lighting has to be sized to the framed subject, not to the figure.* How soft a
light is depends on its size relative to what it is lighting, so a rig built for
a standing figure gives a face no shadow at all -- which reads as a modelling
fault rather than a lighting one.

*Skin wants a high subsurface weight and a short radius,* which is the opposite
of the intuitive setting. Weighted low, most of the surface stays Lambertian and
Lambertian skin is matte paint. Given a long radius to compensate, the
scattering stops describing a surface and the figure goes pale and waxy.

## Requirements

Python 3.11+, numpy, and Blender 4.5 for anything under `humanforge/blend`.
See `requirements.txt`.
