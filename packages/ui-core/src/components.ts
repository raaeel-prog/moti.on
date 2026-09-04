/**
 * CHMS-UX-003 — primitivas de interface compartilhadas por CEP e UXP.
 *
 * Este modulo conhece apenas o subconjunto DOM comum aos dois runtimes. Ele
 * nunca chama host, storage, filesystem ou rede: consumidores ligam callbacks
 * a controllers e adapters fora da camada de apresentacao.
 */

export const COMPONENT_STATES = Object.freeze([
  "default",
  "loading",
  "empty",
  "success",
  "warning",
  "error",
  "unsupported"
] as const);

export type ComponentState = (typeof COMPONENT_STATES)[number];

export interface ComponentStateOptions {
  state?: ComponentState;
  /** Obrigatorio em runtime quando `state` nao e `default`. */
  stateLabel?: string;
}

export interface DisableableOptions {
  disabled?: boolean;
  /** Obrigatorio em runtime quando `disabled` e verdadeiro. */
  disabledReason?: string;
}

export interface StatefulController {
  setState(state: ComponentState, stateLabel?: string): void;
}

export interface DisableableController {
  setDisabled(disabled: boolean, disabledReason?: string): void;
}

type InteractiveOptions = ComponentStateOptions & DisableableOptions;

type StateMarkers = Readonly<Record<Exclude<ComponentState, "default">, string>>;

const STATE_MARKERS: StateMarkers = Object.freeze({
  loading: "…",
  empty: "—",
  success: "✓",
  warning: "▲",
  error: "!",
  unsupported: "—"
});

const TILE_STATE_MARKERS: StateMarkers = Object.freeze({
  ...STATE_MARKERS,
  success: "●"
});

const TILE_SPINNER_DELAY_MS = 180;
const TILE_CONFIRMATION_DURATION_MS = 700;

let generatedId = 0;

function nextId(prefix: string): string {
  generatedId += 1;
  return `${prefix}-${generatedId}`;
}

function requireText(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function resolveId(value: string | undefined, prefix: string): string {
  if (value === undefined) return nextId(prefix);
  return requireText(value, "id");
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function removeAttribute(node: Element, name: string): void {
  node.removeAttribute(name);
}

/**
 * O atributo HTML `hidden` nao e consistente entre CEP e Premiere UXP. Manter
 * um estado de dados em paralelo oferece um fallback CSS explicito sem remover
 * o comportamento nativo dos runtimes que o implementam.
 */
function setHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
  node.setAttribute("data-hidden", hidden ? "true" : "false");
}

function setDescriptionIds(node: Element, ids: readonly string[]): void {
  const value = ids.filter((id) => id.length > 0).join(" ");
  if (value.length > 0) node.setAttribute("aria-describedby", value);
  else removeAttribute(node, "aria-describedby");
}

interface StateBinding {
  readonly node: HTMLElement;
  readonly markers: StateMarkers;
  state: ComponentState;
  label?: string;
}

function validateState(state: ComponentState, stateLabel?: string): void {
  if (state !== "default") requireText(stateLabel, "stateLabel");
}

function createStateBinding(
  doc: Document,
  owner: HTMLElement,
  ownerId: string,
  options: ComponentStateOptions,
  announce = true,
  markers: StateMarkers = STATE_MARKERS
): StateBinding {
  const state = options.state ?? "default";
  validateState(state, options.stateLabel);

  const node = element(doc, "span", "ch-component-state");
  node.id = `${ownerId}-state`;
  if (announce) {
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
  }
  owner.appendChild(node);

  const binding: StateBinding = { node, markers, state };
  if (options.stateLabel !== undefined) binding.label = options.stateLabel;
  applyState(owner, binding, state, options.stateLabel);
  return binding;
}

function applyState(
  owner: HTMLElement,
  binding: StateBinding,
  state: ComponentState,
  stateLabel?: string
): void {
  validateState(state, stateLabel);
  binding.state = state;
  if (stateLabel === undefined) delete binding.label;
  else binding.label = stateLabel;
  owner.setAttribute("data-state", state);

  if (state === "default") {
    binding.node.textContent = "";
    setHidden(binding.node, true);
    binding.node.setAttribute("aria-hidden", "true");
    return;
  }

  setHidden(binding.node, false);
  removeAttribute(binding.node, "aria-hidden");
  binding.node.textContent = `${binding.markers[state]} ${requireText(stateLabel, "stateLabel")}`;
}

interface DisabledBinding {
  readonly owner: HTMLElement;
  readonly node: HTMLElement;
  disabled: boolean;
  reason?: string;
}

function validateDisabled(disabled: boolean, disabledReason?: string): void {
  if (disabled) requireText(disabledReason, "disabledReason");
}

function createDisabledBinding(
  doc: Document,
  owner: HTMLElement,
  ownerId: string,
  options: DisableableOptions
): DisabledBinding {
  const disabled = options.disabled ?? false;
  validateDisabled(disabled, options.disabledReason);
  const node = element(doc, "span", "ch-disabled-reason");
  node.id = `${ownerId}-disabled-reason`;
  owner.appendChild(node);
  const binding: DisabledBinding = { owner, node, disabled };
  if (options.disabledReason !== undefined) binding.reason = options.disabledReason;
  updateDisabledReason(binding, disabled, options.disabledReason);
  return binding;
}

function updateDisabledReason(
  binding: DisabledBinding,
  disabled: boolean,
  disabledReason?: string
): void {
  validateDisabled(disabled, disabledReason);
  binding.disabled = disabled;
  if (disabledReason === undefined) delete binding.reason;
  else binding.reason = disabledReason;
  binding.node.textContent = disabled ? requireText(disabledReason, "disabledReason") : "";
  setHidden(binding.node, !disabled);
  binding.node.setAttribute("aria-hidden", disabled ? "false" : "true");
  binding.owner.setAttribute("data-disabled-explanation", "closed");
}

function bindDisabledExplanation(
  binding: DisabledBinding,
  targets: readonly HTMLElement[]
): void {
  for (const target of targets) {
    target.addEventListener("focus", () => {
      binding.owner.setAttribute(
        "data-disabled-explanation",
        binding.disabled ? "open" : "closed"
      );
    });
    target.addEventListener("blur", () => {
      binding.owner.setAttribute("data-disabled-explanation", "closed");
    });
  }
}

function updateInteractiveDescriptions(
  target: HTMLElement,
  state: StateBinding,
  disabled: DisabledBinding,
  baseIds: readonly string[] = []
): void {
  const ids = [...baseIds];
  if (state.state !== "default") ids.push(state.node.id);
  if (disabled.disabled) ids.push(disabled.node.id);
  setDescriptionIds(target, ids);
}

function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

function stateBlocksInteraction(state: ComponentState): boolean {
  return state === "loading" || state === "unsupported";
}

export interface ActionButtonOptions extends InteractiveOptions {
  id?: string;
  label: string;
  variant?: "default" | "primary" | "danger" | "quiet";
  title?: string;
  onPress(): void;
}

export interface ActionButtonController extends StatefulController, DisableableController {
  readonly element: HTMLElement;
  readonly button: HTMLButtonElement;
}

export function createActionButton(
  doc: Document,
  options: ActionButtonOptions
): ActionButtonController {
  const id = resolveId(options.id, "action");
  const label = requireText(options.label, "label");
  const root = element(doc, "span", "ch-action");
  root.id = `${id}-component`;

  const button = element(
    doc,
    "button",
    `ch-action-button ch-action-button--${options.variant ?? "default"}`,
    label
  );
  button.id = id;
  button.setAttribute("type", "button");
  root.appendChild(button);

  const state = createStateBinding(doc, root, id, options);
  const disabled = createDisabledBinding(doc, root, id, options);
  bindDisabledExplanation(disabled, [button]);

  function blocked(): boolean {
    return disabled.disabled || stateBlocksInteraction(state.state);
  }

  function refresh(): void {
    const unavailable = blocked();
    if (unavailable) button.setAttribute("aria-disabled", "true");
    else removeAttribute(button, "aria-disabled");

    if (state.state === "loading") button.setAttribute("aria-busy", "true");
    else removeAttribute(button, "aria-busy");

    button.title = disabled.disabled
      ? requireText(disabled.reason, "disabledReason")
      : options.title ?? state.label ?? label;
    updateInteractiveDescriptions(button, state, disabled);
  }

  function press(event?: Event): void {
    if (blocked()) {
      event?.preventDefault();
      return;
    }
    options.onPress();
  }

  button.addEventListener("click", (event) => press(event));
  button.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!isActivationKey(keyboardEvent.key)) return;
    event.preventDefault();
    press(event);
  });
  refresh();

  return {
    element: root,
    button,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
      refresh();
    },
    setDisabled(nextDisabled, disabledReason) {
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refresh();
    }
  };
}

export interface QuickTileOptions extends InteractiveOptions {
  id: string;
  label: string;
  oneLine: string;
  presetLabel?: string;
  advancedLabel: string;
  /** Glifo monocromatico de 20 px fornecido pelo consumidor. */
  iconText?: string;
  /** Marca visivel quando indisponivel; use `—` ou um cadeado textual. */
  disabledMarker?: string;
  /** Tecla simples de preview; `null` desliga o atalho. O padrao e `?`. */
  previewKey?: string | null;
  scheduler?: ComponentScheduler;
  onQuick(): void;
  onAdvanced(): void;
  onPreview(): void;
}

export interface QuickTileController extends StatefulController, DisableableController {
  readonly element: HTMLElement;
  readonly primary: HTMLButtonElement;
  readonly advanced: HTMLButtonElement;
  readonly icon: HTMLElement;
}

export function createQuickTile(doc: Document, options: QuickTileOptions): QuickTileController {
  const id = resolveId(options.id, "tile");
  const label = requireText(options.label, "label");
  const oneLine = requireText(options.oneLine, "oneLine");
  const advancedLabel = requireText(options.advancedLabel, "advancedLabel");
  const iconText = requireText(options.iconText ?? "◇", "iconText");
  const disabledMarker = requireText(options.disabledMarker ?? "—", "disabledMarker");
  const previewKey = options.previewKey === undefined ? "?" : options.previewKey;
  if (previewKey !== null) requireText(previewKey, "previewKey");
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const root = element(doc, "article", "ch-quick-tile");
  root.id = `${id}-tile`;
  root.setAttribute("data-motion", "tile-hover tile-press");

  const primary = element(doc, "button", "ch-quick-tile__primary");
  primary.id = id;
  primary.setAttribute("type", "button");
  primary.setAttribute("role", "button");
  primary.setAttribute("aria-label", label);
  const icon = element(doc, "span", "ch-quick-tile__icon", iconText);
  icon.setAttribute("data-feedback", "default");
  primary.appendChild(icon);
  const copy = element(doc, "span", "ch-quick-tile__copy");
  copy.appendChild(element(doc, "span", "ch-quick-tile__label", label));
  if (options.presetLabel !== undefined) {
    copy.appendChild(element(doc, "span", "ch-quick-tile__preset", options.presetLabel));
  }
  primary.appendChild(copy);
  root.appendChild(primary);

  const advanced = element(doc, "button", "ch-quick-tile__advanced", "⌄");
  advanced.setAttribute("type", "button");
  advanced.setAttribute("tabindex", "-1");
  advanced.setAttribute("aria-label", `${advancedLabel}: ${label}`);
  advanced.setAttribute("data-motion", "tile-advanced");
  advanced.title = advancedLabel;
  root.appendChild(advanced);

  const description = element(doc, "span", "ch-visually-hidden", oneLine);
  description.id = `${id}-description`;
  root.appendChild(description);

  const state = createStateBinding(doc, root, id, options, true, TILE_STATE_MARKERS);
  const disabled = createDisabledBinding(doc, root, id, options);
  bindDisabledExplanation(disabled, [primary, advanced]);
  let feedbackTimer: unknown;

  function cancelFeedbackTimer(): void {
    if (feedbackTimer === undefined) return;
    scheduler.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  }

  function showIcon(text: string, feedback: "default" | "waiting" | "loading" | "success" | "disabled"): void {
    icon.textContent = text;
    icon.setAttribute("data-feedback", feedback);
  }

  function refreshFeedback(transientSuccess: boolean): void {
    cancelFeedbackTimer();
    if (disabled.disabled) {
      showIcon(disabledMarker, "disabled");
      return;
    }
    if (state.state === "loading") {
      showIcon(iconText, "waiting");
      feedbackTimer = scheduler.setTimeout(() => {
        feedbackTimer = undefined;
        if (!disabled.disabled && state.state === "loading") showIcon("◌", "loading");
      }, TILE_SPINNER_DELAY_MS);
      return;
    }
    if (state.state === "success" && transientSuccess) {
      showIcon("✓", "success");
      feedbackTimer = scheduler.setTimeout(() => {
        feedbackTimer = undefined;
        if (!disabled.disabled && state.state === "success") showIcon(iconText, "default");
      }, TILE_CONFIRMATION_DURATION_MS);
      return;
    }
    showIcon(iconText, "default");
  }

  function blocked(): boolean {
    return disabled.disabled || stateBlocksInteraction(state.state);
  }

  function refresh(): void {
    const unavailable = blocked();
    for (const target of [primary, advanced]) {
      if (unavailable) target.setAttribute("aria-disabled", "true");
      else removeAttribute(target, "aria-disabled");
    }
    if (state.state === "loading") primary.setAttribute("aria-busy", "true");
    else removeAttribute(primary, "aria-busy");
    primary.title = disabled.disabled ? requireText(disabled.reason, "disabledReason") : oneLine;
    updateInteractiveDescriptions(primary, state, disabled, [description.id]);
  }

  function quick(event?: Event): void {
    if (blocked()) {
      event?.preventDefault();
      return;
    }
    options.onQuick();
  }

  function advancedAction(event?: Event): void {
    if (blocked()) {
      event?.preventDefault();
      return;
    }
    options.onAdvanced();
  }

  function preview(event?: Event): void {
    if (blocked()) {
      event?.preventDefault();
      return;
    }
    options.onPreview();
  }

  primary.addEventListener("click", (event) => {
    if ((event as MouseEvent).altKey) advancedAction(event);
    else quick(event);
  });
  primary.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (
      previewKey !== null
      && keyboardEvent.key === previewKey
      && !keyboardEvent.altKey
      && !keyboardEvent.ctrlKey
      && !keyboardEvent.metaKey
    ) {
      event.preventDefault();
      preview(event);
      return;
    }
    if (!isActivationKey(keyboardEvent.key)) return;
    event.preventDefault();
    if (keyboardEvent.altKey) advancedAction(event);
    else quick(event);
  });
  advanced.addEventListener("click", (event) => advancedAction(event));
  refreshFeedback(false);
  refresh();

  return {
    element: root,
    primary,
    advanced,
    icon,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
      refreshFeedback(true);
      refresh();
    },
    setDisabled(nextDisabled, disabledReason) {
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refreshFeedback(false);
      refresh();
    }
  };
}

export interface QuickTileGridOptions {
  label: string;
  columns: number;
  tiles: readonly QuickTileController[];
}

export interface QuickTileGridController {
  readonly element: HTMLElement;
  focus(index: number): void;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function createQuickTileGrid(
  doc: Document,
  options: QuickTileGridOptions
): QuickTileGridController {
  const columns = requirePositiveInteger(options.columns, "columns");
  const root = element(doc, "div", "ch-quick-grid");
  root.setAttribute("role", "grid");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("aria-rowcount", String(Math.ceil(options.tiles.length / columns)));
  root.setAttribute("aria-colcount", String(options.tiles.length === 0 ? 0 : Math.min(columns, options.tiles.length)));

  function move(index: number): void {
    const target = options.tiles[index];
    if (target === undefined) return;
    for (const [tileIndex, tile] of options.tiles.entries()) {
      tile.primary.setAttribute("tabindex", tileIndex === index ? "0" : "-1");
    }
    target.primary.focus();
    const scrollTarget = target.element as HTMLElement & {
      scrollIntoViewIfNeeded?: () => void;
      scrollIntoView?: (alignToTop?: boolean) => void;
    };
    if (typeof scrollTarget.scrollIntoViewIfNeeded === "function") {
      scrollTarget.scrollIntoViewIfNeeded();
    } else if (typeof scrollTarget.scrollIntoView === "function") {
      scrollTarget.scrollIntoView(false);
    }
  }

  for (let rowStart = 0; rowStart < options.tiles.length; rowStart += columns) {
    const row = element(doc, "div", "ch-quick-grid__row");
    row.setAttribute("role", "row");
    row.setAttribute("aria-rowindex", String(Math.floor(rowStart / columns) + 1));

    const rowEnd = Math.min(rowStart + columns, options.tiles.length);
    for (let index = rowStart; index < rowEnd; index += 1) {
      const tile = options.tiles[index];
      if (tile === undefined) continue;
      tile.primary.setAttribute("tabindex", index === 0 ? "0" : "-1");
      tile.primary.addEventListener("keydown", (event) => {
        const key = (event as KeyboardEvent).key;
        let destination: number | undefined;
        if (key === "ArrowRight") destination = Math.min(index + 1, options.tiles.length - 1);
        else if (key === "ArrowLeft") destination = Math.max(index - 1, 0);
        else if (key === "ArrowDown") destination = Math.min(index + columns, options.tiles.length - 1);
        else if (key === "ArrowUp") destination = Math.max(index - columns, 0);
        else if (key === "Home") destination = 0;
        else if (key === "End") destination = options.tiles.length - 1;
        else return;

        event.preventDefault();
        move(destination);
      });

      const cell = element(doc, "div", "ch-quick-grid__cell");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(Math.floor(index / columns) + 1));
      cell.setAttribute("aria-colindex", String((index % columns) + 1));
      cell.appendChild(tile.element);
      row.appendChild(cell);
    }
    root.appendChild(row);
  }

  return { element: root, focus: move };
}

export interface SliderFieldOptions extends InteractiveOptions {
  id: string;
  label: string;
  numberLabel: string;
  description?: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?(value: number): string;
  onInput(value: number): void;
  onCommit(value: number): void;
}

export interface SliderFieldController extends StatefulController, DisableableController {
  readonly element: HTMLElement;
  readonly label: HTMLLabelElement;
  readonly range: HTMLInputElement;
  readonly numberInput: HTMLInputElement;
  readonly value: number;
  setValue(value: number): void;
}

function requireFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
}

function decimalPlaces(value: number): number {
  const text = String(value).toLowerCase();
  const exponentIndex = text.indexOf("e-");
  if (exponentIndex >= 0) return Number(text.slice(exponentIndex + 2));
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((clamp(value, min, max) - min) / step) * step;
  const precision = Math.min(12, Math.max(decimalPlaces(min), decimalPlaces(max), decimalPlaces(step)) + 2);
  return clamp(Number(snapped.toFixed(precision)), min, max);
}

export function createSliderField(
  doc: Document,
  options: SliderFieldOptions
): SliderFieldController {
  const id = resolveId(options.id, "slider");
  const min = requireFinite(options.min, "min");
  const max = requireFinite(options.max, "max");
  const step = requireFinite(options.step, "step");
  if (max <= min) throw new Error("max must be greater than min.");
  if (step <= 0) throw new Error("step must be greater than zero.");
  for (const [name, candidate] of [["value", options.value], ["defaultValue", options.defaultValue]] as const) {
    requireFinite(candidate, name);
    if (candidate < min || candidate > max) throw new Error(`${name} must be within min and max.`);
  }

  const root = element(doc, "div", "ch-slider-field");
  root.id = `${id}-component`;
  const label = element(doc, "label", "ch-slider-field__label", requireText(options.label, "label"));
  label.id = `${id}-label`;
  label.htmlFor = `${id}-range`;
  label.title = requireText(options.label, "label");
  root.appendChild(label);

  if (options.description !== undefined) {
    const description = element(doc, "span", "ch-slider-field__description", options.description);
    description.id = `${id}-description`;
    root.appendChild(description);
  }

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
  if (options.unit !== undefined) {
    controls.appendChild(element(doc, "span", "ch-slider-field__unit", options.unit));
  }
  root.appendChild(controls);

  const state = createStateBinding(doc, root, id, options);
  const disabled = createDisabledBinding(doc, root, id, options);
  bindDisabledExplanation(disabled, [range, numberInput]);
  let current = snap(options.value, min, max, step);

  function blocked(): boolean {
    return disabled.disabled || stateBlocksInteraction(state.state);
  }

  function valueText(value: number): string {
    if (options.formatValue !== undefined) return options.formatValue(value);
    return options.unit === undefined ? String(value) : `${value} ${options.unit}`;
  }

  function refreshValue(): void {
    const stringValue = String(current);
    range.value = stringValue;
    numberInput.value = stringValue;
    range.setAttribute("aria-valuemin", String(min));
    range.setAttribute("aria-valuemax", String(max));
    range.setAttribute("aria-valuenow", stringValue);
    range.setAttribute("aria-valuetext", valueText(current));
    const progress = (current - min) / (max - min);
    fill.setAttribute("style", `--motion-progress:${progress}`);
    removeAttribute(numberInput, "aria-invalid");
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
        : requireText(options.label, "label");
      const baseIds = options.description === undefined ? [] : [`${id}-description`];
      updateInteractiveDescriptions(target, state, disabled, baseIds);
    }
  }

  function assign(value: number): void {
    current = snap(requireFinite(value, "value"), min, max, step);
    refreshValue();
  }

  function emitValue(value: number, commit: boolean): void {
    assign(value);
    options.onInput(current);
    if (commit) options.onCommit(current);
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
    options.onInput(current);
  });
  range.addEventListener("change", () => {
    if (blocked()) {
      refreshValue();
      return;
    }
    assign(Number(range.value));
    options.onCommit(current);
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
      const dragging = eventName === "pointerdown";
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
    current = snap(draft, min, max, step);
    range.value = String(current);
    range.setAttribute("aria-valuenow", String(current));
    range.setAttribute("aria-valuetext", valueText(current));
    fill.setAttribute("style", `--motion-progress:${(current - min) / (max - min)}`);
    options.onInput(current);
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
    options.onCommit(current);
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
  label.addEventListener("click", () => range.focus());
  label.addEventListener("dblclick", () => {
    if (!blocked()) emitValue(options.defaultValue, true);
  });

  refreshValue();
  refreshDisabled();

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
      applyState(root, state, nextState, stateLabel);
      refreshDisabled();
    },
    setDisabled(nextDisabled, disabledReason) {
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refreshDisabled();
    }
  };
}

export interface ChipItem {
  value: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ChipGroupOptions extends InteractiveOptions {
  id: string;
  label: string;
  value: string;
  items: readonly ChipItem[];
  onChange(value: string): void;
}

export interface ChipGroupController extends StatefulController, DisableableController {
  readonly element: HTMLElement;
  readonly chips: readonly HTMLButtonElement[];
  readonly value: string | null;
  setValue(value: string): void;
}

export function createChipGroup(doc: Document, options: ChipGroupOptions): ChipGroupController {
  const id = resolveId(options.id, "chips");
  const root = element(doc, "div", "ch-chip-group");
  root.id = `${id}-component`;
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  const state = createStateBinding(doc, root, id, options);
  const disabled = createDisabledBinding(doc, root, id, options);

  const seen = new Set<string>();
  for (const item of options.items) {
    requireText(item.value, "item.value");
    requireText(item.label, "item.label");
    if (seen.has(item.value)) throw new Error(`Duplicate chip value: ${item.value}`);
    seen.add(item.value);
    validateDisabled(item.disabled ?? false, item.disabledReason);
  }
  if (options.items.length > 0 && !seen.has(options.value)) {
    throw new Error("value must match a chip item.");
  }

  const chips: HTMLButtonElement[] = [];
  let current: string | null = options.items.length === 0 ? null : options.value;

  function itemBlocked(index: number): boolean {
    return disabled.disabled
      || stateBlocksInteraction(state.state)
      || options.items[index]?.disabled === true;
  }

  function usableIndices(): number[] {
    const indices: number[] = [];
    for (const [index] of options.items.entries()) {
      if (!itemBlocked(index)) indices.push(index);
    }
    return indices;
  }

  function selectedIndex(): number {
    return options.items.findIndex((item) => item.value === current);
  }

  function refresh(): void {
    const usable = usableIndices();
    const selected = selectedIndex();
    const tabIndex = selected >= 0 && !itemBlocked(selected) ? selected : usable[0] ?? 0;
    if (state.state === "loading") root.setAttribute("aria-busy", "true");
    else removeAttribute(root, "aria-busy");
    for (const [index, chip] of chips.entries()) {
      const item = options.items[index];
      if (item === undefined) continue;
      const selectedNow = item.value === current;
      const marker = itemBlocked(index) ? "—" : selectedNow ? "●" : "○";
      chip.textContent = `${marker} ${item.label}`;
      chip.setAttribute("aria-checked", selectedNow ? "true" : "false");
      chip.setAttribute("data-active", selectedNow ? "true" : "false");
      chip.setAttribute("tabindex", index === tabIndex ? "0" : "-1");
      if (itemBlocked(index)) chip.setAttribute("aria-disabled", "true");
      else removeAttribute(chip, "aria-disabled");
      chip.title = disabled.disabled
        ? requireText(disabled.reason, "disabledReason")
        : stateBlocksInteraction(state.state)
          ? requireText(state.label, "stateLabel")
          : item.disabled
            ? requireText(item.disabledReason, "disabledReason")
            : item.label;
      const itemDescriptionIds = item.disabled ? [`${chip.id}-disabled-reason`] : [];
      updateInteractiveDescriptions(chip, state, disabled, itemDescriptionIds);
    }
    root.setAttribute("data-empty", options.items.length === 0 ? "true" : "false");
  }

  function select(index: number, notify: boolean, moveFocus = true): void {
    const item = options.items[index];
    const chip = chips[index];
    if (item === undefined || chip === undefined || itemBlocked(index)) return;
    current = item.value;
    refresh();
    if (moveFocus) chip.focus();
    if (notify) options.onChange(item.value);
  }

  function nextUsable(from: number, direction: 1 | -1): number | undefined {
    const usable = usableIndices();
    if (usable.length === 0) return undefined;
    const currentPosition = usable.indexOf(from);
    if (currentPosition < 0) return direction > 0 ? usable[0] : usable[usable.length - 1];
    return usable[(currentPosition + direction + usable.length) % usable.length];
  }

  for (const [index, item] of options.items.entries()) {
    const chip = element(doc, "button", "ch-chip", item.label);
    chip.id = `${id}-chip-${index + 1}`;
    chip.setAttribute("type", "button");
    chip.setAttribute("role", "radio");
    chip.setAttribute("data-motion", "preset-chip");

    if (item.disabled) {
      const reason = element(doc, "span", "ch-visually-hidden", requireText(item.disabledReason, "disabledReason"));
      reason.id = `${chip.id}-disabled-reason`;
      root.appendChild(reason);
      chip.setAttribute("aria-describedby", reason.id);
    }

    chip.addEventListener("click", (event) => {
      if (itemBlocked(index)) event.preventDefault();
      else select(index, true);
    });
    chip.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      let destination: number | undefined;
      if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "ArrowDown") {
        destination = nextUsable(index, 1);
      } else if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "ArrowUp") {
        destination = nextUsable(index, -1);
      } else if (keyboardEvent.key === "Home") {
        destination = usableIndices()[0];
      } else if (keyboardEvent.key === "End") {
        const usable = usableIndices();
        destination = usable[usable.length - 1];
      } else if (isActivationKey(keyboardEvent.key)) {
        event.preventDefault();
        select(index, true);
        return;
      } else {
        return;
      }
      if (destination === undefined) return;
      event.preventDefault();
      select(destination, true);
    });
    chips.push(chip);
    root.appendChild(chip);
  }
  bindDisabledExplanation(disabled, chips);
  refresh();

  return {
    element: root,
    chips,
    get value() {
      return current;
    },
    setValue(value) {
      const index = options.items.findIndex((item) => item.value === value);
      if (index < 0 || itemBlocked(index)) throw new Error("value must identify an available chip.");
      select(index, false, false);
    },
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
      refresh();
    },
    setDisabled(nextDisabled, disabledReason) {
      updateDisabledReason(disabled, nextDisabled, disabledReason);
      refresh();
    }
  };
}

export type OverlayCloseReason = "escape" | "backdrop" | "programmatic";

export interface PopoverOptions extends ComponentStateOptions {
  id: string;
  label: string;
  content: HTMLElement;
  initialFocus?: HTMLElement;
  onClose?(reason: OverlayCloseReason): void;
  scheduler?: ComponentScheduler;
}

export interface PopoverController extends StatefulController {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(origin?: HTMLElement): void;
  close(reason?: OverlayCloseReason): void;
  finishClose(): void;
}

function asFocusable(value: Element | null): HTMLElement | null {
  if (value === null) return null;
  const candidate = value as HTMLElement;
  return typeof candidate.focus === "function" ? candidate : null;
}

export function createPopover(doc: Document, options: PopoverOptions): PopoverController {
  const id = resolveId(options.id, "popover");
  const root = element(doc, "section", "ch-popover");
  root.id = id;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("tabindex", "-1");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-open", "false");
  root.setAttribute("data-motion", "preview-enter preview-exit");
  setHidden(root, true);
  root.appendChild(options.content);
  const state = createStateBinding(doc, root, id, options);
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  let opened = false;
  let returnFocus: HTMLElement | null = null;
  let closeTimer: unknown;

  function cancelCloseTimer(): void {
    if (closeTimer === undefined) return;
    scheduler.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function finishClose(): void {
    if (opened) return;
    cancelCloseTimer();
    setHidden(root, true);
    removeAttribute(root, "data-closing");
  }

  function close(reason: OverlayCloseReason = "programmatic"): void {
    if (!opened) return;
    opened = false;
    root.setAttribute("data-open", "false");
    root.setAttribute("data-closing", "true");
    root.setAttribute("aria-hidden", "true");
    closeTimer = scheduler.setTimeout(finishClose, 160);
    options.onClose?.(reason);
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  }

  root.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    close("escape");
  });
  root.addEventListener("animationend", (event) => {
    if (event.target === root) finishClose();
  });

  return {
    element: root,
    get isOpen() {
      return opened;
    },
    open(origin) {
      cancelCloseTimer();
      returnFocus = origin ?? asFocusable(doc.activeElement);
      opened = true;
      setHidden(root, false);
      removeAttribute(root, "data-closing");
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-open", "true");
      (options.initialFocus ?? root).focus();
    },
    close,
    finishClose,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
    }
  };
}

export interface DrawerOptions extends ComponentStateOptions {
  id: string;
  label: string;
  content: HTMLElement;
  overlay: boolean;
  initialFocus?: HTMLElement;
  onClose?(reason: OverlayCloseReason): void;
  scheduler?: ComponentScheduler;
}

export interface DrawerController extends StatefulController {
  readonly element: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly isOpen: boolean;
  open(origin?: HTMLElement): void;
  close(reason?: OverlayCloseReason): void;
  finishClose(): void;
}

const FOCUSABLE_TAGS = new Set(["button", "input", "select", "textarea", "a"]);

function focusableDescendants(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];

  // Percorrer a arvore uma vez preserva a ordem de leitura. Agrupar consultas
  // por tag colocaria todos os buttons antes de todos os inputs, mesmo quando a
  // ordem visual/DOM fosse a oposta — exatamente o tipo de trap sutil que A7.3
  // proibe.
  function visit(parent: HTMLElement): void {
    for (let index = 0; index < parent.children.length; index += 1) {
      const child = parent.children[index];
      if (child === undefined) continue;
      const candidate = child as HTMLElement & { disabled?: boolean };
      const tag = candidate.tagName.toLowerCase();
      if (
        FOCUSABLE_TAGS.has(tag)
        && candidate.disabled !== true
        && candidate.getAttribute("tabindex") !== "-1"
      ) {
        found.push(candidate);
      }
      visit(candidate);
    }
  }

  visit(root);
  return found;
}

export function createDrawer(doc: Document, options: DrawerOptions): DrawerController {
  const id = resolveId(options.id, "drawer");
  const root = element(doc, "aside", "ch-drawer");
  root.id = id;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", options.overlay ? "true" : "false");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-open", "false");
  root.setAttribute("data-overlay", options.overlay ? "true" : "false");
  root.setAttribute("data-motion", "drawer-enter drawer-exit drawer-stagger");
  root.setAttribute("tabindex", "-1");
  setHidden(root, true);
  root.appendChild(options.content);
  const state = createStateBinding(doc, root, id, options);
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;

  const backdrop = element(doc, "div", "ch-drawer-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.setAttribute("data-open", "false");
  backdrop.setAttribute("data-motion", "drawer-dimmer");
  setHidden(backdrop, true);

  let opened = false;
  let returnFocus: HTMLElement | null = null;
  let closeTimer: unknown;

  function cancelCloseTimer(): void {
    if (closeTimer === undefined) return;
    scheduler.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function finishClose(): void {
    if (opened) return;
    cancelCloseTimer();
    setHidden(root, true);
    setHidden(backdrop, true);
    removeAttribute(root, "data-closing");
  }

  function close(reason: OverlayCloseReason = "programmatic"): void {
    if (!opened) return;
    opened = false;
    root.setAttribute("data-open", "false");
    root.setAttribute("data-closing", "true");
    root.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("data-open", "false");
    closeTimer = scheduler.setTimeout(finishClose, 220);
    options.onClose?.(reason);
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  }

  root.addEventListener("keydown", (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Escape") {
      event.preventDefault();
      close("escape");
      return;
    }
    if (keyboardEvent.key !== "Tab" || !options.overlay || !opened) return;
    const focusables = focusableDescendants(root);
    if (focusables.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const activeIndex = focusables.indexOf(asFocusable(doc.activeElement) ?? root);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (keyboardEvent.shiftKey && (activeIndex <= 0 || doc.activeElement === root)) {
      event.preventDefault();
      last?.focus();
    } else if (!keyboardEvent.shiftKey && (activeIndex < 0 || activeIndex === focusables.length - 1)) {
      event.preventDefault();
      first?.focus();
    }
  });
  root.addEventListener("animationend", (event) => {
    if (event.target === root) finishClose();
  });
  backdrop.addEventListener("click", () => {
    if (options.overlay) close("backdrop");
  });

  return {
    element: root,
    backdrop,
    get isOpen() {
      return opened;
    },
    open(origin) {
      cancelCloseTimer();
      returnFocus = origin ?? asFocusable(doc.activeElement);
      opened = true;
      setHidden(root, false);
      root.setAttribute("aria-hidden", "false");
      root.setAttribute("data-open", "true");
      removeAttribute(root, "data-closing");
      if (options.overlay) {
        setHidden(backdrop, false);
        backdrop.setAttribute("data-open", "true");
      }
      const initial = options.initialFocus ?? focusableDescendants(root)[0] ?? root;
      initial.focus();
    },
    close,
    finishClose,
    setState(nextState, stateLabel) {
      applyState(root, state, nextState, stateLabel);
    }
  };
}

export interface ComponentScheduler {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

const DEFAULT_SCHEDULER: ComponentScheduler = {
  setTimeout(callback, delay) {
    return globalThis.setTimeout(callback, delay);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as number);
  }
};

export interface ToastAction {
  label: string;
  onPress(): void;
  dismissOnPress?: boolean;
}

export interface ToastOptions extends ComponentStateOptions {
  message: string;
  detail?: string;
  actions?: readonly ToastAction[];
  durationMs?: number;
  recoverable?: boolean;
  /** Reservado a erro de operacao destrutiva, conforme A7.5. */
  assertive?: boolean;
}

export interface ToastHandle {
  readonly id: string;
  readonly element: HTMLElement;
  readonly actions: readonly HTMLButtonElement[];
  dismiss(): void;
  pin(): void;
}

export interface ToastRegionOptions {
  id: string;
  label: string;
  dismissLabel: string;
  maxVisible?: number;
  scheduler?: ComponentScheduler;
}

export interface ToastRegionController {
  readonly element: HTMLElement;
  readonly items: readonly ToastHandle[];
  push(options: ToastOptions): ToastHandle;
  dismiss(id: string): void;
  clear(): void;
}

interface ManagedToast {
  handle: ToastHandle;
  timer?: unknown;
  closeTimer?: unknown;
  closing: boolean;
}

export function createToastRegion(
  doc: Document,
  options: ToastRegionOptions
): ToastRegionController {
  const id = resolveId(options.id, "toasts");
  const maxVisible = options.maxVisible ?? 3;
  if (!Number.isInteger(maxVisible) || maxVisible < 1 || maxVisible > 3) {
    throw new Error("maxVisible must be an integer from 1 to 3.");
  }
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const root = element(doc, "section", "ch-toast-region");
  root.id = id;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", requireText(options.label, "label"));
  root.setAttribute("data-empty", "true");
  const managed: ManagedToast[] = [];

  function cancelTimer(item: ManagedToast): void {
    if (item.timer === undefined) return;
    scheduler.clearTimeout(item.timer);
    delete item.timer;
  }

  function cancelCloseTimer(item: ManagedToast): void {
    if (item.closeTimer === undefined) return;
    scheduler.clearTimeout(item.closeTimer);
    delete item.closeTimer;
  }

  function finalize(item: ManagedToast): void {
    cancelTimer(item);
    cancelCloseTimer(item);
    const index = managed.indexOf(item);
    if (index >= 0) managed.splice(index, 1);
    if (item.handle.element.parentNode === root) root.removeChild(item.handle.element);
    root.setAttribute("data-empty", managed.length === 0 ? "true" : "false");
  }

  function beginDismiss(item: ManagedToast): void {
    if (item.closing) return;
    item.closing = true;
    cancelTimer(item);
    item.handle.element.setAttribute("data-open", "false");
    item.handle.element.setAttribute("data-closing", "true");
    item.handle.element.setAttribute("aria-hidden", "true");
    item.closeTimer = scheduler.setTimeout(() => finalize(item), 180);
  }

  function find(idToFind: string): ManagedToast | undefined {
    return managed.find((item) => item.handle.id === idToFind);
  }

  function push(toastOptions: ToastOptions): ToastHandle {
    const state = toastOptions.state ?? "default";
    validateState(state, toastOptions.stateLabel);
    if (toastOptions.assertive === true && state !== "error") {
      throw new Error("assertive is reserved for error toasts.");
    }
    if (toastOptions.durationMs !== undefined) {
      requireFinite(toastOptions.durationMs, "durationMs");
      if (toastOptions.durationMs < 0) throw new Error("durationMs must not be negative.");
    }
    const message = requireText(toastOptions.message, "message");
    const toastId = nextId(`${id}-toast`);
    const toast = element(doc, "article", "ch-toast");
    toast.id = toastId;
    toast.setAttribute("data-state", state);
    toast.setAttribute("data-open", "true");
    toast.setAttribute("data-motion", "toast-enter toast-exit");
    toast.setAttribute("role", toastOptions.assertive === true ? "alert" : "status");
    toast.setAttribute("aria-live", toastOptions.assertive === true ? "assertive" : "polite");
    toast.appendChild(element(doc, "div", "ch-toast__message", message));
    if (toastOptions.detail !== undefined) {
      toast.appendChild(element(doc, "div", "ch-toast__detail", toastOptions.detail));
    }
    const stateBinding = createStateBinding(doc, toast, toastId, toastOptions, false);
    applyState(toast, stateBinding, state, toastOptions.stateLabel);

    const actionRow = element(doc, "div", "ch-toast__actions");
    const actionButtons: HTMLButtonElement[] = [];
    const declaredActions = toastOptions.actions ?? [];
    for (const action of declaredActions) {
      const actionButton = element(doc, "button", "ch-toast__action", requireText(action.label, "action.label"));
      actionButton.setAttribute("type", "button");
      actionButtons.push(actionButton);
      actionRow.appendChild(actionButton);
    }
    const dismissButton = element(doc, "button", "ch-toast__dismiss", "×");
    dismissButton.setAttribute("type", "button");
    dismissButton.setAttribute("aria-label", requireText(options.dismissLabel, "dismissLabel"));
    dismissButton.title = options.dismissLabel;
    actionRow.appendChild(dismissButton);
    toast.appendChild(actionRow);

    // `item` é referenciado apenas dentro dos métodos abaixo, que só rodam
    // quando o usuário age — nunca durante a construção. Por isso a declaração
    // pode vir depois deles, e ser `const`.
    const handle: ToastHandle = {
      id: toastId,
      element: toast,
      actions: actionButtons,
      dismiss() {
        beginDismiss(item);
      },
      pin() {
        cancelTimer(item);
        toast.setAttribute("data-pinned", "true");
      }
    };
    const item: ManagedToast = { handle, closing: false };

    for (const [index, actionButton] of actionButtons.entries()) {
      const action = declaredActions[index];
      if (action === undefined) continue;
      actionButton.addEventListener("click", () => {
        action.onPress();
        if (action.dismissOnPress !== false) beginDismiss(item);
      });
    }
    dismissButton.addEventListener("click", () => beginDismiss(item));
    toast.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Escape") return;
      event.preventDefault();
      beginDismiss(item);
    });
    toast.addEventListener("focusin", handle.pin);
    toast.addEventListener("pointerenter", handle.pin);
    toast.addEventListener("animationend", (event) => {
      if (event.target === toast && item.closing) finalize(item);
    });

    if (managed.length >= maxVisible) {
      const oldest = managed[0];
      if (oldest !== undefined) finalize(oldest);
    }
    managed.push(item);
    root.appendChild(toast);
    root.setAttribute("data-empty", "false");

    const indefinite = toastOptions.recoverable === true && state === "error";
    if (indefinite) {
      toast.setAttribute("data-duration", "indefinite");
    } else {
      const minimum = declaredActions.length > 0 ? 8000 : 0;
      const fallback = declaredActions.length > 0 ? 8000 : 3000;
      const duration = Math.max(minimum, toastOptions.durationMs ?? fallback);
      toast.setAttribute("data-duration", String(duration));
      item.timer = scheduler.setTimeout(() => beginDismiss(item), duration);
    }

    return handle;
  }

  return {
    element: root,
    get items() {
      return managed.map((item) => item.handle);
    },
    push,
    dismiss(idToDismiss) {
      const item = find(idToDismiss);
      if (item !== undefined) beginDismiss(item);
    },
    clear() {
      for (const item of [...managed]) finalize(item);
    }
  };
}
