"""blender -b -P bench/convert_fbx.py -- in.fbx out.glb : FBX (with animations) -> GLB, and print clips."""
import sys
import bpy

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)
print("CLIPS", [a.name for a in bpy.data.actions])
print("MESHES", [(o.name, len(o.data.vertices)) for o in bpy.data.objects if o.type == "MESH"])
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=True,
                          export_nla_strips=False, export_animation_mode="ACTIONS", export_skins=True)
print("WROTE", dst)
