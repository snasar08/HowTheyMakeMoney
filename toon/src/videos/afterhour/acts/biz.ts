// Afterhour business acts (worker E): handshake, bell, ribbon, gold, cards, registers, charts, vault, hiring.
// Every act is a pure function of t (seconds into the shot) and ctx.seed; props follow the real hand meshes (arm IK, as in sports.ts).
import * as THREE from "three";
import { toonMat, outline, canvasTex, seeded, metalMat } from "../common";
import { makeThing } from "../things3d";
import { makeExtra, Char, Look, Pose, Expr } from "../char";
import { drawCard } from "../cards";
import type { ActDef, ActCtx, ActRun } from "./types";

type V3 = [number, number, number];
const Vec = THREE.Vector3;
const PI = Math.PI;
const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x: number) => { x = cl(x); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const lin = (t: number, a: number, b: number) => cl((t - a) / (b - a));
const wp = (o: THREE.Object3D) => o.getWorldPosition(new Vec());
const rigOf = (c: Char) => c.root.children[0] as THREE.Group;
/** back-eased pop-in scale (same curve Ah uses for things) */
const back = (u: number) => { u = cl(u); return u <= 0 ? 0.001 : 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; };
const bounce = (u: number) => { u = cl(u); const n = 7.5625, d = 2.75;
  if (u < 1 / d) return n * u * u; if (u < 2 / d) { u -= 1.5 / d; return n * u * u + 0.75; } if (u < 2.5 / d) { u -= 2.25 / d; return n * u * u + 0.9375; } u -= 2.625 / d; return n * u * u + 0.984375; };

// ---------------------------------------------------------------- arm IK (copy of the sports.ts one)
const DOWN = new Vec(0, -1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function ik(c: Char, side: "l" | "r", tgt: THREE.Vector3, pole: V3) {
  const hand = c.hand(side), el = hand.parent!, sh = el.parent!;
  const L1 = el.position.length(), L2 = hand.position.length(), P = sh.position;
  const v = tgt.clone().sub(P); let D = v.length(); D = Math.min(Math.max(D, 0.12), L1 + L2 - 0.004);
  const dir = v.normalize(), pl = new Vec(...pole);
  const aa = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
  const perp = pl.clone().addScaledVector(dir, -pl.dot(dir)).normalize();
  const E = P.clone().addScaledVector(dir, aa).addScaledVector(perp, h);
  sh.quaternion.setFromUnitVectors(DOWN, E.clone().sub(P).normalize());
  const hp = P.clone().addScaledVector(dir, D);
  _q.copy(sh.quaternion).invert(); _q2.setFromUnitVectors(DOWN, hp.sub(E).normalize());
  el.quaternion.copy(_q.multiply(_q2));
}
const shY = (c: Char) => c.hand("r").parent!.parent!.position.y;
/** hand to a world point; elbow pole is outward/down by default */
const armW = (c: Char, side: "l" | "r", p: THREE.Vector3, pole?: V3) => {
  const rig = rigOf(c); c.root.updateMatrixWorld(true);
  const s = side === "r" ? 1 : -1;
  ik(c, side, rig.worldToLocal(p.clone()), pole ?? [s * 1.2, -0.7, -0.3]);
};
/** which hand is on the side of a world point (the hand whose rig x matches) */
const sideTo = (c: Char, p: THREE.Vector3): "l" | "r" => { c.root.updateMatrixWorld(true); return rigOf(c).worldToLocal(p.clone()).x >= 0 ? "r" : "l"; };
/** a relaxed hand spot beside the hip, in world space */
const rest = (c: Char, side: "l" | "r", dy = -0.55, z = 0.1) => rigOf(c).localToWorld(new Vec(side === "r" ? 0.22 : -0.22, shY(c) + dy, z));
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);

// ---------------------------------------------------------------- building blocks
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
};
/** toon box with a hard black edge */
const bx = (parent: THREE.Object3D, w: number, h: number, d: number, col: string | THREE.Material, x: number, y: number, z: number, ink = 0.022) => {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof col === "string" ? toonMat(col) : col, x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.BoxGeometry(w + ink * 2, h + ink * 2, d + ink * 2), INK));
  parent.add(m); return m;
};
const cyl = (parent: THREE.Object3D, r: number, h: number, col: string | THREE.Material, x: number, y: number, z: number, ink = 0.02, r2?: number) => {
  const m = mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, 20), typeof col === "string" ? toonMat(col) : col, x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.CylinderGeometry((r2 ?? r) + ink, r + ink, h + ink * 2, 20), INK));
  parent.add(m); return m;
};
const ball = (parent: THREE.Object3D, r: number, col: string | THREE.Material, x: number, y: number, z: number, ink = 0.02) => {
  const m = mesh(new THREE.SphereGeometry(r, 18, 12), typeof col === "string" ? toonMat(col) : col, x, y, z); if (ink) outline(m, ink); parent.add(m); return m;
};
const GOLD = () => toonMat("#f7b92b", { emissive: "#a86a00", emissiveIntensity: 0.4 });
const goldBar = (k = 1) => {
  const g = new THREE.Group(), m = metalMat("#ffc928", 0.3);
  const lo = mesh(new THREE.BoxGeometry(0.36 * k, 0.07 * k, 0.21 * k), m, 0, 0.035 * k, 0); outline(lo, 0.02); g.add(lo);
  const hi = mesh(new THREE.BoxGeometry(0.3 * k, 0.045 * k, 0.15 * k), toonMat("#ffd84a", { emissive: "#b07800", emissiveIntensity: 0.5 }), 0, 0.0925 * k, 0); outline(hi, 0.015); g.add(hi);
  g.position.y = 0; g.userData.h = 0.115 * k; return g;
};
const BLOB = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false });
void BLOB;
const grp = (c: ActCtx) => { const g = new THREE.Group(); g.position.set(c.heroAt[0], c.heroAt[1], c.heroAt[2]); c.root.add(g); return g; };
const P = (c: ActCtx, x: number, y: number, z: number) => new Vec(c.heroAt[0] + x, c.heroAt[1] + y, c.heroAt[2] + z);
const glowTex = (() => { let t: THREE.Texture | null = null; return () => t ?? (t = canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,230,150,1)"); r.addColorStop(0.35, "rgba(255,200,80,0.55)"); r.addColorStop(1, "rgba(255,170,40,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); })); })();
const glowPlane = (parent: THREE.Object3D, w: number, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.set(x, y, z); m.renderOrder = 5; parent.add(m); return m;
};
/** a neon sign in the world (drawCard "sign"), pops with popAt() */
const textSign = (parent: THREE.Object3D, text: string, w: number, bg: string, fg: string, x: number, y: number, z: number, kind: "sign" | "white" = "sign") => {
  const W = 1100, H = 700, tex = drawCard({ text, kind, bg, fg }, W, H);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * H) / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.visible = false; m.renderOrder = 6; parent.add(m); return m;
};
const popAt = (o: THREE.Object3D, a: number, k = 1, dur = 0.3) => { o.visible = a >= 0; o.scale.setScalar(k * back(a / dur)); };
/** thing scaled to height h, standing on y = 0 of the returned group */
const thing = (name: string, h: number, opts: { color?: string; text?: string } = {}) => {
  const th = makeThing(name, opts), g = new THREE.Group(); th.root.scale.setScalar(h / th.size); g.add(th.root); return { g, th };
};
type Burst = (a: number) => void;
const CONF = ["#ff4d6d", "#ffc21f", "#3ad1ff", "#7cff6b", "#ffffff", "#b06bff"];
/** deterministic particle fountain; call with seconds since it went off */
const burst = (parent: THREE.Object3D, o: THREE.Vector3, n: number, seed: number, kind: "star" | "confetti" | "coin" | "bill",
  op: { sp?: number; up?: number; g?: number; life?: number; sz?: number } = {}): Burst => {
  const rnd = seeded(seed * 97 + 13), sp = op.sp ?? 2.2, up = op.up ?? 2.6, gr = op.g ?? 7, life = op.life ?? 1.2, sz = op.sz ?? 1;
  const geo = kind === "confetti" ? new THREE.PlaneGeometry(0.11, 0.07) : kind === "star" ? new THREE.OctahedronGeometry(0.075) : kind === "coin" ? new THREE.CylinderGeometry(0.075, 0.075, 0.016, 12) : new THREE.PlaneGeometry(0.24, 0.12);
  const cols = kind === "confetti" ? CONF : kind === "star" ? ["#fff3a6", "#ffffff", "#ffd23a"] : kind === "coin" ? ["#f6c21f", "#ffe27a"] : ["#4fcf74", "#8fe3a4"];
  const mats = cols.map((cc) => new THREE.MeshBasicMaterial({ color: cc, side: THREE.DoubleSide, toneMapped: false }));
  const items = Array.from({ length: n }, (_, i) => {
    const m = new THREE.Mesh(geo, mats[i % mats.length]); m.visible = false; m.renderOrder = 4; parent.add(m);
    const a = rnd() * PI * 2, e = 0.3 + rnd() * 0.9;
    return { m, v: new Vec(Math.cos(a) * sp * e, up * (0.45 + rnd() * 0.8), Math.sin(a) * sp * e * 0.5), w: new Vec(rnd() * 12, rnd() * 12, rnd() * 12), d: rnd() * 0.12 };
  });
  return (a) => { for (const it of items) { const q = a - it.d;
    if (q < 0 || q > life) { it.m.visible = false; continue; }
    it.m.visible = true; it.m.position.set(o.x + it.v.x * q, o.y + it.v.y * q - 0.5 * gr * q * q, o.z + it.v.z * q);
    it.m.rotation.set(it.w.x * q, it.w.y * q, it.w.z * q); it.m.scale.setScalar(sz * (kind === "star" ? 1 - 0.85 * (q / life) ** 2 : 1)); } };
};
/** confetti falling from above across an area, starting `a` seconds after the trigger */
const rain = (parent: THREE.Object3D, cx: number, cz: number, wx: number, top: number, n: number, seed: number): Burst => {
  const rnd = seeded(seed * 53 + 7), geo = new THREE.PlaneGeometry(0.12, 0.075);
  const mats = CONF.map((cc) => new THREE.MeshBasicMaterial({ color: cc, side: THREE.DoubleSide, toneMapped: false }));
  const items = Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(geo, mats[i % mats.length]); m.visible = false; m.renderOrder = 4; parent.add(m);
    return { m, x: cx + (rnd() - 0.5) * wx, z: cz + (rnd() - 0.5) * 1.6, d: rnd() * 0.5, sp: 1.6 + rnd() * 1.2, ph: rnd() * 6, w: 4 + rnd() * 8 }; });
  return (a) => { for (const it of items) { const q = a - it.d, y = top - it.sp * q;
    if (q < 0 || y < 0.04) { it.m.visible = false; continue; }
    it.m.visible = true; it.m.position.set(it.x + Math.sin(q * 3 + it.ph) * 0.18, y, it.z); it.m.rotation.set(q * it.w, q * it.w * 0.7 + it.ph, q * 3); } };
};
/** expanding rings (DING / pulse) at a world point, facing +z */
const rings = (parent: THREE.Object3D, o: THREE.Vector3, color: string, n = 3): Burst => {
  const geo = new THREE.RingGeometry(0.9, 1, 40), items = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.position.copy(o); m.renderOrder = 5; parent.add(m); return m; });
  return (a) => items.forEach((m, i) => { const q = (a - i * 0.12) / 0.55; if (q < 0 || q > 1) { m.visible = false; return; } m.visible = true; m.scale.setScalar(0.15 + 0.9 * q); (m.material as THREE.MeshBasicMaterial).opacity = 1 - q; });
};

// ---------------------------------------------------------------- a stock-chart screen
const chartScreen = (w: number, h: number, kind: "up" | "down", title: string, seed: number) => {
  const WW = 640, HH = Math.round((640 * h) / w), rnd = seeded(seed * 31 + 7), N = 38, vals: number[] = [];
  for (let i = 0; i <= N; i++) { const x = i / N, base = kind === "up" ? 0.1 + 0.82 * Math.pow(x, 2.3) : 0.86 - 0.8 * sm((x - 0.25) / 0.62);
    vals.push(cl(base + (rnd() - 0.5) * (kind === "up" ? 0.08 : 0.07) * (kind === "down" && x > 0.3 ? 0.5 : 1), 0.04, 0.95)); }
  const tex = canvasTex(WW, HH, () => { /* drawn by draw() */ }), cv = tex.image as HTMLCanvasElement, g = cv.getContext("2d")!;
  const col = kind === "up" ? "#3ee07a" : "#ff4a4a", g0 = new THREE.Group();
  bx(g0, w + 0.16, h + 0.16, 0.09, "#26262e", 0, 0, 0, 0.025);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.position.z = 0.048; g0.add(face);
  let last = -1;
  const draw = (p: number) => {
    p = Math.round(cl(p) * 400) / 400; if (p === last) return; last = p;
    g.fillStyle = kind === "up" ? "#06150e" : "#190808"; g.fillRect(0, 0, WW, HH);
    g.strokeStyle = kind === "up" ? "#143a28" : "#3a1414"; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, (HH * i) / 6); g.lineTo(WW, (HH * i) / 6); g.stroke(); }
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo((WW * i) / 8, 0); g.lineTo((WW * i) / 8, HH); g.stroke(); }
    const L = 44, R = WW - 44, T = HH * 0.26, B = HH - 46, n = p * N, full = Math.floor(n), fr = n - full;
    const pt = (i: number): [number, number] => [L + ((R - L) * i) / N, B - (B - T) * vals[i]];
    const pts: [number, number][] = []; for (let i = 0; i <= full && i <= N; i++) pts.push(pt(i));
    if (full < N) { const a = pt(full), b = pt(full + 1); pts.push([mix(a[0], b[0], fr), mix(a[1], b[1], fr)]); }
    if (pts.length > 1) {
      g.beginPath(); g.moveTo(pts[0][0], B); pts.forEach((q) => g.lineTo(q[0], q[1])); g.lineTo(pts[pts.length - 1][0], B); g.closePath();
      const gr = g.createLinearGradient(0, T, 0, B); gr.addColorStop(0, col + "99"); gr.addColorStop(1, col + "00"); g.fillStyle = gr; g.fill();
      g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineJoin = "round"; g.lineCap = "round";
      g.strokeStyle = col; g.lineWidth = 15; g.shadowColor = col; g.shadowBlur = 22; g.stroke(); g.shadowBlur = 0;
      const e = pts[pts.length - 1]; g.beginPath(); g.arc(e[0], e[1], 19, 0, PI * 2); g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 8; g.strokeStyle = col; g.stroke();
    }
    g.textAlign = "left"; g.textBaseline = "middle"; g.font = '900 54px "Arial Black", Arial, sans-serif'; g.fillStyle = "#cfe8d8"; g.fillText(title, 40, 52);
    g.textAlign = "right"; g.font = '900 96px "Arial Black", Arial, sans-serif'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 18;
    g.fillText((kind === "up" ? "+" : "-") + Math.round(p * (kind === "up" ? 420 : 87)) + "%", WW - 36, HH * 0.15 + 20); g.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  draw(0);
  return { g: g0, draw };
};

// ---------------------------------------------------------------- a cash register (front towards +z)
const screenCache = new Map<string, THREE.Material>();
const lcd = (text: string, fg = "#1b3a12", bg = "#b8e0a0") => {
  const k = text + fg + bg; let m = screenCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(256, 128, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 256, 128); g.fillStyle = fg; g.font = '900 78px "Arial Black", Arial, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 66); }) }); screenCache.set(k, m); }
  return m;
};
const makeRegister = () => {
  const g = new THREE.Group();
  bx(g, 0.8, 0.3, 0.56, "#d9d2bf", 0, 0.15, 0);
  bx(g, 0.82, 0.05, 0.58, "#b8452e", 0, 0.3, 0);
  const drawer = new THREE.Group(); drawer.position.set(0, 0.1, 0); g.add(drawer);
  bx(drawer, 0.7, 0.11, 0.5, "#6e5230", 0, 0, 0);
  bx(drawer, 0.76, 0.15, 0.04, "#a07d46", 0, 0, 0.27);
  for (let i = 0; i < 3; i++) for (const [dx, dz] of [[-0.2, -0.1], [0.2, -0.1], [-0.2, 0.1], [0.2, 0.1]]) bx(drawer, 0.16, 0.12 + 0.012 * i, 0.12, i % 2 ? "#3fae5e" : "#7fd08a", dx, 0.1, dz + i * 0.0, 0.012).visible = i === 0;
  const dispMat = (m: THREE.Material) => { screen.material = m; };
  const stand = new THREE.Group(); stand.position.set(0, 0.34, -0.12); g.add(stand);
  bx(stand, 0.46, 0.34, 0.07, "#2a2a32", 0, 0.2, 0).rotation.x = -0.3;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.19), lcd("0.00")); screen.position.set(0, 0.215, 0.05); screen.rotation.x = -0.3; stand.add(screen);
  const pad = new THREE.Group(); pad.position.set(0, 0.34, 0.13); pad.rotation.x = 0.18; g.add(pad);
  bx(pad, 0.54, 0.05, 0.28, "#3a3a46", 0, 0, 0, 0.015);
  const keys: THREE.Mesh[] = [];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) keys.push(bx(pad, 0.09, 0.03, 0.065, ["#ff5a5a", "#f2c230", "#5ac8ff", "#ffffff"][(r + q) % 4], -0.19 + q * 0.127, 0.04, -0.07 + r * 0.075, 0.008));
  const bell = ball(g, 0.05, "#f7b92b", 0.3, 0.37, -0.22, 0.012);
  void bell;
  return { g, drawer, keys, pad, setDrawer: (k: number) => { drawer.position.z = 0.45 * k; }, setScreen: dispMat };
};

// ---------------------------------------------------------------- characters used as partners / crowd
const SUIT: Look = { body: "#1f3b6e", legs: "#15213f", hat: "hair", hair: "#2a1d16", tie: "#e0b030", shirt: "#ffffff" };
const hat = (col: string, k = 1) => {
  const g = new THREE.Group(), dome = mesh(new THREE.SphereGeometry(0.46, 18, 10, 0, PI * 2, 0, PI / 2), toonMat(col)); dome.scale.y = 0.85; outline(dome, 0.03); g.add(dome);
  cyl(g, 0.52, 0.045, col, 0, 0.0, 0.0, 0.015);
  const rib = bx(g, 0.1, 0.36, 0.9, col, 0, 0.2, 0, 0.0); rib.scale.set(1, 1, 1); rib.visible = false;
  g.scale.setScalar(k); return g;
};

// ================================================================= acts
/** expression timeline: [[from-second, expr], ...] -> the last entry whose time has passed */
type EL = [number, Expr][];
const ex = (t: number, l: EL): Expr => { let e = l[0][1]; for (const [a, x] of l) if (t >= a) e = x; return e; };
/** a contract page whose signature draws itself (p 0 -> 1) */
const sigPaper = () => {
  const w = 256, h = 192, N = 48, tex = canvasTex(w, h, () => { /* drawn by draw() */ }), cv = tex.image as HTMLCanvasElement, g = cv.getContext("2d")!;
  const pts: [number, number][] = []; for (let i = 0; i <= N; i++) { const u = i / N; pts.push([36 + 150 * u, 160 - 24 * Math.sin(u * 15) * (1 - 0.35 * u) - 14 * u]); }
  let last = -1;
  const draw = (p: number) => {
    const n = Math.round(cl(p) * N); if (n === last) return; last = n;
    g.fillStyle = "#fdfbf4"; g.fillRect(0, 0, w, h); g.strokeStyle = "#141018"; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#1a1a1a"; g.font = '900 26px "Arial Black", Arial'; g.textAlign = "center"; g.fillText("CONTRACT", w / 2, 40);
    g.fillStyle = "#9a9a9a"; for (let i = 0; i < 4; i++) g.fillRect(24, 58 + i * 18, w - 48, 7);
    g.fillStyle = "#d62f3a"; g.font = '900 24px Arial'; g.textAlign = "left"; g.fillText("X", 14, 172);
    g.strokeStyle = "#141018"; g.lineWidth = 3; g.beginPath(); g.moveTo(34, 172); g.lineTo(w - 24, 172); g.stroke();
    if (n > 0) { g.strokeStyle = "#1b3a9c"; g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); pts.slice(0, n + 1).forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
    tex.needsUpdate = true;
  };
  draw(0); return { tex, draw };
};

const handshake_deal: ActDef = { pose: "stand", view: "actm", build(c): ActRun {
  const { root, hero } = c, G = grp(c);
  hero.root.position.set(c.heroAt[0] + 0.25, c.heroAt[1], c.heroAt[2]); hero.root.rotation.y = 0.8;
  const dealer = makeExtra(SUIT); dealer.root.position.set(c.heroAt[0] + 1.35, c.heroAt[1], c.heroAt[2]); dealer.root.rotation.y = -0.8; root.add(dealer.root);
  // a low desk BEHIND the shake with the contract tilted up on it (never in front of the hands)
  const DX = 0.8;
  bx(G, 1.25, 0.07, 0.5, "#7a4f2f", DX, 0.74, -0.6); bx(G, 1.2, 0.7, 0.05, "#5f3b22", DX, 0.37, -0.82); for (const sx of [-1, 1]) bx(G, 0.05, 0.7, 0.46, "#5f3b22", DX + sx * 0.6, 0.37, -0.6);
  const pp = sigPaper();
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshBasicMaterial({ map: pp.tex, toneMapped: false, side: THREE.DoubleSide }));
  paper.position.set(DX, 1.0, -0.45); paper.rotation.x = -0.5; G.add(paper);
  const stamp = textSign(G, "DEAL", 0.42, "#c0141f", "#ffffff", DX, 1.02, -0.36, "white"); stamp.rotation.set(-0.5, 0, 0.18);
  const big = textSign(G, "DEAL!", 1.3, "#0d3b1e", "#7dff9a", DX, 2.5, -0.3);
  const M = P(c, DX, 1.12, 0.22);
  const spark = burst(G, new Vec(DX, 1.3, 0.25), 18, c.seed, "star", { sp: 1.2, up: 1.8, life: 0.8 }), conf = burst(G, new Vec(DX, 2.2, 0.0), 40, c.seed + 3, "confetti", { sp: 2.0, up: 2.0, g: 6, life: 1.6 });
  const TS = 1.0, TC = 0.5;
  const HE: EL = [[0, "focus"], [TC, "grin"], [TS, "laugh"]], DE: EL = [[0, "smile"], [TC, "grin"], [TS, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE);
    hero.set(t, "stand", he); dealer.set(t + 0.5, "stand", ex(t, DE));
    const r = seg(t, 0.12, TC), pump = Math.sin((t - TC) * 17) * 0.06 * seg(t, TC, TC + 0.1) * (1 - seg(t, 1.5, 1.75));
    for (const [ch, off] of [[hero, -0.05], [dealer, 0.05]] as [Char, number][]) {
      const hp = new Vec(M.x + off, M.y + pump, M.z);
      const s = sideTo(ch, M), o = rest(ch, s);
      armW(ch, s, lerpV(o, hp, r), [s === "r" ? 1.1 : -1.1, -0.6, -0.2]);
      const so = s === "r" ? "l" : "r"; armW(ch, so, rest(ch, so, -0.5, 0.05));
    }
    pp.draw(seg(t, TC + 0.05, TS));   // the signature goes on as the hands clasp
    popAt(big, t - TS - 0.05); big.rotation.z = -0.05; popAt(stamp, t - TS, 1, 0.16); stamp.scale.multiplyScalar(1 + 1.6 * (1 - seg(t - TS, 0, 0.14)));
    spark(t - TC - 0.05); conf(t - TS - 0.05);
    return { pose: "stand", t, expr: he };
  } };
} };

const ring_bell: ActDef = { pose: "stand", view: "actm", build(c): ActRun {
  const { hero } = c, G = grp(c);
  hero.root.rotation.y = 0.85;
  const BX = 1.1, BS = 1.15;
  bx(G, 0.95, 1.0, 0.7, "#1f2f66", BX, 0.5, 0.0); bx(G, 1.02, 0.07, 0.76, "#f7b92b", BX, 1.035, 0.0, 0.015); bx(G, 0.6, 0.16, 0.05, "#f7b92b", BX, 0.55, 0.36, 0.01);
  const pts = [[0.04, 0.66], [0.15, 0.64], [0.26, 0.55], [0.32, 0.4], [0.36, 0.24], [0.43, 0.09], [0.5, 0.0], [0.5, -0.04], [0.38, -0.04], [0.0, 0.0]].map((p) => new THREE.Vector2(p[0], p[1])).reverse();
  const bellG = new THREE.Group(); bellG.position.set(BX, 1.07, 0.0); G.add(bellG);
  const body = mesh(new THREE.LatheGeometry(pts, 32), GOLD()); outline(body, 0.035); body.scale.setScalar(BS); bellG.add(body);
  ball(bellG, 0.07, "#f7b92b", 0, 0.66 * BS + 0.07, 0, 0.015);
  const sc = chartScreen(2.4, 1.6, "up", "IPO  $ACME", c.seed); sc.g.position.set(BX + 0.2, 2.8, -1.1); G.add(sc.g);
  const MS = 1.5, mallet = new THREE.Group(); mallet.scale.setScalar(MS); G.add(mallet);
  cyl(mallet, 0.03, 0.46, "#8a5a2c", 0, 0.2, 0, 0.012); const mh = cyl(mallet, 0.085, 0.24, "#c98a45", 0, 0.46, 0, 0.015); mh.rotation.z = PI / 2;
  const TH = 0.78, ANGS = 1.15;
  // strike: the mallet head (0.46 along the handle) lands on the bell's side at y 1.5
  const surfX = BX - 0.34 * BS, headT = new Vec(surfX - 0.12, 1.5, 0.12), hitHand = headT.clone().sub(new Vec(Math.sin(ANGS) * 0.46 * MS, Math.cos(ANGS) * 0.46 * MS, 0)).add(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2]));
  const ding = rings(G, new Vec(BX, 2.1, 0.55), "#ffe27a", 3), spark = burst(G, new Vec(surfX, 1.5, 0.3), 20, c.seed, "star", { sp: 1.6, up: 1.8, life: 0.8 });
  const rn = rain(G, BX, -0.3, 3.0, 4.6, 70, c.seed), cb = burst(G, new Vec(BX, 2.4, 0.3), 30, c.seed + 5, "confetti", { sp: 2.8, up: 3.4, g: 6, life: 1.8 });
  const dingSign = textSign(G, "DING!", 1.2, "#3a2a00", "#ffd23a", BX - 0.2, 3.2, 0.35); dingSign.rotation.z = 0.08;
  const HE: EL = [[0, "grin"], [0.12, "effort"], [0.5, "shout"], [TH + 0.28, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE);
    hero.set(t, "stand", he);
    const sw = seg(t, 0.12, 0.5), strike = seg(t, 0.5, TH), after = seg(t, TH + 0.02, TH + 0.35);
    const hand = new Vec();
    const hip = rest(hero, "r", -0.5, 0.15), up = P(c, -0.1, 2.15, -0.05);
    hand.copy(lerpV(hip, up, sw)); if (t >= 0.5) hand.copy(lerpV(up, hitHand, strike)); if (t >= TH) hand.copy(lerpV(hitHand, P(c, 0.35, 2.45, 0.1), after));
    const ang = mix(mix(-0.35, -0.5, sw), ANGS, strike) * (1 - after) + after * 0.5;   // mallet tilt (0 = up, +90deg = pointing at the bell)
    armW(hero, "r", hand, [1, -0.1, -0.7]);
    const lh = lerpV(rest(hero, "l", -0.5, 0.1), P(c, -0.5, 2.3, 0.0), after);
    armW(hero, "l", lh, [-1.1, -0.3, -0.5]);
    mallet.position.copy(hand).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])); mallet.rotation.set(0, 0, -ang);
    const a = t - TH;
    bellG.rotation.z = a > 0 ? 0.13 * Math.exp(-4.5 * a) * Math.sin(34 * a) : 0; bellG.scale.setScalar(1 + (a > 0 ? 0.03 * Math.exp(-6 * a) * Math.sin(40 * a) : 0));
    sc.draw(lin(t, 0, 2.0) ** 1.2);   // the stock chart climbs
    ding(a); spark(a); rn(a - 0.05); cb(a); popAt(dingSign, a - 0.02, 1, 0.22);
    return { pose: "stand", t, expr: he };
  } };
} };

const ribbon_cut: ActDef = { pose: "stand", view: "actm", build(c): ActRun {
  const SX = 0.7;
  const { hero } = c, G = grp(c);
  hero.root.position.set(c.heroAt[0] - 0.4 + SX, c.heroAt[1], c.heroAt[2] - 0.2); hero.root.rotation.y = 0.85;
  // storefront (painted) with a striped awning, kept behind the hero
  const tex = canvasTex(720, 720, (g) => {
    g.fillStyle = "#b8523a"; g.fillRect(0, 0, 720, 720); g.strokeStyle = "#8f3a28"; g.lineWidth = 3;
    for (let y = 0; y < 720; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(720, y); g.stroke(); for (let x = (y / 36) % 2 ? 0 : 36; x < 720; x += 72) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 36); g.stroke(); } }
    g.fillStyle = "#16141c"; g.fillRect(40, 40, 640, 120); g.fillStyle = "#ffd23a"; g.font = '900 60px "Arial Black", Arial'; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = "#ffb000"; g.shadowBlur = 20; g.fillText("GRAND OPENING", 360, 102); g.shadowBlur = 0;
    g.fillStyle = "#8fd8ff"; g.fillRect(50, 330, 240, 300); g.fillRect(330, 250, 340, 380);
    g.fillStyle = "#c8ecff"; for (const [x, y, w, h] of [[60, 340, 90, 280], [340, 260, 120, 360]]) g.fillRect(x, y, w, h);
    g.strokeStyle = "#141018"; g.lineWidth = 12; g.strokeRect(50, 330, 240, 300); g.strokeRect(330, 250, 340, 380); g.beginPath(); g.moveTo(500, 250); g.lineTo(500, 630); g.stroke();
    g.fillStyle = "#141018"; g.fillRect(470, 420, 14, 70); g.fillRect(516, 420, 14, 70); });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.position.set(0.55 + SX, 1.85, -1.8); G.add(face);
  const aw = new THREE.Group(); aw.position.set(0.55 + SX, 2.75, -1.65); G.add(aw);
  for (let i = 0; i < 10; i++) { const m = bx(aw, 0.37, 0.07, 0.62, i % 2 ? "#ffffff" : "#d8342c", -1.67 + i * 0.37, 0, 0, 0.012); m.rotation.x = 0.35; }
  const XL = -0.62 + SX, XR = 1.05 + SX, RY = 1.05, RZ = 0.5;
  for (const x of [XL, XR]) { cyl(G, 0.2, 0.05, "#2a2a32", x, 0.03, RZ, 0.012); cyl(G, 0.035, RY + 0.1, "#c9ccd6", x, (RY + 0.1) / 2, RZ, 0.012); ball(G, 0.07, GOLD(), x, RY + 0.17, RZ, 0.012); }
  // ribbon: two halves (pivot at each post) that fall once cut
  const CUTX = 0.42 + SX, ribMat = toonMat("#e0243a");
  const left = new THREE.Group(), right = new THREE.Group(); left.position.set(XL, RY, RZ); right.position.set(XR, RY, RZ); G.add(left, right);
  bx(left, CUTX - XL, 0.16, 0.012, ribMat, (CUTX - XL) / 2, 0, 0, 0.012); bx(right, XR - CUTX, 0.16, 0.012, ribMat, -(XR - CUTX) / 2, 0, 0, 0.012);
  // giant scissors; local +x = blade direction, rings behind the pivot
  const SC = 1.25, S = P(c, 0.02 + SX, 1.12, 0.1), dir = new Vec(0.87, 0, 0.49), yaw = Math.atan2(-dir.z, dir.x);
  const sc = new THREE.Group(); sc.position.copy(S).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])); sc.rotation.y = yaw; sc.scale.setScalar(SC); G.add(sc);
  const mkHalf = (ringCol: string) => {
    const h = new THREE.Group(), sh = new THREE.Shape(); sh.moveTo(-0.05, -0.075); sh.lineTo(0.95, -0.005); sh.lineTo(-0.05, 0.075); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); geo.translate(0, 0, -0.02);
    const b = mesh(geo, toonMat("#eef3fb", { emissive: "#8a96ad", emissiveIntensity: 0.35 })); outline(b, 0.025); h.add(b);
    bx(h, 0.3, 0.05, 0.05, ringCol, -0.17, 0, 0, 0.012);
    const rg = mesh(new THREE.TorusGeometry(0.115, 0.035, 8, 22), toonMat(ringCol)); rg.position.set(-0.4, 0, 0); outline(rg, 0.015); h.add(rg);
    return h;
  };
  const hA = mkHalf("#e0343a"), hB = mkHalf("#e0343a"); sc.add(hA, hB); ball(sc, 0.05, "#444", 0, 0, 0.04, 0.01);
  const hands = { a: new Vec(), b: new Vec() };
  const cutFx = burst(G, new Vec(CUTX, RY, RZ + 0.1), 26, c.seed, "star", { sp: 1.7, up: 2, life: 0.8 }), cf = burst(G, new Vec(CUTX, RY + 0.4, RZ), 40, c.seed + 2, "confetti", { sp: 2.6, up: 3.2, g: 6, life: 1.6 });
  const TC = 1.05, open = (t: number) => mix(0.04, 0.5, seg(t, 0.35, 0.8)) * (1 - seg(t, 0.9, TC)) + 0.04 * seg(t, 0.9, TC);
  const HE: EL = [[0, "focus"], [0.8, "shout"], [TC + 0.2, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE);
    hero.set(t, "stand", he);
    const th = Math.max(0.02, open(t)); hA.rotation.z = th; hB.rotation.z = -th;
    sc.position.y = (1.12 + 0.04 * seg(t, 0, 0.4)) - c.heroAt[1]; sc.updateMatrixWorld(true);
    const ringW = (h: THREE.Group, out: THREE.Vector3) => { h.updateMatrixWorld(true); return out.set(-0.4, 0, 0).applyMatrix4(h.matrixWorld); };
    ringW(hA, hands.a); ringW(hB, hands.b);
    armW(hero, sideTo(hero, hands.a), hands.a); armW(hero, sideTo(hero, hands.a) === "r" ? "l" : "r", hands.b);
    const a = t - TC;
    left.rotation.z = a <= 0 ? -0.03 : -1.5 * (bounce(a / 0.8)) + 0.1 * Math.exp(-3 * a) * Math.sin(14 * a);
    right.rotation.z = a <= 0 ? 0.03 : 1.5 * (bounce(a / 0.8 - 0.05)) - 0.1 * Math.exp(-3 * a) * Math.sin(14 * a);
    cutFx(a); cf(a);
    return { pose: "stand", t, expr: he };
  } };
} };

const stack_gold: ActDef = { pose: "stand", view: "ms", build(c): ActRun {
  const { hero } = c, G = grp(c);
  hero.root.position.set(c.heroAt[0] - 0.02, c.heroAt[1], c.heroAt[2] - 0.2); hero.root.rotation.y = 0.35;
  const XC = -0.52, XP = 0.64, BZ = 0.15, TOP = 0.76, BH = 0.115 * 1.25, N = 4, T0 = 0.1, DT = 0.45;
  bx(G, 2.2, 0.08, 0.62, "#8a5a2c", 0.07, TOP - 0.04, BZ); for (const sx of [-1, 1]) bx(G, 0.08, TOP - 0.08, 0.5, "#6b4328", 0.07 + sx * 1.0, (TOP - 0.08) / 2, BZ);
  const bars = (n: number) => Array.from({ length: n }, () => { const b = goldBar(1.25); G.add(b); return b; });
  const col = bars(N), pile = bars(2 + N);
  col.forEach((b, i) => b.position.set(XC, TOP + i * BH, BZ));
  pile.forEach((b, i) => { b.position.set(XP, TOP + i * BH, BZ); b.visible = i < 2; });
  const sC = sideTo(hero, new Vec(c.heroAt[0] + XC, 1.3, c.heroAt[2] + BZ)), sP = sC === "r" ? "l" : "r";
  const spark = Array.from({ length: N }, (_, k) => burst(G, new Vec(XP, TOP + (2 + k) * BH + 0.25, BZ + 0.1), 8, c.seed + k, "star", { sp: 0.9, up: 1.2, life: 0.55, sz: 0.8 }));
  const plusSign = textSign(G, "+$$$", 1.2, "#3a2a00", "#ffd23a", XP, 2.7, 0.2);
  const glow = glowPlane(G, 2.0, XP, 1.5, -0.3);
  const HE = (t: number, u: number, active: boolean): Expr => (t < T0 ? "grin" : active ? (u < 0.62 ? "effort" : "grin") : t >= T0 + N * DT ? "smug" : "grin");
  return { tick(t) {
    const k = Math.min(N - 1, Math.max(0, Math.floor((t - T0) / DT))), u = (t - T0 - k * DT) / DT, active = t >= T0 && t < T0 + N * DT;
    const he = HE(t, u, active);
    hero.set(t, "stand", he);
    const src = new Vec(XC, TOP + (N - 1 - k) * BH + BH / 2, BZ), dst = new Vec(XP, TOP + (2 + k) * BH, BZ);
    const wsrc = src.clone().add(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])), wdst = dst.clone().add(new Vec(c.heroAt[0], c.heroAt[1] + BH / 2, c.heroAt[2]));
    col.forEach((b, i) => { const idx = N - 1 - i; b.visible = !(idx < k || (idx === k && active && u > 0.02) || (!active && t >= T0 + N * DT)); });
    pile.forEach((b, i) => { if (i >= 2) b.visible = (i - 2) < k || ((i - 2) === k && active && u > 0.62) || t >= T0 + N * DT; });
    const hc = wsrc.clone().add(new Vec(sC === "r" ? 0.17 : -0.17, 0.12, 0.04)), hp0 = wdst.clone().add(new Vec(0, 0.45, 0.15)), hp1 = wdst.clone().add(new Vec(sP === "r" ? 0.17 : -0.17, 0.12, 0.05));
    let cH = rest(hero, sC, -0.45, 0.2), pH = rest(hero, sP, -0.45, 0.2), bp = wsrc.clone();
    if (active) {
      const g1 = seg(u, 0, 0.22), g2 = seg(u, 0.22, 0.5), g3 = seg(u, 0.55, 0.85);
      cH = lerpV(lerpV(rest(hero, sC, -0.45, 0.2), hc, g1), rest(hero, sC, -0.45, 0.2), g2);
      pH = lerpV(lerpV(rest(hero, sP, -0.45, 0.2), hp0, seg(u, 0.1, 0.4)), hp1, g3);
      if (u < 0.22) bp = wsrc.clone().add(new Vec(0, 0.02 * g1, 0));
      else if (u < 0.62) { const a = (u - 0.22) / 0.4; bp = wsrc.clone().lerp(wdst, seg(a, 0, 1)); bp.y += 0.13 * Math.sin(PI * a); bp.z += 0.15 * Math.sin(PI * a); }
      else bp = wdst.clone();
    }
    armW(hero, sC, cH); armW(hero, sP, pH);
    if (active) { const b = pile[2 + k]; if (u >= 0.02 && u < 0.62) { b.visible = true; b.position.copy(bp).sub(new Vec(c.heroAt[0], c.heroAt[1] + BH / 2, c.heroAt[2])); } else if (u >= 0.62) b.position.set(XP, TOP + (2 + k) * BH, BZ); }
    spark.forEach((s, i) => s(t - (T0 + i * DT + DT * 0.66)));
    popAt(plusSign, t - (T0 + N * DT - 0.1), 1, 0.25); glow.visible = t > T0 + N * DT - 0.1; (glow.material as THREE.MeshBasicMaterial).opacity = 0.7;
    return { pose: "stand", t, expr: he };
  } };
} };

/** bills + the drawer: ka-ching */
const registerFx = (G: THREE.Object3D, reg: ReturnType<typeof makeRegister>, at: THREE.Vector3, seed: number) => {
  const bills = burst(G, at, 26, seed, "bill", { sp: 1.0, up: 3.0, g: 6.5, life: 1.3 }), coins = burst(G, at, 10, seed + 1, "coin", { sp: 0.9, up: 2.4, g: 6.5, life: 1.2 });
  return (a: number) => { bills(a); coins(a); reg.setDrawer(seg(a, 0, 0.22)); };
};

const card_swipe: ActDef = { pose: "stand", view: "ms", build(c): ActRun {
  const { hero } = c, G = grp(c);
  hero.root.position.set(c.heroAt[0] - 0.22, c.heroAt[1], c.heroAt[2]); hero.root.rotation.y = 0.85;
  // counter, a card terminal facing the customer, the register further along
  bx(G, 1.6, 1.0, 0.7, "#2e3a63", 0.95, 0.5, 0.05); bx(G, 1.7, 0.06, 0.78, "#e8e1d0", 0.95, 1.03, 0.05, 0.015);
  const term = new THREE.Group(); term.position.set(0.45, 1.06, 0.12); term.rotation.y = 0.55; G.add(term);
  bx(term, 0.1, 0.12, 0.1, "#2a2a32", 0, 0.06, 0, 0.012);
  const tb = bx(term, 0.34, 0.46, 0.06, "#2a2a32", 0, 0.34, 0, 0.018); tb.rotation.x = -0.25;
  const tscr = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.34), lcd("TAP", "#0d3a6e", "#bfe3ff")); tscr.position.set(0, 0.34, 0.032); tscr.rotation.x = -0.25; term.add(tscr);
  const reg = makeRegister(); reg.g.scale.setScalar(1.05); reg.g.position.set(1.15, 1.06, 0.0); G.add(reg.g);
  const card = new THREE.Group(); G.add(card);
  bx(card, 0.3, 0.19, 0.012, "#2a63e0", 0, 0, 0, 0.012); bx(card, 0.06, 0.045, 0.016, "#f7d36a", -0.08, 0.03, 0.003, 0); bx(card, 0.26, 0.025, 0.016, "#ffffff", 0, -0.05, 0.003, 0);
  const dollar = textSign(G, "$", 0.8, "#0d3b1e", "#7dff9a", 0.55, 2.45, 0.3); const ring = rings(G, new Vec(0.5, 1.5, 0.35), "#7dff9a", 3);
  const fx = registerFx(G, reg, new Vec(1.15, 1.45, 0.35), c.seed), spark = burst(G, new Vec(0.5, 1.5, 0.3), 16, c.seed + 4, "star", { sp: 1.4, up: 1.6, life: 0.7 });
  const TT = 0.88, TD = 1.15, tap = P(c, 0.46, 1.46, 0.2);
  const HE: EL = [[0, "smile"], [0.4, "focus"], [TT, "grin"], [TD + 0.1, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE);
    hero.set(t, "stand", he);
    const s = sideTo(hero, tap), o = rest(hero, s, -0.2, 0.3), fwdH = P(c, -0.05, 1.3, 0.3);
    const hold = lerpV(o, fwdH, seg(t, 0.05, 0.4));
    const hpos = t < 0.4 ? hold : t < TT ? lerpV(fwdH, tap.clone().add(new Vec(-0.1, 0, 0.1)), seg(t, 0.4, TT)) : lerpV(tap.clone().add(new Vec(-0.1, 0, 0.1)), P(c, 0.1, 1.0, 0.35), seg(t, TT + 0.1, TT + 0.5));
    armW(hero, s, hpos, [s === "r" ? 1 : -1, -0.5, -0.4]); armW(hero, s === "r" ? "l" : "r", rest(hero, s === "r" ? "l" : "r", -0.5, 0.1));
    card.position.copy(hpos).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])).add(new Vec(0.1, 0.0, 0.0)); card.rotation.set(-0.25, 0.55, 0.0);
    const paid = t > TT + 0.02; tscr.material = paid ? lcd("PAID", "#0b5a1f", "#c8f7d4") : lcd("TAP", "#0d3a6e", "#bfe3ff");
    reg.setScreen(paid ? lcd("$$$", "#0b5a1f", "#c8f7d4") : lcd("0.00"));
    popAt(dollar, t - TT, 1, 0.26); dollar.position.y = 2.45 + 0.12 * Math.sin(Math.max(0, t - TT) * 5); ring(t - TT); spark(t - TT);
    fx(t - TD);
    return { pose: "stand", t, expr: he };
  } };
} };

const cash_register: ActDef = { pose: "stand", view: "ms", build(c): ActRun {
  const { hero } = c, G = grp(c);
  // the hero stands at the END of the counter, turned to the register, whose keypad is angled towards him and us
  hero.root.position.set(c.heroAt[0] - 0.3, c.heroAt[1], c.heroAt[2]); hero.root.rotation.y = 1.0;
  bx(G, 1.7, 0.78, 0.75, "#8a5a2c", 0.8, 0.39, 0.1); bx(G, 1.8, 0.06, 0.82, "#e8e1d0", 0.8, 0.81, 0.1, 0.015); bx(G, 1.5, 0.1, 0.05, "#f7b92b", 0.8, 0.6, 0.485, 0.01);
  const reg = makeRegister(); reg.g.scale.setScalar(1.1); reg.g.position.set(0.28, 0.84, 0.2); reg.g.rotation.y = -0.85; G.add(reg.g);
  bx(G, 0.3, 0.24, 0.24, "#5ac8ff", 1.2, 0.95, 0.1); bx(G, 0.26, 0.28, 0.2, "#a97bff", 0.8, 0.97, -0.05);
  const fx = registerFx(G, reg, new Vec(0.3, 1.5, 0.45), c.seed), spark = burst(G, new Vec(0.3, 1.6, 0.4), 18, c.seed + 4, "star", { sp: 1.5, up: 1.8, life: 0.7 });
  const kching = textSign(G, "KA-CHING!", 1.4, "#0d3b1e", "#7dff9a", 0.6, 2.7, 0.3); kching.rotation.z = -0.05;
  const TD = 1.0, presses = [0.3, 0.5, 0.7, 0.9];
  const keyW = (i: number) => { reg.g.updateMatrixWorld(true); return wp(reg.keys[i]); };
  const HE: EL = [[0, "smile"], [0.25, "focus"], [TD, "grin"], [TD + 0.15, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE);
    hero.set(t, "stand", he);
    const pr = presses.map((p) => Math.exp(-Math.pow((t - p) / 0.06, 2))).reduce((a, b) => Math.max(a, b), 0);
    const ki = t < 0.4 ? 5 : t < 0.6 ? 6 : t < 0.8 ? 10 : 11, key = keyW(ki).add(new Vec(0, 0.1 - 0.07 * pr, 0.0));
    const s = sideTo(hero, key), after = seg(t, TD + 0.1, TD + 0.45);
    const hpos = lerpV(lerpV(rest(hero, s, -0.2, 0.25), key, seg(t, 0.05, 0.28)), P(c, 0.0, 2.2, 0.3), after);
    armW(hero, s, hpos, [s === "r" ? 1.1 : -1.1, -0.4, -0.5]);
    const o = s === "r" ? "l" : "r"; armW(hero, o, lerpV(rest(hero, o, -0.5, 0.15), P(c, -0.5, 2.1, 0.2), after));
    reg.setScreen(t < 0.3 ? lcd("0.00") : t < 0.5 ? lcd("12.99") : t < 0.7 ? lcd("74.50") : t < TD ? lcd("158.0") : lcd("$$$", "#0b5a1f", "#c8f7d4"));
    fx(t - TD); spark(t - TD); popAt(kching, t - TD - 0.05, 1, 0.25);
    return { pose: "stand", t, expr: he };
  } };
} };

const stockChart = (kind: "up" | "down"): ActDef => ({ pose: "stand", view: "actm", build(c): ActRun {
  const { hero } = c, G = grp(c), up = kind === "up";
  hero.root.rotation.y = 0.85;
  const sc = chartScreen(2.5, 2.1, kind, "$ACME", c.seed + (up ? 0 : 5)); sc.g.position.set(1.15, 2.75, -1.1); G.add(sc.g);
  bx(G, 0.14, 0.9, 0.1, "#26262e", 1.15, 1.0, -1.1, 0.01);
  const arrow = thing(up ? "arrowup" : "arrowdown", 1.1); arrow.g.position.set(1.45, 0.3, 0.35); G.add(arrow.g);
  const TP = up ? 0.9 : 0.75;
  const fx = burst(G, new Vec(1.45, 1.0, 0.5), up ? 28 : 14, c.seed, up ? "star" : "bill", { sp: 1.8, up: up ? 2.4 : 1.6, life: 1.0, g: up ? 6 : 3 });
  const money = up ? burst(G, new Vec(0.9, 1.9, 0.4), 22, c.seed + 1, "coin", { sp: 2.2, up: 3.2, g: 6, life: 1.5 }) : burst(G, new Vec(1.0, 3.8, -0.2), 16, c.seed + 2, "confetti", { sp: 1.2, up: 0.2, g: 2.4, life: 1.8 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshBasicMaterial({ color: "#ff2020", transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); flash.position.set(1.15, 2.2, -1.05); G.add(flash);
  return { tick(t) {
    const p = up ? lin(t, 0.05, 1.5) ** 1.15 : lin(t, 0.05, 1.3);
    sc.draw(p);
    let pose: Pose, pt: number, ex2: Expr;
    // up: shock at the first climb -> shout as it rockets -> laugh.  down: shock -> scream as it plunges -> sad shrug (face stays visible)
    if (up) { pose = t < 0.5 ? "stand" : "fistpump"; pt = t < 0.5 ? t : t - 0.5; ex2 = t < 0.5 ? "shock" : t < 1.1 ? "shout" : "laugh"; }
    else { pose = t < 0.45 ? "stand" : t < 1.2 ? "cheer" : "shrug"; pt = t < 0.45 ? t : t < 1.2 ? t - 0.45 : t - 1.2; ex2 = t < 0.45 ? "shock" : t < 1.2 ? "scream" : "sad"; }
    hero.set(pt, pose, ex2);
    const a = t - TP, k = up ? back(a / 0.35) : bounce(a / 0.5);
    arrow.g.visible = a >= 0; arrow.g.scale.setScalar(a >= 0 ? Math.max(0.001, k) : 0.001);
    arrow.g.position.y = up ? 0.3 + 0.05 * Math.sin(Math.max(0, a) * 6) : mix(1.8, 0.3, bounce(a / 0.5));
    fx(a); money(up ? a : t - 0.3);
    (flash.material as THREE.MeshBasicMaterial).opacity = up ? 0 : 0.12 * Math.max(0, Math.sin(Math.max(0, t - 0.2) * 22)) * (1 - lin(t, 0.2, 1.4));
    return { pose, t: pt, expr: ex2 };
  } };
} });

const vault: ActDef = { pose: "stand", view: "actm", build(c): ActRun {
  const { hero } = c, G = grp(c);
  hero.root.rotation.y = 0.55;
  const HX = 1.35, HY = 1.4, R = 0.9, WZ = -1.3;
  const sh = new THREE.Shape(); sh.moveTo(-1.6, 0); sh.lineTo(3.6, 0); sh.lineTo(3.6, 3.9); sh.lineTo(-1.6, 3.9); sh.closePath();
  const hole = new THREE.Path(); hole.absarc(HX, HY, R, 0, PI * 2, true); sh.holes.push(hole);
  const wall = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: false }), toonMat("#6e7a8e")); wall.position.z = WZ - 0.4; G.add(wall);
  const frame = mesh(new THREE.TorusGeometry(R + 0.04, 0.08, 10, 40), toonMat("#454e60")); frame.position.set(HX, HY, WZ + 0.02); outline(frame, 0.02); G.add(frame);
  for (let i = 0; i < 12; i++) { const rv = ball(G, 0.05, "#454e60", HX + Math.cos((i / 12) * PI * 2) * (R + 0.3), HY + Math.sin((i / 12) * PI * 2) * (R + 0.3), WZ + 0.02, 0.01); void rv; }
  const inR = new THREE.Group(); G.add(inR);
  bx(inR, 5, 0.05, 2.2, "#4a3a22", HX, 0.0, WZ - 1.2, 0); bx(inR, 5, 4, 0.05, "#3a3f4c", HX, 1.9, WZ - 2.3, 0); bx(inR, 0.05, 4, 2.2, "#343946", HX - 1.1, 1.9, WZ - 1.2, 0); bx(inR, 0.05, 4, 2.2, "#343946", HX + 1.1, 1.9, WZ - 1.2, 0);
  const rnd = seeded(c.seed * 17 + 3), NC = 230, heap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 12), metalMat("#ffc928", 0.3), NC), mtx = new THREE.Matrix4(), qq = new THREE.Quaternion();
  for (let i = 0; i < NC; i++) { const rr = Math.sqrt(rnd()) * 0.95, an = rnd() * PI * 2, y = 0.9 * Math.pow(1 - rr / 1.0, 1.2) + rnd() * 0.06;
    qq.setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2)); mtx.compose(new Vec(HX + Math.cos(an) * rr, 0.04 + y, WZ - 1.4 + Math.sin(an) * rr * 0.7), qq, new Vec(1, 1, 1)); heap.setMatrixAt(i, mtx); }
  heap.castShadow = false; inR.add(heap);
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4 - r; q++) { const b = goldBar(1.3); b.position.set(HX + 0.62 + (q - (3 - r) / 2) * 0.46, 0.08 + r * 0.14, WZ - 1.1); inR.add(b); }
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3 - r; q++) bx(inR, 0.34, 0.15, 0.22, (q + r) % 2 ? "#3fae5e" : "#5ac877", HX - 0.7 + (q - (2 - r) / 2) * 0.38, 0.08 + r * 0.16, WZ - 1.2, 0.012);
  const light = new THREE.PointLight("#ffd27a", 0, 7, 1.5); light.position.set(HX, 1.6, WZ - 1.0); inR.add(light);
  const glow = glowPlane(G, 4.4, HX, 1.3, WZ - 0.05);
  const HGX = HX - R, door = new THREE.Group(); door.position.set(HGX, HY, WZ + 0.12); G.add(door);
  const disc = mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.26, 40), toonMat("#8e9ab0")); disc.rotation.x = PI / 2; disc.position.x = R; outline(disc, 0.03); door.add(disc);
  const rim = mesh(new THREE.TorusGeometry(R - 0.1, 0.045, 8, 40), toonMat("#59627a")); rim.position.set(R, 0, 0.14); door.add(rim);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; bx(door, 0.1, 0.1, 0.06, "#3d4457", R + Math.cos(a) * (R - 0.25), Math.sin(a) * (R - 0.25), 0.15, 0.01); }
  const wheel = new THREE.Group(); wheel.position.set(R, 0, 0.17); door.add(wheel);
  const wr = mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 28), toonMat("#d8b13a")); outline(wr, 0.015); wheel.add(wr);
  for (let i = 0; i < 3; i++) { const sp = bx(wheel, 0.68, 0.05, 0.05, "#d8b13a", 0, 0, 0, 0.01); sp.rotation.z = (i * PI) / 3; }
  ball(wheel, 0.1, "#d8b13a", 0, 0, 0.03, 0.012);
  const bar = new THREE.Group(); bar.position.set(0.55, 0.0, 0.17); door.add(bar);
  cyl(bar, 0.03, 0.62, "#e8ecf4", 0, 0, 0.12, 0.012); for (const y of [-0.28, 0.28]) bx(bar, 0.05, 0.05, 0.14, "#e8ecf4", 0, y, 0.06, 0.008);
  const coins = burst(G, new Vec(HX, 1.0, WZ - 0.6), 24, c.seed, "coin", { sp: 1.0, up: 2.8, g: 6, life: 1.4 }), stars = burst(G, new Vec(HX, 1.4, WZ - 0.2), 28, c.seed + 2, "star", { sp: 1.7, up: 1.6, life: 1.0 });
  const TO0 = 0.5, TO1 = 1.5;
  const ph = (t: number) => seg(t, TO0, TO1);
  const grips = [new Vec(), new Vec()];
  const HE: EL = [[0, "grin"], [0.3, "effort"], [TO0 + 0.55, "shock"], [TO1 - 0.1, "laugh"]];
  return { tick(t) {
    const o = ph(t), ang = 1.75 * o, he = ex(t, HE);
    // pulls the door open, then steps back and left so the open door never hides the face
    hero.root.position.set(c.heroAt[0] + mix(0.25, -0.55, o), c.heroAt[1], c.heroAt[2] + mix(-0.75, 0.0, o));
    hero.set(t, "stand", he);
    door.rotation.y = -ang; wheel.rotation.z = -3.4 * seg(t, 0, 0.5);
    G.updateMatrixWorld(true); door.updateMatrixWorld(true);
    const lift = 1 - seg(t, TO1 - 0.2, TO1 + 0.2);
    grips[0].set(0, 0.16, 0.25).applyMatrix4(bar.matrixWorld); grips[1].set(0, -0.16, 0.25).applyMatrix4(bar.matrixWorld);
    const sA = sideTo(hero, grips[0]);
    armW(hero, sA, lerpV(P(c, -0.1, 2.0, 0.3), grips[0], lift)); armW(hero, sA === "r" ? "l" : "r", lerpV(P(c, -0.7, 2.1, 0.3), grips[1], lift));
    glow.visible = o > 0.02; (glow.material as THREE.MeshBasicMaterial).opacity = 0.85 * seg(t, TO0, TO0 + 0.6); light.intensity = 3.2 * o;
    coins(t - TO0 - 0.35); stars(t - TO0 - 0.2);
    return { pose: "stand", t, expr: he };
  } };
} };

const hire: ActDef = { pose: "stand", view: "actm", build(c): ActRun {
  const { hero, root } = c, G = grp(c);
  hero.root.rotation.y = 0.8;
  const WX = 1.25, LOOK: Look = { body: "#3d7be0", legs: "#2a3a5a", hat: "hair", hair: "#3a2418" };
  const mk = (l: Look, x: number, z: number, ry: number) => { const w = makeExtra(l); w.root.position.set(c.heroAt[0] + x, c.heroAt[1], c.heroAt[2] + z); w.root.rotation.y = ry; root.add(w.root); return w; };
  const w0 = mk(LOOK, WX, 0, -0.8), w1 = mk({ ...LOOK, hat: "hardhat", hatColor: "#f2c230" }, WX, 0, -0.8); w1.root.visible = false;
  const crowd: [Char, number][] = [];
  [[0.35, -1.5, "#ff8a1a"], [1.6, -1.6, "#ffffff"], [2.55, -1.4, "#f2c230"], [-0.2, -2.7, "#f2c230"], [0.95, -2.8, "#ff8a1a"], [2.0, -2.7, "#ffffff"]].forEach(([x, z, h], i) => {
    const ch = mk({ body: ["#2f7a4a", "#b3472f", "#6a4cc0", "#c28a2a", "#2f6fd8", "#555c6b"][i], legs: "#2a2f40", hat: "hardhat", hatColor: h as string }, x as number, z as number, (i % 2 ? -0.3 : 0.3)); crowd.push([ch, i]);
  });
  const hh = hat("#f2c230", 1.0); G.add(hh);
  const badge = new THREE.Group(); G.add(badge);
  bx(badge, 0.3, 0.4, 0.015, "#ffffff", 0, 0, 0, 0.014); bx(badge, 0.3, 0.075, 0.02, "#2f6fd8", 0, 0.16, 0.002, 0); bx(badge, 0.12, 0.12, 0.02, "#f2c230", 0, 0.03, 0.003, 0); bx(badge, 0.21, 0.025, 0.02, "#9a9a9a", 0, -0.12, 0.003, 0);
  const sign = textSign(G, "HIRED!", 1.4, "#0d3b1e", "#7dff9a", 0.75, 3.1, 0.1); sign.rotation.z = 0.05;
  // a big white glove for the salute so the hand reads
  const glove = new THREE.Group(); G.add(glove); glove.visible = false;
  ball(glove, 0.13, "#ffffff", 0, 0, 0, 0.018); bx(glove, 0.2, 0.05, 0.12, "#ffffff", -0.12, 0.0, 0, 0.012);
  const spark = burst(G, new Vec(WX, 2.0, 0.2), 24, c.seed, "star", { sp: 1.4, up: 2.0, life: 0.9 }), conf = burst(G, new Vec(WX, 2.4, 0.2), 36, c.seed + 2, "confetti", { sp: 2.4, up: 3, g: 6, life: 1.6 });
  const TB = 0.4, TH = 0.85, TS = 1.0;
  const headTop = (): V3 => [WX, w0.headY + 0.28, 0];
  const HE: EL = [[0, "smile"], [TB, "grin"], [TH + 0.1, "laugh"]];
  return { tick(t) {
    const he = ex(t, HE); const hasHat = t >= TH;
    hero.set(t, "stand", he);
    w0.set(t, "stand", "smile"); w1.set(t + 0.2, "stand", t > TS ? "laugh" : "grin"); w0.root.visible = !hasHat; w1.root.visible = hasHat;
    const wk = hasHat ? w1 : w0;
    const sw = sideTo(hero, P(c, WX, 1.5, 0)), sl = sw === "r" ? "l" : "r";
    const hb = lerpV(lerpV(rest(hero, sl, -0.3, 0.2), P(c, 0.5, 1.5, 0.28), seg(t, 0.05, 0.3)), P(c, 0.45, 1.4, 0.25), seg(t, 0.3, TB + 0.1));
    armW(hero, sl, hb);
    const hOff = P(c, 0.55, 1.75, 0.3), hLift = P(c, 0.62, 2.0, 0.15);
    const hr = t < TB ? lerpV(rest(hero, sw, -0.3, 0.2), hOff, seg(t, 0.1, 0.35)) : lerpV(hOff, hLift, seg(t, TB + 0.1, TH));
    armW(hero, sw, lerpV(hr, rest(hero, sw, -0.4, 0.2), seg(t, TH + 0.1, TH + 0.5)));
    // the ID badge flies onto the worker's chest and stays: before -> after
    const flyB = seg(t, TB - 0.05, TB + 0.2), chest = new Vec(c.heroAt[0] + WX - 0.22, c.heroAt[1] + 1.12, c.heroAt[2] + 0.4);
    badge.position.copy(lerpV(wp(hero.hand(sl)).add(new Vec(0, 0.02, 0.05)), chest, flyB)).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])); badge.rotation.set(0, -0.2 * flyB + 0.4, 0);
    if (t >= TB + 0.2) { badge.position.copy(chest).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])); badge.rotation.set(0, 0.35, 0); }
    const ht = headTop(), flyH = lin(t, TB + 0.3, TH), hs = wp(hero.hand(sw)).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])).add(new Vec(0.05, 0.05, 0.0));
    hh.visible = !hasHat; hh.position.set(mix(hs.x, ht[0], flyH), mix(hs.y, ht[1], flyH) + 0.3 * Math.sin(PI * flyH), mix(hs.z, ht[2], flyH)); hh.rotation.z = 0.25 * Math.sin(PI * flyH);
    // salute: the worker's hand to the hard hat brim (big glove drawn on the hand)
    const sa = seg(t, TS - 0.05, TS + 0.2), s = sideTo(wk, P(c, WX + 0.1, 1.9, 0.0)), hy = wk.headY;
    const brow = rigOf(wk).localToWorld(new Vec(s === "r" ? 0.3 : -0.3, hy + 0.22, 0.4));
    if (hasHat) armW(wk, s, lerpV(rest(wk, s, -0.5, 0.1), brow, sa), [s === "r" ? 1.4 : -1.4, 0.3, -0.5]);
    glove.visible = hasHat && sa > 0.01; if (glove.visible) { glove.position.copy(wp(wk.hand(s))).sub(new Vec(c.heroAt[0], c.heroAt[1], c.heroAt[2])); glove.rotation.z = s === "r" ? 0.5 : -0.5; glove.scale.x = s === "r" ? 1 : -1; }
    crowd.forEach(([ch, i]) => ch.set(t + i * 0.37, i % 3 === 0 ? "cheer" : i % 3 === 1 ? "wave" : "stand", "grin"));
    popAt(sign, t - TS - 0.05, 1, 0.28); spark(t - TS); conf(t - TS - 0.05);
    return { pose: "stand", t, expr: he };
  } };
} };

export const BIZ: Record<string, ActDef> = {
  handshake_deal, ring_bell, ribbon_cut, stack_gold, card_swipe, cash_register, stock_up: stockChart("up"), stock_crash: stockChart("down"), vault, hire,
};
