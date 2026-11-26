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

/** painterly variant of toonMat for SETS and props (refgap round 6): world-space value noise (blotches + fine speckle + a slight hue wobble)
 *  multiplies the flat colour, so walls, floors and tables read as hand-painted, not as one flat swatch. World-space = it sticks to the object
 *  when the camera moves. Characters keep plain toonMat (their paint must not swim). */
const PAINT = new Map<THREE.Material, THREE.Material>();
export const paintMat = (color: string, opts: Parameters<typeof toonMat>[1] = {}) => {
  const base = toonMat(color, opts);
  if (opts.map || opts.emissive) return base;
  let m = PAINT.get(base);
  if (!m) {
    m = base.clone() as THREE.MeshToonMaterial;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP;
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{ vec3 p = vWP; float v = 0.5 * vn(p * 2.2) + 0.3 * vn(p * 7.5) + 0.2 * vn(vec3(p.x * 26.0, p.y * 4.0, p.z * 26.0));
  diffuseColor.rgb *= 1.0 + (v - 0.5) * 0.32;
  diffuseColor.rgb += (vn(p * 3.7 + 7.0) - 0.5) * vec3(0.06, 0.0, -0.06); }`);
    };
    m.customProgramCacheKey = () => "paint";
    PAINT.set(base, m);
  }
  return m;
};
