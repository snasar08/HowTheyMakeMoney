// Afterhour look: dense cel-shaded sets (see SPEC.md). Everything built in code, deterministic.
import * as THREE from "three";
import { toonMat, paintMat, glowMat, metalMat, outline, canvasTex, seeded, box } from "./common";

export type SetName = "throne" | "office" | "diner" | "lab" | "stall" | "field" | "ring" | "track" | "graveyard" | "boardroom" | "street" | "beach"
  | "court" | "pitch" | "diamond" | "gridiron" | "tennis" | "golf" | "pool" | "gym" | "studio" | "farm" | "store" | "stage" | "space" | "garage" | "classroom" | "bathroom" | "mansion" | "showroom" | "factory" | "mountain" | "rink";
export type SetObj = { root: THREE.Group; lights: THREE.Light[]; fog?: THREE.Fog; bg: string; spots: Record<string, [number, number, number]> };

type V3 = [number, number, number];
type V2 = [number, number];
type V4 = [number, number, number, number];
const T = paintMat;
const PI = Math.PI;
void metalMat; void box;

// ---------- primitives ----------
const put = (p: THREE.Object3D, m: THREE.Mesh, x: number, y: number, z: number, ol = 0) => {
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (ol) outline(m, ol);
  p.add(m); return m;
};
const bx = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ol = 0) =>
  put(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, ol);
const cy = (p: THREE.Object3D, rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ol = 0, seg = 20) =>
  put(p, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, ol);
const sp = (p: THREE.Object3D, r: number, mat: THREE.Material, x: number, y: number, z: number, ol = 0, seg = 18) =>
  put(p, new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat), x, y, z, ol);
const cone = (p: THREE.Object3D, r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ol = 0, seg = 16) =>
  put(p, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat), x, y, z, ol);
const glow = (p: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, k = 2.2) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMat(color, k)); m.position.set(x, y, z); p.add(m); return m;
};
const glowSp = (p: THREE.Object3D, r: number, color: string, x: number, y: number, z: number, k = 2.4) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), glowMat(color, k)); m.position.set(x, y, z); p.add(m); return m;
};
const ring = (p: THREE.Object3D, r: number, tube: number, color: string, x: number, y: number, z: number, rx = 0, ry = 0, k = 2.4) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 28), glowMat(color, k)); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); p.add(m); return m;
};
const plane = (p: THREE.Object3D, w: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -PI / 2; m.position.set(x, y, z); m.receiveShadow = true; p.add(m); return m;
};
const vplane = (p: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; p.add(m); return m;
};
const basic = (map: THREE.Texture, k = 1, fog = true) => {
  const m = new THREE.MeshBasicMaterial({ map, fog }); if (k !== 1) m.color.setScalar(k); return m;
};

type It = { x: number; y: number; z: number; s?: number | V3; rx?: number; ry?: number; rz?: number; c?: string };
const inst = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, items: It[], cast = true) => {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  m.count = items.length;
  const o = new THREE.Object3D(); const col = new THREE.Color(); const any = items.some((i) => i.c);
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    const s = it.s ?? 1; if (Array.isArray(s)) o.scale.set(s[0], s[1], s[2]); else o.scale.setScalar(s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    if (any) m.setColorAt(i, col.set(it.c ?? "#ffffff"));
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; p.add(m); return m;
};

// ---------- textures ----------
const rep = (t: THREE.Texture, x: number, y: number) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(x, y); return t; };
const tileTex = (a: string, b: string, grout: string, cells: number, rx: number, ry: number, px = 256) =>
  rep(canvasTex(px, px, (g) => {
    const s = px / cells;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = grout; g.lineWidth = 3;
    for (let i = 0; i <= cells; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, px); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(px, i * s); g.stroke(); }
  }), rx, ry);
const noiseTex = (base: string, cols: string[], n: number, seed: number, rx: number, ry: number, size = 4, px = 256) =>
  rep(canvasTex(px, px, (g) => {
    const r = seeded(seed); g.fillStyle = base; g.fillRect(0, 0, px, px);
    g.globalAlpha = 0.55;
    for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = size * (0.8 + r() * 2.2); g.beginPath(); g.ellipse(r() * px, r() * px, s, s * (0.5 + r() * 0.5), r() * 3, 0, PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }), rx, ry);
const woodTex = (a: string, b: string, rx: number, ry: number, planks = 6) =>
  rep(canvasTex(256, 256, (g) => {
    const r = seeded(11); const h = 256 / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = i % 2 ? a : b; g.fillRect(0, i * h, 256, h);
      g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) { const y = i * h + r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (r() - 0.5) * 6); g.stroke(); }
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, i * h); g.lineTo(256, i * h); g.stroke();
    }
  }), rx, ry);
const gradTex = (stops: Array<[number, string]>, w = 8, h = 256, extra?: (g: CanvasRenderingContext2D) => void) =>
  canvasTex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([p, c]) => gr.addColorStop(p, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h); if (extra) extra(g);
  });
const screenTex = (seed: number, hue = "#37f58a") =>
  canvasTex(256, 160, (g) => {
    const r = seeded(seed); g.fillStyle = "#0b1a26"; g.fillRect(0, 0, 256, 160);
    g.fillStyle = hue; g.fillRect(0, 0, 256, 18);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#2fb6ff" : "#ffd23a"; g.fillRect(10, 28 + i * 14, 20 + r() * 90, 8); g.fillStyle = "#cfe9ff"; g.fillRect(140, 28 + i * 14, 20 + r() * 80, 8); }
    g.strokeStyle = hue; g.lineWidth = 4; g.beginPath(); g.moveTo(10, 150);
    let y = 140; for (let x = 10; x < 250; x += 20) { y = Math.max(95, Math.min(150, y - 8 + r() * 14)); g.lineTo(x, y); } g.stroke();
  });
const winTex = (wall: string, cols: number, rows: number, seed: number, lit = ["#ffd36b", "#ffe9a8", "#7fe3ff", "#ff9bd0"], px = 128, py = 256) =>
  canvasTex(px, py, (g) => {
    const r = seeded(seed); g.fillStyle = wall; g.fillRect(0, 0, px, py);
    const cw = px / cols, ch = py / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillStyle = r() < 0.6 ? lit[Math.floor(r() * lit.length)] : "#1b1730";
      g.fillRect(i * cw + cw * 0.18, j * ch + ch * 0.2, cw * 0.64, ch * 0.6);
    }
  });
const skylineTex = (sky: Array<[number, string]>, seed: number, bcol = "#140f2a", w = 1024, h = 512) =>
  canvasTex(w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h); sky.forEach(([p, c]) => gr.addColorStop(p, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = seeded(seed);
    for (let x = 0; x < w;) {
      const bw = 40 + r() * 70, bh = 120 + r() * 240; g.fillStyle = bcol; g.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 10; yy < h - 10; yy += 16) for (let xx = x + 6; xx < x + bw - 8; xx += 12) if (r() < 0.45) { g.fillStyle = r() < 0.8 ? "#ffd86b" : "#7fe6ff"; g.fillRect(xx, yy, 6, 8); }
      x += bw + 2;
    }
  });
const noteTex = () => canvasTex(256, 256, (g) => {
  g.fillStyle = "#c58a4a"; g.fillRect(0, 0, 256, 256);
  const r = seeded(5); const cs = ["#fff176", "#ff8a80", "#80d8ff", "#b9f6ca", "#ffffff", "#ffd180"];
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 62 + 8 + r() * 6, y = Math.floor(i / 4) * 62 + 8 + r() * 6;
    g.save(); g.translate(x + 25, y + 25); g.rotate((r() - 0.5) * 0.3); g.fillStyle = cs[i % cs.length]; g.fillRect(-25, -25, 50, 50);
    g.fillStyle = "#c62828"; g.fillRect(-3, -23, 6, 6);
    g.fillStyle = "rgba(0,0,0,0.5)"; for (let l = 0; l < 4; l++) g.fillRect(-18, -8 + l * 9, 24 + r() * 14, 3); g.restore();
  }
});
const posterTex = (a: string, b: string, seed: number) => canvasTex(128, 192, (g) => {
  const r = seeded(seed); g.fillStyle = a; g.fillRect(0, 0, 128, 192); g.fillStyle = b;
  g.beginPath(); g.arc(64, 70, 36, 0, PI * 2); g.fill(); g.fillStyle = "#fff"; g.fillRect(14, 130, 100, 10); g.fillRect(14, 150, 60 + r() * 30, 8);
  g.strokeStyle = "#000"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 186);
});


// ---------- extra helpers (arches, light beams, sign panels) ----------
const archGeo = (w: number, h: number) => {
  const s = new THREE.Shape(); const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(-r, h - r); s.absarc(0, h - r, r, PI, 0, true); s.lineTo(r, 0); s.closePath();
  return new THREE.ShapeGeometry(s, 16);
};
const arch = (p: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const m = new THREE.Mesh(archGeo(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; p.add(m); return m;
};
const beam = (p: THREE.Object3D, color: string, from: V3, to: V3, r: number, op = 0.16) => {
  const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]); const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, r, len, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().multiplyScalar(-1).normalize());
  p.add(m); return m;
};
/** blank dark sign board with a glowing frame; front face at z + 0.07 */
const panel = (p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, glowC: string, ry = 0, fill = "#0a0810") => {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  bx(g, w, h, 0.14, T(fill), 0, 0, 0, 0.03);
  glow(g, w + 0.1, 0.07, 0.12, glowC, 0, h / 2, 0.02); glow(g, w + 0.1, 0.07, 0.12, glowC, 0, -h / 2, 0.02);
  glow(g, 0.07, h + 0.1, 0.12, glowC, -w / 2, 0, 0.02); glow(g, 0.07, h + 0.1, 0.12, glowC, w / 2, 0, 0.02);
  return g;
};
const shadowBlob = (p: THREE.Object3D, x: number, z: number, rx: number, rz: number, op = 0.45, y = 0.015) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -PI / 2; m.scale.set(rx, rz, 1); m.position.set(x, y, z); p.add(m); return m;
};

// ---------- lights ----------
type PtL = [string, number, V3, number?];
const mkLights = (hemi: [string, string, number], key: [string, number, V3], pts: PtL[] = [], ext = 9, keyTarget: V3 = [0, 0, 0]) => {
  const L: THREE.Light[] = [];
  L.push(new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2] * 0.85));
  const d = new THREE.DirectionalLight(key[0], key[1] * 0.8); d.position.set(...key[2]); d.target.position.set(...keyTarget); d.target.updateMatrixWorld();
  d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
  const c = d.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 1; c.far = 60;
  d.shadow.bias = -0.0006; d.shadow.normalBias = 0.03; d.shadow.radius = 4;
  L.push(d);
  pts.forEach(([col, i, pos, dist]) => { const l = new THREE.PointLight(col, i * 0.35, dist ?? 14, 2); l.position.set(...pos); L.push(l); });
  return L;
};

// ---------- shared builders ----------
const GOLD = () => T("#e6a418", { emissive: "#6a3a00", emissiveIntensity: 0.4 });
const heap = (p: THREE.Object3D, cx: number, cz: number, rad: number, hgt: number, n: number, seed: number) => {
  const r = seeded(seed); const items: It[] = []; const cols = ["#e8a812", "#f5c02a", "#d68f08", "#f7cf50"];
  for (let i = 0; i < n; i++) {
    const a = r() * PI * 2, d = Math.sqrt(r()) * rad; const y = hgt * Math.pow(1 - d / rad, 1.3) + 0.03;
    items.push({ x: cx + Math.cos(a) * d, y, z: cz + Math.sin(a) * d, rx: (r() - 0.5) * 1.6, rz: (r() - 0.5) * 1.6, ry: r() * 3, s: 0.9 + r() * 0.5, c: cols[i % 4] });
  }
  return inst(p, new THREE.CylinderGeometry(0.15, 0.15, 0.045, 10), GOLD(), items);
};
const stars = (p: THREE.Object3D, n: number, seed: number, w: number, y0: number, y1: number, z: number, col = "#fff6d0") => {
  const r = seeded(seed); const items: It[] = [];
  for (let i = 0; i < n; i++) items.push({ x: (r() - 0.5) * w, y: y0 + r() * (y1 - y0), z, s: 0.5 + r() * 1.2 });
  inst(p, new THREE.BoxGeometry(0.09, 0.09, 0.02), glowMat(col, 2), items, false);
};
const plant = (p: THREE.Object3D, x: number, z: number, s = 1, pot = "#d9663a") => {
  cy(p, 0.28 * s, 0.2 * s, 0.4 * s, T(pot), x, 0.2 * s, z, 0.02);
  const lc = ["#2fae4f", "#3ecb62", "#1f8c3d"];
  for (let i = 0; i < 6; i++) { const a = i * 1.05; sp(p, 0.26 * s, T(lc[i % 3]), x + Math.cos(a) * 0.2 * s, (0.7 + (i % 3) * 0.2) * s, z + Math.sin(a) * 0.2 * s); }
};
const crowd = (p: THREE.Object3D, x: number, y: number, z: number, ry: number, perRow: number, rows: number, seed: number, spacing = 0.55, step = 0.45, depth = 0.7, palette?: string[], arms = false) => {
  const r = seeded(seed); const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  const cols = palette ?? ["#ff4d6d", "#ffd23a", "#3ad1ff", "#7cff6b", "#ff8a3a", "#c77dff", "#ffffff", "#2a2a3a"];
  const skin = ["#f5d2b0", "#e0a97c", "#a8704a", "#7a4a2f", "#f7f7f7"];
  const heads: It[] = [], bodies: It[] = [], steps: It[] = [], armIt: It[] = [];
  for (let j = 0; j < rows; j++) {
    steps.push({ x: 0, y: j * step - 0.1, z: -j * depth, s: [perRow * spacing + 0.5, step * 2, depth] });
    for (let i = 0; i < perRow; i++) {
      if (r() < 0.06) continue;
      const px = (i - perRow / 2) * spacing + (r() - 0.5) * 0.15, py = j * step + 0.1, pz = -j * depth + (r() - 0.5) * 0.1;
      const c = cols[Math.floor(r() * cols.length)];
      bodies.push({ x: px, y: py + 0.28, z: pz, s: [1, 1 + r() * 0.2, 1], c });
      heads.push({ x: px, y: py + 0.72, z: pz, s: 0.9 + r() * 0.25, c: r() < 0.5 ? "#f7f7f7" : skin[Math.floor(r() * skin.length)] });
      if (arms && r() < 0.45) armIt.push({ x: px + (r() < 0.5 ? -0.24 : 0.24), y: py + 0.85, z: pz, rz: (r() - 0.5) * 0.5, s: [1, 1.1, 1], c });
    }
  }
  if (armIt.length) inst(g, new THREE.CapsuleGeometry(0.06, 0.5, 3, 6), T("#ffffff"), armIt, false);
  inst(g, new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), T("#ffffff"), bodies, false);
  inst(g, new THREE.SphereGeometry(0.2, 10, 8), T("#ffffff"), heads, false);
  inst(g, new THREE.BoxGeometry(1, 0.5, 1), T("#3a3050"), steps.map((s) => ({ ...s, s: [(s.s as V3)[0], 0.5, (s.s as V3)[2]] as V3 })), false);
};
const lampPost = (p: THREE.Object3D, x: number, z: number, color = "#ffcf6b", h = 3.6) => {
  cy(p, 0.06, 0.09, h, T("#2a2a35"), x, h / 2, z, 0.015);
  bx(p, 0.5, 0.08, 0.2, T("#2a2a35"), x, h + 0.02, z);
  glow(p, 0.42, 0.1, 0.16, color, x, h - 0.05, z, 2.6);
};
const deskSet = (p: THREE.Object3D, x: number, z: number, ry: number, tex: THREE.Texture, chair = "#e9494f") => {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; p.add(g);
  const wood = T("#c98a4b");
  bx(g, 1.6, 0.08, 0.8, wood, 0, 0.76, 0, 0.015);
  bx(g, 0.08, 0.72, 0.7, T("#8a5a30"), -0.72, 0.36, 0); bx(g, 0.08, 0.72, 0.7, T("#8a5a30"), 0.72, 0.36, 0);
  bx(g, 0.6, 0.45, 0.1, T("#222834"), 0, 1.05, -0.2, 0.015);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.38), basic(tex, 1.25, false)); sc.position.set(0, 1.05, -0.145); g.add(sc);
  bx(g, 0.1, 0.2, 0.08, T("#222834"), 0, 0.9, -0.2);
  bx(g, 0.5, 0.03, 0.18, T("#2c3340"), 0, 0.81, 0.15);
  cy(g, 0.06, 0.06, 0.1, T("#ffffff"), 0.55, 0.85, 0.1); bx(g, 0.3, 0.03, 0.22, T("#fafafa"), -0.55, 0.82, 0.05);
  // chair
  cy(g, 0.3, 0.3, 0.04, T("#2b2b33"), 0, 0.08, 0.85); cy(g, 0.04, 0.04, 0.4, T("#555"), 0, 0.28, 0.85);
  bx(g, 0.55, 0.1, 0.55, T(chair), 0, 0.5, 0.85, 0.015); bx(g, 0.55, 0.65, 0.1, T(chair), 0, 0.88, 1.12, 0.015);
  return g;
};
const gpu = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, fans = 2, accent = "#3dff7a", strips = 3, col = "#2e2846") => {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  bx(g, w, h, d, T(col), 0, 0, 0, 0.03);
  for (let k = 0; k < strips; k++) glow(g, w * 0.82, 0.03, 0.02, accent, 0, h * (0.36 - k * 0.1), d / 2 + 0.01, 1.9);
  for (let f = 0; f < fans; f++) {
    const fx = fans === 1 ? 0 : (f - (fans - 1) / 2) * (w / fans) * 0.9;
    const disc = cy(g, h * 0.3, h * 0.3, 0.05, T("#3f3858"), fx, -h * 0.08, d / 2 + 0.02, 0.01, 18); disc.rotation.x = PI / 2;
    ring(g, h * 0.3, 0.015, accent, fx, -h * 0.08, d / 2 + 0.05, 0, 0, 1.7);
    for (let b = 0; b < 4; b++) { const bl = bx(g, 0.04, h * 0.5, 0.01, T("#3a3550"), fx, -h * 0.08, d / 2 + 0.06); bl.rotation.z = b * PI / 4; }
  }
  return g;
};
const tree = (p: THREE.Object3D, x: number, z: number, s: number, seed: number, col = "#2b1a33") => {
  const r = seeded(seed); const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); p.add(g);
  const m = T(col); cy(g, 0.12, 0.3, 2.6, m, 0, 1.3, 0, 0.03, 8);
  const limb = (par: THREE.Object3D, y: number, len: number, rad: number, depth: number) => {
    const py = new THREE.Group(); py.position.y = y; py.rotation.y = r() * PI * 2; par.add(py);
    const pz = new THREE.Group(); pz.rotation.z = 0.5 + r() * 0.7; py.add(pz);
    cy(pz, rad * 0.6, rad, len, m, 0, len / 2, 0, 0.015, 6);
    if (depth > 0) { limb(pz, len, len * 0.7, rad * 0.6, depth - 1); limb(pz, len * 0.6, len * 0.6, rad * 0.5, depth - 1); }
  };
  for (let i = 0; i < 4; i++) limb(g, 1.5 + r() * 1.0, 1.3 + r() * 0.5, 0.1, 2);
};
const wall = (p: THREE.Object3D, w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const m = bx(p, w, h, 0.3, mat, 0, 0, 0); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = false; return m;
};

// ================= THRONE =================
function throne(): SetObj {
  const g = new THREE.Group(); const lime = "#3dff7a";
  const dark = T("#1a1626"), gold = GOLD();
  // floor: warm purple tiles, red carpet, gold edge
  plane(g, 44, 44, T("#ffffff", { map: tileTex("#5a3a92", "#4e3084", "#33205c", 4, 7, 9) }), 0, 0, -6);
  for (const z of [4, -1.2]) glow(g, 9, 0.02, 0.05, "#a070ff", 0, 0.013, z + 3, 1.2);
  plane(g, 3.1, 11.4, T("#ffc21f", { emissive: "#7a4a00", emissiveIntensity: 0.4 }), 0, 0.012, 6.0);
  plane(g, 2.7, 11.4, T("#b3122a"), 0, 0.02, 6.0);
  // hall: warm purple walls with panels, gold trim
  const wt = canvasTex(256, 512, (c) => {
    c.fillStyle = "#7447ad"; c.fillRect(0, 0, 256, 512); c.fillStyle = "#8556c2";
    for (let i = 0; i < 2; i++) c.fillRect(14 + i * 128, 40, 100, 400);
    c.strokeStyle = "#f0b830"; c.lineWidth = 5; for (let i = 0; i < 2; i++) c.strokeRect(14 + i * 128, 40, 100, 400);
    c.fillStyle = "#4a2a78"; c.fillRect(0, 470, 256, 42); c.fillStyle = "#f0b830"; c.fillRect(0, 466, 256, 5);
  });
  const bw = bx(g, 40, 18, 0.5, T("#ffffff", { map: rep(wt, 7, 1) }), 0, 9, -10.5); bw.castShadow = false;
  for (const sx of [-1, 1]) { bx(g, 0.5, 18, 26, T("#6a3fa2"), sx * 10, 9, -2).castShadow = false; }
  // arched bays on the back wall (warm light behind) and pillars
  const archMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff9d6a").multiplyScalar(0.8) });
  for (const x of [-3.6, 3.6, -6.4, 6.4]) {
    arch(g, 2.4, 6.4, T("#f0b830", { emissive: "#7a4a00", emissiveIntensity: 0.3 }), x, 0.0, -10.22);
    arch(g, 2.0, 6.0, archMat, x, 0.0, -10.2);
    for (let k = 0; k < 3; k++) glow(g, 0.05, 5.2 - (k === 1 ? 0 : 1.0), 0.04, "#ffd9a0", x + (k - 1) * 0.55, 3.0, -10.18, 0.9);
  }
  for (const [x, z] of [[-4.6, -5.5], [4.6, -5.5], [-4.2, -9.0], [4.2, -9.0], [-4.0, 1.5], [4.0, 1.5]] as V2[]) {
    cy(g, 0.42, 0.5, 8.6, T("#6a3fa2"), x, 4.3, z, 0.03, 12);
    bx(g, 1.2, 0.3, 1.2, T("#3e2468"), x, 0.15, z, 0.02); bx(g, 1.15, 0.4, 1.15, gold, x, 8.7, z, 0.02);
    ring(g, 0.5, 0.04, "#ffc21f", x, 1.2, z, PI / 2, 0, 1.6); glowSp(g, 0.13, lime, x, 9.1, z, 2);
  }
  // rose window glow behind the orb
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color("#b87aff").multiplyScalar(0.9) })); disc.position.set(0, 5.4, -10.2); g.add(disc);
  ring(g, 3.0, 0.08, "#ffc21f", 0, 5.4, -10.15, 0, 0, 1.4); ring(g, 2.0, 0.04, "#ffc21f", 0, 5.4, -10.15, 0, 0, 1.2);
  // NVIDIA-style banner board high on the back wall
  bx(g, 5.6, 1.6, 0.18, T("#08060c"), 0, 7.4, -10.1, 0.04);
  glow(g, 5.8, 0.06, 0.1, lime, 0, 8.25, -10.0); glow(g, 5.8, 0.06, 0.1, lime, 0, 6.55, -10.0);
  glow(g, 0.06, 1.7, 0.1, lime, -2.9, 7.4, -10.0); glow(g, 0.06, 1.7, 0.1, lime, 2.9, 7.4, -10.0);
  // platform with a step
  bx(g, 7.2, 0.15, 5.0, T("#2f1c58"), 0, 0.075, -2.0, 0.03); bx(g, 5.0, 0.15, 3.6, T("#432a76"), 0, 0.225, -2.4, 0.03);
  glow(g, 7.2, 0.03, 0.03, lime, 0, 0.12, 0.52, 1.8); glow(g, 5.0, 0.03, 0.03, "#ffc21f", 0, 0.28, -0.58, 1.6);
  plane(g, 2.0, 1.0, T("#b3122a"), 0, 0.153, 0.0); plane(g, 2.0, 0.9, T("#b3122a"), 0, 0.303, -1.0);
  // the throne: chunky black GPU blocks, seat + armrests
  gpu(g, 1.9, 0.45, 1.4, 0, 0.525, -1.5, 2, "#3dff7a", 1);                                  // seat base
  bx(g, 1.5, 0.2, 1.2, T("#8a1020"), 0, 0.75, -1.5, 0.02);                    // cushion, top = 0.85 = spots.seat y
  bx(g, 1.4, 0.06, 1.05, T("#b3122a"), 0, 0.87, -1.5);
  for (const sx of [-1, 1]) {
    gpu(g, 0.55, 0.9, 1.5, sx * 1.25, 0.75, -1.6, 1, "#3dff7a", 1);                           // armrest block, top 1.2
    bx(g, 0.64, 0.1, 1.6, T("#3a3354"), sx * 1.25, 1.22, -1.6, 0.025);          // bevel cap
  }
  gpu(g, 2.3, 2.5, 0.9, 0, 2.0, -2.4, 1, "#3dff7a", 1);                                       // backrest, big fan ring behind the head
  bx(g, 2.5, 0.14, 1.0, T("#3a3354"), 0, 3.32, -2.4, 0.03);
  for (const sx of [-1, 1]) {
    gpu(g, 0.7, 3.3, 0.9, sx * 1.6, 2.4, -2.5, 1, "#58ff9a", 1);
    bx(g, 0.8, 0.12, 1.0, T("#3a3354"), sx * 1.6, 4.08, -2.5, 0.025);
  }
  gpu(g, 2.3, 0.8, 0.9, 0, 3.75, -2.55, 2, "#3dff7a", 1); gpu(g, 1.5, 0.7, 0.9, 0, 4.5, -2.6, 2, "#58ff9a", 1);
  // orb
  const orb = sp(g, 0.52, T("#ffc21f", { emissive: "#ffb300", emissiveIntensity: 1.6 }), 0, 5.3, -2.65, 0.03); orb.castShadow = false;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 14), new THREE.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.22, depthWrite: false }));
  halo.position.set(0, 5.3, -2.65); g.add(halo);
  ring(g, 0.8, 0.035, lime, 0, 5.3, -2.65, PI / 2.4, 0.3);
  // gold heaps and coins around the platform
  heap(g, -4.0, -0.6, 1.3, 0.95, 260, 3); heap(g, 4.1, -0.4, 1.3, 1.0, 270, 4); heap(g, -4.2, -3.6, 1.2, 0.9, 200, 5); heap(g, 4.3, -3.7, 1.2, 0.9, 200, 6);
  heap(g, 2.4, 1.9, 1.0, 0.75, 140, 8); heap(g, -2.5, 2.2, 1.1, 0.8, 150, 9); heap(g, 3.8, 6.0, 1.1, 0.5, 100, 10); heap(g, -3.6, 7.0, 1.1, 0.5, 100, 11);
  const rc = seeded(21); const coins: It[] = [];
  for (let i = 0; i < 90; i++) coins.push({ x: (rc() - 0.5) * 9, y: 0.025, z: 7 - rc() * 12, rx: (rc() - 0.5) * 0.4, ry: rc() * 3, c: "#eeb21c" });
  inst(g, new THREE.CylinderGeometry(0.15, 0.15, 0.045, 10), GOLD(), coins);
  for (const [x, z] of [[-3.3, 1.2], [3.4, 1.0]] as V2[]) for (let k = 0; k < 6; k++) bx(g, 0.5, 0.2, 0.25, gold, x + (k % 3) * 0.52 - 0.5, 0.1 + Math.floor(k / 3) * 0.2, z, 0.015);
  // a few floating bits and hanging banners
  const rb = seeded(33); const bits: It[] = [];
  for (let i = 0; i < 24; i++) bits.push({ x: (rb() - 0.5) * 10, y: 1 + rb() * 6, z: -2 - rb() * 7, rx: rb() * 3, ry: rb() * 3, s: 0.5 + rb() });
  inst(g, new THREE.BoxGeometry(0.1, 0.1, 0.1), glowMat(lime, 1.8), bits, false);
  for (const sx of [-1, 1]) { bx(g, 1.0, 3.4, 0.06, T("#5a0f7a"), sx * 3.1, 5.4, -9.9, 0.02); glow(g, 0.7, 0.7, 0.03, "#ffc21f", sx * 3.1, 6.2, -9.85, 1.2); }
  const lights = mkLights(["#c4a8ff", "#4a2a78", 1.15], ["#ffe6c8", 2.2, [4, 11, 8]], [
    [lime, 16, [0, 3.4, -1.0], 10], ["#ffbf30", 45, [0, 5.4, -2.0], 14], ["#b04dff", 50, [-3, 3, 3], 14], ["#ff9d6a", 40, [3.5, 2.5, 4], 12],
  ], 11);
  return { root: g, lights, fog: new THREE.Fog("#3a2166", 18, 52), bg: "#2a1550", spots: { seat: [0, 0.85, -1.5], floor: [0, 0, 0], banner: [0, 7.4, -9.95], orb: [0, 5.3, -2.65], coins: [-2.6, 0.9, 0.4] } };
}

// ================= OFFICE =================
function office(): SetObj {
  const g = new THREE.Group();
  plane(g, 24, 30, T("#ffffff", { map: tileTex("#aeb7c2", "#9aa4b1", "#6e7885", 4, 8, 10) }), 0, 0, -6);
  plane(g, 5, 14, T("#2a6f8f"), 0, 0.012, -2);
  const teal = T("#1fa3a0");
  // back window wall with city
  const sky = skylineTex([[0, "#ff9966"], [0.5, "#ffcf8a"], [1, "#fff0c0"]], 4, "#40506e");
  vplane(g, 12, 6, basic(sky, 1.1, false), 0, 3.0, -9.8);
  bx(g, 14, 1.1, 0.3, teal, 0, 0.55, -8.6, 0.02);
  bx(g, 14, 1.2, 0.3, teal, 0, 6.2, -8.6);
  for (let i = -3; i <= 3; i++) bx(g, 0.18, 6.2, 0.2, T("#2a3441"), i * 2.0, 3.1, -8.55, 0.015);
  bx(g, 14, 0.15, 0.2, T("#2a3441"), 0, 2.4, -8.55); bx(g, 14, 0.15, 0.2, T("#2a3441"), 0, 4.6, -8.55);
  // side walls
  for (const sx of [-1, 1]) { bx(g, 0.3, 7, 20, teal, sx * 5.5, 3.5, -4).castShadow = false; glow(g, 0.05, 0.12, 20, "#fff2b0", sx * 5.3, 3.1, -4, 1.2); }
  // ceiling & panels
  bx(g, 14, 0.2, 24, T("#e6ecef"), 0, 5.2, -4).castShadow = false;
  for (let z = 4; z > -9; z -= 2.8) for (const x of [-2.6, 2.6]) glow(g, 1.8, 0.05, 0.9, "#fffbe0", x, 5.08, z, 1.8);
  // clock, cork board, posters, whiteboard
  const clk = cy(g, 0.55, 0.55, 0.08, T("#fff"), 3.0, 4.6, -8.35, 0.03); clk.rotation.x = PI / 2;
  bx(g, 0.05, 0.4, 0.04, T("#111"), 3.0, 4.72, -8.3); bx(g, 0.3, 0.05, 0.04, T("#111"), 3.12, 4.6, -8.3);
  const cork = bx(g, 2.6, 1.8, 0.1, T("#ffffff", { map: noteTex() }), -5.3, 2.4, -3, 0.03); cork.rotation.y = PI / 2; void cork;
  const wb = bx(g, 2.6, 1.6, 0.1, T("#f4f8fb"), 5.3, 2.5, -3.5, 0.03); wb.rotation.y = -PI / 2;
  for (let i = 0; i < 4; i++) glow(wb, 1.6 - i * 0.2, 0.05, 0.02, ["#e53935", "#1e88e5", "#43a047", "#fb8c00"][i], 0, 0.4 - i * 0.22, 0.06, 1);
  for (let i = 0; i < 3; i++) { const p = vplane(g, 0.8, 1.2, basic(posterTex(["#ff6f61", "#6bc5ff", "#ffd54a"][i], "#fff", 40 + i), 1, true), -5.3, 2.6, -6 - i * 1.4, PI / 2); void p; }
  // desks rows
  const texs = [screenTex(1, "#37f58a"), screenTex(2, "#ff6bd6"), screenTex(3, "#4dd2ff"), screenTex(4, "#ffd23a")];
  let ti = 0;
  for (const z of [-4.2, -6.8]) for (const x of [-3.4, -1.1, 1.1, 3.4]) deskSet(g, x, z, 0, texs[ti++ % 4], ["#e9494f", "#3a6fe0", "#f2b705", "#7a5cff"][ti % 4]);
  for (const x of [-3.2, 3.2]) deskSet(g, x, -1.4, PI, texs[ti++ % 4], "#3a6fe0");
  // boss desk (behind hero)
  bx(g, 3.0, 0.12, 1.2, T("#7a4a28"), 0, 0.82, -1.6, 0.02); bx(g, 2.8, 0.76, 1.0, T("#8a5a30"), 0, 0.38, -1.6, 0.02);
  for (const sx of [-0.6, 0.6]) { bx(g, 0.9, 0.55, 0.08, T("#171b24"), sx, 1.4, -1.9, 0.02); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.47), basic(texs[sx < 0 ? 0 : 2], 1.3, false)); sc.position.set(sx, 1.4, -1.85); g.add(sc); bx(g, 0.12, 0.5, 0.1, T("#171b24"), sx, 1.0, -1.9); }
  bx(g, 0.9, 0.03, 0.3, T("#2c3340"), 0, 0.9, -1.35); cy(g, 0.1, 0.08, 0.16, T("#fff"), 1.2, 0.96, -1.5); bx(g, 0.4, 0.03, 0.3, T("#fff"), -1.1, 0.89, -1.4);
  for (let i = 0; i < 4; i++) bx(g, 0.5, 0.05, 0.4, T("#fff"), 1.0, 0.9 + i * 0.05, -1.8).rotation.y = i * 0.3;
  // chair at origin
  cy(g, 0.35, 0.35, 0.05, T("#2b2b33"), 0, 0.08, -0.35); cy(g, 0.05, 0.05, 0.4, T("#555"), 0, 0.3, -0.35);
  bx(g, 0.7, 0.12, 0.7, T("#c62828"), 0, 0.5, -0.35, 0.02); bx(g, 0.7, 0.9, 0.12, T("#c62828"), 0, 1.0, -0.75, 0.02);
  // cabinets
  for (let i = 0; i < 5; i++) { bx(g, 0.7, 1.4, 0.55, T(i % 2 ? "#8a97a6" : "#a4b0bd"), -4.9, 0.7, -1.2 - i * 0.75, 0.02).rotation.y = 0; for (let k = 0; k < 3; k++) glow(g, 0.3, 0.05, 0.02, "#2a3441", -4.62, 0.3 + k * 0.45, -1.2 - i * 0.75, 0.6); }
  for (let i = 0; i < 4; i++) bx(g, 0.7, 1.4, 0.55, T("#8a97a6"), 4.9, 0.7, -5 - i * 0.75, 0.02);
  // water cooler, plants, printer
  cy(g, 0.22, 0.22, 0.9, T("#e8eef2"), 4.3, 0.45, -0.6, 0.02); cy(g, 0.22, 0.22, 0.6, T("#6cc8ff", { emissive: "#2a90d0", emissiveIntensity: 0.4 }), 4.3, 1.2, -0.6);
  plant(g, -4.2, 0.8, 1.4); plant(g, 4.4, 2.2, 1.2, "#7a5cff"); plant(g, -4.4, -8.0, 1.3, "#2a7fd9"); plant(g, 4.4, -8.0, 1.5);
  bx(g, 0.9, 0.5, 0.7, T("#ddd"), -4.2, 0.9, -4.0, 0.02);
  // foreground paper stack & coffee
  for (let i = 0; i < 8; i++) bx(g, 0.4, 0.02, 0.3, T("#fff"), 2.2 + (i % 3) * 0.12, 0.015 + i * 0.0, 3 - i * 0.05).rotation.y = i * 0.7;
  const lights = mkLights(["#dff6ff", "#8a9aaa", 1.4], ["#fff2d8", 2.4, [4, 10, 7]], [["#fffbe0", 28, [0, 4.6, 1], 12], ["#fffbe0", 28, [0, 4.6, -5], 12], ["#ffb36b", 30, [-4, 3.5, -8], 12]], 10);
  return { root: g, lights, fog: new THREE.Fog("#cfe9ee", 20, 45), bg: "#bfe3e8", spots: { desk: [0, 0, 0], chair: [0, 0.5, -0.35], clock: [3.0, 4.6, -8.3], corkboard: [-5.3, 2.4, -3], screen: [0.6, 1.4, -1.85], window: [0, 3, -9.5] } };
}

// ================= STALL =================
function stall(): SetObj {
  const g = new THREE.Group();
  plane(g, 40, 40, T("#ffffff", { map: noiseTex("#4a2f6e", ["#5b3a82", "#3b2459", "#6d4a96"], 700, 9, 6, 6, 7) }), 0, 0, -6);
  // cobbles path
  const cob: It[] = []; const rc = seeded(12);
  for (let i = 0; i < 160; i++) cob.push({ x: (rc() - 0.5) * 3.4, y: 0.02, z: 7 - rc() * 11, s: [0.5 + rc() * 0.3, 1, 0.4 + rc() * 0.3], c: rc() < 0.5 ? "#5a4a7a" : "#4a3b6a" });
  inst(g, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 7), T("#ffffff"), cob);
  // backdrop night sky + hills
  const skyT = gradTex([[0, "#0f0a2b"], [0.6, "#3a1f6e"], [1, "#a8508f"]], 8, 256);
  vplane(g, 90, 40, basic(skyT, 1, false), 0, 14, -34);
  stars(g, 90, 4, 60, 8, 26, -33);
  const moon = glowSp(g, 2.2, "#fff2c8", -7, 12, -30, 1.4); void moon;
  for (let i = 0; i < 6; i++) { const h = cone(g, 6 + (i % 3) * 2, 6 + (i % 4) * 2, T(i % 2 ? "#2a1650" : "#331a60"), -22 + i * 9, 3 + (i % 4), -26 + (i % 2) * 3, 0, 6); h.castShadow = false; }
  // the stall (behind origin)
  const wood = T("#a8672f"), dk = T("#6b3f1d");
  for (const sx of [-1, 1]) { bx(g, 0.2, 3.4, 0.2, dk, sx * 2.3, 1.7, -3.9, 0.02); bx(g, 0.2, 2.6, 0.2, dk, sx * 2.3, 1.3, -1.6, 0.02); }
  bx(g, 4.8, 3.4, 0.2, T("#7a4a24"), 0, 1.7, -4.1, 0.02);
  // shelves with products (black boxes w/ green slits)
  const rs = seeded(17);
  for (let s = 0; s < 3; s++) {
    bx(g, 4.4, 0.08, 0.7, wood, 0, 1.0 + s * 0.75, -3.7, 0.015);
    for (let i = 0; i < 7; i++) {
      const bw = 0.45, bh = 0.35 + rs() * 0.15; const x = -2.0 + i * 0.66 + (rs() - 0.5) * 0.1;
      bx(g, bw, bh, 0.5, T("#14121c"), x, 1.04 + s * 0.75 + bh / 2, -3.7, 0.015);
      glow(g, bw * 0.7, 0.04, 0.02, "#3dff7a", x, 1.04 + s * 0.75 + bh * 0.7, -3.44, 2.4); glow(g, bw * 0.7, 0.04, 0.02, "#3dff7a", x, 1.04 + s * 0.75 + bh * 0.4, -3.44, 2.4);
    }
  }
  // counter
  bx(g, 4.8, 1.0, 0.9, wood, 0, 0.5, -2.2, 0.025); bx(g, 5.0, 0.1, 1.1, T("#c98a4b"), 0, 1.05, -2.2, 0.02);
  for (let i = 0; i < 6; i++) bx(g, 0.04, 0.8, 0.02, dk, -2 + i * 0.8, 0.5, -1.74);
  // register
  bx(g, 0.7, 0.35, 0.5, T("#d8d2c6"), 1.6, 1.3, -2.2, 0.02); bx(g, 0.5, 0.3, 0.06, T("#222"), 1.6, 1.65, -2.4).rotation.x = -0.3;
  glow(g, 0.4, 0.2, 0.02, "#6dffb3", 1.6, 1.68, -2.35, 1.6);
  // goods on counter: crates, boxes, coins
  for (let i = 0; i < 4; i++) bx(g, 0.5, 0.35, 0.4, T("#14121c"), -1.8 + i * 0.5, 1.28, -2.2 + (i % 2) * 0.1, 0.015), glow(g, 0.35, 0.04, 0.02, "#3dff7a", -1.8 + i * 0.5, 1.33, -1.98, 2.4);
  heap(g, -0.2, -2.2, 0.35, 0.2, 40, 4).position.y = 1.1;
  // awning
  const aw = new THREE.Group(); aw.position.set(0, 3.0, -2.6); aw.rotation.x = 0.22; g.add(aw);
  for (let i = 0; i < 10; i++) bx(aw, 0.5, 0.1, 3.0, T(i % 2 ? "#ffffff" : "#e5233b"), -2.25 + i * 0.5, 0, 0, 0.012);
  for (let i = 0; i < 10; i++) { const sc = cone(aw, 0.25, 0.3, T(i % 2 ? "#ffffff" : "#e5233b"), -2.25 + i * 0.5, -0.1, 1.55, 0, 3); sc.rotation.set(PI, 0, 0); }
  bx(g, 4.0, 0.9, 0.12, T("#14121c"), 0, 3.75, -3.1, 0.03);
  glow(g, 4.1, 0.06, 0.06, "#3dff7a", 0, 4.25, -3.05); glow(g, 4.1, 0.06, 0.06, "#3dff7a", 0, 3.3, -3.05);
  // lanterns
  for (const [x, y, z] of [[-2.1, 2.6, -1.2], [2.1, 2.6, -1.2], [-1.0, 2.7, -1.0], [1.0, 2.7, -1.0]] as V3[]) {
    cy(g, 0.01, 0.01, 0.3, T("#222"), x, y + 0.3, z); cy(g, 0.17, 0.17, 0.32, T("#ffb347", { emissive: "#ff8a00", emissiveIntensity: 1.8 }), x, y, z, 0.015, 8);
  }
  // string lights
  const sl: It[] = []; for (let i = 0; i < 24; i++) sl.push({ x: -3 + i * 0.26, y: 3.0 - Math.sin(i / 23 * PI) * -0.0 - Math.sin(i / 23 * PI) * 0.4 + 0.2, z: 1.2, c: i % 3 ? "#ffd86b" : "#ff7ab8" });
  inst(g, new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(2) }), sl, false);
  // foreground & side: crates, barrels, sacks, signposts, coin heaps, small second stalls
  for (const [x, z] of [[-1.9, 1.0], [1.9, 0.4], [2.0, 2.4], [-2.0, 2.8]] as V2[]) { bx(g, 0.8, 0.8, 0.8, wood, x, 0.4, z, 0.02); bx(g, 0.7, 0.35, 0.7, T("#14121c"), x, 1.0, z, 0.015); glow(g, 0.5, 0.04, 0.02, "#3dff7a", x, 1.05, z + 0.36, 2.4); }
  for (const [x, z] of [[-2.9, -1.2], [2.9, -1.2]] as V2[]) { cy(g, 0.4, 0.45, 0.9, wood, x, 0.45, z, 0.02); for (const y of [0.2, 0.7]) cy(g, 0.47, 0.47, 0.06, T("#3a3a45"), x, y, z); }
  heap(g, 2.4, 1.2, 0.5, 0.3, 50, 14); heap(g, -2.4, 1.8, 0.5, 0.3, 50, 15);
  for (const sx of [-1, 1]) {
    bx(g, 0.2, 2.6, 0.2, dk, sx * 5.2, 1.3, -5, 0.02); bx(g, 2.6, 0.2, 2.0, T("#7a4a24"), sx * 6.2, 2.6, -5, 0.02); bx(g, 2.2, 0.9, 1.0, wood, sx * 6.2, 0.45, -5, 0.02);
    for (let i = 0; i < 4; i++) sp(g, 0.18, T(["#ff5252", "#ffd23a", "#69f0ae", "#40c4ff"][i]), sx * 6.2 + (i - 1.5) * 0.45, 1.1, -5);
  }
  for (let i = 0; i < 5; i++) { cy(g, 0.03, 0.03, 2.0, dk, -5 + i * 0.4, 1, -9); }
  const lights = mkLights(["#9a7bff", "#35195c", 0.95], ["#cdbbff", 1.5, [-5, 10, 6]], [
    ["#ffb347", 22, [-2.1, 2.5, -1.2], 10], ["#ffb347", 22, [2.1, 2.5, -1.2], 10], ["#3dff7a", 24, [0, 2.0, -3.0], 8], ["#ffd86b", 12, [0, 2.8, 1.2], 9], ["#6aa8ff", 30, [-6, 6, 3], 18],
  ], 10);
  return { root: g, lights, fog: new THREE.Fog("#2a1650", 18, 48), bg: "#1a0f3a", spots: { counter: [0, 0, -2.9], front: [0, 0, 0], register: [1.6, 1.3, -2.2], sign: [0, 3.75, -3.0], shelf: [0, 1.8, -3.5] } };
}

// ================= FIELD =================
function field(): SetObj {
  const g = new THREE.Group();
  plane(g, 50, 50, T("#ffffff", { map: noiseTex("#4a2d70", ["#5d3a88", "#3a2259", "#6f4aa0", "#2f1b4a"], 900, 31, 8, 8, 6) }), 0, 0, -8);
  const skyT = gradTex([[0, "#0c0828"], [0.55, "#34195f"], [1, "#9a4f8a"]], 8, 256);
  vplane(g, 120, 50, basic(skyT, 1, false), 0, 16, -36); stars(g, 160, 5, 90, 6, 30, -35);
  glowSp(g, 1.0, "#fff0c0", 1.6, 5.6, -10.5, 1.5);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.18, depthWrite: false, fog: false })); halo.position.set(6.5, 11, -30.5); g.add(halo);
  // cliffs
  const rc = seeded(8);
  for (let i = 0; i < 14; i++) {
    const w = 3 + rc() * 3, h = 4 + rc() * 7; const x = -15 + i * 2.4 + (rc() - 0.5);
    const c = bx(g, w, h, 3 + rc() * 2, T(i % 2 ? "#3a2160" : "#46286f"), x, h / 2 - 0.1, -13 - rc() * 3, 0.03); c.rotation.y = (rc() - 0.5) * 0.4;
    for (let k = 0; k < 3; k++) bx(g, w * 0.5, 0.15, 0.1, T("#241442"), x, h * (0.3 + k * 0.25), -11.4, 0);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const h = 3 + i * 1.5; bx(g, 2.5, h, 2.5, T("#3d2565"), sx * (4.6 + i * 0.5), h / 2, -3 - i * 2.5, 0.03).rotation.y = i * 0.5; }
  // rocks
  const rocks: It[] = [];
  for (let i = 0; i < 60; i++) { const x = (rc() - 0.5) * 18, z = 7 - rc() * 18; if (Math.abs(x) < 1.2 && z > -1 && z < 3) continue; rocks.push({ x, y: 0.15, z, s: [0.3 + rc() * 0.8, 0.3 + rc() * 0.6, 0.3 + rc() * 0.8], ry: rc() * 3, c: rc() < 0.5 ? "#6c5a8c" : "#54447a" }); }
  inst(g, new THREE.DodecahedronGeometry(0.6, 0), T("#ffffff"), rocks);
  // nuggets
  const nug: It[] = [];
  for (let i = 0; i < 140; i++) { const x = (rc() - 0.5) * 12, z = 6 - rc() * 14; nug.push({ x, y: 0.1, z, s: [0.4 + rc() * 0.8, 0.4 + rc() * 0.5, 0.4 + rc() * 0.8], ry: rc() * 3, rz: rc() * 0.5, c: rc() < 0.5 ? "#e0a010" : "#f0c030" }); }
  inst(g, new THREE.IcosahedronGeometry(0.2, 0), GOLD(), nug);
  for (const [x, z, r] of [[-2.2, -2.8, 1.0], [2.6, -3.5, 1.2], [1.8, 3.0, 0.7], [-2.0, 2.4, 0.6]] as V3[]) heap(g, x, z, r, r * 0.55, 90, Math.floor(x * 7 + 50));
  // dirt mounds + holes + shovel
  for (const [x, z] of [[-1.4, -1.0], [1.5, -1.6], [0.6, 4.0]] as V2[]) { const m = sp(g, 0.8, T("#5a3a2a"), x, 0.0, z, 0.02); m.scale.y = 0.45; }
  const hole = cy(g, 0.8, 0.8, 0.04, T("#1a0f10"), 0, 0.03, 0, 0, 20); hole.castShadow = false;
  bx(g, 0.06, 1.5, 0.06, T("#8a5a30"), 1.4, 0.7, 0.8, 0.01).rotation.z = 0.25; bx(g, 0.3, 0.4, 0.04, T("#9aa4b5"), 1.55, 0.05, 0.8).rotation.z = 0.25;
  // chest
  bx(g, 0.9, 0.5, 0.6, T("#8a4b1f"), -1.7, 0.25, 0.7, 0.025); const lid = cy(g, 0.3, 0.3, 0.9, T("#9a5a28"), -1.7, 0.55, 0.7, 0.02); lid.rotation.z = PI / 2; glow(g, 0.2, 0.12, 0.04, "#ffd24a", -1.7, 0.5, 1.02);
  // lantern posts
  for (const [x, z] of [[-2.1, 0.8], [2.2, -0.6], [-2.8, -3.5], [3.0, -4.5], [-2, -7], [2.4, -8]] as V2[]) {
    bx(g, 0.14, 3.2, 0.14, T("#6b3f1d"), x, 1.6, z, 0.02); bx(g, 0.9, 0.12, 0.12, T("#6b3f1d"), x + 0.35, 3.0, z, 0.02);
    cy(g, 0.01, 0.01, 0.25, T("#222"), x + 0.7, 2.85, z); cy(g, 0.17, 0.17, 0.3, T("#ffb347", { emissive: "#ff8a00", emissiveIntensity: 2 }), x + 0.7, 2.6, z, 0.012, 8);
  }
  // crates & sign planks
  for (const [x, z] of [[1.8, 2.0], [-2.0, -1.0], [2.4, -1.8]] as V2[]) { bx(g, 0.7, 0.7, 0.7, T("#a8672f"), x, 0.35, z, 0.02).rotation.y = x; bx(g, 0.6, 0.3, 0.6, T("#14121c"), x, 0.85, z, 0.012); glow(g, 0.4, 0.04, 0.02, "#3dff7a", x, 0.9, z + 0.31 - 0.0, 2.4); }
  bx(g, 2.0, 1.0, 0.1, T("#6b3f1d"), 0, 1.6, -6, 0.02); cy(g, 0.06, 0.06, 1.6, T("#6b3f1d"), -0.8, 0.8, -6); cy(g, 0.06, 0.06, 1.6, T("#6b3f1d"), 0.8, 0.8, -6);
  tree(g, 4.6, -6, 1.3, 3); tree(g, -5, -7, 1.5, 4);
  // grass tufts
  const gr: It[] = []; for (let i = 0; i < 90; i++) gr.push({ x: (rc() - 0.5) * 14, y: 0.12, z: 6 - rc() * 14, s: [0.6, 0.5 + rc() * 0.8, 0.6], c: rc() < 0.5 ? "#4fbf6a" : "#2f9b52" });
  inst(g, new THREE.ConeGeometry(0.1, 0.35, 4), T("#ffffff"), gr, false);
  const lights = mkLights(["#8a78ff", "#2b1850", 1.0], ["#d8d0ff", 1.8, [-6, 12, 6]], [["#ffb347", 40, [-3.4, 2.4, 1.5], 9], ["#ffb347", 40, [3.8, 2.4, 0.5], 9], ["#9cb8ff", 60, [4, 8, 6], 24]], 11);
  return { root: g, lights, fog: new THREE.Fog("#2a1650", 14, 44), bg: "#1a0f3a", spots: { dig: [0, 0, 0], moon: [6.5, 11, -30], chest: [-2.9, 0.5, 0.2], cliff: [0, 5, -13] } };
}

// ================= DINER =================
function diner(): SetObj {
  const g = new THREE.Group();
  plane(g, 24, 30, T("#ffffff", { map: tileTex("#f4efe6", "#d62839", "#444", 2, 12, 15, 128) }), 0, 0, -6);
  const red = T("#d62839"), cream = T("#f6ecd6"), chrome = T("#d7dde6");
  // walls
  bx(g, 16, 7, 0.3, T("#2fb6b0"), 0, 3.5, -9, 0).castShadow = false;
  const wt = tileTex("#ffffff", "#e8e3d6", "#9aa", 8, 8, 1, 128); bx(g, 16, 1.5, 0.2, T("#ffffff", { map: wt }), 0, 0.85, -8.8);
  for (const sx of [-1, 1]) bx(g, 0.3, 7, 20, T("#2fb6b0"), sx * 5, 3.5, -3).castShadow = false;
  bx(g, 16, 0.3, 20, T("#f6ecd6"), 0, 6.5, -3).castShadow = false;
  glow(g, 16, 0.08, 0.1, "#ff4d6d", 0, 1.7, -8.75, 2.2); glow(g, 16, 0.08, 0.1, "#37e0ff", 0, 5.9, -8.75, 2.2);
  // window w/ night
  vplane(g, 5.2, 2.6, basic(skylineTex([[0, "#1b1040"], [1, "#6a3a8a"]], 7), 1, false), -3.2, 3.6, -8.8);
  for (const x of [-3.6, -3.2, -0.6]) bx(g, 0.12, 2.7, 0.12, chrome, x, 3.6, -8.7);
  bx(g, 5.4, 0.12, 0.14, chrome, -3.2, 2.3, -8.7); bx(g, 5.4, 0.12, 0.14, chrome, -3.2, 4.9, -8.7);
  // blank sign board
  bx(g, 3.4, 1.9, 0.2, T("#ffc21f"), 3.0, 4.2, -8.7, 0.04); bx(g, 3.0, 1.5, 0.05, T("#d62839"), 3.0, 4.2, -8.57);
  for (let i = 0; i < 14; i++) sp(g, 0.06, glowMat("#fff0a0", 2), 1.4 + i * 0.245, 5.2, -8.55, 0, 6), sp(g, 0.06, glowMat("#fff0a0", 2), 1.4 + i * 0.245, 3.2, -8.55, 0, 6);
  // counter w/ stools along back
  bx(g, 6.5, 1.0, 0.9, red, 3.0, 0.5, -7.2, 0.025); bx(g, 6.7, 0.1, 1.1, T("#f4f4f4"), 3.0, 1.05, -7.2, 0.02); bx(g, 6.5, 0.06, 0.1, chrome, 3.0, 0.15, -6.7);
  for (let i = 0; i < 5; i++) { cy(g, 0.04, 0.04, 0.55, chrome, 0.8 + i * 1.0, 0.3, -6.3); cy(g, 0.25, 0.25, 0.12, red, 0.8 + i * 1.0, 0.65, -6.3, 0.02); cy(g, 0.12, 0.2, 0.05, chrome, 0.8 + i * 1.0, 0.03, -6.3); }
  cy(g, 0.35, 0.35, 0.04, chrome, 4.2, 1.15, -7.1); cy(g, 0.3, 0.3, 0.3, T("#ffd9a8"), 4.2, 1.35, -7.1, 0.01); cy(g, 0.12, 0.12, 0.25, T("#ff9db0"), 2.6, 1.2, -7.1); bx(g, 0.4, 0.3, 0.4, chrome, 1.4, 1.25, -7.2, 0.02);
  // booths left and right
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = -1.5 - i * 2.4, x = sx * 3.4;
    bx(g, 1.3, 0.12, 1.9, cream, x, 0.95, z, 0.02); cy(g, 0.12, 0.12, 0.9, chrome, x, 0.45, z); cy(g, 0.35, 0.4, 0.06, chrome, x, 0.03, z);
    for (const dx of [-1, 1]) { const px = x + dx * 1.0 * (sx === -1 ? -1 : 1) * 0 + dx * 1.15; bx(g, 0.8, 0.55, 1.9, red, px, 0.4, z, 0.025); bx(g, 0.2, 0.9, 1.9, red, px + dx * 0.4, 0.95, z, 0.025); }
    cy(g, 0.01, 0.01, 1.2, T("#222"), x, 5.9, z); cone(g, 0.45, 0.4, T("#ffd23a", { emissive: "#ff9d00", emissiveIntensity: 0.9 }), x, 4.8, z, 0.02, 14); glow(g, 0.2, 0.05, 0.2, "#fff2b0", x, 4.58, z, 3);
    cy(g, 0.05, 0.05, 0.12, T("#ffffff"), x - 0.2, 1.05, z + 0.2); cy(g, 0.06, 0.06, 0.1, T("#d62839"), x + 0.2, 1.05, z - 0.3); cy(g, 0.22, 0.22, 0.03, T("#fff"), x, 1.03, z + 0.55);
  }
  // jukebox
  bx(g, 1.0, 1.7, 0.7, T("#d62839"), -4.2, 0.85, 3.0, 0.03); const arc = cy(g, 0.5, 0.5, 0.7, T("#ffd23a", { emissive: "#ff8a00", emissiveIntensity: 1 }), -4.2, 1.75, 3.0, 0.02); arc.rotation.x = PI / 2; arc.scale.set(1, 1, 1);
  glow(g, 0.6, 0.6, 0.02, "#ff6bd6", -4.2, 1.4, 3.36, 2);
  // neon + posters + clock
  for (let i = 0; i < 3; i++) vplane(g, 0.9, 1.3, basic(posterTex(["#ffd23a", "#ff6f61", "#6bc5ff"][i], "#fff", 60 + i), 1, true), 4.8, 3, -3 - i * 1.5, -PI / 2);
  vplane(g, 0.9, 1.3, basic(posterTex("#a2f", "#ff0", 77)), -4.85, 3, -4, PI / 2);
  // menu boards
  
  // pie rack, sundae foreground
  for (const sx of [-1, 1]) { bx(g, 0.9, 0.9, 0.9, red, sx * 2.0, 0.45, 4.2, 0.02); cy(g, 0.3, 0.27, 0.12, T("#e0a458"), sx * 2.0, 1.0, 4.2); cy(g, 0.23, 0.23, 0.03, T("#b3202f"), sx * 2.0, 1.065, 4.2); for (let k = 0; k < 8; k++) { const a = k * PI / 4; bx(g, 0.2, 0.025, 0.03, T("#e0a458"), sx * 2.0 + Math.cos(a) * 0.1, 1.09, 4.2 + Math.sin(a) * 0.1).rotation.y = -a; } }   // Nov 26 (144): the plain tan disc read as a bare cookie; now a cherry pie (red filling, lattice)
  const lights = mkLights(["#fff0d8", "#b06a6a", 1.35], ["#fff0d0", 2.2, [3, 10, 8]], [["#ffd36b", 36, [3.4, 4.5, -1.5], 10], ["#ffd36b", 36, [-3.4, 4.5, -3.9], 10], ["#ffd36b", 36, [3.4, 4.5, -6.3], 10], ["#ff4d6d", 30, [0, 2, -8], 12], ["#37e0ff", 24, [-4, 3, 1], 10]], 10);
  return { root: g, lights, fog: new THREE.Fog("#c8b9a0", 22, 46), bg: "#2a1a38", spots: { counter: [3.0, 0, -6.0], booth: [-3.4, 0, -1.5], sign: [3.0, 4.2, -8.55], table: [3.4, 0.95, -1.5], window: [-3.2, 3.6, -8.7] } };
}

// ================= FARM (barn, silo, ploughed rows, fence, dirt road, hay) =================
function farm(): SetObj {
  const g = new THREE.Group();
  const red = T("#c8342c"), redD = T("#9e2620"), white = T("#f6f1e6"), wood = T("#a8713a");
  plane(g, 160, 130, T("#ffffff", { map: noiseTex("#5db84a", ["#6fcb57", "#4aa63c", "#7ad862"], 700, 41, 10, 10, 6) }), 0, 0, -34);
  plane(g, 3.6, 70, T("#ffffff", { map: noiseTex("#c89a62", ["#d8ad74", "#b98a54", "#a87a48"], 400, 43, 1, 12, 5) }), 0, 0.012, -16);
  // ploughed fields either side of the road (dark soil + light ridges running away from the camera) and young crops on the right
  const soil = T("#5a3a22"), ridgeA = T("#8a5a34"), ridgeB = T("#7a4c2a");
  bx(g, 11, 0.02, 30, soil, -9.2, 0.016, -9).castShadow = false;
  for (let i = 0; i < 11; i++) bx(g, 0.62, 0.22, 29, i % 2 ? ridgeA : ridgeB, -4.4 - i * 0.98, 0.11, -9, 0.012);
  bx(g, 8.6, 0.02, 11, soil, 8.2, 0.016, 0.4).castShadow = false;
  const crop: It[] = [];
  for (let i = 0; i < 8; i++) {
    const rx = 4.4 + i * 0.98; bx(g, 0.62, 0.22, 10.6, i % 2 ? ridgeA : ridgeB, rx, 0.11, 0.4, 0.012);
    for (let k = 0; k < 20; k++) crop.push({ x: rx, y: 0.42, z: 5.4 - k * 0.52, s: [1, 1.3 + (k % 3) * 0.25, 1], c: k % 2 ? "#4fc24a" : "#38a83a" });
  }
  inst(g, new THREE.ConeGeometry(0.17, 0.42, 5), T("#ffffff"), crop, false);
  // wooden fence along both sides of the road
  for (const sxn of [-1, 1]) {
    for (let i = 0; i < 14; i++) bx(g, 0.12, 1.15, 0.12, wood, sxn * 2.35, 0.57, 6 - i * 1.6, 0.015);
    bx(g, 0.07, 0.1, 22, wood, sxn * 2.35, 0.9, -5, 0.01); bx(g, 0.07, 0.1, 22, wood, sxn * 2.35, 0.5, -5, 0.01);
  }
  // red barn (gable roof, white trim, X doors, hay-loft window)
  const barn = new THREE.Group(); barn.position.set(-4.4, 0, -10.5); barn.rotation.y = 0.35; g.add(barn);
  bx(barn, 6, 3.4, 4.6, red, 0, 1.7, 0, 0.03);
  for (let i = 0; i < 6; i++) bx(barn, 0.04, 3.2, 0.04, redD, -2.5 + i, 1.7, 2.33);
  const gab = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-3, 0); s.lineTo(3, 0); s.lineTo(0, 2.2); s.closePath(); return s; })()), red);
  gab.position.set(0, 3.4, 2.31); barn.add(gab);
  for (const sx2 of [-1, 1]) {
    const rf = bx(barn, 3.75, 0.26, 5.0, T("#6a6f7c"), sx2 * 1.52, 4.52, 0, 0.025); rf.rotation.z = -sx2 * 0.62;
    const tr = bx(barn, 0.1, 0.1, 0.1, white, 0, 0, 0); tr.visible = false;
  }
  bx(barn, 0.18, 0.18, 5.05, white, 0, 5.62, 0);
  for (const sx2 of [-1, 1]) { const tm = bx(barn, 3.8, 0.12, 0.1, white, sx2 * 1.5, 4.52, 2.4); tm.rotation.z = -sx2 * 0.62; }
  bx(barn, 2.5, 2.6, 0.16, white, 0, 1.3, 2.34, 0.02); bx(barn, 2.2, 2.4, 0.1, redD, 0, 1.3, 2.4);
  for (const rz of [0.78, -0.78]) bx(barn, 0.14, 3.0, 0.08, white, 0, 1.3, 2.46).rotation.z = rz;
  bx(barn, 0.1, 2.4, 0.08, white, 0, 1.3, 2.47);
  bx(barn, 1.0, 1.0, 0.14, white, 0, 4.1, 2.38, 0.02); bx(barn, 0.76, 0.76, 0.1, T("#3a2a28"), 0, 4.1, 2.44);
  // silo
  cy(g, 1.15, 1.15, 6.4, T("#cfd8e0"), 2.6, 3.2, -11.2, 0.03, 24);
  const dome = sp(g, 1.15, T("#9aa7b4"), 2.6, 6.4, -11.2, 0.03, 20); dome.scale.y = 0.65;
  for (let i = 0; i < 5; i++) cy(g, 1.19, 1.19, 0.1, T("#8e9aa8"), 2.6, 1.0 + i * 1.2, -11.2, 0, 24);
  // hay: round bales beside the fence + a stack of square bales near the barn
  const hay = T("#e3b64a"), hayD = T("#c7952c");
  for (const [x, z, s] of [[-3.5, 1.6, 1], [-4.4, -0.4, 1], [-3.7, -2.4, 1.1]] as V3[]) {
    const b = cy(g, 0.62 * s, 0.62 * s, 1.0 * s, hay, x, 0.62 * s, z, 0.025, 20); b.rotation.x = PI / 2;
    for (const dz of [-0.2, 0.2]) { const c = cy(g, 0.64 * s, 0.64 * s, 0.07, hayD, x, 0.62 * s, z + dz * s, 0, 20); c.rotation.x = PI / 2; }
  }
  for (const [x, y, z] of [[4.0, 0.25, 3.2], [5.0, 0.25, 3.2], [4.5, 0.75, 3.2], [4.0, 0.25, 2.5]] as V3[]) {
    bx(g, 0.95, 0.5, 0.55, hay, x, y, z, 0.02); bx(g, 0.05, 0.52, 0.57, T("#6a4a22"), x - 0.22, y, z); bx(g, 0.05, 0.52, 0.57, T("#6a4a22"), x + 0.22, y, z);
  }
  // trees, hills, sky
  tree(g, -8.8, -3.5, 1.5, 5, "#6b4a2a"); tree(g, 12.5, -3, 1.3, 6, "#6b4a2a");
  for (const [x, z, r, c] of [[-26, -52, 16, "#5fb04c"], [4, -58, 20, "#4d9d42"], [34, -50, 16, "#68b856"], [-6, -48, 10, "#6bc05a"]] as Array<[number, number, number, string]>) { const h = sp(g, r, T(c), x, -r * 0.55, z, 0, 16); h.scale.z = 0.5; }
  vplane(g, 300, 120, basic(gradTex([[0, "#cfeaff"], [0.45, "#8ecbff"], [1, "#4a9be8"]], 8, 256), 1, false), 0, 40, -75);
  glowSp(g, 3.2, "#fff3b0", -22, 26, -70, 1.4);
  for (const [cx, cyy, cs] of [[-30, 28, 1.2], [14, 34, 1.6], [42, 24, 1.0], [-4, 42, 1.1]] as V3[]) for (let i = 0; i < 5; i++) { const m = sp(g, 3 * cs, T("#ffffff", { emissive: "#c8d8ee", emissiveIntensity: 0.6 }), cx + (i - 2) * 3.4 * cs, cyy + (i % 2) * 1.2, -72, 0, 12); m.scale.set(1.3, 0.7, 0.5); }
  const lights = mkLights(["#f4faff", "#7ab060", 1.3], ["#fff4d6", 2.6, [-7, 14, 9]], [["#ffffff", 22, [0, 6, 6], 22]], 14);
  return { root: g, lights, fog: new THREE.Fog("#cfeaff", 45, 130), bg: "#8ecbff", spots: { spot: [0, 0, 0], road: [0, 0, -4], barn: [-4.4, 0, -8], hay: [-3.5, 1.2, 1.6], silo: [2.6, 3, -11] } };
}

// ================= STORE (grocery: aisles, fruit stand, checkout with conveyor, paper bags) =================
function store(): SetObj {
  const g = new THREE.Group();
  plane(g, 30, 36, T("#ffffff", { map: tileTex("#f6f3ec", "#d6e8ea", "#b4c2c6", 2, 14, 17, 128) }), 0, 0, -6);
  bx(g, 26, 7, 0.3, T("#f4e8c8"), 0, 3.5, -10.2).castShadow = false;
  for (const sxn of [-1, 1]) bx(g, 0.3, 7, 26, T("#f4e8c8"), sxn * 7.2, 3.5, -3).castShadow = false;
  bx(g, 26, 0.3, 26, T("#f2f2f4"), 0, 6.6, -3).castShadow = false;
  bx(g, 26, 0.5, 0.2, T("#2fae4f"), 0, 0.25, -10.05); bx(g, 26, 0.12, 0.2, T("#2fae4f"), 0, 6.3, -10.05);
  // ceiling light panels
  for (let i = -2; i <= 2; i++) for (let j = 0; j < 4; j++) glow(g, 1.9, 0.06, 0.55, "#fffbe6", i * 2.9, 6.42, 3 - j * 3.6, 2.2);
  // plain lettering sign on the back wall
  bx(g, 7.6, 1.5, 0.2, T("#2fae4f"), 0, 5.2, -10.0, 0.03);
  const st = canvasTex(512, 100, (c) => { c.fillStyle = "#2fae4f"; c.fillRect(0, 0, 512, 100); c.fillStyle = "#ffffff"; c.font = "bold 78px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("GROCERY", 256, 54); });
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 1.43), basic(st, 1.1, false)); sgn.position.set(0, 5.2, -9.88); g.add(sgn);
  // shelves: products are boxes and cans in bright colours
  const pal = ["#e5233b", "#ffc21f", "#2a7de0", "#37b85a", "#ff8a3c", "#f4f4f4", "#9b5de5", "#ff4da6"];
  const shelf = (x: number, z: number, ry: number, len: number, h: number, seed: number) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; g.add(s);
    const r = seeded(seed);
    bx(s, len, h, 0.06, T("#cfd6de"), 0, h / 2, -0.28, 0.02);
    for (const ex of [-len / 2, len / 2]) bx(s, 0.07, h, 0.6, T("#4a5568"), ex, h / 2, 0, 0.02);
    const tiers = Math.round(h / 0.5);
    const boxes: It[] = [], cans: It[] = [];
    for (let t = 0; t < tiers; t++) {
      const y = 0.12 + t * (h - 0.2) / tiers;
      bx(s, len, 0.05, 0.6, T("#8a94a3"), 0, y, 0, 0.01);
      for (let xx = -len / 2 + 0.2; xx < len / 2 - 0.2;) {
        const col = pal[Math.floor(r() * pal.length)];
        if (r() < 0.55) { const w = 0.22 + r() * 0.12, hh = 0.26 + r() * 0.12; boxes.push({ x: xx + w / 2, y: y + 0.025 + hh / 2, z: 0.02, s: [w, hh, 0.3], c: col }); xx += w + 0.03; }
        else { const hh = 0.2 + r() * 0.08; for (let k = 0; k < 2; k++) cans.push({ x: xx + 0.07 + k * 0.15, y: y + 0.025 + hh / 2, z: 0.02, s: [0.13, hh, 0.13], c: col }); xx += 0.33; }
      }
    }
    inst(s, new THREE.BoxGeometry(1, 1, 1), T("#ffffff"), boxes); inst(s, new THREE.CylinderGeometry(0.5, 0.5, 1, 10), T("#ffffff"), cans);
    return s;
  };
  shelf(-3.4, -9.6, 0, 6.4, 2.6, 71); shelf(3.4, -9.6, 0, 6.4, 2.6, 72);
  shelf(-6.7, -3.2, PI / 2, 12, 2.4, 73); shelf(6.7, -3.2, -PI / 2, 12, 2.4, 74);
  shelf(-3.0, -5.6, PI / 2, 5, 1.7, 75); shelf(-3.5, -5.6, -PI / 2, 5, 1.7, 76);
  shelf(3.0, -5.6, -PI / 2, 5, 1.7, 77); shelf(3.5, -5.6, PI / 2, 5, 1.7, 78);
  // hanging aisle signs
  for (const [x, c] of [[-3.25, "#ff8a3c"], [3.25, "#2a7de0"]] as Array<[number, string]>) {
    cy(g, 0.012, 0.012, 1.2, T("#222"), x, 5.9, -3.2); bx(g, 1.1, 0.5, 0.06, T(c), x, 5.1, -3.2, 0.015);
    const nt = canvasTex(128, 64, (cc) => { cc.fillStyle = c; cc.fillRect(0, 0, 128, 64); cc.fillStyle = "#fff"; cc.font = "bold 46px Arial"; cc.textAlign = "center"; cc.textBaseline = "middle"; cc.fillText(x < 0 ? "1" : "2", 64, 34); });
    const np = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.45), basic(nt, 1.1, false)); np.position.set(x, 5.1, -3.16); g.add(np);
  }
  // fruit stand (right front): tiered crates of apples, oranges, lemons
  const fx = 2.6, fz = -0.6;
  bx(g, 2.3, 0.5, 1.3, T("#a8713a"), fx, 0.25, fz, 0.025); bx(g, 2.3, 0.5, 0.8, T("#b9803f"), fx, 0.62, fz - 0.3, 0.025); bx(g, 2.3, 0.5, 0.5, T("#a8713a"), fx, 0.98, fz - 0.5, 0.025);
  const fr = seeded(81);
  for (const [y, zOff, d, n] of [[0.55, 0.3, 0.9, 30], [0.92, -0.05, 0.6, 22], [1.28, -0.4, 0.35, 12]] as V4[]) {
    const items: It[] = [];
    for (let i = 0; i < n; i++) { const k = i % 3; items.push({ x: fx + (fr() - 0.5) * 2.0, y: y + fr() * 0.04, z: fz + zOff + (fr() - 0.5) * d, s: 1, c: k === 0 ? "#e5233b" : k === 1 ? "#ff9a1f" : "#ffe03a" }); }
    inst(g, new THREE.SphereGeometry(0.12, 10, 8), T("#ffffff"), items);
  }
  bx(g, 0.06, 1.6, 0.06, T("#6b3f1d"), fx - 1.1, 2.2, fz - 0.5); bx(g, 0.06, 1.6, 0.06, T("#6b3f1d"), fx + 1.1, 2.2, fz - 0.5);
  bx(g, 2.5, 0.12, 1.1, T("#2fae4f"), fx, 3.0, fz - 0.3, 0.02);
  // checkout counter with a conveyor belt (left front), register, bags
  const cx = -2.5;
  bx(g, 1.2, 0.95, 3.4, T("#4a74c9"), cx, 0.475, 1.8, 0.03); bx(g, 1.3, 0.06, 3.5, T("#e8ecf2"), cx, 0.98, 1.8, 0.015);
  bx(g, 0.8, 0.07, 2.4, T("#2c2f3a"), cx + 0.05, 1.04, 1.3, 0.01);
  for (let i = 0; i < 12; i++) bx(g, 0.78, 0.015, 0.03, T("#4a4f60"), cx + 0.05, 1.085, 0.2 + i * 0.2);
  bx(g, 0.5, 0.35, 0.5, T("#d9dee8"), cx - 0.2, 1.2, 3.1, 0.02); bx(g, 0.44, 0.3, 0.06, T("#222834"), cx - 0.2, 1.62, 3.0, 0.015); glow(g, 0.34, 0.2, 0.02, "#37f58a", cx - 0.2, 1.62, 2.96, 1.8);
  cy(g, 0.03, 0.03, 1.6, T("#444"), cx + 0.5, 1.8, 3.4); bx(g, 0.5, 0.4, 0.06, T("#e5233b"), cx + 0.5, 2.7, 3.4, 0.02);
  for (const [x, y, z, c, w] of [[cx + 0.05, 1.2, 0.7, "#ffc21f", 0.3], [cx + 0.05, 1.18, 1.2, "#e5233b", 0.26], [cx + 0.05, 1.16, 1.8, "#37b85a", 0.22]] as Array<[number, number, number, string, number]>) bx(g, w, 0.28, 0.2, T(c), x, y, z, 0.015);
  for (const [x, z] of [[cx - 0.2, 0.45], [cx - 0.3, 2.3]] as V2[]) { bx(g, 0.34, 0.46, 0.22, T("#c99a62"), x, 1.24, z, 0.02); bx(g, 0.34, 0.06, 0.06, T("#a87a48"), x, 1.5, z + 0.12); }
  for (const [x, z, ry] of [[-2.3, 1.4, 0.3], [-2.6, 2.4, -0.4], [-4.7, 3.4, 0.2]] as V3[]) { const b = bx(g, 0.34, 0.5, 0.22, T("#c99a62"), x, 0.25, z, 0.02); b.rotation.y = ry; bx(g, 0.34, 0.06, 0.06, T("#a87a48"), x, 0.52, z + 0.1).rotation.y = ry; }
  // paper bag stack by the hero, shopping basket
  for (const [x, z, ry] of [[-1.5, 3.2, 0.5], [-1.1, 3.6, -0.3]] as V3[]) { const b = bx(g, 0.38, 0.55, 0.26, T("#c99a62"), x, 0.275, z, 0.02); b.rotation.y = ry; bx(g, 0.3, 0.12, 0.2, T("#4fc24a"), x, 0.6, z).rotation.y = ry; }
  bx(g, 0.6, 0.3, 0.4, T("#e5233b"), 1.6, 0.15, 3.4, 0.02);
  const lights = mkLights(["#fffaf0", "#c8b8a0", 1.45], ["#fff6e0", 2.1, [2, 10, 9]], [["#ffffff", 40, [0, 5.4, 2], 18], ["#ffffff", 34, [-3, 5.4, -4], 16], ["#ffffff", 34, [3, 5.4, -4], 16]], 12);
  return { root: g, lights, fog: new THREE.Fog("#ece6d8", 26, 55), bg: "#d8d2c4", spots: { spot: [0, 0, 0], counter: [cx, 1.1, 1.8], fruit: [fx, 1.0, fz], sign: [0, 5.2, -9.8], aisle: [0, 0, -6] } };
}

// ================= LAB =================
function lab(): SetObj {
  const g = new THREE.Group();
  plane(g, 24, 30, T("#ffffff", { map: tileTex("#bfe0de", "#9ccdca", "#5f8a88", 4, 8, 10) }), 0, 0, -6);
  const teal = T("#12868a"), white = T("#e4f0f0"), glass = (c: string) => T(c, { emissive: c, emissiveIntensity: 0.5 });
  bx(g, 16, 8, 0.3, teal, 0, 4, -9, 0).castShadow = false; for (const sx of [-1, 1]) bx(g, 0.3, 8, 22, teal, sx * 5.5, 4, -3).castShadow = false;
  bx(g, 16, 0.3, 22, T("#e9f1f1"), 0, 6.5, -3).castShadow = false;
  for (let z = 3; z > -9; z -= 3) for (const x of [-2, 2]) glow(g, 1.6, 0.05, 0.7, "#f2ffff", x, 6.3, z, 1.8);
  glow(g, 16, 0.08, 0.1, "#37ffd5", 0, 1.3, -8.8, 2); glow(g, 0.08, 0.1, 22, "#37ffd5", -5.3, 1.3, -3, 2); glow(g, 0.08, 0.1, 22, "#37ffd5", 5.3, 1.3, -3, 2);
  // blank sign board
  bx(g, 5.2, 1.6, 0.2, T("#10222d"), 0, 5.4, -8.7, 0.04); glow(g, 5.4, 0.07, 0.1, "#37ffd5", 0, 6.25, -8.6); glow(g, 5.4, 0.07, 0.1, "#37ffd5", 0, 4.55, -8.6);
  // wall screens
  const tex = [screenTex(21, "#37ffd5"), screenTex(22, "#ff6bd6"), screenTex(23, "#ffd23a")];
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { bx(g, 1.8, 1.2, 0.1, T("#10181f"), sx * (2.5 + i * 0.0) + 0, 3.0, -8.75, 0.02).visible = false; }
  [-3.6, 3.6, -1.6, 1.6].forEach((x, i) => { bx(g, 1.8, 1.2, 0.1, T("#10181f"), x, 2.8, -8.75, 0.02); const s = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.05), basic(tex[i % 3], 1.25, false)); s.position.set(x, 2.8, -8.68); g.add(s); });
  // shelves with bottles
  const rb = seeded(14); const bcols = ["#ff5a7a", "#3affd1", "#ffd23a", "#8a5cff", "#4db8ff", "#7cff6b"];
  const bots: It[] = [], caps: It[] = [];
  for (const sx of [-1, 1]) for (let s = 0; s < 4; s++) {
    bx(g, 0.5, 0.06, 6.5, T("#d9e6e6"), sx * 5.1, 1.2 + s * 0.85, -4.5, 0.01);
    for (let i = 0; i < 12; i++) { const z = -1.5 - i * 0.5, y = 1.23 + s * 0.85 + 0.2; bots.push({ x: sx * 5.1, y, z, s: [1, 0.7 + rb() * 0.7, 1], c: bcols[Math.floor(rb() * bcols.length)] }); caps.push({ x: sx * 5.1, y: y + 0.28, z, c: "#222" }); }
  }
  inst(g, new THREE.CylinderGeometry(0.12, 0.14, 0.4, 10), glass("#ffffff"), bots, false); void caps;
  // counters with glassware
  for (const sx of [-1, 1]) { bx(g, 1.2, 1.0, 7, white, sx * 3.6, 0.5, -4.0, 0.025); bx(g, 1.3, 0.08, 7.1, T("#2a3a44"), sx * 3.6, 1.04, -4.0); }
  for (let i = 0; i < 20; i++) { const sx = i % 2 ? 1 : -1; const z = -1.2 - Math.floor(i / 2) * 0.65; const c = bcols[i % 6]; cy(g, 0.12, 0.14, 0.35, glass(c), sx * 3.6 + (rb() - 0.5) * 0.4, 1.25, z, 0.01, 10); }
  for (const sx of [-1, 1]) { sp(g, 0.28, glass(sx < 0 ? "#3affd1" : "#ff6bd6"), sx * 3.6, 1.35, -0.4, 0.015); cy(g, 0.06, 0.06, 0.3, glass(sx < 0 ? "#3affd1" : "#ff6bd6"), sx * 3.6, 1.7, -0.4); }
  // central lab table
  bx(g, 2.8, 0.1, 1.2, T("#e8f0f0"), 0, 0.95, -3.2, 0.02); bx(g, 2.6, 0.9, 1.0, white, 0, 0.45, -3.2, 0.02);
  for (let i = 0; i < 5; i++) { cy(g, 0.12, 0.2, 0.4, glass(bcols[i]), -1.0 + i * 0.5, 1.2, -3.2, 0.012, 10); cy(g, 0.06, 0.06, 0.2, glass(bcols[i]), -1.0 + i * 0.5, 1.5, -3.2); }
  // microscope
  cy(g, 0.15, 0.2, 0.06, T("#222"), 1.0, 1.04, -2.9); bx(g, 0.1, 0.5, 0.1, T("#d8d8d8"), 1.0, 1.3, -2.9); cy(g, 0.05, 0.05, 0.35, T("#333"), 1.0, 1.5, -2.8).rotation.x = 0.4;
  // big machine + vat
  bx(g, 1.8, 2.4, 1.2, T("#dde7e7"), -2.2, 1.2, -7.4, 0.03); for (let i = 0; i < 4; i++) sp(g, 0.1, glowMat(["#ff4d6d", "#ffd23a", "#37ff8a", "#4db8ff"][i], 2.4), -2.8 + i * 0.4, 2.1, -6.78, 0, 8);
  bx(g, 1.2, 0.5, 0.05, T("#10181f"), -2.2, 1.4, -6.77); const ss = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), basic(tex[0], 1.3, false)); ss.position.set(-2.2, 1.4, -6.74); g.add(ss);
  cy(g, 0.9, 0.9, 2.6, new THREE.MeshToonMaterial({ color: "#38ff8a", emissive: "#12c060", emissiveIntensity: 0.9, transparent: true, opacity: 0.8, gradientMap: (T("#fff") as THREE.MeshToonMaterial).gradientMap }), 2.4, 1.5, -7.2, 0.03, 20);
  cy(g, 1.0, 1.0, 0.2, T("#2a3a44"), 2.4, 0.1, -7.2); cy(g, 1.0, 1.0, 0.2, T("#2a3a44"), 2.4, 2.9, -7.2);
  const bub: It[] = []; for (let i = 0; i < 20; i++) bub.push({ x: 2.4 + (rb() - 0.5) * 1.3, y: 0.6 + rb() * 2, z: -7.2 + (rb() - 0.5) * 1.3, s: 0.5 + rb() });
  inst(g, new THREE.SphereGeometry(0.08, 8, 6), glowMat("#b8ffd8", 2), bub, false);
  // pipes & tubes overhead
  for (let i = 0; i < 3; i++) { const p = cy(g, 0.08, 0.08, 14, T("#9bb7b5"), 0, 5.6 - i * 0.25, -5 - i * 1.0, 0.01, 8); p.rotation.z = PI / 2; }
  // foreground: floor tubes, test-tube rack
  for (let i = 0; i < 6; i++) cy(g, 0.05, 0.05, 0.3, glass(bcols[i]), 1.8 + i * 0.15, 0.17, 3.2, 0.008, 8);
  bx(g, 1.0, 0.1, 0.3, T("#8a5a30"), 2.1, 0.05, 3.2);
  plant(g, -4.8, 1.0, 1.2, "#fff"); plant(g, 4.8, 1.5, 1.2, "#fff");
  const lights = mkLights(["#b8f0ee", "#4a7a7a", 0.9], ["#f4fffe", 1.7, [3, 10, 8]], [["#37ffd5", 30, [0, 3, -7], 12], ["#38ff8a", 40, [2.4, 2.4, -6], 8], ["#ff6bd6", 24, [-3, 2.5, -7], 10], ["#fffbe0", 14, [0, 5.8, -1], 12]], 10);
  return { root: g, lights, fog: new THREE.Fog("#bfe6e3", 22, 46), bg: "#bfe6e3", spots: { table: [0, 0, -2.3], sign: [0, 5.4, -8.6], screen: [1.6, 2.8, -8.6], vat: [2.4, 1.5, -7.2], bench: [3.6, 1.05, -2.0] } };
}

// ================= BOARDROOM =================
function boardroom(): SetObj {
  const g = new THREE.Group();
  plane(g, 24, 30, T("#ffffff", { map: woodTex("#6b3f24", "#7a4a2c", 4, 6, 6) }), 0, 0, -6);
  plane(g, 5, 18, T("#1d2e4a"), 0, 0.012, -4);
  const teal = T("#1d8f94"); const dark = T("#2a1b12");
  bx(g, 16, 8, 0.3, teal, 0, 4, -10).castShadow = false; bx(g, 0.3, 8, 22, teal, 5.5, 4, -4).castShadow = false;
  bx(g, 16, 0.3, 24, T("#e8eef0"), 0, 6.5, -4).castShadow = false;
  for (let i = 0; i < 6; i++) bx(g, 0.5, 6.0, 0.2, T("#17747a"), -6 + i * 2.4, 3.5, -9.8);
  // glass wall with night city
  const sky = skylineTex([[0, "#0d0a2a"], [0.6, "#3a2370"], [1, "#d86a8a"]], 19);
  vplane(g, 22, 7, basic(sky, 1.1, false), -6.5, 3.2, -4, PI / 2);
  for (let i = 0; i < 7; i++) bx(g, 0.15, 6.5, 0.15, T("#cfd8dc"), -5.4, 3.2, 3 - i * 3.2);
  bx(g, 0.15, 0.15, 22, T("#cfd8dc"), -5.4, 6.4, -4); bx(g, 0.15, 0.15, 22, T("#cfd8dc"), -5.4, 0.1, -4);
  // wall screen
  bx(g, 6.4, 3.4, 0.2, T("#10141c"), 0, 3.4, -9.75, 0.04);
  vplane(g, 6.0, 3.0, basic(canvasTex(512, 256, (c) => { c.fillStyle = "#0b1a26"; c.fillRect(0, 0, 512, 256); c.fillStyle = "#37f58a"; c.fillRect(0, 0, 512, 28); const r = seeded(3); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#2fb6ff" : "#ffd23a"; c.fillRect(30 + i * 56, 230 - (30 + r() * 150), 38, 30 + r() * 150 + 0); } }), 1.3, false), 0, 3.4, -9.63);
  // table
  bx(g, 2.2, 0.16, 11.5, T("#8a5a30"), 0, 0.88, -6.0, 0.025); bx(g, 1.9, 0.78, 11.0, dark, 0, 0.39, -6.0, 0.02);
  glow(g, 0.04, 0.02, 11.4, "#ffc21f", -1.0, 0.97, -6, 1.4); glow(g, 0.04, 0.02, 11.4, "#ffc21f", 1.0, 0.97, -6, 1.4);
  // chairs both sides
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
    const z = -2.0 - i * 1.7, x = sx * 1.75; const col = i % 2 ? "#2c3f66" : "#1b2a4a";
    bx(g, 0.7, 0.14, 0.7, T(col), x, 0.55, z, 0.02); bx(g, 0.1, 0.95, 0.7, T(col), x + sx * 0.35, 1.0, z, 0.02); cy(g, 0.05, 0.05, 0.5, T("#555"), x, 0.28, z); cy(g, 0.3, 0.3, 0.04, T("#222"), x, 0.04, z);
    bx(g, 0.35, 0.02, 0.45, T("#fff"), sx * 0.5, 0.97, z + 0.1).rotation.y = i * 0.4; cy(g, 0.07, 0.06, 0.12, T("#fff"), sx * 0.8, 1.02, z - 0.3);
  }
  bx(g, 0.8, 0.14, 0.8, T("#6a1b1b"), 0, 0.6, -11.2).visible = false;
  // head chair at far end & near end chair (hero stands at near end)
  bx(g, 1.0, 0.2, 1.0, T("#6a1b1b"), 0, 0.6, -12.0, 0.02).visible = false;
  // pendant lights
  for (let i = 0; i < 4; i++) { cy(g, 0.01, 0.01, 1.2, T("#222"), 0, 5.8, -3 - i * 2.6); cone(g, 0.5, 0.35, T("#ffd23a", { emissive: "#ff9d00", emissiveIntensity: 0.9 }), 0, 5.0, -3 - i * 2.6, 0.02, 16); glow(g, 0.25, 0.04, 0.25, "#fff2b0", 0, 4.8, -3 - i * 2.6, 3); }
  // credenza, plants, flags, art
  bx(g, 3.2, 0.9, 0.6, dark, 3.5, 0.45, -9.4, 0.02); for (let i = 0; i < 5; i++) bx(g, 0.35, 0.5, 0.3, T(["#ffc21f", "#e53935", "#1e88e5", "#43a047", "#8e24aa"][i]), 2.4 + i * 0.5, 1.15, -9.4);
  plant(g, -4.8, -9.0, 1.7); plant(g, 4.6, -1.0, 1.4, "#d6c98a"); plant(g, 4.6, -9.0, 1.4);
  for (let i = 0; i < 3; i++) vplane(g, 1.4, 1.0, basic(posterTex(["#ff6f61", "#ffd54a", "#6bc5ff"][i], "#fff", 80 + i)), 5.3, 3.4, -2.5 - i * 2.2, -PI / 2);
  // foreground papers
  for (let i = 0; i < 5; i++) bx(g, 0.4, 0.015, 0.3, T("#fff"), 0.3 * Math.sin(i), 0.98, -1.5 - i * 0.15).rotation.y = i * 0.5;
  const lights = mkLights(["#d8ecff", "#6a5a50", 1.2], ["#fff0d8", 2.1, [4, 10, 8]], [["#ffd36b", 40, [0, 4.4, -3], 10], ["#ffd36b", 40, [0, 4.4, -8], 10], ["#6a8cff", 40, [-5, 4, -4], 14], ["#1fe0d0", 22, [0, 3, -9], 10]], 10);
  return { root: g, lights, fog: new THREE.Fog("#3b4258", 22, 46), bg: "#22304a", spots: { table: [0, 0.9, -4], head: [0, 0, -1.2], screen: [0, 3.4, -9.6], window: [-5.4, 3, -4] } };
}

// ================= RING =================
function ring_(): SetObj {
  const g = new THREE.Group();
  plane(g, 60, 60, T("#15122a"), 0, -1.0, -10);
  plane(g, 60, 60, T("#ffffff", { map: noiseTex("#1a1633", ["#241f46", "#120f26"], 500, 41, 8, 8, 6) }), 0, -1.01, -10);
  // ring platform
  bx(g, 6.6, 1.0, 6.6, T("#1b2a6a"), 0, -0.5, 0, 0.03); bx(g, 6.7, 0.15, 6.7, T("#d62839"), 0, -0.4, 0);
  const mat = canvasTex(256, 256, (c) => { c.fillStyle = "#274a9a"; c.fillRect(0, 0, 256, 256); c.fillStyle = "#2f58b0"; for (let i = 0; i < 8; i++) c.fillRect(i * 32, 0, 16, 256); c.strokeStyle = "#fff"; c.lineWidth = 6; c.beginPath(); c.arc(128, 128, 60, 0, PI * 2); c.stroke(); c.fillStyle = "#ffc21f"; c.beginPath(); c.arc(128, 128, 20, 0, PI * 2); c.fill(); });
  plane(g, 6.2, 6.2, T("#ffffff", { map: mat }), 0, 0.005, 0);
  const cols = ["#e5233b", "#ffffff", "#3dff7a"];
  for (const [x, z] of [[-3.0, -3.0], [3.0, -3.0], [-3.0, 3.0], [3.0, 3.0]] as V2[]) {
    cy(g, 0.12, 0.12, 1.7, T("#c9ced6"), x, 0.85, z, 0.02); sp(g, 0.2, T(x < 0 ? "#e5233b" : "#2a5adf"), x, 1.3, z, 0.02);
  }
  for (let k = 0; k < 3; k++) {
    const y = 0.5 + k * 0.4;
    for (const [x0, z0, w, d] of [[0, -3, 6, 0.0], [0, 3, 6, 0.0], [-3, 0, 0, 6], [3, 0, 0, 6]] as V4[]) {
      const len = w || d; const r = cy(g, 0.035, 0.035, len, T(cols[k]), x0, y, z0, 0.008, 8); if (w) r.rotation.z = PI / 2; else r.rotation.x = PI / 2;
    }
  }
  // corner pads
  for (const [x, z] of [[-3.0, -3.0], [3.0, -3.0]] as V2[]) bx(g, 0.5, 1.2, 0.5, T(x < 0 ? "#e5233b" : "#2a5adf"), x, 0.7, z).visible = false;
  // big screen over ring + truss + spotlights
  bx(g, 7.0, 3.4, 0.3, T("#0a0a12"), 0, 8.4, -12, 0.04); glow(g, 7.2, 0.08, 0.1, "#ff3d71", 0, 10.2, -11.8); glow(g, 7.2, 0.08, 0.1, "#37e0ff", 0, 6.6, -11.8);
  for (let i = 0; i < 5; i++) { bx(g, 14, 0.18, 0.18, T("#2a2a3a"), 0, 9.5 - 0, -2 - i * 2.5, 0.01).visible = i === 0; }
  bx(g, 14, 0.25, 0.25, T("#3a3a4a"), 0, 9.0, 2, 0.01); bx(g, 14, 0.25, 0.25, T("#3a3a4a"), 0, 9.0, -5, 0.01);
  for (let i = 0; i < 7; i++) { const x = -6 + i * 2; const c = cone(g, 0.5, 1.0, T("#222"), x, 8.5, 2, 0.01, 10); c.rotation.x = PI; glow(g, 0.5, 0.05, 0.5, i % 2 ? "#fff6c8" : "#8fd0ff", x, 7.96, 2, 3); }
  // light beams (additive cones)
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: ["#fff2c0", "#9fd0ff"][i % 2], transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); b.position.set(-3 + i * 2, 4.3, i % 2 ? -1 : 1); b.rotation.z = (i - 1.5) * 0.08; g.add(b); }
  // crowd stands around: back, left, right
  crowd(g, 0, -1.0, -8, 0, 24, 8, 61, 0.62, 0.55, 0.9);
  crowd(g, -8.5, -1.0, -2, PI / 2, 14, 7, 62, 0.62, 0.55, 0.9);
  crowd(g, 8.5, -1.0, -2, -PI / 2, 14, 7, 63, 0.62, 0.55, 0.9);
  crowd(g, 0, -1.0, 8.5, PI, 16, 3, 64, 0.62, 0.5, 0.9);
  // front ring apron: cameras, water bucket, stool, ring bell
  bx(g, 0.6, 0.5, 0.6, T("#e5e5ee"), -4.5, -0.75, 2, 0.02); cy(g, 0.25, 0.2, 0.5, T("#4aa0ff"), 4.4, -0.75, 3, 0.02); cy(g, 0.3, 0.3, 0.1, T("#ffc21f", { emissive: "#c07400", emissiveIntensity: 0.6 }), -4.5, -0.45, 2);
  // flash bulbs
  const fl: It[] = []; const rf = seeded(73); for (let i = 0; i < 40; i++) fl.push({ x: (rf() - 0.5) * 18, y: 0.5 + rf() * 4, z: -6 - rf() * 3 });
  inst(g, new THREE.SphereGeometry(0.06, 6, 5), glowMat("#ffffff", 2.4), fl, false);
  const lights = mkLights(["#5a62c0", "#10101c", 0.85], ["#fff2d0", 2.4, [2, 12, 5]], [["#fff4cc", 70, [0, 7.8, 1], 18], ["#9fd0ff", 55, [-4, 7.5, -2], 16], ["#ff3d71", 40, [5, 3, -9], 18], ["#37e0ff", 40, [-5, 3, -9], 18]], 9);
  return { root: g, lights, fog: new THREE.Fog("#0c0a1e", 12, 38), bg: "#0a0818", spots: { center: [0, 0, 0], cornerL: [-2.2, 0, -2.2], cornerR: [2.2, 0, -2.2], screen: [0, 8.4, -11.8] } };
}

// ================= TRACK =================
function track(): SetObj {
  const g = new THREE.Group();
  const asp = canvasTex(256, 256, (c) => { c.fillStyle = "#555a6c"; c.fillRect(0, 0, 256, 256); const r = seeded(51); for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? "#656a7c" : "#454a5a"; c.fillRect(r() * 256, r() * 256, 3, 3); } });
  plane(g, 40, 80, T("#2f7a35"), 0, -0.02, -20);
  plane(g, 7.6, 80, T("#ffffff", { map: rep(asp, 3, 20) }), 0, 0, -20);
  for (const x of [-1.2, 1.2]) for (let z = 8; z > -40; z -= 3) plane(g, 0.14, 1.6, T("#f4f4f4"), x, 0.012, z);
  for (const x of [-3.5, 3.5]) plane(g, 0.2, 80, T("#f4f4f4"), x, 0.012, -20);
  // grid box and finish line
  plane(g, 7, 0.7, T("#ffffff", { map: tileTex("#ffffff", "#111", "#111", 2, 24, 2, 64) }), 0, 0.015, -1.8);
  // kerbs
  for (const sx of [-1, 1]) for (let i = 0; i < 40; i++) bx(g, 0.5, 0.1, 1.0, T(i % 2 ? "#e5233b" : "#ffffff"), sx * 3.9, 0.05, 8 - i * 1.0, 0.0);
  // barriers + sponsor boards
  for (const sx of [-1, 1]) for (let i = 0; i < 12; i++) { bx(g, 0.2, 0.8, 3.2, T(["#ffd23a", "#2a5adf", "#e5233b", "#ffffff"][i % 4]), sx * 4.4, 0.4, 8 - i * 3.3, 0.02); }
  // grandstands
  const stand = (sx: number, z: number, seed: number) => { crowd(g, sx * 6.2, 0, z, -sx * PI / 2, 14, 8, seed, 0.62, 0.55, 0.9); bx(g, 0.3, 6, 10, T("#2a2f48"), sx * 11.5, 3, z - 0.0).castShadow = false; bx(g, 0.2, 0.5, 10, T("#e5233b"), sx * 5.0, 0.5, z, 0.01); };
  stand(-1, -2, 91); stand(1, -2, 92); stand(-1, -12, 93); stand(1, -12, 94); stand(-1, 6, 95); stand(1, 6, 96);
  // finish gantry
  for (const sx of [-1, 1]) bx(g, 0.5, 6.5, 0.5, T("#d8dce6"), sx * 3.9, 3.25, -9, 0.03);
  bx(g, 8.4, 1.6, 0.4, T("#10131c"), 0, 6.4, -9, 0.04); glow(g, 8.4, 0.08, 0.1, "#ffd23a", 0, 7.25, -8.75); glow(g, 8.4, 0.08, 0.1, "#ffd23a", 0, 5.55, -8.75);
  bx(g, 8.0, 0.7, 0.1, T("#ffffff", { map: tileTex("#fff", "#111", "#111", 2, 28, 2, 64) }), 0, 5.2, -8.9);
  // start lights
  for (let i = 0; i < 5; i++) { bx(g, 0.5, 0.5, 0.3, T("#222"), -1.2 + i * 0.6, 4.4, -9, 0.01); glowSp(g, 0.17, "#ff2a2a", -1.2 + i * 0.6, 4.4, -8.8, 2.4); }
  // tyres, cones, flags
  for (const [x, z] of [[-4.4, 2], [4.4, 1], [-4.4, -4], [4.5, -5]] as V2[]) for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.14, 8, 14), T(k % 2 ? "#222" : "#e5233b")); t.rotation.x = PI / 2; t.position.set(x, 0.14 + k * 0.28, z); t.castShadow = true; g.add(t); }
  for (let i = 0; i < 10; i++) cone(g, 0.14, 0.45, T("#ff7a1a"), -2.8 + (i % 2) * 5.6, 0.22, 4 - i * 1.0, 0.01, 8);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { cy(g, 0.03, 0.03, 3.0, T("#ccc"), sx * 4.9, 1.5, -2 - i * 4); bx(g, 0.9, 0.55, 0.03, T(i % 2 ? "#ffd23a" : "#37e0ff"), sx * 4.9 - sx * 0.45, 2.7, -2 - i * 4); }
  // floodlights
  for (const [x, z] of [[-6.5, -6], [6.5, -6], [-6.5, 4], [6.5, 4]] as V2[]) { cy(g, 0.12, 0.2, 11, T("#444"), x, 5.5, z); bx(g, 1.6, 0.9, 0.2, T("#222"), x, 11.2, z); glow(g, 1.4, 0.7, 0.05, "#fff6d0", x, 11.2, z + 0.12, 3); }
  // sky backdrop
  vplane(g, 120, 50, basic(skylineTex([[0, "#1b2a6a"], [0.6, "#e6628a"], [1, "#ffb86b"]], 33, "#241c40"), 1, false), 0, 12, -45);
  // oil stains and rubber marks
  for (let i = 0; i < 8; i++) plane(g, 0.5, 3, T("#1d1f27"), -2.5 + (i % 4) * 1.6, 0.011, 5 - i * 1.2);
  const lights = mkLights(["#ffcf9a", "#4a3a6a", 1.1], ["#ffe0b0", 2.4, [-5, 10, 6]], [["#fff6d0", 80, [-8, 10, 4], 22], ["#fff6d0", 80, [8, 10, 4], 22], ["#ff2a2a", 20, [0, 4, -8], 10], ["#ffd23a", 30, [0, 5, -8], 12]], 11);
  return { root: g, lights, fog: new THREE.Fog("#e6879a", 22, 60), bg: "#8a4a7a", spots: { start: [0, 0, 0], finish: [0, 0, -9], lane1: [-1.7, 0, 0], lane2: [1.7, 0, 0], gantry: [0, 6.4, -8.8] } };
}

// ================= GRAVEYARD =================
function graveyard(): SetObj {
  const g = new THREE.Group();
  plane(g, 50, 50, T("#ffffff", { map: noiseTex("#2e2a4e", ["#3a3560", "#25203f", "#3b6a3a"], 900, 71, 8, 8, 5) }), 0, 0, -8);
  const skyT = gradTex([[0, "#1a1240"], [0.5, "#7a3a8a"], [1, "#ff9a6a"]], 8, 256);
  vplane(g, 120, 50, basic(skyT, 1, false), 0, 14, -34); stars(g, 70, 6, 60, 10, 28, -33);
  glowSp(g, 3, "#fff2d0", -5, 9, -28, 1.4);
  for (let i = 0; i < 8; i++) { const h = cone(g, 5 + (i % 3) * 2, 5 + (i % 4) * 2, T("#241a46"), -24 + i * 7, 2.5 + (i % 4), -24, 0, 6); h.castShadow = false; }
  const rc = seeded(77);
  // tombstones
  const stoneM = T("#8d89a6"); const mossM = T("#6f7a8a");
  const tomb = (x: number, z: number, w: number, h: number, ry: number, kind: number) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = ry; g.add(t);
    bx(t, w + 0.2, 0.15, 0.5, T("#6f6c88"), 0, 0.07, 0, 0.015);
    if (kind === 0) { bx(t, w, h, 0.25, stoneM, 0, h / 2 + 0.1, 0, 0.025); const c = cy(t, w / 2, w / 2, 0.25, stoneM, 0, h + 0.1, 0, 0.025, 14); c.rotation.x = PI / 2; }
    else if (kind === 1) { bx(t, 0.25, h, 0.2, stoneM, 0, h / 2 + 0.1, 0, 0.02); bx(t, w, 0.25, 0.2, stoneM, 0, h * 0.7, 0, 0.02); }
    else { bx(t, w, h * 0.7, 0.25, mossM, 0, h * 0.35 + 0.1, 0, 0.02).rotation.z = (rc() - 0.5) * 0.3; }
  };
  for (let i = 0; i < 24; i++) { const x = (rc() - 0.5) * 8, z = 3 - rc() * 11; if (Math.abs(x) < 1.1 && z > -3.5) continue; tomb(x, z, 0.7 + rc() * 0.4, 0.8 + rc() * 0.7, (rc() - 0.5) * 0.5, i % 3); }
  // main stone (blank face) behind hero
  bx(g, 1.8, 0.2, 0.9, T("#6f6c88"), 0, 0.1, -2.4, 0.02); bx(g, 1.5, 1.7, 0.3, T("#7f7aa0"), 0, 1.05, -2.4, 0.03); const arch = cy(g, 0.75, 0.75, 0.3, T("#7f7aa0"), 0, 1.9, -2.4, 0.03, 20); arch.rotation.x = PI / 2;
  bx(g, 1.1, 0.9, 0.04, T("#9c98bc"), 0, 1.3, -2.23); // blank engraving plate
  // mound in front of the stone
  const mound = sp(g, 1.0, T("#4a3326"), 0, 0, -1.6, 0.02); mound.scale.set(1.3, 0.35, 0.9);
  // flowers
  for (let i = 0; i < 8; i++) { const x = -0.8 + i * 0.22; cy(g, 0.015, 0.015, 0.25, T("#2f7a3a"), x, 0.2, -1.2, 0, 4); sp(g, 0.07, T(["#ff4d6d", "#ffd23a", "#fff"][i % 3]), x, 0.36, -1.2); }
  // iron fence
  for (let i = 0; i < 24; i++) { for (const [x0, z0] of [[-4.2, 3], [4.2, 3]] as V2[]) { cy(g, 0.03, 0.03, 1.5, T("#1d1a2e"), x0, 0.75, z0 - i * 0.8, 0, 5); cone(g, 0.07, 0.2, T("#1d1a2e"), x0, 1.55, z0 - i * 0.8, 0, 4); } }
  for (const x of [-4.2, 4.2]) { bx(g, 0.05, 0.06, 19, T("#1d1a2e"), x, 1.1, -6.2); bx(g, 0.05, 0.06, 19, T("#1d1a2e"), x, 0.35, -6.2); }
  for (let i = 0; i < 9; i++) { cy(g, 0.03, 0.03, 1.5, T("#1d1a2e"), -8 + i * 2, 0.75, -17, 0, 5); }
  // trees, bats, pumpkins, candles, lamp
  tree(g, -2.8, -4.5, 1.8, 1, "#241a30"); tree(g, 3.6, -6.5, 1.4, 2, "#241a30"); tree(g, 2.6, -3.0, 1.0, 5, "#2a1c38"); tree(g, -6.5, -9, 2.0, 6, "#241a30");
  for (const [x, z, s] of [[2.2, -0.4, 0.35], [-1.9, 0.8, 0.28], [-3.1, -1.4, 0.4]] as V3[]) { const p = sp(g, s, T("#ff8a1a", { emissive: "#c24a00", emissiveIntensity: 0.5 }), x, s * 0.8, z, 0.02); p.scale.y = 0.8; glow(g, s * 0.5, s * 0.15, 0.02, "#ffe066", x, s * 0.9, z + s * 0.9, 2.4); cy(g, 0.04, 0.04, 0.12, T("#2f7a3a"), x, s * 1.6, z, 0, 5); }
  for (const [x, z] of [[1.0, -1.0], [-1.2, -0.7], [2.8, 1.8], [-2.6, 1.6]] as V2[]) { cy(g, 0.05, 0.05, 0.25, T("#f3ead0"), x, 0.13, z); sp(g, 0.05, glowMat("#ffcf5a", 3), x, 0.32, z, 0, 8); }
  const bats: It[] = []; for (let i = 0; i < 12; i++) bats.push({ x: (rc() - 0.5) * 10, y: 4 + rc() * 4, z: -6 - rc() * 8, s: [1.6, 0.2, 0.8], rz: rc() * 0.6 - 0.3 });
  inst(g, new THREE.OctahedronGeometry(0.22, 0), T("#0f0a1c"), bats, false);
  lampPost(g, 2.7, 0.2, "#9cf0b0", 3.2); lampPost(g, -2.8, -1.0, "#9cf0b0", 3.2);
  const gr: It[] = []; for (let i = 0; i < 120; i++) gr.push({ x: (rc() - 0.5) * 16, y: 0.15, z: 6 - rc() * 16, s: [0.7, 0.6 + rc(), 0.7], c: rc() < 0.5 ? "#3f7a4a" : "#5a8a3a" });
  inst(g, new THREE.ConeGeometry(0.1, 0.4, 4), T("#ffffff"), gr, false);
  // ground mist
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(2 + (i % 3), 20), new THREE.MeshBasicMaterial({ color: "#b8a8e8", transparent: true, opacity: 0.12, depthWrite: false })); m.rotation.x = -PI / 2; m.position.set((i - 4) * 1.6, 0.25 + (i % 2) * 0.1, 3 - i * 1.4); g.add(m); }
  const lights = mkLights(["#8a7ac8", "#2a1f50", 1.0], ["#d0d0ff", 2.0, [-5, 11, 6]], [["#9cf0b0", 40, [4, 3.2, 1], 10], ["#9cf0b0", 40, [-4.4, 3.2, 0.4], 10], ["#ffcf5a", 6, [0, 0.6, -0.6], 6], ["#ff8a5a", 50, [0, 3, -16], 22]], 10);
  return { root: g, lights, fog: new THREE.Fog("#4a2f6a", 10, 36), bg: "#3a2260", spots: { stone: [0, 1.3, -2.25], mound: [0, 0.2, -1.6], front: [0, 0, 0] } };
}

// ================= STREET =================
function street(): SetObj {
  const g = new THREE.Group();
  const asp = canvasTex(256, 256, (c) => { c.fillStyle = "#2b2d3a"; c.fillRect(0, 0, 256, 256); const r = seeded(81); for (let i = 0; i < 700; i++) { c.fillStyle = r() < 0.5 ? "#353848" : "#222430"; c.fillRect(r() * 256, r() * 256, 3, 3); } });
  plane(g, 6, 70, T("#ffffff", { map: rep(asp, 2, 14) }), 0, 0, -24);
  for (let z = 6; z > -40; z -= 3) plane(g, 0.2, 1.6, T("#ffd23a"), 0, 0.012, z);
  for (let i = 0; i < 7; i++) plane(g, 0.7, 3.4, T("#f0f0f0"), -2.4 + i * 0.8, 0.013, -3.5).visible = true;
  for (const sx of [-1, 1]) { bx(g, 2.6, 0.2, 70, T("#7d7a8c"), sx * 4.3, 0.1, -24); bx(g, 0.2, 0.22, 70, T("#a8a5bb"), sx * 3.0, 0.1, -24); for (let z = 8; z > -40; z -= 2) bx(g, 2.6, 0.21, 0.04, T("#5f5c70"), sx * 4.3, 0.1, z); }
  // buildings
  const rc = seeded(82); const bcols = ["#3a2f5e", "#2d3a66", "#5a2f66", "#2f4f66", "#663a4f"];
  for (const sx of [-1, 1]) {
    let z = 5;
    for (let i = 0; i < 9; i++) {
      const w = 3.2 + rc() * 2.2, h = 7 + rc() * 12, d = 4 + rc() * 2;
      const tex = winTex(bcols[(i + (sx > 0 ? 2 : 0)) % bcols.length], 7, Math.round(h / 0.9), 90 + i + (sx > 0 ? 20 : 0), undefined, 128, Math.round(h * 24));
      const bm = new THREE.MeshBasicMaterial({ map: tex }); bm.color.setScalar(1.25);
      const b = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), [bm, bm, new THREE.MeshToonMaterial({ color: "#1d1a30" }), bm, bm, bm].map((m, k) => (k === (sx > 0 ? 1 : 0) ? bm : m)));
      b.position.set(sx * (5.6 + d / 2), h / 2, z - w / 2); g.add(b); outline(b, 0.04);
      // shop front glow
      bx(g, 0.2, 1.8, w * 0.8, T(["#ff4d6d", "#37e0ff", "#ffd23a", "#7cff6b"][i % 4], { emissive: ["#ff4d6d", "#37e0ff", "#ffd23a", "#7cff6b"][i % 4], emissiveIntensity: 0.8 }), sx * 5.55, 1.2, z - w / 2);
      bx(g, 1.4, 0.6, w * 0.6, T("#14121c"), sx * 5.0, 3.2, z - w / 2, 0.01); glow(g, 0.05, 0.4, w * 0.5, ["#ff4da6", "#37e0ff", "#ffd23a"][i % 3], sx * 4.28, 3.2, z - w / 2, 2.4);
      z -= w + 0.2;
    }
    // end building
  }
  const endTex = winTex("#2d2a50", 8, 20, 120, undefined, 256, 512);
  bx(g, 16, 22, 1, new THREE.MeshBasicMaterial({ map: endTex }), 0, 11, -34);
  // lamp posts, hydrant, bins, bus stop, cars
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) lampPost(g, sx * 3.3, 2 - i * 5.5, "#ffcf6b", 4.2);
  for (const [x, z] of [[-3.4, 2.8], [3.4, 1.6]] as V2[]) { cy(g, 0.14, 0.17, 0.6, T("#e5233b"), x, 0.4, z, 0.02); sp(g, 0.15, T("#e5233b"), x, 0.75, z); }
  for (const [x, z] of [[-3.9, -1], [4.0, -3.5], [-3.8, 5]] as V2[]) { cy(g, 0.28, 0.25, 0.8, T("#5a6a7a"), x, 0.5, z, 0.02); cy(g, 0.3, 0.3, 0.06, T("#3a4a5a"), x, 0.93, z); }
  const car = (x: number, z: number, c: string, ry = 0) => { const k = new THREE.Group(); k.position.set(x, 0, z); k.rotation.y = ry; g.add(k); bx(k, 1.8, 0.6, 3.8, T(c), 0, 0.55, 0, 0.03); bx(k, 1.5, 0.55, 2.0, T("#9fdcff"), 0, 1.05, -0.2, 0.025); for (const [dx, dz] of [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]]) { const w = cy(k, 0.35, 0.35, 0.25, T("#111"), dx, 0.35, dz); w.rotation.z = PI / 2; } glow(k, 0.3, 0.15, 0.05, "#fff6c0", -0.6, 0.6, 1.92, 3); glow(k, 0.3, 0.15, 0.05, "#fff6c0", 0.6, 0.6, 1.92, 3); glow(k, 0.3, 0.15, 0.05, "#ff2a2a", -0.6, 0.6, -1.92, 2.4); glow(k, 0.3, 0.15, 0.05, "#ff2a2a", 0.6, 0.6, -1.92, 2.4); };
  car(1.7, -6, "#e5233b"); car(-1.7, -12, "#ffd23a", PI); car(1.7, -19, "#2a9df4"); car(-1.7, -25, "#7cff6b"); car(1.9, 5, "#ff8a1a");
  // traffic light
  cy(g, 0.06, 0.06, 4.5, T("#222"), 3.5, 2.25, -7); bx(g, 0.4, 1.2, 0.3, T("#111"), 3.5, 4.6, -7); glowSp(g, 0.13, "#ff2a2a", 3.5, 4.95, -6.82); glowSp(g, 0.13, "#ffd23a", 3.5, 4.6, -6.82, 1); glowSp(g, 0.13, "#2aff6a", 3.5, 4.25, -6.82, 1);
  // night sky & moon
  vplane(g, 120, 60, basic(gradTex([[0, "#0a0a28"], [0.7, "#2a1a5a"], [1, "#6a3a8a"]], 8, 256), 1, false), 0, 20, -45); stars(g, 80, 8, 40, 14, 34, -44); glowSp(g, 1.8, "#fff2d0", 6, 18, -42, 1.4);
  // steam / posters
  for (let i = 0; i < 3; i++) vplane(g, 1.0, 1.5, basic(posterTex(["#ff6f61", "#ffd54a", "#6bc5ff"][i], "#fff", 130 + i)), 5.62, 2.4, -3 - i * 4, -PI / 2);
  const lights = mkLights(["#7a7ae0", "#22184a", 1.05], ["#c8c8ff", 1.8, [-5, 12, 6]], [["#ffcf6b", 45, [-4.2, 4, 2], 11], ["#ffcf6b", 45, [4.2, 4, -3.5], 11], ["#ffcf6b", 45, [-4.2, 4, -9], 11], ["#ff4da6", 40, [-5.5, 3, -3], 12], ["#37e0ff", 40, [5.5, 3, -6], 12]], 10);
  return { root: g, lights, fog: new THREE.Fog("#241a50", 14, 44), bg: "#1a1240", spots: { road: [0, 0, 0], curbL: [-4.6, 0.2, 0], curbR: [4.6, 0.2, 0], crosswalk: [0, 0, -3.5], shop: [-6, 3.2, -4] } };
}

// ================= BEACH =================
function beach(): SetObj {
  const g = new THREE.Group();
  plane(g, 60, 40, T("#ffffff", { map: noiseTex("#f2d49a", ["#e8c58a", "#f9e0ac", "#d9b274"], 1200, 91, 8, 6, 3) }), 0, 0, 4);
  plane(g, 60, 12, T("#ffffff", { map: noiseTex("#c9a366", ["#b78f55", "#d6b078"], 600, 92, 8, 2, 4) }), 0, 0.001, -17);
  // sea
  const sea = canvasTex(256, 256, (c) => { c.fillStyle = "#1fa8d8"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#8fe6ff"; c.lineWidth = 4; const r = seeded(93); for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 256; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 8, x + 30, y); c.stroke(); } });
  plane(g, 120, 40, T("#ffffff", { map: rep(sea, 12, 4), emissive: "#0a5a80", emissiveIntensity: 0.5 }), 0, 0.02, -34);
  for (let i = 0; i < 6; i++) plane(g, 40, 0.5 + (i % 2) * 0.3, T("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.4 }), (i - 3) * 6, 0.03, -12.5 - (i % 3) * 0.2);
  // sky + sun
  vplane(g, 160, 60, basic(gradTex([[0, "#2a8ae0"], [0.6, "#7fd0ff"], [1, "#ffe9b0"]], 8, 256), 1, false), 0, 24, -60);
  glowSp(g, 3, "#fff3a8", 9, 15, -55, 1.5);
  const rc = seeded(94);
  for (let i = 0; i < 7; i++) { const cx = -30 + i * 10 + rc() * 4, cyy = 14 + rc() * 12; for (let k = 0; k < 4; k++) { const s = sp(g, 2.5 + rc() * 1.8, new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false }), cx + k * 2.4, cyy + (k % 2) * 0.8, -52, 0, 12); s.scale.y = 0.6; s.castShadow = false; } }
  // boat
  bx(g, 3.4, 0.7, 1.2, T("#e5233b"), -8, 0.5, -24, 0.03); bx(g, 0.1, 3, 0.1, T("#8a5a30"), -8, 2.2, -24); const sail = bx(g, 0.05, 2.4, 1.8, T("#ffffff"), -8, 2.3, -24.0); sail.scale.set(1, 1, 1);
  // umbrella
  const ux = 1.3, uz = -1.4;
  cy(g, 0.04, 0.04, 2.6, T("#fff"), ux, 1.3, uz, 0.012, 8).rotation.z = 0.08;
  for (let i = 0; i < 8; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8, 1, true, (i / 8) * PI * 2, PI * 2 / 8), new THREE.MeshToonMaterial({ color: i % 2 ? "#ffffff" : "#e5233b", side: THREE.DoubleSide, gradientMap: (T("#fff") as THREE.MeshToonMaterial).gradientMap })); w.position.set(ux + 0.1, 2.75, uz); w.castShadow = true; g.add(w); }
  sp(g, 0.1, T("#ffc21f"), ux + 0.1, 3.15, uz);
  // towel, cooler, ball, sandcastle, shells, flip-flops
  bx(g, 2.2, 0.03, 1.5, T("#37e0ff"), 1.2, 0.03, -0.9); for (let i = 0; i < 5; i++) bx(g, 2.2, 0.035, 0.12, T("#ffffff"), 1.2, 0.035, -1.4 + i * 0.3);
  bx(g, 0.9, 0.6, 0.55, T("#e5233b"), 2.3, 0.3, -0.9, 0.03); bx(g, 0.95, 0.12, 0.6, T("#ffffff"), 2.3, 0.64, -0.9, 0.02); bx(g, 0.5, 0.05, 0.05, T("#222"), 2.3, 0.72, -0.6);
  const ball = sp(g, 0.35, T("#ffffff"), -1.2, 0.35, 2.0, 0.02); void ball; for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.352, 12, 10, i * PI / 2, PI / 4), T(["#e5233b", "#ffd23a", "#2a9df4", "#7cff6b"][i])); b.position.set(-1.2, 0.35, 2.0); g.add(b); }
  cy(g, 0.6, 0.7, 0.5, T("#e8c58a"), -1.5, 0.25, -0.7, 0.02, 14); cy(g, 0.35, 0.4, 0.5, T("#e8c58a"), -1.5, 0.75, -0.7, 0.02, 12); cone(g, 0.2, 0.3, T("#e8c58a"), -1.5, 1.15, -0.7, 0.02, 8); cy(g, 0.01, 0.01, 0.5, T("#8a5a30"), -1.5, 1.4, -0.7); bx(g, 0.2, 0.12, 0.02, T("#e5233b"), -1.4, 1.55, -0.7);
  for (let i = 0; i < 6; i++) sp(g, 0.1, T(["#ffb6c1", "#fff", "#ffd9a8"][i % 3]), -1.5 + i * 0.5, 0.05, 2.8 + (i % 2), 0, 6).scale.y = 0.5;
  bx(g, 0.2, 0.04, 0.5, T("#ff6bd6"), 1.0, 0.03, 1.5); bx(g, 0.2, 0.04, 0.5, T("#ff6bd6"), 1.3, 0.03, 1.6);
  // palms
  const palm = (x: number, z: number, s: number, lean: number) => {
    const p = new THREE.Group(); p.position.set(x, 0, z); p.scale.setScalar(s); g.add(p);
    for (let i = 0; i < 6; i++) { const y = i * 0.7; cy(p, 0.2 - i * 0.015, 0.23 - i * 0.015, 0.75, T(i % 2 ? "#a8672f" : "#8a5524"), lean * i * i * 0.04, y + 0.35, 0, 0.02, 8); }
    const topx = lean * 25 * 0.04 * 0.0 + lean * 36 * 0.04 * 0.0; void topx;
    const tx = lean * 5 * 5 * 0.04 + 0.0;
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; const l = cone(p, 0.35, 2.4, T(i % 2 ? "#2fae4f" : "#3ecb62"), tx + Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9, 0.015, 4); l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); l.scale.set(1, 1, 0.3); }
    sp(p, 0.2, T("#6b3f1d"), tx + 0.15, 3.95, 0.1); sp(p, 0.2, T("#6b3f1d"), tx - 0.15, 3.95, -0.1);
  };
  palm(-2.6, -3.5, 1.4, 0.35); palm(3.4, -4, 1.6, -0.3); palm(-6.5, -9, 1.5, 0.3); palm(7, -10, 1.3, -0.3);
  // dunes, lifeguard tower, distant umbrellas, tiny people
  for (let i = 0; i < 6; i++) { const d = sp(g, 3.5 + (i % 3), T("#ebc98a"), -14 + i * 5.6, 0, 8 + (i % 2) * 2, 0, 12); d.scale.y = 0.18; }
  bx(g, 1.6, 0.15, 1.6, T("#fff"), -3.6, 2.1, -6, 0.02); bx(g, 1.4, 1.2, 1.4, T("#e5233b"), -3.6, 2.8, -6, 0.02); for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(g, 0.06, 0.06, 2.1, T("#8a5a30"), -3.6 + sx * 0.7, 1.05, -6 + sz * 0.7, 0, 6);
  cone(g, 1.2, 0.5, T("#ffffff"), -3.6, 3.65, -6, 0.02, 4).rotation.y = PI / 4;
  const far: It[] = []; for (let i = 0; i < 24; i++) far.push({ x: (rc() - 0.5) * 16, y: 0.5, z: -6 - rc() * 5, c: ["#ff4d6d", "#ffd23a", "#3ad1ff", "#7cff6b", "#c77dff"][i % 5], s: 0.7 + rc() * 0.5 });
  inst(g, new THREE.ConeGeometry(0.6, 0.35, 8), T("#ffffff"), far.map((f) => ({ ...f, y: 1.1 })), true); inst(g, new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), T("#fff"), far.map((f) => ({ ...f, y: 0.55 })), false);
  const lights = mkLights(["#cfeaff", "#e8c58a", 1.5], ["#fff0c8", 2.8, [7, 12, 6]], [["#ffe9b0", 40, [3, 4, 3], 14]], 10);
  return { root: g, lights, fog: new THREE.Fog("#bfe6ff", 30, 90), bg: "#8fd0ff", spots: { sand: [0, 0, 0], umbrella: [2.0, 0, -1.2], cooler: [3.1, 0.7, -1.0], sun: [9, 15, -55] } };
}


// ================= COURT =================
function court(): SetObj {
  const g = new THREE.Group(); const S = 36;
  const ct = canvasTex(540, 1008, (c) => {
    c.fillStyle = "#d9a463"; c.fillRect(0, 0, 540, 1008);
    for (let i = 0; i < 30; i++) { c.fillStyle = i % 2 ? "#cf9857" : "#e2b070"; c.fillRect(i * 18, 0, 18, 1008); }
    c.strokeStyle = "rgba(90,50,20,0.3)"; c.lineWidth = 1; for (let i = 0; i <= 30; i++) { c.beginPath(); c.moveTo(i * 18, 0); c.lineTo(i * 18, 1008); c.stroke(); }
    const X = (x: number) => (x + 7.5) * S, Z = (z: number) => (z + 6.2) * S;
    c.fillStyle = "#5a2d9c"; c.fillRect(X(-2.45), Z(-6.2), 4.9 * S, 6.15 * S);
    c.fillStyle = "#6c3bb8"; c.beginPath(); c.arc(X(0), Z(-0.05), 1.8 * S, 0, PI); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 0.09 * S;
    c.strokeRect(X(-7.45), Z(-6.15), 14.9 * S, 27.9 * S);
    c.strokeRect(X(-2.45), Z(-6.15), 4.9 * S, 6.1 * S);
    c.beginPath(); c.arc(X(0), Z(-0.05), 1.8 * S, 0, PI); c.stroke();
    c.setLineDash([8, 8]); c.beginPath(); c.arc(X(0), Z(-0.05), 1.8 * S, PI, PI * 2); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(X(0), Z(-4.63), 1.25 * S, 0, PI); c.stroke();
    const a = Math.atan2(1.416, 6.6);
    c.beginPath(); c.moveTo(X(-6.6), Z(-6.15)); c.lineTo(X(-6.6), Z(-3.21)); c.arc(X(0), Z(-4.63), 6.75 * S, PI - a, a, true); c.lineTo(X(6.6), Z(-6.15)); c.stroke();
    c.beginPath(); c.moveTo(X(-7.45), Z(7.8)); c.lineTo(X(7.45), Z(7.8)); c.stroke();
    c.fillStyle = "#ffc21f"; c.beginPath(); c.arc(X(0), Z(7.8), 1.8 * S, 0, PI * 2); c.fill(); c.stroke();
  });
  plane(g, 46, 54, T("#26335e"), 0, 0, 2);
  plane(g, 15, 28, T("#ffffff", { map: ct }), 0, 0.01, 7.8);
  // hoop, backboard, padded stanchion behind the origin
  bx(g, 1.0, 2.0, 0.9, T("#1b2a5a"), 0, 1.0, -7.4, 0.03); bx(g, 1.02, 0.5, 0.92, T("#ffc21f"), 0, 0.3, -7.4);
  cy(g, 0.1, 0.1, 3.3, T("#8a93a8"), 0, 1.65, -7.3, 0.02, 10); bx(g, 0.14, 0.14, 2.4, T("#8a93a8"), 0, 3.3, -6.15, 0.02);
  bx(g, 1.8, 1.05, 0.06, T("#e8f6ff", { emissive: "#7aa0c0", emissiveIntensity: 0.25 }), 0, 3.45, -5.0, 0.025);
  for (const [w, h, x, y] of [[0.6, 0.05, 0, 3.075], [0.6, 0.05, 0, 3.545], [0.05, 0.5, -0.3, 3.31], [0.05, 0.5, 0.3, 3.31]] as V4[]) glow(g, w, h, 0.02, "#ff6a1a", x, y, -4.965, 1.3);
  ring(g, 0.23, 0.022, "#ff6a1a", 0, 3.05, -4.72, PI / 2, 0, 1.4); bx(g, 0.1, 0.04, 0.3, T("#ff6a1a"), 0, 3.05, -4.93);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.14, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true })); net.position.set(0, 2.83, -4.72); g.add(net);
  // ball
  const cball = new THREE.Group(); cball.userData.setBall = true; g.add(cball);   // Ah.tsx hides it when the shot already shows a ball thing
  sp(cball, 0.12, T("#ff7a1a"), 1.0, 0.12, 1.6, 0.012);
  for (const rx of [0, PI / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 4, 18), T("#1b120a")); t.position.set(1.0, 0.12, 1.6); t.rotation.set(rx, 0.3, 0); cball.add(t); }
  // arena shell
  bx(g, 46, 16, 0.6, T("#1c2444"), 0, 8, -18.5).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.6, 16, 56, T("#1c2444"), sx * 17, 8, 4).castShadow = false;
  bx(g, 46, 0.4, 56, T("#12172e"), 0, 13, 4).castShadow = false;
  for (const z of [-12, -5, 2, 9]) for (const x of [-8, -3, 3, 8]) glow(g, 2.6, 0.12, 1.2, "#fff4d8", x, 12.7, z, 2.4);
  for (let i = 0; i < 6; i++) { const x = -12 + i * 4.8; bx(g, 2.2, 3.2, 0.12, T(["#5a2d9c", "#ffc21f", "#ffffff"][i % 3]), x, 10, -18.1, 0.02); glow(g, 2.3, 0.07, 0.05, "#ffc21f", x, 11.7, -18.0, 1.4); }
  // stands with crowd (back, left, right + upper tier)
  const pal = ["#7b3fe4", "#ffc21f", "#ffffff", "#2a2a3a", "#ff4d6d", "#3ad1ff"];
  bx(g, 40, 3.3, 4.2, T("#2a335c"), 0, 1.65, -16.3);
  crowd(g, 0, 0, -9.7, 0, 40, 6, 31, 0.62, 0.55, 0.8, pal, true);
  crowd(g, 0, 3.3, -14.7, 0, 40, 5, 34, 0.62, 0.5, 0.8, pal, true);
  crowd(g, -9.8, 0, 2, PI / 2, 30, 6, 32, 0.6, 0.5, 0.8, pal, true);
  crowd(g, 9.8, 0, 2, -PI / 2, 30, 6, 35, 0.6, 0.5, 0.8, pal, true);
  // LED ribbon boards, scoreboard, bench
  panel(g, 9, 0.8, 0, 0.55, -8.6, "#ffc21f", 0, "#10102a"); panel(g, 5, 0.8, -8.5, 0.55, -8.5, "#7b3fe4", 0, "#10102a"); panel(g, 5, 0.8, 8.5, 0.55, -8.5, "#7b3fe4", 0, "#10102a");
  const sb = canvasTex(512, 256, (c) => {
    c.fillStyle = "#06060e"; c.fillRect(0, 0, 512, 256); c.textAlign = "center"; c.font = "bold 34px Arial";
    // HOME score left, AWAY score right, the clock in its own box between them with clear gaps (Nov 16: "882:4185" ran together)
    c.fillStyle = "#ffc21f"; c.fillText("HOME", 88, 62); c.fillText("AWAY", 424, 62);
    c.font = "bold 104px Courier New"; c.fillStyle = "#ff4d3a"; c.fillText("88", 88, 178); c.fillText("85", 424, 178);
    c.fillStyle = "#10102a"; c.fillRect(176, 40, 160, 176); c.strokeStyle = "#8ae0ff"; c.lineWidth = 3; c.strokeRect(176, 40, 160, 176);
    c.font = "bold 30px Arial"; c.fillStyle = "#8ae0ff"; c.fillText("4TH", 256, 82);
    c.font = "bold 52px Courier New"; c.fillStyle = "#ffe36a"; c.fillText("2:41", 256, 160);
    c.font = "bold 20px Arial"; c.fillStyle = "#ffc21f"; c.fillText("QUARTER", 256, 196);
    c.strokeStyle = "#ffc21f"; c.lineWidth = 6; c.strokeRect(6, 6, 500, 244);
  });
  bx(g, 4.8, 2.4, 0.7, T("#0c0c18"), 0, 7.0, -8.0, 0.04); const sbp = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), basic(sb, 1.25, false)); sbp.position.set(0, 7.0, -7.64); g.add(sbp);
  for (const sx of [-1, 1]) cy(g, 0.03, 0.03, 6, T("#444"), sx * 2.0, 10.0, -8.0);
  bx(g, 3.2, 0.5, 0.7, T("#2a2a3a"), 7.6, 0.3, 4.2, 0.02); cy(g, 0.22, 0.2, 0.7, T("#ff8a1a"), 7.6, 0.85, 3.2, 0.02); cy(g, 0.23, 0.23, 0.1, T("#ffffff"), 7.6, 1.24, 3.2);
  const lights = mkLights(["#dfe6ff", "#8a6a50", 1.2], ["#fff0d8", 2.2, [3, 12, 8]], [["#fff4d8", 40, [0, 8, 1], 18], ["#fff4d8", 40, [0, 7, -6], 16], ["#ffc21f", 25, [0, 4, -7], 10]], 12);
  return { root: g, lights, fog: new THREE.Fog("#232c48", 28, 70), bg: "#1b2238", spots: { court: [0, 0, 0], hoop: [0, 3.05, -4.72], backboard: [0, 3.45, -4.95], scoreboard: [0, 7.0, -7.6], sign: [0, 0.55, -8.5], ball: [1.0, 0.12, 1.6] } };
}

// ================= PITCH =================
function pitch(): SetObj {
  const g = new THREE.Group(); const S = 25.6;
  const pt = canvasTex(1024, 1024, (c) => {
    for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? "#2f9a46" : "#3aad52"; c.fillRect(0, i * 64, 1024, 64); }
    const X = (x: number) => (x + 20) * S, Z = (z: number) => (z + 6) * S;
    c.strokeStyle = "#f4f7f0"; c.lineWidth = 6; c.fillStyle = "#f4f7f0";
    c.beginPath(); c.moveTo(X(-16), Z(-5.97)); c.lineTo(X(16), Z(-5.97)); c.moveTo(X(-16), Z(-6)); c.lineTo(X(-16), Z(34)); c.moveTo(X(16), Z(-6)); c.lineTo(X(16), Z(34)); c.stroke();
    c.strokeRect(X(-8), Z(-6), 16 * S, 9 * S); c.strokeRect(X(-3.5), Z(-6), 7 * S, 3 * S);
    c.beginPath(); c.arc(X(0), Z(0), 3.6 * S, Math.asin(3 / 3.6), PI - Math.asin(3 / 3.6)); c.stroke();
    c.beginPath(); c.arc(X(0), Z(0), 0.22 * S, 0, PI * 2); c.fill();
    c.beginPath(); c.moveTo(X(-16), Z(22)); c.lineTo(X(16), Z(22)); c.stroke(); c.beginPath(); c.arc(X(0), Z(22), 4 * S, 0, PI * 2); c.stroke();
  });
  plane(g, 120, 100, T("#1d6a33"), 0, 0, -10);
  plane(g, 40, 40, T("#ffffff", { map: pt }), 0, 0.01, 14);
  // goal + net
  const post = T("#ffffff");
  for (const sx of [-1, 1]) { cy(g, 0.07, 0.07, 2.6, post, sx * 3.2, 1.3, -6, 0.015, 10); cy(g, 0.05, 0.05, 2.6, post, sx * 3.2, 1.3, -8, 0, 8); }
  const cb = cy(g, 0.07, 0.07, 6.5, post, 0, 2.6, -6, 0.015, 10); cb.rotation.z = PI / 2;
  const nt = canvasTex(128, 64, (c) => { c.clearRect(0, 0, 128, 64); c.strokeStyle = "#ffffff"; c.lineWidth = 3; for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, 64); c.stroke(); } for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 8); c.lineTo(128, j * 8); c.stroke(); } });
  const nm = () => new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  vplane(g, 6.4, 2.6, nm(), 0, 1.3, -8); vplane(g, 2, 2.6, nm(), -3.2, 1.3, -7, PI / 2); vplane(g, 2, 2.6, nm(), 3.2, 1.3, -7, PI / 2);
  const rf = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), nm()); rf.rotation.x = -PI / 2; rf.position.set(0, 2.6, -7); g.add(rf);
  // ball, cones, bibs
  const sball = new THREE.Group(); sball.userData.setBall = true; g.add(sball);   // Ah.tsx hides it when the shot is about American football
  sp(sball, 0.22, T("#ffffff"), 0.4, 0.22, 0.5, 0.015);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; sp(sball, 0.07, T("#1b1b22"), 0.4 + Math.cos(a) * 0.2, 0.22 + Math.sin(a * 1.3) * 0.15, 0.5 + Math.sin(a) * 0.15, 0, 6); }
  for (const [x, z] of [[-2.2, 2.6], [-1.2, 3.4], [-0.2, 4.2], [2.6, 2.4]] as V2[]) { cone(g, 0.18, 0.4, T("#ff8a1a"), x, 0.2, z, 0.012, 10); cy(g, 0.22, 0.22, 0.03, T("#ff8a1a"), x, 0.02, z); }
  // advertising boards (blank centre sign) and stands
  const adc = ["#e5233b", "#ffc21f", "#2a7de0", "#7cff6b", "#ff4da6", "#ffffff"];
  for (let i = -6; i <= 6; i++) { if (Math.abs(i) < 2) continue; bx(g, 2.3, 0.9, 0.12, T(adc[(i + 6) % 6], { emissive: adc[(i + 6) % 6], emissiveIntensity: 0.5 }), i * 2.4, 0.45, -9.0, 0.02); }
  panel(g, 4.6, 0.9, 0, 0.5, -9.0, "#37f58a", 0, "#07110c");
  bx(g, 44, 0.8, 4, T("#27304a"), 0, 0.4, -10.8);
  const pal = ["#e5233b", "#ffffff", "#2a7de0", "#ffc21f", "#2a2a3a", "#7cff6b"];
  crowd(g, 0, 0.6, -11.8, 0, 52, 8, 41, 0.62, 0.55, 0.8, pal, true);
  crowd(g, -17.5, 0, 6, PI / 2, 40, 6, 43, 0.6, 0.5, 0.8, pal, true); crowd(g, 17.5, 0, 6, -PI / 2, 40, 6, 44, 0.6, 0.5, 0.8, pal, true);
  bx(g, 44, 0.4, 10, T("#1a2038"), 0, 7.6, -17, 0.03); glow(g, 40, 0.1, 0.1, "#fff4d8", 0, 7.35, -12.2, 2.2);
  bx(g, 44, 9, 0.5, T("#161c32"), 0, 4.5, -21.5);
  for (let i = -9; i <= 9; i++) glow(g, 1.1, 0.14, 0.06, "#fff4d8", i * 2, 7.4, -12.15, 2.4);
  panel(g, 6.4, 2.4, 0, 5.2, -11.4, "#8ae0ff", 0, "#04060c");
  // floodlight towers
  for (const sx of [-1, 1]) {
    cy(g, 0.14, 0.2, 9, T("#3a4058"), sx * 5.6, 4.5, -9.6, 0.02, 8);
    const hd = bx(g, 2.2, 1.5, 0.25, T("#20263a"), sx * 5.6, 9.2, -9.5, 0.03);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) glow(g, 0.55, 0.55, 0.05, "#fffbe8", sx * 5.6 + (i - 1) * 0.7, 9.2 + (j - 0.5) * 0.7, -9.35, 3.2);
    void hd;
  }
  // night sky
  vplane(g, 200, 80, basic(gradTex([[0, "#03040f"], [0.6, "#0d1840"], [1, "#2a3a78"]], 8, 256), 1, false), 0, 30, -70); stars(g, 120, 51, 100, 12, 50, -69); glowSp(g, 2.4, "#fff6d0", -14, 22, -66, 1.3);
  const lights = mkLights(["#9cb4ff", "#1d4a2a", 1.0], ["#e8f0ff", 2.4, [4, 13, 6]], [["#fffbe8", 60, [-5.6, 8.5, -8.5], 22], ["#fffbe8", 60, [5.6, 8.5, -8.5], 22], ["#fffbe8", 40, [0, 7, 6], 18]], 12);
  return { root: g, lights, fog: new THREE.Fog("#0f1a3a", 30, 75), bg: "#0a1030", spots: { spot: [0, 0, 0], goal: [0, 1.3, -6], ball: [0.4, 0.22, 0.5], sign: [0, 0.5, -8.92], screen: [0, 5.2, -11.3] } };
}

// ================= DIAMOND (baseball field) =================
function diamond(): SetObj {
  const g = new THREE.Group(); const S = 12.8, HZ = 0.9;   // home plate at z = HZ; 1024 px texture over 80 m (x -40..40, z -70..10)
  const X = (x: number) => (x + 40) * S, Z = (z: number) => (z + 70) * S;
  const dt = canvasTex(1024, 1024, (c) => {
    for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? "#2f9a46" : "#3aad52"; c.fillRect(0, i * 51.2, 1024, 52); }
    const base = [[0, HZ], [5.8, HZ - 5.8], [0, HZ - 11.6], [-5.8, HZ - 5.8]];
    // infield dirt: a big arc behind the bases plus a circle round home plate and the mound
    c.fillStyle = "#b9814f";
    c.beginPath(); c.arc(X(0), Z(HZ - 5.8), 9.6 * S, PI, 0); c.lineTo(X(9.6), Z(HZ - 3)); c.lineTo(X(0), Z(HZ + 3.2)); c.lineTo(X(-9.6), Z(HZ - 3)); c.closePath(); c.fill();
    c.fillStyle = "#3aad52"; c.beginPath(); c.moveTo(X(0), Z(HZ - 1.8)); c.lineTo(X(3.9), Z(HZ - 5.8)); c.lineTo(X(0), Z(HZ - 9.8)); c.lineTo(X(-3.9), Z(HZ - 5.8)); c.closePath(); c.fill();   // grass diamond inside
    c.fillStyle = "#b9814f"; c.beginPath(); c.arc(X(0), Z(HZ), 2.2 * S, 0, PI * 2); c.fill(); c.beginPath(); c.arc(X(0), Z(HZ - 5.5), 2.0 * S, 0, PI * 2); c.fill();
    // foul lines and batter's boxes
    c.strokeStyle = "#f4f7f0"; c.lineWidth = 5; c.fillStyle = "#f4f7f0";
    c.beginPath(); c.moveTo(X(0), Z(HZ)); c.lineTo(X(30), Z(HZ - 30)); c.moveTo(X(0), Z(HZ)); c.lineTo(X(-30), Z(HZ - 30)); c.stroke();
    c.strokeRect(X(-1.4), Z(HZ - 0.9), 0.9 * S, 1.8 * S); c.strokeRect(X(0.5), Z(HZ - 0.9), 0.9 * S, 1.8 * S);
    c.beginPath(); c.moveTo(X(0), Z(HZ + 0.3)); c.lineTo(X(0.35), Z(HZ)); c.lineTo(X(0.35), Z(HZ - 0.3)); c.lineTo(X(-0.35), Z(HZ - 0.3)); c.lineTo(X(-0.35), Z(HZ)); c.closePath(); c.fill();   // home plate
    void base;
  });
  plane(g, 140, 100, T("#1d6a33"), 0, 0, -30);
  plane(g, 80, 80, T("#ffffff", { map: dt }), 0, 0.01, -30);
  // bases + pitcher's mound (rubber)
  for (const [x, z] of [[5.8, HZ - 5.8], [0, HZ - 11.6], [-5.8, HZ - 5.8]] as V2[]) bx(g, 0.5, 0.12, 0.5, T("#ffffff"), x, 0.07, z, 0.015).rotation.y = PI / 4;
  const mound = cy(g, 1.3, 1.9, 0.28, T("#b9814f"), 0, 0.14, HZ - 5.5, 0.015, 24); mound.receiveShadow = true;
  bx(g, 0.6, 0.05, 0.14, T("#ffffff"), 0, 0.3, HZ - 5.5);
  // outfield wall: a curved padded wall with a yellow top rail, scoreboard and ads
  const R = 21, wallM = T("#14407a"), n = 22;
  for (let i = 0; i < n; i++) {
    const a = -PI * 0.46 + (i / (n - 1)) * PI * 0.92, x = Math.sin(a) * R, z = HZ - Math.cos(a) * R;
    const w = bx(g, 2.5, 2.2, 0.35, wallM, x, 1.1, z, 0.02); w.rotation.y = -a;
    const r = bx(g, 2.5, 0.12, 0.42, T("#ffc21f", { emissive: "#6a4a00", emissiveIntensity: 0.4 }), x, 2.26, z); r.rotation.y = -a;
    if (i % 3 === 1) { const ad = bx(g, 1.7, 0.9, 0.05, T(["#e5233b", "#ffffff", "#2a7de0", "#7cff6b"][i % 4], { emissive: "#303030", emissiveIntensity: 0.4 }), x - Math.sin(a) * 0.2, 1.1, z + Math.cos(a) * 0.2); ad.rotation.y = -a; }
  }
  const warn = T("#8a5a3a");
  for (let i = 0; i < n - 1; i++) { const a = -PI * 0.46 + ((i + 0.5) / (n - 1)) * PI * 0.92, x = Math.sin(a) * (R - 1.2), z = HZ - Math.cos(a) * (R - 1.2); const s = bx(g, 2.7, 0.03, 2.2, warn, x, 0.02, z); s.rotation.y = -a; s.castShadow = false; }
  // stands + crowd behind the wall
  const pal = ["#e5233b", "#ffffff", "#2a7de0", "#ffc21f", "#2a2a3a", "#7cff6b"];
  const stand = (x: number, z: number, ry: number, perRow: number, seed: number) => { bx(g, perRow * 0.62 + 1, 1.2, 3, T("#27304a"), x, 0.6, z + 0.2, 0).rotation.y = ry; crowd(g, x, 1.0, z - 0.6, ry, perRow, 6, seed, 0.62, 0.55, 0.8, pal, true); };
  stand(0, HZ - R - 2.2, 0, 56, 61); stand(-13.2, HZ - R + 5.4, PI / 4, 24, 62); stand(13.2, HZ - R + 5.4, -PI / 4, 24, 63);
  bx(g, 56, 9, 0.5, T("#161c32"), 0, 4.5, HZ - R - 11);
  panel(g, 7.4, 3.0, 0, 6.6, HZ - R - 5.8, "#ffc21f", 0, "#06060e");
  const sb = canvasTex(512, 256, (c) => {
    c.fillStyle = "#06060e"; c.fillRect(0, 0, 512, 256); c.textAlign = "center"; c.font = "bold 34px Arial";
    c.fillStyle = "#ffc21f"; c.fillText("HOME", 96, 56); c.fillText("AWAY", 416, 56); c.fillText("INN", 256, 56);
    c.font = "bold 100px Courier New"; c.fillStyle = "#ff4d3a"; c.fillText("4", 96, 160); c.fillText("3", 416, 160);
    c.fillStyle = "#ffe36a"; c.fillText("9", 256, 160);
    c.fillStyle = "#37f58a"; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(200 + i * 56, 218, 14, 0, PI * 2); c.fill(); }
    c.strokeStyle = "#ffc21f"; c.lineWidth = 6; c.strokeRect(6, 6, 500, 244);
  });
  const sbp = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.6), basic(sb, 1.2, false)); sbp.position.set(0, 6.6, HZ - R - 5.7); g.add(sbp);
  // dugouts beside the foul lines, with a bench
  for (const sx of [-1, 1]) {
    bx(g, 5, 0.9, 1.6, T("#27304a"), sx * 9.2, 0.45, HZ + 1.6, 0.02); bx(g, 5.2, 0.12, 1.9, T("#14407a"), sx * 9.2, 1.45, HZ + 1.6, 0.02);
    bx(g, 4.6, 0.12, 0.5, T("#9a6a3a"), sx * 9.2, 0.55, HZ + 1.3); cy(g, 0.1, 0.1, 1.4, T("#8a93a8"), sx * 6.9, 0.7, HZ + 0.7, 0.01, 8); cy(g, 0.1, 0.1, 1.4, T("#8a93a8"), sx * 11.5, 0.7, HZ + 0.7, 0.01, 8);
  }
  // bat rack, bat + ball on the ground, bucket of balls
  const bat = bx(g, 0.07, 1.0, 0.07, T("#c98a4a"), 1.6, 0.5, HZ + 1.0, 0.012); bat.rotation.z = 0.28;
  cy(g, 0.12, 0.09, 0.9, T("#c98a4a"), 1.62, 0.45, HZ + 1.0, 0.012, 10).rotation.z = 0.28;
  sp(g, 0.1, T("#ffffff"), -1.2, 0.1, HZ + 1.3, 0.01); for (const rx of [0.4, -0.4]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 4, 14), T("#c0141f")); t.position.set(-1.2, 0.1, HZ + 1.3); t.rotation.set(rx, 0.5, 0); g.add(t); }
  // backstop net behind home plate
  const nt = canvasTex(128, 64, (c) => { c.clearRect(0, 0, 128, 64); c.strokeStyle = "#e8eef8"; c.lineWidth = 2; for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, 64); c.stroke(); } for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 8); c.lineTo(128, j * 8); c.stroke(); } });
  // floodlight towers
  for (const sx of [-1, 1]) {
    cy(g, 0.16, 0.24, 11, T("#3a4058"), sx * 12, 5.5, HZ - 14, 0.02, 8);
    bx(g, 2.6, 1.7, 0.25, T("#20263a"), sx * 12, 11.3, HZ - 13.8, 0.03);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) glow(g, 0.65, 0.65, 0.05, "#fffbe8", sx * 12 + (i - 1) * 0.8, 11.3 + (j - 0.5) * 0.8, HZ - 13.65, 3.2);
  }
  void nt;
  vplane(g, 220, 90, basic(gradTex([[0, "#03040f"], [0.6, "#0d1840"], [1, "#2a3a78"]], 8, 256), 1, false), 0, 30, -70); stars(g, 120, 71, 100, 14, 50, -69); glowSp(g, 2.4, "#fff6d0", 16, 24, -66, 1.3);
  const lights = mkLights(["#9cb4ff", "#1d4a2a", 1.0], ["#e8f0ff", 2.4, [4, 13, 6]], [["#fffbe8", 60, [-10, 9, -10], 24], ["#fffbe8", 60, [10, 9, -10], 24], ["#fffbe8", 40, [0, 7, 6], 18]], 12);
  return { root: g, lights, fog: new THREE.Fog("#0f1a3a", 30, 80), bg: "#0a1030", spots: { spot: [0, 0, 0], plate: [0, 0, HZ], mound: [0, 0.28, HZ - 5.5], sign: [0, 6.6, HZ - R - 5.6], ball: [-1.2, 0.1, HZ + 1.3] } };
}

// ================= GRIDIRON (American football field) =================
function gridiron(): SetObj {
  const g = new THREE.Group();
  const X0 = -12, X1 = 24, Z0 = -15.8, Z1 = 3.4, GX = -5.4, EZ = -9.0, YD = 0.36;   // goal line at GX, end line at EZ, 1 yard = 0.36 m
  const W = 2048, H = Math.round(W * (Z1 - Z0) / (X1 - X0)), sx = W / (X1 - X0), sz = H / (Z1 - Z0);
  const X = (x: number) => (x - X0) * sx, Z = (z: number) => (z - Z0) * sz;
  const zc = (Z0 + Z1) / 2;
  const ft = canvasTex(W, H, (c) => {
    const nb = 24; for (let i = 0; i < nb; i++) { c.fillStyle = i % 2 ? "#2f9a46" : "#3aad52"; c.fillRect(X(EZ) + i * 5 * YD * sx, 0, 5 * YD * sx + 1, H); }
    c.fillStyle = "#2a8a40"; c.fillRect(0, 0, X(EZ), H);
    c.fillStyle = "#b3263a"; c.fillRect(X(EZ), 0, X(GX) - X(EZ), H);                                // end zone in a team colour
    c.fillStyle = "#ffffff"; c.strokeStyle = "#ffffff"; c.lineWidth = 7;
    c.strokeRect(X(EZ), Z(Z0) + 4, X(X1) - X(EZ), Z(Z1) - Z(Z0) - 8);                                // end line + sidelines
    for (let k = 0; GX + k * 5 * YD < X1; k++) { const x = GX + k * 5 * YD; c.lineWidth = k === 0 ? 10 : 6; c.beginPath(); c.moveTo(X(x), Z(Z0)); c.lineTo(X(x), Z(Z1)); c.stroke(); }
    c.lineWidth = 3;
    for (let n = 1; GX + n * YD < X1; n++) { if (n % 5 === 0) continue; const x = GX + n * YD; for (const zz of [Z0 + 0.1, Z1 - 0.1, zc - 3.1, zc + 3.1]) { c.beginPath(); c.moveTo(X(x), Z(zz - 0.17)); c.lineTo(X(x), Z(zz + 0.17)); c.stroke(); } }
    c.font = "bold " + Math.round(2.0 * sz) + "px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let n = 10; GX + n * YD < X1 - 1; n += 10) {                                                  // yard numbers (near side upright, far side upside down)
      const lab = String(n <= 50 ? n : 100 - n), x = GX + n * YD;
      c.save(); c.translate(X(x), Z(Z1 - 1.5)); c.fillText(lab, 0, 0); c.restore();
      c.save(); c.translate(X(x), Z(Z0 + 1.5)); c.rotate(PI); c.fillText(lab, 0, 0); c.restore();
    }
    c.save(); c.translate(X((EZ + GX) / 2), Z(zc)); c.rotate(-PI / 2); c.font = "bold " + Math.round(2.3 * sz) + "px Arial"; c.fillStyle = "#ffffff"; c.fillText("HOME", 0, 0); c.restore();   // plain end zone lettering
  });
  plane(g, 140, 100, T("#1d6a33"), 0, 0, -20);
  plane(g, X1 - X0, Z1 - Z0, T("#ffffff", { map: ft }), (X0 + X1) / 2, 0.01, zc);
  // goal post: yellow uprights on a gooseneck, padded base
  const yel = T("#ffd400", { emissive: "#6a5600", emissiveIntensity: 0.45 });
  cy(g, 0.12, 0.14, 2.6, yel, EZ, 1.3, zc, 0.02, 10);
  cy(g, 0.2, 0.2, 1.0, T("#b3263a"), EZ, 0.5, zc, 0.02, 12);
  const xb = cy(g, 0.09, 0.09, 3.6, yel, EZ, 2.6, zc, 0.02, 10); xb.rotation.x = PI / 2;
  for (const sz2 of [-1, 1]) { cy(g, 0.075, 0.075, 3.4, yel, EZ, 4.3, zc + sz2 * 1.8, 0.02, 8); glowSp(g, 0.1, "#fff3a0", EZ, 6.05, zc + sz2 * 1.8, 1.4); }
  // set ball (hidden when the shot shows a ball) + down markers
  const fb = new THREE.Group(); fb.userData.setBall = true; g.add(fb);   // Ah.tsx hides it when the shot shows a ball thing
  const fbody = sp(fb, 1, T("#8a4a22"), 1.35, 0.2, 1.2, 0.04, 20); fbody.scale.set(0.32, 0.2, 0.2); fbody.rotation.y = 0.5;
  const fl = bx(fb, 0.2, 0.025, 0.04, T("#ffffff"), 1.35, 0.4, 1.2); fl.rotation.y = 0.5;
  for (const sg of [-1, 1]) { const st = cy(fb, 0.2, 0.2, 0.02, T("#ffffff"), 1.35 + Math.cos(0.5) * sg * 0.19, 0.2, 1.2 - Math.sin(0.5) * sg * 0.19, 0, 14); st.rotation.set(0, 0.5, PI / 2); }
  for (const x of [2.4, 3.0]) { cy(g, 0.03, 0.03, 1.5, T("#e8ecf4"), x, 0.75, Z1 + 0.15, 0, 6); bx(g, 0.5, 0.3, 0.04, T("#ff8a1a"), x, 1.55, Z1 + 0.15, 0.01); }
  // stands + crowd behind the far sideline and behind the end zone
  const pal = ["#e5233b", "#ffffff", "#2a7de0", "#ffc21f", "#2a2a3a", "#7cff6b"];
  bx(g, 44, 1.0, 4, T("#27304a"), 6, 0.5, Z0 - 1.6);
  crowd(g, 6, 0.9, Z0 - 2.4, 0, 70, 8, 81, 0.62, 0.55, 0.8, pal, true);
  bx(g, 4, 1.0, 22, T("#27304a"), EZ - 3.6, 0.5, zc);
  crowd(g, EZ - 3.0, 0.9, zc, PI / 2, 34, 6, 82, 0.62, 0.55, 0.8, pal, true);
  bx(g, 56, 12, 0.5, T("#161c32"), 6, 6, Z0 - 10.6);
  bx(g, 50, 0.4, 10, T("#1a2038"), 6, 9.6, Z0 - 6.6, 0.03);
  for (let i = -11; i <= 11; i++) glow(g, 1.1, 0.14, 0.06, "#fff4d8", 6 + i * 2, 9.4, Z0 - 1.9, 2.4);
  // scoreboard
  const sbt = canvasTex(512, 256, (c) => {
    c.fillStyle = "#06060e"; c.fillRect(0, 0, 512, 256); c.textAlign = "center"; c.font = "bold 34px Arial";
    c.fillStyle = "#ffc21f"; c.fillText("HOME", 96, 56); c.fillText("AWAY", 416, 56); c.fillText("QTR", 256, 56);
    c.font = "bold 100px Courier New"; c.fillStyle = "#ff4d3a"; c.fillText("21", 96, 160); c.fillText("14", 416, 160);
    c.fillStyle = "#ffe36a"; c.fillText("4", 256, 160);
    c.font = "bold 40px Courier New"; c.fillStyle = "#37f58a"; c.fillText("3rd & 8     03:12", 256, 226);
    c.strokeStyle = "#ffc21f"; c.lineWidth = 6; c.strokeRect(6, 6, 500, 244);
  });
  panel(g, 7.4, 3.0, 6, 6.2, Z0 - 7.4, "#ffc21f", 0, "#06060e");
  const sbp = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.6), basic(sbt, 1.2, false)); sbp.position.set(6, 6.2, Z0 - 7.3); g.add(sbp);
  // floodlight towers
  for (const sxx of [-6, 14]) {
    cy(g, 0.16, 0.24, 11, T("#3a4058"), sxx, 5.5, Z0 - 4.6, 0.02, 8);
    bx(g, 2.6, 1.7, 0.25, T("#20263a"), sxx, 11.3, Z0 - 4.4, 0.03);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) glow(g, 0.65, 0.65, 0.05, "#fffbe8", sxx + (i - 1) * 0.8, 11.3 + (j - 0.5) * 0.8, Z0 - 4.25, 3.2);
  }
  vplane(g, 240, 90, basic(gradTex([[0, "#03040f"], [0.6, "#0d1840"], [1, "#2a3a78"]], 8, 256), 1, false), 0, 30, -80); stars(g, 120, 91, 110, 14, 50, -79); glowSp(g, 2.4, "#fff6d0", 16, 24, -76, 1.3);
  const lights = mkLights(["#9cb4ff", "#1d4a2a", 1.0], ["#e8f0ff", 2.4, [4, 13, 6]], [["#fffbe8", 60, [-6, 9, Z0 - 3], 24], ["#fffbe8", 60, [14, 9, Z0 - 3], 24], ["#fffbe8", 40, [0, 7, 6], 18]], 12);
  return { root: g, lights, fog: new THREE.Fog("#0f1a3a", 30, 85), bg: "#0a1030", spots: { spot: [0, 0, 0], goal: [EZ, 2.6, zc], ball: [1.35, 0.2, 1.2], sign: [6, 6.2, Z0 - 7.2] } };
}

// ================= TENNIS (hard court) =================
function tennis(): SetObj {
  const g = new THREE.Group();
  const X0 = -14, X1 = 14, Z0 = -27, Z1 = 12, NZ = -7;                 // net at z = -7, near baseline z = +4.9 (real size, 1 unit = 1 m)
  const W = 1280, H = Math.round(W * (Z1 - Z0) / (X1 - X0)), sx = W / (X1 - X0), sz = H / (Z1 - Z0);
  const X = (x: number) => (x - X0) * sx, Z = (z: number) => (z - Z0) * sz;
  const zNear = NZ + 11.89, zFar = NZ - 11.89;
  const tt = canvasTex(W, H, (c) => {
    c.fillStyle = "#2f8f5a"; c.fillRect(0, 0, W, H);                                                // green surround
    c.fillStyle = "#2f67b8"; c.fillRect(X(-7.4), Z(zFar - 4.6), 14.8 * sx, (zNear - zFar + 9.2) * sz);   // blue court
    c.strokeStyle = "#f4f7f0"; c.lineWidth = Math.round(0.11 * sx); c.lineCap = "butt";
    const L = (x0: number, z0: number, x1: number, z1: number) => { c.beginPath(); c.moveTo(X(x0), Z(z0)); c.lineTo(X(x1), Z(z1)); c.stroke(); };
    L(-5.485, zFar, 5.485, zFar); L(-5.485, zNear, 5.485, zNear);                                   // baselines
    L(-5.485, zFar, -5.485, zNear); L(5.485, zFar, 5.485, zNear);                                   // doubles sidelines
    L(-4.115, zFar, -4.115, zNear); L(4.115, zFar, 4.115, zNear);                                   // singles sidelines
    L(-4.115, NZ - 6.4, 4.115, NZ - 6.4); L(-4.115, NZ + 6.4, 4.115, NZ + 6.4);                     // service lines
    L(0, NZ - 6.4, 0, NZ + 6.4); L(0, zNear, 0, zNear - 0.3); L(0, zFar, 0, zFar + 0.3);           // centre service line + marks
  });
  plane(g, 160, 120, T("#2a7a4e"), 0, 0, -20);
  plane(g, X1 - X0, Z1 - Z0, T("#ffffff", { map: tt }), (X0 + X1) / 2, 0.01, (Z0 + Z1) / 2);
  // net: posts, mesh, white top band, centre strap
  const post = T("#2a2f3e");
  for (const sxn of [-1, 1]) cy(g, 0.07, 0.07, 1.1, post, sxn * 6.4, 0.55, NZ, 0.015, 8);
  const nt = canvasTex(256, 32, (c) => { c.clearRect(0, 0, 256, 32); c.strokeStyle = "#e8eef8"; c.lineWidth = 2; for (let i = 0; i <= 64; i++) { c.beginPath(); c.moveTo(i * 4, 0); c.lineTo(i * 4, 32); c.stroke(); } for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 4); c.lineTo(256, j * 4); c.stroke(); } });
  const nm = new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  vplane(g, 12.8, 0.95, nm, 0, 0.5, NZ);
  bx(g, 12.8, 0.09, 0.05, T("#ffffff"), 0, 0.99, NZ, 0.012); bx(g, 0.07, 0.95, 0.04, T("#ffffff"), 0, 0.5, NZ);
  // umpire chair beside the net
  const ux = -7.2, chair = T("#1c3f7a");
  for (const [dx, dz] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.45], [0.45, 0.45]] as V2[]) cy(g, 0.05, 0.05, 2.3, chair, ux + dx, 1.15, NZ + dz, 0.012, 6);
  bx(g, 1.15, 0.12, 1.2, T("#e8ecf4"), ux, 2.3, NZ + 0.02, 0.015); bx(g, 1.15, 0.8, 0.1, chair, ux, 2.8, NZ - 0.56, 0.015); bx(g, 1.2, 0.08, 0.6, chair, ux, 0.9, NZ + 0.8);
  for (let i = 0; i < 4; i++) bx(g, 0.9, 0.06, 0.4, T("#d6dbe8"), ux, 0.3 + i * 0.5, NZ + 0.9 + 0.1 * i, 0.01);
  bx(g, 0.9, 0.7, 0.5, T("#d6dbe8"), ux + 0.95, 2.35, NZ);
  // set balls (hidden when the shot shows a ball) + a racket + ball can on the court
  const tb = new THREE.Group(); tb.userData.setBall = true; g.add(tb);
  for (const [x, z] of [[1.0, 1.4], [1.5, 0.6], [-1.3, 0.9], [2.3, -1.6]] as V2[]) {
    sp(tb, 0.11, T("#d6ec3a"), x, 0.11, z, 0.012, 14);
    const sm = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 4, 16), T("#ffffff")); sm.position.set(x, 0.11, z); sm.rotation.set(0.9, 0.4, 0); tb.add(sm);
  }
  const rk = new THREE.Group(); rk.position.set(-1.5, 0.035, 2.2); rk.rotation.set(0, 0.7, 0); g.add(rk);
  const fr = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), T("#d6283a")); fr.scale.set(0.82, 1.15, 1); fr.rotation.x = -PI / 2; fr.position.set(0, 0, -0.34); outline(fr, 0.01); rk.add(fr);
  const stg = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = "#ffffff"; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, 64); c.moveTo(0, i * 8); c.lineTo(64, i * 8); c.stroke(); } });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), new THREE.MeshBasicMaterial({ map: stg, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide })); sg.rotation.x = -PI / 2; sg.position.set(0, 0.005, -0.34); rk.add(sg);
  const hd = cy(rk, 0.03, 0.03, 0.38, T("#1b1b22"), 0, 0.01, 0.12, 0.008, 8); hd.rotation.x = PI / 2;
  cy(g, 0.15, 0.15, 0.55, T("#f2c230"), 2.6, 0.275, 2.0, 0.015, 14); cy(g, 0.155, 0.155, 0.06, T("#d6283a"), 2.6, 0.56, 2.0, 0, 14);
  // plain sponsor boards behind each baseline and side, stands + crowd
  const adc = ["#e5233b", "#ffc21f", "#ffffff", "#2a7de0", "#ff4da6", "#7cff6b"];
  for (let i = -6; i <= 6; i++) bx(g, 2.3, 1.0, 0.14, T(adc[(i + 6) % 6], { emissive: adc[(i + 6) % 6], emissiveIntensity: 0.35 }), i * 2.4, 0.5, Z0 + 2.2, 0.02);
  for (const sxn of [-1, 1]) for (let i = 0; i < 9; i++) { const zz = zFar + 2 + i * 3.1; if (zz > zNear + 3) break; const b = bx(g, 2.3, 1.0, 0.14, T(adc[(i + (sxn > 0 ? 2 : 0)) % 6], { emissive: adc[(i + (sxn > 0 ? 2 : 0)) % 6], emissiveIntensity: 0.35 }), sxn * 9.4, 0.5, zz, 0.02); b.rotation.y = PI / 2; }
  const pal = ["#e5233b", "#ffffff", "#2a7de0", "#ffc21f", "#f58ad0", "#7cff6b"];
  bx(g, 34, 1.0, 4, T("#27304a"), 0, 0.5, Z0 + 0.6);
  crowd(g, 0, 0.9, Z0 + 0.0, 0, 52, 8, 91, 0.62, 0.55, 0.8, pal, true);
  for (const sxn of [-1, 1]) { bx(g, 4, 1.0, 24, T("#27304a"), sxn * 12.4, 0.5, -8); crowd(g, sxn * 11.8, 0.9, -8, sxn * PI / 2, 36, 6, 92 + sxn, 0.62, 0.55, 0.8, pal, true); }
  bx(g, 44, 12, 0.5, T("#26304e"), 0, 6, Z0 - 7.4);
  panel(g, 6.4, 2.4, 0, 5.4, Z0 - 6.8, "#ffc21f", 0, "#06060e");
  const sbt = canvasTex(512, 192, (c) => {
    c.fillStyle = "#06060e"; c.fillRect(0, 0, 512, 192); c.textAlign = "center"; c.font = "bold 34px Arial"; c.fillStyle = "#ffc21f"; c.fillText("SET", 330, 44); c.fillText("GAME", 450, 44);
    c.font = "bold 50px Courier New"; c.textAlign = "left"; c.fillStyle = "#e8f0ff"; c.fillText("PLAYER 1", 24, 106); c.fillText("PLAYER 2", 24, 170);
    c.textAlign = "center"; c.fillStyle = "#ffe36a"; c.fillText("6", 330, 106); c.fillText("3", 330, 170); c.fillStyle = "#37f58a"; c.fillText("40", 450, 106); c.fillText("30", 450, 170);
    c.strokeStyle = "#ffc21f"; c.lineWidth = 6; c.strokeRect(6, 6, 500, 180);
  });
  const sbp = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 2.0), basic(sbt, 1.1, false)); sbp.position.set(0, 5.4, Z0 - 6.7); g.add(sbp);
  bx(g, 36, 0.4, 8, T("#1a2038"), 0, 9.4, Z0 - 3.5, 0.03);
  // day sky with a few clouds
  vplane(g, 260, 100, basic(gradTex([[0, "#bfe6ff"], [0.5, "#8ecbff"], [1, "#4a9be8"]], 8, 256), 1, false), 0, 36, -80);
  for (const [cx, cyy, cs] of [[-30, 26, 1.2], [14, 32, 1.6], [42, 24, 1.0], [-6, 40, 1.1]] as V3[]) for (let i = 0; i < 5; i++) { const m = sp(g, 3 * cs, T("#ffffff", { emissive: "#c8d8ee", emissiveIntensity: 0.6 }), cx + (i - 2) * 3.4 * cs, cyy + (i % 2) * 1.2, -75, 0, 12); m.scale.set(1.3, 0.7, 0.5); }
  const lights = mkLights(["#f2f8ff", "#6fa07a", 1.25], ["#fff6e0", 2.6, [6, 14, 8]], [["#ffffff", 30, [0, 8, 4], 22]], 14);
  return { root: g, lights, fog: new THREE.Fog("#a8d6ff", 55, 130), bg: "#8ecbff", spots: { spot: [0, 0, 0], net: [0, 0.5, NZ], ball: [1.0, 0.11, 1.4], chair: [ux, 2.3, NZ], sign: [0, 5.4, Z0 - 6.6] } };
}

// ================= POOL (an empty, disused swimming pool used as a tennis practice court) =================
function pool(): SetObj {
  const g = new THREE.Group();
  const X0 = -9, X1 = 9, Z0 = -15, Z1 = 11, H = 2.7, NZ = -5;                // pool 18 x 26 m, 2.7 m deep, net across at z = -5
  const tileTex = (w: number, h: number, tw: number, th: number, seed: number, fn?: (c: CanvasRenderingContext2D) => void) => canvasTex(w, h, (c) => {
    const r = seeded(seed); const cols = ["#8fd3e8", "#86cde4", "#9ad9ec", "#7fc6de"];
    c.fillStyle = "#cfeaf2"; c.fillRect(0, 0, w, h);
    for (let j = 0; j * th < h; j++) for (let i = 0; i * tw < w; i++) { c.fillStyle = cols[Math.floor(r() * 4)]; c.fillRect(i * tw + 2, j * th + 2, tw - 4, th - 4); }
    if (fn) fn(c);
  });
  // floor: tiles, dark lane lines with T ends, a drain, faded chalk tennis baseline, crack lines
  const FW = 1008, FH = Math.round(FW * (Z1 - Z0) / (X1 - X0)), fx = FW / (X1 - X0), fz = FH / (Z1 - Z0);
  const FX = (x: number) => (x - X0) * fx, FZ = (z: number) => (z - Z0) * fz;
  const ft = tileTex(FW, FH, 28, 28, 5, (c) => {
    c.fillStyle = "#1c4f9a";
    for (const x of [-6.75, -2.25, 2.25, 6.75]) { c.fillRect(FX(x) - 0.12 * fx, FZ(Z0), 0.24 * fx, (Z1 - Z0) * fz); c.fillRect(FX(x) - 0.6 * fx, FZ(Z0 + 0.6), 1.2 * fx, 0.24 * fz); c.fillRect(FX(x) - 0.6 * fx, FZ(Z1 - 0.9), 1.2 * fx, 0.24 * fz); }
    c.strokeStyle = "#f4f7f0"; c.lineWidth = 0.09 * fx; c.lineCap = "butt";                    // faded tennis chalk
    const L = (x0: number, z0: number, x1: number, z1: number) => { c.beginPath(); c.moveTo(FX(x0), FZ(z0)); c.lineTo(FX(x1), FZ(z1)); c.stroke(); };
    L(-4.1, NZ - 6.4, 4.1, NZ - 6.4); L(-4.1, NZ + 6.4, 4.1, NZ + 6.4); L(0, NZ - 6.4, 0, NZ + 6.4);
    c.fillStyle = "#3a4a58"; c.beginPath(); c.arc(FX(5.5), FZ(2), 0.4 * fx, 0, PI * 2); c.fill(); c.fillStyle = "#6b7c8a"; c.beginPath(); c.arc(FX(5.5), FZ(2), 0.3 * fx, 0, PI * 2); c.fill();
    c.strokeStyle = "rgba(40,60,80,0.55)"; c.lineWidth = 3;
    for (const [a, b, d, e] of [[-3, -9, -1.8, -7.6], [3.2, -11.5, 4.4, -10], [-6, 5, -4.7, 6.3]]) { c.beginPath(); c.moveTo(FX(a), FZ(b)); c.lineTo(FX((a + d) / 2 + 0.2), FZ((b + e) / 2 - 0.3)); c.lineTo(FX(d), FZ(e)); c.stroke(); }
    c.fillStyle = "rgba(90,110,60,0.35)"; for (const [x, z, r] of [[-5, -2, 1.2], [6.5, -8, 0.9]]) { c.beginPath(); c.ellipse(FX(x), FZ(z), r * fx, r * 0.7 * fz, 0.4, 0, PI * 2); c.fill(); }   // old stains
  });
  plane(g, X1 - X0, Z1 - Z0, T("#ffffff", { map: ft }), 0, 0.01, (Z0 + Z1) / 2);
  // walls: tiles, a dark waterline band near the top, depth numbers, a "DEEP END" paint
  const wallTex = (wd: number, label: string) => {
    const WW = Math.round(wd * 56), WH = Math.round(H * 56);
    return tileTex(WW, WH, 28, 28, 9 + Math.round(wd), (c) => {
      c.fillStyle = "#2a62b0"; c.fillRect(0, 0, WW, 0.42 * 56 + 6); c.fillStyle = "#f4f7f0"; c.fillRect(0, 0.42 * 56 + 6, WW, 5);
      c.fillStyle = "rgba(60,80,50,0.28)"; c.fillRect(0, 0.42 * 56 + 11, WW, 9);
      c.fillStyle = "#ffffff"; c.textAlign = "center"; c.font = "bold 30px Arial";
      for (const k of [0.2, 0.5, 0.8]) c.fillText(label, WW * k, 0.42 * 56 - 14);
      c.strokeStyle = "rgba(40,60,80,0.5)"; c.lineWidth = 3; c.beginPath(); c.moveTo(WW * 0.62, WH * 0.45); c.lineTo(WW * 0.66, WH * 0.62); c.lineTo(WW * 0.64, WH * 0.8); c.stroke();
    });
  };
  const wm = (wd: number, label: string) => T("#ffffff", { map: wallTex(wd, label) });
  vplane(g, X1 - X0, H, wm(X1 - X0, "3 M"), 0, H / 2, Z0);
  vplane(g, X1 - X0, H, wm(X1 - X0, "1.2 M"), 0, H / 2, Z1, PI);
  vplane(g, Z1 - Z0, H, wm(Z1 - Z0, "2 M"), X0, H / 2, (Z0 + Z1) / 2, PI / 2);
  vplane(g, Z1 - Z0, H, wm(Z1 - Z0, "2 M"), X1, H / 2, (Z0 + Z1) / 2, -PI / 2);
  // coping + deck around the rim, fence, trees, clubhouse
  const cop = T("#e9e4d6"), deck = T("#c9c2b0");
  bx(g, 19.2, 0.22, 0.6, cop, 0, H + 0.11, Z0 - 0.3, 0.012); bx(g, 19.2, 0.22, 0.6, cop, 0, H + 0.11, Z1 + 0.3, 0.012);
  bx(g, 0.6, 0.22, 27.2, cop, X0 - 0.3, H + 0.11, (Z0 + Z1) / 2, 0.012); bx(g, 0.6, 0.22, 27.2, cop, X1 + 0.3, H + 0.11, (Z0 + Z1) / 2, 0.012);
  bx(g, 70, 0.4, 14, deck, 0, H - 0.2, Z0 - 7.6); bx(g, 70, 0.4, 14, deck, 0, H - 0.2, Z1 + 7.6);
  bx(g, 14, 0.4, 40, deck, X0 - 7.6, H - 0.2, -2); bx(g, 14, 0.4, 40, deck, X1 + 7.6, H - 0.2, -2);
  const fenceM = T("#59606e");
  for (let i = -14; i <= 14; i++) { cy(g, 0.04, 0.04, 2.2, fenceM, i * 2.4, H + 1.1, Z0 - 12, 0.01, 6); }
  bx(g, 70, 0.06, 0.06, fenceM, 0, H + 2.1, Z0 - 12); bx(g, 70, 0.06, 0.06, fenceM, 0, H + 0.4, Z0 - 12);
  const fm = new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c) => { c.clearRect(0, 0, 256, 64); c.strokeStyle = "rgba(200,208,220,0.75)"; c.lineWidth = 2; for (let k = -64; k < 256; k += 12) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 64, 64); c.moveTo(k + 64, 0); c.lineTo(k, 64); c.stroke(); } }), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  vplane(g, 70, 1.7, fm, 0, H + 1.25, Z0 - 12);
  const r = seeded(31); const leaf = ["#2f9f4a", "#26903f", "#3aae55"];
  for (let i = 0; i < 9; i++) { const x = -34 + i * 8.4 + r() * 2, s = 1 + r() * 0.7; cy(g, 0.3 * s, 0.4 * s, 3.4 * s, T("#6a4a2a"), x, H + 1.7 * s, Z0 - 17, 0.015, 8); sp(g, 2.2 * s, T(leaf[i % 3]), x, H + 4.4 * s, Z0 - 17, 0.02, 14); sp(g, 1.5 * s, T(leaf[(i + 1) % 3]), x + 1.5 * s, H + 3.7 * s, Z0 - 16.6, 0.02, 12); }
  bx(g, 16, 5, 6, T("#e8d6b4"), -22, H + 2.5, Z0 - 6.5, 0.02); bx(g, 16.8, 0.5, 6.8, T("#b24a3a"), -22, H + 5.2, Z0 - 6.5, 0.02);
  for (let i = 0; i < 4; i++) bx(g, 1.8, 1.6, 0.1, T("#7fc6de"), -27 + i * 3.4, H + 2.6, Z0 - 3.45, 0.012);
  bx(g, 3.2, 0.9, 0.2, T("#f4f7f0"), 6, H + 1.6, Z0 - 4); bx(g, 0.12, 1.6, 0.12, fenceM, 6, H + 0.8, Z0 - 4);
  // ladder on the left wall (chrome rails over the rim, five steps), a second on the right
  const chrome = metalMat("#d9dee8", 0.25);
  const ladder = (lx: number, lz: number, dir: number) => {
    for (const dz of [-0.28, 0.28]) {
      cy(g, 0.028, 0.028, H + 0.55, chrome, lx + dir * 0.1, (H + 0.55) / 2 + 0.25, lz + dz, 0.008, 8);
      cy(g, 0.028, 0.028, 0.5, chrome, lx - dir * 0.15, H + 0.55, lz + dz, 0.008, 8).rotation.z = PI / 2;
      cy(g, 0.028, 0.028, H + 0.1, chrome, lx - dir * 0.4, (H + 0.1) / 2 + 0.2, lz + dz, 0.008, 8);
    }
    for (let i = 0; i < 5; i++) cy(g, 0.022, 0.022, 0.62, chrome, lx + dir * 0.1, 0.5 + i * 0.4, lz, 0.007, 8).rotation.x = PI / 2;
  };
  ladder(X0 + 0.12, -9.5, 1); ladder(X1 - 0.12, 4.5, -1);
  // tennis net strung across the dry floor from wall to wall, with white band + centre strap + two posts
  const post = T("#2a2f3e");
  for (const sxn of [-1, 1]) cy(g, 0.07, 0.07, 1.1, post, sxn * 7.0, 0.55, NZ, 0.015, 8);
  const nt = canvasTex(256, 32, (c) => { c.clearRect(0, 0, 256, 32); c.strokeStyle = "#e8eef8"; c.lineWidth = 2; for (let i = 0; i <= 64; i++) { c.beginPath(); c.moveTo(i * 4, 0); c.lineTo(i * 4, 32); c.stroke(); } for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 4); c.lineTo(256, j * 4); c.stroke(); } });
  vplane(g, 14.0, 0.95, new THREE.MeshBasicMaterial({ map: nt, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), 0, 0.5, NZ);
  bx(g, 14.0, 0.09, 0.05, T("#ffffff"), 0, 0.99, NZ, 0.012); bx(g, 0.07, 0.95, 0.04, T("#ffffff"), 0, 0.5, NZ);
  for (const sxn of [-1, 1]) bx(g, 2.0, 0.03, 0.03, T("#d6dbe8"), sxn * 8.0, 0.97, NZ);        // cords to the walls
  // set balls (hidden when the shot shows a ball) + racket + ball bucket + fallen leaves
  const tb = new THREE.Group(); tb.userData.setBall = true; g.add(tb);
  for (const [x, z] of [[1.4, 1.6], [2.0, 0.8], [-1.6, -1.8], [3.2, -2.4]] as V2[]) {
    sp(tb, 0.11, T("#d6ec3a"), x, 0.11, z, 0.012, 14);
    const sm = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 4, 16), T("#ffffff")); sm.position.set(x, 0.11, z); sm.rotation.set(0.9, 0.4, 0); tb.add(sm);
  }
  const rk = new THREE.Group(); rk.position.set(-2.4, 0.035, 2.4); rk.rotation.set(0, 0.7, 0); g.add(rk);
  const fr = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), T("#d6283a")); fr.scale.set(0.82, 1.15, 1); fr.rotation.x = -PI / 2; fr.position.set(0, 0, -0.34); outline(fr, 0.01); rk.add(fr);
  const hd = cy(rk, 0.03, 0.03, 0.38, T("#1b1b22"), 0, 0.01, 0.12, 0.008, 8); hd.rotation.x = PI / 2;
  cy(g, 0.17, 0.15, 0.5, T("#f2c230"), 4.4, 0.25, 1.2, 0.015, 14); cy(g, 0.175, 0.175, 0.06, T("#d6283a"), 4.4, 0.52, 1.2, 0, 14);
  for (const [x, z, a] of [[-4, -3, 0.5], [5, -7, 1.9], [-6.5, 3, 2.7], [2.5, -12, 0.9], [-1, 6.5, 1.3]] as V3[]) { const lf = cy(g, 0.14, 0.14, 0.01, T("#a9702d"), x, 0.02, z, 0, 6); lf.rotation.y = a; lf.scale.set(1, 1, 0.7); }
  const lights = mkLights(["#f2f8ff", "#9cc4cf", 1.3], ["#fff6e0", 2.7, [5, 14, 7]], [["#ffffff", 28, [0, 3.2, 3], 20]], 14);
  void sp;
  return { root: g, lights, fog: new THREE.Fog("#a8d6ff", 40, 110), bg: "#8ecbff", spots: { spot: [0, 0, 0], net: [0, 0.5, NZ], ladder: [X0 + 0.3, 1.2, -9.5], ball: [1.4, 0.11, 1.6], sign: [0, 1.6, Z0 + 0.1] } };
}

// ================= GOLF (one golf hole) =================
function golf(): SetObj {
  const g = new THREE.Group();
  const X0 = -30, X1 = 30, Z0 = -52, Z1 = 10, W = 1500, H = Math.round(W * (Z1 - Z0) / (X1 - X0)), sx = W / (X1 - X0), sz = H / (Z1 - Z0);
  const X = (x: number) => (x - X0) * sx, Z = (z: number) => (z - Z0) * sz;
  const GZ = -32, GR = 5.2, FX = 14;                                   // green centre z, green radius, fairway half-width at its widest
  const gt = canvasTex(W, H, (c) => {
    c.fillStyle = "#2f8a46"; c.fillRect(0, 0, W, H);                   // rough
    // fairway: a soft S-shaped ribbon from the tee box to the green
    const fair = () => { c.beginPath(); c.moveTo(X(-4.2), Z(2.6)); c.bezierCurveTo(X(-9), Z(-8), X(-FX), Z(-16), X(-6.5), Z(GZ + 3)); c.lineTo(X(-GR * 0.8), Z(GZ + 2)); c.lineTo(X(GR * 0.8), Z(GZ + 2)); c.lineTo(X(6.5), Z(GZ + 3)); c.bezierCurveTo(X(FX), Z(-16), X(9), Z(-8), X(4.2), Z(2.6)); c.closePath(); };
    c.save(); fair(); c.clip();
    for (let i = 0; i < 40; i++) { c.fillStyle = i % 2 ? "#4cbf5f" : "#43b256"; c.fillRect(0, Z(2.6) - i * 1.8 * sz, W, 1.8 * sz + 1); }
    c.restore();
    // putting green: round, finer stripes
    c.save(); c.beginPath(); c.arc(X(0), Z(GZ), GR * sx, 0, PI * 2); c.clip();
    for (let i = 0; i < 20; i++) { c.fillStyle = i % 2 ? "#63d676" : "#58ca6b"; c.fillRect(X(-GR) + i * (GR / 10) * sx, 0, (GR / 10) * sx + 1, H); }
    c.restore();
    c.strokeStyle = "#7de08c"; c.lineWidth = 5; c.beginPath(); c.arc(X(0), Z(GZ), GR * sx, 0, PI * 2); c.stroke();
    // sand bunkers (a pale blob with a darker rim)
    const bunker = (bx0: number, bz: number, rx: number, rz: number, rot: number) => {
      c.save(); c.translate(X(bx0), Z(bz)); c.rotate(rot);
      c.fillStyle = "#d9b873"; c.beginPath(); c.ellipse(0, 0, (rx + 0.35) * sx, (rz + 0.35) * sz, 0, 0, PI * 2); c.fill();
      c.fillStyle = "#f3dfa0"; c.beginPath(); c.ellipse(0, 0, rx * sx, rz * sz, 0, 0, PI * 2); c.fill();
      c.fillStyle = "#e8cf88"; c.beginPath(); c.ellipse(rx * 0.2 * sx, rz * 0.2 * sz, rx * 0.5 * sx, rz * 0.4 * sz, 0, 0, PI * 2); c.fill(); c.restore();
    };
    bunker(7.4, GZ + 1.2, 3.0, 1.9, -0.5); bunker(-6.8, GZ + 4.5, 2.4, 1.5, 0.4); bunker(-9, -13, 2.8, 1.6, 0.2);
    // tee box with two lighter stripes
    c.fillStyle = "#5fd072"; c.fillRect(X(-3.4), Z(2.8), 6.8 * sx, 5.0 * sz);
    c.fillStyle = "#52c466"; c.fillRect(X(-3.4), Z(2.8) + 2.5 * sz, 6.8 * sx, 2.5 * sz);
    // cart path along the left of the hole
    c.strokeStyle = "#b9b3a6"; c.lineWidth = 1.4 * sx; c.lineCap = "round"; c.beginPath(); c.moveTo(X(-11), Z(8)); c.bezierCurveTo(X(-17), Z(-10), X(-19), Z(-24), X(-12), Z(-38)); c.stroke();
  });
  plane(g, 220, 160, T("#2a7a3e"), 0, 0, -50);
  plane(g, X1 - X0, Z1 - Z0, T("#ffffff", { map: gt }), (X0 + X1) / 2, 0.01, (Z0 + Z1) / 2);
  // hole cup + flag on the green (the flag sways a little in the wind via its fixed tilt)
  cy(g, 0.14, 0.14, 0.02, T("#15161c"), 0, 0.022, GZ, 0, 16);
  cy(g, 0.02, 0.02, 3.2, T("#fafafa"), 0, 1.6, GZ, 0.012, 8);
  const flM = T("#e5233b"); flM.side = THREE.DoubleSide; const fl = new THREE.Mesh(new THREE.BufferGeometry(), flM);
  fl.geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1.1, -0.2, 0.05, 0, -0.55, 0], 3)); fl.geometry.computeVertexNormals(); fl.position.set(0.02, 3.15, GZ); g.add(fl);
  // tee box markers, a tee sign and a sand-and-water-free bin
  for (const sxn of [-1, 1]) { sp(g, 0.16, T(sxn > 0 ? "#e5233b" : "#ffffff"), sxn * 3.0, 0.2, 2.9, 0.012, 14); cy(g, 0.04, 0.05, 0.14, T("#8a93a8"), sxn * 3.0, 0.07, 2.9, 0, 8); }
  const hs = T("#f4f7f0"); cy(g, 0.05, 0.05, 1.5, T("#6a4a2a"), -4.6, 0.75, 1.2, 0.012, 8); bx(g, 0.9, 0.55, 0.06, T("#14407a"), -4.6, 1.55, 1.2, 0.015); void hs;
  const sgn = canvasTex(256, 160, (c) => { c.fillStyle = "#14407a"; c.fillRect(0, 0, 256, 160); c.fillStyle = "#ffffff"; c.textAlign = "center"; c.font = "bold 64px Arial"; c.fillText("HOLE 9", 128, 70); c.font = "bold 40px Arial"; c.fillText("PAR 4", 128, 124); });
  const sgp = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.5), basic(sgn, 1.05, false)); sgp.position.set(-4.6, 1.55, 1.24); g.add(sgp);
  // set balls beside the tee sign, out of the swing's way (hidden when the shot shows a ball thing)
  const gb = new THREE.Group(); gb.userData.setBall = true; g.add(gb);
  for (const [x, z] of [[-4.2, 3.6], [-4.7, 4.2], [-3.8, 4.5]] as V2[]) { sp(gb, 0.07, T("#ffffff"), x, 0.07, z, 0.01, 12); }
  // round cel trees along both sides
  const r = seeded(77); const leaf = ["#1f7a3a", "#26903f", "#2f9f4a", "#1a6a33"];
  const tree = (x: number, z: number, sc: number) => {
    cy(g, 0.22 * sc, 0.3 * sc, 2.2 * sc, T("#6a4a2a"), x, 1.1 * sc, z, 0.015, 8);
    const c0 = leaf[Math.floor(r() * 4)];
    sp(g, 1.5 * sc, T(c0), x, 3.0 * sc, z, 0.02, 14); sp(g, 1.1 * sc, T(leaf[Math.floor(r() * 4)]), x + 0.9 * sc, 2.5 * sc, z + 0.3 * sc, 0.02, 12); sp(g, 1.0 * sc, T(leaf[Math.floor(r() * 4)]), x - 0.9 * sc, 2.6 * sc, z - 0.2 * sc, 0.02, 12);
  };
  for (let i = 0; i < 14; i++) { const z = 5 - i * 3.9 + r() * 1.2; tree(-17 - r() * 4, z, 0.9 + r() * 0.5); tree(17 + r() * 4, z - 1.4, 0.9 + r() * 0.5); }
  for (let i = 0; i < 6; i++) tree(-12 + i * 5 + r() * 2, -45 - r() * 3, 1.1 + r() * 0.5);
  for (const [x, z] of [[-9.5, -4], [10.5, -20], [-5, -27]] as V2[]) tree(x, z, 0.7);
  // golf cart: white body, blue roof, four wheels, seat, a bag at the back
  const cart = new THREE.Group(); cart.position.set(-6.4, 0, 3.4); cart.rotation.y = 0.6; g.add(cart);
  bx(cart, 1.2, 0.34, 2.2, T("#f4f7f0"), 0, 0.5, 0, 0.015); bx(cart, 1.14, 0.1, 1.0, T("#2a7de0"), 0, 0.72, -0.5, 0); bx(cart, 1.0, 0.5, 0.14, T("#2a7de0"), 0, 0.95, 0.35, 0.012);
  bx(cart, 1.3, 0.08, 1.7, T("#2a7de0"), 0, 1.95, -0.1, 0.015); for (const [dx, dz] of [[-0.55, -0.8], [0.55, -0.8], [-0.55, 0.65], [0.55, 0.65]] as V2[]) bx(cart, 0.05, 1.2, 0.05, T("#d8dce6"), dx, 1.35, dz);
  for (const [dx, dz] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 0.8], [0.62, 0.8]] as V2[]) { const w = cy(cart, 0.26, 0.26, 0.2, T("#1b1b22"), dx, 0.26, dz, 0.012, 14); w.rotation.z = PI / 2; }
  const bag = cy(cart, 0.17, 0.2, 0.9, T("#c0392b"), 0, 0.95, 1.15, 0.012, 10); bag.rotation.x = -0.25; for (let i = 0; i < 3; i++) cy(cart, 0.025, 0.025, 0.55, T("#c8ccd4"), -0.08 + i * 0.08, 1.55, 1.3, 0, 6).rotation.x = -0.25;
  // soft hills and a day sky with clouds
  for (const [hx, hz, hs2, col] of [[-30, -70, 22, "#3a9a52"], [14, -76, 28, "#33904b"], [44, -66, 20, "#3a9a52"], [-58, -60, 24, "#2f8a46"]] as [number, number, number, string][]) { const h = sp(g, hs2, T(col), hx, -hs2 * 0.45, hz, 0, 20); h.scale.set(1.5, 0.9, 1); }
  vplane(g, 300, 110, basic(gradTex([[0, "#bfe6ff"], [0.5, "#8ecbff"], [1, "#4a9be8"]], 8, 256), 1, false), 0, 40, -95);
  for (const [cx, cyy, cs] of [[-34, 28, 1.2], [12, 34, 1.6], [46, 26, 1.0], [-8, 42, 1.1]] as V3[]) for (let i = 0; i < 5; i++) { const m = sp(g, 3 * cs, T("#ffffff", { emissive: "#c8d8ee", emissiveIntensity: 0.6 }), cx + (i - 2) * 3.4 * cs, cyy + (i % 2) * 1.2, -90, 0, 12); m.scale.set(1.3, 0.7, 0.5); }
  const lights = mkLights(["#f2f8ff", "#6fa07a", 1.25], ["#fff6e0", 2.6, [6, 14, 8]], [["#ffffff", 30, [0, 8, 4], 22]], 14);
  return { root: g, lights, fog: new THREE.Fog("#a8d6ff", 60, 150), bg: "#8ecbff", spots: { spot: [0, 0, 0], tee: [0, 0, 1.0], green: [0, 0.03, GZ], flag: [0, 3.0, GZ], hole: [0, 0.03, GZ], bunker: [7.4, 0.03, GZ + 1.2], cart: [-6.4, 0.6, 3.4], ball: [-4.2, 0.07, 3.6], sign: [-4.6, 1.55, 1.3] } };
}

// ================= GYM (training gym) =================
function gym(): SetObj {
  const g = new THREE.Group();
  plane(g, 40, 40, T("#ffffff", { map: tileTex("#3b4254", "#343a4b", "#1f2330", 4, 9, 9) }), 0, 0, 0);
  plane(g, 9, 7, T("#2a7de0"), 0, 0.012, 0.8);                                   // blue training mat in the middle
  plane(g, 9.4, 0.18, T("#ffc21f"), 0, 0.016, -2.8); plane(g, 9.4, 0.18, T("#ffc21f"), 0, 0.016, 4.4);
  // walls: bright cream with an orange band, ceiling with light strips
  const wallC = canvasTex(256, 256, (c) => { c.fillStyle = "#f4eddc"; c.fillRect(0, 0, 256, 256); c.fillStyle = "#ff7a1a"; c.fillRect(0, 170, 256, 86); c.fillStyle = "#ffffff"; c.fillRect(0, 162, 256, 8); });
  const wm = T("#ffffff", { map: rep(wallC, 5, 1) });
  bx(g, 16, 4.6, 0.3, wm, 0, 2.3, -6).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 4.6, 16, wm, sx * 8, 2.3, 2).castShadow = false;
  bx(g, 16, 0.2, 16, T("#e8e2d0"), 0, 4.6, 2).castShadow = false;
  for (const z of [-4, 0, 4]) for (const x of [-4.5, 0, 4.5]) glow(g, 2.4, 0.06, 0.45, "#fffbe8", x, 4.45, z, 2.0);
  // mirror wall (two big mirrors) with frames
  const mir = canvasTex(256, 256, (c) => {
    const gr = c.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, "#d8f1ff"); gr.addColorStop(1, "#8fc8ec"); c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
    c.fillStyle = "rgba(255,255,255,0.45)"; for (const x0 of [40, 120]) { c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 34, 0); c.lineTo(x0 - 60, 256); c.lineTo(x0 - 94, 256); c.closePath(); c.fill(); }
  });
  for (const sx of [-1, 1]) {
    bx(g, 3.7, 2.4, 0.12, T("#2b2f3c"), sx * 2.9, 1.95, -5.8, 0.025);
    vplane(g, 3.4, 2.1, basic(mir, 1.05, false), sx * 2.9, 1.95, -5.72);
  }
  // sign: plain lettering
  const sg = canvasTex(512, 160, (c) => {
    c.fillStyle = "#16192a"; c.fillRect(0, 0, 512, 160); c.fillStyle = "#ffc21f"; c.font = "bold 96px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("GYM", 256, 86);
    c.strokeStyle = "#ffc21f"; c.lineWidth = 8; c.strokeRect(6, 6, 500, 148);
  });
  vplane(g, 2.6, 0.81, basic(sg, 1.1, false), 0, 3.5, -5.8);
  // weights rack (left): two shelves of dumbbells in growing sizes
  const rk = T("#2b2f3c"), chrome = T("#b9c2d4"), rub = T("#1b1d26");
  const dumbbell = (p: THREE.Object3D, x: number, y: number, z: number, s: number, col: string) => {
    const h = cy(p, 0.03 * s, 0.03 * s, 0.34 * s, chrome, x, y, z); h.rotation.z = PI / 2;
    for (const sd of [-1, 1]) { const w = cy(p, 0.1 * s, 0.1 * s, 0.1 * s, T(col), x + sd * 0.2 * s, y, z, 0.008, 12); w.rotation.z = PI / 2; }
  };
  const RX = 2.7, RZ = -5.0;
  for (const sx of [-1, 1]) bx(g, 0.1, 1.5, 0.7, rk, RX + sx * 1.25, 0.75, RZ, 0.02);
  for (const [y, k] of [[0.55, 0], [1.05, 1]] as V2[]) {
    bx(g, 2.5, 0.07, 0.65, rk, RX, y, RZ, 0.02);
    for (let i = 0; i < 6; i++) dumbbell(g, RX - 1.0 + i * 0.4, y + 0.1 + (i * 0.008), RZ, 0.7 + i * 0.1, ["#e5233b", "#2a7de0", "#ffc21f", "#2fae4f", "#ff7a1a", "#7b3fe4", "#e5233b"][(i + k * 3) % 7]);
  }
  // bench press (right): padded bench, uprights, loaded barbell
  const BX = -3.2, BZ = -3.2;
  bx(g, 0.5, 0.14, 1.9, T("#1b1d26"), BX, 0.5, BZ + 0.2, 0.02); bx(g, 0.52, 0.06, 1.9, T("#e5233b"), BX, 0.58, BZ + 0.2, 0.01);
  for (const sz of [-0.55, 0.9]) bx(g, 0.4, 0.5, 0.1, rk, BX, 0.25, BZ + sz, 0.015);
  for (const sx of [-1, 1]) { bx(g, 0.1, 1.5, 0.1, rk, BX + sx * 0.75, 0.75, BZ - 0.5, 0.02); bx(g, 0.5, 0.06, 0.1, rk, BX + sx * 0.75, 0.03, BZ - 0.5); bx(g, 0.18, 0.05, 0.1, rk, BX + sx * 0.66, 1.35, BZ - 0.5); }
  const bar = cy(g, 0.03, 0.03, 2.8, chrome, BX, 1.4, BZ - 0.5, 0.01, 10); bar.rotation.z = PI / 2;
  for (const sx of [-1, 1]) for (const [d, r, c] of [[0.95, 0.3, "#e5233b"], [1.08, 0.24, "#2a7de0"], [1.18, 0.17, "#ffc21f"]] as Array<[number, number, string]>) { const pl = cy(g, r, r, 0.08, T(c), BX + sx * d, 1.4, BZ - 0.5, 0.012, 20); pl.rotation.z = PI / 2; }
  // kettlebells in a row on the floor + plate stack
  for (let i = 0; i < 5; i++) {
    const kx = -1.8 + i * 0.62, ks = 0.8 + i * 0.12, col = ["#2fae4f", "#2a7de0", "#ffc21f", "#ff7a1a", "#e5233b"][i];
    sp(g, 0.17 * ks, T(col), kx, 0.17 * ks, -4.9, 0.012, 14);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.1 * ks, 0.025, 6, 14, PI), T("#1b1d26")); h.position.set(kx, 0.3 * ks, -4.9); g.add(h);
  }
  for (let i = 0; i < 4; i++) cy(g, 0.32, 0.32, 0.07, T(["#e5233b", "#2a7de0", "#1b1d26", "#ffc21f"][i]), -2.5, 0.04 + i * 0.075, -4.9, 0.012, 20);
  // treadmill (far right): belt, side rails, console arm with a glowing screen
  const TX = 5.4, TZ = -2.6;
  bx(g, 0.9, 0.22, 2.1, T("#2b2f3c"), TX, 0.28, TZ, 0.02); bx(g, 0.7, 0.03, 1.9, T("#14161e"), TX, 0.4, TZ);
  for (const sx of [-1, 1]) { bx(g, 0.08, 0.2, 1.9, rk, TX + sx * 0.44, 0.42, TZ, 0.01); bx(g, 0.07, 1.25, 0.07, rk, TX + sx * 0.4, 0.95, TZ - 0.95, 0.015); }
  bx(g, 0.95, 0.08, 0.08, rk, TX, 1.4, TZ - 0.95, 0.015); bx(g, 0.8, 0.4, 0.12, T("#1b1d26"), TX, 1.2, TZ - 0.98, 0.02); glow(g, 0.6, 0.22, 0.02, "#37f58a", TX, 1.22, TZ - 0.91, 1.6);
  // wall rope + medicine balls + a clock
  for (let i = 0; i < 3; i++) sp(g, 0.2, T(["#ff7a1a", "#2fae4f", "#7b3fe4"][i]), -7.2 + i * 0.45, 0.2, -2.0 + i * 0.1, 0.012, 14);
  const clk = cy(g, 0.35, 0.35, 0.06, T("#ffffff"), 7.5, 3.4, -4.0, 0.02); clk.rotation.z = PI / 2; clk.position.set(7.82, 3.4, -4.0);
  const lights = mkLights(["#fff8e8", "#a8a090", 1.6], ["#fff4dc", 2.6, [-5, 10, 7]], [["#fffbe8", 40, [-3, 3.8, 0], 16], ["#fffbe8", 40, [3, 3.8, 0], 16], ["#fffbe8", 30, [0, 3.8, -4], 14]], 10);
  return { root: g, lights, fog: new THREE.Fog("#efe6d0", 24, 60), bg: "#efe6d0", spots: { rack: [RX, 1.1, RZ], bench: [BX, 0.6, BZ], mirror: [-2.9, 1.95, -5.7], treadmill: [TX, 0.5, TZ], sign: [0, 3.5, -5.7] } };
}

// ================= STUDIO (1920s animation studio) =================
function studio(): SetObj {
  const g = new THREE.Group();
  plane(g, 40, 40, T("#ffffff", { map: woodTex("#a9763f", "#9a6a38", 6, 6, 6) }), 0, 0, 0);
  plane(g, 9, 6, T("#8a2f3a"), 0, 0.012, -0.6);                                    // worn red rug
  // warm wood-panelled walls
  const wallC = canvasTex(256, 256, (c) => { c.fillStyle = "#e9d3a4"; c.fillRect(0, 0, 256, 256); c.fillStyle = "#7a4a26"; c.fillRect(0, 150, 256, 106); c.fillStyle = "#4a2c14"; c.fillRect(0, 144, 256, 8); c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 2; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 32, 152); c.lineTo(i * 32, 256); c.stroke(); } });
  const wm = T("#ffffff", { map: rep(wallC, 5, 1) });
  bx(g, 16, 4.6, 0.3, wm, 0, 2.3, -6).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 4.6, 16, wm, sx * 8, 2.3, 2).castShadow = false;
  bx(g, 16, 0.2, 16, T("#c9b088"), 0, 4.6, 2).castShadow = false;
  // sign + big window (warm daylight)
  const sg = canvasTex(512, 128, (c) => {
    c.fillStyle = "#1c1410"; c.fillRect(0, 0, 512, 128); c.fillStyle = "#ffd36b"; c.font = "bold 84px Georgia"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("STUDIO", 256, 68);
    c.strokeStyle = "#ffd36b"; c.lineWidth = 6; c.strokeRect(6, 6, 500, 116);
  });
  vplane(g, 1.7, 0.43, basic(sg, 1.1, false), 2.0, 3.3, -5.8);
  bx(g, 2.3, 2.5, 0.12, T("#5a3a1e"), 5.2, 2.2, -5.8, 0.03); vplane(g, 2.0, 2.2, glowMat("#ffe9b8", 1.7), 5.2, 2.2, -5.72);
  bx(g, 0.07, 2.2, 0.1, T("#5a3a1e"), 5.2, 2.2, -5.7); bx(g, 2.0, 0.07, 0.1, T("#5a3a1e"), 5.2, 2.2, -5.7);
  // pinned sketches: a generic rabbit-ish doodle, a round-face doodle, a bouncing ball sequence, film frames
  const sk = (kind: number, seed: number) => canvasTex(128, 160, (c) => {
    c.fillStyle = "#fbf4dc"; c.fillRect(0, 0, 128, 160); c.strokeStyle = "#2a2018"; c.lineWidth = 4; c.lineCap = "round";
    if (kind === 0) { c.beginPath(); c.ellipse(64, 108, 30, 28, 0, 0, PI * 2); c.stroke(); c.beginPath(); c.ellipse(50, 50, 9, 28, -0.15, 0, PI * 2); c.stroke(); c.beginPath(); c.ellipse(78, 50, 9, 28, 0.15, 0, PI * 2); c.stroke(); c.fillStyle = "#2a2018"; c.beginPath(); c.arc(54, 104, 4, 0, PI * 2); c.arc(74, 104, 4, 0, PI * 2); c.fill(); c.beginPath(); c.arc(64, 118, 8, 0.2, PI - 0.2); c.stroke(); }
    else if (kind === 1) { c.beginPath(); c.arc(64, 84, 40, 0, PI * 2); c.stroke(); c.fillStyle = "#2a2018"; c.beginPath(); c.arc(50, 76, 5, 0, PI * 2); c.arc(78, 76, 5, 0, PI * 2); c.fill(); c.beginPath(); c.arc(64, 92, 16, 0.1, PI - 0.1); c.stroke(); c.beginPath(); c.arc(30, 50, 14, 0, PI * 2); c.arc(98, 50, 14, 0, PI * 2); c.stroke(); }
    else { for (let i = 0; i < 5; i++) { const x = 20 + i * 22, y = 120 - Math.abs(Math.sin(i * 0.8)) * 70; c.beginPath(); c.arc(x, y, 9, 0, PI * 2); c.stroke(); } c.beginPath(); c.moveTo(10, 135); c.lineTo(118, 135); c.stroke(); }
    c.strokeStyle = "rgba(60,150,230,0.5)"; c.lineWidth = 2; const r = seeded(seed); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(r() * 128, 0); c.lineTo(r() * 128, 160); c.stroke(); }
  });
  for (let i = 0; i < 7; i++) {
    const x = -7 + i * 1.2 + (i > 3 ? 0.4 : 0), kind = i % 3, rot = ((i * 37) % 9 - 4) * 0.015;
    const m = vplane(g, 0.95, 1.2, basic(sk(kind, 40 + i), 1.05, false), x, 2.1 + (i % 2) * 0.35, -5.78); m.rotation.z = rot;
    sp(g, 0.05, T(["#e5233b", "#2a7de0", "#ffc21f"][i % 3]), x, 2.1 + (i % 2) * 0.35 + 0.52, -5.7);
  }
  const strip = canvasTex(512, 64, (c) => { c.fillStyle = "#14110e"; c.fillRect(0, 0, 512, 64); for (let i = 0; i < 8; i++) { c.fillStyle = "#fbf4dc"; c.fillRect(8 + i * 63, 12, 52, 40); c.fillStyle = "#2a2018"; c.beginPath(); c.arc(34 + i * 63, 34 + Math.sin(i) * 6, 9, 0, PI * 2); c.fill(); for (let k = 0; k < 2; k++) { c.fillStyle = "#fbf4dc"; c.fillRect(14 + i * 63, 3 + k * 53, 8, 6); } } });
  vplane(g, 6.4, 0.8, basic(strip, 1.05, false), -3.6, 3.65, -5.78);
  // drawing desks with glowing light boards (slanted), stools, gooseneck lamps
  const wood = T("#8a5a30"), dark = T("#3a2614");
  const desk = (x: number, z: number, ry: number) => {
    const d = new THREE.Group(); d.position.set(x, 0, z); d.rotation.y = ry; g.add(d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(d, 0.04, 0.05, 0.9, wood, sx * 0.7, 0.45, sz * 0.4, 0.012, 8);
    const top = bx(d, 1.7, 0.08, 1.0, wood, 0, 0.95, 0, 0.02); top.rotation.x = -0.28;
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), glowMat("#fff0b8", 1.5)); lb.position.set(0, 1.0, 0.02); lb.rotation.x = -PI / 2 - 0.28; d.add(lb);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), basic(sk(0, 7), 1.1, false)); paper.position.set(0.05, 1.01, 0.04); paper.rotation.x = -PI / 2 - 0.28; d.add(paper);
    bx(d, 0.5, 0.05, 0.5, dark, 0, 0.5, 1.0, 0.012); cy(d, 0.03, 0.03, 0.5, dark, 0, 0.25, 1.0, 0, 6);
    cy(d, 0.012, 0.012, 0.6, T("#888"), 0.7, 1.35, -0.3, 0, 6); const sh = cone(d, 0.16, 0.2, T("#ffd36b", { emissive: "#a06a10", emissiveIntensity: 0.7 }), 0.55, 1.65, -0.25, 0.01, 12); sh.rotation.z = 0.5; glowSp(d, 0.06, "#fff3c0", 0.6, 1.57, -0.25, 2.4);
    cy(d, 0.012, 0.012, 0.16, T("#ffc21f"), -0.6, 1.1, 0.25, 0, 5).rotation.z = PI / 2;
  };
  desk(-3.7, -3.0, 0.3); desk(-5.6, -0.6, 0.9); desk(-6.2, -4.2, 0.1);
  // film camera on a tripod (right), with two film magazines, lens, crank
  const CX = 2.7, CZ = -3.0, metal = T("#2e3140");
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + 0.5, l = cy(g, 0.03, 0.04, 1.5, wood, CX + Math.cos(a) * 0.32, 0.68, CZ + Math.sin(a) * 0.32, 0.01, 6); l.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
  bx(g, 0.3, 0.1, 0.3, metal, CX, 1.45, CZ, 0.012);
  bx(g, 0.5, 0.42, 0.8, T("#1d2030"), CX, 1.72, CZ, 0.02); bx(g, 0.52, 0.06, 0.82, T("#c28a2e"), CX, 1.95, CZ);
  for (const dz of [-0.1, 0.2]) { const m = cy(g, 0.22, 0.22, 0.18, metal, CX, 2.24, CZ + dz, 0.015, 20); m.rotation.z = PI / 2; const hb = cy(g, 0.07, 0.07, 0.2, T("#c28a2e"), CX, 2.24, CZ + dz, 0, 8); hb.rotation.z = PI / 2; }
  const ln = cy(g, 0.13, 0.17, 0.5, metal, CX, 1.72, CZ + 0.62, 0.015, 16); ln.rotation.x = PI / 2; glowSp(g, 0.1, "#9fd8ff", CX, 1.72, CZ + 0.9, 1.2);
  cy(g, 0.015, 0.015, 0.3, T("#b9c2d4"), CX + 0.3, 1.72, CZ - 0.1, 0, 6).rotation.z = PI / 2; sp(g, 0.05, T("#e5233b"), CX + 0.46, 1.72, CZ - 0.1);
  // film reels: stacked flat cans + big loose reels leaning on a shelf
  for (let i = 0; i < 3; i++) cy(g, 0.3, 0.3, 0.07, T(["#d9d4c4", "#c9503a", "#d9d4c4"][i]), 6.2, 0.05 + i * 0.08, -4.0 + i * 0.05, 0.012, 22);
  bx(g, 3.2, 0.1, 0.5, wood, 2.2, 1.0, -5.6, 0.02); for (const sx of [-1, 1]) bx(g, 0.08, 1.0, 0.45, wood, 2.2 + sx * 1.5, 0.5, -5.6);
  for (let i = 0; i < 5; i++) { const r = cy(g, 0.3, 0.3, 0.06, T("#2e3140"), 1.0 + i * 0.5, 1.37, -5.55, 0.014, 22); r.rotation.x = PI / 2; for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; const h = cy(g, 0.07, 0.07, 0.07, T("#efe6d0"), 1.0 + i * 0.5 + Math.cos(a) * 0.17, 1.37 + Math.sin(a) * 0.17, -5.5, 0, 10); h.rotation.x = PI / 2; } }
  // warm pendant + floor lamps
  for (const x of [-3, 0, 3]) { cy(g, 0.01, 0.01, 0.6, T("#333"), x, 4.3, -1.0, 0, 5); cone(g, 0.45, 0.35, T("#2f6a4a"), x, 3.88, -1.0, 0.015, 14); glowSp(g, 0.14, "#fff3c0", x, 3.78, -1.0, 2.6); }
  for (const x of [-7.2, 7.2]) { cy(g, 0.03, 0.05, 2.0, T("#3a2614"), x, 1.0, -4.8, 0.01, 6); cone(g, 0.34, 0.4, T("#ffd36b", { emissive: "#a06a10", emissiveIntensity: 0.8 }), x, 2.2, -4.8, 0.012, 14); glowSp(g, 0.12, "#fff3c0", x, 2.1, -4.8, 2.4); }
  // storyboard easel with blank cards
  const EX = -1.0, EZ = -4.7;
  for (const sx of [-1, 1]) cy(g, 0.03, 0.03, 2.1, wood, EX + sx * 0.7, 1.0, EZ, 0.01, 6).rotation.z = sx * 0.06;
  bx(g, 1.7, 1.2, 0.05, T("#e9d3a4"), EX, 1.6, EZ + 0.04, 0.015);
  for (let i = 0; i < 6; i++) bx(g, 0.45, 0.35, 0.02, T("#fbf4dc"), EX - 0.5 + (i % 3) * 0.5, 1.9 - Math.floor(i / 3) * 0.45, EZ + 0.08, 0.008);
  const lights = mkLights(["#ffeed0", "#8a6a48", 1.5], ["#ffe6b8", 2.5, [-4, 9, 8]], [["#ffd9a0", 45, [-3, 3.4, -1], 15], ["#ffd9a0", 45, [3, 3.4, -1], 15], ["#ffe9c0", 30, [5, 2.4, -4.4], 10]], 10);
  return { root: g, lights, fog: new THREE.Fog("#ecd9ae", 22, 55), bg: "#ecd9ae", spots: { desk: [-5.2, 1.0, -2.6], camera: [CX, 1.8, CZ], sketches: [-2.0, 2.4, -5.7], reels: [2.2, 1.4, -5.5], sign: [0, 3.85, -5.7] } };
}

// ================= STAGE =================
function stage(): SetObj {
  const g = new THREE.Group();
  plane(g, 60, 60, T("#0d0a1a"), 0, 0, -6);
  bx(g, 20, 0.12, 12, T("#17122a"), 0, 0.06, -5, 0.02);
  for (let i = 0; i < 9; i++) glow(g, 0.05, 0.01, 11.6, ["#ff4da6", "#37e0ff", "#ffd23a"][i % 3], -8 + i * 2, 0.125, -5, 1.4);
  // LED backdrop (centre kept calm so a text card reads)
  const led = canvasTex(512, 256, (c) => {
    const gr = c.createRadialGradient(256, 128, 20, 256, 128, 300); gr.addColorStop(0, "#2a1058"); gr.addColorStop(1, "#6a1b9a"); c.fillStyle = gr; c.fillRect(0, 0, 512, 256);
    const r = seeded(77); for (let i = 0; i < 36; i++) { const x = i * 14.2; if (x > 170 && x < 340) continue; const h = 20 + r() * 90; c.fillStyle = ["#ff4da6", "#37e0ff", "#ffd23a"][i % 3]; c.fillRect(x, 256 - h, 9, h); c.fillRect(x, 0, 9, h * 0.6); }
  });
  bx(g, 14.4, 6.4, 0.3, T("#07050e"), 0, 4.1, -10.8, 0.03);
  const lp = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), basic(led, 1.2, false)); lp.position.set(0, 4.1, -10.62); g.add(lp);
  // truss arch + lights with beams
  for (const sx of [-1, 1]) bx(g, 0.4, 8.2, 0.4, T("#8a8fa6"), sx * 8.4, 4.1, -6.5, 0.02);
  bx(g, 17.2, 0.4, 0.4, T("#8a8fa6"), 0, 8.2, -6.5, 0.02); bx(g, 17.2, 0.4, 0.4, T("#8a8fa6"), 0, 6.6, -6.5, 0.02);
  const cols = ["#ff4da6", "#37e0ff", "#ffd23a", "#b04dff", "#7cff6b"];
  for (let i = 0; i < 9; i++) {
    const x = -7.2 + i * 1.8, col = cols[i % 5];
    bx(g, 0.5, 0.5, 0.6, T("#14121c"), x, 6.3, -6.5, 0.02); glow(g, 0.34, 0.06, 0.34, col, x, 6.03, -6.5, 3);
    beam(g, col, [x, 6.0, -6.5], [x * 0.5, 0.12, i % 2 ? -3.2 : -2.4], 0.9, 0.13);   // pov: every beam lands behind the hero (z<0), never across his face
  }
  // speakers, amps, drum kit, monitors, mic stands
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) { bx(g, 1.5, 0.95, 1.0, T("#14121c"), sx * 8.0, 2.0 + k * 0.97, -4.5, 0.025); glow(g, 1.2, 0.04, 0.02, "#ffffff", sx * 8.0, 2.2 + k * 0.97, -3.98, 0.9); }
    for (let k = 0; k < 2; k++) { bx(g, 1.7, 1.5, 1.4, T("#17142a"), sx * 7.8, 0.87 + 0, -4.0 + k * 0, 0.03); const wf = cy(g, 0.5, 0.5, 0.1, T("#2a2640"), sx * 7.8, 0.85, -3.28, 0.015, 20); wf.rotation.x = PI / 2; ring(g, 0.5, 0.02, "#ff4da6", sx * 7.8, 0.85, -3.25, 0, 0, 1.6); break; }
    bx(g, 1.2, 1.6, 0.7, T("#1b1830"), sx * 5.2, 0.92, -8.0, 0.03); glow(g, 1.0, 0.05, 0.02, "#ff4d3a", sx * 5.2, 1.5, -7.64, 1.6); const ag = cy(g, 0.32, 0.32, 0.05, T("#2a2640"), sx * 5.2, 0.8, -7.62, 0.01, 16); ag.rotation.x = PI / 2;
    const mn = bx(g, 1.1, 0.35, 0.6, T("#17142a"), sx * 2.6, 0.3, 1.0, 0.02); mn.rotation.x = -0.45;
  }
  bx(g, 4.2, 0.4, 3.2, T("#1b1830"), 0, 0.32, -8.2, 0.025);
  const kick = cy(g, 0.55, 0.55, 0.5, T("#ffffff"), 0, 1.0, -8.0, 0.025, 20); kick.rotation.x = PI / 2; ring(g, 0.56, 0.03, "#ff4da6", 0, 1.0, -7.74, 0, 0, 1.6);
  for (const [x, y] of [[-0.9, 1.55], [0.9, 1.55]] as V2[]) { const t = cy(g, 0.32, 0.32, 0.3, T("#ff4da6"), x, y, -8.3, 0.02, 16); t.rotation.x = 0.6; }
  const sn = cy(g, 0.3, 0.3, 0.2, T("#fafafa"), -1.5, 1.1, -7.4, 0.02, 16); void sn;
  for (const [x, y, z] of [[-2.0, 2.2, -8.6], [2.2, 2.1, -8.6], [-1.9, 1.6, -7.2]] as V3[]) { cy(g, 0.012, 0.012, y - 0.4, T("#999"), x, (y + 0.4) / 2, z); cy(g, 0.42, 0.42, 0.02, T("#ffc21f", { emissive: "#7a4a00", emissiveIntensity: 0.5 }), x, y, z).rotation.x = 0.15; }
  for (const x of [-1.5, 2.1]) { cy(g, 0.02, 0.02, 1.5, T("#222"), x, 0.9, 0.4, 0, 6); cy(g, 0.2, 0.2, 0.03, T("#222"), x, 0.14, 0.4); sp(g, 0.07, T("#888"), x, 1.7, 0.45); }
  // barrier, crowd in front-low, glow sticks
  for (let i = -10; i <= 10; i++) bx(g, 1.0, 1.1, 0.1, T("#b0b6c8"), i * 1.0, 0.55, 2.6, 0.015);
  bx(g, 22, 0.1, 0.12, T("#b0b6c8"), 0, 1.1, 2.6);
  const crowdPal = ["#ff4d6d", "#ffd23a", "#3ad1ff", "#7cff6b", "#c77dff", "#ffffff", "#14121c"];
  crowd(g, 0, 0, 3.5, PI, 30, 5, 61, 0.56, 0.06, 0.8, crowdPal, true);
  crowd(g, 0, 0, 10, PI, 36, 4, 62, 0.6, 0.12, 0.8, crowdPal, true);
  const rg = seeded(63); const sticks: It[] = [];
  for (let i = 0; i < 40; i++) { const sx = (rg() < 0.5 ? -1 : 1) * (3.0 + rg() * 3.6); sticks.push({ x: sx, y: 1.5 + rg() * 0.9, z: 3.4 + rg() * 3.5, rz: (rg() - 0.5) * 0.8, c: cols[i % 5] }); } /* pov: glow sticks only at the sides, clear of the hero's head */
  inst(g, new THREE.BoxGeometry(0.05, 0.4, 0.05), glowMat("#ffffff", 3), sticks, false);
  const rc = seeded(64); const conf: It[] = []; const cc = ["#ff4da6", "#37e0ff", "#ffd23a", "#b04dff"];
  for (let i = 0; i < 70; i++) conf.push({ x: (rc() - 0.5) * 10, y: 0.5 + rc() * 5, z: -4 + rc() * 3.2, /* pov: confetti stays behind the hero */ rx: rc() * 3, ry: rc() * 3, s: 0.6 + rc(), c: cc[i % 4] });
  inst(g, new THREE.BoxGeometry(0.1, 0.02, 0.06), glowMat("#ffffff", 2), conf, false);
  const lights = mkLights(["#6a4ab0", "#1a0a30", 0.85], ["#c8a8ff", 1.2, [0, 10, 8]], [["#ff4da6", 60, [-4.5, 4, 1], 14], ["#37e0ff", 60, [4.5, 4, 1], 14], ["#ffd23a", 40, [0, 5, -3], 12], ["#fff0e0", 30, [0, 2.5, 5], 10]], 11);
  return { root: g, lights, fog: new THREE.Fog("#150a28", 24, 62), bg: "#0d0618", spots: { stage: [0, 0.12, 0], center: [0, 0.12, 0], screen: [0, 4.1, -10.6], mic: [-1.5, 1.7, 0.45], sign: [0, 8.2, -6.4] } };
}

// ================= SPACE (the Moon) =================
function space(): SetObj {
  const g = new THREE.Group();
  plane(g, 140, 120, T("#ffffff", { map: noiseTex("#a2a2ac", ["#8e8e99", "#b8b8c2", "#7c7c88"], 1100, 301, 16, 14, 3) }), 0, 0, -22);
  // craters (flat dark discs with a lighter raised rim) and boulders
  const rc = seeded(302); const dsc: It[] = [], rim: It[] = [];
  const crat = [[-2.6, -4.6, 3.0], [5.5, -8, 3.6], [-7.5, -9, 2.8], [8.5, -2.6, 1.8], [-6, 1.5, 1.4], [3.5, 5.5, 1.5], [-9, 6, 2.4], [0.5, -13, 4.5], [11, -12, 3.2], [-13, -3, 3.0], [6.5, 9, 2.0]];
  crat.forEach(([x, z, r]) => { dsc.push({ x, y: 0.012, z, rx: -PI / 2, s: r, c: "#6f6f7c" }); rim.push({ x, y: 0.02, z, rx: PI / 2, s: [r, r, r * 1.6], c: "#c4c4ce" }); dsc.push({ x: x + r * 0.15, y: 0.014, z: z - r * 0.1, rx: -PI / 2, s: r * 0.55, c: "#5c5c69" }); });
  inst(g, new THREE.CircleGeometry(1, 32), T("#ffffff"), dsc, false);
  inst(g, new THREE.TorusGeometry(1, 0.08, 6, 36), T("#ffffff"), rim, true);
  const rocks: It[] = [];
  for (let i = 0; i < 46; i++) { const x = (rc() - 0.5) * 30, z = 5 - rc() * 22; if (Math.hypot(x, z) < 2.2) continue; const s = 0.15 + rc() * rc() * 0.9; rocks.push({ x, y: s * 0.3, z, rx: rc() * 3, ry: rc() * 3, s: [s, s * 0.7, s * 0.9], c: ["#8a8a95", "#a4a4af", "#6e6e7a", "#b8b8c2"][i % 4] }); }
  inst(g, new THREE.DodecahedronGeometry(1, 0), T("#ffffff"), rocks, true);
  const fp: It[] = []; for (let i = 0; i < 8; i++) fp.push({ x: (i % 2 ? 0.25 : -0.25), y: 0.016, z: 4.5 - i * 0.55, s: [0.1, 1, 0.22], c: "#707080" });
  inst(g, new THREE.CylinderGeometry(1, 1, 0.01, 8), T("#ffffff"), fp, false);
  // horizon hills
  for (let i = 0; i < 9; i++) { const h = sp(g, 8 + (i % 3) * 3, T(i % 2 ? "#8a8a96" : "#9a9aa6"), -40 + i * 10, -3, -36 - (i % 2) * 6, 0, 14); h.scale.y = 0.35; h.castShadow = false; }
  // lander
  const L = new THREE.Group(); L.position.set(4.6, 0, -5.2); L.rotation.y = -0.5; g.add(L);
  cy(L, 1.15, 1.3, 0.95, metalMat("#d9a418", 0.5), 0, 1.5, 0, 0.03, 8); cy(L, 0.85, 1.1, 0.6, T("#c9c9d6"), 0, 2.3, 0, 0.03, 8); cy(L, 0.5, 0.5, 0.3, T("#9fb4d0"), 0, 2.8, 0, 0.02, 8);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; const lg = cy(L, 0.05, 0.05, 1.8, T("#d9d9e4"), Math.cos(a) * 1.5, 0.85, Math.sin(a) * 1.5, 0.01, 6); lg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); cy(L, 0.3, 0.3, 0.06, T("#d9d9e4"), Math.cos(a) * 1.8, 0.03, Math.sin(a) * 1.8); }
  bx(L, 0.5, 0.7, 0.04, T("#222"), 0, 2.4, 1.0); cy(L, 0.04, 0.04, 0.8, T("#eee"), 0.6, 3.3, 0); cy(L, 0.3, 0.05, 0.1, T("#eee"), 0.6, 3.75, 0).rotation.z = 0.5;
  // flag
  const fl = canvasTex(256, 160, (c) => { c.fillStyle = "#f2f2f2"; c.fillRect(0, 0, 256, 160); for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#ffc21f" : "#7b3fe4"; c.fillRect(0, i * 32, 256, 32); } c.fillStyle = "#14122a"; c.fillRect(0, 0, 100, 96); c.fillStyle = "#ffffff"; c.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 11 : 26, a = -PI / 2 + k * PI / 5; c.lineTo(50 + Math.cos(a) * r, 48 + Math.sin(a) * r); } c.fill(); });
  cy(g, 0.03, 0.03, 2.6, T("#e8e8f0"), -2.0, 1.3, -1.6, 0.01, 6); cy(g, 0.02, 0.02, 1.4, T("#e8e8f0"), -1.3, 2.3, -1.6).rotation.z = PI / 2;
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.85), new THREE.MeshBasicMaterial({ map: fl, side: THREE.DoubleSide })); fm.position.set(-1.3, 1.85, -1.6); g.add(fm);
  // a blank plaque sign, an antenna dish
  cy(g, 0.03, 0.03, 1.2, T("#e8e8f0"), 2.5, 0.6, -1.4, 0.01, 6); bx(g, 1.5, 0.9, 0.06, T("#dcdcea"), 2.5, 1.4, -1.4, 0.03); bx(g, 1.38, 0.78, 0.02, T("#1c1c2c"), 2.5, 1.4, -1.36);
  // Earth + stars + sun
  const et = canvasTex(512, 256, (c) => {
    c.fillStyle = "#1f6fe0"; c.fillRect(0, 0, 512, 256); const r = seeded(303);
    c.fillStyle = "#2f9a4a"; for (let i = 0; i < 16; i++) { c.beginPath(); c.ellipse(r() * 512, 40 + r() * 170, 20 + r() * 50, 14 + r() * 30, r() * 3, 0, PI * 2); c.fill(); }
    c.fillStyle = "#b08a4a"; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(r() * 512, 60 + r() * 130, 14 + r() * 20, 10 + r() * 12, r() * 3, 0, PI * 2); c.fill(); }
    c.fillStyle = "rgba(255,255,255,0.8)"; for (let i = 0; i < 26; i++) { c.beginPath(); c.ellipse(r() * 512, r() * 256, 30 + r() * 50, 6 + r() * 8, r() * 0.6, 0, PI * 2); c.fill(); }
    c.fillStyle = "#f4f8ff"; c.fillRect(0, 0, 512, 22); c.fillRect(0, 238, 512, 18);
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(5.2, 40, 28), new THREE.MeshBasicMaterial({ map: et, fog: false })); earth.position.set(-4.5, 11, -42); earth.rotation.set(0.3, 2.2, 0.2); g.add(earth);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(5.6, 30, 20), new THREE.MeshBasicMaterial({ color: "#7fc4ff", transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false, fog: false })); atm.position.copy(earth.position); g.add(atm);
  vplane(g, 240, 100, basic(gradTex([[0, "#010208"], [1, "#05081a"]], 8, 64), 1, false), 0, 30, -60);
  stars(g, 260, 304, 150, 4, 60, -58, "#ffffff"); glowSp(g, 1.4, "#fff8e0", 22, 14, -56, 1.6);
  const lights = mkLights(["#4a60a0", "#3a3a48", 0.9], ["#fff4e4", 3.4, [9, 6, 7]], [["#7fc4ff", 24, [-6, 5, -6], 18]], 14);
  return { root: g, lights, bg: "#02030a", spots: { moon: [0, 0, 0], flag: [-1.3, 1.85, -1.6], earth: [-4.5, 11, -42], lander: [4.6, 1.5, -5.2], sign: [2.5, 1.4, -1.34] } };
}

// ================= GARAGE =================
function garage(): SetObj {
  const g = new THREE.Group();
  const flr = canvasTex(256, 256, (c) => {
    c.fillStyle = "#7b7b86"; c.fillRect(0, 0, 256, 256); const r = seeded(401);
    for (let i = 0; i < 400; i++) { c.fillStyle = r() < 0.5 ? "#6c6c77" : "#8a8a95"; c.fillRect(r() * 256, r() * 256, 3 + r() * 6, 2 + r() * 4); }
    c.fillStyle = "rgba(20,20,30,0.4)"; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(60 + i * 80, 120 + (i % 2) * 60, 28, 18, 0.4, 0, PI * 2); c.fill(); }
    c.strokeStyle = "#5c5c66"; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  });
  plane(g, 30, 30, T("#ffffff", { map: rep(flr, 6, 6) }), 0, 0, -2);
  const wallT = canvasTex(256, 256, (c) => { c.fillStyle = "#8696ab"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#5e6c80"; c.lineWidth = 4; for (let j = 0; j < 4; j++) { c.beginPath(); c.moveTo(0, j * 64); c.lineTo(256, j * 64); c.stroke(); for (let i = 0; i < 3; i++) { const x = i * 85 + (j % 2) * 42; c.beginPath(); c.moveTo(x, j * 64); c.lineTo(x, j * 64 + 64); c.stroke(); } } });
  const wm = T("#ffffff", { map: rep(wallT, 4, 1.4) });
  bx(g, 4.3, 3.8, 0.3, wm, -2.25, 1.9, -5.0).castShadow = false; bx(g, 1.3, 3.8, 0.3, wm, 3.75, 1.9, -5.0).castShadow = false; bx(g, 3.2, 1.0, 0.3, wm, 1.5, 3.3, -5.0).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 3.8, 14, wm, sx * 4.3, 1.9, 2).castShadow = false;
  bx(g, 9, 0.2, 14, T("#4a3a2a"), 0, 3.75, 2).castShadow = false;
  for (let i = 0; i < 6; i++) bx(g, 9, 0.2, 0.25, T("#6a4a2a"), 0, 3.6, 7.5 - i * 2.4, 0.01);
  // roll-up door half open on the back wall, dusk outside
  const dusk = gradTex([[0, "#2a2a6a"], [0.5, "#d9687a"], [1, "#ffb870"]], 8, 128);
  vplane(g, 3.2, 2.7, basic(dusk, 1, false), 1.5, 1.35, -5.02);
  for (let i = 0; i < 4; i++) { const hl = sp(g, 1.0 + i * 0.3, T("#2a2040"), 0.3 + i * 0.9, 0.2, -5.6, 0, 10); hl.scale.y = 0.6; hl.castShadow = false; }
  const slat = canvasTex(64, 256, (c) => { c.fillStyle = "#d9d3c4"; c.fillRect(0, 0, 64, 256); c.strokeStyle = "#8a8474"; c.lineWidth = 3; for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 32); c.lineTo(64, j * 32); c.stroke(); } });
  bx(g, 3.2, 1.3, 0.12, T("#ffffff", { map: rep(slat, 1, 1) }), 1.5, 2.05, -4.82, 0.02);
  for (const sx of [-1, 1]) bx(g, 0.12, 2.8, 0.2, T("#4a4a58"), 1.5 + sx * 1.66, 1.4, -4.85, 0.01);
  bx(g, 3.4, 0.2, 0.25, T("#4a4a58"), 1.5, 2.8, -4.85, 0.01);
  glow(g, 3.0, 0.06, 0.06, "#ffb870", 1.5, 0.04, -4.95, 1.4);
  // pegboard with tool silhouettes
  const pb = canvasTex(256, 160, (c) => {
    c.fillStyle = "#c9a16a"; c.fillRect(0, 0, 256, 160); c.fillStyle = "#a07a46"; for (let i = 0; i < 16; i++) for (let j = 0; j < 10; j++) c.fillRect(i * 16 + 6, j * 16 + 6, 3, 3);
    const tool = (x: number, y: number, w: number, h: number, hc: string, tc: string) => { c.fillStyle = "#6e4e2a"; c.fillRect(x + 3, y + 3, w, h); c.fillStyle = hc; c.fillRect(x, y, w * 0.3, h); c.fillStyle = tc; c.fillRect(x + w * 0.3, y, w * 0.7, h * 0.35); };
    tool(14, 14, 50, 12, "#c62828", "#8a93a8"); tool(76, 16, 60, 10, "#1e66c8", "#8a93a8"); tool(150, 12, 70, 14, "#ffc21f", "#8a93a8");
    c.fillStyle = "#6e4e2a"; c.fillRect(24, 60, 70, 8); c.fillStyle = "#8a93a8"; c.beginPath(); c.moveTo(20, 56); c.lineTo(100, 56); c.lineTo(100, 74); c.lineTo(20, 64); c.fill();
    for (let i = 0; i < 4; i++) { c.fillStyle = "#6e4e2a"; c.fillRect(124 + i * 30 + 3, 54 + 3, 10, 44); c.fillStyle = ["#e5233b", "#ffc21f", "#2a7de0", "#7cff6b"][i]; c.fillRect(124 + i * 30, 54, 10, 44); c.fillStyle = "#8a93a8"; c.fillRect(126 + i * 30, 98, 6, 12); }
    c.strokeStyle = "#6e4e2a"; c.lineWidth = 7; c.beginPath(); c.arc(60, 128, 16, 0, PI * 2); c.stroke(); c.beginPath(); c.arc(110, 128, 12, 0, PI * 2); c.stroke(); c.fillStyle = "#8a93a8"; c.fillRect(150, 118, 70, 16);
  });
  bx(g, 3.2, 2.0, 0.08, T("#7a5a32"), -2.6, 2.0, -4.8, 0.02); vplane(g, 3.0, 1.88, basic(pb, 1.05, true), -2.6, 2.0, -4.75);
  // workbench, vice, tools
  bx(g, 2.8, 0.1, 0.9, T("#b97a3c"), -2.6, 0.96, -4.2, 0.02);
  for (const sx of [-1, 1]) bx(g, 0.1, 0.9, 0.8, T("#8a5a30"), -2.6 + sx * 1.3, 0.45, -4.2);
  bx(g, 2.6, 0.06, 0.8, T("#8a5a30"), -2.6, 0.4, -4.2); bx(g, 0.6, 0.35, 0.4, T("#2a6fd0"), -3.3, 0.6, -4.2, 0.02); bx(g, 0.5, 0.2, 0.3, T("#c62828"), -1.9, 0.52, -4.2, 0.02);
  bx(g, 0.25, 0.2, 0.2, T("#3a3a48"), -3.7, 1.1, -4.3, 0.02); bx(g, 0.05, 0.15, 0.12, T("#8a93a8"), -3.7, 1.28, -4.3);
  bx(g, 0.5, 0.06, 0.06, T("#8a93a8"), -2.9, 1.03, -4.0); bx(g, 0.25, 0.06, 0.12, T("#c62828"), -3.2, 1.04, -4.1); cy(g, 0.05, 0.05, 0.3, T("#ffc21f"), -2.2, 1.14, -4.3, 0.01, 8); sp(g, 0.14, T("#fff"), -1.8, 1.1, -4.2, 0.01);
  // rolling toolbox, drums, tyres, shelves of boxes
  bx(g, 0.9, 1.1, 0.6, T("#d82f3a"), -3.9, 0.55, -2.6, 0.03); for (let k = 0; k < 4; k++) bx(g, 0.76, 0.02, 0.02, T("#6a1018"), -3.9, 0.25 + k * 0.22, -2.29);
  for (const [x, z, c] of [[3.7, -4.2, "#2a7de0"], [3.0, -4.3, "#c62828"]] as Array<[number, number, string]>) { cy(g, 0.4, 0.4, 0.95, T(c), x, 0.48, z, 0.025, 14); for (const dy of [0.25, 0.7]) cy(g, 0.41, 0.41, 0.04, T("#22222c"), x, dy, z); }
  for (let i = 0; i < 4; i++) { const t = cy(g, 0.42, 0.42, 0.24, T("#16161e"), -3.7, 0.14 + i * 0.25, -0.9, 0.02, 16); void t; } cy(g, 0.2, 0.2, 0.05, T("#aab"), -3.7, 1.0, -0.9, 0, 10);
  bx(g, 0.5, 2.4, 1.8, T("#6a5a48"), 3.9, 1.2, -2.2, 0.02); for (let k = 0; k < 4; k++) bx(g, 0.58, 0.06, 1.8, T("#8a6a48"), 3.9, 0.3 + k * 0.6, -2.2);
  const bc = ["#c9955a", "#b8844a", "#d8a46a"];
  for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) bx(g, 0.42, 0.42, 0.5, T(bc[(i + k) % 3]), 3.85, 0.55 + k * 0.6, -2.8 + i * 0.58, 0.015);
  for (let i = 0; i < 3; i++) bx(g, 0.8, 0.5, 0.7, T(bc[i]), 3.1 - i * 0.05, 0.25 + i * 0.5, 0.8, 0.02).rotation.y = i * 0.2;
  cy(g, 0.25, 0.25, 0.3, T("#ffc21f"), 2.4, 0.15, 2.0, 0.015, 10); cy(g, 0.25, 0.25, 0.3, T("#e5233b"), 2.8, 0.15, 2.3, 0.015, 10);
  // hanging bulb
  cy(g, 0.01, 0.01, 1.2, T("#222"), 0, 3.2, -1.0, 0, 4); cone(g, 0.32, 0.28, T("#2a2a32"), 0, 2.55, -1.0, 0.012, 14);
  const bulb = glowSp(g, 0.12, "#fff2c0", 0, 2.45, -1.0, 3.2); void bulb;
  // blank wooden sign above the door
  bx(g, 2.8, 0.7, 0.1, T("#a8672f"), 1.5, 3.3, -4.8, 0.03); bx(g, 2.6, 0.5, 0.02, T("#6e3f1d"), 1.5, 3.3, -4.74);
  // oil can, jack, creeper, paint
  bx(g, 1.2, 0.12, 0.6, T("#c62828"), 1.8, 0.1, 0.6, 0.02).rotation.y = 0.3; for (const sx of [-1, 1]) cy(g, 0.05, 0.05, 0.05, T("#222"), 1.8 + sx * 0.5, 0.02, 0.6, 0, 6);
  const lights = mkLights(["#e8c898", "#4a3a2a", 0.8], ["#ffd9a8", 1.1, [3, 8, 8]], [["#ffcf80", 90, [0, 2.4, -1.0], 12], ["#ff9a6a", 40, [1.5, 1.5, -4.5], 8], ["#fff0d8", 24, [0, 3, 5], 12]], 9);
  return { root: g, lights, fog: new THREE.Fog("#2a2630", 22, 55), bg: "#2a2630", spots: { garage: [0, 0, 0], bench: [-2.6, 1.0, -4.2], pegboard: [-2.6, 2.0, -4.74], sign: [1.5, 3.3, -4.73], door: [1.5, 1.4, -4.8], bulb: [0, 2.45, -1.0] } };
}

// ================= CLASSROOM =================
function classroom(): SetObj {
  const g = new THREE.Group();
  plane(g, 30, 30, T("#ffffff", { map: tileTex("#dccfa8", "#cdbf96", "#aa9c74", 4, 8, 8) }), 0, 0, 0);
  const wallC = canvasTex(256, 256, (c) => { c.fillStyle = "#f2e1b8"; c.fillRect(0, 0, 256, 256); c.fillStyle = "#2f9aa0"; c.fillRect(0, 150, 256, 106); c.fillStyle = "#f4f4f4"; c.fillRect(0, 144, 256, 8); });
  const wm = T("#ffffff", { map: rep(wallC, 4, 1) });
  bx(g, 12, 4, 0.3, wm, 0, 2, -5).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 4, 16, wm, sx * 6, 2, 2).castShadow = false;
  bx(g, 12, 0.2, 16, T("#efe8d4"), 0, 4.0, 2).castShadow = false;
  for (const z of [-3, 0.5, 4]) for (const x of [-2.5, 2.5]) glow(g, 1.8, 0.05, 0.5, "#fffbe8", x, 3.9, z, 1.8);
  // chalkboard (blank) with frame + tray
  bx(g, 6.4, 2.3, 0.1, T("#a8672f"), 0, 2.15, -4.82, 0.03); bx(g, 6.0, 1.9, 0.05, T("#2f5a48"), 0, 2.15, -4.76);
  const sm = canvasTex(256, 128, (c) => { c.clearRect(0, 0, 256, 128); c.fillStyle = "rgba(255,255,255,0.12)"; const r = seeded(402); for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(r() * 256, r() * 128, 20 + r() * 30, 5 + r() * 8, r() * 3, 0, PI * 2); c.fill(); } });
  const smm = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.9), new THREE.MeshBasicMaterial({ map: sm, transparent: true })); smm.position.set(0, 2.15, -4.73); g.add(smm);
  bx(g, 6.4, 0.08, 0.2, T("#a8672f"), 0, 1.15, -4.72); bx(g, 0.2, 0.05, 0.08, T("#ffffff"), -1, 1.22, -4.7); bx(g, 0.5, 0.06, 0.1, T("#d8cfa0"), 1.2, 1.22, -4.7);
  // alphabet strip, clock, posters, windows
  const ab = canvasTex(512, 64, (c) => { c.fillStyle = "#fff6d8"; c.fillRect(0, 0, 512, 64); c.font = "bold 40px Arial"; c.textAlign = "center"; const cs = ["#e5233b", "#2a7de0", "#2fae4f", "#ffc21f", "#7b3fe4"]; "ABCDEFGHIJKLM".split("").forEach((ch, i) => { c.fillStyle = cs[i % 5]; c.fillText(ch, 20 + i * 39, 48); }); });
  vplane(g, 6, 0.75, basic(ab, 1.05, true), 0, 3.6, -4.82);
  const clk = cy(g, 0.4, 0.4, 0.06, T("#ffffff"), 4.3, 3.3, -4.8, 0.025); clk.rotation.x = PI / 2; bx(g, 0.04, 0.28, 0.03, T("#111"), 4.3, 3.4, -4.74); bx(g, 0.2, 0.04, 0.03, T("#111"), 4.38, 3.3, -4.74);
  const pcol: Array<[string, string]> = [["#1b2a6a", "#ffc21f"], ["#2fae4f", "#ffffff"], ["#e5233b", "#ffd23a"]];
  for (let i = 0; i < 3; i++) vplane(g, 1.0, 1.4, basic(posterTex(pcol[i][0], pcol[i][1], 410 + i)), -4.6 + i * 1.1, 2.3 + (i % 2) * 0.2, -4.82);
  for (let i = 0; i < 3; i++) vplane(g, 0.9, 1.3, basic(posterTex(["#ff6f61", "#6bc5ff", "#ffd54a"][i], "#fff", 420 + i)), 3.4 + i * 1.0, 2.1 + (i % 2) * 0.1, -4.82);
  for (const z of [-2.6, 0.2, 3.0]) {
    bx(g, 0.1, 2.0, 2.0, T("#8a5a30"), -5.8, 2.0, z, 0.02); const wg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.7), glowMat("#cfeaff", 1.7)); wg.position.set(-5.84, 2.0, z); wg.rotation.y = PI / 2; g.add(wg);
    bx(g, 0.08, 0.08, 1.8, T("#8a5a30"), -5.78, 2.0, z); bx(g, 0.08, 1.7, 0.08, T("#8a5a30"), -5.78, 2.0, z);
    bx(g, 0.35, 0.06, 2.1, T("#e8dcc0"), -5.7, 1.1, z); plant(g, -5.5, z, 0.45);
  }
  // teacher desk, apple, globe, bookshelf
  bx(g, 1.6, 0.08, 0.8, T("#a8672f"), -3.4, 0.82, -3.5, 0.02); bx(g, 1.5, 0.76, 0.7, T("#8a5a30"), -3.4, 0.4, -3.5, 0.02); sp(g, 0.1, T("#e5233b"), -3.0, 0.96, -3.4); cy(g, 0.14, 0.14, 0.2, T("#fff"), -3.8, 0.96, -3.5, 0.01, 10); bx(g, 0.4, 0.3, 0.04, T("#222"), -3.4, 1.05, -3.7);
  cy(g, 0.03, 0.03, 0.9, T("#555"), 3.8, 0.45, -3.6); sp(g, 0.35, T("#2a7de0"), 3.8, 1.2, -3.6, 0.02); for (let i = 0; i < 4; i++) sp(g, 0.14, T("#2fae4f"), 3.8 + Math.cos(i * 1.6) * 0.25, 1.2 + Math.sin(i * 2) * 0.2, -3.6 + Math.sin(i * 1.6) * 0.25, 0, 6);
  bx(g, 0.5, 2.2, 3.0, T("#8a5a30"), 5.7, 1.1, -2.4, 0.02);
  const bk = ["#e5233b", "#2a7de0", "#ffc21f", "#2fae4f", "#7b3fe4", "#ff8a1a"]; const rb = seeded(411);
  for (let k = 0; k < 3; k++) for (let i = 0; i < 9; i++) bx(g, 0.3, 0.3 + rb() * 0.12, 0.2, T(bk[(i + k) % 6]), 5.4, 0.55 + k * 0.7, -3.7 + i * 0.28, 0.01);
  // student desks with chairs (face the board)
  const cc = ["#ff8a1a", "#2a7de0", "#2fae4f", "#e5233b"];
  const sdesk = (x: number, z: number, i: number) => {
    const d = new THREE.Group(); d.position.set(x, 0, z); d.rotation.y = (i % 3 - 1) * 0.05; g.add(d);
    bx(d, 0.9, 0.05, 0.6, T("#e0b878"), 0, 0.74, 0, 0.015); bx(d, 0.8, 0.14, 0.5, T("#6a7288"), 0, 0.6, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(d, 0.02, 0.02, 0.72, T("#8a93a8"), sx * 0.4, 0.36, sz * 0.25, 0, 6);
    bx(d, 0.4, 0.04, 0.3, T(["#fff", "#ffe08a", "#9fd8ff"][i % 3]), 0.1, 0.78, 0.05).rotation.y = 0.2; cy(d, 0.012, 0.012, 0.18, T("#ffc21f"), -0.2, 0.78, 0.05, 0, 5).rotation.z = PI / 2;
    bx(d, 0.45, 0.05, 0.45, T(cc[i % 4]), 0, 0.46, 0.7, 0.015); bx(d, 0.45, 0.4, 0.05, T(cc[i % 4]), 0, 0.72, 0.92, 0.015); for (const sx of [-1, 1]) cy(d, 0.02, 0.02, 0.46, T("#8a93a8"), sx * 0.2, 0.23, 0.7, 0, 5);
  };
  let n = 0;
  for (const z of [-1.3, 0.9, 3.1]) for (const x of [-3.5, -2.2, 2.2, 3.5]) sdesk(x, z, n++);
  const lights = mkLights(["#fff4dc", "#a89a78", 1.4], ["#fff0d0", 2.6, [-6, 8, 5]], [["#fffbe8", 40, [0, 3.6, 0.5], 14], ["#fffbe8", 40, [0, 3.6, -3], 14], ["#cfeaff", 30, [-5, 2, 0], 10]], 10);
  return { root: g, lights, fog: new THREE.Fog("#e8dcc0", 22, 55), bg: "#e8dcc0", spots: { teacher: [0, 0, 0], board: [0, 2.15, -4.7], clock: [4.3, 3.3, -4.74], desk: [-3.4, 0.9, -3.5], poster: [4.3, 2.1, -4.8] } };
}

// ================= BATHROOM =================
function bathroom(): SetObj {
  const g = new THREE.Group();
  plane(g, 30, 30, T("#ffffff", { map: tileTex("#f3fbfa", "#bfe3e0", "#9ab8b6", 2, 12, 12) }), 0, 0, 0);
  const wt = canvasTex(256, 256, (c) => {
    c.fillStyle = "#f6f9f9"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#b8c8ca"; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, 256); c.stroke(); c.beginPath(); c.moveTo(0, i * 64); c.lineTo(256, i * 64); c.stroke(); }
    c.fillStyle = "#2aa6a0"; c.fillRect(0, 128, 256, 64);
  });
  const wm = T("#ffffff", { map: rep(wt, 3, 1.1) });
  bx(g, 10, 3.4, 0.3, wm, 0, 1.7, -5.2).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 3.4, 16, wm, sx * 4.6, 1.7, 2).castShadow = false;
  bx(g, 10, 0.2, 16, T("#e8eeee"), 0, 3.4, 2).castShadow = false;
  for (const z of [-2.5, 1.5]) for (const x of [-2, 2]) glow(g, 1.8, 0.05, 0.5, "#f0ffff", x, 3.28, z, 2);
  // stalls along the back wall
  const stallC = T("#2aa6a0"), doorC = T("#35bdb5");
  for (let i = 0; i <= 4; i++) bx(g, 0.06, 2.0, 1.9, stallC, -4.4 + i * 2.2, 1.15, -4.25, 0.02);
  for (let i = 0; i < 4; i++) {
    const cx = -3.3 + i * 2.2;
    cy(g, 0.28, 0.24, 0.35, T("#ffffff"), cx, 0.28, -4.5, 0.02, 16); bx(g, 0.55, 0.45, 0.2, T("#ffffff"), cx, 0.65, -4.95, 0.02);
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 18), T("#f2f2f2")); sc.rotation.x = -PI / 2; sc.scale.y = 1.2; sc.position.set(cx, 0.48, -4.5); g.add(sc);
    cy(g, 0.12, 0.12, 0.12, T("#ddd"), cx + 0.5, 0.15, -4.9, 0.01, 8);
    if (i % 2) { bx(g, 1.9, 1.85, 0.06, doorC, cx, 1.1, -3.3, 0.025); bx(g, 0.12, 0.05, 0.05, T("#c9ced6"), cx - 0.6, 1.1, -3.25); glow(g, 0.1, 0.1, 0.02, "#e5233b", cx - 0.6, 1.25, -3.25, 1.2); }
    else { const h = new THREE.Group(); h.position.set(cx + 0.95, 1.1, -3.3); h.rotation.y = i === 0 ? -1.2 : 1.0 + 0.2; g.add(h); bx(h, 1.9, 1.85, 0.06, doorC, -0.95, 0, 0, 0.025); glow(h, 0.1, 0.1, 0.02, "#2fe07a", -1.5, 0.15, 0.04, 1.2); }
  }
  panel(g, 1.6, 0.55, 0, 2.85, -5.02, "#8ae0ff", 0, "#103a5a");
  // sinks and mirrors on the left wall
  for (const z of [-2.6, -0.8, 1.0]) {
    bx(g, 0.7, 0.18, 0.8, T("#ffffff"), -4.2, 0.9, z, 0.02); bx(g, 0.5, 0.65, 0.5, T("#e6eef0"), -4.2, 0.55, z, 0.015); cy(g, 0.03, 0.03, 0.25, T("#c9ced6"), -4.45, 1.08, z, 0.01, 8); bx(g, 0.14, 0.03, 0.03, T("#c9ced6"), -4.38, 1.2, z);
    bx(g, 0.06, 1.3, 1.0, T("#b9c6c8"), -4.45, 1.9, z, 0.02); const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.2), basic(gradTex([[0, "#bfe8ff"], [1, "#e8f8ff"]], 8, 64), 1.15, false)); mir.position.set(-4.41, 1.9, z); mir.rotation.y = PI / 2; g.add(mir);
  }
  bx(g, 0.2, 0.3, 0.15, T("#e5e8ee"), -4.4, 1.5, 2.6, 0.015); bx(g, 0.2, 0.5, 0.4, T("#d0d6de"), 4.4, 1.4, -1.0, 0.02); bx(g, 0.3, 0.5, 0.3, T("#8a93a8"), 4.35, 0.3, 1.0, 0.02);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glowMat("#e0f4ff", 1.6)); win.position.set(4.44, 2.2, -2.5); win.rotation.y = -PI / 2; g.add(win);
  // mop and bucket, wet floor sign, puddle
  cy(g, 0.28, 0.22, 0.45, T("#ffd23a"), 2.8, 0.23, -1.9, 0.025, 14); cy(g, 0.02, 0.02, 1.7, T("#a8672f"), 2.55, 0.9, -2.2, 0.01, 6).rotation.set(0.0, 0, 0.3);
  for (let i = 0; i < 8; i++) sp(g, 0.1, T("#f4f4f4"), 2.95 + Math.cos(i) * 0.12, 0.12, -2.2 + Math.sin(i) * 0.12, 0, 6);
  for (const s of [-1, 1]) { const a = bx(g, 0.4, 0.62, 0.03, T("#ffd23a"), -1.9 + s * 0.14, 0.32, 1.4, 0.02); a.rotation.x = s * 0.0; a.rotation.z = 0; a.rotation.y = 0; a.position.z = 1.4 + s * 0.12; a.rotation.x = -s * 0.2; }
  glow(g, 0.2, 0.2, 0.02, "#222222", -1.9, 0.4, 1.53, 0.6);
  const pd = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: "#9fd8ff", transparent: true, opacity: 0.55, depthWrite: false })); pd.rotation.x = -PI / 2; pd.position.set(-1.2, 0.015, 1.5); pd.scale.y = 0.7; g.add(pd);
  cy(g, 0.22, 0.18, 0.5, T("#8a93a8"), 3.9, 0.25, 2.2, 0.02, 12); cy(g, 0.03, 0.03, 0.5, T("#e5233b"), 3.6, 0.5, 1.2, 0, 6); sp(g, 0.1, T("#e5233b"), 3.6, 0.2, 1.2, 0, 8);
  const lights = mkLights(["#eaffff", "#8aa8a4", 1.5], ["#f0ffff", 2.2, [2, 9, 7]], [["#f0ffff", 40, [0, 3.0, -1], 12], ["#f0ffff", 40, [0, 3.0, 3], 12], ["#e0f4ff", 20, [4, 2, -2], 8]], 9);
  return { root: g, lights, fog: new THREE.Fog("#e8f6f4", 22, 55), bg: "#e8f6f4", spots: { floor: [0, 0, 0], sign: [0, 2.85, -5.0], stall: [1.1, 0, -3.8], mirror: [-4.4, 1.9, -0.8], mop: [2.8, 0.45, -1.9] } };
}

// ================= MANSION =================
function mansion(): SetObj {
  const g = new THREE.Group(); const gold = GOLD();
  plane(g, 40, 40, T("#ffffff", { map: tileTex("#f1e9d6", "#2a2430", "#c9a24a", 2, 10, 10) }), 0, 0, 0);
  const wt = canvasTex(256, 512, (c) => {
    c.fillStyle = "#f1e5c8"; c.fillRect(0, 0, 256, 512); c.strokeStyle = "#d4aa3a"; c.lineWidth = 5; c.strokeRect(14, 30, 228, 330); c.strokeRect(28, 44, 200, 302);
    c.fillStyle = "#e3d2a8"; c.fillRect(0, 380, 256, 132); c.strokeStyle = "#d4aa3a"; c.strokeRect(14, 396, 228, 100); c.fillRect(0, 370, 256, 4);
  });
  const wm = T("#ffffff", { map: rep(wt, 4, 1) });
  bx(g, 18, 7, 0.3, wm, 0, 3.5, -7).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.3, 7, 20, wm, sx * 7.5, 3.5, 2).castShadow = false;
  bx(g, 18, 0.2, 20, T("#f6eedc"), 0, 7, 2).castShadow = false;
  // arched windows with drapes
  for (const sx of [-1, 1]) {
    const x = sx * 4.6;
    arch(g, 2.2, 4.6, T("#d4aa3a", { emissive: "#6a4a00", emissiveIntensity: 0.3 }), x, 1.1, -6.82); arch(g, 1.9, 4.3, new THREE.MeshBasicMaterial({ map: gradTex([[0, "#ff9f6a"], [0.5, "#c0507a"], [1, "#2a2a6a"]], 8, 128), fog: false }), x, 1.1, -6.8);
    for (const dx of [-1.2, 1.2]) { bx(g, 0.6, 4.8, 0.2, T("#8a1020"), x + dx, 3.4, -6.6, 0.02); for (let k = 0; k < 3; k++) bx(g, 0.04, 4.8, 0.22, T("#6a0a16"), x + dx + (k - 1) * 0.18, 3.4, -6.6); }
    bx(g, 3.6, 0.1, 0.12, gold, x, 5.9, -6.5);
  }
  // fireplace + gilded blank painting
  bx(g, 3.0, 1.5, 0.9, T("#f6f2ea"), 0, 0.75, -6.5, 0.03); bx(g, 3.4, 0.14, 1.1, T("#e6dfd0"), 0, 1.55, -6.5, 0.025); bx(g, 1.6, 1.0, 0.1, T("#14101a"), 0, 0.6, -6.02); glow(g, 1.2, 0.4, 0.05, "#ff8a2a", 0, 0.3, -6.0, 2.2); glow(g, 0.7, 0.55, 0.05, "#ffc21f", 0, 0.45, -5.98, 2.4);
  bx(g, 3.2, 2.3, 0.18, gold, 0, 3.4, -6.9, 0.03); bx(g, 2.8, 1.9, 0.06, T("#2a2234"), 0, 3.4, -6.8);
  // columns with gold capitals
  for (const sx of [-1, 1]) for (const z of [-6.2, -1.6]) { cy(g, 0.4, 0.46, 7, T("#f6efde"), sx * 6.6, 3.5, z, 0.02, 14); bx(g, 1.1, 0.3, 1.1, gold, sx * 6.6, 6.9, z, 0.02); bx(g, 1.0, 0.3, 1.0, gold, sx * 6.6, 0.15, z, 0.02); for (let k = 0; k < 4; k++) glow(g, 0.04, 6, 0.04, "#e8d8b0", sx * 6.6 + Math.cos(k * 1.57) * 0.4, 3.5, z + Math.sin(k * 1.57) * 0.4, 0.9); }
  // round rug
  const rug = (r: number, c: string, y: number) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), T(c)); m.rotation.x = -PI / 2; m.position.set(0, y, 0.5); m.receiveShadow = true; g.add(m); };
  rug(3.6, "#d4aa3a", 0.012); rug(3.4, "#8a1020", 0.016); rug(2.4, "#d4aa3a", 0.02); rug(2.3, "#5a0a16", 0.024);
  // sofa, armchairs, coffee table
  const velvet = T("#0f6b52");
  bx(g, 3.6, 0.45, 1.2, velvet, 0, 0.45, -3.0, 0.03); bx(g, 3.6, 0.9, 0.35, velvet, 0, 0.95, -3.5, 0.03); for (const sx of [-1, 1]) { bx(g, 0.35, 0.75, 1.2, velvet, sx * 1.85, 0.62, -3.0, 0.03); cy(g, 0.05, 0.05, 0.2, gold, sx * 1.6, 0.1, -2.6, 0, 8); cy(g, 0.05, 0.05, 0.2, gold, sx * 1.6, 0.1, -3.4, 0, 8); }
  for (let i = 0; i < 3; i++) bx(g, 1.0, 0.18, 0.95, T("#0c5a45"), -1.2 + i * 1.2, 0.77, -2.95, 0.015);
  for (const sx of [-1, 1]) { const ar = new THREE.Group(); ar.position.set(sx * 4.2, 0, -0.5); ar.rotation.y = -sx * 0.7; g.add(ar); bx(ar, 1.1, 0.45, 1.0, T("#8a1020"), 0, 0.45, 0, 0.03); bx(ar, 1.1, 0.85, 0.25, T("#8a1020"), 0, 0.85, -0.4, 0.03); for (const dx of [-0.5, 0.5]) bx(ar, 0.15, 0.2, 0.9, gold, dx, 0.7, 0, 0.01); for (const dx of [-0.45, 0.45]) for (const dz of [-0.4, 0.4]) cy(ar, 0.04, 0.04, 0.22, gold, dx, 0.11, dz, 0, 6); }
  cy(g, 0.6, 0.6, 0.06, gold, 2.4, 0.5, -1.2, 0.02, 20); cy(g, 0.08, 0.08, 0.5, gold, 2.4, 0.25, -1.2, 0, 8); cy(g, 0.35, 0.35, 0.04, T("#ffffff", { emissive: "#aabbcc", emissiveIntensity: 0.2 }), 2.4, 0.54, -1.2); cy(g, 0.06, 0.1, 0.3, T("#e5233b"), 2.3, 0.7, -1.15, 0.01, 8);
  // chandelier
  const ch = new THREE.Group(); ch.position.set(0, 5.0, -0.5); g.add(ch);
  cy(ch, 0.02, 0.02, 2.2, gold, 0, 1.2, 0, 0, 4); cy(ch, 0.14, 0.2, 0.9, gold, 0, 0, 0, 0.01, 10);
  for (const [r, y] of [[1.6, -0.4], [1.0, -0.15], [0.5, 0.15]] as V2[]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 28), gold); t.rotation.x = PI / 2; t.position.y = y; ch.add(t);
    const n = Math.round(r * 8); for (let k = 0; k < n; k++) { const a = k / n * PI * 2; cy(ch, 0.03, 0.03, 0.14, T("#fff7e0"), Math.cos(a) * r, y + 0.1, Math.sin(a) * r, 0, 5); glowSp(ch, 0.05, "#ffe9a8", Math.cos(a) * r, y + 0.22, Math.sin(a) * r, 3); const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff6d8").multiplyScalar(1.5) })); cr.scale.y = 1.8; cr.position.set(Math.cos(a) * r, y - 0.2, Math.sin(a) * r); ch.add(cr); }
  }
  // staircase + gold rail on the left
  for (let k = 0; k < 12; k++) { bx(g, 1.6, 0.22 * (k + 1), 0.5, T(k % 2 ? "#f1e9d6" : "#e8dcc0"), -6.1, 0.11 * (k + 1), 1.2 - k * 0.5, 0.012); bx(g, 1.6, 0.04, 0.52, T("#8a1020"), -6.1, 0.22 * (k + 1) + 0.01, 1.2 - k * 0.5); }
  const rail = bx(g, 0.07, 0.07, 6.4, gold, -5.2, 1.5, -1.6); rail.rotation.x = -Math.atan(0.22 / 0.5);
  for (let k = 0; k < 12; k += 2) cy(g, 0.04, 0.04, 1.0 + 0.22 * (k + 1) * 0.0, gold, -5.2, 0.22 * (k + 1) + 0.5, 1.2 - k * 0.5, 0, 6);
  // vases on pedestals, sconces, plant
  for (const sx of [-1, 1]) { cy(g, 0.28, 0.3, 1.0, T("#f6efde"), sx * 2.3, 0.5, -6.0, 0.02, 12); sp(g, 0.28, T("#2a7de0"), sx * 2.3, 1.25, -6.0, 0.02); cy(g, 0.1, 0.16, 0.25, T("#2a7de0"), sx * 2.3, 1.55, -6.0, 0.02, 10); }
  for (const z of [-4, -0.5, 3]) glowSp(g, 0.14, "#ffe9a8", 7.2, 3.0, z, 2.6);
  plant(g, 5.6, 0.6, 1.3, "#d4aa3a");
  const lights = mkLights(["#ffe9c8", "#7a5a38", 1.4], ["#ffd9a0", 2.0, [4, 9, 8]], [["#ffd9a0", 90, [0, 4.4, -0.5], 16], ["#ff8a3a", 30, [0, 1, -5.5], 8], ["#ffe0b0", 40, [-4, 3, 3], 12]], 10);
  return { root: g, lights, fog: new THREE.Fog("#e8d8b8", 24, 60), bg: "#d8c8a8", spots: { rug: [0, 0, 0.5], sofa: [0, 0.65, -3.0], painting: [0, 3.4, -6.78], chandelier: [0, 4.5, -0.5], fireplace: [0, 0.6, -6.0], sign: [0, 3.4, -6.77] } };
}

// ================= SHOWROOM =================
function supercar(color: string, stripe?: string) {
  const c = new THREE.Group(); const body = T(color); const dark = T("#14141c"), glass = T("#1c2a48", { emissive: "#0a1a3a", emissiveIntensity: 0.5 });
  bx(c, 2.0, 0.42, 4.4, body, 0, 0.45, 0, 0.03);
  const hood = bx(c, 1.85, 0.2, 1.7, body, 0, 0.68, 1.35, 0.02); hood.rotation.x = 0.1;
  bx(c, 1.5, 0.38, 1.7, glass, 0, 0.9, -0.2, 0.025); const roof = bx(c, 1.2, 0.07, 1.0, body, 0, 1.12, -0.35, 0.02); roof.rotation.x = 0.04;
  const rs = bx(c, 1.4, 0.3, 0.8, body, 0, 0.82, -1.7, 0.02); rs.rotation.x = -0.25;
  bx(c, 2.1, 0.07, 0.5, dark, 0, 1.08, -2.15, 0.02); for (const sx of [-1, 1]) bx(c, 0.07, 0.25, 0.3, dark, sx * 0.8, 0.95, -2.1);
  bx(c, 1.9, 0.12, 0.4, dark, 0, 0.26, 2.15, 0.02); for (const sx of [-1, 1]) { bx(c, 0.06, 0.2, 1.0, dark, sx * 1.02, 0.5, -0.6); bx(c, 0.06, 0.18, 0.5, dark, sx * 1.02, 0.5, 1.2); }
  if (stripe) { bx(c, 0.35, 0.02, 4.2, T(stripe), 0, 0.665, 0); bx(c, 0.3, 0.02, 1.0, T(stripe), 0, 1.16, -0.35); }
  for (const sx of [-1, 1]) { glow(c, 0.5, 0.1, 0.06, "#ffffff", sx * 0.6, 0.62, 2.23, 3.2); glow(c, 0.7, 0.08, 0.05, "#ff2a2a", sx * 0.55, 0.62, -2.23, 2.4); }
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) { const w = cy(c, 0.4, 0.4, 0.32, dark, sx * 1.0, 0.4, z, 0.02, 18); w.rotation.z = PI / 2; const r = cy(c, 0.25, 0.25, 0.34, T("#c9ced6", { emissive: "#556", emissiveIntensity: 0.3 }), sx * 1.0, 0.4, z, 0, 10); r.rotation.z = PI / 2; }
  return c;
}
function showroom(): SetObj {
  const g = new THREE.Group();
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), new THREE.MeshBasicMaterial({ color: "#1c2040", transparent: true, opacity: 0.72, fog: true })); fl.rotation.x = -PI / 2; fl.position.set(0, 0.0, -6); fl.renderOrder = 2; g.add(fl);
  for (let i = -10; i <= 10; i++) glow(g, 0.04, 0.01, 50, "#4a5aa8", i * 2.4, 0.012, -6, 0.9);
  for (let j = -4; j <= 4; j++) glow(g, 50, 0.01, 0.04, "#4a5aa8", 0, 0.012, j * 3 - 4, 0.9);
  // walls: dark with warm vertical LED strips, ceiling light rows
  bx(g, 36, 9, 0.4, T("#15161f"), 0, 4.5, -11.4).castShadow = false;
  for (const sx of [-1, 1]) bx(g, 0.4, 9, 30, T("#15161f"), sx * 14, 4.5, -2).castShadow = false;
  bx(g, 36, 0.3, 30, T("#0e0f18"), 0, 9, -2).castShadow = false;
  for (let i = -7; i <= 7; i++) glow(g, 0.08, 6.5, 0.05, "#ff9a3a", i * 2.2, 3.5, -11.15, 1.5);
  for (const z of [-9, -4.5, 0, 4.5]) glow(g, 22, 0.1, 0.25, "#f4f8ff", 0, 8.8, z, 2.4);
  panel(g, 9.5, 2.8, 0, 5.2, -11.0, "#ffffff", 0, "#07070d");
  // cars on turntables, each with a mirrored copy under the glossy floor
  const spec: Array<[number, number, number, string, string | undefined]> = [[-3.4, -4.4, 0.5, "#e5233b", "#ffffff"], [3.6, -5.4, -0.5, "#ffc21f", "#14141c"], [-7.4, -8.6, 0.3, "#2a7de0", undefined], [7.6, -8.8, -0.3, "#f2f2f2", "#e5233b"], [0.2, -9.0, 0, "#7b3fe4", "#ffc21f"]];
  for (const [x, z, ry, col, st] of spec) {
    const car = supercar(col, st); car.position.set(x, 0.14, z); car.rotation.y = ry; g.add(car);
    const mir = supercar(col, st); mir.position.set(x, -0.14, z); mir.rotation.y = ry; mir.scale.y = -1; g.add(mir);
    const tt = cy(g, 2.7, 2.8, 0.14, T("#2a2e44"), x, 0.07, z, 0.03, 32); tt.castShadow = false; ring(g, 2.7, 0.03, "#8ae0ff", x, 0.15, z, PI / 2, 0, 1.6);
    const pos: V3 = [x, 8.6, z]; bx(g, 0.5, 0.4, 0.5, T("#15161f"), x, 8.7, z); glow(g, 0.3, 0.05, 0.3, "#fff4d8", x, 8.48, z, 3); beam(g, "#fff4d8", pos, [x, 0.14, z], 2.6, 0.07);
  }
  plant(g, -9.6, -2, 1.5, "#2a2a3a"); plant(g, 9.8, -3, 1.5, "#2a2a3a");
  // velvet rope posts near the origin
  for (const sx of [-1, 1]) for (const z of [-1.8, 2.2]) { cy(g, 0.06, 0.06, 1.0, gold2(), sx * 2.6, 0.5, z, 0.01, 8); cy(g, 0.22, 0.22, 0.06, gold2(), sx * 2.6, 0.03, z); sp(g, 0.1, gold2(), sx * 2.6, 1.05, z); }
  for (const sx of [-1, 1]) { const rp = cy(g, 0.03, 0.03, 4.0, T("#a0102a"), sx * 2.6, 0.85, 0.2, 0, 6); rp.rotation.x = PI / 2; }
  const lights = mkLights(["#b8c4ff", "#14141e", 1.0], ["#f4f8ff", 2.0, [2, 10, 7]], [["#fff4d8", 60, [-3.4, 6, -4], 14], ["#fff4d8", 60, [3.6, 6, -5], 14], ["#ff9a3a", 40, [0, 3, -10], 12], ["#8ae0ff", 30, [0, 2.5, 4], 12]], 12);
  return { root: g, lights, fog: new THREE.Fog("#0b0b14", 22, 52), bg: "#080810", spots: { floor: [0, 0, 0], sign: [0, 5.2, -10.92], car1: [-3.4, 0.14, -4.4], car2: [3.6, 0.14, -5.4], car3: [0.2, 0.14, -9.0] } };
}
const gold2 = () => T("#e6a418", { emissive: "#6a3a00", emissiveIntensity: 0.4 });

// ================= FACTORY (a factory floor: conveyors with boxes, robot arms, crates, tall windows with a chimney outside) =================
function factory(): SetObj {
  const g = new THREE.Group();
  const flr = canvasTex(256, 256, (c) => {
    c.fillStyle = "#8b8f98"; c.fillRect(0, 0, 256, 256); const r = seeded(611);
    for (let i = 0; i < 300; i++) { c.fillStyle = r() < 0.5 ? "#7d818a" : "#989ca5"; c.fillRect(r() * 256, r() * 256, 3 + r() * 6, 2 + r() * 4); }
    c.strokeStyle = "#f2c230"; c.lineWidth = 8; c.strokeRect(4, 4, 248, 248);
  });
  plane(g, 40, 30, T("#ffffff", { map: rep(flr, 6, 4) }), 0, 0, -4);
  // back wall with five tall windows; behind it: sky and a big striped chimney
  const wallT = canvasTex(256, 256, (c) => { c.fillStyle = "#b9704c"; c.fillRect(0, 0, 256, 256); c.strokeStyle = "#8f4f34"; c.lineWidth = 3; for (let j = 0; j < 8; j++) { c.beginPath(); c.moveTo(0, j * 32); c.lineTo(256, j * 32); c.stroke(); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(i * 64 + (j % 2) * 32, j * 32); c.lineTo(i * 64 + (j % 2) * 32, j * 32 + 32); c.stroke(); } } });
  const wm = T("#ffffff", { map: rep(wallT, 6, 1.4) });
  const ZW = -9;
  const sky = gradTex([[0, "#ffcf8a"], [0.5, "#ffa9a0"], [1, "#78b8ee"]], 8, 128);
  vplane(g, 60, 24, basic(sky, 1, false), 0, 11, ZW - 12);
  // chimney outside, seen through the right window: white/red stripes, black cap, smoke; a smaller one in the left window
  const chimney = (cx: number, bz: number, rb: number, rt: number, h: number) => {
    const n = 8, sh = h / n;
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const m = cy(g, rb + (rt - rb) * t1, rb + (rt - rb) * t0, sh, T(i % 2 ? "#f4f7f0" : "#d6283a"), cx, sh * (i + 0.5), bz, 0.012, 16); m.castShadow = false; }
    const cap = cy(g, rt * 1.12, rt, 0.4, T("#2f3440"), cx, h + 0.2, bz, 0.01, 16); cap.castShadow = false;
    return h + 0.4;
  };
  const top = chimney(4, ZW - 7, 1.6, 0.9, 16);
  chimney(-8, ZW - 9, 0.9, 0.5, 11);
  for (const [dx, dy, r] of [[4.3, top + 1.2, 0.9], [5.3, top + 2.3, 1.2], [6.6, top + 3.2, 1.45]] as V3[]) { const pf = sp(g, r, T("#e9edf2"), dx, dy, ZW - 7, 0, 12); pf.castShadow = false; }
  for (const [x, h] of [[-9, 4], [-6.5, 2.6], [8, 3.4], [10.5, 5]] as V2[]) bx(g, 1.8, h, 1.8, T("#6f7d90"), x, h / 2, ZW - 5, 0.01).castShadow = false;   // far buildings
  // windows at x = -8, -4, 0, 4, 8 (3 m wide), sill 1.6, head 6.2
  const WX = [-8, -4, 0, 4, 8];
  bx(g, 40, 1.6, 0.4, wm, 0, 0.8, ZW).castShadow = false; bx(g, 40, 3.8, 0.4, wm, 0, 8.1, ZW).castShadow = false;
  for (const [x, w] of [[-6, 1], [-2, 1], [2, 1], [6, 1], [-11.75, 4.5], [11.75, 4.5]] as V2[]) bx(g, w, 4.6, 0.4, wm, x, 3.9, ZW).castShadow = false;
  const frameM = T("#2f3440");
  for (const x of WX) {
    bx(g, 3.2, 0.12, 0.2, frameM, x, 6.2, ZW + 0.1); bx(g, 3.2, 0.12, 0.2, frameM, x, 1.6, ZW + 0.1); bx(g, 0.08, 4.6, 0.12, frameM, x, 3.9, ZW + 0.1); bx(g, 3.2, 0.08, 0.12, frameM, x, 3.9, ZW + 0.1);
  }
  for (const sx of [-1, 1]) bx(g, 0.4, 10, 30, wm, sx * 14.2, 5, -4).castShadow = false;
  bx(g, 29, 0.4, 30, T("#59606e"), 0, 10.2, -4).castShadow = false;
  for (let i = 0; i < 6; i++) bx(g, 0.35, 0.4, 28, T("#f2c230"), -12.5 + i * 5, 9.8, -4, 0.01);
  for (const x of [-9, 0, 9]) glow(g, 2.2, 0.1, 0.5, "#fff2c8", x, 9.55, -5, 1.6);
  // conveyor belts running along x: one in the middle ground, one near the back
  const beltT = canvasTex(128, 64, (c) => { c.fillStyle = "#3a3f4b"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#555c6b"; for (let i = 0; i < 8; i++) c.fillRect(i * 16, 0, 5, 64); });
  const belt = (z: number, len: number) => {
    bx(g, len, 0.16, 1.5, T("#ffffff", { map: rep(beltT.clone(), len / 1.6, 1) }), 0, 0.86, z, 0.012);
    for (const dz of [-0.78, 0.78]) bx(g, len, 0.2, 0.1, T("#f2c230"), 0, 0.95, z + dz, 0.01);
    for (let i = 0; i <= len / 3; i++) { const x = -len / 2 + i * 3; bx(g, 0.2, 0.8, 1.3, T("#59606e"), x, 0.4, z, 0.01); }
  };
  belt(-3.6, 26); belt(-7, 26);
  const cartonM = [T("#c99456"), T("#d6a468"), T("#b8844a")];
  const carton = (x: number, z: number, i: number, s = 1) => { bx(g, 0.8 * s, 0.6 * s, 0.8 * s, cartonM[i % 3], x, 0.94 + 0.3 * s, z, 0.012); bx(g, 0.82 * s, 0.05, 0.14, T("#f4f7f0"), x, 0.94 + 0.62 * s, z); };
  [-9.5, -6.5, -3.2, 3.5, 6, 9.2].forEach((x, i) => carton(x, -3.6, i, 0.9 + (i % 2) * 0.2)); [-8, -4.5, -1, 2, 5, 8.5].forEach((x, i) => carton(x, -7, i + 1, 1));
  // robot arms bolted beside the belts (orange, 3 joints, claw)
  const orange = T("#f08a1c"), dark = T("#2f3440");
  const arm = (x: number, z: number, a1: number, a2: number) => {
    const a = new THREE.Group(); a.position.set(x, 0, z); g.add(a);
    cy(a, 0.55, 0.65, 0.3, dark, 0, 0.15, 0, 0.012); cy(a, 0.38, 0.45, 0.9, orange, 0, 0.75, 0, 0.015); sp(a, 0.34, orange, 0, 1.25, 0, 0.015, 14);
    const u = new THREE.Group(); u.position.set(0, 1.25, 0); u.rotation.z = a1; a.add(u);
    bx(u, 0.28, 1.6, 0.3, orange, 0, 0.8, 0, 0.015); sp(u, 0.26, dark, 0, 1.6, 0, 0.012, 12);
    const l = new THREE.Group(); l.position.set(0, 1.6, 0); l.rotation.z = a2; u.add(l);
    bx(l, 0.22, 1.3, 0.24, orange, 0, 0.65, 0, 0.015); bx(l, 0.5, 0.14, 0.34, dark, 0, 1.33, 0, 0.01);
    for (const sx of [-1, 1]) bx(l, 0.08, 0.34, 0.1, dark, sx * 0.2, 1.5, 0, 0.008);
    glowSp(a, 0.07, "#4dff7a", 0.3, 1.25, 0.2, 2.4);
  };
  arm(-4.8, -5.3, 0.5, -1.2); arm(2.8, -5.3, -0.4, 1.3); arm(-11, -5.3, 0.3, -1.0); arm(9.5, -5.3, -0.5, 1.1);
  // crates and barrels
  const crate = (x: number, y: number, z: number, w = 1.1, ry = 0) => { const c = bx(g, w, w, w, T("#b88a4e"), x, y + w / 2, z, 0.015); c.rotation.y = ry; bx(g, w + 0.02, 0.1, w + 0.02, T("#8c6430"), x, y + w * 0.5, z, 0).rotation.y = ry; };
  crate(-10.5, 0, -1, 1.2, 0.2); crate(-10.4, 1.2, -1.1, 1.0, -0.1); crate(-9.1, 0, -0.5, 1.0, 0.4); crate(10, 0, -1.2, 1.3, -0.2); crate(10.2, 1.3, -1.2, 1.0, 0.15); crate(8.6, 0, -0.4, 0.9, 0.3);
  for (const [x, z, c] of [[-12, -2.5, "#2a62b0"], [-12.8, -1.2, "#d6283a"], [12.4, -2.2, "#2a62b0"]] as [number, number, string][]) cy(g, 0.42, 0.42, 1.0, T(c), x, 0.5, z, 0.012, 14);
  // hazard stripes on the floor, hanging lamps, wall sign
  for (let i = 0; i < 14; i++) bx(g, 0.5, 0.02, 0.9, T(i % 2 ? "#f2c230" : "#1b1b22"), -6.5 + i * 0.5, 0.02, 4.2);
  for (const x of [-7, 0, 7]) { cy(g, 0.02, 0.02, 1.3, dark, x, 9.4, -3, 0, 6); cone(g, 0.6, 0.45, T("#f2c230"), x, 8.6, -3, 0.01, 16).rotation.x = PI; glow(g, 0.5, 0.05, 0.5, "#fff2c8", x, 8.4, -3, 1.8); }
  bx(g, 3.6, 0.9, 0.12, T("#f2c230"), -11.75, 6.6, ZW + 0.3, 0.012); bx(g, 3.2, 0.6, 0.06, T("#1b1b22"), -11.75, 6.6, ZW + 0.37);
  const lights = mkLights(["#ffe6c4", "#8f7f78", 1.25], ["#fff0d0", 2.6, [-4, 14, 8]], [["#ffd89a", 20, [0, 7, -3], 20]], 14);
  return { root: g, lights, fog: new THREE.Fog("#c8b4a8", 45, 120), bg: "#ffbf94", spots: { spot: [0, 0, 0], belt: [0, 1.2, -3.6], arm: [-4.8, 1.5, -5.3], crate: [10, 0.6, -1.2], chimney: [4, 6, ZW - 7], sign: [0, 3.9, ZW + 0.3] } };
}

// ================= MOUNTAIN (a rocky mountain, a timbered mine entrance, cart tracks with a cart, glowing gold veins) =================
function mountain(): SetObj {
  const g = new THREE.Group();
  const gt = noiseTex("#6aa04a", ["#5c9140", "#79b058", "#8a8f56"], 220, 701, 8, 6, 5);
  plane(g, 80, 60, T("#ffffff", { map: gt }), 0, 0, -10);
  const dirtT = noiseTex("#a87c4e", ["#94683c", "#bd915e", "#7e5632"], 160, 702, 2, 4, 4);
  plane(g, 5.5, 22, T("#ffffff", { map: dirtT }), 2.6, 0.012, -4);                          // dirt path out of the mine
  const sky = gradTex([[0, "#8fd0ff"], [0.6, "#c4e7ff"], [1, "#fff0d0"]], 8, 128);
  vplane(g, 160, 60, basic(sky, 1, false), 0, 22, -40);
  const rockA = T("#b58c62"), rockB = T("#cda374"), rockC = T("#94694a"), snow = T("#f4f8ff");
  // rocky crag: rows of tilted hexagonal rock columns, the mine mouth cut at x = 2.6, snow-capped peaks behind
  const col = (x: number, z: number, r: number, h: number, m: THREE.Material, tilt = 0, ry = 0, y0 = 0) => { const c = cy(g, r * 0.8, r, h, m, x, y0 + h / 2, z, 0.02, 6); c.rotation.set(tilt, ry, -tilt * 0.6); c.castShadow = false; return c; };
  const mats = [rockA, rockB, rockC];
  [[-12.5, 7], [-10.4, 5], [-8.2, 8.5], [-6, 5.8], [-3.9, 7.5], [-1.7, 5], [6.4, 6.5], [8.5, 8], [10.7, 5.5], [12.9, 7.5]].forEach(([x, h], i) => col(x, -9.6, 1.35, h, mats[i % 3], 0.03 * (i % 3 - 1), i));
  col(0.6, -9.6, 1.1, 5.8, rockB, 0.02, 1); col(4.7, -9.6, 1.1, 6.2, rockC, -0.02, 2);
  bx(g, 4.6, 1.3, 1.6, rockB, 2.65, 5.75, -8.9, 0.02); bx(g, 3.4, 1.9, 1.4, rockA, 2.65, 7.35, -9.2, 0.02);          // rock over the mine mouth
  [[-12, 11], [-8.5, 13], [-4.5, 11.5], [-0.5, 14], [3.5, 12], [7.5, 14.5], [11.5, 12], [14.5, 10]].forEach(([x, h], i) => col(x, -12.2, 2.0, h, mats[(i + 1) % 3], 0.02 * (i % 3 - 1), i * 2));
  for (const [x, y, z, r, h] of [[-9, 19, -16, 6.5, 14], [1, 24, -17, 8, 20], [11, 20, -16, 6, 15]] as [number, number, number, number, number][]) {
    cone(g, r, h, rockB, x, 7 + h / 2, z, 0.02, 7); cone(g, r * 0.42, h * 0.34, snow, x, 7 + h * 0.83, z + 0.05, 0, 7);
  }
  for (const [x, y, z, s] of [[-14, 3, -9, 1.7], [15, 2.5, -8.5, 1.5], [-10.5, 2, -6, 1.0], [11, 1.3, -6.5, 0.9], [-1.6, 0.5, -5.5, 0.5]] as V4[]) { const b = sp(g, s, rockA, x, y * 0.5 + 0.2, z, 0.02, 7); b.scale.y = 0.7; }
  // the mine mouth: dark hole, timber frame, lantern, sign
  bx(g, 3.0, 4.2, 0.2, T("#0b0a10"), 2.6, 2.1, -7.95);
  const wood = T("#8a5a30"), woodD = T("#6a4220");
  for (const sx of [-1, 1]) bx(g, 0.4, 4.4, 0.45, wood, 2.6 + sx * 1.7, 2.2, -7.7, 0.015);
  bx(g, 4.2, 0.45, 0.5, wood, 2.6, 4.45, -7.7, 0.015); bx(g, 3.6, 0.2, 0.3, woodD, 2.6, 3.7, -7.75, 0.01);
  for (const sx of [-1, 1]) { const br = bx(g, 0.18, 1.0, 0.2, woodD, 2.6 + sx * 1.3, 4.0, -7.72, 0.01); br.rotation.z = sx * 0.7; }
  cy(g, 0.02, 0.02, 0.5, T("#2f3440"), 3.7, 4.0, -7.4, 0, 6); glowSp(g, 0.2, "#ffc54a", 3.7, 3.65, -7.4, 2.6);
  bx(g, 2.6, 0.7, 0.1, T("#f2c230"), 2.6, 5.15, -7.6, 0.012); vplane(g, 2.3, 0.45, basic(canvasTex(256, 52, (c) => { c.fillStyle = "#3a2410"; c.fillRect(0, 0, 256, 52); c.fillStyle = "#ffd84a"; c.font = "bold 38px Arial"; c.textAlign = "center"; c.fillText("GOLD MINE", 128, 40); }), 1, false), 2.6, 5.15, -7.54);
  // tracks out of the mine: two rails with ties, running toward the camera
  const rail = metalMat("#aeb6c4", 0.3);
  for (let i = 0; i < 17; i++) bx(g, 1.5, 0.08, 0.2, woodD, 2.6, 0.06, -7.6 + i * 0.7, 0.008);
  for (const dx of [-0.55, 0.55]) bx(g, 0.07, 0.1, 12.2, rail, 2.6 + dx, 0.14, -1.6, 0.006);
  // mine cart on the tracks: rust body, rim, wheels, gold chunks heaped on top
  const cart = new THREE.Group(); cart.position.set(2.6, 0, -3.2); g.add(cart);
  bx(cart, 1.3, 0.75, 1.1, T("#7b4a2c"), 0, 0.72, 0, 0.02); bx(cart, 1.4, 0.1, 1.2, T("#4a4f5c"), 0, 1.1, 0, 0.01); bx(cart, 1.36, 0.08, 0.1, T("#4a4f5c"), 0, 0.62, 0.56);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = cy(cart, 0.2, 0.2, 0.1, T("#2f3440"), sx * 0.55, 0.22, sz * 0.5, 0.01, 14); w.rotation.z = PI / 2; }
  for (const [x, y, z, r] of [[-0.3, 1.2, 0.0, 0.3], [0.2, 1.3, 0.1, 0.34], [0.0, 1.15, -0.25, 0.27], [0.35, 1.18, -0.2, 0.25], [-0.25, 1.2, 0.3, 0.24]] as V4[]) { const n = sp(cart, r, gold2(), x, y, z, 0.012, 7); n.scale.y = 0.8; }
  // glowing gold veins across the rock faces (the front of the first column row is at z ~ -8.3)
  const vein = (x: number, y: number, z: number, w: number, rz: number) => { const v = glow(g, w * 1.5, 0.3, 0.22, "#ffcf3a", x, y, z, 3.0); v.rotation.z = rz; };
  vein(-6, 3.2, -8.3, 1.3, 0.6); vein(-6.1, 4.3, -8.3, 0.9, -0.5); vein(-10.4, 2.4, -8.3, 1.2, 0.4); vein(-3.9, 5.2, -8.3, 1.1, -0.6); vein(-8.2, 5.8, -8.3, 1.2, 0.5); vein(-1.7, 2.6, -8.3, 1.0, 0.7);
  vein(-2.0, 1.6, -8.3, 1.1, -0.5); vein(-2.2, 3.6, -8.3, 1.0, 0.6); vein(-4.2, 2.0, -8.3, 1.1, 0.5); vein(-4.0, 3.8, -8.3, 0.9, -0.6); vein(6.6, 1.8, -8.3, 1.0, 0.6); vein(6.2, 4.8, -8.3, 0.9, -0.5); vein(-0.2, 3.0, -8.3, 0.7, 0.5);
  vein(6.4, 3.4, -8.3, 1.2, -0.6); vein(8.5, 5.0, -8.3, 1.3, 0.5); vein(8.4, 3.0, -8.3, 0.9, -0.4); vein(10.7, 3.4, -8.3, 1.1, 0.6); vein(12.9, 5.4, -8.3, 1.1, -0.5); vein(2.65, 5.9, -8.05, 2.4, 0.08);
  for (const [x, y] of [[-6, 3.2], [-8.2, 5.8], [6.4, 3.4], [8.5, 5.0], [-10.4, 2.4], [10.7, 3.4], [-3.9, 5.2]] as V2[]) glowSp(g, 0.24, "#ffe27a", x + 0.2, y, -8.2, 2.8);
  // loose nuggets, pickaxe leaning on the rock, a few pines
  for (const [x, z] of [[-1.2, -2.2], [0.8, -4.6], [5.4, -5.2], [4.6, -2.2]] as V2[]) { const n = sp(g, 0.17, gold2(), x, 0.12, z, 0.01, 7); n.scale.y = 0.7; }
  const pick = new THREE.Group(); pick.position.set(5.6, 0, -6.3); pick.rotation.z = 0.35; g.add(pick);
  cy(pick, 0.04, 0.04, 1.6, wood, 0, 0.8, 0, 0.008, 6); bx(pick, 0.9, 0.08, 0.08, T("#aeb6c4"), 0, 1.55, 0, 0.008);
  const pine = (x: number, z: number, s: number) => { cy(g, 0.14 * s, 0.2 * s, 1.2 * s, T("#6a4a2a"), x, 0.6 * s, z, 0.01, 6); for (let i = 0; i < 3; i++) cone(g, (1.1 - i * 0.25) * s, 1.3 * s, T(i % 2 ? "#2f8a4a" : "#277a3f"), x, (1.6 + i * 0.8) * s, z, 0.012, 7); };
  pine(-9, -4, 1.3); pine(-12, -1, 1.1); pine(10, -3.5, 1.2); pine(13.5, -1, 1.4); pine(-5.6, -6, 1.0);
  const lights = mkLights(["#dff0ff", "#7a9a5a", 1.35], ["#fff6e0", 2.9, [-6, 14, 10]], [["#ffcf3a", 16, [2.6, 2.6, -6.2], 10]], 16);
  return { root: g, lights, fog: new THREE.Fog("#cfe8ff", 50, 140), bg: "#8fd0ff", spots: { spot: [0, 0, 0], mine: [2.6, 2.2, -7.9], cart: [2.6, 1.0, -3.2], vein: [-6, 3.2, -8.3], tracks: [2.6, 0.1, -2], sign: [2.6, 5.15, -7.5] } };
}

// ================= RINK (an ice hockey rink: ice with red centre line + blue lines, boards with glass, a goal, stands with a crowd) =================
function rink(): SetObj {
  const g = new THREE.Group();
  const X0 = -10, X1 = 10, Z0 = -18, Z1 = 10;                                  // ice 20 x 28 m
  const FW = 720, FH = Math.round(FW * (Z1 - Z0) / (X1 - X0)), fx = FW / (X1 - X0), fz = FH / (Z1 - Z0);
  const FX = (x: number) => (x - X0) * fx, FZ = (z: number) => (z - Z0) * fz;
  const ice = canvasTex(FW, FH, (c) => {
    c.fillStyle = "#eef7ff"; c.fillRect(0, 0, FW, FH); const r = seeded(811);
    c.globalAlpha = 0.5; c.strokeStyle = "#b9d9f2"; c.lineWidth = 2;
    for (let i = 0; i < 60; i++) { const x = r() * FW, y = r() * FH, a = r() * 6.28, l = 20 + r() * 60; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.5); c.stroke(); }
    c.globalAlpha = 1;
    const band = (z: number, w: number, col: string) => { c.fillStyle = col; c.fillRect(0, FZ(z) - w * fz / 2, FW, w * fz); };
    band(-4, 0.3, "#d6283a"); band(-8.5, 0.5, "#1c4fb8"); band(-16, 0.1, "#d6283a");               // centre line, blue line, goal line
    for (let i = 0; i < 18; i++) { c.fillStyle = "#eef7ff"; c.fillRect(FX(X0) + i * 40, FZ(-4) - 2, 16, 4); }
    c.strokeStyle = "#d6283a"; c.lineWidth = 0.1 * fx;
    c.beginPath(); c.arc(FX(0), FZ(-4), 3.2 * fx, 0, 7); c.stroke();
    for (const x of [-5.5, 5.5]) { c.beginPath(); c.arc(FX(x), FZ(-12.5), 2.6 * fx, 0, 7); c.stroke(); c.fillStyle = "#d6283a"; c.beginPath(); c.arc(FX(x), FZ(-12.5), 0.3 * fx, 0, 7); c.fill(); }
    c.fillStyle = "#d6283a"; c.beginPath(); c.arc(FX(0), FZ(-4), 0.3 * fx, 0, 7); c.fill();
    c.fillStyle = "rgba(120,190,240,0.55)"; c.beginPath(); c.arc(FX(0), FZ(-16.8), 1.6 * fx, Math.PI, 0); c.fill();   // crease
  });
  plane(g, X1 - X0, Z1 - Z0, T("#ffffff", { map: ice }), 0, 0.01, (Z0 + Z1) / 2);
  plane(g, 120, 100, T("#2a3552"), 0, -0.02, -20);
  // boards: low white boards with a light-blue kick plate, glass above on thin posts
  const white = T("#f4f7fb"), kick = T("#9fc7ea"), post = T("#2f3440");
  const glass = new THREE.MeshBasicMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const wall = (cx: number, cz: number, len: number, alongX: boolean) => {
    const w = alongX ? len : 0.3, d = alongX ? 0.3 : len;
    bx(g, w, 1.1, d, white, cx, 0.55, cz, 0.015); bx(g, w + 0.02, 0.25, d + 0.02, kick, cx, 0.13, cz, 0); bx(g, w + 0.02, 0.1, d + 0.02, T("#d6283a"), cx, 1.15, cz, 0);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? len : len, 1.0), glass); gl.position.set(cx, 1.7, cz); if (!alongX) gl.rotation.y = PI / 2; g.add(gl);
    for (let k = 0; k <= len / 2.5; k++) { const o = -len / 2 + k * 2.5; bx(g, 0.07, 1.0, 0.07, post, alongX ? cx + o : cx, 1.7, alongX ? cz : cz + o); }
  };
  wall(0, Z0 - 0.15, 20.6, true); wall(X0 - 0.15, (Z0 + Z1) / 2, Z1 - Z0, false); wall(X1 + 0.15, (Z0 + Z1) / 2, Z1 - Z0, false);
  // goal: red posts + crossbar + white mesh net, on the goal line at the far end
  const red = T("#d6283a"), GZ = -16.2;
  for (const sx of [-1, 1]) { cy(g, 0.05, 0.05, 1.25, red, sx * 1.0, 0.62, GZ, 0.01, 10); cy(g, 0.04, 0.04, 1.0, red, sx * 1.0, 0.04, GZ - 0.5, 0.008, 8).rotation.x = PI / 2; }
  bx(g, 2.1, 0.09, 0.09, red, 0, 1.25, GZ, 0.01);
  const netT = canvasTex(128, 64, (c) => { c.clearRect(0, 0, 128, 64); c.strokeStyle = "#ffffff"; c.lineWidth = 2; for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, 64); c.stroke(); } for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(0, j * 8); c.lineTo(128, j * 8); c.stroke(); } });
  const nm = new THREE.MeshBasicMaterial({ map: netT, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  vplane(g, 2.0, 1.2, nm, 0, 0.62, GZ - 1.0);
  for (const sx of [-1, 1]) vplane(g, 1.0, 1.2, nm, sx * 1.0, 0.62, GZ - 0.5, PI / 2);
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), nm); tp.rotation.x = -PI / 2; tp.position.set(0, 1.0, GZ - 0.5); g.add(tp);
  // stands behind the far end and along both sides: stepped tiers, seat rows, a crowd of coloured fans
  const seat = T("#3b4a7a"), tierM = T("#58628a");
  const cols = ["#d6283a", "#f2c230", "#2a62b0", "#ffffff", "#2f9f4a", "#f08a1c", "#8a4ab0"];
  const r = seeded(821); const heads: It[] = [], bodies: It[] = [];
  const fan = (x: number, y: number, z: number) => { const c = cols[Math.floor(r() * cols.length)]; heads.push({ x, y: y + 0.85, z, s: 0.2, c: r() < 0.5 ? "#e0b48c" : r() < 0.5 ? "#a8764c" : "#f2d2b0" }); bodies.push({ x, y: y + 0.45, z, s: [0.32, 0.5, 0.26], c }); };
  for (let k = 0; k < 7; k++) {
    const y = 1.5 + k * 0.9, z = Z0 - 1.2 - k * 1.1;
    bx(g, 34, 0.5, 1.2, tierM, 0, y - 0.25, z, 0.01); bx(g, 34, 0.12, 0.5, seat, 0, y + 0.06, z - 0.4);
    for (let i = -15; i <= 15; i++) if (r() < 0.82) fan(i * 1.05 + (r() - 0.5) * 0.3, y, z + 0.1);
    for (const sx of [-1, 1]) {
      const x = sx * (X1 + 1.8 + k * 1.1); bx(g, 1.2, 0.5, 26, tierM, x, y - 0.25, -5, 0.01);
      for (let j = -11; j <= 11; j += 1) if (r() < 0.8) fan(x - sx * 0.1, y, -5 + j * 1.05 + (r() - 0.5) * 0.3);
    }
  }
  inst(g, new THREE.SphereGeometry(1, 10, 8), T("#ffffff"), heads); inst(g, new THREE.BoxGeometry(1, 1, 1), T("#ffffff"), bodies);
  bx(g, 40, 14, 0.5, T("#232c47"), 0, 8, Z0 - 10.5); for (const sx of [-1, 1]) bx(g, 0.5, 14, 36, T("#232c47"), sx * 21.5, 8, -4);
  // set dressing: a black puck and a plain stick lying on the ice
  cy(g, 0.14, 0.14, 0.07, T("#111118"), 1.2, 0.05, 1.6, 0.01, 16); cy(g, 0.12, 0.12, 0.075, T("#2c2c38"), 1.2, 0.052, 1.6, 0, 16);
  const stick = new THREE.Group(); stick.position.set(-1.7, 0.04, 1.9); stick.rotation.y = 0.5; g.add(stick);
  bx(stick, 1.7, 0.04, 0.05, T("#c8a060"), 0.2, 0.02, 0, 0.006); bx(stick, 0.5, 0.045, 0.1, T("#222"), -0.95, 0.02, 0.1, 0.006); bx(stick, 0.35, 0.05, 0.055, T("#f4f7fb"), 0.85, 0.02, 0, 0);
  // arena lights over the ice
  for (const x of [-6, 0, 6]) for (const z of [-12, -2, 6]) glow(g, 1.6, 0.1, 1.6, "#ffffff", x, 11, z, 1.6);
  const lights = mkLights(["#e4f0ff", "#6a7aa0", 1.4], ["#ffffff", 2.4, [-4, 16, 8]], [["#dff0ff", 24, [0, 7, -2], 22]], 16);
  return { root: g, lights, fog: new THREE.Fog("#27304c", 45, 110), bg: "#27304c", spots: { spot: [0, 0, 0], goal: [0, 0.7, GZ], puck: [1.2, 0.06, 1.6], stick: [-1.7, 0.05, 1.9], line: [0, 0.02, -4], stands: [0, 4, -24] } };
}

const BUILD: Record<SetName, () => SetObj> = { throne, office, diner, lab, stall, field, ring: ring_, track, graveyard, boardroom, street, beach, court, pitch, diamond, gridiron, tennis, golf, pool, gym, studio, farm, store, stage, space, garage, classroom, bathroom, mansion, showroom, factory, mountain, rink };
const CACHE = new Map<SetName, SetObj>();

// ---------- light pools (refgap Nov 26): motivated sources that visibly paint the floor and tint whoever stands in them ----------
// each pool = a real SpotLight (penumbra, colours characters + walls) + an additive soft-gradient decal on the floor (reads under software GL too)
type Pool = [string, number, number, number, number?];   // colour, x, z, radius, strength (0..1)
const WARM: Pool = ["#ffd08a", -0.9, 0.4, 2.8, 0.5], COOL: Pool = ["#7f8cff", 2.6, -1.0, 2.3, 0.32];
const POOLS: Partial<Record<SetName, Pool[]>> = {
  throne: [["#ffd25a", 0.3, 0.2, 2.9, 0.55], ["#b07aff", -3.0, -1.2, 2.4, 0.4]],
  office: [["#ffe0a6", -2.2, 0.6, 2.6, 0.55], ["#9fc0ff", 2.8, -1.4, 2.0, 0.3]],                // window light + cool fill
  diner: [["#ffd38a", -1.6, 0.0, 2.4, 0.55], ["#ffd38a", 2.2, -1.0, 2.2, 0.5], ["#ff5a7a", 0.2, -3.0, 2.0, 0.3]],   // hanging lamp cones + neon
  lab: [["#37ffd5", 2.0, -1.2, 2.2, 0.45], ["#ff6bd6", -2.4, -1.4, 2.0, 0.4], ["#fff6d0", 0, 0.4, 2.4, 0.3]],
  stall: [["#ffc15a", -0.6, 0.3, 3.0, 0.55], ["#8a78ff", 3.0, -1.0, 2.4, 0.35]],
  graveyard: [["#9cc4ff", -1.8, 0.2, 3.0, 0.5], ["#9cf0b0", 3.0, -1.0, 2.0, 0.3]],                // moon through the mist
  street: [["#ff4da6", -2.6, -0.8, 2.4, 0.5], ["#37e0ff", 2.8, -1.2, 2.4, 0.45], ["#ffcf6b", 0.2, 0.9, 2.2, 0.4]],   // neon spill + lamp
  boardroom: [["#ffd36b", 0, -2.2, 2.6, 0.5], ["#6a8cff", -3.0, -1.0, 2.2, 0.4]],
  ring: [["#fff4cc", 0, 0, 3.6, 0.6], ["#ff3d71", 3.2, -1.2, 2.2, 0.35], ["#37e0ff", -3.2, -1.2, 2.2, 0.35]],   // stage spotlight
  stage: [["#fff4cc", 0, 0, 3.4, 0.6], ["#ff4da6", -3.0, -1.0, 2.2, 0.4]],
  track: [["#fff6d0", -1.2, 0.5, 3.0, 0.5], ["#ff8a5a", 3.0, -1.4, 2.4, 0.35]],
  field: [["#fff0b0", -1.0, 0.4, 3.2, 0.4]], beach: [["#fff0b0", -1.2, 0.4, 3.2, 0.4]],
  mansion: [["#ffcf6b", -2.4, 0.2, 2.4, 0.5], ["#ff4da6", 2.6, -1.4, 2.0, 0.3]],
  gym: [["#fff4d8", 0, 0.2, 3.2, 0.45]], court: [["#fff4d8", 0, 0.2, 3.4, 0.45]], rink: [["#dff0ff", 0, 0.2, 3.4, 0.4]],
};
let POOL_TEX: THREE.CanvasTexture | null = null;
const poolTex = () => POOL_TEX ?? (POOL_TEX = canvasTex(128, 128, (c) => {
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,0.55)"); g.addColorStop(0.8, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.clearRect(0, 0, 128, 128); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
}));
const addPools = (s: SetObj, name: SetName) => {
  const pools = POOLS[name] ?? [WARM, COOL];
  const tex = poolTex();
  pools.forEach(([col, x, z, r, k = 0.4], i) => {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: Math.min(1, k * 1.9), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    d.rotation.x = -PI / 2; d.position.set(x, 0.035 + i * 0.002, z); d.renderOrder = 2; d.userData.pool = true; s.root.add(d);
    const sp = new THREE.SpotLight(col, 60 * k, 16, 0.55, 0.9, 1.6);   // wide soft cone from a motivated source above and behind
    sp.position.set(x - 0.8, 5.6, z - 1.6); sp.target.position.set(x, 0, z); sp.target.updateMatrixWorld(true); s.lights.push(sp, sp.target as unknown as THREE.Light);
  });
};
export const makeSet = (name: SetName): SetObj => {
  let s = CACHE.get(name);
  if (!s) { s = BUILD[name](); addPools(s, name); CACHE.set(name, s); }
  return s;
};
