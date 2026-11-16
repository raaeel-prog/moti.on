/**
 * AE-only motion catalog (2026-10-23 motion upgrade, phase F0).
 *
 * Continues the shared MOTION_CATALOG numbering from 36 without touching it, so
 * Premiere keeps its catalog and tokens byte-identical. Durations and easings must
 * equal the literals in packages/ui-tokens/src/after-effects.css (or tokens.css for
 * shared tokens); ae-motion-catalog.test.mjs enforces it.
 *
 * Kinds: `transition` ≤ 360 ms; `spatial` ≤ 480 ms and only with the spring, glide or
 * sheet curves (movement of position or size); longer motion must be feedback/progress.
 */
import type { MotionKind, ReducedMotionBehavior } from "@motion/ui-motion";

export type AeMotionKind = MotionKind | "spatial";
export type CubicBezierTuple = readonly [number, number, number, number];

export interface AeMotionDefinition {
  readonly number: number;
  readonly id: string;
  readonly kind: AeMotionKind;
  readonly properties: readonly string[];
  readonly durationTokens: readonly string[];
  readonly durationMs: readonly number[];
  readonly easingToken: string | null;
  readonly delayToken: string | null;
  readonly reducedMotion: ReducedMotionBehavior;
}

function definition(value: Omit<AeMotionDefinition, "delayToken"> & { delayToken?: string }): AeMotionDefinition {
  return Object.freeze({
    ...value,
    properties: Object.freeze([...value.properties]),
    durationTokens: Object.freeze([...value.durationTokens]),
    durationMs: Object.freeze([...value.durationMs]),
    delayToken: value.delayToken ?? null
  });
}

export const AE_MOTION_CATALOG: readonly AeMotionDefinition[] = Object.freeze([
  definition({ number: 36, id: "spring-move", kind: "spatial", properties: ["transform"], durationTokens: ["--dur-spring"], durationMs: [420], easingToken: "--ease-spring", reducedMotion: "instant" }),
  definition({ number: 37, id: "height-glide", kind: "spatial", properties: ["height", "opacity", "transform"], durationTokens: ["--dur-glide"], durationMs: [450], easingToken: "--ease-glide", reducedMotion: "instant" }),
  definition({ number: 38, id: "sheet-enter", kind: "spatial", properties: ["transform", "opacity"], durationTokens: ["--dur-sheet"], durationMs: [380], easingToken: "--ease-sheet", reducedMotion: "opacity-only" }),
  definition({ number: 39, id: "sheet-exit", kind: "transition", properties: ["transform", "opacity"], durationTokens: ["--dur-sheet-out"], durationMs: [220], easingToken: "--ease-in", reducedMotion: "opacity-only" }),
  definition({ number: 40, id: "sheet-scrim", kind: "transition", properties: ["opacity"], durationTokens: ["--dur-3"], durationMs: [240], easingToken: "--ease-std", reducedMotion: "preserve" }),
  definition({ number: 41, id: "list-stagger", kind: "spatial", properties: ["transform", "opacity"], durationTokens: ["--dur-spring"], durationMs: [420], easingToken: "--ease-glide", delayToken: "--stagger-step", reducedMotion: "instant" }),
  definition({ number: 42, id: "selection-glide", kind: "spatial", properties: ["transform"], durationTokens: ["--dur-spring"], durationMs: [420], easingToken: "--ease-spring", reducedMotion: "instant" }),
  definition({ number: 43, id: "smooth-scroll", kind: "spatial", properties: ["scroll-position"], durationTokens: ["--dur-scroll-max"], durationMs: [420], easingToken: "--ease-glide", reducedMotion: "instant" }),
  definition({ number: 44, id: "text-swap", kind: "transition", properties: ["transform", "opacity"], durationTokens: ["--dur-swap"], durationMs: [320], easingToken: "--ease-spring", reducedMotion: "instant" }),
  definition({ number: 45, id: "focus-ring", kind: "transition", properties: ["outline-offset"], durationTokens: ["--dur-1"], durationMs: [140], easingToken: "--ease-out", reducedMotion: "instant" }),
  definition({ number: 46, id: "stack-shift", kind: "spatial", properties: ["transform"], durationTokens: ["--dur-sheet"], durationMs: [380], easingToken: "--ease-glide", reducedMotion: "instant" })
]);

/** Bézier control points of every easing token the AE motion layer uses (CSS ≡ JS). */
export const AE_EASINGS: Readonly<Record<string, CubicBezierTuple>> = Object.freeze({
  "--ease-spring": [0.34, 1.56, 0.64, 1],
  "--ease-glide": [0.2, 0.8, 0.2, 1],
  "--ease-sheet": [0.32, 1.12, 0.5, 1],
  "--ease-out": [0.25, 1, 0.5, 1],
  "--ease-std": [0.25, 1, 0.5, 1],
  "--ease-in": [0.5, 0, 0.75, 0],
  "--ease-pop": [0.34, 1.36, 0.64, 1]
});

export function aeMotion(id: string): AeMotionDefinition {
  const found = AE_MOTION_CATALOG.find(motion => motion.id === id);
  if (!found) throw new Error(`Unknown AE motion "${id}".`);
  return found;
}

export function aeMotionMs(id: string, index = 0): number {
  return aeMotion(id).durationMs[index] ?? aeMotion(id).durationMs[0]!;
}

export function aeMotionCurve(id: string): CubicBezierTuple {
  const token = aeMotion(id).easingToken;
  return (token && AE_EASINGS[token]) || AE_EASINGS["--ease-out"]!;
}
