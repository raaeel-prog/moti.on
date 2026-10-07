import { resolveId, validateState, type ComponentState } from "../component-dom.js";
import type { FeedbackTone } from "../components.js";
import {
  mountToastView, validateToastPresentation, validateToastViewOptions,
  type ToastPresentation, type ToastView, type ToastViewOptions
} from "./toast-view.js";

/** Presentation only: a toast region controls queueing, timers and dismissal. */
export interface MotiToast extends HTMLElement {
  message: string;
  detail: string | undefined;
  tone: FeedbackTone;
  state: ComponentState;
  stateLabel: string;
  dismissLabel: string;
  assertive: boolean;
  readonly actions: readonly HTMLButtonElement[];
  readonly dismissButton: HTMLButtonElement;
  setState(state: ComponentState, stateLabel?: string): void;
  updateLabels(dismissLabel: string, stateLabel?: string): void;
  configure(options: ToastViewOptions): ToastView;
}
export type MotiToastConstructor = new () => MotiToast;
const registrations = new WeakMap<CustomElementRegistry, MotiToastConstructor>();

/** Lazy, realm-local registration. Unsupported or foreign registries use the article fallback. */
export function registerMotiToast(doc: Document): MotiToastConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof realm.Event !== "function" ||
      typeof registry?.define !== "function" || typeof registry.get !== "function") return undefined;
  const registered = registry.get("moti-toast");
  if (registered) return registered === registrations.get(registry) ? registrations.get(registry) : undefined;
  const DismissEvent = realm.Event;

  class MotiToastElement extends realm.HTMLElement implements MotiToast {
    private view: ToastView | undefined;
    private options: ToastViewOptions | undefined;
    private updating = false;
    // No constructor mutations; reconnecting must preserve queue items and focused controls.
    static get observedAttributes(): string[] {
      return ["message", "detail", "tone", "state", "state-label", "dismiss-label", "assertive"];
    }
    connectedCallback(): void { this.refresh(); }
    attributeChangedCallback(): void { if (!this.updating && (this.view || this.isConnected)) this.refresh(); }
    get message(): string { return this.getAttribute("message") ?? ""; }
    set message(value: string) { this.setAttribute("message", value); }
    get detail(): string | undefined { return this.getAttribute("detail") ?? undefined; }
    set detail(value: string | undefined) { this.optional("detail", value); }
    get tone(): FeedbackTone {
      return (this.getAttribute("tone") ?? (this.state === "error" ? "destructive" :
        this.state === "success" ? "success" : this.state === "warning" ? "warning" : "info")) as FeedbackTone;
    }
    set tone(value: FeedbackTone) { this.setAttribute("tone", value); }
    get state(): ComponentState { return (this.getAttribute("state") ?? "default") as ComponentState; }
    set state(value: ComponentState) { this.setState(value, this.stateLabel || undefined); }
    get stateLabel(): string { return this.getAttribute("state-label") ?? ""; }
    set stateLabel(value: string) { this.setAttribute("state-label", value); }
    get dismissLabel(): string { return this.getAttribute("dismiss-label") ?? ""; }
    set dismissLabel(value: string) { this.setAttribute("dismiss-label", value); }
    get assertive(): boolean { return this.hasAttribute("assertive"); }
    set assertive(value: boolean) {
      const next = { ...this.presentation(), assertive: value };
      validateToastPresentation(next);
      if (value) this.setAttribute("assertive", ""); else this.removeAttribute("assertive");
    }
    get actions(): readonly HTMLButtonElement[] { return this.ensureView().actions; }
    get dismissButton(): HTMLButtonElement { return this.ensureView().dismissButton; }

    setState(state: ComponentState, stateLabel?: string): void {
      validateState(state, stateLabel);
      if (this.assertive && state !== "error") throw new Error("assertive is reserved for error toasts.");
      this.updateAttributes(() => {
        this.setAttribute("state", state);
        this.optional("state-label", stateLabel);
      });
    }
    updateLabels(dismissLabel: string, stateLabel?: string): void {
      const next = this.presentation();
      next.dismissLabel = dismissLabel;
      if (stateLabel !== undefined) next.stateLabel = stateLabel;
      validateToastPresentation(next);
      this.updateAttributes(() => {
        this.dismissLabel = dismissLabel;
        if (stateLabel !== undefined) this.stateLabel = stateLabel;
      });
    }
    configure(options: ToastViewOptions): ToastView {
      validateToastViewOptions(options);
      if (this.view || this.options) throw new Error("moti-toast is already initialized.");
      this.options = options;
      this.id = options.id;
      this.updateAttributes(() => this.writePresentation(options));
      const view = this.ensureView();
      return {
        element: this, actions: view.actions, dismissButton: view.dismissButton,
        get state() { return view.state; },
        update: next => {
          validateToastPresentation(next);
          this.updateAttributes(() => this.writePresentation(next));
        },
        updateLabels: (label, stateLabel) => this.updateLabels(label, stateLabel),
        setValid: valid => view.setValid(valid)
      };
    }
    private optional(name: string, value: string | undefined): void {
      if (value === undefined) this.removeAttribute(name); else this.setAttribute(name, value);
    }
    private presentation(): ToastPresentation {
      return {
        message: this.message, dismissLabel: this.dismissLabel, tone: this.tone,
        state: this.state, assertive: this.assertive,
        ...(this.hasAttribute("state-label") ? { stateLabel: this.stateLabel } : {}),
        ...(this.detail !== undefined ? { detail: this.detail } : {})
      };
    }
    private writePresentation(options: ToastPresentation): void {
      this.message = options.message;
      this.detail = options.detail;
      this.optional("tone", options.tone);
      this.setAttribute("state", options.state ?? "default");
      this.optional("state-label", options.stateLabel);
      this.dismissLabel = options.dismissLabel;
      if (options.assertive) this.setAttribute("assertive", ""); else this.removeAttribute("assertive");
    }
    private updateAttributes(update: () => void): void {
      this.updating = true;
      try { update(); } finally { this.updating = false; }
      if (this.view || this.isConnected) this.refresh();
    }
    private ensureView(): ToastView {
      if (this.view) return this.view;
      const presentation = this.presentation();
      validateToastPresentation(presentation);
      this.view = mountToastView(this.ownerDocument, this, {
        ...presentation,
        id: this.options?.id ?? resolveId(this.id || undefined, "toast"),
        ...(this.options?.actions ? { actions: this.options.actions } : {}),
        canInteract: () => this.options ? this.options.canInteract() : this.isConnected,
        onAction: index => this.options?.onAction(index),
        onDismiss: () => {
          if (this.options) this.options.onDismiss();
          else this.dispatchEvent(new DismissEvent("dismiss-request", { bubbles: true }));
        }
      });
      return this.view;
    }
    private refresh(): void {
      const presentation = this.presentation();
      try { validateToastPresentation(presentation); }
      catch {
        this.setAttribute("data-invalid", "true");
        this.view?.setValid(false);
        return;
      }
      const view = this.ensureView();
      view.update(presentation);
      view.setValid(true);
      this.removeAttribute("data-invalid");
    }
  }
  try { registry.define("moti-toast", MotiToastElement); }
  catch { return undefined; }
  registrations.set(registry, MotiToastElement);
  return MotiToastElement;
}
