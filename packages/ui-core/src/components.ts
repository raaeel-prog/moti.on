import { registerMotiAlert } from "./elements/moti-alert.js";
import { mountAlertView, validateAlertOptions } from "./elements/alert-view.js";
import { registerMotiBadge } from "./elements/moti-badge.js";
import { mountBadgeView, validateBadgeOptions } from "./elements/badge-view.js";
import { registerMotiDrawer } from "./elements/moti-drawer.js";
import { mountDrawerView, validateDrawerOptions, type DrawerController, type DrawerOptions } from "./elements/drawer-view.js";
import { registerMotiPopover } from "./elements/moti-popover.js";
import { mountPopoverView, validatePopoverOptions, type PopoverController, type PopoverOptions } from "./elements/popover-view.js";
import { registerMotiSlider } from "./elements/moti-slider.js";
import { mountSliderView, validateSliderOptions } from "./elements/slider-view.js";
export { type DrawerController, type DrawerOptions, type PopoverController, type PopoverOptions };
/**
 * CHMS-UX-003 — primitivas de interface compartilhadas por CEP e UXP.
 *
 * Este modulo conhece apenas o subconjunto DOM comum aos dois runtimes. Ele
 * nunca chama host, storage, filesystem ou rede: consumidores ligam callbacks
 * a controllers e adapters fora da camada de apresentacao.
 */

import { createIcon } from "./shell.js";

import {
  type ComponentState,
  type ComponentStateOptions,
  type StatefulController,
  type DisableableController,
  type InteractiveOptions,
  type StateMarkers,
  STATE_MARKERS,
  nextId,
  requireText,
  resolveId,
  element,
  removeAttribute,
  validateState,
  createStateBinding,
  applyState,
  validateDisabled,
  createDisabledBinding,
  updateDisabledReason,
  bindDisabledExplanation,
  updateInteractiveDescriptions,
  isActivationKey,
  stateBlocksInteraction,
  createSpinner,
} from "./component-dom.js";

export {
  COMPONENT_STATES, createSpinner,
  type ComponentState, type ComponentStateOptions, type DisableableOptions,
  type StatefulController, type DisableableController
} from "./component-dom.js";
export { type ActionButtonController, type ActionButtonOptions } from "./elements/action-button-view.js";
import { mountActionButton, validateActionButtonOptions, type ActionButtonController, type ActionButtonOptions } from "./elements/action-button-view.js";
import { registerMotiButton } from "./elements/moti-button.js";
import { registerMotiToast } from "./elements/moti-toast.js";
import { mountToastView, validateToastViewOptions, type ToastView, type ToastViewOptions } from "./elements/toast-view.js";

export function createActionButton(doc: Document, options: ActionButtonOptions): ActionButtonController {
  validateActionButtonOptions(options);
  const id = resolveId(options.id, "action");
  const ButtonElement = registerMotiButton(doc);
  if (ButtonElement) {
    let root: HTMLElement | undefined;
    try {
      root = doc.createElement("moti-button");
    } catch {
      // A partial host registry may accept define() but reject construction.
      // The same presentation below remains usable through native elements.
    }
    // A registry shim must actually construct the registered element.
    if (root instanceof ButtonElement) {
      root.configure({ ...options, id });
      return {
        element: root,
        button: root.button,
        setState: (state, label) => root.setState(state, label),
        setDisabled: (disabled, reason) => root.setDisabled(disabled, reason)
      };
    }
  }
  const root = element(doc, "span");
  root.id = `${id}-component`;
  return mountActionButton(doc, root, id, options);
}

const TILE_STATE_MARKERS: StateMarkers = Object.freeze({
  ...STATE_MARKERS,
  success: "●"
});

const TILE_SPINNER_DELAY_MS = 180;
const TILE_CONFIRMATION_DURATION_MS = 700;

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

  function showIcon(text: string | null, feedback: "default" | "waiting" | "loading" | "success" | "disabled"): void {
    icon.textContent = "";
    if (feedback === "loading") {
      icon.appendChild(createSpinner(doc));
    } else if (text !== null) {
      icon.textContent = text;
    }
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
        if (!disabled.disabled && state.state === "loading") showIcon(null, "loading");
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

export function createSliderField(doc: Document, options: SliderFieldOptions): SliderFieldController {
  validateSliderOptions(options);
  const Constructor = registerMotiSlider(doc);
  if (Constructor) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-slider"); } catch { /* fallback */ }
    if (root instanceof Constructor) return root.configure(options);
  }
  return mountSliderView(doc, element(doc, "div"), options);
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



export function createPopover(doc: Document, options: PopoverOptions): PopoverController {
  validatePopoverOptions(options);
  const Constructor = registerMotiPopover(doc);
  if (Constructor) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-popover"); } catch { /* fallback */ }
    if (root instanceof Constructor) return root.configure(options);
  }
  return mountPopoverView(doc, element(doc, "div"), options);
}



export function createDrawer(doc: Document, options: DrawerOptions): DrawerController {
  validateDrawerOptions(options);
  const Constructor = registerMotiDrawer(doc);
  if (Constructor) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-drawer"); } catch { /* fallback */ }
    if (root instanceof Constructor) return root.configure(options);
  }
  return mountDrawerView(doc, element(doc, "div"), options);
}

export interface ComponentScheduler {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
  now?(): number;
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

export type FeedbackTone = "default" | "destructive" | "warning" | "success" | "info";

export interface ToastOptions extends ComponentStateOptions {
  message: string;
  detail?: string;
  actions?: readonly ToastAction[];
  durationMs?: number;
  recoverable?: boolean;
  /** A mesma ocorrência retorna o handle existente, inclusive enquanto aguarda. */
  dedupKey?: string;
  /** Reservado a erro de operacao destrutiva, conforme A7.5. */
  assertive?: boolean;
  tone?: FeedbackTone;
}

export interface ToastHandle {
  readonly id: string;
  readonly element: HTMLElement;
  readonly actions: readonly HTMLButtonElement[];
  dismiss(): void;
  pin(): void;
}

export interface ToastRegionLabels {
  label: string;
  dismissLabel: string;
  queuedLabel?: (count: number) => string;
  stateLabels?: Partial<Record<ComponentState, string>>;
}

export interface ToastRegionOptions extends ToastRegionLabels {
  id: string;
  maxVisible?: number;
  scheduler?: ComponentScheduler;
}

export interface ToastRegionController {
  readonly element: HTMLElement;
  /** Somente os avisos visíveis; no máximo maxVisible, incluindo os que saem. */
  readonly items: readonly ToastHandle[];
  readonly pending: readonly ToastHandle[];
  push(options: ToastOptions): ToastHandle;
  dismiss(id: string): void;
  updateLabels(labels: ToastRegionLabels): void;
  clear(): void;
  dispose(): void;
}

interface ManagedToast {
  handle: ToastHandle;
  view: ToastView;
  dismissButton: HTMLButtonElement;
  origin: HTMLElement | null;
  timer?: unknown;
  closeTimer?: unknown;
  key?: string;
  shown: boolean;
  closing: boolean;
  pinned: boolean;
  hovered: boolean;
  focused: boolean;
  remaining: number;
  startedAt: number;
}

function isWithin(node: Node | null, parent: Node): boolean {
  for (let current = node ?? null; current !== null; current = current.parentNode) {
    if (current === parent) return true;
  }
  return false;
}

function createToastView(doc: Document, options: ToastViewOptions): ToastView {
  validateToastViewOptions(options);
  const ToastElement = registerMotiToast(doc);
  if (ToastElement) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-toast"); } catch { /* Partial host registry: use native fallback. */ }
    if (root instanceof ToastElement) return root.configure(options);
  }
  return mountToastView(doc, element(doc, "article"), options);
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
  requireText(options.dismissLabel, "dismissLabel");
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const now = () => scheduler.now?.() ?? Date.now();
  let labels: ToastRegionLabels = options;
  let disposed = false;
  const root = element(doc, "section", "ch-toast-region");
  root.id = id;
  root.setAttribute("role", "region");
  root.setAttribute("tabindex", "-1");
  root.setAttribute("aria-label", requireText(labels.label, "label"));
  root.setAttribute("data-empty", "true");
  const queueButton = element(doc, "button", "ch-toast-queue");
  queueButton.setAttribute("type", "button");
  queueButton.setAttribute("aria-live", "polite");
  queueButton.setAttribute("data-motion", "button-press");
  const managed: ManagedToast[] = [];

  const visible = () => managed.filter((item) => item.shown);
  const pending = () => managed.filter((item) => !item.shown && !item.closing);

  function refreshQueue(): void {
    const count = pending().length;
    root.setAttribute("data-empty", managed.length === 0 ? "true" : "false");
    root.setAttribute("data-pending", String(count));
    if (count > 0) {
      queueButton.textContent = labels.queuedLabel?.(count) ?? `+${count}`;
      queueButton.setAttribute("aria-label", queueButton.textContent);
      if (queueButton.parentNode !== root) root.appendChild(queueButton);
    } else if (queueButton.parentNode === root) {
      // Se o último aviso da fila foi aberto pelo teclado, mantenha o foco nele.
      if (doc.activeElement === queueButton) visible()[visible().length - 1]?.dismissButton.focus();
      root.removeChild(queueButton);
    }
  }

  function cancelTimer(item: ManagedToast, retainRemaining = false): void {
    if (item.timer === undefined) return;
    scheduler.clearTimeout(item.timer);
    delete item.timer;
    if (retainRemaining) item.remaining = Math.max(0, item.remaining - (now() - item.startedAt));
  }

  function cancelCloseTimer(item: ManagedToast): void {
    if (item.closeTimer === undefined) return;
    scheduler.clearTimeout(item.closeTimer);
    delete item.closeTimer;
  }

  function resume(item: ManagedToast): void {
    if (disposed || !item.shown || item.closing || item.pinned || item.hovered || item.focused || item.timer !== undefined) return;
    item.startedAt = now();
    item.timer = scheduler.setTimeout(() => {
      delete item.timer;
      beginDismiss(item);
    }, item.remaining);
  }

  function pump(): void {
    if (disposed) return;
    let available = maxVisible - visible().length;
    for (const item of pending()) {
      if (available <= 0) break;
      item.shown = true;
      item.handle.element.setAttribute("data-open", "true");
      root.appendChild(item.handle.element);
      resume(item);
      available -= 1;
    }
    refreshQueue();
  }

  function finalize(item: ManagedToast): void {
    const index = managed.indexOf(item);
    if (index < 0) return;
    cancelTimer(item);
    cancelCloseTimer(item);
    managed.splice(index, 1);
    if (item.handle.element.parentNode === root) root.removeChild(item.handle.element);
    pump();
  }

  function moveFocusBeforeDismiss(item: ManagedToast): void {
    if (!isWithin(doc.activeElement, item.handle.element)) return;
    const next = visible().find((other) => other !== item && !other.closing);
    if (next) next.dismissButton.focus();
    else if (pending().length > 0) queueButton.focus();
    else if (item.origin?.parentNode && typeof item.origin.focus === "function") item.origin.focus();
    else root.focus();
  }

  function beginDismiss(item: ManagedToast): void {
    if (disposed || item.closing || !managed.includes(item)) return;
    moveFocusBeforeDismiss(item);
    item.closing = true;
    cancelTimer(item);
    if (!item.shown) {
      finalize(item);
      return;
    }
    item.handle.element.setAttribute("data-open", "false");
    item.handle.element.setAttribute("data-closing", "true");
    item.handle.element.setAttribute("aria-hidden", "true");
    item.dismissButton.setAttribute("tabindex", "-1");
    for (const action of item.handle.actions) action.setAttribute("tabindex", "-1");
    // UXP não garante animationend. O timeout segue toast-exit (140 ms).
    item.closeTimer = scheduler.setTimeout(() => finalize(item), 140);
  }

  queueButton.addEventListener("click", () => {
    if (disposed || pending().length === 0) return;
    const oldest = visible().find((item) => !item.closing);
    if (!oldest) return;
    cancelTimer(oldest, true);
    oldest.shown = false;
    oldest.hovered = false;
    oldest.focused = false;
    root.removeChild(oldest.handle.element);
    managed.splice(managed.indexOf(oldest), 1);
    managed.push(oldest);
    pump();
    visible()[visible().length - 1]?.dismissButton.focus();
  });

  function push(toastOptions: ToastOptions): ToastHandle {
    if (disposed) throw new Error("Cannot push a toast into a disposed region.");
    const state = toastOptions.state ?? "default";
    validateState(state, toastOptions.stateLabel);
    if (toastOptions.assertive === true && state !== "error") throw new Error("assertive is reserved for error toasts.");
    if (toastOptions.durationMs !== undefined) {
      requireFinite(toastOptions.durationMs, "durationMs");
      if (toastOptions.durationMs < 0) throw new Error("durationMs must not be negative.");
    }
    const message = requireText(toastOptions.message, "message");
    if (toastOptions.dedupKey !== undefined) {
      requireText(toastOptions.dedupKey, "dedupKey");
      const existing = managed.find((item) => item.key === toastOptions.dedupKey && !item.closing);
      if (existing) return existing.handle;
    }
    const toastId = nextId(`${id}-toast`);
    const declaredActions = toastOptions.actions ?? [];
    const view = createToastView(doc, {
      ...toastOptions, message, id: toastId, dismissLabel: labels.dismissLabel,
      canInteract: () => !disposed && !item.closing && item.shown,
      onAction: index => {
        const action = declaredActions[index];
        if (!action) return;
        action.onPress();
        if (action.dismissOnPress !== false) beginDismiss(item);
      },
      onDismiss: () => beginDismiss(item)
    });
    const toast = view.element;
    const actionButtons = view.actions;
    const dismissButton = view.dismissButton;

    const handle: ToastHandle = {
      id: toastId,
      element: toast,
      actions: actionButtons,
      dismiss() { beginDismiss(item); },
      pin() {
        if (disposed) return;
        item.pinned = true;
        cancelTimer(item);
        toast.setAttribute("data-pinned", "true");
        toast.setAttribute("data-duration", "indefinite");
      }
    };
    const indefinite = (toastOptions.recoverable === true && state === "error") || (state === "warning" && declaredActions.length > 0);
    const minimum = declaredActions.length > 0 ? 8000 : 0;
    const duration = Math.max(minimum, toastOptions.durationMs ?? (declaredActions.length > 0 ? 8000 : 3000));
    const item: ManagedToast = {
      handle, view, dismissButton,
      origin: isWithin(doc.activeElement, root) ? null : doc.activeElement as HTMLElement | null,
      shown: false, closing: false, pinned: indefinite, hovered: false, focused: false,
      remaining: duration, startedAt: 0
    };
    if (toastOptions.dedupKey !== undefined) item.key = toastOptions.dedupKey;
    toast.setAttribute("data-duration", indefinite ? "indefinite" : String(duration));

    toast.addEventListener("focusin", () => {
      item.focused = true;
      cancelTimer(item, true);
      toast.setAttribute("data-paused", "true");
    });
    toast.addEventListener("focusout", (event) => {
      if (isWithin((event as FocusEvent).relatedTarget as Node | null, toast)) return;
      item.focused = false;
      toast.setAttribute("data-paused", item.hovered ? "true" : "false");
      resume(item);
    });
    toast.addEventListener("pointerenter", () => {
      item.hovered = true;
      cancelTimer(item, true);
      toast.setAttribute("data-paused", "true");
    });
    toast.addEventListener("pointerleave", () => {
      item.hovered = false;
      toast.setAttribute("data-paused", item.focused ? "true" : "false");
      resume(item);
    });
    toast.addEventListener("animationend", (event) => {
      if (event.target === toast && item.closing && (event as AnimationEvent).animationName === "motion-toast-out") finalize(item);
    });
    managed.push(item);
    pump();
    return handle;
  }

  function clear(): void {
    for (const item of managed.splice(0)) {
      item.closing = true;
      item.shown = false;
      cancelTimer(item);
      cancelCloseTimer(item);
      if (item.handle.element.parentNode === root) root.removeChild(item.handle.element);
    }
    refreshQueue();
  }

  return {
    element: root,
    get items() { return visible().map((item) => item.handle); },
    get pending() { return pending().map((item) => item.handle); },
    push,
    dismiss(idToDismiss) {
      const item = managed.find((candidate) => candidate.handle.id === idToDismiss);
      if (item !== undefined) beginDismiss(item);
    },
    updateLabels(nextLabels) {
      requireText(nextLabels.label, "label");
      requireText(nextLabels.dismissLabel, "dismissLabel");
      for (const item of managed) {
        const label = nextLabels.stateLabels?.[item.view.state];
        if (label !== undefined) validateState(item.view.state, label);
      }
      labels = nextLabels;
      root.setAttribute("aria-label", requireText(labels.label, "label"));
      for (const item of managed) {
        item.view.updateLabels(labels.dismissLabel, labels.stateLabels?.[item.view.state]);
      }
      refreshQueue();
    },
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      if (root.parentNode) root.parentNode.removeChild(root);
    }
  };
}

export interface BadgeOptions {
  label: string;
  tone?: FeedbackTone;
  /** O rótulo permanece visível mesmo quando o pictograma está oculto. */
  showIcon?: boolean;
}

export interface BadgeController {
  readonly element: HTMLElement;
  setLabel(label: string): void;
  setTone(tone: FeedbackTone): void;
}

export function createBadge(doc: Document, options: BadgeOptions): BadgeController {
  validateBadgeOptions(options);
  const Constructor = registerMotiBadge(doc);
  if (Constructor) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-badge"); } catch { /* fallback */ }
    if (root instanceof Constructor) return root.configure(options);
  }
  return mountBadgeView(doc, element(doc, "span"), options);
}

export interface AlertOptions {
  id?: string;
  title: string;
  description?: string;
  tone?: FeedbackTone;
  icon?: string;
  actions?: readonly ToastAction[];
  dismissLabel?: string;
  onDismiss?(): void;
  assertive?: boolean;
  scheduler?: ComponentScheduler;
}

export interface AlertController {
  readonly element: HTMLElement;
  setTone(tone: FeedbackTone): void;
  setTitle(title: string): void;
  setDescription(description: string): void;
  dismiss(): void;
  dispose(): void;
}

export function createAlert(doc: Document, options: AlertOptions): AlertController {
  validateAlertOptions(options);
  const Constructor = registerMotiAlert(doc);
  if (Constructor) {
    let root: HTMLElement | undefined;
    try { root = doc.createElement("moti-alert"); } catch { /* fallback */ }
    if (root instanceof Constructor) return root.configure(options);
  }
  return mountAlertView(doc, element(doc, "div"), options);
}

export function createSpinnerContainer(doc: Document): HTMLElement {
  const container = element(doc, "div", "ch-spinner-container");
  container.appendChild(createSpinner(doc));
  return container;
}

export function createSkeleton(doc: Document, width = "100%", height = "20px"): HTMLElement {
  const root = element(doc, "div", "ch-skeleton");
  root.style.width = width;
  root.style.height = height;
  return root;
}

export interface EmptyStateOptions {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function createEmptyState(doc: Document, options: EmptyStateOptions): HTMLElement {
  const root = element(doc, "div", "ch-empty-state");
  root.setAttribute("data-motion", "empty-state");
  const iconContainer = element(doc, "div", "ch-empty-state__icon");
  iconContainer.appendChild(createIcon(doc, options.icon));
  iconContainer.setAttribute("aria-hidden", "true");
  root.appendChild(iconContainer);

  const title = element(doc, "h3", "ch-empty-state__title", options.title);
  root.appendChild(title);

  if (options.description) {
    const desc = element(doc, "p", "ch-empty-state__description", options.description);
    root.appendChild(desc);
  }

  if (options.action) {
    const btnContainer = element(doc, "div", "ch-empty-state__actions");
    const btn = doc.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-motion", "button-press");
    btn.className = "ch-button ch-button--primary";
    btn.textContent = options.action.label;
    btn.addEventListener("click", options.action.onClick);
    btnContainer.appendChild(btn);
    root.appendChild(btnContainer);
  }

  return root;
}
