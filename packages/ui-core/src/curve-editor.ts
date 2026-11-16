/**
 * Flow-style easing curve editor.
 *
 * One task dominates the view: the plot. The header holds the mode menu and
 * the direction dots; parameter fields live below the plot in normal flow so
 * the editor still works docked at 280 px. All math is pure and comes from
 * `@motion/keyframe-core`; this file only maps it to SVG and gestures.
 *
 * Gesture rules follow `bezier.ts`: pointer capture first, a bounded mouse
 * fallback registered on the document only during a mouse-only gesture, Y refit
 * only when nothing is being dragged, every handle a keyboard `slider`.
 *
 * A press arms a gesture record; it becomes a drag only after the pointer moves
 * `DRAG_THRESHOLD_PX`. Shift scales the integrated motion by `FINE_DRAG_FACTOR`
 * on a virtual pointer so toggling Shift mid-drag never jumps. Escape,
 * `pointercancel`, `setModel` and `dispose` restore the pre-press snapshot and
 * report `onCancel`; release, lost capture and window blur commit "gesture".
 *
 * Precision: a dragged dot sticks to the 0 and 1 lines within `SNAP_PX` (Shift or
 * Alt move it freely), Ctrl/Cmd snaps it to a `SNAP_GRID` grid, and its coordinates
 * read out beside it while it moves. Arrows step 0.01, Shift 0.1, Alt 0.001.
 *
 * Tolerance: a press anywhere on the plot grabs the nearest visible dot within
 * `HANDLE_CAPTURE_PX`, so a dot never has to be hit exactly. In the speed view
 * the whole plot is one control (drag down = smoother, up = more linear) with
 * a single marker at the peak for the keyboard. Point additions, removals and
 * refusals are announced through a polite live region.
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
import { attachMenuGlide } from "./menu-glide.js";
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
  /** The single speed-graph control (falls back to `speedLeft`). */
  smoothing?: string;
  /** Hint shown in the speed view. */
  speedHint?: string;
  /** Live-region messages; `{n}` is the point count. */
  pointAdded?: string;
  pointRemoved?: string;
  pointRefused?: string;
  peak: string;
  amp: string;
  freq: string;
  decay: string;
  start: string;
  overshoot: string;
  inHalf: string;
  outHalf: string;
  /** Motion cues (opt-in): probe, peak, ruler and handle readout wording. */
  cueTime?: string;
  cueValue?: string;
  cueSpeed?: string;
  cuePeak?: string;
  cueReplay?: string;
  cueFrames?: string;
  influenceOut?: string;
  influenceIn?: string;
  cueOvershoot?: string;
  /** Decimal separator of the cue texts ("," in pt-BR). */
  cueDecimal?: string;
}

export type CurveCommitReason = "gesture" | "keyboard" | "field" | "mode" | "direction" | "view" | "reset" | "point";

export interface CurveEditorOptions {
  model: CurveEditorModel;
  /** Consumer-specific initial recipe; absent preserves the shared editor default. */
  resetCurve?: CubicBezierCurve;
  labels: CurveEditorLabels;
  /** Slot at the start of the header (e.g. the curve's name). */
  headerStart?: HTMLElement;
  /** Slot at the far right of the header (e.g. a live toggle). */
  headerEnd?: HTMLElement;
  /** Fired during drags; the host does not apply yet. */
  onInput(model: CurveEditorModel): void;
  /** Fired on release, field commit, keyboard step, mode, direction, view, reset and point add/remove. */
  onCommit(model: CurveEditorModel, reason: CurveCommitReason): void;
  /** Fired when a gesture is cancelled (Escape, pointercancel, setModel, dispose) after the model was restored and `onInput` emitted. */
  onCancel?(): void;
  /**
   * Opt-in motion cues (design v6): the speed drawn as an area behind the value with its peak, shaded bands
   * outside 0–100 %, a probe under the cursor (time, value, speed), the influence beside a dragged handle,
   * a dashed preview curve (setPreview) and a frame ruler with one tick per frame under the graph.
   */
  motionCues?: boolean;
  /** Frames and frame rate of the sample stretch the ruler draws (motion cues). */
  cueFrames?: number;
  cueFps?: number;
}

export interface CurveEditor {
  element: HTMLElement;
  /** `animate` glides a plain Bézier from the drawn curve to the new one (presets); the model is the target at once. */
  setModel(model: CurveEditorModel, options?: { silent?: boolean; animate?: boolean }): void;
  getModel(): CurveEditorModel;
  /** Motion cues: a dashed curve to compare against (e.g. the preset under the pointer); null hides it. */
  setPreview(curve: CubicBezierCurve | null): void;
  /** Motion cues: frames and frame rate of the ruler's sample stretch. */
  setCueTiming(frames: number, fps: number): void;
  /** Motion cues: shows or hides the speed area behind the value curve. */
  setSpeedArea(visible: boolean): void;
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
/** Alt + arrow: the precise step. */
const PRECISE = 0.001;
/** A dragged dot sticks to the 0 and 1 lines within this many CSS px. */
export const SNAP_PX = 6;
/** Ctrl/Cmd while dragging rounds a dot to this grid. */
export const SNAP_GRID = 0.05;
/** CSS px size of the coordinate readout and the speed peak, at any dock width. */
const LABEL_PX = 11;
const Y_MIN = -1;
const Y_MAX = 2;
const MODES: EasingMode[] = ["bezier", "back", "elastic", "bounce"];
const DIRECTIONS: EasingDirection[] = ["in", "inOut", "out"];
const DEFAULT_CURVE: CubicBezierCurve = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
/** Duration of the preset morph; it eases out (cubic) with no overshoot: the graph is a large surface. */
export const CURVE_MORPH_MS = 320;

/** Point `t` (0..1) of the straight morph between two Bézier curves. */
export function morphCurve(from: CubicBezierCurve, to: CubicBezierCurve, t: number): CubicBezierCurve {
  if (t >= 1) return { ...to };
  const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  return { x1: from.x1 + (to.x1 - from.x1) * e, y1: from.y1 + (to.y1 - from.y1) * e, x2: from.x2 + (to.x2 - from.x2) * e, y2: from.y2 + (to.y2 - from.y2) * e };
}
/** A press turns into a drag only after this many CSS px of pointer travel. */
export const DRAG_THRESHOLD_PX = 3;
/** Shift scales pointer motion by this factor (fine adjustment). */
export const FINE_DRAG_FACTOR = 0.2;
/** Invisible stroke around the curve that accepts presses (CSS `.ch-curve__hit`). */
export const HIT_BAND_PX = 20;
/** A press this close (CSS px) to a visible dot grabs it, wherever it lands on the plot. */
export const HANDLE_CAPTURE_PX = 24;
/** Speed-graph keyboard step, as a fraction of the plot height (Shift: coarse). */
const SPEED_KEY_STEP = 0.04;
const SPEED_KEY_COARSE = 0.15;
/** Minimum hit target of a dot in CSS px at any dock width (r=5 plus a 16 px transparent stroke). */
export const DOT_TARGET_PX = 20;

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

/**
 * Snapping of a dragged dot in curve units: with `grid`, rounding to `SNAP_GRID`;
 * otherwise a magnet to the 0 and 1 lines within `tolerance` per axis.
 */
export function snapCurvePoint(x: number, y: number, tolerance: { x: number; y: number }, grid: boolean): { x: number; y: number } {
  if (grid) return { x: round3(Math.round(x / SNAP_GRID) * SNAP_GRID), y: round3(Math.round(y / SNAP_GRID) * SNAP_GRID) };
  const stick = (value: number, limit: number): number => Math.abs(value) <= limit ? 0 : Math.abs(value - 1) <= limit ? 1 : value;
  return { x: stick(x, tolerance.x), y: stick(y, tolerance.y) };
}

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
type GestureKind = "end" | "half" | "speed" | "point" | "handleIn" | "handleOut" | "line";
/** What a target returns on press; `null` means "no gesture". */
interface GestureStart { kind: GestureKind; move: DragMove; onClick?: () => void; commitReason?: CurveCommitReason }
type BeginDrag = (event: MouseEvent) => GestureStart | null;
interface Gesture {
  kind: GestureKind;
  /** `null` in the mouse-only fallback (no Pointer Events). */
  pointerId: number | null;
  target: Element;
  /** Client coordinates of the press. */
  origin: Pt;
  /** Last raw client position seen. */
  last: Pt;
  /** Integrated position; Shift slows its motion by `FINE_DRAG_FACTOR`. */
  virtual: Pt;
  snapshot: CurveEditorModel;
  dragging: boolean;
  move: DragMove;
  onClick: (() => void) | null;
  commitReason: CurveCommitReason;
}

export function createCurveEditor(doc: Document, options: CurveEditorOptions): CurveEditor {
  const { labels } = options;
  let model = cloneModel(options.model);
  if (model.mode !== "bezier" || model.points.length) model.view = "value";
  let range: PlotRange = { low: 0, high: 1 };
  let disposed = false;
  let gesture: Gesture | null = null;
  /** Once a pointerdown is seen, mousedown handlers are ignored for the editor lifetime. */
  let pointerSeen = false;
  let activePoint: number | null = null;
  let removeGestureListeners: (() => void) | null = null;
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
  function emitCommit(reason: CurveCommitReason): void { options.onCommit(cloneModel(model), reason); playTrail(); }

  // --- header ------------------------------------------------------------------
  const header = createElement(doc, "div", "ch-curve__header");
  if (options.headerStart) header.appendChild(options.headerStart);
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
  const menuGlide = typeof menu.insertBefore === "function" ? attachMenuGlide(menu, () => optionNodes) : null;
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
    menuGlide?.rest(false);
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
  // The value/speed (or reset) toggle lives here, not over the plot where it covered the (1, 1) end.
  const headerTools = createElement(doc, "div", "ch-curve__header-tools");
  header.appendChild(headerTools);
  if (options.headerEnd) {
    const end = createElement(doc, "div", "ch-curve__header-end");
    end.appendChild(options.headerEnd);
    header.appendChild(end);
  }
  container.appendChild(header);

  // --- plot ----------------------------------------------------------------------
  const plot = createElement(doc, "div", "ch-curve__plot");
  container.appendChild(plot);
  const TRAIL_MS = 900;
  const cueOn = Boolean(options.motionCues);
  let cueFrames = Math.max(2, Math.min(240, Math.round(options.cueFrames ?? 24)));
  let cueFps = options.cueFps && options.cueFps > 0 ? options.cueFps : 30;
  let speedAreaOn = true, previewCurve: CubicBezierCurve | null = null;
  const decimal = (value: number, digits: number): string => value.toFixed(digits).replace(".", labels.cueDecimal ?? ".");
  // Frame ruler (motion cues): play, one tick per frame placed by the value, the head and "24 q · 0,80 s".
  const trail = cueOn ? createElement(doc, "div", "ch-curve__ruler") : null;
  const trailTicks = trail ? createElement(doc, "div", "ch-curve__ruler-ticks") : null;
  const trailBall = trail ? createElement(doc, "span", "ch-curve__ruler-head") : null;
  const trailLabel = trail ? createElement(doc, "span", "ch-curve__ruler-label") : null;
  if (trail && trailTicks && trailBall && trailLabel) {
    const replay = createElement(doc, "button", "ch-button ch-curve__ruler-play") as HTMLButtonElement;
    replay.setAttribute("type", "button");
    replay.setAttribute("aria-label", labels.cueReplay ?? "Replay preview");
    replay.title = labels.cueReplay ?? "Replay preview";
    if (canSvg) replay.appendChild(icon("M5 3.5v9l7.5-4.5z", "ch-curve__icon"));
    replay.addEventListener("click", () => playTrail());
    const track = createElement(doc, "div", "ch-curve__ruler-track");
    track.setAttribute("aria-hidden", "true");
    track.appendChild(trailTicks); track.appendChild(trailBall);
    track.addEventListener("click", () => playTrail());
    trail.appendChild(replay); trail.appendChild(track); trail.appendChild(trailLabel);
    container.appendChild(trail);
  }
  const status = createElement(doc, "div", "ch-visually-hidden ch-curve__status");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  container.appendChild(status);
  function announce(text: string | undefined, count = model.points.length): void {
    if (!text) return;
    status.textContent = "";
    status.textContent = text.replace("{n}", String(count));
  }
  const fields = createElement(doc, "div", "ch-curve__fields");
  container.appendChild(fields);

  if (!canSvg) {
    // Without SVG the editor still exposes mode, direction and the fields.
    buildFields();
    render();
    return { element: container, setModel, getModel: () => cloneModel(model), setPreview: () => {}, setCueTiming: () => {}, setSpeedArea: () => {}, dispose };
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
  const hit = svgEl("path", "ch-curve__hit", { "aria-hidden": "true" });
  const halfIn = svgEl("path", "ch-curve__half ch-curve__half--in", { "aria-hidden": "true" });
  const halfOut = svgEl("path", "ch-curve__half ch-curve__half--out", { "aria-hidden": "true" });
  const join = svgEl("path", "ch-curve__join", { "aria-hidden": "true", stroke: `url(#${gradientId})` });
  const chip = svgEl("g", "ch-curve__chip", { "aria-hidden": "true" });
  chip.appendChild(svgEl("rect", "ch-curve__chip-bg", { x: "0", y: "0", width: String(SIZE), height: String(SIZE), rx: "40" }));
  const chipPath = svgEl("path", "ch-curve__chip-path");
  chip.appendChild(chipPath);
  const stems = [0, 1, 2, 3].map(() => svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }));
  const peakText = svgEl("text", "ch-curve__peak", {
    x: String(CURVE_PAD + 6), y: String(CURVE_PAD + 14), "text-anchor": "start", "aria-label": labels.peak
  });
  const readout = svgEl("text", "ch-curve__readout", { "aria-hidden": "true", display: "none" });
  // Motion cues (design v6). Behind the curve: bands outside 0–100 %, their axis labels and the speed area;
  // over it: the dashed preview and the probe. Presentation attributes keep them hidden without a stylesheet.
  const hidden = { "aria-hidden": "true", display: "none" };
  const bands = cueOn ? [svgEl("rect", "ch-curve__band", hidden), svgEl("rect", "ch-curve__band", hidden)] : [];
  const axisLabels = cueOn ? [svgEl("text", "ch-curve__axis-label", { ...hidden, "text-anchor": "end" }), svgEl("text", "ch-curve__axis-label", { ...hidden, "text-anchor": "end" })] : [];
  if (axisLabels[0]) axisLabels[0].textContent = "100";
  if (axisLabels[1]) axisLabels[1].textContent = "0";
  const speedArea = svgEl("path", "ch-curve__speed-area", hidden), speedLine = svgEl("path", "ch-curve__speed-line", { ...hidden, fill: "none" });
  const speedPeak = svgEl("line", "ch-curve__speed-peak", hidden), speedLabel = svgEl("text", "ch-curve__speed-label", hidden);
  const preview = svgEl("path", "ch-curve__preview", { ...hidden, fill: "none" });
  const probeLine = svgEl("line", "ch-curve__probe-line", hidden), probeDot = svgEl("circle", "ch-curve__probe-dot", { ...hidden, r: "3.5" });
  // The two keyframes of the stretch, drawn as the Graph Editor's squares at 0 % and 100 %.
  const keySquares = cueOn ? [svgEl("rect", "ch-curve__key", hidden), svgEl("rect", "ch-curve__key", hidden)] : [];
  const cueBack = cueOn ? [...bands, ...axisLabels, speedArea, speedLine, speedPeak, speedLabel] : [];
  const cueFront = cueOn ? [preview] : [];
  for (const node of [...cueBack, axis, reference, ghost, faint, ...cueFront, main, hit, halfIn, halfOut, join, ...stems]) svg.appendChild(node);
  if (cueOn) { svg.appendChild(probeLine); svg.appendChild(probeDot); for (const key of keySquares) svg.appendChild(key); }

  function slider(label: string, cls = "ch-curve__handle"): SVGElement {
    const node = svgEl("circle", cls, { r: "5", role: "slider", tabindex: "0", "aria-label": label });
    return node;
  }
  /** Decorative ring drawn just before its dot; `place()` positions both. */
  function ring(kind: "point" | "marker"): SVGElement {
    return svgEl("circle", `ch-curve__ring ch-curve__ring--${kind}`, { r: "7", "aria-hidden": "true" });
  }
  const endHandles = [slider(labels.outHandle), slider(labels.inHandle)];
  const speedMarker = slider(labels.smoothing ?? labels.speedLeft, "ch-curve__marker");
  const markerRing = ring("marker");
  const halfHandles = [slider(labels.outHandle), slider(labels.inHandle)];
  const pointsGroup = svgEl("g", "ch-curve__points");
  svg.appendChild(pointsGroup);
  for (const node of [...endHandles, ...halfHandles, markerRing, speedMarker, peakText, chip, readout]) svg.appendChild(node);
  plot.appendChild(svg);

  const overlay = createElement(doc, "button", "ch-button ch-curve__overlay") as HTMLButtonElement;
  overlay.setAttribute("type", "button");
  overlay.addEventListener("click", onOverlay);
  headerTools.appendChild(overlay);
  // The gesture help is read with the graph, not printed over it.
  const hint = createElement(doc, "div", "ch-visually-hidden ch-curve__hint", labels.addPointHint);
  hint.id = `${gradientId}-hint`;
  svg.setAttribute("aria-describedby", hint.id);
  container.appendChild(hint);

  type PointNodes = { knot: SVGElement; ring: SVGElement; handleIn: SVGElement; handleOut: SVGElement; stemIn: SVGElement; stemOut: SVGElement };
  let pointNodes: PointNodes[] = [];

  // --- geometry -----------------------------------------------------------------
  function speedView(): boolean { return model.mode === "bezier" && model.view === "speed" && model.points.length === 0; }
  function halves(): boolean { return (model.mode === "elastic" || model.mode === "bounce") && model.direction === "inOut"; }
  function inHalfCurve(): CubicBezierCurve { return paramsOf(model).inCurve ?? DEFAULT_HALF_CURVE; }
  function fit(): void {
    // The range is frozen during a drag so the plot does not slide under the pointer;
    // a speed drag is relative to the plot height, so its range may follow the peak.
    if (gesture && gesture.kind !== "speed") return;
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
  /** Client (CSS px) → viewBox units through the screen CTM, or the bounding box when the host lacks it. */
  function clientToPlot(clientX: number, clientY: number): Pt | null {
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const source = svg.createSVGPoint(); source.x = clientX; source.y = clientY;
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
    return { x: (clientX - left) / scale, y: (clientY - top) / scale };
  }
  function plotPoint(event: MouseEvent): Pt | null { return clientToPlot(event.clientX, event.clientY); }
  function toCurve(p: Pt): Pt { return plotToCurve(p.x, p.y, range); }
  /** Ctrl/Cmd: grid; Shift (fine) or Alt: free; otherwise the 0/1 magnet. */
  function snapped(c: Pt, event: MouseEvent): Pt {
    const grid = event.ctrlKey || event.metaKey;
    if (!grid && (event.shiftKey || event.altKey)) return c;
    const unit = CURVE_PLOT * pxPerUnit();
    const span = range.high - range.low || 1;
    return snapCurvePoint(c.x, c.y, { x: SNAP_PX / unit, y: SNAP_PX * span / unit }, grid);
  }
  /** Coordinates beside the dot being dragged, kept inside the plot. */
  function showReadout(node: Element | null): void {
    if (!node || node.getAttribute("role") !== "slider" || node === speedMarker) { show(readout, false); return; }
    const cx = Number(node.getAttribute("cx")), cy = Number(node.getAttribute("cy"));
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) { show(readout, false); return; }
    const scale = pxPerUnit();
    const c = toCurve({ x: cx, y: cy });
    readout.textContent = `${c.x.toFixed(2)}, ${c.y.toFixed(2)}`;
    if (cueOn && (node === endHandles[0] || node === endHandles[1])) {
      const out = node === endHandles[0], influence = Math.round((out ? c.x : 1 - c.x) * 100);
      const over = c.y > 1 ? c.y - 1 : c.y < 0 ? -c.y : 0;
      readout.textContent = `${out ? labels.influenceOut ?? "Out" : labels.influenceIn ?? "In"} ${influence}%${over > 0.005 ? ` · ${labels.cueOvershoot ?? "overshoot"} ${Math.round(over * 100)}%` : ""}`;
    }
    (readout as unknown as HTMLElement).style?.setProperty?.("font-size", `${fmt(LABEL_PX / scale)}px`);
    const right = cx > SIZE * 0.62;
    readout.setAttribute("text-anchor", right ? "end" : "start");
    readout.setAttribute("x", fmt(cx + (right ? -12 : 12) / scale));
    readout.setAttribute("y", fmt(Math.max(CURVE_PAD * 0.75, Math.min(SIZE - CURVE_PAD * 0.4, cy - 10 / scale))));
    show(readout, true);
  }
  function place(node: SVGElement, x: number, y: number, text?: string, ringNode?: SVGElement): void {
    const p = curveToPlot(x, y, range);
    node.setAttribute("cx", fmt(p.x)); node.setAttribute("cy", fmt(p.y));
    node.setAttribute("aria-valuetext", text ?? `${round3(x)}, ${round3(y)}`);
    node.setAttribute("aria-valuenow", String(round3(y)));
    node.setAttribute("aria-valuemin", String(Y_MIN)); node.setAttribute("aria-valuemax", String(Y_MAX));
    if (ringNode) { ringNode.setAttribute("cx", fmt(p.x)); ringNode.setAttribute("cy", fmt(p.y)); }
  }
  function stem(node: SVGElement, ax: number, ay: number, bx: number, by: number): void {
    const a = curveToPlot(ax, ay, range), b = curveToPlot(bx, by, range);
    node.setAttribute("x1", fmt(a.x)); node.setAttribute("y1", fmt(a.y));
    node.setAttribute("x2", fmt(b.x)); node.setAttribute("y2", fmt(b.y));
  }

  // --- gestures -----------------------------------------------------------------
  /** Every draggable dot and how it starts a drag: the plot-level press reuses these. */
  const begins = new Map<Element, BeginDrag>();
  function bindDrag(node: Element, begin: BeginDrag): void {
    begins.set(node, begin);
    // A gesture belongs to the node that started it; the same event bubbling to the plot is ignored.
    const mine = (e: Event): boolean => Boolean(gesture && gesture.pointerId !== null && gesture.pointerId === (e as PointerEvent).pointerId
      && ((e.currentTarget ?? e.target) as Element | null) === gesture.target);
    node.addEventListener("pointerdown", e => { pointerSeen = true; startDrag(e as PointerEvent, true, begin); });
    node.addEventListener("mousedown", e => { if (pointerSeen) return; startDrag(e as MouseEvent, false, begin); });
    node.addEventListener("pointermove", e => { if (mine(e)) moveEvent(e as PointerEvent); });
    node.addEventListener("pointerup", e => { if (mine(e)) finishGesture(true); });
    node.addEventListener("pointercancel", e => { if (mine(e)) cancelGesture(); });
    node.addEventListener("lostpointercapture", e => {
      if (gesture && gesture.pointerId !== null && ((e.currentTarget ?? e.target) as Element | null) === gesture.target) finishGesture(false);
    });
  }
  /**
   * A dot follows the pointer RELATIVELY: grabbing it off-centre (anywhere in
   * its tolerance) never makes it jump to the cursor. Speed and line gestures
   * are already relative.
   */
  function anchored(start: GestureStart, node: Element, event: MouseEvent): GestureStart {
    if (start.kind === "speed" || start.kind === "line" || node.getAttribute("role") !== "slider") return start;
    const cx = Number(node.getAttribute("cx")), cy = Number(node.getAttribute("cy"));
    const p = plotPoint(event);
    if (!p || !Number.isFinite(cx) || !Number.isFinite(cy)) return start;
    const dx = cx - p.x, dy = cy - p.y;
    return { ...start, move: (q, e) => start.move({ x: q.x + dx, y: q.y + dy }, e) };
  }
  /** CSS px per viewBox unit (1 when the host cannot measure). */
  function pxPerUnit(): number {
    if (typeof svg.getBoundingClientRect !== "function") return 1;
    const box = svg.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0 ? Math.min(box.width, box.height) / SIZE : 1;
  }
  /** Nearest visible dot within `HANDLE_CAPTURE_PX` of plot point `p`. */
  function nearestDot(p: Pt): Element | null {
    const limit = HANDLE_CAPTURE_PX / pxPerUnit();
    let best: Element | null = null, bestDistance = limit;
    for (const node of begins.keys()) {
      if (node === hit || node === svg || node.getAttribute("role") !== "slider") continue;
      if (node.getAttribute("display") === "none" || node.parentNode === null) continue;
      if (node.parentNode === pointsGroup && pointsGroup.getAttribute("display") === "none") continue;
      const cx = Number(node.getAttribute("cx")), cy = Number(node.getAttribute("cy"));
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const distance = Math.hypot(cx - p.x, cy - p.y);
      if (distance <= bestDistance) { best = node; bestDistance = distance; }
    }
    return best;
  }
  function startDrag(event: MouseEvent, pointer: boolean, begin: BeginDrag): void {
    if (disposed || event.button !== 0 || gesture) return;
    if (pointer && (event as PointerEvent).isPrimary === false) return;
    const target = (event.currentTarget ?? event.target) as Element;
    clearPop();
    // Snapshot before `begin`: a line press inserts a point that a cancel must undo.
    const snapshot = cloneModel(model);
    const begun = begin(event);
    if (!begun) return;
    const start = anchored(begun, target, event);
    // Pressing a dot gives it keyboard focus, so arrows continue where the pointer stopped.
    if (target.getAttribute?.("role") === "slider") (target as unknown as HTMLElement).focus?.();
    const at = { x: event.clientX, y: event.clientY };
    gesture = {
      kind: start.kind, pointerId: pointer ? (event as PointerEvent).pointerId : null, target,
      origin: at, last: { ...at }, virtual: { ...at }, snapshot, dragging: false,
      move: start.move, onClick: start.onClick ?? null, commitReason: start.commitReason ?? "gesture"
    };
    ghost.setAttribute("d", main.getAttribute("d") ?? "");
    if (pointer) {
      try { target.setPointerCapture?.((event as PointerEvent).pointerId); } catch { /* host without capture: node-level pointermove still follows */ }
    }
    const onKey = (e: Event): void => {
      if ((e as KeyboardEvent).key !== "Escape") return;
      e.preventDefault?.();
      cancelGesture();
    };
    const removers = [listenDoc("keydown", onKey)];
    if (!pointer) {
      const onMove = (e: Event): void => {
        if (container.isConnected === false) { finishGesture(false); return; }
        moveEvent(e as MouseEvent);
      };
      removers.push(listenDoc("mousemove", onMove), listenDoc("mouseup", () => finishGesture(true)));
    }
    const win = doc.defaultView;
    if (win && typeof win.addEventListener === "function") {
      const onBlur = (): void => finishGesture(false);
      win.addEventListener("blur", onBlur);
      removers.push(() => win.removeEventListener("blur", onBlur));
    }
    removeGestureListeners = () => removers.forEach(remove => remove());
    event.preventDefault();
  }
  function moveEvent(event: MouseEvent): void {
    const g = gesture;
    if (!g) return;
    // Integrate on a virtual pointer so toggling Shift mid-drag changes the rate, never the position.
    const factor = event.shiftKey ? FINE_DRAG_FACTOR : 1;
    g.virtual.x += (event.clientX - g.last.x) * factor;
    g.virtual.y += (event.clientY - g.last.y) * factor;
    g.last = { x: event.clientX, y: event.clientY };
    if (!g.dragging) {
      if (Math.hypot(event.clientX - g.origin.x, event.clientY - g.origin.y) < DRAG_THRESHOLD_PX) return;
      g.dragging = true;
      container.setAttribute("data-dragging", "true");
      show(ghost, true);
    }
    const p = clientToPlot(g.virtual.x, g.virtual.y);
    if (!p) return;
    g.move(p, event);
    if (g.kind === "speed") fit();
    render();
    showReadout(g.kind === "line" && activePoint !== null ? pointNodes[activePoint]?.knot ?? null : g.target);
    emitInput();
  }
  /** Drops the record and every listener it owns; the model is left as is. */
  function cleanupGesture(): Gesture | null {
    const g = gesture;
    if (!g) return null;
    gesture = null;
    removeGestureListeners?.(); removeGestureListeners = null;
    if (g.pointerId !== null) {
      try { if (g.target.hasPointerCapture?.(g.pointerId)) g.target.releasePointerCapture(g.pointerId); } catch { /* already released */ }
    }
    container.removeAttribute("data-dragging");
    show(ghost, false);
    show(readout, false);
    return g;
  }
  /**
   * Release: a drag commits, an armed press is a click (when `click`), anything
   * else just ends. A hit-path press already inserted a point, so ending it
   * without a click (blur, lost capture) must undo that insertion like a cancel.
   */
  function finishGesture(click: boolean): void {
    if (!gesture) return;
    if (gesture.dragging) { endGesture(); return; }
    if (!click && gesture.kind === "line") { cancelGesture(); return; }
    const g = cleanupGesture();
    if (click) g?.onClick?.();
  }
  function endGesture(): void {
    const g = cleanupGesture();
    if (!g) return;
    fit(); render();
    emitCommit(g.commitReason);
  }
  function cancelGesture(): void {
    const g = cleanupGesture();
    if (!g) return;
    model = cloneModel(g.snapshot);
    syncPoints(); fit(); render();
    emitInput();
    options.onCancel?.();
  }
  function setActivePoint(index: number | null): void {
    activePoint = index !== null && model.points[index] ? index : null;
    pointNodes.forEach((nodes, i) => {
      for (const node of [nodes.knot, nodes.ring]) {
        if (i === activePoint) node.setAttribute("data-active", "true"); else node.removeAttribute("data-active");
      }
    });
    if (activePoint === null) container.removeAttribute("data-active-point");
    else container.setAttribute("data-active-point", String(activePoint));
  }
  function clearPop(): void {
    for (const nodes of pointNodes) { nodes.knot.removeAttribute("data-pop"); nodes.ring.removeAttribute("data-pop"); }
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
  function stepOf(event: KeyboardEvent): number { return event.shiftKey ? COARSE : event.altKey ? PRECISE : FINE; }
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
  /** Inserts a knot at curve `x` keeping the shape; returns its index or -1 when refused (gap too small or 16 points). */
  function insertPoint(x: number): number {
    const next = insertCurvePoint(model.curve, model.points, x);
    if (next.points.length === model.points.length) return -1;
    const index = next.points.findIndex((p, i) => model.points[i]?.x !== p.x);
    model.points = next.points;
    model.curve = constrainCurveEnds(next.curve, model.points);
    model.view = "value";
    syncPoints();
    return index === -1 ? model.points.length - 1 : index;
  }
  function removePoint(index: number): void {
    if (!model.points[index]) return;
    model.points.splice(index, 1);
    syncPoints(); setActivePoint(null); fit(); render();
    const focusTarget = pointNodes[Math.min(index, pointNodes.length - 1)]?.knot ?? endHandles[0];
    focusTarget?.focus?.();
    announce(labels.pointRemoved ?? "Point removed, {n} left");
    emitCommit("point");
  }
  /** Keyboard insertion: halfway to the next knot (or the end) after `after` (-1 = the start). */
  function insertAfter(after: number): void {
    const from = after < 0 ? 0 : model.points[after]?.x ?? 0;
    const to = model.points[after + 1]?.x ?? 1;
    const index = insertPoint((from + to) / 2);
    if (index < 0) { announce(labels.pointRefused ?? "No room for another point"); return; }
    setActivePoint(index); fit(); render();
    pointNodes[index]?.knot.focus?.();
    announce(labels.pointAdded ?? "Point added, {n} in total");
    emitCommit("point");
  }
  function isInsertKey(event: KeyboardEvent): boolean { return event.key === "+" || event.key === "=" || event.key === "Insert";
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
    if (model.mode === "bezier") { model.curve = { ...(options.resetCurve ?? DEFAULT_CURVE) }; model.points = []; syncPoints(); setActivePoint(null); }
    else if (model.mode === "back") model.back = { overshoot: DEFAULT_BACK_OVERSHOOT };
    else if (model.mode === "elastic") model.elastic = defaultParams("elastic");
    else model.bounce = defaultParams("bounce");
    buildFields(); fit(); render();
    emitCommit("reset");
  }

  // End handles: drag and keyboard.
  endHandles.forEach((node, i) => {
    const index = i as 0 | 1;
    bindDrag(node, () => ({ kind: "end", move: (p, event) => { const c = snapped(toCurve(p), event); moveEnd(index, c.x, c.y); } }));
    node.addEventListener("keydown", e => {
      const event = e as KeyboardEvent;
      if (model.mode === "bezier" && isInsertKey(event)) { event.preventDefault(); insertAfter(index === 0 ? -1 : model.points.length - 1); return; }
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
    bindDrag(node, () => ({ kind: "half", move: p => { const c = toCurve(p); moveHalf(index, c.x, c.y); } }));
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
  // Speed view: ONE control. A vertical drag anywhere on the plot (or on the
  // peak marker) smooths both ends together: down = sharper peak, up = linear.
  function speedDrag(start: Pt): GestureStart {
    const startCurve = { ...model.curve };
    return { kind: "speed", move: p => { model.curve = speedDragToCurve(startCurve, (p.y - start.y) / CURVE_PLOT); } };
  }
  bindDrag(speedMarker, event => { const p = plotPoint(event); return p ? speedDrag(p) : null; });
  speedMarker.addEventListener("keydown", e => {
    const event = e as KeyboardEvent;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const amount = (event.key === "ArrowDown" ? 1 : -1) * (event.shiftKey ? SPEED_KEY_COARSE : SPEED_KEY_STEP);
    model.curve = speedDragToCurve(model.curve, amount);
    afterKey(event);
  });
  /**
   * A press on the plot (or on the invisible band around the curve). Order:
   * speed view → the single speed control; a dot within `HANDLE_CAPTURE_PX` →
   * drag that dot; on the curve band in value view → insert a point (de
   * Casteljau keeps the shape) that the same gesture drags. A plain click
   * commits "point"; a drag commits "gesture" including the insertion.
   * Back/elastic/bounce only have their half handles.
   */
  function pressPlot(event: MouseEvent, onLine: boolean): GestureStart | null {
    const p = plotPoint(event);
    if (!p) return null;
    if (speedView()) { (speedMarker as unknown as HTMLElement).focus?.(); return speedDrag(p); }
    const dot = nearestDot(p);
    if (dot) {
      (dot as unknown as HTMLElement).focus?.();
      const begun = begins.get(dot)?.(event);
      return begun ? anchored(begun, dot, event) : null;
    }
    if (!onLine || model.mode !== "bezier") return null;
    const index = insertPoint(toCurve(p).x);
    if (index < 0) { announce(labels.pointRefused ?? "No room for another point"); return null; }
    const nodes = pointNodes[index]!;
    nodes.knot.setAttribute("data-pop", "true"); nodes.ring.setAttribute("data-pop", "true");
    setActivePoint(index);
    render();
    nodes.knot.focus?.();
    announce(labels.pointAdded ?? "Point added, {n} in total");
    return {
      kind: "line",
      move: (q, event) => { const d = snapped(toCurve(q), event); movePoint(index, { x: d.x, y: d.y }, false); },
      onClick: () => emitCommit("point")
    };
  }
  bindDrag(hit, event => pressPlot(event, true));
  bindDrag(svg, event => pressPlot(event, event.target === hit));

  function syncPoints(): void {
    while (pointNodes.length > model.points.length) {
      const nodes = pointNodes.pop()!;
      for (const node of [nodes.stemIn, nodes.stemOut, nodes.handleIn, nodes.handleOut, nodes.ring, nodes.knot]) pointsGroup.removeChild(node);
    }
    if (activePoint !== null && activePoint >= model.points.length) setActivePoint(null);
    while (pointNodes.length < model.points.length) {
      const index = pointNodes.length;
      const nodes: PointNodes = {
        stemIn: svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }),
        stemOut: svgEl("line", "ch-curve__stem", { "aria-hidden": "true" }),
        knot: slider(labels.point, "ch-curve__point"),
        ring: ring("point"),
        handleIn: slider(labels.pointIn),
        handleOut: slider(labels.pointOut)
      };
      // Pressing a knot or one of its handles makes the point active so Delete right after a click removes only it.
      const activate = (): void => { setActivePoint(index); nodes.knot.focus?.(); };
      bindDrag(nodes.knot, () => { activate(); return { kind: "point", move: (p, event) => { const c = snapped(toCurve(p), event); movePoint(index, { x: c.x, y: c.y }, false); } }; });
      bindDrag(nodes.handleIn, () => { activate(); return { kind: "handleIn", move: (p, event) => { const c = snapped(toCurve(p), event); movePoint(index, { inX: c.x, inY: c.y }, !event.altKey); } }; });
      bindDrag(nodes.handleOut, () => { activate(); return { kind: "handleOut", move: (p, event) => { const c = snapped(toCurve(p), event); movePoint(index, { outX: c.x, outY: c.y }, !event.altKey); } }; });
      nodes.knot.addEventListener("animationend", () => { nodes.knot.removeAttribute("data-pop"); nodes.ring.removeAttribute("data-pop"); });
      nodes.knot.addEventListener("keydown", e => {
        const event = e as KeyboardEvent;
        if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); removePoint(index); return; }
        if (isInsertKey(event)) { event.preventDefault(); insertAfter(index); return; }
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
      for (const node of [nodes.stemIn, nodes.stemOut, nodes.handleIn, nodes.handleOut, nodes.ring, nodes.knot]) pointsGroup.appendChild(node);
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
    hint.textContent = speed ? labels.speedHint ?? "" : labels.addPointHint;
    hideHtml(hint, !(model.mode === "bezier" && (!speed || Boolean(labels.speedHint))));
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
    hit.setAttribute("d", main.getAttribute("d") ?? "");
    show(hit, model.mode === "bezier");
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
      place(nodes.knot, p.x, p.y, undefined, nodes.ring);
      place(nodes.handleIn, p.inX, p.inY);
      place(nodes.handleOut, p.outX, p.outY);
      stem(nodes.stemIn, p.x, p.y, p.inX, p.inY);
      stem(nodes.stemOut, p.x, p.y, p.outX, p.outY);
    });
    // Speed view.
    show(speedMarker, speed); show(markerRing, speed);
    show(peakText, speed);
    if (speed) {
      let top = { x: 0.5, speed: 0 };
      for (const sample of sampleBezierSpeed(model.curve, 129)) if (sample.speed > top.speed) top = sample;
      const peak = peakSpeed(model.curve);
      place(speedMarker, top.x, top.speed, `×${peak.toFixed(1)}`, markerRing);
      speedMarker.setAttribute("aria-valuenow", String(round3(peak)));
      speedMarker.setAttribute("aria-valuemin", "1"); speedMarker.setAttribute("aria-valuemax", "10");
      peakText.textContent = `×${peak.toFixed(1)}`;
      (peakText as unknown as HTMLElement).style?.setProperty?.("font-size", `${fmt(LABEL_PX / pxPerUnit())}px`);
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
    renderCues();
  }

  /** Value samples read back from the drawn path, so every mode and extra point is covered by one code path. */
  let cueSamples: Pt[] = [];
  let trailFrame: number | null = null;
  const trailPercent = (value: number): number => (4 + Math.max(-0.04, Math.min(1.04, value)) * 92);
  function cueValueAt(time: number): number {
    if (cueSamples.length < 2) return time;
    const x = CURVE_PAD + time * CURVE_PLOT;
    let index = 1;
    while (index < cueSamples.length - 1 && cueSamples[index]!.x < x) index++;
    const a = cueSamples[index - 1]!, b = cueSamples[index]!;
    const y = b.x === a.x ? b.y : a.y + (b.y - a.y) * Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
    return plotToCurve(x, y, range).y;
  }
  function cueSpeedAt(time: number): number {
    const d = 0.004, a = Math.max(0, time - d), b = Math.min(1, time + d);
    return (cueValueAt(b) - cueValueAt(a)) / (b - a || 1);
  }
  function renderCues(): void {
    if (!cueOn || !canSvg) return;
    const path = main as unknown as { getTotalLength?(): number; getPointAtLength?(length: number): Pt };
    const value = !speedView();
    const measurable = value && typeof path.getTotalLength === "function" && typeof path.getPointAtLength === "function";
    container.setAttribute("data-cues", String(measurable));
    // Bands above 100 % and below 0 %: where overshoot lives.
    const one = curveToPlot(0, 1, range).y, zero = curveToPlot(0, 0, range).y, bottom = CURVE_PAD + CURVE_PLOT, unit = 1 / pxPerUnit();
    const bandBox = [[CURVE_PAD, Math.max(0, one - CURVE_PAD)], [zero, Math.max(0, bottom - zero)]] as const;
    bands.forEach((band, i) => {
      const [y, height] = bandBox[i]!;
      band.setAttribute("x", String(CURVE_PAD)); band.setAttribute("y", fmt(y)); band.setAttribute("width", String(CURVE_PLOT)); band.setAttribute("height", fmt(height));
      show(band, value && height > 0.5);
    });
    axisLabels.forEach((label, i) => {
      label.setAttribute("x", fmt(CURVE_PAD - 4 * unit)); label.setAttribute("y", fmt((i ? zero : one) + 3 * unit));
      (label as unknown as HTMLElement).style?.setProperty?.("font-size", `${fmt(9 * unit)}px`);
      show(label, value);
    });
    keySquares.forEach((key, i) => {
      const at = curveToPlot(i, i, range), size = 8 * unit;
      key.setAttribute("x", fmt(at.x - size / 2)); key.setAttribute("y", fmt(at.y - size / 2));
      key.setAttribute("width", fmt(size)); key.setAttribute("height", fmt(size));
      show(key, value);
    });
    for (const node of [speedArea, speedLine, speedPeak, speedLabel, preview]) show(node, false);
    if (trail) hideHtml(trail, !measurable);
    if (!measurable) { cueSamples = []; return; }
    const total = path.getTotalLength!(), count = 120;
    cueSamples = [];
    for (let i = 0; i <= count; i++) { const point = path.getPointAtLength!(total * i / count); cueSamples.push({ x: point.x, y: point.y }); }
    // Speed as an area from the 0 % line; the peak reaches half of the 0–100 % height.
    const speeds: number[] = []; let peak = 0, peakAt = 0;
    for (let i = 0; i <= count; i++) { const v = cueSpeedAt(i / count); speeds.push(v); if (Math.abs(v) > peak) { peak = Math.abs(v); peakAt = i; } }
    if (speedAreaOn && peak > 1e-6) {
      const scale = (zero - one) * 0.5 / peak, top = (v: number): number => Math.max(CURVE_PAD, Math.min(bottom, zero - v * scale));
      const points = speeds.map((v, i) => `${fmt(CURVE_PAD + i / count * CURVE_PLOT)},${fmt(top(v))}`);
      speedLine.setAttribute("d", `M ${points.join(" L ")}`);
      speedArea.setAttribute("d", `M ${CURVE_PAD},${fmt(zero)} L ${points.join(" L ")} L ${CURVE_PAD + CURVE_PLOT},${fmt(zero)} Z`);
      const px = CURVE_PAD + peakAt / count * CURVE_PLOT, py = top(speeds[peakAt]!), right = peakAt / count < 0.7;
      speedPeak.setAttribute("x1", fmt(px)); speedPeak.setAttribute("x2", fmt(px)); speedPeak.setAttribute("y1", fmt(zero)); speedPeak.setAttribute("y2", fmt(py));
      speedLabel.textContent = `${labels.cuePeak ?? "peak"} ${decimal(peak, 1)}×`;
      speedLabel.setAttribute("text-anchor", right ? "start" : "end");
      speedLabel.setAttribute("x", fmt(px + (right ? 6 : -6) * unit)); speedLabel.setAttribute("y", fmt(zero - 6 * unit));
      (speedLabel as unknown as HTMLElement).style?.setProperty?.("font-size", `${fmt(10 * unit)}px`);
      for (const node of [speedArea, speedLine, speedPeak, speedLabel]) show(node, true);
    }
    if (previewCurve) {
      preview.setAttribute("d", valuePathD({ ...model, mode: "bezier", points: [], curve: previewCurve }, range));
      show(preview, true);
    }
    if (trailTicks && trailLabel) {
      while (trailTicks.firstChild) trailTicks.removeChild(trailTicks.firstChild);
      for (let i = 0; i <= cueFrames; i++) {
        const tick = createElement(doc, "i", i === 0 || i === cueFrames ? "is-key" : "");
        tick.style.left = `${fmt(trailPercent(cueValueAt(i / cueFrames)))}%`;
        trailTicks.appendChild(tick);
      }
      trailLabel.textContent = `${cueFrames} ${labels.cueFrames ?? "f"} · ${decimal(cueFrames / cueFps, 2)} s`;
    }
    if (trailBall && trailFrame === null) trailBall.style.left = `${fmt(trailPercent(cueValueAt(1)))}%`;
  }
  // Probe: time, value and speed under the cursor; the ruler head follows it.
  const probeInfo = cueOn ? createElement(doc, "div", "ch-curve__probe") : null;
  if (probeInfo) { probeInfo.setAttribute("aria-hidden", "true"); plot.appendChild(probeInfo); }
  function hideProbe(): void {
    if (!probeInfo) return;
    show(probeLine, false); show(probeDot, false); probeInfo.removeAttribute("data-on");
  }
  function probeAt(time: number): void {
    if (!probeInfo || !cueSamples.length) return;
    const value = cueValueAt(time), speed = cueSpeedAt(time), x = CURVE_PAD + time * CURVE_PLOT;
    const y = curveToPlot(time, Math.max(range.low, Math.min(range.high, value)), range).y;
    probeLine.setAttribute("x1", fmt(x)); probeLine.setAttribute("x2", fmt(x));
    probeLine.setAttribute("y1", String(CURVE_PAD)); probeLine.setAttribute("y2", String(CURVE_PAD + CURVE_PLOT));
    probeDot.setAttribute("cx", fmt(x)); probeDot.setAttribute("cy", fmt(y));
    show(probeLine, true); show(probeDot, true);
    probeInfo.textContent = `${labels.cueTime ?? "time"} ${Math.round(time * 100)}% · ${labels.cueValue ?? "value"} ${Math.round(value * 100)}% · ${labels.cueSpeed ?? "speed"} ${decimal(speed, 1)}×`;
    probeInfo.setAttribute("data-on", "true");
    if (trailFrame === null && trailBall) trailBall.style.left = `${fmt(trailPercent(value))}%`;
  }
  if (cueOn) {
    svg.addEventListener("pointermove", event => {
      if (gesture || speedView()) { hideProbe(); return; }
      const p = plotPoint(event as MouseEvent);
      if (!p) return;
      const time = (p.x - CURVE_PAD) / CURVE_PLOT;
      if (time < -0.03 || time > 1.03) { hideProbe(); return; }
      probeAt(Math.max(0, Math.min(1, time)));
    });
    svg.addEventListener("pointerleave", () => { hideProbe(); if (trailFrame === null && trailBall && cueSamples.length) trailBall.style.left = `${fmt(trailPercent(cueValueAt(1)))}%`; });
    svg.addEventListener("pointerdown", hideProbe);
  }
  function stopTrail(): void {
    if (trailFrame !== null) doc.defaultView?.cancelAnimationFrame?.(trailFrame);
    trailFrame = null;
  }
  /** One pass of the head along the ruler, so the timing can be read without touching the timeline. */
  function playTrail(): void {
    const win = doc.defaultView;
    if (!trailBall || !cueSamples.length || disposed) return;
    stopTrail();
    if (typeof win?.requestAnimationFrame !== "function" || doc.documentElement?.getAttribute?.("data-reduced-motion") === "true") { renderCues(); return; }
    let start = 0;
    const step = (now: number): void => {
      if (disposed) { trailFrame = null; return; }
      start = start || now;
      const time = Math.min(1, (now - start) / TRAIL_MS);
      trailBall.style.left = `${fmt(trailPercent(cueValueAt(time)))}%`;
      trailFrame = time < 1 ? win.requestAnimationFrame(step) : null;
    };
    trailFrame = win.requestAnimationFrame(step);
  }
  function setPreview(curve: CubicBezierCurve | null): void {
    if (!cueOn || disposed) return;
    previewCurve = curve ? { ...curve } : null;
    renderCues();
  }
  function setCueTiming(frames: number, fps: number): void {
    if (!cueOn || disposed || !Number.isFinite(frames) || !Number.isFinite(fps) || fps <= 0) return;
    cueFrames = Math.max(2, Math.min(240, Math.round(frames))); cueFps = fps;
    renderCues();
  }
  function setSpeedArea(visible: boolean): void {
    if (!cueOn || disposed) return;
    speedAreaOn = visible;
    renderCues();
  }

  let morphFrame: number | null = null;
  function stopMorph(): void {
    if (morphFrame !== null) doc.defaultView?.cancelAnimationFrame?.(morphFrame);
    morphFrame = null;
  }
  const plainBezier = (value: CurveEditorModel): boolean => value.mode === "bezier" && !value.points.length;
  /** Draws the way from `from` to the model's curve; the model itself already holds the target. */
  function morphFrom(from: CubicBezierCurve): void {
    const win = doc.defaultView;
    if (!canSvg || typeof win?.requestAnimationFrame !== "function" || doc.documentElement?.getAttribute?.("data-reduced-motion") === "true") { render(); return; }
    let start: number | null = null;
    const draw = (t: number): void => { const target = model.curve; model.curve = morphCurve(from, target, t); render(); model.curve = target; };
    const step = (now: number): void => {
      // A gesture or a newer model takes over from the current drawing.
      if (disposed || gesture) { morphFrame = null; if (!disposed) render(); return; }
      start ??= now;
      const t = Math.min(1, (now - start) / CURVE_MORPH_MS);
      if (t < 1) { draw(t); morphFrame = win.requestAnimationFrame(step); } else { morphFrame = null; render(); }
    };
    draw(0);
    morphFrame = win.requestAnimationFrame(step);
  }
  function setModel(next: CurveEditorModel, setOptions: { silent?: boolean; animate?: boolean } = {}): void {
    if (disposed) return;
    stopMorph();
    cancelGesture();
    closeMenu(false);
    const previous = model;
    model = cloneModel(next);
    if (model.mode !== "bezier" || model.points.length) model.view = "value";
    if (canSvg) { syncPoints(); setActivePoint(null); }
    buildFields(); fit();
    const moved = previous.curve.x1 !== model.curve.x1 || previous.curve.y1 !== model.curve.y1 || previous.curve.x2 !== model.curve.x2 || previous.curve.y2 !== model.curve.y2;
    if (setOptions.animate && moved && plainBezier(previous) && plainBezier(model)) morphFrom({ ...previous.curve });
    else render();
  }
  function dispose(): void {
    if (disposed) return;
    stopMorph();
    stopTrail();
    cancelGesture();
    closeMenu(false);
    disposed = true;
    fieldCleanups.forEach(cleanup => cleanup());
    fieldCleanups = [];
    if (canSvg) pointNodes = [];
  }

  syncPoints(); buildFields(); fit(); render();
  return { element: container, setModel, getModel: () => cloneModel(model), setPreview, setCueTiming, setSpeedArea, dispose };
}
