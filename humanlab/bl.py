"""Thin Blender helpers: fast mesh upload, modifiers, object bookkeeping."""

from __future__ import annotations

import numpy as np

import bpy


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (
        bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.node_groups,
        bpy.data.hair_curves, bpy.data.curves, bpy.data.worlds, bpy.data.cameras,
        bpy.data.lights, bpy.data.objects,
    ):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def mesh_from_arrays(name, verts, quads, collection=None):
    """Upload a quad soup with foreach_set (orders of magnitude faster than from_pydata)."""
    verts = np.ascontiguousarray(verts, np.float32)
    quads = np.ascontiguousarray(quads, np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.reshape(-1))
    loops = quads.reshape(-1)
    me.loops.add(len(loops))
    me.loops.foreach_set("vertex_index", loops)
    me.polygons.add(len(quads))
    me.polygons.foreach_set("loop_start", np.arange(0, len(loops), 4, dtype=np.int32))
    try:
        me.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
    except Exception:
        pass  # 4.1+ derives loop_total from the offsets
    me.update(calc_edges=True)
    me.validate(verbose=False, clean_customdata=False)
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def shade_smooth(ob):
    me = ob.data
    me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), np.int8))
    me.update()


def add_smooth_modifier(ob, factor=0.5, repeat=3):
    m = ob.modifiers.new("relax", "SMOOTH")
    m.factor = factor
    m.iterations = repeat
    return m


def add_subsurf(ob, levels=1):
    m = ob.modifiers.new("subsurf", "SUBSURF")
    m.levels = 0
    m.render_levels = levels
    m.use_limit_surface = True
    return m


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def uv_sphere(name, center, radius, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=center
    )
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.shade_smooth()
    return ob


def object_mesh_stats(ob):
    me = ob.data
    return len(me.vertices), len(me.polygons)
