// POV format (Nov 24): the two 3D shot kinds the "pov" Short needs besides the normal hero shots.
//   units   - a row of everyday objects receding into depth (bathtubs filling with blue, lightbulbs lighting up, houses ...)
//   journey - a flythrough that follows ONE object (a message bubble, a coin ...) across a daytime toon town to the place
//             the money / energy goes, with little speech-bubble chips drifting around
// Everything is built in code, deterministic, and driven by progress numbers (no clocks): the shot gives `u` (0..1 inside
// the shot) and `g` (0..1 across the whole sentence), so a sentence cut into several views continues one motion.
import * as THREE from "three";
import { toonMat, glowMat, outline, seeded, canvasTex } from "./common";
import { makeThing } from "./things3d";

type V3 = [number, number, number];
export type UnitsSpec = { thing: string; count: number; fill?: boolean; u0: number; u1: number; rig: number };
/** rig: 0 behind the object, 1 low chase, 2 aerial, 3 head-on, 4 departure (from the start shop), 5 arrival (the landmark facade) */
export type JourneySpec = { obj: string; to: string; from?: string; u0: number; u1: number; rig: number; seed: number };
export type CamOut = { from: V3; look: V3; blur: number; fov?: number };
export type Pov3 = {
  root: THREE.Group; lights: THREE.Light[]; bg: string; fog?: THREE.Fog;
  /** camera for the shot-local progress u (0..1) */
  cam: (u: number) => CamOut;
  /** pose everything for the shot-local u; camera = where the lens is (billboards face it) */
  tick: (u: number, camPos: THREE.Vector3) => void;
};

const T = toonMat;
const PI = Math.PI;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** back-eased pop 0..1 -> overshoots to ~1.1 then settles */
const pop = (x: number) => (x <= 0 ? 0.001 : x >= 1 ? 1 : 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2);

const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, ol = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false;
  if (ol) outline(m, ol);
  p.add(m); return m;
};
const bxm = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, ol = 0) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z, ol);
const cym = (p: THREE.Object3D, rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, ol = 0, seg = 24) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, ol);
const spm = (p: THREE.Object3D, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, ol = 0) => add(p, new THREE.SphereGeometry(r, 24, 16), mat, x, y, z, ol);

// ============================================================ UNITS ============================================================
type Item = { g: THREE.Group; w: number; d: number; h: number; fill: (k: number) => void; spin?: (t: number) => void };

const bathtub = (): Item => {
  const g = new THREE.Group(), white = T("#f7f9ff"), water = new THREE.MeshToonMaterial({ color: "#2f9bff", emissive: "#1c6fd6", emissiveIntensity: 0.55 });
  bxm(g, 2.0, 0.12, 1.05, white, 0, 0.22, 0, 0.02);                       // floor
  bxm(g, 2.0, 0.5, 0.12, white, 0, 0.45, 0.46, 0.02); bxm(g, 2.0, 0.5, 0.12, white, 0, 0.45, -0.46, 0.02);   // long walls
  bxm(g, 0.12, 0.5, 0.8, white, 0.94, 0.45, 0, 0.02); bxm(g, 0.12, 0.5, 0.8, white, -0.94, 0.45, 0, 0.02);  // ends
  bxm(g, 2.12, 0.07, 1.2, white, 0, 0.72, 0, 0.02).visible = false;
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.38, 0.38]) cym(g, 0.07, 0.05, 0.16, T("#ffc928"), sx, 0.08, sz, 0.015, 12);   // gold feet
  cym(g, 0.04, 0.04, 0.36, T("#c9d2e0"), -0.78, 0.9, -0.1, 0.01, 10); const tap = bxm(g, 0.3, 0.05, 0.05, T("#c9d2e0"), -0.66, 1.07, -0.1, 0.01); void tap;
  const w = bxm(g, 1.78, 1, 0.8, water, 0, 0.28, 0); w.scale.y = 0.001;
  return { g, w: 2.0, d: 1.1, h: 1.1, fill: (k) => { w.scale.y = Math.max(0.001, 0.4 * k); w.position.y = 0.28 + 0.5 * w.scale.y; } };
};

const bulb = (): Item => {
  const g = new THREE.Group(), glass = new THREE.MeshToonMaterial({ color: "#dfe3ea", emissive: "#ffd93a", emissiveIntensity: 0 });
  spm(g, 0.36, glass, 0, 0.78, 0, 0.02); cym(g, 0.17, 0.25, 0.22, glass, 0, 0.5, 0, 0.02, 20);
  for (let i = 0; i < 3; i++) cym(g, 0.17, 0.17, 0.06, T("#aab3c2"), 0, 0.33 - i * 0.07, 0, 0.012, 16);
  cym(g, 0.07, 0.07, 0.05, T("#2a2a32"), 0, 0.1, 0, 0.01, 10);
  const halo = spm(g, 0.62, new THREE.MeshBasicMaterial({ color: "#ffe14a", transparent: true, opacity: 0, depthWrite: false }), 0, 0.78, 0);
  return { g, w: 0.8, d: 0.8, h: 1.2, fill: (k) => { glass.emissiveIntensity = 1.4 * k; glass.color.set(k > 0.5 ? "#fff0a0" : "#dfe3ea"); (halo.material as THREE.MeshBasicMaterial).opacity = 0.28 * k; halo.scale.setScalar(0.85 + 0.2 * k); } };
};

const cup = (): Item => {
  const g = new THREE.Group(), liquid = new THREE.MeshToonMaterial({ color: "#7a4424", emissive: "#3a1a08", emissiveIntensity: 0.3 });
  const body = cym(g, 0.44, 0.34, 0.8, T("#ffffff"), 0, 0.4, 0, 0.02, 28);
  void body;
  const top = cym(g, 0.4, 0.4, 0.02, liquid, 0, 0.78, 0, 0, 28);
  add(g, new THREE.TorusGeometry(0.22, 0.05, 10, 20, PI * 1.2), T("#ffffff"), 0.46, 0.42, 0, 0.012).rotation.set(0, 0, -PI * 0.6);
  return { g, w: 1.2, d: 0.9, h: 0.9, fill: (k) => { top.position.y = lerp(0.12, 0.76, k); top.visible = k > 0.02; } };
};

const coin = (): Item => {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: "#ffc928", metalness: 0.75, roughness: 0.3, emissive: "#ffc928", emissiveIntensity: 0.25 });
  const c = new THREE.Group(); c.position.y = 0.55; g.add(c);
  const dull = new THREE.Color("#8b8a86"), shiny = new THREE.Color("#ffc928");
  const d = add(c, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 36), gold, 0, 0, 0, 0.02); d.rotation.x = PI / 2;
  const r = add(c, new THREE.TorusGeometry(0.38, 0.03, 8, 36), T("#e0a410"), 0, 0, 0.056); void r;
  const r2 = add(c, new THREE.TorusGeometry(0.38, 0.03, 8, 36), T("#e0a410"), 0, 0, -0.056); void r2;
  bxm(c, 0.12, 0.38, 0.03, T("#e0a410"), 0, 0, 0.065); bxm(c, 0.12, 0.38, 0.03, T("#e0a410"), 0, 0, -0.065);
  // "fill" for a coin = it lights up from dull grey to shining gold and a little pile of coins grows under it
  const pile: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const m = cym(g, 0.42, 0.42, 0.07, gold, 0, 0.04 + i * 0.075, 0, 0.012, 20); m.visible = false; pile.push(m); }
  return { g, w: 1.0, d: 1.0, h: 1.1, fill: (k) => { gold.color.copy(dull).lerp(shiny, k); gold.emissiveIntensity = 0.02 + 0.85 * k; pile.forEach((m, i) => { m.visible = k > (i + 1) / 5; }); c.position.y = 0.45 + 0.1 * pile.filter((m) => m.visible).length; },
    spin: (t) => { c.rotation.y = t * 2.4; } };
};

const ticket = (): Item => {
  const g = new THREE.Group(), mat = new THREE.MeshToonMaterial({ color: "#9a9aa6", emissive: "#ff3b4e", emissiveIntensity: 0 });
  const t = new THREE.Group(); t.position.y = 0.75; t.rotation.z = 0.12; g.add(t);
  bxm(t, 1.3, 0.8, 0.07, mat, 0, 0, 0, 0.02); bxm(t, 0.05, 0.8, 0.075, T("#fff4d6"), 0.3, 0, 0.002);
  for (let i = 0; i < 4; i++) bxm(t, 0.07, 0.1, 0.08, T("#fff4d6"), 0.3, -0.3 + i * 0.2, 0.002);
  bxm(t, 0.62, 0.1, 0.08, T("#fff4d6"), -0.28, 0.1, 0.002); bxm(t, 0.42, 0.07, 0.08, T("#fff4d6"), -0.38, -0.08, 0.002);
  spm(t, 0.09, T("#fff4d6"), 0.65, 0, 0.0); spm(t, 0.09, T("#fff4d6"), -0.65, 0, 0.0);
  return { g, w: 1.3, d: 0.6, h: 1.2, fill: (k) => { mat.color.set(k > 0.5 ? "#ff3b4e" : "#9a9aa6"); mat.emissiveIntensity = 0.5 * k; } };
};

/** a code-built thing (house, phone, truck ...) scaled so its height is `h` metres */
const fromThing = (name: string, h: number): Item => {
  const th = makeThing(name), g = new THREE.Group(), k = h / Math.max(0.01, th.size);
  th.root.scale.setScalar(k); g.add(th.root); g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3());
  return { g, w: s.x, d: s.z, h: s.y, fill: () => {}, spin: th.tick ? (t) => th.tick!(t) : undefined };
};
const unitItem = (thing: string): Item => {
  switch (thing) {
    case "bathtub": return bathtub();
    case "lightbulb": return bulb();
    case "cup": case "coffee": return cup();
    case "coin": return coin();
    case "ticket": return ticket();
    case "house": return fromThing("house", 1.6);
    case "phone": return fromThing("phone", 1.1);
    case "truck": return fromThing("truck", 1.3);
    default: return fromThing(thing, 1.1);
  }
};

export const buildUnits = (sp: UnitsSpec): Pov3 => {
  const root = new THREE.Group(), N = Math.max(1, Math.min(24, sp.count)), proto = unitItem(sp.thing);
  // a real town street: paved road with lane dashes, kerbs, sidewalks, pastel buildings on both sides, lamps and trees
  const road = T("#5a6075"), kerb = T("#d9d6cf"), walk = T("#e9e2d2"), grass = T("#86d46f");
  const flat = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const r = add(root, new THREE.PlaneGeometry(w, d), m, x, y, z); r.rotation.x = -PI / 2; return r; };
  flat(300, 300, grass, 0, -0.02, -60);
  flat(7, 140, road, 0, 0.01, -50);
  for (const sx of [-1, 1]) { flat(5, 140, walk, sx * 6, 0.02, -50); bxm(root, 0.25, 0.14, 140, kerb, sx * 3.6, 0.06, -50, 0.01); }
  for (let z = 8; z > -90; z -= 3.2) for (const x of [-1.8, 1.8]) flat(0.16, 1.4, T("#f3e6a0"), x, 0.02, z);
  const R = seeded(77);
  for (const sx of [-1, 1]) {
    let z = 4;
    while (z > -80) {
      const w = 5 + R() * 3, h = 5 + R() * 11, col = PASTELS[Math.floor(R() * PASTELS.length)];
      const wt = windows(col).clone(); wt.needsUpdate = true; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3.2)));
      const wm = new THREE.MeshToonMaterial({ map: wt }), top = T(col), cx = sx * (8.5 + 4.2), cz = z - w / 2;
      const b = add(root, new THREE.BoxGeometry(8, h, w - 0.4), [wm, wm, top, top, wm, wm], cx, h / 2, cz, 0.05);
      add(root, new THREE.BoxGeometry(2.2, 0.16, w - 0.6), T(["#ff5d73", "#ffffff", "#5db4ff"][Math.floor(R() * 3)]), sx * 8.2, 2.9, cz, 0.015);   // awning over the sidewalk
      if (R() < 0.5) add(root, new THREE.ConeGeometry(4.6, 2.2, 4), T("#e0553f"), b.position.x, h + 1.1, b.position.z, 0.04).rotation.y = PI / 4;
      z -= w;
    }
    for (let z2 = 3; z2 > -80; z2 -= 9) {
      cym(root, 0.07, 0.09, 3.6, T("#4a4f5e"), sx * 4.4, 1.8, z2, 0.02, 8); spm(root, 0.22, glowMat("#ffe9a0", 1.4), sx * 4.4, 3.7, z2);
      cym(root, 0.2, 0.28, 1.2, T("#8a5a30"), sx * 7.4, 0.6, z2 - 4.5, 0.02, 8); add(root, new THREE.ConeGeometry(1.1, 2.4, 10), T("#2fae4f"), sx * 7.4, 2.3, z2 - 4.5, 0.03);
    }
  }
  const gap = Math.max(proto.d * 1.45, 1.25), rows = N > 12 ? 2 : 1, per = Math.ceil(N / rows), len = per * gap;
  const items: { it: Item; t0: number }[] = [];
  for (let i = 0; i < N; i++) {
    const it = i === 0 ? proto : unitItem(sp.thing), r = i % rows, k = Math.floor(i / rows);
    const x = rows === 2 ? (r ? 1.6 : -1.6) : (k % 2 ? 0.55 : -0.55) * Math.min(1, proto.w);
    it.g.position.set(x, 0, -k * gap - (r ? gap * 0.5 : 0)); it.g.rotation.y = rows === 1 ? (k % 2 ? 0.18 : -0.18) : 0; root.add(it.g);
    items.push({ it, t0: 0.03 + 0.3 * (i / N) });
  }
  const mid = -len * 0.5;
  const lights: THREE.Light[] = [new THREE.HemisphereLight("#ffffff", "#c9d6ea", 1.5), (() => { const d = new THREE.DirectionalLight("#fff4dc", 2.4); d.position.set(5, 12, 8); return d; })()];
  const g0 = (u: number) => lerp(sp.u0, sp.u1, u);
  const cam = (u: number): CamOut => {
    const e = ease(u), rig = ((sp.rig % 4) + 4) % 4, lookZ = Math.max(mid, -9) - 0.5;
    switch (rig) {
      case 0: return { from: lerp3([0.3, 1.9, 5.6], [0.15, 1.65, 4.2], e), look: [0, 0.5, lookZ], blur: 3 };                   // down the row from the front
      case 1: return { from: lerp3([3.6, 1.7, 6.4], [3.0, 1.4, 3.0], e), look: lerp3([0, 0.5, -3], [0, 0.5, -6], e), blur: 4 };   // diagonal, tracking in along the row
      case 2: return { from: lerp3([2.6, 4.6, 6.5], [1.8, 4.0, 4.5], e), look: [0, 0.3, lookZ + 1.5], blur: 2 };               // high three-quarter, looking down the lane
      default: return { from: lerp3([-2.8, 1.3, 7.0], [-2.2, 1.3, 5.8], e), look: [0.1, 0.5, -3.2], blur: 6 };             // low and close on the first ones
    }
  };
  const tick = (u: number) => {
    const g = g0(u);
    items.forEach(({ it, t0 }, i) => {
      const a = pop((g - t0) / 0.08);
      it.g.scale.setScalar(Math.max(0.001, a)); it.g.visible = g >= t0 - 0.001;
      it.fill(sp.fill === false ? 1 : clamp((g - t0 - 0.04) / 0.32)); it.spin?.(g * 6 + i * 0.4);
    });
  };
  return { root, lights, bg: "#bfe6ff", fog: new THREE.Fog("#bfe6ff", 28, 90), cam, tick };
};

// ============================================================ JOURNEY ============================================================
const PITCH = 16, ROAD = 5;
const PASTELS = ["#ff8fa3", "#ffd166", "#7bdff2", "#b2f7a0", "#c3a6ff", "#ffb677", "#9ec5ff", "#f6e7c1"];
const winTex = new Map<string, THREE.Texture>();
const windows = (col: string) => {
  let t = winTex.get(col);
  if (!t) {
    t = canvasTex(64, 128, (c) => {
      c.fillStyle = col; c.fillRect(0, 0, 64, 128); const r = seeded(col.charCodeAt(1) * 7 + col.charCodeAt(3));
      for (let y = 6; y < 120; y += 20) for (let x = 6; x < 60; x += 20) { c.fillStyle = r() < 0.35 ? "#ffe9a0" : "#5a78a8"; c.fillRect(x, y, 12, 12); }
    });
    t.magFilter = THREE.NearestFilter; winTex.set(col, t);
  }
  return t;
};

type Landmark = { g: THREE.Group; tick: (k: number, arrive: number) => void };
/** a flat lettered sign (generic text only, never a real logo) */
const signMesh = (text: string, bg: string, fg: string, w: number, h: number, glow = false): THREE.Mesh => {
  const H = Math.round((256 * h) / w);
  const tex = canvasTex(256, H, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 256, H); c.fillStyle = fg; c.font = `900 ${Math.round(H * 0.62)}px "Arial Black", Arial, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, 128, H * 0.54, 240);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: !glow }));
};
const landmark = (kind: string, label?: string): Landmark => {
  const g = new THREE.Group();
  const spin: THREE.Object3D[] = [], puffs: THREE.Mesh[] = [], bulbs: THREE.Mesh[] = [];
  if (kind === "bank") {   // stone building: steps, six columns, pediment, a gold coin on top and a BANK sign
    bxm(g, 13, 0.5, 11, T("#d9d2c0"), 0, 0.25, 0, 0.04); bxm(g, 12, 0.5, 9.4, T("#e6dfcd"), 0, 0.75, 0.3, 0.04); bxm(g, 11, 0.5, 8, T("#efe8d6"), 0, 1.25, 0.6, 0.04);
    bxm(g, 9.6, 7, 6.4, T("#f3ead6"), 0, 4.75, -1.2, 0.05);
    for (let i = 0; i < 6; i++) cym(g, 0.5, 0.5, 6.6, T("#fffaf0"), -4.5 + i * 1.8, 4.8, 2.9, 0.03, 16);
    bxm(g, 10.6, 0.7, 2.2, T("#e3d6b8"), 0, 8.4, 2.7, 0.04);
    const ped = add(g, new THREE.CylinderGeometry(3.4, 3.4, 2.4, 3), T("#e3d6b8"), 0, 9.9, 2.4, 0.04); ped.rotation.set(PI / 2, PI / 2, 0); ped.scale.set(1, 1, 0.34);
    const sg = signMesh(label ?? "BANK", "#1f3a6e", "#ffffff", 5, 1.25); sg.position.set(0, 7.4, 3.2); g.add(sg);
    bxm(g, 1.8, 3, 0.2, T("#6b4a2a"), 0, 3.0, 2.2, 0.02);
    const coinTop = cym(g, 1.6, 1.6, 0.35, T("#ffc928", { emissive: "#ffc928", emissiveIntensity: 0.5 }), 0, 12.6, 2.3, 0.04, 28); coinTop.rotation.x = PI / 2; spin.push(coinTop);
  } else if (kind === "mint") {   // red-brick factory: three chimneys with puffs of smoke, a gate, a gear, a MINT sign
    bxm(g, 14, 6, 9, T("#c9604a"), 0, 3, 0, 0.05); bxm(g, 14.4, 0.4, 9.4, T("#8a3d30"), 0, 6.1, 0, 0.03);
    for (let i = 0; i < 4; i++) bxm(g, 3.2, 1.6, 8.6, T("#a24a38"), -5.2 + i * 3.45, 7.0, 0, 0.04);
    for (const [x, hgt] of [[-5, 14], [-2.4, 17], [0.2, 12.5]] as [number, number][]) {
      cym(g, 0.9, 1.15, hgt, T("#a0523d"), x, hgt / 2, -2.2, 0.04, 14); cym(g, 1.05, 1.05, 0.5, T("#4a3a34"), x, hgt, -2.2, 0.02, 14);
      for (let q = 0; q < 3; q++) puffs.push(spm(g, 0.8 + q * 0.25, T("#f2f2f2"), x + q * 0.5, hgt + 1.5 + q * 1.6, -2.2));
    }
    bxm(g, 2.4, 3.1, 0.35, T("#3a2a1a"), 4.2, 1.6, 4.7, 0.02);
    const sg = signMesh("MINT", "#ffc928", "#4a2c00", 6, 1.5); sg.position.set(-1.5, 4.6, 4.52); g.add(sg);
    const gear = cym(g, 1.5, 1.5, 0.4, T("#8c93a3"), 4.2, 5.3, 4.6, 0.03, 8); gear.rotation.x = PI / 2; spin.push(gear);
  } else if (kind === "cinema") {   // cinema: big marquee with chasing bulbs, a MOVIES sign, poster boards, a popcorn tower on the roof
    bxm(g, 13, 8, 8, T("#5b3d8a"), 0, 4, 0, 0.05); bxm(g, 13.4, 0.6, 8.4, T("#3a2560"), 0, 8.2, 0, 0.03);
    bxm(g, 10, 1.5, 1.2, T("#ffd23a"), 0, 5.7, 4.6, 0.04);
    const sg = signMesh("MOVIES", "#d8264a", "#ffffff", 7.6, 1.2, true); sg.position.set(0, 5.7, 5.23); g.add(sg);
    for (let i = 0; i < 12; i++) bulbs.push(spm(g, 0.17, glowMat("#fff1a8", 1.6), -4.7 + i * 0.855, 6.6, 5.2), spm(g, 0.17, glowMat("#fff1a8", 1.6), -4.7 + i * 0.855, 4.8, 5.2));
    for (const sx of [-4.2, 4.2]) { bxm(g, 2.4, 3.2, 0.2, T("#1a1a2a"), sx, 2.6, 4.1, 0.03); bxm(g, 2.0, 2.8, 0.1, T(sx < 0 ? "#ff7a59" : "#59c3ff"), sx, 2.6, 4.22); }
    bxm(g, 2.2, 2.8, 0.2, T("#2a1a3a"), 0, 1.5, 4.1, 0.03);
    cym(g, 1.2, 0.9, 2.4, T("#d8264a"), 0, 10.0, 0, 0.04, 12);
    for (let i = 0; i < 5; i++) puffs.push(spm(g, 0.62, T("#fff6d0"), -0.9 + i * 0.45 + (i % 2) * 0.1, 11.7 + (i % 2) * 0.35, 0.1 * i));
  } else if (kind === "studio") {   // record studio: dark building with a giant vinyl record, speaker stacks and a glowing ON AIR sign
    bxm(g, 12, 7, 8, T("#2e2f4a"), 0, 3.5, 0, 0.05); bxm(g, 12.4, 0.5, 8.4, T("#1c1d33"), 0, 7.2, 0, 0.03);
    const rec = cym(g, 3.2, 3.2, 0.3, T("#16161f"), 0, 9.6, 4.2, 0.04, 40); rec.rotation.x = PI / 2; spin.push(rec);
    const lab = cym(g, 1.1, 1.1, 0.34, T("#ff4da6"), 0, 9.6, 4.2, 0, 24); lab.rotation.x = PI / 2; spin.push(lab);
    const sg = signMesh("STUDIO", "#ffd23a", "#2e1a50", 6.4, 1.3); sg.position.set(0, 4.7, 4.03); g.add(sg);
    const air = signMesh("ON AIR", "#e5173f", "#ffffff", 2.8, 0.8, true); air.position.set(-3.6, 6.3, 4.03); g.add(air);
    for (const sx of [-5.3, 5.3]) { bxm(g, 1.8, 3.8, 1.6, T("#1a1a24"), sx, 1.9, 4.4, 0.03); spm(g, 0.55, T("#52526e"), sx, 1.2, 5.25).scale.z = 0.35; spm(g, 0.3, T("#52526e"), sx, 2.9, 5.25).scale.z = 0.35; }
    bxm(g, 2.2, 3.2, 0.2, T("#7a3a6a"), 0, 1.6, 4.05, 0.03);
    for (let i = 0; i < 3; i++) { const n = add(g, new THREE.TorusGeometry(0.25, 0.07, 6, 12, PI * 1.5), glowMat(["#ff4da6", "#37e0ff", "#ffd23a"][i], 1.6), -3 + i * 3, 11.9 + (i % 2), 3.5, 0); spin.push(n); }
  } else if (kind === "vault") {   // the Federal Reserve vault: grey stone block, a giant round steel door with a turning wheel, a FED sign
    bxm(g, 13, 9, 8, T("#9aa3b5"), 0, 4.5, 0, 0.05); bxm(g, 13.6, 0.7, 8.6, T("#6f7a90"), 0, 9.3, 0, 0.04); bxm(g, 12, 0.5, 9.2, T("#b9c1d0"), 0, 0.25, 0.4, 0.04);
    const door = cym(g, 3.2, 3.2, 0.8, T("#c9d2e0"), 0, 4.0, 4.1, 0.04, 36); door.rotation.x = PI / 2; void door;
    add(g, new THREE.TorusGeometry(3.2, 0.25, 8, 40), T("#ffc928", { emissive: "#ffc928", emissiveIntensity: 0.4 }), 0, 4.0, 4.5, 0.02);
    const wheel = new THREE.Group(); wheel.position.set(0, 4.0, 4.9); g.add(wheel);
    for (let i = 0; i < 3; i++) { const sp = bxm(wheel, 4.4, 0.34, 0.3, T("#8c93a3"), 0, 0, 0, 0.02); sp.rotation.z = (i * PI) / 3; }
    spm(wheel, 0.55, T("#ffc928", { emissive: "#ffc928", emissiveIntensity: 0.4 }), 0, 0, 0.15, 0.02); spin.push(wheel);
    const sg = signMesh(label ?? "FED", "#27406b", "#ffffff", 4.2, 1.3); sg.position.set(0, 8.0, 4.35); g.add(sg);
    for (let i = 0; i < 3; i++) bxm(g, 1.8, 0.7, 1.0, T("#ffc928", { emissive: "#ffc928", emissiveIntensity: 0.3 }), -2 + i * 2, 10.0 + (i === 1 ? 0.7 : 0), 0, 0.03);
  } else if (kind === "drawer") {   // a giant wooden chest of drawers with brass knobs, one drawer half open (where the card ends up), a lamp on top
    bxm(g, 10, 9, 5, T("#b9783f"), 0, 4.5, 0, 0.05); bxm(g, 10.6, 0.5, 5.6, T("#8f5a2c"), 0, 9.2, 0, 0.04); bxm(g, 9.4, 0.5, 4.6, T("#6f4521"), 0, 0.25, 0, 0.03);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const x = -2.4 + c * 4.8, y = 1.8 + r * 2.8, out = r === 1 && c === 1 ? 2.2 : 0.0;
      bxm(g, 4.4, 2.4, 0.3 + out, T(out ? "#d29458" : "#cf9156"), x, y, 2.6 + out / 2, 0.03); spm(g, 0.28, T("#ffd24a", { emissive: "#ffc928", emissiveIntensity: 0.4 }), x, y, 2.85 + out, 0.02);
    }
    cym(g, 0.2, 0.4, 2.2, T("#e8e0d0"), -3.6, 10.4, 0, 0.02, 10); add(g, new THREE.ConeGeometry(1.5, 1.5, 14), T("#ffd166", { emissive: "#ffb347", emissiveIntensity: 0.6 }), -3.6, 12.2, 0, 0.03);
    const tag = signMesh("DRAWER", "#fff4d6", "#4a2c00", 3.6, 0.9); tag.position.set(0, 10.4, 2.8); g.add(tag);
  } else if (kind === "shop") {   // a corner shop: striped awning, big glass window, a sign
    bxm(g, 10, 5, 7, T("#ffe3b3"), 0, 2.5, 0, 0.05);
    for (let i = 0; i < 10; i++) bxm(g, 1.0, 0.18, 2.6, T(i % 2 ? "#ffffff" : "#ff5d73"), -4.5 + i, 4.2 - 0.04 * (i % 2), 4.6, 0.015);
    bxm(g, 7, 2.4, 0.12, glowMat("#9fe7ff", 1.1), -0.6, 2.2, 3.55); bxm(g, 1.6, 2.9, 0.14, T("#8a5a30"), 3.6, 1.45, 3.6);
    const sg = signMesh(label ?? "SHOP", "#ff5d73", "#ffffff", 5, 1.1); sg.position.set(0, 5.6, 3.6); g.add(sg);
  } else if (kind === "house") {
    const th = makeThing("house"), k = 9 / Math.max(0.01, th.size) * 0.8; th.root.scale.setScalar(k); g.add(th.root);
  } else {   // "hub": a tall tower with glowing rings (the network / the place the money goes)
    cym(g, 2.2, 3.4, 1.0, T("#dfe6f5"), 0, 0.5, 0, 0.05, 20); cym(g, 1.1, 1.8, 14, T("#7a86ff"), 0, 8, 0, 0.05, 20);
    for (let i = 0; i < 3; i++) { const r = add(g, new THREE.TorusGeometry(2.6 - i * 0.4, 0.22, 10, 40), glowMat(["#37e0ff", "#ff4da6", "#ffd23a"][i], 1.8), 0, 5 + i * 3.6, 0, 0); r.rotation.x = PI / 2; spin.push(r); }
    spm(g, 1.3, glowMat("#ffffff", 2), 0, 15.6, 0); cym(g, 0.08, 0.08, 3, T("#c9d2e0"), 0, 17.8, 0, 0, 8);
  }
  cym(g, 1.6, 2.4, 60, new THREE.MeshBasicMaterial({ color: "#ffe28a", transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 36, 0, 0, 20);
  const baseY = puffs.map((p) => p.position.y);
  return { g, tick: (k, arrive) => {
    spin.forEach((r, i) => { const dir = i % 2 ? -1 : 1; if (kind === "studio") r.rotation.y = k * 3 * dir; else r.rotation.z = k * (kind === "hub" ? 3 : 1.5) * dir; });
    puffs.forEach((pf, i) => { pf.scale.setScalar(0.75 + 0.3 * Math.sin(k * 2 + i * 1.3)); pf.position.y = baseY[i] + 0.3 * Math.sin(k * 1.5 + i); });
    bulbs.forEach((bl, i) => { bl.visible = (Math.floor(k * 3) + i) % 3 !== 0; });
    g.scale.setScalar(1 + (kind === "hub" ? 0.06 : 0.03) * Math.sin(clamp(arrive) * PI));
  } };
};

const kindOfPlace = (to: string) =>
  /federal|reserve|fed|vault/i.test(to) ? "vault"
  : /bank|treasur/i.test(to) ? "bank"
  : /mint|factory|plant|mill/i.test(to) ? "mint"
  : /theat|cinema|movie|film|register|amc/i.test(to) ? "cinema"
  : /music|studio|record|label|artist|industry|song/i.test(to) ? "studio"
  : /drawer|desk|closet|shelf|cabinet|attic|junk/i.test(to) ? "drawer"
  : /shop|store|caf[eé]|coffee|merchant|market|restaurant|diner|snack|counter|stand/i.test(to) ? "shop"
  : /home|house|apartment|phone|app/i.test(to) ? "house" : "hub";
/** a sign for the little shop kinds ("the snack counter" -> SNACKS) */
const labelOf = (s: string): string | undefined => (/snack|popcorn|candy|counter/i.test(s) ? "SNACKS" : /caf[eé]|coffee/i.test(s) ? "CAFE" : /store|market/i.test(s) ? "STORE" : undefined);

const speechBubble = (col: string, s = 1): THREE.Group => {
  const g = new THREE.Group(), m = T(col);
  add(g, new THREE.SphereGeometry(0.5, 20, 14), m, 0, 0, 0, 0.03).scale.set(1.45 * s, 1.0 * s, 0.4 * s);
  const tail = add(g, new THREE.ConeGeometry(0.2 * s, 0.4 * s, 3), m, -0.35 * s, -0.55 * s, 0, 0.025); tail.rotation.set(0, 0, 0.5);
  for (let i = -1; i <= 1; i++) spm(g, 0.065 * s, T("#3a3f58"), i * 0.24 * s, 0.02 * s, 0.2 * s);
  return g;
};
const coinObj = (): THREE.Group => {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: "#ffc928", metalness: 0.75, roughness: 0.3, emissive: "#ffc928", emissiveIntensity: 0.35 });
  add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 28), gold, 0, 0, 0, 0.03).rotation.x = PI / 2; bxm(g, 0.12, 0.4, 0.03, T("#e0a410"), 0, 0, 0.065);
  return g;
};
const boltObj = (): THREE.Group => {
  const g = new THREE.Group(), s = new THREE.Shape();
  [[0.1, 0.7], [-0.35, -0.05], [-0.05, -0.05], [-0.2, -0.7], [0.38, 0.12], [0.06, 0.12], [0.3, 0.7]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false }); geo.translate(0, 0, -0.07);
  add(g, geo, new THREE.MeshToonMaterial({ color: "#ffe14a", emissive: "#ffd000", emissiveIntensity: 1 }), 0, 0, 0, 0.03).scale.setScalar(1.3);
  return g;
};

export const buildJourney = (sp: JourneySpec): Pov3 => {
  const root = new THREE.Group(), R = seeded(sp.seed * 977 + 13);
  // ground, roads and dashes
  const X0 = -4, X1 = 5, Z0 = -9, Z1 = 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), T("#86d46f")); ground.rotation.x = -PI / 2; ground.position.y = -0.02; root.add(ground);
  const road = T("#50566a"), dash = T("#f3e6a0");
  for (let i = X0; i <= X1; i++) { const r = add(root, new THREE.PlaneGeometry(ROAD, (Z1 - Z0 + 2) * PITCH), road, i * PITCH, 0.01, (Z0 + Z1) / 2 * PITCH); r.rotation.x = -PI / 2; }
  for (let j = Z0; j <= Z1; j++) { const r = add(root, new THREE.PlaneGeometry((X1 - X0 + 2) * PITCH, ROAD), road, (X0 + X1) / 2 * PITCH, 0.012, j * PITCH); r.rotation.x = -PI / 2; }
  for (let i = X0; i <= X1; i++) for (let z = Z1 * PITCH; z > Z0 * PITCH; z -= 4) { const d = add(root, new THREE.PlaneGeometry(0.22, 1.8), dash, i * PITCH, 0.02, z); d.rotation.x = -PI / 2; }
  // the route: legs along the roads, ending next to the landmark
  const pts: V3[] = []; let cx = 0, cz = 0; const turn = R() < 0.5 ? 1 : -1;
  pts.push([3.4, 2.3, 8], [0, 2.2, 6]);   // the object leaves the start shop's window (the shop stands in block (0,0), east of the first road)
  const legs = 3 + Math.floor(R() * 2);
  for (let l = 0; l < legs; l++) {
    const alongZ = l % 2 === 0, step = (1 + Math.floor(R() * 2)) * PITCH;
    if (alongZ) cz -= step; else cx += turn * (R() < 0.3 ? -1 : 1) * Math.min(2, 1 + Math.floor(R() * 2)) * PITCH * (l === 1 ? 1 : 0.5 + 0.5 * (l % 3));
    cx = clamp(Math.round(cx / PITCH), X0 + 1, X1 - 1) * PITCH; cz = Math.max(cz, (Z0 + 1) * PITCH);
    pts.push([cx, 2.0 + 1.3 * Math.sin(l * 1.7 + sp.seed) + 0.8, cz]);
  }
  const endP = pts[pts.length - 1];
  const prevP = pts[pts.length - 2], dirX = Math.sign(endP[0] - prevP[0]), side = dirX !== 0 ? dirX : endP[0] > 0 ? -1 : 1, lx = endP[0] + side * (PITCH / 2), lz = endP[2];
  pts[pts.length - 1] = [endP[0] + side * 2.2, 3.6, endP[2]];
  pts.push([lx - side * 3.4, 3.2, lz]);   // the facade: the object ends AT the building, never inside it
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal", 0.5);
  const L = curve.getLength(), tm = (m: number) => m / L;   // metres -> route parameter
  const A = curve.getPoint(0), B = curve.getPoint(0.02); const t0 = B.clone().sub(A).normalize();
  const tN = curve.getTangent(1).normalize();
  /** point on the route; beyond the ends it extends along the end tangents */
  const at = (t: number): THREE.Vector3 => (t < 0 ? curve.getPoint(0).addScaledVector(t0, t * curve.getLength()) : t > 1 ? curve.getPoint(1).addScaledVector(tN, (t - 1) * curve.getLength()) : curve.getPointAt(t));
  const tan = (t: number): THREE.Vector3 => at(clamp(t + 0.004, -0.2, 1.2)).sub(at(clamp(t - 0.004, -0.2, 1.2))).normalize();
  // buildings (inside the blocks, never on the roads)
  const used: V3[] = [];
  for (let i = X0; i < X1; i++) for (let j = Z0; j < Z1; j++) {
    const bx0 = i * PITCH + ROAD / 2 + 0.8, bx1 = (i + 1) * PITCH - ROAD / 2 - 0.8, bz0 = j * PITCH + ROAD / 2 + 0.8, bz1 = (j + 1) * PITCH - ROAD / 2 - 0.8;
    const cxB = (bx0 + bx1) / 2, czB = (bz0 + bz1) / 2;
    if (Math.hypot(cxB - lx, czB - lz) < 9 || Math.hypot(cxB - 8, czB - 8) < 4) continue;
    if (R() < 0.12) { // a little park
      const pk = add(root, new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0), T("#6fcf6a"), cxB, 0.005, czB); pk.rotation.x = -PI / 2;
      for (let k = 0; k < 4; k++) { const tx = lerp(bx0 + 1, bx1 - 1, R()), tz = lerp(bz0 + 1, bz1 - 1, R()); cym(root, 0.2, 0.28, 1.2, T("#8a5a30"), tx, 0.6, tz, 0.02, 8); add(root, new THREE.ConeGeometry(1.1, 2.4, 10), T("#2fae4f"), tx, 2.3, tz, 0.03); }
      continue;
    }
    const nb = 1 + Math.floor(R() * 2), wUnit = (bx1 - bx0) / nb;
    for (let k = 0; k < nb; k++) {
      const w = wUnit - 0.9, d = (bz1 - bz0) * (0.7 + 0.25 * R()), h = 4 + R() * 12 * (0.4 + (Math.abs(i) < 2 ? 0.8 : 0.3)), col = PASTELS[Math.floor(R() * PASTELS.length)];
      const wt = windows(col).clone(); wt.needsUpdate = true; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3.2)));
      const wm = new THREE.MeshToonMaterial({ map: wt }), top = T(col);
      const b = add(root, new THREE.BoxGeometry(w, h, d), [wm, wm, top, top, wm, wm], bx0 + wUnit * (k + 0.5), h / 2, czB + (R() - 0.5) * 1.2, 0.05);
      if (R() < 0.45) add(root, new THREE.ConeGeometry(Math.min(w, d) * 0.62, 2.2 + R() * 1.6, 4), T("#e0553f"), b.position.x, h + 1.2, b.position.z, 0.04).rotation.y = PI / 4;
      used.push([b.position.x, h, b.position.z]);
    }
  }
  // lamp posts + trees along the route
  for (let k = 0; k < 40; k++) { const p = at(k / 40), n = new THREE.Vector3(-tan(k / 40).z, 0, tan(k / 40).x).normalize(); const s = k % 2 ? 1 : -1; cym(root, 0.07, 0.09, 3.6, T("#4a4f5e"), p.x + n.x * 2.7 * s, 1.8, p.z + n.z * 2.7 * s, 0.02, 8); spm(root, 0.22, glowMat("#ffe9a0", 1.4), p.x + n.x * 2.7 * s, 3.7, p.z + n.z * 2.7 * s); }
  // town life (Nov 24): trees along the route, cars driving on the roads, people on the kerbs
  const normalAt = (t: number) => { const tn = tan(t); return new THREE.Vector3(-tn.z, 0, tn.x).normalize(); };
  for (let k = 0; k < 44; k++) {
    const t = k / 44 + R() * 0.01, p = at(t), n = normalAt(t), sd = k % 2 ? 1 : -1, o = ROAD / 2 + 1.6 + R() * 1.4;
    const tx = p.x + n.x * o * sd, tz = p.z + n.z * o * sd;
    if (Math.hypot(tx - lx, tz - lz) < 9) continue;
    const ts = 0.8 + R() * 0.6; cym(root, 0.2 * ts, 0.28 * ts, 1.2 * ts, T("#8a5a30"), tx, 0.6 * ts, tz, 0.02, 8); add(root, new THREE.ConeGeometry(1.1 * ts, 2.4 * ts, 10), T(R() < 0.7 ? "#2fae4f" : "#4fc46a"), tx, 2.3 * ts, tz, 0.03);
  }
  const carCols = ["#ff5d73", "#ffd166", "#5db4ff", "#ffffff", "#7ed957", "#c3a6ff", "#ff9a3c"], wheelM = T("#23252f");
  const cars: { g: THREE.Group; alongX: boolean; line: number; lane: number; c0: number; dir: number; sp: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group(), col = carCols[Math.floor(R() * carCols.length)], van = R() < 0.25;
    bxm(g, 1.9, 0.75, 4.1, T(col), 0, 0.7, 0, 0.03); bxm(g, 1.65, 0.65, van ? 3.0 : 2.1, T(van ? col : "#dff4ff"), 0, 1.35, van ? -0.4 : -0.2, 0.03);
    bxm(g, 1.5, 0.12, 0.05, glowMat("#fff4b0", 1.4), 0, 0.75, 2.07); bxm(g, 1.5, 0.12, 0.05, glowMat("#ff4a4a", 1.2), 0, 0.75, -2.07);
    for (const sx of [-0.95, 0.95]) for (const sz of [-1.3, 1.3]) { const w = cym(g, 0.4, 0.4, 0.3, wheelM, sx, 0.4, sz, 0.01, 10); w.rotation.z = PI / 2; }
    const pt = pts[i % pts.length], alongX = i % 2 === 1, dir = R() < 0.5 ? -1 : 1;
    const line = alongX ? Math.round(pt[2] / PITCH) * PITCH : Math.round(pt[0] / PITCH) * PITCH, c0 = (alongX ? pt[0] : pt[2]) - 40 + R() * 80;
    cars.push({ g, alongX, line, lane: dir * 1.25, c0, dir, sp: 16 + R() * 22 }); root.add(g);
  }
  const shirts = ["#ff5d73", "#ffd166", "#5db4ff", "#7ed957", "#c3a6ff", "#ff9a3c", "#ffffff"], skins = ["#f1c9a0", "#c68642", "#8d5524", "#e0ac69"];
  const folk: { g: THREE.Group; base: THREE.Vector3; ph: number; d: THREE.Vector3; sd: number }[] = [];
  for (let i = 0; i < 34; i++) {
    const t = 0.02 + 0.98 * R(), p = at(t), n = normalAt(t), sd = R() < 0.5 ? -1 : 1, o = ROAD / 2 + 0.9 + R() * 1.1;
    const base = p.clone().addScaledVector(n, o * sd); base.y = 0;
    if (Math.hypot(base.x - lx, base.z - lz) < 10) continue;
    const g = new THREE.Group(); cym(g, 0.3, 0.34, 0.95, T(shirts[i % shirts.length]), 0, 1.15, 0, 0.02, 10); cym(g, 0.22, 0.22, 0.75, T("#2f3447"), 0, 0.4, 0, 0.02, 8); spm(g, 0.32, T(skins[i % skins.length]), 0, 1.95, 0, 0.02);
    g.position.copy(base); root.add(g); folk.push({ g, base, ph: R() * 6.28, d: tan(t).clone(), sd: R() < 0.5 ? -1 : 1 });
  }
  // landmark
  const endKind = kindOfPlace(sp.to);
  const lm = landmark(endKind, labelOf(sp.to)); lm.g.position.set(lx, 0, lz); lm.g.rotation.y = side > 0 ? -PI / 2 : PI / 2; root.add(lm.g);
  // the start: a little shop / house / factory at the first corner, where the money leaves (Nov 24 round 2: the journey starts where the action happens)
  let startKind = sp.from ? kindOfPlace(sp.from) : "shop";
  if (startKind === endKind) startKind = endKind === "house" ? "shop" : "house";
  const lm0 = landmark(startKind, labelOf(sp.from ?? "")); lm0.g.position.set(8, 0, 8); lm0.g.rotation.y = -PI / 2; root.add(lm0.g);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: "#ffe14a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -PI / 2; ring.position.set(lx - side * 3.4, 0.45, lz); root.add(ring);
  // the followed object
  const obj = /coin|money|cash|dollar|fee|pay|card|penn|bill|fare|tip|price/i.test(sp.obj) ? coinObj() : /bolt|energy|electric|power|spark/i.test(sp.obj) ? boltObj() : speechBubble("#ffffff", 1.3);
  const objS = 0.9, objW = (/coin|money|cash|dollar|fee|pay|card|penn|bill|fare|tip|price|bolt|energy|electric|power|spark/i.test(sp.obj) ? 1.0 : 1.9) * 0.9; obj.scale.setScalar(objS); root.add(obj);   // objW: its width in metres at scale 1
  const trail: THREE.Mesh[] = []; for (let i = 0; i < 7; i++) trail.push(spm(root, 0.13 - i * 0.012, T(i % 2 ? "#ffffff" : "#bfe6ff"), 0, 0, 0));
  // drifting chips: little speech bubbles around the route
  const chips: { g: THREE.Group; base: THREE.Vector3; ph: number; w: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const t = R(), p = at(t), n = new THREE.Vector3(-tan(t).z, 0, tan(t).x).normalize(), sd = R() < 0.5 ? -1 : 1;
    const cs = 0.4 + R() * 0.3, g = speechBubble(["#ffffff", "#bfe6ff", "#c8f7c5", "#ffd9e6", "#fff1b0"][i % 5], cs);
    const base = p.clone().addScaledVector(n, sd * (3.4 + R() * 2.2)); base.y = p.y + 0.4 + R() * 2.6; g.position.copy(base); root.add(g); chips.push({ g, base, ph: R() * 6.28, w: 1.45 * cs });
  }
  // coins that pop out of the landmark on arrival
  const coinsM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14), new THREE.MeshStandardMaterial({ color: "#ffc928", metalness: 0.7, roughness: 0.3, emissive: "#ffc928", emissiveIntensity: 0.4 }), 28);
  root.add(coinsM);
  const lights: THREE.Light[] = [new THREE.HemisphereLight("#d8efff", "#8fbf7a", 1.35), (() => { const d = new THREE.DirectionalLight("#fff3d6", 2.6); d.position.set(10, 22, 8); return d; })()];
  const ARR = 0.86, g0 = (u: number) => lerp(sp.u0, sp.u1, u), tOf = (g: number) => clamp(g / ARR);
  const P0 = at(0), shopPt = new THREE.Vector3(4.2, 2.6, 8), face = new THREE.Vector3(lx - side * 3.4, 4.6, lz);
  const cam = (u: number): CamOut => {
    const t = tOf(g0(u)), P = at(t), Tn = tan(t), N = new THREE.Vector3(-Tn.z, 0, Tn.x).normalize(), rig = sp.rig, sway = Math.sin(u * PI * 2 + sp.seed) * 0.5;
    const look = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
    const arriving = g0(u) > ARR ? ease((g0(u) - ARR) / (1 - ARR)) : 0;
    switch (rig) {
      case 4: { const c = new THREE.Vector3(0.6, 4.2, 18.2).addScaledVector(P.clone().sub(P0), 0.45); c.y += 0.5 * u; return { from: look(c), look: look(P.clone().lerp(shopPt, 1 - clamp(t / 0.07))), blur: 3 }; }                     // across the road from the shop: the object pops out of the window and flies off
      case 5: { const c = new THREE.Vector3(lx - side * 40, lerp(8.5, 6.5, ease(u)), lz + 0.4); return { from: look(c), look: look(face.clone().lerp(P, 0.35 * (1 - arriving))), blur: 3 }; }  // the landmark's facade from the street: the object lands, coins burst
      case 1: { const c = P.clone().addScaledVector(N, 0.9).addScaledVector(Tn, -6).add(new THREE.Vector3(0, 2.8, 0)); return { from: look(c), look: look(P.clone().addScaledVector(Tn, 5)), blur: 4 }; }
      case 2: { const c = P.clone().addScaledVector(Tn, -6).add(new THREE.Vector3(sway * 2, 11, 0)); return { from: look(c), look: look(P.clone().addScaledVector(Tn, 3)), blur: 3 }; }
      case 3: { const rem = Math.max(0, (1 - t) * L), d = Math.min(6, rem), w = 1 - d / 6; const c = at(t + tm(d)).addScaledVector(N, -sway - 3.6 * w).add(new THREE.Vector3(0, 0.6 + 1.2 * w, 0)); return { from: look(c), look: look(P), blur: 4 }; }
      default: { const c = at(t - tm(7)).addScaledVector(N, sway).add(new THREE.Vector3(0, 1.3 + 1.6 * arriving, 0)); return { from: look(c), look: look(P.clone().addScaledVector(Tn, 3).add(new THREE.Vector3(0, 0.1, 0))), blur: 4 }; }
    }
  };
  const tick = (u: number, camPos: THREE.Vector3) => {
    const g = g0(u), t = tOf(g), P = at(t), arrived = clamp((g - ARR) / (1 - ARR));
    obj.position.copy(P); obj.lookAt(camPos); obj.rotation.z += Math.sin(g * 40) * 0.08;
    // Nov 24: nothing may cover the town: the followed object stays <= ~20% of the frame width, chips <= ~9% (frame width at distance d = 0.41 d)
    const cap = (w: number, pos: THREE.Vector3, share: number) => Math.min(1, (share * 0.41 * pos.distanceTo(camPos)) / w);
    obj.scale.setScalar(objS * Math.min(1, cap(objW, P, 0.2)) * pop(g / 0.04) * (1 - ease(clamp((arrived - 0.05) / 0.4))) + 0.001);
    trail.forEach((m, i) => { m.position.copy(at(t - (i + 1) * 0.012)); m.scale.setScalar(Math.max(0.001, 1 - arrived * 3)); });
    chips.forEach((c, i) => { c.g.position.set(c.base.x + Math.sin(g * 20 + c.ph) * 0.35, c.base.y + Math.sin(g * 14 + c.ph * 2) * 0.35 + g * 1.2 * (i % 3), c.base.z + Math.cos(g * 18 + c.ph) * 0.3); c.g.lookAt(camPos); c.g.scale.setScalar(Math.max(0.001, cap(c.w, c.g.position, 0.09))); });
    lm.tick(g * 8, arrived); lm0.tick(g * 8, clamp(g * 10));
    { const rk = clamp(arrived * 1.3); ring.scale.setScalar(0.6 + rk * 13); (ring.material as THREE.MeshBasicMaterial).opacity = rk > 0 && rk < 1 ? 0.85 * (1 - rk) : 0; }
    // town life: cars drive along their roads (hidden when they would cross the lens), people shuffle on the kerbs
    cars.forEach((c) => {
      const span = 100, along = c.c0 + ((((c.dir * c.sp * g * 4) % span) + span) % span);
      const x = c.alongX ? along : c.line + c.lane, z = c.alongX ? c.line + c.lane : along;
      c.g.position.set(x, 0, z); c.g.rotation.y = c.alongX ? (c.dir > 0 ? PI / 2 : -PI / 2) : c.dir > 0 ? 0 : PI;
      c.g.scale.setScalar(c.g.position.distanceTo(camPos) < 13 || c.g.position.distanceTo(P) < 5 ? 0.001 : 1);
    });
    folk.forEach((f) => {
      f.g.position.set(f.base.x + f.d.x * Math.sin(g * 7 + f.ph) * 1.4 * f.sd, Math.abs(Math.sin(g * 30 + f.ph)) * 0.12, f.base.z + f.d.z * Math.sin(g * 7 + f.ph) * 1.4 * f.sd);
      f.g.scale.setScalar(f.g.position.distanceTo(camPos) < 6 || f.g.position.distanceTo(P) < 3 ? 0.001 : 1);
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < 28; i++) {
      const k = clamp(arrived * 1.6 - (i % 7) * 0.05), a = i * 2.4 + sp.seed, vy = 5 + (i % 5), rr = 1.2 + (i % 4) * 0.7;
      const x = lx + Math.cos(a) * rr * k * 2, z = lz + Math.sin(a) * rr * k * 2, y = 5 + vy * k - 9 * k * k;
      s.setScalar(k > 0 && k < 1 ? 1 : 0.0001); q.setFromEuler(new THREE.Euler(k * 12 + i, a, k * 6)); m.compose(new THREE.Vector3(x, Math.max(0.2, y), z), q, s); coinsM.setMatrixAt(i, m);
    }
    coinsM.instanceMatrix.needsUpdate = true;
  };
  return { root, lights, bg: "#9ad8ff", fog: new THREE.Fog("#bfe6ff", 46, 150), cam, tick };
};
