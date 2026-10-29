"""blender -b -P bench/convert_fbx.py -- in.fbx out.glb : FBX (all animation clips) -> GLB."""
import sys
import bpy

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=True)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.animation_data_create()
for act in list(bpy.data.actions):  # one NLA track per clip so every clip is exported
    name = act.name.split("|")[-1]
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    st.name = name
arm.animation_data.action = None
print("CLIPS", [t.name for t in arm.animation_data.nla_tracks])
print("MESHES", [(o.name, len(o.data.vertices)) for o in bpy.data.objects if o.type == "MESH"])
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=True,
                          export_animation_mode="NLA_TRACKS", export_skins=True)
print("WROTE", dst)
