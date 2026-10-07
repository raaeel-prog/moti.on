import type { ComponentState } from "../component-dom.js";
import { resolveId, requireText, validateState, setHidden } from "../component-dom.js";
import {
  mountPopoverView, validatePopoverOptions,
  type PopoverOptions, type PopoverController, type OverlayCloseReason
} from "./popover-view.js";

export interface MotiPopover extends HTMLElement, PopoverController {
  configure(options: PopoverOptions): PopoverController;
}

export type MotiPopoverConstructor = new () => MotiPopover;

const registrations = new WeakMap<CustomElementRegistry, MotiPopoverConstructor>();

export function registerMotiPopover(doc: Document): MotiPopoverConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof registry?.define !== "function" || typeof registry.get !== "function") {
    return undefined;
  }

  const registered = registry.get("moti-popover");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;

  class MotiPopoverElement extends realm.HTMLElement implements MotiPopover {
    private view: PopoverController | undefined;
    private updating = false;
    private valid = false;

    static get observedAttributes(): string[] {
      return ["aria-label", "state", "state-label"];
    }

    get element() { return this; }
    get isOpen() { return this.valid && (this.view?.isOpen ?? false); }

    connectedCallback(): void {
      if (this.view) this.refresh();
      else this.configureDeclarative();
    }

    disconnectedCallback(): void {
      this.view?.disconnect();
    }

    attributeChangedCallback(): void {
      if (this.updating) return;
      if (this.view) this.refresh();
      else if (this.isConnected) this.configureDeclarative();
    }

    configure(options: PopoverOptions): PopoverController {
      validatePopoverOptions(options);
      if (this.view) throw new Error("moti-popover is already initialized.");
      this.updating = true;
      try {
        this.view = mountPopoverView(this.ownerDocument, this, options);
        this.setAttribute("state", options.state ?? "default");
        if (options.stateLabel === undefined) this.removeAttribute("state-label");
        else this.setAttribute("state-label", options.stateLabel);
      } finally { this.updating = false; }
      this.valid = true;
      this.removeAttribute("data-invalid");
      this.removeAttribute("aria-invalid");
      return this;
    }

    open(origin?: HTMLElement): void {
      if (this.valid) this.view?.open(origin);
    }

    close(reason?: OverlayCloseReason): void {
      this.view?.close(reason);
    }

    finishClose(): void {
      this.view?.finishClose();
    }

    disconnect(): void {
      this.view?.disconnect();
    }

    setState(state: ComponentState, stateLabel?: string): void {
      validateState(state, stateLabel);
      this.updating = true;
      try {
        this.setAttribute("state", state);
        if (stateLabel === undefined) this.removeAttribute("state-label");
        else this.setAttribute("state-label", stateLabel);
      } finally { this.updating = false; }
      if (this.view) this.refresh();
      else if (this.isConnected) this.configureDeclarative();
    }

    private configureDeclarative(): void {
      const content = this.firstElementChild;
      const label = this.getAttribute("aria-label") ?? "";
      if (!content || typeof (content as HTMLElement).focus !== "function" || !label.trim()) {
        this.markInvalid();
        return;
      }
      try {
        this.configure({
          id: this.id || resolveId(undefined, "popover"),
          label,
          content: content as HTMLElement,
          state: (this.getAttribute("state") ?? "default") as ComponentState,
          ...(this.hasAttribute("state-label") ? { stateLabel: this.getAttribute("state-label") ?? "" } : {})
        });
      } catch {
        // Incomplete or malformed declarative attributes can be corrected later.
        this.markInvalid();
      }
    }

    private refresh(): void {
      if (!this.view) return;
      try {
        requireText(this.id, "id");
        requireText(this.getAttribute("aria-label") ?? undefined, "label");
        const state = (this.getAttribute("state") ?? "default") as ComponentState;
        const stateLabel = this.getAttribute("state-label") ?? undefined;
        validateState(state, stateLabel);
        this.view.setState(state, stateLabel);
      } catch {
        this.markInvalid();
        return;
      }
      this.valid = true;
      this.removeAttribute("data-invalid");
      this.removeAttribute("aria-invalid");
    }

    private markInvalid(): void {
      this.valid = false;
      this.view?.disconnect();
      setHidden(this, true);
      this.setAttribute("aria-hidden", "true");
      this.setAttribute("data-invalid", "true");
      this.setAttribute("aria-invalid", "true");
    }
  }

  try {
    registry.define("moti-popover", MotiPopoverElement);
  } catch {
    return undefined;
  }
  registrations.set(registry, MotiPopoverElement);
  return MotiPopoverElement;
}
