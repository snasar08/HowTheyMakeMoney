"""Low-poly animated 3D style (visual type "lowpoly") — BRANCH ONLY until Sam approves it.

Blocky flat-colored rigged characters (CC0, assets/characters/CREDITS.md), instanced crowds of
hundreds, simple code-built sets with sky backdrops, and a dynamic camera that changes shot type
every beat (~1.4–2 s): wide, low hero angle, close-up, tracking, overhead. Renders at 540x960 and
is upscaled (the slightly low-res look is intended, and it's 4x fewer pixels for llvmpipe).

Scene JSON:
  {"type": "lowpoly", "set": "field|store|warehouse|city|office|stage",
   "action": "run|push|carry|cheer|fall|work|idle", "crowd": 0..400,
   "props": ["boxes", "truck", "rocket", "car", "check", "cash", "phone", "trophy"],
   "stat": "$9.6B", "stat_sub": "packages a year"}
People are always generic: never a real person's face, hair, body or signature look (STYLE.md).
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

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
}
PALETTE = [(0.95, 0.35, 0.3), (0.3, 0.55, 0.95), (0.98, 0.8, 0.25), (0.35, 0.75, 0.45), (0.8, 0.45, 0.85),
           (0.95, 0.6, 0.3), (0.3, 0.8, 0.85), (0.92, 0.92, 0.92)]
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
def build_set(sc, name, rng):
    if name == "field":
        for x in (-34, 34):                       # bleachers on both sides
            for k in range(5):
                _box(sc, (x + (k * 1.4 if x > 0 else -k * 1.4), k * 0.7, -10), (1.4, 0.7, 60), (0.7, 0.7, 0.75), shadow=False)
        for z in np.arange(-40, 30, 10):          # field lines
            _box(sc, (0, 0.005, z), (40, 0.01, 0.25), (0.95, 0.95, 0.95), shadow=False)
    elif name in ("store", "warehouse"):
        for x in (-12, -6.5, 6.5, 12):
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
    elif name == "stage":
        _box(sc, (0, 0, -6), (16, 1.0, 8), (0.25, 0.22, 0.3))
        for x in (-7, 7):
            _box(sc, (x, 1, -9), (0.6, 9, 0.6), (0.4, 0.4, 0.45), shadow=False)


def add_props(sc, props, t, rng):
    for name in props or []:
        if name == "boxes":                       # mountains of parcels
            for k in range(70):
                x, z = rng.uniform(-10, 10), rng.uniform(-28, -6)
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
        elif name == "trophy":
            _cyl(sc, (2, 0, -3), 0.5, 0.3, (0.4, 0.3, 0.2))
            _cyl(sc, (2, 0.3, -3), 0.25, 1.0, (0.95, 0.75, 0.2))
            _cyl(sc, (2, 1.3, -3), 0.7, 0.8, (0.95, 0.75, 0.2))


# ----------------------------------------------------------------- characters
def _crowd(key, v, ch):
    e = Engine.get()
    if not hasattr(e, "lp_crowds"):
        e.lp_crowds = {}
    if key not in e.lp_crowds:
        rng = np.random.default_rng(abs(hash(key)) % 2**32)
        n = int(v.get("crowd", 0))
        act = v.get("action", "run")
        clip = ch.find_clip(CLIP.get(act, "idle"))
        cheer = ch.find_clip("jump")
        c = Crowd(ch, skin=None)
        if n:
            pos = grid_crowd(n, -16, 16, -40, -6, rng)
            clips = [clip if (i % 4 or act != "cheer") else cheer for i in range(n)]
            c.place(pos, rng.uniform(-0.3, 0.3, n) + (0 if act in ("run", "push", "carry") else math.pi * 0),
                    rng.uniform(0.92, 1.08, n), [PALETTE[int(rng.integers(8))] for _ in range(n)], clips,
                    (np.arange(n) % 8) * 0.137)
        hero = Crowd(ch, skin=None)
        hero.place([(0, 0, 0)], [0.0], [1.0], [(0.98, 0.78, 0.2)], [clip], [0.0])
        e.lp_crowds[key] = (c, hero)
    return e.lp_crowds[key]


def _camera(shot, p, t, act):
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


def render(v, t, p, variant):
    """One low-poly frame (RGB PIL, 1080x1920, upscaled from 540x960)."""
    ch = character.load(CHAR)
    act = v.get("action", "run")
    key = (v.get("set"), act, int(v.get("crowd", 0)), id(v))
    crowd, hero = _crowd(key, v, ch)
    shot = v.get("shot") or SHOTS[variant % len(SHOTS)]
    eye, tgt, fov = _camera(shot, p, t, act)
    sc = Scene(look(v.get("set", "field")), eye, tgt, fov=fov, aperture=0.0)
    sc.size, sc.vignette, sc.shift, sc.shift_x = SIZE, 0.12, 0.0, 0.0
    rng = np.random.default_rng(7)
    build_set(sc, v.get("set", "field"), rng)
    add_props(sc, v.get("props"), t, np.random.default_rng(11))
    # the crowd and hero move together (crowd behind); one draw per animation phase group
    dz = t * (3.2 if act == "run" else 1.4 if act in ("push", "carry") else 0.0)
    m = trs((0, 0, dz))
    sc.customs.append(_shifted(crowd, t, m))
    sc.customs.append(_shifted(hero, t, m))
    if act == "push":
        _box(sc, (0, 0.5, dz + 0.9), (0.9, 0.7, 1.1), (0.75, 0.78, 0.82))
    if act == "carry":
        _box(sc, (0, 1.05, dz + 0.45), (0.6, 0.45, 0.45), (0.8, 0.6, 0.38), shadow=False)
    img = Image.fromarray(sc.render()).resize((1080, 1920), Image.BILINEAR)
    return img


def _shifted(crowd, t, m):
    draw = crowd.drawer(t)

    def fn(e, vp, sc):
        draw(e, vp @ m, sc)
    return fn
