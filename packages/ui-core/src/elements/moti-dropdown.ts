import {
  mountDropdownView, validateDropdownOptions,
  type DropdownPresentation, type DropdownView, type SelectFieldOptions
} from "./dropdown-view.js";

/** Configure choices/callback once; presentation updates preserve native controls. */
export interface MotiDropdown extends HTMLElement {
  value: string;
  label: string;
  description: string;
  disabled: boolean;
  disabledReason: string;
  configure(options: SelectFieldOptions): DropdownView;
}

export type MotiDropdownConstructor = new () => MotiDropdown;
const registrations = new WeakMap<CustomElementRegistry, MotiDropdownConstructor>();

/** Import-safe in Node/UXP; constructor and registry belong to the given document. */
export function registerMotiDropdown(doc: Document): MotiDropdownConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof registry?.define !== "function" ||
      typeof registry.get !== "function") return undefined;
  const registered = registry.get("moti-dropdown");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;

  class MotiDropdownElement extends realm.HTMLElement implements MotiDropdown {
    // Never mutate attributes or children during custom-element construction.
    private view: DropdownView | undefined;
    private updating = false;

    static get observedAttributes(): string[] {
      return ["value", "label", "description", "disabled", "disabled-reason"];
    }

    attributeChangedCallback(): void { if (!this.updating) this.refresh(); }
    disconnectedCallback(): void { this.view?.close(); }

    get value(): string { return this.view?.select.value ?? this.getAttribute("value") ?? ""; }
    set value(value: string) { this.setAttribute("value", value); }
    get label(): string { return this.getAttribute("label") ?? ""; }
    set label(value: string) { this.setAttribute("label", value); }
    get description(): string { return this.getAttribute("description") ?? ""; }
    set description(value: string) { this.setAttribute("description", value); }
    get disabled(): boolean { return this.hasAttribute("disabled"); }
    set disabled(value: boolean) {
      if (typeof value !== "boolean") throw new Error("disabled must be boolean.");
      if (value) this.setAttribute("disabled", "");
      else this.removeAttribute("disabled");
    }
    get disabledReason(): string { return this.getAttribute("disabled-reason") ?? ""; }
    set disabledReason(value: string) { this.setAttribute("disabled-reason", value); }

    configure(options: SelectFieldOptions): DropdownView {
      validateDropdownOptions(options);
      if (this.view) throw new Error("moti-dropdown is already initialized.");
      this.updating = true;
      try {
        this.label = options.label;
        this.value = options.value;
        this.description = options.description ?? "";
        this.disabledReason = options.disabledReason ?? "";
        this.disabled = options.disabled ?? false;
      } finally { this.updating = false; }
      const onChange = options.onChange;
      this.view = mountDropdownView(this, { ...options, onChange: value => {
        // Reflect user selection before the consumer may synchronously rerender.
        this.updating = true;
        try { this.setAttribute("value", value); } finally { this.updating = false; }
        onChange(value);
      } });
      return this.view;
    }

    override focus(options?: FocusOptions): void {
      const target = this.view?.trigger ?? this.view?.select;
      if (target) target.focus(options);
      else super.focus(options);
    }

    private refresh(): void {
      const view = this.view;
      if (!view) return;
      const presentation: DropdownPresentation = {
        value: this.getAttribute("value") ?? "", label: this.label,
        disabled: this.disabled
      };
      // Missing reason/description keeps the legacy fallback to the field label.
      if (this.description) presentation.description = this.description;
      if (this.disabledReason) presentation.disabledReason = this.disabledReason;
      try {
        view.update(presentation);
      } catch {
        this.setAttribute("data-invalid", "true");
        view.select.setAttribute("aria-invalid", "true");
        view.trigger?.setAttribute("aria-invalid", "true");
        view.setValid(false);
        return;
      }
      this.removeAttribute("data-invalid");
      view.select.removeAttribute("aria-invalid");
      view.trigger?.removeAttribute("aria-invalid");
      view.setValid(true);
    }
  }

  try { registry.define("moti-dropdown", MotiDropdownElement); }
  catch { return undefined; }
  registrations.set(registry, MotiDropdownElement);
  return MotiDropdownElement;
}
