import {
  resolveId, validateDisabled, validateState,
  type ComponentState
} from "../component-dom.js";
import {
  mountSliderView, validateSliderOptions, type SliderView, type SliderViewUpdate
} from "./slider-view.js";
import type { SliderFieldOptions, SliderFieldController } from "../components.js";

export interface MotiSlider extends HTMLElement {
  label: string;
  numberLabel: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  state: ComponentState;
  stateLabel: string;
  disabled: boolean;
  disabledReason: string;
  setState(state: ComponentState, stateLabel?: string): void;
  setDisabled(disabled: boolean, disabledReason?: string): void;
  configure(options: SliderFieldOptions): SliderFieldController;
}

export type MotiSliderConstructor = new () => MotiSlider;

const registrations = new WeakMap<CustomElementRegistry, MotiSliderConstructor>();

export function registerMotiSlider(doc: Document): MotiSliderConstructor | undefined {
  const realm = doc.defaultView as (Window & typeof globalThis) | null;
  const registry = realm?.customElements;
  if (typeof realm?.HTMLElement !== "function" || typeof realm.Event !== "function" ||
      typeof registry?.define !== "function" || typeof registry.get !== "function") return undefined;

  const registered = registry.get("moti-slider");
  const owned = registrations.get(registry);
  if (registered) return registered === owned ? owned : undefined;

  class MotiSliderElement extends realm.HTMLElement implements MotiSlider {
    private view: SliderView | undefined;
    private updating = false;
    private valid = false;
    private detached = false;
    private sliderId: string | undefined;
    private onInputCb: ((value: number) => void) | undefined;
    private onCommitCb: ((value: number) => void) | undefined;
    private formatValueCb: ((value: number) => string) | undefined;

    static get observedAttributes(): string[] {
      return ["label", "number-label", "description", "value", "default-value", "min", "max", "step", "unit", "state", "state-label", "disabled", "disabled-reason"];
    }

    connectedCallback(): void {
      this.detached = false;
      if (this.view) this.refresh();
      else this.ensureView();
    }

    disconnectedCallback(): void {
      // A removed panel can still have retained input references. Those events
      // must never preview or commit to the host after the view has gone away.
      this.detached = true;
      this.valid = false;
      this.view?.setValid(false);
    }

    attributeChangedCallback(): void {
      if (this.view && !this.updating) this.refresh();
    }

    get label(): string { return this.getAttribute("label") ?? ""; }
    set label(value: string) { this.setAttribute("label", value); }

    get numberLabel(): string { return this.getAttribute("number-label") ?? ""; }
    set numberLabel(value: string) { this.setAttribute("number-label", value); }

    get description(): string { return this.getAttribute("description") ?? ""; }
    set description(value: string) { this.optionalAttribute("description", value); }

    get value(): number { return Number(this.getAttribute("value") ?? "0"); }
    set value(value: number) { this.setAttribute("value", String(value)); }

    get defaultValue(): number { return Number(this.getAttribute("default-value") ?? "0"); }
    set defaultValue(value: number) { this.setAttribute("default-value", String(value)); }

    get min(): number { return Number(this.getAttribute("min") ?? "0"); }
    set min(value: number) { this.setAttribute("min", String(value)); }

    get max(): number { return Number(this.getAttribute("max") ?? "100"); }
    set max(value: number) { this.setAttribute("max", String(value)); }

    get step(): number { return Number(this.getAttribute("step") ?? "1"); }
    set step(value: number) { this.setAttribute("step", String(value)); }

    get unit(): string { return this.getAttribute("unit") ?? ""; }
    set unit(value: string) { this.optionalAttribute("unit", value); }

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

    configure(options: SliderFieldOptions): SliderFieldController {
      validateSliderOptions(options);
      if (this.view) throw new Error("moti-slider is already initialized.");
      this.sliderId = resolveId(options.id, "slider");
      this.id = `${this.sliderId}-component`;
      this.onInputCb = options.onInput;
      this.onCommitCb = options.onCommit;
      this.formatValueCb = options.formatValue;
      this.updateAttributes(() => {
        this.label = options.label;
        this.numberLabel = options.numberLabel;
        this.optionalAttribute("description", options.description);
        this.value = options.value;
        this.defaultValue = options.defaultValue;
        this.min = options.min;
        this.max = options.max;
        this.step = options.step;
        this.optionalAttribute("unit", options.unit);
        this.setAttribute("state", options.state ?? "default");
        this.optionalAttribute("state-label", options.stateLabel);
        this.optionalAttribute("disabled-reason", options.disabledReason);
        if (options.disabled) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
      });
      const view = this.ensureView();
      // Configure returns a controller that can be used directly, wrapping the element.
      return {
        element: this,
        label: view.label,
        range: view.range,
        numberInput: view.numberInput,
        get value() { return view.value; },
        setValue: (value) => {
          view.setValue(value);
          this.reflectValue(view.value);
        },
        setState: (state, stateLabel) => this.setState(state, stateLabel),
        setDisabled: (disabled, disabledReason) => this.setDisabled(disabled, disabledReason)
      };
    }

    private optionalAttribute(name: string, value: string | undefined): void {
      if (value === undefined || value === "") this.removeAttribute(name);
      else this.setAttribute(name, value);
    }

    private updateAttributes(update: () => void): void {
      this.updating = true;
      try { update(); } finally { this.updating = false; }
      if (this.view) this.refresh();
    }

    private reflectValue(value: number): void {
      this.updating = true;
      try { this.setAttribute("value", String(value)); }
      finally { this.updating = false; }
    }

    private ensureView(): SliderView {
      if (this.view) return this.view;
      if (!this.hasAttribute("label") && this.textContent?.trim()) this.label = this.textContent;
      this.textContent = "";
      const id = this.sliderId ?? `${resolveId(this.id.trim() || undefined, "slider")}-id`;
      // Mount a safe, complete view first. Declarative attributes may be
      // incomplete or malformed until parsing/upgrading finishes.
      this.view = mountSliderView(this.ownerDocument, this, {
        id, label: "Slider", numberLabel: "Value", value: 0,
        defaultValue: 0, min: 0, max: 100, step: 1,
        onInput: (value) => {
          this.reflectValue(value);
          if (this.valid) this.onInputCb?.(value);
        },
        onCommit: (value) => {
          this.reflectValue(value);
          if (this.valid) this.onCommitCb?.(value);
        }
      });
      this.refresh();
      return this.view;
    }

    private refresh(): void {
      const view = this.view;
      if (!view) return;
      const options: SliderViewUpdate = {
        label: this.label,
        numberLabel: this.numberLabel,
        description: this.getAttribute("description") ?? undefined,
        value: this.value,
        defaultValue: this.defaultValue,
        min: this.min,
        max: this.max,
        step: this.step,
        unit: this.getAttribute("unit") ?? undefined,
        formatValue: this.formatValueCb,
        state: this.state,
        stateLabel: this.getAttribute("state-label") ?? undefined,
        disabled: this.disabled,
        disabledReason: this.getAttribute("disabled-reason") ?? undefined,
      };

      try {
        view.update(options);
        this.valid = !this.detached;
        view.setValid(!this.detached);
        this.reflectValue(view.value);
        this.removeAttribute("data-invalid");
      } catch {
        this.valid = false;
        view.setValid(false);
        this.setAttribute("data-invalid", "true");
      }
    }
  }

  try {
    registry.define("moti-slider", MotiSliderElement);
  } catch {
    return undefined;
  }
  registrations.set(registry, MotiSliderElement);
  return MotiSliderElement;
}
