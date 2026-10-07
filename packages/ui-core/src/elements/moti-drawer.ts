import { resolveId, requireText, setHidden, validateState, type ComponentState } from "../component-dom.js";
import {
  mountDrawerView, validateDrawerOptions,
  type DrawerOptions, type DrawerController, type DrawerView
} from "./drawer-view.js";
import { type OverlayCloseReason } from "./popover-view.js";

export interface MotiDrawer extends HTMLElement, DrawerController {
  label: string;
  overlay: boolean;
  state: ComponentState;
  stateLabel: string;
  configure(options: DrawerOptions): DrawerController;
}

export type MotiDrawerConstructor = new () => MotiDrawer;

const registrations = new WeakMap<CustomElementRegistry, MotiDrawerConstructor>();

/** The constructor and registry are always taken from the owning document. */
export function registerMotiDrawer(doc: Document): MotiDrawerConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof registry?.define !== "function" || typeof registry.get !== "function") {
    return undefined;
  }
  const ownerRealm = realm;

  const registered = registry.get("moti-drawer");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;

  class MotiDrawerElement extends ownerRealm.HTMLElement implements MotiDrawer {
    // A custom-element constructor cannot add children or attributes.
    private view: DrawerView | undefined;
    private updating = false;
    private valid = false;
    private detachedAfterConnection = false;
    private contentObserver: MutationObserver | undefined;
    private pendingInit: number | undefined;

    static get observedAttributes(): string[] {
      return ["aria-label", "data-overlay", "state", "state-label"];
    }

    get element(): HTMLElement { return this; }
    get isOpen(): boolean { return this.view?.isOpen ?? false; }
    get backdrop(): HTMLElement {
      if (!this.view) throw new Error("moti-drawer must be configured before accessing backdrop.");
      return this.view.backdrop;
    }
    get label(): string { return this.getAttribute("aria-label") ?? ""; }
    set label(value: string) { this.setAttribute("aria-label", requireText(value, "label")); }
    get overlay(): boolean { return this.getAttribute("data-overlay") !== "false"; }
    set overlay(value: boolean) {
      if (typeof value !== "boolean") throw new Error("overlay must be boolean.");
      this.setAttribute("data-overlay", value ? "true" : "false");
    }
    get state(): ComponentState { return (this.getAttribute("state") ?? "default") as ComponentState; }
    set state(value: ComponentState) { this.setState(value, this.stateLabel || undefined); }
    get stateLabel(): string { return this.getAttribute("state-label") ?? ""; }
    set stateLabel(value: string) { this.setAttribute("state-label", value); }

    connectedCallback(): void {
      this.detachedAfterConnection = false;
      if (this.view) return;
      setHidden(this, true);
      this.setAttribute("aria-hidden", "true");
      this.tryConfigureMarkup();
      if (!this.view && !this.firstElementChild) this.watchForContent();
    }

    disconnectedCallback(): void {
      this.detachedAfterConnection = true;
      this.stopWatching();
      this.view?.disconnect();
    }

    attributeChangedCallback(): void {
      if (this.updating) return;
      if (this.view) this.refresh();
      else if (this.isConnected !== false && this.firstElementChild) this.tryConfigureMarkup();
    }

    configure(options: DrawerOptions): DrawerController {
      validateDrawerOptions(options);
      if (this.view) throw new Error("moti-drawer is already initialized.");
      if (options.content === this) throw new Error("content cannot be the drawer root.");
      this.stopWatching();
      this.updating = true;
      try {
        this.view = mountDrawerView(this.ownerDocument, this, options);
        this.setAttribute("state", options.state ?? "default");
        if (options.stateLabel === undefined) this.removeAttribute("state-label");
        else this.setAttribute("state-label", options.stateLabel);
      } finally {
        this.updating = false;
      }
      this.refresh();
      return this;
    }

    open(origin?: HTMLElement): void {
      if (this.detachedAfterConnection) return;
      if (!this.view) this.tryConfigureMarkup();
      if (this.valid) this.view?.open(origin);
    }

    close(reason?: OverlayCloseReason): void { this.view?.close(reason); }
    finishClose(): void { this.view?.finishClose(); }

    setState(state: ComponentState, stateLabel?: string): void {
      validateState(state, stateLabel);
      this.updating = true;
      try {
        this.setAttribute("state", state);
        if (stateLabel === undefined) this.removeAttribute("state-label");
        else this.setAttribute("state-label", stateLabel);
      } finally {
        this.updating = false;
      }
      if (this.view) this.refresh();
      else if (this.isConnected !== false) this.tryConfigureMarkup();
    }

    private refresh(): void {
      const view = this.view;
      if (!view) return;
      try {
        requireText(this.label, "label");
        const overlayAttribute = this.getAttribute("data-overlay");
        if (overlayAttribute !== "true" && overlayAttribute !== "false") {
          throw new Error("data-overlay must be true or false.");
        }
        validateState(this.state, this.stateLabel || undefined);
        this.updating = true;
        try {
          view.setState(this.state, this.stateLabel || undefined);
          view.setOverlay(this.overlay);
        } finally {
          this.updating = false;
        }
        this.valid = true;
        this.removeAttribute("data-invalid");
      } catch {
        this.valid = false;
        view.disconnect();
        this.setAttribute("data-invalid", "true");
      }
    }

    private tryConfigureMarkup(): void {
      if (this.view) return;
      const content = this.firstElementChild as HTMLElement | null;
      if (!content) return;
      const overlayAttribute = this.getAttribute("data-overlay");
      try {
        if (overlayAttribute != null && overlayAttribute !== "" &&
            overlayAttribute !== "true" && overlayAttribute !== "false") {
          throw new Error("data-overlay must be true or false.");
        }
        const options: DrawerOptions = {
          id: this.id || resolveId(undefined, "drawer"),
          label: this.label,
          content,
          overlay: overlayAttribute !== "false",
          state: this.state
        };
        if (this.stateLabel) options.stateLabel = this.stateLabel;
        this.configure(options);
      } catch {
        this.valid = false;
        setHidden(this, true);
        this.setAttribute("aria-hidden", "true");
        this.setAttribute("data-invalid", "true");
      }
    }

    private watchForContent(): void {
      if (typeof ownerRealm.MutationObserver === "function") {
        try {
          this.contentObserver = new ownerRealm.MutationObserver(() => {
            if (this.firstElementChild) this.tryConfigureMarkup();
          });
          this.contentObserver.observe(this, { childList: true });
          return;
        } catch {
          this.contentObserver = undefined;
        }
      }
      // Some UXP builds omit MutationObserver. A parser turn still completes
      // before this fallback runs; programmatic callers can also call open().
      if (typeof ownerRealm.setTimeout === "function" && typeof ownerRealm.clearTimeout === "function") {
        this.pendingInit = ownerRealm.setTimeout(() => {
          this.pendingInit = undefined;
          if (this.isConnected !== false) this.tryConfigureMarkup();
        }, 0);
      }
    }

    private stopWatching(): void {
      this.contentObserver?.disconnect();
      this.contentObserver = undefined;
      if (this.pendingInit !== undefined) {
        ownerRealm.clearTimeout(this.pendingInit);
        this.pendingInit = undefined;
      }
    }
  }

  try {
    registry.define("moti-drawer", MotiDrawerElement);
  } catch {
    return undefined;
  }
  registrations.set(registry, MotiDrawerElement);
  return MotiDrawerElement;
}
