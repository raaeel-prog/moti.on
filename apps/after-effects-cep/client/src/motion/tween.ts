import { bezierValueAt } from "@motion/keyframe-core";
import type { CubicBezierTuple } from "./catalog.js";
import type { MotionEnv } from "./env.js";

export interface TweenOptions {
  from: number;
  to: number;
  durationMs: number;
  /** Same control points as the CSS token, so JS and CSS motion share one curve. */
  curve: CubicBezierTuple;
  onUpdate(value: number): void;
  onDone?(): void;
}
export interface TweenHandle {
  cancel(): void;
  readonly running: boolean;
}

const FINISHED: TweenHandle = Object.freeze({ cancel() { /* Nothing scheduled. */ }, running: false });

/** Eased 0→1 progress for a cubic-bezier, overshoot included (spring curves exceed 1). */
export function easeAt(curve: CubicBezierTuple, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return bezierValueAt({ x1: curve[0], y1: curve[1], x2: curve[2], y2: curve[3] }, progress);
}

/**
 * Animates a number with a cubic-bezier. Reduced motion, a zero duration or missing
 * frames apply the final value at once.
 */
export function tween(env: MotionEnv, options: TweenOptions): TweenHandle {
  const finish = (): TweenHandle => { options.onUpdate(options.to); options.onDone?.(); return FINISHED; };
  if (env.reduced() || options.durationMs <= 0 || options.from === options.to) return finish();
  let start: number | null = null;
  let running = true;
  let handle: number | null = null;
  const step = (now: number): void => {
    if (!running) return;
    if (start === null) start = now;
    const progress = Math.min(1, (now - start) / options.durationMs);
    options.onUpdate(options.from + (options.to - options.from) * easeAt(options.curve, progress));
    if (progress < 1) { handle = env.frame(step); return; }
    running = false;
    options.onDone?.();
  };
  handle = env.frame(step);
  if (handle === null) { running = false; return finish(); }
  return {
    cancel() { running = false; if (handle !== null) env.cancelFrame(handle); },
    get running() { return running; }
  };
}
