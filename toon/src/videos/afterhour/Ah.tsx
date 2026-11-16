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

type V3 = [number, number, number];
export type AhChar = { look: Look; at?: string | V3; rot?: number; pose?: Pose; expr?: Expr; exprAt?: [number, Expr][] };
export type AhCard = CardSpec & { at?: string | V3; w?: number; rot?: number };
export type AhThing = { name: string; at?: string | V3; scale?: number; rot?: number; color?: string; text?: string; pop?: boolean };
export type AhShot = { a: number; n: number; set: SetName; view?: string; subject?: number; cam?: { from: V3; to: V3; look: V3 }; chars: AhChar[]; cards?: AhCard[]; things?: AhThing[]; coins?: boolean };
type AhProps = { test?: string; shots?: AhShot[] };

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
const MODEL_NAMES = [...new Set(SHOTS_.flatMap((s) => (s.things ?? []).map((t) => t.name)).filter((n) => !isCodeThing(n) && hasModel(n)))];
export const AH_FRAMES = Math.max(1, ...SHOTS_.map((s) => s.a + s.n));

/** camera presets relative to the subject's head (x, z of the subject; head at y ~1.55 standing, ~1.15 sitting) */
const VIEWS: Record<string, { from: V3; to: V3; look: V3; blur: number }> = {
  ws: { from: [0, 2.6, 11], to: [0, 2.4, 9.8], look: [0, 1.2, 0], blur: 0 },
  wide: { from: [0, 2.0, 8.5], to: [0, 2.0, 7.6], look: [0, 1.6, 0], blur: 2 },
  ms: { from: [0.2, 1.5, 4.4], to: [0.15, 1.5, 3.9], look: [0, 1.3, 0], blur: 8 },
  cu: { from: [0.3, 1.55, 2.6], to: [0.25, 1.55, 2.3], look: [0, 1.45, 0], blur: 12 },
  face: { from: [0.35, 1.45, 2.7], to: [0.3, 1.45, 2.4], look: [0, 1.38, 0], blur: 14 },
  low: { from: [0.8, 0.6, 3.6], to: [0.7, 0.6, 3.2], look: [0, 1.4, 0], blur: 8 },
};
const lerp = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const ease = (u: number) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 2;

type Built = { root: THREE.Group; chars: Char[]; things: Thing[]; bg: string; fog?: THREE.Fog; spots: Record<string, V3>; coinGeo?: THREE.InstancedMesh };
const BUILT = new Map<number, Built>();
const spotOf = (b: { spots: Record<string, V3> }, at: string | V3 | undefined): V3 => (Array.isArray(at) ? at : at && b.spots[at] ? b.spots[at] : [0, 0, 0]);

const build = (k: number, s: AhShot): Built => {
  const hit = BUILT.get(k); if (hit) return hit;
  const set = makeSet(s.set), root = new THREE.Group();
  root.add(set.root); set.lights.forEach((l) => root.add(l));
  const chars = s.chars.map((c) => {
    const ch = makeChar(c.look), p = spotOf(set, c.at);
    ch.root.position.set(p[0], c.pose === "sit" ? Math.max(0, p[1] - 0.55) : p[1], p[2]); ch.root.rotation.y = c.rot ?? 0;
    root.add(ch.root); return ch;
  });
  (s.cards ?? []).forEach((c) => {
    const W = 1100, Hh = c.kind === "paper" || c.kind === "tomb" ? 1300 : 700, tex = drawCard(c, W, Hh), w = c.w ?? 1.6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * Hh) / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    const p = spotOf(set, c.at ?? [1.2, 1.6, -0.6]); m.position.set(p[0], p[1], p[2] + 0.02); m.rotation.y = c.rot ?? 0; root.add(m);
  });
  const things: Thing[] = (s.things ?? []).map((t) => {
    const th = makeThing(t.name, { color: t.color, text: t.text }), p = spotOf(set, t.at ?? [1.0, 0, 0.4]);
    const fit = (t as AhThing & { fit?: number }).fit;
    const sc = fit ? fit / Math.max(0.05, th.size) : (t.scale ?? 1);
    th.root.position.set(p[0], p[1], p[2]); th.root.rotation.y = t.rot ?? -0.35; th.root.scale.setScalar(sc);
    th.root.userData.base = sc; th.root.userData.pop = t.pop !== false;
    root.add(th.root); return th;
  });
  let coinGeo: THREE.InstancedMesh | undefined;
  if (s.coins) {
    coinGeo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 16), new THREE.MeshStandardMaterial({ color: "#f2c230", metalness: 0.8, roughness: 0.3, emissive: "#f2c230", emissiveIntensity: 0.4 }), 60);
    root.add(coinGeo);
  }
  const b: Built = { root, chars, things, bg: set.bg, fog: set.fog, spots: set.spots as Record<string, V3>, coinGeo };
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
  // pose every character
  s.chars.forEach((c, i) => {
    let e: Expr = c.expr ?? "smile";
    for (const [at, ex] of c.exprAt ?? []) if (tl >= at) e = ex;
    const blink = ((f + i * 37) % 97) < 3;
    b.chars[i].set(tl + i * 0.7, c.pose ?? "stand", e, blink);
  });
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
  const subj = s.chars[s.subject ?? 0], sp = subj ? spotOf(b, subj.at) : ([0, 0, 0] as V3);
  const hy = (b.chars[s.subject ?? 0] as Char & { headY?: number } | undefined)?.headY ?? 1.55;   // tall people (height 1.3) carry the head higher
  const rootY = subj?.pose === "sit" ? Math.max(0, sp[1] - 0.55) : sp[1], drop = rootY + (subj?.pose === "sit" ? 0 : hy - 1.55);
  const V = s.cam ? { ...s.cam, blur: 4 } : VIEWS[s.view ?? "ms"] ?? VIEWS.ms;
  const off = (p: V3): V3 => (s.cam ? p : [p[0] + sp[0], p[1] + drop, p[2] + sp[2]]);
  const pos = off(lerp(V.from, V.to, u)), look = off(V.look);
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = s.view === "face" ? 38 : 40; cam.near = 0.1; cam.far = 400; cam.updateProjectionMatrix();
  cam.position.set(...pos); cam.lookAt(...look);
  fx.lens.focus = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
  fx.lens.cInf = V.blur;
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
  </AbsoluteFill>
  );
};
