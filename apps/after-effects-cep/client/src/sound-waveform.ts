/**
 * Barra de áudio dos sons da galeria: forma de onda em barras verticais, com a
 * parte já tocada na cor de destaque e o cursor de reprodução por cima, como nos
 * players de efeitos sonoros (Composer `waveform-player`, Freesound, peaks.js).
 * Os picos vêm prontos do build (`generated/sound-peaks.ts`); nada é decodificado
 * no painel. Clicar ou usar as setas na barra grande move a reprodução.
 */
import { createElement } from "@motion/ui-core";
import { SOUND_PEAKS, type SoundPeaks } from "./generated/sound-peaks.js";

export interface SoundWaveform {
  element: HTMLElement;
  /** 0–1 da reprodução; null tira o cursor (parado). */
  setProgress(fraction: number | null): void;
}
export interface SoundWaveformOptions {
  size: "row" | "inspector";
  label?: string;
  /** Só a barra grande aceita clique e teclado para mudar a posição. */
  onSeek?(fraction: number): void;
}

const SEEK_STEP = .05;

export function soundPeaksFor(id: string): SoundPeaks | undefined { return SOUND_PEAKS[id]; }

/** "0,62 s" / "0.62 s": duração curta e legível no idioma do painel. */
export function formatSoundDuration(ms: number, pt: boolean): string {
  const text = (Math.max(0, ms) / 1000).toFixed(ms < 10000 ? 2 : 1);
  return `${pt ? text.replace(".", ",") : text} s`;
}

function bars(doc: Document, peaks: readonly number[]): {lane: HTMLElement; items: HTMLElement[]} {
  const lane = createElement(doc, "span", "ch-wave__lane"), items: HTMLElement[] = [];
  for (const peak of peaks) {
    const bar = createElement(doc, "span", "ch-wave__bar");
    bar.style.height = `${Math.max(6, Math.min(100, peak))}%`;
    lane.appendChild(bar); items.push(bar);
  }
  return { lane, items };
}

export function createSoundWaveform(doc: Document, soundId: string, options: SoundWaveformOptions): SoundWaveform {
  const data = soundPeaksFor(soundId);
  const element = createElement(doc, "span", `ch-wave ch-wave--${options.size}`);
  element.setAttribute("aria-hidden", options.onSeek ? "false" : "true");
  if (!data) { element.dataset["empty"] = "true"; return { element, setProgress: () => undefined }; }
  const { lane, items } = bars(doc, data.peaks);
  const head = createElement(doc, "span", "ch-wave__head");
  element.appendChild(lane); element.appendChild(head);
  let current: number | null = null, playedBars = 0;

  function setProgress(fraction: number | null): void {
    current = fraction === null || !Number.isFinite(fraction) ? null : Math.max(0, Math.min(1, fraction));
    element.dataset["playing"] = String(current !== null);
    head.style.left = `${(current ?? 0) * 100}%`;
    // Só as barras que mudaram de estado são tocadas a cada quadro.
    const next = current === null ? 0 : Math.round(current * items.length);
    for (let i = Math.min(playedBars, next); i < Math.max(playedBars, next); i++) items[i]!.dataset["played"] = String(i < next);
    playedBars = next;
    if (options.onSeek) element.setAttribute("aria-valuenow", String(Math.round((current ?? 0) * 100)));
  }
  if (options.onSeek) {
    const seek = options.onSeek;
    element.tabIndex = 0;
    element.setAttribute("role", "slider");
    element.setAttribute("aria-label", options.label ?? "");
    element.setAttribute("aria-valuemin", "0"); element.setAttribute("aria-valuemax", "100");
    element.addEventListener("click", event => {
      const rect = element.getBoundingClientRect(), pointer = event as MouseEvent;
      if (rect.width > 0) seek(Math.max(0, Math.min(1, (pointer.clientX - rect.left) / rect.width)));
    });
    element.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key;
      const next = key === "ArrowRight" ? (current ?? 0) + SEEK_STEP : key === "ArrowLeft" ? (current ?? 0) - SEEK_STEP
        : key === "Home" ? 0 : key === "End" ? 1 : null;
      if (next === null) return;
      event.preventDefault(); seek(Math.max(0, Math.min(1, next)));
    });
  }
  setProgress(null);
  return { element, setProgress };
}
