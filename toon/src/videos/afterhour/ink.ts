// Ink lines on the 3D world (refgap round 4, Nov 26): the reference draws thin black outlines on silhouettes, depth jumps and creases of the
// environment; ours only had inverted-hull lines on characters and a few props. This is a depth-buffer edge pass that runs BEFORE the lens blur,
// so the lines are crisp in the focus plane and soften with the background like the reference. Width stays ~constant on screen (px at 1080x1920).
//  - silhouette / depth jump: a pixel that is clearly nearer than a neighbour gets the line (the line sits inside the nearer object)
//  - crease / contact: second difference of 1/z (zero on a flat plane, non-zero on a box corner or where an object meets the floor)
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Uniform } from "three";

const frag = /* glsl */ `
uniform float width;      // line width, px at 1080x1920
uniform float strength;
float zAt(vec2 uv) { return -getViewZ(readDepth(uv)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  if (strength < 0.01) { outputColor = inputColor; return; }
  float s = resolution.y / 1920.0;
  vec2 o = texelSize * max(width * s * 0.5, 0.75);
  float z0 = -getViewZ(depth);
  float zl = zAt(uv - vec2(o.x, 0.0)), zr = zAt(uv + vec2(o.x, 0.0)), zu = zAt(uv + vec2(0.0, o.y)), zd = zAt(uv - vec2(0.0, o.y));
  float far = max(max(zl, zr), max(zu, zd));
  float jump = smoothstep(0.008, 0.025, (far - z0) / z0);                 // a neighbour is >5-10 % farther: this pixel is the nearer edge
  float i0 = 1.0 / z0, il = 1.0 / zl, ir = 1.0 / zr, iu = 1.0 / zu, id = 1.0 / zd;
  float cr = max(abs(il + ir - 2.0 * i0), abs(iu + id - 2.0 * i0)) / i0;   // curvature of the depth surface
  float crease = smoothstep(0.002, 0.007, cr) * (1.0 - jump);
  float a = clamp(max(jump, crease * 0.85), 0.0, 1.0) * strength;
  outputColor = vec4(mix(inputColor.rgb, vec3(0.006, 0.003, 0.008), a * 0.92), inputColor.a);
}`;

export class InkEffect extends Effect {
  constructor({ width = 9, strength = 1 } = {}) {
    super("InkEffect", frag, { blendFunction: BlendFunction.NORMAL, attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([["width", new Uniform(width)], ["strength", new Uniform(strength)]]) });
  }
}
