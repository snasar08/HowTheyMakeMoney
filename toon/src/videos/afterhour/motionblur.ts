// Directional motion blur for camera moves (refgap round 3, Nov 26): the bible's "whip pans with motion blur" and the ease-out
// bursts that carry one view into the next. `dir` = the blur streak (uv units, total length centred on the pixel); (0,0) = off.
import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import { Uniform, Vector2 } from "three";

const frag = /* glsl */ `
uniform vec2 dir;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 21; i++) {
    float t = float(i) / 20.0 - 0.5;
    float w = 1.0 - abs(t) * 0.8;
    acc += texture2D(inputBuffer, uv + dir * t).rgb * w; ws += w;
  }
  outputColor = vec4(acc / ws, inputColor.a);
}`;

export class MotionBlurEffect extends Effect {
  constructor() {
    super("MotionBlurEffect", frag, { blendFunction: BlendFunction.NORMAL, attributes: EffectAttribute.CONVOLUTION, uniforms: new Map<string, Uniform>([["dir", new Uniform(new Vector2(0, 0))]]) });
  }
  set(x: number, y: number) { (this.uniforms.get("dir")!.value as Vector2).set(x, y); }
}
