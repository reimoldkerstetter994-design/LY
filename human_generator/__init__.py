"""
Blender Realistic Human Model Generation System.
"""

from .config import (
    BODY_ARCHETYPES,
    SKIN_PRESETS,
    EYE_PRESETS,
    HAIR_PRESETS,
    CLOTHING_PRESETS,
)
from .builder import (
    build_complete_character,
    build_single_model_scene,
    build_lineup_scene,
    export_scene,
    clear_scene,
)
from .anatomy_mesh import build_human_body_mesh, build_eyeballs
from .materials import create_skin_material, create_eye_iris_material, create_hair_material
from .studio import setup_studio_lighting, setup_cameras, configure_render_engine

__all__ = [
    "BODY_ARCHETYPES",
    "SKIN_PRESETS",
    "EYE_PRESETS",
    "HAIR_PRESETS",
    "CLOTHING_PRESETS",
    "build_complete_character",
    "build_single_model_scene",
    "build_lineup_scene",
    "export_scene",
    "clear_scene",
    "build_human_body_mesh",
    "build_eyeballs",
    "create_skin_material",
    "create_eye_iris_material",
    "create_hair_material",
    "setup_studio_lighting",
    "setup_cameras",
    "configure_render_engine",
]
