/**
 * Quick bar: the timeline shortcut for smoothing.
 *
 * When a NEW keyframe selection appears, the native bar (plugin/gesture/
 * QuickBar.mm) pops up next to the pointer with the quick presets. This side
 * decides when to show/hide it and turns its clicks into the same safe apply
 * the panel uses; the native side never writes to the project.
 *
 * - Selection is read every 400 ms while the panel is visible (focus not
 *   required: the user is in the Timeline), one read at a time, never while
 *   something is writing.
 * - Shown once per selection identity. Dismissed (Esc, click outside, ×) for a
 *   selection → not shown again for it until the selection is cleared.
 * - Clicks arrive through `event.json`, polled at 100 ms only while the bar is up.
 */
import { visiblePoll } from "./visible-poll.js";
import type { NativeFiles } from "./native-gesture.js";
import type { EaseCurve } from "./ease-library.js";

export interface QuickBarItem { id: string; label: string; curve: EaseCurve }

/** The bar shows at most this many favourites (the native bar accepts 12 items). */
export const QUICK_BAR_MAX_FAVORITES = 10;

/**
 * What the bar offers: exactly the starred presets of the ease library, in
 * the order they were starred; with no (existing) favourite, the five
 * standard presets with their short labels ("In · Cubic In").
 */
export function quickBarPresets(
  favorites: readonly string[],
  presets: readonly { id: string; name: string; curve: EaseCurve }[],
  defaults: readonly (readonly [id: string, short: string])[]
): QuickBarItem[] {
  const byId = new Map(presets.map(preset => [preset.id, preset]));
  const starred: QuickBarItem[] = [];
  for (const id of favorites) {
    const preset = byId.get(id);
    if (!preset || starred.some(item => item.id === id)) continue;
    starred.push({ id, label: preset.name, curve: preset.curve });
    if (starred.length >= QUICK_BAR_MAX_FAVORITES) break;
  }
  if (starred.length) return starred;
  const standard: QuickBarItem[] = [];
  for (const [id, short] of defaults) {
    const preset = byId.get(id);
    if (preset) standard.push({ id, label: `${short} · ${preset.name}`, curve: preset.curve });
  }
  return standard;
}
export interface QuickBarLabels { editor: string; close: string; title: string }
export interface QuickBarContext { selectionSignature?: string | null; selectionSelectedKeyCount: number; isComposition: boolean }

export interface QuickBarOptions {
  doc: Document;
  files: NativeFiles | undefined;
  read(): Promise<QuickBarContext | null>;
  isBusy(): boolean;
  enabled(): boolean;
  /** Skips host reads while true (the pointer is over the panel, so no new Timeline selection). */
  paused?(): boolean;
  items(): QuickBarItem[];
  labels(): QuickBarLabels;
  /** Applies a preset; when it returns a promise, picks are serialized (latest wins). */
  onPick(id: string, signature: string): void | Promise<unknown>;
  onEditor(): void;
  intervalMs?: number;
  eventIntervalMs?: number;
}

export interface QuickBar {
  /** The native bar answered the handshake in this AE session. */
  available(): boolean;
  hide(): void;
  /** Redraws the open bar after a favourites change, without reading the host. */
  refreshItems(): void;
  dispose(): void;
}

interface Handshake { version: number; token: string; capabilities: string[]; hostProof: boolean }
interface QuickEvent { version: number; sequence: number; kind: "pick" | "dismiss" | "editor"; signature: string; id?: string }

let clock = Date.now();
const nextSequence = (): number => (clock = Math.max(clock + 1, Date.now()));

export function createQuickBar(options: QuickBarOptions): QuickBar {
  let token: string | null = null;
  let shown: string | null = null;
  let lastEvent = 0;
  let eventTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const suppressed = new Set<string>();

  function handshake(): string | null {
    if (!options.files) return null;
    try {
      const raw = options.files.read("handshake.json");
      if (!raw) return null;
      const value = JSON.parse(raw) as Handshake;
      if (value.version !== 1 || typeof value.token !== "string" || !/^[A-Fa-f0-9-]{36}$/.test(value.token) || value.hostProof !== true
        || !Array.isArray(value.capabilities) || !value.capabilities.includes("quick-bar")) return null;
      return value.token;
    } catch { return null; }
  }
  /** Events written before this panel started (or by an older AE session) are history, not clicks. */
  function readEvent(): QuickEvent | null {
    try {
      const raw = options.files?.read("event.json");
      if (!raw) return null;
      const value = JSON.parse(raw) as QuickEvent;
      if (value.version !== 1 || !Number.isSafeInteger(value.sequence) || typeof value.signature !== "string") return null;
      if (value.kind !== "pick" && value.kind !== "dismiss" && value.kind !== "editor") return null;
      return value;
    } catch { return null; }
  }
  lastEvent = readEvent()?.sequence ?? 0;

  function send(operation: "show" | "hide", payload: Record<string, unknown> = {}): boolean {
    token = handshake();
    if (!token || !options.files) return false;
    try { options.files.write(JSON.stringify({ version: 1, token, sequence: nextSequence(), operation, ...payload })); return true; }
    catch { return false; }
  }

  /**
   * One apply at a time. Clicks that arrive meanwhile are not dropped: the
   * latest one runs as soon as the current apply finishes (comparing presets
   * means clicking several in a row).
   */
  let picking = false;
  let pendingPick: { id: string; signature: string } | null = null;
  async function drainPicks(): Promise<void> {
    picking = true;
    try {
      while (pendingPick && !disposed) {
        const next = pendingPick;
        pendingPick = null;
        try { await options.onPick(next.id, next.signature); } catch { /* the apply reports its own failure */ }
      }
    } finally { picking = false; }
  }
  function pick(id: string, signature: string): void {
    pendingPick = { id, signature };
    if (!picking) void drainPicks();
  }

  function stopEvents(): void { if (eventTimer !== undefined) clearInterval(eventTimer); eventTimer = undefined; }
  function watchEvents(): void {
    if (eventTimer !== undefined) return;
    eventTimer = setInterval(() => {
      const event = readEvent();
      // The native side rewrites event.json only on a click, so a different
      // sequence is a new click. Comparing with `<=` would let one event with a
      // clock from the future silence every later click.
      if (!event || event.sequence === lastEvent) return;
      lastEvent = event.sequence;
      if (event.signature !== shown) return;
      if (event.kind === "pick" && event.id) { pick(event.id, event.signature); return; }
      suppressed.add(event.signature);
      shown = null; stopEvents();
      if (event.kind === "editor") options.onEditor();
    }, options.eventIntervalMs ?? 100);
  }

  /** What the open bar is drawing, so a favourites change can refresh it in place. */
  let shownItems = "";
  function show(signature: string): void {
    const items = options.items();
    if (!items.length) return;
    const labels = options.labels();
    if (!send("show", { signature, items, labels })) return;
    shown = signature;
    shownItems = JSON.stringify([items, labels]);
    watchEvents();
  }
  /** Same selection, different favourites: the native side redraws without moving the bar. */
  function refreshItems(): void {
    if (shown === null) return;
    const items = options.items();
    const labels = options.labels();
    const key = JSON.stringify([items, labels]);
    if (key === shownItems || !items.length) return;
    if (send("show", { signature: shown, items, labels })) shownItems = key;
  }
  function hide(): void {
    if (shown === null) return;
    shown = null; stopEvents();
    send("hide");
  }

  const polling = visiblePoll(options.doc, async () => {
    if (disposed || options.isBusy()) return;
    if (!options.enabled()) { hide(); return; }
    const context = await options.read();
    if (!context || disposed || options.isBusy()) return;
    const signature = context.isComposition && context.selectionSelectedKeyCount > 0 ? context.selectionSignature ?? null : null;
    if (!signature) { suppressed.clear(); hide(); return; }
    if (signature === shown) { refreshItems(); return; }
    if (suppressed.has(signature)) return;
    show(signature);
  }, options.intervalMs ?? 400, () => !options.isBusy() && !options.paused?.());

  return {
    available: () => handshake() !== null,
    hide,
    refreshItems,
    dispose() {
      if (disposed) return;
      hide(); disposed = true;
      polling.dispose(); stopEvents();
    }
  };
}
