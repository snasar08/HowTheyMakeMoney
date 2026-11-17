// Afterhour creator acts (worker F, Nov 16): gaming, streaming, singing on stage, guitar, filming, rocket launch, building, coding,
// robot building and posting a video. The hero really holds / hits / presses the objects; everything is a pure function of t
// (Ah calls tick() twice per frame: before and after posing the hero, so IK goes in tick and must not depend on call order).
import * as THREE from "three";
import { toonMat, glowMat, outline, canvasTex, seeded } from "../common";
import { makeThing } from "../things3d";
import type { Char, Expr } from "../char";
import type { ActDef, ActCtx, ActRun } from "./types";

type V3 = [number, number, number];
const Vec = THREE.Vector3;
const PI = Math.PI;
const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x: number) => { x = cl(x); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const wp = (o: THREE.Object3D) => o.getWorldPosition(new Vec());
const rigOf = (c: Char) => c.root.children[0] as THREE.Group;
const fwdOf = (c: Char) => new Vec(Math.sin(c.root.rotation.y), 0, Math.cos(c.root.rotation.y));
const hsl = (h: number, s = 1, l = 0.55) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);

// ---------------------------------------------------------------- arm IK (same as sports.ts)
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
/** hand to a rig-space point (x = outward on that arm's side) */
const arm = (c: Char, side: "l" | "r", x: number, y: number, z: number, pole?: V3) => {
  const s = side === "r" ? 1 : -1;
  ik(c, side, new Vec(s * x, y, z), pole ?? [s * 1.2, -0.7, -0.3]);
};
/** hand to a world point */
const armW = (c: Char, side: "l" | "r", p: THREE.Vector3, pole?: V3) => {
  const rig = rigOf(c); c.root.updateMatrixWorld(true);
  const s = side === "r" ? 1 : -1;
  ik(c, side, rig.worldToLocal(p.clone()), pole ?? [s * 1.2, -0.7, -0.3]);
};

// ---------------------------------------------------------------- little builders
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
};
const mat = (col: string | THREE.Material) => (typeof col === "string" ? toonMat(col) : col);
/** toon box with a hard black edge */
const bx = (p: THREE.Object3D, w: number, h: number, d: number, col: string | THREE.Material, x = 0, y = 0, z = 0, ink = 0.02) => {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat(col), x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.BoxGeometry(w + ink * 2, h + ink * 2, d + ink * 2), INK));
  p.add(m); return m;
};
const cy = (p: THREE.Object3D, r: number, h: number, col: string | THREE.Material, x = 0, y = 0, z = 0, ink = 0.016, r2?: number) => {
  const m = mesh(new THREE.CylinderGeometry(r2 ?? r, r, h, 20), mat(col), x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.CylinderGeometry((r2 ?? r) + ink, r + ink, h + ink * 2, 20), INK));
  p.add(m); return m;
};
const sp = (p: THREE.Object3D, r: number, col: string | THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ink = 0.018) => {
  const m = mesh(new THREE.SphereGeometry(r, 20, 14), mat(col), x, y, z); m.scale.set(sx, sy, sz);
  if (ink) outline(m, ink);
  p.add(m); return m;
};
const torus = (p: THREE.Object3D, R: number, r: number, col: string | THREE.Material, x = 0, y = 0, z = 0, ink = 0) => {
  const m = mesh(new THREE.TorusGeometry(R, r, 10, 40), mat(col), x, y, z); if (ink) outline(m, ink); p.add(m); return m;
};
/** a rod between two points */
const rod = (p: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, col: string | THREE.Material, ink = 0.012) => {
  const len = a.distanceTo(b), m = mesh(new THREE.CylinderGeometry(r, r, len, 10), mat(col), 0, 0, 0);
  if (ink) m.add(new THREE.Mesh(new THREE.CylinderGeometry(r + ink, r + ink, len + ink * 2, 10), INK));
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new Vec(0, 1, 0), b.clone().sub(a).normalize());
  p.add(m); return m;
};
const placeAlong = (o: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3) => {   // local +y points along dir
  o.position.copy(pos); o.quaternion.setFromUnitVectors(new Vec(0, 1, 0), dir.clone().normalize());
};
const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const emis = (col: string, k = 1.2) => toonMat(col, { emissive: col, emissiveIntensity: k });
const WOOD = "#b07a42", WOOD2 = "#7a4f2a";
const BLOB = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false });
const blob = (p: THREE.Object3D, r: number, x: number, z: number, y = 0.03) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), BLOB); m.rotation.x = -PI / 2; m.position.set(x, y, z); m.renderOrder = 2; p.add(m); return m;
};

// ---------------------------------------------------------------- textures and sprites
const sprite = (tex: THREE.Texture, w: number, h = w) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 6; return m;
};
const heartTex = (c: string) => canvasTex(64, 64, (g) => {
  g.fillStyle = c; g.strokeStyle = "#151018"; g.lineWidth = 5; g.lineJoin = "round"; g.beginPath(); g.moveTo(32, 57);
  g.bezierCurveTo(0, 36, 4, 6, 25, 9); g.bezierCurveTo(30, 10, 32, 15, 32, 19); g.bezierCurveTo(32, 15, 34, 10, 39, 9); g.bezierCurveTo(60, 6, 64, 36, 32, 57);
  g.closePath(); g.fill(); g.stroke(); g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.ellipse(18, 22, 5, 3, -0.6, 0, PI * 2); g.fill();
});
const noteTex = (c: string, dbl: boolean) => canvasTex(64, 64, (g) => {
  g.fillStyle = c; g.strokeStyle = "#151018"; g.lineWidth = 4; g.lineJoin = "round";
  const head = (x: number, y: number) => { g.beginPath(); g.ellipse(x, y, 11, 8, -0.4, 0, PI * 2); g.fill(); g.stroke(); };
  if (!dbl) { g.fillRect(31, 8, 5, 40); g.strokeRect(31, 8, 5, 40); head(24, 49); g.beginPath(); g.moveTo(36, 8); g.bezierCurveTo(52, 14, 52, 28, 46, 36); g.lineTo(36, 24); g.fill(); g.stroke(); }
  else { g.fillRect(14, 12, 5, 38); g.fillRect(40, 8, 5, 38); g.beginPath(); g.moveTo(14, 10); g.lineTo(45, 5); g.lineTo(45, 17); g.lineTo(14, 22); g.closePath(); g.fill(); g.stroke(); head(10, 51); head(36, 47); }
});
const starTex = (c: string) => canvasTex(64, 64, (g) => {
  g.fillStyle = c; g.strokeStyle = "#151018"; g.lineWidth = 3; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 - PI / 2, r = i % 2 ? 9 : 29; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
});
const bubbleTex = (col: string, l1: number, l2: number) => canvasTex(128, 80, (g) => {
  g.fillStyle = "#ffffff"; g.strokeStyle = "#151018"; g.lineWidth = 5; g.beginPath(); g.roundRect(6, 6, 116, 54, 16); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(26, 58); g.lineTo(20, 76); g.lineTo(46, 58); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#ffffff"; g.fillRect(24, 54, 22, 8);
  g.fillStyle = col; g.beginPath(); g.arc(28, 33, 13, 0, PI * 2); g.fill(); g.strokeStyle = "#151018"; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#2a2f45"; g.fillRect(50, 20, l1, 8); g.fillStyle = "#8a93a8"; g.fillRect(50, 36, l2, 8);
});
const dotTex = (c: string) => canvasTex(32, 32, (g) => { g.fillStyle = c; g.beginPath(); g.arc(16, 16, 14, 0, PI * 2); g.fill(); });

/** a canvas that is redrawn per tick (a pure function of t) */
const liveTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, t: number) => void) => {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!, tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let last = -999;
  return { tex, upd(t: number) { const q = Math.round(t * 60); if (q === last) return; last = q; draw(g, t); tex.needsUpdate = true; } };
};
const screenMat = (tex: THREE.Texture, k = 1.25) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(k, k, k) });
const screenPlane = (p: THREE.Object3D, w: number, h: number, tex: THREE.Texture, x = 0, y = 0, z = 0, k = 1.25) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat(tex, k)); m.position.set(x, y, z); p.add(m); return m;
};
/** a monitor: origin at the floor/desk under the stand centre; returns the group and the screen centre height */
const monitor = (w: number, h: number, standH: number, tex: THREE.Texture, frame = "#1c1e2a") => {
  const g = new THREE.Group(), cyc = standH + h / 2 + 0.04;
  bx(g, w + 0.08, h + 0.08, 0.05, frame, 0, cyc, 0, 0.02);
  screenPlane(g, w, h, tex, 0, cyc, 0.027);
  cy(g, 0.035, standH, "#2a2d3a", 0, standH / 2, -0.04, 0.01); cy(g, 0.17, 0.025, "#2a2d3a", 0, 0.012, -0.04, 0.01);
  return { g, cy: cyc };
};
/** pure rising sprites: spawn, rise, wobble, pop out */
const floaters = (root: THREE.Object3D, texs: THREE.Texture[], N: number, size: number, o: { x: number; y: number; z: number; spread: number; rise: number; life: number; start?: number; drift?: number; wob?: number; sizes?: number }) => {
  const items = Array.from({ length: N }, (_, i) => { const s = sprite(texs[i % texs.length], size * (0.8 + 0.4 * ((i * 0.37) % 1)) * (o.sizes ?? 1)); s.visible = false; root.add(s); return s; });
  return (t: number, ox = 0, oy = 0, oz = 0, rate = 1) => items.forEach((s, i) => {
    const off = (i / N) * o.life, age = t - (o.start ?? 0) - off;
    if (age < 0) { s.visible = false; return; }
    const a = (age % o.life) / o.life, k = Math.min(1, a * 7) * (1 - sm((a - 0.78) / 0.22)) * (rate > 0 ? 1 : 0);
    s.visible = k > 0.02; if (!s.visible) return;
    s.position.set(o.x + ox + Math.sin(i * 12.9) * o.spread + (o.drift ?? 0) * a + Math.sin(a * 7 + i * 2) * (o.wob ?? 0.08), o.y + oy + a * o.rise, o.z + oz + Math.cos(i * 4.1) * 0.15);
    s.scale.setScalar(k * (1 + 0.1 * Math.sin(age * 8 + i)));
    s.rotation.z = Math.sin(a * 5 + i) * 0.25;
  });
};
/** the hero's head position in world space, and the point just in front of the mouth */
const mouthOf = (c: Char, ry = c.root.rotation.y) => {
  const f = new Vec(Math.sin(ry), 0, Math.cos(ry));
  return c.root.position.clone().add(new Vec(0, c.headY - 0.1, 0)).addScaledVector(f, 0.36);
};
/** a handheld mic: grip along local +y, ball head at the top */
const handMic = () => {
  const g = new THREE.Group(), grid = canvasTex(64, 64, (x) => { x.fillStyle = "#98a0ae"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#3d4352"; for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) x.fillRect(i * 8 + 2, k * 8 + 2, 4, 4); });
  cy(g, 0.03, 0.2, "#23252f", 0, 0, 0, 0.014, 0.022);
  cy(g, 0.034, 0.02, "#ffcf2b", 0, 0.105, 0, 0.01);
  const head = sp(g, 0.062, toonMat("#98a0ae", { map: grid }), 0, 0.165, 0, 1, 1.05, 1, 0.016);
  void head; return g;
};

// ================================================================ 1. gaming
const WIN = 1.2;
const gaming: ActDef = { pose: "sit", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c; const rig = rigOf(hero);
  hero.root.rotation.y = 0.8; hero.root.position.set(H[0] - 0.3, H[1] - 0.3, H[2]);
  const G = group(root, H[0] - 0.3, H[1], H[2]);
  // bean bag seat + back cushion
  const beanA = sp(G, 0.62, "#d8404c", -0.05, 0.14, -0.05, 1.05, 0.5, 1.0); beanA.rotation.y = 0.3;
  const beanB = sp(G, 0.42, "#b5303c", -0.45, 0.5, -0.4, 0.95, 1.0, 0.55); beanB.rotation.y = 0.8;
  blob(G, 0.9, 0, -0.1);
  // low desk with a big monitor, angled at the player and the camera
  const D = group(G, 1.3, 0, -0.1); D.rotation.y = -0.85;
  bx(D, 1.55, 0.06, 0.8, "#2a2d42", 0, 0.52, 0, 0.02);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.33, 0.33]) bx(D, 0.07, 0.5, 0.07, "#1c1e2a", sx, 0.25, sz, 0.01);
  const strip = new THREE.MeshBasicMaterial({ color: "#ff3cf0" });
  const sb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.025, 0.03), strip); sb.position.set(0, 0.47, 0.4); D.add(sb);
  const screen = liveTex(256, 144, (g, t) => {
    const W = 256, Hh = 144, sky = g.createLinearGradient(0, 0, 0, 100); sky.addColorStop(0, "#2fb7ff"); sky.addColorStop(1, "#bff0ff");
    g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
    g.fillStyle = "#ffffff"; for (let i = 0; i < 3; i++) { const x = ((i * 110 - t * 22) % 330 + 330) % 330 - 40; g.beginPath(); g.ellipse(x, 24 + i * 12, 26, 9, 0, 0, PI * 2); g.fill(); }
    g.fillStyle = "#3fbf5a"; for (let i = 0; i < 4; i++) { const x = ((i * 90 - t * 40) % 360 + 360) % 360 - 60; g.beginPath(); g.ellipse(x, 104, 54, 34, 0, PI, 0); g.fill(); }
    const sc = t * 120;
    for (let i = -1; i < 12; i++) { const x = i * 24 - (sc % 24); g.fillStyle = (i + Math.floor(sc / 24)) % 2 ? "#b8602e" : "#d97a3a"; g.fillRect(x, 104, 24, 40); g.fillStyle = "#4bd36a"; g.fillRect(x, 104, 24, 6); }
    // coins + enemies
    for (let i = 0; i < 4; i++) { const x = ((i * 70 + 150 - sc * 1.0) % 280 + 280) % 280 - 10; g.fillStyle = "#ffd22e"; g.fillRect(x, 60 - 10 * Math.abs(Math.sin(t * 6 + i)), 12, 14); g.strokeStyle = "#a36a00"; g.lineWidth = 2; g.strokeRect(x, 60 - 10 * Math.abs(Math.sin(t * 6 + i)), 12, 14); }
    const ex = ((200 - sc * 1.0) % 300 + 300) % 300 - 20; g.fillStyle = "#8b4a2b"; g.fillRect(ex, 90, 18, 14); g.fillStyle = "#fff"; g.fillRect(ex + 3, 93, 4, 4); g.fillRect(ex + 11, 93, 4, 4);
    // the player hops
    const jp = (t * 1.6) % 1, jy = jp < 0.5 ? 74 * 0 + 60 * Math.sin(jp * 2 * PI) : 0;
    const py = 88 - Math.max(0, jy); g.fillStyle = "#ff3b3b"; g.fillRect(52, py, 18, 10); g.fillStyle = "#3a6bff"; g.fillRect(52, py + 10, 18, 8); g.fillStyle = "#ffd2a0"; g.fillRect(56, py - 8, 12, 10); g.fillStyle = "#ff3b3b"; g.fillRect(54, py - 12, 16, 5);
    g.fillStyle = "#ffffff"; g.font = "bold 14px Arial, sans-serif"; g.fillText("SCORE " + String(1200 + Math.floor(t * 900)).padStart(6, "0"), 8, 16);
    for (let i = 0; i < 3; i++) { g.fillStyle = "#ff3b5b"; g.fillRect(212 + i * 12, 8, 9, 9); }
    const fl = Math.max(0, Math.sin(t * 13)) ** 6 * 0.5; if (fl > 0.02) { g.fillStyle = `hsla(${(t * 300) % 360},100%,60%,${fl})`; g.fillRect(0, 0, W, Hh); }
    if (t > WIN) {   // the win: banner over the game
      g.fillStyle = "rgba(20,10,40,0.55)"; g.fillRect(0, 40, W, 70); g.fillStyle = `hsl(${(t * 400) % 360},100%,65%)`; g.font = "900 40px Arial Black, Arial, sans-serif"; g.fillText("YOU WIN!", 52, 92);
    }
  });
  const M = monitor(1.2, 0.68, 0.1, screen.tex); M.g.position.set(0, 0.55, -0.05); D.add(M.g);
  // a PC tower with a rainbow fan, and RGB tubes on the wall side
  const T = group(G, 2.3, 0, -0.95); T.rotation.y = -0.6;
  bx(T, 0.28, 0.72, 0.5, "#1c1e2a", 0, 0.36, 0, 0.02);
  const fanM = new THREE.MeshBasicMaterial({ color: "#ff3cf0" }); const fan = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), fanM); fan.position.set(0, 0.38, 0.255); T.add(fan);
  const tubes: THREE.MeshBasicMaterial[] = [];
  for (const [x, z] of [[1.85, -1.0], [-0.9, -1.5]]) { const tm = new THREE.MeshBasicMaterial({ color: "#3cf0ff" }); tubes.push(tm); const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 10), tm); tb.position.set(H[0] > -99 ? x : 0, 1.0, z); G.add(tb); }
  const glow = new THREE.PointLight("#ff3cf0", 5, 6, 2); glow.position.set(1.2, 1.5, 0.9); G.add(glow);
  // the controller, held in both hands in the rig's space
  const ctrl = makeThing("controller"); ctrl.root.scale.setScalar(2.7);
  const cg = new THREE.Group(); cg.add(ctrl.root); rig.add(cg);
  const spark = floaters(root, [starTex("#ffe14a"), starTex("#ff6fd8"), starTex("#5affc8")], 8, 0.22, { x: H[0] + 1.0, y: H[1] + 1.2, z: H[2] + 0.1, spread: 0.45, rise: 1.2, life: 0.9, wob: 0.1 });
  return { tick(t) {
    screen.upd(t);
    const hue = (t * 0.7) % 1;
    strip.color.copy(hsl(hue).multiplyScalar(1.7)); fanM.color.copy(hsl(hue + 0.3).multiplyScalar(1.7));
    tubes.forEach((m, i) => m.color.copy(hsl(hue + i * 0.4 + 0.5).multiplyScalar(1.7)));
    glow.color.copy(hsl(hue + 0.1, 1, 0.6)); glow.intensity = 4 + Math.sin(t * 13) * 1.2;
    spark(t);
    const SY = shY(hero);
    cg.position.set(0, SY - 0.48 + 0.012 * Math.sin(t * 17), 0.38); cg.rotation.set(-0.15 + 0.07 * Math.sin(t * 7), 0.06 * Math.sin(t * 5), 0.05 * Math.sin(t * 9));
    const j = (f: number, p: number) => 0.012 * Math.sin(t * f + p);
    arm(hero, "r", 0.17 + j(31, 0), SY - 0.45 + j(37, 1), 0.4 + j(29, 2), [1.2, -0.5, -0.4]);
    arm(hero, "l", 0.17 + j(33, 2), SY - 0.45 + j(41, 0), 0.4 + j(27, 4), [-1.2, -0.5, -0.4]);
    const won = t > WIN;
    rig.rotation.x = 0.1 + 0.035 * Math.sin(t * 6.5) - (won ? 0.12 * seg(t, WIN, WIN + 0.2) : 0); rig.rotation.z = 0.05 * Math.sin(t * 2.3);
    const ex: Expr = t < WIN ? "focus" : t < WIN + 0.5 ? "shout" : "laugh";   // concentrating -> yells on the win -> laughs
    return { pose: "sit", t, expr: ex };
  } };
} };

// ================================================================ 2. streaming
const streaming: ActDef = { pose: "talk", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 0.4;
  const G = group(root, H[0], H[1], H[2]);
  // desk (front panel hides the legs)
  bx(G, 2.5, 0.06, 0.75, "#3b4262", 0.75, 0.82, 0.68, 0.02); bx(G, 2.46, 0.8, 0.04, "#4a3f78", 0.75, 0.4, 1.02, 0.02);
  bx(G, 2.46, 0.03, 0.04, emis("#b05cff", 1.6), 0.75, 0.75, 1.05, 0);
  // boom arm + mic, from the left, mic below the mouth pointing up at it
  const mouth = mouthOf(hero).sub(new Vec(H[0], H[1], H[2]));
  const post = new Vec(-0.62, 0.85, 0.85), elbow = new Vec(-0.62, 1.4, 0.85), tip = new Vec(-0.3, 1.08, 0.64);
  cy(G, 0.07, 0.04, "#23252f", post.x, 0.84, post.z, 0.01);
  rod(G, post, elbow, 0.018, "#23252f"); rod(G, elbow, tip, 0.016, "#23252f"); sp(G, 0.035, "#23252f", elbow.x, elbow.y, elbow.z, 1, 1, 1, 0.01);
  const mic = handMic(); G.add(mic); placeAlong(mic, tip, mouth.clone().add(new Vec(0.0, -0.08, 0)).sub(tip));
  const pop = torus(G, 0.1, 0.008, "#2a2d3a", tip.x + 0.1, tip.y + 0.17, tip.z - 0.07, 0); pop.rotation.set(0.3, 0.5, 0);
  // ring light with the webcam in its middle
  const ring = group(G, 1.7, 0, 0.55); ring.rotation.y = -0.55;
  cy(ring, 0.025, 1.45, "#23252f", 0, 0.72, 0, 0.01); cy(ring, 0.28, 0.04, "#23252f", 0, 0.02, 0, 0.01);
  const rg = group(ring, 0, 1.75, 0);
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.7) }); rg.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 10, 40), ringM));
  torus(rg, 0.34, 0.058, "#151018", 0, 0, -0.012, 0).scale.set(1, 1, 0.3);
  bx(rg, 0.13, 0.08, 0.06, "#14161e", 0, 0, 0.02, 0.012); sp(rg, 0.027, emis("#4aa8ff", 1.4), 0, 0, 0.055, 1, 1, 0.5, 0.008);
  const led = sp(rg, 0.01, glowMat("#38ff6a", 2.6), 0.04, 0.04, 0.06, 1, 1, 1, 0);
  const rl = new THREE.PointLight("#ffe6f6", 3, 5, 2); rl.position.set(1.6, 1.9, 1.3); G.add(rl);
  // chat monitor
  const chat = liveTex(256, 148, (g, t) => {
    g.fillStyle = "#14172a"; g.fillRect(0, 0, 256, 148); g.fillStyle = "#e5262f"; g.fillRect(0, 0, 256, 20); g.fillStyle = "#fff"; g.font = "bold 14px Arial, sans-serif"; g.fillText("LIVE CHAT", 8, 15);
    const cols = ["#ff6f91", "#ffd23a", "#5affc8", "#6fa8ff", "#c06fff"], sh = (t * 38) % 34;
    for (let i = -1; i < 5; i++) {
      const k = i + Math.floor((t * 38) / 34), y = 28 + i * 34 - sh, r = seeded(k * 13 + 5);
      g.fillStyle = cols[((k % 5) + 5) % 5]; g.beginPath(); g.arc(18, y + 10, 9, 0, PI * 2); g.fill();
      g.fillStyle = "#e8ecff"; g.fillRect(34, y + 2, 40 + r() * 120, 8); g.fillStyle = "#8a93b0"; g.fillRect(34, y + 15, 30 + r() * 150, 7);
    }
  });
  const M = monitor(0.82, 0.48, 0.1, chat.tex); M.g.position.set(0.95, 0.85, 0.72); M.g.rotation.y = -0.45; G.add(M.g);
  // LIVE badge + viewer count
  const badge = liveTex(256, 96, (g, t) => {
    g.fillStyle = "#e5262f"; g.strokeStyle = "#151018"; g.lineWidth = 8; g.beginPath(); g.roundRect(8, 8, 240, 80, 26); g.fill(); g.stroke();
    g.fillStyle = Math.sin(t * 7) > -0.3 ? "#ffffff" : "#ff9a9a"; g.beginPath(); g.arc(56, 48, 15, 0, PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.font = "900 54px Arial Black, Arial, sans-serif"; g.fillText("LIVE", 86, 67);
  });
  const bd = sprite(badge.tex, 0.62, 0.23); bd.position.set(0.85, 2.35, 0.5); G.add(bd);
  const viewers = liveTex(256, 80, (g, t) => {
    g.fillStyle = "rgba(20,16,30,0.92)"; g.beginPath(); g.roundRect(6, 6, 244, 68, 24); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 5; g.beginPath(); g.ellipse(48, 40, 22, 13, 0, 0, PI * 2); g.stroke(); g.fillStyle = "#fff"; g.beginPath(); g.arc(48, 40, 7, 0, PI * 2); g.fill();
    const v = Math.floor(2400 + t * 2600); g.font = "900 40px Arial Black, Arial, sans-serif"; g.fillText((v / 1000).toFixed(1) + "K", 84, 54);
  });
  const vw = sprite(viewers.tex, 0.52, 0.17); vw.position.set(0.85, 2.1, 0.5); G.add(vw);
  const bub = [bubbleTex("#ff6f91", 50, 30), bubbleTex("#6fa8ff", 30, 60), bubbleTex("#ffd23a", 60, 20), bubbleTex("#5affc8", 40, 44)];
  const hearts = [heartTex("#ff3b6b"), heartTex("#ff8aa8"), heartTex("#ff3b6b")];
  const fb = floaters(root, bub, 7, 0.5, { x: H[0] + 1.1, y: H[1] + 1.55, z: H[2] + 0.5, spread: 0.45, rise: 1.6, life: 1.6, drift: 0.2 });
  const fh = floaters(root, hearts, 9, 0.28, { x: H[0] + 0.7, y: H[1] + 1.4, z: H[2] + 0.55, spread: 0.7, rise: 1.9, life: 1.3, drift: 0.15, wob: 0.12 });
  return { tick(t) {
    chat.upd(t); badge.upd(t); viewers.upd(t);
    bd.scale.setScalar(1 + 0.05 * Math.sin(t * 7)); led.scale.setScalar(Math.sin(t * 7) > -0.3 ? 1 : 0.4);
    ringM.color.setScalar(1.5 + 0.1 * Math.sin(t * 4));
    fb(t); fh(t);
    return { pose: "talk", t, expr: (t < 0.7 ? "smile" : t < 1.3 ? "grin" : "laugh") as Expr };
  } };
} };

// ================================================================ 3. sing_stage
const sing_stage: ActDef = { pose: "stand", view: "actsing", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c; const rig = rigOf(hero);
  hero.root.rotation.y = 0.25;
  const G = group(root, H[0], H[1], H[2]);
  // spotlight cones from above (additive, see-through) + real spots on the singer
  const cone = (col: string, x: number, op: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 28, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x * 0.5, 4.8, -2.0); m.rotation.z = Math.atan2(x, 9.2) * -1; m.renderOrder = 3; G.add(m); return m;
  };
  const cones = [cone("#fff2c0", 0, 0.1), cone("#ff5ad8", -3.2, 0.07), cone("#4ad8ff", 3.2, 0.07)];
  const spot = new THREE.SpotLight("#fff2d8", 90, 18, 0.5, 0.5, 1.2); spot.position.set(0.5, 8, 4); spot.target.position.set(0, 1.2, 0); G.add(spot); G.add(spot.target);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.35, depthWrite: false })); pool.rotation.x = -PI / 2; pool.position.y = 0.02; pool.renderOrder = 2; G.add(pool);
  // the mic in the right hand, the left arm sweeping to the crowd
  const mic = handMic(); root.add(mic);
  // crowd silhouettes at both edges with waving arms
  type Fan = { arms: THREE.Group[]; ph: number };
  const fans: Fan[] = [];
  const cols = ["#3a2a5e", "#2c3a6e", "#5a2a58", "#2a4a5e", "#4a2a4a", "#33336e"];
  [[-1.9, 2.2], [-1.5, 3.4], [1.9, 2.5], [1.45, 3.6]].forEach(([x, z], i) => {
    const f = group(G, x, 0, z); f.scale.setScalar(0.95);
    const body = cy(f, 0.27, 1.0, cols[i % cols.length], 0, 0.5, 0, 0.02); void body;
    sp(f, 0.28, "#2a2034", 0, 1.3, 0, 1, 1, 1, 0.02);
    const arms: THREE.Group[] = [];
    for (const s of [-1, 1]) { const a = group(f, s * 0.3, 1.0, 0); cy(a, 0.065, 0.62, cols[i % cols.length], 0, 0.3, 0, 0.012); sp(a, 0.1, "#2a2034", 0, 0.65, 0, 1, 1, 1, 0.012); arms.push(a); }
    fans.push({ arms, ph: i * 1.3 });
  });
  const notes = [noteTex("#ffffff", false), noteTex("#ffd23a", true), noteTex("#ff6fd8", false), noteTex("#5affc8", true)];
  const fn = floaters(root, notes, 10, 0.34, { x: H[0] + 0.1, y: H[1] + 1.9, z: H[2] + 0.3, spread: 1.0, rise: 2.2, life: 1.5, drift: 0.2, wob: 0.15 });
  const lights = [new THREE.Color("#ffe2b0"), new THREE.Color("#ff9ad8"), new THREE.Color("#9ad8ff")];
  const dirT = new Vec();
  return { tick(t) {
    const beat = Math.sin(t * 9) * 0.5 + 0.5;
    cones.forEach((m, i) => { const mm = m.material as THREE.MeshBasicMaterial; mm.opacity = (i ? 0.06 : 0.09) + 0.03 * Math.sin(t * 5 + i * 2); m.rotation.x = 0.08 * Math.sin(t * 2 + i); });
    spot.color.copy(lights[Math.floor(t * 2.5) % 3]); pool.scale.setScalar(1 + 0.05 * beat);
    fans.forEach((f) => f.arms.forEach((a, k) => { a.rotation.z = (k ? -1 : 1) * (0.25 + 0.2 * Math.sin(t * 6 + f.ph + k)); a.rotation.x = 0.1 * Math.sin(t * 4 + f.ph); }));
    fn(t);
    // singer: arm up to the mouth, passionate lean, left arm sweeping
    const SY = shY(hero), HY = hero.headY;
    const mouth = mouthOf(hero), f = fwdOf(hero), right = new Vec(f.z, 0, -f.x);
    const handT = mouth.clone().addScaledVector(right, 0.13).addScaledVector(f, 0.07).add(new Vec(0, -0.15, 0)).add(new Vec(0.012 * Math.sin(t * 12), 0.014 * Math.sin(t * 9), 0));
    armW(hero, "r", handT, [1.2, -0.3, -0.5]);
    const sw = Math.sin(t * 3.2);
    arm(hero, "l", 0.5 + 0.1 * sw, SY + 0.55 + 0.12 * Math.sin(t * 6.4), 0.12, [-0.4, -0.3, -1]);
    rig.rotation.x = -0.1 + 0.05 * Math.sin(t * 4.5); rig.rotation.z = -0.06 + 0.07 * sw;
    const hp = wp(hero.hand("r"));
    dirT.copy(mouth).addScaledVector(f, 0.02).sub(hp); placeAlong(mic, hp.clone().addScaledVector(dirT.clone().normalize(), -0.02), dirT);
    void HY;
    const hi = Math.sin(t * 6.2 + 0.6) > 0.15;   // a high note every second or so: the singer belts it
    return { pose: "stand", t, expr: (t < 0.3 ? "smile" : hi ? "shout" : "grin") as Expr };
  } };
} };

// ================================================================ 4. guitar
const guitar: ActDef = { pose: "stand", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c; const rig = rigOf(hero);
  hero.root.rotation.y = 0.3;
  // the guitar lives in the rig so it follows the body: body at the hip, neck to the player's right (a left-handed player)
  const gt = new THREE.Group(); rig.add(gt); gt.position.set(0.02, 0.78, 0.3); gt.rotation.z = 0.42;
  const sun = "#e8622a", edge = "#8a2f12";
  const bodyL = sp(gt, 0.27, sun, -0.06, -0.06, 0, 1.0, 1.0, 0.36, 0.016), bodyU = sp(gt, 0.2, sun, 0.17, 0.0, 0, 1.0, 1.0, 0.36, 0.016); void bodyL; void bodyU;
  sp(gt, 0.11, edge, 0.05, 0.0, 0.065, 1, 1, 0.12, 0).visible = true;
  cy(gt, 0.075, 0.03, "#1b1020", 0.08, -0.01, 0.07, 0, 0.075).rotation.x = PI / 2;
  const pg = bx(gt, 0.1, 0.17, 0.012, "#f6e8c6", -0.1, -0.1, 0.068, 0.006); pg.rotation.z = 0.4;
  bx(gt, 0.2, 0.025, 0.02, "#2a1a10", -0.12, -0.14, 0.07, 0.006);
  // neck + frets + head
  const neck = group(gt, 0.34, 0.02, 0.05);
  bx(neck, 0.78, 0.062, 0.04, "#6e3d1c", 0.2, 0, 0, 0.01);
  for (let i = 0; i < 9; i++) bx(neck, 0.008, 0.066, 0.046, "#e8e8f0", -0.12 + i * 0.075, 0, 0, 0);
  for (let i = 0; i < 4; i++) cy(neck, 0.011, 0.012, "#ffd23a", 0.66 + i * 0.045, i % 2 ? 0.034 : -0.034, 0.0, 0).rotation.x = PI / 2;
  const hd = bx(neck, 0.2, 0.09, 0.034, "#2a1a10", 0.68, 0, 0, 0.012); hd.rotation.z = 0.08;
  const strings: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: "#f2f2fa" })); m.position.set(0.28, -0.022 + i * 0.015 + 0.0, 0.082); gt.add(m); strings.push(m); }
  // strap
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.015), toonMat("#23252f")); strap.position.set(-0.08, 0.55, -0.0); strap.rotation.z = -0.4; gt.add(strap);
  const notes = [noteTex("#ffffff", false), noteTex("#ffd23a", true), noteTex("#ff6fd8", false), noteTex("#5affc8", true), noteTex("#6fa8ff", false)];
  const fn = floaters(root, notes, 9, 0.34, { x: H[0] + 0.7, y: H[1] + 1.4, z: H[2] + 0.5, spread: 0.6, rise: 1.9, life: 1.5, drift: 0.2, wob: 0.15 });
  const fh = floaters(root, [heartTex("#ff4d6d")], 3, 0.22, { x: H[0] + 1.3, y: H[1] + 1.2, z: H[2] + 0.5, spread: 0.4, rise: 1.5, life: 1.3, start: 0.3 });
  return { tick(t) {
    fn(t); fh(t);
    const SY = shY(hero), st = Math.sin(t * 15), sw = Math.sin(t * 2.4);
    gt.rotation.z = 0.42 + 0.02 * Math.sin(t * 15);
    strings.forEach((s, i) => { s.position.z = 0.082 + 0.006 * Math.sin(t * 60 + i) * (0.5 + 0.5 * st); });
    // strumming hand sweeps across the strings; fretting hand slides on the neck
    const body = gt.localToWorld(new Vec(0.06, -0.05 + 0.13 * st, 0.12)), neckP = gt.localToWorld(new Vec(0.55 + 0.08 * sw, 0.14, 0.1));
    armW(hero, "l", body, [-1.2, -0.5, -0.4]);
    armW(hero, "r", neckP, [1.0, -0.2, -0.6]);
    rig.rotation.z = 0.03 * sw; rig.rotation.x = 0.04 + 0.03 * Math.sin(t * 4);
    void SY;
    return { pose: "stand", t, expr: (t < 1.0 ? "focus" : t < 1.5 ? "shout" : "laugh") as Expr };
  } };
} };

// ================================================================ 5. film_camera
// side view: the camera points to the right, the hero stands behind it with his eye on the eyepiece of the viewfinder
const film_camera: ActDef = { pose: "stand", view: "actf", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const HERO_X = -0.54, HERO_X0 = -0.9;   // hero's x: starts a step back for the clap, leans in to the eyepiece
  hero.root.rotation.y = 1.0; hero.root.position.set(H[0] + HERO_X0, H[1], H[2]);
  const G = group(root, H[0], H[1], H[2]); blob(G, 0.7, 0.2, 0.1);
  const EYE_Y = hero.headY + 0.05;   // eye height above the floor
  // tripod
  const head = new Vec(0.45, EYE_Y - 0.28, 0.0);
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + 0.5; rod(G, head, new Vec(head.x + Math.sin(a) * 0.6, 0, head.z + Math.cos(a) * 0.6), 0.024, "#2a2d3a"); }
  cy(G, 0.07, 0.12, "#1c1e2a", head.x, head.y, head.z, 0.01);
  // camera body: light grey with orange trim, lens along +x (local +z of the group rotated by PI/2)
  const cam = group(G, 0.45, EYE_Y - 0.02, 0.0); cam.rotation.y = PI / 2; cam.scale.setScalar(1.25);
  bx(cam, 0.36, 0.32, 0.6, "#eef1f7", 0, 0, 0, 0.022); bx(cam, 0.32, 0.05, 0.4, "#ff8a1f", 0, 0.185, 0.0, 0.012); bx(cam, 0.38, 0.04, 0.36, "#ff8a1f", 0, -0.17, 0.0, 0.01);
  // lens: big grey barrel, chrome ring, blue glass with a white highlight and a little hood
  const barrel = cy(cam, 0.17, 0.3, "#9aa3b4", 0, 0, 0.45, 0.018); barrel.rotation.x = PI / 2;
  const ring = cy(cam, 0.185, 0.05, "#e8edf8", 0, 0, 0.55, 0.014); ring.rotation.x = PI / 2;
  const ring2 = cy(cam, 0.2, 0.03, "#ff8a1f", 0, 0, 0.4, 0.012); ring2.rotation.x = PI / 2;
  const glass = cy(cam, 0.13, 0.03, toonMat("#3a7bff", { emissive: "#2a5bff", emissiveIntensity: 1.2 }), 0, 0, 0.585, 0.01); glass.rotation.x = PI / 2;
  const hl = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })); hl.position.set(-0.05, 0.05, 0.604); cam.add(hl);
  const hl2 = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })); hl2.position.set(0.055, -0.04, 0.604); cam.add(hl2);
  // viewfinder on the back (towards the hero): black eyecup on a grey stem, plus a mag on top
  bx(cam, 0.1, 0.1, 0.16, "#2a2d3a", 0, 0.07, -0.36, 0.014); const eyecup = cy(cam, 0.07, 0.07, "#14161e", 0, 0.07, -0.47, 0.012); eyecup.rotation.x = PI / 2;
  const reel = (z: number) => { const r = cy(cam, 0.17, 0.07, "#d9791a", 0.0, 0.3, z, 0.014); r.rotation.z = PI / 2; return r; };
  const reels = [reel(0.14), reel(-0.12)];
  const rec = sp(cam, 0.032, glowMat("#ff1d2e", 2.6), 0.12, 0.2, -0.28, 1, 1, 1, 0.008);
  const grip = bx(cam, 0.09, 0.08, 0.22, "#2a2d3a", -0.22, -0.02, 0.0, 0.01); void grip;   // side grip (-x of the group = toward the viewer): left hand
  // clapperboard
  const slate = group(root, 0, 0, 0);
  bx(slate, 0.8, 0.52, 0.04, "#1a1a22", 0, -0.2, 0, 0.012);
  const st = canvasTex(256, 168, (g) => { g.fillStyle = "#1a1a22"; g.fillRect(0, 0, 256, 168); g.strokeStyle = "#fff"; g.lineWidth = 4; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(8, 8 + i * 40); g.lineTo(248, 8 + i * 40); g.stroke(); } g.fillStyle = "#fff"; g.font = "bold 26px Arial, sans-serif"; g.fillText("SCENE 1  TAKE 3", 14, 44); g.fillText("ROLL 7", 14, 84); g.fillText("ACTION!", 14, 124); });
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.5), new THREE.MeshBasicMaterial({ map: st, toneMapped: false })); sf.position.set(0, -0.2, 0.023); slate.add(sf);
  const stick = group(slate, -0.4, 0.06, 0.0);
  bx(stick, 0.8, 0.1, 0.045, "#fafafa", 0.4, 0.05, 0.0, 0.012);
  for (let i = 0; i < 5; i++) bx(stick, 0.08, 0.11, 0.05, "#1a1a22", 0.08 + i * 0.16, 0.05, 0.0, 0);
  const clapFlash = sprite(starTex("#ffffff"), 0.8); root.add(clapFlash);
  const recTag = liveTex(192, 80, (g, t) => {
    g.fillStyle = "rgba(20,16,30,0.9)"; g.beginPath(); g.roundRect(6, 6, 180, 68, 22); g.fill();
    g.fillStyle = Math.sin(t * 6) > -0.2 ? "#ff1d2e" : "#5a1a22"; g.beginPath(); g.arc(46, 40, 17, 0, PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "900 40px Arial Black, Arial, sans-serif"; g.fillText("REC", 78, 54);
  });
  const rt = sprite(recTag.tex, 0.6, 0.25); rt.position.set(0.7, 2.35, 0.2); G.add(rt);
  const kl = new THREE.PointLight("#fff0d8", 4, 5, 2); kl.position.set(0.6, 2.2, 1.4); G.add(kl);
  const CLAP = 0.36, hipW = new Vec(H[0] - 0.5, H[1] + 0.95, H[2] + 0.25);
  return { tick(t) {
    recTag.upd(t);
    const rv = Math.sin(t * 6) > -0.2; rec.scale.setScalar(rv ? 1 : 0.4);
    reels.forEach((r, i) => { r.rotation.x = t * (i ? -3 : 3); });
    const f = fwdOf(hero), lean = seg(t, CLAP + 0.15, CLAP + 0.55);
    // hero: steps in and turns from the viewer to the viewfinder once the board has snapped
    hero.root.position.x = H[0] + mix(HERO_X0, HERO_X, lean); hero.root.rotation.y = mix(0.75, 1.3, lean);
    // clapperboard: held up in the left hand, snaps shut, then drops away
    const open = (1 - seg(t, CLAP - 0.12, CLAP)) * 0.62, out = seg(t, CLAP + 0.12, CLAP + 0.45), hold = 1 - out;
    const lh = new Vec(hero.root.position.x, H[1] + 1.4, H[2]).addScaledVector(f, 0.5).add(new Vec(0.1, -0.3 * out, 0.25));
    slate.visible = t < CLAP + 0.5; slate.position.set(lh.x + 0.12, lh.y + 0.08, lh.z + 0.28 + 0.2 * out); slate.rotation.set(0.0, 0.12, -0.25 * out); slate.scale.setScalar(1 - 0.5 * out);
    stick.rotation.z = open;
    const fl = Math.max(0, 1 - Math.abs(t - CLAP) / 0.08); clapFlash.visible = fl > 0.05; clapFlash.position.set(slate.position.x + 0.3, slate.position.y + 0.15, slate.position.z + 0.12); clapFlash.scale.setScalar(0.25 + 0.5 * fl);
    // after the clap the left hand holds the side grip, the right the top of the camera
    cam.updateWorldMatrix(true, false);
    const gripW = cam.localToWorld(new Vec(-0.27, -0.02, -0.05)), topW = cam.localToWorld(new Vec(-0.1, 0.24, -0.2));
    armW(hero, "l", new Vec().lerpVectors(hipW, slate.position.clone().add(new Vec(-0.3, -0.3, 0)), hold).lerp(gripW, 1 - hold), [-1.2, -0.5, -0.4]);
    armW(hero, "r", new Vec().lerpVectors(new Vec(H[0] - 0.5, H[1] + 1.0, H[2] - 0.2), topW, lean), [1.2, -0.4, -0.5]);
    const ex: Expr = t < CLAP - 0.1 ? "grin" : t < CLAP + 0.35 ? "shout" : "focus";   // eager -> "action!" -> eye on the viewfinder
    return { pose: "stand", t, expr: ex };
  } };
} };

// ================================================================ 6. rocket_launch
const rocket_launch: ActDef = { pose: "cheer", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 0.35; hero.root.position.set(H[0] - 0.75, H[1], H[2] + 0.4);
  const RX = H[0] + 0.85, RZ = H[2] - 2.3;
  const G = group(root, RX, H[1], RZ);
  // pad + tower
  bx(G, 2.3, 0.3, 2.3, "#4a4e60", 0, 0.15, 0, 0.025);
  for (let i = 0; i < 6; i++) bx(G, 0.2, 0.31, 2.34, i % 2 ? "#ffc928" : "#1b1b24", -1.0 + i * 0.4, 0.15, 0, 0);
  const tw = group(G, 1.25, 0, -1.0);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) bx(tw, 0.07, 5.2, 0.07, "#c8442a", x, 2.6, z, 0.012);
  for (let i = 0; i < 9; i++) { bx(tw, 0.4, 0.05, 0.05, "#c8442a", 0, 0.4 + i * 0.58, 0.18, 0.008); bx(tw, 0.05, 0.05, 0.4, "#c8442a", 0.18, 0.7 + i * 0.58, 0, 0.008); }
  bx(G, 1.2, 0.1, 0.14, "#c8442a", 0.7, 3.1, -0.2, 0.012);
  const rk = makeThing("rocket"); rk.root.scale.setScalar(0.78); rk.root.position.set(0, 0.3, 0); G.add(rk.root);
  let flame: THREE.Object3D | undefined; rk.root.traverse((o) => { if (o.userData.skip) flame = o; });
  const glow = new THREE.PointLight("#ff9a3a", 0, 9, 2); glow.position.set(0, 0.6, 0.8); G.add(glow);
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 20; i++) { const m = mesh(new THREE.SphereGeometry(0.34, 12, 9), toonMat(i % 3 ? "#f3f3f6" : "#c9ccd8"), 0, 0, 0, false); outline(m, 0.02); m.visible = false; G.add(m); puffs.push(m); }
  const rnd = seeded(c.seed * 17 + 3), pp = puffs.map(() => ({ a: rnd() * PI * 2, sp: 0.8 + rnd() * 1.1, ph: rnd(), y: rnd() * 0.5 }));
  const sparks = floaters(G, [starTex("#ffe14a"), starTex("#ff9a3a")], 8, 0.2, { x: 0, y: 0.5, z: 0.5, spread: 1.2, rise: 1.2, life: 0.7, start: 0.5, wob: 0.2 });
  const T0 = 0.45;
  return { tick(t) {
    const a = Math.max(0, t - T0), lift = 0.5 * 5.2 * a * a + 0.4 * a, ig = seg(t, 0.08, 0.4);
    const shake = t < T0 ? 0.012 * ig * Math.sin(t * 90) : 0;
    rk.root.position.set(shake, 0.3 + lift, 0); rk.root.rotation.z = 0.01 * Math.sin(t * 30) * ig;
    if (flame) flame.scale.set(0.8 + 0.7 * ig, 0.3 + 0.8 * ig, 0.8 + 0.7 * ig);
    glow.intensity = 16 * ig * (0.9 + 0.1 * Math.sin(t * 40));
    pp.forEach((p, i) => {
      const age = t - 0.12 - (i / puffs.length) * 1.1; const m = puffs[i];
      if (age < 0) { m.visible = false; return; }
      const u = (age % 1.1) / 1.1;
      m.visible = true; const s = Math.max(0.01, Math.sin(PI * Math.pow(u, 0.6)) * (0.4 + 1.0 * u));
      m.scale.setScalar(s); m.position.set(Math.cos(p.a) * (0.3 + u * p.sp * 1.4), 0.4 + p.y + u * 0.6, Math.sin(p.a) * (0.3 + u * p.sp * 1.4) + 0.2);
    });
    sparks(t, 0, lift * 0.6, 0, 1);
    return { pose: "cheer", t: t + 0.1, expr: (t < T0 - 0.1 ? "grin" : t < T0 + 0.7 ? "shout" : "laugh") as Expr };   // eager -> yells at liftoff -> laughs
  } };
} };

// ================================================================ 7. build_tools
const build_tools: ActDef = { pose: "stand", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 0.7; hero.root.position.set(H[0] - 0.05, H[1], H[2] - 0.05);
  const G = group(root, H[0], H[1], H[2]); blob(G, 1.3, 1.5, 0.45);
  // a house frame: sill, posts, top plate, braces, plus a plank pile
  const fz = 0.5, fx = 0.85;
  bx(G, 1.7, 0.12, 0.12, WOOD2, fx + 0.85, 0.06, fz, 0.012);
  for (const x of [0, 0.85, 1.7]) bx(G, 0.12, 1.7, 0.12, WOOD, fx + x, 0.9, fz, 0.012);
  bx(G, 1.82, 0.12, 0.12, WOOD2, fx + 0.85, 1.74, fz, 0.012);
  const br = new Vec(fx + 0.06, 0.1, fz + 0.07), br2 = new Vec(fx + 0.82, 1.1, fz + 0.07); rod(G, br, br2, 0.03, WOOD2, 0.01);
  // roof truss triangle
  rod(G, new Vec(fx - 0.05, 1.78, fz), new Vec(fx + 0.85, 2.4, fz), 0.045, WOOD2, 0.01); rod(G, new Vec(fx + 1.75, 1.78, fz), new Vec(fx + 0.85, 2.4, fz), 0.045, WOOD2, 0.01);
  bx(G, 0.7, 0.07, 0.3, WOOD, 2.35, 0.04, 0.9, 0.012).rotation.y = 0.3; bx(G, 0.7, 0.07, 0.3, WOOD, 2.35, 0.11, 0.9, 0.012).rotation.y = -0.1;
  bx(G, 0.5, 0.3, 0.3, "#d8442a", 0.5, 0.15, 0.95, 0.012); bx(G, 0.52, 0.04, 0.32, "#8a2a18", 0.5, 0.31, 0.95, 0.008);
  // the nail the hero is hammering (in the left post's side face)
  const nailY = [1.0, 1.0, 1.0], nail = new THREE.Group(); nail.position.set(fx - 0.06, 1.0, fz); G.add(nail);
  const nh = cy(nail, 0.03, 0.012, "#a8afbc", 0, 0, 0, 0.006); nh.rotation.z = PI / 2;
  const ns = cy(nail, 0.008, 0.07, "#8a91a0", 0.035, 0, 0, 0.004); ns.rotation.z = PI / 2; void nailY;
  // hammer: a handle with a head, placed from the hand each tick
  const ham = new THREE.Group(); root.add(ham); ham.scale.setScalar(1.5);
  cy(ham, 0.024, 0.34, WOOD, 0, 0.0, 0, 0.012); const hh = bx(ham, 0.13, 0.07, 0.06, "#8f97a8", 0, 0.19, 0, 0.012); void hh; bx(ham, 0.05, 0.05, 0.05, "#6b7280", 0.085, 0.19, 0, 0.01);
  // dust + chips per hit
  const HIT = 0.5, T0 = 0.3;
  const dust = Array.from({ length: 3 * 3 }, () => { const m = mesh(new THREE.SphereGeometry(0.1, 10, 8), toonMat("#e9dcc4"), 0, 0, 0, false); m.visible = false; root.add(m); return m; });
  const chips = Array.from({ length: 3 * 5 }, () => { const m = mesh(new THREE.BoxGeometry(0.05, 0.02, 0.03), toonMat("#d9a566"), 0, 0, 0, false); m.visible = false; root.add(m); return m; });
  const star = sprite(starTex("#fff3a0"), 0.5); root.add(star);
  const nailW = new Vec(H[0] + fx - 0.1, H[1] + 1.0, H[2] + fz);
  const swing = (t: number) => {   // 0 raised .. 1 impact
    const u = ((t - T0) % HIT + HIT) % HIT / HIT;
    if (t < T0 - 0.2) return 0.5;
    return u < 0.24 ? seg(u, 0, 0.24) ** 0.7 : 1 - seg(u, 0.26, 0.9) * 0.97;
  };
  return { tick(t) {
    const k = swing(t), hitI = Math.floor((t - T0) / HIT);
    // hand: from raised (back and up) to the nail face; hammer pivots about the hand
    const base = nailW.clone().add(new Vec(-0.37, 0, 0));
    const hand = base.clone().add(new Vec(-0.12 * (1 - k), 0.42 * (1 - k), 0.04 * (1 - k)));
    armW(hero, "r", hand, [0.6, -0.5, -0.9]);
    armW(hero, "l", new Vec(H[0] + fx - 0.08, H[1] + 1.12, H[2] + fz + 0.1), [-1, -0.3, -0.4]);
    const hp = wp(hero.hand("r")), ang = mix(0.35, PI / 2, k);   // 0 = up, PI/2 = pointing at the nail (+x)
    ham.position.copy(hp); ham.rotation.set(0, 0, -ang);   // local +y -> (sin ang, cos ang) in the x-y plane
    // the hammer's hitting end is at local y ~0.19; keep the face on the nail at impact
    ham.position.add(new Vec(0, 0, 0));
    dust.forEach((m, i) => { const j = Math.floor(i / 3), n = hitI - 0 === j ? 1 : 0; const a = t - (T0 + HIT * (j + 0.24 * 1) ); m.visible = a > 0 && a < 0.5 && j <= hitI; const u = a / 0.5; m.scale.setScalar(Math.max(0.01, (0.4 + u) * (1 - u))); m.position.set(nailW.x - 0.1 + (i % 3 - 1) * 0.12 * (0.5 + u), nailW.y + 0.1 + u * 0.4, nailW.z + 0.05 + (i % 3 - 1) * 0.08 * u); void n; });
    chips.forEach((m, i) => { const j = Math.floor(i / 5), a = t - (T0 + HIT * (j + 0.24)), s = (i % 5) - 2; m.visible = a > 0 && a < 0.55 && j <= hitI; m.position.set(nailW.x - 0.1 - 0.6 * a * (0.4 + 0.2 * Math.abs(s)), nailW.y + 0.1 + 1.8 * a - 5 * a * a, nailW.z + s * 0.25 * a); m.rotation.set(a * 9, a * 7 + i, a * 5); });
    const sa = t - (T0 + HIT * (Math.max(0, hitI) + 0.24)); star.visible = hitI >= 0 && sa > -0.02 && sa < 0.12; star.position.set(nailW.x - 0.08, nailW.y + 0.03, nailW.z + 0.25); star.scale.setScalar(0.5 + 3 * Math.max(0, 0.12 - sa));
    nail.position.x = fx - 0.06 + 0.02 * Math.min(1, Math.max(0, (t - T0) / 1.5));
    const uu = (((t - T0) % HIT) + HIT) % HIT / HIT, strain = t > T0 - 0.2 && (uu < 0.45 || uu > 0.92);   // gritted teeth as the hammer comes down, focus while it is raised
    return { pose: "stand", t, expr: (strain ? "effort" : "focus") as Expr };
  } };
} };

// ================================================================ 8. code_screens
const code_screens: ActDef = { pose: "sit", view: "actcode", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c; const rig = rigOf(hero);
  hero.root.rotation.y = 0.2; hero.root.position.set(H[0], H[1] - 0.1, H[2]);
  const G = group(root, H[0], H[1], H[2]);
  // chair
  cy(G, 0.3, 0.07, "#23252f", 0, 0.5, -0.08, 0.012); bx(G, 0.5, 0.65, 0.07, "#23252f", 0, 0.88, -0.38, 0.012); cy(G, 0.04, 0.45, "#6b7280", 0, 0.25, -0.08, 0.008); cy(G, 0.3, 0.04, "#2a2d3a", 0, 0.03, -0.08, 0.008);
  blob(G, 0.9, 0, 0);
  // desks
  bx(G, 1.7, 0.06, 0.8, "#c79a62", 0.15, 0.78, 0.65, 0.02); bx(G, 1.7, 0.74, 0.04, "#8a6a4a", 0.15, 0.4, 1.03, 0.02);
  bx(G, 4.2, 0.06, 0.7, "#3d4666", 0, 0.78, -1.1, 0.02);
  bx(G, 0.5, 0.025, 0.2, "#d7dbe6", -0.05, 0.82, 0.5, 0.008); for (let i = 0; i < 3; i++) bx(G, 0.46, 0.012, 0.03, "#3a3f55", -0.05, 0.84, 0.44 + i * 0.05, 0);
  sp(G, 0.05, "#d7dbe6", 0.3, 0.83, 0.5, 1, 0.5, 1.4, 0.008);
  // code on three screens
  const mkCode = (seed: number, hueC: string) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 512; const g = cv.getContext("2d")!;
    g.fillStyle = "#07120c"; g.fillRect(0, 0, 256, 512); const r = seeded(seed), cols = [hueC, "#5aff9a", "#b6ff6a", "#7affd8", "#e8fff0"];
    for (let i = 0; i < 28; i++) { const ind = Math.floor(r() * 3) * 22, len = 40 + r() * 140; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(14 + ind, 8 + i * 18, len, 9); if (r() > 0.4) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(24 + ind + len, 8 + i * 18, 20 + r() * 50, 9); } }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 0.4); return tex;
  };
  const tL = mkCode(11, "#35e08a"), tR = mkCode(29, "#3ad8ff");
  const ML = monitor(1.05, 0.66, 0.12, tL); ML.g.position.set(-1.45, 0.81, -1.1); ML.g.rotation.y = 0.5; G.add(ML.g);
  const MR = monitor(1.05, 0.66, 0.12, tR); MR.g.position.set(1.45, 0.81, -1.1); MR.g.rotation.y = -0.5; G.add(MR.g);
  const mid = liveTex(384, 224, (g, t) => {
    g.fillStyle = "#07120c"; g.fillRect(0, 0, 384, 224);
    const dep = t > 1.25, p = cl((t - 1.25) / 0.5);
    if (!dep) { const r = seeded(7); for (let i = 0; i < 16; i++) { const y = ((i * 14 - t * 30) % 224 + 224) % 224, len = 60 + r() * 220; g.fillStyle = i % 3 ? "#35e08a" : "#b6ff6a"; g.fillRect(14 + (i % 3) * 20, y, len, 8); } }
    else {
      g.fillStyle = "#0a2a14"; g.fillRect(0, 0, 384, 224); g.fillStyle = "#35e08a"; g.font = "900 34px Arial Black, Arial, sans-serif"; g.fillText("DEPLOYING...", 54, 70);
      g.strokeStyle = "#35e08a"; g.lineWidth = 4; g.strokeRect(40, 100, 304, 34); g.fillRect(44, 104, 296 * p, 26);
      if (p >= 1) { g.fillStyle = "#07120c"; g.fillRect(0, 0, 384, 224); g.fillStyle = "#35ff8a"; g.beginPath(); g.arc(192, 90, 52, 0, PI * 2); g.fill(); g.strokeStyle = "#07120c"; g.lineWidth = 16; g.beginPath(); g.moveTo(166, 90); g.lineTo(186, 112); g.lineTo(222, 66); g.stroke(); g.fillStyle = "#35ff8a"; g.font = "900 34px Arial Black, Arial, sans-serif"; g.fillText("LIVE!", 140, 190); }
    }
  });
  const MM = monitor(1.5, 0.88, 0.0, mid.tex); MM.g.position.set(0, 1.64, -1.2); G.add(MM.g); cy(G, 0.03, 0.9, "#2a2d3a", 0, 1.2, -1.3, 0.01);
  const flash = new THREE.PointLight("#35ff8a", 0, 8, 2); flash.position.set(0, 1.5, 0.4); G.add(flash);
  // deploy button + sign
  const BTN = new Vec(0.55, 0.0, 0.56);
  const bt = group(G, BTN.x, 0.81, BTN.z); cy(bt, 0.17, 0.06, "#4a4e60", 0, 0.03, 0, 0.012);
  const dome = cy(bt, 0.12, 0.07, "#e5262f", 0, 0.1, 0, 0.012); const domeM = dome.material as THREE.MeshToonMaterial; void domeM;
  const lamp = new THREE.MeshBasicMaterial({ color: "#ff4040" }); const lampM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20), lamp); lampM.position.y = 0.14; bt.add(lampM);
  const stext = canvasTex(256, 64, (g) => { g.fillStyle = "#e5262f"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#fff"; g.font = "900 44px Arial Black, Arial, sans-serif"; g.fillText("DEPLOY", 30, 48); });
  bx(G, 0.6, 0.16, 0.03, "#151018", 0.55, 1.0, 0.86, 0.01); const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.14), new THREE.MeshBasicMaterial({ map: stext, toneMapped: false })); sg.position.set(0.55, 1.0, 0.88); G.add(sg);
  // confetti
  const N = 70, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
  const rnd = seeded(c.seed * 31 + 7), cs = Array.from({ length: N }, () => ({ x: (rnd() - 0.5) * 4, z: rnd() * 2 - 1, ph: rnd(), sp: 1.2 + rnd() * 1.2, r: rnd() * 6, d: rnd() * 0.25 }));
  ["#35ff8a", "#ffffff", "#5affc8", "#b6ff6a", "#ffd23a"].forEach((cc, i) => cs.forEach((_, k) => { if (k % 5 === i) conf.setColorAt(k, new THREE.Color(cc)); }));
  conf.frustumCulled = false; G.add(conf);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p4 = new Vec(), s4 = new Vec(1, 1, 1);
  const SLAM = 1.18;
  return { tick(t) {
    tL.offset.y = -(t * 0.35) % 1; tR.offset.y = -(t * 0.45) % 1; mid.upd(t);
    const SY = shY(hero), ty = (o: number) => 0.03 * Math.max(0, Math.sin(t * 25 + o));
    const bob = (o: number) => ty(o);
    // left hand always types; right hand types, then lifts and slams the button
    arm(hero, "l", 0.13, SY - 0.33 + bob(0), 0.47, [-1.2, -0.5, -0.3]);
    const up = seg(t, 0.75, SLAM - 0.1), down = seg(t, SLAM - 0.1, SLAM), rel = seg(t, SLAM + 0.15, SLAM + 0.45);
    const typeP = new Vec(0.15 + 0.03 * Math.sin(t * 9), SY - 0.33 + bob(1.7), 0.47), rg = rigOf(hero);
    c.hero.root.updateMatrixWorld(true);
    const btnW = new Vec(H[0] + BTN.x, H[1] + 0.97, H[2] + BTN.z + 0.0), btnR = rg.worldToLocal(btnW.clone());
    const hi = btnR.clone().add(new Vec(0.0, 0.42, -0.1));
    let tgt = typeP.clone();
    if (t >= 0.75) { tgt.lerp(hi, up); if (t > SLAM - 0.1) tgt.lerp(btnR, down); if (t > SLAM + 0.15) tgt.lerp(hi.clone().add(new Vec(0.1, 0.1, 0)), rel); }
    ik(hero, "r", tgt, [1.2, -0.5, -0.3]);
    if (t > SLAM) {   // the free hand pumps a fist while the button is slammed
      const pu = seg(t, SLAM, SLAM + 0.2);
      ik(hero, "l", new Vec(0.28 + 0.03 * Math.sin(t * 14), SY + 0.1 + 0.28 * pu, 0.24), [-1.2, -0.3, -0.3]);
    }
    const pressed = t > SLAM && t < SLAM + 0.4;
    dome.position.y = pressed ? 0.075 : 0.1; lamp.color.set(t > SLAM ? "#6aff9a" : (Math.sin(t * 12) > 0 && t > 0.8 ? "#ffd0d0" : "#ff4040")); lampM.position.y = pressed ? 0.115 : 0.14;
    flash.intensity = t > SLAM ? 4 * Math.max(0, 1 - (t - SLAM) / 0.6) : 0;
    for (let i = 0; i < N; i++) { const s = cs[i], a = Math.max(0, t - SLAM - 0.05 - s.d); const y = a > 0 ? 3.6 - ((a * s.sp) % 3.6) : -9; p4.set(s.x + Math.sin(a * 2 + s.r) * 0.25, y, s.z); q4.setFromEuler(new THREE.Euler(a * 6 + s.r, a * 4, a * 3)); m4.compose(p4, q4, s4); conf.setMatrixAt(i, m4); }
    conf.instanceMatrix.needsUpdate = true;
    rig.rotation.x = 0.06; rig.rotation.y = 0.0;
    return { pose: "sit", t, expr: (t < SLAM - 0.15 ? "focus" : t < SLAM + 0.55 ? "shout" : "laugh") as Expr };
  } };
} };

// ================================================================ 9. robot_build
const robot_build: ActDef = { pose: "stand", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 0.75; hero.root.position.set(H[0], H[1], H[2]);
  const G = group(root, H[0], H[1], H[2]);
  // the robot: own build (arms are pivots so it can wave), eyes use their own materials so they can switch on
  const R = group(G, 1.3, 0, 0.0); R.rotation.y = -0.65; blob(R, 0.7, 0, 0);
  const body = group(R, 0, 0, 0);
  const bodyCol = "#4aa8ff";
  const torso = bx(body, 0.62, 0.62, 0.42, bodyCol, 0, 0.95, 0, 0.022); void torso;
  const panel = bx(body, 0.34, 0.24, 0.02, "#12182a", 0, 0.97, 0.22, 0.01);
  const lights: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 3; i++) { const lm = new THREE.MeshBasicMaterial({ color: "#2a3050" }); lights.push(lm); const l = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), lm); l.position.set(-0.08 + i * 0.08, 0.97, 0.235); body.add(l); }
  void panel;
  cy(body, 0.05, 0.1, "#454a58", 0, 1.3, 0, 0.01);
  const hd = group(body, 0, 1.55, 0); bx(hd, 0.56, 0.42, 0.42, "#e8edf5", 0, 0, 0, 0.022); bx(hd, 0.44, 0.22, 0.02, "#12182a", 0, 0.0, 0.22, 0.01);
  const eyeM = [new THREE.MeshBasicMaterial({ color: "#2a3a50" }), new THREE.MeshBasicMaterial({ color: "#2a3a50" })];
  eyeM.forEach((m, i) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), m); e.position.set(i ? 0.11 : -0.11, 0.0, 0.235); hd.add(e); });
  cy(hd, 0.012, 0.18, "#454a58", 0, 0.3, 0, 0.008); const ant = sp(hd, 0.04, "#7a2a2a", 0, 0.42, 0, 1, 1, 1, 0.01);
  const antM = new THREE.MeshBasicMaterial({ color: "#7a2a2a" }); ant.material = antM;
  for (const s of [-1, 1]) cy(hd, 0.06, 0.1, bodyCol, s * 0.31, 0, 0, 0.012).rotation.z = PI / 2;
  const mkArm = (s: number) => { const a = group(body, s * 0.42, 1.2, 0); sp(a, 0.09, bodyCol, 0, 0, 0, 1, 1, 1, 0.014); cy(a, 0.055, 0.5, "#e8edf5", 0, -0.27, 0, 0.014); sp(a, 0.075, bodyCol, 0, -0.55, 0, 1, 1, 1, 0.012); return a; };
  const armR_ = mkArm(1), armL_ = mkArm(-1);
  for (const s of [-1, 1]) { cy(body, 0.08, 0.55, "#454a58", s * 0.17, 0.3, 0, 0.012); bx(body, 0.22, 0.08, 0.34, bodyCol, s * 0.17, 0.05, 0.05, 0.012); }
  // the bolt on the robot's chest-side panel, facing the hero
  const bolt = group(body, -0.31, 1.0, 0.0); bolt.rotation.z = PI / 2;
  const bolt2 = cy(bolt, 0.06, 0.04, "#cfd5e2", 0, 0, 0, 0.012, 0.06); bolt2.rotation.y = 0; const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6), toonMat("#cfd5e2")); hex.position.y = -0.02; hex.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 6), INK)); bolt.add(hex);
  // spare parts on the floor + a wrench
  bx(G, 0.5, 0.12, 0.3, "#c8442a", 0.55, 0.06, 0.65, 0.012); cy(G, 0.1, 0.1, "#8a91a0", 0.4, 0.17, 0.65, 0.01);
  const wr = new THREE.Group(); root.add(wr); wr.scale.setScalar(1.7); bolt.scale.setScalar(1.8);
  cy(wr, 0.032, 0.55, "#ffb020", 0, 0.0, 0, 0.014); const jaw = torus(wr, 0.085, 0.03, "#ffb020", 0, 0.31, 0, 0.012); jaw.scale.set(1, 1, 1);
  const sparks = floaters(root, [starTex("#ffe14a"), starTex("#ffffff")], 6, 0.2, { x: 0, y: 0, z: 0, spread: 0.1, rise: 0.4, life: 0.4, wob: 0.2 }); void sparks;
  const stars = Array.from({ length: 5 }, () => { const s = sprite(starTex("#ffe14a"), 0.3); s.visible = false; root.add(s); return s; });
  const BOOT = 1.1, glowL = new THREE.PointLight("#38e8ff", 0, 5, 2); glowL.position.set(0, 1.6, 0.6); R.add(glowL);
  const ratch = (t: number) => { const u = (t * 2.2) % 1; return u < 0.55 ? sm(u / 0.55) : 1 - sm((u - 0.55) / 0.45); };
  return { tick(t) {
    const on = t > BOOT, k = seg(t, BOOT, BOOT + 0.15);
    const eyeC = new THREE.Color().lerpColors(new THREE.Color("#2a3a50"), new THREE.Color(0.6, 2.2, 2.4), k);
    eyeM.forEach((m) => m.color.copy(eyeC)); lights.forEach((m, i) => m.color.copy(new THREE.Color().lerpColors(new THREE.Color("#2a3050"), i % 2 ? new THREE.Color(0.6, 2.2, 0.8) : new THREE.Color(2.2, 1.4, 0.4), k)));
    antM.color.copy(on ? new THREE.Color(2.2, 0.3, 0.3).multiplyScalar(0.6 + 0.4 * Math.sin(t * 10)) : new THREE.Color("#7a2a2a"));
    glowL.intensity = k * 5;
    const hop = on ? Math.max(0, Math.sin((t - BOOT) * 7)) * 0.12 * (1 - seg(t, BOOT + 0.4, BOOT + 1.0)) : 0; body.position.y = hop; hd.rotation.y = on ? 0.35 * Math.sin((t - BOOT) * 4) * seg(t, BOOT, BOOT + 0.3) : 0;
    armR_.rotation.z = on ? mix(0.15, 2.5, seg(t, BOOT + 0.1, BOOT + 0.4)) + 0.3 * Math.sin((t - BOOT) * 12) * seg(t, BOOT + 0.35, BOOT + 0.5) : 0.12; armL_.rotation.z = -0.12;
    // wrench on the bolt: ratchets back and forth until the robot boots
    const boltW = bolt.getWorldPosition(new Vec()), wk = on ? 0 : ratch(t);
    bolt.rotation.x = on ? 0 : wk * 0.9;
    const R_ = new Vec(Math.sin(R.rotation.y), 0, Math.cos(R.rotation.y));
    const ob = boltW.clone().addScaledVector(R_, -0.0).add(new Vec(-0.12, 0, 0.1));
    const wdir = new Vec(-0.9, 0.25 + 0.55 * wk, 0.3).normalize();
    const handT = boltW.clone().addScaledVector(wdir, 0.5).add(new Vec(-0.1, 0, 0.0)); void ob;
    const hold = on ? seg(t, BOOT + 0.05, BOOT + 0.5) : 0;
    const handTo = handT.clone().lerp(new Vec(H[0] + 0.1, H[1] + 2.2, H[2] + 0.3), hold);
    armW(hero, "r", handTo, [0.8, -0.6, -0.5]);
    armW(hero, "l", boltW.clone().add(new Vec(0.0, 0.2, 0.25)).lerp(new Vec(H[0] - 0.3, H[1] + 2.1, H[2] + 0.2), hold), [-1.2, -0.5, -0.3]);
    wr.visible = !on; placeAlong(wr, boltW.clone().addScaledVector(wdir, 0.0), wdir.clone().multiplyScalar(-1)); wr.position.copy(boltW).addScaledVector(wdir, 0.02); wr.quaternion.setFromUnitVectors(new Vec(0, 1, 0), wdir.clone().multiplyScalar(-1));
    stars.forEach((s, i) => { const a = t - BOOT - i * 0.05; s.visible = on && a > 0 && a < 0.5; s.position.set(boltW.x + (i - 2) * 0.22, boltW.y + 0.9 + a * 1.2, boltW.z + 0.3); s.scale.setScalar(Math.max(0.01, Math.sin(PI * cl(a / 0.5)) * 1.2)); });
    const hasCheer = on && t > BOOT + 0.2;
    const rex: Expr = t < BOOT ? "focus" : t < BOOT + 0.5 ? "shock" : "laugh";   // working -> it moves! -> laughs
    return hasCheer ? { pose: "cheer", t: t * 0.5, expr: rex } : { pose: "stand", t, expr: rex };
  } };
} };

// ================================================================ 10. post_video
const fmtViews = (v: number) => (v >= 999500 ? (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(".0", "") + "M" : "1M") : v >= 1000 ? (v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace(".0", "") + "K" : String(Math.round(v)));
const post_video: ActDef = { pose: "stand", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 0.8; hero.root.position.set(H[0] + 0.2, H[1], H[2]);
  const G = group(root, H[0], H[1], H[2]);
  const P = group(G, 1.45, 0.08, -0.1); P.rotation.y = -0.75; blob(G, 0.9, 1.5, -0.1);
  const W = 0.95, Hh = 1.85, T = 0.09, PY = Hh / 2 + 0.05;
  const ph = group(P, 0, PY, 0); ph.rotation.x = -0.1;
  bx(ph, W, Hh, T, "#181a24", 0, 0, 0, 0.025);
  bx(P, 0.16, 0.1, 0.4, "#181a24", 0, 0.1, -0.3, 0.015);
  const TAP = 0.62;
  const scr = liveTex(270, 520, (g, t) => {
    const posted = t > TAP;
    const sky = g.createLinearGradient(0, 0, 0, 520); sky.addColorStop(0, posted ? "#ff7ac8" : "#2a2f4a"); sky.addColorStop(1, posted ? "#ffc65a" : "#14172a"); g.fillStyle = sky; g.fillRect(0, 0, 270, 520);
    if (posted) {
      g.fillStyle = "#ffe98a"; g.beginPath(); g.arc(135, 190 + 10 * Math.sin(t * 2), 56, 0, PI * 2); g.fill();
      g.fillStyle = "#7a3aa8"; g.beginPath(); g.moveTo(0, 360); g.quadraticCurveTo(70, 280, 150, 350); g.quadraticCurveTo(210, 300, 270, 360); g.lineTo(270, 520); g.lineTo(0, 520); g.fill();
      g.fillStyle = "#fff"; g.font = "bold 18px Arial, sans-serif"; g.fillText("@you  #fyp", 16, 470); g.font = "bold 22px Arial, sans-serif"; g.fillText(fmtViews(Math.min(1e6, Math.pow(10, 3 + 3 * cl((t - TAP - 0.1) / 1.3)))) + " views", 16, 36);
      const pop = 1 + 0.15 * Math.max(0, Math.sin(t * 9)); g.fillStyle = "#ff3b6b"; g.beginPath(); g.arc(240, 330, 16 * pop, 0, PI * 2); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(240, 380, 14, 0, PI * 2); g.fill(); g.beginPath(); g.arc(240, 424, 14, 0, PI * 2); g.fill();
    } else {
      g.fillStyle = "#3a4166"; g.fillRect(24, 90, 222, 250); g.fillStyle = "#6a76b0"; g.beginPath(); g.moveTo(104, 170); g.lineTo(104, 260); g.lineTo(180, 215); g.closePath(); g.fill();
      g.fillStyle = "#fff"; g.font = "bold 22px Arial, sans-serif"; g.fillText("New video", 24, 56);
      const pr = t > TAP - 0.1 && t < TAP + 0.12; g.fillStyle = pr ? "#1b6bd8" : "#2f8bff"; g.beginPath(); g.roundRect(35, 400, 200, 74, 37); g.fill(); g.fillStyle = "#fff"; g.font = "900 38px Arial Black, Arial, sans-serif"; g.fillText("POST", 76, 450);
    }
  });
  screenPlane(ph, W - 0.1, Hh - 0.18, scr.tex, 0, 0, T / 2 + 0.003, 1.2);
  bx(ph, 0.2, 0.025, 0.01, "#050508", 0, Hh / 2 - 0.05, T / 2 + 0.006, 0);
  const playTex = canvasTex(128, 128, (g) => { g.fillStyle = "#ffffff"; g.strokeStyle = "#151018"; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 54, 0, PI * 2); g.fill(); g.stroke(); g.fillStyle = "#e5262f"; g.beginPath(); g.moveTo(50, 36); g.lineTo(50, 92); g.lineTo(96, 64); g.closePath(); g.fill(); });
  const play = sprite(playTex, 0.9); root.add(play);
  const counter = liveTex(320, 110, (g, t) => {
    g.fillStyle = "rgba(20,16,30,0.94)"; g.strokeStyle = "#ffffff"; g.lineWidth = 6; g.beginPath(); g.roundRect(8, 8, 304, 94, 30); g.fill(); g.stroke();
    g.fillStyle = "#ff3b6b"; g.beginPath(); g.moveTo(52, 38); g.lineTo(52, 72); g.lineTo(82, 55); g.closePath(); g.fill();
    const v = Math.pow(10, 3 + 3 * cl((t - TAP - 0.1) / 1.3)); g.fillStyle = "#ffffff"; g.font = "900 56px Arial Black, Arial, sans-serif"; g.fillText(fmtViews(t < TAP ? 0 : v), 100, 76);
  });
  const ct = sprite(counter.tex, 1.0, 0.34); root.add(ct);
  const hearts = [heartTex("#ff3b6b"), heartTex("#ff8aa8"), heartTex("#ffffff"), heartTex("#ff3b6b")];
  const fh = floaters(root, hearts, 12, 0.3, { x: H[0] + 1.4, y: H[1] + 1.4, z: H[2] + 0.3, spread: 0.55, rise: 1.9, life: 1.2, start: TAP + 0.1, drift: 0.25, wob: 0.12 });
  const btnL = new Vec(0, -0.62 * (Hh / 2), T / 2 + 0.01);
  return { tick(t) {
    scr.upd(t); counter.upd(t); P.updateMatrixWorld(true);
    const bw = ph.localToWorld(btnL.clone()), nrm = new Vec(0, 0, 1).transformDirection(ph.matrixWorld);
    const tapU = seg(t, TAP - 0.3, TAP - 0.02) * (1 - seg(t, TAP + 0.05, TAP + 0.35));
    const rest = new Vec(H[0] + 0.45, H[1] + 1.15, H[2] + 0.5);
    armW(hero, "r", rest.clone().lerp(bw.clone().addScaledVector(nrm, 0.17 * (1 - seg(t, TAP - 0.08, TAP))), cl(seg(t, 0.05, TAP - 0.12) + seg(t, TAP - 0.12, TAP) * 1) * (t < TAP + 0.35 ? 1 : 1 - seg(t, TAP + 0.35, TAP + 0.7))), [1.2, -0.3, -0.5]);
    arm(hero, "l", 0.12, 1.0, 0.3, [-1.2, -0.7, -0.3]); void tapU;
    const pa = t - TAP - 0.08; play.visible = pa > 0 && pa < 1.0; const ps = pa < 0.3 ? 1 + 2.2 * (pa / 0.3 - 1) ** 3 + 1.2 * (pa / 0.3 - 1) ** 2 : 1; play.position.copy(ph.localToWorld(new Vec(0, 0.28, 0.12))); play.scale.setScalar(Math.max(0.01, ps) * (1 - seg(t, TAP + 0.8, TAP + 1.1) * 0.0));
    ct.position.copy(ph.localToWorld(new Vec(0, Hh / 2 + 0.3, 0.12))); ct.scale.setScalar(t > TAP - 0.1 ? 1 + 0.05 * Math.sin(t * 10) : 0.001);
    fh(t, 0, 0, 0, t > TAP ? 1 : 0);
    return { pose: "stand", t, expr: (t < TAP + 0.1 ? "grin" : t < TAP + 0.9 ? "shock" : "laugh") as Expr };   // eager -> the views explode -> laughs
  } };
} };

export const CREATOR: Record<string, ActDef> = {
  gaming, streaming, sing_stage, guitar, film_camera, rocket_launch, build_tools, code_screens, robot_build, post_video,
};
