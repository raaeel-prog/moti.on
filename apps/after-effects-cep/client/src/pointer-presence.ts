/**
 * Whether the pointer is over this panel.
 *
 * On Windows, After Effects resets the mouse cursor every time ExtendScript
 * runs. A background `evalScript` every few hundred milliseconds therefore
 * flips the cursor back to the arrow over draggable numbers, sliders and
 * popover items, and the panel looks like it is always loading. Background
 * polls pause while the pointer is here: the user is working in the panel, and
 * the panel's own commands refresh the context themselves.
 *
 * Leaving is detected three ways (pointer out of the window, focus lost, panel
 * hidden). The idle limit is the last safety net: a missed leave can never
 * pause the polls for long.
 */
export interface PointerPresence {
  inside(): boolean;
  /** Called when the pointer comes (back) into the panel. */
  onEnter(listener: () => void): () => void;
  dispose(): void;
}

const IDLE_LIMIT_MS = 10_000;

export function trackPointerPresence(doc: Document, options: { idleMs?: number; now?: () => number } = {}): PointerPresence {
  const now = options.now ?? (() => Date.now());
  const idleMs = options.idleMs ?? IDLE_LIMIT_MS;
  const win = doc.defaultView;
  const listeners = new Set<() => void>();
  let present = false, pressed = false, lastActivity = 0;
  const inside = (): boolean => present && (pressed || now() - lastActivity < idleMs);
  const leave = (): void => { present = false; pressed = false; };
  const mark = (): void => {
    const entering = !inside();
    present = true; lastActivity = now();
    if (entering) for (const listener of [...listeners]) listener();
  };
  const down = (): void => { mark(); pressed = true; };
  const up = (): void => { pressed = false; if (present) lastActivity = now(); };
  // relatedTarget null: the pointer went to another window (AE, a dialog).
  const out = (event: Event): void => { if (!(event as PointerEvent).relatedTarget) leave(); };
  const visibility = (): void => { if (doc.hidden) leave(); };
  const listen = { capture: true, passive: true };
  const moves = ["pointerover", "pointermove", "wheel"] as const;
  for (const type of moves) doc.addEventListener(type, mark, listen);
  doc.addEventListener("pointerdown", down, listen);
  doc.addEventListener("pointerup", up, listen);
  doc.addEventListener("pointercancel", up, listen);
  doc.addEventListener("pointerout", out, listen);
  doc.addEventListener("visibilitychange", visibility);
  win?.addEventListener("blur", leave);
  return {
    inside,
    onEnter(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      listeners.clear(); leave();
      for (const type of moves) doc.removeEventListener(type, mark, listen);
      doc.removeEventListener("pointerdown", down, listen);
      doc.removeEventListener("pointerup", up, listen);
      doc.removeEventListener("pointercancel", up, listen);
      doc.removeEventListener("pointerout", out, listen);
      doc.removeEventListener("visibilitychange", visibility);
      win?.removeEventListener("blur", leave);
    }
  };
}
