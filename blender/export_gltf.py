"""
Blender 后台批量导出 GLTF 脚本

用法:
  blender scene.blend --background --python export_gltf.py -- output/model.glb

或在 Blender 脚本编辑器中直接运行（修改 OUTPUT_PATH）
"""

import bpy
import sys
import os


def get_output_path() -> str:
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1 :]
        if args:
            return os.path.abspath(args[0])
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "models", "export.glb"))


def export_gltf(output_path: str) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB" if output_path.endswith(".glb") else "GLTF_SEPARATE",
        use_selection=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_colors=True,
        export_cameras=False,
        export_lights=False,
    )
    print(f"[DevWorld] Exported: {output_path}")


if __name__ == "__main__":
    export_gltf(get_output_path())
