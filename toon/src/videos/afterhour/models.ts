// Afterhour look: CC0 model library (toon/public/models, see CREDITS.md + index.json). Every GLB is restyled on load:
// all materials become toonMat(original colour) (3-step cel shading), inverted-hull outlines, shadows, normalised size.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { toonMat } from "./common";
import INDEX_JSON from "../../../public/models/index.json";

export type ModelEntry = { file: string; pack: string; tags?: string[] };
export const MODEL_INDEX = INDEX_JSON as unknown as Record<string, ModelEntry>;
export const hasModel = (name: string) => Object.prototype.hasOwnProperty.call(MODEL_INDEX, name);

const OUTLINE = 0.026;       // metres, in the normalised size
const TARGET = 1;            // longest side after normalising; Thing.size = this (so `fit` = longest side in metres)
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const TEMPLATES = new Map<string, THREE.Group>();
const LOADING = new Map<string, Promise<void>>();

/** bolder copy of a palette texture: more saturation, more contrast, darker darks (matches the hand-built props) */
const BOOST = new Map<THREE.Texture, THREE.Texture>();
const boosted = (t: THREE.Texture): THREE.Texture => {
  const hit = BOOST.get(t); if (hit) return hit;
  let out = t;
  try {
    const im = t.image as CanvasImageSource & { width: number; height: number };
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i] / 255, gg = a[i + 1] / 255, b = a[i + 2] / 255, l = 0.3 * r + 0.59 * gg + 0.11 * b;
      const k = (v: number) => { let x = l + (v - l) * 1.5; x = (x - 0.5) * 1.2 + 0.46; return Math.max(0, Math.min(1, x < 0.3 ? x * x / 0.3 : x)) * 255; };   // saturate, contrast, pull darks down
      a[i] = k(r); a[i + 1] = k(gg); a[i + 2] = k(b);
    }
    g.putImageData(d, 0, 0);
    out = new THREE.CanvasTexture(c); out.flipY = t.flipY; out.colorSpace = t.colorSpace; out.wrapS = t.wrapS; out.wrapT = t.wrapT;
    out.magFilter = THREE.NearestFilter; out.minFilter = THREE.NearestFilter; out.generateMipmaps = false; out.needsUpdate = true;
  } catch { out = t; }
  BOOST.set(t, out); return out;
};

/** brighten a touch and push saturation so it matches the hand-built props */
const punch = (c: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.45 + 0.05), Math.min(0.85, Math.max(0.06, (hsl.l - 0.5) * 1.15 + 0.46)), THREE.SRGBColorSpace);
  return "#" + c.getHexString(THREE.SRGBColorSpace);
};
const colourOf = (m: THREE.Material, g: THREE.BufferGeometry): string => {
  const sm = m as THREE.MeshStandardMaterial;
  const c = new THREE.Color(sm.color ?? "#cccccc");
  const vc = g.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (vc && !sm.map) { let r = 0, gg = 0, b = 0; const n = vc.count; for (let i = 0; i < n; i++) { r += vc.getX(i); gg += vc.getY(i); b += vc.getZ(i); } c.multiply(new THREE.Color(r / n, gg / n, b / n)); }
  return punch(c);
};

/** bake node transforms, restyle, outline, normalise (longest side = TARGET, centred on x/z, base at y = 0) */
const restyle = (scene: THREE.Group): THREE.Group => {
  scene.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; ctr: THREE.Vector3; cols: string[] }[] = [];
  const all = new THREE.Box3();
  scene.traverse((o) => {
    const me = o as THREE.Mesh; if (!me.isMesh || (me as THREE.SkinnedMesh).isSkinnedMesh) return;
    const src = me.geometry as THREE.BufferGeometry;
    const geo = src.clone(); geo.applyMatrix4(me.matrixWorld);
    const mats = Array.isArray(me.material) ? me.material : [me.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.getAttribute("position").count, materialIndex: 0 }];
    // colours are sampled from the (already transformed) geometry: uv is untouched by the matrix
    const cols = groups.map((gr) => colourOf(mats[gr.materialIndex ?? 0] ?? mats[0], geo));
    geo.computeBoundingBox(); all.union(geo.boundingBox!);
    const ctr = geo.boundingBox!.getCenter(new THREE.Vector3()); geo.translate(-ctr.x, -ctr.y, -ctr.z);
    const keep = (m: THREE.Material) => ((m as THREE.MeshStandardMaterial).map ? true : false);
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && !(k === "uv" && mats.some(keep))) geo.deleteAttribute(k);
    parts.push({ geo, mat: Array.isArray(me.material) ? mats : mats[0], ctr, cols });
  });
  const size = all.getSize(new THREE.Vector3()), mid = all.getCenter(new THREE.Vector3());
  const k = TARGET / Math.max(0.0001, size.x, size.y, size.z);
  const out = new THREE.Group(), inner = new THREE.Group(); out.add(inner);
  for (const p of parts) {
    const multi = Array.isArray(p.mat);
    // palette-atlas models keep their texture (nearest, so swatches stay crisp) under the 3-step cel ramp; plain materials get their colour
    const one = (m: THREE.Material, c: string) => { const t0 = (m as THREE.MeshStandardMaterial).map; if (!t0) return toonMat(c); return toonMat("#ffffff", { map: boosted(t0) }); };
    const mat = multi ? (p.mat as THREE.Material[]).map((m, i) => one(m, p.cols[i] ?? p.cols[0])) : one(p.mat as THREE.Material, p.cols[0]);
    const me = new THREE.Mesh(p.geo, mat);
    me.position.set(p.ctr.x - mid.x, p.ctr.y - all.min.y, p.ctr.z - mid.z);
    me.castShadow = true; me.receiveShadow = true;
    p.geo.computeBoundingSphere();
    const r = p.geo.boundingSphere?.radius || 1;
    const o = new THREE.Mesh(p.geo, INK); o.scale.setScalar(1 + OUTLINE / k / r); o.castShadow = false; o.receiveShadow = false;   // OUTLINE in final metres
    me.add(o); inner.add(me);
  }
  inner.scale.setScalar(k);
  return out;
};

/** start loading these models (idempotent); resolves when every one is ready */
export const loadModels = (names: string[]): Promise<void> => {
  const loader = new GLTFLoader();
  return Promise.all(names.filter(hasModel).map((n) => {
    let p = LOADING.get(n);
    if (!p) {
      p = loader.loadAsync(staticFile(`models/${MODEL_INDEX[n].file}`)).then((gltf) => { TEMPLATES.set(n, restyle(gltf.scene)); })
        .catch((e) => { console.warn("model failed", n, String(e)); });
      LOADING.set(n, p);
    }
    return p;
  })).then(() => undefined);
};

/** a loaded model as a Thing-shaped group (size = longest side in metres at scale 1) */
export const makeModelGroup = (name: string): THREE.Group | null => {
  const t = TEMPLATES.get(name); if (!t) return null;
  return t.clone();
};
export const MODEL_SIZE = TARGET;
