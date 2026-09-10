"""
Photorealistic PBR Materials for Blender 4.0+.
Implements multi-layered Subsurface Scattering (SSS) skin shader,
anatomical cornea/iris eye shader with depth, anisotropic hair shader,
micro-woven clothing fabrics, and studio cyclorama backdrop.
"""

import bpy
from .config import SKIN_PRESETS, EYE_PRESETS, HAIR_PRESETS, CLOTHING_PRESETS


def get_skin_preset(preset_key_or_dict):
    if isinstance(preset_key_or_dict, dict):
        return preset_key_or_dict
    return SKIN_PRESETS.get(preset_key_or_dict, SKIN_PRESETS["fair_warm"])


def get_eye_preset(preset_key_or_dict):
    if isinstance(preset_key_or_dict, dict):
        return preset_key_or_dict
    return EYE_PRESETS.get(preset_key_or_dict, EYE_PRESETS["azure_blue"])


def get_hair_preset(preset_key_or_dict):
    if isinstance(preset_key_or_dict, dict):
        return preset_key_or_dict
    return HAIR_PRESETS.get(preset_key_or_dict, HAIR_PRESETS["dark_brown"])


def get_clothing_preset(preset_key_or_dict):
    if isinstance(preset_key_or_dict, dict):
        return preset_key_or_dict
    return CLOTHING_PRESETS.get(preset_key_or_dict, CLOTHING_PRESETS["athletic_navy"])


def _set_input(node, socket_name, value):
    inp = node.inputs.get(socket_name)
    if inp is not None:
        try:
            inp.default_value = value
        except Exception:
            pass


def create_skin_material(name="Realistic_Skin", preset="fair_warm"):
    """
    Creates a multi-layer realistic skin material using Blender 4.0 Principled BSDF v2.
    Features:
    - Random Walk subsurface scattering (epidermal & subdermal light diffusion)
    - Procedural multi-scale micro-pore and epidermal bump texture
    - Subtle melanin/hemoglobin color variation
    - Sebum clearcoat layer for natural specular skin highlights
    """
    p = get_skin_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_sss_translucency = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    # Output node
    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (800, 0)

    # Principled BSDF v2
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 0)

    # Configure Principled BSDF parameters for realistic human skin
    _set_input(bsdf, "Base Color", p["base_color"])
    _set_input(bsdf, "Roughness", p["roughness"])
    _set_input(bsdf, "Subsurface Weight", p["subsurface_weight"])
    _set_input(bsdf, "Subsurface Radius", p["subsurface_radius"])
    _set_input(bsdf, "Subsurface Scale", p["subsurface_scale"])
    _set_input(bsdf, "Subsurface Anisotropy", 0.75)
    _set_input(bsdf, "IOR", 1.40)
    _set_input(bsdf, "Specular IOR Level", p["specular_ior"])
    _set_input(bsdf, "Coat Weight", p.get("coat_weight", 0.22))
    _set_input(bsdf, "Coat Roughness", p.get("coat_roughness", 0.26))
    _set_input(bsdf, "Coat IOR", 1.45)

    # Procedural Coordinates & Micro-pores
    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-900, 0)

    # Multi-frequency noise for realistic micro-pores
    pore_noise = nodes.new(type="ShaderNodeTexNoise")
    pore_noise.location = (-600, -100)
    pore_noise.inputs["Scale"].default_value = 450.0
    pore_noise.inputs["Detail"].default_value = 4.0
    pore_noise.inputs["Roughness"].default_value = 0.65
    links.new(tex_coord.outputs["Object"], pore_noise.inputs["Vector"])

    # Bump node for skin micro-pores
    bump = nodes.new(type="ShaderNodeBump")
    bump.location = (100, -100)
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.001
    links.new(pore_noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # Color variation (living vascular warmth and melanin nuance)
    color_noise = nodes.new(type="ShaderNodeTexNoise")
    color_noise.location = (-600, 250)
    color_noise.inputs["Scale"].default_value = 16.0
    color_noise.inputs["Detail"].default_value = 3.0
    links.new(tex_coord.outputs["Object"], color_noise.inputs["Vector"])

    ramp_skin = nodes.new(type="ShaderNodeValToRGB")
    ramp_skin.location = (-350, 250)
    bc = p["base_color"]
    ramp_skin.color_ramp.elements[0].position = 0.30
    ramp_skin.color_ramp.elements[0].color = (bc[0] * 0.96, bc[1] * 0.95, bc[2] * 0.93, 1.0)
    ramp_skin.color_ramp.elements[1].position = 0.70
    ramp_skin.color_ramp.elements[1].color = (min(1.0, bc[0] * 1.04), bc[1] * 0.98, bc[2] * 0.96, 1.0)
    links.new(color_noise.outputs["Fac"], ramp_skin.inputs["Fac"])

    # Living skin color zoning attribute (lips vermilion, cheek blush, stubble)
    attr_node = nodes.new(type="ShaderNodeAttribute")
    attr_node.location = (-350, 450)
    attr_node.attribute_name = "Color"
    attr_node.attribute_type = 'GEOMETRY'

    # Mix subtle procedural micro-noise with vertex color attribute
    mix_color = nodes.new(type="ShaderNodeMix")
    mix_color.location = (-50, 250)
    mix_color.data_type = 'RGBA'
    mix_color.blend_type = 'OVERLAY'
    mix_color.inputs[0].default_value = 0.20  # 20% subtle overlay of noise

    links.new(attr_node.outputs["Color"], mix_color.inputs[6])   # A_Color: Vertex Colors
    links.new(ramp_skin.outputs["Color"], mix_color.inputs[7])   # B_Color: Procedural Noise

    # Robust fallback for meshes without Color attribute (when Alpha is 0)
    mix_fallback = nodes.new(type="ShaderNodeMix")
    mix_fallback.location = (150, 150)
    mix_fallback.data_type = 'RGBA'
    mix_fallback.blend_type = 'MIX'
    links.new(attr_node.outputs["Alpha"], mix_fallback.inputs[0])    # 1 if attr present, 0 if missing
    links.new(ramp_skin.outputs["Color"], mix_fallback.inputs[6])    # Fallback to procedural
    links.new(mix_color.outputs[2], mix_fallback.inputs[7])          # Living skin mix
    links.new(mix_fallback.outputs[2], bsdf.inputs["Base Color"])

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_eye_cornea_material(name="Eye_Cornea"):
    """
    Transparent glossy outer eye cornea and moisture layer.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (400, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Transmission Weight"].default_value = 0.96
    bsdf.inputs["IOR"].default_value = 1.376  # Human cornea index of refraction
    bsdf.inputs["Roughness"].default_value = 0.015
    bsdf.inputs["Specular IOR Level"].default_value = 0.55

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_eye_iris_material(name="Eye_Iris", preset="azure_blue"):
    """
    Detailed anatomical iris and sclera shader:
    - Dark outer limbal ring
    - Fibrous radial iris stroma with collarette
    - Deep central black pupil
    - Off-white sclera with subtle micro-vessel capillaries
    """
    p = get_eye_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (800, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 0)
    bsdf.inputs["Roughness"].default_value = 0.08
    bsdf.inputs["Specular IOR Level"].default_value = 0.65

    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)

    # Gradient radial texture coordinates
    grad = nodes.new(type="ShaderNodeTexGradient")
    grad.location = (-600, 150)
    grad.gradient_type = 'RADIAL'
    links.new(tex_coord.outputs["Generated"], grad.inputs["Vector"])

    # Fiber noise for iris striations
    noise = nodes.new(type="ShaderNodeTexNoise")
    noise.location = (-600, -150)
    noise.inputs["Scale"].default_value = 65.0
    noise.inputs["Detail"].default_value = 8.0
    links.new(tex_coord.outputs["Generated"], noise.inputs["Vector"])

    # Radial distance for pupil, iris, and sclera rings
    # In object coordinates, Z is optical axis.
    dist_xy = nodes.new(type="ShaderNodeVectorMath")
    dist_xy.location = (-450, 350)
    dist_xy.operation = 'LENGTH'

    sep_xyz = nodes.new(type="ShaderNodeSeparateXYZ")
    sep_xyz.location = (-650, 350)
    links.new(tex_coord.outputs["Object"], sep_xyz.inputs[0])

    combine_xy = nodes.new(type="ShaderNodeCombineXYZ")
    combine_xy.location = (-550, 200)
    links.new(sep_xyz.outputs["X"], combine_xy.inputs["X"])
    links.new(sep_xyz.outputs["Y"], combine_xy.inputs["Y"])
    links.new(combine_xy.outputs["Vector"], dist_xy.inputs[0])

    # Color Ramp for concentric iris zones (relative 0.0 to 1.0 based on eyeball radius)
    # The eyeball sphere has radius 0.0125 in object coordinates.
    # We map length(x, y) / 0.0125 to 0..1
    map_range = nodes.new(type="ShaderNodeMapRange")
    map_range.location = (-350, 350)
    map_range.inputs["From Min"].default_value = 0.0
    map_range.inputs["From Max"].default_value = 0.0125
    map_range.inputs["To Min"].default_value = 0.0
    map_range.inputs["To Max"].default_value = 1.0
    links.new(dist_xy.outputs["Value"], map_range.inputs["Value"])

    ramp = nodes.new(type="ShaderNodeValToRGB")
    ramp.location = (-150, 200)
    ramp.color_ramp.color_mode = 'RGB'
    ramp.color_ramp.interpolation = 'LINEAR'

    # Anatomical proportions (eyeball radius R=12.5mm, cornea/iris radius r=6.0mm):
    # Pupil aperture: 0.0 to ~0.14 (~1.75mm radius / 3.5mm diameter)
    # Collarette zone: ~0.22 (~2.75mm radius)
    # Inner iris stroma: ~0.32 (~4.0mm radius)
    # Outer iris: ~0.42 (~5.25mm radius)
    # Limbal ring: ~0.47 (~5.88mm radius)
    # Sclera white: >= 0.51 (> 6.38mm radius)
    elements = ramp.color_ramp.elements
    elements[0].position = 0.08
    elements[0].color = (0.01, 0.01, 0.01, 1.0)  # Deep central pupil
    elements[1].position = 1.00
    elements[1].color = (0.95, 0.94, 0.93, 1.0)  # Sclera white outer

    # Insert intermediate stops in strict ascending order
    e_pupil = elements.new(0.14)
    e_pupil.color = (0.01, 0.01, 0.01, 1.0)  # Pupil edge

    e_collarette = elements.new(0.22)
    e_collarette.color = p["collarette"]  # Collarette ring

    e_iris_in = elements.new(0.32)
    e_iris_in.color = p["iris_inner"]  # Inner iris

    e_iris_out = elements.new(0.42)
    e_iris_out.color = p["iris_outer"]  # Outer iris

    e_limbal = elements.new(0.47)
    e_limbal.color = p["limbal_ring"]  # Limbal ring

    e_sclera = elements.new(0.51)
    e_sclera.color = (0.92, 0.90, 0.89, 1.0)  # Sclera base

    links.new(map_range.outputs["Result"], ramp.inputs["Fac"])

    # Subtle iris striations
    mix_striation = nodes.new(type="ShaderNodeMix")
    mix_striation.data_type = 'RGBA'
    mix_striation.location = (150, 200)
    mix_striation.inputs["Factor"].default_value = 0.08
    links.new(ramp.outputs["Color"], mix_striation.inputs[6])
    links.new(noise.outputs["Color"], mix_striation.inputs[7])
    links.new(mix_striation.outputs[2], bsdf.inputs["Base Color"])

    # Cornea clear coat layer (IOR 1.376 for human tear film and cornea)
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.015
    bsdf.inputs["Coat IOR"].default_value = 1.376

    mat.use_screen_refraction = True
    mat.use_sss_translucency = True

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_hair_material(name="Realistic_Hair", preset="dark_brown"):
    """
    Realistic hair material with directional sheen, roughness anisotropy, and rich melanin tone.
    """
    p = get_hair_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (600, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    bsdf.inputs["Base Color"].default_value = p["base_color"]
    bsdf.inputs["Roughness"].default_value = p["roughness"]
    bsdf.inputs["Anisotropic"].default_value = p["anisotropic"]
    bsdf.inputs["Anisotropic Rotation"].default_value = 0.25
    bsdf.inputs["Specular IOR Level"].default_value = 0.55
    bsdf.inputs["Coat Weight"].default_value = 0.25
    bsdf.inputs["Coat Roughness"].default_value = 0.18

    # Subtle strand noise
    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-600, 0)

    noise = nodes.new(type="ShaderNodeTexNoise")
    noise.location = (-350, 0)
    noise.inputs["Scale"].default_value = 85.0
    noise.inputs["Detail"].default_value = 5.0
    links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])

    mix = nodes.new(type="ShaderNodeMix")
    mix.data_type = 'RGBA'
    mix.location = (-50, 0)
    mix.inputs["Factor"].default_value = 0.15
    mix.inputs[6].default_value = p["base_color"]
    mix.inputs[7].default_value = p["tint"]
    links.new(noise.outputs["Fac"], mix.inputs["Factor"])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])

    # Tactile hair strand micro-groove bump
    bump = nodes.new(type="ShaderNodeBump")
    bump.location = (50, -100)
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.001
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_eyebrow_eyelash_material(name="Eyebrows", preset="dark_brown"):
    """
    Darker matte/semi-gloss material for eyebrows and eyelashes.
    """
    p = get_hair_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (400, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    # Slightly darker than main hair for natural brow definition
    col = p["base_color"]
    bsdf.inputs["Base Color"].default_value = (col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.40
    bsdf.inputs["Specular IOR Level"].default_value = 0.45

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_nail_material(name="Realistic_Nails", preset="fair_warm"):
    """
    Semi-translucent keratin nail material with subsurface scattering.
    """
    p = get_skin_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (400, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = (0.88, 0.75, 0.70, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Specular IOR Level"].default_value = 0.58
    bsdf.inputs["Subsurface Weight"].default_value = 0.40
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.5, 0.35)
    bsdf.inputs["Subsurface Scale"].default_value = 0.02
    bsdf.inputs["Coat Weight"].default_value = 0.35
    bsdf.inputs["Coat Roughness"].default_value = 0.12

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_clothing_material(name="Clothing_Fabric", preset="athletic_navy", is_accent=False):
    """
    Woven fabric material with procedural micro-weave texture and velvet sheen.
    """
    p = get_clothing_preset(preset)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (600, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    base_col = p["accent_color"] if is_accent else p["base_color"]
    bsdf.inputs["Base Color"].default_value = base_col
    bsdf.inputs["Roughness"].default_value = p["roughness"]
    bsdf.inputs["Sheen Weight"].default_value = p["sheen"]
    bsdf.inputs["Sheen Roughness"].default_value = 0.45

    # Fine fabric weave bump
    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-600, 0)

    weave_noise = nodes.new(type="ShaderNodeTexNoise")
    weave_noise.location = (-350, 0)
    weave_noise.inputs["Scale"].default_value = 160.0
    weave_noise.inputs["Detail"].default_value = 4.0
    links.new(tex_coord.outputs["Object"], weave_noise.inputs["Vector"])

    bump = nodes.new(type="ShaderNodeBump")
    bump.location = (-50, 0)
    bump.inputs["Strength"].default_value = 0.15
    bump.inputs["Distance"].default_value = 0.001
    links.new(weave_noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat


def create_cyclorama_material(name="Studio_Cyclorama"):
    """
    Neutral matte studio floor and curved backdrop.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (400, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs["Base Color"].default_value = (0.12, 0.13, 0.15, 1.0)  # Sophisticated dark studio grey
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Specular IOR Level"].default_value = 0.25

    links.new(bsdf.outputs["BSDF"], output_node.inputs["Surface"])
    return mat
