"""Blender-side scene assembly: materials, lighting, cameras and rendering.

Everything in this subpackage imports ``bpy`` and therefore only runs inside
Blender.  The geometry packages above it are deliberately free of that
dependency so the body can be built, measured and tested with plain Python.
"""
