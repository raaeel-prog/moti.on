/**
 * Thin typed wrapper over the CSInterface features the two Moti.on surfaces
 * share: events between extensions, opening the other window, and window
 * chrome. Every method is a no-op outside CEP so the fake-DOM tests and the
 * browser preview can run the same code.
 *
 * Documented API (CEP 12 HTML Extension Cookbook, CSInterface.js):
 * `CSEvent(type, scope, appId, extensionId)`, `dispatchEvent`,
 * `addEventListener`, `removeEventListener`, `requestOpenExtension(id, params)`,
 * `closeExtension()`, `setWindowTitle(title)` (modeless/modal in every host),
 * `getExtensionID()`.
 */
export interface CepEventPayload { type: string; data: string; extensionId: string }
export type CepEventListener = (event: CepEventPayload) => void;

export interface CepEvents {
  /** Id of this extension, or "" outside CEP. */
  extensionId(): string;
  dispatch(type: string, data: string): void;
  listen(type: string, listener: CepEventListener): () => void;
  requestOpenExtension(extensionId: string): boolean;
  closeExtension(): void;
  setWindowTitle(title: string): void;
  available(): boolean;
}

interface CsInterfaceEvents {
  dispatchEvent(event: unknown): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  requestOpenExtension(extensionId: string, params: string): void;
  closeExtension(): void;
  setWindowTitle(title: string): void;
  getExtensionID(): string;
}

declare const CSInterface: (new () => CsInterfaceEvents) | undefined;
declare const CSEvent: (new (type: string, scope: string, appId?: string, extensionId?: string) => { data: string }) | undefined;

export const PANEL_EXTENSION_ID = "com.motion.plugin.ae.panel";
export const QUICK_EASE_EXTENSION_ID = "com.motion.plugin.ae.quick-ease";

export function createCepEvents(win: Window & { CSInterface?: unknown; CSEvent?: unknown } = window): CepEvents {
  const Cs = (win as { CSInterface?: new () => CsInterfaceEvents }).CSInterface ?? (typeof CSInterface === "undefined" ? undefined : CSInterface);
  const Ev = (win as { CSEvent?: new (type: string, scope: string, appId?: string, extensionId?: string) => { data: string } }).CSEvent ?? (typeof CSEvent === "undefined" ? undefined : CSEvent);
  let cs: CsInterfaceEvents | null = null;
  try { cs = Cs ? new Cs() : null; } catch { cs = null; }
  let selfId = "";
  try { selfId = cs?.getExtensionID?.() ?? ""; } catch { selfId = ""; }
  return {
    available: () => cs !== null,
    extensionId: () => selfId,
    dispatch(type, data) {
      if (!cs || !Ev) return;
      try {
        const event = new Ev(type, "APPLICATION", undefined, selfId || undefined);
        event.data = data;
        cs.dispatchEvent(event);
      } catch { /* the other surface simply does not hear it */ }
    },
    listen(type, listener) {
      if (!cs) return () => {};
      const wrapped = (raw: unknown): void => {
        const event = (raw ?? {}) as { type?: unknown; data?: unknown; extensionId?: unknown };
        listener({
          type: typeof event.type === "string" ? event.type : type,
          data: typeof event.data === "string" ? event.data : event.data === undefined || event.data === null ? "" : JSON.stringify(event.data),
          extensionId: typeof event.extensionId === "string" ? event.extensionId : ""
        });
      };
      try { cs.addEventListener(type, wrapped); } catch { return () => {}; }
      return () => { try { cs?.removeEventListener(type, wrapped); } catch { /* already gone */ } };
    },
    requestOpenExtension(extensionId) {
      if (!cs) return false;
      try { cs.requestOpenExtension(extensionId, ""); return true; } catch { return false; }
    },
    closeExtension() { try { cs?.closeExtension(); } catch { /* not a window */ } },
    setWindowTitle(title) { try { cs?.setWindowTitle?.(title); } catch { /* panels ignore it */ } }
  };
}
