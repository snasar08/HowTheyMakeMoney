// Afterhour look: cel-shaded 3D cartoon character (see SPEC.md "char.ts contract").
import * as THREE from "three";
import { toonMat, metalMat, glowMat, outline, canvasTex } from "./common";

export type Expr = "smile" | "grin" | "smug" | "laugh" | "shock" | "sad" | "angry" | "wink" | "neutral" | "scream";
export type Look = { body: string; legs?: string; skin?: string; hat?: "none" | "crown" | "hardhat" | "fedora" | "cap" | "hair";
  hatColor?: string; hatText?: string; hair?: string; glasses?: "none" | "round" | "shades"; tie?: string; text?: string; halo?: boolean;
  /** colour of a shirt / collar showing at the neck */ shirt?: string;
  /** override the jacket colour used when `body` is near black (default #2f2f3a) */ jacket?: string;
  /** 1 = normal; 1.3 = very tall (longer legs, torso and arms; the head stays the same size) */ height?: number;
  /** "jacket" (default), "jersey" (basketball tank top + shorts, `text` = big number, `trim` colour) or "leather" (black leather jacket) */ outfit?: "jacket" | "jersey" | "leather";
  /** jersey trim colour at the neck, arm holes, hem, shorts stripe, socks and number (default white) */ trim?: string };
export type Pose = "stand" | "sit" | "cheer" | "wave" | "point" | "walk" | "dig" | "shrug";
export type Char = { root: THREE.Group; /** head centre height above the root when standing (1.55 at height 1) */ readonly headY: number; set(t: number, pose: Pose, expr: Expr, blink?: boolean): void };

const INK = "#14101a";
const HEAD_R = 0.42;
const BASE_L = 0.3;   // upper arm length, elbow -> hand centre length (scaled by height)

// ---------------------------------------------------------------- faces
const FW = 512, FH = 384, CX = 256;
// patch geometry: phi +-0.8 around front, theta 0.95..2.15 (centre slightly below equator)
const PHI_HALF = 0.8, TH0 = 0.95, TH_LEN = 1.2;

const line = (g: CanvasRenderingContext2D, w = 17) => { g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = INK; };

function brow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, bend = 0, w = 17) {
  line(g, w); g.beginPath(); g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + bend, x1, y1); g.stroke();
}
function dotEye(g: CanvasRenderingContext2D, x: number, y: number, rx = 21, ry = 31) {
  g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(x + rx * 0.3, y - ry * 0.35, rx * 0.3, 0, Math.PI * 2); g.fill();
}
function blinkEye(g: CanvasRenderingContext2D, x: number, y: number) {
  line(g, 16); g.beginPath(); g.moveTo(x - 28, y + 4); g.quadraticCurveTo(x, y + 26, x + 28, y + 4); g.stroke();
}
function happyEye(g: CanvasRenderingContext2D, x: number, y: number) {
  line(g, 18); g.beginPath(); g.moveTo(x - 28, y + 16); g.quadraticCurveTo(x, y - 30, x + 28, y + 16); g.stroke();
}
function openMouth(g: CanvasRenderingContext2D, cx: number, top: number, w: number, depth: number, teeth: boolean, tongue: boolean, flat = true) {
  g.save();
  const p = new Path2D();
  if (flat) {
    p.moveTo(cx - w, top); p.quadraticCurveTo(cx, top + 8, cx + w, top);
    p.bezierCurveTo(cx + w, top + depth * 1.25, cx - w, top + depth * 1.25, cx - w, top);
  } else {
    p.ellipse(cx, top + depth / 2, w, depth / 2, 0, 0, Math.PI * 2);
  }
  g.fillStyle = INK; g.fill(p);
  g.clip(p);
  if (tongue) { g.fillStyle = "#ee5566"; g.beginPath(); g.ellipse(cx, top + depth * 1.05, w * 0.62, depth * 0.42, 0, 0, Math.PI * 2); g.fill(); }
  if (teeth) { g.fillStyle = "#fff"; g.fillRect(cx - w, top - 4, w * 2, depth * 0.26); }
  g.restore();
  line(g, 14); g.stroke(p);
}

function drawFace(g: CanvasRenderingContext2D, e: Expr, blink: boolean) {
  const EY = 168, EX = 88, M = 272;
  const eyes = (kind: "dot" | "happy" | "none" = "dot", rx = 21, ry = 31) => {
    for (const s of [-1, 1]) {
      const x = CX + s * EX;
      if (kind === "happy") happyEye(g, x, EY);
      else if (kind === "dot") { if (blink) blinkEye(g, x, EY); else dotEye(g, x, EY, rx, ry); }
    }
  };
  switch (e) {
    case "smile":   // small friendly mouth, brows lifted
      eyes(); brow(g, CX - EX - 28, 106, CX - EX + 28, 98, -10, 15); brow(g, CX + EX - 28, 98, CX + EX + 28, 106, -10, 15);
      line(g, 15); g.beginPath(); g.moveTo(CX - 46, M - 2); g.quadraticCurveTo(CX, M + 42, CX + 46, M - 2); g.stroke();
      break;
    case "grin":
      eyes(); brow(g, CX - EX - 28, 104, CX - EX + 28, 94, -10, 15); brow(g, CX + EX - 28, 94, CX + EX + 28, 104, -10, 15);
      openMouth(g, CX, M - 8, 62, 50, true, true);
      break;
    case "smug": {   // half lids, one brow cocked high, tiny sideways smirk
      for (const s of [-1, 1]) {
        const x = CX + s * EX;
        if (blink) { blinkEye(g, x, EY); continue; }
        g.save(); g.beginPath(); g.rect(x - 40, EY - 4, 80, 60); g.clip(); dotEye(g, x, EY + 6, 24, 30); g.restore();
        line(g, 16); g.beginPath(); g.moveTo(x - 34, EY - 3); g.lineTo(x + 34, EY - 3); g.stroke();
      }
      brow(g, CX - EX - 30, 122, CX - EX + 30, 112, -4, 15); brow(g, CX + EX - 30, 84, CX + EX + 30, 92, -18, 15);
      line(g, 15); g.beginPath(); g.moveTo(CX - 30, M + 14); g.quadraticCurveTo(CX + 14, M + 28, CX + 52, M - 10); g.stroke();
      line(g, 11); g.beginPath(); g.moveTo(CX + 52, M - 10); g.lineTo(CX + 64, M - 22); g.stroke();
      break;
    }
    case "laugh":   // big open D mouth, brows way up
      eyes("happy"); brow(g, CX - EX - 28, 92, CX - EX + 28, 84, -10, 14); brow(g, CX + EX - 28, 84, CX + EX + 28, 92, -10, 14);
      openMouth(g, CX, M - 20, 100, 100, true, true);
      break;
    case "shock":
      for (const s of [-1, 1]) {
        const x = CX + s * (EX - 2);
        g.fillStyle = "#fff"; g.beginPath(); g.ellipse(x, EY, 32, 42, 0, 0, Math.PI * 2); g.fill();
        line(g, 12); g.stroke();
        if (blink) { g.fillStyle = INK; g.fillRect(x - 34, EY - 46, 68, 50); line(g, 12); g.beginPath(); g.moveTo(x - 34, EY + 4); g.lineTo(x + 34, EY + 4); g.stroke(); }
        else { g.fillStyle = INK; g.beginPath(); g.arc(x, EY + 2, 11, 0, Math.PI * 2); g.fill(); }
      }
      brow(g, CX - EX - 34, 82, CX - EX + 30, 72, -24, 15); brow(g, CX + EX - 30, 72, CX + EX + 34, 82, -24, 15);
      openMouth(g, CX, M - 6, 30, 76, false, false, false);
      // sweat drop
      g.fillStyle = "#58c8ff"; g.strokeStyle = INK; g.lineWidth = 9;
      g.beginPath(); g.moveTo(CX + 190, 70); g.quadraticCurveTo(CX + 232, 126, CX + 190, 142); g.quadraticCurveTo(CX + 148, 126, CX + 190, 70); g.fill(); g.stroke();
      break;
    case "sad":
      eyes("dot", 20, 30);
      brow(g, CX - EX - 34, 132, CX - EX + 30, 98, -4, 15); brow(g, CX + EX - 30, 98, CX + EX + 34, 132, -4, 15);
      line(g, 16); g.beginPath(); g.moveTo(CX - 44, M + 46); g.quadraticCurveTo(CX, M - 4, CX + 44, M + 46); g.stroke();
      g.fillStyle = "#58c8ff"; g.strokeStyle = INK; g.lineWidth = 7;
      g.beginPath(); g.moveTo(CX - EX - 8, EY + 40); g.quadraticCurveTo(CX - EX + 14, EY + 78, CX - EX - 8, EY + 90); g.quadraticCurveTo(CX - EX - 30, EY + 78, CX - EX - 8, EY + 40); g.fill(); g.stroke();
      break;
    case "angry":
      eyes("dot", 19, 25);
      brow(g, CX - EX - 38, 94, CX - EX + 34, 140, 0, 20); brow(g, CX + EX - 34, 140, CX + EX + 38, 94, 0, 20);
      line(g, 16); g.beginPath(); g.moveTo(CX - 50, M + 36); g.quadraticCurveTo(CX, M - 6, CX + 50, M + 36); g.stroke();
      break;
    case "wink": {
      dotEye(g, CX - EX, EY); happyEye(g, CX + EX, EY);
      if (blink) { /* wink already closed one eye; blink closes the other */ g.clearRect(CX - EX - 40, EY - 50, 80, 100); blinkEye(g, CX - EX, EY); }
      brow(g, CX - EX - 28, 106, CX - EX + 28, 98, -8, 14); brow(g, CX + EX - 28, 84, CX + EX + 28, 92, -12, 14);
      openMouth(g, CX + 6, M - 10, 54, 46, true, true);
      break;
    }
    case "neutral":   // tiny flat mouth
      eyes(); brow(g, CX - EX - 26, 112, CX - EX + 26, 110, 0, 14); brow(g, CX + EX - 26, 110, CX + EX + 26, 112, 0, 14);
      line(g, 15); g.beginPath(); g.moveTo(CX - 28, M + 14); g.lineTo(CX + 28, M + 14); g.stroke();
      break;
    case "scream":
      for (const s of [-1, 1]) {
        const x = CX + s * EX;
        line(g, 19); g.beginPath();
        g.moveTo(x - s * 28, EY - 30); g.lineTo(x + s * 22, EY + 2); g.lineTo(x - s * 28, EY + 34); g.stroke();
      }
      brow(g, CX - EX - 34, 88, CX - EX + 30, 74, -20, 16); brow(g, CX + EX - 30, 74, CX + EX + 34, 88, -20, 16);
      openMouth(g, CX, M - 34, 106, 134, true, true, true);
      break;
  }
}

const faceMats = new Map<string, THREE.MeshBasicMaterial>();
function faceMat(e: Expr, blink: boolean) {
  const key = e + (blink ? "|b" : "");
  let m = faceMats.get(key);
  if (!m) {
    const tex = canvasTex(FW, FH, (g) => drawFace(g, e, blink));
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    faceMats.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- helpers
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) => {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = false; return o;
};
const GEO = new Map<string, THREE.BufferGeometry>();
const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
  let g = GEO.get(key) as T | undefined;
  if (!g) { g = make(); GEO.set(key, g); }
  return g;
};
const dome = (r: number, thetaMax: number, mat: THREE.Material) =>
  mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaMax), mat);

const INK_MAT = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
/** thin-limb outline: a slightly fatter back-face copy (radius + t, length + 2t) */
const ink = (m: THREE.Mesh, g: THREE.BufferGeometry) => { const o = new THREE.Mesh(g, INK_MAT); o.castShadow = false; m.add(o); return m; };
const tube = (r: number, len: number, mat: THREE.Material, t: number, rad = 12, x = 0, y = 0, z = 0) => {
  const m = mesh(geo(`cyl|${r}|${len}|${rad}`, () => new THREE.CylinderGeometry(r, r, len, rad)), mat, x, y, z);
  if (t > 0) ink(m, geo(`cylo|${r}|${len}|${t}|${rad}`, () => new THREE.CylinderGeometry(r + t, r + t, len + t * 2, rad)));
  return m;
};
const ball = (r: number, mat: THREE.Material, t: number, w = 14, h = 10, x = 0, y = 0, z = 0) => {
  const m = mesh(geo(`sph|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h)), mat, x, y, z);
  if (t > 0) ink(m, geo(`spho|${r}|${t}|${w}|${h}`, () => new THREE.SphereGeometry(r + t, w, h)));
  return m;
};

function labelTex(text: string, bg: string, fg: string) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    let size = 170;
    do { g.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`; size -= 6; } while (g.measureText(text).width > 440 && size > 30);
    g.fillText(text, 256, 134);
  });
}
function chestTex(text: string, col: string, big = 190, edge?: string) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
    let size = big;
    do { g.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`; size -= 6; } while (g.measureText(text).width > 450 && size > 30);
    if (edge) { g.lineWidth = 14; g.lineJoin = "round"; g.strokeStyle = edge; g.strokeText(text, 256, 134); }
    g.fillText(text, 256, 134);
  });
}
const STD = new Map<string, THREE.MeshStandardMaterial>();
const stdMat = (key: string, o: THREE.MeshStandardMaterialParameters) => { let m = STD.get(key); if (!m) { m = new THREE.MeshStandardMaterial(o); STD.set(key, m); } return m; };
const lum = (c: string) => { const k = new THREE.Color(c); return 0.3 * k.r + 0.59 * k.g + 0.11 * k.b; };
const shade = (c: string, f: number) => "#" + new THREE.Color(c).multiplyScalar(f).getHexString();

type Limb = { sh: THREE.Group; el: THREE.Group; hand: THREE.Mesh; s: number; sy: number; l1: number; l2: number };

const B_R = 0.26;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);
/** two-bone reach: the hand centre goes to `target` (rig space); `pole` says which way the elbow bends */
function reach(a: Limb, target: THREE.Vector3, pole: THREE.Vector3) {
  const L1 = a.l1, L2 = a.l2;
  const P = _a.set(a.s * 0.285, a.sy, 0);
  const v = _b.copy(target).sub(P); let D = v.length();
  D = Math.min(Math.max(D, 0.12), L1 + L2 - 0.004);
  const dir = v.normalize();                                   // shoulder -> hand
  const aa = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
  const perp = _c.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = _d.copy(P).addScaledVector(dir, aa).addScaledVector(perp, h);   // elbow
  const d1 = _e.copy(E).sub(P).normalize();
  a.sh.quaternion.setFromUnitVectors(DOWN, d1);
  const hand = _b.copy(P).addScaledVector(dir, D);
  const d2 = hand.sub(E).normalize();                          // in rig space
  _q.copy(a.sh.quaternion).invert();
  _q2.setFromUnitVectors(DOWN, d2);
  a.el.quaternion.copy(_q.multiply(_q2));
}

function buildChar(look: Look, cheap: boolean): Char {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);
  // ---- height: legs take ~72% of the extra, torso the rest, arms a bit; the head stays the same size
  const hgt = look.height ?? 1;
  const G = (hgt - 1) * 1.55, legG = G * 0.72, tg = G - legG;
  const HIP_Y = 0.55 + legG, SHOULDER_Y = 1.2 + G, HEAD_Y = 1.55 + G, sl = HIP_Y / 0.55;
  const B_CY = 0.95 + legG + tg / 2, B_HALF = 0.175 + tg / 2;
  const L1 = BASE_L * (1 + (hgt - 1) * 0.5), L2 = L1;
  const up = G, lo = legG, mid = legG + tg * 0.5;   // y shifts for parts at the neck / hem / chest
  /** point on the body surface at height y, around-the-body angle a (0 = front), pushed out by `off` */
  const bodyPt = (a: number, y: number, off = 0.004) => {
    const dy = Math.abs(y - B_CY) - B_HALF;
    const r = (dy <= 0 ? B_R : Math.sqrt(Math.max(0.0001, B_R * B_R - dy * dy))) + off;
    return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  };
  const bodyTube = (a: number, y0: number, y1: number, rad: number, mat: THREE.Material, n = 14) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) pts.push(bodyPt(a, y0 + (y1 - y0) * (i / n)));
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, rad, 5, false), mat, 0, 0, 0, false);
  };
  /** a flat patch wrapped onto the body front: rows of [y, xLeft, xRight] (xLeft < xRight, metres across the front) */
  const wrapPatch = (rows: [number, number, number][], depth: number, grow = 0, M = 6) => {
    const pos: number[] = [], idx: number[] = [];
    const n = rows.length;
    rows.forEach(([y, xl, xr], j) => {
      const yy = y + (j === 0 ? grow : j === n - 1 ? -grow : 0);
      for (let k = 0; k <= M; k++) {
        const x = xl - grow + (xr - xl + grow * 2) * (k / M);
        const p = bodyPt(x / 0.26, yy, depth);
        pos.push(p.x, p.y, p.z);
      }
    });
    for (let j = 0; j < n - 1; j++) for (let k = 0; k < M; k++) {
      const a0 = j * (M + 1) + k, a1 = a0 + 1, b0 = a0 + M + 1, b1 = b0 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  /** panel with a black ink edge behind it */
  const inked = (rows: [number, number, number][], depth: number, mat: THREE.Material, edge = 0.012) => {
    const gr = new THREE.Group();
    const mm = mat.clone(); mm.side = THREE.DoubleSide;
    const m = new THREE.Mesh(wrapPatch(rows, depth), mm);
    const ik = new THREE.Mesh(wrapPatch(rows, depth - 0.004, edge), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }));
    gr.add(ik, m); return gr;
  };
  const outfit = look.outfit ?? "jacket";
  const jersey = outfit === "jersey", leather = outfit === "leather";
  const trimCol = look.trim ?? "#ffffff";
  const skin = look.skin ?? "#f7f7f7";
  const dark = lum(look.body) < 0.14;
  const jacketCol = look.jacket ?? (dark ? (jersey ? "#26262e" : "#454552") : look.body);   // near-black jackets read as dark grey, not a hole
  const sleeveCol = dark ? "#34343f" : shade(look.body, 0.82);
  const legCol = look.legs ?? "#33333e";
  const legLit = jersey && lum(legCol) < 0.14 ? "#26262e" : legCol;
  const skinMat = toonMat(skin, { emissive: skin, emissiveIntensity: 0.32 });   // heads stay white under coloured room light, like the reference
  const leatherCol = lum(look.body) < 0.2 ? "#30303a" : look.body;
  const leatherMat = leather ? stdMat(`leather|${leatherCol}`, { color: leatherCol, metalness: 0.25, roughness: 0.28, emissive: "#1a1a22", emissiveIntensity: 0.9 }) : undefined;
  const limbMat: THREE.Material = jersey ? skinMat : leather ? leatherMat! : toonMat(sleeveCol, { emissive: sleeveCol, emissiveIntensity: 0.3 });
  const bodyMat: THREE.Material = leather ? leatherMat! : toonMat(jacketCol, { emissive: jacketCol, emissiveIntensity: jersey ? 0.38 : 0.28 });
  const trimMat = toonMat(dark ? "#1a1a22" : shade(look.body, 0.6));
  const zipMat = toonMat("#b4b6c4", { emissive: "#6a6c78", emissiveIntensity: 0.5 });
  const zipMetal: THREE.Material = leather ? stdMat("zip", { color: "#e4e7f0", metalness: 0.9, roughness: 0.2, emissive: "#a0a4b4", emissiveIntensity: 0.7 }) : zipMat;

  // body (jacket)
  const body = outline(mesh(new THREE.CapsuleGeometry(B_R, 0.35 + tg, cheap ? 4 : 8, cheap ? 12 : 22), bodyMat, 0, B_CY, 0), 0.045);
  rig.add(body);
  if (jersey) {
    const tm = toonMat(trimCol, { emissive: trimCol, emissiveIntensity: 0.35 });
    const yT = SHOULDER_Y;
    // bare chest in the scoop neck + trim around it
    const scoop: [number, number, number][] = [[yT + 0.05, -0.125, 0.125], [yT - 0.02, -0.122, 0.122], [yT - 0.08, -0.1, 0.1], [yT - 0.125, -0.06, 0.06], [yT - 0.145, -0.02, 0.02]];
    rig.add(inked(scoop, 0.006, skinMat, 0.004));
    const pts: THREE.Vector3[] = [];
    const edge: [number, number][] = [[-0.13, yT + 0.05], [-0.128, yT - 0.02], [-0.108, yT - 0.085], [-0.065, yT - 0.133], [0, yT - 0.152], [0.065, yT - 0.133], [0.108, yT - 0.085], [0.128, yT - 0.02], [0.13, yT + 0.05]];
    for (const [x, y] of edge) pts.push(bodyPt(x / 0.26, y, 0.006));
    rig.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0165, 6, false), tm, 0, 0, 0, false));
    if (!cheap) {
      for (const s of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.1, 0.017, 7, 24), tm, s * 0.236, SHOULDER_Y - 0.035, 0, false);   // arm hole binding
        ring.rotation.y = Math.PI / 2; ring.scale.set(1, 1.05, 1); rig.add(ring);
        rig.add(bodyTube(s * 1.42, SHOULDER_Y - 0.1, 0.58 + lo, 0.012, tm, 10));   // side stripe
      }
      const hem = mesh(new THREE.TorusGeometry(0.248, 0.016, 6, 30), tm, 0, HIP_Y + 0.115, 0); hem.rotation.x = Math.PI / 2; rig.add(hem);
    }
    // shorts waist
    const waist = outline(mesh(new THREE.CylinderGeometry(0.245, 0.285, 0.2, cheap ? 14 : 28), toonMat(legLit, { emissive: legLit, emissiveIntensity: 0.3 }), 0, HIP_Y + 0.02, 0), 0.02);
    rig.add(waist);
  } else if (leather) {
    const yT = SHOULDER_Y;
    const L = leatherMat!, lapM = stdMat("lapel", { color: "#4a4a58", metalness: 0.3, roughness: 0.25, emissive: "#2a2a35", emissiveIntensity: 0.9 });
    const shirtC = look.shirt ?? "#09090c";
    const shirtM = toonMat(shirtC, { emissive: "#15151b", emissiveIntensity: 0.6 });
    // black shirt at the neck (V between the lapels)
    rig.add(inked([[yT + 0.05, -0.1, 0.1], [yT - 0.05, -0.085, 0.085], [yT - 0.17, -0.05, 0.05], [yT - 0.3, -0.012, 0.012]], 0.008, shirtM, 0.003));
    // standing collar ring
    const collar = outline(mesh(new THREE.TorusGeometry(0.205, 0.05, 10, 26), L, 0, 1.175 + up, -0.01), 0.02);
    collar.rotation.x = Math.PI / 2 - 0.12; rig.add(collar);
    // wide notch lapels (wrapped onto the chest)
    for (const s of [-1, 1]) {
      const rows = ([[yT + 0.05, 0.055, 0.215], [yT + 0.0, 0.05, 0.245], [yT - 0.055, 0.045, 0.21], [yT - 0.09, 0.05, 0.255], [yT - 0.16, 0.04, 0.14], [yT - 0.24, 0.032, 0.075], [yT - 0.32, 0.022, 0.04]] as [number, number, number][])
        .map(([y, a, b]) => (s > 0 ? [y, a, b] : [y, -b, -a]) as [number, number, number]);
      rig.add(inked(rows, 0.016, lapM, 0.011));
    }
    // silver zipper down the front + teeth
    rig.add(bodyTube(0, yT - 0.31, 0.6 + lo, 0.011, zipMetal, 16));
    const toothG = geo("tooth", () => new THREE.BoxGeometry(0.036, 0.009, 0.014));
    for (let i = 0; i < 40; i++) {
      const y = yT - 0.33 - i * 0.032; if (y < 0.62 + lo) break;
      const p = bodyPt(0, y, 0.008); rig.add(mesh(toothG, zipMetal, p.x, p.y, p.z, false));
    }
    const pull = outline(mesh(new THREE.BoxGeometry(0.034, 0.06, 0.016), zipMetal, 0, yT - 0.325, B_R + 0.012), 0.008); rig.add(pull);
    if (!cheap) {
      const hem = mesh(new THREE.TorusGeometry(0.2, 0.017, 6, 28), stdMat("hem", { color: "#15151a", metalness: 0.2, roughness: 0.35 }), 0, 0.6 + lo, 0); hem.rotation.x = Math.PI / 2; rig.add(hem);
      // shiny highlight streaks (cel specular): chest sides, belly and shoulders
      const hi = new THREE.MeshBasicMaterial({ color: "#f4f7ff", transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
      const hi2 = new THREE.MeshBasicMaterial({ color: "#c9d6fb", transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
      /** a soft pointed-oval shine on the chest: centre x, from y0 down to y1, half width w, slanted by `lean` */
      const sheen = (xc: number, y0: number, y1: number, w: number, lean: number, mat: THREE.Material) => {
        const rows: [number, number, number][] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, hw = Math.max(0.002, w * Math.pow(Math.sin(Math.PI * t), 0.75)), c = xc + lean * (t - 0.5);
          rows.push([y0 + (y1 - y0) * t, c - hw, c + hw]);
        }
        const m = new THREE.Mesh(wrapPatch(rows, 0.021, 0, 4), mat); m.renderOrder = 3; m.castShadow = false; return m;
      };
      for (const s of [-1, 1]) {
        rig.add(sheen(s * 0.165, yT - 0.2, yT - 0.5, 0.05, s * 0.03, hi2));
        rig.add(sheen(s * 0.17, yT - 0.22, yT - 0.46, 0.017, s * 0.03, hi));
        rig.add(sheen(s * 0.225, yT - 0.0, yT - 0.12, 0.014, 0, hi));
        rig.add(sheen(s * 0.2, 0.86 + lo, 0.72 + lo, 0.013, 0, hi));
      }
    }
  } else if (look.tie) {
    const tm = toonMat(look.tie);
    const knot = mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), tm, 0, 1.2 + up, 0.252);
    const blade = mesh(new THREE.BoxGeometry(0.08, 0.26, 0.025), tm, 0, 1.04 + up, 0.262);
    blade.scale.set(1, 1, 1); blade.rotation.x = 0.05;
    rig.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), toonMat("#ffffff"), 0, 1.255 + up, 0.245), knot, blade);
  } else if (!cheap) {
    // jacket: collar ring + flaps, optional shirt at the neck, zipper, seams, hem
    const shirtCol = look.shirt;
    if (shirtCol) {
      const sm = toonMat(shirtCol);
      const v = mesh(new THREE.BoxGeometry(0.13, 0.14, 0.03), sm, 0, 1.15 + up, 0.225); v.rotation.x = -0.12; rig.add(v);
    }
    const collar = outline(mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 26), bodyMat, 0, 1.175 + up, -0.01), 0.02);
    collar.rotation.x = Math.PI / 2 - 0.12; rig.add(collar);
    for (const s of [-1, 1]) {
      const fl = outline(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), bodyMat, s * 0.085, 1.17 + up, 0.215), 0.014);
      fl.rotation.set(-0.15, s * -0.45, s * 0.35); rig.add(fl);
    }
    rig.add(bodyTube(0, 1.1 + up, 0.6 + lo, 0.0085, zipMat, 16));
    const pull = mesh(new THREE.BoxGeometry(0.03, 0.05, 0.014), zipMat, 0, 1.08 + up, B_R + 0.005); rig.add(pull);
    for (const s of [-1, 1]) {
      rig.add(bodyTube(s * 1.3, 1.12 + up, 0.62 + lo, 0.006, trimMat, 12));            // side seams
      rig.add(bodyTube(s * 0.42, 0.9 + mid, 0.62 + lo, 0.006, trimMat, 8));              // front panel seams
      const hem = mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 28), trimMat, 0, 0.6 + lo, 0); hem.rotation.x = Math.PI / 2; if (s === 1) rig.add(hem);
      const pocket = mesh(new THREE.BoxGeometry(0.1, 0.011, 0.01), trimMat, s * 0.14, 0.78 + lo + tg * 0.3, 0.222); pocket.rotation.set(0, s * 0.55, s * -0.22); rig.add(pocket);
    }
  } else {
    rig.add(bodyTube(0, 1.1 + up, 0.62 + lo, 0.008, zipMat, 8));
  }
  if (look.text) {
    if (jersey) {
      const tex = chestTex(look.text, trimCol, 330, lum(jacketCol) < 0.5 ? "#0c0c10" : "#ffffff");
      const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.268, 0.34, 28, 1, true, -1.15, 2.3), toonMat("#ffffff", { map: tex, transparent: true, emissive: trimCol, emissiveIntensity: 0.9 }));
      patch.position.y = SHOULDER_Y - 0.37; patch.castShadow = false; rig.add(patch);
    } else {
      const col = lum(jacketCol) > 0.5 ? "#15121a" : "#ffffff";
      const tex = chestTex(look.text, col);
      const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.268, 0.22, 24, 1, true, -0.95, 1.9), toonMat("#ffffff", { map: tex, transparent: true }));
      patch.position.y = 1.0 + mid; patch.castShadow = false; rig.add(patch);
    }
  }

  // head
  const head = new THREE.Group(); head.position.set(0, HEAD_Y, 0); rig.add(head);
  head.add(outline(mesh(new THREE.SphereGeometry(HEAD_R, cheap ? 22 : 40, cheap ? 16 : 28), skinMat), 0.032));
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R + 0.006, cheap ? 14 : 32, cheap ? 10 : 24, Math.PI / 2 - PHI_HALF, PHI_HALF * 2, TH0, TH_LEN), faceMat("neutral", false));
  face.renderOrder = 2; head.add(face);

  // accessories
  const hc = look.hatColor ?? "#e9a21a";
  switch (look.hat ?? "none") {
    case "crown": {
      const gold = metalMat("#ffc928", 0.3);
      const spikes = cheap ? 4 : 6;
      const g = new THREE.Group(); g.position.set(0, 0.155, 0); g.scale.setScalar(0.8);   // ~20% smaller, sitting on the top of the head
      g.add(outline(mesh(new THREE.CylinderGeometry(0.285, 0.265, 0.13, cheap ? 16 : 28), gold, 0, 0.3, 0), 0.02));
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2 + Math.PI / spikes;
        const x = Math.sin(a) * 0.27, z = Math.cos(a) * 0.27;
        g.add(outline(mesh(new THREE.ConeGeometry(0.06, 0.18, 4), gold, x, 0.455, z), 0.015));
        if (!cheap) g.add(mesh(new THREE.SphereGeometry(0.032, 12, 10), toonMat(i % 2 ? "#3a7bff" : "#ff2a3c", { emissive: i % 2 ? "#3a7bff" : "#ff2a3c", emissiveIntensity: 0.6 }), x, 0.56, z));
      }
      g.add(mesh(new THREE.SphereGeometry(0.045, 14, 12), toonMat("#ff2a3c", { emissive: "#ff2a3c", emissiveIntensity: 0.6 }), 0, 0.3, 0.29));
      if (!cheap) {
        g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), toonMat("#3a7bff", { emissive: "#3a7bff", emissiveIntensity: 0.6 }), -0.14, 0.3, 0.25));
        g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), toonMat("#3a7bff", { emissive: "#3a7bff", emissiveIntensity: 0.6 }), 0.14, 0.3, 0.25));
        // soft golden glow
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.y = 0.42; glow.scale.set(1, 0.7, 1); glow.castShadow = false; g.add(glow);
      }
      head.add(g);
      break;
    }
    case "hardhat": {
      const m = toonMat(hc);
      const g = new THREE.Group();
      const d = dome(0.45, 1.15, m); d.position.y = 0.03; d.scale.set(0.97, 1, 0.97); outline(d, 0.03); g.add(d);
      const brim = mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.035, 28, 1, false, -1.15, 2.3), m, 0, 0.216, 0);
      brim.scale.set(0.95, 1, 1); outline(brim, 0.02); g.add(brim);
      const ridge = mesh(new THREE.BoxGeometry(0.07, 0.04, 0.8), m, 0, 0.475, 0); ridge.scale.set(1, 1, 0.5); g.add(ridge);
      if (look.hatText && !cheap) {
        const lm = toonMat("#ffffff", { map: labelTex(look.hatText, "#ffffff", "#15121a") });
        const lab = new THREE.Mesh(new THREE.SphereGeometry(0.456, 28, 8, Math.PI / 2 - 0.62, 1.24, 0.5, 0.5), lm);
        lab.position.y = 0.03; lab.scale.set(0.97, 1, 0.97); lab.castShadow = false; g.add(lab);
      }
      head.add(g);
      break;
    }
    case "fedora": {
      const m = toonMat(look.hatColor ?? "#2b2b33");
      const g = new THREE.Group(); g.rotation.x = -0.07;
      g.add(outline(mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.03, 36), m, 0, 0.27, 0), 0.025));
      g.add(outline(mesh(new THREE.CylinderGeometry(0.235, 0.285, 0.24, 28), m, 0, 0.39, 0), 0.03));
      g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 28), toonMat("#a8202f"), 0, 0.31, 0));
      head.add(g);
      break;
    }
    case "cap": {
      const m = toonMat(hc);
      const g = new THREE.Group();
      const d = dome(0.445, 1.22, m); d.position.y = 0.02; outline(d, 0.03); g.add(d);
      const vis = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 24, 1, false, -0.85, 1.7), m, 0, 0.14, 0.03);
      vis.rotation.x = 0.0; outline(vis, 0.02); g.add(vis);
      g.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), m, 0, 0.465, 0));
      head.add(g);
      break;
    }
    case "hair": {
      const m = toonMat(look.hair ?? "#3a2418");
      const g = new THREE.Group();
      const d = dome(0.437, 1.05, m); d.position.y = 0.02; d.rotation.x = -0.12; outline(d, 0.025); g.add(d);
      for (const [x, r] of [[-0.1, 0.07], [0, 0.085], [0.1, 0.07]] as [number, number][]) g.add(mesh(new THREE.SphereGeometry(r, 12, 10), m, x, 0.4, 0.17));
      head.add(g);
      break;
    }
  }
  if (look.halo) {
    const halo = mesh(new THREE.TorusGeometry(0.22, 0.032, 12, 40), glowMat("#ffd84a", 2.4), 0, 0.62, 0, false);
    halo.rotation.x = Math.PI / 2; halo.name = "halo"; head.add(halo);
  }
  const gl = look.glasses ?? "none";
  if (gl === "shades") {
    // small rounded-rectangle dark lenses with a thin frame, slightly reflective, at eye height (y ~0.04 on the face patch)
    const rr = (w: number, h: number, r: number) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    };
    const frameG = geo("shade-frame", () => new THREE.ExtrudeGeometry(rr(0.152, 0.088, 0.024), { depth: 0.014, bevelEnabled: false }));
    const lensG = geo("shade-lens", () => new THREE.ExtrudeGeometry(rr(0.134, 0.07, 0.02), { depth: 0.012, bevelEnabled: false }));
    const glintG = geo("shade-glint", () => new THREE.PlaneGeometry(0.03, 0.012));
    const frameM = toonMat("#1d1d26");
    const lensM = SHADE_LENS ?? (SHADE_LENS = new THREE.MeshStandardMaterial({ color: "#07070c", metalness: 0.35, roughness: 0.3, emissive: "#0c1220", emissiveIntensity: 0.5 }));
    const glintM = new THREE.MeshBasicMaterial({ color: "#8fb4ff", transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
      const ph = s * 0.285, R = HEAD_R + 0.004, y = 0.04;
      const gp = new THREE.Group();
      gp.position.set(Math.sin(ph) * R, y, Math.cos(ph) * R); gp.rotation.y = ph; gp.rotation.x = -0.03;
      gp.add(mesh(frameG, frameM, 0, 0, -0.003, false));
      gp.add(mesh(lensG, lensM, 0, 0, 0.0105, false));
      if (!cheap) { const gl1 = new THREE.Mesh(glintG, glintM); gl1.position.set(-0.03, 0.017, 0.0235); gl1.rotation.z = 0.5; gp.add(gl1); }
      head.add(gp);
      if (!cheap) {   // temple arm back along the head
        const arm = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.12), frameM, s * 0.38, 0.045, 0.2, false); arm.rotation.y = s * -0.9; head.add(arm);
      }
    }
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), frameM, 0, 0.055, HEAD_R + 0.003, false));   // bridge
  } else if (gl === "round") {
    for (const s of [-1, 1]) {
      const r = mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 28), toonMat("#15121a"), s * 0.115, 0.0, 0.405);
      r.rotation.y = s * 0.25; head.add(r);
    }
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), toonMat("#15121a"), 0, 0.02, 0.418));
  }

  // limbs (sleeves, thin outline so they read against the jacket)
  const ot = cheap ? 0 : 0.011, rad = cheap ? 6 : 12;
  const addArm = (s: number): Limb => {
    const sh = new THREE.Group(); sh.position.set(s * 0.285, SHOULDER_Y, 0); rig.add(sh);
    if (!cheap) sh.add(ball(0.054, limbMat, ot, 12, 10));
    sh.add(tube(0.042, L1 - 0.02, limbMat, ot, rad, 0, -L1 / 2, 0));
    const el = new THREE.Group(); el.position.y = -L1; sh.add(el);
    if (!cheap) el.add(ball(0.045, limbMat, ot, 10, 8));
    el.add(tube(0.04, L2 - 0.07, limbMat, ot, rad, 0, -(L2 - 0.07) / 2 - 0.0, 0));
    const hand = outline(mesh(geo(`hand${cheap}`, () => new THREE.SphereGeometry(0.072, cheap ? 8 : 16, cheap ? 6 : 12)), skinMat, 0, -L2, 0), cheap ? 0.012 : 0.016);
    el.add(hand);
    return { sh, el, hand, s, sy: SHOULDER_Y, l1: L1, l2: L2 };
  };
  const armR = addArm(1), armL = addArm(-1);

  const addLeg = (s: number) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.125, HIP_Y, 0); rig.add(hip);
    const lcol = jersey ? legLit : legCol;
    const lm = toonMat(lcol, { emissive: lcol, emissiveIntensity: 0.3 });
    const um = jersey ? skinMat : lm;   // bare legs below the shorts
    if (!cheap) hip.add(ball(0.058, um, ot, 10, 8));
    hip.add(tube(0.056, 0.26 * sl, um, ot, rad, 0, -0.14 * sl, 0));
    const knee = new THREE.Group(); knee.position.y = -0.28 * sl; hip.add(knee);
    if (!cheap) knee.add(ball(0.053, um, ot, 10, 8));
    knee.add(tube(0.05, 0.2 * sl, um, ot, rad, 0, -0.11 * sl, 0));
    const foot = ball(0.07, lm, ot, cheap ? 8 : 14, cheap ? 6 : 10, 0, -0.255 * sl, 0.04); foot.scale.set(0.85, 0.6, 1.6); knee.add(foot);
    if (jersey) {
      // wide shorts down to the knee, side stripe, long sock
      const sm = toonMat(lcol, { emissive: lcol, emissiveIntensity: 0.3 });
      const tm = toonMat(trimCol, { emissive: trimCol, emissiveIntensity: 0.35 });
      const sh = outline(mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.31 * sl, cheap ? 12 : 20), sm, 0, -0.115 * sl, 0), 0.02);
      hip.add(sh);
      if (!cheap) {
        hip.add(mesh(new THREE.BoxGeometry(0.014, 0.26 * sl, 0.06), tm, s * 0.168, -0.12 * sl, 0, false));
        const cuff = mesh(new THREE.TorusGeometry(0.178, 0.011, 6, 22), tm, 0, -0.268 * sl, 0, false); cuff.rotation.x = Math.PI / 2; hip.add(cuff);
        const sock = ball(0.001, tm, 0); sock.geometry = geo(`sock|${sl}`, () => new THREE.CylinderGeometry(0.058, 0.054, 0.11 * sl, 14));
        sock.position.y = -0.1 * sl; sock.scale.setScalar(1);
        knee.add(sock);
        const sockOutline = new THREE.Mesh(geo(`socko|${sl}`, () => new THREE.CylinderGeometry(0.058 + ot, 0.054 + ot, 0.11 * sl + ot * 2, 14)), INK_MAT); sock.add(sockOutline);
        const band = mesh(new THREE.TorusGeometry(0.058, 0.008, 5, 16), toonMat(lcol), 0, -0.06 * sl, 0, false); band.rotation.x = Math.PI / 2; knee.add(band);
      }
    }
    return { hip, knee };
  };
  const legR = addLeg(1), legL = addLeg(-1);

  // shovel (dig only), held in both hands
  const shovel = new THREE.Group(); shovel.visible = false; rig.add(shovel);
  {
    const wood = toonMat("#8a5a2b"), steel = toonMat("#9aa3ad");
    shovel.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.25, 8), wood, 0, -0.2, 0));
    shovel.add(mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), wood, 0, 0.43, 0));
    const blade = outline(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.02), steel, 0, -0.9, 0), 0.02); shovel.add(blade);
  }

  const setArm = (a: Limb, s: number, shx: number, shz: number, elx = 0, elz = 0, shy = 0) => {
    a.sh.rotation.set(shx, shy, shz * s); a.el.rotation.set(elx, 0, elz * s);
  };
  const tgt = new THREE.Vector3(), pole = new THREE.Vector3();

  let curExpr = "", curBlink = false;
  const set = (t: number, pose: Pose, expr: Expr, blink = false) => {
    // face (extras only draw two expressions: happy / flat)
    let fe: Expr = expr;
    if (cheap) fe = (expr === "smile" || expr === "grin" || expr === "laugh" || expr === "wink" || expr === "smug") ? "grin" : "neutral";
    const fb = cheap ? false : blink;
    if (curExpr !== fe || curBlink !== fb) { (face.material as THREE.Material) = faceMat(fe, fb); curExpr = fe; curBlink = fb; }
    // reset
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    head.position.set(0, HEAD_Y, 0);
    head.rotation.set(0, 0, 0);
    shovel.visible = false;
    legR.hip.position.set(0.125, HIP_Y, 0); legL.hip.position.set(-0.125, HIP_Y, 0);
    legR.hip.rotation.set(0, 0, 0); legL.hip.rotation.set(0, 0, 0); legR.knee.rotation.set(0, 0, 0); legL.knee.rotation.set(0, 0, 0);
    const breath = Math.sin(t * 2.2);
    rig.position.y = breath * 0.008;
    body.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1 + breath * 0.012);
    head.position.y = HEAD_Y + Math.sin(t * 2.2 + 0.6) * 0.01;
    head.rotation.z = Math.sin(t * 1.3) * 0.025;
    head.rotation.y = Math.sin(t * 0.9) * 0.05;
    const halo = head.getObjectByName("halo");
    if (halo) halo.position.y = 0.62 + Math.sin(t * 3) * 0.02;

    switch (pose) {
      case "stand":
        setArm(armR, 1, 0.05, 0.14, 0, 0); setArm(armL, -1, 0.05, 0.14, 0, 0);
        break;
      case "sit": {
        // thighs forward, shins down, hands resting on the knees
        legR.hip.rotation.x = -Math.PI / 2 + 0.04; legL.hip.rotation.x = -Math.PI / 2 + 0.04;
        legR.knee.rotation.x = Math.PI / 2 - 0.04; legL.knee.rotation.x = Math.PI / 2 - 0.04;
        legR.hip.rotation.z = 0.1; legL.hip.rotation.z = -0.1;
        legR.hip.position.set(0.14, HIP_Y + 0.09, 0.03); legL.hip.position.set(-0.14, HIP_Y + 0.09, 0.03);
        const tw = Math.sin(t * 1.7) * 0.01;
        for (const a of [armR, armL]) {
          tgt.set(a.s * 0.2, 0.78 + (HIP_Y - 0.55) + tw, 0.24 + 0.14 * (sl - 1)); pole.set(a.s * 1, -0.1, -0.7);
          reach(a, tgt, pole);
        }
        break;
      }
      case "cheer": {
        const b = Math.abs(Math.sin(t * 7));
        rig.position.y += b * 0.07;
        const w = Math.sin(t * 7) * 0.12;
        setArm(armR, 1, 0, Math.PI - 0.38 + w, 0, 0); setArm(armL, -1, 0, Math.PI - 0.38 - w, 0, 0);
        legR.hip.rotation.z = 0.06; legL.hip.rotation.z = -0.06;
        break;
      }
      case "wave": {
        setArm(armR, 1, 0, Math.PI - 0.62, 0, Math.sin(t * 9) * 0.55 + 0.1);
        setArm(armL, -1, 0.05, 0.14, 0, 0);
        head.rotation.z += -0.05;
        break;
      }
      case "point":
        setArm(armR, 1, -Math.PI / 2 + 0.05, 0.12, -0.08, 0);
        setArm(armL, -1, 0.05, 0.14, 0, 0);
        head.rotation.y += -0.12;
        break;
      case "walk": {
        const ph = t * 6.5, sw = Math.sin(ph);
        rig.position.y += Math.abs(Math.cos(ph)) * 0.035;
        const amp = 0.62 / Math.sqrt(sl);
        legR.hip.rotation.x = sw * amp; legL.hip.rotation.x = -sw * amp;
        legR.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.7 + 0.05; legL.knee.rotation.x = Math.max(0, Math.cos(ph)) * 0.7 + 0.05;
        setArm(armR, 1, -sw * 0.6, 0.1, -0.35, 0); setArm(armL, -1, sw * 0.6, 0.1, -0.35, 0);
        rig.rotation.y = sw * 0.06;
        break;
      }
      case "dig": {
        const sw = Math.sin(t * 3.2);
        rig.rotation.x = 0.1 + sw * 0.04;
        shovel.visible = true;
        shovel.position.set(0, 1.04 + G * 0.9 + sw * 0.03, 0.44);
        shovel.rotation.set(-0.5 - sw * 0.3, 0, 0);
        shovel.updateMatrix();
        // both hands on the shaft: upper hand near the handle, lower hand lower down
        const grips: [number, number][] = [[0.22, 1], [-0.1, -1]];
        for (const a of [armR, armL]) {
          const g = a.s === 1 ? grips[0] : grips[1];
          tgt.set(a.s * 0.045, g[0], 0).applyMatrix4(shovel.matrix);
          pole.set(a.s * 0.8, -0.5, -0.2);
          reach(a, tgt, pole);
        }
        legR.hip.rotation.x = -0.12; legL.hip.rotation.x = 0.15; legR.knee.rotation.x = 0.12; legL.knee.rotation.x = 0.1;
        break;
      }
      case "shrug": {
        const up = (Math.sin(t * 4) * 0.5 + 0.5) * 0.12;
        setArm(armR, 1, 0.1, 0.35 + up, 0, 1.75); setArm(armL, -1, 0.1, 0.35 + up, 0, 1.75);
        head.rotation.z += 0.09; head.position.y -= 0.03;
        break;
      }
    }
    // expression head attitude
    if (expr === "smug") { head.rotation.z += -0.07; head.rotation.x += -0.03; }
    else if (expr === "sad") head.rotation.x += 0.12;
    else if (expr === "shock" || expr === "scream") head.rotation.x += -0.06;
    else if (expr === "angry") head.rotation.x += 0.06;
    else if (expr === "laugh") head.rotation.x += -0.1 + Math.sin(t * 14) * 0.03;
    else if (expr === "grin" || expr === "smile") head.rotation.x += -0.02 + Math.sin(t * 2.6) * 0.012;
    else if (expr === "wink") head.rotation.z += 0.05;
  };
  set(0, "stand", "neutral", false);
  return { root, headY: HEAD_Y, set };
}

let SHADE_LENS: THREE.MeshStandardMaterial | undefined;

export function makeChar(look: Look): Char { return buildChar(look, false); }
/** cheaper character for crowds (10-30): fewer segments, no seams/outlines on limbs, only two face drawings (happy / flat) */
export function makeExtra(look: Look): Char { return buildChar(look, true); }
