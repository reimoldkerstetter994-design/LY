"""Small rigid pieces that are placed rather than sculpted.

Eyeballs and nails are only a few millimetres across and need their own
material, so carving them out of the same voxel grid as the body would be both
wasteful and imprecise.  The geometry layer therefore reports them as
transforms and the Blender layer instantiates real primitives at those
transforms.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Attachment:
    """One placed primitive: an eyeball, a fingernail, a toenail."""

    kind: str
    """``eye``, ``nail`` or ``cornea``."""

    name: str
    centre: np.ndarray
    size: np.ndarray
    """Radii for ``eye``, half extents for ``nail``."""

    frame: np.ndarray
    """3x3 orientation; for nails column 1 is the outward (dorsal) normal."""

    curvature: float = 0.0
    """How much a nail is domed across its width, as a fraction of its width."""
