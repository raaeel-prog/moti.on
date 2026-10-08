/**
 * Opens the floating ease window when a NEW keyframe selection appears.
 *
 * Reads the context every 500 ms while the panel is visible (focus not
 * required), one read at a time, never during a mutation. Opens only when the
 * selection identity changes to one with selected keys; once the user closes
 * the window for a selection, that selection is not reopened.
 *
 * Gated: the caller only starts this when `QUICK_EASE_AUTO_OPEN_PROVEN` and
 * the user preference are both on.
 */
import { visiblePoll } from "./visible-poll.js";
import type { CepEvents } from "./cep-events.js";
import { EASE_QUICK_CLOSED_EVENT } from "./ease-sync.js";

export interface AutoOpenContext { selectionSignature?: string | null; selectionSelectedKeyCount: number; isComposition: boolean }

export interface EaseAutoOpenOptions {
  doc: Document;
  read(): Promise<AutoOpenContext | null>;
  isBusy(): boolean;
  enabled(): boolean;
  open(): void;
  events: CepEvents;
  intervalMs?: number;
}

export function createEaseAutoOpen(options: EaseAutoOpenOptions): { dispose(): void; seen(): string | null } {
  let lastSignature: string | null = null;
  let lastOpened: string | null = null;
  const suppressed = new Set<string>();
  const stopClosed = options.events.listen(EASE_QUICK_CLOSED_EVENT, event => { if (event.data) suppressed.add(event.data); });
  const polling = visiblePoll(options.doc, async () => {
    if (options.isBusy() || !options.enabled()) return;
    const context = await options.read();
    if (!context) return;
    const signature = context.isComposition ? context.selectionSignature ?? null : null;
    const changed = signature !== lastSignature;
    lastSignature = signature;
    if (!changed || !signature || context.selectionSelectedKeyCount < 1) return;
    if (signature === lastOpened || suppressed.has(signature)) return;
    lastOpened = signature;
    options.open();
  }, options.intervalMs ?? 500, () => options.enabled() && !options.isBusy());
  return { seen: () => lastSignature, dispose() { polling.dispose(); stopClosed(); } };
}
