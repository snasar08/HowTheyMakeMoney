"""Blender Cycles speed/quality test (CPU, GitHub runner): the CC0 character in a simple night
stadium at 1080x1920. Usage: blender -b -P bench/blender_bench.py -- <glb> <outdir> <samples>"""
import math
import sys
import time

import bpy

glb, out, samples = sys.argv[sys.argv.index("--") + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = int(samples)
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
sc.render.fps = 30


def mat(name, rgb, rough=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def box(loc, size, m):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.scale = [s / 2 for s in size]
    o.data.materials.append(m)
    return o


bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.data.materials.append(mat("grass", (0.05, 0.3, 0.06), 0.9))
for z in (-30, 30):
    box((0, z, 1.2), (0.15, 0.15, 2.4), mat("post", (0.9, 0.9, 0.9), 0.3))
seat = mat("seat", (0.12, 0.12, 0.16))
for side in (-1, 1):
    for k in range(6):
        box((side * (14 + k * 1.3), 0, k * 0.8 + 0.4), (1.3, 80, 0.8), seat)
for x in (-24, 24):
    box((x, -20, 10), (0.5, 0.5, 20), mat("pole", (0.4, 0.4, 0.45)))
    box((x, -20, 20.5), (3, 0.3, 1.4), mat("lamp", (1, 0.95, 0.85), emit=30))
w = bpy.data.worlds.new("w")
sc.world = w
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.015, 0.04, 1)
bpy.ops.object.light_add(type="SUN", rotation=(math.radians(50), 0, math.radians(30)))
bpy.context.object.data.energy = 3
bpy.ops.object.light_add(type="AREA", location=(3, 4, 5))
bpy.context.object.data.energy = 600
bpy.context.object.data.size = 4

bpy.ops.import_scene.gltf(filepath=glb)
arm = next((o for o in bpy.context.selected_objects if o.type == "ARMATURE"), None)
if arm and arm.animation_data is None:
    arm.animation_data_create()
acts = [a for a in bpy.data.actions if "run" in a.name.lower()] or list(bpy.data.actions)
if arm and acts:
    arm.animation_data.action = acts[0]
for o in bpy.context.selected_objects:
    o.rotation_euler[2] = math.radians(180) + o.rotation_euler[2]

bpy.ops.object.camera_add(location=(1.4, 3.6, 0.5))
cam = bpy.context.object
sc.camera = cam
bpy.ops.object.empty_add(location=(0, 0, 1.4))
tc = cam.constraints.new("TRACK_TO")
tc.target = bpy.context.object
cam.data.lens = 30

for f in (1, 8, 15):
    sc.frame_set(f)
    sc.render.filepath = f"{out}/frame{f:02d}.png"
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"BENCH frame {f} samples {samples}: {time.time() - t0:.1f}s")
