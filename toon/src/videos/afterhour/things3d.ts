// Afterhour look: cel-shaded cartoon props ("things"). See SPEC.md. Deterministic, built from primitives, metres, base at y = 0.
import * as THREE from "three";
import { toonMat, metalMat, glowMat, canvasTex, seeded } from "./common";
import { hasModel, makeModelGroup, MODEL_SIZE } from "./models";
import { drawCard } from "./cards";

export type ThingName = "shoe" | "springshoe" | "chip" | "gpu" | "cash" | "cashstack" | "coins" | "goldbar" | "trophy" | "medal" | "crown" | "ring" | "car" | "sportscar" | "bus" | "truck" | "rocket" | "phone" | "laptop" | "tv" | "monitor" | "clock" | "books" | "letter" | "newspaper" | "briefcase" | "shovel" | "pickaxe" | "box" | "crate" | "basketball" | "football" | "soccerball" | "hoop" | "mic" | "headset" | "controller" | "burger" | "pizza" | "coffee" | "plant" | "robot" | "drone" | "satellite" | "globe" | "house" | "factory" | "stadium" | "plane" | "yacht" | "chart" | "arrowup" | "arrowdown" | "lightbulb" | "lock" | "key" | "heart" | "bomb" | "fire" | "camera" | "chatbot" | "glasses" | "dumbbell" | "hanger" | "dome" | "console" | "golfball" | "golfclub";
export type Thing = { root: THREE.Group; size: number; tick?(t: number): void };

type M = string | THREE.Material;
type V3 = [number, number, number];
const PI = Math.PI;
const INKC = "#1b1b24";
let OW = 0.01; // outline width for the thing being built

const mt = (m: M) => (typeof m === "string" ? toonMat(m) : m);
const DBL = new Map<THREE.Material, THREE.Material>();
const dbl = (m: M) => { const b = mt(m); let d = DBL.get(b); if (!d) { d = b.clone(); d.side = THREE.DoubleSide; DBL.set(b, d); } return d; };
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });

/** add geometry centred on itself (so the outline hull is symmetric) at the given pose */
const put = (g: THREE.Object3D, geo: THREE.BufferGeometry, m: M, x = 0, y = 0, z = 0, rot: V3 = [0, 0, 0], sc: V3 = [1, 1, 1], ol = true) => {
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const e = new THREE.Euler(rot[0], rot[1], rot[2]);
  const off = c.multiply(new THREE.Vector3(sc[0], sc[1], sc[2])).applyEuler(e);
  const me = new THREE.Mesh(geo, mt(m));
  me.position.set(x + off.x, y + off.y, z + off.z); me.rotation.copy(e); me.scale.set(sc[0], sc[1], sc[2]);
  me.castShadow = true; me.receiveShadow = true;
  if (ol) {
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius || 1;
    const o = new THREE.Mesh(geo, INK); o.scale.setScalar(1 + OW / r); me.add(o);
  }
  g.add(me);
  return me;
};
const bx = (g: THREE.Object3D, w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0, rot?: V3) => put(g, new THREE.BoxGeometry(w, h, d), m, x, y, z, rot);
const cy = (g: THREE.Object3D, rt: number, rb: number, h: number, m: M, x = 0, y = 0, z = 0, rot?: V3, seg = 20) => put(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, rot);
const sp = (g: THREE.Object3D, r: number, m: M, x = 0, y = 0, z = 0, sc?: V3, seg = 20) => put(g, new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m, x, y, z, [0, 0, 0], sc);
const to = (g: THREE.Object3D, R: number, r: number, m: M, x = 0, y = 0, z = 0, rot?: V3, arc = PI * 2) => put(g, new THREE.TorusGeometry(R, r, 10, 28, arc), m, x, y, z, rot);
const cone = (g: THREE.Object3D, r: number, h: number, m: M, x = 0, y = 0, z = 0, rot?: V3, seg = 16) => put(g, new THREE.ConeGeometry(r, h, seg), m, x, y, z, rot);
const lathe = (g: THREE.Object3D, pts: [number, number][], m: M, x = 0, y = 0, z = 0, rot?: V3, seg = 24) => put(g, new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), dbl(m), x, y, z, rot);
const ext = (g: THREE.Object3D, pts: [number, number][], depth: number, m: M, x = 0, y = 0, z = 0, rot?: V3, bevel = 0, sc?: V3) => {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  return put(g, new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }), m, x, y, z, rot, sc);
};
const rrect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
};
/** rounded box: width x, height y, depth z */
const rbx = (g: THREE.Object3D, w: number, h: number, d: number, r: number, m: M, x = 0, y = 0, z = 0, rot?: V3) =>
  put(g, new THREE.ExtrudeGeometry(rrect(w, h, r), { depth: d, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -d / 2), m, x, y, z, rot);

const screenMat = (tex: THREE.Texture, k = 1.25) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k), toneMapped: true });
const wrapText = (g: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(/\s+/); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
};
/** canvas with big wrapped text, fitted to the box */
const textTex = (text: string, w: number, h: number, bg: string, fg: string, bold = true, bgDraw?: (g: CanvasRenderingContext2D) => void) =>
  canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); bgDraw?.(g);
    if (!text) return;
    let fs = h * 0.5; let lines: string[] = [];
    for (; fs > 10; fs -= 4) { g.font = `${bold ? "900" : "600"} ${fs}px Arial Black, Arial, sans-serif`; lines = wrapText(g, text, w * 0.86); if (lines.length * fs * 1.1 <= h * 0.86 && lines.every((l) => g.measureText(l).width <= w * 0.9)) break; }   // a single long word ("BREAKING") must fit too
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.1));
  });
const plane = (g: THREE.Object3D, w: number, h: number, m: THREE.Material, x: number, y: number, z: number, rot: V3 = [0, 0, 0]) => {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); me.position.set(x, y, z); me.rotation.set(rot[0], rot[1], rot[2]); g.add(me); return me;
};
const disc = (g: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(new THREE.CircleGeometry(r, 32), m); me.position.set(x, y, z); g.add(me); return me; };
const flat = (tex: THREE.Texture, hex = "#ffffff") => new THREE.MeshBasicMaterial({ map: tex, color: hex });

type Built = { g: THREE.Group; tick?: (t: number) => void };
type Builder = (c: string | undefined, text: string | undefined) => Built;
const GOLD = () => metalMat("#ffc928", 0.3);
const wheel = (g: THREE.Object3D, r: number, w: number, x: number, y: number, z: number, hub = "#c8c8d0") => {
  cy(g, r, r, w, "#26262e", x, y, z, [0, 0, PI / 2], 20);
  cy(g, r * 0.55, r * 0.55, w + 0.02, hub, x + Math.sign(x) * 0.01, y, z, [0, 0, PI / 2], 14).userData.noline = 1;
};

const B: Record<ThingName, Builder> = {
  shoe: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e53935";
    sp(g, 0.1, "#f4f4f4", 0, 0.02, 0.0, [0.52, 0.2, 1.5]);
    sp(g, 0.05, col, 0, 0.065, 0.085, [0.95, 0.8, 2.0]);
    sp(g, 0.05, col, 0, 0.075, 0.0, [1, 1.2, 1.7]);
    sp(g, 0.05, col, 0, 0.095, -0.06, [1, 1.45, 1.3]);
    sp(g, 0.04, "#f4f4f4", 0, 0.06, 0.12, [1, 0.75, 1.0]);
    to(g, 0.036, 0.01, "#fafafa", 0, 0.15, -0.06, [PI / 2 - 0.15, 0, 0]);
    cy(g, 0.034, 0.034, 0.004, "#2a2a30", 0, 0.148, -0.06, [-0.15, 0, 0], 14);
    bx(g, 0.05, 0.07, 0.012, "#f1f1f1", 0, 0.12, 0.0, [0.5, 0, 0]);
    for (let i = 0; i < 3; i++) bx(g, 0.07, 0.007, 0.012, "#ffffff", 0, 0.1 - i * 0.012, 0.035 + i * 0.026, [0.45, 0, 0]);
    for (const s of [-1, 1]) ext(g, [[0, 0], [0.1, 0.012], [0.06, 0.03], [-0.03, 0.018]], 0.006, "#ffffff", s * 0.054, 0.075, -0.01, [0, s > 0 ? PI / 2 : -PI / 2, 0.1]);
    return { g };
  },
  springshoe: (c) => {
    const g = new THREE.Group(); const sh = B.shoe(c ?? "#3fb950", undefined).g; sh.position.y = 0.17; g.add(sh);
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 80; i++) { const a = (i / 80) * PI * 2 * 4.5; pts.push(new THREE.Vector3(Math.cos(a) * 0.05, (i / 80) * 0.16 + 0.01, Math.sin(a) * 0.05)); }
    put(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.008, 6), metalMat("#b9bcc8", 0.3), 0, 0, -0.045);
    cy(g, 0.07, 0.07, 0.014, "#26262e", 0, 0.007, -0.045); bx(g, 0.1, 0.012, 0.3, "#26262e", 0, 0.162, 0.0);
    return { g };
  },
  chip: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#12805a";
    bx(g, 0.1, 0.012, 0.1, col, 0, 0.006, 0);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { const p = -0.0425 + i * 0.0121; bx(g, 0.014, 0.004, 0.005, GOLD(), s * 0.054, 0.006, p); bx(g, 0.005, 0.004, 0.014, GOLD(), p, 0.006, s * 0.054); }
    bx(g, 0.07, 0.01, 0.07, "#1d1d26", 0, 0.017, 0);
    plane(g, 0.062, 0.062, flat(textTex(text ?? "AI", 128, 128, "#14141c", "#55ffb0")), 0, 0.0225, 0, [-PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) bx(g, 0.012, 0.0016, 0.012, glowMat("#38ffa0", 2), -0.04 + (i % 2) * 0.011 + Math.floor(i / 2) * 0.07 - 0.0, 0.0125, -0.04 + Math.floor(i / 2) * 0.08);
    g.rotation.x = -0.9; const o = new THREE.Group(); o.add(g); return { g: o };
  },
  gpu: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#202028";
    bx(g, 0.3, 0.12, 0.045, col, 0, 0.07, 0);
    bx(g, 0.012, 0.13, 0.05, "#aab", -0.156, 0.07, 0.005);
    for (const x of [-0.07, 0.07]) {
      cy(g, 0.052, 0.052, 0.012, "#0e0e14", x, 0.07, 0.027, [PI / 2, 0, 0], 24);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; bx(g, 0.02, 0.05, 0.006, "#444a58", x + Math.cos(a) * 0.026, 0.07 + Math.sin(a) * 0.026, 0.035, [0, 0, a - PI / 2 + 0.5]); }
      cy(g, 0.011, 0.011, 0.012, "#aab", x, 0.07, 0.04, [PI / 2, 0, 0], 12);
    }
    bx(g, 0.28, 0.006, 0.047, glowMat("#38ff7a", 2.2), 0, 0.123, 0.0);
    bx(g, 0.26, 0.04, 0.01, "#333", 0, 0.01, 0); bx(g, 0.2, 0.012, 0.006, GOLD(), 0.02, 0.0, 0.0);
    if (text) plane(g, 0.1, 0.02, flat(textTex(text, 256, 52, "#202028", "#38ff7a")), 0, 0.105, 0.0235);
    return { g };
  },
  cash: (c, text) => {
    const g = new THREE.Group();
    const tex = canvasTex(320, 140, (x) => {
      x.fillStyle = c ?? "#5fbf6a"; x.fillRect(0, 0, 320, 140); x.strokeStyle = "#1f6a34"; x.lineWidth = 7; x.strokeRect(10, 10, 300, 120);
      x.beginPath(); x.arc(160, 70, 46, 0, PI * 2); x.fillStyle = "#a6e3ac"; x.fill(); x.stroke();
      x.fillStyle = "#1f6a34"; x.font = "900 64px Arial Black, Arial"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text ?? "$", 160, 74);
      x.font = "900 30px Arial"; for (const [px, py] of [[44, 38], [276, 38], [44, 104], [276, 104]]) x.fillText("$", px, py);
    });
    bx(g, 0.156, 0.07, 0.003, "#3f9a55", 0, 0.035, 0);
    plane(g, 0.15, 0.065, flat(tex), 0, 0.035, 0.0017); plane(g, 0.15, 0.065, flat(tex), 0, 0.035, -0.0017, [0, PI, 0]);
    return { g };
  },
  cashstack: (c) => {
    const g = new THREE.Group();
    const tex = canvasTex(256, 128, (x) => {
      x.fillStyle = c ?? "#5fbf6a"; x.fillRect(0, 0, 256, 128); x.strokeStyle = "#1f6a34"; x.lineWidth = 6; x.strokeRect(8, 8, 240, 112);
      x.beginPath(); x.arc(128, 64, 34, 0, PI * 2); x.fillStyle = "#a6e3ac"; x.fill(); x.stroke(); x.fillStyle = "#1f6a34"; x.font = "900 48px Arial Black"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("$", 128, 68);
    });
    const side = toonMat("#d8e8d0"); const top = flat(tex);
    const brick = (x: number, y: number, z: number, ry: number) => {
      const m = put(g, new THREE.BoxGeometry(0.156, 0.04, 0.066), [side, side, top, side, side, side] as unknown as THREE.Material, x, y, z, [0, ry, 0]);
      const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.y = ry; g.add(o);
      bx(o, 0.034, 0.043, 0.069, "#ffe14a", 0, 0, 0);
      return m;
    };
    for (const [x, z] of [[-0.09, -0.04], [0.09, -0.04], [-0.09, 0.04], [0.09, 0.04]]) brick(x * 0.0 + x * 0.55, 0.02, z * 0.75, 0);
    brick(-0.04, 0.062, 0, 0.1); brick(0.04, 0.062, 0.0, -0.1); brick(0, 0.104, 0, 0.3);
    return { g };
  },
  coins: (c) => {
    const g = new THREE.Group(); const n = 70; const geo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.005, 16);
    const col = c ?? "#ffc928"; const mat = metalMat(col, 0.3);
    const im = new THREE.InstancedMesh(geo, mat, n); const io = new THREE.InstancedMesh(geo, INK, n);
    const r = seeded(77); const d = new THREE.Object3D(); const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = r() * PI * 2; const rad = Math.sqrt(r()) * 0.07; const h = Math.max(0.0, 0.05 * (1 - rad / 0.075)) * (0.4 + r() * 0.7);
      d.position.set(Math.cos(a) * rad, 0.006 + h + i * 0.00005, Math.sin(a) * rad); d.rotation.set((r() - 0.5) * 0.9, r() * PI, (r() - 0.5) * 0.9); d.scale.set(1, 1, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      dummy.position.copy(d.position); dummy.rotation.copy(d.rotation); dummy.scale.set(1.28, 2.2, 1.28); dummy.updateMatrix(); io.setMatrixAt(i, dummy.matrix);
    }
    im.castShadow = true; g.add(im, io);
    // hero coins standing at the front
    const tex = canvasTex(128, 128, (x) => { x.fillStyle = "#ffd84a"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#b8860b"; x.font = "900 90px Arial Black"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("$", 64, 70); });
    for (const [x, z, a] of [[0.03, 0.09, 0.2], [-0.035, 0.1, -0.15]] as [number, number, number][]) {
      const k = new THREE.Group(); k.position.set(x, 0.035, z); k.rotation.set(0, a, 0); g.add(k);
      cy(k, 0.032, 0.032, 0.008, mat, 0, 0, 0, [PI / 2, 0, 0], 24); disc(k, 0.027, flat(tex), 0, 0, 0.0045);
    }
    return { g };
  },
  goldbar: () => {
    const g = new THREE.Group(); const m = GOLD();
    const bar = (x: number, y: number, z: number) => {
      const b = put(g, new THREE.CylinderGeometry(0.5, 0.65, 0.12, 4), m, x, y, z, [0, PI / 4, 0], [0.16, 1, 0.075]);
      void b;
      plane(g, 0.07, 0.028, flat(textTex("1KG 999", 128, 48, "#e6a800", "#7a4f00")), x, y + 0.0602, z, [-PI / 2, 0, 0]);
    };
    // frustum scale: base 0.21 x 0.1, top 0.16 x 0.075
    bar(-0.1, 0.06, 0); bar(0.1, 0.06, 0); bar(0, 0.18, 0);
    return { g };
  },
  trophy: (c) => {
    const g = new THREE.Group(); const m = metalMat(c ?? "#ffc928", 0.25);
    bx(g, 0.16, 0.04, 0.16, "#4a2f1d", 0, 0.02, 0); bx(g, 0.13, 0.03, 0.13, "#6b4328", 0, 0.055, 0);
    cy(g, 0.012, 0.025, 0.06, m, 0, 0.1, 0); sp(g, 0.03, m, 0, 0.135, 0, [1, 0.6, 1]);
    lathe(g, [[0, 0], [0.05, 0.02], [0.07, 0.08], [0.1, 0.15], [0.105, 0.2], [0.095, 0.2], [0.09, 0.15], [0.055, 0.08], [0, 0.03]], m, 0, 0.19, 0);
    for (const s of [-1, 1]) to(g, 0.045, 0.01, m, s * 0.11, 0.255, 0, [0, 0, s > 0 ? -PI / 2 : PI / 2], PI * 1.1);
    plane(g, 0.07, 0.025, flat(textTex("#1", 96, 40, "#6b4328", "#ffc928")), 0, 0.055, 0.067);
    return { g };
  },
  medal: (c) => {
    const g = new THREE.Group(); const m = metalMat(c ?? "#ffc928", 0.25);
    ext(g, [[0, 0], [0.035, 0], [0.055, 0.1], [0.02, 0.1]], 0.004, "#d92b3a", -0.03, 0.1, 0, [0, 0, 0], 0, [1, 1, 1]);
    ext(g, [[0, 0], [-0.035, 0], [-0.055, 0.1], [-0.02, 0.1]], 0.004, "#2b5bd9", 0.03, 0.1, 0);
    cy(g, 0.05, 0.05, 0.008, m, 0, 0.07, 0.0, [PI / 2, 0, 0], 28); to(g, 0.045, 0.006, m, 0, 0.07, 0.005);
    const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2 + PI / 2; const r = i % 2 ? 0.015 : 0.034; const p = [Math.cos(a) * r, Math.sin(a) * r]; if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); }
    put(g, new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }), "#fff2a8", 0, 0.07, 0.006);
    return { g };
  },
  crown: () => {
    const g = new THREE.Group(); const m = metalMat("#ffc928", 0.25);
    lathe(g, [[0.075, 0], [0.085, 0.03], [0.095, 0.06], [0.085, 0.06], [0.075, 0.03], [0.065, 0]], m, 0, 0.03, 0, undefined, 28);
    to(g, 0.077, 0.006, m, 0, 0.012, 0, [PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2; const x = Math.sin(a) * 0.088, z = Math.cos(a) * 0.088;
      cone(g, 0.018, 0.07, m, x, 0.098, z, [0, 0, 0], 4); sp(g, 0.011, m, x, 0.14, z, undefined, 10);
      sp(g, 0.011, i % 2 ? "#2b6bff" : "#ff2b3a", Math.sin(a) * 0.092, 0.05, Math.cos(a) * 0.092, undefined, 10).material = toonMat(i % 2 ? "#2b6bff" : "#ff2b3a", { emissive: i % 2 ? "#2b6bff" : "#ff2b3a", emissiveIntensity: 0.8 });
    }
    return { g };
  },
  ring: () => {
    const g = new THREE.Group(); const m = metalMat("#ffd24a", 0.2);
    to(g, 0.011, 0.0025, m, 0, 0.0135, 0, [0, 0, 0]);
    cone(g, 0.006, 0.006, m, 0, 0.0265, 0, [PI, 0, 0], 8);
    put(g, new THREE.OctahedronGeometry(0.0065), toonMat("#bff3ff", { emissive: "#7fe8ff", emissiveIntensity: 1.1 }), 0, 0.0325, 0, [0, 0, 0], [1, 1.1, 1]);
    return { g };
  },
  car: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#e53935";
    const W = 1.8;
    const side = (pts: [number, number][], w: number, m: M) => { const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))); const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }); geo.translate(0, 0, -w / 2); geo.rotateY(-PI / 2); return put(g, geo, m); };
    side([[-2.05, 0.4], [-2.1, 0.85], [-1.4, 0.98], [-0.85, 1.4], [0.45, 1.4], [1.05, 0.98], [2.05, 0.82], [2.1, 0.45]], W - 0.1, col);
    const glassM = toonMat("#9fd8ff", { emissive: "#4ab4ff", emissiveIntensity: 0.5 });
    const gp: [number, number][] = [[-1.3, 1.0], [-0.8, 1.32], [0.4, 1.32], [0.93, 1.0]];
    side(gp, W + 0.0, glassM).scale.set(1, 1, 1);
    bx(g, 0.06, 0.4, 0.05, col, 0, 1.17, 0.5).position.x = 0; // pillars drawn as ext below
    for (const s of [-1, 1]) { bx(g, 0.07, 0.34, 0.06, col, s * 0.9, 1.15, -0.45); bx(g, 0.07, 0.34, 0.06, col, s * 0.9, 1.15, 0.5); }
    for (const [sx, sz] of [[-1, 1.35], [1, 1.35], [-1, -1.3], [1, -1.3]]) wheel(g, 0.38, 0.26, sx * 0.88, 0.38, sz);
    for (const s of [-1, 1]) { sp(g, 0.13, glowMat("#fff6c0", 2.2), s * 0.6, 0.72, 2.07, [1.2, 0.7, 0.4], 12); bx(g, 0.28, 0.1, 0.06, glowMat("#ff2020", 1.8), s * 0.62, 0.78, -2.1); }
    bx(g, 0.5, 0.14, 0.04, "#fafafa", 0, 0.5, 2.13); plane(g, 0.46, 0.1, flat(textTex(text ?? "CASH", 160, 36, "#fafafa", "#152a6b")), 0, 0.5, 2.16);
    bx(g, 1.9, 0.1, 0.06, "#2a2a32", 0, 0.42, 2.12);
    return { g };
  },
  sportscar: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#ffd400";
    const side = (pts: [number, number][], w: number, m: M) => { const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))); const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }); geo.translate(0, 0, -w / 2); geo.rotateY(-PI / 2); return put(g, geo, m); };
    side([[-2.1, 0.35], [-2.15, 0.75], [-1.2, 0.85], [-0.4, 1.12], [0.4, 1.1], [0.75, 0.9], [2.1, 0.62], [2.2, 0.4]], 1.8, col);
    side([[-0.45, 0.88], [-0.3, 1.04], [0.35, 1.02], [0.62, 0.88]], 1.82, toonMat("#8fd0ff", { emissive: "#3aa5ff", emissiveIntensity: 0.6 }));
    bx(g, 0.1, 0.06, 0.5, "#16161c", 0, 0.9, -0.05).visible = false;
    bx(g, 1.9, 0.07, 0.4, "#16161c", 0, 1.02, -2.05); for (const s of [-1, 1]) bx(g, 0.07, 0.3, 0.32, "#16161c", s * 0.7, 0.88, -2.0);
    bx(g, 1.9, 0.1, 0.25, "#16161c", 0, 0.38, 2.15);
    bx(g, 0.07, 0.01, 2.3, "#15151c", 0, 1.13, 0.0).visible = false;
    for (const s of [-1, 1]) bx(g, 0.1, 0.012, 3.2, "#f6f6f6", s * 0.12, 1.12, -0.4).visible = false;
    for (const [sx, sz] of [[-1, 1.35], [1, 1.35], [-1, -1.35], [1, -1.35]]) wheel(g, 0.36, 0.3, sx * 0.9, 0.36, sz, "#ffd24a");
    for (const s of [-1, 1]) { bx(g, 0.4, 0.06, 0.1, glowMat("#fff6c0", 2.2), s * 0.6, 0.66, 2.2, [0.0, 0, 0.2 * s]); bx(g, 0.5, 0.06, 0.04, glowMat("#ff1010", 2), s * 0.5, 0.72, -2.2); }
    plane(g, 0.5, 0.11, flat(textTex(text ?? "FAST", 160, 36, "#fafafa", "#c0152a")), 0, 0.5, 2.28);
    return { g };
  },
  bus: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#ffcb1f";
    bx(g, 2.5, 2.3, 8, col, 0, 1.55, 0); bx(g, 2.5, 0.9, 1.6, col, 0, 0.95, 4.7);
    bx(g, 2.52, 0.12, 8.0, "#1d1d22", 0, 1.35, 0); bx(g, 2.52, 0.1, 8.0, "#1d1d22", 0, 2.0, 0).visible = false; bx(g, 2.52, 0.08, 9.6, "#1d1d22", 0, 0.7, 0.8);
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) bx(g, 0.05, 0.75, 0.8, glowMat("#a8e4ff", 1.1), s * 1.26, 2.1, -3.4 + i * 0.97);
    bx(g, 2.1, 0.85, 0.06, glowMat("#a8e4ff", 1.1), 0, 2.15, 4.02);
    plane(g, 2.2, 0.4, flat(textTex(text ?? "SCHOOL BUS", 512, 96, col, "#1b1b24")), 0, 2.88, 4.03);
    for (const s of [-1, 1]) { for (const z of [-2.8, 3.2]) wheel(g, 0.55, 0.4, s * 1.15, 0.55, z); sp(g, 0.18, glowMat("#fff6c0", 2.2), s * 0.8, 0.95, 5.5, [1, 1, 0.5], 10); }
    bx(g, 0.04, 0.5, 0.5, "#e11", 1.3, 1.7, 3.0).visible = false;
    return { g };
  },
  truck: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#2b6bff";
    bx(g, 2.5, 3.2, 5.6, "#f2f2f2", 0, 2.45, -1.6); bx(g, 2.54, 0.35, 5.6, col, 0, 1.05, -1.6);
    bx(g, 2.4, 2.1, 2.0, col, 0, 1.75, 3.0); bx(g, 2.4, 1.1, 1.0, col, 0, 1.15, 4.4);
    bx(g, 2.2, 0.9, 0.08, glowMat("#a8e4ff", 1.1), 0, 2.35, 4.02).rotation.x = -0.12;
    bx(g, 0.05, 0.8, 0.8, glowMat("#a8e4ff", 1.1), 1.22, 2.35, 3.4).position.x = 1.22; bx(g, 0.05, 0.8, 0.8, glowMat("#a8e4ff", 1.1), -1.22, 2.35, 3.4);
    bx(g, 2.5, 0.12, 9.5, "#222228", 0, 0.8, 0.5);
    const tex = textTex(text ?? "FAST CARGO", 512, 128, "#f2f2f2", col);
    for (const s of [-1, 1]) plane(g, 4.6, 1.5, flat(tex), s * 1.26, 2.6, -1.6, [0, s * PI / 2, 0]);
    for (const s of [-1, 1]) { for (const z of [-3.6, -2.4, 3.2]) wheel(g, 0.55, 0.4, s * 1.1, 0.55, z); sp(g, 0.18, glowMat("#fff6c0", 2.2), s * 0.8, 0.95, 4.9, [1, 1, 0.5], 10); }
    return { g };
  },
  rocket: (c) => {
    const g = new THREE.Group(); const body = c ?? "#f4f4f4"; const hot = "#e5262f";
    lathe(g, [[0, 0.6], [0.35, 0.6], [0.55, 0.9], [0.58, 1.4], [0.58, 2.3], [0.5, 2.7], [0.35, 3.05]], body, 0, 0.6, 0);
    lathe(g, [[0.35, 0], [0.22, 0.45], [0.1, 0.8], [0, 0.95]], hot, 0, 3.6, 0);
    lathe(g, [[0.58, 0], [0.58, 0.25]], hot, 0, 1.2, 0);
    to(g, 0.585, 0.05, hot, 0, 1.0, 0, [PI / 2, 0, 0]);
    to(g, 0.3, 0.07, "#8a97a8", 0, 2.3, 0.57, [0, 0, 0]); sp(g, 0.26, toonMat("#7fd6ff", { emissive: "#3aa5ff", emissiveIntensity: 0.8 }), 0, 2.3, 0.56, [1, 1, 0.5]);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4; const f = new THREE.Group(); f.rotation.y = a; g.add(f); ext(f, [[0, 0], [0.7, -0.25], [0.7, 0.3], [0.3, 1.3], [0, 1.4]], 0.07, hot, 0.0, 0.7, 0, [0, 0, 0], 0).position.x = 0.7 + 0.1; }
    cy(g, 0.28, 0.36, 0.25, "#454a58", 0, 0.5, 0);
    const fl = new THREE.Group(); fl.userData.skip = 1; fl.position.y = 0.4; g.add(fl);
    const f1 = cone(fl, 0.27, 1.5, glowMat("#ff8a1f", 1.8), 0, -0.7, 0, [PI, 0, 0], 12); const f2 = cone(fl, 0.15, 1.0, glowMat("#fff0a0", 2.4), 0, -0.5, 0, [PI, 0, 0], 12);
    return { g, tick: (t) => { const k = 1 + 0.18 * Math.sin(t * 38) + 0.1 * Math.sin(t * 23); f1.scale.set(1 - (k - 1) * 0.4, k, 1 - (k - 1) * 0.4); f2.scale.set(1, 1 + 0.25 * Math.sin(t * 31 + 1), 1); } };
  },
  phone: (c, text) => {
    const g = new THREE.Group();
    rbx(g, 0.076, 0.156, 0.009, 0.012, c ?? "#14141c", 0, 0.08, 0);
    const tex = textTex(text ?? "", 256, 540, "#1e66ff", "#ffffff", true, (x) => { x.fillStyle = "#ff7a2a"; x.fillRect(0, 0, 256, 60); x.fillStyle = "#fff"; x.fillRect(20, 440, 216, 60); x.fillStyle = "#0b3fb0"; for (let i = 0; i < 4; i++) x.fillRect(18 + i * 60, 80, 48, 48); });
    plane(g, 0.07, 0.148, screenMat(tex, 1.3), 0, 0.08, 0.0052);
    bx(g, 0.02, 0.004, 0.002, "#050508", 0, 0.15, 0.0056);
    return { g };
  },
  laptop: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#c9ccd6";
    rbx(g, 0.34, 0.01, 0.23, 0.01, col, 0, 0.0, 0).rotation.x = 0; // placeholder flat (shape in XY so rotate)
    g.children[0].rotation.x = PI / 2; g.children[0].position.y = 0.008;
    const base = g.children[0] as THREE.Mesh; base.geometry = new THREE.BoxGeometry(0.34, 0.016, 0.23); base.rotation.x = 0; (base.children[0] as THREE.Mesh).geometry = base.geometry;
    plane(g, 0.3, 0.1, flat(canvasTex(300, 100, (x) => { x.fillStyle = "#2a2d38"; x.fillRect(0, 0, 300, 100); x.fillStyle = "#e8eaf2"; for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) x.fillRect(6 + k * 21, 6 + r * 19, 17, 14); x.fillRect(60, 84, 180, 12); })), 0, 0.0165, 0.04, [-PI / 2, 0, 0]);
    const lid = new THREE.Group(); lid.position.set(0, 0.016, -0.115); lid.rotation.x = -0.28; g.add(lid);
    bx(lid, 0.34, 0.22, 0.01, col, 0, 0.11, 0);
    plane(lid, 0.31, 0.19, screenMat(textTex(text ?? "", 512, 310, "#1d5cff", "#fff", true, (x) => { x.fillStyle = "#13b36b"; x.fillRect(0, 0, 512, 36); }), 1.3), 0, 0.11, 0.0055);
    return { g };
  },
  tv: (c, text) => {
    const g = new THREE.Group(); const fr = c ?? "#14141c";
    bx(g, 1.25, 0.72, 0.05, fr, 0, 0.55, 0); plane(g, 1.2, 0.675, screenMat(textTex(text ?? "BREAKING", 640, 360, "#e11d2e", "#fff", true, (x) => { x.fillStyle = "#101828"; x.fillRect(0, 280, 640, 80); }), 1.25), 0, 0.55, 0.026);
    bx(g, 0.5, 0.03, 0.22, fr, 0, 0.015, 0); bx(g, 0.1, 0.17, 0.04, fr, 0, 0.12, -0.02);
    return { g };
  },
  monitor: (c, text) => {
    const g = new THREE.Group(); const fr = c ?? "#22222a";
    bx(g, 0.6, 0.36, 0.035, fr, 0, 0.3, 0); plane(g, 0.57, 0.33, screenMat(textTex(text ?? "", 512, 296, "#0f1b3a", "#35e08a", true, (x) => { x.strokeStyle = "#35e08a"; x.lineWidth = 6; x.beginPath(); x.moveTo(20, 270); x.lineTo(120, 200); x.lineTo(200, 230); x.lineTo(330, 120); x.lineTo(490, 40); x.stroke(); }), 1.3), 0, 0.3, 0.0185);
    cy(g, 0.03, 0.04, 0.12, "#33333c", 0, 0.1, -0.03); cy(g, 0.12, 0.12, 0.012, "#33333c", 0, 0.006, -0.02);
    return { g };
  },
  clock: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e5262f";
    const face = new THREE.Group(); face.position.y = 0.1; g.add(face);
    cy(face, 0.085, 0.085, 0.05, col, 0, 0, 0, [PI / 2, 0, 0], 28);
    disc(face, 0.08, flat(canvasTex(256, 256, (x) => { x.fillStyle = "#fff8e8"; x.beginPath(); x.arc(128, 128, 128, 0, PI * 2); x.fill(); x.fillStyle = "#1b1b24"; for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; x.save(); x.translate(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); x.rotate(a); x.fillRect(-5, -(i % 3 ? 8 : 16), 10, i % 3 ? 16 : 32); x.restore(); } })), 0, 0, 0.0255);
    const hh = bx(face, 0.012, 0.045, 0.004, "#1b1b24", 0, 0, 0.03); const mh = bx(face, 0.008, 0.062, 0.004, "#1b1b24", 0, 0, 0.034); const sh = bx(face, 0.004, 0.07, 0.003, "#e5262f", 0, 0, 0.038);
    const pv = (m: THREE.Mesh, len: number) => { m.geometry.translate(0, len / 2, 0); (m.children[0] as THREE.Mesh).geometry = m.geometry; };
    pv(hh, 0.045); pv(mh, 0.062); pv(sh, 0.07);
    for (const s of [-1, 1]) { sp(face, 0.03, "#ffc928", s * 0.055, 0.082, 0, [1, 0.7, 0.5], 12); cy(face, 0.006, 0.006, 0.07, "#454a58", s * 0.075, -0.08, -0.0, [0, 0, s * 0.35], 6); }
    return { g, tick: (t) => { sh.rotation.z = -t * PI * 2 / 6; mh.rotation.z = -t * PI * 2 / 60 * 5; hh.rotation.z = -t * PI * 2 / 720 * 5 + 0.8; face.rotation.z = Math.abs(Math.sin(t * 22)) > 0.97 ? 0.04 : 0; } };
  },
  books: (c) => {
    const g = new THREE.Group(); const cols = [c ?? "#c0392b", "#2b6bff", "#2ecc71", "#f1c40f"]; let y = 0;
    cols.forEach((col, i) => {
      const h = 0.032 + (i % 2) * 0.01; const w = 0.22 - i * 0.012, d = 0.16 - (i % 2) * 0.01; const o = (i % 2 ? 0.01 : -0.01); const k = new THREE.Group(); k.position.set(o, y, 0); k.rotation.y = (i - 1.5) * 0.12; g.add(k);
      bx(k, w, h, d, col, 0, h / 2, 0); bx(k, w - 0.012, h - 0.01, d + 0.004, "#fff3d0", 0.006, h / 2, 0.002); bx(k, 0.016, h + 0.002, d + 0.002, col, -w / 2 + 0.008, h / 2, 0);
      bx(k, 0.06, 0.004, 0.003, "#ffd24a", 0.0, h + 0.0005, -d / 2 + 0.01).visible = false; y += h;
    });
    return { g };
  },
  letter: (c) => {
    const g = new THREE.Group(); const e = new THREE.Group(); e.position.y = 0.06; e.rotation.x = -0.35; g.add(e);
    bx(e, 0.22, 0.12, 0.004, c ?? "#fff3d6", 0, 0, 0);
    ext(e, [[-0.11, 0.06], [0.11, 0.06], [0, -0.02]], 0.003, "#f4e2b4", 0, 0.012, 0.0035, [0, 0, 0]);
    sp(e, 0.016, "#d92b3a", 0, -0.0, 0.008, [1, 1, 0.4], 12);
    ext(e, [[-0.11, -0.06], [0, 0.02], [-0.11, 0.06]], 0.002, "#efd9a6", 0, 0, 0.002).visible = false;
    return { g };
  },
  newspaper: (c, text) => {
    const g = new THREE.Group();
    const tex = canvasTex(400, 560, (x) => {
      x.fillStyle = c ?? "#eceadf"; x.fillRect(0, 0, 400, 560); x.fillStyle = "#1b1b24"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = "900 44px Georgia, serif"; x.fillText("THE DAILY", 200, 36); x.fillRect(16, 66, 368, 4);
      x.font = "900 54px Arial Black, Arial"; const lines = wrapText(x, (text ?? "BIG NEWS").toUpperCase(), 360); lines.slice(0, 3).forEach((l, i) => x.fillText(l, 200, 112 + i * 56));
      x.fillStyle = "#9aa3ad"; x.fillRect(20, 290, 170, 130); x.fillStyle = "#6c7683"; x.fillRect(30, 380, 150, 30); x.fillStyle = "#1b1b24";
      for (let i = 0; i < 12; i++) { x.fillRect(205, 292 + i * 12, 175, 5); x.fillRect(20, 435 + i * 10, 360, 4); }
    });
    const sheet = (rot: number, x: number) => { const k = new THREE.Group(); k.rotation.z = rot; k.position.set(x, 0.2, 0); g.add(k); bx(k, 0.285, 0.4, 0.004, "#eceadf", 0, 0, 0); plane(k, 0.28, 0.395, flat(tex), 0, 0, 0.0022); return k; };
    sheet(0.03, 0.0); sheet(-0.04, 0.0).position.z = -0.006;
    g.children[1].children[1].visible = false;
    return { g };
  },
  briefcase: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#7a4a26";
    rbx(g, 0.44, 0.31, 0.12, 0.03, col, 0, 0.155, 0); bx(g, 0.43, 0.012, 0.125, "#3a2412", 0, 0.155, 0);
    to(g, 0.06, 0.012, "#3a2412", 0, 0.31, 0, [0, 0, 0], PI).position.y = 0.34;
    for (const s of [-1, 1]) { bx(g, 0.05, 0.035, 0.012, GOLD(), s * 0.12, 0.17, 0.062); bx(g, 0.04, 0.03, 0.014, "#3a2412", s * 0.17, 0.15, 0.0).visible = false; bx(g, 0.016, 0.05, 0.13, "#3a2412", s * 0.2, 0.31, 0).visible = false; }
    bx(g, 0.08, 0.06, 0.014, GOLD(), 0, 0.24, 0.062).visible = false;
    plane(g, 0.12, 0.04, flat(textTex(text ?? "CEO", 256, 86, "#ffffff", "#1b1b24")), 0.14, 0.07, 0.0615);
    return { g };
  },
  shovel: (c) => {
    const g = new THREE.Group();
    cy(g, 0.018, 0.018, 0.9, "#9a6a3a", 0, 0.65, 0, [0, 0, 0], 10);
    to(g, 0.05, 0.014, "#9a6a3a", 0, 1.12, 0, [0, 0, 0], PI * 1.0).rotation.set(0, PI / 2, 0);
    g.children[g.children.length - 1].position.set(0, 1.1, 0); g.children[g.children.length - 1].rotation.set(0, 0, PI);
    bx(g, 0.13, 0.03, 0.04, "#9a6a3a", 0, 1.13, 0).visible = false;
    ext(g, [[-0.1, 0.3], [0.1, 0.3], [0.12, 0.1], [0.0, -0.06], [-0.12, 0.1]], 0.012, metalMat(c ?? "#b9c2d0", 0.35), 0, 0.2, 0, [0, 0, 0], 0.004);
    cy(g, 0.025, 0.025, 0.1, metalMat("#8a93a0", 0.4), 0, 0.28, 0);
    return { g };
  },
  pickaxe: (c) => {
    const g = new THREE.Group();
    cy(g, 0.022, 0.018, 0.95, "#9a6a3a", 0, 0.475, 0, [0, 0, 0], 10);
    const hd = new THREE.Group(); hd.position.y = 0.93; g.add(hd);
    to(hd, 0.28, 0.03, metalMat(c ?? "#b9c2d0", 0.35), 0, -0.22, 0, [0, 0, 0], PI * 0.55).rotation.z = PI / 2 - PI * 0.275;
    for (const s of [-1, 1]) { const a = PI / 2 + s * PI * 0.275; cone(hd, 0.03, 0.12, metalMat("#b9c2d0", 0.35), Math.cos(a) * 0.28 + s * 0.0, Math.sin(a) * 0.28 - 0.22, 0, [0, 0, -s * (PI / 2 - 0.35) - (s > 0 ? 0 : 0)], 8); }
    bx(hd, 0.06, 0.06, 0.05, "#7a8494", 0, 0.0, 0);
    return { g };
  },
  box: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#c8975a";
    bx(g, 0.5, 0.36, 0.4, col, 0, 0.18, 0); bx(g, 0.07, 0.364, 0.404, "#e8d6a8", 0, 0.18, 0); bx(g, 0.07, 0.01, 0.42, "#e8d6a8", 0, 0.36, 0).visible = false;
    bx(g, 0.52, 0.01, 0.07, "#e8d6a8", 0, 0.366, 0).visible = false;
    plane(g, 0.16, 0.1, flat(textTex(text ?? "FRAGILE", 256, 160, "#fafafa", "#c0152a")), 0.14, 0.2, 0.201);
    plane(g, 0.1, 0.1, flat(textTex("THIS WAY UP", 128, 128, col, "#6b4a28")), -0.14, 0.12, 0.201);
    return { g };
  },
  crate: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#b07a3c"; const dk = "#7a4f24";
    bx(g, 0.6, 0.6, 0.6, dk, 0, 0.3, 0);
    for (let i = 0; i < 4; i++) { bx(g, 0.62, 0.12, 0.62, col, 0, 0.075 + i * 0.15, 0); }
    for (const x of [-0.26, 0.26]) for (const z of [-0.26, 0.26]) bx(g, 0.07, 0.64, 0.07, dk, x, 0.3, z);
    bx(g, 0.04, 0.78, 0.04, dk, 0, 0.3, 0.313, [0, 0, 0.0]).visible = false;
    bx(g, 0.03, 0.8, 0.02, "#6a431e", 0, 0.3, 0.32, [0, 0, 0.7]).scale.y = 0.95; bx(g, 0.03, 0.8, 0.02, "#6a431e", 0, 0.3, 0.32, [0, 0, -0.7]);
    plane(g, 0.3, 0.12, flat(textTex(text ?? "TOP SECRET", 256, 100, "#f1e2b5", "#c0152a")), 0, 0.3, 0.335);
    return { g };
  },
  basketball: (c) => {
    const g = new THREE.Group(); const r = 0.12; const o = c ?? "#f5802a"; sp(g, r, o, 0, r, 0, undefined, 24);
    const line = (R: number, x: number, rot: V3) => to(g, R, 0.0035, "#1b1b24", 0, r, 0, rot).position.x = x;
    to(g, r + 0.001, 0.0035, "#1b1b24", 0, r, 0, [0, 0, 0]).castShadow = false; to(g, r + 0.001, 0.0035, "#1b1b24", 0, r, 0, [0, PI / 2, 0]);
    const d = 0.075; const R2 = Math.sqrt(r * r - d * d);
    for (const s of [-1, 1]) { const t = to(g, R2 + 0.001, 0.0035, "#1b1b24", s * d, r, 0, [0, PI / 2, 0]); t.position.x = s * d; }
    void line; return { g };
  },
  // Nov 18: a real soccer ball (the "football" object is an American football; soccer Shorts showed the wrong ball)
  soccerball: (c) => {
    const g = new THREE.Group(); const r = 0.12; sp(g, r, c ?? "#f7f7f7", 0, r, 0, undefined, 28);
    const ph = (1 + Math.sqrt(5)) / 2; const v: V3[] = [];
    for (const a of [-1, 1]) for (const b of [-ph, ph]) { v.push([0, a, b]); v.push([a, b, 0]); v.push([b, 0, a]); }
    for (const [x, y, z] of v) {
      const n = Math.hypot(x, y, z); const k = (r * 1.004) / n;
      const p = put(g, new THREE.CircleGeometry(0.04, 5), "#1b1b24", x * k, r + y * k, z * k, [0, 0, 0], [1, 1, 1], false);
      p.lookAt(x * 10, r + y * 10, z * 10);
    }
    return { g };
  },
  // Nov 18: objects scripts kept asking for (chatbot, glasses, dumbbell, hanger, dome)
  chatbot: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#1d5cff";
    rbx(g, 0.5, 0.32, 0.06, 0.08, col, 0, 0.3, 0);
    ext(g, [[-0.04, 0], [0.06, 0], [-0.08, -0.1]], 0.06, col, -0.1, 0.12, -0.03);
    if (text) plane(g, 0.42, 0.24, screenMat(textTex(text, 420, 240, col, "#fff"), 1.2), 0, 0.3, 0.032);
    else for (const x of [-0.12, 0, 0.12]) sp(g, 0.035, "#ffffff", x, 0.3, 0.035, [1, 1, 0.4], 12);
    return { g };
  },
  glasses: (c) => {
    const g = new THREE.Group(); const col = c ?? "#1b1b24"; const y = 0.05;
    const lens = new THREE.MeshBasicMaterial({ color: "#9fd8ff", transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) { to(g, 0.045, 0.008, col, s * 0.058, y, 0); disc(g, 0.044, lens, s * 0.058, y, 0); bx(g, 0.008, 0.008, 0.14, col, s * 0.104, y + 0.01, -0.07); }
    to(g, 0.018, 0.006, col, 0, y + 0.012, 0, [0, 0, 0], PI);
    return { g };
  },
  dumbbell: (c) => {
    const g = new THREE.Group(); const col = c ?? "#2b2b34"; const y = 0.07;
    cy(g, 0.016, 0.016, 0.42, "#aab", 0, y, 0, [0, 0, PI / 2], 12);
    for (const s of [-1, 1]) { cy(g, 0.07, 0.07, 0.05, col, s * 0.13, y, 0, [0, 0, PI / 2]); cy(g, 0.055, 0.055, 0.04, col, s * 0.175, y, 0, [0, 0, PI / 2]); cy(g, 0.022, 0.022, 0.02, "#aab", s * 0.205, y, 0, [0, 0, PI / 2], 12); }
    return { g };
  },
  hanger: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e5262f";
    to(g, 0.035, 0.006, "#aab", 0, 0.37, 0, [0, 0, -PI / 2], PI * 1.3);
    cy(g, 0.006, 0.006, 0.05, "#aab", 0, 0.315, 0, undefined, 8);
    for (const s of [-1, 1]) cy(g, 0.017, 0.017, 0.27, col, s * 0.115, 0.2, 0, [0, 0, s * 1.08], 10);
    cy(g, 0.014, 0.014, 0.46, col, 0, 0.055, 0, [0, 0, PI / 2], 10);
    return { g };
  },
  dome: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e8ecf4";
    const h = new THREE.SphereGeometry(1, 28, 12, 0, PI * 2, 0, PI / 2); put(g, h, dbl(col), 0, 0.3, 0);
    cy(g, 1.04, 1.06, 0.3, "#8a93a0", 0, 0.15, 0, undefined, 28);
    for (let i = 0; i < 8; i++) to(g, 1.005, 0.012, "#5d6675", 0, 0.3, 0, [0, (i * PI) / 8, 0], PI);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; bx(g, 0.14, 0.12, 0.02, glowMat("#fff6c0", 1.2), Math.sin(a) * 1.065, 0.16, Math.cos(a) * 1.065, [0, a, 0]); }
    return { g };
  },
  // Nov 21: a home game console (neutral grey/white box, disc slot, glowing light, vents) + one plain pad in front. No real console shape or logo.
  console: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e6e9ef"; const dk = "#3a4050";
    rbx(g, 0.34, 0.075, 0.22, 0.02, col, -0.03, 0.075, -0.02);
    bx(g, 0.35, 0.02, 0.23, "#b9c0cc", -0.03, 0.01, -0.02);
    bx(g, 0.2, 0.008, 0.012, "#14161d", -0.03, 0.095, 0.094);                   // disc slot
    for (let i = 0; i < 4; i++) bx(g, 0.2, 0.004, 0.012, dk, -0.03, 0.118, -0.08 + i * 0.025);   // vents on top
    cy(g, 0.012, 0.012, 0.01, "#9aa3b5", -0.15, 0.1, 0.1, [PI / 2, 0, 0], 14);  // power button
    const led = bx(g, 0.05, 0.008, 0.008, glowMat("#38bdf8", 2.2), 0.07, 0.07, 0.1);
    // the pad: light body, darker grips, two sticks, four coloured buttons, lying flat in front
    const o = new THREE.Group(); o.position.set(0.12, 0, 0.2); o.rotation.y = -0.25; g.add(o);
    sp(o, 0.05, "#f2f4f8", 0, 0.03, 0, [1.5, 0.45, 0.85], 20);
    for (const s of [-1, 1]) sp(o, 0.036, "#9aa3b5", s * 0.065, 0.026, 0.022, [0.75, 0.6, 1.5], 14);
    for (const s of [-1, 1]) cy(o, 0.012, 0.012, 0.012, dk, s * 0.03, 0.058, 0.014, undefined, 12);
    const bc = ["#22c55e", "#ef4444", "#3b82f6", "#facc15"]; [[0, 0.016], [0.016, 0], [-0.016, 0], [0, -0.016]].forEach((q, i) => cy(o, 0.008, 0.008, 0.01, bc[i], 0.055 + q[0], 0.058, -0.012 + q[1], undefined, 12));
    return { g, tick: (t) => { (led.material as THREE.MeshBasicMaterial).color.set("#38bdf8").multiplyScalar(1.4 + 0.9 * Math.sin(t * 3)); } };
  },
  // Nov 21: a white dimpled golf ball on a wooden tee
  golfball: (c) => {
    const g = new THREE.Group(); const col = c ?? "#fbfbfd"; const R = 0.05, y0 = 0.11;
    cone(g, 0.012, 0.07, "#e0a24a", 0, 0.035, 0, [PI, 0, 0], 12);
    cy(g, 0.022, 0.016, 0.014, "#e0a24a", 0, 0.074, 0, undefined, 14);
    const b = new THREE.Group(); b.position.y = y0; g.add(b);
    sp(b, R, col, 0, 0, 0, undefined, 28);
    const N = 70, ga = PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) { const yy = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - yy * yy), th = i * ga;
      const x = Math.cos(th) * rr, z = Math.sin(th) * rr; if (z < -0.35) continue;
      sp(b, 0.0075, "#c9d0dc", x * R * 0.995, yy * R * 0.995, z * R * 0.995, [1, 1, 0.5], 6).userData.noline = 1; }
    return { g, tick: (t) => { b.position.y = y0 + Math.sin(t * 2.2) * 0.004; b.rotation.y = Math.sin(t * 1.3) * 0.25; } };
  },
  // Nov 21: a driver standing upright: steel shaft, black grip, chunky head
  golfclub: (c) => {
    const g = new THREE.Group(); const o = new THREE.Group(); o.rotation.z = 0.16; g.add(o); const head = c ?? "#2f6fdd";
    cy(o, 0.008, 0.008, 0.62, metalMat("#c9ced6", 0.3), 0, 0.38, 0, undefined, 10);
    cy(o, 0.015, 0.014, 0.2, "#17171c", 0, 0.7, 0, undefined, 12);
    cy(o, 0.011, 0.011, 0.05, "#aab3c0", 0, 0.085, 0, undefined, 10);
    sp(o, 0.05, head, 0.04, 0.04, 0, [1.35, 0.75, 1.05], 18);
    bx(o, 0.07, 0.008, 0.05, "#f4f4f6", 0.05, 0.062, 0, [0, 0, 0]);
    sp(o, 0.012, "#f4f4f6", 0.085, 0.04, 0.0, [0.35, 1.4, 1.4], 8).userData.noline = 1;
    return { g, tick: (t) => { o.rotation.z = 0.16 + Math.sin(t * 1.8) * 0.05; } };
  },
  // Nov 18: prolate spheroid with pointed tips, long axis = x (profile to camera), laces on top, two stripes near the tips
  football: (c) => {
    const g = new THREE.Group(); const o = new THREE.Group(); o.position.y = 0.105; o.rotation.set(0, 0.3, 0.13); g.add(o);
    const L = 0.175, R = 0.1, W = "#fafafa";
    const rad = (t: number) => R * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 1.8)), 0.62);
    const pts: [number, number][] = []; for (let i = 0; i <= 24; i++) { const t = -1 + i / 12; pts.push([Math.max(0.0005, rad(t)), t * L]); }
    lathe(o, pts, c ?? "#8a4b22", 0, 0, 0, [0, 0, PI / 2], 24);
    for (const s of [-1, 1]) { const t = 0.62, rr = rad(t); const r = to(o, rr * 1.004, 0.007, W, s * t * L, 0, 0, [0, PI / 2, 0]); r.castShadow = false; }
    const top = (x: number) => rad(x / L) + 0.0015;
    for (let i = 0; i < 6; i++) { const x = -0.055 + i * 0.022; bx(o, 0.007, 0.007, 0.05, W, x, top(x), 0); }
    bx(o, 0.14, 0.007, 0.008, W, 0, top(0) + 0.002, 0);
    return { g };
  },
  hoop: () => {
    const g = new THREE.Group();
    cy(g, 0.07, 0.09, 3.6, "#454a58", 0, 1.8, -1.2, [0, 0, 0], 12); bx(g, 0.1, 0.1, 1.2, "#454a58", 0, 3.4, -0.6);
    bx(g, 1.8, 1.05, 0.06, "#f4f4f4", 0, 3.45, 0); to(g, 0.3, 0.02, "#c0152a", 0, 3.35, 0.002, [0, 0, 0]).visible = false;
    plane(g, 0.6, 0.45, flat(canvasTex(64, 48, (x) => { x.fillStyle = "#f4f4f4"; x.fillRect(0, 0, 64, 48); x.strokeStyle = "#c0152a"; x.lineWidth = 6; x.strokeRect(3, 3, 58, 42); })), 0, 3.35, 0.032);
    to(g, 0.23, 0.02, "#ff5a1f", 0, 3.05, 0.3, [PI / 2, 0, 0]); bx(g, 0.06, 0.04, 0.1, "#ff5a1f", 0, 3.05, 0.05);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.13, 0.4, 12, 3, true), new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true })); net.position.set(0, 2.85, 0.3); g.add(net);
    cy(g, 0.3, 0.3, 0.12, "#2a2a32", 0, 0.06, -1.2);
    return { g };
  },
  mic: (c) => {
    const g = new THREE.Group(); const col = c ?? "#2b2b34";
    cy(g, 0.07, 0.08, 0.02, "#2a2a32", 0, 0.01, 0); cy(g, 0.008, 0.008, 0.28, "#aab", 0, 0.16, 0, undefined, 8);
    cy(g, 0.016, 0.014, 0.12, col, 0, 0.36, 0.0);
    sp(g, 0.04, "#aab", 0, 0.45, 0, [1, 1.1, 1], 16); to(g, 0.04, 0.006, "#ffc928", 0, 0.41, 0, [PI / 2, 0, 0]);
    const grid = canvasTex(64, 64, (x) => { x.fillStyle = "#8a93a0"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#454a58"; for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) x.fillRect(i * 8 + 2, k * 8 + 2, 4, 4); });
    sp(g, 0.0405, flat(grid), 0, 0.455, 0, [1, 1.1, 1], 16).material = toonMat("#8a93a0", { map: grid });
    return { g };
  },
  headset: (c) => {
    const g = new THREE.Group(); const col = c ?? "#2b2b34";
    to(g, 0.1, 0.012, col, 0, 0.12, 0, [0, 0, 0], PI).rotation.z = 0;
    for (const s of [-1, 1]) { cy(g, 0.05, 0.05, 0.04, col, s * 0.105, 0.12, 0, [0, 0, PI / 2], 20); cy(g, 0.036, 0.036, 0.012, glowMat("#38ffa0", 1.8), s * 0.128, 0.12, 0, [0, 0, PI / 2], 16); }
    to(g, 0.1, 0.012, "#4a4a54", 0, 0.22, 0, [0, 0, 0], 0.01).visible = false;
    to(g, 0.06, 0.006, col, -0.05, 0.075, 0.05, [PI / 2, 0.4, 0.3], PI * 0.7);
    sp(g, 0.014, col, -0.075, 0.04, 0.095, undefined, 10);
    return { g };
  },
  controller: (c) => {
    // Nov 17 (Sam: "doesn't really look like a controller"): the old one was navy, tilted away and read as a dark blob.
    // Now: light body facing the camera, darker grips, big coloured face buttons, two thumbsticks, a white d-pad.
    const g = new THREE.Group(); const o = new THREE.Group(); o.rotation.x = 1.15; g.add(o); const col = c ?? "#eef1f6", grip = "#9aa3b5";
    sp(o, 0.05, col, 0, 0, 0, [1.4, 0.42, 0.78], 20);
    for (const s of [-1, 1]) sp(o, 0.036, grip, s * 0.06, -0.012, 0.026, [0.72, 0.6, 1.5], 14).rotation.y = s * 0.35;
    bx(o, 0.032, 0.012, 0.011, "#2a3040", -0.043, 0.02, -0.006); bx(o, 0.011, 0.012, 0.032, "#2a3040", -0.043, 0.02, -0.006);
    const bc = ["#22c55e", "#ef4444", "#3b82f6", "#facc15"]; [[0, 0.016], [0.016, 0], [-0.016, 0], [0, -0.016]].forEach((p, i) => cy(o, 0.009, 0.009, 0.012, bc[i], 0.045 + p[0], 0.02, -0.006 + p[1], undefined, 12));
    for (const [x, z] of [[-0.02, 0.018], [0.02, 0.018]]) { cy(o, 0.014, 0.014, 0.008, "#2a3040", x, 0.018, z, undefined, 14); cy(o, 0.009, 0.009, 0.012, "#4b5568", x, 0.024, z, undefined, 12); }
    cy(o, 0.006, 0.006, 0.006, glowMat("#38bdf8", 2), 0, 0.022, -0.014, undefined, 8);
    return { g };
  },
  burger: (c) => {
    const g = new THREE.Group(); const bun = c ?? "#e3a04a";
    put(g, new THREE.SphereGeometry(0.05, 20, 12, 0, PI * 2, 0, PI / 2), bun, 0, 0.0, 0, [0, 0, 0], [1.1, 0.85, 1.1]).position.y = 0.0;
    g.children[0].position.y = 0.0 + 0.0; const bot = g.children[0]; bot.rotation.x = PI; bot.scale.set(1.1, 0.35, 1.1); bot.position.y = 0.008;
    cy(g, 0.054, 0.054, 0.016, "#5a2e18", 0, 0.028, 0, undefined, 20);
    to(g, 0.056, 0.007, "#58c24a", 0, 0.04, 0, [PI / 2, 0, 0]); cy(g, 0.052, 0.052, 0.01, "#e33b2e", 0, 0.047, 0).visible = true;
    bx(g, 0.1, 0.005, 0.1, "#ffcf2b", 0, 0.056, 0, [0.0, PI / 4, 0]); cy(g, 0.054, 0.054, 0.014, "#5a2e18", 0, 0.067, 0, undefined, 20);
    put(g, new THREE.SphereGeometry(0.052, 20, 14, 0, PI * 2, 0, PI / 2), bun, 0, 0.074, 0, [0, 0, 0], [1.08, 0.95, 1.08]);
    const r = seeded(5); for (let i = 0; i < 9; i++) { const a = r() * PI * 2; const rr = 0.012 + r() * 0.03; const y = 0.074 + Math.sqrt(Math.max(0, 0.05 * 0.05 - rr * rr)) * 0.93; sp(g, 0.004, "#fff3cf", Math.cos(a) * rr * 1.08, y, Math.sin(a) * rr * 1.08, [1, 0.6, 1.5], 6); }
    return { g };
  },
  pizza: (c) => {
    const g = new THREE.Group(); const crust = c ?? "#f0b04a";
    const tilt = new THREE.Group(); tilt.rotation.set(1.05, 0, 0); g.add(tilt);
    const gapH = 0.45; // half-angle of the missing slice (rad), slice points toward local +z
    const pie = (r: number, h: number, a0: number, len: number) => new THREE.CylinderGeometry(r, r, h, 48, 1, false, a0, len);
    const arcAt = (grp: THREE.Group, R: number, tube: number, a0: number, len: number, m: M, y: number) => {
      const sub = new THREE.Group(); sub.rotation.y = -a0; sub.position.y = y; grp.add(sub);
      return put(sub, new THREE.TorusGeometry(R, tube, 12, 40, len), m, 0, 0, 0, [PI / 2, 0, 0], [1, 1, 0.8]);
    };
    const fullLen = PI * 2 - gapH * 2;
    // main pie (gap centred on +z)
    put(tilt, pie(0.2, 0.03, gapH, fullLen), "#e8a340", 0, 0.015, 0);
    put(tilt, pie(0.18, 0.014, gapH, fullLen), "#d92b1c", 0, 0.036, 0, undefined, undefined, false);
    put(tilt, pie(0.155, 0.016, gapH, fullLen), "#ffc82e", 0, 0.047, 0, undefined, undefined, false);
    arcAt(tilt, 0.19, 0.032, PI / 2 + gapH, fullLen, crust, 0.036);
    // melted cheese drips over the sauce edge
    const dr = seeded(7);
    for (let i = 0; i < 9; i++) {
      const th = gapH + 0.25 + (i / 8) * (fullLen - 0.5); const L = 0.03 + dr() * 0.03;
      const rr = 0.16 + L * 0.3; const s = sp(tilt, 0.022, "#ffd23a", Math.sin(th) * rr, 0.044, Math.cos(th) * rr, [0.8, 0.45, 1.3 + dr()], 10); s.rotation.y = th;
    }
    // pepperoni (raised discs)
    const pp: [number, number][] = [[-0.07, -0.07], [0.07, -0.09], [0.0, 0.0], [-0.115, 0.03], [0.12, 0.01], [-0.04, 0.095], [0.09, 0.09], [0.0, -0.13]];
    for (const [x, z] of pp) {
      if (Math.abs(Math.atan2(x, z)) < gapH + 0.2 && z > 0) continue;
      cy(tilt, 0.036, 0.036, 0.018, "#b3201c", x, 0.062, z, undefined, 20); cy(tilt, 0.026, 0.026, 0.006, "#df4538", x, 0.074, z, undefined, 16).children[0].visible = false;
    }
    // green basil bits
    for (const [x, z, a] of [[-0.03, 0.05, 0.6], [0.11, -0.04, 2.1], [-0.1, -0.1, 1.2]]) sp(tilt, 0.016, "#2fa84f", x, 0.058, z, [1.5, 0.35, 0.8], 8).rotation.y = a;
    // the pulled-out slice
    const sl = new THREE.Group(); sl.position.set(0, 0.012, 0.2); tilt.add(sl);
    put(sl, pie(0.2, 0.03, -gapH * 0.92, gapH * 1.84), "#e8a340", 0, 0.015, 0);
    put(sl, pie(0.18, 0.014, -gapH * 0.92, gapH * 1.84), "#d92b1c", 0, 0.036, 0, undefined, undefined, false);
    put(sl, pie(0.155, 0.016, -gapH * 0.92, gapH * 1.84), "#ffc82e", 0, 0.047, 0, undefined, undefined, false);
    arcAt(sl, 0.19, 0.032, PI / 2 - gapH * 0.92, gapH * 1.84, crust, 0.036);
    cy(sl, 0.032, 0.032, 0.018, "#b3201c", 0, 0.062, 0.095, undefined, 20); cy(sl, 0.022, 0.022, 0.006, "#df4538", 0, 0.074, 0.095, undefined, 16).children[0].visible = false;
    // cheese strings between slice and pie
    const strings: THREE.Mesh[] = [];
    for (const [x, z0, len, w] of [[0.0, 0.0, 0.2, 0.012], [0.045, 0.06, 0.15, 0.01], [-0.05, 0.06, 0.15, 0.01], [0.085, 0.1, 0.1, 0.008], [-0.09, 0.1, 0.1, 0.008]] as [number, number, number, number][]) {
      strings.push(cy(tilt, w, w, len, "#ffd23a", x, 0.052 - len * 0.02, z0 + len / 2 + 0.015, [PI / 2, 0, 0], 8));
    }
    return { g, tick: (t) => { tilt.rotation.z = Math.sin(t * 1.6) * 0.07; tilt.rotation.y = Math.sin(t * 1.1) * 0.12; sl.position.z = 0.2 + Math.sin(t * 2.1) * 0.012; strings.forEach((s) => { s.scale.set(1 - 0.05 * Math.sin(t * 2.1), 1, 1 - 0.05 * Math.sin(t * 2.1)); }); } };
  },
  coffee: (c) => {
    const g = new THREE.Group(); const col = c ?? "#fafafa";
    lathe(g, [[0, 0], [0.035, 0], [0.045, 0.01], [0.05, 0.09], [0.048, 0.1], [0.042, 0.098], [0.04, 0.012], [0, 0.012]], col, 0, 0, 0);
    cy(g, 0.044, 0.044, 0.004, "#5a2e18", 0, 0.088, 0, undefined, 20);
    to(g, 0.028, 0.007, col, 0.062, 0.055, 0, [0, 0, 0], PI * 1.2).rotation.z = -PI / 2 - 0.6;
    g.children[g.children.length - 1].position.set(0.068, 0.055, 0); g.children[g.children.length - 1].rotation.set(0, 0, -PI * 0.6);
    const st: THREE.Mesh[] = []; for (let i = 0; i < 4; i++) { const s = sp(g, 0.012, toonMat("#ffffff", { transparent: true }), 0, 0.13, 0, undefined, 8); s.children[0].visible = false; st.push(s); }
    return { g, tick: (t) => st.forEach((s, i) => { const k = (t * 0.5 + i / 4) % 1; s.position.set(Math.sin(k * 9 + i * 2) * 0.012, 0.11 + k * 0.1, 0); s.scale.setScalar(1 - k * 0.7); }) };
  },
  plant: (c) => {
    const g = new THREE.Group(); const col = c ?? "#2fb36b"; const r = seeded(31); const lv: THREE.Mesh[] = [];
    lathe(g, [[0, 0], [0.09, 0], [0.13, 0.22], [0.14, 0.24], [0.12, 0.24], [0.1, 0.22], [0, 0.22]], "#d9694a", 0, 0, 0);
    cy(g, 0.12, 0.12, 0.02, "#4a2f1d", 0, 0.22, 0);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2 + r(); const tilt = 0.35 + r() * 0.6; const L = 0.22 + r() * 0.18;
      const k = new THREE.Group(); k.position.set(0, 0.23, 0); k.rotation.set(0, a, 0); g.add(k); const k2 = new THREE.Group(); k2.rotation.z = tilt; k.add(k2);
      const m = sp(k2, 0.06, i % 3 ? col : "#1f9a58", 0, L / 2 + 0.03, 0, [0.55, L / 0.12, 0.12], 12); lv.push(m as THREE.Mesh); void m; }
    return { g, tick: (t) => g.children.forEach((k, i) => { if (i > 1) k.rotation.x = Math.sin(t * 1.4 + i) * 0.04; }) };
  },
  robot: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#4aa8ff"; const bd = new THREE.Group(); g.add(bd);
    rbx(bd, 0.5, 0.5, 0.36, 0.09, col, 0, 0.7, 0); bx(bd, 0.3, 0.2, 0.02, "#12182a", 0, 0.7, 0.19);
    plane(bd, 0.26, 0.16, screenMat(textTex(text ?? "BOT", 128, 80, "#12182a", "#38ffa0"), 1.3), 0, 0.7, 0.2);
    const hd = new THREE.Group(); hd.position.y = 1.2; bd.add(hd);
    rbx(hd, 0.46, 0.34, 0.34, 0.1, "#e8edf5", 0, 0, 0); bx(hd, 0.36, 0.17, 0.02, "#12182a", 0, 0.0, 0.175);
    for (const s of [-1, 1]) { sp(hd, 0.04, glowMat("#38e8ff", 2.2), s * 0.08, 0.0, 0.19, [1, 1, 0.4], 12); cy(hd, 0.04, 0.04, 0.06, col, s * 0.25, 0, 0, [0, 0, PI / 2], 12); }
    cy(hd, 0.01, 0.01, 0.14, "#454a58", 0, 0.2, 0, undefined, 8); const ant = sp(hd, 0.03, glowMat("#ff5a5a", 2), 0, 0.29, 0, undefined, 10);
    for (const s of [-1, 1]) { cy(bd, 0.04, 0.04, 0.4, "#e8edf5", s * 0.34, 0.68, 0, [0, 0, s * 0.25]); sp(bd, 0.065, col, s * 0.4, 0.46, 0, undefined, 12); cy(bd, 0.05, 0.05, 0.3, "#454a58", s * 0.15, 0.3, 0); bx(bd, 0.16, 0.06, 0.26, col, s * 0.15, 0.09, 0.04); }
    return { g, tick: (t) => { bd.position.y = Math.sin(t * 3) * 0.015; hd.rotation.y = Math.sin(t * 1.2) * 0.25; (ant.material as THREE.Material) && (ant.scale.setScalar(1 + 0.2 * Math.sin(t * 8))); } };
  },
  drone: (c) => {
    const g = new THREE.Group(); const col = c ?? "#f2f5fa"; const hv = new THREE.Group(); hv.position.y = 0.2; g.add(hv);
    const props: THREE.Group[] = []; const leds: THREE.Mesh[] = [];
    const frame = "#2e3342", pod = "#ff7a1a";
    // body shell + top cap
    sp(hv, 0.1, col, 0, 0.0, 0, [1, 0.5, 1.15], 24);
    sp(hv, 0.06, "#2e3342", 0, 0.034, -0.005, [1, 0.5, 1.1], 16);
    // X frame: two crossing arms
    for (const a of [PI / 4, -PI / 4]) bx(hv, 0.036, 0.024, 0.62, frame, 0, 0.0, 0, [0, a, 0]);
    // motor pods, props, LEDs at the four arm ends
    const R = 0.2193;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const x = sx * R, z = sz * R; const front = sz > 0;
      cy(hv, 0.045, 0.04, 0.06, pod, x, 0.03, z, undefined, 16); cy(hv, 0.03, 0.03, 0.012, "#16161c", x, 0.07, z, undefined, 12);
      const p = new THREE.Group(); p.position.set(x, 0.085, z); hv.add(p); props.push(p);
      bx(p, 0.3, 0.008, 0.038, front ? "#ffffff" : "#ffe14a", 0, 0, 0);
      cy(p, 0.012, 0.012, 0.016, "#16161c", 0, 0.008, 0, undefined, 8);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.004, 24), new THREE.MeshBasicMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.22, depthWrite: false }));
      disc.position.set(x, 0.087, z); hv.add(disc);
      leds.push(sp(hv, 0.018, glowMat(front ? "#38ff6a" : "#ff2a2a", 2.6), x, -0.012, z + sz * 0.03, undefined, 10));
    }
    // landing skids
    for (const s of [-1, 1]) { bx(hv, 0.02, 0.1, 0.02, frame, s * 0.07, -0.06, 0.0); bx(hv, 0.026, 0.02, 0.26, frame, s * 0.07, -0.115, 0.0); }
    // camera gimbal underneath
    cy(hv, 0.012, 0.012, 0.04, frame, 0, -0.04, 0.07, undefined, 8);
    const gim = new THREE.Group(); gim.position.set(0, -0.085, 0.075); hv.add(gim);
    sp(gim, 0.04, "#16161c", 0, 0, 0, undefined, 16); cy(gim, 0.022, 0.022, 0.03, "#2e3342", 0, 0, 0.035, [PI / 2, 0, 0], 14);
    sp(gim, 0.017, glowMat("#38b8ff", 2.2), 0, 0, 0.052, [1, 1, 0.5], 10);
    return { g, tick: (t) => {
      hv.position.y = 0.2 + Math.sin(t * 2.4) * 0.025; hv.rotation.z = Math.sin(t * 1.3) * 0.07; hv.rotation.x = 0.22 + Math.sin(t * 1.7 + 1) * 0.05; hv.rotation.y = 0.5 + Math.sin(t * 0.9) * 0.15;
      props.forEach((p, i) => (p.rotation.y = t * 22 * (i === 0 || i === 3 ? 1 : -1))); gim.rotation.x = Math.sin(t * 1.5) * 0.15;
      leds.forEach((l, i) => l.scale.setScalar(0.85 + 0.35 * Math.max(0, Math.sin(t * 6 + i * 1.5))));
    } };
  },
  satellite: (c) => {
    const g = new THREE.Group(); const s = new THREE.Group(); s.position.y = 0.6; s.rotation.set(0.3, 0.5, 0); g.add(s);
    bx(s, 0.7, 0.7, 0.8, "#e0b830", 0, 0, 0); bx(s, 0.72, 0.2, 0.82, "#c9a020", 0, 0.1, 0); bx(s, 0.5, 0.1, 0.1, c ?? "#2b6bff", 0, 0.2, 0.41).visible = false;
    cy(s, 0.04, 0.04, 0.7, "#8a93a0", 0, 0, 0, [0, 0, PI / 2], 8);
    const pan = canvasTex(256, 128, (x) => { x.fillStyle = c ?? "#1f4fd8"; x.fillRect(0, 0, 256, 128); x.strokeStyle = "#9fc4ff"; x.lineWidth = 3; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.stroke(); } for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(256, i * 32); x.stroke(); } });
    for (const sg of [-1, 1]) { bx(s, 1.5, 0.04, 0.8, toonMat("#ffffff", { map: pan }), sg * 1.55, 0, 0); bx(s, 0.5, 0.05, 0.05, "#8a93a0", sg * 0.5, 0, 0).visible = false; }
    cone(s, 0.35, 0.18, "#f4f4f4", 0, 0.1, 0.62, [PI / 2, 0, 0], 20).scale.set(1, 1, 1); cy(s, 0.012, 0.012, 0.35, "#454a58", 0, 0.5, 0.0, undefined, 6); sp(s, 0.03, glowMat("#ff5a5a", 2), 0, 0.7, 0, undefined, 8);
    return { g, tick: (t) => { s.rotation.y = 0.5 + t * 0.25; s.position.y = 0.6 + Math.sin(t * 1.1) * 0.03; } };
  },
  globe: (c) => {
    const g = new THREE.Group(); const r = seeded(9);
    const tex = canvasTex(512, 256, (x) => {
      x.fillStyle = c ?? "#2a82e8"; x.fillRect(0, 0, 512, 256); x.fillStyle = "#3dbb5a";
      const blobs: [number, number, number, number][] = [[110, 90, 60, 40], [150, 170, 30, 55], [260, 80, 30, 25], [290, 150, 38, 50], [370, 80, 70, 35], [430, 175, 28, 20], [60, 60, 25, 18]];
      for (const [cx, cyy, rx, ry] of blobs) { x.beginPath(); x.ellipse(cx, cyy, rx, ry, r() - 0.5, 0, PI * 2); x.fill(); }
      x.fillStyle = "#fff"; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14);
    });
    cy(g, 0.1, 0.12, 0.02, "#4a2f1d", 0, 0.01, 0); cy(g, 0.012, 0.016, 0.1, GOLD(), 0, 0.07, 0, undefined, 10);
    const tilt = new THREE.Group(); tilt.position.y = 0.25; tilt.rotation.z = 0.41; g.add(tilt); const sph = new THREE.Group(); tilt.add(sph);
    sp(sph, 0.17, toonMat("#ffffff", { map: tex }), 0, 0, 0, undefined, 28);
    to(g, 0.2, 0.008, GOLD(), 0, 0.25, 0, [0, 0, 0]); to(g, 0.2, 0.008, GOLD(), 0, 0.25, 0, [0, PI / 2, 0]).visible = false;
    return { g, tick: (t) => { sph.rotation.y = t * 0.6; } };
  },
  house: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#f4e3c4";
    bx(g, 9, 4.2, 6.5, col, 0, 2.1, 0);
    ext(g, [[-5.2, 0], [5.2, 0], [0, 3.0]], 7.4, "#c0392b", 0, 4.2, 0, [0, 0, 0], 0.12).position.z = 0;
    g.children[g.children.length - 1].position.y = 4.2 + 1.5; g.children[g.children.length - 1].position.z = 0;
    bx(g, 1.1, 2.4, 0.15, "#7a4a26", 0, 1.2, 3.3); sp(g, 0.08, GOLD(), 0.35, 1.1, 3.4, undefined, 8);
    for (const x of [-3, 3]) { bx(g, 1.4, 1.4, 0.16, "#fafafa", x, 2.4, 3.28); bx(g, 1.2, 1.2, 0.18, glowMat("#ffd978", 1.4), x, 2.4, 3.3); bx(g, 0.1, 1.2, 0.2, "#fafafa", x, 2.4, 3.32); bx(g, 1.2, 0.1, 0.2, "#fafafa", x, 2.4, 3.32); }
    bx(g, 0.9, 2.2, 0.9, "#a0522d", 2.8, 6.2, -1.5); bx(g, 1.1, 0.2, 1.1, "#7a3a1d", 2.8, 7.3, -1.5);
    if (text) plane(g, 2.4, 0.6, flat(textTex(text, 256, 64, "#fafafa", "#1b1b24")), 0, 3.6, 3.27);
    return { g };
  },
  factory: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#b0462f";
    bx(g, 22, 7, 12, col, 0, 3.5, 0);
    for (let i = 0; i < 4; i++) ext(g, [[0, 0], [5, 0], [0, 3.2]], 12.4, "#8a93a0", -10.8 + i * 5.4, 7, -6.2, [0, 0, 0], 0);
    for (let i = 0; i < 6; i++) bx(g, 2.4, 1.6, 0.1, glowMat("#ffd978", 1.3), -8.5 + i * 3.4, 4.5, 6.05);
    bx(g, 4.5, 4, 0.2, "#454a58", 0, 2, 6.05); if (text) plane(g, 7, 1.4, flat(textTex(text, 512, 100, col, "#fafafa")), 0, 5.6, 6.06).visible = true;
    const sm: THREE.Mesh[] = [];
    for (const x of [-7, -3.5]) { cy(g, 0.9, 1.3, 11, "#c9ccd6", x, 12.5, -3, undefined, 16); to(g, 1.0, 0.15, "#c0392b", x, 16.5, -3, [PI / 2, 0, 0]); for (let k = 0; k < 4; k++) sm.push(sp(g, 1.1, toonMat("#6e7380"), x, 19, -3, undefined, 10) as THREE.Mesh); }
    return { g, tick: (t) => sm.forEach((m, i) => { const k = (t * 0.25 + (i % 4) / 4) % 1; m.position.set(m.position.x, 18.5 + k * 9, -3 + k * 2); m.scale.setScalar(0.5 + k * 1.6); }) };
  },
  stadium: () => {
    const g = new THREE.Group();
    const crowd = canvasTex(256, 64, (x) => { x.fillStyle = "#3a3f5a"; x.fillRect(0, 0, 256, 64); const r = seeded(4); for (let i = 0; i < 600; i++) { x.fillStyle = ["#e5262f", "#ffd24a", "#f4f4f4", "#2b6bff", "#2ecc71"][Math.floor(r() * 5)]; x.fillRect(r() * 256, r() * 64, 3, 3); } });
    crowd.wrapS = crowd.wrapT = THREE.RepeatWrapping; crowd.repeat.set(6, 1);
    const bowl = new THREE.Group(); bowl.scale.set(1.35, 1, 1); g.add(bowl);
    lathe(bowl, [[40, 4], [54, 24], [58, 24], [64, 18], [62, 0], [40, 0]].reverse() as [number, number][], toonMat("#9aa3b5", { map: crowd }), 0, 0, 0, undefined, 40);
    lathe(bowl, [[66, 0], [66, 18], [64, 18], [62, 0]], "#d8dce6", 0, 0, 0, undefined, 40);
    cy(bowl, 40, 40, 0.3, "#2f9e44", 0, 0.15, 0, undefined, 40);
    const fld = canvasTex(256, 128, (x) => { x.fillStyle = "#2f9e44"; x.fillRect(0, 0, 256, 128); x.fillStyle = "#36ad4c"; for (let i = 0; i < 8; i++) if (i % 2) x.fillRect(i * 32, 0, 32, 128); x.strokeStyle = "#fff"; x.lineWidth = 3; x.strokeRect(6, 6, 244, 116); x.beginPath(); x.moveTo(128, 6); x.lineTo(128, 122); x.stroke(); x.beginPath(); x.arc(128, 64, 22, 0, PI * 2); x.stroke(); });
    plane(g, 80, 50, flat(fld), 0, 0.32, 0, [-PI / 2, 0, 0]);
    for (const [x, z] of [[-60, -40], [60, -40], [-60, 40], [60, 40]]) { cy(g, 0.8, 1.2, 30, "#454a58", x, 15, z, undefined, 8); bx(g, 7, 3, 1.2, glowMat("#fff6c0", 2), x, 31, z, [0, 0, 0]); }
    return { g };
  },
  plane: (c) => {
    const g = new THREE.Group(); const col = c ?? "#f4f4f4";
    lathe(g, [[0, -19], [1.4, -17.5], [2.8, -14], [3, -10], [3, 12], [2.4, 17], [0.9, 19.5], [0.5, 20]], col, 0, 0, 0, [PI / 2, 0, 0], 24);
    lathe(g, [[2.3, 0], [3.02, 1.5], [3.02, 3], [2.2, 6]], "#1f56c7", 0, 0, 0, [PI / 2, 0, 0]).visible = false;
    for (const s of [-1, 1]) {
      ext(g, [[0, 0], [15, -6], [15, -3.5], [0, 5]], 0.4, "#dfe3ea", s * 0.0, 0, 0, [0, 0, 0], 0).visible = false;
      const wg = ext(g, s > 0 ? [[0, 0], [16, 5], [16, 7], [0, 6]] : [[0, 0], [-16, 5], [-16, 7], [0, 6]], 0.35, "#dfe3ea", s * 8, 0, 0.0, [-PI / 2, 0, 0], 0); wg.position.set(s * 9.2, -1.2, 0.5);
      ext(g, s > 0 ? [[0, 0], [5, 3], [5, 4.2], [0, 3.4]] : [[0, 0], [-5, 3], [-5, 4.2], [0, 3.4]], 0.3, "#dfe3ea", s * 3, 1.5, -15.5, [-PI / 2, 0, 0], 0);
      cy(g, 0.9, 0.8, 3.2, "#8a93a0", s * 6.3, -2.2, 1, [PI / 2, 0, 0], 16); cy(g, 0.6, 0.6, 0.2, "#2a2a32", s * 6.3, -2.2, 2.7, [PI / 2, 0, 0], 12);
    }
    ext(g, [[0, 0], [0.3, 0], [1.2, 5], [3.2, 5], [0, 0.0]], 0.35, "#1f56c7", 0, 3, -14.5, [0, -PI / 2, 0], 0).visible = false;
    ext(g, [[0, 0], [5.5, 0], [1.2, 6.5], [-0.6, 6.5]], 0.35, "#1f56c7", -0.175, 2.2, -16.5, [0, PI / 2, 0], 0).rotation.set(0, PI / 2, 0);
    const win = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.45, 0.35), glowMat("#9fd6ff", 1.0), 24); const d = new THREE.Object3D();
    for (let i = 0; i < 24; i++) { for (const s of [-1, 1]) { d.position.set(s * 3.0, 1.0, 6.5 - i * 0.55 - (s > 0 ? 0 : 0)); d.updateMatrix(); win.setMatrixAt(i, d.matrix); } }
    g.add(win);
    return { g };
  },
  yacht: (c, text) => {
    const g = new THREE.Group(); const col = c ?? "#f4f4f4";
    const hull = ext(g, [[-3, -9], [3, -9], [3.4, 6], [0, 15], [-3.4, 6]].map((p) => [p[0], -p[1]] as [number, number]), 2.2, col, 0, 0, 0, [-PI / 2, 0, 0], 0.1); hull.position.set(0, 1.1, 0); hull.rotation.x = PI / 2; hull.rotation.y = 0;
    hull.geometry.dispose(); hull.geometry = (() => { const s = new THREE.Shape([[-3, -9], [3, -9], [3.4, 6], [0, 15], [-3.4, 6]].map((p) => new THREE.Vector2(p[0], p[1]))); const ge = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 }); ge.rotateX(-PI / 2); ge.computeBoundingBox(); const c2 = ge.boundingBox!.getCenter(new THREE.Vector3()); ge.translate(-c2.x, -c2.y, -c2.z); return ge; })();
    (hull.children[0] as THREE.Mesh).geometry = hull.geometry; hull.position.set(0, 1.1, 3); hull.rotation.set(0, 0, 0);
    bx(g, 6.9, 0.4, 0.2, "#1f56c7", 0, 1.4, 0).visible = false;
    bx(g, 5.6, 0.1, 17, "#8b5a2b", 0, 2.25, 0).visible = false;
    bx(g, 5, 1.6, 8, col, 0, 3.1, -1.5); bx(g, 5.02, 0.55, 5.8, glowMat("#8fd0ff", 1.0), 0, 3.4, -1.0); bx(g, 4, 1.4, 4.5, col, 0, 4.6, -2.0); bx(g, 4.02, 0.5, 3.2, glowMat("#8fd0ff", 1.0), 0, 4.8, -1.3);
    cy(g, 0.12, 0.12, 4, "#c9ccd6", 0, 7.1, -2.5, undefined, 8); bx(g, 0.1, 0.1, 1.8, "#c9ccd6", 0, 7.6, -2.5).visible = false;
    for (const s of [-1, 1]) bx(g, 0.1, 0.4, 14, "#1f56c7", s * 3.15, 1.35, 3.8).visible = false;
    if (text) plane(g, 5, 0.9, flat(textTex(text, 512, 92, col, "#1f56c7")), 3.36, 1.7, 1, [0, PI / 2, 0]);
    return { g };
  },
  chart: (c, text) => {
    const g = new THREE.Group(); const bar = c ?? "#2ecc71";
    bx(g, 1.3, 0.95, 0.04, "#f6f6f2", 0, 0.55, -0.05);
    plane(g, 1.2, 0.2, flat(textTex(text ?? "REVENUE", 512, 90, "#f6f6f2", "#1b1b24")), 0, 0.92, -0.026);
    const grid = canvasTex(256, 128, (x) => { x.fillStyle = "#f6f6f2"; x.fillRect(0, 0, 256, 128); x.strokeStyle = "#d6d6cf"; x.lineWidth = 2; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 25); x.lineTo(256, i * 25); x.stroke(); } });
    plane(g, 1.2, 0.6, flat(grid), 0, 0.5, -0.027);
    for (let i = 0; i < 6; i++) { const h = 0.12 + i * 0.09 + (i % 2) * 0.03; bx(g, 0.13, h, 0.12, i === 5 ? "#ffc928" : bar, -0.45 + i * 0.18, 0.2 + h / 2, 0.03); }
    ext(g, [[0, 0], [0.12, 0.12], [0.04, 0.12], [0.04, 0.3], [-0.04, 0.3], [-0.04, 0.12], [-0.12, 0.12]], 0.05, toonMat("#ffc928", { emissive: "#ffc928", emissiveIntensity: 0.6 }), 0.45, 0.95, 0.0, [0, 0, -0.75], 0.01).visible = true;
    for (const x of [-0.5, 0.5]) cy(g, 0.02, 0.02, 0.2, "#454a58", x, 0.1, -0.05, undefined, 6);
    return { g };
  },
  arrowup: (c) => arrow(c ?? "#2ecc71", 1),
  arrowdown: (c) => arrow(c ?? "#e5262f", -1),
  lightbulb: (c) => {
    const g = new THREE.Group(); const col = c ?? "#ffe14a";
    sp(g, 0.06, toonMat(col, { emissive: col, emissiveIntensity: 1.2 }), 0, 0.145, 0, undefined, 24);
    cy(g, 0.035, 0.045, 0.05, toonMat(col, { emissive: col, emissiveIntensity: 1.2 }), 0, 0.088, 0, undefined, 16);
    for (let i = 0; i < 3; i++) cy(g, 0.032, 0.032, 0.012, "#aab", 0, 0.055 - i * 0.015, 0, undefined, 14); cy(g, 0.012, 0.012, 0.012, "#2a2a32", 0, 0.01, 0, undefined, 8);
    to(g, 0.02, 0.003, "#a8741a", 0, 0.14, 0, [0, 0, 0], PI).visible = false;
    const rays: THREE.Mesh[] = []; for (let i = 0; i < 7; i++) { const a = -PI * 0.15 + (i / 6) * PI * 1.3; const m = bx(g, 0.012, 0.035, 0.012, glowMat(col, 1.6), Math.cos(a) * 0.1, 0.145 + Math.sin(a) * 0.1, 0, [0, 0, a - PI / 2]); rays.push(m); }
    return { g, tick: (t) => rays.forEach((m, i) => m.scale.setScalar(1 + 0.3 * Math.sin(t * 6 + i))) };
  },
  lock: (c) => {
    const g = new THREE.Group(); const m = metalMat(c ?? "#ffc928", 0.3);
    to(g, 0.035, 0.01, "#b9c2d0", 0, 0.1, 0, [0, 0, 0], PI);
    for (const s of [-1, 1]) cy(g, 0.01, 0.01, 0.03, "#b9c2d0", s * 0.035, 0.085, 0, undefined, 8);
    rbx(g, 0.1, 0.08, 0.04, 0.012, m, 0, 0.04, 0);
    cy(g, 0.009, 0.009, 0.006, "#1b1b24", 0, 0.05, 0.0225, [PI / 2, 0, 0], 10); bx(g, 0.008, 0.02, 0.006, "#1b1b24", 0, 0.036, 0.0225);
    return { g };
  },
  key: (c) => {
    const g = new THREE.Group(); const m = metalMat(c ?? "#ffc928", 0.3);
    to(g, 0.025, 0.008, m, 0, 0.115, 0, [0, 0, 0]); cy(g, 0.007, 0.007, 0.1, m, 0, 0.045, 0, undefined, 8);
    for (const [y, w] of [[0.03, 0.03], [0.012, 0.022], [0.048, 0.02]]) bx(g, w, 0.012, 0.008, m, w / 2, y, 0);
    return { g };
  },
  heart: (c) => {
    const g = new THREE.Group(); const col = c ?? "#e5262f"; const s = new THREE.Shape();
    s.moveTo(0, -0.14); s.bezierCurveTo(-0.22, 0.0, -0.17, 0.14, -0.08, 0.14); s.bezierCurveTo(-0.03, 0.14, 0, 0.1, 0, 0.07); s.bezierCurveTo(0, 0.1, 0.03, 0.14, 0.08, 0.14); s.bezierCurveTo(0.17, 0.14, 0.22, 0.0, 0, -0.14);
    const h = put(g, new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4, curveSegments: 16 }), toonMat(col, { emissive: col, emissiveIntensity: 0.25 }), 0, 0.15, 0);
    sp(g, 0.025, "#ffffff", -0.085, 0.24, 0.085, [1, 1.6, 0.5], 8).rotation.z = 0.5; void h;
    return { g, tick: (t) => { const k = 1 + 0.07 * Math.max(0, Math.sin(t * 7)); g.scale.setScalar(k); } };
  },
  bomb: (c) => {
    const g = new THREE.Group();
    sp(g, 0.12, c ?? "#23232b", 0, 0.12, 0, undefined, 24); cy(g, 0.035, 0.04, 0.04, "#8a93a0", 0, 0.255, 0, undefined, 12);
    const pts = [new THREE.Vector3(0, 0.27, 0), new THREE.Vector3(0.03, 0.32, 0), new THREE.Vector3(0.0, 0.36, 0), new THREE.Vector3(0.04, 0.4, 0)];
    put(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.007, 6), "#c9a15a", 0, 0, 0);
    sp(g, 0.035, "#ffffff", -0.05, 0.17, 0.09, [0.5, 1.2, 0.4], 8).rotation.z = 0.4;
    const sparks = new THREE.Group(); sparks.position.set(0.04, 0.4, 0); g.add(sparks); const a = sp(sparks, 0.025, glowMat("#ffd24a", 2.4), 0, 0, 0, undefined, 8); const b = sp(sparks, 0.015, glowMat("#ff6a1f", 2.4), 0.01, 0.015, 0, undefined, 8);
    return { g, tick: (t) => { a.scale.setScalar(1 + 0.4 * Math.sin(t * 30)); b.position.set(Math.sin(t * 23) * 0.03, 0.01 + Math.abs(Math.sin(t * 17)) * 0.04, Math.cos(t * 19) * 0.03); } };
  },
  fire: (c) => {
    const g = new THREE.Group(); const outer = c ?? "#ff2e0a";
    // stones ring
    const sr = seeded(3); for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + 0.2; sp(g, 0.06, i % 2 ? "#8a93a0" : "#a7afbb", Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3, [1.2, 0.7, 1 + sr() * 0.3], 10); }
    // log pile
    const log = (a: number, y: number, len: number, col: string) => {
      const k = new THREE.Group(); k.rotation.y = a; k.position.y = y; g.add(k);
      cy(k, 0.05, 0.05, len, col, 0, 0, 0, [0, 0, PI / 2], 12);
      for (const s of [-1, 1]) cy(k, 0.04, 0.04, 0.012, "#e6b57a", s * len / 2, 0, 0, [0, 0, PI / 2], 12);
    };
    log(0.55, 0.05, 0.46, "#7a4a28"); log(-0.55, 0.05, 0.46, "#6b3f22"); log(1.57, 0.14, 0.4, "#85522c");
    // flames: teardrop lathes in three layers, each on a pivot at its base
    const drop = (h: number, w: number): [number, number][] => { const o: [number, number][] = [[0, 0]]; for (let i = 1; i <= 14; i++) { const s = i / 14; o.push([w * Math.pow(Math.sin(PI * Math.pow(s, 0.72)), 0.85), s * h]); } o[14][0] = 0.002; return o; };
    type F = { piv: THREE.Group; ph: number; sp: number; amp: number };
    const fl: F[] = [];
    const defs: [number, number, number, number][] = [[0, 0, 0.78, 0.2], [-0.14, 0.02, 0.5, 0.14], [0.15, -0.02, 0.56, 0.15], [-0.07, 0.07, 0.34, 0.1], [0.08, 0.08, 0.3, 0.1]];
    defs.forEach(([x, z, h, w], i) => {
      const layers: [string, number, number, number, boolean][] = [[outer, 1, 1, 0, true], ["#ff9a1a", 0.8, 0.72, 0.035, false], ["#ffe45c", 0.5, 0.45, 0.07, false]];
      const piv = new THREE.Group(); piv.position.set(x, 0.12, z); g.add(piv);
      layers.forEach(([colr, hk, wk, zo, ol], li) => put(piv, new THREE.LatheGeometry(drop(h * hk, w * wk).map((p) => new THREE.Vector2(p[0], p[1])), 20), dbl(glowMat(colr, li === 0 ? 1.7 : li === 1 ? 1.9 : 2.2)), 0, 0, zo, [0, 0, 0], [1, 1, 0.55 + li * 0.1], ol));
      fl.push({ piv, ph: i * 1.9, sp: 9 + i * 2.1, amp: 0.1 + (i === 0 ? 0 : 0.04) });
    });
    // embers
    const em: THREE.Mesh[] = []; for (let i = 0; i < 7; i++) em.push(sp(g, 0.014, glowMat("#ffc23a", 2.6), 0, 0.5, 0, undefined, 6));
    return { g, tick: (t) => {
      fl.forEach((f, i) => { const k = 1 + 0.13 * Math.sin(t * f.sp + f.ph) + 0.06 * Math.sin(t * 2.3 * f.sp + f.ph * 2); f.piv.scale.set(1 - (k - 1) * 0.6, k, 1 - (k - 1) * 0.6); f.piv.rotation.z = Math.sin(t * (4 + i) + f.ph) * f.amp; f.piv.rotation.x = Math.cos(t * (3 + i * 0.7) + f.ph) * 0.05; });
      em.forEach((e, i) => { const k = (t * 0.7 + i / 7) % 1; e.position.set(Math.sin(k * 7 + i * 2.3) * 0.14, 0.45 + k * 0.6, Math.cos(k * 5 + i) * 0.06); e.scale.setScalar(Math.max(0.05, 1 - k)); });
    } };
  },
  camera: (c) => {
    const g = new THREE.Group(); const col = c ?? "#26262e";
    rbx(g, 0.15, 0.1, 0.08, 0.015, col, 0, 0.05, 0); bx(g, 0.05, 0.03, 0.05, col, -0.03, 0.115, 0.0); bx(g, 0.04, 0.012, 0.02, "#dde", 0.04, 0.106, 0, [0, 0, 0]);
    cy(g, 0.048, 0.05, 0.05, "#14141a", 0, 0.055, 0.065, [PI / 2, 0, 0], 24); cy(g, 0.036, 0.036, 0.03, "#2a2a32", 0, 0.055, 0.1, [PI / 2, 0, 0], 20);
    sp(g, 0.034, toonMat("#3a6bd8", { emissive: "#3a6bd8", emissiveIntensity: 1.0 }), 0, 0.055, 0.112, [1, 1, 0.5], 16); sp(g, 0.012, "#ffffff", -0.012, 0.067, 0.12, [1, 1, 0.4], 6);
    cy(g, 0.012, 0.012, 0.012, "#e5262f", 0.055, 0.108, 0.0, undefined, 8); bx(g, 0.03, 0.03, 0.005, glowMat("#fff6c0", 1.5), -0.05, 0.08, 0.042);
    bx(g, 0.026, 0.07, 0.06, "#14141a", 0.07, 0.05, 0.0).visible = false;
    return { g };
  },
};

function arrow(col: string, dir: 1 | -1): Built {
  const g = new THREE.Group();
  const m = ext(g, [[0, 0.5], [0.52, -0.05], [0.2, -0.05], [0.2, -0.5], [-0.2, -0.5], [-0.2, -0.05], [-0.52, -0.05]], 0.2, toonMat(col, { emissive: col, emissiveIntensity: 0.7 }), 0, 0.55, 0, [0, 0, dir > 0 ? 0 : PI], 0.05);
  const gl = new THREE.Group(); g.add(gl); void gl;
  return { g, tick: (t) => { const k = 1 + 0.06 * Math.sin(t * 5); m.scale.set(k, k, 1); m.position.y = 0.55 + dir * Math.sin(t * 3) * 0.04; } };
}

// rough sizes help pick outline widths before the object exists
const OLW = (n: ThingName): number => {
  const big: Partial<Record<ThingName, number>> = { house: 0.14, factory: 0.3, stadium: 0.9, plane: 0.25, yacht: 0.18, bus: 0.07, truck: 0.07, car: 0.04, sportscar: 0.04, rocket: 0.04, hoop: 0.03, shovel: 0.012, pickaxe: 0.012, tv: 0.012, satellite: 0.02, robot: 0.018, arrowup: 0.025, arrowdown: 0.025, chart: 0.012, fire: 0.01, pizza: 0.006, drone: 0.006, crate: 0.012, box: 0.01, dome: 0.03, chatbot: 0.006 };
  return big[n] ?? 0.0035;
};

/** a clean white sign card with the word, for things that exist nowhere (code-built or model library) */
const wordSign = (word: string): Thing => {
  const g = new THREE.Group(), W = 1100, H = 700, w = 0.9, h = (w * H) / W;
  const tex = drawCard({ text: word.toUpperCase().slice(0, 18), kind: "white", fg: "#1b1b24" }, W, H);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  m.position.y = h / 2; g.add(m);
  const root = new THREE.Group(); root.add(g);
  return { root, size: w };  // size = width, so `fit` is the sign's width
};

export const isCodeThing = (name: string) => Object.prototype.hasOwnProperty.call(B, name);

/** code-built things win; then the CC0 model library (models.ts, must be preloaded); else a word sign. size = height
 *  for code-built things, longest side for library models */
export const makeThing = (name: string, opts: { color?: string; text?: string } = {}): Thing => {
  if (!isCodeThing(name)) {
    if (hasModel(name)) {
      const m = makeModelGroup(name);
      if (m) { const root = new THREE.Group(); root.add(m); return { root, size: MODEL_SIZE }; }
    }
    return wordSign(name.replace(/[_-]+/g, " "));
  }
  OW = OLW(name as ThingName);
  const b = B[name as ThingName](opts.color, opts.text);
  const root = new THREE.Group(); root.add(b.g);
  const box = new THREE.Box3(); const tmp = new THREE.Box3();
  b.g.updateMatrixWorld(true);
  b.g.traverse((o) => {
    const me = o as THREE.Mesh; if (!me.isMesh || (me.parent as THREE.Mesh)?.isMesh) return;
    let p: THREE.Object3D | null = me; let skip = false; while (p) { if (p.userData.skip) skip = true; p = p.parent; }
    if (skip || !me.visible) return;
    me.geometry.computeBoundingBox(); tmp.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld); box.union(tmp);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0));
  b.g.position.y -= box.min.y;
  return { root, size: Math.max(0.01, box.max.y - box.min.y), tick: b.tick };
};
