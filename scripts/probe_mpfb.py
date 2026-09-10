"""Quick probe: create one clothed adult human and print diagnostics."""
import importlib
import sys

import bpy


def dynamic_import(absolute_package_str, key):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mpfb_mod = importlib.import_module(amod)
            if not hasattr(mpfb_mod, key):
                raise AttributeError(f"Module {amod} does not have attribute {key}")
            return getattr(mpfb_mod, key)
    raise ValueError(f"No module found with name ending in {absolute_package_str}")


print("modules with mpfb:", [m for m in sys.modules if "mpfb" in m][:20])

HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
LocationService = dynamic_import("mpfb.services.locationservice", "LocationService")
TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")

print("user_home", LocationService.get_user_home())
print("user_data", LocationService.get_user_data())
print("skin", AssetService.find_asset_absolute_path("young_asian_female.mhmat", asset_subdir="skins"))
print("clothes", AssetService.find_asset_absolute_path("female_casualsuit01.mhclo", asset_subdir="clothes"))

macro = TargetService.get_default_macro_info_dict()
macro.update({
    "gender": 0.0,
    "age": 0.52,
    "muscle": 0.45,
    "weight": 0.48,
    "height": 0.48,
    "proportions": 0.55,
    "cupsize": 0.45,
    "firmness": 0.5,
})
macro["race"] = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}

basemesh = HumanService.create_human(macro_detail_dict=macro)
print("created", basemesh.name, "verts", len(basemesh.data.vertices))
print("dims", [round(x, 3) for x in basemesh.dimensions])

skin = AssetService.find_asset_absolute_path("young_asian_female.mhmat", asset_subdir="skins")
HumanService.set_character_skin(skin, basemesh, skin_type="ENHANCED_SSS")

for subdir, fname, atype in [
    ("eyes", "high-poly.mhclo", "Eyes"),
    ("eyebrows", "eyebrow001.mhclo", "Eyebrows"),
    ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
    ("tongue", "tongue01.mhclo", "Tongue"),
    ("teeth", "teeth_base.mhclo", "Teeth"),
    ("hair", "long01.mhclo", "Hair"),
    ("clothes", "female_casualsuit01.mhclo", "Clothes"),
    ("clothes", "shoes01.mhclo", "Clothes"),
]:
    path = AssetService.find_asset_absolute_path(fname, asset_subdir=subdir)
    print(atype, fname, "->", path)
    if path:
        HumanService.add_mhclo_asset(path, basemesh, asset_type=atype, material_type="MAKESKIN")

print("objects", [o.name for o in bpy.data.objects])
print("PROBE_OK")
