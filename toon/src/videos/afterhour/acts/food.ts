// Afterhour acts, food (worker I): the hero REALLY eats: mouth opens wide before the food arrives, the food goes into the mouth
// (positioned from Char.mouth()), comes out with a bite missing, cheeks chew. Everything is a pure function of t (seconds into the shot).
// The arm motion is the "eat" pose with a warped clock (ActPose.t): hand low -> mouth -> hold -> low, so the food follows the real hand.
import * as THREE from "three";
import type { ActCtx, ActDef, ActPose } from "./types";
import type { Expr } from "../char";
import { toonMat, glowMat, outline, seeded, gradient } from "../common";

const V3 = THREE.Vector3;
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => c01((t - a) / (b - a));
const sm = (u: number) => u * u * (3 - 2 * u);
const X = (e: string) => e as Expr;
const INKM = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });

// ---------------------------------------------------------------- rig helpers
/** world position of a hand in ctx.root space */
const handPos = (ctx: ActCtx, side: "l" | "r") => {
  ctx.hero.root.updateWorldMatrix(true, true); ctx.root.updateWorldMatrix(true, false);
  return ctx.root.worldToLocal(ctx.hero.hand(side).getWorldPosition(new V3()));
};
/** mouth centre in ctx.root space (Char.mouth() when it exists, else an estimate) */
const mouthPos = (ctx: ActCtx) => {
  ctx.hero.root.updateWorldMatrix(true, true); ctx.root.updateWorldMatrix(true, false);
  const h = ctx.hero as unknown as { mouth?: () => THREE.Vector3 };
  const w = h.mouth ? h.mouth().clone() : ctx.hero.root.localToWorld(new V3(0, ctx.hero.headY - 0.14, 0.4));
  return ctx.root.worldToLocal(w);
};
/** pose the hero myself (so hand / mouth are current for this t); Ah poses it again with the returned expression */
/** arm clock u (0..0.9) -> the "think" pose clock: hand low at the chest (0) up to the chin (0.35) and back; food is raised from there to the lips */
const tauOf = (u: number) => 0.35 * c01(u <= 0.3 ? u / 0.3 : u <= 0.6 ? 1 : 1 - (u - 0.6) / 0.29);
const poseHero = (ctx: ActCtx, u: number, e: string) => ctx.hero.set(tauOf(u), "think", X(e));

/** the arm clock: a cycle = approach (hand low -> mouth), hold at the mouth, retract. Returns u for the "eat" pose (0..0.9). */
type Cyc = { t0: number; a: number; h: number; r: number };
const uOf = (t: number, cs: Cyc[]) => {
  let c: Cyc | undefined; for (const k of cs) if (t >= k.t0) c = k;
  if (!c) return 0;
  const x = t - c.t0;
  if (x < c.a) return 0.3 * sm(x / c.a);
  if (x < c.a + c.h) return 0.3 + 0.3 * ((x - c.a) / c.h);
  if (x < c.a + c.h + c.r) return 0.6 + 0.29 * sm((x - c.a - c.h) / c.r);
  return 0.89;
};
/** approach factor 0..1 of the cycle that is active at t (1 while the food is at the mouth) */
const kOf = (t: number, c: Cyc) => sm(seg(t, c.t0 + c.a * 0.25, c.t0 + c.a)) * (1 - sm(seg(t, c.t0 + c.a + c.h, c.t0 + c.a + c.h + c.r * 0.7)));
const chew = (t: number) => X(Math.floor(t * 7) % 2 ? "chew_b" : "chew_a");

/** basis with +Y along dir and the item's flat face (local +Z) towards the camera */
const axisQ = (dir: THREE.Vector3) => {
  const y = dir.clone().normalize(), face = new V3(0, 0, 1);
  const x = new V3().crossVectors(y, face); if (x.lengthSq() < 1e-4) x.set(1, 0, 0); x.normalize();
  const z = new V3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};
/** place an item whose +Y axis is `len` long: held in the hand pointing along `held`, or (k=1) with its far end at `target`, axis from the hand */
const place = (it: THREE.Object3D, hand: THREE.Vector3, held: THREE.Vector3, gripH: number, target: THREE.Vector3, len: number, k: number) => {
  const dA = target.clone().sub(hand).normalize(), dir = held.clone().lerp(dA, k).normalize();
  const oH = hand.clone().addScaledVector(held, -gripH), oA = target.clone().addScaledVector(dA, -len);
  it.position.copy(oH).lerp(oA, k); it.quaternion.copy(axisQ(dir));
  return dA;
};

// ---------------------------------------------------------------- mesh helpers
/** mesh with its geometry re-centred (so the outline hull is even), at x,y,z */
const mk = (geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, ow = 0.016, mat?: THREE.Material) => {
  geo.computeBoundingBox(); const c = new V3(); geo.boundingBox!.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
  const m = new THREE.Mesh(geo, mat ?? toonMat(color)); m.position.set(x + c.x, y + c.y, z + c.z); m.castShadow = true; m.receiveShadow = true;
  if (ow) outline(m, ow);
  return m;
};
const bx = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ow = 0.012) => mk(new THREE.BoxGeometry(w, h, d), color, x, y, z, ow);
const cyl = (rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, ow = 0.014, n = 20) => mk(new THREE.CylinderGeometry(rt, rb, h, n), color, x, y, z, ow);
const sph = (r: number, color: string, x = 0, y = 0, z = 0, ow = 0.014) => mk(new THREE.SphereGeometry(r, 18, 12), color, x, y, z, ow);

/** unit cylinder (radius 1, base at the origin, along +Y) used for strings / straws */
const UNIT = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 10); g.translate(0, 0.5, 0); return g; })();
type Link = { core: THREE.Mesh; ink: THREE.Mesh | null };
const makeLink = (G: THREE.Group, mat: THREE.Material, ink = false): Link => {
  const core = new THREE.Mesh(UNIT, mat); G.add(core);
  let i: THREE.Mesh | null = null; if (ink) { i = new THREE.Mesh(UNIT, INKM); G.add(i); }
  return { core, ink: i };
};
const setLink = (l: Link, a: THREE.Vector3, b: THREE.Vector3, rad: number, show = true, inkW = 0.007) => {
  l.core.visible = show; if (l.ink) l.ink.visible = show; if (!show) return;
  const d = b.clone().sub(a), len = Math.max(1e-4, d.length()), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.divideScalar(len));
  l.core.position.copy(a); l.core.quaternion.copy(q); l.core.scale.set(rad, len, rad);
  if (l.ink) { l.ink.position.copy(a).addScaledVector(d, -inkW / len * 0.5); l.ink.quaternion.copy(q); l.ink.scale.set(rad + inkW, len + inkW, rad + inkW); }
};

/** flat extruded triangle (apex +Y) optionally with a circular, scalloped bite taken out of the tip */
type Cut = { cx: number; cy: number; r: number };
const cutTri = (hw: number, y0: number, yT: number, depth: number, cut?: Cut) => {
  const s = new THREE.Shape(), B1 = [-hw, y0], B2 = [hw, y0], T = [0, yT];
  if (!cut) { s.moveTo(B1[0], B1[1]); s.lineTo(B2[0], B2[1]); s.lineTo(T[0], T[1]); s.closePath(); }
  else {
    const hit = (A: number[], B: number[]) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], fx = A[0] - cut.cx, fy = A[1] - cut.cy, a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - cut.r * cut.r, D = b * b - 4 * a * c;
      return D < 0 ? 1 : c01((-b - Math.sqrt(D)) / (2 * a));
    };
    const tl = hit(B1, T), tr = hit(B2, T), PL = [B1[0] + (T[0] - B1[0]) * tl, B1[1] + (T[1] - B1[1]) * tl], PR = [B2[0] + (T[0] - B2[0]) * tr, B2[1] + (T[1] - B2[1]) * tr];
    s.moveTo(B1[0], B1[1]); s.lineTo(B2[0], B2[1]); s.lineTo(PR[0], PR[1]);
    const aR = Math.atan2(PR[1] - cut.cy, PR[0] - cut.cx), aL = Math.atan2(PL[1] - cut.cy, PL[0] - cut.cx), N = 12;
    for (let i = 1; i <= N; i++) { const f = i / N, a = aR + (aL - aR) * f, rr = cut.r * (1 + 0.09 * Math.sin(f * Math.PI * 3)); s.lineTo(cut.cx + Math.cos(a) * rr, cut.cy + Math.sin(a) * rr); }
    s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2); return g;
};

/** burst of crumbs / sprinkles, a pure function of time */
const burst = (G: THREE.Group, n: number, cols: string[], seed: number, size = 0.03) => {
  const rnd = seeded(seed), ps = Array.from({ length: n }, (_, i) => ({ m: bx(size, size * 0.6, size * 0.6, cols[i % cols.length], 0, 0, 0, 0), v: new V3((rnd() - 0.5) * 0.7, 0.15 + rnd() * 0.4, (rnd() - 0.1) * 0.35), s: 4 + rnd() * 8 }));
  ps.forEach((p) => { p.m.visible = false; G.add(p.m); });
  return (t: number, tb: number, o: THREE.Vector3, life = 0.8) => ps.forEach((p) => {
    const a = t - tb; p.m.visible = a > 0 && a < life;
    if (p.m.visible) { p.m.position.set(o.x + p.v.x * a, o.y + p.v.y * a - 2.8 * a * a, o.z + p.v.z * a); p.m.rotation.set(a * p.s, a * p.s * 0.7, 0); }
  });
};
const sparkle = (r = 0.07) => {
  const g = new THREE.Group(), geo = new THREE.OctahedronGeometry(r);
  for (const a of [0, Math.PI / 2]) { const m = new THREE.Mesh(geo, glowMat("#bff4ff", 2.4)); m.scale.set(1, 0.3, 0.14); m.rotation.z = a; g.add(m); }
  return g;
};

/** common set-up: hero turned to 3/4 so the camera sees the food go into the mouth in profile */
const YAW = 0.5, SHIFT = -0.1;
const setup = (ctx: ActCtx) => {
  const G = new THREE.Group(); ctx.root.add(G);
  ctx.hero.root.rotation.y = YAW;
  ctx.hero.root.position.x += SHIFT;
  const base = ctx.hero.root.position.clone(), fwd = new V3(Math.sin(YAW), 0, Math.cos(YAW));
  poseHero(ctx, 0.45, "smile");
  const M0 = mouthPos(ctx), H0 = handPos(ctx, "r");
  return { G, base, fwd, M0, H0 };
};
const pkt = (ctx: ActCtx, u: number, e: string): ActPose => ({ pose: "think", t: tauOf(u), expr: X(e) });

// ================================================================= PIZZA
const pizza: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, fwd, M0 } = setup(ctx);
  const L = 0.42, HW = 0.17, CUT: Cut = { cx: 0, cy: L + 0.04, r: 0.16 };
  const item = new THREE.Group(); G.add(item);
  const crust = new THREE.Group(); item.add(crust);
  crust.add(mk(new THREE.CylinderGeometry(0.05, 0.05, HW * 2 + 0.04, 14).rotateZ(Math.PI / 2), "#cf8a3a", 0, 0.0, 0, 0.016));
  for (const s of [-1, 1]) crust.add(sph(0.05, "#cf8a3a", s * (HW + 0.02), 0, 0, 0.016));
  const PEP: [number, number][] = [[-0.06, 0.12], [0.07, 0.18], [-0.01, 0.27], [0.0, 0.37]];
  const mkState = (cut?: Cut) => {
    const g = new THREE.Group();
    g.add(mk(cutTri(HW, 0.02, L, 0.05, cut), "#e8a84e", 0, 0, 0, 0.014));
    const ch = cut ? { ...cut, r: cut.r + 0.025 } : undefined;
    const chz = mk(cutTri(HW - 0.03, 0.06, L - 0.05, 0.03, ch), "#ffc83d", 0, 0, 0.026, 0);
    g.add(chz);
    PEP.forEach(([x, y]) => { if (cut && Math.hypot(x - cut.cx, y - cut.cy) < cut.r + 0.03) return; const p = cyl(0.036, 0.036, 0.014, "#c9322b", x, y, 0.052, 0.008, 16); p.rotation.x = Math.PI / 2; g.add(p); });
    return g;
  };
  const full = mkState(), bit = mkState(CUT); item.add(full); item.add(bit);
  const CYC: Cyc[] = [{ t0: 0.1, a: 0.5, h: 0.22, r: 0.4 }], TC = CYC[0].t0 + CYC[0].a, TSW = TC + 0.16, TO = TC + 0.22, TSNAP = 1.12;
  const mat = toonMat("#ffd24a"), s1 = makeLink(G, mat), s2 = makeLink(G, mat), s3 = makeLink(G, mat);
  const held = new V3(-0.45, 0.85, 0.3).normalize(), A = new V3(), tmp = new V3(), PS = 1.3; item.scale.setScalar(PS);
  return { tick(t) {
    const u = uOf(t, CYC), k = kOf(t, CYC[0]);
    const e = t < TC - 0.2 ? "smile" : t < TSW ? "bite" : t < 1.85 ? chew(t) : t < 2.0 ? "gulp" : "yum";
    poseHero(ctx, u, e);
    const hand = handPos(ctx, "r"), mouth = mouthPos(ctx);
    const depth = 0.07 * sm(seg(t, TC - 0.06, TC + 0.06)) * (1 - sm(seg(t, TO - 0.04, TO + 0.08)));
    const target = mouth.clone().addScaledVector(fwd, -depth);
    place(item, hand, held, 0.05, target, L * PS, k);
    full.visible = t < TSW; bit.visible = t >= TSW;
    // cheese string: lip -> bite edge of the slice, stretches, thins, snaps, the slice end droops
    item.updateMatrix(); A.set(0, CUT.cy - CUT.r + 0.0, 0.03).applyMatrix4(item.matrix);
    const on = t > TO - 0.02 && t < TSNAP, lip = mouth.clone().addScaledVector(fwd, 0.04).add(new V3(0, -0.015, 0));
    const stretch = sm(seg(t, TO, TSNAP)), rad = 0.032 * (1 - 0.6 * stretch), sag = 0.05 * (1 - stretch);
    tmp.copy(A).lerp(lip, 0.5).add(new V3(0, -sag, 0));
    setLink(s1, A, tmp, rad, on); setLink(s2, tmp, lip, rad, on);
    const fall = sm(seg(t, TSNAP, TSNAP + 0.3)), drop = A.clone().add(new V3(0.005, -0.2 * (1 - 0.35 * fall), 0.0));
    setLink(s3, A, drop, 0.024 * (1 - 0.5 * fall), t >= TSNAP && t < TSNAP + 0.55);
    void M0;
    return pkt(ctx, u, e);
  } };
} };

// ================================================================= FRIES
const fries: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, fwd } = setup(ctx);
  const carton = new THREE.Group(); G.add(carton);
  carton.add(mk(new THREE.CylinderGeometry(0.19, 0.135, 0.3, 4, 1).rotateY(Math.PI / 4), "#d8302f", 0, 0, 0, 0.016));
  carton.add(bx(0.13, 0.12, 0.012, "#ffd23a", 0, 0.0, 0.118, 0.006));
  carton.add(bx(0.2, 0.025, 0.012, "#ffd23a", 0, 0.12, 0.128, 0.004));
  const FR: THREE.Mesh[] = [], rnd = seeded(ctx.seed + 7);
  for (let i = 0; i < 9; i++) {
    const f = bx(0.04, 0.2, 0.04, i % 3 ? "#f6c93a" : "#e9b22c", (i % 5 - 2) * 0.034, 0.2 + rnd() * 0.05, (i % 3 - 1) * 0.03, 0.007);
    f.rotation.set((rnd() - 0.5) * 0.35, rnd() * 3, (rnd() - 0.5) * 0.45); carton.add(f); FR.push(f);
  }
  const fry = bx(0.06, 0.26, 0.06, "#f6c93a", 0, 0, 0, 0.009); G.add(fry);
  const C1: Cyc = { t0: 0.25, a: 0.34, h: 0.12, r: 0.24 }, C2: Cyc = { t0: 1.0, a: 0.34, h: 0.12, r: 0.24 }, CYC = [C1, C2];
  const held = new V3(-0.15, 1, 0.1).normalize(), L = 0.26;
  return { tick(t) {
    const u = uOf(t, CYC), k1 = kOf(t, C1), k2 = kOf(t, C2), k = Math.max(k1, k2);
    const tc1 = C1.t0 + C1.a, tc2 = C2.t0 + C2.a;
    const open = (t > tc1 - 0.17 && t < tc1 + 0.1) || (t > tc2 - 0.17 && t < tc2 + 0.1);
    const e = open ? "bite" : t < 0.2 ? "smile" : t < 1.95 ? chew(t) : t < 2.1 ? "gulp" : "yum";
    poseHero(ctx, u, e);
    const hl = handPos(ctx, "l"), hr = handPos(ctx, "r"), mouth = mouthPos(ctx);
    carton.position.copy(hl).lerp(hr, 0.5).add(new V3(0.02, -0.46, 0.4)); carton.rotation.set(0.05, 0.3, 0.05); carton.scale.setScalar(1.3);
    FR.forEach((f, i) => { f.visible = !(i === 0 && t > 0.2) && !(i === 1 && t > 0.9); });
    // the fry: pulled out of the carton, raised to the lips, pushed in (hidden once the hand lets go)
    const mine = (c: Cyc, tp: number) => t >= tp && t < c.t0 + c.a + c.h * 0.9;
    const cur = mine(C2, 0.7) ? 2 : mine(C1, 0.0) ? 1 : 0, c = cur === 2 ? C2 : C1, tp = cur === 2 ? 0.7 : 0.0;
    fry.visible = cur > 0;
    if (cur > 0) {
      const kk = cur === 2 ? k2 : k1, tc = c.t0 + c.a;
      const depth = 0.1 * sm(seg(t, tc - 0.02, tc + 0.08)), target = mouth.clone().addScaledVector(fwd, -depth);
      const top = carton.position.clone().add(new V3(0, 0.45, 0)), rise = sm(seg(t, tp, tp + 0.22));
      place(fry, hr, held, 0.07, target, L, kk);
      fry.position.lerp(top.clone().addScaledVector(held, -0.05), 1 - rise); fry.scale.setScalar(1);
    }
    void k;
    return pkt(ctx, u, e);
  } };
} };

// ================================================================= ICE CREAM
const icecream: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, base, fwd, M0 } = setup(ctx);
  const item = new THREE.Group(); G.add(item);
  const CH = 0.3, SR = 0.13, SY = CH + 0.04, LEN = SY + SR;
  const cone = cyl(0.12, 0.012, CH, "#e0a85a", 0, CH / 2, 0, 0.014, 18); item.add(cone);
  for (const f of [0.3, 0.55, 0.8]) { const r = mk(new THREE.TorusGeometry(0.012 + 0.108 * f, 0.007, 6, 18).rotateX(Math.PI / 2), "#b87a32", 0, CH * f, 0, 0); item.add(r); }
  const lip = mk(new THREE.TorusGeometry(0.115, 0.032, 8, 22).rotateX(Math.PI / 2), "#ffd1e0", 0, CH + 0.005, 0, 0.012); item.add(lip);
  const scoopGeo = (dent: boolean) => {
    const g = new THREE.SphereGeometry(SR, 40, 28), p = g.attributes.position as THREE.BufferAttribute;
    if (dent) {
      const c = new V3(0.15, 0.55, 0.6).normalize().multiplyScalar(SR * 0.95), rd = 0.1, v = new V3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = v.distanceTo(c); if (d < rd) { v.copy(c).addScaledVector(v.clone().sub(c).normalize(), rd); p.setXYZ(i, v.x, v.y, v.z); } }
      g.computeVertexNormals();
    }
    return g;
  };
  const full = new THREE.Group(), bit = new THREE.Group();
  full.add(mk(scoopGeo(false), "#ff8fb8", 0, SY, 0, 0.016)); bit.add(mk(scoopGeo(true), "#ff8fb8", 0, SY, 0, 0.016));
  for (const gg of [full, bit]) for (const [x, y, z] of [[0.09, SY - 0.02, 0.09], [-0.07, SY + 0.04, 0.1]]) gg.add(sph(0.012, "#fff3a0", x, y, z, 0));
  item.add(full); item.add(bit);
  const drip = mk(new THREE.CapsuleGeometry(0.022, 0.07, 4, 8), "#ff8fb8", 0.1, CH + 0.0, 0.05, 0.008); item.add(drip);
  const C: Cyc = { t0: 0.1, a: 0.4, h: 0.84, r: 0.28 }, CYC = [C], TB = 1.2, TSW = TB + 0.06, TFRZ = 1.66, TLK = 0.5;
  const held = new V3(-0.1, 1, 0.2).normalize(), crumb = burst(G, 6, ["#ff8fb8", "#ffd1e0"], ctx.seed + 3, 0.03);
  const stars = [0, 1, 2, 3].map(() => { const s = sparkle(0.06); G.add(s); return s; });
  const side = new V3(Math.cos(YAW), 0, -Math.sin(YAW));
  return { tick(t) {
    const u = uOf(t, CYC), k = kOf(t, C), frz = sm(seg(t, TFRZ, TFRZ + 0.08)) * (1 - sm(seg(t, 2.28, 2.4)));
    ctx.hero.root.position.set(base.x + 0.016 * Math.sin(t * 62) * frz, base.y + 0.008 * Math.sin(t * 47 + 1) * frz, base.z);
    const lick = t >= TLK && t < TB - 0.18, p = ((t - TLK) / 0.28) % 1;
    const e = t < TLK - 0.12 ? "smile" : lick ? "yum" : t < TB - 0.18 ? "smile" : t < TSW + 0.04 ? "bite" : t < TFRZ - 0.02 ? chew(t) : "shock";
    poseHero(ctx, u, e);
    const hand = handPos(ctx, "r"), mouth = mouthPos(ctx);
    const lk = lick ? Math.sin(Math.PI * p) : 0;
    const depth = 0.075 * sm(seg(t, TB - 0.08, TB + 0.04)) * (1 - sm(seg(t, TB + 0.2, TB + 0.34))) - 0.02 * (lick ? 1 : 0) * (1 - lk);
    const target = mouth.clone().addScaledVector(fwd, -depth).addScaledVector(side, lick ? 0.045 * Math.sin(Math.PI * 2 * p) : 0).add(new V3(0, lick ? 0.02 * lk : 0, 0));
    place(item, hand, held, 0.15, target, LEN, k);
    full.visible = t < TSW; bit.visible = t >= TSW;
    crumb(t, TSW, M0.clone().add(new V3(0, -0.06, 0.05)), 0.7);
    stars.forEach((s, i) => { const a = i * 1.6 + 0.4; s.visible = frz > 0.5 && Math.sin(t * 31 + i * 2) > -0.4; s.position.set(M0.x + Math.cos(a) * 0.38, M0.y + 0.4 + Math.sin(a * 1.7) * 0.12, M0.z + Math.sin(a) * 0.25); s.rotation.z = t * 6 + i; });
    return pkt(ctx, u, e);
  } };
} };

// ================================================================= DONUT
const partTorus = (R: number, r: number, nu: number, nv: number, vHalf: (u: number) => number) => {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2, h = vHalf(u);
    for (let j = 0; j <= nv; j++) { const v = Math.PI / 2 + (j / nv - 0.5) * 2 * h; pos.push((R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)); }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
};
const donut: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, fwd, M0, H0 } = setup(ctx);
  const R = 0.165, TR = 0.075, RO = R + TR;
  const a0 = Math.atan2(M0.y - H0.y, M0.x - H0.x), DA = [a0, a0 + 0.95], DR = 0.115;
  const dentC = (a: number) => new V3(Math.cos(a) * (R + 0.06), Math.sin(a) * (R + 0.06), 0);
  const dents = DA.map((a) => ({ c: dentC(a), r: DR }));
  const dough = (n: number) => {
    const g = new THREE.TorusGeometry(R, TR, 16, 40), p = g.attributes.position as THREE.BufferAttribute, v = new V3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); for (let d = 0; d < n; d++) { const c = dents[d].c, q = v.distanceTo(c); if (q < dents[d].r) { v.copy(c).addScaledVector(v.clone().sub(c).normalize(), dents[d].r); p.setXYZ(i, v.x, v.y, v.z); } } }
    g.computeVertexNormals(); return g;
  };
  const glaze = (n: number) => {
    const g = partTorus(R, TR * 1.07, 44, 14, (u) => 1.22 + 0.2 * Math.sin(u * 7) + 0.1 * Math.sin(u * 13 + 1)), p = g.attributes.position as THREE.BufferAttribute, v = new V3(), ix = g.index!.array, keep: number[] = [];
    const inside = (i: number) => { v.fromBufferAttribute(p, i); for (let d = 0; d < n; d++) if (v.distanceTo(dents[d].c) < dents[d].r * 1.05) return true; return false; };
    for (let i = 0; i < ix.length; i += 3) if (!inside(ix[i]) && !inside(ix[i + 1]) && !inside(ix[i + 2])) keep.push(ix[i], ix[i + 1], ix[i + 2]);
    g.setIndex(keep); return g;
  };
  const item = new THREE.Group(); G.add(item);
  const SPK = ["#ff4d6d", "#4dd2ff", "#ffe14d", "#7dff6a", "#ffffff", "#b06bff"], rnd = seeded(ctx.seed + 9);
  const spr = Array.from({ length: 22 }, (_, i) => { const u = rnd() * Math.PI * 2, v = Math.PI / 2 + (rnd() - 0.5) * 1.5, rr = TR * 1.07 + 0.006;
    const m = bx(0.05, 0.016, 0.016, SPK[i % SPK.length], (R + rr * Math.cos(v)) * Math.cos(u), (R + rr * Math.cos(v)) * Math.sin(u), rr * Math.sin(v), 0);
    m.rotation.z = u + Math.PI / 2 + (rnd() - 0.5) * 2.5; return { m, p: m.position.clone() }; });
  spr.forEach((s) => item.add(s.m));
  const sts = [0, 1, 2].map((n) => { const g = new THREE.Group(); g.add(mk(dough(n), "#d99a4e", 0, 0, 0, 0.016)); g.add(mk(glaze(n), "#ff8fc0", 0, 0, 0, 0)); item.add(g); return g; });
  const C1: Cyc = { t0: 0.1, a: 0.4, h: 0.14, r: 0.26 }, C2: Cyc = { t0: 0.95, a: 0.34, h: 0.14, r: 0.28 }, CYC = [C1, C2];
  const TC1 = C1.t0 + C1.a, TC2 = C2.t0 + C2.a, TS1 = TC1 + 0.1, TS2 = TC2 + 0.1;
  const cr1 = burst(G, 10, SPK, ctx.seed + 4, 0.028), cr2 = burst(G, 10, SPK, ctx.seed + 5, 0.028);
  const rest = new V3(0.0, 0.02, 0.03);
  return { tick(t) {
    const u = uOf(t, CYC), k1 = kOf(t, C1), k2 = kOf(t, C2), st = t >= TS2 ? 2 : t >= TS1 ? 1 : 0;
    const open = (t > TC1 - 0.17 && t < TS1) || (t > TC2 - 0.17 && t < TS2);
    const e = open ? "bite" : t < 0.2 ? "smile" : t < 2.05 ? chew(t) : "yum";
    poseHero(ctx, u, e);
    const hand = handPos(ctx, "r"), mouth = mouthPos(ctx);
    const aim = (k: number, depthT: number, dA: number) => {
      const dir = mouth.clone().sub(hand).normalize(), depth = 0.06 * depthT, tgt = mouth.clone().addScaledVector(fwd, -depth);
      return { ctr: tgt.clone().addScaledVector(dir, -(RO - 0.01)), rot: Math.atan2(dir.y, dir.x) - dA, k };
    };
    const dep1 = sm(seg(t, TC1 - 0.05, TC1 + 0.05)) * (1 - sm(seg(t, TS1 + 0.02, TS1 + 0.14))), dep2 = sm(seg(t, TC2 - 0.05, TC2 + 0.05)) * (1 - sm(seg(t, TS2 + 0.02, TS2 + 0.14)));
    const A1 = aim(k1, dep1, DA[0]), A2 = aim(k2, dep2, DA[1]);
    const heldC = hand.clone().add(rest);
    const ctr = heldC.clone().lerp(A1.ctr, k1).lerp(A2.ctr, k2);
    let rot = 0; rot += (A1.rot - rot) * k1; rot += (A2.rot - rot) * k2;
    item.position.copy(ctr); item.rotation.set(0.22 * (1 - Math.max(k1, k2)), 0.18 * (1 - Math.max(k1, k2)) - 0.0, rot, "ZYX");
    sts.forEach((g, i) => { g.visible = i === st; });
    spr.forEach((s) => { let hide = false; for (let d = 0; d < st; d++) if (s.p.distanceTo(dents[d].c) < dents[d].r * 1.1) hide = true; s.m.visible = !hide; });
    const o = M0.clone().add(new V3(0, -0.05, 0.05));
    cr1(t, TS1, o, 0.75); cr2(t, TS2, o, 0.75);
    return pkt(ctx, u, e);
  } };
} };

// ================================================================= SODA
const soda: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, fwd } = setup(ctx);
  const item = new THREE.Group(); G.add(item);
  const CHALF = 0.15, CO = 0.0;
  item.add(cyl(0.125, 0.092, CHALF * 2, "#e53a3a", 0, CO, 0, 0.016, 24));
  item.add(cyl(0.113, 0.103, 0.1, "#fff4f0", 0, CO + 0.0, 0, 0.0, 24));
  item.add(cyl(0.128, 0.128, 0.035, "#2d2a35", 0, CO + CHALF + 0.017, 0, 0.012, 24));
  const dome = mk(new THREE.SphereGeometry(0.105, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), "#3a3642", 0, CO + CHALF + 0.035, 0, 0.012); item.add(dome);
  const logo = sph(0.04, "#ffd23a", 0, 0.0, 0.1, 0); logo.scale.set(1, 1, 0.25); item.add(logo);
  const P0L = new V3(0, CO + CHALF + 0.07, 0);
  const sm_ = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: gradient(), transparent: true, opacity: 0.5, depthWrite: false });
  const strawM = makeLink(G, sm_, true), liquid = makeLink(G, toonMat("#4a2412")), strawTop = makeLink(G, toonMat("#ff5a5a"), false);
  const bubbles = [0, 1, 2].map((i) => { const b = sph(0.014, "#fff1de", 0, 0, 0, 0); b.visible = false; G.add(b); return b; });
  const C: Cyc = { t0: 0.1, a: 0.5, h: 1.0, r: 0.4 }, CYC = [C], TC = C.t0 + C.a;
  const held = new V3(0.2, 1, 0.1).normalize(), A = new V3(), B = new V3();
  return { tick(t) {
    const u = uOf(t, CYC), k = kOf(t, C);
    const e = t < TC - 0.25 ? "smile" : t < 1.55 ? "sip" : t < 1.8 ? "gulp" : "yum";
    poseHero(ctx, u, e);
    const hand = handPos(ctx, "r"), mouth = mouthPos(ctx);
    item.position.copy(hand).add(new V3(0.0, -0.25, 0.0)); item.quaternion.identity(); item.rotation.set(0, -0.2, 0); item.scale.setScalar(1.25);
    item.updateMatrix(); A.copy(P0L).applyMatrix4(item.matrix);
    const lips = mouth.clone().addScaledVector(fwd, 0.04 * k);
    B.copy(A).addScaledVector(new V3(0.0, 0.26, 0.0), 1 - k).addScaledVector(lips.clone().sub(A), k);
    setLink(strawM, A, B, 0.04, true, 0.01);
    setLink(strawTop, A, A.clone().lerp(B, 0.18), 0.027, false);
    const lev = sm(seg(t, 0.75, 1.25)) * (1 - sm(seg(t, 1.45, 1.65))) * k;
    setLink(liquid, A, A.clone().lerp(B, Math.min(0.97, lev)), 0.028, lev > 0.01);
    bubbles.forEach((b, i) => { const p = ((t * 1.7 + i / 3) % 1) * lev; b.visible = lev > 0.1; b.position.copy(A).lerp(B, p).add(new V3(0.0, 0, 0.0)); });
    return pkt(ctx, u, e);
  } };
} };

// ================================================================= COOKIE (plain dark sandwich cookie, no branding)
const cookieShape = (R: number, dents: { c: V3; r: number }[]) => {
  const sh = new THREE.Shape(), N = 72;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th); let rr = R;
    for (const d of dents) { const b = dx * d.c.x + dy * d.c.y, disc = b * b - (d.c.x * d.c.x + d.c.y * d.c.y - d.r * d.r); if (disc > 0) { const t0 = b - Math.sqrt(disc); if (t0 > 0 && t0 < rr) rr = t0; } }
    if (i) sh.lineTo(dx * rr, dy * rr); else sh.moveTo(dx * rr, dy * rr);
  }
  sh.closePath(); return sh;
};
const cookie: ActDef = { pose: "think", view: "cu", build(ctx) {
  const { G, fwd, M0, H0 } = setup(ctx);
  const R = 0.19, RO = R + 0.02;
  const a0 = Math.atan2(M0.y - H0.y, M0.x - H0.x), DA = [a0, a0 + 0.95], DR = 0.095;
  const dents = DA.map((a) => ({ c: new V3(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0), r: DR }));
  const slab = (n: number, rad: number, z0: number, depth: number, col: string, ow: number) => {
    const g = new THREE.ExtrudeGeometry(cookieShape(rad, dents.slice(0, n)), { depth, bevelEnabled: false, curveSegments: 1 });
    return mk(g, col, 0, 0, z0, ow);
  };
  const item = new THREE.Group(); G.add(item);
  const DARK = "#3a2218", CREAM = "#fff3d6";
  const dots = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, rr = R * 0.72; return new V3(Math.cos(a) * rr, Math.sin(a) * rr, 0.052); });
  const dotM = dots.map((p) => { const m = mk(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8).rotateX(Math.PI / 2), "#241209", p.x, p.y, p.z, 0); item.add(m); return m; });
  const ring = mk(new THREE.TorusGeometry(R * 0.45, 0.008, 6, 28), "#241209", 0, 0, 0.052, 0); item.add(ring);
  const sts = [0, 1, 2].map((n) => { const g = new THREE.Group();
    g.add(slab(n, R, -0.05, 0.035, DARK, 0.014)); g.add(slab(n, R * 0.94, -0.015, 0.03, CREAM, 0)); g.add(slab(n, R, 0.015, 0.035, DARK, 0.014)); item.add(g); return g; });
  const C1: Cyc = { t0: 0.1, a: 0.4, h: 0.14, r: 0.26 }, C2: Cyc = { t0: 0.95, a: 0.34, h: 0.14, r: 0.28 }, CYC = [C1, C2];
  const TC1 = C1.t0 + C1.a, TC2 = C2.t0 + C2.a, TS1 = TC1 + 0.1, TS2 = TC2 + 0.1;
  const CR = ["#3a2218", "#241209", "#fff3d6", "#5a3524"];
  const cr1 = burst(G, 10, CR, ctx.seed + 4, 0.028), cr2 = burst(G, 10, CR, ctx.seed + 5, 0.028);
  const rest = new V3(0.0, 0.02, 0.03);
  return { tick(t0) {
    const t = t0 < 2.9 ? Math.max(0, t0) : t0 % 2.9;   // a new cookie every 2.9 s
    const u = uOf(t, CYC), k1 = kOf(t, C1), k2 = kOf(t, C2), st = t >= TS2 ? 2 : t >= TS1 ? 1 : 0;
    const open = (t > TC1 - 0.17 && t < TS1) || (t > TC2 - 0.17 && t < TS2);
    const e = open ? "bite" : t < 0.2 ? "smile" : t < 2.05 ? chew(t) : "yum";
    poseHero(ctx, u, e);
    const hand = handPos(ctx, "r"), mouth = mouthPos(ctx);
    const aim = (k: number, depthT: number, dA: number) => {
      const dir = mouth.clone().sub(hand).normalize(), depth = 0.06 * depthT, tgt = mouth.clone().addScaledVector(fwd, -depth);
      return { ctr: tgt.clone().addScaledVector(dir, -(RO - 0.01)), rot: Math.atan2(dir.y, dir.x) - dA, k };
    };
    const dep1 = sm(seg(t, TC1 - 0.05, TC1 + 0.05)) * (1 - sm(seg(t, TS1 + 0.02, TS1 + 0.14))), dep2 = sm(seg(t, TC2 - 0.05, TC2 + 0.05)) * (1 - sm(seg(t, TS2 + 0.02, TS2 + 0.14)));
    const A1 = aim(k1, dep1, DA[0]), A2 = aim(k2, dep2, DA[1]);
    const heldC = hand.clone().add(rest);
    item.position.copy(heldC.clone().lerp(A1.ctr, k1).lerp(A2.ctr, k2));
    let rot = 0; rot += (A1.rot - rot) * k1; rot += (A2.rot - rot) * k2;
    const kk = Math.max(k1, k2);
    item.rotation.set(0.3 * (1 - kk), 0.3 * (1 - kk), rot, "ZYX");
    sts.forEach((g, i) => { g.visible = i === st; });
    dotM.forEach((m, i) => { let hide = false; for (let d = 0; d < st; d++) if (dots[i].distanceTo(dents[d].c) < dents[d].r * 1.15) hide = true; m.visible = !hide; });
    ring.visible = st === 0;
    const o = M0.clone().add(new V3(0, -0.05, 0.05));
    cr1(t, TS1, o, 0.75); cr2(t, TS2, o, 0.75);
    return pkt(ctx, u, e);
  } };
} };

export const FOOD: Record<string, ActDef> = { eat_pizza: pizza, eat_fries: fries, eat_icecream: icecream, eat_donut: donut, eat_cookie: cookie, drink_soda: soda };
