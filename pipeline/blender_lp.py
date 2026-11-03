"""Blender Cycles replay of recorded low-poly frames (runs INSIDE Blender, not the pipeline venv).

  blender -b -P pipeline/blender_lp.py -- <plan.json> <out_dir> <shard> <shards> [samples]

lowpoly.render(..., rec=key) records each frame: camera, every box/cylinder/sphere with its matrix
and color, and the crowds (per skin: groups of instances sharing a clip + phase). This rebuilds
the same scene in Cycles (soft sun shadows, bounce light, fog from the mist pass, glow on lights)
and writes <out_dir>/<key>.jpg at 1080x1920. Shard i of n renders keys[i::n]. Coordinates are kept
in the pipeline's Y-up space under one root empty turned +90° about X (Blender is Z-up).
"""
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT_DIR = Path(__file__).resolve().parent.parent
CHAR = ROOT_DIR / "assets" / "characters" / "quaternius-animated-human.glb"
SKINS = ROOT_DIR / "assets" / "characters" / "skins"
FPS = 30
PH_DIR = ROOT_DIR / "assets" / "polyhaven"   # filled by `python -m pipeline.polyhaven` (CC0 skies + floors)
sys.path.insert(0, str(ROOT_DIR))
from pipeline.polyhaven import LOOKS  # noqa: E402  (stdlib-only module)
SHIRTS = {(115, 167, 196), (100, 215, 105)}   # palette colors, as in pipeline.character
SHORTS = {(21, 96, 189), (200, 148, 89)}


def kit_colors(name):
    base, _, kit = name.partition("@")
    if not kit:
        return base, None, None
    a, _, b = kit.partition("-")
    rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) if len(h) == 6 else None
    return base, rgb(a), rgb(b)

args = sys.argv[sys.argv.index("--") + 1:]
plan_path, out_dir, shard, shards = args[0], Path(args[1]), int(args[2]), int(args[3])
samples = int(args[4]) if len(args) > 4 else 16
plan = json.loads(Path(plan_path).read_text())
keys = sorted(plan["frames"])[shard::shards]
out_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 4
sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
sc.render.fps = FPS
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 93
try:
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
except TypeError:
    pass
root = bpy.data.objects.new("root", None)
sc.collection.objects.link(root)
root.rotation_euler = (math.radians(90), 0, 0)


def lin(c):
    return tuple(max(0.0, float(x)) ** 2.2 for x in c[:3])


_mats = {}


def mat(color, emit=False):
    k = (tuple(round(x, 3) for x in color), emit)
    if k not in _mats:
        m = bpy.data.materials.new("m")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*lin(color), 1)
        b.inputs["Roughness"].default_value = 0.55
        bev = m.node_tree.nodes.new("ShaderNodeBevel")  # rounded edges that catch the light (Cycles only)
        bev.inputs["Radius"].default_value = 0.035
        m.node_tree.links.new(bev.outputs["Normal"], b.inputs["Normal"])
        if emit:
            b.inputs["Emission Color"].default_value = (*lin(color), 1)
            b.inputs["Emission Strength"].default_value = 2.5
        _mats[k] = m
    return _mats[k]


def floor_mat(tex, tint):
    """Tiled Poly Haven floor (color x scene tint, normal, roughness), 4 m per tile in world space."""
    k = ("floor", tex, tuple(round(x, 3) for x in tint))
    if k in _mats:
        return _mats[k]
    if not (PH_DIR / f"{tex}_diff.jpg").exists():
        return mat(tint)
    m = bpy.data.materials.new(f"floor-{tex}")
    m.use_nodes = True
    nt, L = m.node_tree, m.node_tree.links
    b = nt.nodes["Principled BSDF"]
    geo, mp = nt.nodes.new("ShaderNodeNewGeometry"), nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.25, 0.25, 0.25)
    L.new(geo.outputs["Position"], mp.inputs["Vector"])

    def img(suffix, color=True):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(str(PH_DIR / f"{tex}_{suffix}.jpg"))
        if not color:
            t.image.colorspace_settings.name = "Non-Color"
        L.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t
    tint_n = nt.nodes.new("ShaderNodeMixRGB")
    tint_n.blend_type, tint_n.inputs[0].default_value = "MULTIPLY", 0.6
    L.new(img("diff").outputs["Color"], tint_n.inputs[1])
    tint_n.inputs[2].default_value = (*[min(1.0, 1.6 * c) for c in lin(tint)], 1)
    L.new(tint_n.outputs[0], b.inputs["Base Color"])
    if (PH_DIR / f"{tex}_rough.jpg").exists():
        L.new(img("rough", False).outputs["Color"], b.inputs["Roughness"])
    if (PH_DIR / f"{tex}_nor.jpg").exists():
        nm = nt.nodes.new("ShaderNodeNormalMap")
        L.new(img("nor", False).outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], b.inputs["Normal"])
    _mats[k] = m
    return m


_hdr = {}


def hdri(name):
    if name not in _hdr:
        f = PH_DIR / f"{name}.hdr"
        _hdr[name] = bpy.data.images.load(str(f)) if f.exists() else None
    return _hdr[name]


def skin_mat(name):
    k = ("skin", name)
    if k not in _mats:
        m = bpy.data.materials.new(f"skin-{name}")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = 0.7
        tex = nt.nodes.new("ShaderNodeTexImage")
        base, shirt, shorts = kit_colors(name)
        tex.image = bpy.data.images.load(str(SKINS / f"{base}.png"))
        if shirt or shorts:  # same recolor as pipeline.character.skin_image
            img = tex.image.copy()
            px = list(img.pixels)
            for i in range(0, len(px), 4):
                c = tuple(round(v * 255) for v in px[i:i + 3])
                new = shirt if (shirt and c in SHIRTS) else shorts if (shorts and c in SHORTS) else None
                if new:
                    px[i:i + 3] = [v / 255 for v in new]
            img.pixels = px
            tex.image = img
        tex.interpolation = "Closest"  # palette texture: keep flat color blocks
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        _mats[k] = m
    return _mats[k]


# ---------------------------------------------------------------- primitives (same as gl3d)
def _mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    return me


def box():
    v = [(x, y, z) for x in (-0.5, 0.5) for y in (0, 1) for z in (-0.5, 0.5)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return _mesh("box", v, f)


def cyl(seg=32):
    v = [(math.cos(2 * math.pi * i / seg), y, math.sin(2 * math.pi * i / seg)) for y in (0, 1) for i in range(seg)]
    f = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
    f += [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))]
    me = _mesh("cyl", v, f)
    for p in me.polygons[:seg]:
        p.use_smooth = True
    return me


def sphere():
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    o = bpy.context.object
    me = o.data
    bpy.data.objects.remove(o)
    for p in me.polygons:
        p.use_smooth = True
    return me


MESHES = {"box": box(), "cyl": cyl(), "sphere": sphere()}
_slot = bpy.data.materials.new("slot")
for _me in MESHES.values():
    _me.materials.append(_slot)  # one slot, overridden per object (link='OBJECT')


def obj(name, data, m_lp, parent=root):
    o = bpy.data.objects.new(name, data)
    sc.collection.objects.link(o)
    o.parent = parent
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_basis = m_lp
    return o


def paint(o, m):
    o.material_slots[0].link = "OBJECT"
    o.material_slots[0].material = m


def mat4(flat):
    return Matrix([flat[0:4], flat[4:8], flat[8:12], flat[12:16]])


# ---------------------------------------------------------------- the character, posed by baking
bpy.ops.import_scene.gltf(filepath=str(CHAR))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
for o in (arm, body):
    o.hide_render = True
to_lp = Matrix.Rotation(math.radians(-90), 4, "X")  # Blender Z-up -> pipeline Y-up
acts = {a.name.lower(): a for a in bpy.data.actions}


def action(clip):
    clip = (clip or "idle").lower()
    return acts.get(clip) or next((a for n, a in acts.items() if n.endswith(clip) or clip in n), None)


def bake(clip, t):
    """Deformed body mesh at clip time t, in pipeline coordinates, normalized to feet at y=0."""
    a = action(clip)
    if a is not None:
        f0, f1 = a.frame_range
        arm.pose.apply_pose_from_action(a, evaluation_time=f0 + (t * FPS) % max(f1 - f0, 1))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    me.transform(to_lp @ body.matrix_world)
    return me


rest = bake(None, 0.0)
ys = [v.co.y for v in rest.vertices]
B_BASE, B_HEIGHT = min(ys), (max(ys) - min(ys)) or 1.0
bpy.data.meshes.remove(rest)


def ry(a):
    return Matrix.Rotation(a, 4, "Y")


# ---------------------------------------------------------------- world, light, camera, fog
look0 = next(iter(plan["frames"].values()))["look"]
world = bpy.data.worlds.new("w")
sc.world = world
world.use_nodes = True
wn = world.node_tree.nodes
bg_cam, bg_amb = wn["Background"], wn.new("ShaderNodeBackground")
lp_node, mix = wn.new("ShaderNodeLightPath"), wn.new("ShaderNodeMixShader")
wl = world.node_tree.links
wl.new(bg_amb.outputs[0], mix.inputs[1])
wl.new(bg_cam.outputs[0], mix.inputs[2])
wl.new(lp_node.outputs["Is Camera Ray"], mix.inputs[0])
wl.new(mix.outputs[0], wn["World Output"].inputs[0])
bg_amb.inputs["Strength"].default_value = 0.55
env = wn.new("ShaderNodeTexEnvironment")
sky_mix = wn.new("ShaderNodeMixRGB")    # camera background: fog color (0) or the real sky (1)
wl.new(env.outputs["Color"], sky_mix.inputs[2])
wl.new(sky_mix.outputs[0], bg_cam.inputs["Color"])
amb_mix = wn.new("ShaderNodeMixRGB")    # lighting: flat sky/ground color (0) or the HDRI (1)
wl.new(env.outputs["Color"], amb_mix.inputs[2])
wl.new(amb_mix.outputs[0], bg_amb.inputs["Color"])

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 3.2
sun.data.angle = math.radians(4)
floor = obj("floor", MESHES["box"].copy(), Matrix.Diagonal((800, 0.01, 800, 1)) @ Matrix.Translation((0, -1, 0)))

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.parent = root
sc.camera = cam
cam.data.sensor_fit = "VERTICAL"
cam.data.clip_start, cam.data.clip_end = 0.1, 600
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "AREA"))
sc.collection.objects.link(fill)
fill.parent = cam
fill.location = (1.2, 0.8, 0.5)   # camera space: up-right of the lens, facing the subject
fill.data.energy, fill.data.size = 120, 3

sc.view_layers[0].use_pass_mist = True
sc.use_nodes = True
ct = sc.node_tree
for n in list(ct.nodes):
    ct.nodes.remove(n)
rl, fogmix = ct.nodes.new("CompositorNodeRLayers"), ct.nodes.new("CompositorNodeMixRGB")
glare, comp = ct.nodes.new("CompositorNodeGlare"), ct.nodes.new("CompositorNodeComposite")
glare.glare_type, glare.threshold, glare.size, glare.mix = "FOG_GLOW", 1.2, 7, -0.6
ct.links.new(rl.outputs["Image"], fogmix.inputs[1])
fog_amt = ct.nodes.new("CompositorNodeMath")
fog_amt.operation = "MULTIPLY"
ct.links.new(rl.outputs["Mist"], fog_amt.inputs[0])
ct.links.new(fog_amt.outputs[0], fogmix.inputs[0])
ct.links.new(fogmix.outputs[0], glare.inputs[0])
ct.links.new(glare.outputs[0], comp.inputs[0])


def set_look(L, set_name):
    fog = lin(L["fog"])
    h_name, tex, sky_visible = LOOKS.get(set_name, LOOKS["field"])
    img = hdri(h_name)
    env.image = img
    has = img is not None
    sky_mix.inputs[1].default_value = (*fog, 1)
    sky_mix.inputs[0].default_value = 1.0 if (has and sky_visible) else 0.0
    amb_mix.inputs[1].default_value = (*[0.5 * (a + b) for a, b in zip(lin(L["sky"]), lin(L["ground"]))], 1)
    amb_mix.inputs[0].default_value = 1.0 if has else 0.0
    bg_amb.inputs["Strength"].default_value = 0.9 if has else 0.55
    fogmix.inputs[2].default_value = (*fog, 1)
    fog_amt.inputs[1].default_value = 0.0 if (has and sky_visible) else 1.0  # real sky: no flat fog wall
    sc.world.mist_settings.start = L.get("fog_near", 35)
    sc.world.mist_settings.depth = L.get("fog_far", 110) - L.get("fog_near", 35)
    sc.world.mist_settings.falloff = "QUADRATIC"
    paint(floor, floor_mat(tex, L["floor"]))
    d = Vector(L["key_dir"]).normalized()  # light travels along key_dir (pipeline coords)
    sun.matrix_world = (root.matrix_world.to_3x3() @ d).to_track_quat("-Z", "Y").to_matrix().to_4x4()


def set_camera(f):
    eye, tgt = Vector(f["eye"]), Vector(f["target"])
    z = (eye - tgt).normalized()
    x = Vector((0, 1, 0)).cross(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = eye
    cam.matrix_basis = m
    cam.data.angle = math.radians(f["fov"])


# ---------------------------------------------------------------- per frame
item_objs = {}
frame_objs = []

for n, key in enumerate(keys):
    t0 = time.time()
    f = plan["frames"][key]
    set_look(f["look"], f.get("set", "field"))
    set_camera(f)
    want = set(f["items"])
    for i in want - item_objs.keys():
        name, flat, color, emit = plan["items"][i]
        o = obj(f"i{i}", MESHES[name], mat4(flat))
        paint(o, mat(color, emit))
        if emit:
            o.visible_shadow = False
        item_objs[i] = o
    for i, o in item_objs.items():
        o.hide_render = i not in want
    for o in frame_objs:  # last frame's people
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    frame_objs = []
    k = 1.75 / f["height"]
    for cid, cm in f["crowds"]:
        gm = mat4(cm)
        c = plan["crowds"][cid]
        sm = skin_mat(c["skin"] or "LightSkin")
        for clip, ph, rows in c["groups"]:
            me = bake(clip, f["t"] + ph)
            me.materials.clear()
            me.materials.append(sm)
            for r in rows:
                s = r[7] / k                                   # the instance's own size factor
                feet = r[1] + f["base_y"] * r[7]               # rows store y already lowered by base_y
                m = (gm @ Matrix.Translation((r[0], feet, r[2])) @ ry(r[3])
                     @ Matrix.Scale(1.75 / B_HEIGHT * s, 4) @ Matrix.Translation((0, -B_BASE, 0)))
                frame_objs.append(obj("p", me, m))
    sc.render.filepath = str(out_dir / f"{key}.jpg")
    bpy.ops.render.render(write_still=True)
    print(f"[blender] {n + 1}/{len(keys)} {key} {time.time() - t0:.1f}s", flush=True)
