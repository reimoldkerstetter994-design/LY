"""Build a fully dressed, posed MPFB human from a character specification dict.

The specification format is documented in ``characters.py``.
"""

import os

import bpy
from mathutils import Vector

from . import poses

_MPFB = "bl_ext.user_default.mpfb"


def _svc(name):
    module = __import__(f"{_MPFB}.services.{name.lower()}", fromlist=[name])
    return getattr(module, name)


# Iris colour presets: (IrisMajorColor, IrisMinorColor, IrisSection4Color)
EYE_PRESETS = {
    "brown": ((0.42, 0.22, 0.09), (0.18, 0.08, 0.03), (0.06, 0.03, 0.01)),
    "dark_brown": ((0.26, 0.13, 0.06), (0.10, 0.05, 0.02), (0.04, 0.02, 0.01)),
    "hazel": ((0.50, 0.36, 0.14), (0.24, 0.15, 0.05), (0.08, 0.05, 0.02)),
    "amber": ((0.70, 0.42, 0.10), (0.34, 0.17, 0.04), (0.10, 0.05, 0.01)),
    "green": ((0.32, 0.50, 0.22), (0.12, 0.22, 0.09), (0.04, 0.06, 0.03)),
    "blue": ((0.30, 0.52, 0.78), (0.12, 0.22, 0.45), (0.05, 0.06, 0.12)),
    "grey": ((0.50, 0.56, 0.62), (0.25, 0.28, 0.34), (0.08, 0.09, 0.11)),
}


def _rgba(rgb, alpha=1.0):
    return (rgb[0], rgb[1], rgb[2], alpha)


def _find_group_node(material):
    if not material or not material.node_tree:
        return None
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeGroup":
            return node
    return None


def _set_group_inputs(material, values):
    group = _find_group_node(material)
    if group is None:
        return
    for key, value in values.items():
        socket = group.inputs.get(key)
        if socket is None:
            print(f"[builder] material {material.name} has no input '{key}'")
            continue
        if socket.type == "RGBA" and len(value) == 3:
            value = _rgba(value)
        socket.default_value = value


def _children_of_type(basemesh, asset_type):
    """Body parts / clothes are parented to the rig when there is one, else to the basemesh."""
    ObjectService = _svc("ObjectService")
    root = basemesh.parent if basemesh.parent is not None else basemesh
    return [
        child
        for child in root.children_recursive
        if child is not basemesh and ObjectService.object_is(child, asset_type)
    ]


def build_human_info(spec):
    """Translate a character spec into an MPFB ``human_info`` dict."""
    HumanService = _svc("HumanService")
    info = HumanService._create_default_human_info_dict()
    info["name"] = spec["id"]
    info["phenotype"].update(spec.get("macro", {}))

    targets = [{"target": name, "value": float(value)} for name, value in spec.get("targets", {}).items()]
    # Expression face units live in targets/expression/units/<race>/ and are plain
    # targets, so they can be loaded together with the modelling targets.
    for name, value in spec.get("expression", {}).items():
        targets.append({"target": name, "value": float(value)})
    info["targets"] = targets

    info["rig"] = spec.get("rig", "default")
    info["skin_mhmat"] = spec.get("skin", "")
    info["skin_material_type"] = "ENHANCED_SSS" if info["skin_mhmat"] else "NONE"
    info["eyes"] = spec.get("eyes_mesh", "high-poly.mhclo")
    info["eyes_material_type"] = "PROCEDURAL_EYES"
    info["eyebrows"] = spec.get("eyebrows", "eyebrow001.mhclo")
    info["eyelashes"] = spec.get("eyelashes", "eyelashes01.mhclo")
    info["teeth"] = spec.get("teeth", "teeth_base.mhclo")
    info["tongue"] = spec.get("tongue", "tongue01.mhclo")
    info["hair"] = spec.get("hair", "")
    info["clothes"] = list(spec.get("clothes", []))
    return info


def _tune_skin(basemesh, spec):
    MaterialService = _svc("MaterialService")
    material = MaterialService.get_material(basemesh)
    if material is None:
        return
    age = spec.get("macro", {}).get("age", 0.5)
    # Older skin: rougher, more visible pores, a bit less subsurface glow.
    defaults = {
        "Roughness": 0.42 + 0.18 * age,
        "Pore strength": 0.18 + 0.30 * age,
        "Pore scale": 2200.0,
        "Pore detail": 3.0,
        "SSS strength": 0.32 - 0.08 * age,
        "SSS radius scale": 0.12,
        "Clearcoat": 0.06,
        "Clearcoat Roughness": 0.35,
        "colorMixInStrength": 0.03,
    }
    defaults.update(spec.get("skin_settings", {}))
    _set_group_inputs(material, defaults)


def _tune_eyes(basemesh, spec):
    MaterialService = _svc("MaterialService")
    preset_name = spec.get("eyes", "brown")
    if preset_name not in EYE_PRESETS:
        raise KeyError(f"Unknown eye preset '{preset_name}', choose one of {sorted(EYE_PRESETS)}")
    major, minor, rim = EYE_PRESETS[preset_name]
    for eye in _children_of_type(basemesh, "Eyes"):
        material = MaterialService.get_material(eye)
        _set_group_inputs(
            material,
            {
                "IrisMajorColor": major,
                "IrisMinorColor": minor,
                "IrisSection4Color": rim,
                "EyeWhiteColor": (0.92, 0.90, 0.90),
                "PupilSize": spec.get("pupil_size", 0.28),
                "IrisBumpStrength": 0.25,
            },
        )


def _tint_makeskin_material(obj, color=None, roughness=None, specular=None, alpha_boost=None):
    """Adjust a MakeSkin material (hair / eyebrows / eyelashes).

    ``color`` drives the diffuse mix node, ``alpha_boost`` multiplies the texture alpha
    (the stock eyebrow/eyelash textures are very sparse strands that all but vanish under
    hashed transparency), ``specular`` lowers the plastic-looking highlights on dark hair.
    """
    MaterialService = _svc("MaterialService")
    material = MaterialService.get_material(obj)
    if material is None or not material.node_tree:
        return
    tree = material.node_tree
    nodes = tree.nodes
    mix = nodes.get("diffuseIntensity")
    if mix is not None and color is not None:
        texture_is_color2 = mix.inputs["Color2"].is_linked
        tint_socket = mix.inputs["Color1"] if texture_is_color2 else mix.inputs["Color2"]
        tint_socket.default_value = _rgba(color)
        if max(color) > 0.45:
            # Light colours: blend toward the tint instead of multiplying (which can only darken).
            mix.blend_type = "MIX"
            texture_share = 0.35
            mix.inputs["Fac"].default_value = texture_share if texture_is_color2 else 1.0 - texture_share
        else:
            mix.blend_type = "MULTIPLY"
            mix.inputs["Fac"].default_value = 1.0
    principled = next((n for n in nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if principled is None:
        return
    if roughness is not None:
        principled.inputs["Roughness"].default_value = roughness
    if specular is not None:
        principled.inputs["Specular IOR Level"].default_value = specular
        principled.inputs["Coat Weight"].default_value = 0.0
    alpha_socket = principled.inputs["Alpha"]
    if alpha_boost and alpha_socket.is_linked:
        link = alpha_socket.links[0]
        source_node, source_socket = link.from_node, link.from_socket
        tree.links.remove(link)
        boost = nodes.new("ShaderNodeMath")
        boost.operation = "MULTIPLY"
        boost.use_clamp = True
        boost.inputs[1].default_value = alpha_boost
        tree.links.new(source_socket, boost.inputs[0])
        tree.links.new(boost.outputs[0], alpha_socket)


def _tune_hair(basemesh, spec):
    color = spec.get("hair_color")
    for hair in _children_of_type(basemesh, "Hair"):
        _tint_makeskin_material(hair, color, roughness=0.7, specular=0.2)
    brow_color = spec.get("eyebrow_color", color)
    for brows in _children_of_type(basemesh, "Eyebrows"):
        _tint_makeskin_material(brows, brow_color, roughness=0.9, specular=0.08, alpha_boost=1.8)
    for lashes in _children_of_type(basemesh, "Eyelashes"):
        _tint_makeskin_material(lashes, None, roughness=0.9, specular=0.08, alpha_boost=1.8)


def _set_render_subdivision(basemesh, levels):
    ObjectService = _svc("ObjectService")
    root = basemesh.parent if basemesh.parent is not None else basemesh
    for obj in [root] + list(root.children_recursive):
        if obj.type != "MESH":
            continue
        # Hair / brows / lashes are alpha-mapped cards: extra subdivision only blurs them.
        cards = ObjectService.object_is(obj, ("Hair", "Eyebrows", "Eyelashes"))
        for modifier in obj.modifiers:
            if modifier.type == "SUBSURF":
                modifier.levels = 0
                modifier.render_levels = 1 if cards else levels
        for poly in obj.data.polygons:
            poly.use_smooth = True


def character_objects(rig):
    return [rig] + [o for o in rig.children_recursive]


def evaluated_bounds(objects):
    """World-space bounding box (min, max) of the evaluated meshes (pose + modifiers)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        matrix = evaluated.matrix_world
        for vertex in evaluated.data.vertices:
            co = matrix @ vertex.co
            lo.x, lo.y, lo.z = min(lo.x, co.x), min(lo.y, co.y), min(lo.z, co.z)
            hi.x, hi.y, hi.z = max(hi.x, co.x), max(hi.y, co.y), max(hi.z, co.z)
    return lo, hi


def ground_character(rig):
    """Move the whole character so its lowest evaluated point touches z = 0."""
    bpy.context.view_layer.update()
    lo, _hi = evaluated_bounds(character_objects(rig))
    rig.location.z -= lo.z
    bpy.context.view_layer.update()


def seat_surface(basemesh, rig, radius=0.16):
    """Return ``(x, y, z)`` under the buttocks of a seated character (for placing a stool)."""
    root = rig.pose.bones.get("root") or rig.pose.bones.get("pelvis.L")
    if root is None:
        return None
    hips = rig.matrix_world @ root.head
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lowest = None
    # Body vertices under clothes are masked away, so look at every mesh of the character.
    for obj in character_objects(rig):
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        matrix = evaluated.matrix_world
        for vertex in evaluated.data.vertices:
            co = matrix @ vertex.co
            if (co.xy - hips.xy).length <= radius and co.z < hips.z and (lowest is None or co.z < lowest):
                lowest = co.z
    if lowest is None:
        return None
    return (hips.x, hips.y, lowest)


def head_world_location(rig):
    bone = rig.pose.bones.get("head")
    if bone is None:
        return None
    return rig.matrix_world @ ((bone.head + bone.tail) * 0.5)


def build_character(spec, subdiv_levels=2):
    """Create the character described by ``spec``. Returns ``(basemesh, rig)``."""
    HumanService = _svc("HumanService")
    ObjectService = _svc("ObjectService")

    info = build_human_info(spec)
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 1
    settings["load_clothes"] = True
    basemesh = HumanService.deserialize_from_dict(info, settings)
    rig = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, "Skeleton")
    if rig is None:
        raise RuntimeError("Character was created without an armature; a rig is required for posing")

    _tune_skin(basemesh, spec)
    _tune_eyes(basemesh, spec)
    _tune_hair(basemesh, spec)
    _set_render_subdivision(basemesh, subdiv_levels)

    poses.apply_pose(rig, spec.get("pose", "relaxed_stand"))
    ground_character(rig)

    rig.name = spec["id"]
    return basemesh, rig


def export_preset(basemesh, directory):
    """Save the character as an MPFB ``human.<id>.json`` preset (loadable from the MPFB UI)."""
    HumanService = _svc("HumanService")
    os.makedirs(directory, exist_ok=True)
    name = basemesh.name.replace(".body", "")
    path = os.path.join(directory, f"human.{name}.json")
    HumanService.serialize_to_json_file(basemesh, path, save_clothes=True)
    return path
