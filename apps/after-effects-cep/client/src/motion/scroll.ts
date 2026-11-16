import { aeMotionCurve, aeMotionMs } from "./catalog.js";
import type { MotionEnv } from "./env.js";
import { tween, type TweenHandle } from "./tween.js";

/**
 * Smooth programmatic scrolling for Chromium 99 (no reliance on scroll-behavior).
 * While it runs the scroller carries `data-programmatic-scroll="true"`, so listeners
 * that close popovers on a *user* scroll can ignore it. Any wheel, pointer or key
 * input from the user cancels the animation at the current position.
 */
const MIN_MS = 180;
const MS_PER_PX = 0.25;

export function scrollDuration(distance: number): number {
  return Math.round(Math.min(aeMotionMs("smooth-scroll"), Math.max(MIN_MS, MIN_MS + Math.abs(distance) * MS_PER_PX)));
}

export function smoothScrollTo(env: MotionEnv, scroller: HTMLElement, top: number): TweenHandle {
  const max = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
  const to = Math.max(0, Math.min(max, top));
  const from = scroller.scrollTop || 0;
  const interrupt = (): void => handle.cancel();
  const inputs = ["wheel", "pointerdown", "keydown"];
  const release = (): void => {
    scroller.removeAttribute?.("data-programmatic-scroll");
    for (const type of inputs) scroller.removeEventListener?.(type, interrupt);
  };
  scroller.setAttribute("data-programmatic-scroll", "true");
  for (const type of inputs) scroller.addEventListener?.(type, interrupt);
  const inner = tween(env, {
    from, to, durationMs: scrollDuration(to - from), curve: aeMotionCurve("smooth-scroll"),
    onUpdate: value => { scroller.scrollTop = value; },
    onDone: release
  });
  const handle: TweenHandle = {
    cancel() { inner.cancel(); release(); },
    get running() { return inner.running; }
  };
  return handle;
}

/** Nearest scrollable ancestor (content taller than its box). */
export function scrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentNode as HTMLElement | null;
  while (current && current.nodeType === 1) {
    if ((current.scrollHeight || 0) > (current.clientHeight || 0) + 1) return current;
    current = current.parentNode as HTMLElement | null;
  }
  return null;
}

/** Brings `node` fully into view with the least movement, keeping `margin` px of air. */
export function scrollIntoViewSmooth(env: MotionEnv, node: HTMLElement, scroller = scrollParent(node), margin = 8): TweenHandle | null {
  if (!scroller || typeof node.getBoundingClientRect !== "function" || typeof scroller.getBoundingClientRect !== "function") return null;
  const item = node.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  let delta = 0;
  if (item.top < box.top + margin) delta = item.top - box.top - margin;
  else if (item.bottom > box.bottom - margin) delta = Math.min(item.bottom - box.bottom + margin, item.top - box.top - margin);
  if (!delta) return null;
  return smoothScrollTo(env, scroller, (scroller.scrollTop || 0) + delta);
}

/**
 * Optional wheel smoothing for discrete mouse wheels (line mode, or whole 100-px notches).
 * Trackpads, Ctrl/Shift+wheel, boundaries and `[data-wheel-owner]` areas (scrubbing,
 * sliders, curve editor, quick dock) keep the native behaviour. Off unless attached.
 */
export function attachWheelSmoothing(env: MotionEnv, scroller: HTMLElement): () => void {
  let target: number | null = null;
  let active: TweenHandle | null = null;
  const owned = (node: EventTarget | null): boolean => {
    let current = node as HTMLElement | null;
    while (current && current !== scroller) {
      if (current.getAttribute?.("data-wheel-owner") !== null && current.getAttribute?.("data-wheel-owner") !== undefined) return true;
      current = current.parentNode as HTMLElement | null;
    }
    return false;
  };
  const onWheel = (event: Event): void => {
    const wheel = event as WheelEvent;
    if (env.reduced() || wheel.ctrlKey || wheel.shiftKey || wheel.defaultPrevented || owned(wheel.target)) return;
    const notch = wheel.deltaMode === 1 || (Number.isInteger(wheel.deltaY) && Math.abs(wheel.deltaY) >= 100);
    if (!notch || !wheel.deltaY) return;
    const pixels = wheel.deltaMode === 1 ? wheel.deltaY * 40 : wheel.deltaY;
    const max = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
    const base = active?.running && target !== null ? target : scroller.scrollTop || 0;
    const next = Math.max(0, Math.min(max, base + pixels));
    if (next === (scroller.scrollTop || 0)) return;
    wheel.preventDefault();
    target = next;
    active?.cancel();
    const from = scroller.scrollTop || 0;
    active = tween(env, {
      from, to: next, durationMs: scrollDuration(next - from), curve: aeMotionCurve("smooth-scroll"),
      onUpdate: value => { scroller.scrollTop = value; }
    });
  };
  scroller.addEventListener("wheel", onWheel);
  return () => { active?.cancel(); scroller.removeEventListener?.("wheel", onWheel); };
}
