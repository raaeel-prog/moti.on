import {cloneGradientSettings, isGradientSettings, type GradientSettingsV1} from "@motion/contracts";

export interface GradientPreviewFrame {
  width: number; height: number; layerWidth?: number; layerHeight?: number;
  pixelAspect?: number; timeSeconds?: number; alpha?: Float32Array;
}
const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
const smooth = (x: number): number => { const v = clamp(x); return v * v * (3 - 2 * v); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
function hash(value: number): number {
  let v = value >>> 0; v ^= v >>> 16; v = Math.imul(v, 0x7feb352d); v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b); return (v ^ v >>> 16) >>> 0;
}
function random(x: number, y: number, seed: number): number {
  return (hash(Math.imul(x, 0x9e3779b9) ^ Math.imul(y, 0x85ebca6b) ^ seed) >>> 8) / 16777216;
}
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return mix(mix(random(ix, iy, seed), random(ix + 1, iy, seed), fx),
    mix(random(ix, iy + 1, seed), random(ix + 1, iy + 1, seed), fx), fy) * 2 - 1;
}
function decode(x: number): number {
  const v = Math.abs(x), result = v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  return x < 0 ? -result : result;
}
function encode(x: number): number {
  const v = Math.abs(x), result = v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055;
  return x < 0 ? -result : result;
}
function box(input: Float32Array, output: Float32Array, width: number, height: number, radius: number, vertical: boolean): void {
  const lines = vertical ? width : height, length = vertical ? height : width, inverse = 1 / (2 * radius + 1);
  const step = vertical ? width * 4 : 4;
  for (let line = 0; line < lines; line++) {
    const start = vertical ? line * 4 : line * width * 4;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      for (let pos = 0; pos < length; pos++) {
        if ((pos & 127) === 0) {
          sum = 0;
          for (let n = Math.max(0, pos - radius); n <= Math.min(length - 1, pos + radius); n++) sum += input[start + n * step + channel]!;
        } else {
          if (pos + radius < length) sum += input[start + (pos + radius) * step + channel]!;
          if (pos - radius - 1 >= 0) sum -= input[start + (pos - radius - 1) * step + channel]!;
        }
        output[start + pos * step + channel] = sum * inverse;
      }
    }
  }
}
function blur(image: Float32Array, temp: Float32Array, width: number, height: number, rx: number, ry: number): void {
  box(image, temp, width, height, rx, false); box(temp, image, width, height, ry, true);
}

/** Our native GradientMath.inc/GradientKernel.h pipeline at thumbnail resolution.
 * Returns premultiplied float RGBA (including HDR); display conversion is separate.
 * Project color management and a selected layer's actual alpha require the AE render. */
export function renderGradientPreview(settings: GradientSettingsV1, frame: GradientPreviewFrame): Float32Array {
  const {width, height} = frame, lw = frame.layerWidth ?? width, lh = frame.layerHeight ?? height, pa = frame.pixelAspect ?? 1;
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 512)
    || ![lw, lh, pa].every(n => Number.isFinite(n) && n > 0) || width > lw || height > lh)
    throw new Error("Invalid gradient preview geometry.");
  if (!isGradientSettings(settings)) throw new Error("Invalid gradient preview settings.");
  if (frame.alpha && (frame.alpha.length !== width * height || frame.alpha.some(v => !Number.isFinite(v))))
    throw new Error("Invalid gradient preview alpha.");
  const s = settings, dx = width / lw, dy = height / lh;
  const radius = (r: number, ds: number): number => Math.ceil(r * ds / 3);
  const pad = 3 * (s.depth > 0 ? radius(s.depthRadius, Math.max(dx, dy)) : 0)
    + 3 * (s.diffusion > 0 ? radius(s.diffusionRadius, Math.max(dx, dy)) : 0)
    + 3 * (s.glow > 0 ? radius(s.glowRadius, Math.max(dx, dy)) : 0);
  const w = width + pad * 2, h = height + pad * 2;
  // Small source layers can request more padding than the content; bound memory.
  if (w * h > 4_000_000) throw new Error("Gradient preview exceeds its memory budget.");
  const count = w * h * 4, base = new Float32Array(count), work = new Float32Array(count), temp = new Float32Array(count), halo = new Float32Array(count);
  const alphaAt = (x: number, y: number): number => x < 0 || y < 0 || x >= width || y >= height ? 0 : clamp(frame.alpha?.[y * width + x] ?? 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) work[(y * w + x) * 4 + 3] = alphaAt(x - pad, y - pad);
  if (s.depth > 0) for (let pass = 0; pass < 3; pass++) blur(work, temp, w, h, radius(s.depthRadius, dx), radius(s.depthRadius, dy));
  let phase = s.phase / 360;
  if (s.animation === "loop" && Number.isFinite(frame.timeSeconds)) phase += (frame.timeSeconds! % s.duration) / s.duration;
  phase -= Math.floor(phase);
  const cosine = Math.cos(s.angle * Math.PI / 180), sine = Math.sin(s.angle * Math.PI / 180), lc = Math.cos(phase * Math.PI * 2), ls = Math.sin(phase * Math.PI * 2);
  const extent = Math.max(1, Math.min(lw * pa, lh));
  const stops = s.stops.filter(stop => stop.enabled).map(stop => ({position: stop.position, color: stop.color.map(v => s.colorProcessing === "srgb-linear" ? decode(v) : v)})).sort((a, b) => a.position - b.position);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const alpha = alphaAt(x - pad, y - pad); if (alpha <= 0) continue;
    const i = (y * w + x) * 4, fx = (x - pad + .5) / dx, fy = (y - pad + .5) / dy;
    const nx = (fx - s.centerX * lw) * pa / (extent * s.scale * s.aspect), ny = (fy - s.centerY * lh) / (extent * s.scale);
    const rx = nx * cosine + ny * sine, ry = -nx * sine + ny * cosine, radial = Math.hypot(rx, ry);
    let t = rx + .5;
    if (s.mode === "radial") t = radial;
    else if (s.mode === "angular") t = 1 - Math.abs((Math.atan2(ry, rx) / (Math.PI * 2) + .5) * 2 - 1);
    const swirl = noise(fx / s.turbulenceScale + lc * 1.7, fy / s.turbulenceScale + ls * 1.7, s.seed)
      + .5 * noise(fx * 2 / s.turbulenceScale - ls, fy * 2 / s.turbulenceScale + lc, s.seed ^ 0x68bc21eb);
    t = (t + s.bulge * Math.max(0, 1 - radial * radial * 4) + s.depth * (alpha - work[i + 3]!) + swirl * s.turbulence * .25) * s.cycles + s.offset + phase * 2;
    t -= Math.floor(t * .5) * 2; if (t > 1) t = 2 - t;
    let a = stops[0]!, b = stops[stops.length - 1]!;
    if (t <= a.position) b = a;
    else if (t >= b.position) a = b;
    else for (let k = 1; k < stops.length; k++) if (t < stops[k]!.position) { a = stops[k - 1]!; b = stops[k]!; break; }
    const amount = b.position > a.position ? smooth((t - a.position) / (b.position - a.position)) : 0;
    for (let c = 0; c < 3; c++) base[i + c] = mix(a.color[c]!, b.color[c]!, amount) * alpha;
    base[i + 3] = alpha;
  }
  if (s.diffusion > 0) {
    work.set(base); for (let pass = 0; pass < 3; pass++) blur(work, temp, w, h, radius(s.diffusionRadius, dx), radius(s.diffusionRadius, dy));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = (x - pad + .5) / dx - s.focusX * lw, fy = (y - pad + .5) / dy - s.focusY * lh;
      const amount = s.diffusion * smooth((Math.hypot(fx * pa, fy) / extent - s.focusRadius) / s.focusSoftness), i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) base[i + c] = mix(base[i + c]!, work[i + c]!, amount);
    }
  }
  if (s.glow > 0) {
    for (let i = 0; i < count; i += 4) {
      const maximum = base[i + 3]! > 0 ? Math.max(0, base[i]!, base[i + 1]!, base[i + 2]!) / base[i + 3]! : 0;
      const factor = maximum > s.glowThreshold ? (maximum - s.glowThreshold) / Math.max(maximum, .000001) : 0;
      for (let c = 0; c < 4; c++) work[i + c] = base[i + c]! * factor;
    }
    for (let pass = 0; pass < 3; pass++) {
      blur(work, temp, w, h, radius(s.glowRadius, dx), radius(s.glowRadius, dy)); const weight = [.5, .3, .2][pass]!;
      for (let i = 0; i < count; i++) halo[i] = halo[i]! + work[i]! * weight;
    }
  }
  const result = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = ((y + pad) * w + x + pad) * 4, dest = (y * width + x) * 4;
    const gain = s.glow / (1 + s.highlightProtection * Math.max(0, base[i]!, base[i + 1]!, base[i + 2]!));
    const alpha = clamp(base[i + 3]! + (1 - base[i + 3]!) * clamp(halo[i + 3]! * gain));
    if (alpha <= 0) continue;
    const ix = Math.floor((x + .5) / dx), iy = Math.floor((y + .5) / dy);
    const grain = ((random(ix, iy, s.seed ^ 0x34ab26e1) * 2 - 1) * lc + (random(ix, iy, s.seed ^ 0x85e01249) * 2 - 1) * ls) * s.grain * .12 * alpha;
    for (let c = 0; c < 3; c++) {
      let value = base[i + c]! + halo[i + c]! * gain;
      if (s.colorProcessing === "srgb-linear") value = encode(value / alpha) * alpha;
      result[dest + c] = value + grain;
    }
    result[dest + 3] = alpha;
  }
  return result;
}

export interface GradientPreview { update(settings: GradientSettingsV1): void; dispose(): void }
/** Bounded 15fps driver: one active tool, no host calls, no offscreen work. */
export function createGradientPreview(canvas: HTMLCanvasElement, initial: GradientSettingsV1): GradientPreview {
  const doc = canvas.ownerDocument, win = doc.defaultView, context = canvas.getContext?.("2d"), media = win?.matchMedia?.("(prefers-reduced-motion: reduce)");
  let settings = cloneGradientSettings(initial), signature = JSON.stringify(initial), alive = true, visible = true, raf = 0, dirty = true;
  let last = -Infinity, priorTime: number | undefined, elapsed = 0;
  const reduced = (): boolean => doc.documentElement.getAttribute("data-reduced-motion") === "true" || Boolean(media?.matches);
  const hidden = (): boolean => doc.hidden || !visible || Boolean(canvas.hidden) || canvas.isConnected === false;
  function stop(): void { if (raf) win?.cancelAnimationFrame(raf); raf = 0; priorTime = undefined; }
  function paint(): void {
    if (!context || !alive || hidden()) return;
    const width = canvas.width, height = canvas.height;
    const pixels = renderGradientPreview(settings, {width, height, layerWidth: 1920, layerHeight: 1080, timeSeconds: reduced() ? 0 : elapsed});
    const image = context.createImageData(width, height);
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3]!;
      for (let c = 0; c < 3; c++) image.data[i + c] = Math.round(clamp(alpha > 0 ? pixels[i + c]! / alpha : 0) * 255);
      image.data[i + 3] = Math.round(alpha * 255);
    }
    context.putImageData(image, 0, 0); dirty = false;
  }
  function frame(now: number): void {
    raf = 0; if (!alive || !context || hidden()) { stop(); return; }
    if (reduced()) { paint(); stop(); return; }
    if (priorTime !== undefined) elapsed += Math.max(0, Math.min(.25, (now - priorTime) / 1000)); priorTime = now;
    if (dirty || now - last >= 1000 / 15) { paint(); last = now; }
    if (settings.animation === "loop") raf = win!.requestAnimationFrame(frame);
  }
  function resume(): void {
    if (!alive || !context || hidden()) { stop(); return; }
    if (reduced() || !win?.requestAnimationFrame) { stop(); paint(); return; }
    if (!raf && (dirty || settings.animation === "loop")) raf = win.requestAnimationFrame(frame);
  }
  const intersection = win?.IntersectionObserver ? new win.IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); dirty = true; resume(); }) : null;
  intersection?.observe(canvas);
  const mutation = win?.MutationObserver ? new win.MutationObserver(() => { dirty = true; resume(); }) : null;
  mutation?.observe(doc.documentElement, {attributes: true, attributeFilter: ["data-reduced-motion"]});
  const preference = (): void => { dirty = true; resume(); };
  doc.addEventListener("visibilitychange", resume); media?.addEventListener?.("change", preference);
  resume();
  return {update(next) {
    if (!alive) return; const nextSignature = JSON.stringify(next); if (signature === nextSignature) return;
    settings = cloneGradientSettings(next); signature = nextSignature; dirty = true; resume();
  }, dispose() { alive = false; stop(); intersection?.disconnect(); mutation?.disconnect(); doc.removeEventListener("visibilitychange", resume); media?.removeEventListener?.("change", preference); }};
}
