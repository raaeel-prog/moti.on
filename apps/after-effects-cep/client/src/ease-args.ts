import {
  DEFAULT_BACK_OVERSHOOT, DEFAULT_BOUNCE, DEFAULT_ELASTIC, backCurve,
  type CurvePoint, type EasingDirection, type EasingMode, type EasingParams, type OscillationParams
} from "@motion/keyframe-core";
import type { EaseCurve } from "./ease-library.js";

/** Panel draft of the smoothing tool. Only `easeCommandArgs` knows which parts the host accepts. */
export interface EaseDraft {
  mode: EasingMode;
  direction: EasingDirection;
  view: "value" | "speed";
  x1: number; y1: number; x2: number; y2: number;
  points: CurvePoint[];
  back: { overshoot: number };
  elastic: EasingParams;
  bounce: EasingParams;
  applyIn: boolean;
  applyOut: boolean;
  live: boolean;
}

export const DEFAULT_EASE: EaseDraft = {
  mode: "bezier", direction: "out", view: "value",
  x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0,
  points: [],
  back: { overshoot: DEFAULT_BACK_OVERSHOOT },
  elastic: { in: { ...DEFAULT_ELASTIC }, out: { ...DEFAULT_ELASTIC }, inCurve: null, outCurve: null },
  bounce: { in: { ...DEFAULT_BOUNCE }, out: { ...DEFAULT_BOUNCE }, inCurve: null, outCurve: null },
  applyIn: true, applyOut: true, live: false
};

const round = (value: number): number => Math.round(value * 10000) / 10000;
const curveOf = (c: EaseCurve): EaseCurve => ({ x1: round(c.x1), y1: round(c.y1), x2: round(c.x2), y2: round(c.y2) });
const oscillation = (p: OscillationParams): OscillationParams => ({ amp: round(p.amp), freq: round(p.freq), decay: round(p.decay), start: round(p.start) });

/** Deep copy so nested defaults are never shared between resets. */
export function cloneEaseDraft(draft: EaseDraft): EaseDraft {
  return {
    ...draft,
    points: draft.points.map(p => ({ ...p })),
    back: { ...draft.back },
    elastic: { in: { ...draft.elastic.in }, out: { ...draft.elastic.out }, inCurve: draft.elastic.inCurve ? { ...draft.elastic.inCurve } : null, outCurve: draft.elastic.outCurve ? { ...draft.elastic.outCurve } : null },
    bounce: { in: { ...draft.bounce.in }, out: { ...draft.bounce.out }, inCurve: draft.bounce.inCurve ? { ...draft.bounce.inCurve } : null, outCurve: draft.bounce.outCurve ? { ...draft.bounce.outCurve } : null }
  };
}

/** The bezier the host receives in bezier/back mode (back is derived, never baked). */
export function easeEffectiveCurve(draft: EaseDraft): EaseCurve {
  if (draft.mode === "back") return backCurve(draft.back.overshoot, draft.direction);
  return { x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2 };
}

/** Does the draft need a segment of two neighbouring selected keys (points or bake)? */
export function easeNeedsPair(draft: EaseDraft): boolean {
  return draft.mode === "elastic" || draft.mode === "bounce" || (draft.mode === "bezier" && draft.points.length > 0);
}

/** Builds exactly the arguments `ae.keys.ease.apply` allows for the current mode. */
export function easeCommandArgs(draft: EaseDraft): Record<string, unknown> {
  const base = { ...curveOf(easeEffectiveCurve(draft)), applyIn: draft.applyIn, applyOut: draft.applyOut };
  if (draft.mode === "bezier" && draft.points.length > 0) {
    return { ...base, points: draft.points.map(p => ({ x: round(p.x), y: round(p.y), inX: round(p.inX), inY: round(p.inY), outX: round(p.outX), outY: round(p.outY) })) };
  }
  if (draft.mode === "elastic" || draft.mode === "bounce") {
    const params = draft[draft.mode];
    const bake: Record<string, unknown> = { mode: draft.mode, direction: draft.direction, in: oscillation(params.in), out: oscillation(params.out) };
    if (draft.direction === "inOut" && params.inCurve) bake.inCurve = curveOf(params.inCurve);
    if (draft.direction === "inOut" && params.outCurve) bake.outCurve = curveOf(params.outCurve);
    return { ...curveOf(DEFAULT_EASE), applyIn: draft.applyIn, applyOut: draft.applyOut, bake };
  }
  return base;
}
