"""Modular CC0 people (Quaternius "Ultimate Modular Men/Women", assets/characters/people/, Nov 11).

Every model is one shared 62-bone rig with 24 clips and four swappable parts (head, body, legs, feet);
every surface is a named flat-color material (Skin, Hair, Eye, ...). A *look* (lp_hero.look_name) picks
one part per slot from models of the same family and recolors materials, so a hero or a crowd member
is a mix of real modelled hair, faces and clothes instead of one recolored mannequin.

GL side only (numpy). Blender reads the same look strings in pipeline/blender_lp.py.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from . import lp_hero
from .character import CHAR_DIR, Character

DIR = CHAR_DIR / "people"
SLOTS = ("head", "body", "legs", "feet")
_SLOT_OF = {"head": "head", "body": "body", "legs": "legs", "pants": "legs", "feet": "feet"}


@lru_cache(maxsize=None)
def model(name: str) -> Character:
    ch = Character(DIR / f"{name}.glb")
    g = ch.g
    mats = g.get("materials", [])
    ch.part_prims = {s: [] for s in SLOTS}      # slot -> [(prim index, material name)]
    i = 0
    for n in ch.nodes:
        if "mesh" not in n:
            continue
        mesh = g["meshes"][n["mesh"]]
        slot = _SLOT_OF.get(mesh.get("name", "").split("_")[-1].lower())
        for pr in mesh["primitives"]:
            if "JOINTS_0" not in pr["attributes"]:
                continue
            if slot:
                ch.part_prims[slot].append((i, mats[pr["material"]]["name"] if "material" in pr else "?"))
            i += 1
    ch.base_y, ch.height = 0.0, lp_hero.PEOPLE_H   # one size for the whole pack (hats and hair differ per head)
    return ch


def rig(family: str = "m") -> Character:
    """The Character whose clips and bones drive every look of that family."""
    return model(lp_hero.RIG[family])


def srgb(lin):
    return tuple(float(min(1.0, max(0.0, c)) ** (1 / 2.2)) for c in lin[:3])


class Built:
    pass


@lru_cache(maxsize=256)
def build(look: str) -> Built:
    """Vertex data (pos, normal, uv, joints, weights; one row per triangle corner) + palette image."""
    from PIL import Image
    parts, over = lp_hero.parse_look(look)
    fam = parts["head"][0]
    b = Built()
    b.ch = rig(fam)
    cols, rows = [], []
    for slot in SLOTS:
        m = model(parts[slot])
        for pi, mat in m.part_prims[slot]:
            c = lp_hero.look_color(over, slot, mat)
            if c == "-":
                continue
            p = m.prims[pi]
            col = tuple(v / 255 for v in c) if c else srgb(p["color"])
            if col not in cols:
                cols.append(col)
            k = cols.index(col)
            uv = np.tile(np.array([[(k % 8 + 0.5) / 8, 1 - (k // 8 + 0.5) / 8]], np.float32), (len(p["pos"]), 1))
            idx = p["idx"].ravel()
            rows.append(np.concatenate([p["pos"], p["norm"], uv, p["jnt"].astype(np.float32), p["w"]], 1)[idx])
    b.verts = np.concatenate(rows).astype(np.float32)
    im = Image.new("RGB", (256, 256), (128, 128, 128))
    for k, col in enumerate(cols[:64]):
        im.paste(tuple(int(round(v * 255)) for v in col), (k % 8 * 32, k // 8 * 32, k % 8 * 32 + 32, k // 8 * 32 + 32))
    b.palette = im
    return b
