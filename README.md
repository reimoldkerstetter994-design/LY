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

`probe_field.py` is the one exception, in that it finds a whole class of fault
without a render at all. Marching tetrahedra locates the surface by interpolating
between grid samples, so it is only accurate where the field's gradient has
magnitude one -- where the value really is a distance. Individual primitives
satisfy that; smooth booleans do not. Where two surfaces cross at a shallow
angle, the blend averages two nearly opposite normals, the average is nearly
zero, and through that band the interpolated crossing can be out by several times
the true distance. That is what a dotted line along a jaw or around an ear
actually is, and it reads below about 0.4 on this probe.

## Getting a mesh out

`scripts/build_mesh.py` builds and polygonises without Blender, which is the fast
loop for checking geometry, and writes OBJ with the body and hair as separate
objects:

```
python3 scripts/build_mesh.py --all --voxel 0.003 --obj /tmp/figure.obj
```

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

*A standing figure with its arms out is about as wide as it is tall,* so framing
its height in a portrait-shaped frame cuts the hands off. The camera fits
whichever of the height and the width binds, measured along its own horizontal
axis so that a yawed camera is allowed to foreshorten a spread arm.

*Nothing in a shader can show on a surface that is out of focus,* and this is the
one that wasted the most time. Three scales of relief were in the skin from early
on and none of it reached a single render, because the portrait was focused on
`head_centre` -- a landmark inside the skull -- at f/2.8, which is 40 mm of depth
of field for a head 200 mm deep. Focus on the near eye and stop down, and *then*
argue about bump strengths. The same goes for Cycles' Filter Glossy, which at its
default was blurring away the specular breakup that sub-millimetre relief exists
to produce.

*An F1 Voronoi's distance output is already a field of pits,* zero at each cell
centre and rising away from it. Inverting it -- the obvious thing to reach for
when you want pores -- turns every pore into a bump and the skin into gooseflesh.

*A sclera at one flat brightness reads as a white ball resting in an eye-shaped
hole.* It has to be shaded down away from the gaze axis: the further round the
globe a point lies, the deeper under the lids it is and the less of the room
reaches it. Cycles gets some of this from the lids, nowhere near enough.

*To judge a bulge, measure a profile rather than look at a render.* The ball slung
under the jaw took four renders to misdiagnose and one sixteen-line script to
find: printing the frontmost surface every 10 mm down the midline showed the
surface falling back 36 mm in the 10 mm below the point of the chin, which is a
cliff, and it is a number that can be tuned against in seconds rather than
minutes. The same script showed that the fix I had reached for first made it
worse, which no amount of looking at the render had told me.

*The tables here are in four different units* -- head heights, head breadths,
face depths and metres -- and `FACE_X`, `FACE_Y` and `FACE_Z` all have a `chin`
key. Reading the half breadth (0.148) as the depth (0.353) is what caused the
misdiagnosis above.

## What is still wrong

Honest list, all of it visible only in close-up on the face; the figures hold up
at full length.

- The mouth is close to a flat slab. There is a philtrum and the seam is no
  longer dead straight, but there is no cupid's bow, because the bow is on the
  upper border of the upper lip rather than on the seam and that border is
  currently just where an ellipsoid runs out.
- The eye is the weakest thing on the figure. The aperture is cut through a dome
  over the globe, which is the right construction, but the lid margins are far
  heavier than a lid, the lower lid reads as a pad lying in front of the eye
  rather than a rim on it, and there is no lash line: at portrait distance the
  result is closer to a doll's glass eye than to an eye. Shading the sclera into
  the socket helped and did not fix it.
- The nose has flat facets near the tip, where the superelliptical sections reach
  an exponent above three and start to square off.
- The hairline is a cleaner bevel than a real one, and the shell reads slightly
  helmet-like from the front. Strand hair is out of scope, but the silhouette
  could carry more irregularity than it does.
- Hands and feet are correct phalanx by phalanx and still read as paddles from
  the front, because the arches are missing.
- `probe_field.py` still reports about 0.16 around the ear, down from 0.09, and
  0.38 under the chin. There is a faint broken line at both at a 1.5 mm voxel.
- Skin relief now registers, but it is a long way from photographic. It reads as
  fine texture rather than as skin, and there is no unevenness at the scale
  between a pore and a whole face -- no blotching, no vellus catchlight, nothing
  that varies from one part of a cheek to another.
- The clay close-ups show the whole lower face as soft, thumb-pressed forms: the
  jaw has no crisp lower border, the mentolabial sulcus is a groove rather than a
  transition, and the lips are two overlapping slabs.

## Requirements

Python 3.11+, numpy, and Blender 4.5 for anything under `humanforge/blend`.
See `requirements.txt`.
