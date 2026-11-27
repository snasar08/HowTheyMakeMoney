// Afterhour sports acts, part 2 (Nov 16, worker D): football, baseball, tennis, golf, soccer celebration, race car, sprint finish, weightlifting.
// Same rules as sports.ts: the ball / bat / racket / bar really exist and follow the hero's hands; everything is a pure function of t.
// Ah calls tick() twice per frame (before and after posing the hero): overrides are absolute assignments, props follow the posed hero.
import * as THREE from "three";
import { toonMat, outline, canvasTex, seeded } from "../common";
import { makeThing } from "../things3d";
import { makeChar, Char, Look } from "../char";
import { exAt, popText, starAt } from "./sports";
import { drawCard } from "../cards";
import type { ActDef, ActCtx, ActRun, ActPose } from "./types";

type V3 = [number, number, number];
const Vec = THREE.Vector3;
const PI = Math.PI;
const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x: number) => { x = cl(x); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const wp = (o: THREE.Object3D) => o.getWorldPosition(new Vec());
const rigOf = (c: Char) => c.root.children[0] as THREE.Group;
/** keyframes [t, v...] (sorted), eased in/out between keys */
const kf = (t: number, rows: number[][]): number[] => {
  if (t <= rows[0][0]) return rows[0].slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i], B = rows[i + 1];
    if (t <= B[0]) { const k = sm((t - A[0]) / (B[0] - A[0])); return A.slice(1).map((v, j) => v + (B[j + 1] - v) * k); }
  }
  return rows[rows.length - 1].slice(1);
};
/** same, linear between keys (continuous motion) */
const kl = (t: number, rows: number[][]): number[] => {
  if (t <= rows[0][0]) return rows[0].slice(1);
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i], B = rows[i + 1];
    if (t <= B[0]) { const k = (t - A[0]) / (B[0] - A[0]); return A.slice(1).map((v, j) => v + (B[j + 1] - v) * k); }
  }
  return rows[rows.length - 1].slice(1);
};

// ---------------------------------------------------------------- arm IK (copy of sports.ts)
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
const dpole = (side: "l" | "r"): V3 => (side === "r" ? [1.2, -0.7, -0.3] : [-1.2, -0.7, -0.3]);
/** hand to a rig-space point (x signed: +x = the rig's right) */
const armRig = (c: Char, side: "l" | "r", p: THREE.Vector3 | V3, pole?: V3) => {
  const v = Array.isArray(p) ? new Vec(...p) : p;
  ik(c, side, v, pole ?? dpole(side));
};
/** hand to a world point */
const armW = (c: Char, side: "l" | "r", p: THREE.Vector3, pole?: V3) => {
  c.root.updateMatrixWorld(true);
  ik(c, side, rigOf(c).worldToLocal(p.clone()), pole ?? dpole(side));
};
/** rig space -> world */
const RW = (c: Char, x: number, y: number, z: number) => { c.root.updateMatrixWorld(true); return rigOf(c).localToWorld(new Vec(x, y, z)); };

// ---------------------------------------------------------------- legs: custom stances + planting the feet so any lean stays on the ground
type Legs = { hR: THREE.Object3D; kR: THREE.Object3D; hL: THREE.Object3D; kL: THREE.Object3D; sl: number };
const LEGS = new WeakMap<Char, Legs>();
const legsOf = (c: Char): Legs => {
  let L = LEGS.get(c); if (L) return L;
  const rig = rigOf(c);
  const hips = rig.children.filter((o) => o.type === "Group" && o.name === "hip" && o.children.length >= 3);
  const hR = hips.find((o) => o.position.x > 0) ?? hips[0], hL = hips.find((o) => o.position.x < 0) ?? hips[1];
  const kn = (h: THREE.Object3D) => h.children.find((o) => o.type === "Group")!;
  L = { hR, hL, kR: kn(hR), kL: kn(hL), sl: hR.position.y / 0.55 };
  LEGS.set(c, L); return L;
};
/** thigh forward a (rad), knee bend b, optional outward spread; the lean `lean` of the rig is cancelled so thighs are measured in the world */
const stance = (c: Char, aR: number, bR: number, aL: number, bL: number, lean = 0, spread = 0.06) => {
  const L = legsOf(c);
  L.hR.rotation.set(-aR - lean, 0, spread); L.kR.rotation.x = bR; L.hL.rotation.set(-aL - lean, 0, -spread); L.kL.rotation.x = bL;
};
const SOLE = 0.015;
/** put the feet's midpoint at (ax, az) with the lowest sole (or knee) on `floor`: call after the root yaw, rig lean and legs are set */
const plant = (c: Char, ax: number, az: number, mode: "feet" | "knees" = "feet", floor = 0) => {
  const L = legsOf(c), r = c.root; r.position.set(ax, 0, az); r.updateMatrixWorld(true);
  const a = L.kR.localToWorld(new Vec(0, -0.255 * L.sl, 0)), b = L.kL.localToWorld(new Vec(0, -0.255 * L.sl, 0));
  let ymin: number, mx: number, mz: number;
  if (mode === "feet") { ymin = Math.min(a.y, b.y) - SOLE * L.sl; mx = (a.x + b.x) / 2; mz = (a.z + b.z) / 2; }
  else { const ka = wp(L.kR), kb = wp(L.kL), ha = wp(L.hR), hb = wp(L.hL); ymin = Math.min(ka.y, kb.y) - 0.07; mx = (ha.x + hb.x) / 2; mz = (ha.z + hb.z) / 2; }
  r.position.x += ax - mx; r.position.z += az - mz; r.position.y += floor - ymin;
  r.updateMatrixWorld(true);
};
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

// ---------------------------------------------------------------- props
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
};
const bx = (parent: THREE.Object3D, w: number, h: number, d: number, col: string | THREE.Material, x: number, y: number, z: number, ink = 0.02) => {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof col === "string" ? toonMat(col) : col, x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.BoxGeometry(w + ink * 2, h + ink * 2, d + ink * 2), INK));
  parent.add(m); return m;
};
const cyl = (parent: THREE.Object3D, r: number, h: number, col: string, x: number, y: number, z: number, ink = 0.02, rt = r) => {
  const m = mesh(new THREE.CylinderGeometry(rt, r, h, 16), toonMat(col), x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.CylinderGeometry(rt + ink, r + ink, h + ink * 2, 16), INK));
  parent.add(m); return m;
};
/** flat paint on the ground (a plane lying at y, centred at x,z) */
const paint = (parent: THREE.Object3D, w: number, d: number, col: string, x: number, z: number, y = 0.025, ry = 0) => {
  const m = mesh(new THREE.PlaneGeometry(w, d), toonMat(col), x, y, z, false); m.rotation.x = -PI / 2; m.rotation.z = ry; m.receiveShadow = true; parent.add(m); return m;
};
const BLOB = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.34, depthWrite: false });
const blob = (parent: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), BLOB); m.rotation.x = -PI / 2; m.position.y = 0.035; m.renderOrder = 2; parent.add(m); return m; };
const dropShadow = (b: THREE.Object3D, p: THREE.Vector3, r: number) => {
  const h = Math.max(0, p.y - r); b.position.set(p.x, 0.035, p.z); b.scale.setScalar(r * (1.25 - 0.1 * Math.min(h, 3)) * 1.1); b.visible = h < 6;
};
const Z = new Vec(0, 0, 1), Y = new Vec(0, 1, 0);
const aimZ = (o: THREE.Object3D, d: THREE.Vector3) => { o.quaternion.setFromUnitVectors(Z, d.clone().normalize()); };
const aimY = (o: THREE.Object3D, d: THREE.Vector3) => { o.quaternion.setFromUnitVectors(Y, d.clone().normalize()); };
const ball = (r: number, col: string, ink = 0.022) => { const m = mesh(new THREE.SphereGeometry(r, 22, 14), toonMat(col)); outline(m, ink); return m; };
const fall = (y0: number, v0: number, t: number, r: number, g = 14, e = 0.5) => {
  let y = y0, v = v0, tt = 0;
  while (tt < t - 1e-9) {
    const h = Math.min(1 / 240, t - tt); v -= g * h; y += v * h;
    if (y < r) { y = r; v = -v * e; if (Math.abs(v) < 1.2) v = 0; }
    tt += h;
  }
  return y;
};
/** projectile from p0 to p1 in time T with an arc of extra height `hh` (parabola through both), s in 0..1 */
const arc = (p0: THREE.Vector3, p1: THREE.Vector3, s: number, hh: number) => new Vec(mix(p0.x, p1.x, s), mix(p0.y, p1.y, s) + 4 * hh * s * (1 - s), mix(p0.z, p1.z, s));

/** an American football, long axis = local +z; spin = group to roll about the axis */
const football = (L = 1) => {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const m = mesh(new THREE.SphereGeometry(1, 24, 16), toonMat("#9a5a28")); m.scale.set(0.17 * L, 0.17 * L, 0.3 * L);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), INK); hull.scale.setScalar(1.13); m.add(hull); spin.add(m);
  for (const z of [-0.13, 0.13]) { const t = mesh(new THREE.TorusGeometry(0.152 * L * (1 - Math.abs(z) * 0.28), 0.012 * L, 6, 24), toonMat("#fafafa"), 0, 0, z * L, false); spin.add(t); }
  for (let i = 0; i < 5; i++) spin.add(mesh(new THREE.BoxGeometry(0.05 * L, 0.01 * L, 0.012 * L), toonMat("#fafafa"), 0, 0.168 * L, (-0.06 + i * 0.03) * L, false));
  spin.add(mesh(new THREE.BoxGeometry(0.01 * L, 0.01 * L, 0.14 * L), toonMat("#fafafa"), 0, 0.169 * L, 0, false));
  return { g, spin };
};
/** yellow field goal upright */
const goalPost = (parent: THREE.Object3D, x: number, z: number, ry = 0) => {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
  cyl(g, 0.09, 3.0, "#ffd21f", 0, 1.5, 0, 0.025);
  bx(g, 3.2, 0.12, 0.12, "#ffd21f", 0, 3.0, 0, 0.025);
  for (const s of [-1, 1]) cyl(g, 0.06, 3.4, "#ffd21f", s * 1.6, 4.7, 0, 0.02);
  return g;
};
/** white yard lines across the field */
const yardLines = (parent: THREE.Object3D, cx: number, z0: number, z1: number, step: number, w = 14) => {
  for (let z = z0; z <= z1 + 1e-6; z += step) paint(parent, w, 0.1, "#f4f7f0", cx, z, 0.024);
};
/** pop of sparks at a point (flat star facing the camera): burst(t0, t, pos) */
const spark = (parent: THREE.Object3D, col = "#fff2a0") => {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2, b = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.02), m, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, false); b.rotation.z = a; g.add(b); }
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })); g.add(core);
  g.visible = false; parent.add(g);
  return (t0: number, t: number, p: THREE.Vector3, k = 1) => {
    const a = t - t0; g.visible = a >= 0 && a < 0.22; if (!g.visible) return;
    g.position.copy(p); g.position.z += 0.35; g.scale.setScalar(k * (0.45 + a * 6) * (1 - 0.6 * a / 0.22)); g.rotation.z = a * 4;
  };
};
/** fading trail of balls following a path function */
const trail = (parent: THREE.Object3D, n: number, r: number, col = "#ffffff") => {
  const ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 * (1 - i / n), toneMapped: false, depthWrite: false })); m.visible = false; parent.add(m); ms.push(m); }
  return (path: (t: number) => THREE.Vector3 | null, t: number, dt: number) => {
    ms.forEach((m, i) => { const p = path(t - (i + 1) * dt); m.visible = !!p; if (p) { m.position.copy(p); m.scale.setScalar(1 - 0.6 * i / n); } });
  };
};
const JERSEY = (body: string, text: string, trim = "#ffffff", extra: Partial<Look> = {}): Look => ({ body, legs: body, outfit: "jersey", text, trim, height: 1.3, ...extra });
const hatOf = (c: Char) => rigOf(c).children.find((o) => !(o as THREE.Mesh).isMesh === false && Math.abs(o.position.x) < 1e-3 && Math.abs(o.position.y - c.headY) < 0.06);

// ================================================================ American football
const QB_YAW = (t: number) => kf(t, [[0, -0.5], [0.5, -0.65], [0.95, -0.85], [1.1, -0.9], [1.7, -0.7]])[0];
const qb_throw: ActDef = { pose: "stand", view: "act", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY;
  yardLines(root, H[0] + 1.4, H[2] - 11, H[2] + 4, 1.6, 12);
  goalPost(root, H[0] + 1.4, H[2] - 9);
  const fb = football(1.45), sh = blob(root); root.add(fb.g);
  const trl = trail(root, 8, 0.16, "#ffffff");
  const rcv = makeChar(JERSEY("#d8342c", "88", "#fafafa")); root.add(rcv.root);
  const Q0 = [H[0] + 1.7, H[2] + 0.35], Q1 = [H[0] + 2.0, H[2] + 0.05];   // Nov 21: a step left of the sideline down-marker so it never hides the arm
  const RS = [H[0] - 0.7, H[2] - 3.2], RC = [H[0] + 0.6, H[2] - 0.9], TR = 0.96, TC = 1.7;
  const pop = popText(root, "COMPLETE!", [RC[0] + 0.8, H[1] + 3.3, RC[1] + 0.8], 1.4);   // Nov 21: top of the frame, between the two players (above both heads), only after the catch
  const qbPose = (t: number): ActPose => (t < 0.52 ? { pose: "walk", t: -t * 0.95 } : { pose: "stand", t });
  const rcvAt = (t: number) => {
    const k = cl(t / TC, 0, 1.18), x = mix(RS[0], RC[0], k), z = mix(RS[1], RC[1], k);
    rcv.root.rotation.y = yawOf(RC[0] - RS[0], RC[1] - RS[1]) * 0.8; rcv.set(t, "run", exAt(t, [[0, "focus"], [TC - 0.25, "shout"], [TC + 0.1, "laugh"]]));
    return plantRun(rcv, x, z);
  };
  const plantRun = (ch: Char, x: number, z: number) => { ch.root.position.set(x, H[1], z); const r = rigOf(ch); r.rotation.x = 0.2; return ch; };
  // QB: everything except the ball flight
  const qb = (t: number) => {
    hero.root.rotation.y = QB_YAW(t);
    const rig = rigOf(hero), w = seg(t, 0.45, 0.62);
    const lean = kf(t, [[0, 0.1], [0.55, 0.05], [0.8, -0.2], [0.98, 0.3], [1.3, 0.36], [1.9, 0.15]])[0];
    rig.rotation.set(lean, 0, 0);
    const L = legsOf(hero), r0 = [L.hR.rotation.x, L.hL.rotation.x, L.kR.rotation.x, L.kL.rotation.x];
    const rel = seg(t, 0.8, 1.0);
    const aR = mix(-0.1, -0.35, rel), bR = mix(0.2, 0.3, rel), aL = mix(0.25, 0.7, rel), bL = mix(0.35, 0.6, rel);
    stance(hero, aR, bR, aL, bL, lean, 0.1);
    L.hR.rotation.x = mix(r0[0], L.hR.rotation.x, w); L.hL.rotation.x = mix(r0[1], L.hL.rotation.x, w);
    L.kR.rotation.x = mix(r0[2], L.kR.rotation.x, w); L.kL.rotation.x = mix(r0[3], L.kL.rotation.x, w);
    const a = kl(t, [[0, Q0[0], Q0[1]], [0.55, Q1[0], Q1[1]]]);
    plant(hero, a[0], a[1]);
    const Bq = kf(t, [[0, 0, SY - 0.32, 0.42], [0.5, 0, SY - 0.32, 0.42], [0.64, 0.5, SY - 0.1, -0.1], [0.78, 0.55, SY + 0.15, -0.35], [TR, 0.4, HY + 0.6, 0.2]]);
    const follow = kf(t, [[TR, 0.32, HY + 0.5, 0.55], [1.2, 0.0, SY - 0.2, 0.62], [1.55, -0.12, SY - 0.5, 0.4]]);
    const held = t < TR, rp = held ? [Bq[0] + 0.12, Bq[1] - 0.02, Bq[2] - 0.02] : follow;
    armRig(hero, "r", new Vec(rp[0], rp[1], rp[2]), held && t > 0.5 ? [1.2, 0.3, -0.8] : [1.1, -0.5, -0.4]);
    const lf = kf(t, [[0, -0.12, SY - 0.32, 0.42], [0.5, -0.12, SY - 0.32, 0.42], [0.85, -0.42, SY + 0.12, 0.5], [1.2, -0.5, SY + 0.22, 0.55], [1.6, -0.2, SY - 0.4, 0.3]]);
    const lh = t < 0.5 ? [-0.12 + (Bq[0]), Bq[1], Bq[2]] : lf;
    armRig(hero, "l", new Vec(lh[0], lh[1], lh[2]), [-1.0, -0.4, -0.5]);
    return Bq;
  };
  // where the ball leaves the hand and where the receiver's hands are at the catch
  hero.set(TR, "stand", "grin"); qb(TR);
  const Prel = RW(hero, 0.4, HY + 0.6, 0.2);
  rcvAt(TC); rcv.root.updateMatrixWorld(true);
  const SYr = shY(rcv), Pcatch = RW(rcv, 0, SYr - 0.02, 0.6);
  return { tick(t) {
    const pp = { ...qbPose(t), expr: exAt(t, [[0, "focus"], [0.6, "effort"], [TR - 0.1, "shout"], [TR + 0.35, "grin"], [TC, "laugh"]]) };
    pop(TC + 0.45, t);
    // receiver
    rcvAt(t);
    const got = t >= TC;
    const w = seg(t, 1.3, 1.55);
    const pc = RW(rcv, 0, SYr - 0.1, 0.42);
    const rh = [wp(rcv.hand("r")), wp(rcv.hand("l"))];
    const bp = new Vec();
    qb(t);
    let axis = new Vec();
    if (t < TR) {
      const Bq = kf(t, [[0, 0, SY - 0.32, 0.42], [0.5, 0, SY - 0.32, 0.42], [0.64, 0.5, SY - 0.1, -0.1], [0.78, 0.55, SY + 0.15, -0.35], [TR, 0.4, HY + 0.6, 0.2]]);
      bp.copy(RW(hero, Bq[0], Bq[1], Bq[2]));
      const fw = RW(hero, 0, 0.2, 1).sub(RW(hero, 0, 0, 0)).normalize(), tg = Pcatch.clone().sub(bp).normalize();
      axis.copy(fw).lerp(tg, seg(t, 0.45, 0.85)).normalize();
    } else if (!got) {
      const s = (t - TR) / (TC - TR), q = arc(Prel, Pcatch, s, 1.25), q2 = arc(Prel, Pcatch, Math.min(1, s + 0.02), 1.25);
      bp.copy(q); axis.copy(q2).sub(q).normalize(); if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    } else {
      bp.copy(pc); axis.copy(RW(rcv, 0, 0.2, 1)).sub(RW(rcv, 0, 0, 0)).normalize();
    }
    // receiver reaches out: arms from the run swing to the ball, then hugs it
    const side = new Vec().crossVectors(axis, Y).normalize().multiplyScalar(0.13);
    const tgtL = bp.clone().add(side), tgtR = bp.clone().sub(side);
    if (w > 0) {
      armW(rcv, "r", rh[0].clone().lerp(tgtR, w), [1.0, -0.3, -0.5]); armW(rcv, "l", rh[1].clone().lerp(tgtL, w), [-1.0, -0.3, -0.5]);
    }
    fb.g.position.copy(bp); aimZ(fb.g, axis); fb.spin.rotation.z = t < TR ? 0 : (t - TR) * 34;
    dropShadow(sh, bp, 0.15);
    trl((tt) => (tt > TR && tt < TC ? arc(Prel, Pcatch, (tt - TR) / (TC - TR), 1.25) : null), t, 0.03);
    return pp;
  } };
} };

// ---------------------------------------------------------------- touchdown
const touchdown: ActDef = { pose: "run", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY;
  const gl = H[2] - 1.3;       // goal line z
  { // an end-zone sign standing at the side of the run: purple board, gold letters, two legs
    const sg = new THREE.Group(); sg.position.set(H[0] + 0.3, 0, gl + 1.3); sg.rotation.y = 0.35; root.add(sg);
    bx(sg, 0.08, 0.5, 0.08, "#2a2a32", -0.5, 0.25, 0, 0.012); bx(sg, 0.08, 0.5, 0.08, "#2a2a32", 0.5, 0.25, 0, 0.012);
    const tex = drawCard({ text: "END ZONE", kind: "sign", bg: "#7a2aa8", fg: "#ffd21f" }, 800, 320);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.56), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })); pl.position.set(0, 0.78, 0.03); sg.add(pl); }
  const popTD = popText(root, "TOUCHDOWN!", [H[0] + 1.3, H[1] + 3.3, gl + 1.6], 1.9);
  paint(root, 12, 9, "#7a2aa8", H[0] + 1.4, gl + 4.5 + 0.0, 0.022);
  paint(root, 12, 0.16, "#ffffff", H[0] + 1.4, gl, 0.03);
  for (let i = 0; i < 6; i++) paint(root, 0.3, 8.8, "#9b4bd0", H[0] - 2.6 + i * 1.9, gl + 4.5, 0.026);
  yardLines(root, H[0] + 1.4, gl - 6.4, gl - 1.6, 1.6, 12);
  for (const x of [-1.4, 4.2]) { const p = bx(root, 0.16, 0.5, 0.16, "#ff7a1a", H[0] + x, 0.25, gl, 0.02); p.castShadow = true; }
  const fb = football(1.15), sh = blob(root); root.add(fb.g);
  const sx = H[0] + 1.0, ex = H[0] + 1.35, z0 = H[2] - 2.6, zEnd = H[2] + 0.5, TS = 0.9;   // run ends at TS, spike starts
  const f = new Vec(), slam = new Vec();
  const posAt = (t: number) => {
    if (t < TS) { const k = t / TS; return [mix(sx, ex, k), mix(z0, zEnd, k)]; }
    const k = 1 - (1 - cl((t - TS) / 0.7)) ** 2; return [ex + 0.1 * k, zEnd + 0.5 * k];
  };
  const run = (t: number) => (t < TS);
  const ctrl = (t: number) => {
    const [x, z] = posAt(t);
    hero.root.rotation.y = run(t) ? 0.12 : kf(t, [[TS, 0.12], [1.5, 0.3]])[0];
    const rig = rigOf(hero), L = legsOf(hero);
    f.set(Math.sin(hero.root.rotation.y), 0, Math.cos(hero.root.rotation.y));
    if (run(t)) {
      // ball tucked under the right arm
      armRig(hero, "r", new Vec(0.2, SY - 0.5, 0.28), [1.2, -0.6, -0.5]);
      plant(hero, x, z);
      return;
    }
    const lean = kf(t, [[TS, 0.2], [1.12, -0.12], [1.28, 0.55], [1.5, 0.12]])[0];
    rig.rotation.set(lean, 0, 0);
    const cr = kf(t, [[TS, 0.4, 0.7], [1.12, 0.2, 0.4], [1.28, 0.5, 1.0], [1.45, 0.3, 0.6]]);
    stance(hero, cr[0], cr[1], cr[0] * 0.8, cr[1], lean, 0.1);
    plant(hero, x, z);
    void L;
  };
  const spikeHand = (t: number) => {
    // world target of the right hand: overhead, wind-up, slam into the turf in front of him
    const [x, z] = posAt(t), ry = hero.root.rotation.y, fw = new Vec(Math.sin(ry), 0, Math.cos(ry));
    const k = kf(t, [[TS, 0, 0.45, 0.2], [1.12, -0.05, 0.75, -0.05], [1.28, 0, 0.0, 0.65]]);
    return new Vec(x, 0, z).addScaledVector(fw, k[2]).add(new Vec(0, HY + k[1], 0)).add(new Vec(Math.cos(ry), 0, -Math.sin(ry)).multiplyScalar(k[0] + 0.25));
  };
  const TH = 1.28;
  hero.set(TH, "stand", "grin"); ctrl(TH); slam.copy(spikeHand(TH)); slam.y = 0.2;
  return { tick(t) {
    const pose: ActPose = t < TS ? { pose: "run", t } : t < 1.42 ? { pose: "stand", t } : { pose: "cheer", t: t - 1.42 };
    pose.expr = exAt(t, [[0, "focus"], [0.35, "effort"], [TS, "shout"], [TH + 0.35, "laugh"]]);
    popTD(TH + 0.05, t);
    ctrl(t);
    const bp = new Vec(); let axis = new Vec(0, 0, 1), spin = 0;
    if (t < TS) {
      bp.copy(RW(hero, 0.27, SY - 0.55, 0.2)); axis.copy(RW(hero, 0.0, 0, 1)).sub(RW(hero, 0, 0, 0)).setY(0.25).normalize();
    } else if (t < TH) {
      const hp = spikeHand(t); armW(hero, "r", hp, [1.0, 0.2, -0.5]);
      armRig(hero, "l", new Vec(-0.3, SY - 0.1, 0.3), [-1, -0.4, -0.5]);
      bp.copy(hp).add(new Vec(0, 0.02, 0)); axis.set(0, -0.3, 1).normalize();
    } else {
      const a = t - TH, v0 = 4.2;
      bp.set(slam.x + 0.55 * a, fall(slam.y, v0 * 0 - 1.0 * 0 + 3.0 + 0, a + 0, 0.17, 14, 0.5) * 0 + 0.17 + Math.max(0, bounce(a)), slam.z + 0.5 * a * Math.exp(-a));
      axis.set(Math.cos(a * 9), 0.5, Math.sin(a * 9)).normalize(); spin = a * 12;
    }
    if (t < TH) { /* held */ }
    fb.g.position.copy(bp); aimZ(fb.g, axis); fb.spin.rotation.z = spin; dropShadow(sh, bp, 0.15);
    // celebrate: arms up V by the cheer pose; override nothing
    return pose;
  } };
} };
/** height of a ball slammed down: bounces with energy loss */
const bounce = (a: number) => { let h = 0, T = 0.34, A = 1.35, aa = a; for (let i = 0; i < 4; i++) { if (aa < T) { const u = aa / T; return Math.max(0, 4 * A * u * (1 - u)); } aa -= T; T *= 0.62; A *= 0.4; } return h; };

// ================================================================ baseball
const diamond = (root: THREE.Object3D, hx: number, hz: number) => {
  const dirt = mesh(new THREE.CircleGeometry(2.1, 28), toonMat("#b8854f"), hx, 0.02, hz, false); dirt.rotation.x = -PI / 2; root.add(dirt);
  paint(root, 0.8, 0.8, "#fafafa", hx, hz, 0.03, PI / 4);
  for (const s of [-1, 1]) { paint(root, 0.05, 1.3, "#fafafa", hx + s * 0.9, hz, 0.03); }
  paint(root, 1.85, 0.05, "#fafafa", hx, hz - 0.65, 0.03); paint(root, 1.85, 0.05, "#fafafa", hx, hz + 0.65, 0.03);
};
const batMesh = () => {
  const g = new THREE.Group();
  const pts: [number, number][] = [[0.0, 0], [0.032, 0], [0.026, 0.05], [0.024, 0.3], [0.04, 0.5], [0.062, 0.72], [0.072, 0.98], [0.06, 1.1], [0, 1.12]];
  const lat = (k: number) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r === 0 ? 0 : r + k, y + (y === 0 ? -k : y > 1.1 ? k : 0))), 16);
  const m = mesh(lat(0), toonMat("#d9a05a")); const h = new THREE.Mesh(lat(0.02), INK); m.add(h); g.add(m);
  g.add(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.22, 12), toonMat("#2a2a32"), 0, 0.13, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), toonMat("#2a2a32"), 0, -0.01, 0, false));
  return g;
};
const BAT_SW = (t: number) => {   // [azimuth, elevation, hx, hy, hz] of the bat; rig-space hands in hy/hz
  return kf(t, [[0, 0.1, 1.2], [0.5, 0.3, 1.1], [0.7, 0.1, 0.35], [0.82, 0.05, 0.9], [0.98, 2.62, 0.0], [1.12, 3.6, 0.35], [1.5, 4.3, 0.85]]);
};
const bat_swing: ActDef = { pose: "stand", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY, TC = 1.0;
  const hx = H[0] - 0.5, hz = H[2] + 0.5;
  diamond(root, hx, hz);
  const base: V3 = [H[0] + 0.45, H[1], H[2] + 0.0];
  const bat = batMesh(); root.add(bat);
  const bl = ball(0.14, "#fafafa", 0.025), sh = blob(root); root.add(bl);
  for (const [a, b] of [[0.04, 0.0]] as [number, number][]) void a, void b;
  const stitch = mesh(new THREE.TorusGeometry(0.075, 0.008, 5, 16), toonMat("#d8342c"), 0, 0, 0, false); bl.add(stitch);
  const pit = makeChar(JERSEY("#2a7de0", "21", "#fafafa", { hat: "cap", hatColor: "#2a7de0" })); root.add(pit.root);
  pit.root.position.set(H[0] + 0.45, H[1], H[2] - 11.5); pit.root.rotation.y = 0;
  const burst = spark(root);
  const yaw = (t: number) => kf(t, [[0, -0.9], [0.7, -1.0], [TC, -0.8], [1.35, -0.2], [2, -0.1]])[0];
  const handPos = (t: number) => {   // rig-space grip centre
    const k = kf(t, [[0, 0.3, SY + 0.05, 0.05], [0.55, 0.32, SY + 0.12, -0.12], [0.72, 0.3, SY - 0.02, -0.18], [TC, 0.0, SY - 0.32, 0.52], [1.3, -0.35, SY - 0.1, 0.45], [1.6, -0.3, SY + 0.12, 0.2]]);
    return new Vec(k[0], k[1], k[2]);
  };
  const body = (t: number) => {
    hero.root.rotation.y = yaw(t);
    const rig = rigOf(hero), lean = kf(t, [[0, 0.1], [0.7, 0.18], [TC, 0.12], [1.4, -0.05]])[0];
    rig.rotation.set(lean, 0, 0);
    const sw = seg(t, 0.7, 1.0), fin = seg(t, 1.1, 1.5);
    stance(hero, mix(0.5, 0.55, sw) * (1 - fin * 0.5), mix(0.9, 0.7, sw) * (1 - fin * 0.4), mix(0.3, 0.2, sw), mix(0.5, 0.35, sw), lean, 0.17);
    plant(hero, base[0] + 0.25 * seg(t, 0.7, 1.0), base[2]);
  };
  const dirOf = (t: number) => { const k = BAT_SW(t); return new Vec(Math.cos(k[0] - 0.0), 0, Math.sin(k[0])); };
  void dirOf;
  // swing path in world: azimuth a (0 = +x, behind the batter; pi/2 = towards the camera, the near side; pi = -x, in front), elevation e
  const dirAt = (t: number) => { const k = BAT_SW(t); const a = k[0], e = k[1]; return new Vec(Math.cos(a) * Math.cos(e * 0 + 0), 0, Math.sin(a)).multiplyScalar(0).add(new Vec(Math.cos(a), 0, Math.sin(a)).multiplyScalar(Math.cos(e))).add(new Vec(0, Math.sin(e), 0)).normalize(); };
  void dirAt;
  const SWG = (t: number) => kf(t, [[0, 0.1, 1.15], [0.45, 0.25, 1.0], [0.7, 0.05, 0.55], [0.84, 0.35, 0.0], [TC, 2.78, 0.04], [1.15, 3.7, 0.3], [1.45, 4.5, 0.9], [1.7, 4.6, 1.0]]);
  const swing = (t: number) => { const [a, e] = SWG(t); return new Vec(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).normalize(); };
  // find where the barrel is at contact and send the pitch there
  hero.set(TC, "stand", "grin"); body(TC);
  const hpC = RW(hero, ...(handPos(TC).toArray() as V3)), P = hpC.clone().addScaledVector(swing(TC), 0.85);
  const P0 = new Vec(P.x + 0.1, 1.7, H[2] - 12.0), TP0 = 0.1;
  const v0 = new Vec(-5.5, 11, -8.5), G = 12, TFL = 2.0;
  const popHR = popText(root, "HOME RUN!", [H[0] - 0.4, H[1] + 3.3, H[2] + 0.6], 1.9);
  const star = starAt(root, "#ffffff");
  return { tick(t) {
    popHR(TC + 0.2, t); star(TC, t, P, 1.3);
    pit.set(t + 0.5, "throw", "grin"); pit.root.rotation.y = 0;
    body(t);
    const hp = RW(hero, ...(handPos(t).toArray() as V3)), d = swing(t);
    bat.position.copy(hp).addScaledVector(d, -0.2); aimY(bat, d);
    armW(hero, "r", hp.clone().addScaledVector(d, 0.1), [1.0, -0.2, -0.6]);
    armW(hero, "l", hp.clone().addScaledVector(d, -0.04), [-1.0, -0.5, -0.4]);
    const p = new Vec();
    if (t < TC) { const s = cl((t - TP0) / (TC - TP0)); p.copy(P0).lerp(P, s); p.y += 0.0; bl.visible = t > TP0; }
    else { const a = t - TC; p.set(P.x + v0.x * a, P.y + v0.y * a - 0.5 * G * a * a, P.z + v0.z * a); bl.visible = true; }
    bl.position.copy(p); bl.rotation.set(t * 9, t * 5, t * 7); dropShadow(sh, p, 0.1); sh.visible = p.y < 2.5;
    burst(TC, t, P, 1.2); void TFL;
    return { pose: "stand", t, expr: exAt(t, [[0, "focus"], [0.55, "effort"], [TC + 0.1, "shout"], [1.5, "laugh"]]) };
  } };
} };

// ---------------------------------------------------------------- pitcher
const pitch: ActDef = { pose: "stand", view: "act", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY, TR = 1.02, TH = 1.3;
  const mx = H[0] + 2.45, mz = H[2] - 0.3;
  const mound = mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.22, 24), toonMat("#b8854f"), mx, 0.11, mz, false); root.add(mound);
  bx(root, 0.6, 0.05, 0.14, "#fafafa", mx - 0.1, 0.235, mz + 0.05, 0.012);
  const hx = H[0] + 0.2, hz = H[2] + 1.0;
  diamond(root, hx, hz);
  const cat = makeChar(JERSEY("#d8342c", "27", "#fafafa", { hat: "hardhat", hatColor: "#d8342c" })); root.add(cat.root);
  const mitt = mesh(new THREE.SphereGeometry(0.2, 16, 12), toonMat("#6b3a1c")); outline(mitt, 0.025); mitt.scale.set(1, 1, 0.65); root.add(mitt);
  const rim = mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), toonMat("#2a2a32"), 0, 0, 0.12, false); mitt.add(rim);
  const bl = ball(0.16, "#fafafa", 0.026), sh = blob(root); root.add(bl);
  const stitch = mesh(new THREE.TorusGeometry(0.12, 0.012, 5, 16), toonMat("#d8342c"), 0, 0, 0, false); bl.add(stitch);
  const burst = spark(root), popS = popText(root, "STRIKE!", [hx + 0.3, H[1] + 2.9, hz + 0.3], 1.5, "#ff5a4a");
  const toC = new Vec(hx - mx, 0, hz - mz).normalize(), ry = yawOf(toC.x, toC.z);
  const pose = (t: number): ActPose => ({ pose: t < 0.62 ? "stand" : "throw", t: t < 0.62 ? t : 0.28 + (t - 0.62) * 0.98 });   // "throw": cocks 0.42..0.53 s, releases ~0.7 s of its clock
  const catcher = (t: number) => {
    cat.set(t, "stand", exAt(t, [[0, "focus"], [TH, "laugh"]])); cat.root.rotation.y = yawOf(mx - hx, mz - hz) + 0.15;
    const r = rigOf(cat); r.rotation.set(0.2, 0, 0); stance(cat, 1.35, 2.5, 1.2, 2.45, 0.2, 0.3); plant(cat, hx, hz);
    const k = seg(t, 0.4, 0.85) , SYc = shY(cat);
    armRig(cat, "l", new Vec(-0.2, mix(SYc - 0.6, SYc - 0.52, k), mix(0.35, 0.72, k)), [-0.8, -0.2, -0.3]);
    armRig(cat, "r", new Vec(0.18, SYc - 0.6, 0.3), [0.8, -0.3, -0.4]);
    return RW(cat, -0.2 + 0.0, mix(SYc - 0.6, SYc - 0.52, k), mix(0.35, 0.72, k) + 0.1);
  };
  const body = (t: number) => {
    hero.root.rotation.y = kf(t, [[0, ry + 0.25], [0.5, ry + 0.1], [TR, ry - 0.05], [1.5, ry]])[0];
    const rig = rigOf(hero), lean = kf(t, [[0, 0.0], [0.5, -0.12], [0.8, -0.05], [TR, 0.3], [1.4, 0.45]])[0];
    rig.rotation.set(lean, 0, 0);
    const kneeUp = seg(t, 0.25, 0.5) * (1 - seg(t, 0.62, 0.8)), stride = seg(t, 0.62, 0.95);
    stance(hero, mix(0.1, 0.6, stride) , mix(0.2, 0.4, stride), mix(0.15 + 1.2 * kneeUp, 0.05, stride) , mix(0.2 + 1.5 * kneeUp, 0.2, stride), lean, 0.12);
    // wind-up: back leg takes the weight; the lead (left) leg lifts
    plant(hero, mx + 0.0 + (-0.0) * stride + 0.1 * stride * toC.x, mz + 0.1 * stride * toC.z);
    hero.root.position.y = mound.position.y * 2 - 0.0;
  };
  hero.set(TR, "stand", "grin");
  return { tick(t) {
    const pp = pose(t);
    const mt = catcher(t);
    body(t);
    // hands: together at the chest, then the throwing arm winds back and over the top, glove arm points at the target
    const rh = kf(t, [[0, 0.1, SY - 0.35, 0.4], [0.55, 0.1, SY - 0.35, 0.4], [0.78, 0.3, HY + 0.1, -0.35], [0.9, 0.3, HY + 0.4, -0.1], [TR, 0.2, HY + 0.45, 0.55], [1.25, -0.1, SY - 0.3, 0.55], [1.7, 0.05, SY - 0.5, 0.35]]);
    armRig(hero, "r", new Vec(rh[0], rh[1], rh[2]), t > 0.6 && t < TR + 0.1 ? [1.2, 0.5, -0.8] : [1, -0.5, -0.3]);
    const lh = kf(t, [[0, -0.1, SY - 0.35, 0.4], [0.55, -0.1, SY - 0.35, 0.4], [0.8, -0.4, SY + 0.05, 0.5], [TR, -0.45, SY + 0.1, 0.5], [1.4, -0.15, SY - 0.5, 0.3]]);
    armRig(hero, "l", new Vec(lh[0], lh[1], lh[2]), [-1.1, -0.4, -0.5]);
    const hand = RW(hero, rh[0], rh[1], rh[2]);
    const p = new Vec();
    const Prel = hand.clone(); void Prel;
    if (t < TR) p.copy(hand).add(new Vec(0, -0.02, 0));
    else {
      const rel = RW(hero, 0.2, HY + 0.45, 0.55);
      const s = (t - TR) / (TH - TR);
      p.copy(rel).lerp(mt, cl(s));
      if (t > TH) p.copy(mt);
    }
    bl.position.copy(p); bl.rotation.set(t * 20, 0, 0); dropShadow(sh, p, 0.1);
    mitt.position.copy(mt).add(new Vec(0, 0, 0.0)); mitt.position.addScaledVector(toC, 0.0);
    const rec = t > TH ? 0.1 * Math.exp(-(t - TH) * 9) : 0; mitt.position.addScaledVector(toC.clone().multiplyScalar(-1), -rec);
    mitt.lookAt(mitt.position.clone().add(toC));
    mitt.position.sub(new Vec(0, 0, 0));
    burst(TH, t, mt.clone().add(new Vec(0, 0.2, 0)), 1.1); popS(TH + 0.05, t);
    return { ...pp, expr: exAt(t, [[0, "focus"], [0.5, "effort"], [TR - 0.12, "shout"], [TH + 0.1, "smug"]]) };
  } };
} };

// ================================================================ tennis
const racket = () => {
  const g = new THREE.Group();
  bx(g, 0.05, 0.4, 0.05, "#2a2a32", 0, 0.2, 0, 0.012).geometry = new THREE.CylinderGeometry(0.026, 0.026, 0.4, 10);
  const head = new THREE.Group(); head.position.y = 0.66; head.scale.set(1, 1.28, 1); g.add(head);
  const fr = mesh(new THREE.TorusGeometry(0.19, 0.02, 8, 28), toonMat("#d8342c")); fr.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 28), INK)); head.add(fr);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.185, 24), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false, map: canvasTex(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64); x.strokeStyle = "#ffffff"; x.lineWidth = 2; for (let i = 4; i < 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); } }) }));
  head.add(strings);
  bx(g, 0.04, 0.12, 0.04, "#d8342c", 0, 0.41, 0, 0.01);
  return g;
};
const tennis_serve: ActDef = { pose: "stand", view: "act", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY, TC = 1.0, TT = 0.5;
  const S = new Vec(-0.7, 0, -0.71).normalize(), Pp = new Vec(0.71, 0, -0.7).normalize();   // serve direction (left, away), across the court
  const base = new Vec(H[0] + 2.4, 0, H[2] + 0.5);
  const NETD = 2.1, LAND = 3.7, TL = 0.6, PHI = Math.atan2(-Pp.z, Pp.x);   // net 2.6 m out (inside the frame), ball lands 4.7 m out in the far court
  const ry = yawOf(-Pp.x, -Pp.z);
  // court lines + net
  paint(root, 9, 0.06, "#fafafa", base.x, base.z, 0.026, PHI);
  const cg = new THREE.Group(); cg.position.copy(base); cg.rotation.y = Math.atan2(-S.z, S.x) * 0 + 0; root.add(cg);
  const toLocal = (v: THREE.Vector3) => v;
  void toLocal;
  const net = new THREE.Group(); const nc = base.clone().addScaledVector(S, NETD); net.position.copy(nc); net.rotation.y = yawOf(Pp.x, Pp.z) - PI / 2 + PI / 2 * 0; root.add(net);
  net.rotation.y = Math.atan2(Pp.x, Pp.z) + PI / 2;
  const NW = 4.4;
  for (const s of [-1, 1]) cyl(net, 0.05, 1.15, "#2a2a32", s * NW / 2, 0.57, 0, 0.015);
  const nt = canvasTex(128, 32, (x) => { x.fillStyle = "rgba(0,0,0,0)"; x.clearRect(0, 0, 128, 32); x.strokeStyle = "#f2f2f2"; x.lineWidth = 2; for (let i = 0; i <= 32; i++) { x.beginPath(); x.moveTo(i * 4, 0); x.lineTo(i * 4, 32); x.stroke(); } for (let j = 0; j <= 8; j++) { x.beginPath(); x.moveTo(0, j * 4); x.lineTo(128, j * 4); x.stroke(); } });
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(NW, 1.0), new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false })); nm.position.y = 0.58; net.add(nm);
  bx(net, NW, 0.09, 0.03, "#fafafa", 0, 1.1, 0, 0.012);
  paint(root, 5, 0.06, "#fafafa", base.x + S.x * LAND, base.z + S.z * LAND, 0.026, PHI);
  paint(root, 5, 0.06, "#fafafa", base.x + S.x * (LAND - 1.5), base.z + S.z * (LAND - 1.5), 0.026, PHI);
  const rk = racket(); root.add(rk);
  const bl = ball(0.15, "#d4f23a", 0.024), sh = blob(root); root.add(bl);
  const burst = spark(root), trl = trail(root, 12, 0.085, "#f4ffa0");
  const popA = popText(root, "ACE!", [base.x - 1.9, 3.0, base.z - 0.6], 1.3);
  hero.root.rotation.y = ry;
  const body = (t: number) => {
    hero.root.rotation.y = ry + kf(t, [[0, 0], [0.7, -0.18], [TC, 0.1], [1.3, 0.5], [1.7, 0.5]])[0];
    const rig = rigOf(hero), lean = kf(t, [[0, 0.04], [0.65, -0.18], [0.9, -0.05], [TC, -0.08], [1.25, 0.35], [1.7, 0.2]])[0];
    rig.rotation.set(lean, 0, 0);
    const bend = kf(t, [[0, 0.1, 0.2], [0.62, 0.45, 0.9], [0.82, 0.55, 0.9], [0.98, 0.05, 0.05], [1.35, 0.15, 0.3]]);
    stance(hero, bend[0], bend[1], bend[0] * 0.5, bend[1] * 0.8, lean, 0.16);
    const air = seg(t, 0.86, 0.98) * (1 - seg(t, 1.05, 1.28));
    plant(hero, base.x, base.z);
    hero.root.position.y += 0.2 * air;
  };
  const handR = (t: number) => kf(t, [[0, 0.3, SY - 0.4, 0.28], [0.5, 0.3, SY - 0.3, 0.3], [0.72, 0.32, HY + 0.12, -0.08], [0.86, 0.15, HY - 0.15, -0.32], [TC, 0.1, HY + 0.78, 0.18], [1.26, -0.22, SY - 0.1, 0.5], [1.6, -0.3, SY - 0.45, 0.35]]);
  const RD = (t: number) => {   // racket direction as (forward S, up, lateral Pp) components
    const k = kf(t, [[0, 0.5, -0.5, 0.2], [0.5, 0.3, 0.7, 0.2], [0.72, -0.2, 1.0, 0.0], [0.86, -0.1, -0.5, 0.7], [TC, 0.35, 0.93, 0.1], [1.26, 0.8, -0.3, -0.5], [1.6, 0.2, -0.9, -0.4]]);
    return S.clone().multiplyScalar(k[0]).add(new Vec(0, k[1], 0)).addScaledVector(Pp, k[2]).normalize();
  };
  hero.set(TC, "stand", "grin"); body(TC);
  const hcr = handR(TC), hwC = RW(hero, hcr[0], hcr[1], hcr[2]), dC = RD(TC), Pc = hwC.clone().addScaledVector(dC, 0.6);   // ball meets the strings, upper half of the racket head
  const tl = (t: number) => { const lh = RW(hero, -0.25, SY - 0.35, 0.3); return lh; };
  void tl;
  hero.set(TT, "stand", "grin"); body(TT);
  const Prl = RW(hero, -0.18, SY + 0.35, 0.2);
  const Tc = TC - TT, G = 9.8, vy = (Pc.y - Prl.y + 0.5 * G * Tc * Tc) / Tc;
  const Lp = base.clone().addScaledVector(S, LAND); Lp.y = 0.1;
  const vh = new Vec(Lp.x - Pc.x, 0, Lp.z - Pc.z).multiplyScalar(1 / TL), vy0 = -1.2, cc = (Pc.y + vy0 * TL - 0.1) / (TL * TL);
  const ballPos = (t: number): THREE.Vector3 | null => {
    if (t < TC) {
      if (t < TT) return null;
      const a = t - TT, s = a / Tc; return new Vec(mix(Prl.x, Pc.x, s), Prl.y + vy * a - 0.5 * G * a * a, mix(Prl.z, Pc.z, s));
    }
    const a = t - TC;   // over the net, down into the far court, one small bounce, rolling on
    if (a < TL) return new Vec(Pc.x + vh.x * a, Pc.y + vy0 * a - cc * a * a, Pc.z + vh.z * a);
    const b = a - TL; return new Vec(Lp.x + vh.x * 0.8 * b, Math.max(0.1, 0.1 + 2.2 * b - 5 * b * b), Lp.z + vh.z * 0.8 * b);
  };
  return { tick(t) {
    body(t);
    const h = handR(t), hw = RW(hero, h[0], h[1], h[2]), d = RD(t);
    rk.position.copy(hw).addScaledVector(d, -0.1); aimY(rk, d);
    armW(hero, "r", hw, [1.3, 0.2, -0.7]);
    // tossing arm: lifts the ball straight up, then points at it
    const up = kf(t, [[0, -0.3, SY - 0.4, 0.3], [0.4, -0.2, SY - 0.1, 0.32], [TT, -0.18, SY + 0.35, 0.2], [0.8, -0.2, SY + 0.7, 0.2], [1.1, -0.3, SY - 0.1, 0.15], [1.5, -0.3, SY - 0.4, 0.2]]);
    armRig(hero, "l", new Vec(up[0], up[1], up[2]), [-1, 0, -0.4]);
    const p = ballPos(t) ?? RW(hero, -0.16, SY - 0.36 + 0.0, 0.3).add(new Vec(0, 0.14, 0));
    bl.position.copy(p); bl.rotation.set(t * 5, 0, t * 3); dropShadow(sh, p, 0.1);
    trl((tt) => (tt >= TC ? ballPos(tt) : null), t, 0.025);
    burst(TC, t, Pc, 0.8); popA(TC + 0.55, t);
    return { pose: "stand", t, expr: exAt(t, [[0, "focus"], [0.78, "effort"], [TC - 0.04, "shout"], [TC + 0.16, "smug"], [TC + 0.9, "grin"]]) };
  } };
} };

// ================================================================ golf
const golf_swing: ActDef = { pose: "stand", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY, TI = 0.95;
  const T = new Vec(0.65, 0, -0.76).normalize(), ry = yawOf(-T.z * -1, T.x * 1) * 0 + Math.atan2(0.76, 0.65);   // rig +x = target line; facing = target rotated 90 degrees to the camera side
  const base = new Vec(H[0] - 0.7, 0, H[2] - 0.3);
  const fwd = new Vec(Math.sin(ry), 0, Math.cos(ry));
  // flag + green far away
  const flagAt = new Vec(H[0] + 1.7, 0, H[2] - 4.6);
  const green = mesh(new THREE.CircleGeometry(2.4, 28), toonMat("#46c25a"), flagAt.x, 0.03, flagAt.z, false); green.rotation.x = -PI / 2; root.add(green);
  const hole = mesh(new THREE.CircleGeometry(0.18, 12), toonMat("#1b1b24"), flagAt.x, 0.035, flagAt.z, false); hole.rotation.x = -PI / 2; root.add(hole);
  cyl(root, 0.04, 3.0, "#fafafa", flagAt.x, 1.5, flagAt.z, 0.025);
  const flag = new THREE.Group(); flag.position.set(flagAt.x, 2.7, flagAt.z); root.add(flag);
  { const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 0.35), new THREE.Vector2(0, 0.7)]); const m = mesh(new THREE.ShapeGeometry(s), new THREE.MeshToonMaterial({ color: "#e53935", side: THREE.DoubleSide, gradientMap: (toonMat("#fff") as THREE.MeshToonMaterial).gradientMap }), 0, 0, 0, false); m.position.y = -0.3; flag.add(m); }
  const ballAt = base.clone().addScaledVector(fwd, 0.72).addScaledVector(T, 0.0); ballAt.y = 0.2;
  const tee = mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.12, 8), toonMat("#f4d27a"), ballAt.x, 0.06, ballAt.z, false); root.add(tee);
  const bl = ball(0.13, "#ffffff", 0.024), sh = blob(root); root.add(bl);
  const club = new THREE.Group(); root.add(club);
  const shaft = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), toonMat("#c8ccd4"), 0, 0.5, 0); shaft.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.04, 8), INK)); club.add(shaft);
  const grip = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.28, 10), toonMat("#2a2a32"), 0, 0.14, 0); club.add(grip);
  const head = bx(club, 0.22, 0.1, 0.1, "#3a3f4a", 0.0, 1.0, 0.02, 0.02); head.rotation.y = 0;
  const trl = trail(root, 10, 0.07), burst = spark(root);
  const body = (t: number) => {
    hero.root.rotation.y = ry + kf(t, [[0, 0], [0.7, -0.28], [TI, 0.05], [1.2, -0.1], [1.6, -0.15]])[0];
    const rig = rigOf(hero);
    const lean = kf(t, [[0, 0.3], [0.7, 0.12], [TI, 0.32], [1.25, -0.02], [1.7, -0.08]])[0];
    rig.rotation.set(lean, kf(t, [[0, 0], [0.7, -0.5], [TI, 0.1], [1.25, 0.6]])[0] * 0, 0);
    const kn = kf(t, [[0, 0.32, 0.65], [0.7, 0.3, 0.6], [TI, 0.3, 0.65], [1.25, 0.1, 0.2]]);
    stance(hero, kn[0], kn[1], kn[0], kn[1], lean, 0.16);
    plant(hero, base.x, base.z);
  };
  // hands/club in rig space: x along the target line, z towards the ball
  const HP = (t: number) => kf(t, [[0, 0.02, SY - 0.55, 0.52], [0.25, 0.0, SY - 0.55, 0.5], [0.55, -0.3, HY + 0.05, 0.1], [0.78, -0.32, HY + 0.12, 0.0], [TI, 0.04, SY - 0.6, 0.58], [1.15, 0.35, SY - 0.1, 0.4], [1.45, 0.4, HY + 0.1, 0.1], [1.7, 0.4, HY + 0.15, 0.1]]);
  const TH = (t: number) => kf(t, [[0, 0.3], [0.25, 0.3], [0.55, -1.9], [0.78, -2.5], [TI, 0.34], [1.15, 1.5], [1.45, 2.6], [1.7, 2.75]])[0];
  const clubDir = (t: number) => { const th = TH(t); return new Vec(Math.sin(th), -Math.cos(th), 0.0); };
  // the shaft length so the head meets the ball at impact
  hero.set(TI, "stand", "grin"); body(TI);
  const hI = HP(TI), hwI = RW(hero, hI[0], hI[1], hI[2]);
  const LEN = cl(hwI.distanceTo(ballAt), 0.95, 1.4);
  const rigDir = (t: number) => { const d = clubDir(t); return d; };
  // impact direction in rig space, so the club really ends on the ball
  const dImpactW = ballAt.clone().sub(hwI).normalize();
  const dImpactR = rigOf(hero).worldToLocal(RW(hero, 0, 0, 0).add(dImpactW)).sub(rigOf(hero).worldToLocal(RW(hero, 0, 0, 0).clone())).normalize();
  void rigDir; void dImpactR;
  const flightV = T.clone().multiplyScalar(5.0).add(new Vec(0, 0, 0)); flightV.set(flagAt.x - ballAt.x, 0, flagAt.z - ballAt.z).multiplyScalar(1 / 0.95);
  const vy0 = 7.6, G = 16;
  const popG = popText(root, "NICE SHOT!", [H[0] + 0.5, 3.6, H[2] - 1.2], 1.7);
  const ballPos = (t: number): THREE.Vector3 | null => {
    if (t < TI) return ballAt.clone();
    const a = Math.min(t - TI, 0.95), y = ballAt.y + vy0 * a - 0.5 * G * a * a;
    return new Vec(ballAt.x + flightV.x * a, Math.max(0.1, y), ballAt.z + flightV.z * a);
  };
  return { tick(t) {
    body(t);
    const h = HP(t), hw = RW(hero, h[0], h[1], h[2]);
    const dRig = clubDir(t), w = Math.exp(-(((t - TI) / 0.1) ** 2));
    const dW = RW(hero, dRig.x, dRig.y, dRig.z).sub(RW(hero, 0, 0, 0));
    const dd = dW.clone().lerp(dImpactW, w).normalize();
    const len = LEN;
    club.position.copy(hw).addScaledVector(dd, -len * 0.18 + 0.0); aimY(club, dd.clone().negate().multiplyScalar(-1));
    // club local: +y points along the shaft away from the hands; scale so it spans `len`
    shaft.scale.y = len * 1.0; shaft.position.y = len * 0.5; head.position.y = len + 0.02; grip.position.y = 0.14;
    (shaft.children[0] as THREE.Mesh).scale.y = 1;
    armW(hero, "r", hw.clone().addScaledVector(dd, 0.04), [1.0, -0.5, -0.3]); armW(hero, "l", hw.clone().addScaledVector(dd, -0.03), [-1.0, -0.5, -0.3]);
    const p = ballPos(t)!;
    bl.position.copy(p); bl.rotation.set(t * 12, 0, t * 3); dropShadow(sh, p, 0.1); sh.visible = p.y < 0.4 && t < TI + 0.05;
    tee.visible = t < TI + 0.02;
    trl((tt) => (tt >= TI ? ballPos(tt) : null), t, 0.05);
    flag.rotation.y = Math.sin(t * 6) * 0.25; flag.scale.x = 1 + Math.sin(t * 9) * 0.08;
    burst(TI, t, ballAt.clone().add(new Vec(0, 0.15, 0)), 0.7); popG(TI + 0.45, t);
    bl.visible = t < TI + 0.93;   // drops into the hole
    return { pose: "stand", t, expr: exAt(t, [[0, "focus"], [TI - 0.3, "effort"], [TI + 0.25, "grin"], [TI + 0.9, "laugh"]]) };
  } };
} };

// ================================================================ soccer: goal celebration, knee slide
const goal_celebrate: ActDef = { pose: "stand", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero);
  const W = 2.8, D = 1.5, Ht = 1.9;
  const G0 = new Vec(H[0] + 0.6, 0, H[2] - 1.0), gry = -0.7;   // mouth turned towards the camera and left: we look into it at an angle
  const g = new THREE.Group(); g.position.copy(G0); g.rotation.y = gry; root.add(g);
  for (const s of [-1, 1]) { cyl(g, 0.065, Ht, "#fafafa", s * W / 2, Ht / 2, 0, 0.02); cyl(g, 0.045, 1.7, "#fafafa", s * W / 2, 0.85, -D, 0.015); }
  const bar = mesh(new THREE.CylinderGeometry(0.065, 0.065, W, 12), toonMat("#fafafa"), 0, Ht, 0); bar.rotation.z = PI / 2; bar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, W + 0.04, 12), INK)); g.add(bar);
  const rb = mesh(new THREE.CylinderGeometry(0.045, 0.045, W, 10), toonMat("#fafafa"), 0, 1.7, -D, false); rb.rotation.z = PI / 2; g.add(rb);
  const nt = canvasTex(128, 128, (x) => { x.clearRect(0, 0, 128, 128); x.strokeStyle = "#ffffff"; x.lineWidth = 4; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, 128); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(128, i * 16); x.stroke(); } });
  const netMat = () => new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
  // the back net: a grid pushed back (and out) around the ball, with a pale fill so the bulge reads
  const NX = 20, NY = 14, NH = 1.75, bg = new THREE.PlaneGeometry(W, NH, NX, NY);
  const back = new THREE.Mesh(bg, netMat()); back.position.set(0, NH / 2, -D); g.add(back);
  const fill = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: "#a8cfff", transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); fill.position.copy(back.position); g.add(fill);
  const base0 = Float32Array.from(bg.attributes.position.array as Float32Array);
  for (const s of [-1, 1]) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(D, NH), netMat()); sp.rotation.y = PI / 2; sp.position.set(s * W / 2, NH / 2, -D / 2); g.add(sp); }
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(W, D), netMat()); tp.rotation.x = -PI / 2; tp.position.set(0, Ht - 0.05, -D / 2); g.add(tp);
  const BR = 0.27, bl = ball(BR, "#fafafa", 0.03), sh = blob(root); root.add(bl);
  { const ph = (1 + Math.sqrt(5)) / 2, dk = new THREE.MeshBasicMaterial({ color: "#1b1b24", side: THREE.DoubleSide });
    for (const [a, b, c2] of [[0, 1, ph], [0, 1, -ph], [0, -1, ph], [0, -1, -ph], [1, ph, 0], [1, -ph, 0], [-1, ph, 0], [-1, -ph, 0], [ph, 0, 1], [ph, 0, -1], [-ph, 0, 1], [-ph, 0, -1]]) {
      const d = new Vec(a, b, c2).normalize(), p = new THREE.Mesh(new THREE.CircleGeometry(BR * 0.4, 5), dk); p.position.copy(d).multiplyScalar(BR * 1.004); p.lookAt(d.clone().multiplyScalar(5)); bl.add(p); } }
  const rnd = seeded(c.seed * 11 + 1), N = 26, turf = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 5), toonMat("#3aad52"), N); turf.frustumCulled = false; root.add(turf);
  const tseed = Array.from({ length: N }, () => ({ a: (rnd() - 0.5) * 2.4, v: 1.0 + rnd() * 2.2, vy: 1.6 + rnd() * 2.4, s: 0.5 + rnd() }));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
  const popG = popText(root, "GOAL!", [H[0] + 0.6, H[1] + 3.2, H[2] - 0.2], 1.8);
  const star = starAt(root, "#ffffff");
  const TIN = 0.4, TD = 0.5, TE = 1.55;   // ball hits the back net, he drops to his knees, slide ends
  const YW = 0.95, dirS = new Vec(Math.sin(YW), 0, Math.cos(YW)), A0 = new Vec(H[0] - 1.55, 0, H[2] - 0.5), A1 = A0.clone().addScaledVector(dirS, 1.1);
  const heroPos = (t: number) => (t < TD ? new Vec(A0.x - dirS.x * 1.0 * (1 - t / TD), 0, A0.z - dirS.z * 1.0 * (1 - t / TD)) : A0.clone().lerp(A1, 1 - (1 - cl((t - TD) / (TE - TD))) ** 1.8));
  g.updateMatrixWorld(true);
  const ballIn = g.localToWorld(new Vec(0.0, 0.5, -D + 0.25)), ball0 = new Vec(A0.x - dirS.x * 1.0 + 0.5, 0.3, A0.z - dirS.z * 1.0 + 0.2);
  const body = (t: number) => {
    const pos = heroPos(t), slide = seg(t, TD - 0.05, TD + 0.18);
    hero.root.rotation.y = YW;
    const rig = rigOf(hero), lean = mix(0.12, -0.38, slide);
    rig.rotation.set(lean, 0, 0);
    if (t < TD - 0.05) plant(hero, pos.x, pos.z);
    else { stance(hero, mix(0.9, 0.3, slide), mix(1.3, 1.7, slide), mix(0.9, 0.3, slide), mix(1.3, 1.7, slide), lean, mix(0.1, 0.14, slide)); plant(hero, pos.x, pos.z, slide > 0.5 ? "knees" : "feet"); }
  };
  return { tick(t) {
    const pose: ActPose = t < TD - 0.05 ? { pose: "run", t } : { pose: "cheer", t };
    body(t);
    const out = seg(t, TD - 0.12, TD + 0.25);
    if (t >= TD - 0.15) {
      const wave = Math.sin(t * 7) * 0.03;
      armRig(hero, "r", new Vec(0.85 * out + 0.2 * (1 - out), SY + 0.4 * out - 0.4 * (1 - out) + wave, 0.0 - 0.1 * out), [1.0, -0.2, -0.9]);
      armRig(hero, "l", new Vec(-0.85 * out - 0.2 * (1 - out), SY + 0.4 * out - 0.4 * (1 - out) - wave, 0.0 - 0.1 * out), [-1.0, -0.2, -0.9]);
    }
    // net: the ball flies in at TIN, drives the back net out and it wobbles
    const a = Math.max(0, t - TIN), amp = t < TIN ? 0 : 0.85 * (1 - Math.exp(-a * 26)) * (0.78 + 0.22 * Math.cos(a * 15) * Math.exp(-a * 1.6));
    const pa = bg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const x = base0[i * 3], y = base0[i * 3 + 1] + NH / 2, d2 = x * x + (y - ballIn.y) * (y - ballIn.y);
      pa.setZ(i, -amp * Math.exp(-d2 / 0.8));
    }
    pa.needsUpdate = true;
    const p = new Vec();
    if (t < TIN) { const s = cl(t / TIN); p.set(mix(ball0.x, ballIn.x, s), mix(ball0.y, ballIn.y, s) + 0.35 * 4 * s * (1 - s), mix(ball0.z, ballIn.z, s)); }
    else { const bz = new Vec(0, 0, -1).applyAxisAngle(Y, gry); p.copy(ballIn).addScaledVector(bz, amp * 0.55); p.y = Math.max(BR, ballIn.y - 0.4 * (1 - Math.exp(-Math.max(0, a - 0.55) * 3))); }
    bl.position.copy(p); bl.rotation.set(t * 8, t * 5, 0); dropShadow(sh, p, BR);
    popG(TIN + 0.08, t); star(TIN, t, p.clone().add(new Vec(0, 0.3, 0.3)), 1.6);
    // grass spray off the knees
    const pos = heroPos(t);
    for (let i = 0; i < N; i++) {
      const s = tseed[i], aa = Math.max(0, t - TD - 0.03 - i * 0.012), alive = t > TD + 0.02 && aa < 0.8;
      const q = new Vec(pos.x + s.a * 0.3 + Math.sin(i) * 0.12, 0.08 + s.vy * aa * 0.8 - 4.2 * aa * aa * 0.5 * 0.8, pos.z + 0.35 + s.v * aa * 0.5);
      q4.setFromEuler(new THREE.Euler(aa * 9 * s.s, aa * 7, i)); m4.compose(alive && q.y > 0.03 ? q : new Vec(0, -9, 0), q4, new Vec(1, 1, 1).multiplyScalar(0.8 * (1 - aa / 0.9)));
      turf.setMatrixAt(i, m4);
    }
    turf.instanceMatrix.needsUpdate = true;
    return { ...pose, expr: exAt(t, [[0, "focus"], [TIN - 0.05, "shout"], [TD + 0.9, "laugh"]]) };
  } };
} };

// ================================================================ race car
const race_car: ActDef = { pose: "sit", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY;
  const SC = 0.78, th = makeThing("sportscar", { color: "#ffd21f", text: "FAST" }); th.root.scale.setScalar(SC / (th.size / 1.25) * 1); th.root.scale.setScalar(SC);
  const car = new THREE.Group(); root.add(car); car.add(th.root);
  const cx = H[0] + 0.0, cz = H[2] + 0.4, YAW = 0.42;
  // road surface over the set's own markings, moving dashes and posts
  paint(root, 7.4, 60, "#575b6c", H[0], H[2] - 20, 0.02);
  const dashes: THREE.Mesh[] = [], PER = 3.2, ND = 12;
  for (const x of [-2.3, 0, 2.3]) for (let i = 0; i < ND; i++) { dashes.push(paint(root, 0.16, 1.5, "#fafafa", H[0] + x, 0, 0.026)); void i; }
  const post: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 8; i++) post.push(bx(root, 0.3, 0.5, 0.3, i % 2 ? "#ff7a1a" : "#fafafa", H[0] + sx * 3.2, 0.25, 0, 0.02));
  const rnd = seeded(c.seed * 5 + 9), lm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, toneMapped: false }), lines: { m: THREE.Mesh; x: number; y: number; z: number; sp: number }[] = [];
  for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1.6 + rnd() * 1.8), lm); root.add(m); lines.push({ m, x: (rnd() - 0.5) * 5.4, y: 0.1 + rnd() * 2.2, z: rnd() * 14, sp: 22 + rnd() * 10 }); }
  // wheels get visible spokes
  const wheels: { m: THREE.Mesh; side: number }[] = [];
  th.root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return; const gm = m.geometry as THREE.CylinderGeometry;
    if (gm.type === "CylinderGeometry" && Math.abs(gm.parameters.radiusTop - 0.36) < 0.01 && Math.abs(gm.parameters.height - 0.3) < 0.01) {
      const sd = Math.sign(m.position.x);
      for (const sgn of [1, -1]) for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.BoxGeometry(0.62, 0.03, 0.07), toonMat("#fafafa"), 0, sgn * 0.158, 0, false); sp.rotation.y = (k * PI) / 3; m.add(sp); }
      wheels.push({ m, side: sd });
    }
  });
  const wheel = mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 22), toonMat("#2a2a32")); wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 22), INK)); root.add(wheel);
  for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), toonMat("#2a2a32"), 0, 0, 0, false); sp.rotation.z = (k * PI) / 3; wheel.add(sp); }
  // a helmet on top of whatever head the hero has
  const head = rigOf(hero).children.find((o) => Math.abs(o.position.x) < 1e-3 && Math.abs(o.position.y - HY) < 0.06 && o.type === "Group");
  if (head) {
    const hm = mesh(new THREE.SphereGeometry(0.5, 24, 16, 0, PI * 2, 0, PI * 0.5), toonMat("#d8342c")); hm.position.set(0, 0.08, -0.03); hm.rotation.x = -0.35; hm.add(new THREE.Mesh(new THREE.SphereGeometry(0.535, 24, 16, 0, PI * 2, 0, PI * 0.5), INK)); head.add(hm);
    const st = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.9), toonMat("#fafafa"), 0, 0.505, -0.03, false); st.rotation.x = -0.35; head.add(st);
    const vis = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.1), toonMat("#1b1b24"), 0, 0.17, 0.43, false); head.add(vis);
  }
  const V = 17;
  const popR = popText(root, "FASTEST LAP!", [H[0], H[1] + 3.1, H[2] + 0.5], 1.9);
  return { tick(t) {
    popR(1.1, t);
    const bounce = Math.sin(t * 52) * 0.012 + Math.sin(t * 17) * 0.01, sway = Math.sin(t * 5.5) * 0.05;
    car.position.set(cx, 0.0 + 0.012 + bounce, cz); car.rotation.set(0, YAW + sway * 0.5, 0);
    // scenery streams past, away from the camera
    dashes.forEach((m, i) => { const col = Math.floor(i / ND), k = i % ND; m.position.set(H[0] + [-2.3, 0, 2.3][col], 0.026, H[2] + 7 - (((k * PER + V * t) % (ND * PER)))); });
    post.forEach((m, i) => { const sd = i < 8 ? -1 : 1, k = i % 8; m.position.set(H[0] + sd * 3.2, 0.25, H[2] + 7 - (((k * 3.1 + V * t) % (8 * 3.1)))); });
    lines.forEach((l) => { l.m.position.set(H[0] + l.x, l.y, H[2] + 8 - (((l.z + l.sp * t) % 16))); l.m.visible = Math.abs(l.x) > 1.3 || l.y > 1.8; });
    wheels.forEach((w) => { const a = -t * 16 * w.side; w.m.quaternion.setFromAxisAngle(Z, PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(Y, a)); });
    // hero: sits in the cockpit, hands on the wheel, head turned a little to the road
    const ry = YAW + sway * 0.5;
    hero.root.rotation.y = ry; hero.root.position.set(cx + Math.sin(ry) * 0.0, 0.0 - 0.2 + bounce, cz + 0.0);
    const rig = rigOf(hero); void rig;
    hero.root.position.set(cx - Math.sin(ry) * 0.1, -0.1 + bounce, cz - Math.cos(ry) * 0.1 * 0);
    const st = Math.sin(t * 3.1) * 0.35;
    wheel.position.copy(RW(hero, 0, SY - 0.25, 0.42)); wheel.quaternion.copy(rigOf(hero).getWorldQuaternion(new THREE.Quaternion()));
    wheel.rotateX(-0.9); wheel.rotateZ(st);
    const wp0 = (s: number) => new Vec(s * 0.19 * Math.cos(st), 0, 0).add(new Vec(0, s * 0.19 * Math.sin(st), 0)).applyQuaternion(wheel.quaternion).add(wheel.position);
    armW(hero, "r", wp0(1), [1.0, -0.2, -0.6]); armW(hero, "l", wp0(-1), [-1.0, -0.2, -0.6]);
    return { pose: "sit", t, expr: exAt(t, [[0, "focus"], [0.7, "effort"], [1.2, "shout"], [1.7, "grin"]]) };
  } };
} };

// ================================================================ sprint finish
const sprint_finish: ActDef = { pose: "run", view: "actc", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY;
  const zt = H[2] + 0.9, TB = 0.98, XP = 1.55;
  const ink = new THREE.MeshBasicMaterial({ color: "#ffd23a", toneMapped: false, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { cyl(root, 0.06, 1.4, "#f4f4f4", H[0] + s * XP, 0.7, zt, 0.02); const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), toonMat("#e5233b")); b.position.set(H[0] + s * XP, 1.45, zt); outline(b, 0.02); root.add(b); }
  paint(root, 7, 0.22, "#fafafa", H[0], zt, 0.03);
  const NS = 10, tape: THREE.Mesh[][] = [[], []], TY = 1.12;
  for (let h = 0; h < 2; h++) for (let i = 0; i < NS; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.012), ink); root.add(m); tape[h].push(m); }
  const N = 34, rnd = seeded(c.seed * 3 + 2), conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N); conf.frustumCulled = false; root.add(conf);
  const cs = Array.from({ length: N }, () => ({ vx: (rnd() - 0.5) * 3.4, vy: 1.5 + rnd() * 2.6, vz: (rnd() - 0.3) * 2.2, r: rnd() * 6 }));
  ["#ffd23a", "#e5233b", "#ffffff", "#37e0ff"].forEach((_, k) => void k); for (let i = 0; i < N; i++) conf.setColorAt(i, new THREE.Color(["#ffd23a", "#e5233b", "#ffffff", "#37e0ff"][i % 4]));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
  const x0 = H[0] + 0.15, z0 = H[2] - 3.7, V = 4.45, TE = 1.3;
  const posZ = (t: number) => (t < TE ? z0 + V * t : z0 + V * TE + 0.4 * (1 - (1 - cl((t - TE) / 0.5)) ** 2));
  const ang = (a: number) => a;
  const ribbon = (h: number, a: THREE.Vector3, bp: THREE.Vector3, sag: number, wave: (s: number) => THREE.Vector3) => {
    let prev = a.clone();
    for (let i = 0; i < NS; i++) {
      const s = (i + 1) / NS, p = a.clone().lerp(bp, s); p.y -= sag * 4 * s * (1 - s); p.add(wave(s));
      const m = tape[h][i], d = p.clone().sub(prev), L = d.length();
      m.position.copy(prev).add(p).multiplyScalar(0.5); m.scale.x = L + 0.02; m.quaternion.setFromUnitVectors(new Vec(1, 0, 0), d.clone().normalize()); prev = p;
    }
  };
  void ang;
  const popW = popText(root, "WINNER!", [H[0] - 0.2, H[1] + 3.2, zt + 0.5], 1.7);
  return { tick(t) {
    popW(TB + 0.2, t);
    const z = posZ(t), up = seg(t, TB - 0.35, TB + 0.1);
    const pose: ActPose = t < TE ? { pose: "run", t } : { pose: "cheer", t: t - TE };
    hero.root.rotation.y = 0.2 + 0.05 * Math.sin(t * 5.5);
    const rig = rigOf(hero);
    if (t < TE) { rig.rotation.x = mix(0.3, -0.05, up); } else { rig.rotation.x = 0; }
    if (t < TE) {
      hero.root.position.set(mix(x0, x0 + 0.2, t / TE), H[1], z);
      // arms thrown up and out as the chest hits the tape
      const out = up;
      armRig(hero, "r", new Vec(mix(0.35, 0.62, out), mix(SY - 0.2, HY + 0.5, out), mix(0.0, 0.0, out)), [1.2, 0.2, -0.8]);
      armRig(hero, "l", new Vec(-mix(0.35, 0.62, out), mix(SY - 0.2, HY + 0.5, out), 0.0), [-1.2, 0.2, -0.8]);
      if (up < 0.02) { /* the arms still run */ }
    } else hero.root.position.set(x0 + 0.2, H[1], z);
    // tape: taut and sagging until the chest reaches it, then two halves whip back
    const chest = new Vec(hero.root.position.x, TY, z + 0.2), aL = new Vec(H[0] - XP, TY + 0.1, zt), aR = new Vec(H[0] + XP, TY + 0.1, zt);
    if (t < TB) {
      const press = cl(1 - (zt - (z + 0.2)) / 0.55) * 0;
      const hit = new Vec(chest.x, TY, Math.min(zt + 0.0, zt));
      const bow = cl((t - (TB - 0.14)) / 0.14), pt = new Vec(hit.x, TY, zt + 0.35 * bow * bow);
      ribbon(0, aL, pt, 0.05, () => new Vec()); ribbon(1, aR, pt, 0.05, () => new Vec()); void press;
    } else {
      const a = t - TB, k = 1 - Math.exp(-5 * a);
      for (let h = 0; h < 2; h++) {
        const an = h ? aR : aL, sgn = h ? 1 : -1;
        const end = new Vec(an.x - sgn * (XP * 0.95) * (1 - 0.15 * k) * (0.9 * 0 + 1) * 1, 0, 0);
        const free = new Vec(H[0] + sgn * (XP * 0.95 - XP * 0.4 * k + 0.0) - sgn * 0.0, TY + 0.1 - 0.7 * (1 - Math.exp(-3 * a)) - 0.1, zt + 0.8 * k);
        void end;
        ribbon(h, an, free, 0.05 * Math.exp(-3 * a), (s) => new Vec(0, Math.sin(a * 22 - s * 9) * 0.06 * s * Math.exp(-2.4 * a), Math.cos(a * 18 - s * 8) * 0.12 * s * Math.exp(-2 * a)));
      }
    }
    for (let i = 0; i < N; i++) {
      const s = cs[i], a = Math.max(0, t - TB), alive = t >= TB;
      q4.setFromEuler(new THREE.Euler(a * 9 + s.r, a * 6, a * 4)); m4.compose(alive ? new Vec(H[0] + s.vx * a * 0.8, TY + s.vy * a - 4.5 * a * a * 0.5 * 1, zt + 0.2 + s.vz * a) : new Vec(0, -9, 0), q4, new Vec(1, 1, 1));
      conf.setMatrixAt(i, m4);
    }
    conf.instanceMatrix.needsUpdate = true;
    pose.expr = exAt(t, [[0, "focus"], [0.4, "effort"], [TB - 0.15, "shout"], [TB + 0.35, "laugh"]]);
    return pose;
  } };
} };

// ================================================================ weightlifting: clean and jerk
const lift_weights: ActDef = { pose: "stand", view: "actt", build(c: ActCtx): ActRun {
  const { root, hero, heroAt: H } = c;
  const SY = shY(hero), HY = hero.headY, L = legsOf(hero);
  const ry = 0.5;
  const bar = new THREE.Group(); root.add(bar);
  const BL = 2.2, steel = toonMat("#9aa3b2");
  const rod = mesh(new THREE.CylinderGeometry(0.028, 0.028, BL, 12), steel); rod.rotation.z = PI / 2; rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, BL + 0.04, 12), INK)); bar.add(rod);
  const ends: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.x = s * 0.55; bar.add(e); ends.push(e);
    const plate = (r: number, th: number, x: number, col: string) => { const m = mesh(new THREE.CylinderGeometry(r, r, th, 24), toonMat(col), s * x, 0, 0); m.rotation.z = PI / 2; m.add(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.025, r + 0.025, th + 0.05, 24), INK)); e.add(m); };
    plate(0.46, 0.09, 0.0, "#e5233b"); plate(0.46, 0.09, 0.12, "#e5233b"); plate(0.33, 0.07, 0.23, "#2a7de0"); plate(0.12, 0.1, 0.34, "#c8ccd4");
  }
  const rotD = 0;
  const depth = (t: number) => kf(t, [[0, 1.0], [0.28, 1.0], [0.62, 0.35], [0.8, 0.75], [1.0, 0.0], [1.12, 0.4], [1.28, 0.1], [1.45, 0.45], [1.7, 0.0]])[0];
  const lean = (t: number) => kf(t, [[0, 0.62], [0.28, 0.62], [0.62, 0.2], [0.8, 0.12], [1.0, -0.02], [1.12, 0.0], [1.28, -0.12], [1.45, -0.08], [1.7, -0.04]])[0];
  const barRig = (t: number) => kf(t, [[0, 0.3, 0.38], [0.28, 0.3, 0.34], [0.62, SY - 0.45, 0.3], [0.8, SY - 0.32, 0.3], [1.0, SY - 0.32, 0.28], [1.12, SY - 0.5, 0.3], [1.28, HY + 0.45, 0.04], [1.45, HY + 0.52, -0.04], [1.7, HY + 0.62, -0.04]]);
  const body = (t: number) => {
    hero.root.rotation.y = ry;
    const rig = rigOf(hero), ld = lean(t), d = depth(t);
    rig.rotation.set(ld, 0, 0);
    stance(hero, 0.95 * d, 1.7 * d, 0.95 * d, 1.7 * d, ld, 0.12 + 0.08 * d);
    plant(hero, H[0], H[2]);
    void L;
  };
  const popL = popText(root, "NEW RECORD!", [H[0] + 0.2, H[1] + 3.15, H[2] + 0.5], 1.9);
  return { tick(t) {
    body(t); popL(1.5, t);
    const br = barRig(t), tremor = t > 1.45 ? Math.sin(t * 43) * 0.012 * seg(t, 1.45, 1.6) : 0, by = br[0] + tremor;
    const bc = RW(hero, 0, by, br[1]);
    bar.position.copy(bc);
    const axis = RW(hero, 1, 0, 0).sub(RW(hero, 0, 0, 0)).normalize();
    bar.quaternion.setFromUnitVectors(new Vec(1, 0, 0), axis);
    // the bar bends: plates oscillate after the jerk locks out, and a little when it leaves the floor
    const a = Math.max(0, t - 1.3), bend = 0.09 * Math.exp(-2.4 * a) * Math.sin(20 * a) + 0.05 * Math.exp(-5 * Math.max(0, t - 0.3)) * Math.sin(26 * Math.max(0, t - 0.3)) * seg(t, 0.28, 0.4) * (1 - seg(t, 0.4, 0.7));
    ends.forEach((e) => { e.position.y = bend * (a > 0 || t < 0.7 ? 1 : 0) + (t > 1.6 ? Math.sin(t * 30) * 0.008 : 0); });
    const grip = 0.42, out = t > 1.1 ? [1.2, 0.3, -0.5] : [0.9, -0.1, -0.9];
    const ph = t > 1.2 ? 1 : 0;
    armRig(hero, "r", new Vec(grip, by, br[1]), ph ? [1.3, 0.1, -0.6] : (out as V3));
    armRig(hero, "l", new Vec(-grip, by, br[1]), ph ? [-1.3, 0.1, -0.6] : ([-out[0], out[1], out[2]] as V3));
    void rotD;
    return { pose: "stand", t, expr: exAt(t, [[0, "focus"], [0.3, "effort"], [1.25, "shout"], [1.7, "laugh"]]) };
  } };
} };

export const SPORTS2: Record<string, ActDef> = { qb_throw, touchdown, bat_swing, pitch, tennis_serve, golf_swing, goal_celebrate, race_car, sprint_finish, lift_weights };
