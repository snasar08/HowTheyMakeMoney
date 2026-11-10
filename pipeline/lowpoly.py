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
The hero's look comes from the script's "hero" (pipeline/lp_hero.py): recognisable hair, beard and
plain-color clothes, always a stylised cartoon; never a logo, crest, number or real jersey design.
"""
from __future__ import annotations

import math
import zlib

import numpy as np
from PIL import Image, ImageFilter

from . import character, lp_hero
from .crowd import Crowd, grid_crowd
from .gl3d import Engine, Scene, trs

SIZE = (540, 960)
CHAR = "quaternius-animated-human"
CLIP = {"run": "run", "push": "walk", "carry": "walk", "cheer": "jump", "fall": "death", "work": "working", "idle": "idle"}
# Nov 10 (Sam: "the low poly has no background"): every set has a real sky (gradient, sun or moon,
# clouds, stars), far scenery, and is dressed front and back. top/mid/fog = sky colors from straight
# up down to the horizon (fog = horizon = distance haze); sun = direction TO the sun/moon.
_DAY = dict(top=(0.2, 0.47, 0.9), mid=(0.48, 0.72, 0.97), fog=(0.8, 0.9, 0.99), sun=(-0.35, 0.5, -0.8),
            sun_col=(1.0, 0.97, 0.85), sun_size=0.045, stars=0.0, clouds=0.75, cloud_col=(1.0, 1.0, 1.0))
_DUSK = dict(top=(0.16, 0.2, 0.5), mid=(0.86, 0.47, 0.5), fog=(1.0, 0.72, 0.45), sun=(0.25, 0.13, -0.96),
             sun_col=(1.0, 0.82, 0.5), sun_size=0.075, stars=0.0, clouds=0.6, cloud_col=(1.0, 0.72, 0.62),
             key_col=(1.0, 0.8, 0.62))
_NIGHT = dict(top=(0.02, 0.03, 0.12), mid=(0.07, 0.09, 0.3), fog=(0.2, 0.19, 0.42), sun=(-0.4, 0.55, -0.73),
              sun_col=(0.92, 0.95, 1.0), sun_size=0.035, stars=1.0, clouds=0.25, cloud_col=(0.3, 0.3, 0.52))
_HALL = dict(sun=(0, -1, 0), sun_size=0.0, stars=0.0, clouds=0.0, cloud_col=(1, 1, 1), sun_col=(1, 1, 1))
SETS = {
    "field": dict(_DAY, floor=(0.36, 0.64, 0.3)),
    "store": dict(_HALL, top=(0.8, 0.82, 0.86), mid=(0.9, 0.91, 0.94), fog=(0.95, 0.95, 0.97), floor=(0.82, 0.82, 0.85)),
    "warehouse": dict(_HALL, top=(0.42, 0.45, 0.5), mid=(0.62, 0.65, 0.7), fog=(0.78, 0.8, 0.84), floor=(0.62, 0.62, 0.64)),
    "city": dict(_DUSK, floor=(0.42, 0.44, 0.48)),
    "office": dict(_HALL, top=(0.72, 0.78, 0.88), mid=(0.84, 0.88, 0.95), fog=(0.9, 0.93, 0.98), floor=(0.7, 0.62, 0.52)),
    "stage": dict(_HALL, top=(0.02, 0.02, 0.06), mid=(0.08, 0.05, 0.18), fog=(0.16, 0.1, 0.3), floor=(0.18, 0.16, 0.24)),
    # famous-people worlds (Nov 1): the setting hints who it is; the hero's look does the rest (lp_hero)
    "court": dict(_HALL, top=(0.03, 0.03, 0.06), mid=(0.08, 0.08, 0.14), fog=(0.17, 0.17, 0.26), floor=(0.78, 0.55, 0.32)),
    "pitch": dict(_NIGHT, floor=(0.24, 0.55, 0.26)),
    "studio": dict(_HALL, top=(0.03, 0.03, 0.05), mid=(0.07, 0.06, 0.1), fog=(0.13, 0.11, 0.17), floor=(0.2, 0.18, 0.2)),
    "gaming": dict(_HALL, top=(0.03, 0.02, 0.08), mid=(0.08, 0.05, 0.16), fog=(0.15, 0.09, 0.26), floor=(0.16, 0.14, 0.2)),
    "launch": dict(_DUSK, floor=(0.62, 0.56, 0.48), top=(0.2, 0.3, 0.62), mid=(0.95, 0.6, 0.45), sun=(-0.5, 0.1, -0.86)),
}
PALETTE = [(0.95, 0.35, 0.3), (0.3, 0.55, 0.95), (0.98, 0.8, 0.25), (0.35, 0.75, 0.45), (0.8, 0.45, 0.85),
           (0.95, 0.6, 0.3), (0.3, 0.8, 0.85), (0.92, 0.92, 0.92)]
SKINS = ("LightSkin", "LightSkin1", "LightSkin2", "DarkSkin", "DarkSkin1", "DarkSkin2")
# the pack's people recolored so a crowd is not two shirt colors (skin-hair-shirt-pants)
CROWD_SKINS = SKINS + tuple(f"LightSkin#{s}-{h}-{a}-{b}" for s, h, a, b in (
    ("ffd19f", "2b2118", "e8554e", "2f3b52"), ("e0ac7e", "1c1c1c", "f2c230", "3a3a3a"),
    ("a8744a", "141414", "f4f4f4", "1d3f8f"), ("6b4a32", "101010", "8e5bd0", "24262e"),
    ("ffd19f", "c9a45a", "35b0a0", "5a4636"), ("e0ac7e", "5a3a20", "f08a3c", "2c4a3a"),
    ("a8744a", "2a1a10", "5aa2f0", "e8e2d4"), ("ffd19f", "8a3a1c", "f4f4f4", "8a2c2c")))
INDOOR = ("store", "warehouse", "office", "stage", "court", "studio", "gaming")


def look(set_name):
    st = SETS.get(set_name, SETS["field"])
    night = set_name in ("pitch", "stage", "court", "studio", "gaming")
    L = dict(st, grid=0.0, sky=(0.8, 0.84, 1.0) if night else (1.0, 1.0, 1.0), ground=(0.45, 0.42, 0.4),
             rim=(0.25, 0.25, 0.25), key_dir=(-0.45, -1.0, -0.5), fog_near=45, fog_far=150, floor_radius=120)
    if set_name in INDOOR:
        L.update(fog_near=55, fog_far=170)
    return L


class _Col:
    """Collects a set's static pieces once; render() replays them every frame."""
    def __init__(self):
        self.items, self.blobs = [], []

    def add(self, mesh, model, color, tex=None, spec=0.35, gloss=40.0, emissive=0.0, alpha=1.0, unlit=False, shadow=None):
        self.items.append((mesh, model, color, tex, spec, gloss, emissive, alpha, unlit))
        if shadow:
            self.blobs.append(shadow)


def _box(sc, pos, size, col, ry=0.0, shadow=True):
    sc.add(Engine.get().meshes["box"], trs(pos, size, ry=ry), col, spec=0.05, gloss=8,
           shadow=(pos[0], pos[2], size[0] * 0.6, size[2] * 0.6) if shadow else None)


def _cyl(sc, pos, r, h, col, shadow=True):
    sc.add(Engine.get().meshes["cyl"], trs(pos, (r, h, r)), col, spec=0.1, gloss=10,
           shadow=(pos[0], pos[2], r, r) if shadow else None)


def _glow(sc, pos, size, col, ry=0.0):
    sc.add(Engine.get().meshes["box"], trs(pos, size, ry=ry), col, unlit=True)


def _sph(sc, pos, size, col):
    sc.add(Engine.get().meshes["sphere"], trs(pos, size), col, spec=0.05, gloss=8)


def _tree(sc, x, z, h=4.0, col=(0.25, 0.55, 0.28)):
    _cyl(sc, (x, 0, z), 0.16 * h / 4, h * 0.45, (0.42, 0.3, 0.2), shadow=False)
    _sph(sc, (x, h * 0.62, z), (h * 0.3, h * 0.3, h * 0.3), col)
    _sph(sc, (x + h * 0.12, h * 0.85, z - h * 0.08), (h * 0.21, h * 0.21, h * 0.21), tuple(min(1, c * 1.15) for c in col))


def _lamp(sc, x, z, h=5.0, col=(1.0, 0.9, 0.65)):
    _cyl(sc, (x, 0, z), 0.07, h, (0.2, 0.2, 0.23), shadow=False)
    _glow(sc, (x, h, z), (0.5, 0.18, 0.5), col)


def _lines(sc, pts, col=(0.97, 0.97, 0.97), y=0.006):
    for x, z, sx, sz in pts:
        _box(sc, (x, y, z), (sx, 0.012, sz), col, shadow=False)


def _stands(sc, half, rng, fans=True, z0=-52, z1=52, tiers=7, ends=None):
    """Tiered seats on both long sides (and behind each end line), a scatter of colored fans (boxes),
    a roof with a strip of lights. ends = z of the end lines."""
    seat = (0.26, 0.27, 0.34)
    for side in (-1, 1):
        for k in range(tiers):
            x = side * (half + 2 + k * 1.3)
            _box(sc, (x, 0, (z0 + z1) / 2), (1.3, 0.8 * (k + 1), z1 - z0), seat, shadow=False)
            if fans:
                for z in np.arange(z0 + 0.8, z1, 1.5):
                    if rng.random() < 0.72:
                        _box(sc, (x, k * 0.8 + 0.8, z), (0.45, 0.62, 0.45), PALETTE[int(rng.integers(8))], shadow=False)
        xr = side * (half + 2 + tiers * 1.3 + 0.6)
        _box(sc, (xr, 0, (z0 + z1) / 2), (1.0, tiers * 0.8 + 5.5, z1 - z0), (0.16, 0.17, 0.22), shadow=False)      # back wall
        _box(sc, (xr - side * 3.6, tiers * 0.8 + 5.2, (z0 + z1) / 2), (8.2, 0.35, z1 - z0), (0.2, 0.21, 0.27), shadow=False)  # roof
        for z in np.arange(z0 + 3, z1, 6):
            _glow(sc, (xr - side * 7.4, tiers * 0.8 + 4.95, z), (0.3, 0.2, 2.6), (1.0, 0.98, 0.9))
        for i, z in enumerate(np.arange(z0 + 3, z1 - 2, 6)):                                                       # plain ad boards
            _glow(sc, (side * (half + 0.9), 0.0, z), (0.12, 0.85, 5.6), tuple(0.8 * c for c in PALETTE[(i * 3 + (side > 0)) % 7]))
    for ze in ends or ():
        s = 1 if ze > 0 else -1
        for k in range(tiers - 1):
            z = ze + s * (6 + k * 1.3)
            _box(sc, (0, 0, z), (2 * half + 4, 0.8 * (k + 1), 1.3), seat, shadow=False)
            if fans:
                for x in np.arange(-half - 1, half + 1, 1.5):
                    if rng.random() < 0.72:
                        _box(sc, (x, k * 0.8 + 0.8, z), (0.45, 0.62, 0.45), PALETTE[int(rng.integers(8))], shadow=False)
        _box(sc, (0, 0, ze + s * (6 + tiers * 1.3)), (2 * half + 30, tiers * 0.8 + 5.5, 1.0), (0.16, 0.17, 0.22), shadow=False)
        _glow(sc, (0, tiers * 0.8 + 1.2, ze + s * (5.6 + tiers * 1.3)), (11, 3.6, 0.2), (0.16, 0.5, 0.95))        # scoreboard (no text)
        _glow(sc, (0, tiers * 0.8 + 2.4, ze + s * (5.45 + tiers * 1.3)), (9.5, 0.5, 0.2), (1.0, 0.85, 0.2))


def _floodlights(sc, xs, zs, h=24):
    for x in xs:
        for z in zs:
            _cyl(sc, (x, 0, z), 0.35, h, (0.34, 0.35, 0.4), shadow=False)
            for r in range(3):
                for c in range(-2, 3):
                    _glow(sc, (x + c * 0.9, h + r * 0.9, z), (0.7, 0.7, 0.7), (1.0, 1.0, 0.92))


def _hall(sc, half_x, z0, z1, wall, h=9.0, lights=True):
    """Indoor shell: side walls, back and front walls, rows of hanging light panels (no solid ceiling:
    the sun still lights the room and the 'sky' reads as a bright or dark ceiling)."""
    dark = tuple(c * 0.82 for c in wall)
    for side in (-1, 1):
        _box(sc, (side * half_x, 0, (z0 + z1) / 2), (0.4, h, z1 - z0), wall, shadow=False)
        _box(sc, (side * (half_x - 0.25), 0, (z0 + z1) / 2), (0.12, 1.0, z1 - z0), dark, shadow=False)
    for z in (z0, z1):
        _box(sc, (0, 0, z), (2 * half_x, h, 0.4), wall, shadow=False)
    if lights:
        for z in np.arange(z0 + 4, z1 - 2, 7):
            for x in np.linspace(-half_x * 0.6, half_x * 0.6, 3 if half_x > 9 else 2):
                _glow(sc, (x, h - 0.6, z), (2.6, 0.12, 0.7), (1.0, 1.0, 0.96))
                _box(sc, (x, h - 0.48, z), (2.8, 0.1, 0.9), (0.3, 0.3, 0.33), shadow=False)
    for z in np.arange(z0 + 2, z1, 7):
        _box(sc, (0, h - 0.2, z), (2 * half_x, 0.25, 0.3), dark, shadow=False)


# ----------------------------------------------------------------- sets + props (all code-built)
def build_set(sc, name, rng, fans=True):
    if name == "field":                            # sunny sports ground: stripes, stands, trees, hills
        for i, z in enumerate(np.arange(-70, 70, 7.0)):
            if i % 2:
                _box(sc, (0, 0.004, z), (44, 0.008, 7.0), (0.42, 0.7, 0.34), shadow=False)
        _lines(sc, [(0, z, 44, 0.22) for z in np.arange(-63, 64, 14)] + [(x, 0, 0.22, 140) for x in (-22, 22)])
        _stands(sc, 23, rng, fans, z0=-60, z1=60, tiers=5)
        for side in (-1, 1):
            for z in np.arange(-66, 66, 9):
                _tree(sc, side * (46 + float(rng.uniform(0, 5))), z + float(rng.uniform(-2, 2)), float(rng.uniform(6, 9)))
        for x, z, s in ((-50, -110, 34), (10, -125, 44), (60, -105, 30), (-15, 118, 40), (45, 112, 30)):
            _sph(sc, (x, -6, z), (s * 1.5, s * 0.5, s), (0.36, 0.6, 0.36))
        for z in (-70, 70):
            for x in np.arange(-22, 23, 4.4):
                _box(sc, (x, 0, z), (0.14, 1.4, 0.14), (0.9, 0.9, 0.9), shadow=False)
            _box(sc, (0, 1.2, z), (44, 0.12, 0.1), (0.9, 0.9, 0.9), shadow=False)
        _floodlights(sc, (-36, 36), (-50, 50), 20)
    elif name in ("store", "warehouse"):
        store = name == "store"
        for x in (-16, -9, 9, 16):
            for z in np.arange(-60, 30, 4.5):
                if abs(z + 1) < 4 and abs(x) < 10 and store:
                    continue
                _box(sc, (x, 0, z), (1.6, 3.6 if store else 6.4, 4.2), (0.85, 0.85, 0.88) if store else (0.92, 0.45, 0.12))
                for lv in range(3 if store else 4):
                    for dz in (-1.35, 0, 1.35):
                        _box(sc, (x, 0.35 + lv * (1.1 if store else 1.5), z + dz), (1.75, 0.72 if store else 1.0, 1.1),
                             PALETTE[int(rng.integers(8))] if store else (0.8, 0.62, 0.4), shadow=False)
        _hall(sc, 21, -66, 36, (0.93, 0.93, 0.95) if store else (0.72, 0.74, 0.78), h=8.0 if store else 11.0)
        if store:
            for i, x in enumerate(np.arange(-17, 18, 5.6)):                    # plain color banners, back wall
                _glow(sc, (x, 4.6, -65.7), (4.6, 2.2, 0.1), PALETTE[i % 7])
            for x in (-4.4, 4.4):                                              # checkout desks + screens
                _box(sc, (x, 0, -1.6), (3.2, 1.0, 1.1), (0.3, 0.32, 0.38))
                _glow(sc, (x + 0.9, 1.0, -1.6), (0.5, 0.42, 0.08), (0.4, 0.9, 0.6))
            for i, z in enumerate(np.arange(-60, 30, 2.0)):                    # checker floor tiles
                if i % 2:
                    _box(sc, (0, 0.003, z), (15.5, 0.006, 2.0), (0.76, 0.78, 0.84), shadow=False)
        else:
            for x in (-12.5, -4.0, 4.0, 12.5):                                 # lane lines + pallets
                _lines(sc, [(x - 1.6, -15, 0.18, 96), (x + 1.6, -15, 0.18, 96)], (0.98, 0.8, 0.15))
            for i, x in enumerate(np.arange(-15, 16, 10)):                     # roller doors, back wall
                _box(sc, (x, 0, -65.6), (7, 6.2, 0.2), PALETTE[(i * 2 + 1) % 7], shadow=False)
            for k in range(26):
                x, z = float(rng.choice([-6.4, 6.4])) + float(rng.uniform(-0.5, 0.5)), float(rng.uniform(-58, 28))
                for lv in range(int(rng.integers(1, 4))):
                    _box(sc, (x, lv * 0.92, z), (1.2, 0.9, 1.2), (0.78, 0.6, 0.38), shadow=lv == 0)
            _box(sc, (7.2, 0.25, -10), (1.3, 1.1, 2.2), (0.98, 0.76, 0.1))    # forklift
            _box(sc, (7.2, 1.35, -10.5), (1.2, 1.2, 1.0), (0.2, 0.2, 0.22), shadow=False)
            _box(sc, (7.2, 0, -8.6), (1.0, 3.2, 0.12), (0.25, 0.25, 0.28), shadow=False)
    elif name == "city":                           # sunset street: shops, lamps, trees, parked cars, skyline
        _box(sc, (0, 0.006, -10), (9, 0.012, 170), (0.27, 0.28, 0.32), shadow=False)
        _lines(sc, [(0, z, 0.25, 3.0) for z in np.arange(-92, 72, 7.0)], (0.98, 0.86, 0.3), 0.012)
        _lines(sc, [(x, 6.0, 0.7, 3.4) for x in np.arange(-3.8, 4, 1.25)], (0.94, 0.94, 0.94), 0.012)
        for side in (-1, 1):
            _box(sc, (side * 7.2, 0, -10), (5.4, 0.22, 170), (0.62, 0.62, 0.66), shadow=False)
            for z in np.arange(-92, 72, 9.5):
                h = float(rng.uniform(9, 30))
                w = float(rng.uniform(7.5, 9.2))
                x = side * (10.2 + w / 2)
                col = tuple(float(c) for c in rng.uniform(0.42, 0.78, 3))
                _box(sc, (x, 0, z), (w, h, 8.6), col, shadow=False)
                _box(sc, (x, h, z), (w * 0.6, 1.2, 5.0), tuple(c * 0.8 for c in col), shadow=False)
                _glow(sc, (side * 10.12, 0.3, z), (0.1, 2.5, 6.6), (1.0, 0.9, 0.62))                  # lit shop front
                _box(sc, (side * 9.5, 3.0, z), (1.5, 0.22, 7.2), PALETTE[int(rng.integers(7))], shadow=False)  # awning
                for wy in np.arange(4.4, h - 1.2, 2.7):
                    for dz in (-2.7, 0, 2.7):
                        lit = rng.random() < 0.6
                        _glow(sc, (side * 10.14, wy, z + dz), (0.08, 1.3, 1.6), (1.0, 0.86, 0.5) if lit else (0.22, 0.27, 0.4))
            for i, z in enumerate(np.arange(-88, 70, 9.5)):
                (_lamp if i % 2 else _tree)(sc, side * 5.4, z + 4.7, 5.2 if i % 2 else 4.4)
            for z in (-34, -19, 13, 31):
                if rng.random() < 0.8:
                    col = PALETTE[int(rng.integers(8))]
                    _box(sc, (side * 3.5, 0.3, z), (1.8, 0.8, 4.0), col)
                    _box(sc, (side * 3.5, 1.1, z - 0.2), (1.6, 0.62, 2.1), (0.14, 0.17, 0.22), shadow=False)
        for z in (-128, 108):                      # far skyline, in the haze
            for x in np.arange(-110, 111, 13):
                h = float(rng.uniform(22, 62))
                _box(sc, (x + float(rng.uniform(-3, 3)), 0, z + float(rng.uniform(-9, 9))), (10, h, 10),
                     (0.3, 0.3, 0.42), shadow=False)
    elif name == "office":                         # open office: desks, chairs, window wall with a skyline
        for x in (-6, -2, 2, 6):
            for z in np.arange(-24, 22, 4):
                if abs(x) < 3 and -1.5 < z < 6:
                    continue
                _box(sc, (x, 0, z), (2.4, 0.9, 1.2), (0.85, 0.75, 0.6))
                _box(sc, (x, 0.9, z - 0.3), (0.9, 0.6, 0.06), (0.15, 0.18, 0.22), shadow=False)
                _glow(sc, (x, 0.95, z - 0.26), (0.8, 0.5, 0.02), (0.55, 0.78, 1.0))
                _box(sc, (x, 0, z + 1.75), (0.55, 0.5, 0.55), (0.2, 0.22, 0.28), shadow=False)
                _box(sc, (x, 0.5, z + 2.0), (0.55, 0.6, 0.08), (0.2, 0.22, 0.28), shadow=False)
        _hall(sc, 11, -28, 26, (0.93, 0.92, 0.9), h=6.0)
        for side in (-1, 1):
            for z in np.arange(-25, 24, 4.0):      # windows: glowing sky panes with frames
                _glow(sc, (side * 10.75, 1.4, z), (0.06, 3.2, 3.3), (0.62, 0.8, 1.0))
        for x in np.arange(-9.4, 10, 3.75):
            _glow(sc, (x, 1.4, -27.75), (3.3, 3.2, 0.06), (0.62, 0.8, 1.0))
            _box(sc, (x, 1.4, -27.7), (0.3, float(rng.uniform(0.8, 2.6)), 0.05), (0.38, 0.45, 0.62), shadow=False)
        for x, z in ((-9.6, -4), (9.6, -12), (-9.6, 10), (9.6, 4), (-9.6, -20)):
            _cyl(sc, (x, 0, z), 0.32, 0.5, (0.85, 0.85, 0.85))
            _sph(sc, (x, 1.25, z), (0.55, 0.8, 0.55), (0.25, 0.6, 0.32))
        for i, z in enumerate(np.arange(-26, 24, 4)):
            if i % 2:
                _box(sc, (0, 0.003, z), (21, 0.006, 4), (0.64, 0.57, 0.48), shadow=False)
    elif name == "court":                          # indoor arena: full court, hoops, seats all round, lights
        _lines(sc, [(0, 0, 16.2, 0.14), (0, -22, 16.2, 0.14), (0, 22, 16.2, 0.14), (-8.1, 0, 0.14, 44), (8.1, 0, 0.14, 44)])
        _cyl(sc, (0, 0.002, 0), 1.9, 0.008, (0.97, 0.97, 0.97), shadow=False)
        _cyl(sc, (0, 0.003, 0), 1.76, 0.009, (0.72, 0.2, 0.2), shadow=False)
        for s in (-1, 1):
            _box(sc, (0, 0.003, s * 19.1), (4.9, 0.006, 5.8), (0.72, 0.2, 0.2), shadow=False)
            _lines(sc, [(-2.45, s * 19.1, 0.12, 5.8), (2.45, s * 19.1, 0.12, 5.8), (0, s * 16.2, 4.9, 0.12)])
            _box(sc, (0, 0, s * 23.2), (0.3, 3.4, 0.3), (0.2, 0.2, 0.24), shadow=False)
            _box(sc, (0, 3.2, s * 22.6), (0.2, 0.2, 1.3), (0.2, 0.2, 0.24), shadow=False)
            _box(sc, (0, 2.9, s * 21.9), (1.85, 1.1, 0.07), (0.97, 0.97, 0.97), shadow=False)
            _box(sc, (0, 3.08, s * 21.86), (0.6, 0.45, 0.02), (0.9, 0.3, 0.15), shadow=False)
            sc.add(Engine.get().meshes["cyl"], trs((0, 3.05, s * 21.45), (0.23, 0.035, 0.23)), (0.95, 0.4, 0.1))
        _stands(sc, 9.5, rng, fans, z0=-30, z1=30, tiers=8, ends=(-24, 24))
        _box(sc, (0, 12.5, 0), (5, 3.2, 5), (0.1, 0.1, 0.13), shadow=False)            # center scoreboard cube
        for dx, dz in ((0, 2.52), (0, -2.52), (2.52, 0), (-2.52, 0)):
            _glow(sc, (dx, 13.0, dz), (4.4 if dx == 0 else 0.05, 2.2, 0.05 if dx == 0 else 4.4), (0.2, 0.55, 1.0))
        for x in (-7, 0, 7):
            for z in np.arange(-26, 27, 6.5):
                _glow(sc, (x, 17.5, z), (1.6, 0.25, 1.6), (1.0, 1.0, 0.95))
        for s in (-1, 1):                          # benches
            _box(sc, (s * 9.0, 0, -8), (0.6, 0.5, 7), (0.2, 0.3, 0.6), shadow=False)
    elif name == "pitch":                          # soccer at night: stripes, goals, full stadium, floodlights
        for i, z in enumerate(np.arange(-52.5, 52, 7.0)):
            if i % 2:
                _box(sc, (0, 0.004, z + 3.5), (32, 0.008, 7.0), (0.29, 0.62, 0.3), shadow=False)
        _lines(sc, [(0, 0, 32, 0.2), (0, -52, 32, 0.2), (0, 52, 32, 0.2), (-16, 0, 0.2, 104), (16, 0, 0.2, 104)])
        _cyl(sc, (0, 0.006, 0), 4.6, 0.01, (0.97, 0.97, 0.97), shadow=False)
        _cyl(sc, (0, 0.007, 0), 4.42, 0.011, (0.24, 0.55, 0.26), shadow=False)
        for s in (-1, 1):
            _lines(sc, [(-9, s * 44, 0.2, 16), (9, s * 44, 0.2, 16), (0, s * 36, 18.2, 0.2)])
            for x in (-3.66, 3.66):
                _box(sc, (x, 0, s * 52), (0.16, 2.44, 0.16), (0.97, 0.97, 0.97), shadow=False)
                _box(sc, (x, 0, s * 54), (0.08, 2.0, 0.08), (0.9, 0.9, 0.9), shadow=False)
            _box(sc, (0, 2.44, s * 52), (7.5, 0.16, 0.16), (0.97, 0.97, 0.97), shadow=False)
            for y in np.arange(0.4, 2.3, 0.45):    # net
                _box(sc, (0, y, s * 54), (7.3, 0.03, 0.03), (0.92, 0.92, 0.92), shadow=False)
            for x in np.arange(-3.3, 3.4, 0.55):
                _box(sc, (x, 0, s * 54), (0.03, 2.1, 0.03), (0.92, 0.92, 0.92), shadow=False)
            for x in (-16, 16):
                _box(sc, (x, 0, s * 52), (0.05, 1.5, 0.05), (0.95, 0.95, 0.95), shadow=False)
                _box(sc, (x + 0.2, 1.2, s * 52), (0.4, 0.3, 0.03), (0.95, 0.8, 0.1), shadow=False)
        _stands(sc, 17.5, rng, fans, z0=-60, z1=60, tiers=8, ends=(-52, 52))
        _floodlights(sc, (-34, 34), (-58, 58), 27)
    elif name == "studio":                         # recording studio: desk, speakers, panels, soft lights
        _hall(sc, 9.5, -13, 12, (0.16, 0.15, 0.19), h=6.5, lights=False)
        _box(sc, (0, 0, -6), (5.2, 0.95, 1.5), (0.13, 0.12, 0.15))
        for i, x in enumerate(np.arange(-2.2, 2.3, 0.4)):
            _glow(sc, (x, 0.95, -5.7), (0.22, 0.04, 0.5), PALETTE[i % 7])
        for x in (-5.4, 5.4):
            _box(sc, (x, 0, -7.5), (1.4, 3.2, 1.2), (0.08, 0.08, 0.09))
            for y in (0.95, 2.3):
                _cyl(sc, (x, y, -6.88), 0.42, 0.04, (0.28, 0.28, 0.32), shadow=False)
        for k in range(8):                          # glowing acoustic panels on the back wall
            _glow(sc, (-7.7 + k * 2.2, 1.6 + (k % 3) * 0.7, -12.7), (1.5, 3.4, 0.1), tuple(0.85 * c for c in PALETTE[(k * 3) % 7]))
        for side in (-1, 1):
            for z in np.arange(-10, 10, 3.4):
                _box(sc, (side * 9.2, 0.8 + (int(z) % 2) * 0.5, z), (0.12, 2.6, 2.2), (0.26, 0.2, 0.34), shadow=False)
                _glow(sc, (side * 9.25, 5.6, z), (0.1, 0.12, 3.0), (0.95, 0.3, 0.8) if side < 0 else (0.25, 0.8, 0.95))
            _cyl(sc, (side * 3.6, 0, 2.4), 0.05, 3.2, (0.2, 0.2, 0.22), shadow=False)     # soft boxes
            _glow(sc, (side * 3.6, 3.0, 2.4), (1.3, 1.0, 0.25), (1.0, 0.97, 0.9), ry=-side * 0.5)
        _box(sc, (0, 0.002, -1), (7.5, 0.006, 6), (0.42, 0.16, 0.2), shadow=False)       # rug
    elif name == "gaming":                         # streaming room: desks, monitors, LED strips, shelves
        _hall(sc, 10.5, -14, 12, (0.13, 0.11, 0.2), h=6.5, lights=False)
        for x in (-5, 0, 5):
            _box(sc, (x, 0, -6), (3.6, 1.0, 1.6), (0.12, 0.12, 0.14))
            for dx in (-0.85, 0.85):
                _box(sc, (x + dx, 1.0, -6.45), (1.56, 1.0, 0.07), (0.05, 0.05, 0.06), shadow=False)
                _glow(sc, (x + dx, 1.08, -6.4), (1.44, 0.84, 0.02), (0.35, 0.6, 1.0) if dx < 0 else (0.75, 0.35, 0.95))
            _box(sc, (x + 1.5, 0, -5.4), (0.45, 0.95, 0.9), (0.08, 0.08, 0.1), shadow=False)   # PC tower
            _glow(sc, (x + 1.27, 0.15, -5.4), (0.02, 0.65, 0.7), (0.2, 0.95, 0.7))
            _box(sc, (x, 0, -3.9), (0.7, 0.55, 0.7), (0.75, 0.15, 0.2), shadow=False)          # chair
            _box(sc, (x, 0.55, -3.6), (0.7, 0.95, 0.12), (0.75, 0.15, 0.2), shadow=False)
        _glow(sc, (0, 2.4, -13.7), (9.5, 2.6, 0.1), (0.42, 0.22, 0.85))                       # wall screen
        _glow(sc, (0, 2.75, -13.6), (8.6, 1.9, 0.1), (0.2, 0.75, 0.95))
        for side in (-1, 1):
            for z in np.arange(-12, 11, 4.6):
                _glow(sc, (side * 10.2, 5.4, z), (0.1, 0.14, 4.2), (0.95, 0.2, 0.9) if side < 0 else (0.2, 0.9, 0.95))
                _glow(sc, (side * 10.2, 0.25, z), (0.1, 0.1, 4.2), (0.2, 0.9, 0.95) if side < 0 else (0.95, 0.2, 0.9))
                _box(sc, (side * 9.8, 1.5, z), (0.5, 0.08, 3.0), (0.2, 0.18, 0.28), shadow=False)   # shelf of glowing cubes
                for k in range(4):
                    _glow(sc, (side * 9.8, 1.58, z - 1.1 + k * 0.72), (0.34, 0.34, 0.34), PALETTE[int(rng.integers(7))])
        _box(sc, (0, 0.002, -2), (9, 0.006, 8), (0.2, 0.12, 0.34), shadow=False)
    elif name == "launch":                         # launch site at dawn: pad, tower, tanks, mesas
        _cyl(sc, (-8, 0, -20), 7.5, 0.5, (0.52, 0.52, 0.55))
        _box(sc, (-12.5, 0, -20), (1.6, 19, 1.6), (0.72, 0.3, 0.2))
        for y in np.arange(2, 19, 3.2):
            _box(sc, (-12.5, y, -20), (2.3, 0.2, 2.3), (0.3, 0.3, 0.33), shadow=False)
            _box(sc, (-10.6, y + 0.4, -20), (2.6, 0.14, 0.4), (0.3, 0.3, 0.33), shadow=False)
        _glow(sc, (-12.5, 19.2, -20), (0.5, 0.5, 0.5), (1.0, 0.25, 0.2))
        for x, z, r, h in ((8, -24, 2.4, 6.5), (13.5, -22, 1.8, 5.0), (11, -30, 2.8, 7.5)):
            _cyl(sc, (x, 0, z), r, h, (0.92, 0.92, 0.94))
            _sph(sc, (x, h, z), (r, r * 0.5, r), (0.92, 0.92, 0.94))
        _box(sc, (14, 0, -6), (7, 3.0, 5), (0.78, 0.76, 0.72))                           # control building
        _glow(sc, (10.45, 1.2, -6), (0.06, 1.0, 3.6), (0.55, 0.8, 1.0))
        for x, z, w, h in ((-70, -120, 60, 16), (10, -135, 80, 22), (85, -110, 50, 13), (-30, 110, 70, 15), (60, 120, 60, 18)):
            _box(sc, (x, 0, z), (w, h, 30), (0.72, 0.45, 0.32), shadow=False)
            _box(sc, (x + w * 0.2, h, z), (w * 0.4, h * 0.3, 22), (0.68, 0.42, 0.3), shadow=False)
        for x in np.arange(-26, 27, 4):
            _box(sc, (x, 0, -40), (0.12, 1.6, 0.12), (0.5, 0.5, 0.52), shadow=False)
        _box(sc, (0, 1.3, -40), (52, 0.08, 0.06), (0.5, 0.5, 0.52), shadow=False)
        for x in (-22, 4):
            _lamp(sc, x, -14, 9, (1.0, 1.0, 0.92))
        for k in range(14):
            r = float(rng.uniform(0.3, 0.9))
            _sph(sc, (float(rng.uniform(-30, 30)), 0, float(rng.uniform(-36, 30))), (r, r, r), (0.55, 0.48, 0.4))
    elif name == "stage":                          # arena show: platform, video wall, truss lights, speakers
        _box(sc, (0, 0, -3.5), (20, 1.0, 12), (0.2, 0.18, 0.26))
        _glow(sc, (0, 0.72, 2.52), (20, 0.14, 0.04), (0.95, 0.3, 0.85))
        _box(sc, (0, 1.0, -9.4), (19.6, 8.4, 0.3), (0.05, 0.04, 0.1), shadow=False)       # video wall: plain glowing tiles
        for i, x in enumerate(np.arange(-8.8, 9, 1.6)):
            for j in range(5):
                k = (math.sin(i * 0.9 + j * 1.7) + 1) / 2
                _glow(sc, (x, 1.3 + j * 1.6, -9.2), (1.5, 1.5, 0.1), (0.35 + 0.5 * k, 0.12 + 0.1 * k, 0.75 - 0.25 * k))
        for x in (-10.4, 10.4):
            _box(sc, (x, 1, -8.6), (0.5, 9.5, 0.5), (0.3, 0.3, 0.35), shadow=False)
            for y in np.arange(1.0, 6.5, 1.3):
                _box(sc, (x * 1.2, y, -5.5), (1.8, 1.2, 1.5), (0.07, 0.07, 0.08), shadow=False)
                _cyl(sc, (x * 1.2, y + 0.18, -4.74), 0.42, 0.04, (0.26, 0.26, 0.3), shadow=False)
        _box(sc, (0, 10.4, -8.6), (21.4, 0.5, 0.5), (0.3, 0.3, 0.35), shadow=False)
        _box(sc, (0, 10.4, 1.5), (21.4, 0.4, 0.4), (0.3, 0.3, 0.35), shadow=False)
        for i, x in enumerate(np.arange(-9.5, 10, 1.9)):
            _glow(sc, (x, 10.0, 1.5), (0.5, 0.4, 0.5), PALETTE[(i * 2) % 7])
            _glow(sc, (x, 10.0, -8.2), (0.5, 0.4, 0.5), (1.0, 1.0, 0.95))
        for side in (-1, 1):                       # stands rising at the sides and back of the hall
            for k in range(7):
                _box(sc, (side * (19 + k * 1.4), 0, 14), (1.4, 0.9 * (k + 1), 60), (0.13, 0.12, 0.2), shadow=False)
                for z in np.arange(-12, 42, 2.3):
                    if rng.random() < 0.5:
                        _glow(sc, (side * (19 + k * 1.4), 0.9 * (k + 1) + 0.5, z), (0.12, 0.12, 0.12), (1.0, 1.0, 0.9))   # phone lights
        for k in range(7):
            _box(sc, (0, 0, 34 + k * 1.4), (50, 0.9 * (k + 1), 1.4), (0.13, 0.12, 0.2), shadow=False)
            for x in np.arange(-22, 23, 2.3):
                if rng.random() < 0.5:
                    _glow(sc, (x, 0.9 * (k + 1) + 0.5, 34 + k * 1.4), (0.12, 0.12, 0.12), (1.0, 1.0, 0.9))
        for x in np.arange(-11, 12, 2.2):          # crowd barrier
            _box(sc, (x, 0, 3.2), (2.1, 1.05, 0.08), (0.42, 0.42, 0.46), shadow=False)


_SET_CACHE: dict = {}


def _static_set(name, fans):
    k = (name, fans)
    if k not in _SET_CACHE:
        col = _Col()
        build_set(col, name, np.random.default_rng(7), fans)
        _SET_CACHE[k] = col
    return _SET_CACHE[k]


class _Lifted:
    """Adds pieces raised by y (props on the stage platform)."""
    def __init__(self, sc, y):
        self.sc, self.y = sc, y

    def add(self, mesh, model, color, **kw):
        kw.pop("shadow", None)
        self.sc.add(mesh, trs((0, self.y, 0)) @ model, color, **kw)


def add_props(sc, props, t, rng, y0=0.0):
    if y0:
        sc = _Lifted(sc, y0)
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
            gold = (0.98, 0.78, 0.2)
            _box(sc, (2, 0, -2.6), (0.7, 0.14, 0.7), (0.25, 0.2, 0.18))
            _cyl(sc, (2, 0.14, -2.6), 0.2, 0.1, gold, shadow=False)
            _cyl(sc, (2, 0.24, -2.6), 0.07, 0.42, gold, shadow=False)
            sc.add(Engine.get().meshes["sphere"], trs((2, 0.98, -2.6), (0.36, 0.42, 0.36)), gold, spec=0.5, gloss=30)
            _cyl(sc, (2, 1.0, -2.6), 0.37, 0.34, gold, shadow=False)
            for dx in (-0.46, 0.46):
                _box(sc, (2 + dx, 0.92, -2.6), (0.07, 0.34, 0.07), gold, shadow=False)
                _box(sc, (2 + dx * 0.9, 1.22, -2.6), (0.16, 0.06, 0.07), gold, shadow=False)
                _box(sc, (2 + dx * 0.9, 0.9, -2.6), (0.16, 0.06, 0.07), gold, shadow=False)


# ----------------------------------------------------------------- characters
# what the background people do, by set (Nov 3, Sam: "the 3D models need to make sense with the
# video"): fans in the stands, a line at the counter, people at desks, sidewalks, warehouse aisles.
# A scene can override with visual "crowd_mode"; "runners" is the old run-at-the-camera pack.
MODE_BY_SET = {"court": "audience", "pitch": "audience", "stage": "concert", "studio": "concert",
               "launch": "watch", "store": "queue", "office": "workers", "gaming": "workers",
               "city": "street", "warehouse": "aisles", "field": "runners"}
STANDS = {"court": (9.5, 29), "pitch": (17.5, 58)}   # (half width, half length): must match build_set
HERO_Y = {"stage": 1.0}                               # the hero stands on the platform


def crowd_mode(v):
    return v.get("crowd_mode") or MODE_BY_SET.get(v.get("set"), "runners")


def _face(x, z, tx, tz):
    return math.atan2(tx - x, tz - z)  # characters face +z at yaw 0


def _layout(mode, v, n, rng, act):
    """[((x, y, z), yaw, clip, speed m/s along z or None = follow the hero)] for n background people."""
    out = []
    if mode == "audience":
        half, zl = STANDS.get(v.get("set"), (9.5, 29))
        seats = [(side * (half + 2 + k * 1.3), k * 0.8 + 0.8, z) for side in (-1, 1) for k in range(8)
                 for z in np.arange(-zl + 1, zl, 0.95)]
        # fill the seats nearest the action first, so the stands behind the hero look full
        order = sorted(range(len(seats)), key=lambda i: abs(seats[i][2] - 5) + seats[i][1] * 2 + rng.uniform(0, 14))
        for i in order[:n]:
            x, y, z = seats[i]
            out.append(((x + rng.uniform(-0.15, 0.15), y, z), _face(x, z, 0, z * 0.5),
                        "jump" if rng.random() < 0.45 else "idle", 0.0))
    elif mode in ("concert", "watch"):
        tx, tz = (0, -3) if mode == "concert" else (-8, -20)
        x0, x1, z0, z1 = (-12, 12, 4.2, 24) if mode == "concert" else (-2, 12, -4, 8)
        for (x, _y, z) in grid_crowd(n, x0, x1, z0, z1, rng):
            if mode == "watch" and abs(x) < 3.5:  # keep the camera's lane clear
                x += 7.0 if x >= 0 else -7.0
            out.append(((x, 0, z), _face(x, z, tx, tz), "jump" if rng.random() < 0.5 else "idle", 0.0))
    elif mode == "queue":
        line = min(n, 14)
        for k in range(line):  # a line at the checkout desk, everyone facing it
            out.append(((-4.4 + rng.uniform(-0.1, 0.1), 0, -3.1 - k * 0.95), 0.0, "idle", 0.0))
        for k in range(n - line):  # shoppers walking the aisles both ways
            d = 1 if k % 2 else -1
            out.append(((float(rng.choice([-12.5, 12.5])) + rng.uniform(-1, 1), 0, rng.uniform(-60, 26)),
                        0.0 if d > 0 else math.pi, "walk", 1.2 * d))
    elif mode == "workers":
        if v.get("set") == "office":
            desks = [(x, z + 1.15) for x in (-6, -2, 2, 6) for z in np.arange(-24, 22, 4)
                     if not (abs(x) < 3 and -1.5 < z < 6)]
        else:
            desks = [(x + dx, -4.9) for x in (-5, 0, 5) for dx in (-0.9, 0.9)]
        for x, z in desks[:n]:  # one person at each desk, facing the screen
            out.append(((x, 0, z), math.pi, "working" if rng.random() < 0.4 else "idle", 0.0))
    elif mode == "street":
        for k in range(n):
            d = 1 if k % 2 else -1
            side = float(rng.choice([-1, 1]))
            out.append(((side * rng.uniform(5.9, 9.4), 0.22, rng.uniform(-80, 40)),
                        0.0 if d > 0 else math.pi, "walk", 1.4 * d))
    elif mode == "aisles":
        for k in range(n):
            d = 1 if k % 2 else -1
            out.append(((float(rng.choice([-12.5, -4.0, 4.0, 12.5])) + rng.uniform(-0.6, 0.6), 0, rng.uniform(-55, 25)),
                        0.0 if d > 0 else math.pi, "walk" if rng.random() < 0.8 else "working", 1.1 * d))
    else:  # runners: the pack behind the hero, moving with them
        wide = v.get("set") in ("field", "city", "stage", "court", "pitch")
        w = 3.6 if v.get("set") == "city" else 16 if wide else 6
        for k, (x, y, z) in enumerate(grid_crowd(n, -w, w, -40, -5, rng)):
            c = CLIP.get(act, "idle") if (k % 4 or act != "cheer") else "jump"
            out.append(((x, y, z), float(rng.uniform(-0.3, 0.3)), c, None))
    return out


def hero_spec(v):
    """The hero's look for this scene: the script's "hero" (render.py copies it into every low-poly
    visual), or the old "kit" colors, else the default everyman."""
    hs = v.get("hero")
    if not hs and v.get("kit"):
        hs = dict(outfit="kit", shirt=v["kit"].get("shirt"), pants=v["kit"].get("shorts"))
    return lp_hero.spec(hs)


def _crowd(key, v, ch):
    """([(Crowd, speed or None)], hero). speed None = moves with the hero."""
    e = Engine.get()
    if not hasattr(e, "lp_crowds"):
        e.lp_crowds = {}
    if key not in e.lp_crowds:
        rng = np.random.default_rng(zlib.crc32(repr(key[:3]).encode()))
        n = int(v.get("crowd", 0))
        act = v.get("action", "run")
        clip = ch.find_clip(CLIP.get(act, "idle"))
        # the pack's clothed textures and recolors: skin tones, hair, shirts and pants
        skins = list(CROWD_SKINS)
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
        hs = hero_spec(v)
        hero = Crowd(ch, skin=lp_hero.skin_name(hs))
        hero.place([(0, 0, 0)], [0.0], [float(hs.get("height", 1.0))], [(1, 1, 1)], [clip], [0.0])
        hero.spec, hero.clip = hs, clip
        e.lp_crowds[key] = (cs, hero)
    return e.lp_crowds[key]


_REST = {}


def _hero_extras(sc, ch, hero, t, m):
    """Hair, beard, shoes, shorts... riding on the hero's bones (GL preview; Blender builds its own
    from the same lp_hero list)."""
    if CHAR not in _REST:
        names = [ch.nodes[j].get("name") for j in ch.joints]
        _REST[CHAR] = (names, [np.linalg.inv(x) for x in ch.joint_mats(None, 0.0)])
    names, rest_inv = _REST[CHAR]
    J = ch.joint_mats(hero.clip, t)
    s = float(hero.spec.get("height", 1.0))
    k = 1.75 / ch.height
    base = m @ trs((0, -ch.base_y * k * s, 0), (k * s, k * s, k * s))
    unnorm = trs((0, ch.base_y, 0), (1 / k, 1 / k, 1 / k))
    meshes = Engine.get().meshes
    for bone, mesh, pos, size, col in lp_hero.accessories(hero.spec):
        if bone not in names:
            continue
        b = names.index(bone)
        sc.add(meshes[mesh], base @ J[b] @ rest_inv[b] @ unnorm @ trs(pos, size), col, spec=0.08, gloss=10)


def _ease(p):
    return p * p * (3 - 2 * p)


# Nov 10 (Sam: the editing "sucks"): no more top-down shots of an empty floor. Every shot frames the
# hero against the set; a scene opens on a shot that shows where we are, then cuts closer.
def pick_shot(v, si, b, stat):
    act, crowd = v.get("action", "run"), int(v.get("crowd", 0))
    if si == 0 and b == 0:
        return "hero"                          # the cover frame: the hero, big, in their world
    if act in ("run", "push", "carry"):
        seq = ["side", "low", "front", "wide", "close", "orbit"]
    elif crowd and crowd_mode(v) in ("concert", "watch"):
        seq = ["back", "hero", "wide", "close", "orbit", "low"]
    elif crowd:
        seq = ["wide", "hero", "orbit", "close", "low", "side"]
    else:
        seq = ["orbit", "close", "hero", "low", "side", "crane"]
    if stat:
        seq = [s for s in seq if s != "close"]  # the big number sits where the face would be
    if b == 0:
        return seq[si % 2]
    rest = seq[1:] if si % 2 == 0 else [seq[0]] + seq[2:]
    return rest[(b - 1 + si) % len(rest)]


def _camera(shot, p, hz, hy, lift):
    """(eye, target, fov). hz/hy = where the hero is; lift raises the aim so the hero sits lower in
    the frame, under the big number."""
    p = _ease(p)
    if shot == "hero":
        eye, tgt, fov = (1.0 - 0.7 * p, 1.15, hz + 4.4 - 0.8 * p), (0, 1.2 + lift, hz), 42
    elif shot == "front":
        eye, tgt, fov = (0.3, 1.3, hz + 5.0 - 0.6 * p), (0, 1.15 + lift, hz), 44
    elif shot == "low":
        eye, tgt, fov = (1.5 - 1.1 * p, 0.3, hz + 3.3), (0, 1.45 + lift * 0.5, hz), 52
    elif shot == "close":
        eye, tgt, fov = (0.75 - 0.35 * p, 1.6, hz + 2.15 - 0.25 * p), (0, 1.5, hz), 38
    elif shot == "orbit":
        a = -0.85 + 1.1 * p
        eye, tgt, fov = (math.sin(a) * 4.6, 1.55 + 0.3 * p, hz + math.cos(a) * 4.6), (0, 1.15 + lift, hz), 44
    elif shot == "side":
        eye, tgt, fov = (5.2 - 0.8 * p, 1.25, hz + 1.2), (0, 1.1 + lift, hz + 0.3), 42
    elif shot == "wide":
        eye, tgt, fov = (4.6 - 3.6 * p, 2.9, hz + 8.6 - 0.8 * p), (0, 1.3 + lift, hz - 3), 46
    elif shot == "back":
        eye, tgt, fov = (1.3 - 0.9 * p, 2.7 + 0.3 * p, hz - 4.8), (0, 1.5, hz + 8), 48
    else:  # crane
        eye, tgt, fov = (3.0 - 2 * p, 6.2 - 3.8 * p, hz + 7.4 - 1.8 * p), (0, 1.0 + lift, hz - 1), 46
    return (eye[0], eye[1] + hy, eye[2]), (tgt[0], tgt[1] + hy, tgt[2]), fov


# ----------------------------------------------------------------- sky (GL preview; Blender has its own nodes)
_SKY_VS = """
#version 330
in vec2 in_pos; out vec2 v;
void main() { v = in_pos; gl_Position = vec4(in_pos, 0.99999, 1.0); }"""
_SKY_FS = """
#version 330
uniform mat4 ivp; uniform vec3 eye; uniform vec3 top; uniform vec3 mid; uniform vec3 hor;
uniform vec3 sun; uniform vec3 sun_col; uniform float sun_size; uniform float stars; uniform float clouds;
uniform vec3 cloud_col;
in vec2 v; out vec4 f;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y); }
void main() {
    vec4 w = ivp * vec4(v, 1.0, 1.0);
    vec3 d = normalize(w.xyz / w.w - eye);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.28, h));
    c = mix(c, top, smoothstep(0.2, 0.8, h));
    if (clouds > 0.0) {
        vec2 q = d.xz / (d.y + 0.3) * 1.6;
        float n = vn(q) * 0.55 + vn(q * 2.1) * 0.3 + vn(q * 4.3) * 0.15;
        c = mix(c, cloud_col, smoothstep(0.52, 0.7, n) * clouds * smoothstep(0.03, 0.22, d.y));
    }
    if (stars > 0.0) {
        vec3 g = floor(d * 110.0);
        float r = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        c += vec3(step(0.993, r) * stars * smoothstep(0.05, 0.35, d.y));
    }
    if (sun_size > 0.0) {
        float s = dot(d, normalize(sun));
        c = mix(c, sun_col, smoothstep(cos(sun_size) - 0.0015, cos(sun_size), s));
        c += sun_col * pow(max(s, 0.0), 30.0) * 0.3;
    }
    f = vec4(c, 1.0);
}"""


def _sky(e, vp, sc):
    if not hasattr(e, "lp_sky"):
        prog = e.ctx.program(vertex_shader=_SKY_VS, fragment_shader=_SKY_FS)
        full = np.array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1], np.float32)
        e.lp_sky = (prog, e.ctx.vertex_array(prog, [(e.ctx.buffer(full), "2f", "in_pos")]))
    prog, vao = e.lp_sky
    L = sc.look
    prog["ivp"].write(np.linalg.inv(vp).astype(np.float32).T.tobytes())
    for k_, v in (("eye", sc.eye), ("top", L["top"]), ("mid", L["mid"]), ("hor", L["fog"]), ("sun", L["sun"]),
                  ("sun_col", L["sun_col"]), ("cloud_col", L["cloud_col"])):
        prog[k_].value = tuple(float(x) for x in v)
    prog["sun_size"].value, prog["stars"].value, prog["clouds"].value = L["sun_size"], L["stars"], L["clouds"]
    vao.render()


# ----------------------------------------------------------------- Blender plan (nightly, Nov 3)
# With a key, render() also records the frame's scene: camera, every box/cylinder/sphere (deduped
# into ITEMS), and each crowd group's instances. pipeline/blender_lp.py replays it in Cycles on 20
# GitHub machines; render.py then uses those frames and falls back to this renderer if any are missing.
PLAN: dict = {}
ITEMS: list = []
_ITEM_IDS: dict = {}
CROWDS: list = []   # each crowd's instances once; frames point at them
_CROWD_IDS: dict = {}
_STATIC_IDS: dict = {}


def _item_ids(items):
    names = {id(v): k for k, v in Engine.get().meshes.items()}
    ids = []
    for mesh, model, color, _tex, _spec, _gloss, emis, _alpha, unlit in items:
        it = (names.get(id(mesh), "box"), tuple(round(float(x), 4) for x in np.asarray(model).ravel()),
              tuple(round(float(c), 3) for c in color), bool(unlit) or emis > 0)
        if it not in _ITEM_IDS:
            _ITEM_IDS[it] = len(ITEMS)
            ITEMS.append(it)
        ids.append(_ITEM_IDS[it])
    return ids


def _record(key, sc, placed, t, set_name, static_key, n_static, hero):
    if static_key not in _STATIC_IDS:
        _STATIC_IDS[static_key] = _item_ids(sc.items[:n_static])
    ids = _STATIC_IDS[static_key] + _item_ids(sc.items[n_static:])
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
                     crowds=cids, hero=hero.spec)


def dump_plan(path):
    import json
    from pathlib import Path
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps({"frames": PLAN, "items": ITEMS, "crowds": CROWDS}))
    for d in (PLAN, ITEMS, _ITEM_IDS, CROWDS, _CROWD_IDS, _STATIC_IDS):
        d.clear()


def render(v, t, p, variant, rec=None, beat=None, si=0, stat=False):
    """One low-poly frame (RGB PIL, 1080x1920, upscaled from 540x960). rec (a frame key) records it
    for Blender. beat/si/stat (from render.py) choose the shot; variant is the old fallback."""
    ch = character.load(CHAR)
    act = v.get("action", "run")
    set_name = v.get("set", "field")
    key = (set_name, act, int(v.get("crowd", 0)), id(v))
    crowd, hero = _crowd(key, v, ch)
    shot = v.get("shot") or pick_shot(v, si, variant if beat is None else beat, stat)
    dz = t * (3.2 if act == "run" else 1.4 if act in ("push", "carry") else 0.0)
    hy = HERO_Y.get(set_name, 0.0) if dz == 0.0 else 0.0
    eye, tgt, fov = _camera(shot, p, dz, hy, 0.35 if stat else 0.0)
    # slight handheld sway so held shots never look frozen
    eye = (eye[0] + 0.06 * math.sin(t * 1.7), eye[1] + 0.04 * math.sin(t * 2.3 + 1), eye[2])
    sc = Scene(look(set_name), eye, tgt, fov=fov, aperture=0.0)
    sc.size, sc.vignette, sc.shift, sc.shift_x, sc.far = SIZE, 0.12, 0.0, 0.0, 420.0
    sc.customs.append(_sky)
    fans = not (crowd_mode(v) == "audience" and v.get("crowd"))
    st = _static_set(set_name, fans)
    sc.items.extend(st.items)
    sc.blobs.append((0.0, dz, 0.5, 0.4))
    sc.blobs.extend(st.blobs)
    add_props(sc, v.get("props"), t, np.random.default_rng(11), hy)
    # the crowd and hero move together (crowd behind); one draw per animation phase group
    m = trs((0, hy, dz))
    placed = [(c, trs((0, 0, dz)) if speed is None else trs((0, 0, speed * t))) for c, speed in crowd] + [(hero, m)]
    for c, cm in placed:
        sc.customs.append(_shifted(c, t, cm))
    if act == "push":
        _box(sc, (0, 0.5, dz + 0.9), (0.9, 0.7, 1.1), (0.75, 0.78, 0.82))
    if "ball" in (v.get("props") or []):          # dribbled at the hero's side, moves with them
        sc.add(Engine.get().meshes["sphere"], trs((0.45, hy + 0.12 + abs(math.sin(t * 5)) * 0.4, dz + 0.35), (0.12, 0.12, 0.12)),
               (0.95, 0.95, 0.95) if set_name == "pitch" else (0.95, 0.5, 0.15), spec=0.2, gloss=20)
    if act == "carry":
        _box(sc, (0, 0.82, dz + 0.42), (0.55, 0.38, 0.4), (0.8, 0.6, 0.38), shadow=False)   # at the waist: the face stays clear
    if rec is not None:
        _record(rec, sc, placed, t, set_name, (set_name, fans), len(st.items), hero)
    _hero_extras(sc, ch, hero, t, m)
    img = Image.fromarray(sc.render()).resize((1080, 1920), Image.LANCZOS)
    return img.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))


def _shifted(crowd, t, m):
    draw = crowd.drawer(t)

    def fn(e, vp, sc):
        draw(e, vp @ m, sc)
    return fn
