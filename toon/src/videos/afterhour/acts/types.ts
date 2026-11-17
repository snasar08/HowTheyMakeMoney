// Afterhour acts (see SPEC.md "Acts"): tiny scripted scenes around the hero.
import * as THREE from "three";
import type { Char, Pose, Expr } from "../char";
import type { SetName } from "../sets";

export type ActCtx = { root: THREE.Group; hero: Char; heroAt: [number, number, number]; set: SetName;
  spots: Record<string, [number, number, number]>; seed: number };
/** a pose with its own clock: lets an act hold a pose's last frame or start it mid-way (t defaults to the shot time) */
export type ActPose = { pose: Pose; t?: number; expr?: Expr };
/** t = seconds into the shot; may override the hero pose per frame. Ah calls tick twice per frame (once before the hero is
 *  posed to get the pose, once after so hand positions are current): it must be a pure function of t. */
export type ActRun = { tick(t: number): Pose | ActPose | void };
export type ActDef = { pose: Pose; view?: string; build(ctx: ActCtx): ActRun;
  /** library models (models.ts names) the act's build() uses via makeThing / makeModelGroup: Ah preloads them with the shot's other models */ models?: string[];
  /** true when the act puts its own helmet / hat on the hero: Ah hides the look's hat / hair for the shot (Char.showHat(false)) */ hideHat?: boolean };
