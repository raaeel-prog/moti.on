/** One reader owns a tick. Editor readers return their context in the same
 * host response; a second context poll must not race them or steal focus. */
export interface SelectionReader {
  read(): Promise<void>;
  enabled(): boolean;
}
export function createSelectionCoordinator(options: {
  document: Document;
  window: Window;
  read(): Promise<void>;
  blocked(): boolean;
  interval?: number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (handle: unknown) => void;
}): { subscribe(reader: SelectionReader): () => void; refresh(): void; dispose(): void } {
  const readers = new Set<SelectionReader>();
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timer: unknown, running = false, disposed = false, requested = false;
  const clear = (): void => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const editor = (): SelectionReader | undefined => [...readers].reverse().find(reader => reader.enabled());
  const allowed = (): boolean => !disposed && !options.document.hidden &&
    (Boolean(editor()) || typeof options.document.hasFocus !== "function" || options.document.hasFocus());
  function next(delay = options.interval ?? 500): void {
    clear();
    if (allowed()) timer = schedule(() => { timer = undefined; void tick(); }, delay);
  }
  async function tick(): Promise<void> {
    if (!allowed()) return;
    if (running) { requested = true; return; }
    if (options.blocked()) { next(); return; }
    running = true; requested = false;
    try { await (editor()?.read() ?? options.read()); }
    catch { /* Each reader owns its error state; periodic recovery remains active. */ }
    finally { running = false; if (!disposed) next(requested ? 0 : undefined); }
  }
  function refresh(): void {
    if (disposed) return;
    requested = true;
    if (!running) next(0);
  }
  const visibility = (): void => { clear(); refresh(); };
  options.window.addEventListener("focus", refresh);
  options.window.addEventListener("blur", visibility);
  options.document.addEventListener("visibilitychange", visibility);
  next();
  return {
    subscribe(reader) { readers.add(reader); refresh(); return () => { readers.delete(reader); refresh(); }; },
    refresh,
    dispose() {
      disposed = true; clear(); readers.clear();
      options.window.removeEventListener("focus", refresh);
      options.window.removeEventListener("blur", visibility);
      options.document.removeEventListener("visibilitychange", visibility);
    }
  };
}
