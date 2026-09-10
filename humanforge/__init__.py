"""humanforge -- parametric, anatomically driven human figures for Blender.

The package is split so that the geometry half never imports ``bpy``:

* :mod:`humanforge.sdf` / :mod:`humanforge.polygonize` -- signed distance field
  primitives and the surface extractor (NumPy only).
* :mod:`humanforge.anatomy` -- anthropometric proportions and body parameters.
* :mod:`humanforge.skeleton` -- joint positions and limb frames for a pose.
* :mod:`humanforge.figure` -- assembles a whole body out of blended solids.
* :mod:`humanforge.presets` -- ready-made body types.
* :mod:`humanforge.blender` -- everything that needs Blender: meshes,
  skin shading, hair, lighting, cameras and the Cycles render pipeline.

That split keeps the anatomy testable with plain ``python3 -m pytest`` while
the rendering side runs inside ``blender --background --python``.
"""

from __future__ import annotations

__all__ = [
    "anatomy",
    "figure",
    "polygonize",
    "presets",
    "sdf",
    "skeleton",
]

__version__ = "0.1.0"
