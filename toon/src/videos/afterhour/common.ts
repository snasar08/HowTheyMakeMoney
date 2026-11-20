// Afterhour look: shared helpers (see SPEC.md). Lead-owned; workers import, never edit.
import * as THREE from "three";

let GRAD: THREE.DataTexture | null = null;
/** 3-step cel-shading ramp shared by every toon material */
export const gradient = () => {
  if (GRAD) return GRAD;
  const d = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  GRAD = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  GRAD.minFilter = THREE.NearestFilter; GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true;
  return GRAD;
};

const MATS = new Map<string, THREE.Material>();
/** cached cel-shaded material; opts.emissive (+ emissiveIntensity) for neon/screens */
export const toonMat = (color: string, opts: { emissive?: string; emissiveIntensity?: number; map?: THREE.Texture; transparent?: boolean } = {}) => {
  const key = `${color}|${opts.emissive ?? ""}|${opts.emissiveIntensity ?? ""}|${opts.map ? opts.map.uuid : ""}|${opts.transparent ? 1 : 0}`;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient(), ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 2 } : {}),
      ...(opts.map ? { map: opts.map } : {}), ...(opts.transparent ? { transparent: true, alphaTest: 0.3 } : {}) });
    MATS.set(key, m);
  }
  return m;
};
/** glowing unlit colour (screens, neon strips); intensity > 1 feeds the bloom */
export const glowMat = (color: string, intensity = 2.2) => {
  const key = `glow|${color}|${intensity}`;
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true }); MATS.set(key, m); }
  return m;
};
/** metal/gold */
export const metalMat = (color: string, rough = 0.35) => {
  const key = `metal|${color}|${rough}`;
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: rough, emissive: color, emissiveIntensity: 0.15 }); MATS.set(key, m); }
  return m;
};

const INK = new THREE.MeshBasicMaterial({ color: "#151018", side: THREE.BackSide });
/** inverted-hull outline: adds a black back-face clone scaled by (1 + width/size) as a child of the mesh */
export const outline = (mesh: THREE.Mesh, width = 0.025) => {
  mesh.geometry.computeBoundingSphere();
  const r = mesh.geometry.boundingSphere?.radius || 1;
  const o = new THREE.Mesh(mesh.geometry, INK);
  o.scale.setScalar(1 + width / r);
  o.castShadow = false; o.receiveShadow = false;
  mesh.add(o);
  return mesh;
};

/** deterministic random in [0, 1) */
export const seeded = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
};

/** a canvas texture drawn once */
export const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
};

/** shorthand: a box mesh with toon material */
export const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
};
