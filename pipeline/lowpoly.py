"""Low-poly animated 3D style (visual type "lowpoly") — BRANCH ONLY until Sam approves it.

Blocky flat-colored rigged characters (CC0, assets/characters/CREDITS.md), instanced crowds of
hundreds, simple code-built sets with sky backdrops, and a dynamic camera that changes shot type
every beat (~1.4–2 s): wide, low hero angle, close-up, tracking, overhead. Renders at 540x960 and
is upscaled (the slightly low-res look is intended, and it's 4x fewer pixels for llvmpipe).

Scene JSON:
  {"type": "lowpoly", "set": "field|store|warehouse|city|office|stage|court|pitch|studio|gaming|launch",
   "action": "run|push|carry|cheer|fall|work|idle", "crowd": 0..400,
   "props": ["boxes", "truck", "rocket", "car", "check", "cash", "phone", "trophy", "ball", "mic", "headset"],
   "stat": "$9.6B", "stat_sub": "packages a year"}
People are always generic: never a real person's face, hair, body or signature look (STYLE.md).
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageFilter

from . import character
from .crowd import Crowd, grid_crowd
from .gl3d import Engine, Scene, trs

SIZE = (540, 960)
CHAR = "quaternius-animated-human"
CLIP = {"run": "run", "push": "walk", "carry": "walk", "cheer": "jump", "fall": "death", "work": "working", "idle": "idle"}
SETS = {
    "field": dict(sky=(0.55, 0.78, 0.98), floor=(0.36, 0.64, 0.3)),
    "store": dict(sky=(0.93, 0.93, 0.95), floor=(0.82, 0.82, 0.85)),
    "warehouse": dict(sky=(0.78, 0.8, 0.84), floor=(0.62, 0.62, 0.64)),
    "city": dict(sky=(0.98, 0.72, 0.5), floor=(0.42, 0.44, 0.48)),
    "office": dict(sky=(0.88, 0.92, 0.98), floor=(0.7, 0.62, 0.52)),
    "stage": dict(sky=(0.12, 0.1, 0.22), floor=(0.18, 0.16, 0.24)),
    # famous-people worlds (Nov 1): hint who it is with the setting, never their look
    "court": dict(sky=(0.16, 0.18, 0.26), floor=(0.78, 0.55, 0.32)),
    "pitch": dict(sky=(0.1, 0.14, 0.24), floor=(0.24, 0.55, 0.26)),
    "studio": dict(sky=(0.08, 0.07, 0.1), floor=(0.2, 0.18, 0.2)),
    "gaming": dict(sky=(0.1, 0.06, 0.18), floor=(0.16, 0.14, 0.2)),
    "launch": dict(sky=(0.95, 0.68, 0.45), floor=(0.62, 0.56, 0.48)),
}
PALETTE = [(0.95, 0.35, 0.3), (0.3, 0.55, 0.95), (0.98, 0.8, 0.25), (0.35, 0.75, 0.45), (0.8, 0.45, 0.85),
           (0.95, 0.6, 0.3), (0.3, 0.8, 0.85), (0.92, 0.92, 0.92)]
SKINS = ("LightSkin", "LightSkin1", "LightSkin2", "DarkSkin", "DarkSkin1", "DarkSkin2")
SHOTS = ("wide", "hero_low", "close", "track", "top")


def look(set_name):
    st = SETS.get(set_name, SETS["field"])
    return dict(fog=st["sky"], floor=st["floor"], grid=0.0, sky=(1.0, 1.0, 1.0), ground=(0.45, 0.42, 0.4),
                rim=(0.25, 0.25, 0.25), key_dir=(-0.45, -1.0, -0.35), fog_near=35, fog_far=110, floor_radius=90)


def _box(sc, pos, size, col, ry=0.0, shadow=True):
    sc.add(Engine.get().meshes["box"], trs(pos, size, ry=ry), col, spec=0.05, gloss=8,
           shadow=(pos[0], pos[2], size[0] * 0.6, size[2] * 0.6) if shadow else None)


def _cyl(sc, pos, r, h, col):
    sc.add(Engine.get().meshes["cyl"], trs(pos, (r, h, r)), col, spec=0.1, gloss=10, shadow=(pos[0], pos[2], r, r))


# ----------------------------------------------------------------- sets + props (all code-built)
def build_set(sc, name, rng, fans=True):
    if name == "field":
        for x in (-34, 34):                       # bleachers on both sides
            for k in range(5):
                _box(sc, (x + (k * 1.4 if x > 0 else -k * 1.4), k * 0.7, -10), (1.4, 0.7, 60), (0.7, 0.7, 0.75), shadow=False)
        for z in np.arange(-40, 30, 10):          # field lines
            _box(sc, (0, 0.005, z), (40, 0.01, 0.25), (0.95, 0.95, 0.95), shadow=False)
    elif name in ("store", "warehouse"):
        for x in (-16, -9, 9, 16):
            for z in np.arange(-60, 8, 4.5):
                _box(sc, (x, 0, z), (1.6, 3.6 if name == "store" else 6.0, 4.2), (0.92, 0.45, 0.12) if name == "warehouse" else (0.85, 0.85, 0.88))
                for lv in range(3 if name == "store" else 4):
                    _box(sc, (x, 0.3 + lv * (1.1 if name == "store" else 1.45), z), (1.5, 0.8, 4.0), PALETTE[(lv + int(z)) % 8], shadow=False)
    elif name == "city":
        for side in (-1, 1):
            for z in np.arange(-70, 15, 9):
                h = float(rng.uniform(8, 30))
                x = side * float(rng.uniform(12, 16))
                _box(sc, (x, 0, z), (7, h, 7), tuple(rng.uniform(0.45, 0.8, 3)), shadow=False)
                for wy in np.arange(2, h - 1, 2.6):   # window rows
                    _box(sc, (x - side * 3.52, wy, z), (0.05, 1.0, 5.5), (0.98, 0.88, 0.55), shadow=False)
        _box(sc, (0, 0.006, -25), (6, 0.01, 90), (0.3, 0.31, 0.34), shadow=False)
    elif name == "office":
        for x in (-6, -2, 2, 6):
            for z in np.arange(-24, 6, 4):
                _box(sc, (x, 0, z), (2.4, 0.9, 1.2), (0.85, 0.75, 0.6))
                _box(sc, (x, 0.9, z - 0.3), (0.9, 0.6, 0.06), (0.15, 0.18, 0.22), shadow=False)
    elif name == "court":                         # basketball: lines, hoops, arena seats
        for z in (-30,):
            _box(sc, (0, 0, z), (0.25, 4.2, 0.25), (0.3, 0.3, 0.32), shadow=False)
            _box(sc, (0, 4.2, z + (0.4 if z < 0 else -0.4)), (2.2, 1.4, 0.08), (0.96, 0.96, 0.96), shadow=False)
            sc.add(Engine.get().meshes["cyl"], trs((0, 3.8, z + (0.9 if z < 0 else -0.9)), (0.45, 0.05, 0.45)), (0.95, 0.4, 0.1))
        _box(sc, (0, 0.004, -14), (15, 0.01, 0.15), (0.97, 0.97, 0.97), shadow=False)
        for x in (-7.5, 7.5):
            _box(sc, (x, 0.004, -14), (0.15, 0.01, 32), (0.97, 0.97, 0.97), shadow=False)
        _stands(sc, 11, rng, fans)
    elif name == "pitch":                         # soccer: night stadium, goals, floodlights
        for z in (-40,):
            for x in (-3.6, 3.6):
                _box(sc, (x, 0, z), (0.18, 2.4, 0.18), (0.97, 0.97, 0.97), shadow=False)
            _box(sc, (0, 2.4, z), (7.4, 0.18, 0.18), (0.97, 0.97, 0.97), shadow=False)
        _box(sc, (0, 0.004, -17), (40, 0.01, 0.2), (0.95, 0.95, 0.95), shadow=False)
        _stands(sc, 16, rng, fans)
        for x in (-26, 26):
            _box(sc, (x, 0, -30), (0.5, 20, 0.5), (0.4, 0.4, 0.45), shadow=False)
            sc.add(Engine.get().meshes["box"], trs((x, 20, -30), (3, 1.4, 0.3)), (1, 1, 0.9), unlit=True)
    elif name == "studio":                        # music: mic stand, speakers, glowing panels
        _box(sc, (0, 0, -6), (12, 0.5, 6), (0.15, 0.13, 0.16))
        for x in (-5, 5):
            _box(sc, (x, 0.5, -7), (1.4, 3.0, 1.2), (0.08, 0.08, 0.09))
            _cyl(sc, (x, 2.6, -6.38), 0.45, 0.04, (0.3, 0.3, 0.34))
        for k in range(7):
            sc.add(Engine.get().meshes["box"], trs((-6 + k * 2, 3 + (k % 3), -12), (1.2, 4, 0.1)),
                   PALETTE[(k * 3) % 8], unlit=True)
    elif name == "gaming":                        # streaming: desk, glowing monitors, LED strips
        for x in (-5, 0, 5):
            _box(sc, (x, 0, -6), (3.6, 1.0, 1.6), (0.12, 0.12, 0.14))
            for dx in (-0.85, 0.85):
                sc.add(Engine.get().meshes["box"], trs((x + dx, 1.2, -6.4), (1.5, 0.9, 0.06)),
                       (0.35, 0.6, 1.0) if dx < 0 else (0.75, 0.35, 0.95), unlit=True)
        for z in np.arange(-30, 0, 6):
            sc.add(Engine.get().meshes["box"], trs((-9, 2.5, z), (0.1, 0.12, 5)), (0.9, 0.2, 0.9), unlit=True)
            sc.add(Engine.get().meshes["box"], trs((9, 2.5, z), (0.1, 0.12, 5)), (0.2, 0.9, 0.95), unlit=True)
    elif name == "launch":                        # space: pad, tower, desert
        _box(sc, (-8, 0, -20), (8, 0.6, 8), (0.5, 0.5, 0.52))
        _box(sc, (-11, 0, -20), (1.2, 16, 1.2), (0.75, 0.3, 0.2))
    elif name == "stage":
        _box(sc, (0, 0, -6), (16, 1.0, 8), (0.25, 0.22, 0.3))
        for x in (-7, 7):
            _box(sc, (x, 1, -9), (0.6, 9, 0.6), (0.4, 0.4, 0.45), shadow=False)


def _stands(sc, half, rng, fans=True):
    """Tiered seats both sides with a scatter of colored fans (boxes, cheap)."""
    for side in (-1, 1):
        for k in range(6):
            x = side * (half + 2 + k * 1.3)
            _box(sc, (x, k * 0.8, -16), (1.3, 0.8, 70), (0.3, 0.3, 0.36), shadow=False)
            for z in np.arange(-48, 18, 1.6):
                if fans and rng.random() < 0.7:
                    _box(sc, (x, k * 0.8 + 0.8, z), (0.45, 0.6, 0.45), PALETTE[int(rng.integers(8))], shadow=False)


def add_props(sc, props, t, rng):
    for name in props or []:
        if name == "boxes":                       # mountains of parcels
            for k in range(70):
                x, z = rng.choice([-1, 1]) * rng.uniform(2.5, 7.5), rng.uniform(-28, -4)
                stack = int(rng.integers(1, 7))
                for lv in range(stack):
                    _box(sc, (x, lv * 0.75, z), (0.9, 0.72, 0.9), (0.8, 0.6, 0.38), ry=float(rng.uniform(0, 1)), shadow=lv == 0)
        elif name == "truck":
            _box(sc, (6, 0.4, -12), (3.2, 3.6, 7.5), (0.95, 0.95, 0.95))
            _box(sc, (6, 0.4, -7.2), (3.0, 2.4, 2.2), (0.3, 0.55, 0.95))
            for dz in (-14.5, -10, -7):
                for dx in (4.4, 7.6):
                    _cyl(sc, (dx, 0, dz), 0.55, 0.45, (0.1, 0.1, 0.1))
        elif name == "rocket":
            y = max(0.0, (t - 1.0) ** 2 * 1.5) if t > 1.0 else 0.0
            _cyl(sc, (-8, y, -20), 1.3, 11, (0.95, 0.95, 0.97))
            sc.add(Engine.get().meshes["cyl"], trs((-8, y + 11, -20), (0.9, 1.6, 0.9)), (0.85, 0.2, 0.2))
            for k in range(4):
                a = k * math.pi / 2
                _box(sc, (-8 + math.cos(a) * 1.3, y, -20 + math.sin(a) * 1.3), (0.2, 3, 1.4), (0.85, 0.2, 0.2), ry=a, shadow=False)
            if y > 0:
                _cyl(sc, (-8, y - 2.2, -20), 0.8, 2.2, (1.0, 0.7, 0.2))
        elif name == "car":
            x = -10 + (t * 4.0) % 20
            _box(sc, (x, 0.35, -9), (4.2, 0.9, 1.9), (0.9, 0.9, 0.92))
            _box(sc, (x - 0.2, 1.25, -9), (2.2, 0.7, 1.7), (0.15, 0.18, 0.22))
            for dx in (-1.4, 1.4):
                for dz in (-10.0, -8.0):
                    _cyl(sc, (x + dx, 0, dz), 0.4, 0.3, (0.1, 0.1, 0.1))
        elif name == "check":                     # giant check: white board, green band
            _box(sc, (-3.8, 0.0, -7), (4.4, 2.2, 0.12), (0.97, 0.97, 0.93))
            _box(sc, (-3.8, 1.7, -6.93), (4.3, 0.35, 0.02), (0.3, 0.7, 0.4), shadow=False)
        elif name == "cash":
            for k in range(40):
                _box(sc, (rng.uniform(-5, -2), (k // 8) * 0.25, rng.uniform(-5, -2)), (1.0, 0.22, 0.48), (0.4, 0.74, 0.45),
                     ry=float(rng.uniform(0, 3)), shadow=k < 8)
        elif name == "phone":
            _box(sc, (0, 3.0 + 0.1 * math.sin(t * 2), -4), (1.8, 3.6, 0.2), (0.1, 0.1, 0.12), shadow=False)
            _box(sc, (0, 3.15 + 0.1 * math.sin(t * 2), -3.89), (1.6, 3.2, 0.02), (0.3, 0.6, 0.95), shadow=False)
        elif name == "mic":
            _cyl(sc, (1.2, 0, -1.5), 0.04, 1.6, (0.2, 0.2, 0.22))
            sc.add(Engine.get().meshes["sphere"], trs((1.2, 1.7, -1.5), (0.12, 0.16, 0.12)), (0.25, 0.25, 0.28), spec=0.6, gloss=40)
        elif name == "headset":                   # gaming headset floating over the desk
            sc.add(Engine.get().meshes["box"], trs((0, 2.2 + 0.1 * math.sin(t * 2), -4), (1.2, 0.15, 0.3)), (0.9, 0.2, 0.9))
            for dx in (-0.6, 0.6):
                _cyl(sc, (dx, 1.6 + 0.1 * math.sin(t * 2), -4), 0.3, 0.6, (0.12, 0.12, 0.14))
        elif name == "trophy":
            _cyl(sc, (2, 0, -3), 0.5, 0.3, (0.4, 0.3, 0.2))
            _cyl(sc, (2, 0.3, -3), 0.25, 1.0, (0.95, 0.75, 0.2))
            _cyl(sc, (2, 1.3, -3), 0.7, 0.8, (0.95, 0.75, 0.2))


# ----------------------------------------------------------------- characters
# what the background people do, by set (Nov 3, Sam: "the 3D models need to make sense with the
# video"): fans in the stands, a line at the counter, people at desks, sidewalks, warehouse aisles.
# A scene can override with visual "crowd_mode"; "runners" is the old run-at-the-camera pack.
MODE_BY_SET = {"court": "audience", "pitch": "audience", "stage": "concert", "studio": "concert",
               "launch": "watch", "store": "queue", "office": "workers", "gaming": "workers",
               "city": "street", "warehouse": "aisles", "field": "runners"}
STANDS = {"court": 11, "pitch": 16}


def crowd_mode(v):
    return v.get("crowd_mode") or MODE_BY_SET.get(v.get("set"), "runners")


def _face(x, z, tx, tz):
    return math.atan2(tx - x, tz - z)  # characters face +z at yaw 0


def _layout(mode, v, n, rng, act):
    """[((x, y, z), yaw, clip, speed m/s along z or None = follow the hero)] for n background people."""
    out = []
    if mode == "audience":
        half = STANDS.get(v.get("set"), 11)
        seats = [(side * (half + 2 + k * 1.3), k * 0.8 + 0.8, z) for side in (-1, 1) for k in range(6)
                 for z in np.arange(-34, 12, 0.95)]
        for i in rng.permutation(len(seats))[:n]:
            x, y, z = seats[i]
            out.append(((x + rng.uniform(-0.15, 0.15), y, z), _face(x, z, 0, -10),
                        "jump" if rng.random() < 0.45 else "idle", 0.0))
    elif mode in ("concert", "watch"):
        tx, tz = (0, -6) if mode == "concert" else (-8, -20)
        x0, x1, z0, z1 = (-8, 8, 3, 14) if mode == "concert" else (-2, 12, -4, 8)
        for (x, _y, z) in grid_crowd(n, x0, x1, z0, z1, rng):
            out.append(((x, 0, z), _face(x, z, tx, tz), "jump" if rng.random() < 0.5 else "idle", 0.0))
    elif mode == "queue":
        line = min(n, 14)
        for k in range(line):  # a line at the counter, everyone facing it
            out.append(((-2.6 + rng.uniform(-0.1, 0.1), 0, -3.5 - k * 0.95), math.pi, "idle", 0.0))
        for k in range(n - line):  # shoppers walking the aisles both ways
            d = 1 if k % 2 else -1
            out.append(((float(rng.choice([-12.5, 12.5])) + rng.uniform(-1, 1), 0, rng.uniform(-60, 6)),
                        0.0 if d > 0 else math.pi, "walk", 1.2 * d))
    elif mode == "workers":
        if v.get("set") == "office":
            desks = [(x, z + 1.0) for x in (-6, -2, 2, 6) for z in np.arange(-24, 6, 4)]
        else:
            desks = [(x + dx, -4.9) for x in (-5, 0, 5) for dx in (-0.9, 0.9)]
        for x, z in desks[:n]:  # one person at each desk, facing the screen
            out.append(((x, 0, z), math.pi, "working" if rng.random() < 0.4 else "idle", 0.0))
    elif mode == "street":
        for k in range(n):
            d = 1 if k % 2 else -1
            side = float(rng.choice([-1, 1]))
            out.append(((side * rng.uniform(4.5, 7.5), 0, rng.uniform(-60, 10)),
                        0.0 if d > 0 else math.pi, "walk", 1.4 * d))
    elif mode == "aisles":
        for k in range(n):
            d = 1 if k % 2 else -1
            out.append(((float(rng.choice([-12.5, -4.0, 4.0, 12.5])) + rng.uniform(-0.6, 0.6), 0, rng.uniform(-55, 5)),
                        0.0 if d > 0 else math.pi, "walk" if rng.random() < 0.8 else "working", 1.1 * d))
    else:  # runners: the pack behind the hero, moving with them
        wide = v.get("set") in ("field", "city", "stage", "court", "pitch")
        for k, (x, y, z) in enumerate(grid_crowd(n, -16 if wide else -6, 16 if wide else 6, -40, -6, rng)):
            c = CLIP.get(act, "idle") if (k % 4 or act != "cheer") else "jump"
            out.append(((x, y, z), float(rng.uniform(-0.3, 0.3)), c, None))
    return out


def _crowd(key, v, ch):
    """([(Crowd, speed or None)], hero). speed None = moves with the hero."""
    e = Engine.get()
    if not hasattr(e, "lp_crowds"):
        e.lp_crowds = {}
    if key not in e.lp_crowds:
        rng = np.random.default_rng(abs(hash(key)) % 2**32)
        n = int(v.get("crowd", 0))
        act = v.get("action", "run")
        clip = ch.find_clip(CLIP.get(act, "idle"))
        # the pack's clothed textures: skin tones, hair, shirts and pants, so they read as people
        skins = list(SKINS)
        rng.shuffle(skins)
        buckets = {}
        for i, (pos, yaw, c, speed) in enumerate(_layout(crowd_mode(v), v, n, rng, act)):
            buckets.setdefault((i % len(skins), speed), []).append((pos, yaw, ch.find_clip(c), (i % 8) * 0.137))
        cs = []
        for (k, speed), rows in buckets.items():
            c = Crowd(ch, skin=skins[k])
            c.place([r[0] for r in rows], [r[1] for r in rows], rng.uniform(0.92, 1.08, len(rows)),
                    [(1, 1, 1)] * len(rows), [r[2] for r in rows], [r[3] for r in rows])
            cs.append((c, speed))
        hero = Crowd(ch, skin=skins[0])
        hero.place([(0, 0, 0)], [0.0], [1.0], [(1, 1, 1)], [clip], [0.0])
        e.lp_crowds[key] = (cs, hero)
    return e.lp_crowds[key]


def _ease(p):
    return p * p * (3 - 2 * p)


def _camera(shot, p, t, act):
    p = _ease(p)
    z = t * (3.2 if act == "run" else 1.4 if act in ("push", "carry") else 0.0)  # hero moves toward -z? no: +z
    hz = z
    if shot == "wide":
        return (8 - 6 * p, 7.5, hz + 16), (0, 1.2, hz - 8), 46
    if shot == "hero_low":
        return (1.6 - 1.2 * p, 0.35, hz + 3.6), (0, 1.5, hz), 50
    if shot == "close":
        return (0.6, 1.55, hz + 3.0 - 0.4 * p), (0, 1.25, hz), 40
    if shot == "track":
        return (2.6, 1.3, hz + 1.2 - 1.2 * p), (0, 1.0, hz - 1.5), 46
    return (0.5, 22 - 4 * p, hz + 6), (0, 0, hz - 6), 50  # top


# ----------------------------------------------------------------- Blender plan (nightly, Nov 3)
# With a key, render() also records the frame's scene: camera, every box/cylinder/sphere (deduped
# into ITEMS), and each crowd group's instances. pipeline/blender_lp.py replays it in Cycles on 20
# GitHub machines; render.py then uses those frames and falls back to this renderer if any are missing.
PLAN: dict = {}
ITEMS: list = []
_ITEM_IDS: dict = {}
CROWDS: list = []   # each crowd's instances once; frames point at them
_CROWD_IDS: dict = {}


def _record(key, sc, placed, t, set_name):
    names = {id(v): k for k, v in Engine.get().meshes.items()}
    ids = []
    for mesh, model, color, _tex, _spec, _gloss, emis, _alpha, unlit in sc.items:
        it = (names.get(id(mesh), "box"), tuple(round(float(x), 4) for x in np.asarray(model).ravel()),
              tuple(round(float(c), 3) for c in color), bool(unlit) or emis > 0)
        if it not in _ITEM_IDS:
            _ITEM_IDS[it] = len(ITEMS)
            ITEMS.append(it)
        ids.append(_ITEM_IDS[it])
    cids = []
    for c, cm in placed:
        if id(c) not in _CROWD_IDS:
            _CROWD_IDS[id(c)] = len(CROWDS)
            CROWDS.append(dict(skin=c.skin, groups=[[clip, ph, rows] for clip, ph, rows in c.rows]))
        cids.append([_CROWD_IDS[id(c)], np.asarray(cm).ravel().tolist()])
    ch = character.load(CHAR)
    PLAN[key] = dict(eye=[float(x) for x in sc.eye], target=[float(x) for x in sc.target], fov=sc.fov,
                     set=set_name, look={k: list(v) if isinstance(v, tuple) else v for k, v in sc.look.items()},
                     items=ids, t=t, base_y=ch.base_y, height=ch.height,
                     crowds=cids)


def dump_plan(path):
    import json
    from pathlib import Path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps({"frames": PLAN, "items": ITEMS, "crowds": CROWDS}))
    for d in (PLAN, ITEMS, _ITEM_IDS, CROWDS, _CROWD_IDS):
        d.clear()


def render(v, t, p, variant, rec=None):
    """One low-poly frame (RGB PIL, 1080x1920, upscaled from 540x960). rec (a frame key) records it for Blender."""
    ch = character.load(CHAR)
    act = v.get("action", "run")
    key = (v.get("set"), act, int(v.get("crowd", 0)), id(v))
    crowd, hero = _crowd(key, v, ch)
    shots = SHOTS if v.get("set") in ("field", "city", "stage", "court", "pitch") else ("wide", "hero_low", "close", "top")
    shot = v.get("shot") or shots[variant % len(shots)]
    eye, tgt, fov = _camera(shot, p, t, act)
    # slight handheld sway so held shots never look frozen
    eye = (eye[0] + 0.06 * math.sin(t * 1.7), eye[1] + 0.04 * math.sin(t * 2.3 + 1), eye[2])
    sc = Scene(look(v.get("set", "field")), eye, tgt, fov=fov, aperture=0.0)
    sc.size, sc.vignette, sc.shift, sc.shift_x = SIZE, 0.12, 0.0, 0.0
    rng = np.random.default_rng(7)
    build_set(sc, v.get("set", "field"), rng, fans=not (crowd_mode(v) == "audience" and v.get("crowd")))
    add_props(sc, v.get("props"), t, np.random.default_rng(11))
    # the crowd and hero move together (crowd behind); one draw per animation phase group
    dz = t * (3.2 if act == "run" else 1.4 if act in ("push", "carry") else 0.0)
    m = trs((0, 0, dz))
    placed = [(c, m if speed is None else trs((0, 0, speed * t))) for c, speed in crowd] + [(hero, m)]
    for c, cm in placed:
        sc.customs.append(_shifted(c, t, cm))
    if act == "push":
        _box(sc, (0, 0.5, dz + 0.9), (0.9, 0.7, 1.1), (0.75, 0.78, 0.82))
    if "ball" in (v.get("props") or []):          # dribbled at the hero's side, moves with them
        sc.add(Engine.get().meshes["sphere"], trs((0.45, 0.12 + abs(math.sin(t * 5)) * 0.4, dz + 0.35), (0.12, 0.12, 0.12)),
               (0.95, 0.95, 0.95) if v.get("set") == "pitch" else (0.95, 0.5, 0.15), spec=0.2, gloss=20)
    if act == "carry":
        _box(sc, (0, 1.05, dz + 0.45), (0.6, 0.45, 0.45), (0.8, 0.6, 0.38), shadow=False)
    if rec is not None:
        _record(rec, sc, placed, t, v.get("set", "field"))
    img = Image.fromarray(sc.render()).resize((1080, 1920), Image.LANCZOS)
    return img.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))


def _shifted(crowd, t, m):
    draw = crowd.drawer(t)

    def fn(e, vp, sc):
        draw(e, vp @ m, sc)
    return fn
