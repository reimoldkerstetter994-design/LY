"""Build and render realistic human characters with Blender + MPFB.

Run inside Blender (background mode)::

    blender -b --python scripts/build_humans.py -- [options]

Options (after the ``--``)::

    --only ID[,ID...]     build only the listed characters (default: all)
    --list                print the available characters and exit
    --out DIR             output directory for renders (default: renders/)
    --presets DIR         directory for exported MPFB presets (default: characters/)
    --blend DIR           also save a .blend per character into DIR
    --samples N           Cycles samples (default: 128)
    --scale PCT           resolution percentage (default: 100; use 25-50 for quick previews)
    --subdiv N            render subdivision levels for body & clothes (default: 2)
    --no-portrait         skip the head-and-shoulders portrait render
    --no-full             skip the full body render
    --group               additionally render a group shot with all built characters
    --group-only          only render the group shot (implies --group --no-full --no-portrait)
    --threads N           limit CPU render threads
"""

import argparse
import os
import sys
import time

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from humanlib import builder, characters, scene as scenelib  # noqa: E402
from mathutils import Vector  # noqa: E402

REPO_ROOT = os.path.dirname(SCRIPT_DIR)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="build_humans.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--out", default=os.path.join(REPO_ROOT, "renders"))
    parser.add_argument("--presets", default=os.path.join(REPO_ROOT, "characters"))
    parser.add_argument("--blend", default="")
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--scale", type=int, default=100)
    parser.add_argument("--subdiv", type=int, default=2)
    parser.add_argument("--no-portrait", action="store_true")
    parser.add_argument("--no-full", action="store_true")
    parser.add_argument("--group", action="store_true")
    parser.add_argument("--group-only", action="store_true")
    parser.add_argument("--threads", type=int, default=0)
    args = parser.parse_args(argv)
    if args.group_only:
        args.group = True
        args.no_full = True
        args.no_portrait = True
    return args


def fresh_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def render_to(scene, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    started = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"[build_humans] rendered {path} in {time.time() - started:.1f}s")


def hide_environment_objects(scene, hide):
    for obj in scene.objects:
        if obj.name in {"Cyclorama", "Ground"}:
            obj.hide_render = hide


def add_props(scene, spec, basemesh, rig):
    if spec.get("seat") == "stool":
        seat = builder.seat_surface(basemesh, rig)
        if seat is None:
            print(f"[build_humans] could not find a seat surface for {spec['id']}")
        else:
            scenelib.add_stool(scene, seat)


def render_character(spec, args):
    scene = fresh_scene()
    started = time.time()
    basemesh, rig = builder.build_character(spec, subdiv_levels=args.subdiv)
    print(f"[build_humans] built {spec['id']} in {time.time() - started:.1f}s")

    if args.presets:
        path = builder.export_preset(basemesh, args.presets)
        print(f"[build_humans] preset saved to {path}")

    objects = builder.character_objects(rig)
    lo, hi = builder.evaluated_bounds(objects)
    center = (lo + hi) * 0.5
    height = hi.z - lo.z
    scenelib.setup_environment(scene, spec.get("environment", "studio"), (center.x, center.y, lo.z), height)
    add_props(scene, spec, basemesh, rig)

    cam = scenelib.add_camera(scene)
    out_dir = args.out

    if not args.no_full:
        seated = height < 1.3
        footprint = max(hi.x - lo.x, hi.y - lo.y)
        # Wide floor poses get a landscape frame instead of a tall one.
        landscape = footprint > height * 0.9
        resolution = (1620, 1080) if landscape else (1080, 1620)
        scenelib.configure_render(scene, samples=args.samples, resolution=resolution, scale=args.scale, threads=args.threads)
        full = spec.get("full", {})
        scenelib.frame_camera(
            scene, cam, lo, hi,
            lens=full.get("lens", 60.0 if seated else 70.0),
            azimuth=full.get("azimuth", 12.0),
            elevation=full.get("elevation", 8.0 if seated else 1.0),
            margin=1.14,
            dof=5.6,
        )
        render_to(scene, os.path.join(out_dir, f"{spec['id']}_full.jpg"))

    if not args.no_portrait:
        scenelib.configure_render(scene, samples=args.samples, resolution=(1080, 1350), scale=args.scale, threads=args.threads)
        head = builder.head_world_location(rig) or Vector((center.x, center.y, hi.z - 0.12))
        head_size = 0.22 * (height / 1.75 if height >= 1.3 else 1.0)
        # Frame the head plus a bit of shoulders.
        plo = Vector((head.x - head_size, head.y - head_size, head.z - head_size * 1.55))
        phi = Vector((head.x + head_size, head.y + head_size, head.z + head_size * 0.95))
        portrait = spec.get("portrait", {})
        scenelib.frame_camera(
            scene, cam, plo, phi,
            lens=105.0,
            azimuth=portrait.get("azimuth", 18.0),
            elevation=portrait.get("elevation", 3.0),
            margin=1.05,
            dof=2.8,
        )
        render_to(scene, os.path.join(out_dir, f"{spec['id']}_portrait.jpg"))

    if args.blend:
        os.makedirs(args.blend, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.blend, f"{spec['id']}.blend"))

    return rig


def render_group(specs, args):
    scene = fresh_scene()
    rigs = []
    spacing = 0.82
    for index, spec in enumerate(specs):
        started = time.time()
        basemesh, rig = builder.build_character(spec, subdiv_levels=max(1, args.subdiv - 1))
        # Line the characters up on a gentle arc facing the camera.
        offset = (index - (len(specs) - 1) / 2.0) * spacing
        rig.location.x += offset
        rig.location.y += 0.035 * offset * offset
        rig.rotation_euler.z = -0.05 * offset
        bpy.context.view_layer.update()
        add_props(scene, spec, basemesh, rig)
        rigs.append(rig)
        print(f"[build_humans] built {spec['id']} for group in {time.time() - started:.1f}s")

    objects = [o for rig in rigs for o in builder.character_objects(rig)]
    bpy.context.view_layer.update()
    lo, hi = builder.evaluated_bounds(objects)
    center = (lo + hi) * 0.5
    scenelib.setup_studio(scene, (center.x, center.y, lo.z), hi.z - lo.z, "neutral")
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.data.energy *= 3.2
            obj.location.x *= 2.2
            obj.data.size *= 2.2
    cam = scenelib.add_camera(scene)
    scenelib.configure_render(scene, samples=args.samples, resolution=(2400, 1000), scale=args.scale, threads=args.threads)
    distance = scenelib.frame_camera(scene, cam, lo, hi, lens=50.0, azimuth=0.0, elevation=4.0, margin=1.04)
    cyc = scene.objects.get("Cyclorama")
    if cyc:
        # Stretch the studio so neither the floor's front edge nor its sides enter the wide shot.
        cyc.scale = (max(2.0, distance / 3.0), max(1.6, (distance + 3.0) / 6.0), 1.6)
    render_to(scene, os.path.join(args.out, "group.jpg"))
    if args.blend:
        os.makedirs(args.blend, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.blend, "group.blend"))


def main():
    args = parse_args()
    specs = characters.CHARACTERS
    if args.list:
        for spec in specs:
            print(f"{spec['id']:14s} {spec['name']:8s} {spec['description']}")
        return
    if args.only:
        wanted = [s.strip() for s in args.only.split(",") if s.strip()]
        specs = [characters.by_id(w) for w in wanted]

    total = time.time()
    if not (args.no_full and args.no_portrait):
        for spec in specs:
            render_character(spec, args)
    if args.group:
        render_group(specs, args)
    print(f"[build_humans] all done in {(time.time() - total) / 60:.1f} min")


if __name__ == "__main__":
    main()
