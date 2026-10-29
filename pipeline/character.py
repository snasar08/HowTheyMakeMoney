"""Animated 3D characters from CC0 glTF/GLB files (see assets/characters/CREDITS.md).

A tiny GLB reader (meshes, skin, node hierarchy, animation clips) plus CPU linear-blend skinning
in numpy, drawn through gl3d. Low-poly packs have a few thousand vertices, so skinning costs
~1 ms per character per frame.
"""
from __future__ import annotations

import json
import os
import struct
from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CHAR_DIR = ROOT / "assets" / "characters"
_CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]], np.float32)


def _trs(t, r, s):
    m = np.eye(4, dtype=np.float32)
    m[:3, :3] = _quat_mat(r) * np.asarray(s, np.float32)
    m[:3, 3] = t
    return m


def _slerp(a, b, k):
    d = float(np.dot(a, b))
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        q = a + (b - a) * k
    else:
        th = np.arccos(d)
        q = (np.sin((1 - k) * th) * a + np.sin(k * th) * b) / np.sin(th)
    return q / np.linalg.norm(q)


class Character:
    def __init__(self, path: Path):
        data = Path(path).read_bytes()
        _, _, _ = struct.unpack_from("<III", data, 0)
        jlen, _ = struct.unpack_from("<II", data, 12)
        self.g = json.loads(data[20:20 + jlen])
        blen, _ = struct.unpack_from("<II", data, 20 + jlen)
        self.bin = data[28 + jlen:28 + jlen + blen]
        g = self.g
        self.nodes = g["nodes"]
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get("children", [])}
        self.rest = [(np.array(n.get("translation", [0, 0, 0]), np.float32),
                      np.array(n.get("rotation", [0, 0, 0, 1]), np.float32),
                      np.array(n.get("scale", [1, 1, 1]), np.float32)) for n in self.nodes]
        skin = g["skins"][0]
        self.joints = skin["joints"]
        self.ibm = self._acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        self.prims = []  # (pos, norm, uv, joints, weights, idx, color, image_index)
        for ni, n in enumerate(self.nodes):
            if "mesh" not in n:
                continue
            for pr in g["meshes"][n["mesh"]]["primitives"]:
                a = pr["attributes"]
                mat = g.get("materials", [{}])[pr.get("material", 0)] if g.get("materials") else {}
                pbr = mat.get("pbrMetallicRoughness", {})
                col = pbr.get("baseColorFactor", [1, 1, 1, 1])[:3]
                img = None
                if "baseColorTexture" in pbr:
                    img = g["textures"][pbr["baseColorTexture"]["index"]]["source"]
                self.prims.append(dict(
                    pos=self._acc(a["POSITION"]), norm=self._acc(a["NORMAL"]),
                    uv=self._acc(a["TEXCOORD_0"]) if "TEXCOORD_0" in a else None,
                    jnt=self._acc(a["JOINTS_0"]).astype(np.int32), w=self._acc(a["WEIGHTS_0"]),
                    idx=self._acc(pr["indices"]).astype(np.int32), color=col, image=img))
        self.clips = {}
        for an in g.get("animations", []):
            chans = []
            for ch in an["channels"]:
                smp = an["samplers"][ch["sampler"]]
                chans.append((ch["target"]["node"], ch["target"]["path"], self._acc(smp["input"]).ravel(),
                              self._acc(smp["output"])))
            self.clips[an["name"].split("|")[-1].lower()] = (chans, max(c[2][-1] for c in chans))
        # normalize to meters: packs come in arbitrary units
        ys = np.concatenate([pp[:, 1] for pp, _ in self.pose(None, 0.0)])
        self.base_y, self.height = float(ys.min()), float(ys.max() - ys.min()) or 1.0

    def _acc(self, i):
        a = self.g["accessors"][i]
        bv = self.g["bufferViews"][a["bufferView"]]
        n, nc, dt = a["count"], _NC[a["type"]], _CT[a["componentType"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride")
        size = np.dtype(dt).itemsize * nc
        if stride and stride != size:
            raw = np.frombuffer(self.bin, np.uint8, count=stride * n, offset=off).reshape(n, stride)[:, :size]
            arr = np.frombuffer(raw.tobytes(), dt).reshape(n, nc)
        else:
            arr = np.frombuffer(self.bin, dt, count=n * nc, offset=off).reshape(n, nc)
        if a.get("normalized") and dt != np.float32:
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr.astype(np.float32) if dt == np.float32 else arr

    def image(self, idx):
        from io import BytesIO
        from PIL import Image
        im = self.g["images"][idx]
        bv = self.g["bufferViews"][im["bufferView"]]
        o = bv.get("byteOffset", 0)
        return Image.open(BytesIO(self.bin[o:o + bv["byteLength"]])).convert("RGBA")

    def find_clip(self, *names):
        for want in names:
            for k in self.clips:
                if want in k:
                    return k
        return next(iter(self.clips), None)

    def pose(self, clip: str | None, t: float) -> list[np.ndarray]:
        """Skinned (pos, normal) per primitive at time t (clip loops)."""
        local = [list(r) for r in self.rest]
        if clip and clip in self.clips:
            chans, dur = self.clips[clip]
            tt = t % dur if dur > 0 else 0.0
            for node, path, times, vals in chans:
                k = int(np.clip(np.searchsorted(times, tt) - 1, 0, len(times) - 1))
                k2 = min(k + 1, len(times) - 1)
                span = times[k2] - times[k]
                f = 0.0 if span <= 0 else float((tt - times[k]) / span)
                a, b = vals[k], vals[k2]
                if path == "rotation":
                    local[node][1] = _slerp(a, b, f)
                elif path == "translation":
                    local[node][0] = a + (b - a) * f
                elif path == "scale":
                    local[node][2] = a + (b - a) * f
        world = [None] * len(self.nodes)

        def wm(i):
            if world[i] is None:
                m = _trs(*local[i])
                world[i] = wm(self.parent[i]) @ m if i in self.parent else m
            return world[i]
        J = np.stack([wm(j) @ self.ibm[k] for k, j in enumerate(self.joints)])
        out = []
        for p in self.prims:
            M = np.einsum("vk,vkij->vij", p["w"], J[p["jnt"]])  # blended matrix per vertex
            pos = np.einsum("vij,vj->vi", M[:, :3, :3], p["pos"]) + M[:, :3, 3]
            nrm = np.einsum("vij,vj->vi", M[:, :3, :3], p["norm"])
            nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-8
            out.append((pos, nrm))
        return out


@lru_cache(maxsize=4)
def load(name: str) -> Character:
    return Character(CHAR_DIR / f"{name}.glb")


def draw(sc, ch: Character, clip, t, pos=(0, 0, 0), ry=0.0, scale=1.0, tint=None, key="c", skin=None):
    """Add a posed character to a gl3d Scene (per-frame vertex upload)."""
    from .gl3d import Engine, trs
    e = Engine.get()
    if not hasattr(e, "char_vaos"):
        e.char_vaos = {}
    for pi, ((pos_v, nrm), p) in enumerate(zip(ch.pose(clip, t), ch.prims)):
        idx = p["idx"].ravel()
        uv = p["uv"] if p["uv"] is not None else np.zeros((len(pos_v), 2), np.float32)
        verts = np.concatenate([pos_v, nrm, np.column_stack([uv[:, 0], 1 - uv[:, 1]])], 1)[idx].astype(np.float32)
        k = (key, pi)
        if k not in e.char_vaos:
            buf = e.ctx.buffer(reserve=verts.nbytes)
            e.char_vaos[k] = (buf, e._vao(e.prog, buf=buf))
        buf, vao = e.char_vaos[k]
        buf.write(verts.tobytes())
        tex = None
        if skin:  # palette texture from the pack: LightSkin, DarkSkin, LightSkin1, ...
            from PIL import Image
            # skins live in assets/characters/skins/ (short path: Windows' 260-char limit)
            f = CHAR_DIR / "skins" / f"{skin}.png"
            tex = e.texture(("charskin", skin), Image.open(f).resize((256, 256), Image.NEAREST))
        elif p["image"] is not None:
            tex = e.texture(("charimg", id(ch), p["image"]), ch.image(p["image"]))
        col = tint if tint is not None else ((1, 1, 1) if tex is not None else p["color"])
        k = scale * 1.75 / ch.height  # scale=1 -> a 1.75 m adult standing on the floor
        p_ = (pos[0], pos[1] - ch.base_y * k, pos[2])
        sc.add(vao, trs(p_, (k, k, k), ry=ry), col, tex=tex, spec=0.15, gloss=16,
               shadow=(pos[0], pos[2], 0.55 * scale, 0.4 * scale) if pi == 0 else None)
