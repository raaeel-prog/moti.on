import type { MotionEnv } from "./env.js";

/**
 * Physical spring for JS-driven positions (camera puck, splitter release, sheet drag).
 * CSS springs are single-overshoot cubic-béziers; this keeps velocity when the target
 * moves mid-flight, which a CSS transition cannot.
 */
export interface SpringConfig { stiffness: number; damping: number; mass?: number }
export const SPRING_SNAPPY: SpringConfig = Object.freeze({ stiffness: 380, damping: 26 });
export const SPRING_GENTLE: SpringConfig = Object.freeze({ stiffness: 170, damping: 22 });

/** Matches --dur-spring-max: a spring never runs longer than this before snapping. */
export const SPRING_MAX_MS = 480;
const SUBSTEP = 1 / 120;
/** Large frame gaps (tab in background) are not replayed as physics. */
const MAX_FRAME_SECONDS = 0.064;

export interface SpringOptions extends Partial<SpringConfig> {
  value: number;
  onUpdate(value: number): void;
  onRest?(value: number): void;
  /** Distance and speed below which the spring settles exactly on the target. */
  precision?: number;
}
export interface SpringHandle {
  set(target: number): void;
  jump(value: number): void;
  stop(): void;
  readonly value: number;
  readonly velocity: number;
  readonly target: number;
}

export function createSpring(env: MotionEnv, options: SpringOptions): SpringHandle {
  const stiffness = options.stiffness ?? SPRING_SNAPPY.stiffness;
  const damping = options.damping ?? SPRING_SNAPPY.damping;
  const mass = options.mass ?? 1;
  const precision = options.precision ?? 0.01;
  let value = options.value;
  let velocity = 0;
  let target = options.value;
  let handle: number | null = null;
  let last: number | null = null;
  let startedAt: number | null = null;

  function settle(): void {
    if (handle !== null) env.cancelFrame(handle);
    handle = null; last = null; startedAt = null;
    value = target; velocity = 0;
    options.onUpdate(value);
    options.onRest?.(value);
  }
  function step(now: number): void {
    handle = null;
    if (last === null || startedAt === null) { last = now; startedAt = now; }
    let remaining = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    while (remaining > 0) {
      const dt = Math.min(SUBSTEP, remaining);
      const force = -stiffness * (value - target) - damping * velocity;
      velocity += (force / mass) * dt;
      value += velocity * dt;
      remaining -= dt;
    }
    const resting = Math.abs(value - target) < precision && Math.abs(velocity) < precision * 10;
    if (resting || now - startedAt >= SPRING_MAX_MS) { settle(); return; }
    options.onUpdate(value);
    handle = env.frame(step);
    if (handle === null) settle();
  }

  return {
    set(next) {
      target = next;
      if (env.reduced()) { settle(); return; }
      if (handle === null) {
        startedAt = null;
        handle = env.frame(step);
        if (handle === null) settle();
      } else {
        // Retargeting keeps the velocity; the time budget restarts for the new goal.
        startedAt = last;
      }
    },
    jump(next) { target = next; settle(); },
    stop() { if (handle !== null) env.cancelFrame(handle); handle = null; last = null; startedAt = null; velocity = 0; },
    get value() { return value; },
    get velocity() { return velocity; },
    get target() { return target; }
  };
}
