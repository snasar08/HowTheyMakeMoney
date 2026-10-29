"""GPU-skinned, instanced characters for the low-poly style: hundreds of animated people in one
draw call per animation-phase group. Skinning runs in the vertex shader (on GitHub that is Mesa
llvmpipe's vectorized CPU code), so a crowd costs about the same as a handful of characters.

    c = Crowd(character.load(NAME), skin="LightSkin")
    c.place(positions, yaw, scale, tint, clip_names, phases)
    scene.customs.append(c.drawer(t))
"""
from __future__ import annotations

import math

import numpy as np

from .gl3d import Engine

VS = """
#version 330
uniform mat4 vp; uniform mat4 joints[48];
in vec3 in_pos; in vec3 in_norm; in vec2 in_uv; in vec4 in_j; in vec4 in_w;
in vec4 i_off; in vec3 i_tint; in float i_scale;
flat out vec3 v_n; out vec3 v_w; out vec2 v_uv; flat out vec3 v_tint;
void main() {
    mat4 sk = joints[int(in_j.x)] * in_w.x + joints[int(in_j.y)] * in_w.y
            + joints[int(in_j.z)] * in_w.z + joints[int(in_j.w)] * in_w.w;
    vec4 p = sk * vec4(in_pos, 1.0);
    vec3 n = mat3(sk) * in_norm;
    float c = cos(i_off.w), s = sin(i_off.w);
    mat3 r = mat3(c, 0, -s, 0, 1, 0, s, 0, c);
    vec3 w = r * (p.xyz * i_scale) + i_off.xyz;
    v_n = r * n; v_w = w; v_uv = in_uv; v_tint = i_tint;
    gl_Position = vp * vec4(w, 1.0);
}"""

FS = """
#version 330
uniform vec3 key_dir; uniform vec3 sky; uniform vec3 ground; uniform vec3 eye;
uniform vec3 fog_col; uniform float fog_near; uniform float fog_far;
uniform sampler2D tex; uniform int use_tex;
flat in vec3 v_n; in vec3 v_w; in vec2 v_uv; flat in vec3 v_tint;
out vec4 f;
void main() {
    vec3 n = normalize(v_n);
    vec3 base = (use_tex == 1 ? texture(tex, v_uv).rgb : vec3(1.0)) * v_tint;
    float d = max(dot(n, normalize(-key_dir)), 0.0);
    vec3 amb = mix(ground, sky, n.y * 0.5 + 0.5) * 0.55;
    vec3 c = base * (amb + d * 0.75);
    float fd = length(eye - v_w);
    float fg = clamp((fd - fog_near) / (fog_far - fog_near), 0.0, 1.0);
    f = vec4(mix(c, fog_col, fg * fg), 1.0);
}"""


class Crowd:
    def __init__(self, ch, skin: str | None = None):
        e = Engine.get()
        if not hasattr(e, "crowd_prog"):
            e.crowd_prog = e.ctx.program(vertex_shader=VS, fragment_shader=FS)
        self.e, self.ch, self.skin = e, ch, skin
        p = ch.prims[0]
        idx = p["idx"].ravel()
        uv = p["uv"] if p["uv"] is not None else np.zeros((len(p["pos"]), 2), np.float32)
        verts = np.concatenate([p["pos"], p["norm"], np.column_stack([uv[:, 0], 1 - uv[:, 1]]),
                                p["jnt"].astype(np.float32), p["w"]], 1)[idx].astype(np.float32)
        self.vbo = e.ctx.buffer(verts.tobytes())
        self.groups = []  # (clip, phase, instance buffer, count, vao)

    def place(self, pos, yaw, scale, tint, clips, phases):
        """Arrays of length n. Instances sharing (clip, phase) animate together (one draw call)."""
        e = self.e
        k = 1.75 / self.ch.height
        keys = {}
        for i in range(len(pos)):
            keys.setdefault((clips[i], round(float(phases[i]), 2)), []).append(i)
        for (clip, ph), ids in keys.items():
            inst = np.array([[pos[i][0], pos[i][1] - self.ch.base_y * k * scale[i], pos[i][2], yaw[i],
                              *tint[i], k * scale[i]] for i in ids], np.float32)
            ib = e.ctx.buffer(inst.tobytes())
            vao = e.ctx.vertex_array(e.crowd_prog, [
                (self.vbo, "3f 3f 2f 4f 4f", "in_pos", "in_norm", "in_uv", "in_j", "in_w"),
                (ib, "4f 3f 1f/i", "i_off", "i_tint", "i_scale")])
            self.groups.append((clip, ph, ib, len(ids), vao))

    def drawer(self, t: float):
        def draw(e, vp, sc):
            pr = e.crowd_prog
            L = sc.look
            pr["vp"].write(vp.T.tobytes())
            for k_, v in (("key_dir", L["key_dir"]), ("sky", L["sky"]), ("ground", L["ground"]),
                          ("eye", sc.eye), ("fog_col", L["fog"])):
                pr[k_].value = tuple(float(x) for x in v)
            pr["fog_near"].value, pr["fog_far"].value = L.get("fog_near", 30.0), L.get("fog_far", 90.0)
            use = 0
            if self.skin:
                from PIL import Image
                from .character import CHAR_DIR
                tex = e.texture(("charskin", self.skin),
                                Image.open(CHAR_DIR / "skins" / f"{self.skin}.png").resize((256, 256), Image.NEAREST))
                tex.use(0)
                pr["tex"].value = 0
                use = 1
            pr["use_tex"].value = use
            for clip, ph, ib, n, vao in self.groups:
                J = self.ch.joint_mats(clip, t + ph)
                pr["joints"].write(J.transpose(0, 2, 1).copy().tobytes())
                vao.render(instances=n)
        return draw


def grid_crowd(n, x0, x1, z0, z1, rng, jitter=0.35):
    """n positions roughly on a grid inside the rectangle."""
    cols = max(1, int(math.sqrt(n * (x1 - x0) / max(0.1, z1 - z0))))
    rows = math.ceil(n / cols)
    pts = []
    for r in range(rows):
        for c in range(cols):
            if len(pts) >= n:
                break
            x = x0 + (c + 0.5) * (x1 - x0) / cols + rng.uniform(-jitter, jitter)
            z = z0 + (r + 0.5) * (z1 - z0) / rows + rng.uniform(-jitter, jitter)
            pts.append((x, 0.0, z))
    return pts
