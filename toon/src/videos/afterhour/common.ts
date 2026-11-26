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

/** textured variant of toonMat for SETS and props (refgap round 7): a clean, low-contrast pattern that suits the material, picked from the colour and the
 *  surface direction (world space, so it sticks to the object): wood (brown) = planks + grain; light or red floors = tile grout + a little wear;
 *  strong reds / purples (seats, rugs, banners) = fabric weave; brick-red walls = brick courses; everything else = a soft painted-wall gradient with fine
 *  banding (and a faint speckle on dark ground). Kid-simple: +-5 % contrast, no blotches. Characters keep plain toonMat. */
const PAINT = new Map<THREE.Material, THREE.Material>();
export const paintMat = (color: string, opts: Parameters<typeof toonMat>[1] = {}) => {
  const base = toonMat(color, opts);
  if (opts.map || opts.emissive) return base;
  let m = PAINT.get(base);
  if (!m) {
    const hsl = { h: 0, s: 0, l: 0 }; new THREE.Color(color).getHSL(hsl);
    const wood = hsl.h > 0.04 && hsl.h < 0.13 && hsl.s > 0.3 && hsl.l < 0.7 ? 1 : 0;
    const brick = !wood && (hsl.h < 0.04 || hsl.h > 0.96) && hsl.s > 0.3 && hsl.l < 0.42 ? 1 : 0;
    const fabric = !wood && !brick && hsl.s > 0.5 && hsl.l > 0.25 && hsl.l < 0.62 ? 1 : 0;
    const light = hsl.l > 0.5 ? 1 : 0;
    m = base.clone() as THREE.MeshToonMaterial;
    m.onBeforeCompile = (sh) => {
      sh.defines = { ...(sh.defines || {}), P_WOOD: wood, P_BRICK: brick, P_FABRIC: fabric, P_LIGHT: light };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec3 vWN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP; varying vec3 vWN;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn2(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float seam(float t, float w) { float f = abs(fract(t) - 0.5) * 2.0; return smoothstep(1.0 - w, 1.0, f); }   // 1 on the line between two cells`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{ vec3 p = vWP, n = normalize(vWN); bool up = abs(n.y) > 0.6; float k = 1.0;
#if P_WOOD
  vec2 u = up ? p.xz : vec2(p.x + p.z, p.y);                          // planks run along x on tops, along the wall on sides
  float board = floor(u.y * 5.0);
  k = 1.0 - 0.14 * seam(u.y * 5.0, 0.05) - 0.05 * seam(u.x * 0.8 + h21(vec2(board, 1.0)) * 4.0, 0.015)
      + (vn2(vec2(u.x * 3.0 + board * 7.0, u.y * 90.0)) - 0.5) * 0.10 + (h21(vec2(board, 3.0)) - 0.5) * 0.07;
#elif P_BRICK
  vec2 u = up ? p.xz : vec2(p.x + p.z, p.y); float row = floor(u.y * 6.0);
  float bx = u.x * 3.0 + mod(row, 2.0) * 0.5;
  k = 1.0 - 0.16 * max(seam(u.y * 6.0, 0.06), seam(bx, 0.04)) + (h21(vec2(floor(bx), row)) - 0.5) * 0.09;
#elif P_FABRIC
  vec2 u = up ? p.xz : vec2(p.x + p.z, p.y);
  k = 1.0 + 0.045 * (sin(u.x * 150.0) * sin(u.y * 150.0));
#else
  if (up && P_LIGHT == 1) { vec2 u = p.xz * 2.0; k = 1.0 - 0.12 * max(seam(u.x, 0.04), seam(u.y, 0.04)) + (h21(floor(u)) - 0.5) * 0.06 + (vn2(p.xz * 14.0) - 0.5) * 0.03; }
  else if (up) { k = 1.0 + (vn2(p.xz * 40.0) - 0.5) * 0.07; }
  else { k = 1.0 + 0.06 * (smoothstep(0.0, 4.5, p.y) - 0.5) + 0.018 * sin(p.y * 9.0) + (vn2(vec2(p.x + p.z, p.y) * 60.0) - 0.5) * 0.03; }
#endif
  diffuseColor.rgb *= k; }`);
    };
    m.customProgramCacheKey = () => "paint2-" + wood + brick + fabric + light;
    PAINT.set(base, m);
  }
  return m;
};
