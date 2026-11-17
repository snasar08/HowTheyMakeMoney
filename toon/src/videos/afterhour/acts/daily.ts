// Afterhour acts, daily life (worker C): the hero really eats / drinks / phones / types / counts / signs / drives / throws / presents / unboxes.
// Everything is a pure function of t (seconds into the shot) and ctx.seed. Props follow the real hand meshes via Char.hand().
import * as THREE from "three";
import type { ActCtx, ActDef } from "./types";
import type { Pose, Expr, Char } from "../char";
import { toonMat, glowMat, outline, seeded, canvasTex } from "../common";
import { makeThing } from "../things3d";

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => c01((t - a) / (b - a));
const sm = (u: number) => u * u * (3 - 2 * u);
const V3 = THREE.Vector3;

/** world position of a hand, expressed in ctx.root space */
const handPos = (ctx: ActCtx, side: "l" | "r", out = new V3()) => {
  ctx.hero.root.updateWorldMatrix(true, true); ctx.root.updateWorldMatrix(true, false);
  ctx.hero.hand(side).getWorldPosition(out);
  return ctx.root.worldToLocal(out);
};
/** apply the pose myself first so hand positions are never a frame late (Ah sets it again with the real expression) */
const setPose = (ctx: ActCtx, t: number, p: Pose, e: Expr = "smile") => { ctx.hero.set(t, p, e); return p; };

const mesh = (geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, ow = 0.02) => {
  const m = new THREE.Mesh(geo, toonMat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (ow) outline(m, ow);
  return m;
};
const bx = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ow = 0.02) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, ow);
const cyl = (r: number, h: number, color: string, x = 0, y = 0, z = 0, ow = 0.02, n = 20) => mesh(new THREE.CylinderGeometry(r, r, h, n), color, x, y, z, ow);
const sph = (r: number, color: string, x = 0, y = 0, z = 0, ow = 0.015) => mesh(new THREE.SphereGeometry(r, 14, 10), color, x, y, z, ow);

/** a code-built thing scaled to height h, pivot in its middle; move/rotate `g`, scale `inner` */
const prop = (name: string, h: number, opts: { color?: string; text?: string } = {}) => {
  const th = makeThing(name, opts), s = h / th.size, g = new THREE.Group(), inner = new THREE.Group();
  th.root.scale.setScalar(s); th.root.position.y = -h / 2; inner.add(th.root); g.add(inner);
  return { g, inner, th };
};
const bill = (k = 1) => {
  const g = new THREE.Group();
  g.add(bx(0.34, 0.012, 0.17, "#3fae5e", 0, 0, 0, 0.012)); g.add(bx(0.24, 0.015, 0.1, "#a8e8b6", 0, 0, 0, 0)); g.add(cyl(0.035, 0.018, "#3fae5e", 0, 0, 0, 0, 12));
  g.scale.setScalar(k); return g;
};
const star = (r = 0.1) => {
  const g = new THREE.Group(), geo = new THREE.OctahedronGeometry(r);
  for (const a of [0, Math.PI / 2]) { const m = new THREE.Mesh(geo, glowMat("#fff1a0", 2.4)); m.scale.set(1, 0.3, 0.12); m.rotation.z = a; g.add(m); }
  return g;
};
const heroAt = (ctx: ActCtx) => ctx.hero.root.position.clone();

// ---------------------------------------------------------------- eating helpers (worker H)
const INKM = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
/** a flat layer: a disc of radius r whose edge is eaten away by the bite circles (centre distance d, radius br, angle a) */
const layerShape = (r: number, br: number, d: number, angles: number[]) => {
  const sh = new THREE.Shape(), N = 120;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th); let rr = r;
    for (const a of angles) {   // ray / bite-circle entry distance
      const cx = d * Math.cos(a), cz = d * Math.sin(a), b = dx * cx + dz * cz, disc = b * b - (cx * cx + cz * cz - br * br);
      if (disc > 0) { const t0 = b - Math.sqrt(disc); if (t0 > 0 && t0 < rr) rr = t0; }
    }
    const x = dx * rr, y = -dz * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  sh.closePath(); return sh;
};
/** a cel burger centred on y = 0 (stack axis = y), with 0..n bites taken out of its edge */
const makeBurger = (R: number, br: number, d: number, angles: number[]) => {
  const g = new THREE.Group(), y0 = -0.09;
  const layers: [number, number, number, string, number][] = [   // y, height, radius scale, colour, inked edge
    [0, 0.036, 1.0, "#e3a04a", 0.012], [0.036, 0.04, 0.97, "#6b3519", 0.01], [0.076, 0.014, 1.1, "#ffcf2b", 0.008], [0.09, 0.015, 1.12, "#58c24a", 0.008],
    [0.105, 0.02, 0.98, "#e33b2e", 0.008], [0.125, 0.038, 1.0, "#e3a04a", 0.012], [0.163, 0.03, 0.84, "#eeae5c", 0.01],
  ];
  for (const [y, h, sc, col, ow] of layers) {
    const geo = new THREE.ExtrudeGeometry(layerShape(R * sc, br, d, angles), { depth: h, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, toonMat(col)); m.position.y = y0 + y + h / 2; m.castShadow = true; m.receiveShadow = true;
    const ink = new THREE.Mesh(geo, INKM); ink.scale.set(1 + ow / (R * sc), 1 + (ow * 2) / h, 1 + ow / (R * sc)); m.add(ink);
    g.add(m);
  }
  const rnd = seeded(5);   // sesame seeds only where the bun is still there
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, rr = 0.1 * R + rnd() * 0.62 * R, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (angles.some((an) => Math.hypot(x - d * Math.cos(an), z - d * Math.sin(an)) < br + 0.012)) continue;
    const s = mesh(new THREE.SphereGeometry(0.009, 6, 4), "#fff3cf", x, y0 + 0.193, z, 0); s.scale.set(1.2, 0.5, 0.8); s.rotation.y = a; g.add(s);
  }
  return g;
};
/** the hero's head object (the rig child at head height) */
const findHead = (hero: Char): THREE.Object3D | undefined => {
  const rig = hero.root.children[0]; return rig?.children.find((o) => Math.abs(o.position.y - hero.headY) < 0.06 && o.children.length >= 2);
};
/** mouth centre in ctx.root space (Char.mouth() when it exists, else a guess from the head) */
const mouthRoot = (ctx: ActCtx, head?: THREE.Object3D) => {
  ctx.hero.root.updateWorldMatrix(true, true); ctx.root.updateWorldMatrix(true, false);
  const hm = (ctx.hero as unknown as { mouth?: () => THREE.Vector3 }).mouth;
  const w = hm ? hm.call(ctx.hero).clone() : head ? head.localToWorld(new V3(0, -0.12, 0.42)) : ctx.hero.root.localToWorld(new V3(0, ctx.hero.headY - 0.12, 0.42));
  return ctx.root.worldToLocal(w);
};
// arm IK (copy of sports.ts)
const DOWN = new V3(0, -1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function ik(c: Char, side: "l" | "r", tgt: THREE.Vector3, pole: [number, number, number]) {
  const hand = c.hand(side), el = hand.parent!, sh = el.parent!;
  const L1 = el.position.length(), L2 = hand.position.length(), P = sh.position;
  const v = tgt.clone().sub(P); let D = v.length(); D = Math.min(Math.max(D, 0.12), L1 + L2 - 0.004);
  const dir = v.normalize(), pl = new V3(...pole);
  const aa = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
  const perp = pl.clone().addScaledVector(dir, -pl.dot(dir)).normalize();
  const E = P.clone().addScaledVector(dir, aa).addScaledVector(perp, h);
  sh.quaternion.setFromUnitVectors(DOWN, E.clone().sub(P).normalize());
  const hp = P.clone().addScaledVector(dir, D);
  _q.copy(sh.quaternion).invert(); _q2.setFromUnitVectors(DOWN, hp.sub(E).normalize());
  el.quaternion.copy(_q.multiply(_q2));
}
/** hand to a world point */
const armW = (c: Char, side: "l" | "r", p: THREE.Vector3, pole: [number, number, number]) => {
  const rig = c.root.children[0]; c.root.updateMatrixWorld(true); ik(c, side, rig.worldToLocal(p.clone()), pole);
};

// ---------------------------------------------------------------- cash helpers (count_cash / sign_contract / throw_cash)
let BILLTEX: THREE.Texture | null = null;
const billTex = () => BILLTEX ?? (BILLTEX = canvasTex(256, 128, (g) => {
  g.fillStyle = "#35a456"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#c4f3cc"; g.fillRect(9, 9, 238, 110);
  g.strokeStyle = "#2a8a48"; g.lineWidth = 6; g.strokeRect(15, 15, 226, 98);
  g.fillStyle = "#35a456"; g.beginPath(); g.arc(128, 64, 40, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#f4ffe8"; g.font = "bold 66px Arial Black, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", 128, 70);
  g.fillStyle = "#2a8a48"; g.font = "bold 28px Arial"; g.fillText("100", 44, 34); g.fillText("100", 212, 96);
}));
/** a big readable bill: green slab + $ face on both sides, lying flat (face up +y), w wide */
const fatBill = (w = 0.44) => {
  const g = new THREE.Group(), h = w / 2;
  g.add(bx(w, 0.014, h, "#35a456", 0, 0, 0, 0.012));
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), toonMat("#ffffff", { map: billTex() }));
    p.rotation.x = -s * Math.PI / 2; p.position.y = s * 0.0075; g.add(p);
  }
  return g;
};
const wrap = (a: number) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const flashTex = (txt: string, col: string, w = 384, h = 160, size = 96) => canvasTex(w, h, (g) => {
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 ${size}px Arial Black, Arial, sans-serif`; g.lineJoin = "round";
  g.lineWidth = 22; g.strokeStyle = "#151018"; g.strokeText(txt, w / 2, h / 2 + 4); g.fillStyle = col; g.fillText(txt, w / 2, h / 2 + 4);
});
const flashPlane = (tex: THREE.Texture, w: number, h: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.renderOrder = 5; return m;
};
const flickBob = (head: THREE.Object3D | undefined, k: number, amp = 0.1) => { if (head) { head.rotation.x += amp * k; head.position.y -= 0.02 * k; } };

const DAILY_DEFS: Record<string, ActDef> = {
  // ------------------------------------------------------------------ eat (worker H): real bites, chewing, a bitten burger
  eat: { pose: "stand", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const R = 0.17, BR = 0.5 * R, BD = 0.98 * R, A1 = 0.7, A2 = A1 + 1.2;   // burger radius, bite circle radius / centre distance, bite angles
    const states = [[], [A1], [A1, A2]].map((al) => makeBurger(R, BR, BD, al));
    const tilt = new THREE.Group(), spin = new THREE.Group(); G.add(tilt); tilt.add(spin); states.forEach((s) => spin.add(s));
    const rnd = seeded(ctx.seed + 11), crumbs: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
    const cc = ["#e8b25c", "#fff3cf", "#7a4a2a", "#e8b25c", "#58c24a", "#e33b2e"];
    for (let i = 0; i < 16; i++) { const m = bx(0.03, 0.03, 0.03, cc[i % cc.length], 0, 0, 0, 0); m.visible = false; G.add(m); crumbs.push({ m, v: new V3((rnd() - 0.5) * 0.3, rnd() * 0.5 + 0.1, (rnd() - 0.2) * 0.3) }); }
    const head = findHead(ctx.hero);
    const T = { c1: 0.3, s1: 0.36, o1: 0.44, e1: 0.64, r2: 0.95, c2: 1.25, s2: 1.31, o2: 1.39, e2: 1.6, gulp: 2.08, yum: 2.28 }, LOOP = 3.2;
    const chewE = (t: number, a: number, b: number) => (b - t < 0.1 ? "chew_a" : Math.floor((t - a) * 12) % 2 ? "chew_b" : "chew_a");
    const exprAt = (t: number): string => {
      if (t < T.c1 - 0.15) return "smile";
      if (t < T.o1 + 0.02) return "bite";
      if (t < T.r2 + 0.13) return chewE(t, T.o1 + 0.02, T.r2 + 0.13);
      if (t < T.o2 + 0.02) return "bite";
      if (t < T.gulp) return chewE(t, T.o2 + 0.02, T.gulp);
      if (t < T.yum) return "gulp";
      return "yum";
    };
    return { tick(t) {
      const tt = t < LOOP ? Math.max(0, t) : t % LOOP, hero = ctx.hero, expr = exprAt(tt) as Expr;
      hero.set(t, "stand", expr);
      // lean the head into the bite, nod while chewing
      const lean = Math.max(sm(seg(tt, T.c1 - 0.2, T.c1)) * (1 - sm(seg(tt, T.o1, T.e1))), sm(seg(tt, T.c2 - 0.2, T.c2)) * (1 - sm(seg(tt, T.o2, T.e2))));
      const chewing = (tt > T.e1 - 0.1 && tt < T.r2) || (tt > T.e2 - 0.1 && tt < T.gulp) ? 1 : 0;
      if (head) { head.rotation.x += 0.1 * lean + chewing * 0.035 * Math.sin(tt * 37); head.position.y -= chewing * 0.012 * Math.abs(Math.sin(tt * 18.8)); head.rotation.z += 0.06 * lean; }
      const M = mouthRoot(ctx, head);
      const w1 = sm(seg(tt, 0, T.c1)) * (1 - sm(seg(tt, T.o1, T.e1))), w2 = sm(seg(tt, T.r2, T.c2)) * (1 - sm(seg(tt, T.o2, T.e2)));
      const w = Math.max(w1, w2), L = sm(seg(tt, T.o1, T.e1)) * (1 - sm(seg(tt, T.r2, T.c2))) + sm(seg(tt, T.o2, T.e2));
      const chest = new V3(M.x + 0.02, M.y - 0.52, M.z + 0.1), low = new V3(M.x - 0.02, M.y - 0.4, M.z + 0.17);
      const base = chest.clone().lerp(low, L); base.y += chewing * 0.012 * Math.sin(tt * 37);
      // tilted up towards the camera at the mouth, flatter when held low; the notch faces the mouth (tilt-space -x)
      tilt.rotation.set(0.5 * w + 0.32 * (1 - w), 0, -0.75 * w); spin.rotation.y = (A1 - Math.PI) + 1.2 * sm(seg(tt, T.e1, T.r2 - 0.05));
      tilt.position.set(0, 0, 0); tilt.updateMatrixWorld(true);
      const pen = 0.075, edge = new V3(-(R - pen), 0, 0).applyQuaternion(tilt.quaternion);   // a point inside the burger edge goes into the open mouth
      const atMouth = M.clone().add(new V3(0, -0.01, 0.02)).sub(edge);
      tilt.position.copy(base.clone().lerp(atMouth, w));
      states.forEach((s, i) => { s.visible = i === (tt >= T.s2 ? 2 : tt >= T.s1 ? 1 : 0); });
      G.updateMatrixWorld(true);
      // both hands under / beside the burger
      const hw = [new V3(0.1, -0.1, 0.15), new V3(0.1, -0.1, -0.15)].map((p) => tilt.localToWorld(p.clone()));
      const rig = hero.root.children[0], ri = rig.worldToLocal(hw[0].clone()).x >= rig.worldToLocal(hw[1].clone()).x ? 0 : 1;
      armW(hero, "r", hw[ri], [0.9, -0.8, -0.3]); armW(hero, "l", hw[1 - ri], [-0.9, -0.8, -0.3]);
      // crumbs: sesame / bun / lettuce bits fall from each bite
      const bt = [T.s1, T.s2];
      crumbs.forEach((c, i) => {
        const ta = tt - bt[i % 2] - 0.03 - (i >> 1) * 0.012, org = M.clone().add(new V3(0.02, -0.06, 0.05));
        c.m.visible = ta > 0 && ta < 0.75;
        if (c.m.visible) { c.m.position.set(org.x + c.v.x * ta + 0.04, org.y + c.v.y * ta * 0.5 - 2.4 * ta * ta, org.z + c.v.z * ta + 0.06); c.m.rotation.set(ta * 9 + i, ta * 7, 0); c.m.scale.setScalar(1 - 0.5 * seg(ta, 0.4, 0.75)); }
      });
      return { pose: "stand" as const, expr };
    } };
  } },
  // ------------------------------------------------------------------ drink (worker H): the cup is at the lips, tilts, a gulp, then "ahh"
  drink: { pose: "stand", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const H = 0.25, RT = 0.1, RB = 0.075, tilt = new THREE.Group(); G.add(tilt);
    const side = (c: string) => { const m = (toonMat(c) as THREE.MeshToonMaterial).clone(); m.side = THREE.DoubleSide; return m; };
    const prof = [[0.001, -H / 2], [RB, -H / 2], [RT, H / 2], [RT - 0.012, H / 2], [RB - 0.012, -H / 2 + 0.012], [0.001, -H / 2 + 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), side("#d9412f")); body.castShadow = true; tilt.add(body);
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(RT + 0.014, RB + 0.014, H + 0.03, 28), INKM); tilt.add(ink);
    const slv = new THREE.Mesh(new THREE.CylinderGeometry(RT - 0.025, RB + 0.012, H * 0.4, 28, 1, true), side("#f6e8cf")); slv.position.y = -0.01; tilt.add(slv);
    const cof = new THREE.Mesh(new THREE.CylinderGeometry(RT - 0.014, RT - 0.014, 0.01, 28), toonMat("#5a3016")); cof.position.y = H / 2 - 0.04; tilt.add(cof);
    const steam: THREE.Mesh[] = []; for (let i = 0; i < 3; i++) { const m = sph(0.03, "#ffffff", 0, 0, 0, 0); G.add(m); steam.push(m); }
    const head = findHead(ctx.hero);
    const T = { raise: 0.5, sip0: 0.35, dip: 0.55, dip1: 0.95, away: 1.1, gulp0: 1.1, gulp1: 1.4, awayE: 1.45 }, LOOP = 2.6;
    const exprAt = (t: number): string => (t < T.sip0 ? "smile" : t < T.away ? "sip" : t < T.gulp1 ? "gulp" : "yum");
    return { tick(t) {
      const tt = t < LOOP ? Math.max(0, t) : t % LOOP, hero = ctx.hero, expr = exprAt(tt) as Expr;
      hero.set(t, "stand", expr);
      const w = sm(seg(tt, 0, T.raise)) * (1 - sm(seg(tt, T.away, T.awayE)));
      const lean = sm(seg(tt, 0.3, T.raise)) * (1 - sm(seg(tt, T.away, T.awayE))), gulpy = sm(seg(tt, T.gulp0, T.gulp1)) * (1 - sm(seg(tt, T.gulp1, T.gulp1 + 0.15)));
      if (head) { head.rotation.x += -0.1 * lean * sm(seg(tt, T.dip, T.dip1)) + 0.05 * gulpy; head.position.y += 0.012 * gulpy; }
      const M = mouthRoot(ctx, head);
      const chest = new V3(M.x + 0.06, M.y - 0.5, M.z + 0.1);
      const th = 0.25 + 0.75 * sm(seg(tt, T.dip, T.dip1)) - 0.5 * sm(seg(tt, T.dip1, T.away));
      tilt.rotation.set(0.15 * w, 0, th * w);
      const rim = new V3(-RT + 0.012, H / 2, 0).applyQuaternion(tilt.quaternion);
      const atMouth = M.clone().add(new V3(0.01, -0.02, 0.05)).sub(rim);
      tilt.position.copy(chest.clone().lerp(atMouth, w));
      G.updateMatrixWorld(true);
      armW(hero, "r", tilt.localToWorld(new V3(RB + 0.05, -0.04, 0.03)), [0.9, -0.8, -0.3]);
      armW(hero, "l", ctx.root.localToWorld(new V3(M.x - 0.3, M.y - 0.62, M.z + 0.06)), [-0.9, -0.8, -0.3]);
      steam.forEach((m, i) => { const p = ((tt * 0.7 + i * 0.33) % 1); m.position.copy(tilt.localToWorld(new V3(Math.sin(p * 6 + i) * 0.03, H / 2 + 0.05 + p * 0.25, 0))); m.scale.setScalar((1 - p) * (1 - w) + 0.001); });
      return { pose: "stand" as const, expr };
    } };
  } },
  // ------------------------------------------------------------------ phone_call: ring -> talking mouth (open/closed) -> laugh at the deal
  phone_call: { pose: "phone", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    ctx.hero.root.position.x -= 0.22;
    const ph = new THREE.Group(); G.add(ph);
    ph.add(bx(0.24, 0.42, 0.05, "#ffd23a", 0, 0, 0, 0.02));
    for (const sz of [1, -1]) {   // a bright screen on both faces so it reads from any angle
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.34), new THREE.MeshBasicMaterial({ color: "#a8ecff", toneMapped: false })); s.position.z = 0.027 * sz; if (sz < 0) s.rotation.y = Math.PI; ph.add(s);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: "#2fc25b", toneMapped: false })); d.position.set(0, -0.06, 0.03 * sz); if (sz < 0) d.rotation.y = Math.PI; ph.add(d);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.03), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })); b.position.set(0, 0.1, 0.03 * sz); if (sz < 0) b.rotation.y = Math.PI; ph.add(b);
    }
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 28, Math.PI * 0.8), glowMat("#7fe8ff", 2)); G.add(m); rings.push(m); }
    const bub = (() => { const W = 256, Hh = 128; const tex = canvasTex(W, Hh, (g) => { g.fillStyle = "#0d3b1e"; g.fillRect(0, 0, W, Hh); g.fillStyle = "#7dff9a"; g.font = '900 78px "Arial Black", Arial'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("DEAL!", W / 2, Hh / 2 + 4); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })); m.visible = false; m.renderOrder = 6; G.add(m); return m; })();
    return { tick(t) {
      const e: Expr = t < 0.3 ? "smile" : t < 1.5 ? (Math.floor(t * 7) % 2 ? "smile" : "grin") : "laugh";
      setPose(ctx, t, "phone", e);
      const h = handPos(ctx, "r");
      ph.position.set(h.x + 0.02, h.y + 0.04, h.z + 0.02); ph.rotation.set(0, -Math.PI / 2 + 1.0, 0.12);
      rings.forEach((m, i) => { const p = ((t * 0.9 + i / 3) % 1); m.position.set(h.x + 0.14 + p * 0.06, h.y + 0.26 + p * 0.04, h.z + 0.3); m.scale.setScalar(0.4 + p * 1.2); m.rotation.z = -0.35; m.visible = p < 0.9 && t < 1.5; });
      const a = t - 1.5; bub.visible = a > 0; bub.position.set(h.x - 0.1, h.y + 0.72 + 0.05 * Math.sin(t * 6), h.z + 0.3); bub.scale.setScalar(a > 0 ? Math.min(1, a / 0.2) : 0.001);
      return { pose: "phone", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ type_laptop: 3/4 laptop whose back glows with code (we see the glow), both hands tap its keys, face stays visible
  type_laptop: { pose: "type", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    ctx.hero.root.rotation.y = 0.45; ctx.hero.root.position.x -= 0.3;
    const hp0 = heroAt(ctx), f = new V3(Math.sin(0.45), 0, Math.cos(0.45)), YAW = 0.9, LS = 1.3, baseTop = 0.95;
    const K = new V3(hp0.x + f.x * 0.55, baseTop, hp0.z + f.z * 0.55);
    const desk = new THREE.Group(); desk.position.set(K.x, 0, K.z); G.add(desk);
    desk.add(bx(1.5, 0.07, 0.9, "#a9743f", 0, baseTop - 0.035, 0, 0.02));
    for (const sx of [-0.68, 0.68]) for (const sz of [-0.38, 0.38]) desk.add(bx(0.07, baseTop - 0.07, 0.07, "#6e4a28", sx, (baseTop - 0.07) / 2, sz, 0.01));
    const lap = new THREE.Group(); lap.rotation.y = YAW; lap.scale.setScalar(LS); G.add(lap);
    lap.position.copy(K).sub(new V3(0, 0, -0.04 * LS).applyAxisAngle(new V3(0, 1, 0), YAW));
    lap.add(bx(0.6, 0.045, 0.42, "#c9ced8", 0, 0.022, 0, 0.012)); lap.add(bx(0.5, 0.012, 0.28, "#2a2f3a", 0, 0.048, -0.04, 0));
    for (let r = 0; r < 3; r++) for (let q = 0; q < 8; q++) lap.add(bx(0.045, 0.012, 0.05, "#e8edf7", -0.21 + q * 0.06, 0.058, -0.12 + r * 0.075, 0));
    const lid = new THREE.Group(); lid.position.set(0, 0.04, 0.21); lid.rotation.x = 1.3; lap.add(lid);
    lid.add(bx(0.6, 0.03, 0.34, "#c9ced8", 0, 0, -0.17, 0.012));
    const W = 512, Hh = 1024;
    const tex = canvasTex(W, Hh, (g) => {
      g.fillStyle = "#0b1626"; g.fillRect(0, 0, W, Hh); const r = seeded(ctx.seed + 5), cols = ["#5be37d", "#59c8ff", "#ff7ad9", "#ffd45a", "#e8f1ff"];
      for (let i = 0; i < 28; i++) {
        const ind = Math.floor(r() * 3) * 36, len = 60 + r() * 280; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(24 + ind, 12 + i * 36, len, 20);
        if (r() > 0.5) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(24 + ind + len + 14, 12 + i * 36, 40 + r() * 80, 20); }
      }
    });
    tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 0.3);
    // the lid's outer face glows with the code (the "screen" we see); the inner face shows the same
    for (const sgn of [1, -1]) { const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 0.0165 * sgn, -0.17); scr.rotation.x = -Math.PI / 2 * sgn; lid.add(scr); }
    const glow = new THREE.PointLight("#8fd8ff", 0.3, 2.4); glow.position.set(K.x + 0.2, baseTop + 0.5, K.z + 0.4); G.add(glow);
    G.updateWorldMatrix(true, true);
    const sideOf = (p: THREE.Vector3): "l" | "r" => { ctx.hero.root.updateMatrixWorld(true); return ctx.hero.root.children[0].worldToLocal(p.clone()).x >= 0 ? "r" : "l"; };
    ctx.hero.set(0, "stand", "focus"); const head = findHead(ctx.hero);
    return { tick(t) {
      tex.offset.y = -(t * 0.3) % 1; glow.intensity = 0.3 + Math.sin(t * 9) * 0.05;
      const e: Expr = t < 1.7 ? "focus" : "smug"; setPose(ctx, t, "type", e);
      if (head) { head.rotation.x -= 0.55; head.rotation.y -= 0.15; }   // the typing pose looks down: lift the face so it shows under the cap
      const kk = [new V3(-0.12, 0.075, -0.02), new V3(0.04, 0.075, -0.1)];
      kk.forEach((lp, i) => {
        const bob = 0.025 * Math.max(0, Math.sin(t * 14 + i * 2.4));
        const w = lap.localToWorld(lp.clone()); w.y += 0.04 + bob; ctx.root.worldToLocal(w);
        const s = sideOf(w); armW(ctx.hero, s, w, [s === "r" ? 0.9 : -0.9, -0.8, -0.3]);
      });
      return { pose: "type", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ count_cash: a fat banded stack held big at chest height; the right thumb flicks bills off one by one
  // out to the side in an arc (never across the face), a $ counter pops per flick, the stack shrinks, the pile grows; focus -> grin -> smug "cha-ching"
  count_cash: { pose: "count", view: "cu", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const NL = 18, LT = 0.03, NF = 14, T0 = 0.35, DT = 0.15, DUR = 1.05, GR = 5, TH = 0.95, BW = 0.56;
    const head = findHead(ctx.hero), H = heroAt(ctx), rnd = seeded(ctx.seed + 3);
    const stackG = new THREE.Group(), tilt = new THREE.Group(); G.add(stackG); stackG.add(tilt); tilt.rotation.x = TH;
    const layers: THREE.Mesh[] = [];
    for (let i = 0; i < NL; i++) { const m = bx(BW, LT * 0.94, BW / 2, i % 2 ? "#2f9a4e" : "#43b862", 0, (i + 0.5) * LT, 0, 0.012); tilt.add(m); layers.push(m); }
    const topP = new THREE.Mesh(new THREE.PlaneGeometry(BW * 0.97, BW / 2 * 0.94), toonMat("#ffffff", { map: billTex() })); topP.rotation.x = -Math.PI / 2; tilt.add(topP);
    const band = bx(0.09, 1, BW / 2 + 0.025, "#f2d36b", -0.17, 0.5, 0, 0.01); tilt.add(band);
    const fl: { g: THREE.Group; v0: number; vx: number; vz: number; sp: number; ph: number; e: THREE.Vector3 }[] = [];
    for (let i = 0; i < NF; i++) {
      const g = fatBill(0.5); G.add(g);
      fl.push({ g, v0: 0, vx: 0, vz: 0, sp: 6 + rnd() * 5, ph: rnd() * 6.28, e: new V3(H.x + 0.62 + 0.2 * Math.sin(i * 2.3) + 0.12 * rnd(), H.y + 0.025 + Math.floor(i / 3) * 0.016, H.z + 0.45 + 0.13 * Math.cos(i * 1.9)) });
    }
    const cnt = Array.from({ length: NF + 1 }, (_, k) => { const m = flashPlane(k < NF ? flashTex("$" + (k + 1) * 100, "#ffe14d") : flashTex("CHA-CHING!", "#7dff8f", 640, 170, 92), k < NF ? 0.42 : 0.68, k < NF ? 0.175 : 0.18); G.add(m); return m; });
    const stars: THREE.Group[] = []; for (let i = 0; i < 5; i++) { const s = star(0.09); G.add(s); stars.push(s); }
    const tf = (j: number) => T0 + j * DT + DT * 0.5;   // moment bill j leaves the stack
    return { tick(t) {
      const e: Expr = t < 1.1 ? "focus" : t < 2.45 ? "grin" : "smug";
      setPose(ctx, t, "count", e);
      const hero = ctx.hero, M = mouthRoot(ctx, head);
      const launched = Math.min(NF, Math.max(0, Math.floor((t - T0) / DT + 0.5)));
      let bob = 0; for (let j = 0; j < NF; j++) { const d = t - tf(j); if (d > 0 && d < 0.4) bob = Math.max(bob, Math.exp(-d * 11)); }
      flickBob(head, bob, 0.09); if (head) head.rotation.x += 0.1;
      const nv = NL - launched;
      const C = new V3(M.x - 0.04, M.y - 0.5, M.z + 0.3), cy = LT * NL / 2;
      stackG.position.set(C.x, C.y - cy * Math.cos(TH), C.z - cy * Math.sin(TH));
      stackG.updateMatrixWorld(true);
      layers.forEach((m, i) => { m.visible = i < nv; });
      topP.position.y = nv * LT + 0.002; band.scale.y = nv * LT + 0.01; band.position.y = (nv * LT + 0.01) / 2;
      // right thumb: sits at the top right corner, dips down-and-out on each flick
      const q = ((t - T0) / DT % 1 + 1) % 1, on = t > T0 - 0.1 && t < T0 + NF * DT + 0.05;
      const kick = on ? (q < 0.5 ? sm(q / 0.5) : 1 - sm((q - 0.5) / 0.5)) : 0;
      const fr = tilt.localToWorld(new V3(0.16 + 0.16 * kick, nv * LT + 0.1 - 0.08 * kick, 0.0));
      armW(hero, "r", fr, [0.9, -0.8, -0.3]);
      armW(hero, "l", tilt.localToWorld(new V3(-BW / 2 + 0.02, cy, -0.02)), [-0.9, -0.8, -0.3]);
      // flying bills: peel off the top right corner, fly out to the right in an arc and land on the pile
      fl.forEach((f, j) => {
        const a = t - tf(j), top = (NL - j) * LT, p0 = tilt.localToWorld(new V3(0.22, top + 0.02, 0)), pe = f.e;
        const vis = a > -0.02; f.g.visible = vis; if (!vis) return;
        if (f.v0 === 0) { f.v0 = (pe.y - p0.y + 0.5 * GR * DUR * DUR) / DUR; }
        const u = c01(a / DUR), aa = Math.min(a, DUR);
        const ex = sm(Math.min(1, aa / DUR * 1.15));
        f.g.position.set(p0.x + (pe.x - p0.x) * (0.6 * ex + 0.4 * u), p0.y + f.v0 * aa - 0.5 * GR * aa * aa, p0.z + (pe.z - p0.z) * u);
        if (a > DUR) f.g.position.copy(pe);
        const k = sm(seg(a, DUR - 0.3, DUR)), pre = sm(seg(a, -0.02, 0.1));
        f.g.rotation.set(wrap(0.9 * (1 - pre) + a * f.sp * 0.5) * (1 - k), f.ph + a * 2.5, wrap(Math.sin(a * 9 + f.ph) * 0.9 + 0.15) * (1 - k));
      });
      cnt.forEach((m, k) => {
        const on2 = (k < NF ? launched === k + 1 && t < T0 + NF * DT + 0.0 : t > T0 + NF * DT - 0.05), d = k < NF ? t - tf(k) : t - (T0 + NF * DT - 0.05);
        m.visible = on2 && (k < NF || true);
        if (m.visible) { m.position.set(M.x + (k < NF ? -0.22 : 0.0), M.y - (k < NF ? 0.17 : 0.2), M.z + 0.5); m.rotation.z = k < NF ? 0.08 : -0.05; m.scale.setScalar(1 + (k < NF ? 0.35 : 0.5) * Math.exp(-Math.max(0, d) * 12) + (k === NF ? 0.04 * Math.sin(d * 14) : 0)); }
      });
      stars.forEach((s, i) => { const a = t - (T0 + NF * DT) - i * 0.04, o = a > 0 && a < 0.7; s.visible = o;
        if (o) { const top = tilt.localToWorld(new V3(0.0, nv * LT + 0.05, 0)); const ang = i * 1.3; s.position.set(top.x + Math.cos(ang) * (0.2 + a * 0.5), top.y + 0.1 + Math.sin(ang) * (0.1 + a * 0.4), top.z + 0.15); s.scale.setScalar(Math.sin(Math.min(1, a / 0.7) * Math.PI) * 1.4 + 0.01); s.rotation.z = a * 5 + i; } });
      return { pose: "count", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ sign_contract: a big CONTRACT on a clipboard angled to the camera; a fat pen writes a flowing ink signature that grows
  // across the line, a flourish underline, then a gold SIGNED seal slams on; focus -> smug -> grin
  sign_contract: { pose: "count", view: "cu", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const head = findHead(ctx.hero), TH = 0.95, PW = 0.62, PH = 0.74, CW = 512, CH = 610;
    const board = new THREE.Group(); G.add(board); board.rotation.x = TH;
    board.add(bx(PW + 0.1, 0.04, PH + 0.1, "#a9743f", 0, 0, 0, 0.02));
    board.add(bx(0.22, 0.05, 0.07, "#c9ced8", 0, 0.03, -PH / 2 - 0.02, 0.012));
    // the page: drawn once (base) and redrawn each frame with the ink so far
    const base = document.createElement("canvas"); base.width = CW; base.height = CH; const bg = base.getContext("2d")!;
    bg.fillStyle = "#fffdf4"; bg.fillRect(0, 0, CW, CH);
    bg.fillStyle = "#1d2a5b"; bg.font = "900 74px Arial Black, Arial, sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle"; bg.fillText("CONTRACT", CW / 2, 84);
    bg.fillRect(70, 132, CW - 140, 8);
    for (let i = 0; i < 6; i++) { bg.fillStyle = i % 4 === 3 ? "#c9ced8" : "#9aa0ad"; bg.fillRect(70, 176 + i * 36, i % 4 === 3 ? 260 : CW - 140 - (i % 3) * 30, 15); }
    bg.fillStyle = "#d62f3a"; bg.font = "bold 30px Arial"; bg.textAlign = "left"; bg.fillText("SIGN HERE  >", 70, 388);
    bg.fillStyle = "#1d2a5b"; bg.font = "900 56px Arial Black, Arial"; bg.fillText("X", 70, 470);
    bg.fillRect(110, 490, 330, 7); bg.font = "bold 24px Arial"; bg.fillStyle = "#6b7285"; bg.fillText("SIGNATURE", 110, 522);
    const ink = document.createElement("canvas"); ink.width = CW; ink.height = CH; const ig = ink.getContext("2d")!;
    const tex = new THREE.CanvasTexture(ink); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: tex, color: "#f2f2ee" })); paper.rotation.x = -Math.PI / 2; paper.position.y = 0.024; board.add(paper);
    const sig = (s: number): [number, number] => {
      const amp = 20 * (1 - 0.35 * s) + 34 * Math.exp(-(((s - 0.07) / 0.09) ** 2)), w = Math.PI * 2 * 5.2;
      return [118 + 300 * s - amp * Math.sin(w * s), 430 - amp * 0.9 * Math.cos(w * s)];
    };
    const sw = (r: number): [number, number] => [452 - 350 * r, 458 + 26 * Math.sin(r * Math.PI) - 10 * r];
    const NS = 220;
    let lastKey = "";
    const drawInk = (p: number, r: number) => {
      const key = p.toFixed(4) + "|" + r.toFixed(4); if (key === lastKey) return; lastKey = key;
      ig.drawImage(base, 0, 0); ig.lineCap = "round"; ig.lineJoin = "round"; ig.strokeStyle = "#141f8f"; ig.lineWidth = 11;
      if (p > 0) { ig.beginPath(); const n = Math.max(2, Math.floor(NS * p)); for (let i = 0; i <= n; i++) { const [x, y] = sig(p * i / n); if (i) ig.lineTo(x, y); else ig.moveTo(x, y); } ig.stroke(); }
      if (r > 0) { ig.lineWidth = 9; ig.beginPath(); const n = Math.max(2, Math.floor(60 * r)); for (let i = 0; i <= n; i++) { const [x, y] = sw(r * i / n); if (i) ig.lineTo(x, y); else ig.moveTo(x, y); } ig.stroke(); }
      tex.needsUpdate = true;
    };
    drawInk(0, 0);
    const toL = (cx: number, cy: number, y = 0.03) => new V3((cx / CW - 0.5) * PW, y, (cy / CH - 0.5) * PH);
    // fat fancy pen: origin = the nib tip, body along +y
    const pen = new THREE.Group(); G.add(pen);
    const nib = new THREE.ConeGeometry(0.032, 0.1, 12); nib.rotateX(Math.PI); nib.translate(0, 0.05, 0); pen.add(mesh(nib, "#f2c230", 0, 0, 0, 0.008));
    pen.add(cyl(0.036, 0.46, "#1d2a8b", 0, 0.33, 0, 0.01, 14)); pen.add(cyl(0.039, 0.035, "#f2c230", 0, 0.12, 0, 0.006, 14)); pen.add(cyl(0.039, 0.03, "#f2c230", 0, 0.5, 0, 0.006, 14));
    pen.add(bx(0.014, 0.28, 0.02, "#f2c230", 0.045, 0.38, 0, 0.004)); pen.add(sph(0.036, "#f2c230", 0, 0.57, 0, 0.006));
    // the gold SIGNED seal (scalloped medallion + text)
    const SR = 0.085, seal = new THREE.Group(); board.add(seal);
    const sh = new THREE.Shape();
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, r = i % 2 ? SR * 0.86 : SR; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(r, 0); }
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); sg.rotateX(-Math.PI / 2);
    seal.add(mesh(sg, "#f2b51f", 0, 0, 0, 0.012));
    seal.add(cyl(SR * 0.72, 0.014, "#ffd95a", 0, 0.034, 0, 0.006, 28));
    const stx = flashPlane(canvasTex(256, 256, (g) => {
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#7a3b0a"; g.font = "900 54px Arial Black, Arial"; g.fillText("SIGNED", 128, 150);
      g.font = "60px Arial"; g.fillText("★", 128, 82); g.strokeStyle = "#7a3b0a"; g.lineWidth = 7; g.beginPath(); g.arc(128, 128, 98, 0, Math.PI * 2); g.stroke();
    }), SR * 1.5, SR * 1.5);
    stx.rotation.x = -Math.PI / 2; stx.position.y = 0.045; seal.add(stx); seal.visible = false;
    const stars: THREE.Group[] = []; for (let i = 0; i < 4; i++) { const s = star(0.08); G.add(s); stars.push(s); }
    const TS2 = 2.1;
    return { tick(t) {
      const e: Expr = t < 1.9 ? "focus" : t < 2.55 ? "smug" : "grin";
      setPose(ctx, t, "count", e);
      const hero = ctx.hero, M = mouthRoot(ctx, head);
      const writing = sm(seg(t, 0.18, 0.5)) * (1 - sm(seg(t, 1.95, 2.15)));
      if (head) { head.rotation.x += 0.12 * writing + 0.03 * Math.sin(t * 9) * writing; head.rotation.z += -0.05 * writing; head.rotation.y += 0.12 * writing; }
      const sealPop = seg(t, TS2, TS2 + 0.22), sealIn = t > TS2;
      board.position.set(M.x - 0.03, M.y - 0.42, M.z + 0.3); board.updateMatrixWorld(true);
      const p = sm(seg(t, 0.3, 1.65)), r = sm(seg(t, 1.65, 1.95)); drawInk(p, r);
      // pen tip: follows the signature, then the underline swoosh, then lifts with a flick
      let [cx, cy] = r > 0 ? sw(r) : sig(p);
      const lift = 0.22 * (1 - sm(seg(t, 0.0, 0.3))) + 0.2 * sm(seg(t, 1.95, 2.2)) + 0.03 * Math.abs(Math.sin(t * 22)) * (t > 0.3 && t < 1.95 ? 1 : 0);
      const tip = board.localToWorld(toL(cx, cy, 0.03 + lift));
      const flick = sm(seg(t, 1.95, 2.25)); tip.x += 0.12 * flick; tip.y += 0.1 * flick;
      const d = new V3(0.5, 0.78, 0.2 + 0.3 * flick).normalize();
      pen.position.copy(tip); pen.quaternion.setFromUnitVectors(new V3(0, 1, 0), d);
      armW(hero, "r", tip.clone().addScaledVector(d, 0.3), [0.9, -0.8, -0.3]);
      armW(hero, "l", board.localToWorld(new V3(-PW / 2 - 0.08, 0.0, 0.1)), [-0.9, -0.8, -0.3]);
      // the seal slams down onto the page
      seal.visible = sealIn;
      if (sealIn) {
        const sc = 1 + 1.4 * (1 - sm(sealPop)), over = 1 + 0.12 * Math.sin(Math.max(0, t - TS2 - 0.2) * 20) * Math.exp(-(t - TS2 - 0.2) * 7), sp0 = toL(412, 520);
        seal.position.set(sp0.x, 0.025 + 0.45 * (1 - sm(sealPop)) ** 2, sp0.z); seal.scale.setScalar(sc * (sealPop < 1 ? 1 : over)); seal.rotation.y = -0.25 + 0.4 * (1 - sealPop);
      }
      const sp = board.localToWorld(toL(412, 520, 0.15));
      stars.forEach((s, i) => {
        const a = t - TS2 - 0.15 - i * 0.04, on = a > 0 && a < 0.65; s.visible = on;
        if (on) { const ang = i * 1.7 + 0.5; s.position.set(sp.x + Math.cos(ang) * (0.12 + a * 0.5), sp.y + 0.05 + Math.sin(ang) * (0.1 + a * 0.4), sp.z + 0.12); s.scale.setScalar(Math.sin(a / 0.65 * Math.PI) * 1.4 + 0.01); s.rotation.z = a * 5 + i; }
      });
      return { pose: "count", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ drive_car: a real car (cabin, glass, hood, doors); grin -> shout on the fast bit
  drive_car: { pose: "sit", view: "actm", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const H = heroAt(ctx), YAW = 0.45, OX = 0.65;
    ctx.hero.root.rotation.y = YAW; ctx.hero.root.position.set(H.x + OX, H.y - 0.22, H.z);
    setPose(ctx, 0, "sit");
    const car = new THREE.Group(); car.position.set(H.x + OX, 0, H.z); car.rotation.y = YAW; G.add(car);
    const body = new THREE.Group(); car.add(body);
    const RED = "#e53935", DRK = "#b02a28";
    body.add(bx(1.78, 0.44, 3.6, RED, 0, 0.38, 0.5, 0.025));          // lower body
    body.add(bx(1.72, 0.16, 1.3, RED, 0, 0.68, 1.45, 0.02));          // hood
    body.add(bx(1.72, 0.2, 0.8, RED, 0, 0.7, -0.85, 0.02));           // boot
    body.add(bx(1.0, 0.24, 0.07, "#1c1c24", 0, 0.46, 2.3, 0.01));    // grille
    body.add(bx(1.84, 0.12, 0.16, "#cfd5e2", 0, 0.2, 2.3, 0.015));   // front bumper
    body.add(bx(1.84, 0.12, 0.16, "#cfd5e2", 0, 0.2, -1.3, 0.015));  // rear bumper
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), glowMat("#fff6c0", 2.4)); hl.position.set(s * 0.62, 0.52, 2.28); hl.scale.set(1.2, 0.8, 0.5); body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), glowMat("#ff3a3a", 1.6)); tl.position.set(s * 0.6, 0.62, -1.27); body.add(tl);
      body.add(bx(0.07, 1.02, 0.07, DRK, s * 0.82, 1.24, 0.66, 0.008));    // A pillars
      body.add(bx(0.07, 0.98, 0.07, DRK, s * 0.82, 1.22, -0.62, 0.008));   // C pillars
      body.add(bx(0.1, 0.1, 0.18, RED, s * 0.98, 0.98, 0.7, 0.012));      // mirrors
      body.add(bx(0.02, 0.5, 0.05, DRK, s * 0.9, 0.62, 0.05, 0));        // door line
      body.add(bx(0.03, 0.04, 0.2, "#cfd5e2", s * 0.91, 0.76, -0.2, 0));   // door handle
    }
    body.add(bx(1.74, 0.09, 1.5, RED, 0, 1.76, 0.02, 0.02));          // roof
    const glassMat = new THREE.MeshBasicMaterial({ color: "#bfe9ff", transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), glassMat); ws.position.set(0, 1.25, 0.7); ws.rotation.x = -0.12; ws.renderOrder = 3; body.add(ws);
    for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), glassMat); sw.position.set(s * 0.84, 1.24, 0.02); sw.rotation.y = Math.PI / 2; sw.renderOrder = 3; body.add(sw); }
    body.add(bx(0.7, 0.42, 0.3, "#3a3a46", 0, 0.62, -0.38, 0.02));    // seat back
    body.add(bx(1.5, 0.14, 0.12, "#2a2a32", 0, 0.66, 0.92, 0.02));    // dashboard
    const wheels: THREE.Group[] = [];
    for (const [sx, sz] of [[-1, 1.65], [1, 1.65], [-1, -0.55], [1, -0.55]]) {
      const w = new THREE.Group(); w.position.set(sx * 0.95, 0.36, sz); const rot = new THREE.Group(); w.add(rot);
      const tire = cyl(0.36, 0.26, "#23232b", 0, 0, 0, 0.02, 24); tire.rotation.z = Math.PI / 2; rot.add(tire);
      const hub = cyl(0.19, 0.28, "#e9edf5", 0, 0, 0, 0.01, 16); hub.rotation.z = Math.PI / 2; rot.add(hub);
      for (let k = 0; k < 3; k++) { const sp = bx(0.05, 0.32, 0.05, "#6b7488", sx * 0.15, 0, 0, 0); sp.rotation.x = k * 1.047; rot.add(sp); }
      body.add(w); wheels.push(rot);
      body.add(bx(0.3, 0.1, 0.9, RED, sx * 0.9, 0.7, sz, 0.012));   // fender over the wheel
    }
    const hl = handPos(ctx, "l"), hr = handPos(ctx, "r");
    const cl = car.worldToLocal(ctx.root.localToWorld(hl.clone())), cr = car.worldToLocal(ctx.root.localToWorld(hr.clone()));
    const wc = cl.clone().add(cr).multiplyScalar(0.5), sw = new THREE.Group(); sw.position.copy(wc).add(new V3(0, 0.12, 0.08)); sw.rotation.x = -0.6; car.add(sw);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.24, cl.distanceTo(cr) / 2 + 0.05), 0.045, 10, 28), toonMat("#1c1c24")); outline(rim, 0.01); sw.add(rim);
    sw.add(bx(0.04, 0.34, 0.04, "#1c1c24", 0, 0, 0, 0)); sw.add(bx(0.34, 0.04, 0.04, "#1c1c24", 0, 0, 0, 0));
    const col = bx(0.07, 0.07, 0.4, "#2a2a32", wc.x, wc.y - 0.1, wc.z + 0.2, 0); col.rotation.x = 0.4; car.add(col);
    const road = new THREE.Group(); road.position.set(H.x + OX, 0.012, H.z); road.rotation.y = YAW; G.add(road);
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), toonMat("#34343e")); asphalt.rotation.x = -Math.PI / 2; asphalt.position.z = -8; asphalt.receiveShadow = true; road.add(asphalt);
    const dashes: THREE.Mesh[] = [], streaks: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) for (const sx of [-1.45, 1.45]) { const d = bx(0.14, 0.01, 0.8, "#f4f0e0", sx, 0.01, 0, 0); road.add(d); dashes.push(d); }
    for (const sx of [-2.8, 2.8]) road.add(bx(0.12, 0.012, 40, "#f2c230", sx, 0.012, -8, 0));
    for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.8), glowMat("#ffffff", 1.4)); road.add(s); streaks.push(s); }
    const rnd = seeded(ctx.seed + 9), sk = streaks.map(() => ({ x: (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 1.6), y: 0.3 + rnd() * 1.4, o: rnd() }));
    return { tick(t) {
      const fast = sm(seg(t, 0.55, 0.85)) * (1 - sm(seg(t, 1.6, 1.9)));   // the fast bit
      const e: Expr = fast > 0.5 ? "shout" : "grin";
      const bounce = Math.abs(Math.sin(t * 13)) * (0.025 + 0.03 * fast) + Math.sin(t * 5.3) * 0.01;
      setPose(ctx, t, "sit", e);
      ctx.hero.root.rotation.y = YAW; body.position.y = bounce; sw.rotation.z = Math.sin(t * 2.6) * 0.18 * (1 + fast); ctx.hero.root.position.y = H.y - 0.22 + bounce;
      const dist = 7 * t + 6 * Math.max(0, t - 0.55) * sm(seg(t, 0.55, 0.85));
      dashes.forEach((d, i) => { const k = Math.floor(i / 2); d.position.z = ((k * 1.9 + dist) % (16 * 1.9)) - 16 * 1.9 + 7.5; });
      streaks.forEach((s, i) => { s.position.set(sk[i].x, 0.04, ((sk[i].o * 20 + dist * 2) % 20) - 14); s.scale.z = 1 + 2 * fast; });
      wheels.forEach((w) => { w.rotation.x = -dist * 2; });
      return { pose: "sit", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ throw_cash ("make it rain"): fans of bills thrown up in bursts with a hop, many big bills flutter down and land on the floor; grin -> shout -> laugh
  throw_cash: { pose: "stand", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const head = findHead(ctx.hero), H = heroAt(ctx), rnd = seeded(ctx.seed + 21);
    const NB = 8, PER = 6, T0 = 0.4, DT = 0.5, GG = 9, VF = 0.95, FL = H.y + 0.02;
    const tb = (k: number) => T0 + k * DT, hands = (k: number) => (k % 4 === 3 ? ["l", "r"] : [k % 2 ? "l" : "r"]) as ("l" | "r")[];
    const bills: { g: THREE.Group; k: number; i: number; vx: number; vz: number; vy: number; sp: number; ph: number; fy: number }[] = [];
    for (let k = 0; k < NB; k++) for (let i = 0; i < PER; i++) {
      const g = fatBill(0.5); G.add(g);
      bills.push({ g, k, i, vx: (rnd() - 0.5) * 1.9, vz: (rnd() - 0.4) * 0.9, vy: 3.3 + rnd() * 1.3, sp: 3 + rnd() * 5, ph: rnd() * 6.28, fy: FL + ((k * PER + i) % 4) * 0.012 });
    }
    const fans: Record<"l" | "r", THREE.Group> = { l: new THREE.Group(), r: new THREE.Group() };
    (["l", "r"] as const).forEach((s) => {
      const fg = fans[s]; G.add(fg);
      for (let i = 0; i < 5; i++) { const b = fatBill(0.5), pv = new THREE.Group(); b.position.x = 0.2; b.rotation.x = Math.PI / 2; pv.add(b); pv.rotation.z = (s === "r" ? 1 : -1) * (0.15 + i * 0.28); if (s === "l") pv.scale.x = -1; fg.add(pv); }
    });
    const burstW = (a: number) => (a < -0.3 ? 0 : a < 0 ? -0.5 * sm((a + 0.3) / 0.3) : a < 0.14 ? -0.5 + 1.5 * sm(a / 0.14) : a < 0.55 ? 1 - sm((a - 0.14) / 0.41) : 0);
    return { tick(t) {
      const e: Expr = t < 0.3 ? "grin" : t < 2.1 ? "shout" : "laugh";
      setPose(ctx, t, "stand", e);
      const hero = ctx.hero, M = mouthRoot(ctx, head);
      let tp = 0; for (let k = 0; k < NB; k++) { const a = t - tb(k) - 0.14; if (a > -0.05 && a < 0.5) tp = Math.max(tp, Math.exp(-Math.max(0, a) * 7) * sm(seg(a, -0.05, 0.05))); }
      if (head) { head.rotation.x -= 0.2 * tp; head.rotation.z += 0.05 * Math.sin(t * 5); }
      const rig = hero.root.children[0]; if (rig) rig.position.y += 0.05 * tp;
      (["l", "r"] as const).forEach((s) => {
        const sd = s === "r" ? 1 : -1; let w = 0, rel = 99;
        for (let k = 0; k < NB; k++) if (hands(k).includes(s)) { const a = t - tb(k); if (a > -0.3 && a < 0.55) { w = burstW(a); rel = a - 0.14; } }
        const rest = new V3(M.x + sd * 0.36, M.y - 0.4, M.z + 0.3), top = new V3(M.x + sd * 0.62, M.y + 0.4, M.z + 0.12);
        const hp = rest.clone().lerp(top, Math.max(0, w)).addScaledVector(new V3(sd * 0.2, -0.3, 0), Math.max(0, -w));
        armW(hero, s, hp, [sd * 0.9, -0.8, -0.3]);
        const fan = fans[s]; fan.visible = !(rel > 0 && rel < 0.4); fan.position.copy(hp).add(new V3(0, 0.05, 0.1)); fan.rotation.z = sd * 0.2 * Math.max(0, w);
      });
      bills.forEach((b) => {
        const hs = hands(b.k), s = hs[b.i % hs.length], sd = s === "r" ? 1 : -1, a = t - tb(b.k) - 0.14;
        b.g.visible = a > 0; if (a <= 0) return;
        const x0 = M.x + sd * 0.62, y0 = M.y + 0.45, z0 = M.z + 0.12, a1 = b.vy / GG, ya = y0 + b.vy * a1 - 0.5 * GG * a1 * a1, aL = a1 + (ya - b.fy) / VF, aa = Math.min(a, aL);
        const y = aa < a1 ? y0 + b.vy * aa - 0.5 * GG * aa * aa : ya - VF * (aa - a1);
        const sway = 0.16 * Math.sin(aa * 4.5 + b.ph) * Math.min(1, aa / 0.6);
        b.g.position.set(x0 + b.vx * (1 - Math.exp(-aa * 2)) / 2 + sway, Math.max(b.fy, y), z0 + b.vz * (1 - Math.exp(-aa * 1.6)) / 1.6 * 0.6);
        const k = sm(seg(a, aL - 0.25, aL));
        b.g.rotation.set(wrap(a * b.sp) * (1 - k) * 0.9, b.ph + a * 1.4, wrap(Math.sin(a * 5 + b.ph) * 1.1) * (1 - k));
      });
      return { pose: "stand", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ present_chart: talking -> shout as the bars jump and the arrow shoots up -> laugh
  present_chart: { pose: "point", view: "actm", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const H = heroAt(ctx), YAW = 0.9;
    ctx.hero.root.rotation.y = YAW;
    const board = new THREE.Group(); board.position.set(H.x + 1.0, 0, H.z - 0.2); board.scale.setScalar(0.68); G.add(board);
    board.add(bx(2.0, 1.45, 0.08, "#f7f4ea", 0, 1.55, 0, 0.025)); board.add(bx(2.1, 1.55, 0.05, "#2a3a5a", 0, 1.55, -0.05, 0.02));
    for (const sx of [-0.7, 0.7]) board.add(bx(0.06, 0.95, 0.06, "#4a3a2a", sx, 0.47, -0.1, 0.01));
    board.add(bx(1.7, 0.03, 0.02, "#2b2b36", 0, 1.0, 0.05, 0)); board.add(bx(0.03, 1.15, 0.02, "#2b2b36", -0.85, 1.55, 0.05, 0));
    const cols = ["#59c8ff", "#5be37d", "#ffd45a", "#ff9a4a", "#ff5a7a"], hs = [0.28, 0.42, 0.6, 0.85, 1.12], bars: THREE.Mesh[] = [];
    cols.forEach((c, i) => { const m = bx(0.24, 1, 0.06, c, -0.64 + i * 0.32, 1.02, 0.06, 0.012); m.geometry.translate(0, 0.5, 0); board.add(m); bars.push(m); });
    const arrow = new THREE.Group(); board.add(arrow);
    const shaft = bx(0.07, 1, 0.04, "#e8342e", 0, 0, 0, 0.01); shaft.geometry.translate(0, -0.5, 0); arrow.add(shaft);
    arrow.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 4), "#e8342e", 0, 0.1, 0, 0.012));
    const ptr = new THREE.Group(); G.add(ptr); ptr.add(cyl(0.015, 1.1, "#8a6a3a", 0, 0.55, 0, 0.006, 8)); ptr.add(sph(0.03, "#e8342e", 0, 1.1, 0, 0.006));
    const stars: THREE.Group[] = []; for (let i = 0; i < 5; i++) { const s = star(0.09); G.add(s); stars.push(s); }
    const bk = (u: number) => { u = c01(u); return u <= 0 ? 0.001 : 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; };
    return { tick(t) {
      const e: Expr = t < 1.0 ? (Math.floor(t * 7) % 2 ? "smile" : "grin") : t < 1.6 ? "shout" : "laugh";
      setPose(ctx, t, "point", e); ctx.hero.root.rotation.y = YAW;
      bars.forEach((b, i) => { b.scale.y = Math.max(0.001, hs[i] * bk((t - 0.15 - i * 0.22) / 0.55)); });
      const p = sm(seg(t, 0.2, 1.5)), x0 = -0.78, y0 = 1.2, x1 = 0.74, y1 = 2.0, ax = x0 + (x1 - x0) * p, ay = y0 + (y1 - y0) * p;
      arrow.position.set(ax, ay, 0.12); arrow.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2; shaft.scale.y = 0.001 + Math.hypot(ax - x0, ay - y0); arrow.visible = p > 0.02;
      const h = handPos(ctx, "r"), tp = board.localToWorld(new V3(-0.3 + 0.6 * p, 1.05 + 0.8 * p, 0.1)); ctx.root.worldToLocal(tp);
      const d = tp.sub(h).normalize(); ptr.position.copy(h).addScaledVector(d, -0.15); ptr.quaternion.setFromUnitVectors(new V3(0, 1, 0), d);
      board.updateWorldMatrix(true, false); const tipW = board.localToWorld(new V3(x1, y1 + 0.1, 0.2));
      stars.forEach((s, i) => { const a = t - 1.45 - i * 0.07, on = a > 0 && a < 0.7; s.visible = on; if (on) { s.position.set(tipW.x - 0.25 + i * 0.12, tipW.y - 0.2 + 0.18 * Math.sin(i * 2 + a * 5), tipW.z); s.scale.setScalar(Math.sin(Math.min(1, a / 0.7) * Math.PI) * 1.3 + 0.01); s.rotation.z = a * 4 + i; } });
      return { pose: "point", expr: e };
    } };
  } },
  // ------------------------------------------------------------------ unbox: eager -> both hands lift the lid -> shock as the shoe rises -> laugh
  unbox: { pose: "stand", view: "ms", build(ctx) {
    const G = new THREE.Group(); ctx.root.add(G);
    const H0 = heroAt(ctx), H = new V3(H0.x, H0.y, H0.z), TY = 0.55, BZ = H0.z + 0.55;
    const table = new THREE.Group(); table.position.set(H.x, 0, BZ); G.add(table);
    table.add(bx(1.3, 0.07, 0.8, "#a9743f", 0, TY - 0.035, 0, 0.02));
    for (const sx of [-0.58, 0.58]) for (const sz of [-0.32, 0.32]) table.add(bx(0.07, TY - 0.07, 0.07, "#6e4a28", sx, (TY - 0.07) / 2, sz, 0.01));
    const bxg = new THREE.Group(); bxg.position.set(H.x, TY, BZ); G.add(bxg);
    const BW = 0.55, BH = 0.28, BD = 0.4;
    bxg.add(bx(BW, BH, BD, "#c8975a", 0, BH / 2, 0, 0.02)); bxg.add(bx(0.1, BH + 0.004, BD + 0.004, "#e8d6a8", 0, BH / 2, 0, 0)); bxg.add(bx(BW * 0.9, 0.02, BD * 0.9, "#2a1f3a", 0, BH + 0.002, 0, 0));
    const lid = new THREE.Group(); lid.position.set(0, BH, -BD / 2); bxg.add(lid);
    lid.add(bx(BW + 0.04, 0.05, BD + 0.04, "#d8a96c", 0, 0.025, BD / 2, 0.02)); lid.add(bx(0.1, 0.054, BD + 0.045, "#e8d6a8", 0, 0.025, BD / 2, 0));
    const shoe = prop("shoe", 0.4); G.add(shoe.g); shoe.g.visible = false;
    const stars: THREE.Group[] = []; for (let i = 0; i < 6; i++) { const s = star(0.09); G.add(s); stars.push(s); }
    const sideOf = (p: THREE.Vector3): "l" | "r" => { ctx.hero.root.updateMatrixWorld(true); return ctx.hero.root.children[0].worldToLocal(p.clone()).x >= 0 ? "r" : "l"; };
    return { tick(t) {
      const open = sm(seg(t, 0.35, 0.85));
      lid.rotation.x = -open * 1.95 - Math.sin(open * Math.PI) * 0.12;
      const r = sm(seg(t, 0.75, 1.5)); shoe.g.visible = r > 0.001;
      shoe.g.position.set(H.x, TY + BH * 0.5 + r * 0.55 + 0.02 * Math.sin(t * 4), BZ); shoe.g.rotation.set(0.1, 0.6 + Math.sin(t * 2) * 0.5, -0.1); shoe.g.scale.setScalar(0.4 + 0.6 * sm(seg(t, 0.75, 1.0)));
      stars.forEach((s, i) => { const a = i / 6 * 6.28 + t * 1.5, p = ((t * 1.3 + i * 0.17) % 1), on = t > 0.85; s.visible = on; s.position.set(H.x + Math.cos(a) * (0.4 + 0.2 * p), TY + 0.55 + Math.sin(a * 1.3) * 0.35 + p * 0.2, BZ + 0.2); s.scale.setScalar(on ? Math.sin(p * Math.PI) * 1.2 + 0.01 : 0.01); s.rotation.z = t * 3 + i; });
      const p: Pose = t > 1.1 ? "cheer" : "stand";
      const e: Expr = t < 0.35 ? "grin" : t < 0.75 ? "focus" : t < 1.15 ? "shock" : "laugh";
      setPose(ctx, t, p, e);
      if (p === "stand") {   // both hands hold the lid's front corners and lift it
        lid.updateWorldMatrix(true, false);
        for (const sx of [-1, 1]) {
          const tgt = lid.localToWorld(new V3(sx * 0.2, 0.06, BD + 0.02)); ctx.root.worldToLocal(tgt);
          const s = sideOf(tgt), rest = handPos(ctx, s);
          armW(ctx.hero, s, rest.lerp(tgt, sm(seg(t, 0.1, 0.4))).lerp(new V3(tgt.x + 0.15 * sx, tgt.y + 0.25, tgt.z + 0.1), sm(seg(t, 0.85, 1.1))), [s === "r" ? 0.9 : -0.9, -0.8, -0.3]);
        }
      }
      return { pose: p, expr: e };
    } };
  } },
};
export const DAILY: Record<string, ActDef> = DAILY_DEFS;
