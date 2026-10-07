import {
  resolveId, stateBlocksInteraction, validateDisabled, validateState,
  type ComponentState
} from "../component-dom.js";
import {
  mountActionButton, validateActionButtonOptions,
  type ActionButtonOptions, type ActionButtonVariant, type ActionButtonView
} from "./action-button-view.js";

export type ButtonVariant = ActionButtonVariant;

/** Public surface of the Light DOM element. `button` remains the focus target. */
export interface MotiButton extends HTMLElement {
  readonly button: HTMLButtonElement;
  label: string;
  icon: string | undefined;
  compact: boolean;
  variant: ButtonVariant;
  state: ComponentState;
  stateLabel: string;
  disabled: boolean;
  disabledReason: string;
  setState(state: ComponentState, stateLabel?: string): void;
  setDisabled(disabled: boolean, disabledReason?: string): void;
  /** Used by the compatibility factory before mounting the element. */
  configure(options: ActionButtonOptions): void;
}

export type MotiButtonConstructor = new () => MotiButton;

const registrations = new WeakMap<CustomElementRegistry, MotiButtonConstructor>();

/**
 * No DOM globals are read on import. Each document uses its own HTMLElement
 * constructor/registry; runtimes without these capabilities keep the DOM builder.
 * No Spectrum/CSS feature flags or polyfills are required by this module.
 */
export function registerMotiButton(doc: Document): MotiButtonConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof realm.Event !== "function" ||
      typeof registry?.define !== "function" || typeof registry.get !== "function") return undefined;

  const registered = registry.get("moti-button");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;
  const PressEvent = realm.Event;

  class MotiButtonElement extends realm.HTMLElement implements MotiButton {
    // Constructors must not add attributes or children (Custom Elements spec).
    private view: ActionButtonView | undefined;
    private updating = false;
    private valid = false;
    private buttonId: string | undefined;
    private onPress: (() => void) | undefined;
    private rendered: ActionButtonOptions | undefined;
    private renderedTitle: string | undefined;

    static get observedAttributes(): string[] {
      return ["label", "icon", "compact", "variant", "state", "state-label", "disabled", "disabled-reason", "title"];
    }

    connectedCallback(): void { this.ensureView().setConnected(true); }
    disconnectedCallback(): void { this.view?.setConnected(false); }

    attributeChangedCallback(): void {
      if (this.view && !this.updating) this.refresh();
    }

    get button(): HTMLButtonElement { return this.ensureView().button; }
    get label(): string { return this.getAttribute("label") ?? ""; }
    set label(value: string) { this.setAttribute("label", value); }
    get icon(): string | undefined { return this.getAttribute("icon") ?? undefined; }
    set icon(value: string | undefined) { this.optionalAttribute("icon", value); }
    get compact(): boolean { return this.hasAttribute("compact"); }
    set compact(value: boolean) {
      if (typeof value !== "boolean") throw new Error("compact must be boolean.");
      if (value) this.setAttribute("compact", "");
      else this.removeAttribute("compact");
    }
    get variant(): ButtonVariant { return (this.getAttribute("variant") ?? "default") as ButtonVariant; }
    set variant(value: ButtonVariant) { this.setAttribute("variant", value); }
    get state(): ComponentState { return (this.getAttribute("state") ?? "default") as ComponentState; }
    set state(value: ComponentState) { this.setState(value, this.stateLabel || undefined); }
    get stateLabel(): string { return this.getAttribute("state-label") ?? ""; }
    set stateLabel(value: string) { this.setAttribute("state-label", value); }
    get disabled(): boolean { return this.hasAttribute("disabled"); }
    set disabled(value: boolean) { this.setDisabled(value, this.disabledReason || undefined); }
    get disabledReason(): string { return this.getAttribute("disabled-reason") ?? ""; }
    set disabledReason(value: string) { this.setAttribute("disabled-reason", value); }

    setState(state: ComponentState, stateLabel?: string): void {
      validateState(state, stateLabel);
      this.updateAttributes(() => {
        this.setAttribute("state", state);
        this.optionalAttribute("state-label", stateLabel);
      });
    }

    setDisabled(disabled: boolean, disabledReason?: string): void {
      validateDisabled(disabled, disabledReason);
      this.updateAttributes(() => {
        this.optionalAttribute("disabled-reason", disabledReason);
        if (disabled) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
      });
    }

    configure(options: ActionButtonOptions): void {
      validateActionButtonOptions(options);
      if (this.view) throw new Error("moti-button is already initialized.");
      this.buttonId = resolveId(options.id, "action");
      this.id = `${this.buttonId}-component`;
      this.onPress = options.onPress;
      this.updateAttributes(() => {
        this.label = options.label;
        this.icon = options.icon;
        this.compact = options.compact ?? false;
        this.variant = options.variant ?? "default";
        this.setAttribute("state", options.state ?? "default");
        this.optionalAttribute("state-label", options.stateLabel);
        this.optionalAttribute("title", options.title);
        this.optionalAttribute("disabled-reason", options.disabledReason);
        if (options.disabled) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
      });
      this.ensureView();
    }

    override click(): void { this.button.click(); }
    override focus(options?: FocusOptions): void { this.button.focus(options); }

    private optionalAttribute(name: string, value: string | undefined): void {
      if (value === undefined) this.removeAttribute(name);
      else this.setAttribute(name, value);
    }

    private updateAttributes(update: () => void): void {
      this.updating = true;
      try { update(); } finally { this.updating = false; }
      if (this.view) this.refresh();
    }

    private ensureView(): ActionButtonView {
      if (this.view) return this.view;
      // Declarative text is read once on upgrade. Prefer label="..." in markup
      // registered before parsing so the label is available on connection.
      if (!this.hasAttribute("label") && this.textContent?.trim()) this.label = this.textContent;
      this.textContent = "";
      this.view = mountActionButton(this.ownerDocument, this,
        this.buttonId ?? `${resolveId(this.id || undefined, "action")}-button`, {
          label: this.label,
          onPress: () => {
            if (!this.valid || this.disabled || stateBlocksInteraction(this.state)) return;
            if (this.onPress) this.onPress();
            else this.dispatchEvent(new PressEvent("press", { bubbles: true }));
          }
        });
      this.refresh();
      return this.view;
    }

    private refresh(): void {
      const view = this.view;
      if (!view) return;
      const options: ActionButtonOptions = {
        label: this.label, variant: this.variant, state: this.state,
        ...(this.icon === undefined ? {} : { icon: this.icon }), compact: this.compact,
        stateLabel: this.stateLabel, disabled: this.disabled,
        disabledReason: this.disabledReason, onPress: () => undefined
      };
      try {
        validateActionButtonOptions(options);
      } catch {
        // Sequential HTML attribute updates may briefly lack an explanation.
        // Fail closed until the complete valid contract has arrived.
        this.valid = false;
        this.setAttribute("data-invalid", "true");
        view.button.setAttribute("aria-invalid", "true");
        view.button.setAttribute("aria-disabled", "true");
        return;
      }
      const force = !this.valid;
      const previous = this.rendered;
      const title = this.getAttribute("title") ?? undefined;
      this.valid = true;
      this.removeAttribute("data-invalid");
      view.button.removeAttribute("aria-invalid");
      if (force || options.label !== previous?.label) view.setLabel(this.label);
      if (force || options.icon !== previous?.icon) view.setIcon(this.icon);
      if (force || options.compact !== previous?.compact) view.setCompact(this.compact);
      if (force || options.variant !== previous?.variant) view.setVariant(this.variant);
      if (force || title !== this.renderedTitle) view.setTitle(title);
      if (force || options.state !== previous?.state || options.stateLabel !== previous?.stateLabel) {
        view.setState(this.state, this.stateLabel || undefined);
      }
      if (force || options.disabled !== previous?.disabled || options.disabledReason !== previous?.disabledReason) {
        view.setDisabled(this.disabled, this.disabledReason || undefined);
      }
      this.rendered = options;
      this.renderedTitle = title;
    }
  }

  try {
    registry.define("moti-button", MotiButtonElement);
  } catch {
    // Some partial host registries expose define() but cannot construct the tag.
    return undefined;
  }
  registrations.set(registry, MotiButtonElement);
  return MotiButtonElement;
}
