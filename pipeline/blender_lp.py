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
import os
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
from pipeline import lp_hero  # noqa: E402  (stdlib-only: hero looks)
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
pp = Path(plan_path)
PLANS = [json.loads(f.read_text()) | {"_slug": f.stem} for f in (sorted(pp.glob("*.json")) if pp.is_dir() else [pp])]
JOBS = [(pl, k) for pl in PLANS for k in sorted(pl["frames"])][shard::shards]
plan = PLANS[0]
out_dir.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 4
# same 540x960 the GL renderer uses (render.py upscales + sharpens): ~4x faster per frame
sc.render.resolution_x, sc.render.resolution_y = (int(x) for x in os.environ.get("BL_RES", "540x960").split("x"))
sc.render.fps = FPS
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 93
try:
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.1
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
            # white lamps bloom; colored screens and signs stay saturated instead of washing out to pastel
            b.inputs["Emission Strength"].default_value = 0.9 + 1.7 * max(0.0, min(color[:3]) - 0.4) / 0.6
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
    tint_n.blend_type, tint_n.inputs[0].default_value = "MULTIPLY", 0.35
    L.new(img("diff").outputs["Color"], tint_n.inputs[2])
    tint_n.inputs[1].default_value = (*[min(1.0, 1.15 * c) for c in lin(tint)], 1)
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
        base, cmap = lp_hero.recolor_map(name)
        shirt = shorts = None
        if not cmap:
            base, shirt, shorts = kit_colors(name)
        tex.image = bpy.data.images.load(str(SKINS / f"{base}.png"))
        if cmap or shirt or shorts:  # same recolor as pipeline.character.skin_image
            src = tex.image
            img = bpy.data.images.new(name, src.size[0], src.size[1])
            px = list(src.pixels)
            for i in range(0, len(px), 4):
                c = tuple(round(v * 255) for v in px[i:i + 3])
                if cmap:
                    new = cmap.get(c)
                else:
                    new = shirt if (shirt and c in SHIRTS) else shorts if (shorts and c in SHORTS) else None
                if new:
                    px[i:i + 3] = [v / 255 for v in new]
            img.pixels = px
            img.pack()
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


def rbox():
    """A box with rounded edges and corners, same footprint as box()."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    m = o.modifiers.new("bev", "BEVEL")
    m.width, m.segments = 0.16, 4
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o)
    me.transform(Matrix.Translation((0, 0.5, 0)))
    for p in me.polygons:
        p.use_smooth = True
    return me


MESHES = {"box": box(), "cyl": cyl(), "sphere": sphere(), "rbox": rbox()}
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


# ---------------------------------------------------------------- the people, posed by baking
# Modular CC0 pack (assets/characters/people, pipeline/people.py): each model is one armature with four
# part meshes (head, body, legs, feet) and 24 actions. A look (lp_hero.look_name) mixes parts of one
# family and recolors their named materials.
PEOPLE = ROOT_DIR / "assets" / "characters" / "people"
SLOT_OF = {"head": "head", "body": "body", "legs": "legs", "pants": "legs", "feet": "feet"}
to_lp = Matrix.Rotation(math.radians(-90), 4, "X")  # Blender Z-up -> pipeline Y-up
# BL_SMOOTH="<degrees>[s<levels>]": edges flatter than <degrees> are shaded smooth; s1/s2 also
# subdivides the people (rounded, toy-like forms instead of facets). "0" = the faceted look.
_sm = os.environ.get("BL_SMOOTH", "180s1").split("s")
SMOOTH, SUBSURF = float(_sm[0] or 0), int(_sm[1]) if len(_sm) > 1 else 0
MODELS = {}


def _clip_key(name):
    """'CharacterArmature|Idle_Neutral', 'Idle_Neutral_CharacterArmature.001' -> 'idle_neutral'."""
    return name.lower().split(".")[0].replace("characterarmature", "").replace("humanarmature", "").replace("|", "").strip("_")


def _pose(M, clip, t):
    a = M["acts"].get((clip or "idle_neutral").lower()) or M["acts"].get("idle_neutral")
    if a is not None:
        f0, f1 = a.frame_range
        ft = min(max(t, 0.0) * FPS, f1 - f0 - 1) if "death" in a.name.lower() else (t * FPS) % max(f1 - f0, 1)
        M["arm"].pose.apply_pose_from_action(a, evaluation_time=f0 + ft)   # a fall plays once and stays down
    M["posed"] = (clip, t)
    bpy.context.view_layer.update()


def bone_m(M, bone):
    """A bone's current matrix in pipeline coordinates, in meters."""
    pb = M["arm"].pose.bones.get(bone)
    return None if pb is None else Matrix.Scale(M["scale"], 4) @ to_lp @ M["arm"].matrix_world @ pb.matrix


def model(name):
    if name in MODELS:
        return MODELS[name]
    objs0, acts0 = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(PEOPLE / f"{name}.glb"))
    objs = [o for o in bpy.data.objects if o not in objs0]
    M = MODELS[name] = dict(arm=next(o for o in objs if o.type == "ARMATURE"), parts={}, scale=1.0, posed=None, ref={}, cut={},
                            acts={_clip_key(a.name): a for a in bpy.data.actions if a not in acts0})
    for o in objs:
        o.hide_render = True
        slot = SLOT_OF.get(o.name.split(".")[0].split("_")[-1].lower()) if o.type == "MESH" else None
        if not slot:
            continue
        M["parts"][slot] = o
        if SMOOTH or SUBSURF:
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)   # the file stores every face apart
            bm.to_mesh(o.data)
            bm.free()
            for at in ("custom_normal", "sharp_face", "sharp_edge"):
                if at in o.data.attributes:
                    o.data.attributes.remove(o.data.attributes[at])
            if SUBSURF:
                md = o.modifiers.new("sub", "SUBSURF")
                md.levels = md.render_levels = SUBSURF
                md.uv_smooth = "NONE"
    # size: the standing Head bone must sit where the GL renderer has it (lp_hero.HEAD_Y, meters)
    _pose(M, "idle_neutral", 0.0)
    y = bone_m(M, "Head").translation.y
    M["scale"] = lp_hero.HEAD_Y[name[0]] / y if y > 1e-6 else 1.0
    M["ref"] = {"Head": bone_m(M, "Head").inverted()}
    print(f"[blender] model {name}: parts {sorted(M['parts'])}, {len(M['acts'])} clips, scale {M['scale']:.4f}", flush=True)
    if os.environ.get("BL_DEBUG"):
        hb = bone_m(M, "Head").translation
        dbg = [f"idle head bone {tuple(round(v, 3) for v in hb)} y0 {y:.3f}"]
        if "head" in M["parts"]:
            hm = part_mesh(name, "head", "idle_neutral", 0.0)
            xs = [v.co for v in hm.vertices]
            dbg.append("head mesh min %s max %s" % (tuple(round(min(c[i] for c in xs), 3) for i in range(3)),
                                                    tuple(round(max(c[i] for c in xs), 3) for i in range(3))))
        M["arm"].data.pose_position = "REST"
        bpy.context.view_layer.update()
        dbg.append(f"rest head bone {tuple(round(v, 3) for v in bone_m(M, 'Head').translation)}")
        M["arm"].data.pose_position = "POSE"
        bpy.context.view_layer.update()
        dbg.append("acts " + ",".join(sorted(M["acts"]))[:120])
        dbg.append(f"arm world {[tuple(round(v, 2) for v in r) for r in M['arm'].matrix_world]}")
        print(f"::warning title=dbg {name}::" + " | ".join(dbg), flush=True)
    return M


_baked = {}       # (model, slot, clip, t) -> posed mesh of this frame
_look_mats = {}   # (look, slot) -> [material per slot index]
HIDDEN = None


def _hidden():
    global HIDDEN
    if HIDDEN is None:
        HIDDEN = bpy.data.materials.new("hidden")
        HIDDEN.use_nodes = True
        nt = HIDDEN.node_tree
        nt.nodes.clear()
        out, tr = nt.nodes.new("ShaderNodeOutputMaterial"), nt.nodes.new("ShaderNodeBsdfTransparent")
        nt.links.new(tr.outputs[0], out.inputs["Surface"])
    return HIDDEN


def part_mesh(name, slot, clip, t):
    k = (name, slot, clip, round(t, 4))
    if k not in _baked:
        M = model(name)
        if M["posed"] != (clip, t):
            _pose(M, clip, t)
        o = M["parts"][slot]
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        me.transform(Matrix.Scale(M["scale"], 4) @ to_lp @ o.matrix_world)
        if SMOOTH:
            me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
            try:
                me.set_sharp_from_angle(angle=math.radians(SMOOTH))
            except AttributeError:
                pass
        _baked[k] = me
    return _baked[k]


def look_meshes(look, clip, t):
    """The posed part meshes of a look, wearing its colors."""
    parts, over = lp_hero.parse_look(look)
    out = []
    for slot in lp_hero.SLOTS:
        if slot not in model(parts[slot])["parts"]:
            continue
        me = part_mesh(parts[slot], slot, clip, t).copy()
        k = (look, slot)
        if k not in _look_mats:
            ms = []
            for m0 in me.materials:
                c = lp_hero.look_color(over, slot, m0.name.split(".")[0]) if m0 else None
                if c == "-":
                    ms.append(_hidden())
                elif c:
                    ms.append(mat(tuple(v / 255 for v in c)))
                else:
                    bc = (0.5, 0.5, 0.5, 1.0)
                    if m0 and m0.use_nodes and "Principled BSDF" in m0.node_tree.nodes:
                        bc = m0.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value
                    ms.append(mat(tuple(min(1.0, max(0.0, v)) ** (1 / 2.2) for v in bc[:3])))
            _look_mats[k] = ms
        for i, m in enumerate(_look_mats[k]):
            me.materials[i] = m
        hide = {i for i, m in enumerate(_look_mats[k]) if m is HIDDEN}
        cut = set()
        M = model(parts[slot])
        for i, m0 in enumerate(M["parts"][slot].data.materials):
            if m0 and lp_hero.look_cut(over, slot, m0.name.split(".")[0]):
                ck = (slot, i)
                if ck not in M["cut"]:       # which faces of that piece are not beard, judged once in the standing pose
                    ref_me = part_mesh(parts[slot], slot, "idle_neutral", 0.0)
                    M["cut"][ck] = {pl.index for pl in ref_me.polygons if pl.material_index == i
                                    and not (pl.center.y < lp_hero.BEARD_CUT[0] and pl.center.z > lp_hero.BEARD_CUT[1])}
                cut |= M["cut"][ck]
        if hide or cut:                      # really remove hidden pieces (stacked transparent hair rendered as dark specks)
            import bmesh
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.delete(bm, geom=[fc for fc in bm.faces if fc.material_index in hide or fc.index in cut], context="FACES")
            bm.to_mesh(me)
            bm.free()
        out.append(me)
    return out


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


def _n(kind, **props):
    n = wn.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _math(op, a, b=None):
    n = _n("ShaderNodeMath", operation=op)
    for i, x in enumerate((a, b)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            wl.new(x, n.inputs[i])
    return n


def _ramp(val, lo, hi):
    n = _n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    wl.new(val, n.inputs["Value"])
    n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = lo, hi
    return n


def _mixc(fac, a=None, b=None):
    n = _n("ShaderNodeMixRGB")
    wl.new(fac, n.inputs[0])
    for i, x in ((1, a), (2, b)):
        if x is not None:
            wl.new(x, n.inputs[i])
    return n


tc, sep = wn.new("ShaderNodeTexCoord"), wn.new("ShaderNodeSeparateXYZ")
wl.new(tc.outputs["Generated"], sep.inputs[0])       # world shader: the view direction (z = up)
up = sep.outputs["Z"]
sky1 = _mixc(_ramp(up, 0.0, 0.28).outputs[0])        # horizon -> mid
sky2 = _mixc(_ramp(up, 0.2, 0.8).outputs[0], sky1.outputs[0])   # -> top
k_cloud = _math("DIVIDE", 1.6, _math("ADD", up, 0.3).outputs[0]).outputs[0]
cxy = wn.new("ShaderNodeCombineXYZ")
wl.new(_math("MULTIPLY", sep.outputs["X"], k_cloud).outputs[0], cxy.inputs[0])
wl.new(_math("MULTIPLY", sep.outputs["Y"], k_cloud).outputs[0], cxy.inputs[1])
noise = _n("ShaderNodeTexNoise", noise_dimensions="2D")
noise.inputs["Scale"].default_value, noise.inputs["Detail"].default_value = 1.1, 4.0
wl.new(cxy.outputs[0], noise.inputs["Vector"])
cloud_amt = _math("MULTIPLY", _ramp(noise.outputs["Fac"], 0.5, 0.68).outputs[0], 0.0)
cloud_f = _math("MULTIPLY", cloud_amt.outputs[0], _ramp(up, 0.03, 0.22).outputs[0])
sky3 = _mixc(cloud_f.outputs[0], sky2.outputs[0])
vor = _n("ShaderNodeTexVoronoi")
vor.inputs["Scale"].default_value = 70.0
wl.new(tc.outputs["Generated"], vor.inputs["Vector"])
vsep = wn.new("ShaderNodeSeparateXYZ")
wl.new(vor.outputs["Color"], vsep.inputs[0])
star = _math("MULTIPLY", _math("GREATER_THAN", vsep.outputs[0], 0.985).outputs[0],
             _math("SUBTRACT", 1.0, _ramp(vor.outputs["Distance"], 0.04, 0.22).outputs[0]).outputs[0])
star_amt = _math("MULTIPLY", _math("MULTIPLY", star.outputs[0], _ramp(up, 0.05, 0.35).outputs[0]).outputs[0], 0.0)
sky4 = _n("ShaderNodeMixRGB", blend_type="ADD")
wl.new(star_amt.outputs[0], sky4.inputs[0])
wl.new(sky3.outputs[0], sky4.inputs[1])
sky4.inputs[2].default_value = (1.6, 1.6, 1.8, 1)
sdot = _n("ShaderNodeVectorMath", operation="DOT_PRODUCT")
wl.new(tc.outputs["Generated"], sdot.inputs[0])
sun_disc = _ramp(sdot.outputs["Value"], 0.99, 1.0)
sky5 = _mixc(sun_disc.outputs[0], sky4.outputs[0])
sun_glow = _math("MULTIPLY", _math("POWER", _math("MAXIMUM", sdot.outputs["Value"], 0.0).outputs[0], 30.0).outputs[0], 0.0)
sky6 = _n("ShaderNodeMixRGB", blend_type="ADD")
wl.new(sun_glow.outputs[0], sky6.inputs[0])
wl.new(sky5.outputs[0], sky6.inputs[1])
wl.new(sky6.outputs[0], bg_cam.inputs["Color"])


def set_sky(L):
    c4 = lambda k, mul=1.0: (*[mul * x for x in lin(L[k])], 1)   # noqa: E731
    sky1.inputs[1].default_value, sky1.inputs[2].default_value = c4("fog"), c4("mid")
    sky2.inputs[2].default_value = c4("top")
    sky3.inputs[2].default_value = c4("cloud_col")
    cloud_amt.inputs[1].default_value = L["clouds"]
    star_amt.inputs[1].default_value = L["stars"]
    x, y, z = Vector(L["sun"]).normalized()
    sdot.inputs[1].default_value = (x, -z, y)            # pipeline (x, y, z) -> Blender (x, -z, y)
    size = L["sun_size"]
    sun_disc.inputs["From Min"].default_value = math.cos(size) - 0.0015 if size else 2.0
    sun_disc.inputs["From Max"].default_value = math.cos(size) if size else 3.0
    sky5.inputs[2].default_value = c4("sun_col", 2.2)   # over 1: the glare pass makes it bloom
    sky6.inputs[2].default_value = c4("sun_col")
    sun_glow.inputs[1].default_value = 0.3 if size else 0.0
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
fill.data.energy, fill.data.size = 55, 3
rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "AREA"))  # edge light separates people from the set
sc.collection.objects.link(rim)
rim.parent = cam
rim.location = (-2.5, 2.5, -7)
rim.rotation_euler = (math.radians(-160), math.radians(-20), 0)
rim.data.energy, rim.data.size = 170, 4

sc.view_layers[0].use_pass_mist = True
sc.view_layers[0].use_pass_z = True
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
is_sky = ct.nodes.new("CompositorNodeMath")       # the sky itself gets no haze (it is the haze color at the horizon)
is_sky.operation = "LESS_THAN"
ct.links.new(rl.outputs["Depth"], is_sky.inputs[0])
is_sky.inputs[1].default_value = 5000.0
fog_geo = ct.nodes.new("CompositorNodeMath")
fog_geo.operation = "MULTIPLY"
ct.links.new(fog_amt.outputs[0], fog_geo.inputs[0])
ct.links.new(is_sky.outputs[0], fog_geo.inputs[1])
ct.links.new(fog_geo.outputs[0], fogmix.inputs[0])
ct.links.new(fogmix.outputs[0], glare.inputs[0])
ct.links.new(glare.outputs[0], comp.inputs[0])


def set_look(L, set_name):
    fog = lin(L["fog"])
    h_name, tex, sky_visible = LOOKS.get(set_name, LOOKS["field"])
    img = hdri(h_name)
    env.image = img
    has = img is not None
    set_sky(L)
    amb_mix.inputs[1].default_value = (*[0.5 * (a + b) for a, b in zip(lin(L["sky"]), lin(L["ground"]))], 1)
    amb_mix.inputs[0].default_value = 1.0 if has else 0.0
    bg_amb.inputs["Strength"].default_value = (0.85 if has else 0.7) * L.get("amb_e", 1.0)
    sun.data.energy = 3.2 * L.get("key_e", 1.0)
    fogmix.inputs[2].default_value = (*fog, 1)
    fog_amt.inputs[1].default_value = 1.0
    sun.data.color = tuple(L.get("key_col", (1.0, 1.0, 1.0)))
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
    dist = (eye - tgt).length  # background blur on close shots, sharp on wide ones
    cam.data.dof.use_dof = dist < 7
    cam.data.dof.focus_distance = dist
    cam.data.dof.aperture_fstop = 2.2


# ---------------------------------------------------------------- per frame
item_objs = {}
frame_objs = []
acc_objs = []

item_objs_by_plan = {}
for n, (plan, key) in enumerate(JOBS):
    t0 = time.time()
    if plan["_slug"] not in item_objs_by_plan:  # a new Short: drop the last one's set pieces
        for o in item_objs.values():
            bpy.data.objects.remove(o)
        item_objs = item_objs_by_plan[plan["_slug"]] = {}
    f = plan["frames"][key]
    # the workflow runs this script up to 3 times: finished frames are kept, and a frame that
    # killed Blender once is skipped (render.py covers a stray frame with its neighbor)
    dest = out_dir / plan["_slug"] / f"{key}.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    mark = dest.with_suffix(".try")
    if dest.exists():
        continue
    if mark.exists():
        print(f"[blender] skipping {plan['_slug']}/{key}: it crashed the last attempt", flush=True)
        continue
    mark.write_text("")
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
    for o in acc_objs:    # last frame's hero hair, shoes...
        bpy.data.objects.remove(o)
    frame_objs, acc_objs = [], []
    for me in _baked.values():   # last frame's posed parts
        bpy.data.meshes.remove(me)
    _baked.clear()
    hero_cid = f["crowds"][-1][0] if f.get("hero") and f["crowds"] else None
    acc = lp_hero.accessories(f["hero"]) if hero_cid is not None else []
    for cid, cm in f["crowds"]:
        gm = mat4(cm)
        c = plan["crowds"][cid]
        for clip, ph, rows in c["groups"]:
            meshes = look_meshes(c["skin"], clip, f["t"] + ph)
            W = None
            if cid == hero_cid and acc:      # hero extras ride on the head: its pose now, relative to standing
                HM = model(lp_hero.parse_look(c["skin"])[0]["head"])
                _pose(HM, clip, f["t"] + ph)
                W = {b_: bone_m(HM, b_) @ r_ for b_, r_ in HM["ref"].items()}
                if os.environ.get("BL_DEBUG"):
                    print(f"::warning title=dbg acc {key}::clip {clip} t {f['t'] + ph:.3f} acc {len(acc)} rows {len(rows)} "
                          f"W {[tuple(round(v, 3) for v in r) for r in W['Head']][:3]}", flush=True)
            for r in rows:
                if (gm @ Vector((r[0], r[1] + 1, r[2])) - Vector(f["eye"])).length < 4.0 and cid != f["crowds"][-1][0]:
                    continue  # never let a background person block the lens
                m = gm @ Matrix.Translation((r[0], r[1], r[2])) @ ry(r[3]) @ Matrix.Scale(r[7], 4)   # r[7]: 1.75 / model height * size
                for me in meshes:
                    frame_objs.append(obj("p", me, m))
                if W:
                    for bone, mesh, pos, size, col in acc:
                        if bone in W:
                            o = obj("a", MESHES["rbox" if (mesh == "box" and (SMOOTH or SUBSURF)) else mesh], m @ W[bone] @ Matrix.Translation(pos) @ Matrix.Diagonal((*size, 1)))
                            paint(o, mat(col))
                            acc_objs.append(o)
            for me in meshes:                # a group nobody used (all too close to the lens)
                if me.users == 0:
                    bpy.data.meshes.remove(me)
    (out_dir / plan["_slug"]).mkdir(parents=True, exist_ok=True)
    sc.render.filepath = str(out_dir / plan["_slug"] / f"{key}.jpg")
    bpy.ops.render.render(write_still=True)
    print(f"[blender] {n + 1}/{len(JOBS)} {plan['_slug']}/{key} {time.time() - t0:.1f}s", flush=True)
