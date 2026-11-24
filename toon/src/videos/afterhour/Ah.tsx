// Afterhour look (Nov 16): real-3D cel-shaded characters in dense sets, one shot list driven by inputProps.ah.
// Post: lens blur (thin-lens DOF, from htmm) -> bloom (emissive) -> neutral tone mapping -> vignette.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree, useFrame } from "@react-three/fiber";
import { BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, EffectComposer as CoreComposer, RenderPass, EffectPass } from "postprocessing";
import { LensBlur } from "../htmm/lensblur";
import { makeChar, Char, Look, Pose, Expr } from "./char";
import { makeSet, SetName } from "./sets";
import { drawCard, CardSpec } from "./cards";
import { makeThing, isCodeThing, Thing } from "./things3d";
import { hasModel, loadModels, MODEL_INDEX } from "./models";
import { ACTS } from "./acts";
import type { ActRun, ActPose } from "./acts/types";
import { buildUnits, buildJourney, Pov3, UnitsSpec, JourneySpec } from "./pov3d";
import { PovOverlay, PovHud } from "./pov";

type V3 = [number, number, number];
export type AhChar = { look: Look; at?: string | V3; rot?: number; scale?: number; pose?: Pose; expr?: Expr; exprAt?: [number, Expr][] };
export type AhCard = CardSpec & { at?: string | V3; w?: number; rot?: number };
export type AhThing = { name: string; at?: string | V3; scale?: number; rot?: number; color?: string; text?: string; pop?: boolean };
export type AhShot = { a: number; n: number; set: SetName; view?: string; subject?: number; cam?: { from: V3; to: V3; look: V3 }; chars: AhChar[]; cards?: AhCard[]; things?: AhThing[]; coins?: boolean;
  /** a scripted action around the subject (acts/*.ts): the ball, hoop, opponent... really happen; `at` places the hero */ act?: { kind: string; at?: V3 };
  /** POV format (Nov 24): a row of everyday objects / a follow-the-object flythrough (pov3d.ts); `hud` = the math-card stack is on screen: shift the picture down `shift` (fraction of the frame) and keep props below `ndc` */
  units?: UnitsSpec; journey?: JourneySpec; hud?: { shift: number; ndc: number } };
type AhProps = { test?: string; shots?: AhShot[]; pov?: PovHud };

const JEN: Look = { body: "#1b1b22", legs: "#141418", hat: "crown", glasses: "shades" };
const DEMO: AhShot[] = [   // the reference's first 5 shots (0-6.3 s)
  { a: 0, n: 14, set: "throne", view: "ws", chars: [{ look: JEN, at: "seat", pose: "sit", expr: "smug" }] },
  { a: 14, n: 56, set: "throne", view: "ms", chars: [{ look: JEN, at: "seat", pose: "sit", expr: "grin" }] },
  { a: 70, n: 28, set: "throne", view: "wide", chars: [{ look: JEN, at: "seat", pose: "sit", expr: "smug" }], cards: [{ text: "NVIDIA", kind: "sign", at: "banner", w: 4 }] },
  { a: 98, n: 31, set: "throne", view: "face", chars: [{ look: JEN, at: "seat", pose: "sit", expr: "smug", exprAt: [[0.5, "wink"], [0.7, "smug"]] }] },
  { a: 129, n: 60, set: "throne", view: "ms", chars: [{ look: JEN, at: "seat", pose: "cheer", expr: "laugh" }], coins: true },
];
const PROPS = (): AhProps => ((getInputProps() as { ah?: AhProps }).ah ?? {});

const LOOKS: Look[] = [JEN, { body: "#2f6fd8", hat: "hardhat", hatColor: "#f2c230", hatText: "GOOGLE" }, { body: "#e2453c", hat: "hair", hair: "#2a1d16" },
  { body: "#1f2b55", hat: "cap", hatColor: "#1f2b55", text: "FBI" }, { body: "#b59a6a", hat: "fedora", hatColor: "#2b2522" }];
const POSES: Pose[] = ["stand", "cheer", "wave", "walk", "dig", "point", "shrug", "sit"];
const EXPRS: Expr[] = ["smile", "grin", "smug", "laugh", "shock", "sad", "angry", "wink", "neutral", "scream"];
const SETS: SetName[] = ["throne", "office", "diner", "lab", "stall", "field", "ring", "track", "graveyard", "boardroom", "street", "beach"];

/** the shot list for this render: inputProps.ah.shots, a test layout, or the demo */
const shotsFor = (p: AhProps): AhShot[] => {
  if (p.test === "chars") return [
    { a: 0, n: 30, set: "throne", cam: { from: [0, 1.7, 9.5], to: [0, 1.7, 9.2], look: [0, 1.1, 0] }, chars: LOOKS.map((l, i) => ({ look: l, at: [(i - 2) * 1.4, 0, 0] as V3, pose: POSES[i], expr: EXPRS[i] })) },
    { a: 30, n: 30, set: "throne", view: "face", chars: [{ look: JEN, at: [0, 0, 0], pose: "stand", expr: "smile", exprAt: EXPRS.map((e, i) => [i * 0.1, e] as [number, Expr]) }] },
    { a: 60, n: 30, set: "throne", cam: { from: [0, 1.7, 9.5], to: [0, 1.7, 9.2], look: [0, 1.1, 0] }, chars: LOOKS.map((l, i) => ({ look: l, at: [(i - 2) * 1.4, 0, 0] as V3, pose: POSES[(i + 5) % 8], expr: EXPRS[(i + 5) % 10] })) },
  ];
  if (p.test === "things") {
    const ALL = ["shoe", "springshoe", "chip", "gpu", "cash", "cashstack", "coins", "goldbar", "trophy", "medal", "crown", "ring", "car", "sportscar", "bus", "truck", "rocket", "phone", "laptop", "tv", "monitor", "clock", "books", "letter", "newspaper", "briefcase", "shovel", "pickaxe", "box", "crate", "basketball", "football", "hoop", "mic", "headset", "controller", "burger", "pizza", "coffee", "plant", "robot", "drone", "satellite", "globe", "house", "factory", "stadium", "plane", "yacht", "chart", "arrowup", "arrowdown", "lightbulb", "lock", "key", "heart", "bomb", "fire", "camera"];
    const out: AhShot[] = [];
    for (let k = 0; k * 12 < ALL.length; k++) out.push({ a: k * 30, n: 30, set: "office", cam: { from: [0, 1.6, 7.2], to: [0, 1.6, 7.0], look: [0, 1.25, 0] }, chars: [],
      things: ALL.slice(k * 12, k * 12 + 12).map((nm, i) => ({ name: nm, at: [((i % 3) - 1) * 0.85, 0.1 + (3 - Math.floor(i / 3)) * 0.8, 1.5] as V3, fit: 0.5 }) as AhThing) });
    return out;
  }
  if (p.test === "models") {   // contact sheets of the CC0 library: 12 per shot; props {"ah":{"test":"models","from":0}} starts at that index
    const ALL = Object.keys(MODEL_INDEX).sort(), from = (p as AhProps & { from?: number }).from ?? 0, out: AhShot[] = [];
    for (let k = 0; k < 6 && from + k * 12 < ALL.length; k++) out.push({ a: k * 30, n: 30, set: "office", cam: { from: [0, 1.6, 7.2], to: [0, 1.6, 7.0], look: [0, 1.25, 0] }, chars: [],
      things: ALL.slice(from + k * 12, from + k * 12 + 12).map((nm, i) => ({ name: nm, at: [((i % 3) - 1) * 0.85, 0.1 + (3 - Math.floor(i / 3)) * 0.8, 1.5] as V3, fit: 0.5 }) as AhThing) });
    return out;
  }
  if (p.test === "sets") return SETS.map((s, k) => ({ a: k * 30, n: 30, set: s, cam: { from: [0, 1.6, 7], to: [0, 1.6, 6.6], look: [0, 1.2, 0] }, chars: [{ look: JEN, at: [0, 0, 0], pose: "stand", expr: "smile" }] }));
  return p.shots ?? DEMO;
};
const SHOTS_ = shotsFor(PROPS());
/** every library model the shot list needs: loaded up front so rendering stays deterministic */
const MODEL_NAMES = [...new Set(SHOTS_.flatMap((s) => [...(s.things ?? []).map((t) => t.name), ...((s.act ? ACTS[s.act.kind]?.models : undefined) ?? [])]).filter((n) => !isCodeThing(n) && hasModel(n)))];
export const AH_FRAMES = Math.max(1, ...SHOTS_.map((s) => s.a + s.n));

/** camera presets relative to the subject's head (x, z of the subject; head at y ~1.55 standing, ~1.15 sitting) */
const VIEWS: Record<string, { from: V3; to: V3; look: V3; blur: number }> = {
  ws: { from: [0, 2.6, 11], to: [0, 2.4, 9.8], look: [0, 1.2, 0], blur: 0 },
  wide: { from: [0, 2.0, 8.5], to: [0, 2.0, 7.6], look: [0, 1.6, 0], blur: 2 },
  ms: { from: [0.2, 1.5, 4.4], to: [0.15, 1.5, 3.9], look: [0, 1.3, 0], blur: 8 },
  // opener (Nov 23): the hero is big from frame 0 and the camera pushes in hard; he sits low in frame so the hook title above never covers him or his card
  hook: { from: [0.1, 1.95, 6.0], to: [0.1, 1.9, 4.9], look: [0, 1.95, 0], blur: 3 },
  cu: { from: [0.3, 1.55, 2.6], to: [0.25, 1.55, 2.3], look: [0, 1.45, 0], blur: 12 },
  face: { from: [0.35, 1.45, 2.7], to: [0.3, 1.45, 2.4], look: [0, 1.38, 0], blur: 14 },
  low: { from: [0.8, 0.6, 3.6], to: [0.7, 0.6, 3.2], look: [0, 1.4, 0], blur: 8 },
  // act views (acts/*.ts): whole body + the hoop / goal / opponent in frame, little blur
  act: { from: [1.4, 2.2, 11.2], to: [1.4, 2.2, 10.4], look: [1.4, 2.0, 0], blur: 1 },     // scene extends to the hero's right
  acts: { from: [0.9, 2.4, 13.2], to: [0.9, 2.4, 12.4], look: [0.9, 2.1, 0], blur: 1 },   // jump shot: shooter + hoop both whole (Nov 18)
  actl: { from: [0.25, 2.2, 10.2], to: [0.25, 2.2, 9.5], look: [0.25, 2.0, 0], blur: 1 },  // run-in from the right, hoop on the left
  actw: { from: [0.1, 1.95, 11.4], to: [0.1, 1.95, 10.6], look: [0.1, 1.8, 0], blur: 1 },
  actd: { from: [0.5, 2.2, 10.2], to: [0.5, 2.2, 9.5], look: [0.5, 2.0, 0], blur: 1 },
  actc: { from: [0, 1.9, 9.4], to: [0, 1.9, 8.7], look: [0, 1.8, 0], blur: 1 },
  actm: { from: [0.8, 1.5, 7.4], to: [0.8, 1.5, 6.8], look: [0.75, 1.2, 0], blur: 1 },
  actsing: { from: [0.5, 1.95, 5.4], to: [0.5, 1.9, 4.9], look: [0.1, 1.65, 0], blur: 1 },   // singer close on the stage
  actf: { from: [0.45, 1.6, 6.3], to: [0.4, 1.6, 5.8], look: [0.35, 1.4, 0], blur: 1 },      // hero at the camera's eyepiece, lens pointing right
  actcode: { from: [0.3, 1.6, 5.2], to: [0.3, 1.6, 4.7], look: [0.2, 1.4, 0], blur: 1 },     // seated coder, middle screen + DEPLOY button
  actt: { from: [0.3, 2.0, 8.0], to: [0.3, 2.0, 7.4], look: [0.3, 1.9, 0], blur: 1 },
};
/** Nov 16 (owner: the acted hero was ~1/8 of the frame): pull each act view in along its own view ray (k < 1 = closer) and aim lower, so the whole body fills ~45% of the frame height; the head-in-frame guard below still backs off for jumps */
const ACT_CLOSER: Record<string, [number, number]> = { act: [0.62, -0.25], actl: [0.64, -0.25], actw: [0.7, -0.2], actd: [0.7, -0.25], actc: [0.7, -0.2], actm: [0.97, -0.08], actsing: [0.85, -0.05], actf: [0.85, -0.05], actcode: [0.88, 0], actt: [0.75, -0.2] };
for (const [n, [k, dy]] of Object.entries(ACT_CLOSER)) {
  const v = VIEWS[n], c = (p: V3): V3 => [v.look[0] + (p[0] - v.look[0]) * k, v.look[1] + (p[1] - v.look[1]) * k + dy, v.look[2] + (p[2] - v.look[2]) * k];
  v.from = c(v.from); v.to = c(v.to); v.look = [v.look[0], v.look[1] + dy, v.look[2]];
}
const lerp = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const ease = (u: number) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;

type Built = { setRoot: THREE.Group; setLights: THREE.Light[]; hide: THREE.Object3D[]; instHide: InstHide[]; root: THREE.Group; chars: Char[]; things: Thing[]; run?: ActRun; view?: string; bg: string; fog?: THREE.Fog; spots: Record<string, V3>; coinGeo?: THREE.InstancedMesh; pov3?: Pov3 };
const BUILT = new Map<number, Built>();
const spotOf = (b: { spots: Record<string, V3> }, at: string | V3 | undefined): V3 => (Array.isArray(at) ? at : at && b.spots[at] ? b.spots[at] : [0, 0, 0]);

/** set meshes that would block or clutter an act shot: anything between the camera and the hero, or within 1.5 m of the act area
 *  (taxis, crowds, goals, loose balls). Big containers are descended into; floors / platforms / walls are never hidden. */
const _bx = new THREE.Box3(), _sz = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _ib = new THREE.Box3();
type InstHide = { mesh: THREE.InstancedMesh; idx: number[] };
const pickHidden = (setRoot: THREE.Object3D, cam: V3, hero: V3, headY: number): { nodes: THREE.Object3D[]; inst: InstHide[] } => {
  const nodes: THREE.Object3D[] = [], inst: InstHide[] = [];
  setRoot.updateMatrixWorld(true);
  const dx = hero[0] - cam[0], dz = hero[2] - cam[2], len2 = dx * dx + dz * dz || 1, dist = Math.sqrt(len2);
  /** the box (in _bx / _sz) is clutter for this shot? floors and overhead things never are */
  const clutter = (): boolean => {
    if (_sz.y < 0.9 && Math.max(_sz.x, _sz.z) >= 1.5) return false;      // floor, rug, platform, bench: the hero may stand on it
    if (_bx.max.y < 0.12 || _bx.min.y > 3.2) return false;               // paint on the floor, overhead lights
    if (_bx.max.x > hero[0] - 1.5 && _bx.min.x < hero[0] + 1.5 && _bx.max.z > hero[2] - 1.5 && _bx.min.z < hero[2] + 1.5) return true;   // within 1.5 m of the act area
    const cx = (_bx.min.x + _bx.max.x) / 2, cz = (_bx.min.z + _bx.max.z) / 2, tt = ((cx - cam[0]) * dx + (cz - cam[2]) * dz) / len2;
    if (tt <= 0.02 || tt >= 0.97) return false;
    const off = Math.hypot(cam[0] + dx * tt - cx, cam[2] + dz * tt - cz) - Math.max(_sz.x, _sz.z) / 2;
    return off < 0.35 || (tt < 0.95 && off < 0.28 * tt * dist + 0.3);   // on the camera -> hero ray, or inside the view cone in front of the hero
  };
  const visit = (n: THREE.Object3D) => {
    if ((n as THREE.Light).isLight) return;
    const im = n as THREE.InstancedMesh;
    if (im.isInstancedMesh && im.count > 1) {   // crowds / glow sticks: judge every instance on its own
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      const idx: number[] = [];
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _m4); _ib.copy(im.geometry.boundingBox!).applyMatrix4(_m4.premultiply(im.matrixWorld));
        _bx.copy(_ib); _bx.getSize(_sz); if (clutter()) idx.push(i);
      }
      if (idx.length) inst.push({ mesh: im, idx });
      return;
    }
    _bx.setFromObject(n); if (_bx.isEmpty()) return;
    _bx.getSize(_sz);
    if (Math.max(_sz.x, _sz.z) > 4.5 || _sz.y > 9) { n.children.forEach(visit); return; }   // big containers: look inside, never hide whole
    if (clutter()) nodes.push(n);
  };
  setRoot.children.forEach(visit);
  return { nodes, inst };
};
/** every node any act shot hid, per set: restored each frame before the current shot hides its own (the set objects are shared by every shot using that set) */
const EVER_HIDDEN = new Map<THREE.Object3D, Set<THREE.Object3D>>();
/** instanced meshes: original matrices + which shot's hiding is applied now */
const INST_ORIG = new Map<THREE.InstancedMesh, { orig: Float32Array; applied: number }>();
const applyInstHide = (list: InstHide[], k: number, all: Set<THREE.InstancedMesh>) => {
  for (const m of all) {
    let st = INST_ORIG.get(m); if (!st) INST_ORIG.set(m, st = { orig: new Float32Array(m.instanceMatrix.array as Float32Array), applied: -1 });
    const mine = list.find((h) => h.mesh === m), want = mine ? k : -1;
    if (st.applied === want) continue;
    (m.instanceMatrix.array as Float32Array).set(st.orig);
    if (mine) for (const i of mine.idx) (m.instanceMatrix.array as Float32Array).fill(0, i * 16, i * 16 + 16);
    m.instanceMatrix.needsUpdate = true; st.applied = want;
  }
};
const EVER_INST = new Map<THREE.Object3D, Set<THREE.InstancedMesh>>();


/** Cards and things must sit fully inside the 9:16 frame (and clear of the top subtitle) at every moment of the shot's camera move:
 *  nudge them along the camera's right/up axes, and shrink them when they are simply too big for the view. */
type FitItem = { pos: THREE.Vector3; hw: number; hh: number; set: (k: number) => void };
const fitInFrame = (s: AhShot, viewName: string | undefined, headY: number, root: THREE.Vector3, sitting: boolean, items: FitItem[]) => {
  if (!items.length) return;
  const V = s.cam ? { ...s.cam, blur: 4 } : VIEWS[(viewName && VIEWS[viewName]) ? viewName : "ms"] ?? VIEWS.ms;
  const sp: V3 = s.chars[s.subject ?? 0] ? [root.x, root.y, root.z] : [0, 0, 0];
  const drop = (sitting ? Math.max(0, root.y) : root.y) + (sitting ? 0 : headY - 1.55);
  const off = (p: V3): V3 => (s.cam ? p : [p[0] + sp[0], p[1] + drop, p[2] + sp[2]]);
  const fov = s.view === "face" ? 38 : 40, tf = Math.tan((fov * Math.PI) / 360), asp = 1080 / 1920;
  const cams = [0, 0.75, 1].map((t) => {
    const c = new THREE.PerspectiveCamera(fov, asp, 0.1, 400);
    c.position.set(...off(lerp(V.from, V.to, t))); c.lookAt(...off(V.look)); c.updateMatrixWorld(true); c.updateProjectionMatrix(); return c;
  });
  const sh2 = 2 * (s.hud?.shift ?? 0), LX = 0.84, YLO = -0.7 + sh2, YHI = (s.hud ? s.hud.ndc + sh2 : s.view === "hook" ? 0.34 : 0.66), v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  for (const it of items) {
    for (let iter = 0; iter < 24; iter++) {
      let moved = false, tooBig = false;
      for (const c of cams) {
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9, ok = true;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          v.set(it.pos.x + sx * it.hw, it.pos.y + sy * it.hh, it.pos.z).project(c);
          if (v.z > 1) ok = false; x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
        }
        if (!ok) continue;
        if (x1 - x0 > 2 * LX || y1 - y0 > YHI - YLO) { tooBig = true; continue; }
        const dx = x1 > LX ? LX - x1 : x0 < -LX ? -LX - x0 : 0, dy = y1 > YHI ? YHI - y1 : y0 < YLO ? YLO - y0 : 0;
        if (dx || dy) {
          const d = Math.max(0.5, v.set(it.pos.x, it.pos.y, it.pos.z).applyMatrix4(c.matrixWorldInverse).z * -1);
          right.setFromMatrixColumn(c.matrixWorld, 0); up.setFromMatrixColumn(c.matrixWorld, 1);
          it.pos.addScaledVector(right, dx * d * tf * asp).addScaledVector(up, dy * d * tf); moved = true;
        }
      }
      if (tooBig) { it.hw *= 0.88; it.hh *= 0.88; it.set(0.88); continue; }
      if (!moved) break;
    }
  }
};

const build = (k: number, s: AhShot): Built => {
  const hit = BUILT.get(k); if (hit) return hit;
  if (s.units || s.journey) {   // POV shots without a hero: a row of objects / a flythrough (pov3d.ts)
    const p3 = s.units ? buildUnits(s.units) : buildJourney(s.journey!), root = new THREE.Group();
    root.add(p3.root); p3.lights.forEach((l) => root.add(l));
    const nb: Built = { root, chars: [], things: [], bg: p3.bg, fog: p3.fog, spots: {}, hide: [], instHide: [], setRoot: p3.root, setLights: p3.lights, pov3: p3 };
    BUILT.set(k, nb); return nb;
  }
  const set = makeSet(s.set), root = new THREE.Group();
  root.add(set.root); set.lights.forEach((l) => root.add(l));
  const chars = s.chars.map((c) => {
    const ch = makeChar(c.look), p = spotOf(set, c.at);
    ch.root.position.set(p[0], c.pose === "sit" ? Math.max(0, p[1] - 0.55) : p[1], p[2]); ch.root.rotation.y = c.rot ?? 0;
    if (c.scale) ch.root.scale.setScalar(c.scale);   // small figures (a "1 in 10" row)
    root.add(ch.root); return ch;
  });
  const fitItems: FitItem[] = [];
  (s.cards ?? []).forEach((c) => {
    const W = 1100, Hh = c.kind === "paper" || c.kind === "tomb" ? 1300 : 700, tex = drawCard(c, W, Hh);
    // far views: the card grows about the top of the hero's head so it stays readable on a phone (and stays above the head)
    const ck = s.view === "wide" ? 1.35 : s.view === "ws" ? 1.8 : 1, headTop = ((chars[s.subject ?? 0] as Char & { headY?: number } | undefined)?.headY ?? 1.55) + 0.42;
    const w = (c.w ?? 1.6) * (s.cam || s.act ? 1 : ck);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * Hh) / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    const p0 = spotOf(set, c.at ?? [1.2, 1.6, -0.6]), kk = s.cam || s.act ? 1 : ck, p: V3 = [p0[0] * kk, headTop + (p0[1] - headTop) * kk, p0[2]]; m.position.set(p[0], p[1], p[2] + 0.02); m.rotation.y = c.rot ?? 0; root.add(m);
    const hh = (w * Hh) / W;
    fitItems.push({ pos: m.position, hw: w / 2, hh: hh / 2, set: (k2) => m.scale.multiplyScalar(k2) });
  });
  const things: Thing[] = (s.things ?? []).map((t) => {
    const th = makeThing(t.name, { color: t.color, text: t.text }), p = spotOf(set, t.at ?? [1.0, 0, 0.4]);
    const fit = (t as AhThing & { fit?: number }).fit;
    const fitK = s.view === "wide" ? 1.3 : s.view === "ws" ? 1.6 : s.view === "hook" ? 0.7 : 1;   // held things read bigger in the far views (not so big they bury the hero)
    const sc = fit ? (fit * fitK) / Math.max(0.05, th.size) : (t.scale ?? 1);
    th.root.position.set(p[0] + (s.view === "hook" ? 0.2 : 0), p[1] - (s.view === "hook" ? 0.2 : 0), p[2]); th.root.rotation.y = t.rot ?? -0.35; th.root.scale.setScalar(sc);
    th.root.userData.base = sc; th.root.userData.pop = t.pop !== false;
    root.add(th.root);
    th.root.updateMatrixWorld(true);
    let bb = new THREE.Box3().setFromObject(th.root);   // the real extent (a tv / sign is wider than its nominal size)
    // Nov 17 (Ninja test: the grown cash stack / controller covered his face): a held thing never sits in front of the
    // hero's head or torso — slide it out to the hero's side until its box clears the body column
    const hero0 = chars[s.subject ?? 0];
    if (fit && hero0 && !s.cam && t.name !== "giantshovel") {
      const hx = hero0.root.position.x, clear = 0.36 * (hero0.root.scale.x || 1);
      const left = bb.min.x - hx;
      if (left < clear) { th.root.position.x += clear - left; th.root.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(th.root); }
    }
    const bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    const r = Math.max(0.1, (fit ? fit * fitK : th.size * sc) * 0.6), hw0 = bs.x / 2 + Math.abs(bc.x - th.root.position.x), hh0 = bs.y / 2 + Math.abs(bc.y - th.root.position.y);
    if (!s.act && t.name !== "giantshovel") fitItems.push({ pos: th.root.position, hw: Math.max(r, hw0), hh: Math.max(r, hh0), set: (k2) => { th.root.userData.base *= k2; th.root.scale.setScalar(th.root.userData.base); } });
    return th;
  });

  // the act: built once with the shot (props, opponents), ticked every frame
  let run: ActRun | undefined, view: string | undefined, hide: THREE.Object3D[] = [], instHide: InstHide[] = [];
  const def = s.act ? ACTS[s.act.kind] : undefined;
  if (def && chars.length) {
    const hero = chars[s.subject ?? 0] ?? chars[0];
    if (s.act?.at) hero.root.position.set(...s.act.at);
    const at: V3 = [hero.root.position.x, hero.root.position.y, hero.root.position.z];
    if (def.hideHat) hero.showHat(false);
    const V0 = VIEWS[(def.view && VIEWS[def.view] ? def.view : s.view) ?? "ms"] ?? VIEWS.ms;
    const cam0: V3 = s.cam ? s.cam.from : [at[0] + (V0.from[0] + V0.to[0]) / 2, at[1] + (V0.from[1] + V0.to[1]) / 2, at[2] + (V0.from[2] + V0.to[2]) / 2];
    const ph = pickHidden(set.root, cam0, at, at[1] + 1.55); hide = ph.nodes; instHide = ph.inst;
    let ev = EVER_HIDDEN.get(set.root); if (!ev) EVER_HIDDEN.set(set.root, ev = new Set());
    hide.forEach((n) => ev!.add(n));
    let ei = EVER_INST.get(set.root); if (!ei) EVER_INST.set(set.root, ei = new Set());
    instHide.forEach((h) => ei!.add(h.mesh));
    run = def.build({ root, hero, heroAt: at, set: s.set, spots: set.spots as Record<string, V3>, seed: k + 1 });
    view = def.view;
  }
  if (s.things?.some((t) => ["basketball", "football", "soccerball", "baseball"].includes(t.name))) {   // a set's own ball (court / pitch) is hidden when the shot already shows a ball thing
    let ev = EVER_HIDDEN.get(set.root); if (!ev) EVER_HIDDEN.set(set.root, ev = new Set());
    set.root.traverse((o) => { if (o.userData.setBall) { hide.push(o); ev!.add(o); } });
  }
  { const sj = chars[s.subject ?? 0], sc0 = s.chars[s.subject ?? 0];
    if (sj) fitInFrame(s, view && VIEWS[view] ? view : s.view, (sj as Char & { headY?: number }).headY ?? 1.55, sj.root.position, sc0?.pose === "sit", fitItems); }
  let coinGeo: THREE.InstancedMesh | undefined;
  if (s.coins) {
    coinGeo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 16), new THREE.MeshStandardMaterial({ color: "#f2c230", metalness: 0.8, roughness: 0.3, emissive: "#f2c230", emissiveIntensity: 0.4 }), 60);
    root.add(coinGeo);
  }
  const b: Built = { root, chars, things, bg: set.bg, fog: set.fog, spots: set.spots as Record<string, V3>, coinGeo, run, view, setRoot: set.root, setLights: set.lights, hide, instHide };
  BUILT.set(k, b); return b;
};

const Inner: React.FC = () => {
  const f = useCurrentFrame();
  const { camera, scene, gl } = useThree();
  const fx = useMemo(() => ({
    lens: new LensBlur({ maxCoC: 22, nearScale: 1.0 }),
    bloom: new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.35, luminanceThreshold: 1.05, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.6 }),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.55 }),
  }), []);
  const core = useMemo(() => {
    const c = new CoreComposer(gl, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new EffectPass(camera, fx.lens.pre)); c.addPass(new EffectPass(camera, fx.lens.main));
    c.addPass(new EffectPass(camera, fx.bloom, fx.tone, fx.vig));
    const v = gl.getDrawingBufferSize(new THREE.Vector2()); c.setSize(v.x, v.y, false);
    return c;
  }, [gl, scene, camera, fx]);
  useFrame(() => { gl.toneMapping = THREE.NoToneMapping; gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; core.render(); }, 1);

  const k = Math.max(0, SHOTS_.findIndex((s) => f >= s.a && f < s.a + s.n)), s = SHOTS_[k], tl = (f - s.a) / 30, u = ease((f - s.a) / Math.max(1, s.n - 1));
  const b = build(k, s);
  // the set objects are shared by every shot using that set: re-attach if a later shot took them, and reset what act shots hid
  if (b.setRoot.parent !== b.root) { b.root.add(b.setRoot); b.setLights.forEach((l) => b.root.add(l)); }
  EVER_HIDDEN.get(b.setRoot)?.forEach((n) => { n.visible = true; });
  b.hide.forEach((n) => { n.visible = false; });
  { const ei = EVER_INST.get(b.setRoot); if (ei) applyInstHide(b.instHide, k, ei); }
  // pose every character
  const hi = Math.min(s.subject ?? 0, s.chars.length - 1);
  const ap = b.run?.tick(tl);   // the act may take over the hero's pose (and its own clock)
  const apo: ActPose | undefined = ap ? (typeof ap === "string" ? { pose: ap } : ap) : undefined;
  s.chars.forEach((c, i) => {
    let e: Expr = c.expr ?? "smile";
    for (const [at, ex] of c.exprAt ?? []) if (tl >= at) e = ex;
    const blink = ((f + i * 37) % 97) < 3;
    if (apo && i === hi) b.chars[i].set(apo.t ?? tl, apo.pose, apo.expr ?? e, blink);
    else b.chars[i].set(tl + i * 0.7, c.pose ?? "stand", e, blink);
  });
  b.run?.tick(tl);   // again, now that the hero is posed: props that follow the hands read the current pose
  // things pop in on their line (back-eased overshoot) and run their own little motion
  b.things.forEach((th) => {
    const base = th.root.userData.base as number, u2 = Math.max(0, Math.min(1, (tl - 0.08) / 0.3));
    const k2 = th.root.userData.pop ? (u2 <= 0 ? 0.001 : 1 + 2.2 * (u2 - 1) ** 3 + 1.2 * (u2 - 1) ** 2) : 1;
    th.root.scale.setScalar(base * Math.max(0.001, k2)); th.tick?.(tl);
  });
  // falling coins (deterministic)
  if (b.coinGeo) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const c0 = spotOf(b, s.chars[s.subject ?? 0]?.at);
    for (let i = 0; i < 60; i++) {
      const ph = (i * 0.618) % 1, y = 4 - ((tl * 2.2 + ph * 4) % 4), x = c0[0] + ((i * 7.31) % 5) - 2.5, z = c0[2] - 0.4 - ((i * 3.17) % 3.2);   // behind the subject: never through the lens (Nov 16 frame check)
      q.setFromEuler(new THREE.Euler(tl * 3 + i, i, tl * 2)); m.compose(new THREE.Vector3(x, y, z), q, sc); b.coinGeo.setMatrixAt(i, m);
    }
    b.coinGeo.instanceMatrix.needsUpdate = true;
  }
  // camera: preset relative to the subject, or explicit
  // presets are written for a standing head at y 1.55; shift them to where this subject's head really is
  const subj = s.chars[s.subject ?? 0], sp = s.act?.at ?? (subj ? spotOf(b, subj.at) : ([0, 0, 0] as V3));
  const hy = (b.chars[s.subject ?? 0] as Char & { headY?: number } | undefined)?.headY ?? 1.55;   // tall people (height 1.3) carry the head higher
  const rootY = subj?.pose === "sit" ? Math.max(0, sp[1] - 0.55) : sp[1], drop = rootY + (subj?.pose === "sit" ? 0 : hy - 1.55);
  const V = s.cam ? { ...s.cam, blur: 4 } : VIEWS[(b.view && VIEWS[b.view] ? b.view : s.view) ?? "ms"] ?? VIEWS.ms;
  const off = (p: V3): V3 => (s.cam ? p : [p[0] + sp[0], p[1] + drop, p[2] + sp[2]]);
  let pos = off(lerp(V.from, V.to, u)), look = off(V.look);
  const cam = camera as THREE.PerspectiveCamera;
  let blur = V.blur;
  const ul = (f - s.a) / Math.max(1, s.n - 1);   // linear 0..1 inside the shot (the POV rigs ease for themselves)
  if (b.pov3) { const c3 = b.pov3.cam(ul); pos = [...c3.from] as V3; look = [...c3.look] as V3; blur = c3.blur; }
  cam.fov = s.view === "face" ? 38 : 40; cam.near = 0.1; cam.far = 400; cam.updateProjectionMatrix();
  cam.position.set(...pos); cam.lookAt(...look);
  if (s.hud?.shift) {   // the math cards cover the top: pan the whole picture down by a fraction of the frame height
    const d = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]), dy = s.hud.shift * 2 * d * Math.tan((cam.fov * Math.PI) / 360);
    pos = [pos[0], pos[1] + dy, pos[2]]; look = [look[0], look[1] + dy, look[2]];
    cam.position.set(...pos); cam.lookAt(...look);
  }
  if (b.pov3) b.pov3.tick(ul, cam.position);
  // act shots: the hero's whole head (jumps included) stays in frame: dolly back along the view ray until it is
  const hero = b.chars[hi];
  if (b.run && hero) {
    const mp = hero.mouth(), pts = [[0, 0.58, 0], [0.5, 0.2, 0], [-0.5, 0.2, 0], [0, -0.14, 0]].map(([x, y, z]) => new THREE.Vector3(mp.x + x, mp.y + y, mp.z + z)), v = new THREE.Vector3();
    for (let it = 0; it < 14; it++) {
      cam.updateMatrixWorld(true);
      const bad = pts.some((p) => { v.copy(p).project(cam); return Math.abs(v.x) > 0.9 || v.y > 0.86 || v.y < -0.9 || v.z > 1; });
      if (!bad) break;
      cam.position.set(look[0] + (cam.position.x - look[0]) * 1.07, look[1] + (cam.position.y - look[1]) * 1.07, look[2] + (cam.position.z - look[2]) * 1.07); cam.lookAt(...look);
    }
    pos[0] = cam.position.x; pos[1] = cam.position.y; pos[2] = cam.position.z;
  }
  fx.lens.focus = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
  fx.lens.cInf = blur;
  scene.background = new THREE.Color(b.bg);
  scene.fog = b.fog ?? null;
  return <primitive object={b.root} dispose={null} />;
};

export const AhShort: React.FC = () => {
  const [ready, setReady] = useState(MODEL_NAMES.length === 0);
  const [handle] = useState(() => (MODEL_NAMES.length ? delayRender("afterhour models") : 0));
  useEffect(() => {
    if (!MODEL_NAMES.length) return;
    loadModels(MODEL_NAMES).then(() => { setReady(true); continueRender(handle); });
  }, [handle]);
  return (
  <AbsoluteFill style={{ background: "#000" }}>
    {ready && <ThreeCanvas width={1080} height={1920} shadows gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }} camera={{ fov: 40, near: 0.1, far: 400 }}>
      <Inner />
    </ThreeCanvas>}
    {ready && PROPS().pov && <PovOverlay hud={PROPS().pov!} />}
  </AbsoluteFill>
  );
};
