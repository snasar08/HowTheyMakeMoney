// HTMM places (Nov 15, Sam: "the scenes should truly pertain to the video"): self-contained sets built far from the
// reference town (x = 1200, every 400 m in z, past the fog), in the same two-tone / ink / painted-texture language:
// a basketball court, a soccer pitch, a concert stage, an office, a server hall and the Moon.
import * as THREE from "three";
import { Batch, boxGeo, V, lam } from "./build";
import { ctex, rep } from "./paint";
import { twoTone } from "./shade";
import type { V3 } from "./story";
const D0 = 6.0; // = story.D0 (bank top); kept local so places.ts and story.ts do not import each other

export type Place = { p: V3; d: [number, number]; w: number; light?: "day" | "golden" | "night"; stands?: boolean; ground?: number };
const X0 = 1200;
export const PLACES: Record<string, Place> = {
  court: { p: [X0, D0, 4], d: [0, -1], w: 3, stands: true },
  pitch: { p: [X0, D0, 404], d: [0, 1], w: 4, stands: true },
  stage: { p: [X0, D0 + 1.2, 800], d: [0, -1], w: 3, light: "night" },
  office: { p: [X0, D0, 1200], d: [0, 1], w: 3 },
  servers: { p: [X0, D0, 1600], d: [0, 1], w: 1.6 },
  space: { p: [X0, D0, 2000], d: [0, -1], w: 4, light: "night" },
};

const plane = (w: number, d: number, tex: THREE.Texture | null, col: string, key: string) => {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  return { g, m: lam(key, () => (tex ? { map: tex } : { color: col })) };
};
const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

// ---------- painted textures ----------
const courtTex = () => ctex("courtHD", 1024, 2048, (g, r) => {
  g.fillStyle = "#d9a066"; g.fillRect(0, 0, 1024, 2048);
  for (let y = 0; y < 2048; y += 26) for (let x = (y / 26) % 2 ? -60 : 0; x < 1024; x += 120) {
    g.fillStyle = `hsl(30, ${48 + r() * 10}%, ${58 + r() * 8}%)`; g.fillRect(x + 1, y + 1, 118, 24);
  }
  g.strokeStyle = "#fbf8f1"; g.lineWidth = 10;
  g.strokeRect(40, 40, 944, 1968); g.beginPath(); g.moveTo(40, 1024); g.lineTo(984, 1024); g.stroke();
  g.beginPath(); g.arc(512, 1024, 120, 0, 7); g.stroke();
  for (const [y, s] of [[40, 1], [2008, -1]] as [number, number][]) {
    g.fillStyle = "#c2453a"; g.fillRect(352, y, 320, s * 380);
    g.strokeRect(352, Math.min(y, y + s * 380), 320, 380);
    g.beginPath(); g.arc(512, y + s * 380, 120, 0, 7); g.stroke();
    g.beginPath(); g.arc(512, y + s * 60, 470, s > 0 ? 0.05 : Math.PI + 0.05, s > 0 ? Math.PI - 0.05 : 2 * Math.PI - 0.05); g.stroke();
  }
});
const pitchTex = () => ctex("pitchHD", 1024, 1536, (g) => {
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#4f9e3f" : "#5aab48"; g.fillRect(0, i * 128, 1024, 128); }
  g.strokeStyle = "#f4f4f4"; g.lineWidth = 9;
  g.strokeRect(40, 40, 944, 1456); g.beginPath(); g.moveTo(40, 768); g.lineTo(984, 768); g.stroke();
  g.beginPath(); g.arc(512, 768, 130, 0, 7); g.stroke();
  for (const [y, s] of [[40, 1], [1496, -1]] as [number, number][]) { g.strokeRect(250, Math.min(y, y + s * 240), 524, 240); g.strokeRect(390, Math.min(y, y + s * 90), 244, 90); }
});
const moonTex = () => ctex("moonHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#a7a3ad"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90; i++) { const x = r() * 1024, y = r() * 1024, rr = 8 + r() * 46;
    g.fillStyle = "#8e8a96"; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.strokeStyle = "#c4c0ca"; g.lineWidth = 3; g.beginPath(); g.arc(x - 2, y - 2, rr, 3.6, 5.6); g.stroke(); }
});
const carpetTex = (col: string, key: string) => ctex(key, 512, 512, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 3; for (let x = 0; x <= 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(512, x); g.stroke(); }
});

const glow = (col: string, i = 2.2) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i) }); return m; };

/** tiered stands with a painted crowd texture, both sides of a field (length L along z, half width hw) */
const stands = (b: Batch, cx: number, cz: number, L: number, hw: number, tint: string) => {
  const seats = lam("seats" + tint, () => ({ map: rep(ctex("crowdTex" + tint, 512, 256, (g, r) => {
    g.fillStyle = tint; g.fillRect(0, 0, 512, 256);
    const C = ["#e2453c", "#3f6fb5", "#f0b429", "#2f9e7a", "#f4f1ea", "#7b5ac9", "#f08a2c"];
    for (let y = 18; y < 256; y += 42) for (let x = 10; x < 512; x += 22) { g.fillStyle = C[Math.floor(r() * C.length)]; g.beginPath(); g.ellipse(x + r() * 6, y, 8, 11, 0, 0, 7); g.fill(); g.fillStyle = "#f2d2b0"; g.beginPath(); g.arc(x + r() * 6, y - 14, 6, 0, 7); g.fill(); }
  }), 8, 1) }));
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
    const x = cx + s * (hw + 3 + k * 1.6), h = 0.6 + k * 0.9;
    b.add(boxGeo(V(x - 0.8, D0, cz - L / 2), V(x + 0.8, D0 + h, cz + L / 2), 0), seats);
  }
};

export const buildPlaces = (root: THREE.Object3D) => {
  const b = new Batch();
  const white = lam("plWhite", () => ({ color: "#f4f4f4" })), dark = lam("plDark", () => ({ color: "#2b2a33" })), orange = lam("plOrange", () => ({ color: "#f0742c" }));
  const wall = lam("plWall", () => ({ color: "#3f5a8a" })), floorDark = lam("plFloorDark", () => ({ color: "#3a3540" }));
  // ---- basketball court ----
  {
    const P = PLACES.court.p, cz = P[2] - 6;
    const ground = plane(260, 260, null, "#2f3a5a", "plCourtGround"); b.add(ground.g, ground.m, at(P[0], D0 - 0.02, cz));
    const c = plane(15, 28, null, "", "x"); b.add(c.g, lam("courtHD", () => ({ map: courtTex() })), at(P[0], D0, cz));
    for (const s of [-1, 1]) {
      const z = cz + s * 12.6;
      b.add(boxGeo(V(P[0] - 0.12, D0, z + s * 1.2 - 0.12), V(P[0] + 0.12, D0 + 3.4, z + s * 1.2 + 0.12)), dark);
      b.add(boxGeo(V(P[0] - 0.9, D0 + 2.9, z - 0.05 + s * 0.15), V(P[0] + 0.9, D0 + 3.95, z + 0.05 + s * 0.15)), white);
      b.add(boxGeo(V(P[0] - 0.3, D0 + 3.05, z - 0.07 + s * 0.12), V(P[0] + 0.3, D0 + 3.5, z + 0.07 + s * 0.12)), orange);
      const rim = new THREE.TorusGeometry(0.23, 0.025, 8, 24); rim.rotateX(Math.PI / 2);
      b.add(rim, orange, at(P[0], D0 + 3.05, z - s * 0.2));
    }
    stands(b, P[0], cz, 30, 7.5, "#22304f");
    for (const s of [-1, 1]) b.add(boxGeo(V(P[0] - 40, D0, cz + s * 22), V(P[0] + 40, D0 + 14, cz + s * 22 + 1)), wall);
  }
  // ---- soccer pitch ----
  {
    const P = PLACES.pitch.p, cz = P[2] - 18;
    const ground = plane(300, 300, null, "#3f8a35", "plPitchGround"); b.add(ground.g, ground.m, at(P[0], D0 - 0.02, cz));
    const c = plane(46, 70, null, "", "x"); b.add(c.g, lam("pitchHD", () => ({ map: pitchTex() })), at(P[0], D0, cz));
    const gz = cz - 33.5;
    for (const x of [-3.66, 3.66]) b.add(boxGeo(V(P[0] + x - 0.06, D0, gz - 0.06), V(P[0] + x + 0.06, D0 + 2.44, gz + 0.06)), white);
    b.add(boxGeo(V(P[0] - 3.72, D0 + 2.38, gz - 0.06), V(P[0] + 3.72, D0 + 2.5, gz + 0.06)), white);
    const net = lam("plNet", () => ({ map: rep(ctex("netTex", 128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.strokeStyle = "#e8e8ee"; g.lineWidth = 6; for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); } }), 12, 4), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    const back = new THREE.PlaneGeometry(7.3, 2.4); b.add(back, net, at(P[0], D0 + 1.2, gz - 1.6));
    stands(b, P[0], cz, 76, 26, "#1f2d4a");
  }
  // ---- concert stage ----
  {
    const P = PLACES.stage.p;
    const ground = plane(260, 260, null, "#1d1a26", "plStageGround"); b.add(ground.g, ground.m, at(P[0], D0 - 0.02, P[2]));
    b.add(boxGeo(V(P[0] - 9, D0, P[2] - 2), V(P[0] + 9, D0 + 1.2, P[2] + 6), 0, true), floorDark);
    b.add(boxGeo(V(P[0] - 11, D0, P[2] + 6), V(P[0] + 11, D0 + 11, P[2] + 6.6)), lam("plStageWall", () => ({ color: "#2a2238" })));
    const bulbs = glow("#ffd27a", 2.6), pink = glow("#ff5fb0", 2.2), cyan = glow("#5fd8ff", 2.2);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) b.add(boxGeo(V(P[0] - 8 + i * 2 - 0.25, D0 + 3 + j * 2 - 0.25, P[2] + 5.9), V(P[0] - 8 + i * 2 + 0.25, D0 + 3 + j * 2 + 0.25, P[2] + 6.0)), (i + j) % 3 ? bulbs : (i % 2 ? pink : cyan));
    for (const x of [-10, 10]) b.add(boxGeo(V(P[0] + x - 0.5, D0, P[2] + 1), V(P[0] + x + 0.5, D0 + 9, P[2] + 2)), dark);
  }
  // ---- office ----
  {
    const P = PLACES.office.p;
    const f = plane(40, 40, null, "", "x"); b.add(f.g, lam("officeFloor", () => ({ map: rep(carpetTex("#7a8496", "carpetBlue"), 10, 10) })), at(P[0], D0, P[2] - 6));
    const ground = plane(260, 260, null, "#5a6170", "plOfficeGround"); b.add(ground.g, ground.m, at(P[0], D0 - 0.02, P[2] - 6));
    const wallL = lam("plOfficeWall", () => ({ color: "#e9e2d2" })), glass = glow("#a8d8ff", 1.2);
    b.add(boxGeo(V(P[0] - 20, D0, P[2] - 26), V(P[0] + 20, D0 + 6, P[2] - 25.6)), wallL);
    for (let i = 0; i < 8; i++) b.add(boxGeo(V(P[0] - 18 + i * 4.8, D0 + 1.4, P[2] - 25.7), V(P[0] - 15.4 + i * 4.8, D0 + 4.6, P[2] - 25.5)), glass);
    const desk = lam("plDesk", () => ({ color: "#c8a070" })), screen = glow("#7fd6ff", 1.6);
    for (const [dx, dz] of [[-4.5, -6], [4.5, -6], [-4.5, -12], [4.5, -12], [-4.5, -18], [4.5, -18]]) {
      b.add(boxGeo(V(P[0] + dx - 1.2, D0 + 0.72, P[2] + dz - 0.6), V(P[0] + dx + 1.2, D0 + 0.8, P[2] + dz + 0.6)), desk);
      for (const sx of [-1, 1]) b.add(boxGeo(V(P[0] + dx + sx * 1.1 - 0.05, D0, P[2] + dz - 0.5), V(P[0] + dx + sx * 1.1 + 0.05, D0 + 0.72, P[2] + dz + 0.5)), dark);
      b.add(boxGeo(V(P[0] + dx - 0.4, D0 + 0.8, P[2] + dz - 0.25), V(P[0] + dx + 0.4, D0 + 1.32, P[2] + dz - 0.2)), dark);
      b.add(boxGeo(V(P[0] + dx - 0.36, D0 + 0.84, P[2] + dz - 0.19), V(P[0] + dx + 0.36, D0 + 1.28, P[2] + dz - 0.18)), screen);
    }
  }
  // ---- server hall ----
  {
    const P = PLACES.servers.p;
    const f = plane(40, 60, null, "", "x"); b.add(f.g, lam("srvFloor", () => ({ map: rep(carpetTex("#cfd6de", "srvTiles"), 14, 20) })), at(P[0], D0, P[2] - 14));
    const ground = plane(260, 260, null, "#3a4250", "plSrvGround"); b.add(ground.g, ground.m, at(P[0], D0 - 0.02, P[2] - 14));
    const rack = twoTone(new THREE.MeshLambertMaterial({ color: "#2b2e3a" })), leds = glow("#4dff9a", 2.4), leds2 = glow("#5fd8ff", 2.4);
    for (const s of [-1, 1]) for (let k = 0; k < 16; k++) {
      const z = P[2] - 2 - k * 1.3, x = P[0] + s * 2.2;
      b.add(boxGeo(V(x - 0.5, D0, z - 0.6), V(x + 0.5, D0 + 2.6, z + 0.6)), rack);
      for (let j = 0; j < 6; j++) b.add(boxGeo(V(x - s * 0.52 - 0.01, D0 + 0.4 + j * 0.36, z - 0.4), V(x - s * 0.5, D0 + 0.44 + j * 0.36, z + (j % 2 ? 0.1 : 0.35))), (j + k) % 3 ? leds : leds2);
    }
    b.add(boxGeo(V(P[0] - 6, D0 + 3.4, P[2] - 24), V(P[0] + 6, D0 + 3.6, P[2] + 2)), dark);
  }
  // ---- the Moon ----
  {
    const P = PLACES.space.p;
    const f = plane(300, 300, null, "", "x"); b.add(f.g, lam("moonHD", () => ({ map: rep(moonTex(), 18, 18) })), at(P[0], D0, P[2]));
  }
  b.build(root);
  // Earth hanging in the Moon's sky (unlit card)
  const earth = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshBasicMaterial({ map: ctex("earthDisc", 512, 512, (g) => {
    g.fillStyle = "#2f74d0"; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
    g.fillStyle = "#4fbf6b"; for (const [x, y, rx, ry] of [[190, 200, 90, 60], [320, 300, 70, 100], [150, 340, 50, 40]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, 7); g.fill(); }
    g.fillStyle = "rgba(255,255,255,0.85)"; for (const [x, y, rx] of [[260, 120, 110], [200, 420, 90], [380, 220, 50]]) { g.beginPath(); g.ellipse(x, y, rx, 18, 0, 0, 7); g.fill(); }
    g.strokeStyle = "#0d1430"; g.lineWidth = 10; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.stroke();
  }), transparent: true, fog: false, side: THREE.DoubleSide }));
  earth.position.set(PLACES.space.p[0] - 18, D0 + 26, PLACES.space.p[2] + 90); earth.layers.set(3);
  root.add(earth);
};
