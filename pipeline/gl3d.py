"""Small CPU-friendly 3D engine (moderngl). On GitHub's runners it renders with Mesa's llvmpipe
software rasterizer through EGL (no GPU, no display); locally it uses whatever GPU is there.

Look: soft key + rim light, hemispheric ambient, a floor that fades into the theme background,
soft contact shadows, distance fog and a depth-of-field post pass. Everything returns an RGB
numpy frame the Pillow pipeline composites captions/CTA onto.
"""
from __future__ import annotations

import math
import os
import threading

import numpy as np

W3D = int(os.environ.get("W3D", "1080"))
H3D = int(os.environ.get("H3D", "1920"))
SAMPLES = int(os.environ.get("MSAA_3D", "4"))

_VS = """
#version 330
uniform mat4 mvp; uniform mat4 model;
in vec3 in_pos; in vec3 in_norm; in vec2 in_uv;
out vec3 v_pos; out vec3 v_norm; out vec2 v_uv;
void main() {
    vec4 w = model * vec4(in_pos, 1.0);
    v_pos = w.xyz; v_norm = mat3(model) * in_norm; v_uv = in_uv;
    gl_Position = mvp * vec4(in_pos, 1.0);
}"""

_FS = """
#version 330
uniform vec3 color; uniform vec3 eye; uniform vec3 key_dir; uniform vec3 rim_col;
uniform vec3 sky; uniform vec3 ground; uniform vec3 fog_col; uniform float fog_near; uniform float fog_far;
uniform float spec; uniform float gloss; uniform float emissive; uniform float alpha;
uniform sampler2D tex; uniform int use_tex; uniform int unlit;
in vec3 v_pos; in vec3 v_norm; in vec2 v_uv;
out vec4 f;
void main() {
    vec3 n = normalize(v_norm);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(eye - v_pos);
    vec4 base = vec4(color, alpha);
    if (use_tex == 1) { vec4 t = texture(tex, v_uv); base = vec4(t.rgb * color, t.a * alpha); }
    if (base.a < 0.01) discard;
    vec3 c;
    if (unlit == 1) { c = base.rgb; }
    else {
        vec3 l = normalize(-key_dir);
        float diff = max(dot(n, l), 0.0);
        vec3 h = normalize(l + v);
        float s = pow(max(dot(n, h), 0.0), gloss) * spec;
        vec3 amb = mix(ground, sky, n.y * 0.5 + 0.5) * 0.5;
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        c = base.rgb * (amb + diff * 0.8) + s + rim * rim_col * 0.6 + base.rgb * emissive;
        c = (1.0 - exp(-1.6 * c)) / (1.0 - exp(-1.6));  // soft shoulder: 1 stays 1, hues stay saturated
    }
    float d = length(eye - v_pos);
    float fg = clamp((d - fog_near) / (fog_far - fog_near), 0.0, 1.0);
    f = vec4(mix(c, fog_col, fg * fg), base.a);
}"""

# floor: soft radial fade into the background, faint grid, contact shadows from blob list
_FLOOR_FS = """
#version 330
uniform vec3 eye; uniform vec3 floor_col; uniform vec3 fog_col; uniform vec3 grid_col;
uniform float fog_near; uniform float fog_far; uniform float grid; uniform float radius;
uniform int n_blobs; uniform vec4 blobs[48];
in vec3 v_pos; in vec3 v_norm; in vec2 v_uv;
out vec4 f;
void main() {
    vec2 p = v_pos.xz;
    float sh = 0.0;
    for (int i = 0; i < n_blobs; i++) {
        vec2 q = (p - blobs[i].xy) / blobs[i].zw;
        sh = max(sh, smoothstep(1.0, 0.0, length(q)));
    }
    vec3 c = floor_col * (1.0 - 0.55 * sh);
    if (grid > 0.0) {
        vec2 g = abs(fract(p / grid - 0.5) - 0.5) / fwidth(p / grid);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        c = mix(c, grid_col, line * 0.35);
    }
    float d = length(eye - v_pos);
    float fg = clamp((d - fog_near) / (fog_far - fog_near), 0.0, 1.0);
    float edge = smoothstep(radius * 0.55, radius, length(p));
    f = vec4(mix(c, fog_col, max(fg * fg, edge)), 1.0);
}"""

# depth pass: eye distance into a float texture (Mesa can't resolve multisampled depth reliably)
_DEPTH_FS = """
#version 330
uniform vec3 eye; uniform sampler2D tex; uniform int use_tex;
in vec3 v_pos; in vec3 v_norm; in vec2 v_uv;
out vec4 f;
void main() {
    if (use_tex == 1 && texture(tex, v_uv).a < 0.5) discard;
    f = vec4(length(eye - v_pos), 0.0, 0.0, 1.0);
}"""

_POST_VS = """
#version 330
in vec2 in_pos; out vec2 uv;
void main() { uv = in_pos * 0.5 + 0.5; gl_Position = vec4(in_pos, 0.0, 1.0); }"""

# background gradient + depth of field (12-tap disk, radius from circle of confusion) + vignette
_POST_FS = """
#version 330
uniform sampler2D color; uniform sampler2D depth;
uniform float focus; uniform float aperture;
uniform vec2 px; uniform float vig_amt;
in vec2 uv; out vec4 f;
void main() {
    float d = texture(depth, uv).r;
    float coc = clamp(abs(d - focus) / d * aperture, 0.0, 1.0);
    vec3 acc = texture(color, uv).rgb; float wsum = 1.0;
    if (coc > 0.02) {
        const vec2 taps[12] = vec2[](vec2(1,0),vec2(.5,.866),vec2(-.5,.866),vec2(-1,0),vec2(-.5,-.866),
            vec2(.5,-.866),vec2(.5,0),vec2(.25,.433),vec2(-.25,.433),vec2(-.5,0),vec2(-.25,-.433),vec2(.25,-.433));
        for (int i = 0; i < 12; i++) { acc += texture(color, uv + taps[i] * px * coc * 14.0).rgb; wsum += 1.0; }
    }
    vec3 c = acc / wsum;
    float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(0.9, 1.0)));
    f = vec4(c * mix(1.0 - vig_amt, 1.0, vig), 1.0);
}"""


# ----------------------------------------------------------------- math
def perspective(fov_deg, aspect, near, far):
    f = 1.0 / math.tan(math.radians(fov_deg) / 2)
    m = np.zeros((4, 4), np.float32)
    m[0, 0], m[1, 1] = f / aspect, f
    m[2, 2], m[2, 3] = (far + near) / (near - far), 2 * far * near / (near - far)
    m[3, 2] = -1
    return m


def look_at(eye, target, up=(0, 1, 0)):
    eye, target, up = (np.asarray(v, np.float32) for v in (eye, target, up))
    z = eye - target
    z /= np.linalg.norm(z)
    x = np.cross(up, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    m = np.eye(4, dtype=np.float32)
    m[0, :3], m[1, :3], m[2, :3] = x, y, z
    m[:3, 3] = -m[:3, :3] @ eye
    return m


def trs(t=(0, 0, 0), s=(1, 1, 1), ry=0.0, rx=0.0, rz=0.0):
    def rot(axis, a):
        c, s_ = math.cos(a), math.sin(a)
        r = np.eye(4, dtype=np.float32)
        i, j = {"x": (1, 2), "y": (2, 0), "z": (0, 1)}[axis]
        r[i, i], r[i, j], r[j, i], r[j, j] = c, -s_, s_, c
        return r
    m = np.eye(4, dtype=np.float32)
    m[:3, 3] = t
    sc = np.diag([*s, 1]).astype(np.float32)
    return m @ rot("y", ry) @ rot("x", rx) @ rot("z", rz) @ sc


# ----------------------------------------------------------------- meshes (pos, normal, uv)
def _pack(tris):
    return np.asarray(tris, np.float32).reshape(-1, 8)


def box_mesh():
    """Unit cube from y=0 to 1 (sits on the floor), x/z in [-0.5, 0.5]."""
    faces = [((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0)),
             ((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
             ((0, 1, 0), (1, 0, 0), (0, 0, -1)), ((0, -1, 0), (1, 0, 0), (0, 0, 1))]
    out = []
    for n, u, v in faces:
        n, u, v = (np.array(a, np.float32) for a in (n, u, v))
        c = n * 0.5 + np.array([0, 0.5, 0], np.float32)
        q = [c - u / 2 - v / 2, c + u / 2 - v / 2, c + u / 2 + v / 2, c - u / 2 + v / 2]
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for k in (0, 1, 2, 0, 2, 3):
            out.append([*q[k], *n, *uv[k]])
    return _pack(out)


def cylinder_mesh(seg=48):
    """Radius 1, y in [0, 1]."""
    out = []
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        p0, p1 = (math.cos(a0), math.sin(a0)), (math.cos(a1), math.sin(a1))
        n0, n1 = (p0[0], 0, p0[1]), (p1[0], 0, p1[1])
        b0, b1, t0, t1 = (p0[0], 0, p0[1]), (p1[0], 0, p1[1]), (p0[0], 1, p0[1]), (p1[0], 1, p1[1])
        u0, u1 = i / seg, (i + 1) / seg
        out += [[*b0, *n0, u0, 0], [*b1, *n1, u1, 0], [*t1, *n1, u1, 1],
                [*b0, *n0, u0, 0], [*t1, *n1, u1, 1], [*t0, *n0, u0, 1]]
        for y, ny in ((1, 1), (0, -1)):
            c = (0, y, 0)
            e0, e1 = (p0[0], y, p0[1]), (p1[0], y, p1[1])
            uv = lambda p: (p[0] * 0.5 + 0.5, p[2] * 0.5 + 0.5)
            tri = [c, e1, e0] if ny > 0 else [c, e0, e1]
            out += [[*p, 0, ny, 0, *uv(p)] for p in tri]
    return _pack(out)


def sphere_mesh(nu=64, nv=40):
    out = []
    def pt(i, j):
        th, ph = 2 * math.pi * i / nu, math.pi * j / nv
        x, y, z = math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)
        return [x, y, z, x, y, z, 1 - i / nu, 1 - j / nv]
    for i in range(nu):
        for j in range(nv):
            a, b, c, d = pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)
            out += [a, c, b, a, d, c]
    return _pack(out)


def wedge_mesh(a0, a1, r_in=0.0, seg=None):
    """Extruded pie slice in the xz plane, angles in radians, y in [0, 1], outer radius 1."""
    seg = seg or max(2, int(abs(a1 - a0) / (2 * math.pi) * 96))
    out = []
    angs = np.linspace(a0, a1, seg + 1)
    for i in range(seg):
        p, q = angs[i], angs[i + 1]
        o0, o1 = (math.cos(p), math.sin(p)), (math.cos(q), math.sin(q))
        i0, i1 = (o0[0] * r_in, o0[1] * r_in), (o1[0] * r_in, o1[1] * r_in)
        for y, ny in ((1, 1), (0, -1)):
            quad = [(*i0, ), (*o0, ), (*o1, ), (*i1, )]
            pts = [(x, y, z) for x, z in quad]
            order = (0, 2, 1, 0, 3, 2) if ny > 0 else (0, 1, 2, 0, 2, 3)
            out += [[*pts[k], 0, ny, 0, 0, 0] for k in order]
        n0, n1 = (o0[0], 0, o0[1]), (o1[0], 0, o1[1])
        out += [[o0[0], 0, o0[1], *n0, 0, 0], [o1[0], 1, o1[1], *n1, 0, 0], [o1[0], 0, o1[1], *n1, 0, 0],
                [o0[0], 0, o0[1], *n0, 0, 0], [o0[0], 1, o0[1], *n0, 0, 0], [o1[0], 1, o1[1], *n1, 0, 0]]
    for ang, sgn in ((a0, -1), (a1, 1)):  # flat cut faces
        d = (math.cos(ang), math.sin(ang))
        n = (-d[1] * sgn, 0, d[0] * sgn)
        a, b = (d[0] * r_in, d[1] * r_in), d
        pts = [(a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], 1, b[1]), (a[0], 1, a[1])]
        order = (0, 2, 1, 0, 3, 2) if sgn > 0 else (0, 1, 2, 0, 2, 3)
        out += [[*pts[k], *n, 0, 0] for k in order]
    return _pack(out)


def quad_mesh():
    """Unit quad in the xy plane centered at origin, facing +z."""
    q = [(-0.5, -0.5, 0, 0, 0), (0.5, -0.5, 0, 1, 0), (0.5, 0.5, 0, 1, 1), (-0.5, 0.5, 0, 0, 1)]
    return _pack([[x, y, z, 0, 0, 1, u, v] for k in (0, 1, 2, 0, 2, 3) for x, y, z, u, v in [q[k]]])


# ----------------------------------------------------------------- engine
_gl_thread = None


def run3d(fn, *args, **kw):
    """Run fn on the one thread that owns the GL context (frames render in a thread pool, and
    a GL context can't hop between threads). Blocks until done; returns fn's result."""
    global _gl_thread
    if _gl_thread is None:
        from concurrent.futures import ThreadPoolExecutor
        _gl_thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="gl3d")
    return _gl_thread.submit(fn, *args, **kw).result()


class Engine:
    """One GL context + reusable meshes. Not thread-safe: callers hold `lock`."""
    lock = threading.Lock()
    _inst = None

    @classmethod
    def get(cls) -> "Engine":
        if cls._inst is None:
            cls._inst = cls()
        return cls._inst

    def __init__(self):
        import moderngl
        backend = os.environ.get("GL_BACKEND") or ("egl" if os.name != "nt" and not os.environ.get("DISPLAY") else None)
        self.ctx = moderngl.create_standalone_context(**({"backend": backend} if backend else {}))
        self.renderer = self.ctx.info.get("GL_RENDERER", "?")
        c = self.ctx
        self._buf_of, self.depth_vaos = {}, {}
        self.prog = c.program(vertex_shader=_VS, fragment_shader=_FS)
        self.floor_prog = c.program(vertex_shader=_VS, fragment_shader=_FLOOR_FS)
        self.post = c.program(vertex_shader=_POST_VS, fragment_shader=_POST_FS)
        self.meshes = {}
        for name, data in (("box", box_mesh()), ("cyl", cylinder_mesh()), ("sphere", sphere_mesh()),
                           ("quad", quad_mesh())):
            self.meshes[name] = self._vao(self.prog, data)
        self.floor_vao = self._vao(self.floor_prog, quad_mesh())
        full = np.array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1], np.float32)
        self.post_vao = c.vertex_array(self.post, [(c.buffer(full), "2f", "in_pos")])
        self.msaa = c.framebuffer(c.renderbuffer((W3D, H3D), 4, samples=SAMPLES),
                                  c.depth_renderbuffer((W3D, H3D), samples=SAMPLES))
        self.col_tex = c.texture((W3D, H3D), 4)
        self.resolve = c.framebuffer([self.col_tex])
        self.depth_prog = c.program(vertex_shader=_VS, fragment_shader=_DEPTH_FS)
        dw, dh = W3D // 2, H3D // 2
        self.dep_tex = c.texture((dw, dh), 1, dtype="f4")
        self.dep_fbo = c.framebuffer([self.dep_tex], c.depth_renderbuffer((dw, dh)))
        self.out_tex = c.texture((W3D, H3D), 3)
        self.out_fbo = c.framebuffer([self.out_tex])
        self.textures = {}

    def _vao(self, prog, data=None, buf=None):
        buf = buf or self.ctx.buffer(data.tobytes())
        names = [n for n in ("in_pos", "in_norm", "in_uv") if n in prog]
        fmt = " ".join({"in_pos": "3f", "in_norm": "3f", "in_uv": "2f"}[n] if n in names else
                       {"in_pos": "12x", "in_norm": "12x", "in_uv": "8x"}[n] for n in ("in_pos", "in_norm", "in_uv"))
        vao = self.ctx.vertex_array(prog, [(buf, fmt, *names)])
        self._buf_of[id(vao)] = buf
        return vao

    def depth_vao(self, vao):
        """Same mesh, bound to the depth-pass program."""
        k = id(vao)
        if k not in self.depth_vaos:
            self.depth_vaos[k] = self._vao(self.depth_prog, buf=self._buf_of[k])
        return self.depth_vaos[k]

    def mesh(self, key, builder):
        if key not in self.meshes:
            self.meshes[key] = self._vao(self.prog, builder())
        return self.meshes[key]

    def texture(self, key, img):
        """Cache a Pillow RGBA image as a texture (flipped for GL)."""
        if key not in self.textures:
            from PIL import Image
            im = img.convert("RGBA").transpose(Image.FLIP_TOP_BOTTOM)
            t = self.ctx.texture(im.size, 4, im.tobytes())
            t.build_mipmaps()
            import moderngl
            t.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)
            t.anisotropy = 4.0
            self.textures[key] = t
            if len(self.textures) > 300:  # number textures change every frame; keep memory flat
                for k in list(self.textures)[:100]:
                    self.textures.pop(k).release()
        return self.textures[key]


class Scene:
    """Collects draw calls for one frame, then renders: opaque, floor, transparent, post."""

    def __init__(self, look: dict, eye, target, fov=38.0, focus=None, aperture=0.0):
        self.look, self.eye, self.target = look, np.asarray(eye, np.float32), np.asarray(target, np.float32)
        self.fov, self.aperture = fov, aperture
        self.focus = focus if focus is not None else float(np.linalg.norm(self.eye - self.target))
        self.items, self.blobs = [], []
        self.near, self.far = 0.1, 80.0
        self.vignette = 0.22
        # lens shift (NDC): moves the picture up so 3D content sits between the channel tag and
        # the caption dead zone, without tilting the camera
        self.shift = 0.15
        self.shift_x = 0.055  # ~30 px left: centered on the safe area, away from the like/share column

    def add(self, mesh, model, color, tex=None, spec=0.35, gloss=40.0, emissive=0.0, alpha=1.0,
            unlit=False, shadow=None):
        """shadow=(x, z, rx, rz) adds a soft contact shadow on the floor."""
        self.items.append((mesh, model, color, tex, spec, gloss, emissive, alpha, unlit))
        if shadow:
            self.blobs.append(shadow)

    def render(self) -> np.ndarray:
        e = Engine.get()
        L, ctx = self.look, e.ctx
        view = look_at(self.eye, self.target)
        proj = perspective(self.fov, W3D / H3D, self.near, self.far)
        proj[1, 2] = -self.shift
        proj[0, 2] = self.shift_x
        vp = proj @ view
        e.msaa.use()
        bg = np.asarray(L["fog"], np.float32)
        ctx.clear(*bg, 1.0)
        ctx.enable(ctx.DEPTH_TEST)
        ctx.disable(ctx.CULL_FACE)
        # floor
        if L.get("floor") is not None:
            fp = e.floor_prog
            m = trs((0, 0, 0), (60, 60, 1), rx=-math.pi / 2)
            fp["mvp"].write((vp @ m).T.tobytes())
            fp["model"].write(m.T.tobytes())
            for k, v in (("eye", self.eye), ("floor_col", L["floor"]), ("fog_col", L["fog"]),
                         ("grid_col", L.get("grid_col", L["floor"]))):
                fp[k].value = tuple(float(x) for x in v)
            fp["fog_near"].value, fp["fog_far"].value = L.get("fog_near", 8.0), L.get("fog_far", 26.0)
            fp["grid"].value = L.get("grid", 0.0)
            fp["radius"].value = L.get("floor_radius", 14.0)
            blobs = self.blobs[:48]
            fp["n_blobs"].value = len(blobs)
            if blobs:
                arr = np.zeros((48, 4), np.float32)
                arr[: len(blobs)] = blobs
                fp["blobs"].write(arr.tobytes())
            e.floor_vao.render()
        p = e.prog
        for k, v in (("eye", self.eye), ("key_dir", L["key_dir"]), ("rim_col", L["rim"]), ("sky", L["sky"]),
                     ("ground", L["ground"]), ("fog_col", L["fog"])):
            p[k].value = tuple(float(x) for x in v)
        p["fog_near"].value, p["fog_far"].value = L.get("fog_near", 8.0), L.get("fog_far", 26.0)
        opaque = [i for i in self.items if i[7] >= 0.999]
        clear = [i for i in self.items if i[7] < 0.999]
        for batch, blend in ((opaque, False), (clear, True)):
            if blend:
                ctx.enable(ctx.BLEND)
                ctx.blend_func = ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA
            for mesh, model, color, tex, spec, gloss, emis, alpha, unlit in batch:
                p["mvp"].write((vp @ model).T.tobytes())
                p["model"].write(model.T.tobytes())
                p["color"].value = tuple(float(x) for x in color)
                p["spec"].value, p["gloss"].value, p["emissive"].value = spec, gloss, emis
                p["alpha"].value, p["unlit"].value = alpha, int(unlit)
                p["use_tex"].value = int(tex is not None)
                if tex is not None:
                    tex.use(0)
                    p["tex"].value = 0
                mesh.render()
            ctx.disable(ctx.BLEND)
        ctx.copy_framebuffer(e.resolve, e.msaa)
        # depth pass (half res, no MSAA) for depth of field; skipped when there's no blur
        if self.aperture > 0:
            e.dep_fbo.use()
            ctx.clear(self.far, 0, 0, 1)
            ctx.enable(ctx.DEPTH_TEST)
            dp = e.depth_prog
            dp["eye"].value = tuple(float(x) for x in self.eye)
            if L.get("floor") is not None:
                m = trs((0, 0, 0), (60, 60, 1), rx=-math.pi / 2)
                dp["mvp"].write((vp @ m).T.tobytes())
                dp["model"].write(m.T.tobytes())
                dp["use_tex"].value = 0
                e.depth_vao(e.floor_vao).render()
            for mesh, model, color, tex, *_ in self.items:
                dp["mvp"].write((vp @ model).T.tobytes())
                dp["model"].write(model.T.tobytes())
                dp["use_tex"].value = int(tex is not None)
                if tex is not None:
                    tex.use(0)
                    dp["tex"].value = 0
                e.depth_vao(mesh).render()
        # post: depth of field + vignette
        e.out_fbo.use()
        ctx.disable(ctx.DEPTH_TEST)
        e.col_tex.use(0)
        e.dep_tex.use(1)
        q = e.post
        q["color"].value, q["depth"].value = 0, 1
        q["focus"].value, q["aperture"].value = float(self.focus), float(self.aperture)
        q["px"].value = (1.0 / W3D, 1.0 / H3D)
        q["vig_amt"].value = float(self.vignette)
        e.post_vao.render()
        raw = e.out_fbo.read(components=3)
        return np.frombuffer(raw, np.uint8).reshape(H3D, W3D, 3)[::-1]


def card(img, q, side, bg_rgb) -> np.ndarray:
    """Transition: the frame as a card swinging in (q 0->1) around a vertical edge, with a
    slight push. Rendered at full size so the settled card lines up pixel-exact at q=1."""
    e = Engine.get()
    k = 1 - (1 - min(max(q, 0.0), 1.0)) ** 3
    if not hasattr(e, "card_tex"):
        e.card_tex = e.ctx.texture((W3D, H3D), 3)
    from PIL import Image
    e.card_tex.write(img.convert("RGB").transpose(Image.FLIP_TOP_BOTTOM).resize((W3D, H3D)).tobytes())
    fov = 40.0
    dist = (1.0 / math.tan(math.radians(fov) / 2))  # quad height 2 fills the view exactly
    bg = tuple(c / 255 for c in bg_rgb[:3])
    look = dict(fog=bg, floor=None, sky=(1, 1, 1), ground=(1, 1, 1), rim=(0, 0, 0), key_dir=(0, 0, -1),
                fog_near=50, fog_far=60)
    sc = Scene(look, (0, 0, dist), (0, 0, 0), fov=fov, aperture=0.0)
    sc.vignette = 0.0
    sc.shift = 0.0
    sc.shift_x = 0.0
    sgn = 1 if side else -1
    ang = sgn * (1 - k) * 0.4
    push = (1 - k) * -0.4
    m = trs((0, 0, push), ry=ang) @ trs((0, 0, 0), (2 * W3D / H3D, 2, 1))
    sc.add(e.meshes["quad"], m, (1, 1, 1), tex=e.card_tex, unlit=True)
    return sc.render()


# ----------------------------------------------------------------- 2.5D parallax for photos
_PARALLAX_PATHS = [  # (x0, x1, y0, y1, dolly0, dolly1): small camera drifts, all different
    (-1, 1, 0.2, -0.2, 0.0, 0.25), (1, -1, -0.3, 0.3, 0.2, 0.0), (0.2, -0.2, -1, 1, 0.0, 0.2),
    (-0.6, 0.8, 0.8, -0.4, 0.25, 0.05), (0.0, 0.0, 0.0, 0.0, 0.0, 0.32), (0.9, -0.5, 0.5, -0.7, 0.1, 0.25)]


def parallax(key, img, depth, p, variant, amount=0.55, drift=0.11, grid=(96, 170)):
    """The photo as a mesh pushed forward by its depth map; a slow camera drift then gives real
    parallax (near things slide past far things). img: PIL RGB already cropped to 9:16 cover."""
    e = Engine.get()
    if not hasattr(e, "par_cache"):
        e.par_cache = {}
    if key not in e.par_cache:
        if len(e.par_cache) > 8:
            for _, (vao, tex) in list(e.par_cache.items())[:4]:
                vao.release()
                tex.release()
            e.par_cache = dict(list(e.par_cache.items())[4:])
        gx, gy = grid
        aspect = W3D / H3D
        dz = np.asarray(depth, np.float32)
        ys, xs = np.mgrid[0:gy + 1, 0:gx + 1]
        u, v = xs / gx, ys / gy
        di = dz[np.clip((v * (dz.shape[0] - 1)).astype(int), 0, dz.shape[0] - 1),
                np.clip((u * (dz.shape[1] - 1)).astype(int), 0, dz.shape[1] - 1)]
        pos = np.stack([(u - 0.5) * 2 * aspect, (0.5 - v) * 2, (di - 0.5) * amount], -1)
        verts = np.concatenate([pos, np.zeros_like(pos) + [0, 0, 1], np.stack([u, 1 - v], -1)], -1)
        verts = verts.reshape(-1, 8).astype(np.float32)
        idx = []
        for j in range(gy):
            r0, r1 = j * (gx + 1), (j + 1) * (gx + 1)
            a = np.arange(gx)
            idx.append(np.stack([r0 + a, r1 + a, r0 + a + 1, r0 + a + 1, r1 + a, r1 + a + 1], -1))
        idx = np.concatenate(idx).astype(np.int32).ravel()
        c = e.ctx
        vao = c.vertex_array(e.prog, [(c.buffer(verts.tobytes()), "3f 3f 2f", "in_pos", "in_norm", "in_uv")],
                             index_buffer=c.buffer(idx.tobytes()))
        from PIL import Image
        im = img.convert("RGB").transpose(Image.FLIP_TOP_BOTTOM)
        tex = c.texture(im.size, 3, im.tobytes())
        tex.build_mipmaps()
        e.par_cache[key] = (vao, tex)
    vao, tex = e.par_cache[key]
    x0, x1, y0, y1, d0, d1 = _PARALLAX_PATHS[variant % len(_PARALLAX_PATHS)]
    k = p * p * (3 - 2 * p)  # smoothstep
    fov = 40.0
    dist = 1.0 / math.tan(math.radians(fov) / 2)
    cx, cy = (x0 + (x1 - x0) * k) * drift, (y0 + (y1 - y0) * k) * drift
    eye = (cx, cy, dist + 0.04 - (d0 + (d1 - d0) * k) * 0.55)
    look = dict(fog=(0, 0, 0), floor=None, sky=(1, 1, 1), ground=(1, 1, 1), rim=(0, 0, 0), key_dir=(0, 0, -1),
                fog_near=50, fog_far=60)
    sc = Scene(look, eye, (cx * 0.35, cy * 0.35, 0), fov=fov, aperture=0.0)
    sc.vignette, sc.shift, sc.shift_x = 0.0, 0.0, 0.0
    # overscan so the drifting camera never sees past the picture's edges
    sc.add(vao, trs((0, 0, 0), (1.16, 1.16, 1)), (1, 1, 1), tex=tex, unlit=True)
    return sc.render()
