import { cameraImpactSample, libraryDirection, libraryEase, libraryOffscreenDistance, libraryTiming, libraryWave, libraryOrder, libraryStudioTiming, librarySequence, libraryChoreography, librarySignatureEnvelope, librarySignatureGlyph, librarySignatureVelocity, libraryTextDecode, libraryTextOrient, libraryTextOrder, libraryTextPivot, libraryTextReference, type MotionLibraryOptions, type MotionLibraryPreset } from "@motion/contracts";
import { lookPreviewFilter, lookPreviewTime, revealPreviewClip } from "./motion-library-preview-looks.js";
import { TEXT_PREVIEW_SCALE, textPreviewBounds, textPreviewCharCenters, textPreviewSegments, textPreviewSpreadX, type TextPreviewSegment } from "./text-preview-sample.js";

/** Card geometry: a 320x180 frame with the layer glyph at rest at (160, 98),
 * spanning x -36..36 and y -35..22 around it. */
const CARD = { width: 320, height: 180, x: 160, y: 98, left: -36, top: -35, right: 36, bottom: 22 };

/** Out-of-frame travel for the card, in nominal 1080p pixels (the card is 1:6).
 * The host measures the composition with the same function. */
export function libraryPreviewTravel(p: MotionLibraryPreset, options: MotionLibraryOptions): number {
  const xy = libraryDirection(p.position[0], p.position[1], options.direction), length = Math.hypot(xy[0], xy[1]) || 1;
  const grow = Math.max(1, 1 + Math.max(p.scale[0], p.scale[1]) / 100 * Math.max(1, options.intensity / 100));
  return 6 * libraryOffscreenDistance(CARD.x, CARD.y, CARD.x + CARD.left, CARD.y + CARD.top, CARD.x + CARD.right, CARD.y + CARD.bottom,
    p.rotation[2] || grow > 1 ? grow : 0, xy[0] / length, xy[1] / length, CARD.width, CARD.height, Math.max(8, .02 * CARD.width));
}

export function libraryPreviewEnd(options: MotionLibraryOptions): number {
  return Math.max(3.2, options.durationFrames / 30 * 2 + .8);
}

/** Presentation clock: show the entire transition, with a readable hold and a
 * blank reset between entrances. Recipe time, direction and easing stay intact. */
export function libraryPreviewPlayback(p: MotionLibraryPreset, options: MotionLibraryOptions, elapsed: number): {time: number; opacity: number} {
  if (p.mode !== "transition") return {time: elapsed % 8, opacity: 1};
  const duration = options.durationFrames / 30, end = libraryPreviewEnd(options);
  const shown = Math.max(1.4, Math.min(3, duration)), lead = .22, hold = .8, reset = .22;
  if (options.phase === "out") {
    const t = elapsed % (hold + shown + reset);
    return {time: end - duration + Math.max(0, Math.min(1, (t - hold) / shown)) * duration, opacity: 1};
  }
  if (options.phase === "both") {
    const t = elapsed % (lead + shown * 2 + hold + reset);
    const time = t <= lead + shown ? Math.max(0, (t - lead) / shown) * duration :
      t <= lead + shown + hold ? end / 2 : end - duration + Math.min(1, (t - lead - shown - hold) / shown) * duration;
    return {time, opacity: 1};
  }
  const t = elapsed % (lead + shown + hold + reset * 2);
  return {time: Math.max(0, Math.min(1, (t - lead) / shown)) * duration,
    opacity: 1 - Math.max(0, Math.min(1, (t - lead - shown - hold) / reset))};
}

/** Overlap as the host applies it: only text transitions get an Overlap control;
 * every other recipe runs on the host's fixed 65%. */
function appliedOverlap(p: MotionLibraryPreset, options: MotionLibraryOptions): number {
  return p.category.startsWith("text-") && p.mode === "transition" ? options.overlap ?? p.defaults?.overlap ?? 65 : 65;
}

export function librarySample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number, index = 0, count = 1, line?: readonly [number, number]): { x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; opacity: number; weight: number; progress: number } {
  const unit = options.unit === "preset" ? p.text.unit : options.unit, text = p.category.startsWith("text-");
  // A text motion seen from another side, as the host renders it (travel keeps libraryDirection).
  const o = text ? libraryTextOrient(p, options.direction) : p;
  const studio = p.collection === "studio" || p.collection === "native" || p.collection === "premium" || p.collection === "signature" || p.collection === "momentum" || p.collection === "text";
  const order = options.order && options.order !== "preset" ? options.order : text ? libraryTextOrder(p, options.direction ?? "preset", unit) : o.text.order ?? (o.text.random ? "random" : "forward");
  const seed = options.seed ?? p.defaults?.seed ?? 17;
  // Characters open around the middle of their own line, as the host sequences them.
  const perLine = text && unit === "characters" && line !== undefined && (order === "center-out" || order === "edges-in");
  if (perLine) { index = line[0]; count = Math.max(1, line[1]); }
  const idx = unit === "all" ? 0 : order === "random" && count > 1 ? libraryOrder(index, count, options.seed) : librarySequence(index, count, order);
  const speed = studio ? (options.speed ?? p.defaults?.speed ?? 100) / 100 : 1, age = time * speed;
  const timing = studio ? libraryStudioTiming : libraryTiming, total = unit === "all" ? 1 : count;
  const a = timing(time, 0, libraryPreviewEnd(options), options.durationFrames / 30, options.phase, idx, total, options.staggerFrames / 30, appliedOverlap(p, options))[0];
  // Exit order as in AE: the shared timing mirrors; "repeat" reads the exit reversed.
  const exitIdx = p.category.startsWith("text-") && unit !== "all" && options.exitOrder === "repeat" ? total - 1 - idx : idx;
  const b = timing(time, 0, libraryPreviewEnd(options), options.durationFrames / 30, options.phase, exitIdx, total, options.staggerFrames / 30, appliedOverlap(p, options))[1];
  const easing=options.easing&&options.easing!=="preset"?options.easing:p.easing;
  const elastic = options.elasticity ?? p.defaults?.elasticity;
  const settle = [options.settleAmount ?? p.defaults?.settleAmount, options.settleCount ?? p.defaults?.settleCount, options.settleDamping ?? p.defaults?.settleDamping] as const;
  // The exit term reads the curve backwards; settle curves turn it into anticipation.
  let w = p.mode === "transition" ? 2 - libraryEase(a, easing, elastic, ...settle) - libraryEase(b, easing, elastic, ...settle, 1) : libraryWave(age, idx, p.waveform === "none" ? "wiggle" : p.waveform, seed);
  const fadeWeight = w;
  if (p.mode === "transition" && p.waveform !== "none") w += libraryWave(age, idx, p.waveform, seed) * Math.abs(w) * .25;
  const amp = options.intensity / 100;
  const xy = libraryDirection(p.position[0], p.position[1], options.direction);
  const pose = p.choreography ? libraryChoreography(Math.max(0, Math.min(1, Math.min(a, b))), w, ...p.position, p.choreography.path, p.choreography.distribution ?? "uniform", unit === "all" ? 0 : index, seed, p.choreography.turns ?? 1, options.direction) : undefined;
  const transform = (axis: number, waveSeed: number): number => p.effect === "camera-shake" && waveSeed !== seed + 2 ? libraryWave(age * 3, axis, "wiggle", waveSeed) * fadeWeight : p.mode === "transition" || text ? w : libraryWave(age, axis, p.waveform, waveSeed);
  // Momentum layers hidden at zero scale stay flat above 100% Intensity, as in AE.
  const flat = (axis: number, factor: number): number => p.collection === "momentum" && o.scale[axis]! < 0 ? Math.max(0, factor) : factor;
  // Out-of-frame travel follows the measured distance, not Intensity, as in AE.
  const travel = p.travel === "offscreen" && !text ? libraryPreviewTravel(p, options) / (Math.hypot(xy[0], xy[1]) || 1) : 0;
  const sample = { x: travel ? xy[0] * travel * transform(0, seed) / 6 : amp * (pose ? pose[0] : xy[0] * transform(0, seed)) / 6,
    y: travel ? xy[1] * travel * transform(1, seed) / 6 : amp * (pose ? pose[1] : xy[1] * transform(1, seed)) / 6, z: amp * (pose ? pose[2] : p.position[2] * transform(2, seed)) / 6,
    rx: o.rotation[0] * amp * (pose ? pose[3] : transform(0, seed + 6)), ry: o.rotation[1] * amp * (pose ? pose[3] : transform(1, seed + 6)), rz: o.rotation[2] * amp * (pose ? pose[3] : transform(2, seed + 6)),
    sx: flat(0, 1 + o.scale[0] / 100 * amp * (pose ? pose[4] : transform(0, seed + 2))), sy: flat(1, 1 + o.scale[1] / 100 * amp * (pose ? pose[5] : transform(1, seed + 2))),
    opacity: p.text.reveal === "typewriter" ? (Math.min(a, b) < (idx + 1) / (unit === "all" ? 1 : count) ? 1 - Math.min(1, amp) : 1) : p.fade ? 1 - Math.max(0, Math.min(1, (text && p.mode !== "transition" ? Math.abs(w) * .7 : fadeWeight) * amp)) : 1, weight: p.effect.startsWith("camera-") ? fadeWeight : w,
    progress: Math.max(0, Math.min(1, Math.min(a, b))) };
  if (p.pivot === "edge" && !text) {
    const direction = options.direction === "preset" ? Math.abs(p.rotation[1]) > Math.abs(p.rotation[0]) ? "left" : "bottom" : options.direction;
    const dx = direction === "left" ? 36 : direction === "right" ? -36 : 0;
    const dy = direction === "top" ? 35 : direction === "bottom" ? -22 : 0;
    const rx = sample.rx * Math.PI / 180, ry = sample.ry * Math.PI / 180;
    if (!p.rotation[0] && !p.rotation[1] && !p.position[2]) {
      const rz = sample.rz * Math.PI / 180;
      sample.x += dx * sample.sx * (Math.cos(rz) - 1) - dy * sample.sy * Math.sin(rz);
      sample.y += dx * sample.sx * Math.sin(rz) + dy * sample.sy * (Math.cos(rz) - 1);
      return sample;
    }
    sample.x += dx * sample.sx * (Math.cos(ry) - 1) + dy * sample.sy * Math.sin(rx) * Math.sin(ry);
    sample.y += dy * sample.sy * (Math.cos(rx) - 1);
    sample.z += -dx * sample.sx * Math.sin(ry) + dy * sample.sy * Math.sin(rx) * Math.cos(ry);
  }
  if (p.pivot === "offset" && !text) {
    // Same compensation as AE around the transition center, on the card's glyph.
    const offset = p.pivotOffset ?? [0, 0], d = sample.rz * Math.PI / 180;
    const vx = offset[0] * (CARD.right - CARD.left) * sample.sx, vy = offset[1] * (CARD.bottom - CARD.top) * sample.sy;
    sample.x += vx * (1 - Math.cos(d)) + vy * Math.sin(d);
    sample.y += vy * (1 - Math.cos(d)) - vx * Math.sin(d);
  }
  return sample;
}

/** Layer-wide Signature envelope inputs, exactly as the host's effect expressions
 * compute them: progress, eased weight and normalized velocity of the curve. */
export function signaturePreviewSample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): { progress: number; weight: number; velocity: number; envelope(kind: string): number } {
  const easing = options.easing && options.easing !== "preset" ? options.easing : p.easing, elastic = options.elasticity ?? p.defaults?.elasticity ?? 0;
  const [a, b] = libraryStudioTiming(time, 0, libraryPreviewEnd(options), options.durationFrames / 30, options.phase, 0, 1, options.staggerFrames / 30, appliedOverlap(p, options));
  const weight = p.mode === "transition" ? 2 - libraryEase(a, easing, elastic) - libraryEase(b, easing, elastic) : 0;
  const progress = Math.max(0, Math.min(1, Math.min(a, b)));
  const velocity = p.mode === "transition" ? librarySignatureVelocity(progress, easing, elastic, libraryEase) : 0;
  return { progress, weight, velocity, envelope: kind => librarySignatureEnvelope(kind, progress, weight, velocity) };
}

/** Illustrative SVG filter for a Signature look at the preview's 1:6 scale; the
 * envelopes are the host's own. Returns false when the look has no layer filter. */
function signatureFilter(node: (tag: string, attrs: Record<string, string | number>, parent?: Element) => SVGElement, defs: Element, id: string,
  p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): boolean {
  if (p.collection !== "signature" || p.effect === "none" || p.effect === "rgb") return false;
  const f = node("filter", {id, x: "-40%", y: "-80%", width: "180%", height: "260%"}, defs), amount = options.intensity / 100;
  const env = signaturePreviewSample(p, options, time), color = p.effectColor ?? [1, 1, 1];
  const rgb = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
  const glow = (strength: number, radius: string, tint: string): void => {
    node("feGaussianBlur", {in: "SourceGraphic", stdDeviation: radius, result: "glow-blur"}, f);
    node("feFlood", {"flood-color": tint, "flood-opacity": Math.max(0, Math.min(1, strength)), result: "glow-color"}, f);
    node("feComposite", {in: "glow-color", in2: "glow-blur", operator: "in", result: "glow"}, f);
    const merge = node("feMerge", {}, f); node("feMergeNode", {in: "glow"}, merge); node("feMergeNode", {in: "SourceGraphic"}, merge);
  };
  if (p.effect === "film-burn") {
    const burn = Math.min(1, p.effectAmount / 100 * env.envelope("weight") * Math.min(1, amount)), threshold = burn * 1.15 - .1;
    node("feTurbulence", {type: "fractalNoise", baseFrequency: ".045", numOctaves: 3, seed: 17, result: "burn-noise"}, f);
    node("feColorMatrix", {in: "burn-noise", type: "matrix", values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0", result: "burn-alpha"}, f);
    const transfer = node("feComponentTransfer", {in: "burn-alpha", result: "burn-mask"}, f);
    node("feFuncA", {type: "linear", slope: 10, intercept: -10 * threshold}, transfer);
    node("feComposite", {in: "SourceGraphic", in2: "burn-mask", operator: "in", result: "burned"}, f);
    node("feGaussianBlur", {in: "burned", stdDeviation: 3, result: "ember-blur"}, f);
    node("feFlood", {"flood-color": rgb, "flood-opacity": Math.min(1, env.envelope("peak") * amount), result: "ember-color"}, f);
    node("feComposite", {in: "ember-color", in2: "ember-blur", operator: "in", result: "ember"}, f);
    const merge = node("feMerge", {}, f); node("feMergeNode", {in: "ember"}, merge); node("feMergeNode", {in: "burned"}, merge);
  } else if (p.effect === "light-sweep") {
    const order = options.order && options.order !== "preset" ? options.order : p.text.order ?? "forward";
    const front = order === "reverse" ? 1 - env.progress : order === "edges-in" ? Math.abs(1 - 2 * env.progress) : env.progress;
    node("feGaussianBlur", {in: "SourceAlpha", stdDeviation: 1.5, result: "relief"}, f);
    const light = node("feSpecularLighting", {in: "relief", surfaceScale: 4, specularConstant: 1.4, specularExponent: 16, "lighting-color": rgb, result: "sweep"}, f);
    node("fePointLight", {x: 10 + 300 * front, y: 30, z: 70}, light);
    node("feComposite", {in: "sweep", in2: "SourceAlpha", operator: "in", result: "sweep-lit"}, f);
    const dim = Math.pow(2, -1.1 * env.envelope("arc") * Math.min(1, amount)), exposure = node("feComponentTransfer", {in: "SourceGraphic", result: "dimmed"}, f);
    for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) node(channel, {type: "linear", slope: dim}, exposure);
    node("feComposite", {in: "dimmed", in2: "sweep-lit", operator: "arithmetic", k1: 0, k2: 1, k3: Math.min(1.5, p.effectAmount / 90 * env.envelope("arc") * amount), k4: 0}, f);
  } else if (p.effect === "light-rays" || p.effect === "bloom") {
    const strength = p.effect === "light-rays" ? env.envelope("arc") * Math.min(1, p.effectAmount / 240) : env.envelope("peak");
    glow(strength * amount, p.effect === "light-rays" ? "9 5" : String(p.effectAmount / 8), rgb);
  } else if (p.effect === "halo") {
    glow((.5 + .2 * libraryWave(time * (options.speed ?? p.defaults?.speed ?? 100) / 100, 0, "cosine", options.seed ?? 17)) * amount, String(p.effectAmount / 6), rgb);
  } else if (p.effect === "anamorphic" || p.effect === "gate-slip") {
    const reference = (p.defaults?.durationFrames ?? 30) / 30, speed = Math.min(2, reference / Math.max(.0001, options.durationFrames / 30));
    const streak = p.effectAmount / 6 * env.envelope("velocity") * speed * amount / 2;
    node("feGaussianBlur", {in: "SourceGraphic", stdDeviation: p.effect === "anamorphic" ? `${streak} 0` : `0 ${streak}`, result: "streak"}, f);
    if (p.effect === "anamorphic") {
      node("feGaussianBlur", {in: "SourceGraphic", stdDeviation: "16 .8", result: "flare-blur"}, f);
      node("feFlood", {"flood-color": rgb, "flood-opacity": Math.min(1, env.envelope("peak") * amount), result: "flare-color"}, f);
      node("feComposite", {in: "flare-color", in2: "flare-blur", operator: "in", result: "flare"}, f);
      const merge = node("feMerge", {}, f); node("feMergeNode", {in: "flare"}, merge); node("feMergeNode", {in: "streak"}, merge);
    }
  } else if (p.effect === "ink-bleed") {
    const spread = p.effectAmount / 6 * env.envelope("weight") * amount;
    node("feGaussianBlur", {in: "SourceGraphic", stdDeviation: spread, result: "ink"}, f);
    const transfer = node("feComponentTransfer", {in: "ink"}, f);
    node("feFuncA", {type: "linear", slope: spread > .05 ? 9 : 1, intercept: spread > .05 ? -3.6 : 0}, transfer);
  } else if (p.effect === "dust" || p.effect === "smoke") {
    const dust = p.effect === "dust", scale = p.effectAmount / 6 * env.envelope("weight") * amount * (dust ? 2.2 : 3);
    node("feTurbulence", {type: dust ? "turbulence" : "fractalNoise", baseFrequency: dust ? ".9" : ".035", numOctaves: dust ? 1 : 2, seed: dust ? 17 : 17 + Math.floor(env.progress * 6), result: "grain"}, f);
    node("feDisplacementMap", {in: "SourceGraphic", in2: "grain", scale, xChannelSelector: "R", yChannelSelector: "G", result: "displaced"}, f);
    if (!dust) node("feGaussianBlur", {in: "displaced", stdDeviation: 2 * env.envelope("tail") * amount}, f);
  } else if (p.effect === "projector") {
    let flicker = Math.sin((Math.floor(time * 14) + 1) * 91.7 + (options.seed ?? 17) * 1.3) * 43758.5453; flicker -= Math.floor(flicker);
    const gain = Math.pow(2, p.effectAmount / 100 * (flicker - .4) * env.envelope("weight") * amount);
    const transfer = node("feComponentTransfer", {}, f);
    for (const channel of ["feFuncR", "feFuncG", "feFuncB"]) node(channel, {type: "linear", slope: gain}, transfer);
  }
  return true;
}

/** Project one point through the fixture camera after scale and XYZ rotation. */
export function libraryProjectPoint(sample: ReturnType<typeof librarySample>, x: number, y: number, pivot: readonly number[] = [0, 0, 0], text?: TextProjection): [number, number] {
  const rx = sample.rx * Math.PI / 180, ry = sample.ry * Math.PI / 180, rz = sample.rz * Math.PI / 180;
  if (text) {
    // A text unit scales and turns around its pivot (card pixels from the unit's
    // anchor; libraryTextPivot), which the host's hold keeps in place.
    const cx = pivot[0] ?? 0, cy = pivot[1] ?? 0, cz = pivot[2] ?? 0;
    let v: [number, number, number] = [(x - cx) * sample.sx, (y - cy) * sample.sy, -cz];
    const turn = (axis: string, a: number): void => {
      const c = Math.cos(a), s = Math.sin(a), [vx, vy, vz] = v;
      v = axis === "x" ? [vx, vy * c - vz * s, vy * s + vz * c] : axis === "y" ? [vx * c + vz * s, vy, -vx * s + vz * c] : [vx * c - vy * s, vx * s + vy * c, vz];
    };
    // AE turns a character around Z, then Y, then X (measured against AE 26.5
    // renders of combined X/Y/Z turns; the other five orders miss by far).
    turn("z", rz); turn("y", ry); turn("x", rx);
    const qx = v[0] + cx + sample.x, qy = v[1] + cy + sample.y, depth = v[2] + cz + sample.z;
    // AE's default camera (50 mm) projects around the composition centre.
    const f = text.zoom / Math.max(text.zoom * .15, text.zoom + depth);
    return [(text.base[0] + qx) * f - text.base[0], (text.base[1] + qy) * f - text.base[1]];
  }
  // A layer pivot in nominal 1080p pixels, 1:6 on the card.
  const ox = (pivot[0] ?? 0) / 6, oy = (pivot[1] ?? 0) / 6, oz = (pivot[2] ?? 0) / 6;
  const sx = (x - ox) * sample.sx, sy = (y - oy) * sample.sy;
  const py = sy * Math.cos(rx) + oz * Math.sin(rx), z = sy * Math.sin(rx) - oz * Math.cos(rx);
  const px = sx * Math.cos(ry) + z * Math.sin(ry);
  const depth = -sx * Math.sin(ry) + z * Math.cos(ry) + sample.z;
  const qx = px * Math.cos(rz) - py * Math.sin(rz) + sample.x, qy = px * Math.sin(rz) + py * Math.cos(rz) + sample.y;
  const perspective = 260 / Math.max(40, 260 + depth);
  return [qx * perspective, qy * perspective];
}
/** Where a text unit rests relative to the composition centre, and the default
 * camera's zoom, in card pixels. */
interface TextProjection { base: readonly [number, number]; zoom: number; }
/** The 50 mm preset of a 480 px wide composition (zoom = width × 50 / 36), on the card. */
const TEXT_CAMERA_ZOOM = 480 * 50 / 36 * TEXT_PREVIEW_SCALE;

/** The text collection's stepped Character Offset, with the host's index, seed and Speed.
 * @returns the label shifted inside A–Z / a–z, other glyphs untouched. */
function textDecodeLabel(preset: MotionLibraryPreset, options: MotionLibraryOptions, label: string, weight: number, raw: number, count: number, time: number): string {
  if (options.intensity <= 0) return label;
  const seed = options.seed ?? preset.defaults?.seed ?? 17;
  const order = options.order && options.order !== "preset" ? options.order : libraryTextOrder(preset, options.direction ?? "preset", options.unit === "preset" ? preset.text.unit : options.unit);
  const index = order === "random" && count > 1 ? libraryOrder(raw, count, seed) : librarySequence(raw, count, order);
  const age = time * Math.max(25, Math.min(200, options.speed ?? preset.defaults?.speed ?? 100)) / 100;
  const offset = Math.round(libraryTextDecode(age, index, seed) * options.intensity / 100 * (preset.mode === "transition" ? Math.max(0, Math.min(1, weight)) : 1));
  return Array.from(label).map(c => {
    const base = /[A-Z]/.test(c) ? 65 : /[a-z]/.test(c) ? 97 : null;
    return base === null ? c : String.fromCharCode(base + ((c.charCodeAt(0) - base + offset) % 26 + 26) % 26);
  }).join("");
}
function previewPlaneMatrix(sample: ReturnType<typeof librarySample>, x: number, y: number, pivot?: readonly number[], text = false): string {
  const projection = text ? { base: [x - 160, y - 90] as const, zoom: TEXT_CAMERA_ZOOM } : undefined;
  const o = libraryProjectPoint(sample, 0, 0, pivot, projection), a = libraryProjectPoint(sample, 1, 0, pivot, projection), b = libraryProjectPoint(sample, 0, 1, pivot, projection);
  return `matrix(${a[0]-o[0]} ${a[1]-o[1]} ${b[0]-o[0]} ${b[1]-o[1]} ${x+o[0]} ${y+o[1]})`;
}

/** Overlay transitions rise to CUT then settle; layer In/Out uses librarySample. */
export function cameraTransitionSample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): ReturnType<typeof librarySample> {
  const duration = Math.max(2, options.durationFrames) / 30, age = time - duration / 2;
  const u = Math.max(0, 1 - Math.abs(age) / (duration / 2));
  const weight = u * u * u * (u * (u * 6 - 15) + 10), amp = options.intensity / 100;
  if (p.cameraSpec?.native) {
    const native = nativeCameraPreviewSample(p, options, time);
    return {x: native.x, y: native.y, z: 0, rx: 0, ry: 0, rz: native.rotation, sx: native.scale, sy: native.scale, opacity: 1, weight, progress: 1};
  }
  if (p.cameraSpec?.impact) {
    const r = impactCameraPreviewSample(p, options, time);
    return {x: r[0]! / 6, y: r[1]! / 6, z: 0, rx: 0, ry: 0, rz: r[2]!, sx: r[3]! / 100, sy: r[3]! / 100, opacity: 1, weight, progress: 1};
  }
  const shake = p.effect === "camera-shake", offset = shake ? p.position[0] / 6 * amp * weight : 0;
  return { x: Math.cos(age * 71) * offset, y: Math.sin(age * 53) * offset * .65, z: 0, rx: 0, ry: 0,
    rz: p.rotation[2] * amp * weight * (shake ? Math.cos(age * 43) : 1),
    sx: 1 + Math.max(0, p.scale[0]) / 100 * amp * weight, sy: 1 + Math.max(0, p.scale[0]) / 100 * amp * weight,
    opacity: 1, weight, progress: 1 };
}

/** Native filter illustration: matching CUT envelope and signed optical movement.
 * Browser filters approximate trail/lens pixels; they do not render the C++ kernel. */
export function nativeCameraPreviewSample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): {amount: number; flow: number; x: number; y: number; scale: number; rotation: number; blur: number; rgb: number; lens: number; angle: number} {
  const duration = Math.max(2, options.durationFrames) / 30, age = time - duration / 2;
  const u = Math.max(0, 1 - Math.abs(age) / (duration / 2)), w = u ** 3 * (u * (u * 6 - 15) + 10);
  const style = p.cameraSpec?.native?.style ?? 1, angle = (p.cameraSpec?.native?.angle ?? 0) * Math.PI / 180;
  const envelope = style === 1 ? w * w : style === 2 ? w ** 1.35 : style === 3 ? w ** .85 : style === 4 ? Math.sin(w * Math.PI / 2) ** 2 : style === 5 ? w ** 3 : w ** 1.1;
  const amount = Math.max(0, Math.min(1, envelope * options.intensity / 100));
  const f = Math.max(-1, Math.min(1, age / Math.max(1 / 30, duration / 2 * .24))), flow = f * (1.5 - .5 * f * f);
  const distance = (style === 1 ? .30 : style === 5 ? .11 : 0) * 180 * amount * flow;
  return {amount, flow, x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
    scale: style === 2 ? 1 + amount * (.9 + .3 * flow) : style === 3 ? 1 + .22 * amount : style === 4 ? 1 + .5 * amount : style === 6 ? 1 + .18 * amount : 1,
    rotation: style === 3 ? -.75 * 180 / Math.PI * amount * flow : style === 6 ? -.08 * 180 / Math.PI * amount * flow : 0,
    blur: amount * (style === 1 ? 180 * .325 : style === 5 ? 180 * .70 : style === 2 ? 9 : style === 4 ? 12 : 4),
    rgb: style === 6 ? 180 * .025 * amount : 0, lens: style === 4 ? amount * 16 : 0, angle: angle * 180 / Math.PI};
}

/** The host's own impact sample at a 1080p reference; the preview draws it at 1:6.
 * Transform values are exact; light, wave and blur pixels are illustrated. */
export function impactCameraPreviewSample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): number[] {
  const duration = Math.max(2, options.durationFrames) / 30, span = duration / 2, age = time - span;
  const u = Math.max(0, 1 - Math.abs(age) / span), weight = u * u * u * (u * (u * 6 - 15) + 10);
  const spec = p.cameraSpec!.impact!;
  return cameraImpactSample(age, weight, span, 1 / 30, options.intensity / 100, 17, 1920, 1080,
    {...spec, blur: p.effectAmount, exposure: p.cameraSpec?.exposure ?? 0});
}

export function cameraPreviewPlayback(options: MotionLibraryOptions, elapsed: number): {time: number; opacity: number} {
  const duration = Math.max(2, options.durationFrames) / 30, shown = Math.max(1.4, Math.min(3, duration));
  const time = Math.max(0, Math.min(1, ((elapsed % (shown + 1)) - .35) / shown)) * duration;
  return {time, opacity: 1};
}

/** Illustrative RGB/band offsets at the preview's 1:6 reference scale.
 * The effect envelope covers the whole layer, including staggered text. */
export function nativeLibraryPreviewSample(p: MotionLibraryPreset, options: MotionLibraryOptions, time: number): { rgb: number; displacement: number } {
  if (p.effect !== "native-rgb" && p.effect !== "native-glitch") return {rgb: 0, displacement: 0};
  const envelope = p.mode === "transition" ? Math.max(0, Math.min(1, librarySample(p, options, time).weight)) : 1;
  const amount = Math.max(0, Math.min(1, options.intensity / 100 * envelope));
  return {rgb: p.effectAmount / 6 * amount, displacement: p.effect === "native-glitch" ? 64 / 6 * amount : 0};
}

/** Native effects are illustrated; timing and transforms use the host's math. */
/** A stable, document-unique prefix for the ids one SVG paints. */
const previewScopes = new WeakMap<SVGSVGElement, string>();
let previewScopeCount = 0;
function previewScope(svg: SVGSVGElement): string {
  let scope = previewScopes.get(svg);
  if (!scope) { scope = `p${++previewScopeCount}`; previewScopes.set(svg, scope); }
  return scope;
}

export function paintLibraryPreview(svg: SVGSVGElement, preset: MotionLibraryPreset, options: MotionLibraryOptions, clock: number, cameraOverlay = false): void {
  const doc = svg.ownerDocument, ns = "http://www.w3.org/2000/svg", time = lookPreviewTime(preset, clock);
  const node = (tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement => {
    const el = doc.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); parent.appendChild(el); return el;
  };
  const textMode = preset.category.startsWith("text-");
  const unit = options.unit === "preset" ? preset.text.unit : options.unit;
  // Text previews use the AE reference render's own sample and layout.
  const segments: TextPreviewSegment[] = textMode ? textPreviewSegments(unit) : [{ text: "", x: 160, y: 98, index: 0, count: 1, size: 0, line: 0, width: 0, column: 0, columns: 1 }];
  const defs = node("defs", {});
  // Every painted SVG owns its ids: a card and its direction tiles paint the same
  // preset, and a reference resolved into another SVG breaks when that one repaints.
  const scope = `${previewScope(svg)}-${preset.id}`;
  const filterId = `filter-${scope}`;
  // The camera fixture already spans twice the view: a 300% filter region made
  // every frame rasterize its blur and noise over 36 times the visible area.
  const region = preset.effect.startsWith("camera-") ? ["-10%", "120%"] : ["-100%", "300%"];
  const f = node("filter", { id: filterId, x: region[0]!, y: region[0]!, width: region[1]!, height: region[1]! }, defs);
  const sample = cameraOverlay ? cameraTransitionSample(preset, options, time) : librarySample(preset, options, time);
  const native = nativeLibraryPreviewSample(preset, options, time);
  if (preset.effect === "native-glitch" && native.displacement > 0) {
    // An illustration of stepped horizontal distortion, not a C++ pixel match.
    node("feTurbulence", {type: "fractalNoise", baseFrequency: ".001 .12", numOctaves: 1, seed: 17 + Math.floor(time * 12), result: "native-bands"}, f);
    node("feColorMatrix", {in: "native-bands", type: "matrix", values: "1 0 0 0 0 0 0 0 0 .5 0 0 1 0 0 0 0 0 1 0", result: "native-horizontal-bands"}, f);
    node("feDisplacementMap", {in: "SourceGraphic", in2: "native-horizontal-bands", scale: native.displacement, xChannelSelector: "R", yChannelSelector: "G"}, f);
  }
  if (preset.effect.startsWith("camera-")) {
    const weight = Math.max(0, Math.min(1, sample.weight)), amount = options.intensity / 100;
    const optical = preset.cameraSpec?.native ? nativeCameraPreviewSample(preset, options, time) : undefined;
    const impact = preset.cameraSpec?.impact;
    if (impact) {
      const r = impactCameraPreviewSample(preset, options, time), h = 1 / 120;
      const before = impactCameraPreviewSample(preset, options, Math.max(0, time - h)), after = impactCameraPreviewSample(preset, options, time + h);
      // Shutter streak: travel during the open shutter at 1:6, along each screen axis.
      const open = impact.shutter / 360 / 30 / 6 / (2 * h);
      const streakX = Math.abs(after[0]! - before[0]!) * open, streakY = Math.abs(after[1]! - before[1]!) * open;
      if (r[7]! > .01) {
        node("feTurbulence", {type: "fractalNoise", baseFrequency: ".028 .002", numOctaves: 1, seed: 17, result: "impact-wave"}, f);
        node("feOffset", {in: "impact-wave", dx: r[8]! / 360 * 36, result: "impact-wave-moving"}, f);
        node("feDisplacementMap", {in: "SourceGraphic", in2: "impact-wave-moving", scale: r[7]! / 6 * 2, xChannelSelector: "R", yChannelSelector: "G", result: "impact-waved"}, f);
      }
      node("feGaussianBlur", {stdDeviation: `${streakX / 2 + r[4]! / 6} ${streakY / 2 + r[4]! / 6}`, result: "impact-blurred"}, f);
      const gain = Math.pow(2, r[5]!);
      node("feColorMatrix", {type: "matrix", values: `${gain} 0 0 0 0 0 ${gain} 0 0 0 0 0 ${gain} 0 0 0 0 0 1 0`, result: "impact-exposed"}, f);
      if (r[6]! > .001) {
        node("feGaussianBlur", {in: "impact-exposed", stdDeviation: 10 / 6 * 3, result: "impact-bloom"}, f);
        node("feColorMatrix", {in: "impact-bloom", type: "matrix", values: `${r[6]! * .6} 0 0 0 0 0 ${r[6]! * .6} 0 0 0 0 0 ${r[6]! * .6} 0 0 0 0 0 1 0`, result: "impact-glow"}, f);
        node("feBlend", {in: "impact-exposed", in2: "impact-glow", mode: "screen"}, f);
      }
    } else if (optical) {
      const style = preset.cameraSpec!.native!.style;
      node("feGaussianBlur", {stdDeviation: style === 1 || style === 5 ? `${optical.blur / 3} ${optical.blur / 24}` : optical.blur / 3, result: "optical-blur"}, f);
      if (optical.rgb) {
        node("feColorMatrix", {in: "optical-blur", type: "matrix", values: "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0", result: "red"}, f);
        node("feOffset", {in: "red", dx: optical.rgb, result: "red-offset"}, f);
        node("feColorMatrix", {in: "optical-blur", type: "matrix", values: "0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0", result: "cyan"}, f);
        node("feOffset", {in: "cyan", dx: -optical.rgb, result: "cyan-offset"}, f);
        node("feBlend", {in: "red-offset", in2: "cyan-offset", mode: "screen"}, f);
      }
      if (optical.lens) {
        node("feTurbulence", {type: "fractalNoise", baseFrequency: ".003", numOctaves: 1, seed: 17, result: "lens"}, f);
        node("feDisplacementMap", {in: "optical-blur", in2: "lens", scale: optical.lens, xChannelSelector: "R", yChannelSelector: "G"}, f);
      }
    } else node("feGaussianBlur", {stdDeviation: preset.effectAmount / 6 * amount * weight}, f);
    if (preset.effect === "camera-dark" || preset.effect === "camera-light") {
      const color = preset.effect === "camera-dark" ? 0 : 1, blend = Math.min(1, weight * amount);
      node("feColorMatrix", {type:"matrix", values:`${1-blend} 0 0 0 ${color*blend} 0 ${1-blend} 0 0 ${color*blend} 0 0 ${1-blend} 0 ${color*blend} 0 0 0 1 0`}, f);
    }
    if (!optical && !impact && (preset.effect === "camera-distort" || preset.effect === "camera-shake")) {
      node("feTurbulence", {type:"fractalNoise",baseFrequency:".018 .028",numOctaves:2,seed:17,result:"noise"}, f);
      node("feDisplacementMap", {in:"SourceGraphic",in2:"noise",scale:(preset.cameraSpec ? 35 : preset.effectAmount) / 6 * amount * weight,xChannelSelector:"R",yChannelSelector:"G"}, f);
    }
    if (preset.cameraSpec?.exposure && !impact) {
      const gain = Math.pow(2, preset.cameraSpec.exposure * amount * weight);
      node("feColorMatrix", {type:"matrix", values:`${gain} 0 0 0 0 0 ${gain} 0 0 0 0 0 ${gain} 0 0 0 0 0 1 0`}, f);
    }
    const plane=node("g",{transform:`translate(${160+sample.x} ${90+sample.y}) rotate(${sample.rz+(optical?.angle ?? 0)}) scale(${sample.sx} ${sample.sy})`,filter:`url(#${filterId})`});
    const scene=node("g",{transform:`rotate(${-1 * (optical?.angle ?? 0)})`},plane);
    // Original full-frame landscape fixture: texture and depth make camera motion legible.
    node("rect",{x:-320,y:-180,width:640,height:360,fill:"#7095a4"},scene);
    node("circle",{cx:80,cy:-44,r:23,fill:"#edc792"},scene);
    node("path",{d:"M-340 65L-125-60-38 25 28-23 120 52 242-42 340 55V180H-340Z",fill:"#486c76"},scene);
    node("path",{d:"M-340 100L-147 42-68 74 60 12 190 95 340 32V180H-340Z",fill:"#294e56"},scene);
    node("path",{d:"M-340 125Q-95 40 80 110T340 90V180H-340Z",fill:"#16363d"},scene);
    for(let i=0;i<7;i++)node("path",{d:`M${-150+i*55} 160v-68l-12 15 12-38 12 38-12-15`,stroke:"#a2b5a0","stroke-width":2,fill:"none"},scene);
    return;
  }
  if (preset.effect === "blur" || preset.effect === "blur-wave") node("feGaussianBlur", { stdDeviation: preset.effectAmount / 8 * options.intensity / 100 * (preset.mode === "transition" ? Math.max(0, sample.weight) : .45 + .55 * Math.abs(sample.weight)) }, f);
  if (preset.effect === "turbulent" || preset.effect === "blur-wave") {
    node("feTurbulence", { type: "fractalNoise", baseFrequency: ".02 .06", numOctaves: 1, seed: Math.floor(time * 3), result: "noise" }, f);
    node("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: preset.effectAmount / 3 * options.intensity / 100, xChannelSelector: "R", yChannelSelector: "G" }, f);
  }
  const fixture = node("g", {});
  if (signatureFilter(node, defs, `signature-${scope}`, preset, options, time)) fixture.setAttribute("filter", `url(#signature-${scope})`);
  const glyphBox = textMode ? textPreviewBounds(unit) : {left: CARD.x + CARD.left, top: CARD.y + CARD.top, right: CARD.x + CARD.right, bottom: CARD.y + CARD.bottom};
  if (revealPreviewClip(node, defs, `reveal-${scope}`, preset, options, sample.weight, glyphBox)) fixture.setAttribute("clip-path", `url(#reveal-${scope})`);
  const look = lookPreviewFilter(node, defs, `look-${scope}`, preset, options, time);
  if (preset.id === "premium-arc-arrival") {
    // A stationary landing point makes the curve legible in a small frame.
    const guide = node("g", { fill: "none", stroke: "currentColor", opacity: .42 });
    node("circle", { cx: 160, cy: 98, r: 30, "stroke-dasharray": "2 4" }, guide);
    node("path", { d: "M108 98h12m80 0h12M160 46v12m0 80v12", "stroke-width": 1.5 }, guide);
  }
  if (look.applied) fixture.setAttribute("filter", `url(#look-${scope})`);
  if (textMode && preset.text.mask) {
    // The host's window: the resting text bounds plus 8 composition pixels.
    const clip = node("clipPath", {id: `mask-${scope}`}, defs), pad = 8 * TEXT_PREVIEW_SCALE;
    node("rect", {x: glyphBox.left - pad, y: glyphBox.top - pad, width: glyphBox.right - glyphBox.left + 2 * pad, height: glyphBox.bottom - glyphBox.top + 2 * pad}, clip);
    fixture.setAttribute("clip-path", `url(#mask-${scope})`);
  }
  // The side the host renders: turns, origin, blur axis and order (libraryTextOrient).
  const facing = textMode ? libraryTextOrient(preset, options.direction) : preset;
  // Distances are em of the font (libraryTextReference): on the recipe's own
  // sample that is the card's 1:6; another unit's sample scales them with its size.
  const em = (segment: TextPreviewSegment): number => textMode ? segment.size / libraryTextReference(preset.text.unit) : 1 / 6;
  const samples = segments.map(segment => {
    const s = librarySample(preset, options, time, segment.index, segment.count, [segment.column, segment.columns]), k = textMode && preset.travel !== "offscreen" ? em(segment) * 6 : 1;
    return k === 1 ? s : {...s, x: s.x * k, y: s.y * k, z: s.z * k};
  });
  // The host's centred spacing: card pixels per column at each unit's weight.
  const spacing = samples.map((s, i) => textMode ? preset.text.tracking * em(segments[i]!) * s.weight * options.intensity / 100 : 0);
  const spreadX = textMode ? textPreviewSpreadX(segments, spacing) : segments.map(segment => segment.x);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!, s = samples[i]!, spread = spacing[i]!;
    const baseX = spreadX[i]!, baseY = segment.y;
    // Units turn and scale around their visual centre plus the recipe's origin.
    const pivot = textMode ? libraryTextPivot(facing.text.origin, 1, segment.size) : undefined;
    const fo = node("g", { opacity: s.opacity }, fixture);
    if (preset.text.blur) {
      const blurId = `blur-${scope}-${i}`, filter = node("filter", {id: blurId, x:"-100%", y:"-100%", width:"300%", height:"300%"}, defs);
      const radius = preset.text.blur * em(segment) * (preset.mode === "transition" ? Math.max(0,s.weight) : Math.abs(s.weight)) * options.intensity / 100;
      node("feGaussianBlur", {stdDeviation: facing.text.blurAxis === "x" ? `${radius} 0` : facing.text.blurAxis === "y" ? `0 ${radius}` : radius}, filter);
      fo.setAttribute("filter", `url(#${blurId})`);
    }
    const g = node("g", { transform: `${previewPlaneMatrix(s, baseX, baseY, pivot, textMode)} skewX(${preset.text.skew * s.weight * options.intensity / 100})`, filter: preset.effect === "blur" || preset.effect === "blur-wave" || preset.effect === "turbulent" || (preset.effect === "native-glitch" && native.displacement > 0) ? `url(#${filterId})` : "none" }, fo);
    let label = segment.text;
    if (preset.text.decode && preset.collection === "text") label = textDecodeLabel(preset, options, label, s.weight, unit === "all" ? 0 : segment.index, segment.count, time);
    else if (preset.text.decode && (preset.mode !== "transition" || Math.abs(s.weight) > .02)) label = Array.from(label).map((c, j) => c === " " ? c : String.fromCharCode(65 + Math.abs(Math.floor(Math.sin(Math.floor(time * 18) * 7.7 + (i + j) * 11.3) * 1000)) % 26)).join("");
    if ((preset.text.reveal === "resolve" || preset.text.reveal === "roll") && preset.mode === "transition" && options.intensity > 0) {
      // The host's Character Offset: letters advance within A–Z and keep their case.
      const offset = librarySignatureGlyph(preset.text.reveal, s.progress, s.weight, i, options.seed ?? preset.defaults?.seed ?? 17);
      label = Array.from(label).map(c => /[A-Z]/.test(c) ? String.fromCharCode(65 + (c.charCodeAt(0) - 65 + offset) % 26) : c).join("");
    }
    const shape = (parent: Element, color: string, dx = 0, dy = 0, stroke = ""): void => {
      if (textMode) {
        // Inside a word or line the spacing moves letters apart without
        // following the unit's scale: undo the scale on the spacing share only.
        const tracked = unit !== "characters" && spread ? textPreviewCharCenters(label, segment.size).map((x, c, all) => (x + spread * (c - (all.length - 1) / 2) / Math.max(.02, Math.abs(s.sx)) + dx).toFixed(2)).join(" ") : dx;
        const el = node("text", { x: tracked, y: dy, fill: color, "text-anchor": "middle", "font-size": segment.size, "font-family": "Arial,Helvetica,sans-serif", "font-weight": 700 }, parent); el.textContent = label;
      } else {
        const artwork = preset.id === "premium-arc-arrival" ? "M0-25 24 0 0 25-24 0Z M0-10-10 0 0 10 10 0Z"
          : preset.id === "premium-rgb-split" ? "M-52-30H52V30H-52Z M-47-25V2L-23-12-8 1 8-17 47 12V-25Z M21-16a4 4 0 1 0 8 0 4 4 0 1 0-8 0Z"
          : "M-36 22V-35L0-8 36-35V22H20V-5L0 10-20-5V22Z";
        node("path", { d: artwork, fill: color, "fill-rule": "evenodd", transform: `translate(${dx} ${dy})`, ...(stroke ? {stroke, "stroke-width": 1.6, "stroke-linejoin": "round"} : {}) }, parent);
      }
    };
    if (preset.effect === "extrude" || preset.effect.startsWith("shadow")) {
      const angle = preset.effectAngle * Math.PI / 180, depth = preset.effectAmount / 6 * options.intensity / 100;
      for (let n = 25; n > 0; n--) {
        if (preset.effect === "shadow-stripes" && n % 5 < 2) continue;
        const layer = node("g", { opacity: preset.effect === "shadow-gradient" ? 1 - n / 29 : 1 }, g);
        shape(layer, preset.effect === "extrude" ? "#5961a2" : "#080b11", Math.cos(angle) * depth * n / 25, Math.sin(angle) * depth * n / 25);
      }
    }
    if (preset.effect === "rgb" || preset.effect === "chroma2") {
      shape(g, "#ff4966", -preset.effectAmount * options.intensity / 180, 0); shape(g, "#30c5e8", preset.effectAmount * options.intensity / 180, 0);
    }
    if (native.rgb > 0) {
      shape(g, "#ff4966", -native.rgb, 0); shape(g, "#30c5e8", native.rgb, 0);
    }
    if (look.fill) {
      // Dot screen and pencil lines replace the fill; Intensity blends them in.
      const blend = Math.max(0, Math.min(1, options.intensity / 100));
      shape(node("g", {opacity: 1 - blend}, g), "currentColor"); shape(node("g", {opacity: blend}, g), look.fill, 0, 0, look.stroke);
    } else shape(g, preset.effect === "duotone" || preset.effect === "chroma2" ? "#fa803b" : preset.effect === "contrast" ? "#ffffff" : "currentColor");
    if (preset.text.fill && (preset.mode === "transition" || preset.collection === "text")) {
      // Arriving units carry the recipe's tint and return to the source fill.
      const [r, gr, b] = preset.text.fill, tint = node("g", {opacity: Math.max(0, Math.min(1, preset.mode === "transition" ? s.weight : .5 + .5 * s.weight)) * Math.min(1, options.intensity / 100)}, g);
      shape(tint, `rgb(${Math.round(r * 255)},${Math.round(gr * 255)},${Math.round(b * 255)})`);
    }
  }
}
