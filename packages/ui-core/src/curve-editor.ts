/**
 * Flow-style easing curve editor.
 *
 * One task dominates the view: the plot. The header holds the mode menu and
 * the direction dots; parameter fields live below the plot in normal flow so
 * the editor still works docked at 280 px. All math is pure and comes from
 * `@motion/keyframe-core`; this file only maps it to SVG and gestures.
 *
 * Gesture rules follow `bezier.ts`: pointer capture first, a bounded mouse
 * fallback registered on the document only during a gesture, Y refit only when
 * nothing is being dragged, every handle a keyboard `slider`.
 */
import {
  DEFAULT_BACK_OVERSHOOT,
  DEFAULT_BOUNCE,
  DEFAULT_ELASTIC,
  DEFAULT_HALF_CURVE,
  backCurve,
  clamp,
  constrainCurveEnds,
  constrainCurvePoint,
  fitRange,
  insertCurvePoint,
  multiPointValueAt,
  peakSpeed,
  sampleBezierSpeed,
  sampleEasing,
  speedDragToCurve,
  type CubicBezierCurve,
  type CurvePoint,
  type EasingDirection,
  type EasingMode,
  type EasingParams,
  type OscillationParams
} from "@motion/keyframe-core";
import { attachScrubbableNumber } from "./scrubbable-number.js";
import { createElement } from "./shell.js";

export interface CurveEditorModel {
  mode: EasingMode;
  direction: EasingDirection;
  view: "value" | "speed";
  /** Bezier mode handles in absolute plot coordinates (y may be -1..2). */
  curve: CubicBezierCurve;
  /** Bezier mode interior points. */
  points: CurvePoint[];
  back: { overshoot: number };
  elastic: EasingParams;
  bounce: EasingParams;
}

export interface CurveEditorLabels {
  graph: string;
  modeMenu: string;
  modes: Record<EasingMode, string>;
  directions: Record<EasingDirection, string>;
  directionGroup: string;
  speedView: string;
  valueView: string;
  reset: string;
  addPointHint: string;
  outHandle: string;
  inHandle: string;
  point: string;
  pointIn: string;
  pointOut: string;
  speedLeft: string;
  speedRight: string;
  peak: string;
  amp: string;
  freq: string;
  decay: string;
  start: string;
  overshoot: string;
  inHalf: string;
  outHalf: string;
}

export type CurveCommitReason = "gesture" | "keyboard" | "field" | "mode" | "direction" | "view" | "reset" | "point";

export interface CurveEditorOptions {
  model: CurveEditorModel;
  labels: CurveEditorLabels;
  /** Slot at the far right of the header (e.g. a live toggle). */
  headerEnd?: HTMLElement;
  /** Fired during drags; the host does not apply yet. */
  onInput(model: CurveEditorModel): void;
  /** Fired on release, field commit, keyboard step, mode, direction, view, reset and point add/remove. */
  onCommit(model: CurveEditorModel, reason: CurveCommitReason): void;
}

export interface CurveEditor {
  element: HTMLElement;
  setModel(model: CurveEditorModel, options?: { silent?: boolean }): void;
  getModel(): CurveEditorModel;
  dispose(): void;
}

export interface PlotRange { low: number; high: number }

const SVG_NS = "http://www.w3.org/2000/svg";
/** Plot square and the padding that lets handles leave the 0..1 box without clipping. */
export const CURVE_PLOT = 320;
export const CURVE_PAD = 24;
const SIZE = CURVE_PLOT + CURVE_PAD * 2;
const FINE = 0.01;
const COARSE = 0.1;
const Y_MIN = -1;
const Y_MAX = 2;
const MODES: EasingMode[] = ["bezier", "back", "elastic", "bounce"];
const DIRECTIONS: EasingDirection[] = ["in", "inOut", "out"];
const DEFAULT_CURVE: CubicBezierCurve = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };

/** 16×16 glyphs for the mode menu. Strokes only, so they follow `currentColor`. */
const MODE_ICONS: Record<EasingMode, string> = {
  bezier: "M2 13 C 7 13 9 3 14 3",
  back: "M2 13 C 6 13 8 1 10 2 C 12 3 12 4 14 4",
  elastic: "M2 13 C 5 13 5 1 7 3 C 9 6 9 2 11 3 C 12 4 13 4 14 4",
  bounce: "M2 13 L 5 4 L 8 13 L 10 8 L 12 13 L 14 11"
};
const SPEED_ICON = "M2 13 C 6 13 6 3 8 3 C 10 3 10 13 14 13";
const CARET_ICON = "M4 6 L 8 10 L 12 6";

let gradientCounter = 0;

function round3(value: number): number { return Math.round(value * 1000) / 1000; }
function fmt(value: number): string { return String(Math.round(value * 100) / 100); }

// --- pure helpers (exported for tests) --------------------------------------

export function curveToPlot(x: number, y: number, range: PlotRange): { x: number; y: number } {
  const span = range.high - range.low || 1;
  return { x: CURVE_PAD + x * CURVE_PLOT, y: CURVE_PAD + (range.high - y) / span * CURVE_PLOT };
}

export function plotToCurve(px: number, py: number, range: PlotRange): { x: number; y: number } {
  const span = range.high - range.low || 1;
  return { x: (px - CURVE_PAD) / CURVE_PLOT, y: range.high - (py - CURVE_PAD) / CURVE_PLOT * span };
}

function polylineD(samples: readonly (readonly [number, number])[], range: PlotRange): string {
  return samples.map((sample, index) => {
    const p = curveToPlot(sample[0], sample[1], range);
    return `${index ? "L" : "M"} ${fmt(p.x)},${fmt(p.y)}`;
  }).join(" ");
}

/** Exact cubic commands, one per segment between knots. */
function segmentsD(curve: CubicBezierCurve, points: readonly CurvePoint[], range: PlotRange): string {
  const knots = [{ x: 0, y: 0 }, ...points.map(p => ({ x: p.x, y: p.y })), { x: 1, y: 1 }];
  const start = curveToPlot(0, 0, range);
  let d = `M ${fmt(start.x)},${fmt(start.y)}`;
  for (let i = 0; i < knots.length - 1; i++) {
    const last = i === knots.length - 2;
    const p1 = i === 0 ? { x: curve.x1, y: curve.y1 } : { x: points[i - 1]!.outX, y: points[i - 1]!.outY };
    const p2 = last ? { x: curve.x2, y: curve.y2 } : { x: points[i]!.inX, y: points[i]!.inY };
    const a = curveToPlot(p1.x, p1.y, range), b = curveToPlot(p2.x, p2.y, range);
    const end = curveToPlot(knots[i + 1]!.x, knots[i + 1]!.y, range);
    d += ` C ${fmt(a.x)},${fmt(a.y)} ${fmt(b.x)},${fmt(b.y)} ${fmt(end.x)},${fmt(end.y)}`;
  }
  return d;
}

function paramsOf(model: CurveEditorModel): EasingParams {
  return model.mode === "bounce" ? model.bounce : model.elastic;
}

function easingSamples(model: CurveEditorModel, count = 256): [number, number][] {
  return sampleEasing(model.mode, paramsOf(model), model.direction, count).map((v, i, all) => [i / (all.length - 1), v]);
}

/** Path of the value curve drawn by the editor for `model`, in viewBox units. */
export function valuePathD(model: CurveEditorModel, range: PlotRange): string {
  if (model.mode === "bezier") return segmentsD(model.curve, model.points, range);
  if (model.mode === "back") return segmentsD(backCurve(model.back.overshoot, model.direction), [], range);
  return polylineD(easingSamples(model), range);
}

/** Path of the speed (dy/dx) curve of a single cubic, in viewBox units. */
export function speedPathD(curve: CubicBezierCurve, range: PlotRange): string {
  return polylineD(sampleBezierSpeed(curve, 129).map(s => [s.x, s.speed] as [number, number]), range);
}

function cloneParams(params: EasingParams): EasingParams {
  return {
    in: { ...params.in }, out: { ...params.out },
    inCurve: params.inCurve ? { ...params.inCurve } : null,
    outCurve: params.outCurve ? { ...params.outCurve } : null
  };
}

function cloneModel(model: CurveEditorModel): CurveEditorModel {
  return {
    mode: MODES.includes(model.mode) ? model.mode : "bezier",
    direction: DIRECTIONS.includes(model.direction) ? model.direction : "out",
    view: model.view === "speed" ? "speed" : "value",
    curve: {
      x1: clamp(model.curve.x1, 0, 1), y1: clamp(model.curve.y1, Y_MIN, Y_MAX),
      x2: clamp(model.curve.x2, 0, 1), y2: clamp(model.curve.y2, Y_MIN, Y_MAX)
    },
    points: model.points.map(p => ({ ...p })),
    back: { overshoot: clamp(model.back.overshoot, 0, 1) },
    elastic: cloneParams(model.elastic),
    bounce: cloneParams(model.bounce)
  };
}

function defaultParams(mode: EasingMode): EasingParams {
  const base: OscillationParams = mode === "bounce" ? DEFAULT_BOUNCE : DEFAULT_ELASTIC;
  return { in: { ...base }, out: { ...base }, inCurve: null, outCurve: null };
}

// --- editor ------------------------------------------------------------------

type Pt = { x: number; y: number };
type DragMove = (plot: Pt, event: MouseEvent) => void;

export function createCurveEditor(doc: Document, options: CurveEditorOptions): CurveEditor {
  const { labels } = options;
  let model = cloneModel(options.model);
  if (model.mode !== "bezier" || model.points.length) model.view = "value";
  let range: PlotRange = { low: 0, high: 1 };
  let disposed = false;
  let gesture: { pointerId: number | null; move: DragMove; moved: boolean } | null = null;
  let removeMouse: (() => void) | null = null;
  let removeMenuListeners: (() => void) | null = null;
  let fieldCleanups: (() => void)[] = [];
  let menuIndex = 0;

  const container = createElement(doc, "div", "ch-curve");
  const canSvg = typeof doc.createElementNS === "function";

  function svgEl(tag: string, cls: string, attrs: Record<string, string> = {}): SVGElement {
    const node = doc.createElementNS(SVG_NS, tag);
    node.setAttribute("class", cls);
    for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]!);
    return node;
  }
  function icon(path: string, cls = "ch-curve__icon"): SVGElement {
    const svg = svgEl("svg", cls, { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" });
    svg.appendChild(svgEl("path", "ch-curve__icon-path", { d: path }));
    return svg;
  }
  function show(node: Element, visible: boolean): void {
    if (visible) node.removeAttribute("display"); else node.setAttribute("display", "none");
    if (node.getAttribute("role") === "slider") node.setAttribute("tabindex", visible ? "0" : "-1");
  }
  function hideHtml(node: HTMLElement, hidden: boolean): void {
    node.hidden = hidden;
    if (hidden) node.setAttribute("hidden", ""); else node.removeAttribute("hidden");
  }
  function listenDoc(type: string, handler: EventListener): () => void {
    if (typeof doc.addEventListener !== "function") return () => undefined;
    doc.addEventListener(type, handler);
    return () => { if (typeof doc.removeEventListener === "function") doc.removeEventListener(type, handler); };
  }
  function emitInput(): void { options.onInput(cloneModel(model)); }
  function emitCommit(reason: CurveCommitReason): void { options.onCommit(cloneModel(model), reason); }

  // --- header ------------------------------------------------------------------
  const header = createElement(doc, "div", "ch-curve__header");
  const modeWrap = createElement(doc, "div", "ch-curve__mode");
  const modeButton = createElement(doc, "button", "ch-button ch-curve__mode-button") as HTMLButtonElement;
  modeButton.setAttribute("type", "button");
  modeButton.setAttribute("aria-haspopup", "listbox");
  modeButton.setAttribute("aria-expanded", "false");
  const modeIconSlot = createElement(doc, "span", "ch-curve__mode-icon");
  const modeText = createElement(doc, "span", "ch-curve__mode-text");
  modeButton.appendChild(modeIconSlot);
  modeButton.appendChild(modeText);
  if (canSvg) modeButton.appendChild(icon(CARET_ICON, "ch-curve__icon ch-curve__caret"));
  const menu = createElement(doc, "ul", "ch-curve__menu");
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", labels.modeMenu);
  menu.setAttribute("tabindex", "-1");
  hideHtml(menu, true);
  const optionNodes = MODES.map(mode => {
    const item = createElement(doc, "li", "ch-curve__option");
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "-1");
    item.setAttribute("data-mode", mode);
    if (canSvg) item.appendChild(icon(MODE_ICONS[mode]));
    item.appendChild(createElement(doc, "span", "ch-curve__option-label", labels.modes[mode]));
    item.addEventListener("click", () => { closeMenu(); setMode(mode); });
    item.addEventListener("keydown", e => menuKey(e as KeyboardEvent));
    menu.appendChild(item);
    return item;
  });
  modeButton.addEventListener("click", () => { if (menu.hidden) openMenu(); else closeMenu(); });
  modeButton.addEventListener("keydown", e => {
    const key = (e as KeyboardEvent).key;
    if (key === "ArrowDown" || key === "ArrowUp") { e.preventDefault(); openMenu(); }
  });
  modeWrap.appendChild(modeButton);
  modeWrap.appendChild(menu);
  modeWrap.addEventListener("focusout", e => {
    const next = (e as FocusEvent).relatedTarget as Node | null;
    if (menu.hidden) return;
    if (next && typeof modeWrap.contains === "function" && modeWrap.contains(next)) return;
    closeMenu(false);
  });
  header.appendChild(modeWrap);

  function focusOption(index: number): void {
    menuIndex = (index + MODES.length) % MODES.length;
    optionNodes.forEach((node, i) => node.setAttribute("tabindex", i === menuIndex ? "0" : "-1"));
    optionNodes[menuIndex]?.focus();
  }
  function openMenu(): void {
    if (!menu.hidden || disposed) return;
    hideHtml(menu, false);
    modeButton.setAttribute("aria-expanded", "true");
    focusOption(MODES.indexOf(model.mode));
    const outside = (e: Event): void => {
      const target = e.target as Node | null;
      if (target && typeof modeWrap.contains === "function" && modeWrap.contains(target)) return;
      closeMenu(false);
    };
    const removers = [listenDoc("pointerdown", outside), listenDoc("mousedown", outside)];
    removeMenuListeners = () => removers.forEach(remove => remove());
  }
  function closeMenu(refocus = true): void {
    if (menu.hidden) return;
    hideHtml(menu, true);
    modeButton.setAttribute("aria-expanded", "false");
    removeMenuListeners?.(); removeMenuListeners = null;
    if (refocus) modeButton.focus();
  }
  function menuKey(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowDown": focusOption(menuIndex + 1); break;
      case "ArrowUp": focusOption(menuIndex - 1); break;
      case "Home": focusOption(0); break;
      case "End": focusOption(MODES.length - 1); break;
      case "Enter": case " ": closeMenu(); setMode(MODES[menuIndex]!); break;
      case "Escape": closeMenu(); break;
      case "Tab": closeMenu(false); return;
      default: return;
    }
    event.preventDefault();
  }

  const directions = createElement(doc, "div", "ch-curve__directions");
  directions.setAttribute("role", "radiogroup");
  directions.setAttribute("aria-label", labels.directionGroup);
  const directionNodes = DIRECTIONS.map(direction => {
    const radio = createElement(doc, "button", "ch-curve__direction") as HTMLButtonElement;
    radio.setAttribute("type", "button");
    radio.setAttribute("role", "radio");
    radio.setAttribute("data-direction", direction);
    radio.setAttribute("aria-label", labels.directions[direction]);
    radio.title = labels.directions[direction];
    radio.addEventListener("click", () => setDirection(direction));
    radio.addEventListener("keydown", e => {
      const key = (e as KeyboardEvent).key;
      const index = DIRECTIONS.indexOf(model.direction);
      const next = key === "ArrowRight" || key === "ArrowDown" ? (index + 1) % DIRECTIONS.length
        : key === "ArrowLeft" || key === "ArrowUp" ? (index + DIRECTIONS.length - 1) % DIRECTIONS.length
        : key === "Home" ? 0 : key === "End" ? DIRECTIONS.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      setDirection(DIRECTIONS[next]!);
      directionNodes[next]?.focus();
    });
    directions.appendChild(radio);
    return radio;
  });
  header.appendChild(directions);
  if (options.headerEnd) {
    const end = createElement(doc, "div", "ch-curve__header-end");
    end.appendChild(options.headerEnd);
    header.appendChild(end);
  }
  container.appendChild(header);

  // --- plot ----------------------------------------------------------------------
  const plot = createElement(doc, "div", "ch-curve__plot");
  container.appendChild(plot);
  const fields = createElement(doc, "div", "ch-curve__fields");
  container.appendChild(fields);

  if (!canSvg) {
    // Without SVG the editor still exposes mode, direction and the fields.
    buildFields();
    render();
    return { element: container, setModel, getModel: () => cloneModel(model), dispose };
  }

  const svg = svgEl("svg", "ch-curve__svg", {
    viewBox: `0 0 ${SIZE} ${SIZE}`, preserveAspectRatio: "xMidYMid meet", role: "group", "aria-label": labels.graph
  }) as SVGSVGElement;
  const defs = svgEl("defs", "ch-curve__defs");
  const gradientId = `ch-curve-join-${++gradientCounter}`;
  const gradient = svgEl("linearGradient", "ch-curve__gradient", { id: gradientId, gradientUnits: "userSpaceOnUse", y1: "0", y2: "0" });
  gradient.appendChild(svgEl("stop", "ch-curve__stop ch-curve__stop--in", { offset: "0" }));
  gradient.appendChild(svgEl("stop", "ch-curve__stop ch-curve__stop--out", { offset: "1" }));
  defs.appendChild(gradient);
  svg.appendChild(defs);
  svg.appendChild(svgEl("rect", "ch-curve__bg", { x: "0", y: "0", width: String(SIZE), height: String(SIZE) }));
  for (let i = 0; i <= 4; i++) {
    const at = String(CURVE_PAD + i / 4 * CURVE_PLOT);
    svg.appendChild(svgEl("line", "ch-curve__grid", { x1: at, x2: at, y1: String(CURVE_PAD), y2: String(CURVE_PAD + CURVE_PLOT) }));
    svg.appendChild(svgEl("line", "ch-curve__grid", { y1: at, y2: at, x1: String(CURVE_PAD), x2: String(CURVE_PAD + CURVE_PLOT) }));
  }
  const axis = svgEl("path", "ch-curve__axis", { "aria-hidden": "true" });
  const reference = svgEl("line", "ch-curve__reference", { "aria-hidden": "true" });
  const ghost = svgEl("path", "ch-curve__ghost", { "aria-hidden": "true" });
  const faint = svgEl("path", "ch-curve__value ch-curve__value--faint", { "aria-hidden": "true" });
  const main = svgEl("path", "ch-curve__value");
  const halfIn = svgEl("path", "ch-curve__half ch-curve__half--in", { "aria-hidden": "true" });
  const halfOut = svgEl("path", "ch-curve__half ch-curve__half--out", { "aria-hidden": "true" });
  const join = svgEl("path", "ch-curve__join", { "aria-hidden": "true", stroke: `url(#${gradientId})` });
  const chip = svgEl("g", "ch-curve__chip", { "aria-hidden": "true" });
  chip.appendChild(svgEl("rect", "ch-curve__chip-bg", { x: "0", y: "0", width: String(SIZE), height: String(SIZE), rx: "40" }));
  const chipPath = svgEl("path", "ch-curve__chip-path");
  chip.appendChild(chipPath);
  const stems = [0, 1, 2, 3].map(() => svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }));
  const peakText = svgEl("text", "ch-curve__peak", {
    x: String(CURVE_PAD + CURVE_PLOT - 4), y: String(CURVE_PAD + 14), "text-anchor": "end", "aria-label": labels.peak
  });
  for (const node of [axis, reference, ghost, faint, main, halfIn, halfOut, join, ...stems]) svg.appendChild(node);

  function slider(label: string, cls = "ch-curve__handle"): SVGElement {
    const node = svgEl("circle", cls, { r: "5", role: "slider", tabindex: "0", "aria-label": label });
    return node;
  }
  const endHandles = [slider(labels.outHandle), slider(labels.inHandle)];
  const speedMarkers = [slider(labels.speedLeft, "ch-curve__marker"), slider(labels.speedRight, "ch-curve__marker")];
  const halfHandles = [slider(labels.outHandle), slider(labels.inHandle)];
  const pointsGroup = svgEl("g", "ch-curve__points");
  svg.appendChild(pointsGroup);
  for (const node of [...endHandles, ...halfHandles, ...speedMarkers, peakText, chip]) svg.appendChild(node);
  plot.appendChild(svg);

  const overlay = createElement(doc, "button", "ch-button ch-curve__overlay") as HTMLButtonElement;
  overlay.setAttribute("type", "button");
  overlay.addEventListener("click", onOverlay);
  plot.appendChild(overlay);
  const hint = createElement(doc, "div", "ch-curve__hint", labels.addPointHint);
  plot.appendChild(hint);

  type PointNodes = { knot: SVGElement; handleIn: SVGElement; handleOut: SVGElement; stemIn: SVGElement; stemOut: SVGElement };
  let pointNodes: PointNodes[] = [];

  // --- geometry -----------------------------------------------------------------
  function speedView(): boolean { return model.mode === "bezier" && model.view === "speed" && model.points.length === 0; }
  function halves(): boolean { return (model.mode === "elastic" || model.mode === "bounce") && model.direction === "inOut"; }
  function inHalfCurve(): CubicBezierCurve { return paramsOf(model).inCurve ?? DEFAULT_HALF_CURVE; }
  function fit(): void {
    if (gesture) return;
    if (speedView()) { range = { low: 0, high: Math.max(2, peakSpeed(model.curve) * 1.1) }; return; }
    const values: number[] = [];
    if (model.mode === "bezier") {
      values.push(model.curve.y1, model.curve.y2);
      for (const p of model.points) values.push(p.y, p.inY, p.outY);
      for (let i = 0; i <= 64; i++) values.push(multiPointValueAt(model.curve, model.points, i / 64));
    } else if (model.mode === "back") {
      const c = backCurve(model.back.overshoot, model.direction);
      values.push(c.y1, c.y2);
    } else {
      for (const [, v] of easingSamples(model, 128)) values.push(v);
      if (halves()) { const c = inHalfCurve(); values.push(c.y1 * 0.5, c.y2 * 0.5); }
    }
    range = fitRange(values, 0);
  }
  function plotPoint(event: MouseEvent): Pt | null {
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const source = svg.createSVGPoint(); source.x = event.clientX; source.y = event.clientY;
        const local = source.matrixTransform(matrix.inverse());
        return { x: local.x, y: local.y };
      }
    }
    if (typeof svg.getBoundingClientRect !== "function") return null;
    const box = svg.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const scale = Math.min(box.width / SIZE, box.height / SIZE);
    const left = box.left + (box.width - SIZE * scale) / 2;
    const top = box.top + (box.height - SIZE * scale) / 2;
    return { x: (event.clientX - left) / scale, y: (event.clientY - top) / scale };
  }
  function toCurve(p: Pt): Pt { return plotToCurve(p.x, p.y, range); }
  function place(node: SVGElement, x: number, y: number, text?: string): void {
    const p = curveToPlot(x, y, range);
    node.setAttribute("cx", fmt(p.x)); node.setAttribute("cy", fmt(p.y));
    node.setAttribute("aria-valuetext", text ?? `${round3(x)}, ${round3(y)}`);
  }
  function stem(node: SVGElement, ax: number, ay: number, bx: number, by: number): void {
    const a = curveToPlot(ax, ay, range), b = curveToPlot(bx, by, range);
    node.setAttribute("x1", fmt(a.x)); node.setAttribute("y1", fmt(a.y));
    node.setAttribute("x2", fmt(b.x)); node.setAttribute("y2", fmt(b.y));
  }

  // --- gestures -----------------------------------------------------------------
  function bindDrag(node: Element, begin: (event: MouseEvent) => DragMove | null): void {
    node.addEventListener("pointerdown", e => startDrag(e as PointerEvent, true, begin));
    node.addEventListener("mousedown", e => startDrag(e as MouseEvent, false, begin));
    node.addEventListener("pointermove", e => {
      const pe = e as PointerEvent;
      if (gesture && gesture.pointerId === pe.pointerId) moveEvent(pe);
    });
    node.addEventListener("pointerup", e => releasePointer(e as PointerEvent));
    node.addEventListener("pointercancel", e => releasePointer(e as PointerEvent));
    node.addEventListener("lostpointercapture", () => { if (gesture && gesture.pointerId !== null) endGesture(); });
  }
  function startDrag(event: MouseEvent, pointer: boolean, begin: (event: MouseEvent) => DragMove | null): void {
    if (disposed || event.button !== 0 || gesture) return;
    if (pointer && (event as PointerEvent).isPrimary === false) return;
    const move = begin(event);
    if (!move) return;
    gesture = { pointerId: pointer ? (event as PointerEvent).pointerId : null, move, moved: false };
    container.setAttribute("data-dragging", "true");
    ghost.setAttribute("d", main.getAttribute("d") ?? "");
    show(ghost, true);
    if (pointer) {
      const target = event.currentTarget as Element;
      try { target.setPointerCapture?.((event as PointerEvent).pointerId); } catch { /* mouse fallback below */ }
    }
    attachMouse();
    event.preventDefault();
  }
  function moveEvent(event: MouseEvent): void {
    if (!gesture) return;
    const p = plotPoint(event);
    if (!p) return;
    gesture.move(p, event);
    gesture.moved = true;
    render();
    emitInput();
  }
  function attachMouse(): void {
    if (removeMouse) return;
    const onMove = (e: Event): void => {
      if (container.isConnected === false) { endGesture(); return; }
      moveEvent(e as MouseEvent);
    };
    const onEnd = (): void => endGesture();
    const removers = [listenDoc("mousemove", onMove), listenDoc("mouseup", onEnd)];
    const win = doc.defaultView;
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("blur", onEnd);
      removers.push(() => win.removeEventListener("blur", onEnd));
    }
    removeMouse = () => removers.forEach(remove => remove());
  }
  function releasePointer(event: PointerEvent): void {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    endGesture();
    const target = event.currentTarget as Element;
    try { if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }
  function endGesture(): void {
    if (!gesture) return;
    const moved = gesture.moved;
    gesture = null;
    removeMouse?.(); removeMouse = null;
    container.removeAttribute("data-dragging");
    show(ghost, false);
    fit(); render();
    if (moved) emitCommit("gesture");
  }

  // --- model edits ---------------------------------------------------------------
  function moveEnd(index: 0 | 1, x: number, y: number): void {
    const next = { ...model.curve };
    if (index === 0) { next.x1 = round3(clamp(x, 0, 1)); next.y1 = round3(clamp(y, Y_MIN, Y_MAX)); }
    else { next.x2 = round3(clamp(x, 0, 1)); next.y2 = round3(clamp(y, Y_MIN, Y_MAX)); }
    model.curve = constrainCurveEnds(next, model.points);
  }
  function movePoint(index: number, patch: Partial<CurvePoint>, mirror: boolean): void {
    if (!model.points[index]) return;
    model.points[index] = constrainCurvePoint(model.points, index, patch, mirror);
  }
  function moveHalf(index: 0 | 1, x: number, y: number): void {
    const params = paramsOf(model);
    const next = { ...inHalfCurve() };
    const hx = round3(clamp(x / 0.5, 0, 1)), hy = round3(clamp(y / 0.5, Y_MIN, Y_MAX));
    if (index === 0) { next.x1 = hx; next.y1 = hy; } else { next.x2 = hx; next.y2 = hy; }
    params.inCurve = next;
  }
  function stepOf(event: KeyboardEvent): number { return event.shiftKey ? COARSE : FINE; }
  function keyDelta(event: KeyboardEvent): Pt | null {
    const step = stepOf(event);
    switch (event.key) {
      case "ArrowLeft": return { x: -step, y: 0 };
      case "ArrowRight": return { x: step, y: 0 };
      case "ArrowUp": return { x: 0, y: step };
      case "ArrowDown": return { x: 0, y: -step };
      default: return null;
    }
  }
  function afterKey(event: KeyboardEvent): void {
    event.preventDefault();
    fit(); render();
    emitCommit("keyboard");
  }
  function addPoint(x: number): void {
    const next = insertCurvePoint(model.curve, model.points, x);
    if (next.points.length === model.points.length) return;
    model.points = next.points;
    model.curve = constrainCurveEnds(next.curve, model.points);
    model.view = "value";
    syncPoints(); fit(); render();
    emitCommit("point");
  }
  function removePoint(index: number): void {
    if (!model.points[index]) return;
    model.points.splice(index, 1);
    syncPoints(); fit(); render();
    const focusTarget = pointNodes[Math.min(index, pointNodes.length - 1)]?.knot ?? endHandles[0];
    focusTarget?.focus?.();
    emitCommit("point");
  }
  function setMode(mode: EasingMode): void {
    if (mode === model.mode) return;
    model.mode = mode;
    if (mode !== "bezier") model.view = "value";
    buildFields(); fit(); render();
    emitCommit("mode");
  }
  function setDirection(direction: EasingDirection): void {
    if (direction === model.direction) return;
    model.direction = direction;
    buildFields(); fit(); render();
    emitCommit("direction");
  }
  function onOverlay(): void {
    if (disposed) return;
    if (model.mode === "bezier" && model.points.length === 0) {
      model.view = model.view === "speed" ? "value" : "speed";
      fit(); render();
      emitCommit("view");
      return;
    }
    if (model.mode === "bezier") { model.curve = { ...DEFAULT_CURVE }; model.points = []; syncPoints(); }
    else if (model.mode === "back") model.back = { overshoot: DEFAULT_BACK_OVERSHOOT };
    else if (model.mode === "elastic") model.elastic = defaultParams("elastic");
    else model.bounce = defaultParams("bounce");
    buildFields(); fit(); render();
    emitCommit("reset");
  }

  // End handles: drag and keyboard.
  endHandles.forEach((node, i) => {
    const index = i as 0 | 1;
    bindDrag(node, () => p => { const c = toCurve(p); moveEnd(index, c.x, c.y); });
    node.addEventListener("keydown", e => {
      const event = e as KeyboardEvent;
      const delta = keyDelta(event);
      if (!delta) {
        if (event.key === "Home") moveEnd(index, 0, index ? model.curve.y2 : model.curve.y1);
        else if (event.key === "End") moveEnd(index, 1, index ? model.curve.y2 : model.curve.y1);
        else return;
        afterKey(event); return;
      }
      const x = index ? model.curve.x2 : model.curve.x1, y = index ? model.curve.y2 : model.curve.y1;
      moveEnd(index, x + delta.x, y + delta.y);
      afterKey(event);
    });
  });
  // In-half handles of an InOut elastic/bounce.
  halfHandles.forEach((node, i) => {
    const index = i as 0 | 1;
    bindDrag(node, () => p => { const c = toCurve(p); moveHalf(index, c.x, c.y); });
    node.addEventListener("keydown", e => {
      const event = e as KeyboardEvent;
      const delta = keyDelta(event);
      if (!delta) return;
      const c = inHalfCurve();
      const x = (index ? c.x2 : c.x1) * 0.5, y = (index ? c.y2 : c.y1) * 0.5;
      moveHalf(index, x + delta.x, y + delta.y);
      afterKey(event);
    });
  });
  // Speed markers: vertical drag edits the influence; keys step it.
  function speedDrag(start: Pt): DragMove {
    const startCurve = { ...model.curve };
    const px = clamp(plotToCurve(start.x, start.y, range).x, 0, 1);
    return p => { model.curve = speedDragToCurve(startCurve, px, (start.y - p.y) / CURVE_PLOT); };
  }
  speedMarkers.forEach((node, i) => {
    bindDrag(node, event => { const p = plotPoint(event); return p ? speedDrag(p) : null; });
    node.addEventListener("keydown", e => {
      const event = e as KeyboardEvent;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const amount = (event.key === "ArrowUp" ? 1 : -1) * stepOf(event);
      if (i === 0) model.curve = { ...model.curve, x1: round3(clamp(model.curve.x1 + amount, 0, 1)) };
      else model.curve = { ...model.curve, x2: round3(clamp(model.curve.x2 - amount, 0, 1)) };
      afterKey(event);
    });
  });
  // The curve itself: Ctrl/Meta adds a point; otherwise it grabs the nearest control.
  function nearestEnd(c: Pt): 0 | 1 {
    return Math.hypot(c.x - model.curve.x1, c.y - model.curve.y1) <= Math.hypot(c.x - model.curve.x2, c.y - model.curve.y2) ? 0 : 1;
  }
  bindDrag(main, event => {
    if (model.mode !== "bezier") return null;
    const p = plotPoint(event);
    if (!p) return null;
    if (speedView()) return speedDrag(p);
    const c = toCurve(p);
    if (event.ctrlKey || event.metaKey) { addPoint(c.x); return null; }
    const index = nearestEnd(c);
    return q => { const d = toCurve(q); moveEnd(index, d.x, d.y); };
  });
  main.addEventListener("click", e => {
    // Hosts that deliver click without a usable pointerdown (keyboard "click") still add points.
    const event = e as MouseEvent;
    if (model.mode !== "bezier" || speedView() || !(event.ctrlKey || event.metaKey) || gesture) return;
    const p = plotPoint(event);
    if (p) addPoint(toCurve(p).x);
  });

  function syncPoints(): void {
    while (pointNodes.length > model.points.length) {
      const nodes = pointNodes.pop()!;
      for (const node of [nodes.stemIn, nodes.stemOut, nodes.handleIn, nodes.handleOut, nodes.knot]) pointsGroup.removeChild(node);
    }
    while (pointNodes.length < model.points.length) {
      const index = pointNodes.length;
      const nodes: PointNodes = {
        stemIn: svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }),
        stemOut: svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }),
        knot: slider(labels.point, "ch-curve__point"),
        handleIn: slider(labels.pointIn),
        handleOut: slider(labels.pointOut)
      };
      bindDrag(nodes.knot, () => p => { const c = toCurve(p); movePoint(index, { x: c.x, y: c.y }, false); });
      bindDrag(nodes.handleIn, () => (p, event) => { const c = toCurve(p); movePoint(index, { inX: c.x, inY: c.y }, !event.altKey); });
      bindDrag(nodes.handleOut, () => (p, event) => { const c = toCurve(p); movePoint(index, { outX: c.x, outY: c.y }, !event.altKey); });
      nodes.knot.addEventListener("keydown", e => {
        const event = e as KeyboardEvent;
        if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removePoint(index); return; }
        const delta = keyDelta(event);
        const point = model.points[index];
        if (!delta || !point) return;
        movePoint(index, { x: point.x + delta.x, y: point.y + delta.y }, false);
        afterKey(event);
      });
      nodes.handleIn.addEventListener("keydown", e => {
        const event = e as KeyboardEvent;
        const delta = keyDelta(event);
        const point = model.points[index];
        if (!delta || !point) return;
        movePoint(index, { inX: point.inX + delta.x, inY: point.inY + delta.y }, !event.altKey);
        afterKey(event);
      });
      nodes.handleOut.addEventListener("keydown", e => {
        const event = e as KeyboardEvent;
        const delta = keyDelta(event);
        const point = model.points[index];
        if (!delta || !point) return;
        movePoint(index, { outX: point.outX + delta.x, outY: point.outY + delta.y }, !event.altKey);
        afterKey(event);
      });
      for (const node of [nodes.stemIn, nodes.stemOut, nodes.handleIn, nodes.handleOut, nodes.knot]) pointsGroup.appendChild(node);
      pointNodes.push(nodes);
    }
  }

  // --- fields ------------------------------------------------------------------------
  function numberInput(label: string, value: number, min: number, max: number, step: number,
    apply: (value: number) => void): HTMLElement {
    const field = createElement(doc, "label", "ch-curve__field");
    field.appendChild(createElement(doc, "span", "ch-curve__field-label", label));
    const input = createElement(doc, "input", "ch-number ch-curve__input") as HTMLInputElement;
    input.type = "text";
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("aria-label", label);
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(value);
    field.appendChild(input);
    const cleanup = attachScrubbableNumber(input, {
      hitTarget: field,
      onInput: next => { apply(next); fit(); render(); emitInput(); },
      onCommit: next => { apply(next); fit(); render(); emitCommit("field"); }
    });
    fieldCleanups.push(cleanup);
    return field;
  }
  function paramsGroup(params: OscillationParams, cls: string, title: string | null): HTMLElement {
    const group = createElement(doc, "div", `ch-curve__params ${cls}`.trim());
    group.setAttribute("role", "group");
    if (title) {
      group.setAttribute("aria-label", title);
      group.appendChild(createElement(doc, "div", "ch-curve__params-title", title));
    }
    const prefix = title ? `${title} ` : "";
    const grid = createElement(doc, "div", "ch-curve__params-grid");
    grid.appendChild(numberInput(prefix + labels.amp, params.amp, 0, 4, 0.1, v => { params.amp = v; }));
    grid.appendChild(numberInput(prefix + labels.freq, params.freq, 0.1, 20, 0.1, v => { params.freq = v; }));
    grid.appendChild(numberInput(prefix + labels.decay, params.decay, 0, 30, 0.1, v => { params.decay = v; }));
    grid.appendChild(numberInput(prefix + labels.start, params.start, 0, 0.99, 0.01, v => { params.start = v; }));
    group.appendChild(grid);
    return group;
  }
  function buildFields(): void {
    fieldCleanups.forEach(cleanup => cleanup());
    fieldCleanups = [];
    while (fields.firstChild) fields.removeChild(fields.firstChild);
    if (model.mode === "back") {
      const group = createElement(doc, "div", "ch-curve__params ch-curve__params--back");
      const grid = createElement(doc, "div", "ch-curve__params-grid");
      grid.appendChild(numberInput(labels.overshoot, model.back.overshoot, 0, 1, 0.01, v => { model.back.overshoot = v; }));
      group.appendChild(grid);
      fields.appendChild(group);
    } else if (model.mode === "elastic" || model.mode === "bounce") {
      const params = paramsOf(model);
      if (model.direction === "inOut") {
        fields.appendChild(paramsGroup(params.in, "ch-curve__params--in", labels.inHalf));
        fields.appendChild(paramsGroup(params.out, "ch-curve__params--out", labels.outHalf));
      } else {
        fields.appendChild(paramsGroup(model.direction === "in" ? params.in : params.out, "", null));
      }
    }
    hideHtml(fields, model.mode === "bezier");
  }

  // --- render -------------------------------------------------------------------------
  function setOverlay(action: "view" | "reset"): void {
    if (overlay.getAttribute("data-action") === action && overlay.firstChild) {
      if (action === "view") {
        overlay.setAttribute("aria-pressed", String(model.view === "speed"));
        overlay.title = model.view === "speed" ? labels.valueView : labels.speedView;
        overlay.setAttribute("aria-label", overlay.title);
      }
      return;
    }
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    overlay.setAttribute("data-action", action);
    if (action === "view") {
      if (canSvg) overlay.appendChild(icon(SPEED_ICON));
      overlay.setAttribute("aria-pressed", String(model.view === "speed"));
      overlay.title = model.view === "speed" ? labels.valueView : labels.speedView;
    } else {
      overlay.removeAttribute("aria-pressed");
      overlay.appendChild(createElement(doc, "span", "ch-curve__reset-glyph", "↺"));
      overlay.title = labels.reset;
    }
    overlay.setAttribute("aria-label", overlay.title);
  }
  function render(): void {
    container.setAttribute("data-mode", model.mode);
    container.setAttribute("data-view", speedView() ? "speed" : "value");
    container.setAttribute("data-direction", model.direction);
    // Header.
    while (modeIconSlot.firstChild) modeIconSlot.removeChild(modeIconSlot.firstChild);
    if (canSvg) modeIconSlot.appendChild(icon(MODE_ICONS[model.mode]));
    modeText.textContent = labels.modes[model.mode];
    modeButton.title = `${labels.modeMenu}: ${labels.modes[model.mode]}`;
    modeButton.setAttribute("aria-label", modeButton.title);
    optionNodes.forEach((node, i) => node.setAttribute("aria-selected", String(MODES[i] === model.mode)));
    hideHtml(directions, model.mode === "bezier");
    directionNodes.forEach((node, i) => {
      const checked = DIRECTIONS[i] === model.direction;
      node.setAttribute("aria-checked", String(checked));
      node.setAttribute("tabindex", checked ? "0" : "-1");
    });
    if (!canSvg) return;
    const speed = speedView();
    setOverlay(model.mode === "bezier" && model.points.length === 0 ? "view" : "reset");
    hideHtml(hint, !(model.mode === "bezier" && !speed));
    // Axes and reference.
    const o = curveToPlot(0, 0, range), top = curveToPlot(0, 1, range), right = curveToPlot(1, 0, range), end = curveToPlot(1, 1, range);
    axis.setAttribute("d", `M ${fmt(top.x)},${fmt(top.y)} L ${fmt(o.x)},${fmt(o.y)} L ${fmt(right.x)},${fmt(right.y)}`);
    reference.setAttribute("x1", fmt(o.x)); reference.setAttribute("y1", fmt(o.y));
    reference.setAttribute("x2", fmt(end.x)); reference.setAttribute("y2", fmt(end.y));
    show(reference, !speed);
    // Main path.
    const valueD = valuePathD(model, speed ? fitRange([model.curve.y1, model.curve.y2]) : range);
    main.setAttribute("d", speed ? speedPathD(model.curve, range) : valueD);
    main.setAttribute("class", `ch-curve__value${speed ? " ch-curve__value--speed" : ""}${halves() ? " ch-curve__value--hidden" : ""}`);
    show(main, true);
    faint.setAttribute("d", valueD);
    show(faint, speed);
    // Bezier handles.
    const bezierValue = model.mode === "bezier" && !speed;
    endHandles.forEach(node => show(node, bezierValue));
    stems.slice(0, 2).forEach(node => show(node, bezierValue));
    if (bezierValue) {
      place(endHandles[0]!, model.curve.x1, model.curve.y1);
      place(endHandles[1]!, model.curve.x2, model.curve.y2);
      stem(stems[0]!, 0, 0, model.curve.x1, model.curve.y1);
      stem(stems[1]!, 1, 1, model.curve.x2, model.curve.y2);
    }
    show(pointsGroup, bezierValue);
    pointNodes.forEach((nodes, i) => {
      const p = model.points[i];
      if (!p) return;
      place(nodes.knot, p.x, p.y);
      place(nodes.handleIn, p.inX, p.inY);
      place(nodes.handleOut, p.outX, p.outY);
      stem(nodes.stemIn, p.x, p.y, p.inX, p.inY);
      stem(nodes.stemOut, p.x, p.y, p.outX, p.outY);
    });
    // Speed view.
    speedMarkers.forEach(node => show(node, speed));
    show(peakText, speed);
    if (speed) {
      const samples = sampleBezierSpeed(model.curve, 129);
      const at = (x: number): number => samples[Math.round(clamp(x, 0, 1) * (samples.length - 1))]!.speed;
      place(speedMarkers[0]!, model.curve.x1, at(model.curve.x1), `${round3(model.curve.x1)}`);
      place(speedMarkers[1]!, model.curve.x2, at(model.curve.x2), `${round3(1 - model.curve.x2)}`);
      peakText.textContent = `×${peakSpeed(model.curve).toFixed(1)}`;
    }
    // InOut halves of elastic/bounce.
    const split = halves();
    for (const node of [halfIn, halfOut, join, chip, ...halfHandles, ...stems.slice(2)]) show(node, split);
    if (split) {
      const samples = easingSamples(model);
      halfIn.setAttribute("d", polylineD(samples.filter(s => s[0] <= 0.5), range));
      halfOut.setAttribute("d", polylineD(samples.filter(s => s[0] >= 0.5), range));
      const joinSamples = samples.filter(s => s[0] >= 0.47 && s[0] <= 0.53);
      join.setAttribute("d", polylineD(joinSamples, range));
      const left = curveToPlot(0.47, 0, range), rightEdge = curveToPlot(0.53, 0, range);
      gradient.setAttribute("x1", fmt(left.x)); gradient.setAttribute("x2", fmt(rightEdge.x));
      const c = inHalfCurve();
      place(halfHandles[0]!, c.x1 * 0.5, c.y1 * 0.5, `${round3(c.x1)}, ${round3(c.y1)}`);
      place(halfHandles[1]!, c.x2 * 0.5, c.y2 * 0.5, `${round3(c.x2)}, ${round3(c.y2)}`);
      stem(stems[2]!, 0, 0, c.x1 * 0.5, c.y1 * 0.5);
      stem(stems[3]!, 0.5, 0.5, c.x2 * 0.5, c.y2 * 0.5);
      const mid = curveToPlot(0.5, 0.5, range);
      const scale = 0.1, size = SIZE * scale;
      const cx = Math.min(mid.x + 10, SIZE - size - 2), cy = Math.max(2, mid.y - size - 10);
      chip.setAttribute("transform", `translate(${fmt(cx)} ${fmt(cy)}) scale(${scale})`);
      chipPath.setAttribute("d", valueD);
    }
  }

  function setModel(next: CurveEditorModel): void {
    if (disposed) return;
    endGesture();
    closeMenu(false);
    model = cloneModel(next);
    if (model.mode !== "bezier" || model.points.length) model.view = "value";
    if (canSvg) syncPoints();
    buildFields(); fit(); render();
  }
  function dispose(): void {
    if (disposed) return;
    endGesture();
    closeMenu(false);
    disposed = true;
    fieldCleanups.forEach(cleanup => cleanup());
    fieldCleanups = [];
    if (canSvg) pointNodes = [];
  }

  syncPoints(); buildFields(); fit(); render();
  return { element: container, setModel, getModel: () => cloneModel(model), dispose };
}
