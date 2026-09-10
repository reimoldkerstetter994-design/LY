#!/usr/bin/env python3
"""
CLI and Automation Runner for Blender Realistic Human Generator.
Can run directly with Python or via `blender --background --python run_generator.py -- [args]`.
"""

import sys
import os
import argparse

# Ensure current workspace is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# Re-exec under blender if run directly with system python
try:
    import bpy
except ImportError:
    import shutil
    import subprocess
    blender_bin = shutil.which("blender")
    if not blender_bin:
        sys.exit("Error: 'blender' command not found in PATH.")
    # Pass all original arguments to blender background execution
    cmd = [blender_bin, "-b", "-P", os.path.abspath(__file__), "--"] + sys.argv[1:]
    sys.exit(subprocess.call(cmd))

from human_generator import (
    BODY_ARCHETYPES,
    build_single_model_scene,
    build_lineup_scene,
    export_scene,
)


def parse_args():
    # Detect blender argument separator '--'
    raw_args = sys.argv
    if "--" in raw_args:
        cli_args = raw_args[raw_args.index("--") + 1:]
    else:
        cli_args = raw_args[1:]

    parser = argparse.ArgumentParser(description="Blender Realistic Human Model Generator")
    parser.add_argument(
        "--mode",
        choices=["all", "single", "lineup"],
        default="all",
        help="Generation mode: 'all' (all 5 models + lineup), 'single' (one model), or 'lineup' (all 5 side-by-side).",
    )
    parser.add_argument(
        "--model",
        choices=list(BODY_ARCHETYPES.keys()),
        default="male_athletic",
        help="Model archetype to generate in single mode.",
    )
    parser.add_argument(
        "--engine",
        choices=["eevee", "cycles"],
        default="eevee",
        help="Render engine: 'eevee' (fast, smooth SSS & GTAO, default) or 'cycles' (CPU path tracing).",
    )
    parser.add_argument(
        "--render",
        action="store_true",
        default=True,
        help="Whether to render showcase image(s).",
    )
    parser.add_argument(
        "--no-render",
        dest="render",
        action="store_false",
        help="Disable rendering, only generate .blend and 3D exports.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=48,
        help="Cycles render sample count (default: 48).",
    )
    parser.add_argument(
        "--resolution",
        type=int,
        nargs=2,
        default=[1280, 720],
        help="Render resolution width height (default: 1280 720).",
    )
    parser.add_argument(
        "--views",
        nargs="+",
        default=["beauty_34", "portrait"],
        choices=["beauty_34", "front_full", "portrait", "side_profile"],
        help="Camera views to render for individual models (default: beauty_34, portrait).",
    )
    parser.add_argument(
        "--output-models",
        default=os.path.join(SCRIPT_DIR, "models"),
        help="Output directory for .blend, .glb, and .obj files.",
    )
    parser.add_argument(
        "--output-renders",
        default=os.path.join(SCRIPT_DIR, "renders"),
        help="Output directory for rendered showcase images.",
    )

    return parser.parse_args(cli_args)


def process_single_model(key, args):
    print(f"\n=======================================================")
    print(f"[*] Processing Model: {key} ({BODY_ARCHETYPES[key]['display_name']})")
    print(f"=======================================================")

    engine_name = "BLENDER_EEVEE" if args.engine == "eevee" else "CYCLES"
    char, cyc, lights, cams = build_single_model_scene(key, engine=engine_name, samples=args.samples)

    # Output paths
    blend_path = os.path.join(args.output_models, f"{key}.blend")
    glb_path = os.path.join(args.output_models, f"{key}.glb")
    obj_path = os.path.join(args.output_models, f"{key}.obj")

    print(f"[*] Saving .blend, exporting .glb and .obj -> {args.output_models}")
    export_scene(blend_path, glb_path, obj_path, export_objects=char["all_objects"])
    print(f"  [+] Saved {blend_path}")
    print(f"  [+] Exported {glb_path}")
    print(f"  [+] Exported {obj_path}")

    # Renders
    if args.render:
        scene = bpy.context.scene
        if engine_name == "CYCLES":
            scene.cycles.samples = args.samples
        else:
            scene.eevee.taa_render_samples = min(64, args.samples)
        scene.render.resolution_x = args.resolution[0]
        scene.render.resolution_y = args.resolution[1]

        for view_name in args.views:
            if view_name in cams:
                cam_obj = cams[view_name]
                scene.camera = cam_obj
                render_file = os.path.join(args.output_renders, f"{key}_{view_name}.png")
                scene.render.filepath = render_file
                print(f"[*] Rendering view '{view_name}' ({args.resolution[0]}x{args.resolution[1]}, engine: {args.engine}) -> {render_file} ...")
                bpy.ops.render.render(write_still=True)
                print(f"  [+] Render complete: {render_file}")


def process_lineup(args):
    print(f"\n=======================================================")
    print(f"[*] Processing Studio Exhibition Lineup (All 5 Archetypes)")
    print(f"=======================================================")

    engine_name = "BLENDER_EEVEE" if args.engine == "eevee" else "CYCLES"
    chars, cyc, lights, cam_lineup = build_lineup_scene(engine=engine_name, samples=args.samples)

    blend_path = os.path.join(args.output_models, "human_models_lineup.blend")
    glb_path = os.path.join(args.output_models, "human_models_lineup.glb")
    obj_path = os.path.join(args.output_models, "human_models_lineup.obj")

    all_lineup_objs = []
    for c in chars.values():
        all_lineup_objs.extend(c["all_objects"])

    print(f"[*] Saving lineup .blend, exporting .glb and .obj ...")
    export_scene(blend_path, glb_path, obj_path, export_objects=all_lineup_objs)
    print(f"  [+] Saved {blend_path}")
    print(f"  [+] Exported {glb_path}")
    print(f"  [+] Exported {obj_path}")

    if args.render:
        scene = bpy.context.scene
        scene.camera = cam_lineup
        if engine_name == "CYCLES":
            scene.cycles.samples = args.samples
        else:
            scene.eevee.taa_render_samples = min(64, args.samples)
        # Wider aspect ratio for 5-person lineup
        scene.render.resolution_x = 1920
        scene.render.resolution_y = 960
        render_file = os.path.join(args.output_renders, "human_models_lineup_showcase.png")
        scene.render.filepath = render_file
        print(f"[*] Rendering Panoramic Lineup (1920x960, engine: {args.engine}) -> {render_file} ...")
        bpy.ops.render.render(write_still=True)
        print(f"  [+] Render complete: {render_file}")


def main():
    args = parse_args()
    os.makedirs(args.output_models, exist_ok=True)
    os.makedirs(args.output_renders, exist_ok=True)

    print("==================================================================")
    print("      BLENDER REALISTIC HUMAN MODEL GENERATION PIPELINE           ")
    print("==================================================================")
    print(f"Blender Version : {bpy.app.version_string}")
    print(f"Mode            : {args.mode}")
    print(f"Render          : {args.render} (Samples: {args.samples}, Res: {args.resolution})")
    print(f"Output Models   : {args.output_models}")
    print(f"Output Renders  : {args.output_renders}")

    if args.mode == "single":
        process_single_model(args.model, args)
    elif args.mode == "lineup":
        process_lineup(args)
    elif args.mode == "all":
        # Process individual models
        for key in BODY_ARCHETYPES.keys():
            process_single_model(key, args)
        # Process grand exhibition lineup
        process_lineup(args)

    print("\n[V] All requested tasks completed successfully!")


if __name__ == "__main__":
    main()
