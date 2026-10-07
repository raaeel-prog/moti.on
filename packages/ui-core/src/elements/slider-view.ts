import {
  element,
  removeAttribute,
  createStateBinding,
  createDisabledBinding,
  bindDisabledExplanation,
  setHidden,
  updateInteractiveDescriptions,
  stateBlocksInteraction,
  applyState,
  updateDisabledReason,
  validateState,
  validateDisabled,
  requireText,
  resolveId
} from "../component-dom.js";
import type { SliderFieldOptions, SliderFieldController } from "../components.js";

/** Validate the complete contract before changing an existing view or supplied root. */
export function validateSliderOptions(options: SliderFieldOptions): void {
  if (options.id !== undefined) requireText(options.id, "id");
  requireText(options.label, "label");
  requireText(options.numberLabel, "numberLabel");
  if (options.description !== undefined && typeof options.description !== "string") {
    throw new Error("description must be a string.");
  }
  if (options.unit !== undefined && typeof options.unit !== "string") {
    throw new Error("unit must be a string.");
  }
  if (options.formatValue !== undefined && typeof options.formatValue !== "function") {
    throw new Error("formatValue must be a function.");
  }
  if (typeof options.onInput !== "function" || typeof options.onCommit !== "function") {
    throw new Error("Slider callbacks must be functions.");
  }
  requireFinite(options.min, "min");
  requireFinite(options.max, "max");
  requireFinite(options.step, "step");
  if (options.max <= options.min) throw new Error("max must be greater than min.");
  if (options.step <= 0) throw new Error("step must be greater than zero.");
  for (const [name, candidate] of [["value", options.value], ["defaultValue", options.defaultValue]] as const) {
    requireFinite(candidate, name);
    if (candidate < options.min || candidate > options.max) {
      throw new Error(`${name} must be within min and max.`);
    }
  }
  validateState(options.state ?? "default", options.stateLabel);
  validateDisabled(options.disabled ?? false, options.disabledReason);
}

export function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
}

export function decimalPlaces(value: number): number {
  const text = String(value).toLowerCase();
  const exponentIndex = text.indexOf("e-");
  if (exponentIndex >= 0) return Number(text.slice(exponentIndex + 2));
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((clamp(value, min, max) - min) / step) * step;
  const precision = Math.min(12, Math.max(decimalPlaces(min), decimalPlaces(max), decimalPlaces(step)) + 2);
  return clamp(Number(snapped.toFixed(precision)), min, max);
}

/** Optional presentation fields may be explicitly cleared by a DOM attribute removal. */
export type SliderViewUpdate = Partial<Omit<SliderFieldOptions,
  "description" | "unit" | "formatValue" | "stateLabel" | "disabledReason">> & {
    description?: string | undefined;
    unit?: string | undefined;
    formatValue?: ((value: number) => string) | undefined;
    stateLabel?: string | undefined;
    disabledReason?: string | undefined;
  };

export interface SliderView extends SliderFieldController {
  update(options: SliderViewUpdate): void;
  setValid(valid: boolean): void;
}

export function mountSliderView(
  doc: Document,
  root: HTMLElement,
  options: SliderFieldOptions
): SliderView {
  validateSliderOptions(options);
  const id = resolveId(options.id, "slider");
  let min = options.min;
  let max = options.max;
  let step = options.step;

  root.id = `${id}-component`;
  root.className = "ch-slider-field";
  const label = element(doc, "label", "ch-slider-field__label", requireText(options.label, "label"));
  label.id = `${id}-label`;
  label.htmlFor = `${id}-range`;
  label.title = requireText(options.label, "label");
  root.appendChild(label);

  const description = element(doc, "span", "ch-slider-field__description", options.description ?? "");
  description.id = `${id}-description`;
  setHidden(description, options.description === undefined);
  if (options.description === undefined) description.setAttribute("style", "display:none");
  root.appendChild(description);

  const controls = element(doc, "div", "ch-slider-field__controls");
  const track = element(doc, "span", "ch-slider-field__track");
  const fill = element(doc, "span", "ch-slider-field__fill");
  fill.setAttribute("data-motion", "slider-track");
  track.appendChild(fill);

  const range = element(doc, "input", "ch-slider-field__range");
  range.id = `${id}-range`;
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute("role", "slider");
  range.setAttribute("aria-labelledby", label.id);
  range.setAttribute("data-motion", "slider-knob");
  track.appendChild(range);
  controls.appendChild(track);

  const numberInput = element(doc, "input", "ch-slider-field__number");
  numberInput.id = `${id}-number`;
  numberInput.type = "number";
  numberInput.min = String(min);
  numberInput.max = String(max);
  numberInput.step = String(step);
  numberInput.setAttribute("aria-label", requireText(options.numberLabel, "numberLabel"));
  controls.appendChild(numberInput);
  
  const unitEl = element(doc, "span", "ch-slider-field__unit", options.unit ?? "");
  setHidden(unitEl, options.unit === undefined);
  if (options.unit === undefined) unitEl.setAttribute("style", "display:none");
  controls.appendChild(unitEl);
  root.appendChild(controls);

  const state = createStateBinding(doc, root, id, options);
  const disabled = createDisabledBinding(doc, root, id, options);
  bindDisabledExplanation(disabled, [range, numberInput]);
  let current = snap(options.value, min, max, step);
  let currentOptions = { ...options };
  let valid = true;

  function blocked(): boolean {
    return !valid || disabled.disabled || stateBlocksInteraction(state.state);
  }

  function valueText(value: number, presentation = currentOptions): string {
    const formatted = presentation.formatValue === undefined
      ? presentation.unit === undefined ? String(value) : `${value} ${presentation.unit}`
      : presentation.formatValue(value);
    if (typeof formatted !== "string") throw new Error("formatValue must return a string.");
    return formatted;
  }

  function refreshValue(formatted = valueText(current)): void {
    const stringValue = String(current);
    range.value = stringValue;
    numberInput.value = stringValue;
    range.setAttribute("aria-valuemin", String(min));
    range.setAttribute("aria-valuemax", String(max));
    range.setAttribute("aria-valuenow", stringValue);
    range.setAttribute("aria-valuetext", formatted);
    const progress = (current - min) / (max - min);
    fill.setAttribute("style", `--motion-progress:${progress}`);
    if (valid) removeAttribute(numberInput, "aria-invalid");
    else numberInput.setAttribute("aria-invalid", "true");
  }

  function refreshDisabled(): void {
    const unavailable = blocked();
    if (state.state === "loading") root.setAttribute("aria-busy", "true");
    else removeAttribute(root, "aria-busy");
    for (const target of [range, numberInput]) {
      if (unavailable) target.setAttribute("aria-disabled", "true");
      else removeAttribute(target, "aria-disabled");
      target.title = disabled.disabled
        ? requireText(disabled.reason, "disabledReason")
        : stateBlocksInteraction(state.state)
          ? requireText(state.label, "stateLabel")
        : requireText(currentOptions.label, "label");
      const baseIds = currentOptions.description === undefined ? [] : [`${id}-description`];
      updateInteractiveDescriptions(target, state, disabled, baseIds);
    }
  }

  function assign(value: number): void {
    const next = snap(requireFinite(value, "value"), min, max, step);
    const formatted = valueText(next);
    current = next;
    refreshValue(formatted);
  }

  function emitValue(value: number, commit: boolean): void {
    assign(value);
    currentOptions.onInput(current);
    if (commit) currentOptions.onCommit(current);
  }

  function readNumberDraft(): number | null {
    if (numberInput.value.trim().length === 0) return null;
    const value = Number(numberInput.value);
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return value;
  }

  range.addEventListener("input", () => {
    if (blocked()) {
      refreshValue();
      return;
    }
    assign(Number(range.value));
    currentOptions.onInput(current);
  });
  range.addEventListener("change", () => {
    if (blocked()) {
      refreshValue();
      return;
    }
    assign(Number(range.value));
    currentOptions.onCommit(current);
  });
  range.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    let next: number | undefined;
    const coarseStep = step * (keyboardEvent.shiftKey ? 10 : 1);
    if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowUp") next = current + coarseStep;
    else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowDown") next = current - coarseStep;
    else if (keyboardEvent.key === "PageUp") next = current + (max - min) * 0.1;
    else if (keyboardEvent.key === "PageDown") next = current - (max - min) * 0.1;
    else if (keyboardEvent.key === "Home") next = min;
    else if (keyboardEvent.key === "End") next = max;
    else return;

    event.preventDefault();
    if (!blocked()) emitValue(next, true);
  });
  for (const eventName of ["pointerdown", "pointerup", "pointercancel"] as const) {
    range.addEventListener(eventName, () => {
      const dragging = eventName === "pointerdown" && !blocked();
      range.setAttribute("data-dragging", dragging ? "true" : "false");
      fill.setAttribute("data-dragging", dragging ? "true" : "false");
    });
  }

  numberInput.addEventListener("input", () => {
    if (blocked()) {
      refreshValue();
      return;
    }
    const draft = readNumberDraft();
    if (draft === null) {
      numberInput.setAttribute("aria-invalid", "true");
      return;
    }
    removeAttribute(numberInput, "aria-invalid");
    const next = snap(draft, min, max, step);
    const formatted = valueText(next);
    current = next;
    range.value = String(current);
    range.setAttribute("aria-valuenow", String(current));
    range.setAttribute("aria-valuetext", formatted);
    fill.setAttribute("style", `--motion-progress:${(current - min) / (max - min)}`);
    currentOptions.onInput(current);
  });

  function commitNumber(): void {
    if (blocked()) {
      refreshValue();
      return;
    }
    const draft = readNumberDraft();
    if (draft === null) {
      numberInput.setAttribute("aria-invalid", "true");
      return;
    }
    assign(draft);
    currentOptions.onCommit(current);
  }

  numberInput.addEventListener("change", commitNumber);
  numberInput.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Enter") {
      event.preventDefault();
      commitNumber();
    } else if (keyboardEvent.key === "Escape") {
      event.preventDefault();
      refreshValue();
    }
  });
  label.addEventListener("click", () => { if (valid) range.focus(); });
  label.addEventListener("dblclick", () => {
    if (!blocked()) emitValue(currentOptions.defaultValue, true);
  });

  refreshValue();
  refreshDisabled();

  function update(nextOptions: SliderViewUpdate): void {
    const nextMin = nextOptions.min ?? min;
    const nextMax = nextOptions.max ?? max;
    const nextStep = nextOptions.step ?? step;
    const nextValue = nextOptions.value === undefined
      ? clamp(current, nextMin, nextMax)
      : nextOptions.value;
    const next = { ...currentOptions, ...nextOptions, value: nextValue } as SliderFieldOptions;
    for (const key of ["description", "unit", "formatValue", "stateLabel", "disabledReason"] as const) {
      if (next[key] === undefined) delete next[key];
    }
    validateSliderOptions(next);
    const snapped = snap(nextValue, nextMin, nextMax, nextStep);
    // A formatter may be supplied by callers. Resolve it before mutating any DOM.
    const formatted = valueText(snapped, next);

    min = nextMin;
    max = nextMax;
    step = nextStep;
    current = snapped;
    currentOptions = next;
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    numberInput.min = String(min);
    numberInput.max = String(max);
    numberInput.step = String(step);

    label.textContent = next.label;
    label.title = next.label;
    numberInput.setAttribute("aria-label", next.numberLabel);
    description.textContent = next.description ?? "";
    setHidden(description, next.description === undefined);
    if (next.description === undefined) description.setAttribute("style", "display:none");
    else removeAttribute(description, "style");
    unitEl.textContent = next.unit ?? "";
    setHidden(unitEl, next.unit === undefined);
    if (next.unit === undefined) unitEl.setAttribute("style", "display:none");
    else removeAttribute(unitEl, "style");

    refreshValue(formatted);
    applyState(root, state, next.state ?? "default", next.stateLabel);
    updateDisabledReason(disabled, next.disabled ?? false, next.disabledReason);
    refreshDisabled();
  }

  return {
    element: root,
    label,
    range,
    numberInput,
    get value() {
      return current;
    },
    setValue(value) {
      requireFinite(value, "value");
      if (value < min || value > max) throw new Error("value must be within min and max.");
      assign(value);
    },
    setState(nextState, stateLabel) {
      validateState(nextState, stateLabel);
      const next = { ...currentOptions, state: nextState };
      if (stateLabel === undefined) delete next.stateLabel;
      else next.stateLabel = stateLabel;
      currentOptions = next;
      applyState(root, state, nextState, stateLabel);
      refreshDisabled();
    },
    setDisabled(nextDisabled, disabledReason) {
      validateDisabled(nextDisabled, disabledReason);
      const next = { ...currentOptions, disabled: nextDisabled };
      if (disabledReason === undefined) delete next.disabledReason;
      else next.disabledReason = disabledReason;
      currentOptions = next;
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refreshDisabled();
    },
    update,
    setValid(nextValid) {
      valid = nextValid;
      if (valid) {
        removeAttribute(range, "aria-invalid");
        removeAttribute(numberInput, "aria-invalid");
      } else {
        range.setAttribute("aria-invalid", "true");
        numberInput.setAttribute("aria-invalid", "true");
        range.setAttribute("data-dragging", "false");
        fill.setAttribute("data-dragging", "false");
      }
      refreshDisabled();
    }
  };
}
