import { createElement } from "@motion/ui-core";

/**
 * Presets premium das ferramentas de um clique (plano 2026-11-19).
 *
 * Os valores em pixels são de uma comp 1080p; quem aplica escala pela
 * resolução. A miniprévia de cada linha desenha o mesmo caminho que a
 * expressão "Flutuação" do host (`quick-effects.jsx`, Wiggle v3), em versão
 * aproximada: o `noise()` do After Effects é trocado por um Perlin 1D local.
 */
export interface WigglePreset {
  readonly id: string;
  readonly name: { readonly "pt-BR": string; readonly "en-US": string };
  readonly use: { readonly "pt-BR": string; readonly "en-US": string };
  readonly frequency: number;
  readonly amplitude: number;
  readonly rotation: number;
  readonly octaves: number;
  readonly amplitudeMultiplier: number;
}
export interface FlickerPreset {
  readonly id: string;
  readonly name: { readonly "pt-BR": string; readonly "en-US": string };
  readonly use: { readonly "pt-BR": string; readonly "en-US": string };
  readonly rate: number;
  readonly minFactor: number;
  readonly maxFactor: number;
}

export const WIGGLE_PRESETS: readonly WigglePreset[] = [
  { id: "float", name: { "pt-BR": "Flutuar", "en-US": "Float" }, use: { "pt-BR": "logo, card, título", "en-US": "logo, card, title" }, frequency: 0.35, amplitude: 14, rotation: 0.6, octaves: 2, amplitudeMultiplier: 0.5 },
  { id: "breathe", name: { "pt-BR": "Respirar", "en-US": "Breathe" }, use: { "pt-BR": "produto, foto", "en-US": "product, photo" }, frequency: 0.25, amplitude: 6, rotation: 0.2, octaves: 1, amplitudeMultiplier: 0.5 },
  { id: "handheld", name: { "pt-BR": "Câmera na mão", "en-US": "Handheld" }, use: { "pt-BR": "cena, nulo de câmera", "en-US": "scene, camera null" }, frequency: 0.9, amplitude: 18, rotation: 1.2, octaves: 3, amplitudeMultiplier: 0.5 },
  { id: "drift", name: { "pt-BR": "Deriva lenta", "en-US": "Slow drift" }, use: { "pt-BR": "fundo, elementos grandes", "en-US": "background, large shapes" }, frequency: 0.12, amplitude: 40, rotation: 1.5, octaves: 1, amplitudeMultiplier: 0.5 },
  { id: "tremor", name: { "pt-BR": "Tremor", "en-US": "Tremor" }, use: { "pt-BR": "impacto, nervoso", "en-US": "impact, nervous" }, frequency: 6, amplitude: 6, rotation: 0.4, octaves: 2, amplitudeMultiplier: 0.6 }
];
export const FLICKER_PRESETS: readonly FlickerPreset[] = [
  { id: "failing", name: { "pt-BR": "Lâmpada falhando", "en-US": "Failing bulb" }, use: { "pt-BR": "falhas fundas", "en-US": "deep drops" }, rate: 9, minFactor: 0.55, maxFactor: 1 },
  { id: "neon", name: { "pt-BR": "Neon instável", "en-US": "Unstable neon" }, use: { "pt-BR": "tremor leve e rápido", "en-US": "fast, light jitter" }, rate: 18, minFactor: 0.78, maxFactor: 1 },
  { id: "candle", name: { "pt-BR": "Vela suave", "en-US": "Soft candle" }, use: { "pt-BR": "oscila sem apagar", "en-US": "never goes dark" }, rate: 4, minFactor: 0.7, maxFactor: 1 },
  { id: "strobe", name: { "pt-BR": "Estroboscópio", "en-US": "Strobe" }, use: { "pt-BR": "liga e desliga", "en-US": "on and off" }, rate: 8, minFactor: 0, maxFactor: 1 }
];

const NUMERIC_TOLERANCE = 1e-6;
const close = (a: number, b: number): boolean => Math.abs(a - b) < NUMERIC_TOLERANCE;

/** The preset whose numbers match the draft (amplitude compared in 1080p pixels), or null. */
export function matchWigglePreset(draft: { frequency: number; amplitude: number; octaves: number; amplitudeMultiplier: number; rotation?: number }, pixelScale: number): WigglePreset | null {
  return WIGGLE_PRESETS.find(preset => close(preset.frequency, draft.frequency) && close(preset.amplitude * pixelScale, draft.amplitude)
    && preset.octaves === draft.octaves && close(preset.amplitudeMultiplier, draft.amplitudeMultiplier)
    && (draft.rotation === undefined || close(preset.rotation, draft.rotation))) ?? null;
}
export function matchFlickerPreset(draft: { rate: number; minFactor: number; maxFactor: number }): FlickerPreset | null {
  return FLICKER_PRESETS.find(preset => close(preset.rate, draft.rate) && close(preset.minFactor, draft.minFactor) && close(preset.maxFactor, draft.maxFactor)) ?? null;
}

// ---------------------------------------------------------------------------
// Prévia: aproximação local da expressão do host.
// ---------------------------------------------------------------------------
const hash = (i: number): number => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function perlin(x: number, s: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = (hash(i + s * 57.13) * 2 - 1) * f, b = (hash(i + 1 + s * 57.13) * 2 - 1) * (f - 1);
  return Math.max(-1, Math.min(1, (a + (b - a) * u) * 2.2));
}
/** Offset in 1080p pixels of the Flutuação expression at `time` (layer starting at 0, seed 0). */
export function driftOffset(time: number, preset: Pick<WigglePreset, "frequency" | "amplitude" | "octaves" | "amplitudeMultiplier">): { x: number; y: number } {
  const t = time * preset.frequency;
  const n = (k: number, q: number): number => perlin(t * q + k * 13.17, k);
  const axis = (index: number): number => {
    let d = index === 0 ? n(1, 1) * 0.65 + Math.cos(t * 2.31) * 0.35 : n(2, 1) * 0.65 + Math.sin(t * 1.43) * 0.35;
    let w = preset.amplitudeMultiplier * 0.35, q = 2;
    for (let o = 1; o < preset.octaves; o += 1) { d += n(20 + index * 7 + o, q) * w; w *= preset.amplitudeMultiplier; q *= 2; }
    return d;
  };
  return { x: axis(0) * preset.amplitude, y: axis(1) * preset.amplitude };
}
export function flickerFactor(time: number, preset: Pick<FlickerPreset, "rate" | "minFactor" | "maxFactor">): number {
  const step = Math.floor(time * preset.rate);
  return preset.minFactor + (preset.maxFactor - preset.minFactor) * hash(step * 3.7 + 13.1);
}

export interface PresetListOptions<T extends { id: string; name: Record<"pt-BR" | "en-US", string>; use: Record<"pt-BR" | "en-US", string> }> {
  readonly presets: readonly T[];
  readonly activeId: string | null;
  readonly locale: string;
  readonly kind: "wiggle" | "flicker";
  readonly disabled?: boolean;
  /** Reduced motion: the miniatures draw one still frame. */
  readonly reducedMotion?: boolean;
  onPick(preset: T): void;
}
export interface PresetList { readonly element: HTMLElement; dispose(): void }

const MINI_WIDTH = 40;
const MINI_HEIGHT = 22;
const TRAIL_STEPS = 40;

/** Compact preset rows (28 px) with an animated miniature of each motion. */
export function createPresetList<T extends WigglePreset | FlickerPreset>(doc: Document, options: PresetListOptions<T>): PresetList {
  const pt = options.locale === "pt-BR";
  const element = createElement(doc, "div", "ch-tool-presets");
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", pt ? "Presets" : "Presets");
  const minis: { canvas: HTMLCanvasElement; preset: T }[] = [];
  for (const preset of options.presets) {
    const row = createElement(doc, "button", "ch-tool-preset") as HTMLButtonElement;
    row.type = "button";
    row.id = `tool-preset-${options.kind}-${preset.id}`;
    row.setAttribute("aria-pressed", String(preset.id === options.activeId));
    row.disabled = options.disabled === true;
    const canvas = createElement(doc, "canvas", "ch-tool-preset__mini") as HTMLCanvasElement;
    canvas.width = MINI_WIDTH * 2; canvas.height = MINI_HEIGHT * 2;
    canvas.setAttribute("aria-hidden", "true");
    row.appendChild(canvas);
    row.appendChild(createElement(doc, "span", "ch-tool-preset__name", preset.name[pt ? "pt-BR" : "en-US"]));
    row.appendChild(createElement(doc, "span", "ch-tool-preset__use", preset.use[pt ? "pt-BR" : "en-US"]));
    row.addEventListener("click", () => { if (!row.disabled) options.onPick(preset); });
    element.appendChild(row);
    minis.push({ canvas, preset });
  }
  const view = doc.defaultView;
  let frame = 0;
  const started = view?.performance?.now?.() ?? 0;
  let mounted = false;
  const draw = (now: number): void => {
    // Editors rerender by replacing their content: a list taken off the page stops by itself.
    if (element.isConnected) mounted = true;
    else if (mounted || now - started > 2000) { frame = 0; return; }
    const time = options.reducedMotion ? 2.4 : (now - started) / 1000;
    for (const mini of minis) drawMini(mini.canvas, mini.preset, options.kind, time);
    if (!options.reducedMotion && view?.requestAnimationFrame) frame = view.requestAnimationFrame(draw);
  };
  if (view?.requestAnimationFrame) frame = view.requestAnimationFrame(draw);
  return { element, dispose: () => { if (frame && view?.cancelAnimationFrame) view.cancelAnimationFrame(frame); frame = 0; } };
}

function drawMini(canvas: HTMLCanvasElement, preset: WigglePreset | FlickerPreset, kind: "wiggle" | "flicker", time: number): void {
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (kind === "flicker") {
    const value = flickerFactor(time, preset as FlickerPreset);
    ctx.fillStyle = `rgba(255, 214, 140, ${value * 0.25})`;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255, 214, 140, ${value})`;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const wiggle = preset as WigglePreset;
  const scale = (h * 0.7) / Math.max(1, wiggle.amplitude);
  const span = 3.2 / Math.max(0.3, wiggle.frequency);
  let previous: [number, number] | null = null;
  ctx.lineWidth = 2;
  for (let i = TRAIL_STEPS; i >= 0; i -= 1) {
    const offset = driftOffset(time - (i * span) / TRAIL_STEPS, wiggle);
    const point: [number, number] = [w / 2 + offset.x * scale, h / 2 + offset.y * scale];
    if (previous) {
      ctx.strokeStyle = `rgba(110, 170, 240, ${(1 - i / TRAIL_STEPS) * 0.9})`;
      ctx.beginPath(); ctx.moveTo(previous[0], previous[1]); ctx.lineTo(point[0], point[1]); ctx.stroke();
    }
    previous = point;
  }
  if (previous) { ctx.fillStyle = "#e6f1ff"; ctx.beginPath(); ctx.arc(previous[0], previous[1], 3.5, 0, Math.PI * 2); ctx.fill(); }
}
