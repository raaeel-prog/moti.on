export interface ScrubbableNumberOptions {
  /** An invisible, larger press area, such as the numeric row around the value. */
  hitTarget?: HTMLElement;
  /** Horizontal pixels per normal increment. Shift slows the gesture tenfold. */
  pixelsPerStep?: number;
  /** Pointer movement required before a click becomes a drag. */
  dragThreshold?: number;
  /** Initial reference for dragging a field displaying mixed values. */
  mixedValue?: number;
  /** Optional localized help; existing titles are preserved by default. */
  helpText?: string;
  /** Host integrations may open a transaction once the drag threshold is crossed. */
  onGestureStart?: (initial: number) => boolean | void;
  /** Fired once for an active drag, including interruption and disposal. */
  onGestureEnd?: (value: number, canceled: boolean) => void;
  /** Native input events also fire for existing consumers. */
  onInput?: (value: number) => void;
  /** Native change events also fire; consumers decide whether to apply. */
  onCommit?: (value: number) => void;
}

type Gesture = {
  startX: number;
  lastX: number;
  value: number;
  draft: string;
  pointerId: number | null;
  active: boolean;
  removeListeners: Array<() => void>;
  
  limits: { min: number; max: number; step: number };
};

/** Compact typing affordance for a numeric field whose live drag is unavailable. */
export function attachCompactNumberEditing(input: HTMLInputElement): () => void {
  input.classList.add("ch-compact-number");
  const fit = (): void => { input.style.setProperty("--ch-number-width", `${Math.max(1,input.value.length)+0.8}ch`); };
  const focus = (): void => { input.setAttribute("data-number-editing","true"); };
  const blur = (): void => { input.removeAttribute("data-number-editing");fit(); };
  const key = (event: KeyboardEvent): void => {
    if(event.key === "Enter" && !event.isComposing) { event.preventDefault();fit();input.blur(); }
  };
  input.addEventListener("input",fit);input.addEventListener("focus",focus);
  input.addEventListener("blur",blur);input.addEventListener("keydown",key);fit();
  return () => {
    input.removeEventListener("input",fit);input.removeEventListener("focus",focus);
    input.removeEventListener("blur",blur);input.removeEventListener("keydown",key);
    input.classList.remove("ch-compact-number");blur();
  };
}

/** Enhance an existing numeric field without owning its validation or host state.
 * A click selects the value for typing; horizontal dragging and ↑/↓ change the local draft.
 * Shift is fine, Alt/Option is coarse. Return cleanup to dispose with the view.
 */
export function attachScrubbableNumber(input: HTMLInputElement, options: ScrubbableNumberOptions = {}): () => void {
  const doc = input.ownerDocument;
  const view = doc.defaultView;
  const hitTarget = options.hitTarget ?? input;
  const previousType = input.type;
  const previousTitle = input.title;
  const previousAttributes = new Map<string, string | null>();
  for (const name of ["inputmode", "role", "data-scrubbable-number", "data-scrub-pressed", "data-scrubbing", "data-number-editing", "aria-valuemin", "aria-valuemax", "aria-valuenow"]) {
    previousAttributes.set(name, input.getAttribute(name));
  }
  const hadClass = input.className.split(/\s+/).includes("ch-scrubbable-number");
  if (!hadClass) input.className += " ch-scrubbable-number";
  // Chromium number inputs erase intermediate drafts such as '-' and '1,'.
  input.type = "text";
  input.setAttribute("role", "spinbutton");
  input.setAttribute("data-scrubbable-number", "true");
  if (options.helpText) input.title = options.helpText;
  let gesture: Gesture | null = null;
  let disposed = false;
  let focusDraft = input.value;
  let lastCommitted = input.value;
  let suppressClick = false;
  const removers: Array<() => void> = [];
  const pixels = positive(options.pixelsPerStep, 4);
  const threshold = positive(options.dragThreshold, 3);

  function positive(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  }
  function bound(text: string, fallback: number): number {
    const value = Number(text);
    return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
  }
  function limits(): { min: number; max: number; step: number } {
    return { min: bound(input.min, -Infinity), max: bound(input.max, Infinity), step: positive(Number(input.step), 1) };
  }
  function read(): number | undefined {
    const text = input.value.trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return undefined;
    const value = Number(text), { min, max, step } = limits();
    return Number.isFinite(value) && value >= min && value <= max && (step < 1 || Number.isInteger(value)) ? value : undefined;
  }
  function gestureValue(): number | undefined {
    const value=read();
    if(value!==undefined)return value;
    if(input.value.trim()===""&&input.getAttribute("data-mixed")==="true"&&typeof options.mixedValue==="number"&&Number.isFinite(options.mixedValue))return options.mixedValue;
    return undefined;
  }
  function unavailable(): boolean { return disposed || input.disabled || input.readOnly; }
  function listen(target: EventTarget, type: string, callback: EventListener, list = removers, options?: boolean | AddEventListenerOptions): void {
    if (typeof target.addEventListener !== "function") return;
    target.addEventListener(type, callback, options);
    list.push(() => { if (typeof target.removeEventListener === "function") target.removeEventListener(type, callback, options); });
  }
  function emit(type: "input" | "change"): boolean {
    if (typeof input.dispatchEvent !== "function" || typeof doc.createEvent !== "function") return false;
    const event = doc.createEvent("Event");
    event.initEvent(type, true, false);
    input.dispatchEvent(event);
    return true;
  }
  function fitValue(): void { input.style?.setProperty?.("--ch-number-width", `${Math.max(1,input.value.length)+0.8}ch`); }
  function syncAria(): void {
    fitValue();
    const { min, max, step } = limits();
    input.setAttribute("inputmode", step < 1 ? "decimal" : "numeric");
    if (Number.isFinite(min)) input.setAttribute("aria-valuemin", String(min));
    else input.removeAttribute("aria-valuemin");
    if (Number.isFinite(max)) input.setAttribute("aria-valuemax", String(max));
    else input.removeAttribute("aria-valuemax");
    const value = read();
    if (value !== undefined) input.setAttribute("aria-valuenow", String(value));
    else input.removeAttribute("aria-valuenow");
  }
  function notifyInput(): void {
    syncAria();
    const value = read();
    if (value !== undefined) options.onInput?.(value);
  }
  function publish(): void {
    if (!emit("input")) notifyInput();
  }
  function commit(): void {
    if (unavailable() || read() === undefined || input.value === lastCommitted) return;
    lastCommitted = input.value;
    focusDraft = input.value;
    options.onCommit?.(read() as number);
    emit("change");
  }
  function setValue(value: number, fine: boolean, limitsCache?: { min: number, max: number, step: number }): void {
    const { min, max, step } = limitsCache || limits();
    if (min > max) return;
    const quantum = step < 1 && fine ? step / 10 : step;
    const base = Number.isFinite(min) ? min : 0;
    const rounded = base + Math.round((value - base) / quantum) * quantum;
    const next = String(Number(Math.max(min, Math.min(max, rounded)).toFixed(10)));
    if (next === input.value) return;
    input.value = next;
    publish();
  }
  function modifier(event: MouseEvent | KeyboardEvent): number { return event.shiftKey ? 0.1 : event.altKey ? 10 : 1; }
  function finish(cancel: boolean): void {
    const current = gesture;
    if (!current) return;
    gesture = null;
    current.removeListeners.forEach(remove => remove());
    input.removeAttribute("data-scrub-pressed");
    input.removeAttribute("data-scrubbing");
    doc.body?.classList?.remove("ch-global-scrubbing");
    if (current.pointerId !== null && typeof input.hasPointerCapture === "function" && input.hasPointerCapture(current.pointerId)) {
      try { input.releasePointerCapture(current.pointerId); } catch { /* Host may already have released capture. */ }
    }
    suppressClick = true;
    if (!current.active) {
      if (!cancel && !unavailable() && input.isConnected !== false) {
        input.focus();
        if (typeof input.select === "function") input.select();
      }
      return;
    }
    if (cancel) {
      if (input.value !== current.draft) { input.value = current.draft; publish(); }
    } else commit();
    options.onGestureEnd?.(read() ?? current.value, cancel);
  }
  function move(event: MouseEvent | PointerEvent): void {
    const current = gesture;
    if (!current || (current.pointerId !== null && (event as PointerEvent).pointerId !== current.pointerId)) return;
    if (unavailable() || input.isConnected === false) { finish(true); return; }
    if (!current.active && Math.abs(event.clientX - current.startX) < threshold) return;
    if (!current.active) {
      if (options.onGestureStart?.(current.value) === false) { finish(true); return; }
      current.active = true;
      input.setAttribute("data-scrubbing", "true");
      doc.body?.classList?.add("ch-global-scrubbing");
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
    event.preventDefault();
    const { min, max, step } = current.limits;
    current.value = Math.max(min, Math.min(max, current.value + (event.clientX - current.lastX) / pixels * step * modifier(event)));
    current.lastX = event.clientX;
    setValue(current.value, event.shiftKey, current.limits);
  }
  function start(event: MouseEvent | PointerEvent, pointer: boolean): void {
    if (unavailable() || event.button !== 0 || (pointer && (event as PointerEvent).isPrimary === false)) return;
    if (gesture) { event.preventDefault(); return; } // Ignore compatibility mousedown after pointerdown.
    const value = gestureValue();
    if (value === undefined) return; // Keep invalid text editable; dragging must not erase it.
    // Claim the press before Chromium starts selecting or dragging the text.
    // Waiting for the movement threshold is too late for a native text field.
    event.preventDefault();
    suppressClick = false;
    const current: Gesture = { startX: event.clientX, lastX: event.clientX, value, draft: input.value,
      pointerId: pointer ? (event as PointerEvent).pointerId : null, active: false, removeListeners: [], limits: limits() };
    gesture = current;
    input.setAttribute("data-scrub-pressed", "true");
    const target = typeof doc.addEventListener === "function" && typeof doc.removeEventListener === "function" ? doc : input;
    const kind = pointer ? "pointer" : "mouse";
    listen(target, `${kind}move`, event => move(event as MouseEvent), current.removeListeners);
    listen(target, `${kind}up`, event => {
      if (current.pointerId === null || (event as PointerEvent).pointerId === current.pointerId) finish(false);
    }, current.removeListeners);
    if (pointer) listen(target, "pointercancel", event => {
      if ((event as PointerEvent).pointerId === current.pointerId) finish(true);
    }, current.removeListeners);
    listen(target, "keydown", event => {
      if ((event as KeyboardEvent).key === "Escape") { event.preventDefault(); finish(true); }
    }, current.removeListeners);
    if (view) listen(view, "blur", () => finish(true), current.removeListeners);
    if (current.pointerId !== null && typeof input.setPointerCapture === "function") {
      try { input.setPointerCapture(current.pointerId); } catch { /* Document listeners retain the gesture. */ }
    }
  }
  // Listen to both: some host runtimes expose PointerEvent without delivering it.
  // start() ignores the compatibility mouse press when a pointer gesture exists.
  listen(hitTarget, "pointerdown", event => start(event as PointerEvent, true));
  listen(hitTarget, "mousedown", event => start(event as MouseEvent, false));
  for (const type of ["selectstart", "dragstart"]) listen(hitTarget, type, event => {
    if (gesture) event.preventDefault();
  });
  listen(input, "lostpointercapture", () => finish(true));
  listen(hitTarget, "click", event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
  });
  listen(hitTarget, "wheel", event => {
    const wheel = event as WheelEvent;
    if (unavailable() || wheel.deltaY === 0) return;
    const value = gestureValue();
    if (value === undefined) return;
    wheel.preventDefault();
    const { step } = limits();
    const sign = wheel.deltaY < 0 ? 1 : -1;
    const scale = modifier(wheel);
    const increment = step >= 1 ? Math.max(step, step * scale) : step * scale;
    setValue(value + sign * increment, wheel.shiftKey);
    commit();
  }, removers, { passive: false });
  listen(input, "focus", () => { input.setAttribute("data-number-editing","true");focusDraft = input.value; lastCommitted = input.value; });
  listen(input, "blur", () => { input.removeAttribute("data-number-editing");if (gesture) finish(true); else commit(); });
  listen(input, "input", notifyInput);
  listen(input, "change", () => {
    const value = read();
    if (value !== undefined && !unavailable() && input.value !== lastCommitted) {
      lastCommitted = input.value;
      focusDraft = input.value;
      options.onCommit?.(value);
    }
  });
  listen(input, "keydown", event => {
    const key = event as KeyboardEvent;
    if (unavailable() || key.isComposing) return;
    if (key.key === "Escape") {
      key.preventDefault();
      if (gesture) finish(true);
      else if (input.value !== focusDraft) { input.value = focusDraft; publish(); }
      return;
    }
    if (key.key === "Enter") { key.preventDefault(); commit(); input.removeAttribute("data-number-editing"); if(typeof input.setSelectionRange==="function")input.setSelectionRange(input.value.length,input.value.length);input.blur?.(); return; }
    if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(key.key)) return;
    const value = gestureValue();
    if (value === undefined) return;
    key.preventDefault();
    const { step } = limits();
    const sign = key.key === "ArrowUp" || key.key === "PageUp" ? 1 : -1;
    const scale = key.key.startsWith("Page") ? 10 : modifier(key);
    const increment = step >= 1 ? Math.max(step, step * scale) : step * scale;
    setValue(value + sign * increment, key.shiftKey);
    commit();
  });
  syncAria();
  return () => {
    if (disposed) return;
    finish(true);
    disposed = true;
    removers.forEach(remove => remove());
    // Do not restore type=number when doing so would destroy an unfinished draft.
    if (previousType !== "number" || read() !== undefined) input.type = previousType;
    if (options.helpText && input.title === options.helpText) input.title = previousTitle;
    if (!hadClass) input.className = input.className.split(/\s+/).filter(name => name !== "ch-scrubbable-number").join(" ");
    previousAttributes.forEach((value, name) => value === null || value === undefined ? input.removeAttribute(name) : input.setAttribute(name, value));
  };
}
