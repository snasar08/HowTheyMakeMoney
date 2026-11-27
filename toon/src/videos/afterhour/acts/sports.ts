// Afterhour sports acts (Nov 16): the ball, hoop, goal, bag and opponent really exist and move with the hero's hands.
// Everything is a pure function of t (and the seed): Ah calls tick() twice per frame, before and after posing the hero.
import * as THREE from "three";
import { toonMat, outline, canvasTex, seeded } from "../common";
import { makeThing } from "../things3d";
import { makeChar, Char, Look, Expr } from "../char";
import { drawCard } from "../cards";
import type { ActDef, ActCtx, ActRun } from "./types";

type V3 = [number, number, number];
const Vec = THREE.Vector3;
const PI = Math.PI;
const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (x: number) => { x = cl(x); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const wp = (o: THREE.Object3D) => o.getWorldPosition(new Vec());
const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);
const rigOf = (c: Char) => c.root.children[0] as THREE.Group;
const fwd = (c: Char) => new Vec(Math.sin(c.root.rotation.y), 0, Math.cos(c.root.rotation.y));

// ---------------------------------------------------------------- arm IK (a copy of char.ts reach(), driven from the hand object)
const DOWN = new Vec(0, -1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** put the hand at `tgt` (rig space: x right, y up, z forward); `pole` is the way the elbow bends (already side-signed) */
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
/** both/one hand to a rig-space point */
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

// ---------------------------------------------------------------- props
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
};
/** toon box with a hard black edge (a slightly larger inverted box: works on thin plates, unlike outline()) */
const bx = (parent: THREE.Object3D, w: number, h: number, d: number, col: string | THREE.Material, x: number, y: number, z: number, ink = 0.025) => {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof col === "string" ? toonMat(col) : col, x, y, z);
  if (ink) { const o = new THREE.Mesh(new THREE.BoxGeometry(w + ink * 2, h + ink * 2, d + ink * 2), INK); m.add(o); }
  parent.add(m); return m;
};
const cyl = (parent: THREE.Object3D, r: number, h: number, col: string, x: number, y: number, z: number, ink = 0.02) => {
  const m = mesh(new THREE.CylinderGeometry(r, r, h, 16), toonMat(col), x, y, z);
  if (ink) m.add(new THREE.Mesh(new THREE.CylinderGeometry(r + ink, r + ink, h + ink * 2, 16), INK));
  parent.add(m); return m;
};
const BLOB = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.34, depthWrite: false });
const blob = (parent: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), BLOB); m.rotation.x = -PI / 2; m.position.y = 0.035; m.renderOrder = 2; parent.add(m); return m; };
/** keep a ground shadow blob under a ball */
const dropShadow = (b: THREE.Object3D, p: THREE.Vector3, r: number) => {
  const h = Math.max(0, p.y - r); b.position.set(p.x, 0.035, p.z); b.scale.setScalar(r * (1.25 - 0.1 * Math.min(h, 3)) * 1.1); b.visible = h < 6;
};

type Ball = { g: THREE.Group; spin: THREE.Group; r: number };
const basketball = (r: number): Ball => {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const m = mesh(new THREE.SphereGeometry(r, 28, 18), toonMat("#f5802a")); outline(m, 0.024); spin.add(m);
  const line = new THREE.MeshBasicMaterial({ color: "#1b1b24" }), tube = r * 0.05;
  const t1 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, tube, 6, 40), line); spin.add(t1);
  const t2 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, tube, 6, 40), line); t2.rotation.y = PI / 2; spin.add(t2);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(1 - 0.55 * 0.55) * r * 1.004, tube * 0.9, 6, 36), line);
    t.rotation.y = PI / 2; t.position.x = s * 0.55 * r; spin.add(t);
  }
  return { g, spin, r };
};
const soccerball = (r: number): Ball => {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const m = mesh(new THREE.SphereGeometry(r, 24, 16), toonMat("#fafafa")); outline(m, 0.024); spin.add(m);
  const ph = (1 + Math.sqrt(5)) / 2, dk = new THREE.MeshBasicMaterial({ color: "#1b1b24", side: THREE.DoubleSide });
  for (const [a, b, c] of [[0, 1, ph], [0, 1, -ph], [0, -1, ph], [0, -1, -ph], [1, ph, 0], [1, -ph, 0], [-1, ph, 0], [-1, -ph, 0], [ph, 0, 1], [ph, 0, -1], [-ph, 0, 1], [-ph, 0, -1]]) {
    const d = new Vec(a, b, c).normalize(), p = new THREE.Mesh(new THREE.CircleGeometry(r * 0.4, 5), dk);
    p.position.copy(d).multiplyScalar(r * 1.004); p.lookAt(d.clone().multiplyScalar(5)); spin.add(p);
  }
  return { g, spin, r };
};
/** y of a ball dropped from y0 with vertical speed v0 after t seconds, bouncing on the floor */
const fall = (y0: number, v0: number, t: number, r: number, g = 14, e = 0.5) => {
  let y = y0, v = v0, tt = 0;
  while (tt < t - 1e-9) {
    const h = Math.min(1 / 240, t - tt); v -= g * h; y += v * h;
    if (y < r) { y = r; v = -v * e; if (Math.abs(v) < 1.2) v = 0; }
    tt += h;
  }
  return y;
};

// ---------------------------------------------------------------- hoop with a swishing net
type Hoop = { g: THREE.Group; rim: THREE.Vector3; net(sx: number, sz: number, bulge: number): void };
/** rim centre at `rim`; `face` = rotation.y so that local +z (the front, where the ball comes from) points at the camera/hero */
const makeHoop = (rim: THREE.Vector3, face: number, R = 0.3): Hoop => {
  const g = new THREE.Group(); g.position.copy(rim); g.rotation.y = face;
  const bz = -(R + 0.1);
  bx(g, 1.7, 1.05, 0.08, "#f4f4f4", 0, 0.3, bz);
  const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(64, 48, (x) => {
    x.fillStyle = "#f4f4f4"; x.fillRect(0, 0, 64, 48); x.strokeStyle = "#d3202f"; x.lineWidth = 6; x.strokeRect(3, 3, 58, 42); }) }));
  dec.position.set(0, 0.08, bz + 0.047); g.add(dec);
  bx(g, 0.12, 0.05, 0.14, "#ff5a1f", 0, 0, bz + 0.1, 0.012);
  const ring = mesh(new THREE.TorusGeometry(R, 0.03, 8, 32), toonMat("#ff5a1f", { emissive: "#ff4410", emissiveIntensity: 0.9 })); ring.rotation.x = PI / 2; g.add(ring);
  const top = 0.75;
  cyl(g, 0.09, rim.y + top, "#8f97a6", 0, (top - rim.y) / 2, bz - 1.4);
  bx(g, 0.14, 0.14, 1.4, "#8f97a6", 0, 0.55, bz - 0.72, 0.015);
  bx(g, 0.7, 0.45, 0.7, "#2a3b9c", 0, -rim.y + 0.225, bz - 1.4);   // Nov 24: a low pole pad (the tall one read as a pedestal the shoe stood on)
  const strands: THREE.Mesh[] = [], sm_ = new THREE.MeshBasicMaterial({ color: "#ffffff" }), sg = new THREE.CylinderGeometry(0.009, 0.009, 1, 5);
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(sg, sm_); g.add(m); strands.push(m); }
  const A = new Vec(), B = new Vec();
  const net = (sx: number, sz: number, bulge: number) => {
    const H = 0.52 - 0.07 * bulge, rb = 0.16 + 0.1 * bulge;
    for (let i = 0; i < 12; i++) for (let f = 0; f < 2; f++) {
      const a = (i / 12) * PI * 2, b = a + (f ? -0.55 : 0.55), m = strands[i * 2 + f];
      A.set(R * Math.cos(a), -0.02, R * Math.sin(a)); B.set(sx + rb * Math.cos(b), -0.02 - H, sz + rb * Math.sin(b));
      m.position.copy(A).add(B).multiplyScalar(0.5); m.scale.y = A.distanceTo(B);
      m.quaternion.setFromUnitVectors(new Vec(0, 1, 0), B.clone().sub(A).normalize());
    }
  };
  net(0, 0, 0);
  return { g, rim: rim.clone(), net };
};
/** net animation from the ball height (bulge while it passes) and the time since it dropped through (shake) */
const swish = (h: Hoop, ballY: number, since: number) => {
  const dy = ballY - (h.rim.y - 0.22), bulge = since > -0.2 ? Math.exp(-(dy * dy) / 0.12) : 0;
  const a = since > 0 ? 0.07 * Math.exp(-4 * since) * Math.sin(24 * since) : 0;
  h.net(a, a * 0.6, bulge);
};

/** face timeline: rows [t, expr] (sorted), each expression holds until the next row */
export const exAt = (t: number, rows: [number, Expr][]): Expr => { let e = rows[0][1]; for (const [a, x] of rows) if (t >= a) e = x; return e; };
/** a cel-style text pop in the world ("SWISH", "+2", "GOAL"): pops with an overshoot at t0 and stays; call the returned fn every tick */
export const popText = (root: THREE.Object3D, text: string, pos: V3, w = 1.5, fg = "#ffe14a", bg = "#1b1b24", sub?: string) => {
  const W = 800, H = 320, tex = drawCard({ text, kind: "sign", bg, fg, sub }, W, H);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * H) / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, depthTest: false }));
  m.position.set(...pos); m.visible = false; m.renderOrder = 20; root.add(m);
  return (t0: number, t: number, t1 = 99) => {
    const a = t - t0; m.visible = a >= 0 && a < t1 - t0; if (!m.visible) return;
    const k = a < 0.16 ? (a / 0.16) * 1.3 : a < 0.3 ? 1.3 - 0.3 * ((a - 0.16) / 0.14) : 1 + 0.02 * Math.sin(a * 9);
    m.scale.setScalar(Math.max(0.01, k)); m.rotation.z = (a < 0.3 ? 0.12 * (1 - a / 0.3) : 0) - 0.03;
  };
};
/** flat star burst facing the camera at p (pure function of t) */
export const starAt = (root: THREE.Object3D, col = "#fff27a") => {
  const sh = new THREE.Shape(); for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2, rr = i % 2 ? 0.28 : 0.7; if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(rr, 0); }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  m.renderOrder = 5; m.visible = false; root.add(m);
  return (t0: number, t: number, p: THREE.Vector3, k = 1) => {
    const a = t - t0; m.visible = a > -0.02 && a < 0.3; if (!m.visible) return;
    m.position.copy(p); m.position.z += 0.3; m.scale.setScalar(k * (0.4 + 2.2 * seg(a, -0.02, 0.12)) * 0.5); (m.material as THREE.MeshBasicMaterial).opacity = 1 - seg(a, 0.1, 0.3); m.rotation.z = a * 3;
  };
};

/** hide the set's own loose ball (court / pitch) so only the act's ball is on the floor */
const clearBall = (c: ActCtx) => {
  const b = c.spots.ball; if (!b) return;
  c.root.updateMatrixWorld(true);
  c.root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || m.parent === undefined) return;
    const g = m.geometry; if (!(g instanceof THREE.SphereGeometry || g instanceof THREE.TorusGeometry)) return;
    const p = wp(m); if (Math.hypot(p.x - b[0], p.z - b[2]) < 0.45 && p.y < 0.5) m.visible = false;
  });
};
/** acts that bring their own hoop hide the court set's back hoop, backboard, net and stanchion (exactly one hoop per frame) */
const hideSetHoop = (c: ActCtx) => {
  if (c.set !== "court") return;
  c.root.updateMatrixWorld(true);
  c.root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const p = wp(m); if (Math.abs(p.x) < 1.2 && p.y > 0.2 && p.y < 4.2 && p.z < -4.4 && p.z > -7.9) m.visible = false;
  });
};
const JERSEY = (body: string, text: string, trim = "#ffffff"): Look => ({ body, legs: body, outfit: "jersey", text, trim, height: 1.3 });

// ---------------------------------------------------------------- acts
const dribble: ActDef = { pose: "dribble", view: "actm", build(c: ActCtx): ActRun {
  const { root, hero } = c; clearBall(c); hero.root.rotation.y = 0.55;
  const r = 0.2, ball = basketball(r), sh = blob(root); root.add(ball.g);
  const high = (() => { hero.set(0, "dribble", "smile"); return wp(hero.hand("r")); })();
  const CT = 0.34, FL = 0.62;   // contact ends / floor hit, as fractions of the 0.5 s bounce
  const hc = (() => { hero.set(0.5 * CT, "dribble", "smile"); return wp(hero.hand("r")); })();
  const off = r + 0.06;
  return { tick(t) {
    const s = (t / 0.5) % 1, p = new Vec();
    if (s < CT) { p.copy(wp(hero.hand("r"))); p.y -= off; }
    else if (s < FL) { const q = (s - CT) / (FL - CT); p.set(mix(hc.x, high.x, (s - CT) / (1 - CT)), r + (hc.y - off - r) * (1 - q ** 1.5), mix(hc.z, high.z, (s - CT) / (1 - CT))); }
    else { const q = (s - FL) / (1 - FL); p.set(mix(hc.x, high.x, (s - CT) / (1 - CT)), r + (high.y - off - r) * (1 - (1 - q) ** 2), mix(hc.z, high.z, (s - CT) / (1 - CT))); }
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 7;
    ball.g.scale.set(1, 1, 1); if (p.y < r + 0.03) ball.g.scale.set(1.12, 0.84, 1.12);
    dropShadow(sh, p, r);
    return { pose: "dribble", t, expr: exAt(t, [[0, "focus"], [0.7, "grin"], [1.3, "smug"], [1.7, "grin"]]) };
  } };
} };

/** jump shot: knees bend, the ball rides in both hands from the chest to above the head (hands IK'd to it every frame),
 *  releases off the shooting hand with a wrist follow-through, flies one continuous parabola into the hoop, drops through
 *  the net (it sways) and bounces on the floor. The body is the baked "shoot" pose (crouch, jump, land); only the arms are driven here. */
const shoot: ActDef = { pose: "shoot", view: "acts", build(c) {
  const { root, hero, heroAt: H } = c; hero.root.rotation.y = 0.85; clearBall(c); hideSetHoop(c);
  const r = 0.2, ball = basketball(r), sh = blob(root); root.add(ball.g);
  const rim = new Vec(H[0] + 1.8, 3.35, H[2] + 1.4), hoop = makeHoop(rim, -1.3); root.add(hoop.g);
  const TR = 0.744, Tf = 0.8, G = 13.5, FT = 1.2;   // release time, flight time, gravity, end of the baked pose
  // the head is huge, so normal arms cannot get the ball above it: this shot's hero (built per shot) gets 40% longer arms
  const M = 1.4;
  for (const sd of ["l", "r"] as const) {
    const hd = hero.hand(sd), el = hd.parent!, shd = el.parent!;
    shd.children.forEach((o) => { if (o !== el && o.position.y < -0.01) { o.scale.y *= M; o.position.y *= M; } });
    el.children.forEach((o) => { if (o !== hd && o.position.y < -0.01) { o.scale.y *= M; o.position.y *= M; } });
    el.position.y *= M; hd.position.y *= M;
  }
  const SY = shY(hero), HY = SY + 0.36, k = hero.root.scale.y || 1;
  const ex = (t: number, rows: [number, number, number, number][]) => {   // keyframes [t, x, y, z] -> eased vector
    let i = 0; while (i < rows.length - 2 && t >= rows[i + 1][0]) i++;
    const a = rows[i], b = rows[i + 1], u = seg(t, a[0], b[0]);
    return new Vec(mix(a[1], b[1], u), mix(a[2], b[2], u), mix(a[3], b[3], u));
  };
  // ball centre in rig space (before the release)
  const ballKey: [number, number, number, number][] = [[0, 0.1, SY - 0.4, 0.4], [0.12, 0.1, SY - 0.4, 0.4], [0.27, 0.1, SY - 0.6, 0.38], [0.5, 0.34, HY - 0.1, 0.5], [TR, 0.3, HY + 0.55, 0.38]];
  const rel = ex(TR, ballKey), hs = 0.19 / k;   // hand half-spacing so the hands touch the ball
  const rHandRel = rel.clone().add(new Vec(0.12, -0.1, -0.06));
  const rHandFT = new Vec(0.3, HY + 0.75, 0.7), rHandFlick = new Vec(0.3, HY + 0.5, 0.74), rHandDown = new Vec(0.22, SY - 0.35, 0.2);
  const armsAt = (t: number) => {
    const ctr = ex(Math.min(t, TR), ballKey);
    let rh: THREE.Vector3, lh: THREE.Vector3;
    if (t < TR) { rh = ctr.clone().add(new Vec(hs * 0.7, -0.05, -0.05)); lh = ctr.clone().add(new Vec(-hs, 0, 0)); }
    else {
      rh = rHandRel.clone().lerp(rHandFT, seg(t, TR, TR + 0.14)).lerp(rHandFlick, seg(t, TR + 0.14, TR + 0.32)).lerp(rHandDown, seg(t, TR + 0.8, TR + 1.2));
      lh = ctr.clone().add(new Vec(-hs, 0, 0)).lerp(new Vec(-0.26, SY - 0.3, 0.15), seg(t, TR, TR + 0.4));
    }
    ik(hero, "r", rh, [0.3, -1, -0.5]); ik(hero, "l", lh, [-0.3, -1, -0.5]);
    return ctr;
  };
  const ballW = (t: number) => { const rig = rigOf(hero); hero.root.updateMatrixWorld(true); return rig.localToWorld(armsAt(t).clone()); };
  hero.set(TR, "shoot", "smile"); const p0 = ballW(TR);
  const vy = (rim.y - p0.y + 0.5 * G * Tf * Tf) / Tf, vTf = vy - G * Tf, vx = (rim.x - p0.x) / Tf, vz = (rim.z - p0.z) / Tf;
  const pop = popText(root, "SWISH!", [rim.x - 1.35, rim.y + 0.7, rim.z + 0.3], 1.4);
  return { tick(t) {
    const p = new Vec(); let since = -1;
    pop(TR + Tf - 0.05, t);
    const pt = Math.min(t, FT * 0.95);
    if (t < TR) { p.copy(ballW(t)); }
    else {
      armsAt(t); // keep the follow-through arms posed (the ball is already in the air)
      if (t < TR + Tf) { const a = t - TR; p.set(p0.x + vx * a, p0.y + vy * a - 0.5 * G * a * a, p0.z + vz * a); }
      else { const a = t - TR - Tf, d = (1 - Math.exp(-3 * a)) / 3; since = a; p.set(rim.x + vx * 0.3 * d, fall(rim.y, vTf, a, r, 14, 0.55), rim.z + vz * 0.3 * d); }
    }
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 5; ball.spin.rotation.z = t * 2; dropShadow(sh, p, r);
    ball.g.scale.set(1, 1, 1); if (since > 0 && p.y < r + 0.02) ball.g.scale.set(1.1, 0.88, 1.1);
    swish(hoop, p.y, since);
    return { pose: "shoot", t: pt, expr: exAt(t, [[0, "focus"], [TR - 0.25, "effort"], [TR + 0.2, "grin"], [TR + Tf - 0.05, "laugh"]]) };
  } };
} };

/** run in from the right, jump beside the hoop: "dunk" slams the ball down through it, "layup" lays it up and in */
const rimMove = (mode: "dunk" | "layup"): ActDef => ({ pose: "run", view: "actd", build(c) {
  const { root, hero, heroAt: H } = c; clearBall(c); hideSetHoop(c);
  const TH = 0.8; hero.root.rotation.y = TH;
  const RUN = mode === "dunk" ? 0.5 : 0.55, T0 = 0.242, jx = H[0], jz = H[2], f0 = new Vec(Math.sin(TH), 0, Math.cos(TH));
  const r = 0.17, ball = basketball(r), sh = blob(root); root.add(ball.g);
  const uR = mode === "dunk" ? 0.58 : 0.5, tR = uR * 1.1, dyOf = (u: number) => (mode === "dunk" ? mix(0.1, -0.1, seg(u, 0.44, 0.56)) : 0.1);
  hero.root.position.set(jx, H[1], H[2]); hero.set(tR, "dunk", "smile");
  const hs = wp(hero.hand("r")), ball0 = hs.clone().add(new Vec(0, dyOf(uR), 0));
  const rim = mode === "dunk" ? ball0.clone().add(new Vec(0, -0.16, 0)) : ball0.clone().addScaledVector(fwd(hero), 0.45).add(new Vec(0, 0.55, 0));
  const hoop = makeHoop(rim, -0.67); root.add(hoop.g);
  const Tf = 0.5, G = 13.5, vy = (rim.y - ball0.y + 0.5 * G * Tf * Tf) / Tf, vT = vy - G * Tf;
  const tRel = RUN + tR - T0;   // shot time of the release
  const pop = popText(root, mode === "dunk" ? "SLAM!" : "+2", [rim.x + 0.5, rim.y + 1.0, rim.z + 0.3], 1.2, "#ffffff", mode === "dunk" ? "#d3202f" : "#d3202f");
  const LOOP = tRel + (mode === "dunk" ? 1.55 : 1.8);   // Nov 24: a long shot repeats the whole run-jump-slam (it used to stand at the hoop after one dunk)
  return { tick(t0) {
    const t = t0 < LOOP ? t0 : t0 % LOOP;
    pop(mode === "dunk" ? tRel : tRel + Tf - 0.05, t);
    let pose: "run" | "dunk", pt: number;
    if (t < RUN) { hero.root.position.set(jx - f0.x * 1.7 * (1 - t / RUN), H[1], jz - f0.z * 1.7 * (1 - t / RUN)); pose = "run"; pt = t; }
    else { hero.root.position.set(jx, H[1], jz); pose = "dunk"; pt = Math.min(t - RUN + T0, 1.085); }
    const p = new Vec(); let since = -1;
    if (t < tRel) { p.copy(wp(hero.hand("r"))); const u = pose === "run" ? 0.2 : (pt / 1.1) % 1; p.y += pose === "run" ? 0.1 : dyOf(u); }
    else if (mode === "dunk") { const a = t - tRel; since = a - 0.1; p.set(rim.x, fall(rim.y + 0.16, -4.5, a, r, 14, 0.55), rim.z); }
    else if (t < tRel + Tf) { const a = t - tRel; p.set(mix(ball0.x, rim.x, a / Tf), ball0.y + vy * a - 0.5 * G * a * a, mix(ball0.z, rim.z, a / Tf)); }
    else { const a = t - tRel - Tf; since = a; p.set(rim.x, fall(rim.y, vT, a, r, 14, 0.55), rim.z); }
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 4; dropShadow(sh, p, r); swish(hoop, p.y, since);
    const exp = mode === "dunk" ? exAt(t, [[0, "focus"], [tRel - 0.45, "effort"], [tRel - 0.12, "shout"], [tRel + 0.5, "laugh"]])
      : exAt(t, [[0, "focus"], [tRel - 0.35, "effort"], [tRel + 0.15, "grin"], [tRel + Tf - 0.05, "laugh"]]);
    return { pose, t: pt, expr: exp };
  } };
} });

const block: ActDef = { pose: "jump", view: "actw", build(c) {
  const { root, hero, heroAt: H } = c; clearBall(c);
  hero.root.rotation.y = -0.8;
  const opp = makeChar(JERSEY("#d8342c", "7")); opp.root.position.set(H[0] - 1.25, H[1], H[2]); opp.root.rotation.y = 0.8; root.add(opp.root);
  const r = 0.17, ball = basketball(r), sh = blob(root); root.add(ball.g);
  const TR = 0.744, Tb = 0.95, TJ = Tb - 0.46, TL = TJ + 0.82;   // opp releases, ball meets the hand, jump clock starts, hero lands
  const omid = () => mid(wp(opp.hand("r")), wp(opp.hand("l"))).add(new Vec(0, 0.015, 0));
  const arms = (t: number) => {
    const up = seg(t - TJ, -0.1, 0.38) * (1 - seg(t, TL - 0.1, TL + 0.25)), SY = shY(hero);
    arm(hero, "r", mix(0.3, 0.14, up), mix(SY - 0.55, SY + 0.68, up), mix(0.05, 0.12, up), [0.4, -0.3, -1]);
    arm(hero, "l", mix(0.3, 0.2, up), mix(SY - 0.55, SY + 0.5, up), mix(0.05, 0.2, up), [-0.4, -0.3, -1]);
  };
  const heroPose = (t: number) => (t < TJ || t > TL ? { pose: "stand" as const, t } : { pose: "jump" as const, t: t - TJ });
  opp.set(TR, "shoot", "grin"); const p0 = omid();
  const hp = heroPose(Tb); hero.set(hp.t, hp.pose, "smile"); arms(Tb); const hit = wp(hero.hand("r")).add(new Vec(-0.02, 0.1, 0.0));
  // impact star + a motion trail of ghost balls
  const star = new THREE.Shape(); for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2, rr = i % 2 ? 0.28 : 0.7; if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(rr, 0); }
  const starM = new THREE.Mesh(new THREE.ShapeGeometry(star), new THREE.MeshBasicMaterial({ color: "#fff27a", transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  starM.position.copy(hit); starM.renderOrder = 5; starM.visible = false; root.add(starM);
  const ghosts: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: "#ff9a3a", transparent: true, opacity: 0.4 - i * 0.055, depthWrite: false })); m.visible = false; root.add(m); ghosts.push(m); }
  const pop = popText(root, "DENIED!", [hit.x - 0.1, hit.y + 1.15, hit.z + 0.3], 1.5, "#ff5a4a");
  const pathAt = (t: number, live: boolean) => {
    const p = new Vec();
    if (t < TR) { if (live) p.copy(omid()); else p.copy(p0); }
    else if (t < Tb) { const a = (t - TR) / (Tb - TR); p.set(mix(p0.x, hit.x, a), mix(p0.y, hit.y, a) + 0.12 * Math.sin(PI * a), mix(p0.z, hit.z, a)); }
    else { const a = t - Tb; p.set(hit.x + 1.9 * a, fall(hit.y, -0.6, a, r, 12, 0.62), hit.z + 1.3 * a); }
    return p;
  };
  return { tick(t) {
    opp.set(Math.min(t, 1.14), "shoot", exAt(t, [[0, "focus"], [TR - 0.2, "effort"], [Tb, "shock"]]));
    pop(Tb + 0.1, t);
    const p = pathAt(t, true);
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 6; ball.spin.rotation.z = t > Tb ? t * 14 : 0; dropShadow(sh, p, r);
    ghosts.forEach((m, i) => { const q = t > Tb + 0.02 && t < Tb + 0.7 ? pathAt(t - (i + 1) * 0.035, false) : null; m.visible = !!q; if (q) { m.position.copy(q); m.scale.setScalar(1 - i * 0.1); } });
    const sa = t - Tb; starM.visible = sa > -0.02 && sa < 0.3; if (starM.visible) { starM.scale.setScalar(0.4 + 2.2 * seg(sa, -0.02, 0.12)); (starM.material as THREE.MeshBasicMaterial).opacity = 1 - seg(sa, 0.1, 0.3); starM.rotation.z = sa * 3; }
    const o = heroPose(t);
    if (hero.hand("r").userData.posed === o.t) arms(t);
    hero.hand("r").userData.posed = o.t;
    return { ...o, expr: exAt(t, [[0, "focus"], [Tb - 0.5, "effort"], [Tb - 0.1, "shout"], [Tb + 0.35, "smug"]]) };
  } };
} };

const pass: ActDef = { pose: "dribble", view: "actc", build(c) {
  const { root, hero, heroAt: H } = c; clearBall(c);
  hero.root.position.set(H[0] - 0.85, H[1], H[2]); hero.root.rotation.y = PI / 2 - 0.3;
  const mate = makeChar(JERSEY("#f2c230", "9", "#1b1b24")); mate.root.position.set(H[0] + 0.85, H[1], H[2]); mate.root.rotation.y = -PI / 2 + 0.3; root.add(mate.root);
  const r = 0.17, ball = basketball(r), sh = blob(root); root.add(ball.g);
  const TR = 0.6, Tc = 0.9;
  const handsH = (t: number) => {   // hero: ball at the chest, draws back to the chest, snaps out, follows through and relaxes
    const SY = shY(hero), push = seg(t, 0.3, TR), back = seg(t, 0.08, 0.3), foll = seg(t, TR, TR + 0.18), relax = seg(t, TR + 0.35, TR + 0.8);
    const z = (mix(0.34, 0.16, back) + 0.46 * push) * (1 - 0.5 * relax) + 0.1 * foll, y = SY - 0.3 + 0.12 * push - 0.06 * back + 0.05 * foll - 0.3 * relax;
    const x = 0.13 + 0.1 * foll + 0.06 * back;   // elbows flare on the snap, hands spread on the follow-through
    arm(hero, "r", x, y, z, [1.4, -0.3, -0.5]); arm(hero, "l", x, y, z, [-1.4, -0.3, -0.5]);
  };
  const handsM = (t: number) => {   // mate: hands out as a target, give with the ball, cradle it
    const SY = shY(mate), reach = seg(t, 0.2, 0.55), take = seg(t, Tc - 0.02, Tc + 0.2);
    const z = mix(0.2, 0.6, reach) - 0.28 * take, y = mix(SY - 0.4, SY - 0.12, reach) - 0.18 * take;
    arm(mate, "r", mix(0.2, 0.19, reach) - 0.05 * take, y, z, [1.3, -0.4, -0.2]); arm(mate, "l", mix(0.2, 0.19, reach) - 0.05 * take, y, z, [-1.3, -0.4, -0.2]);
  };
  const midOf = (ch: Char) => mid(wp(ch.hand("r")), wp(ch.hand("l")));
  const pop = popText(root, "ASSIST!", [H[0], H[1] + 3.0, H[2] + 0.3], 1.5);
  const leanH = (t: number) => 0.04 - 0.1 * seg(t, 0.08, 0.3) + 0.22 * seg(t, 0.3, TR) - 0.18 * seg(t, TR + 0.1, TR + 0.7);
  const leanM = (t: number) => 0.08 + 0.1 * seg(t, 0.2, Tc) - 0.1 * seg(t, Tc, Tc + 0.3);
  hero.set(0.1, "dribble", "smile"); rigOf(hero).rotation.x = leanH(TR); handsH(TR); const p0 = midOf(hero);
  mate.set(0, "stand", "grin"); rigOf(mate).rotation.x = leanM(Tc); handsM(Tc); const p1 = midOf(mate);
  return { tick(t) {
    mate.set(t, "stand", exAt(t, [[0, "focus"], [Tc - 0.1, "shout"], [Tc + 0.25, "laugh"]])); handsM(t);
    rigOf(mate).rotation.x = leanM(t); rigOf(hero).rotation.x = leanH(t);
    if (hero.hand("r").userData.posed) handsH(t);
    pop(Tc + 0.2, t);
    const p = new Vec();
    if (t < TR) { p.copy(midOf(hero)); }
    else if (t < Tc) { const a = (t - TR) / (Tc - TR); p.set(mix(p0.x, p1.x, a), mix(p0.y, p1.y, a) + 0.22 * Math.sin(PI * a), mix(p0.z, p1.z, a)); }
    else p.copy(midOf(mate));
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 6; dropShadow(sh, p, r);
    hero.hand("r").userData.posed = 1;
    return { pose: "dribble", t: Math.min(t, 0.2), expr: exAt(t, [[0, "focus"], [0.25, "effort"], [TR + 0.05, "grin"], [Tc + 0.2, "laugh"]]) };
  } };
} };

const kick: ActDef = { pose: "run", view: "act", build(c) {
  const { root, hero, heroAt: H } = c;
  clearBall(c); const g = new THREE.Group(), W = 2.8, D = 1.2, Ht = 1.9; root.add(g);
  const G0 = new Vec(H[0] + 2.5, 0, H[2] - 1.2); g.position.copy(G0); g.rotation.y = -0.71;
  const white = toonMat("#fafafa");
  for (const s of [-1, 1]) { cyl(g, 0.06, Ht, "#fafafa", s * W / 2, Ht / 2, 0, 0.02); cyl(g, 0.045, 1.5, "#fafafa", s * W / 2, 0.75, -D, 0.015); }
  const bar = mesh(new THREE.CylinderGeometry(0.06, 0.06, W, 12), white, 0, Ht, 0); bar.rotation.z = PI / 2; bar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, W + 0.04, 12), INK)); g.add(bar);
  const nt = canvasTex(128, 128, (x) => { x.clearRect(0, 0, 128, 128); x.strokeStyle = "#ffffff"; x.lineWidth = 3; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, 128); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(128, i * 16); x.stroke(); } });
  const nm = () => new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
  const back = new THREE.Group(); back.position.set(0, 0, -D); g.add(back);
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.7), nm()); bp.position.set(0, 0.85, 0); back.add(bp);
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(W, Math.hypot(D, 0.5)), nm()); tp.rotation.x = -PI / 2 + Math.atan2(0.5, D); tp.position.set(0, 1.75, -D / 2); g.add(tp);
  for (const s of [-1, 1]) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(D, 1.85), nm()); sp.rotation.y = PI / 2; sp.position.set(s * W / 2, 0.92, -D / 2); g.add(sp); }
  const r = 0.26, ball = soccerball(r), sh = blob(root); root.add(ball.g);
  // heading towards the goal; sample the right foot to find when it is furthest forward and where the ball must sit
  const d = new Vec(G0.x - H[0], 0, G0.z - H[2]).normalize(), rot = Math.atan2(d.x, d.z); hero.root.rotation.y = rot;
  const rig = rigOf(hero);
  const hips = rig.children.filter((o) => o.type === "Group" && o.name === "hip" && o.children.length >= 3);
  const hipR = hips.find((o) => o.position.x > 0) ?? hips[0], knee = hipR.children.find((o) => o.type === "Group")!;
  const foot = knee.children.find((o) => o.name === "foot") ?? knee;
  const V = 2.2;
  let tc = 0.4285, best = -9;
  for (let t = 0.2; t < 0.7; t += 1 / 120) { hero.set(t, "run", "smile"); const f = wp(foot).sub(new Vec(H[0], 0, H[2])).dot(d) - V * (0.4285 - t) * -1 * 0; if (f > best) { best = f; tc = t; } }
  const rootAt = (t: number) => new Vec(H[0], H[1], H[2]).addScaledVector(d, V * (t - tc));
  const footRel = (() => { hero.root.position.copy(rootAt(tc)); hero.set(tc, "run", "smile"); return wp(foot); })();
  const B = footRel.clone().addScaledVector(d, r + 0.04); B.y = r;
  const aim = new Vec(G0.x, 1.15, G0.z).addScaledVector(new Vec(Math.sin(-0.71), 0, Math.cos(-0.71)), -0.9);
  const Tf = 0.5, Gv = 9.8, vy = (aim.y - r + 0.5 * Gv * Tf * Tf) / Tf;
  const pop = popText(root, "GOAL!", [G0.x - 0.5, 2.9, G0.z + 0.2], 1.6, "#ffe14a");
  return { tick(t) {
    pop(tc + Tf - 0.05, t);
    let pose: "run" | "cheer", pt: number;
    const tEnd = tc + 0.35;
    hero.root.rotation.y = mix(rot, rot - Math.atan2(Math.sin(rot - 0.3), Math.cos(rot - 0.3)), seg(t, tc + 0.15, tc + 0.55));
    if (t < tEnd) { hero.root.position.copy(rootAt(t)); pose = "run"; pt = t; }
    else { hero.root.position.copy(rootAt(tEnd)); pose = "cheer"; pt = t - tEnd; }
    const p = new Vec(); let bulge = 0;
    if (t < tc) p.copy(B);
    else if (t < tc + Tf) { const a = t - tc; p.set(mix(B.x, aim.x, a / Tf), r + vy * a - 0.5 * Gv * a * a, mix(B.z, aim.z, a / Tf)); }
    else { const a = t - tc - Tf; p.set(aim.x, fall(aim.y, -1.0, a, r, 12, 0.35), aim.z); bulge = Math.exp(-a * 4); }
    back.position.z = -D - 0.3 * bulge * Math.sin(Math.min(1, (t - tc - Tf) * 6 + 1.5) * 1);
    ball.g.position.copy(p); ball.spin.rotation.x = -t * 9; ball.spin.rotation.y = t * 3; dropShadow(sh, p, r);
    return { pose, t: pt, expr: exAt(t, [[0, "focus"], [tc - 0.2, "effort"], [tc - 0.03, "shout"], [tc + 0.3, "grin"], [tc + Tf, "laugh"]]) };
  } };
} };

const punch: ActDef = { pose: "dribble", view: "actm", build(c) {
  const { root, hero, heroAt: H } = c;
  hero.root.rotation.y = 1.0;
  const f = fwd(hero), n = new Vec(-f.z, 0, f.x);
  const BR = 0.34, bagC = new Vec(H[0], 1.5, H[2]).addScaledVector(f, 1.55), top = 3.6;
  const pivot = new THREE.Group(); pivot.position.set(bagC.x, top, bagC.z); root.add(pivot);
  const bag = new THREE.Group(); bag.position.y = bagC.y - top; pivot.add(bag);
  bag.add(mesh(new THREE.CylinderGeometry(BR, BR, 1.25, 20), toonMat("#c0302a")));
  const bagM = bag.children[0] as THREE.Mesh; bagM.add(new THREE.Mesh(new THREE.CylinderGeometry(BR + 0.025, BR + 0.025, 1.3, 20), INK));
  for (const y of [-0.45, 0.45]) { const b = mesh(new THREE.CylinderGeometry(BR + 0.012, BR + 0.012, 0.09, 20), toonMat("#1b1b24")); b.position.y = y; bag.add(b); }
  const chain = mesh(new THREE.CylinderGeometry(0.02, 0.02, top - bagC.y - 0.62, 6), toonMat("#8f97a6")); chain.position.y = -(top - bagC.y - 0.62) / 2; pivot.add(chain);
  cyl(root, 0.35, 0.05, "#2a2a32", bagC.x, 3.62 + 0.03, bagC.z, 0.01);
  // gloves on the hands
  for (const side of ["r", "l"] as const) {
    const gl = new THREE.Group(), m = mesh(new THREE.SphereGeometry(0.14, 16, 12), toonMat("#e02a2a", { emissive: "#c01010", emissiveIntensity: 0.25 }), 0, -0.01, 0.01); outline(m, 0.02); gl.add(m);
    const cuff = mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.07, 12), toonMat("#fafafa"), 0, 0.12, 0); gl.add(cuff);
    c.hero.hand(side).add(gl);
  }
  const hits = [0.28, 0.66, 1.02, 1.36, 1.7], ext = (t: number, i: number) => seg(t, hits[i] - 0.11, hits[i]) * (1 - seg(t, hits[i] + 0.02, hits[i] + 0.2));
  const front = bagC.clone().addScaledVector(f, -(BR + 0.13));
  const star = starAt(root), pw = popText(root, "POW!", [bagC.x - 1.0, 2.8, bagC.z + 0.5], 1.2, "#ff5a4a"), bm = popText(root, "BAM!", [bagC.x - 1.0, 2.8, bagC.z + 0.5], 1.2, "#ffe14a");
  return { tick(t) {
    pw(hits[1], t, hits[3] - 0.05); bm(hits[3], t, hits[3] + 0.6);
    { let hi = -1; hits.forEach((h, i) => { if (t >= h - 0.02) hi = i; }); if (hi >= 0) { const s = hi % 2 === 0 ? 1 : -1; star(hits[hi], t, front.clone().addScaledVector(n, s * -0.12).add(new Vec(0, 0.05, 0)), 0.5); } }
    // bag: each punch kicks the pendulum
    let a = 0; for (const h of hits) if (t > h) { const q = t - h; a += 0.3 * Math.exp(-2.6 * q) * Math.sin(6.5 * q); }
    pivot.quaternion.setFromAxisAngle(new Vec(-f.z, 0, f.x), a);
    // arms: guard up, alternate right / left
    const SY = shY(hero);
    for (const side of ["r", "l"] as const) {
      const idx = hits.map((_, i) => i).filter((i) => (i % 2 === 0) === (side === "r")), e = Math.max(0, ...idx.map((i) => ext(t, i)));
      const s = side === "r" ? 1 : -1, guard = new Vec(s * 0.15, SY - 0.1, 0.32);
      const hand = rigOf(hero).localToWorld(guard.clone());
      const tw = front.clone().addScaledVector(n, s * -0.12).add(new Vec(0, 0.0, 0));
      armW(hero, side, hand.lerp(tw, e), [s * 0.9, -0.8, -0.2]);
    }
    const hitNow = hits.some((h) => t > h - 0.1 && t < h + 0.14);
    return { pose: "dribble", t, expr: hitNow ? ("shout" as const) : exAt(t, [[0, "focus"], [hits[4] + 0.2, "grin"]]) };
  } };
} };

const sprint: ActDef = { pose: "run", view: "actc", build(c) {
  const { root, hero, heroAt: H } = c; hero.root.rotation.y = 0.8;
  const dash = new THREE.MeshBasicMaterial({ color: "#ffffff" }), N = 8, L = 1.3, SP = 2.9, V = 11;
  const dashes: THREE.Mesh[] = [];
  for (const z of [-1.5, 1.9]) for (let i = 0; i < N; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.012, 0.16), dash); m.position.set(0, 0.03, H[2] + z); root.add(m); dashes.push(m); }
  const rnd = seeded(c.seed * 7 + 3), lines: { m: THREE.Mesh; x: number; y: number; z: number; len: number; sp: number }[] = [];
  const lm = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75 });
  for (let i = 0; i < 14; i++) { const len = 1.2 + rnd() * 1.6, m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.03), lm); root.add(m); lines.push({ m, x: rnd() * 8, y: 0.3 + rnd() * 2.1, z: H[2] - 0.35 - rnd() * 2.2, len, sp: 14 + rnd() * 8 }); }
  const cones: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const m = mesh(new THREE.ConeGeometry(0.2, 0.5, 12), toonMat("#ff8a1a"), 0, 0.25, H[2] - 2.6); outline(m, 0.02); root.add(m); cones.push(m); }
  return { tick(t) {
    dashes.forEach((m, i) => { const k = i % N; m.position.x = H[0] + (((k * SP - V * t) % (N * SP)) + N * SP) % (N * SP) - N * SP / 2; });
    lines.forEach((l) => { const sx = (((l.x - l.sp * t) % 8) + 8) % 8; l.m.position.set(H[0] + sx - 3.4 - 0.8, l.y, l.z); l.m.visible = true; });
    cones.forEach((m, i) => { m.position.x = H[0] + ((((i * 3.4 - 6.5 * t) % 13.6) + 13.6) % 13.6) - 6.8; });
    hero.root.position.y = H[1];
    return { pose: "run", t, expr: exAt(t, [[0, "focus"], [0.35, "effort"], [1.2, "shout"], [1.6, "effort"]]) };
  } };
} };

const trophy_lift: ActDef = { pose: "cheer", view: "actc", build(c) {
  const { root, hero, heroAt: H } = c; hero.root.rotation.y = 0.45;
  const th = makeThing("trophy"), SC = 2.3; th.root.scale.setScalar(SC); root.add(th.root);
  const rnd = seeded(c.seed * 13 + 5), N = 90, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
  const cols = ["#ff4d6d", "#ffc21f", "#3ad1ff", "#7cff6b", "#ffffff", "#b06bff"];
  const seed = Array.from({ length: N }, () => ({ x: (rnd() - 0.5) * 4.2, z: (rnd() - 0.6) * 2.6, ph: rnd(), sp: 1.3 + rnd() * 1.0, rot: rnd() * 6, w: 4 + rnd() * 6, d: rnd() }));
  seed.forEach((s, i) => conf.setColorAt(i, new THREE.Color(cols[i % cols.length])));
  conf.frustumCulled = false; root.add(conf);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new Vec(), sc = new Vec();
  const pop = popText(root, "CHAMPION!", [H[0] - 0.5, H[1] + 3.1, H[2] + 0.3], 1.4, "#ffe14a");
  return { tick(t) {
    pop(0.8, t);
    const lift = seg(t, 0.0, 0.6), SY = shY(hero), HY = hero.headY;
    // hands: from the belly (cup held low) up over the head, a little shake at the top
    const wob = 0.02 * Math.sin(t * 9) * lift;
    // two hands at the belly, then the right hand carries the cup high at its side (face stays clear), the left fist pumps
    const yR = mix(SY - 0.45, HY + 0.75, lift) + wob, yL = mix(SY - 0.45, HY + 0.6, lift) - wob, z = mix(0.34, 0.22, lift);
    arm(hero, "r", mix(0.17, 0.62, lift), yR, z, [1.4, -0.3, -0.6]); arm(hero, "l", mix(0.17, 0.78, lift), yL, mix(0.34, 0.1, lift), [-1.4, -0.3, -0.6]);
    const mh = mid(wp(hero.hand("r")), wp(hero.hand("l"))).lerp(wp(hero.hand("r")), lift);
    th.root.position.set(mh.x, mh.y - 0.05, mh.z); th.root.rotation.y = Math.sin(t * 2.2) * 0.35 + 0.2;
    for (let i = 0; i < N; i++) {
      const s = seed[i], a = Math.max(0, t - 0.55 - s.d * 0.12);
      const y2 = 6.2 - ((a * s.sp + s.ph * 0) % 6.2);
      pos.set(H[0] + s.x + Math.sin(a * 2 + s.rot) * 0.25, a > 0 ? y2 : -9, H[2] + s.z); q.setFromEuler(new THREE.Euler(a * s.w + s.rot, a * s.w * 0.7, a * 3));
      sc.set(1, 1, 1); m.compose(pos, q, sc); conf.setMatrixAt(i, m);
    }
    conf.instanceMatrix.needsUpdate = true;
    return { pose: "cheer", t: t, expr: exAt(t, [[0, "focus"], [0.1, "effort"], [0.7, "shout"], [1.1, "laugh"]]) };
  } };
} };

export const SPORTS: Record<string, ActDef> = {
  dribble, shoot, dunk: rimMove("dunk"), layup: rimMove("layup"), block, pass, kick, punch, sprint, trophy_lift,
};
