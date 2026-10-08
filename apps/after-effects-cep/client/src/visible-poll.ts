/**
 * Serialized polling that runs while the document is visible, with or without
 * focus. The floating ease window needs it: the user works in the native
 * timeline, so the window never has focus, yet it must follow the selection.
 *
 * One read at a time: a tick is skipped while the previous read is pending or
 * while `enabled()` says no (busy, mutating). Nothing runs while hidden.
 */
export function visiblePoll(doc: Document, read: () => Promise<void> | void, interval: number, enabled: () => boolean = () => true): { refresh(): void; dispose(): void } {
  let disposed = false, inFlight = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const win = doc.defaultView;
  const allowed = (): boolean => !disposed && !doc.hidden;
  const stop = (): void => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const tick = (): void => {
    if (!allowed()) { stop(); return; }
    if (inFlight || !enabled()) return;
    const result = read();
    if (result && typeof (result as Promise<void>).then === "function") {
      inFlight = true;
      void (result as Promise<void>).then(() => { inFlight = false; }, () => { inFlight = false; });
    }
  };
  function refresh(): void {
    if (!allowed()) { stop(); return; }
    if (timer === undefined) timer = setInterval(tick, interval);
    tick();
  }
  const visibility = (): void => { refresh(); };
  doc.addEventListener("visibilitychange", visibility);
  win?.addEventListener?.("unload", stop);
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; stop();
      doc.removeEventListener("visibilitychange", visibility);
      win?.removeEventListener?.("unload", stop);
    }
  };
}
