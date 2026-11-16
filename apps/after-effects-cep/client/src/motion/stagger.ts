import { aeMotion } from "./catalog.js";
import type { MotionEnv } from "./env.js";

/**
 * Index-based entry cascade, generalised from quick-actions.ts `playEntry`.
 * The container needs `data-motion~="list-stagger"`; items need `data-cascade="true"`.
 * The attribute is released afterwards so showing the list again (display:none → block)
 * does not replay the cascade. Never call it per keystroke.
 */
export interface StaggerOptions {
  /** Only the first items cascade; the rest arrive with the last step. */
  cap?: number;
}

export function playStagger(env: MotionEnv, container: HTMLElement, items: readonly HTMLElement[], options: StaggerOptions = {}): () => void {
  const cap = options.cap ?? 12;
  container.setAttribute("data-stagger", "false");
  if (env.reduced() || !items.length) return () => { /* Nothing playing. */ };
  container.getBoundingClientRect?.();
  items.forEach((item, index) => {
    item.setAttribute("data-cascade", "true");
    item.style?.setProperty?.("--motion-index", String(Math.min(index, cap)));
  });
  container.setAttribute("data-stagger", "true");
  const motion = aeMotion("list-stagger");
  const step = 22;
  const total = motion.durationMs[0]! + Math.min(items.length, cap) * step + 40;
  const timer = env.timeout(() => container.setAttribute("data-stagger", "false"), total);
  return () => { env.clearTimeout(timer); container.setAttribute("data-stagger", "false"); };
}
