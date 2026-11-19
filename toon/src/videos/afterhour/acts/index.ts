import type { ActDef } from "./types";
import { SPORTS } from "./sports";
import { DAILY } from "./daily";
import { SPORTS2 } from "./sports2";
import { BIZ } from "./biz";
import { CREATOR } from "./creator";
import { FOOD } from "./food";
export type { ActCtx, ActRun, ActDef } from "./types";
export const ACTS: Record<string, ActDef> = { ...SPORTS, ...DAILY, ...SPORTS2, ...BIZ, ...CREATOR, ...FOOD };
