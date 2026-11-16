/** Shared lifetime for the camera's projected previews. The preference owner
 * remains ui-motion: read its effective root flag plus the system media query. */
export function createCameraPreviewPlayback(doc: Document, root: HTMLElement, scheduler: {
  frame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
}): { play(paint: (seconds: number) => void, still: () => void): void; stop(): void; dispose(): void } {
  let handle = 0, alive = true, intersecting = true;
  let active: { paint(seconds: number): void; still(): void; start: number | null } | null = null;
  function permitted(): boolean {
    const win = doc.defaultView;
    if (!alive || doc.hidden || !intersecting || root.isConnected === false || doc.documentElement.getAttribute("data-reduced-motion") === "true") return false;
    try { if (win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false; } catch { /* CEP may not expose media queries at startup. */ }
    for (let node: HTMLElement | null = root; node; node = node.parentElement) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      const style = win?.getComputedStyle?.(node);
      if (style?.display === "none" || style?.visibility === "hidden") return false;
    }
    return true;
  }
  function stop(): void {
    if (handle) scheduler.cancelFrame?.(handle);
    handle = 0;
    const previous = active;
    active = null;
    previous?.still();
  }
  function tick(now: number): void {
    handle = 0;
    if (!active) return;
    if (!permitted()) { stop(); return; }
    active.start ??= now;
    active.paint((now - active.start) / 1000);
    if (active && scheduler.frame) handle = scheduler.frame(tick);
  }
  const visibility = (): void => { if (doc.hidden) stop(); };
  doc.addEventListener("visibilitychange", visibility);
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    intersecting = entries.some(entry => entry.isIntersecting);
    if (!intersecting) stop();
  }) : null;
  observer?.observe(root);
  return {
    play(paint, still) {
      stop();
      if (!permitted() || !scheduler.frame) { still(); return; }
      active = { paint, still, start: null };
      handle = scheduler.frame(tick);
    },
    stop,
    dispose() { stop(); alive = false; doc.removeEventListener("visibilitychange", visibility); observer?.disconnect(); }
  };
}
