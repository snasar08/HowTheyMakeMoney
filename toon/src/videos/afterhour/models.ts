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

const OUTLINE = 0.012;       // metres, in the normalised size
const TARGET = 1;            // longest side after normalising; Thing.size = this (so `fit` = longest side in metres)
const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
const TEMPLATES = new Map<string, THREE.Group>();
const LOADING = new Map<string, Promise<void>>();

// ---- colour from textures: average over the mesh's UV box (palette atlases give the swatch colour) ----
const IMG = new Map<THREE.Texture, ImageData | null>();
const imageData = (t: THREE.Texture): ImageData | null => {
  if (IMG.has(t)) return IMG.get(t)!;
  let d: ImageData | null = null;
  try {
    const im = t.image as CanvasImageSource & { width: number; height: number };
    const w = Math.min(256, im.width), h = Math.min(256, im.height);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(im, 0, 0, w, h); d = g.getImageData(0, 0, w, h);
  } catch { d = null; }
  IMG.set(t, d); return d;
};
const sampleUV = (t: THREE.Texture, uv: THREE.BufferAttribute | undefined, index: THREE.BufferAttribute | null, from: number, count: number): THREE.Color | null => {
  const d = imageData(t); if (!d || !uv) return null;
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let i = from; i < from + count; i++) {
    const k = index ? index.getX(i) : i; const u = uv.getX(k), v = uv.getY(k);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  if (u0 > u1) return null;
  const wrap = (x: number) => x - Math.floor(x);
  let r = 0, gg = 0, b = 0, n = 0;
  const N = 6;
  for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) {
    const u = wrap(u0 + ((u1 - u0) * (a + 0.5)) / N), v = wrap(v0 + ((v1 - v0) * (c + 0.5)) / N);
    const px = Math.min(d.width - 1, Math.floor(u * d.width)), py = Math.min(d.height - 1, Math.floor((t.flipY ? 1 - v : v) * d.height));
    const o = (py * d.width + px) * 4; if (d.data[o + 3] < 20) continue;
    r += d.data[o]; gg += d.data[o + 1]; b += d.data[o + 2]; n++;
  }
  return n ? new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace) : null;
};

/** brighten a touch and push saturation so it matches the hand-built props */
const punch = (c: THREE.Color) => {
  const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), Math.min(0.9, Math.max(0.1, hsl.l * 1.05 + 0.02)), THREE.SRGBColorSpace);
  return "#" + c.getHexString(THREE.SRGBColorSpace);
};
const colourOf = (m: THREE.Material, g: THREE.BufferGeometry, from: number, count: number): string => {
  const sm = m as THREE.MeshStandardMaterial;
  const c = new THREE.Color(sm.color ?? "#cccccc");
  if (sm.map) {
    const s = sampleUV(sm.map, g.getAttribute("uv") as THREE.BufferAttribute, g.index, from, count);
    if (s) c.copy(s).multiply(sm.color ?? new THREE.Color(1, 1, 1));
  }
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
    const cols = groups.map((gr) => colourOf(mats[gr.materialIndex ?? 0] ?? mats[0], geo, gr.start, gr.count));
    geo.computeBoundingBox(); all.union(geo.boundingBox!);
    const ctr = geo.boundingBox!.getCenter(new THREE.Vector3()); geo.translate(-ctr.x, -ctr.y, -ctr.z);
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
    parts.push({ geo, mat: Array.isArray(me.material) ? mats : mats[0], ctr, cols });
  });
  const size = all.getSize(new THREE.Vector3()), mid = all.getCenter(new THREE.Vector3());
  const k = TARGET / Math.max(0.0001, size.x, size.y, size.z);
  const out = new THREE.Group(), inner = new THREE.Group(); out.add(inner);
  for (const p of parts) {
    const multi = Array.isArray(p.mat);
    const mat = multi ? p.cols.map((c) => toonMat(c)) : toonMat(p.cols[0]);
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
