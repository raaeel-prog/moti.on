import { requireText } from "../component-dom.js";
import type { BadgeController, BadgeOptions, FeedbackTone } from "../components.js";
import { mountBadgeView, validateBadgeOptions, validateBadgeTone, type BadgeView } from "./badge-view.js";

/** Non-interactive indicator; labels never introduce an additional live region. */
export interface MotiBadge extends HTMLElement {
  label: string;
  tone: FeedbackTone;
  showIcon: boolean;
  setLabel(label: string): void;
  setTone(tone: FeedbackTone): void;
  configure(options: BadgeOptions): BadgeController;
}

export type MotiBadgeConstructor = new () => MotiBadge;
const registrations = new WeakMap<CustomElementRegistry, MotiBadgeConstructor>();

/** Lazy registration in the supplied document's realm, with no DOM import effects. */
export function registerMotiBadge(doc: Document): MotiBadgeConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof registry?.define !== "function" ||
      typeof registry.get !== "function") return undefined;
  const registered = registry.get("moti-badge");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;

  class MotiBadgeElement extends realm.HTMLElement implements MotiBadge {
    private view: BadgeView | undefined;
    private updating = false;

    static get observedAttributes(): string[] { return ["label", "tone", "show-icon"]; }
    connectedCallback(): void { this.refresh(); }
    attributeChangedCallback(): void {
      if (!this.updating && (this.view || this.isConnected)) this.refresh();
    }

    get label(): string { return this.getAttribute("label") ?? ""; }
    set label(value: string) {
      requireText(value, "label");
      this.setAttribute("label", value);
    }
    get tone(): FeedbackTone { return (this.getAttribute("tone") ?? "default") as FeedbackTone; }
    set tone(value: FeedbackTone) {
      validateBadgeTone(value);
      this.setAttribute("tone", value);
    }
    get showIcon(): boolean { return this.getAttribute("show-icon") !== "false"; }
    set showIcon(value: boolean) {
      if (typeof value !== "boolean") throw new Error("showIcon must be boolean.");
      this.setAttribute("show-icon", String(value));
    }
    setLabel(label: string): void { this.label = label; }
    setTone(tone: FeedbackTone): void { this.tone = tone; }

    configure(options: BadgeOptions): BadgeController {
      validateBadgeOptions(options);
      if (this.view) throw new Error("moti-badge is already initialized.");
      this.updating = true;
      try {
        this.label = options.label;
        this.tone = options.tone ?? "default";
        this.showIcon = options.showIcon !== false;
      } finally { this.updating = false; }
      this.refresh();
      return {
        element: this,
        setLabel: label => this.setLabel(label),
        setTone: tone => this.setTone(tone)
      };
    }

    private presentation(): BadgeOptions {
      const showIcon = this.getAttribute("show-icon");
      if (showIcon !== null && showIcon !== "true" && showIcon !== "false") {
        throw new Error("show-icon must be true or false.");
      }
      return { label: this.label, tone: this.tone, showIcon: showIcon !== "false" };
    }

    private refresh(): void {
      let options: BadgeOptions;
      try {
        options = this.presentation();
        validateBadgeOptions(options);
      } catch {
        // Incomplete or invalid markup keeps the last valid static presentation.
        this.setAttribute("data-invalid", "true");
        return;
      }
      if (this.view) this.view.update(options);
      else {
        this.textContent = "";
        this.view = mountBadgeView(this.ownerDocument, this, options);
      }
      this.removeAttribute("data-invalid");
    }
  }

  try { registry.define("moti-badge", MotiBadgeElement); }
  catch { return undefined; }
  registrations.set(registry, MotiBadgeElement);
  return MotiBadgeElement;
}
