import { mountAlertView, validateAlertOptions, validateAlertPresentation, type AlertPresentation, type AlertView } from "./alert-view.js";
import type { AlertController, AlertOptions, FeedbackTone } from "../components.js";

/** Options and callbacks are configured once; presentation remains reactive. */
export interface MotiAlert extends HTMLElement {
  tone: FeedbackTone;
  description: string;
  icon: string | undefined;
  dismissLabel: string;
  assertive: boolean;
  configure(options: AlertOptions): AlertController;
  setTitle(title: string): void;
  setDescription(description: string): void;
  setTone(tone: FeedbackTone): void;
  dismiss(): void;
  dispose(): void;
}
export type MotiAlertConstructor = new () => MotiAlert;
const registrations = new WeakMap<CustomElementRegistry, MotiAlertConstructor>();

export function registerMotiAlert(doc: Document): MotiAlertConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof registry?.define !== "function" || typeof registry.get !== "function") return undefined;
  const registered = registry.get("moti-alert"), owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;
  class MotiAlertElement extends realm.HTMLElement implements MotiAlert {
    private view: AlertView | undefined;
    private updating = false;
    private dismissible = false;
    static get observedAttributes(): string[] { return ["title", "description", "tone", "icon", "dismiss-label", "assertive"]; }
    attributeChangedCallback(): void { if (!this.updating) this.refresh(); }
    disconnectedCallback(): void { this.view?.disconnect(); }
    get tone(): FeedbackTone { return (this.getAttribute("tone") ?? "default") as FeedbackTone; }
    set tone(value: FeedbackTone) { this.setAttribute("tone", value); }
    get description(): string { return this.getAttribute("description") ?? ""; }
    set description(value: string) { this.setAttribute("description", value); }
    get icon(): string | undefined { return this.getAttribute("icon") ?? undefined; }
    set icon(value: string | undefined) { this.optional("icon", value); }
    get dismissLabel(): string { return this.getAttribute("dismiss-label") ?? ""; }
    set dismissLabel(value: string) { this.setAttribute("dismiss-label", value); }
    get assertive(): boolean { return this.hasAttribute("assertive"); }
    set assertive(value: boolean) {
      if (typeof value !== "boolean") throw new Error("assertive must be boolean.");
      if (value) this.setAttribute("assertive", ""); else this.removeAttribute("assertive");
    }
    private presentation(): AlertPresentation {
      return { title: this.title, tone: this.tone, description: this.description,
        assertive: this.assertive, dismissLabel: this.dismissLabel,
        ...(this.icon === undefined ? {} : { icon: this.icon }) };
    }
    setTitle(title: string): void {
      validateAlertPresentation({ ...this.presentation(), title }, this.dismissible);
      this.title = title;
    }
    setTone(tone: FeedbackTone): void {
      validateAlertPresentation({ ...this.presentation(), tone }, this.dismissible);
      this.tone = tone;
    }
    setDescription(description: string): void {
      validateAlertPresentation({ ...this.presentation(), description }, this.dismissible);
      this.description = description;
    }
    dismiss(): void { this.view?.dismiss(); }
    dispose(): void { this.view?.dispose(); }
    configure(options: AlertOptions): AlertController {
      validateAlertOptions(options);
      if (this.view) throw new Error("moti-alert is already initialized.");
      this.dismissible = options.onDismiss !== undefined;
      this.updating = true;
      try {
        this.title = options.title;
        this.description = options.description ?? "";
        this.tone = options.tone ?? "default";
        this.icon = options.icon;
        this.dismissLabel = options.dismissLabel ?? "";
        this.assertive = options.assertive ?? false;
      } finally { this.updating = false; }
      this.view = mountAlertView(this.ownerDocument, this, options);
      return { element: this, setTitle: value => this.setTitle(value), setTone: value => this.setTone(value),
        setDescription: value => this.setDescription(value), dismiss: () => this.dismiss(), dispose: () => this.dispose() };
    }
    private optional(name: string, value: string | undefined): void {
      if (value === undefined) this.removeAttribute(name); else this.setAttribute(name, value);
    }
    private refresh(): void {
      if (!this.view) return;
      try { this.view.update(this.presentation()); }
      catch { this.setAttribute("data-invalid", "true"); this.view.setValid(false); return; }
      this.removeAttribute("data-invalid");
      this.view.setValid(true);
    }
  }
  try { registry.define("moti-alert", MotiAlertElement); } catch { return undefined; }
  registrations.set(registry, MotiAlertElement);
  return MotiAlertElement;
}
