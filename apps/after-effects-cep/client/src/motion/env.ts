/**
 * Clock and preference seam for the AE motion helpers.
 *
 * `reduced()` reads `data-reduced-motion` on the root live: it is the single source of
 * truth written by @motion/ui-motion's controller (internal toggle OR system setting).
 * Without requestAnimationFrame (fake DOM, background host) every helper jumps to its
 * final state instead of animating.
 */
export type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface MotionEnv {
  now(): number;
  /** Schedules a frame; `null` means frames are unavailable and callers finish instantly. */
  frame(callback: (now: number) => void): number | null;
  cancelFrame(handle: number): void;
  timeout(callback: () => void, ms: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
  reduced(): boolean;
}

interface FrameWindow {
  requestAnimationFrame?(callback: (now: number) => void): number;
  cancelAnimationFrame?(handle: number): void;
  performance?: { now(): number };
}

export function isReducedMotion(root: Element | null | undefined): boolean {
  try { return root?.getAttribute?.("data-reduced-motion") === "true"; } catch { return false; }
}

export function browserMotionEnv(win: FrameWindow | null | undefined, root: Element | null | undefined): MotionEnv {
  const requestFrame = typeof win?.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : null;
  const cancelFrame = typeof win?.cancelAnimationFrame === "function" ? win.cancelAnimationFrame.bind(win) : null;
  return {
    now: () => win?.performance?.now?.() ?? Date.now(),
    frame: callback => requestFrame ? requestFrame(callback) : null,
    cancelFrame: handle => cancelFrame?.(handle),
    timeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: handle => clearTimeout(handle),
    reduced: () => isReducedMotion(root)
  };
}

/**
 * Frame scheduler to hand to animated panels (camera previews), or nothing when motion is
 * reduced. Reads the root attribute, so the internal "reduce motion" toggle counts too.
 */
export function frameDriver(win: FrameWindow | null | undefined, root: Element | null | undefined): { frame?: (callback: (now: number) => void) => number; cancelFrame?: (handle: number) => void } {
  if (isReducedMotion(root) || typeof win?.requestAnimationFrame !== "function" || typeof win.cancelAnimationFrame !== "function") return {};
  return { frame: callback => win.requestAnimationFrame!(callback), cancelFrame: handle => win.cancelAnimationFrame!(handle) };
}
