"""Blender Cycles CPU: one 1080x1920 frame of a 3-bar scene (run with blender -b -P)."""
import bpy, time
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 16
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
for i, h in enumerate((1.5, 2.5, 4.0)):
    bpy.ops.mesh.primitive_cube_add(location=(i * 2 - 2, 0, h / 2), scale=(0.6, 0.6, h / 2))
bpy.ops.mesh.primitive_plane_add(size=40)
bpy.ops.object.light_add(type="AREA", location=(3, -4, 8))
bpy.context.object.data.energy = 2000
bpy.ops.object.camera_add(location=(0, -14, 5), rotation=(1.3, 0, 0))
sc.camera = bpy.context.object
sc.render.filepath = "/tmp/blender_frame.png"
t0 = time.time()
bpy.ops.render.render(write_still=True)
print("BLENDER_SECONDS", round(time.time() - t0, 2))
