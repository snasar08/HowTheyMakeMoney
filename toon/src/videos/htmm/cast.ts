// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, swingKid, soldier, townsfolk, OFFICER, KID, PARENT, fxNote, fxBurst, fxSplash, fxStars, fxCreak, fxRing, fxBlob, fxShadow, fxContact, fxPlank, fxDrum,
  Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import {
  FPS, D0, FILES, ROW_GAP, COUNT, PARK, SHOTS, SNAP, DROP0, DROP1, DROP_H, V3, front, marchPhase, stomp, deckY, dropW, dropU, shapeZ,
  smooth, clamp01, BridgeState,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const SOLDIER = [0, 1, 2, 3].map((v) => soldier(v));
const BARE = [0, 1, 2, 3].map((v) => soldier(v, { hat: null }));
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day"; void 0;
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const SWAPS: Record<number, number[]> = { 4: [16.17, 17.3], 5: [19.48, 20.6], 6: [21.9, 23.7], 7: [29.4, 30.6], 8: [SNAP] };
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- crowd by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };

const exprMarch = (id: number, t: number, i: number, tau: number): { expr: Expr; look: number } => {
  const lau = i % 3 === 0, whi = i % 5 === 1, L = LEAD;
  switch (id) {
    case 1: return { expr: lau ? "laugh" : whi ? "whistle" : "grin", look: 0 };
    case 2: case 3: return { expr: i % 4 === 3 ? "smile_closed" : i % 2 ? "neutral" : "stern", look: 0 };
    case 4: return t < 16.17 - L ? { expr: i % 2 ? "neutral" : "stern", look: 0 } : t < 17.3 - L ? { expr: lau ? "shock" : "nervous", look: 0 } : { expr: "neutral", look: 0 };
    case 5: return { expr: t < 19.48 - L ? "neutral" : t < 20.6 - L ? "grin" : i % 2 ? "laugh" : "grin", look: 0 };
    case 6: return { expr: (i === 2 && t > 21.9 - L) || (t > 23.7 - L && i % 4 === 1) ? "whistle" : t > 23.7 - L && lau ? "laugh" : "grin", look: 0 };
    case 7: return t < 29.4 - L ? { expr: lau ? "laugh" : "grin", look: 0 } : t < 30.6 - L ? { expr: i % 2 ? "nervous" : "grin", look: -1 } : { expr: "nervous", look: 0 };
    case 8: return { expr: tau < SNAP - L ? "nervous" : "shock", look: tau < SNAP + 0.6 ? -1 : 0 };
    default: return { expr: whi ? "whistle" : "grin", look: 0 };
  }
};

/** the marching column (shots 1-8, 13) */
const column = (id: number, t: number, b: BridgeState, cam: CamInfo, out: Stage) => {
  const s = SHOTS[id - 1], tau = s.tau(t);
  const stopT = SNAP + 0.3, walkT = id === 8 ? Math.min(tau, stopT) : tau;
  const F = front(walkT), ph = marchPhase(walkT), st = stomp(tau);
  const falling = id === 8 && tau >= DROP0;
  for (let i = 0; i < COUNT; i++) {
    const row = i >> 2, x0 = FILES[i & 3] + (hh(i) - 0.5) * 0.08, z = F + row * ROW_GAP + (hh(i, 2) - 0.5) * 0.1;
    let x = x0, y = Math.abs(z) <= 30 ? deckY(z, b) : D0;
    const who: Who = { i, o: SOLDIER[vOf(i)], okey: `s${vOf(i)}` };
    let { expr, look } = exprMarch(id, t, i, tau);
    let mode: "march" | "stand" | "fall" | "sit" = id === 8 && tau >= SNAP + 0.25 ? "stand" : "march";
    let tilt = 0;
    if (falling) {
      // the soldiers lag the falling deck a little (cartoon hang time), then sit in the water
      const lagY = D0 + b.bounce * shapeZ(z) - dropU(tau - 0.13) * DROP_H * dropW(z);
      const air = Math.max(0, lagY - y);
      y += air;
      const u = clamp01((tau - DROP0) / (DROP1 - DROP0));
      x = x0 + (hh(i, 3) - 0.5) * 0.7 * u;
      mode = tau < DROP1 + 0.13 ? "fall" : "sit";
      tilt = mode === "fall" ? (hh(i, 4) - 0.5) * 50 * u : 0;
      if (mode === "sit") expr = i % 3 ? "dazed" : "shock";
    }
    const view = viewOf(cam, x, z, 0, -1);
    const blink = expr !== "whistle" ? lidAt(t, i, SWAPS[id]) : 0;
    const fo: FrontOpts = { phase: mode === "march" ? ph : 0, expr, mode, look, blink, lift: 60 * st, tilt };
    // side views: the stance foot keeps pace with the column (0.8 m steps at 2 steps/s), foreshortened by the view
    const so: SideOpts = { phase: mode === "march" ? ph : 0, expr, mode: mode === "march" ? "march" : "stand", blink, stomp: st, stride: view.fs };
    out.places.push(person(cam, who, x, y, z, mode === "fall" || mode === "sit" ? { side: false, mirror: false } : view, fo, so));
    if (mode === "march" || mode === "stand") blob(out, x, y, z);
    // whistled notes drift up from whistlers near the lens
    if (expr === "whistle" && (id === 6 || id === 1 || id === 13) && cam.pos.distanceTo(tmp.set(x, y, z)) < 16) {
      for (let n = 0; n < 4; n++) {
        const age = ((t - 21.9 + n * 0.42 + hh(i, 5)) % 1.68) / 1.68;
        const pop = Math.min(1, age * 7) * (age > 0.82 ? (1 - age) / 0.18 : 1);
        if (pop <= 0.02) continue;
        const kind = (n + i) % 2, side = 0.16 + 0.32 * age + 0.05 * Math.sin(age * 9 + n);
        out.fx.push({ key: `note${kind}`, cw: 220, ch: 260, draw: (p) => fxNote(p, kind), x: x + cam.right.x * side, y: y + 1.5 + 0.85 * age, z: z + cam.right.z * side - 0.1,
          w: 0.17 * pop, h: 0.2 * pop, rot: 0.3 * Math.sin(age * 6 + n) });
      }
    }
  }
};

const sitters = (cam: CamInfo, t: number, out: Stage, spots: [number, number, number][], exprs: (i: number) => Expr, stars: (i: number) => boolean, water: boolean) => {
  spots.forEach(([x, y, z], i) => {
    const bare = i % 3 === 1;
    const v = vOf(i + 3), who: Who = { i, o: bare ? BARE[v] : SOLDIER[v], okey: `${bare ? "b" : "s"}${v}` };
    const expr = exprs(i), bob = water ? 0.03 * Math.sin(t * 2.2 + i) : 0;
    out.places.push(person(cam, who, x, y + bob, z, { side: false, mirror: false }, { mode: "sit", expr, blink: lidAt(t, i), look: 0 }, {}));
    if (stars(i)) {
      const u = (t * 0.9 + hh(i)) % 1;
      out.fx.push({ key: `stars${q(u, 30)}`, cw: 420, ch: 210, draw: (p) => fxStars(p, q(u, 30)), x, y: y + bob + 1.3, z, w: 0.75, h: 0.375 });
    }
    if (water) {
      const u = ((t + hh(i, 7) * 2) % 2.2) / 2.2;
      out.fx.push({ key: `ring${q(u, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q(u, 30)), x, y: 0.03, z, w: 2.0, h: 2.0, flat: true });
      // darker water right where the body meets the surface (only the front arc shows below the card)
      out.fx.push({ key: `blob|contact|${WATERLINE}`, cw: 128, ch: 128, draw: (p) => fxContact(p, WATERLINE), x, y: 0.034 + bob * 0.3, z, w: 0.7, h: 0.5, flat: true });
      if (bare) out.fx.push({ key: "shako", cw: 200, ch: 200, draw: shakoAlone, x: x + 0.55 + 0.3 * hh(i, 8), y: 0.12 + 0.03 * Math.sin(t * 2 + i), z: z - 0.3, w: 0.42, h: 0.42, rot: -0.5 + hh(i, 6) });
    } else {
      out.fx.push({ key: "puddle", cw: 300, ch: 150, draw: puddle, x, y: D0 + 0.02, z: z - 0.05, w: 1.5, h: 0.75, flat: true });
      blob(out, x, y, z, 1.05, 0.8);
    }
  });
};
const WATERLINE = hexOf([0.3, 0.36, 0.52], 1);
/** flotsam in the near water of the river shots (9-10), so the bottom of the frame is not empty: hats, planks, a drum.
 *  World positions 2.5-5 m in front of both river cameras (z -27 / -25.4 looking +z); half under the surface, bobbing. */
const FLOAT: { kind: "shako" | "plank" | "drum"; x: number; z: number; s: number; r: number }[] = [
  // round-4 river cameras sit at z -24.6 / -24.2: the two nearest pieces were 0.7-1.5 m from the lens (cut-off blobs)
  { kind: "shako", x: -0.25, z: -22.5, s: 0.46, r: 0.6 }, // (drum removed: cut by the frame edge it read as a blob)
  { kind: "shako", x: 0.95, z: -24.6, s: 0.42, r: 0.25 }, // (near plank removed: cut by the frame edge)
];
const flotsam = (t: number, out: Stage) =>
  FLOAT.forEach((f, i) => {
    const bob = 0.03 * Math.sin(t * 1.9 + i * 1.7), r = f.r + 0.08 * Math.sin(t * 1.3 + i);
    const [cw, ch, draw, ar] = f.kind === "shako" ? [200, 200, shakoAlone, 1] as const : f.kind === "plank" ? [320, 110, fxPlank, 110 / 320] as const : [260, 240, fxDrum, 240 / 260] as const;
    const w = f.s, h = f.s * ar;
    out.fx.push({ key: f.kind, cw, ch, draw, x: f.x, y: 0.28 * h + bob, z: f.z, w, h, rot: r });
    out.fx.push({ key: `ring${q(((t * 0.45 + i * 0.3) % 1), 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q(((t * 0.45 + i * 0.3) % 1), 30)), x: f.x, y: 0.03, z: f.z, w: 1.1 * f.s + 0.5, h: 1.1 * f.s + 0.5, flat: true });
  });
const shakoAlone = (p: Pen) => {
  p.poly([[42, 160], [158, 160], [166, 50], [34, 50]], "#3a3d47", 8);
  p.ell(100, 158, 60, 10, "#16171b", 7, 0, 180);
  p.ell(100, 96, 14, 12, "#c9ccd2", 6);
  p.ell(100, 36, 14, 14, "#2b7a4b", 6);
};
const puddle = (p: Pen) => { p.ell(150, 75, 140, 58, "#6f97c6", 0); p.ell(120, 62, 60, 16, "#a9c9ea", 0); };

/** the extras hold still and only cheer on cue: "pride of the whole town", "like a crowd of tourists" */
const CHEER: [number, number][] = [[8.01 - LEAD, 9.45], [65.96 - LEAD, 67.5]];
const townsfolkAt = (cam: CamInfo, t: number, out: Stage) => {
  const spots: [number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const bank = i < 13 ? -1 : 1, k = i % 13, sx = k % 2 ? 1 : -1;
    spots.push([sx * (5.2 + (k >> 1) * 1.7 + hh(i) * 0.6), bank * (31.6 + hh(i, 2) * 3.2)]);
  }
  const on = CHEER.some(([a, b]) => t >= a && t < b);
  spots.forEach(([x, z], i) => {
    const kid = i % 5 === 2, o = kid ? KID : FOLK[i % 6], hop = kid && on ? Math.max(0, Math.sin(t * 7 + i)) * 0.18 : 0;
    const who: Who = { i: i + 200, o, okey: kid ? "kid" : `f${i % 6}` };
    const expr: Expr = (["smile", "grin", "laugh", "smile_closed"] as Expr[])[i % 4];
    const fo: FrontOpts = { mode: "stand", expr, wave: i % 3 === 2 || !on ? undefined : q(Math.sin(t * 9 + i * 1.3), 30), blink: lidAt(t, i + 40) };
    out.places.push(person(cam, who, x, D0 + hop, z, { side: false, mirror: false }, fo, {}, kid ? 0.72 : 1));
    blob(out, x, D0, z, kid ? 0.72 : 1, hop > 0 ? 0.6 : 1);
  });
};

/** soldiers strolling out of step across the rebuilt bridge (shot 15): own pace kept (sound), poses on ones */
const tourists = (cam: CamInfo, t: number, out: Stage) => {
  const t0 = 62.08;
  for (let i = 0; i < 24; i++) {
    const sp = 0.55 + hh(i) * 0.5, z = -4 + (i / 24) * 28 + hh(i, 2) * 1.5 - sp * (t - t0), x = (hh(i, 3) - 0.5) * 4.0;
    const bare = i % 5 === 2, v = vOf(i), who: Who = { i, o: bare ? BARE[v] : SOLDIER[v], okey: `${bare ? "b" : "s"}${v}` };
    const prop = i % 7 === 3 ? "icecream" : bare ? "shako" : null;
    const lick = prop === "icecream" && (t * 0.7 + hh(i, 4)) % 1 < 0.45;
    const expr: Expr = lick ? "lick" : (["smile", "smile_closed", "grin", "smile"] as Expr[])[i % 4];
    const phase = q(((t - t0) * sp / 1.4 + hh(i, 5)) % 1, 120); // cadence sp/1.4 Hz unchanged = 0.7 m per step
    const look = Math.round(Math.sin(t * 0.8 + i * 1.7) * 1.2);
    const fo: FrontOpts = { mode: "stroll", phase, expr, look: Math.max(-1, Math.min(1, look)), prop, blink: lidAt(t, i) };
    const view = viewOf(cam, x, z, 0, -1);
    const so: SideOpts = { mode: "march", phase, expr, stomp: 0.55, stride: 0.875 * view.fs };
    out.places.push(person(cam, who, x, D0, z, view, fo, so));
    blob(out, x, D0, z);
  }
};

// officer hammering the new rule onto a sign at the bridge end (shot 14)
export const HITS = [59.79, 60.33, 61.69];
export const SIGN_AT: V3 = [2.25, D0, -30.9];
/** 0 = hammer up, 1 = struck. Reference action timing: 4 f wind-up, held ~7 f at the top, a 1-frame strike on the word */
const hammerK = (t: number) => {
  let k = 1;
  for (const th of HITS) {
    const n = (t - th) * FPS; // frames to contact
    if (n >= -11 && n < -7) k = Math.min(k, 1 - smooth((n + 11) / 4));
    else if (n >= -7 && n < 0) k = 0;
  }
  return k;
};
const officer = (cam: CamInfo, t: number, out: Stage) => {
  const fo: FrontOpts = { mode: "stand", expr: "stern", prop: ["hammer", q(hammerK(t), 30)], blink: lidAt(t, 99), facing: 1 };
  out.places.push(person(cam, { i: 99, o: OFFICER, okey: "off" }, 3.35, D0, -31.55, { side: false, mirror: false }, fo, {}));
  blob(out, 3.35, D0, -31.55, 1.1);
  for (const th of HITS) if (t >= th && t < th + 5 / FPS) {
    const u = (t - th) / (5 / FPS);
    out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: 2.95, y: D0 + 1.55, z: -31.0, w: 0.9, h: 0.9 });
  }
};

// swing in the park (shot 12): pushes land at the back end of every swing, the arc grows
export const SWING_T = 1.55, PUSH0 = 48.79;
const pushes = [0, 1, 2, 3].map((k) => PUSH0 + k * SWING_T);
export const swingAmp = (t: number) => 6 + pushes.reduce((a, tp) => a + 11 * smooth((t - tp) / 0.3), 0);
export const swingAngle = (t: number) => -((swingAmp(t) * Math.PI) / 180) * Math.cos((2 * Math.PI * (t - PUSH0)) / SWING_T);
/** the swing kid's back (seat + ~.12 m, ~8 cm behind the rope) in world space when the swing is at angle th */
const kidBack = (th: number): [number, number] => {
  const lx = -0.083, ly = -2.174; // local to the swing card (pivot at the origin), card yawed by PI
  return [PARK[0] - (lx * Math.cos(th) - ly * Math.sin(th)), PARK[1] + 2.88 + lx * Math.sin(th) + ly * Math.cos(th)];
};
/** where the parent stands for push k: hands reach the kid's back at the back of the arc with the arms ~ straight */
const pushSpot = (k: number) => {
  const A = (swingAmp(pushes[k]) * Math.PI) / 180, [bx, by] = kidBack(-A);
  const cy = 975 - (by - D0) / SU, dy = cy - 515, dx = Math.sqrt(Math.max(120 * 120, 222 * 222 - dy * dy));
  return { px: bx + (53 + dx) * SU, hand: [300 + 53 + dx, cy] as [number, number] };
};
const park = (cam: CamInfo, t: number, out: Stage) => {
  const th = swingAngle(t), vel = Math.sin((2 * Math.PI * (t - PUSH0)) / SWING_T);
  const A = (swingAmp(t) * Math.PI) / 180, kick = q(0.35 + 0.55 * vel, 40);
  const expr: Expr = A < 0.35 ? "smile" : A < 0.6 ? "grin" : "laugh";
  const light = light2D(cam, true), lid = lidAt(t, 78);
  out.places.push({ key: `swing|${kick}|${expr}|${q(light)}|${lid}`, geo: "swing", x: PARK[0], y: PARK[1] + 2.88, z: PARK[2], yaw: Math.PI, roll: th,
    draw: (p) => swingKid(p, KID, kick, expr, light, lid), size: [490, 1610, 0.7] });
  const push = Math.max(0, ...pushes.map((tp) => 1 - Math.abs(t - tp + 0.05) / 0.32));
  // stand at this push's spot; step back to the next spot between pushes (the arc grows after every push)
  let k = 0;
  while (k < pushes.length - 1 && t > pushes[k] + 0.35) k++;
  const cur = pushSpot(k), prev = pushSpot(Math.max(0, k - 1));
  const step = k > 0 ? smooth((t - (pushes[k - 1] + 0.35)) / (SWING_T - 0.7)) : 1;
  const px = prev.px + (cur.px - prev.px) * step, pz = PARK[2] + 0.1;
  const so: SideOpts = { mode: "push", pose: q(push, 40), expr: push > 0.3 ? "grin" : "smile", blink: lidAt(t, 77), hand: cur.hand };
  out.places.push({ ...person(cam, { i: 77, o: PARENT, okey: "parent" }, px, D0, pz, { side: true, mirror: true }, {}, so), mirror: false, yaw: Math.PI });
  blob(out, px, D0, pz);
};

/** everything with a face in shot `id` at time t */
const stageBridge = (id: number, t: number, b: BridgeState, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  if (s.crowd === "march" || s.crowd === "fall") column(id, t, b, cam, out);
  if (s.towns) townsfolkAt(cam, t, out);
  if (s.crowd === "water") {
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) spots.push([FILES[i & 3] * 1.12 + (hh(i, 11) - 0.5) * 0.6, -0.6, -21.6 + (i >> 2) * 1.6 + (hh(i, 12) - 0.5) * 0.7]);
    const happy: Expr[] = ["relief", "relief_open", "smile", "relief"], hurt: Expr[] = ["pained", "dazed", "pained", "dazed"];
    sitters(cam, t, out, spots, (i) => (id === 9 ? happy : hurt)[i % 4], (i) => id === 10 && i % 4 === 1, true);
    flotsam(t, out);
  }
  if (s.crowd === "bank") {
    const spots: [number, number, number][] = [[-7.2, D0, -33.6], [-6.1, D0, -32.1], [-5.0, D0, -34.3], [-4.3, D0, -31.6], [-3.4, D0, -33.2],
      [-2.4, D0, -31.9], [-6.8, D0, -35.4], [-4.1, D0, -35.6], [-1.9, D0, -34.6]];
    const ex: Expr[] = ["dazed", "relief", "smile_closed", "pained"];
    sitters(cam, t, out, spots, (i) => ex[i % 4], (i) => i % 4 === 0, false);
    officer(cam, t, out);
  }
  if (s.crowd === "tourists") tourists(cam, t, out);
  if (id === 12) park(cam, t, out);
  return out;
};

// ---------------- one-off effects ----------------
export const snapFx = (tau: number, at: V3, out: Stage) => {
  if (tau >= SNAP && tau < SNAP + 0.45) {
    const u = (tau - SNAP) / 0.45;
    out.fx.push({ key: `bigburst${q(u, 30)}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, q(u, 30)), x: at[0], y: at[1] + 0.12, z: at[2] - 0.15, w: 1.5, h: 1.5 });
  }
};
export const splashFx = (tau: number, out: Stage) => {
  const u = (tau - DROP1) / 1.1;
  if (u < 0 || u >= 1) return;
  for (const [x, z, s] of [[-2.9, -24, 1], [2.9, -21, 0.9], [-2.9, -15, 0.85], [2.9, -9, 0.8], [0, -27.5, 1.2], [-2.9, -5, 0.6]] as const)
    out.fx.push({ key: `splash${q(u, 30)}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, q(u, 30)), x, y: 2.6 * s, z, w: 7 * s, h: 7 * s }); // base of the drawing on the water line
};
export const creakFx = (t: number, pts: V3[], out: Stage, size = 0.8) =>
  pts.forEach(([x, y, z], i) => {
    const u = q((t * 1.3 + i * 0.37) % 1, 30);
    out.fx.push({ key: `creak${u}`, cw: 300, ch: 300, draw: (p) => fxCreak(p, u), x, y, z, w: size, h: size, rot: i * 0.6 - 0.6 });
  });
export { FPS };


// ======================= HTMM: our hero and the crowd around them =======================
import { PLAN, heroAt, locOf, sceneOf, beatOf, placeOf } from "./story";
import { THINGS } from "./things";
let BR = PLAN.brand;  // the scene's brand (set per scene in stage())
/** the brand name in bold lettering, centred in the box (x0,y0)-(x1,y1), shrunk to fit */
function brandText(p: Pen, x0: number, y0: number, x1: number, y1: number, fg?: string) {
  if (!BR) return;
  const g = p.g, txt = BR.name.toUpperCase();
  let sz = y1 - y0;
  g.font = `900 ${sz}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  const w = g.measureText(txt).width;
  if (w > (x1 - x0)) { sz = (sz * (x1 - x0)) / w; g.font = `900 ${sz}px "Arial Black", "Helvetica Neue", Arial, sans-serif`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = fg ?? BR.fg; g.fillText(txt, (x0 + x1) / 2, (y0 + y1) / 2 + sz * 0.04);
}
void stageBridge;
const HERO = PLAN.hero as unknown as Outfit;
const SK = ["#ffe2c2", "#f5c9a0", "#d9a577", "#b07a4f", "#8a5a3a", "#6b4630"];
const CROWD_O: Outfit[] = [
  { jacket: "#3f6fb5", pants: "#2f3447", boots: "#f4f1ea", hat: "hair", hair: "#3a2a20", skin: SK[0] },
  { jacket: "#e2453c", pants: "#3b5b9a", boots: "#4a3426", hat: "hair", hair: "#1c1512", skin: SK[3] },
  { jacket: "#f0b429", pants: "#3b3f52", boots: "#f4f1ea", hat: "hair", hair: "#7a4a22", skin: SK[1], dress: "#c25a7a" },
  { jacket: "#2f9e7a", pants: "#2f3447", boots: "#4a3426", hat: "cap", cap: "#e2453c", skin: SK[2] },
  { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#f4f1ea", hat: "hair", hair: "#d9b36a", skin: SK[0], dress: "#5a8fc2" },
  { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#4a3426", hat: "hair", hair: "#15110e", skin: SK[4] },
  { jacket: "#d94f8a", pants: "#2f3447", boots: "#f4f1ea", hat: "hair", hair: "#3a2a20", skin: SK[5] },
  { jacket: "#4aa3df", pants: "#3b3f52", boots: "#4a3426", hat: "cap", cap: "#2f9e7a", skin: SK[1] },
];
export const stage = (id: number, t: number, _b: BridgeState, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], sc = sceneOf(id), tl = t - s.a / FPS, h = heroAt(id, tl), L = locOf(id);
  LNAME = s.light === "golden" ? "golden" : "day";
  findSun(cam, SUN);
  const moving = h.v > 0, act = sc.action;
  const phase = q((tl * (h.v > 2 ? 1.5 : 1.0)) % 1, 48);
  const MOODS: Record<string, Expr> = { happy: "grin", laugh: "laugh", shock: "shock", nervous: "nervous", proud: "smile_closed", stern: "stern",
    scheme: "smile", relief: "relief_open", dazed: "dazed", sad: "pained", calm: "neutral", excited: "laugh" };
  const expr: Expr = sc.mood && MOODS[sc.mood] ? MOODS[sc.mood] : act === "cheer" ? "laugh" : act === "run" ? (id % 2 ? "grin" : "nervous") : act === "work" || act === "interact" ? "stern"
    : act === "death" || act === "fall" ? "dazed" : id % 2 ? "smile" : "grin";
  const wave = act === "cheer" || act === "wave" ? q(Math.sin(tl * 9), 8) : undefined;
  const mode = act === "death" || act === "fall" ? "fall" : moving ? "march" : "stand";
  const fo: FrontOpts = { mode, phase, expr, blink: lidAt(t, 500), ...(wave !== undefined ? { wave } : {}) };
  const so: SideOpts = { mode: moving ? "march" : "stand", phase, expr, blink: lidAt(t, 500), stride: h.v / 1.6 };
  const view = moving ? viewOf(cam, h.x, h.z, h.d[0], h.d[1]) : { side: false, mirror: false };
  const beat = beatOf(id), r: [number, number] = [-L.d[1], L.d[0]];
  const HO = sc.who ? ({ ...HERO, ...sc.who } as Outfit) : HERO, hkey = sc.who ? "who" + JSON.stringify(sc.who) : "hero";
  BR = sc.brand ?? PLAN.brand;
  const bkey = BR ? `${BR.name}|${BR.bg}|${BR.fg}|${BR.icon ?? ""}` : "-";
  const base = moving ? { x: L.p[0] + L.d[0] * h.v * 2.4, z: L.p[2] + L.d[1] * h.v * 2.4 } : { x: h.x, z: h.z };
  const night = s.light === "night", gold = s.light === "golden";
  const tintDraw = (draw: (p: Pen) => void, cw: number, ch: number) => (pen: Pen) => { draw(pen); if (night || gold) { const g = pen.g; g.globalCompositeOperation = "source-atop"; g.fillStyle = night ? "rgba(28,44,150,0.5)" : "rgba(255,150,60,0.22)"; g.fillRect(0, 0, cw, ch); g.globalCompositeOperation = "source-over"; } };
  // things pop in when their line starts (reference: every object arrives on its word), back-eased overshoot
  const pop = (delay: number) => { const u = clamp01((tl - delay) / 0.32); return u <= 0 ? 0 : 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; };
  if (beat === "drive") {
    // the hero DRIVES: a side-on car moving down the street, the hero seen through the window, speed lines behind
    const right = Math.sign(L.d[0] * cam.right.x + L.d[1] * cam.right.z) || 1;
    const away = { x: h.x - cam.pos.x, z: h.z - cam.pos.z }, al = Math.hypot(away.x, away.z) || 1;
    const hx = h.x + (away.x / al) * 0.3 + cam.right.x * right * 0.42, hz = h.z + (away.z / al) * 0.3 + cam.right.z * right * 0.42;
    const bump = 0.03 * Math.abs(Math.sin(tl * 11));
    out.places.push(person(cam, { i: 500, o: HO, okey: hkey }, hx, h.y + 0.98 + bump, hz, { side: false, mirror: false },
      { mode: "sit", expr: id % 2 ? "grin" : "laugh", blink: lidAt(t, 500), look: right * 0.6 }, {}, 0.8));
    // a line about buses (or Nike's sneaker bus) drives THAT vehicle, not the car (Sam: we should see the sneaker bus)
    const veh = (sc.things ?? []).find((n) => THINGS[n]?.move === "drive");
    if (veh) {
      const T = THINGS[veh], vw = 4.7, vh = (vw * T.ch) / T.cw, c = { bg: BR?.bg ?? "", fg: BR?.fg ?? "" };
      out.fx.push({ key: `thing|${veh}|drive|${s.light}|${bkey}`, cw: T.cw, ch: T.ch, x: h.x, y: h.y + vh / 2 - 0.05 + bump, z: h.z, w: vw * right, h: vh,
        draw: tintDraw((pen) => T.draw(pen, c), T.cw, T.ch) });
    } else out.fx.push({ key: `prop|carDrive|${s.light}|${bkey}`, cw: 700, ch: 380, x: h.x, y: h.y + 1.2 + bump, z: h.z, w: 4.5 * right, h: 2.44,
      draw: tintDraw(PROPS.carDrive.draw, 700, 380) });
    blob(out, h.x, h.y, h.z, 4.0, 0.9);
    for (let k = 0; k < 3; k++) {
      const back = 3.0 + k * 0.9 + ((tl * 6 + k * 0.37) % 1) * 0.6;
      out.fx.push({ key: `fx|speed|${k}`, cw: 256, ch: 64, x: h.x - L.d[0] * back, y: h.y + 0.5 + k * 0.35, z: h.z - L.d[1] * back, w: 1.3, h: 0.16,
        draw: (pen) => pen.stroke([[20, 32], [236, 32]], 18, "#ffffff"), soft: true });
    }
  } else if (!sc.hide) {
    out.places.push(person(cam, { i: 500, o: HO, okey: hkey }, h.x, h.y, h.z, view, fo, so));
    blob(out, h.x, h.y, h.z);
  }
  if (sc.card) {
    // afterhour study: a text card in the world (date sign, balance screen, headline, ticker, R.I.P...), flips to .to at .at s
    const C = sc.card, txt = C.to && tl >= (C.at ?? 1e9) ? C.to : C.text, k = pop(0.05), full = C.pos === "full" || sc.hide;
    const ck = `card|${C.kind ?? "sign"}|${txt}|${C.sub ?? ""}|${C.bg ?? ""}|${s.light}`;
    const cw = 900, ch = C.kind === "paper" || C.kind === "tomb" ? 1100 : 600, W2 = full ? 1.6 : 1.35;   // fits the 9:16 frame from the ms/cu views (2.5 m cropped the text)
    const x = full ? h.x : h.x + r[0] * 1.2 + h.d[0] * -1.2, z = full ? h.z : h.z + r[1] * 1.2 + h.d[1] * -1.2;
    if (k > 0) out.fx.push({ key: ck, cw, ch, x, y: h.y + (full ? 1.45 : 1.0 * k + 1.15), z, w: W2 * k, h: (W2 * ch / cw) * k,
      draw: tintDraw((pen) => drawCard(pen, C, txt, cw, ch), cw, ch) });
  }
  if (beat === "clock") {
    // a giant clock beside the hero, hands racing: time adding up
    const ang = q(((tl * 1.6) % 1) * 360, 0.0625);
    const k = pop(0.15), x = h.x + r[0] * 1.55 + h.d[0] * -0.6, z = h.z + r[1] * 1.55 + h.d[1] * -0.6;
    if (k > 0) out.fx.push({ key: `prop|clock|${ang}|${s.light}`, cw: 520, ch: 520, x, y: h.y + 1.35 * k + 0.25, z, w: 2.3 * k, h: 2.3 * k,
      draw: tintDraw((pen) => drawClock(pen, ang), 520, 520) });
    for (let k2 = 0; k2 < 5; k2++) {           // calendar pages flying off
      const u = (tl * 0.9 + k2 * 0.21) % 1;
      out.fx.push({ key: `prop|page|${k2 % 3}|${s.light}`, cw: 200, ch: 240, x: x + h.d[0] * (0.4 + u * 2.4), y: h.y + 2.3 + u * 1.6, z: z + h.d[1] * (0.4 + u * 2.4),
        w: 0.42, h: 0.5, rot: u * 4 + k2, draw: tintDraw((pen) => drawPage(pen, k2), 200, 240) });
    }
  }
  if (beat === "sign" && BR) {
    const k = pop(0.1), x = h.x + r[0] * 1.1 + h.d[0] * -1.4, z = h.z + r[1] * 1.1 + h.d[1] * -1.4;   // open side of the frame
    if (k > 0) out.fx.push({ key: `prop|sign|${s.light}|${bkey}`, cw: 900, ch: 620, x, y: h.y + 1.05 * k + 1.15, z, w: 2.4 * k, h: 1.65 * k,
      draw: tintDraw((pen) => {
        pen.poly(rr(60, 470, 120, 620, 6), "#5a5560", 10); pen.poly(rr(780, 470, 840, 620, 6), "#5a5560", 10);   // posts
        pen.poly(rr(16, 16, 884, 480, 34), BR.bg, 16);
        pen.poly(rr(46, 46, 854, 450, 22), null, 6);
        brandText(pen, 80, 120, 820, 380);
        for (let i = 0; i < 9; i++) pen.ell(70 + i * 95, 30, 9, 9, "#fff3b0", 4);                                  // bulbs
      }, 900, 620) });
  }
  if (beat === "logo" && BR) {
    // the new company's logo pops up big beside the hero, with a burst of rays behind it
    const k = pop(0.12), x = h.x + r[0] * 1.25 + h.d[0] * -0.4, z = h.z + r[1] * 1.25 + h.d[1] * -0.4;
    const spin = q((tl * 0.35) % 1, 24), B = BR;
    if (k > 0) {
      out.fx.push({ key: `fx|rays|${spin}|${s.light}`, cw: 512, ch: 512, x: x + h.d[0] * -0.25, y: h.y + 1.75, z: z + h.d[1] * -0.25, w: 2.7 * k, h: 2.7 * k,
        draw: (pen) => drawRays(pen, spin * Math.PI * 2, B.bg), soft: true });
      out.fx.push({ key: `prop|logo|${bkey}|${s.light}`, cw: 600, ch: 600, x, y: h.y + 1.75, z, w: 1.6 * k, h: 1.6 * k,
        draw: tintDraw((pen) => drawLogo(pen, B), 600, 600) });
    }
  }
  if (beat === "phone") {
    const k = pop(0.15), x = h.x + r[0] * 1.05, z = h.z + r[1] * 1.05;
    const pins = Math.min(9, Math.floor(tl * 4));
    if (k > 0) out.fx.push({ key: `prop|phone|${pins}|${s.light}|${bkey}`, cw: 420, ch: 780, x, y: h.y + 1.0 * k + 0.1, z, w: 1.0 * k, h: 1.85 * k,
      draw: tintDraw((pen) => drawPhone(pen, pins), 420, 780) });
  }
  if (beat === "money") {
    const spots: [number, number, number][] = [[1.2, 0.3, 0], [-1.25, 0.1, 0.12], [1.6, -1.0, 0.28], [-1.7, -0.9, 0.4], [0.5, -1.9, 0.52], [-0.6, -2.1, 0.64]];
    spots.forEach(([sd, fw, dl], k2) => {
      const k = pop(dl);
      if (k > 0) put("cash", fw, sd, 1.05 * k, 0.78 * k);
      if (k > 0 && k2 < 2) put("cash", fw, sd, 1.0 * k, 0.75 * k, 0.62 * k);
    });
  }
  const n = beat === "queue" ? Math.max(sc.crowd, 34) : beat === "drive" ? Math.min(sc.crowd, 24) : Math.min(sc.crowd, 70);
  const lead = moving ? h.v * 3 : 0;
  for (let i = 0; i < n; i++) {
    const qline = beat === "queue";
    const lat = qline ? 0.55 + (i % 2) * 0.2 : beat === "drive" ? (i % 2 ? 1 : -1) * (L.w * 0.5 + 1.2 + hh(i, 2) * 2) : (i % 2 ? 1 : -1) * (L.w * 0.55 + hh(i, 2) * L.w * 0.45);
    const along = qline ? 1.6 + i * 0.85 : (hh(i, 1) - 0.4) * 34 + lead;
    const x = L.p[0] + L.d[0] * along + r[0] * lat, z = L.p[2] + L.d[1] * along + r[1] * lat;
    // keep the lens clear: nobody between the camera and the hero, nobody right in front of the lens
    const cx = cam.pos.x - h.x, cz = cam.pos.z - h.z, cl = Math.hypot(cx, cz) || 1, px = x - h.x, pz = z - h.z;
    const al = (px * cx + pz * cz) / cl, perp = Math.abs(px * cz - pz * cx) / cl;
    if ((al > 0.3 && al < cl + 2 && perp < 1.5) || Math.hypot(cam.pos.x - x, cam.pos.z - z) < 3.2 || Math.hypot(px, pz) < 0.9) continue;
    const cheer = !qline && (act === "cheer" || i % 3 === 0);
    const ce = (["smile", "grin", "laugh", "shock", "smile_closed", "relief_open"] as Expr[])[i % 6];
    const cfo: FrontOpts = { mode: "stand", expr: ce, blink: lidAt(t, i), ...(cheer ? { wave: q(Math.sin(tl * 8 + i), 4) } : {}) };
    const CO = (sc.crowdO as unknown as Outfit[] | undefined) ?? CROWD_O;
    out.places.push(person(cam, { i, o: CO[i % CO.length], okey: (sc.crowdO ? "x" + JSON.stringify(CO[i % CO.length]) : "c") + (i % CO.length) }, x, L.p[1], z, { side: false, mirror: false }, cfo, {}));
    blob(out, x, L.p[1], z);
  }
  // ---- props: flat ink drawings standing in the 3D world (like the reference's signs and effects) ----
  const place = placeOf(id);
  const auto = place === "court" || place === "pitch" ? ["ball"] : place === "stage" ? ["mic"] : place === "space" ? ["rocket", "flag"] : [];
  for (const name of beat === "drive" ? [] : [...new Set([...sc.props, ...auto])]) {
    if (name === "car") put("car", -3.0, L.w * 0.5 + 0.6, 3.5, 1.9);
    else if (name === "truck") put("truck", -4.0, L.w * 0.5 + 0.9, 4.4, 2.4);
    else if (name === "trophy") put("trophy", 0.2, -1.15, 0.8 * pop(0.2), 1.12 * pop(0.2));
    else if (name === "cash" && beat !== "money") put("cash", 0.25, 1.1, 0.95 * pop(0.2), 0.68 * pop(0.2));
    else if (name === "boxes") put("boxes", 0.1, 1.25, 1.05 * pop(0.2), 1.05 * pop(0.2));
    else if (name === "check") put("check", 0.15, -1.45, 1.6 * pop(0.2), 0.8 * pop(0.2), 0.55);
    else if (name === "rocket") put("rocket", -6, -L.w * 0.5 - 2, 2.0, 4.6);
    else if (name === "ball") put(place === "pitch" ? "football" : "ball", place === "pitch" ? 0.55 : 0.25, -0.55, 0.3, 0.3, place === "pitch" ? 0 : 0.02 + 0.75 * Math.abs(Math.sin(tl * 6.5)), true);
    else if (name === "mic") put("mic", 0.45, -0.5, 0.55, 1.6, 0, true);
    else if (name === "flag") put("flag", -1.5, -2.2, 1.1, 2.1);
    else if (name === "laptop") put("laptop", 0.4, 0.95, 0.75, 0.55, 0.75, true);
    else if (name === "burger") put("burger", 0.3, 1.05, 0.7, 0.6, 0.9, true);
    else if (name === "controller") put("controller", 0.35, 0.8, 0.55, 0.36, 1.0, true);
  }
  // ---- things the line mentions (Sam: "if it's mentioned, it should make the scenery"): the first pops in big beside
  // the hero (lower and closer if a logo / sign / phone already holds that spot), a second one smaller at his feet;
  // vehicles drive through behind him, drones and satellites fly across ----
  const busy = beat === "logo" || beat === "sign" || beat === "phone" || beat === "clock";
  (sc.things ?? []).filter((n) => THINGS[n]).slice(0, 2).forEach((name, k) => {
    const T = THINGS[name], c = { bg: BR?.bg ?? "", fg: BR?.fg ?? "" }, asp = T.ch / T.cw, key = `thing|${name}|${s.light}|${bkey}`;
    const draw = tintDraw((pen) => T.draw(pen, c), T.cw, T.ch);
    if (T.move === "drive" && beat === "drive") return;   // already the vehicle the hero drives
    if (T.move) {
      const fly = T.move === "fly", u = fly ? tl * 2.4 - 2.5 + k * 2 : tl * 5.5 - 9 + k * 4, w = fly ? 2.0 : 4.2;
      const x = h.x + L.d[0] * u + r[0] * (fly ? 0.6 : -2.6), z = h.z + L.d[1] * u + r[1] * (fly ? 0.6 : -2.6);
      out.fx.push({ key, cw: T.cw, ch: T.ch, x, y: h.y + (fly ? 3.0 + 0.15 * Math.sin(tl * 5) : w * asp * 0.5), z, w, h: w * asp, draw });
      return;
    }
    const kp = pop(0.12 + k * 0.3);
    if (kp <= 0) return;
    const big = k === 0 && !busy, w = (big ? 1.7 : k === 0 ? 1.3 : 1.0) * kp, side = big ? 1.0 : 0.5, fw = big ? -0.3 : 1.3;
    const x = h.x + r[0] * side + h.d[0] * fw, z = h.z + r[1] * side + h.d[1] * fw;
    const hover = name === "drone" || name === "satellite" ? 0.5 + 0.12 * Math.sin(tl * 4) : 0;   // fliers bob in the air
    out.fx.push({ key, cw: T.cw, ch: T.ch, x, y: h.y + (big ? 1.45 : w * asp * 0.5 + 0.05) + hover, z, w, h: w * asp, draw });
  });
  return out;
  function put(name: string, fwd: number, side: number, w: number, hgt: number, lift = 0, follow = false) {
    const d = PROPS[name];
    if (!d || w < 0.02) return;
    const o = follow ? { x: h.x, z: h.z } : base;
    const x = o.x + L.d[0] * fwd + r[0] * side, z = o.z + L.d[1] * fwd + r[1] * side;
    const cx = cam.pos.x - h.x, cz = cam.pos.z - h.z, cl = Math.hypot(cx, cz) || 1, px = x - h.x, pz = z - h.z;
    const al = (px * cx + pz * cz) / cl, perp = Math.abs(px * cz - pz * cx) / cl;
    if (al > 0.3 && perp < w * 0.5 + 0.5) return; // never between the lens and the hero
    out.fx.push({ key: `prop|${name}|${s.light}`, cw: d.cw, ch: d.ch, x, y: L.p[1] + hgt / 2 + lift, z, w, h: hgt,
      draw: (pen) => { d.draw(pen); if (night || gold) { const g = pen.g; g.globalCompositeOperation = "source-atop"; g.fillStyle = night ? "rgba(28,44,150,0.5)" : "rgba(255,150,60,0.22)"; g.fillRect(0, 0, d.cw, d.ch); g.globalCompositeOperation = "source-over"; } } });
    if (!lift) blob(out, x, L.p[1], z, Math.min(2.2, w / 0.6), 0.8);
  }
};
function drawRays(p: Pen, a0: number, col: string) {
  const g = p.g;
  for (let i = 0; i < 14; i++) {
    const a = a0 + (i * Math.PI * 2) / 14, b = a + 0.12;
    g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + 250 * Math.cos(a), 256 + 250 * Math.sin(a)); g.lineTo(256 + 250 * Math.cos(b), 256 + 250 * Math.sin(b)); g.closePath();
    g.fillStyle = i % 2 ? "rgba(255,243,176,0.85)" : "rgba(255,255,255,0.7)"; g.fill();
  }
  void col;
}
/** afterhour study cards: sign (dark board, neon text), screen (monitor), paper (newspaper), tomb (gravestone),
 * flip (red/white calendar card), white (plain white card) */
function drawCard(p: Pen, C: { kind?: string; bg?: string; fg?: string; sub?: string }, txt: string, cw: number, ch: number) {
  const g = p.g, kind = C.kind ?? "sign";
  const fit = (t: string, maxW: number, size: number, weight = 900, font = '"Arial Black", Arial, sans-serif') => {
    g.font = `${weight} ${size}px ${font}`; const w = g.measureText(t).width; if (w > maxW) { size = (size * maxW) / w; g.font = `${weight} ${size}px ${font}`; } return size; };
  g.textAlign = "center"; g.textBaseline = "middle";
  if (kind === "sign") {
    p.poly(rr(10, 10, cw - 10, ch - 10, 26), C.bg ?? "#101418", 14);
    const lines = txt.split("\n"), sz = (ch - 120) / Math.max(1, lines.length);
    lines.forEach((ln, i) => { fit(ln, cw - 90, sz * 0.8); g.fillStyle = C.fg ?? "#b8f12a"; g.fillText(ln, cw / 2, 60 + sz * (i + 0.5)); });
  } else if (kind === "screen") {
    p.poly(rr(10, 10, cw - 10, ch - 10, 40), "#d9d6cf", 14);
    p.poly(rr(60, 60, cw - 60, ch - 60, 18), C.bg ?? "#0d1a12", 10);
    if (C.sub) { fit(C.sub, cw - 200, 50, 800, "Arial, sans-serif"); g.fillStyle = "#cfe8d8"; g.fillText(C.sub, cw / 2, 130); }
    fit(txt, cw - 180, 150); g.fillStyle = C.fg ?? "#3ee07a"; g.fillText(txt, cw / 2, ch / 2 + 30);
  } else if (kind === "paper") {
    p.poly(rr(10, 10, cw - 10, ch - 10, 8), "#f4f2ec", 12);
    fit(C.sub ?? "The Daily News", cw - 120, 70, 700, 'Georgia, "Times New Roman", serif'); g.fillStyle = "#222"; g.fillText(C.sub ?? "The Daily News", cw / 2, 90);
    p.stroke([[60, 150], [cw - 60, 150]], 5, "#222");
    const lines = txt.split("\n"); lines.forEach((ln, i) => { fit(ln, cw - 120, 80, 800, 'Georgia, serif'); g.fillStyle = "#1a1a1a"; g.fillText(ln, cw / 2, 220 + i * 90); });
    p.poly(rr(90, 420, 470, 700, 6), "#a9c6cc", 6);
    for (let i = 0; i < 14; i++) p.stroke([[500, 430 + i * 22], [cw - 90, 430 + i * 22]], 6, "#9a9a9a");
    for (let i = 0; i < 12; i++) p.stroke([[90, 740 + i * 26], [cw - 90, 740 + i * 26]], 6, "#9a9a9a");
  } else if (kind === "tomb") {
    const pts: [number, number][] = [[120, ch - 20], [120, 300]]; for (let i = 0; i <= 16; i++) { const t = Math.PI * (1 - i / 16); pts.push([cw / 2 + Math.cos(t) * (cw / 2 - 120), 300 - Math.sin(t) * 260]); } pts.push([cw - 120, ch - 20]);
    p.poly(pts, "#b9b2d6", 14);
    const lines = txt.split("\n"); lines.forEach((ln, i) => { fit(ln, cw - 320, i ? 70 : 120); g.fillStyle = "#3b3560"; g.fillText(ln, cw / 2, 520 + i * 130); });
  } else if (kind === "flip") {
    p.poly(rr(10, 10, cw - 10, ch - 10, 20), "#ffffff", 14);
    p.poly(rr(10, 10, cw - 10, 170, 20), C.bg ?? "#e0343a", 0);
    if (C.sub) { fit(C.sub, cw - 120, 90); g.fillStyle = "#ffffff"; g.fillText(C.sub, cw / 2, 95); }
    fit(txt, cw - 100, 300); g.fillStyle = C.fg ?? "#151515"; g.fillText(txt, cw / 2, 380);
  } else {
    p.poly(rr(10, 10, cw - 10, ch - 10, 20), C.bg ?? "#ffffff", 14);
    if (C.sub) { fit(C.sub, cw - 120, 60, 800, "Arial, sans-serif"); g.fillStyle = "#555"; g.fillText(C.sub, cw / 2, 110); }
    const lines = txt.split("\n"), sz = 200 / Math.max(1, lines.length);
    lines.forEach((ln, i) => { fit(ln, cw - 100, sz); g.fillStyle = C.fg ?? "#e0343a"; g.fillText(ln, cw / 2, ch / 2 + 30 + (i - (lines.length - 1) / 2) * sz * 1.1); });
  }
}
/** a simple code-drawn logo: rounded badge in the brand colour, an icon, the name underneath */
function drawLogo(p: Pen, B: { name: string; bg: string; fg: string; icon?: string }) {
  const g = p.g;
  p.poly(rr(40, 30, 560, 570, 120), "#ffffff", 0);
  p.poly(rr(56, 46, 544, 554, 108), B.bg, 16);
  g.save(); g.translate(300, 245); g.fillStyle = B.fg; g.strokeStyle = B.fg; g.lineWidth = 26; g.lineCap = "round"; g.lineJoin = "round";
  const ic = B.icon ?? "letter";
  if (ic === "rocket") { g.beginPath(); g.moveTo(0, -130); g.quadraticCurveTo(70, -60, 52, 70); g.lineTo(-52, 70); g.quadraticCurveTo(-70, -60, 0, -130); g.fill(); g.beginPath(); g.moveTo(-52, 40); g.lineTo(-100, 110); g.lineTo(-40, 85); g.moveTo(52, 40); g.lineTo(100, 110); g.lineTo(40, 85); g.stroke(); g.fillStyle = B.bg; g.beginPath(); g.arc(0, -35, 26, 0, 7); g.fill(); }
  else if (ic === "bolt") { g.beginPath(); g.moveTo(30, -140); g.lineTo(-70, 20); g.lineTo(0, 20); g.lineTo(-30, 140); g.lineTo(70, -20); g.lineTo(0, -20); g.closePath(); g.fill(); }
  else if (ic === "chip") { g.strokeRect(-80, -80, 160, 160); g.fillRect(-40, -40, 80, 80); for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 45, -80); g.lineTo(i * 45, -125); g.moveTo(i * 45, 80); g.lineTo(i * 45, 125); g.moveTo(-80, i * 45); g.lineTo(-125, i * 45); g.moveTo(80, i * 45); g.lineTo(125, i * 45); g.stroke(); } }
  else if (ic === "globe") { g.beginPath(); g.arc(0, 0, 120, 0, 7); g.stroke(); g.beginPath(); g.ellipse(0, 0, 55, 120, 0, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-120, 0); g.lineTo(120, 0); g.moveTo(-100, -60); g.lineTo(100, -60); g.moveTo(-100, 60); g.lineTo(100, 60); g.stroke(); }
  else if (ic === "car") { g.beginPath(); g.moveTo(-140, 40); g.lineTo(-120, -20); g.lineTo(-60, -80); g.lineTo(60, -80); g.lineTo(120, -20); g.lineTo(140, 40); g.closePath(); g.fill(); g.fillStyle = B.bg; g.beginPath(); g.arc(-75, 50, 34, 0, 7); g.arc(75, 50, 34, 0, 7); g.fill(); g.fillStyle = B.fg; g.beginPath(); g.arc(-75, 50, 22, 0, 7); g.fill(); g.beginPath(); g.arc(75, 50, 22, 0, 7); g.fill(); }
  else if (ic === "brain") { g.beginPath(); g.arc(-45, -10, 80, Math.PI * 0.5, Math.PI * 1.9); g.arc(45, -10, 80, Math.PI * 1.1, Math.PI * 2.5); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(0, -90); g.lineTo(0, 70); g.stroke(); }
  else if (ic === "bird") { g.beginPath(); g.moveTo(-120, 10); g.quadraticCurveTo(-40, -90, 40, -40); g.lineTo(120, -80); g.lineTo(90, -10); g.quadraticCurveTo(60, 100, -80, 70); g.quadraticCurveTo(-20, 40, -120, 10); g.fill(); }
  else if (ic === "sun") { g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5; g.beginPath(); g.moveTo(85 * Math.cos(a), 85 * Math.sin(a)); g.lineTo(125 * Math.cos(a), 125 * Math.sin(a)); g.stroke(); } }
  else if (ic === "play") { g.beginPath(); g.moveTo(-60, -90); g.lineTo(90, 0); g.lineTo(-60, 90); g.closePath(); g.fill(); }
  else if (ic === "cart") { g.beginPath(); g.moveTo(-130, -90); g.lineTo(-90, -90); g.lineTo(-50, 50); g.lineTo(100, 50); g.lineTo(130, -50); g.lineTo(-70, -50); g.stroke(); g.beginPath(); g.arc(-35, 100, 22, 0, 7); g.arc(85, 100, 22, 0, 7); g.fill(); }
  else if (ic === "robot") { g.strokeRect(-90, -70, 180, 140); g.beginPath(); g.arc(-40, -5, 22, 0, 7); g.arc(40, -5, 22, 0, 7); g.fill(); g.beginPath(); g.moveTo(0, -70); g.lineTo(0, -120); g.stroke(); g.beginPath(); g.arc(0, -125, 16, 0, 7); g.fill(); }
  else if (ic === "swoosh") { g.beginPath(); g.moveTo(-150, 30); g.quadraticCurveTo(-120, 120, -20, 70); g.lineTo(150, -60); g.quadraticCurveTo(-30, 40, -100, 30); g.quadraticCurveTo(-140, 20, -110, -30); g.quadraticCurveTo(-170, 0, -150, 30); g.fill(); }
  else if (ic === "star") { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 55 : 130; g.lineTo(r * Math.cos(a), r * Math.sin(a)); } g.closePath(); g.fill(); }
  else if (ic === "burger") { g.beginPath(); g.arc(0, -10, 120, Math.PI, 0); g.fill(); g.fillRect(-125, 15, 250, 30); g.beginPath(); g.moveTo(-120, 65); g.lineTo(120, 65); g.lineTo(100, 110); g.lineTo(-100, 110); g.closePath(); g.fill(); }
  else { g.font = `900 260px "Arial Black", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(B.name.slice(0, 1).toUpperCase(), 0, 10); }
  g.restore();
  const old = BR; BR = { ...B }; brandText(p, 96, 430, 504, 520, B.fg); BR = old;
}
function drawClock(p: Pen, ang: number) {
  p.ell(260, 260, 236, 236, "#f4f1ea", 16);
  p.ell(260, 260, 200, 200, null, 6);
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; p.stroke([[260 + 172 * Math.sin(a), 260 - 172 * Math.cos(a)], [260 + 196 * Math.sin(a), 260 - 196 * Math.cos(a)]], i % 3 ? 7 : 14); }
  const a1 = (ang * Math.PI) / 180, a2 = a1 / 12;
  p.stroke([[260, 260], [260 + 105 * Math.sin(a2), 260 - 105 * Math.cos(a2)]], 18);
  p.stroke([[260, 260], [260 + 165 * Math.sin(a1), 260 - 165 * Math.cos(a1)]], 11, "#e2453c");
  p.ell(260, 260, 18, 18, "#241726", 0);
}
function drawPage(p: Pen, k: number) {
  p.poly(rr(10, 10, 190, 230, 10), "#fbf8f1", 8);
  p.poly(rr(10, 10, 190, 66, 10), "#e2453c", 8);
  for (let i = 0; i < 3; i++) p.stroke([[40, 108 + i * 40 + k * 4], [160, 108 + i * 40 + k * 4]], 9, "#9aa3b5");
}
function drawPhone(p: Pen, pins: number) {
  p.poly(rr(14, 14, 406, 766, 56), "#2b2a33", 14);
  p.poly(rr(40, 74, 380, 690, 18), "#cfe8d4", 0);                         // map
  for (const y of [190, 330, 470, 600]) p.stroke([[40, y], [380, y - 40]], 22, "#f4f1ea");
  for (const x of [120, 250, 330]) p.stroke([[x, 74], [x + 30, 690]], 18, "#f4f1ea");
  const P: [number, number][] = [[90, 140], [300, 210], [170, 300], [340, 380], [80, 430], [230, 500], [320, 600], [130, 610], [260, 120]];
  for (let i = 0; i < pins; i++) { const [x, y] = P[i]; p.poly([[x, y + 34], [x - 22, y], [x, y - 24], [x + 22, y]], "#e2453c", 7); p.ell(x, y - 2, 8, 8, "#ffffff", 0); }
  if (BR) { p.poly(rr(40, 74, 380, 150, 0), BR.bg, 0); brandText(p, 60, 84, 360, 140); }
  p.poly(rr(80, 630, 340, 690, 26), "#241726", 0);                        // request button
  p.stroke([[150, 660], [270, 660]], 10, "#ffffff");
  p.ell(210, 44, 34, 9, "#4a4952", 0);
}

// ---- prop drawings (design canvas px; thick plum ink like the characters) ----
const INKP = "#241726";
const rr = (x0: number, y0: number, x1: number, y1: number, rad: number): [number, number][] => {
  const o: [number, number][] = [];
  for (const [cx, cy, a] of [[x1 - rad, y0 + rad, -90], [x1 - rad, y1 - rad, 0], [x0 + rad, y1 - rad, 90], [x0 + rad, y0 + rad, 180]])
    for (let k = 0; k <= 6; k++) { const t = ((a + k * 15) * Math.PI) / 180; o.push([cx + rad * Math.cos(t), cy + rad * Math.sin(t)]); }
  return o;
};
const wheel = (pen: Pen, x: number, y: number, rad: number) => { pen.ell(x, y, rad, rad, "#2b2a33", 10); pen.ell(x, y, rad * 0.45, rad * 0.45, "#c9ccd6", 6); };
const PROPS: Record<string, { cw: number; ch: number; draw: (p: Pen) => void }> = {
  football: { cw: 160, ch: 160, draw: (p) => {
    p.ell(80, 80, 66, 66, "#f4f4f4", 10);
    p.poly([[80, 52], [104, 70], [95, 98], [65, 98], [56, 70]], "#241726", 0);
    for (const [x, y] of [[80, 20], [134, 66], [116, 128], [44, 128], [26, 66]]) p.ell(x, y, 13, 11, "#241726", 0);
  } },
  mic: { cw: 200, ch: 580, draw: (p) => {
    p.stroke([[100, 120], [100, 540]], 14); p.poly(rr(40, 530, 160, 566, 14), "#2b2a33", 8);
    p.ell(100, 70, 46, 60, "#5a5966", 10); for (let i = 0; i < 4; i++) p.stroke([[66, 40 + i * 18], [134, 40 + i * 18]], 3, "#9a99a6");
    p.poly(rr(84, 128, 116, 190, 8), "#2b2a33", 7);
  } },
  flag: { cw: 300, ch: 580, draw: (p) => {
    p.stroke([[40, 30], [40, 570]], 14, "#c9ccd6"); p.stroke([[40, 30], [40, 570]], 4, "#9aa3b5");
    p.poly([[46, 40], [280, 40], [280, 200], [46, 200]], "#f4f4f4", 9);
    p.poly([[46, 40], [140, 40], [140, 120], [46, 120]], "#3f6fb5", 0);
    for (let i = 0; i < 4; i++) p.stroke([[140, 52 + i * 40], [276, 52 + i * 40]], 14, "#e2453c");
  } },
  laptop: { cw: 360, ch: 260, draw: (p) => {
    p.poly([[60, 20], [300, 20], [300, 180], [60, 180]], "#2b2a33", 10); p.poly([[78, 36], [282, 36], [282, 166], [78, 166]], "#7fd6ff", 0);
    for (let i = 0; i < 4; i++) p.stroke([[96, 60 + i * 26], [96 + 60 + ((i * 37) % 100), 60 + i * 26]], 8, "#ffffff");
    p.poly([[20, 182], [340, 182], [320, 230], [40, 230]], "#9aa3b5", 10);
  } },
  burger: { cw: 320, ch: 280, draw: (p) => {
    p.ell(160, 110, 140, 80, "#e8a24a", 10, 180, 360); p.poly([[20, 112], [300, 112], [300, 128], [20, 128]], "#e8a24a", 6);
    p.poly([[14, 128], [306, 128], [290, 150], [30, 150]], "#4fbf6b", 6); p.poly(rr(24, 150, 296, 184, 12), "#7a3b22", 8);
    p.poly([[20, 184], [300, 184], [290, 196], [30, 196]], "#f0c22c", 5); p.ell(160, 210, 140, 46, "#e8a24a", 10, 0, 180);
    for (const [x, y] of [[100, 70], [160, 55], [220, 72], [130, 92], [195, 95]]) p.ell(x, y, 6, 3.5, "#fff3d6", 0);
  } },
  controller: { cw: 360, ch: 240, draw: (p) => {
    p.poly([[70, 40], [290, 40], [340, 170], [300, 220], [240, 170], [120, 170], [60, 220], [20, 170]], "#2b2a33", 10);
    p.ell(100, 100, 16, 16, "#9aa3b5", 5); p.stroke([[100, 80], [100, 120]], 10, "#c9ccd6"); p.stroke([[80, 100], [120, 100]], 10, "#c9ccd6");
    for (const [x, y, c] of [[260, 80, "#4fbf6b"], [290, 105, "#e2453c"], [230, 105, "#3f6fb5"], [260, 130, "#f0b429"]] as [number, number, string][]) p.ell(x, y, 13, 13, c, 4);
  } },
  carDrive: { cw: 700, ch: 380, draw: (p) => {
    p.poly([[150, 170], [215, 60], [470, 60], [560, 170]], "#2f9e7a", 12);
    p.poly([[232, 160], [262, 86], [345, 86], [345, 160]], "rgba(191,230,255,0.2)", 8);
    p.poly([[368, 160], [368, 86], [452, 86], [512, 160]], "rgba(191,230,255,0.2)", 8);
    const g = p.g; g.save(); g.globalCompositeOperation = "destination-out";
    p.poly([[240, 154], [266, 94], [338, 94], [338, 154]], "#000000", 0); p.poly([[375, 154], [375, 94], [448, 94], [502, 154]], "#000000", 0);
    g.restore();
    p.poly(rr(40, 160, 660, 300, 46), "#35b58c", 12);
    p.poly(rr(612, 196, 650, 232, 10), "#fff3b0", 7); p.poly(rr(46, 200, 76, 236, 8), "#e2453c", 7);
    p.stroke([[352, 176], [352, 286]], 6); p.stroke([[392, 214], [432, 214]], 9);
    if (BR) { p.poly(rr(104, 180, 332, 232, 12), BR.bg, 6); brandText(p, 116, 185, 320, 227); }
    wheel(p, 190, 300, 58); wheel(p, 520, 300, 58);
  } },
  car: { cw: 700, ch: 380, draw: (p) => {
    p.poly([[150, 170], [215, 60], [470, 60], [560, 170]], "#2f9e7a", 12);                    // cabin
    p.poly([[232, 160], [262, 86], [345, 86], [345, 160]], "#bfe6ff", 8);                      // windows
    p.poly([[368, 160], [368, 86], [452, 86], [512, 160]], "#bfe6ff", 8);
    p.poly(rr(40, 160, 660, 300, 46), "#35b58c", 12);                                         // body
    p.poly(rr(612, 196, 650, 232, 10), "#fff3b0", 7); p.poly(rr(46, 200, 76, 236, 8), "#e2453c", 7); // lights
    p.stroke([[352, 176], [352, 286]], 6); p.stroke([[392, 214], [432, 214]], 9);              // door seam + handle
    wheel(p, 190, 300, 58); wheel(p, 520, 300, 58);
  } },
  truck: { cw: 800, ch: 440, draw: (p) => {
    p.poly(rr(40, 50, 540, 330, 18), "#f4f1ea", 12);                                          // box
    p.stroke([[70, 120], [510, 120]], 8, "#d9a441"); p.stroke([[70, 160], [510, 160]], 8, "#d9a441");
    p.poly([[540, 150], [690, 150], [760, 240], [760, 330], [540, 330]], "#4aa3df", 12);       // cab
    p.poly([[575, 172], [680, 172], [728, 240], [575, 240]], "#bfe6ff", 8);
    wheel(p, 170, 340, 62); wheel(p, 640, 340, 62);
  } },
  trophy: { cw: 300, ch: 420, draw: (p) => {
    p.arc(70, 130, 46, 60, 90, 270, 16, INKP); p.arc(230, 130, 46, 60, -90, 90, 16, INKP);    // handles
    p.arc(70, 130, 46, 60, 90, 270, 7, "#f2c94c"); p.arc(230, 130, 46, 60, -90, 90, 7, "#f2c94c");
    p.poly([[70, 40], [230, 40], [212, 170], [170, 222], [130, 222], [88, 170]], "#f2c94c", 11); // cup
    p.poly([[96, 60], [122, 60], [130, 160], [112, 160]], "#fff3b0", 0);                       // shine
    p.poly(rr(132, 222, 168, 300, 6), "#e0b030", 10);                                         // stem
    p.poly(rr(84, 300, 216, 338, 10), "#f2c94c", 10); p.poly(rr(60, 338, 240, 396, 10), "#7a4f33", 11); // base
  } },
  cash: { cw: 360, ch: 260, draw: (p) => {
    for (let k = 0; k < 4; k++) {
      const y = 190 - k * 44, x = 30 + (k % 2) * 16;
      p.poly(rr(x, y, x + 290, y + 52, 8), k % 2 ? "#4fbf6b" : "#3fae5c", 9);
      p.poly(rr(x + 118, y, x + 172, y + 52, 3), "#f4f1ea", 6);
      p.ell(x + 56, y + 26, 14, 14, "#2f8f4a", 5);
      p.g.font = `900 40px "Arial Black", Arial, sans-serif`; p.g.textAlign = "center"; p.g.textBaseline = "middle";
      p.g.fillStyle = "#1f6b35"; p.g.fillText("$", x + 145, y + 28);
    }
  } },
  boxes: { cw: 420, ch: 420, draw: (p) => {
    const bx = (x: number, y: number, w: number, hh2: number) => { p.poly(rr(x, y, x + w, y + hh2, 6), "#d9a066", 10); p.poly(rr(x + w * 0.42, y, x + w * 0.58, y + hh2, 2), "#c08a52", 0); p.stroke([[x, y + 6], [x + w, y + 6]], 5); };
    bx(30, 230, 190, 160); bx(215, 250, 175, 140); bx(110, 80, 200, 152);
  } },
  check: { cw: 560, ch: 280, draw: (p) => {
    p.poly(rr(12, 12, 548, 268, 14), "#fbf8f1", 11);
    p.poly(rr(34, 34, 150, 78, 6), "#3f6fb5", 0);
    p.stroke([[190, 60], [520, 60]], 9, "#9aa3b5"); p.stroke([[40, 130], [520, 130]], 9, "#9aa3b5");
    p.stroke([[40, 180], [330, 180]], 9, "#9aa3b5"); p.poly(rr(372, 162, 526, 232, 8), "#f2c94c", 8);
    p.stroke([[60, 232], [250, 232]], 6);
  } },
  rocket: { cw: 300, ch: 700, draw: (p) => {
    p.poly([[60, 520], [20, 640], [110, 590]], "#e2453c", 11); p.poly([[240, 520], [280, 640], [190, 590]], "#e2453c", 11); // fins
    p.poly([[150, 20], [222, 170], [232, 560], [68, 560], [78, 170]], "#f4f1ea", 12);          // body
    p.poly([[150, 20], [222, 170], [78, 170]], "#e2453c", 12);                                 // nose
    p.ell(150, 290, 40, 40, "#bfe6ff", 10);
    p.poly([[100, 560], [200, 560], [176, 660], [150, 690], [124, 660]], "#f0b429", 10);       // flame
  } },
  ball: { cw: 160, ch: 160, draw: (p) => {
    p.ell(80, 80, 66, 66, "#f08a2c", 10);
    p.stroke([[14, 80], [146, 80]], 6); p.stroke([[80, 14], [80, 146]], 6);
    p.arc(80, 80, 40, 66, -90, 90, 6); p.arc(80, 80, 40, 66, 90, 270, 6);
  } },
};
