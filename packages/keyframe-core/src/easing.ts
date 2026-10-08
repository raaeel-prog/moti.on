/**
 * Easing math shared by the curve editor (panel) and the host mirror in
 * `apps/after-effects-cep/host/src/keyframe-operations.jsx`.
 *
 * Everything here is pure. The host mirror repeats the same arithmetic in the
 * same order (ES3), and `easing-paridade.test.mjs` compares the two on a table
 * so they cannot drift apart silently.
 */
import type { CubicBezierCurve } from "./types.js";

export type EasingMode = "bezier" | "back" | "elastic" | "bounce";
export type EasingDirection = "in" | "out" | "inOut";

/** Parameters of an oscillating easing (elastic, bounce). */
export interface OscillationParams { amp: number; freq: number; decay: number; start: number }

/** Interior point of a multi-segment value curve, in absolute plot coordinates (x 0..1). */
export interface CurvePoint { x: number; y: number; inX: number; inY: number; outX: number; outY: number }

/** Parameters of a baked easing: one set per half, with optional bezier halves for InOut. */
export interface EasingParams {
  in: OscillationParams;
  out: OscillationParams;
  inCurve?: CubicBezierCurve | null;
  outCurve?: CubicBezierCurve | null;
}

export const DEFAULT_ELASTIC: OscillationParams = { amp: 1, freq: 3.3, decay: 6.9, start: 0 };
export const DEFAULT_BOUNCE: OscillationParams = { amp: 0.5, freq: 3, decay: 1.2, start: 0 };
export const DEFAULT_BACK_OVERSHOOT = 0.56;
/** Seed for the editable in-half of an InOut elastic/bounce. */
export const DEFAULT_HALF_CURVE: CubicBezierCurve = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

// --- cubic bezier -----------------------------------------------------------

export function bezierPoint(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

export function bezierDerivative(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/** Parametric t whose x(t) equals `x`, by bisection (x is monotonic for x1,x2 in 0..1). */
export function bezierTForX(curve: CubicBezierCurve, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bezierPoint(mid, curve.x1, curve.x2) < x) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function bezierValueAt(curve: CubicBezierCurve, x: number): number {
  return bezierPoint(bezierTForX(curve, x), curve.y1, curve.y2);
}

/** dy/dx at `x`. Linear is 1 everywhere. A vertical handle is clamped, never infinite. */
export function bezierSpeedAt(curve: CubicBezierCurve, x: number): number {
  const t = bezierTForX(curve, x);
  const dx = bezierDerivative(t, curve.x1, curve.x2);
  const dy = bezierDerivative(t, curve.y1, curve.y2);
  return dy / Math.max(dx, 1e-4);
}

export function sampleBezierSpeed(curve: CubicBezierCurve, samples = 129): { x: number; speed: number }[] {
  const out: { x: number; speed: number }[] = [];
  const n = Math.max(2, Math.floor(samples));
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out.push({ x, speed: bezierSpeedAt(curve, x) });
  }
  return out;
}

/** Highest |speed| relative to linear motion. */
export function peakSpeed(curve: CubicBezierCurve, samples = 129): number {
  let peak = 0;
  for (const sample of sampleBezierSpeed(curve, samples)) peak = Math.max(peak, Math.abs(sample.speed));
  return peak;
}

/**
 * Drag on the speed graph. `px` is the normalized x where the drag started and
 * `dyNorm` the vertical displacement as a fraction of the plot height (up is
 * positive). Near the left edge only the out influence (x1) changes, near the
 * right edge only the in influence (1 - x2); in the middle both change.
 */
export function speedDragToCurve(start: CubicBezierCurve, px: number, dyNorm: number): CubicBezierCurve {
  const wL = clamp((0.65 - px) / 0.3, 0, 1);
  const wR = clamp((px - 0.35) / 0.3, 0, 1);
  const a = clamp(start.x1 + dyNorm * wL, 0, 1);
  const b = clamp((1 - start.x2) + dyNorm * wR, 0, 1);
  return { x1: round3(a), y1: start.y1, x2: round3(1 - b), y2: start.y2 };
}

function round3(value: number): number { return Math.round(value * 1000) / 1000; }

// --- multi-point curve ------------------------------------------------------

/**
 * Splits the absolute curve (endpoints (0,0) and (1,1) with handles x1..y2 plus
 * interior points) into segment-local cubic curves, each normalized to its own
 * 0..1 box so the existing curve→KeyframeEase conversion applies per segment.
 */
export function normalizeCurveSegments(curve: CubicBezierCurve, points: readonly CurvePoint[]):
{ knots: { x: number; y: number }[]; segments: CubicBezierCurve[] } {
  const knots = [{ x: 0, y: 0 }, ...points.map(p => ({ x: p.x, y: p.y })), { x: 1, y: 1 }];
  const segments: CubicBezierCurve[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i]!, b = knots[i + 1]!;
    const p1 = i === 0 ? { x: curve.x1, y: curve.y1 } : { x: points[i - 1]!.outX, y: points[i - 1]!.outY };
    const p2 = i === knots.length - 2 ? { x: curve.x2, y: curve.y2 } : { x: points[i]!.inX, y: points[i]!.inY };
    const dx = b.x - a.x, dy = b.y - a.y;
    const flat = Math.abs(dy) < 1e-9;
    segments.push({
      x1: dx <= 0 ? 0 : clamp((p1.x - a.x) / dx, 0, 1),
      y1: flat ? 0 : (p1.y - a.y) / dy,
      x2: dx <= 0 ? 1 : clamp((p2.x - a.x) / dx, 0, 1),
      y2: flat ? 1 : (p2.y - a.y) / dy
    });
  }
  return { knots, segments };
}

/** Value of the multi-point curve at absolute `x`. */
export function multiPointValueAt(curve: CubicBezierCurve, points: readonly CurvePoint[], x: number): number {
  if (!points.length) return bezierValueAt(curve, x);
  const { knots, segments } = normalizeCurveSegments(curve, points);
  for (let i = 0; i < segments.length; i++) {
    const a = knots[i]!, b = knots[i + 1]!;
    if (x <= b.x || i === segments.length - 1) {
      const dx = b.x - a.x;
      const local = dx <= 0 ? 1 : clamp((x - a.x) / dx, 0, 1);
      return a.y + bezierValueAt(segments[i]!, local) * (b.y - a.y);
    }
  }
  return 1;
}

/** Points must be strictly increasing in x inside (0,1), with handles kept inside their segments. */
export function sortedPointsValid(points: readonly CurvePoint[]): boolean {
  let previous = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const next = i + 1 < points.length ? points[i + 1]!.x : 1;
    const numbers = [p.x, p.y, p.inX, p.inY, p.outX, p.outY];
    if (!numbers.every(Number.isFinite)) return false;
    if (!(p.x > previous && p.x < 1 && p.x < next)) return false;
    if (p.inX > p.x || p.outX < p.x || p.inX < previous || p.outX > next) return false;
    previous = p.x;
  }
  return true;
}

/** Keeps the endpoint handles inside the first and last segments once interior points exist. */
export function constrainCurveEnds(curve: CubicBezierCurve, points: readonly CurvePoint[]): CubicBezierCurve {
  if (!points.length) return { ...curve };
  const first = points[0]!.x, last = points[points.length - 1]!.x;
  return { x1: round3(clamp(curve.x1, 0, first)), y1: curve.y1, x2: round3(clamp(curve.x2, last, 1)), y2: curve.y2 };
}

/**
 * Inserts a point on the curve at absolute `x` without changing its shape: the
 * containing segment is split with de Casteljau, so the new point and the
 * neighbouring handles reproduce the previous curve exactly.
 */
export function insertCurvePoint(curve: CubicBezierCurve, points: readonly CurvePoint[], x: number):
{ curve: CubicBezierCurve; points: CurvePoint[] } {
  const clampedX = clamp(x, 0.02, 0.98);
  const index = points.findIndex(p => p.x >= clampedX);
  const segment = index === -1 ? points.length : index;
  const left = segment === 0 ? 0 : points[segment - 1]!.x;
  const right = segment === points.length ? 1 : points[segment]!.x;
  if (right - left < 0.04 || clampedX - left < 0.01 || right - clampedX < 0.01) return { curve: { ...curve }, points: [...points] };
  const a = segment === 0 ? { x: 0, y: 0 } : { x: points[segment - 1]!.x, y: points[segment - 1]!.y };
  const b = segment === points.length ? { x: 1, y: 1 } : { x: points[segment]!.x, y: points[segment]!.y };
  const p1 = segment === 0 ? { x: curve.x1, y: curve.y1 } : { x: points[segment - 1]!.outX, y: points[segment - 1]!.outY };
  const p2 = segment === points.length ? { x: curve.x2, y: curve.y2 } : { x: points[segment]!.inX, y: points[segment]!.inY };
  const { segments } = normalizeCurveSegments(curve, points);
  const t = bezierTForX(segments[segment]!, (clampedX - a.x) / (b.x - a.x));
  const lerp = (p: { x: number; y: number }, q: { x: number; y: number }): { x: number; y: number } => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const q0 = lerp(a, p1), q1 = lerp(p1, p2), q2 = lerp(p2, b);
  const r0 = lerp(q0, q1), r1 = lerp(q1, q2);
  const s = lerp(r0, r1);
  const point: CurvePoint = { x: round3(s.x), y: round3(s.y), inX: round3(r0.x), inY: round3(r0.y), outX: round3(r1.x), outY: round3(r1.y) };
  const next = points.map(p => ({ ...p }));
  let nextCurve = { ...curve };
  if (segment === 0) nextCurve = { ...nextCurve, x1: round3(q0.x), y1: round3(q0.y) };
  else { next[segment - 1]!.outX = round3(q0.x); next[segment - 1]!.outY = round3(q0.y); }
  if (segment === points.length) nextCurve = { ...nextCurve, x2: round3(q2.x), y2: round3(q2.y) };
  else { next[segment]!.inX = round3(q2.x); next[segment]!.inY = round3(q2.y); }
  next.splice(segment, 0, point);
  return { curve: nextCurve, points: next };
}

/**
 * Applies a partial update to one point keeping the list valid: the knot stays
 * between its neighbours, handles stay inside the adjacent segments, and when
 * `mirror` is on moving one handle rotates the other to keep the tangent smooth.
 */
export function constrainCurvePoint(points: readonly CurvePoint[], index: number, next: Partial<CurvePoint>, mirror: boolean): CurvePoint {
  const current = points[index]!;
  const left = index === 0 ? 0 : points[index - 1]!.x;
  const right = index === points.length - 1 ? 1 : points[index + 1]!.x;
  const gap = 0.01;
  const merged = { ...current, ...next };
  const result: CurvePoint = { ...merged };
  if (next.x !== undefined || next.y !== undefined) {
    // Moving the knot carries both handles along.
    const dx = clamp(merged.x, left + gap, right - gap) - current.x;
    const dy = clamp(merged.y, -1, 2) - current.y;
    result.x = current.x + dx; result.y = current.y + dy;
    result.inX = current.inX + dx; result.inY = current.inY + dy;
    result.outX = current.outX + dx; result.outY = current.outY + dy;
  }
  const movedIn = next.inX !== undefined || next.inY !== undefined;
  const movedOut = next.outX !== undefined || next.outY !== undefined;
  if (movedIn && mirror) {
    result.outX = result.x + (result.x - result.inX);
    result.outY = result.y + (result.y - result.inY);
  }
  if (movedOut && mirror) {
    result.inX = result.x - (result.outX - result.x);
    result.inY = result.y - (result.outY - result.y);
  }
  result.inX = clamp(result.inX, left, result.x);
  result.outX = clamp(result.outX, result.x, right);
  result.inY = clamp(result.inY, -1, 2);
  result.outY = clamp(result.outY, -1, 2);
  result.y = clamp(result.y, -1, 2);
  return { x: round3(result.x), y: round3(result.y), inX: round3(result.inX), inY: round3(result.inY), outX: round3(result.outX), outY: round3(result.outY) };
}

// --- parametric easings -----------------------------------------------------

/** Overshoot bezier. `overshoot` 0..1; 0.56 reproduces the "Back Out" preset. */
export function backCurve(overshoot: number, direction: EasingDirection): CubicBezierCurve {
  const o = clamp(overshoot, 0, 1);
  if (direction === "in") return { x1: 0.36, y1: 0, x2: 0.66, y2: round3(-o) };
  if (direction === "inOut") return { x1: 0.68, y1: round3(-o), x2: 0.32, y2: round3(1 + o) };
  return { x1: 0.34, y1: round3(1 + o), x2: 0.64, y2: 1 };
}

function elasticRaw(t: number, p: OscillationParams): number {
  const e = Math.exp(-p.decay * t);
  const phase = 2 * Math.PI * p.freq * t;
  return 1 - (1 - p.start) * e * Math.cos(phase) + (p.amp - 1) * e * Math.sin(phase);
}

/** Damped oscillation around 1. value(0) = start, value(1) = 1 exactly. */
export function elasticOut(t: number, p: OscillationParams): number {
  const u = clamp(t, 0, 1);
  return elasticRaw(u, p) - (elasticRaw(1, p) - 1) * u;
}

/** Fall then `round(freq)` bounces of decreasing height. value(0) = start, value(1) = 1. */
export function bounceOut(t: number, p: OscillationParams): number {
  const u = clamp(t, 0, 1);
  const n = clamp(Math.round(p.freq), 0, 8);
  const heights: number[] = [];
  const durations: number[] = [1];
  let total = 1;
  for (let i = 1; i <= n; i++) {
    const h = clamp(p.amp * Math.exp(-p.decay * (i - 1)), 0, 1);
    heights.push(h);
    const d = Math.sqrt(h);
    durations.push(d);
    total += d;
  }
  let elapsed = 0;
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i]! / total;
    if (u <= elapsed + d || i === durations.length - 1) {
      const local = d <= 0 ? 1 : clamp((u - elapsed) / d, 0, 1);
      if (i === 0) return p.start + (1 - p.start) * local * local;
      return 1 - heights[i - 1]! * 4 * local * (1 - local);
    }
    elapsed += d;
  }
  return 1;
}

function halfOut(mode: EasingMode, t: number, p: OscillationParams): number {
  return mode === "bounce" ? bounceOut(t, p) : elasticOut(t, p);
}

/** Value (0..1 scale) of a baked easing at normalized time `t`. */
export function easingValue(mode: EasingMode, params: EasingParams, direction: EasingDirection, t: number): number {
  const u = clamp(t, 0, 1);
  if (direction === "out") return halfOut(mode, u, params.out);
  if (direction === "in") return 1 - halfOut(mode, 1 - u, params.in);
  if (u < 0.5) {
    const local = u * 2;
    const value = params.inCurve ? bezierValueAt(params.inCurve, local) : 1 - halfOut(mode, 1 - local, params.in);
    return 0.5 * value;
  }
  const local = u * 2 - 1;
  const value = params.outCurve ? bezierValueAt(params.outCurve, local) : halfOut(mode, local, params.out);
  return 0.5 + 0.5 * value;
}

export function sampleEasing(mode: EasingMode, params: EasingParams, direction: EasingDirection, samples = 256): number[] {
  const n = Math.max(2, Math.floor(samples));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(easingValue(mode, params, direction, i / (n - 1)));
  return out;
}

/** Plot range that always includes 0..1 and every sampled value, with optional padding. */
export function fitRange(values: readonly number[], pad = 0): { low: number; high: number } {
  let low = 0, high = 1;
  for (const v of values) { if (Number.isFinite(v)) { if (v < low) low = v; if (v > high) high = v; } }
  return { low: low - pad, high: high + pad };
}
