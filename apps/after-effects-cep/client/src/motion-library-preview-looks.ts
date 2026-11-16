import type { MotionLibraryOptions, MotionLibraryPreset } from "@motion/contracts";

/** Illustrations of reveals and looks on the gallery card. The host drives
 * native effects; the card shows the same hidden fraction (reveals) and the same
 * Intensity blend (looks), not a pixel match of each effect. */
type Node = (tag: string, attrs: Record<string, string | number>, parent?: Element) => SVGElement;
export interface PreviewBox { left: number; top: number; right: number; bottom: number }

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
/** Deterministic 0..1 value per block, so blocks dissolve in a fixed order. */
const hash = (i: number, j: number): number => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };

/** The side a reveal uncovers first; the recipe's own when Direction is Original. */
export function revealSide(p: MotionLibraryPreset, options: MotionLibraryOptions): "left" | "right" | "top" | "bottom" {
  const d = options.direction === "preset" ? p.defaults?.direction ?? "left" : options.direction;
  // Reveals take no diagonal (the host rejects one); keep the horizontal side if given.
  return d === "preset" ? "left" : d === "top" || d === "bottom" || d === "left" || d === "right" ? d : d.endsWith("left") ? "left" : "right";
}

/** Clip the layer to its visible part. k is the hidden fraction: the eased
 * weight times Intensity, as the host's transition completion. */
export function revealPreviewClip(node: Node, defs: Element, id: string, p: MotionLibraryPreset, options: MotionLibraryOptions, weight: number, box: PreviewBox): boolean {
  if (!p.effect.startsWith("reveal-")) return false;
  const k = clamp(weight * options.intensity / 100), v = 1 - k, clip = node("clipPath", {id}, defs);
  const W = box.right - box.left, H = box.bottom - box.top, side = revealSide(p, options), pad = 40;
  const rect = (x: number, y: number, w: number, h: number): void => { if (w > 0 && h > 0) node("rect", {x, y, width: w, height: h}, clip); };
  if (p.effect === "reveal-linear") {
    if (side === "left") rect(box.left - pad, box.top - pad, pad + W * v, H + 2 * pad);
    if (side === "right") rect(box.right - W * v, box.top - pad, W * v + pad, H + 2 * pad);
    if (side === "top") rect(box.left - pad, box.top - pad, W + 2 * pad, pad + H * v);
    if (side === "bottom") rect(box.left - pad, box.bottom - H * v, W + 2 * pad, H * v + pad);
  } else if (p.effect === "reveal-radial") {
    const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2, r = Math.hypot(W, H);
    if (v >= .999) rect(box.left - pad, box.top - pad, W + 2 * pad, H + 2 * pad);
    else if (v > .001) {
      const a = -Math.PI / 2 + v * 2 * Math.PI, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      node("path", {d: `M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 ${v > .5 ? 1 : 0} 1 ${x} ${y}Z`}, clip);
    }
  } else if (p.effect === "reveal-blinds") {
    const across = side === "left" || side === "right", n = 10, size = (across ? W : H) / n;
    for (let i = 0; i < n; i++) {
      const start = (across ? box.left : box.top) + i * size, shown = size * v, from = side === "right" || side === "bottom" ? start + size - shown : start;
      if (across) rect(from, box.top - pad, shown, H + 2 * pad); else rect(box.left - pad, from, W + 2 * pad, shown);
    }
  } else if (p.effect === "reveal-blocks") {
    const size = Math.max(2, Math.min(W, H) / 14), cols = Math.ceil(W / size), rows = Math.ceil(H / size);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (hash(i, j) >= k) rect(box.left + i * size, box.top + j * size, size + .2, size + .2);
  } else if (p.effect === "reveal-grid") {
    const tile = Math.max(W, H) / 8, radius = tile * v;
    for (let x = box.left; x <= box.right + tile; x += tile) for (let y = box.top; y <= box.bottom + tile; y += tile)
      if (radius > .01) node("path", {d: `M${x} ${y - radius}L${x + radius} ${y}L${x} ${y + radius}L${x - radius} ${y}Z`}, clip);
  } else if (p.effect === "reveal-sweep") {
    // A 45-degree edge travels across the box from the chosen side.
    const span = W + H, edge = span * v - H;
    const points = side === "left" ? [[box.left - pad, box.top - pad], [box.left + edge + H + pad, box.top - pad], [box.left + edge - pad, box.bottom + pad], [box.left - pad, box.bottom + pad]]
      : side === "right" ? [[box.right + pad, box.top - pad], [box.right - edge - pad, box.top - pad], [box.right - edge - H + pad, box.bottom + pad], [box.right + pad, box.bottom + pad]]
      : side === "top" ? [[box.left - pad, box.top - pad], [box.right + pad, box.top - pad], [box.right + pad, box.top + edge - pad], [box.left - pad, box.top + edge + W + pad]]
      : [[box.left - pad, box.bottom + pad], [box.right + pad, box.bottom + pad], [box.right + pad, box.bottom - edge + pad], [box.left - pad, box.bottom - edge - W - pad]];
    if (v > .001) node("path", {d: `M${points.map(point => point.join(" ")).join("L")}Z`}, clip);
  }
  return true;
}

/** Blend source and look by Intensity, as Effect Opacity does in AE. */
function mix(node: Node, f: Element, look: string, amount: number): void {
  node("feComposite", {in: look, in2: "SourceGraphic", operator: "arithmetic", k1: 0, k2: amount, k3: 1 - amount, k4: 0}, f);
}

/** A look's filter on the card glyph. Returns the effective glyph fill when the
 * look replaces it (dot screen, pencil lines), or "" when only the filter applies. */
export function lookPreviewFilter(node: Node, defs: Element, id: string, p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): {applied: boolean; fill: string; stroke: string} {
  if (!p.effect.startsWith("look-")) return {applied: false, fill: "", stroke: ""};
  const m = clamp(options.intensity / 100), f = node("filter", {id, x: "-20%", y: "-20%", width: "140%", height: "140%"}, defs);
  const frame = Math.floor(time * 12), result = {applied: true, fill: "", stroke: ""};
  const grain = (amount: number, name: string): void => {
    node("feTurbulence", {type: "fractalNoise", baseFrequency: ".9", numOctaves: 1, seed: frame, result: `${name}-noise`}, f);
    node("feColorMatrix", {in: `${name}-noise`, type: "matrix", values: `0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 ${amount} ${amount} ${amount} 0 0`, result: `${name}-grain`}, f);
    node("feComposite", {in: `${name}-grain`, in2: "SourceAlpha", operator: "in", result: `${name}-grain-in`}, f);
  };
  if (p.effect === "look-vhs" || p.effect === "look-crt") {
    node("feTurbulence", {type: "turbulence", baseFrequency: `0 ${p.effect === "look-crt" ? .55 : .4}`, numOctaves: 1, seed: 3, result: "bands"}, f);
    node("feComponentTransfer", {in: "bands", result: "lines"}, f);
    node("feGaussianBlur", {in: "SourceGraphic", stdDeviation: p.effect === "look-vhs" ? "1.4 0" : 1.2, result: "soft"}, f);
    if (p.effect === "look-vhs") {
      node("feTurbulence", {type: "fractalNoise", baseFrequency: ".002 .3", numOctaves: 1, seed: frame, result: "tear"}, f);
      node("feDisplacementMap", {in: "soft", in2: "tear", scale: 4, xChannelSelector: "R", yChannelSelector: "G", result: "torn"}, f);
    }
    node("feComposite", {in: p.effect === "look-vhs" ? "torn" : "soft", in2: "lines", operator: "arithmetic", k1: .55, k2: .7, k3: 0, k4: 0, result: "look"}, f);
    mix(node, f, "look", m);
  } else if (p.effect === "look-film" || p.effect === "look-vintage") {
    const flicker = p.effect === "look-film" ? 1 + (Math.sin(time * 37.7) * .6 + Math.sin(time * 23.1 + 1.3) * .4) * .06 : 1;
    const tone = p.effect === "look-vintage" ? ".39 .77 .19 0 .03 .35 .69 .17 0 .02 .27 .53 .13 0 .02 0 0 0 1 0" : `${1.04 * flicker} 0 0 0 0 0 ${flicker} 0 0 0 0 0 ${.9 * flicker} 0 0 0 0 0 1 0`;
    node("feColorMatrix", {in: "SourceGraphic", type: "matrix", values: tone, result: "toned"}, f);
    grain(p.effect === "look-film" ? .35 : .22, "film");
    node("feBlend", {in: "film-grain-in", in2: "toned", mode: "overlay", result: "look"}, f);
    mix(node, f, "look", m);
  } else if (p.effect === "look-dither") {
    grain(.5, "dither");
    node("feBlend", {in: "dither-grain-in", in2: "SourceGraphic", mode: "overlay", result: "noisy"}, f);
    const steps = "0 .25 .5 .75 1";
    const transfer = node("feComponentTransfer", {in: "noisy", result: "look"}, f);
    for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) node(channel, {type: "discrete", tableValues: steps}, transfer);
    mix(node, f, "look", m);
  } else if (p.effect === "look-stopmotion") {
    node("feTurbulence", {type: "fractalNoise", baseFrequency: ".05", numOctaves: 2, seed: Math.floor(time * 8), result: "boil"}, f);
    node("feDisplacementMap", {in: "SourceGraphic", in2: "boil", scale: 4 * m, xChannelSelector: "R", yChannelSelector: "G"}, f);
  } else if (p.effect === "look-halftone") {
    const pattern = node("pattern", {id: `${id}-dots`, width: 4, height: 4, patternUnits: "userSpaceOnUse"}, defs);
    node("circle", {cx: 2, cy: 2, r: 1.5, fill: "#f2f2f2"}, pattern);
    result.fill = `url(#${id}-dots)`;
    node("feComposite", {in: "SourceGraphic", in2: "SourceGraphic", operator: "over"}, f);
  } else if (p.effect === "look-sketch") {
    node("feTurbulence", {type: "fractalNoise", baseFrequency: ".08", numOctaves: 1, seed: 5, result: "wobble"}, f);
    node("feDisplacementMap", {in: "SourceGraphic", in2: "wobble", scale: 2.5, xChannelSelector: "R", yChannelSelector: "G"}, f);
    result.fill = "none"; result.stroke = "#e9e9e9";
  }
  return result;
}

/** Stop motion holds each frame for an eighth of a second, like Posterize Time. */
export function lookPreviewTime(p: MotionLibraryPreset, time: number): number {
  return p.effect === "look-stopmotion" ? Math.floor(time * 8) / 8 : time;
}
