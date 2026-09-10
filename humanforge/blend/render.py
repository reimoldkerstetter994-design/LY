"""Cycles configuration and the render call itself."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import bpy


@dataclass(frozen=True)
class RenderSettings:
    """Output size, sampling and colour management."""

    width: int = 1080
    height: int = 1620
    samples: int = 220
    denoise: bool = True

    exposure: float = 0.0
    view_transform: str = "AgX"
    """AgX is what keeps a bright key light from clipping skin to white; a
    ``Standard`` transform blows out a lit cheek at almost any exposure."""

    max_bounces: int = 24
    transmission_bounces: int = 12
    caustics: bool = False
    threads: int = 0
    """0 lets Blender use every core."""


def configure(scene: bpy.types.Scene, settings: RenderSettings) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = settings.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.008
    scene.cycles.use_denoising = settings.denoise
    if settings.denoise:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
        scene.cycles.denoising_use_gpu = False

    # Skin is a volumetric material lit by area lights, so the paths that matter
    # are diffuse and transmission ones; caustics only add fireflies here.
    scene.cycles.max_bounces = settings.max_bounces
    scene.cycles.diffuse_bounces = 8
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = settings.transmission_bounces
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = settings.caustics
    scene.cycles.caustics_refractive = settings.caustics
    # Filter Glossy trades noise for blur in glossy paths, and the specular
    # breakup off sub-millimetre pore relief is exactly what it blurs away.  Low
    # enough to keep that, high enough to keep the sebum coat from firefly-ing.
    scene.cycles.blur_glossy = 0.4
    scene.cycles.sample_clamp_indirect = 12.0

    # Light tree importance sampling: with four area lights and a bright world it
    # roughly halves the samples needed for a clean shadow side.
    scene.cycles.use_light_tree = True

    scene.render.resolution_x = settings.width
    scene.render.resolution_y = settings.height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.cycles.filter_width = 1.5
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    if settings.threads:
        scene.render.threads_mode = "FIXED"
        scene.render.threads = settings.threads

    scene.view_settings.view_transform = settings.view_transform
    scene.view_settings.exposure = settings.exposure
    scene.display_settings.display_device = "sRGB"


def render(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    path: Path,
    settings: RenderSettings,
) -> Path:
    """Render one frame through ``camera`` and return the file written."""
    scene.camera = camera
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path.with_suffix(""))
    bpy.ops.render.render(write_still=True)
    return path.with_suffix(".png")
