// Afterhour colour grade (refgap round 1, Nov 26): moves the picture toward the reference style bible
// (lum mean .43-.54, deep darks p2 .03-.11 that are violet not black, warm key light, blue/purple shadows, a soft warm light pool).
// Runs after tone mapping, before the vignette, in display (gamma) space. `phase` 0..1 = how far into the Short we are:
// the story starts in warm noon light and cools toward a blue evening for the explanation (the bible's "lighting changes with story beats").
import { Effect, BlendFunction } from "postprocessing";
import { Uniform } from "three";

const frag = /* glsl */ `
uniform float phase;
uniform float sat;
uniform float gammaMid;
uniform vec3 lift;
uniform float contrast;
uniform float beat;   // shot index: moves the light pool around so scenes differ
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(max(inputColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(y), c, sat);                                   // pull the primaries back toward the bible's 0.38-0.65 saturation
  c = pow(c, vec3(gammaMid));                                 // brighter mids, highlights stay put
  c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);            // S-curve: crisp, deep darks and clean highlights (kills the milky haze)
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.5, y);
  c += lift * sh * sh * (1.0 + 0.8 * phase);                  // blacks become violet-blue, more so toward the evening
  c *= mix(vec3(1.0), vec3(0.90, 0.95, 1.10), sh * (0.45 + 0.4 * phase));   // cool shadows
  float hw = smoothstep(0.35, 1.0, y);
  c *= mix(vec3(1.0), vec3(1.02, 1.0, 0.96), hw * (1.0 - 0.7 * phase));      // warm key on the lit areas
  c *= mix(vec3(1.0), vec3(0.95, 0.98, 1.06), phase * 0.5);   // night-blue creeping in for the explanation
  vec2 q = (uv - vec2(0.50 + 0.28 * sin(beat * 2.1), 0.60 + 0.12 * cos(beat * 1.3))) * vec2(1.0, 0.7);        // a soft pool of warm light, upper middle
  float pool = 1.0 - smoothstep(0.0, 0.62, length(q));
  float gold = smoothstep(0.82, 1.0, phase);                  // payoff: warm gold wash
  c += vec3(0.09, 0.06, 0.02) * pool * pool * (1.0 - 0.6 * phase + 0.9 * gold);
  c *= mix(vec3(1.0), vec3(1.07, 1.0, 0.86), gold * 0.8);
  c *= 1.0 - 0.18 * smoothstep(0.55, 1.0, length((uv - vec2(0.5, 0.5)) * vec2(1.0, 0.7)));   // light falls off to the dark edge
  outputColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(2.2)), inputColor.a);
}`;

export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", frag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([["phase", new Uniform(0)], ["sat", new Uniform(0.98)], ["gammaMid", new Uniform(0.78)], ["lift", new Uniform([0.02, 0.015, 0.06])], ["contrast", new Uniform(1.04)], ["beat", new Uniform(0)]]),
    });
  }
  set beat(v: number) { this.uniforms.get("beat")!.value = v; }
  set phase(v: number) { this.uniforms.get("phase")!.value = v; }
}
