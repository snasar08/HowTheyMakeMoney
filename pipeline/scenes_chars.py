"""Code-rendered animated character scenes (CC0 characters, see assets/characters/CREDITS.md).
Test set for Costco: shopper with cart, cashier, warehouse worker. Each returns an RGB PIL image.

  python -m pipeline.scenes_chars out/compare/001-costco-code-characters.mp4   # 9 s sample
"""
from __future__ import annotations

import math
import subprocess
import sys
import time

import numpy as np
from PIL import Image

from . import character
from .gl3d import Engine, Scene, run3d, trs
from .scene3d import look_for

CHAR = "quaternius-animated-human"
BOX_COLS = [(0.85, 0.62, 0.38), (0.78, 0.55, 0.32), (0.92, 0.88, 0.80), (0.35, 0.55, 0.85), (0.85, 0.3, 0.3),
            (0.95, 0.8, 0.3), (0.4, 0.7, 0.45)]


def _box(sc, pos, size, col, ry=0.0, shadow=False, spec=0.2):
    sc.add(Engine.get().meshes["box"], trs(pos, size, ry=ry), col, spec=spec, gloss=20,
           shadow=(pos[0], pos[2], size[0] * 0.6, size[2] * 0.6) if shadow else None)


def _shelf(sc, x, z0, z1, rng, levels=4):
    """Warehouse rack: orange uprights, grey shelves, stacked bulk boxes."""
    for z in np.arange(z0, z1 + 0.01, 2.4):
        for dz in (-0.05, 1.15):
            _box(sc, (x, 0, z + dz), (0.12, 4.6, 0.12), (0.95, 0.45, 0.1))
    for lv in range(levels):
        y = 0.15 + lv * 1.15
        _box(sc, (x, y, (z0 + z1) / 2 + 0.55), (1.2, 0.06, z1 - z0 + 1.3), (0.55, 0.56, 0.6))
        for z in np.arange(z0, z1 + 0.6, 0.62):
            if rng.random() < 0.85:
                h = rng.uniform(0.45, 0.95)
                _box(sc, (x + rng.uniform(-0.1, 0.1), y + 0.06, z + 0.3), (1.0, h, 0.55),
                     BOX_COLS[int(rng.integers(len(BOX_COLS)))])


def _cart(sc, pos, ry, fill_rng):
    """Shopping cart from thin boxes: basket rims, handle, wheels, a load of goods."""
    x, y, z = pos
    m = lambda dx, dy, dz: (x + math.cos(ry) * dx + math.sin(ry) * dz, y + dy, z - math.sin(ry) * dx + math.cos(ry) * dz)
    steel = (0.78, 0.8, 0.84)
    for dy in (0.55, 1.05):
        for dx, dz, sx, sz in ((0, -0.45, 0.62, 0.03), (0, 0.45, 0.62, 0.03), (-0.31, 0, 0.03, 0.9), (0.31, 0, 0.03, 0.9)):
            _box(sc, m(dx, dy, dz), (sx, 0.03, sz), steel, ry=ry, spec=0.8)
    for dx, dz in ((-0.31, -0.45), (0.31, -0.45), (-0.31, 0.45), (0.31, 0.45)):
        _box(sc, m(dx, 0.1, dz), (0.03, 0.95, 0.03), steel, ry=ry, spec=0.8)
        _box(sc, m(dx, 0.0, dz), (0.06, 0.1, 0.1), (0.15, 0.15, 0.15), ry=ry)
    _box(sc, m(0, 1.1, -0.62), (0.7, 0.05, 0.05), (0.85, 0.15, 0.15), ry=ry)  # red handle
    for k in range(7):  # goods
        _box(sc, m(fill_rng[k, 0] * 0.4, 0.6 + fill_rng[k, 1] * 0.35, fill_rng[k, 2] * 0.6),
             (0.25 + 0.1 * fill_rng[k, 1], 0.22 + 0.15 * fill_rng[k, 0] ** 2, 0.25), BOX_COLS[k % len(BOX_COLS)], ry=ry + k)


def shopper(theme, tname, t, p):
    L = {**look_for(theme, tname), "grid": 0.0, "floor": (0.78, 0.78, 0.8), "fog": (0.93, 0.9, 0.86),
         "fog_near": 14, "fog_far": 40}
    ch = character.load(CHAR)
    walk = ch.find_clip("walk")
    z = -1.5 + t * 1.25  # walking toward camera
    sc = Scene(L, (2.8 - 0.6 * p, 2.3, z + 7.5), (0, 1.3, z), fov=40, aperture=0.6)
    sc.shift = 0.08
    rng = np.random.default_rng(3)
    _shelf(sc, -2.6, -14, 10, rng)
    _shelf(sc, 2.9, -14, 10, rng)
    character.draw(sc, ch, walk, t, pos=(0, 0, z), ry=0.0, scale=1.0, key="shopper")
    _cart(sc, (0, 0, z + 1.05), 0.0, np.random.default_rng(5).random((8, 3)))
    return Image.fromarray(sc.render())


def cashier(theme, tname, t, p):
    L = {**look_for(theme, tname), "grid": 0.0, "floor": (0.82, 0.8, 0.78), "fog": (0.93, 0.9, 0.86),
         "fog_near": 12, "fog_far": 36}
    ch = character.load(CHAR)
    work = ch.find_clip("work", "idle")
    sc = Scene(L, (3.4 - 1.0 * p, 2.6, 5.8 - 0.6 * p), (0, 1.2, 0), fov=38, aperture=0.6)
    sc.shift = 0.08
    _box(sc, (0, 0, 0.9), (3.6, 0.95, 0.8), (0.3, 0.32, 0.36), shadow=True)       # checkout counter
    _box(sc, (0, 0.95, 0.9), (3.4, 0.03, 0.6), (0.12, 0.12, 0.12))                 # conveyor belt
    for k in range(5):                                                             # items riding the belt
        x = ((t * 0.6 + k * 0.7) % 3.4) - 1.7
        _box(sc, (x, 0.98, 0.9), (0.3, 0.25 + 0.1 * (k % 2), 0.3), BOX_COLS[k], ry=k)
    _box(sc, (1.25, 0.98, 0.5), (0.45, 0.3, 0.35), (0.85, 0.85, 0.88))             # register
    _box(sc, (1.25, 1.3, 0.48), (0.4, 0.28, 0.04), (0.2, 0.55, 0.9), spec=0.9)     # screen
    character.draw(sc, ch, work, t, pos=(0.6, 0, 0.0), ry=0.0, key="cashier", tint=None)
    character.draw(sc, ch, ch.find_clip("idle"), t + 0.7, pos=(-0.6, 0, 2.1), ry=math.pi, key="customer")
    return Image.fromarray(sc.render())


def worker(theme, tname, t, p):
    L = {**look_for(theme, tname), "grid": 0.0, "floor": (0.7, 0.7, 0.72), "fog": (0.9, 0.88, 0.84),
         "fog_near": 14, "fog_far": 40}
    ch = character.load(CHAR)
    work = ch.find_clip("work", "punch", "idle")
    ang = -0.5 + 0.6 * p
    sc = Scene(L, (math.sin(ang) * 7, 2.6, math.cos(ang) * 7), (0, 1.4, 0), fov=40, aperture=0.6)
    sc.shift = 0.08
    rng = np.random.default_rng(11)
    for px, pz in ((-1.8, -1.0), (1.7, -1.4), (-0.4, -3.0)):                       # pallets stacked high
        _box(sc, (px, 0, pz), (1.3, 0.15, 1.3), (0.7, 0.55, 0.35), shadow=True)
        for lv in range(int(3 + rng.integers(3))):
            _box(sc, (px, 0.15 + lv * 0.6, pz), (1.2, 0.58, 1.2), BOX_COLS[(lv + int(px * 3)) % 3])
    lift = 0.4 + 0.25 * math.sin(t * 3.2)                                          # the box being moved
    _box(sc, (0.55, lift, 0.55), (0.6, 0.5, 0.6), BOX_COLS[0], shadow=True)
    character.draw(sc, ch, work, t, pos=(0, 0, 0.1), ry=0.4, key="worker")
    return Image.fromarray(sc.render())


SCENES = {"shopper": shopper, "cashier": cashier, "worker": worker}


def sample(out: str, theme_name="bold_bright", seconds=3.0, fps=30):
    from .themes import get_theme
    th = get_theme(theme_name)
    n = int(seconds * fps)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1080x1920",
           "-r", str(fps), "-i", "-", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    for name, fn in SCENES.items():
        for f in range(n):
            proc.stdin.write(run3d(fn, th, theme_name, f / fps, f / n).tobytes())
    proc.stdin.close()
    proc.wait()
    ms = (time.time() - t0) / (n * len(SCENES)) * 1000
    print(f"[chars] {n * len(SCENES)} frames, {ms:.0f} ms/frame -> {out}")
    return ms


if __name__ == "__main__":
    sample(sys.argv[1] if len(sys.argv) > 1 else "out/compare/001-costco-code-characters.mp4")
