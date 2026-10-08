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

/** One segment the host worked on, with the keyframes it generated inside it. */
export interface EaseSessionSegment {
  propertyId: string;
  layerIndex: number;
  t0: number;
  t1: number;
  generated: { time: number; value: number | number[] }[];
}

/**
 * What the host returns after an apply and what it receives back on the next
 * one, so generated keyframes are replaced instead of multiplied. Valid only
 * while the selection signature matches.
 */
export interface EaseSession { signature: string; segments: EaseSessionSegment[] }

export function validEaseSession(value: unknown): value is EaseSession {
  if (!value || typeof value !== "object") return false;
  const s = value as EaseSession;
  if (typeof s.signature !== "string" || !Array.isArray(s.segments) || s.segments.length > 200) return false;
  return s.segments.every(seg => seg && typeof seg === "object" && typeof seg.propertyId === "string"
    && Number.isFinite(seg.layerIndex) && Number.isFinite(seg.t0) && Number.isFinite(seg.t1) && seg.t1 > seg.t0
    && Array.isArray(seg.generated) && seg.generated.every(g => g && Number.isFinite(g.time)
      && (typeof g.value === "number" ? Number.isFinite(g.value) : Array.isArray(g.value) && g.value.length <= 4 && g.value.every(Number.isFinite))));
}

export interface EaseCommandExtras { expectedSelection?: string | null; session?: EaseSession | null }

/** Builds exactly the arguments `ae.keys.ease.apply` allows for the current mode. */
export function easeCommandArgs(draft: EaseDraft, extras: EaseCommandExtras = {}): Record<string, unknown> {
  const args = modeArgs(draft);
  if (typeof extras.expectedSelection === "string") args.expectedSelection = extras.expectedSelection;
  if (extras.session && validEaseSession(extras.session)) args.session = { signature: extras.session.signature, segments: extras.session.segments.map(seg => ({ ...seg, generated: seg.generated.map(g => ({ time: g.time, value: Array.isArray(g.value) ? [...g.value] : g.value })) })) };
  return args;
}

function modeArgs(draft: EaseDraft): Record<string, unknown> {
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
