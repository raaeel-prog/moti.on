import {button, clearNode, createElement} from "@motion/ui-core";
import {isMotionLibraryOptions, type MotionLibraryOptions, type MotionLibraryPreset} from "@motion/contracts";
import {libraryPreviewEnd, libraryPreviewPlayback, paintLibraryPreview} from "./motion-library-preview.js";
import {TEXT_REFERENCE_MANIFEST} from "./generated/text-reference-manifest.js";

export interface TextReferenceAsset {
  video: string; poster: string; hash: string; durationSeconds: number;
  text: string; options: MotionLibraryOptions;
}
export interface TextReferenceManifest {schemaVersion: 1; presets: Record<string, TextReferenceAsset>;}

/** Rendered assets are original local media; never accept remote URLs or paths
 * supplied by a catalog. The manifest cannot load executable content. */
export function textReferenceAsset(manifest: unknown, id: string): TextReferenceAsset | undefined {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
  const root = manifest as Partial<TextReferenceManifest>;
  if (root.schemaVersion !== 1 || !root.presets || typeof root.presets !== "object") return;
  const item = root.presets[id];
  if (!item || typeof item !== "object" || !/^[a-z0-9-]+\.mp4$/.test(item.video) || !/^[a-z0-9-]+\.jpg$/.test(item.poster)
    || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/i.test(item.hash) || typeof item.text !== "string" || item.text.length > 180
    || !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0 || item.durationSeconds > 60 || !isMotionLibraryOptions(item.options)) return;
  return item;
}

// CEP loads index.html from file://. Embedding the small trusted manifest avoids
// file-origin fetch restrictions; the videos themselves remain lazy local media.
function loadManifest():Promise<unknown>{return Promise.resolve(TEXT_REFERENCE_MANIFEST);}

/** One focused preview owns its frame clock and media. Draft edits repaint the
 * simulation; the reference remains the configuration recorded in the manifest. */
export function createTextPresetPreview(doc: Document, options: {
  locale: string; preset: MotionLibraryPreset; settings(): MotionLibraryOptions;
  sample: string; onSample(value: string): void;
  loadReference?(): Promise<unknown>;
}): {element: HTMLElement; refresh(): void; dispose(): void} {
  const pt = options.locale === "pt-BR", view = doc.defaultView;
  const element = createElement(doc, "section", "ch-text-preview");
  element.setAttribute("aria-label", pt ? "Prévia de texto" : "Text preview");
  const modes = createElement(doc, "div", "ch-text-preview-modes");element.appendChild(modes);
  const simulation = button(doc, {label: pt ? "Simulação interativa" : "Interactive simulation", onClick: () => selectMode("simulation")});
  const reference = button(doc, {label: pt ? "Render AE" : "AE render", onClick: () => selectMode("reference")});
  for (const control of [simulation, reference]) {control.setAttribute("aria-pressed", String(control === simulation));modes.appendChild(control);}
  const stage = createElement(doc, "div", "ch-text-preview-stage");element.appendChild(stage);
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");svg.setAttribute("viewBox", "0 0 320 180");svg.setAttribute("aria-hidden", "true");stage.appendChild(svg);
  const video = doc.createElement("video");video.className = "ch-text-preview-video";video.hidden = true;video.controls = true;video.muted = true;video.loop = true;video.preload = "none";video.setAttribute("playsinline", "");video.setAttribute("aria-label", pt ? "Referência renderizada no After Effects" : "Reference rendered in After Effects");stage.appendChild(video);
  const status = createElement(doc, "p", "ch-preset-hint ch-text-preview-status");status.setAttribute("role", "status");status.setAttribute("aria-live", "polite");element.appendChild(status);
  const controls = createElement(doc, "div", "ch-text-preview-playback");element.appendChild(controls);
  const play = button(doc, {label: pt ? "Reproduzir" : "Play", onClick: () => togglePlayback()});controls.appendChild(play);
  const scrub = doc.createElement("input");scrub.type = "range";scrub.min = "0";scrub.max = "1";scrub.step = "0.001";scrub.value = ".5";scrub.setAttribute("aria-label", pt ? "Percorrer prévia" : "Scrub preview");controls.appendChild(scrub);
  const label = createElement(doc, "label", "ch-text-preview-sample");label.appendChild(createElement(doc, "span", "", pt ? "Texto de amostra" : "Sample text"));
  const sample = doc.createElement("textarea");sample.rows = 2;sample.maxLength = 180;sample.value = options.sample;sample.setAttribute("aria-label", pt ? "Texto de amostra" : "Sample text");sample.spellcheck = false;label.appendChild(sample);element.appendChild(label);
  let disposed = false, mode: "simulation" | "reference" = "simulation", playing = false, frame = 0, start = 0, elapsed = 0, visible = true;
  let asset: TextReferenceAsset | undefined, request = 0, loading = false;
  const reduced = (): boolean => doc.documentElement.getAttribute("data-reduced-motion") === "true";
  const duration = (): number => mode === "reference" ? asset?.durationSeconds ?? 1 : options.preset.mode === "continuous" ? 8 : libraryPreviewEnd(options.settings());
  function paint(time: number): void {if (disposed) return;clearNode(svg);paintLibraryPreview(svg, options.preset, options.settings(), time, false, sample.value);}
  function feedback(): void {
    if (mode === "simulation") status.textContent = pt ? "Simulação com seus ajustes. Tipografia, perspectiva e blur são aproximados; compare com o render AE." : "Simulation of your settings. Type, perspective and blur are approximate; compare with the AE render.";
    else if (asset) status.textContent = pt ? "Render de referência · configuração gravada. Texto e ajustes locais aparecem na simulação." : "Reference render · recorded configuration. Your local text and settings appear in the simulation.";
    else status.textContent = loading ? pt ? "Carregando render de referência…" : "Loading reference render…" : pt ? "Render AE ainda indisponível para esta receita. A simulação continua disponível." : "AE render is not yet available for this recipe. The simulation remains available.";
    play.disabled = mode === "reference" && !asset; scrub.disabled = mode === "reference" && !asset;
    play.textContent = playing ? pt ? "Pausar" : "Pause" : pt ? "Reproduzir" : "Play";play.setAttribute("aria-pressed", String(playing));
  }
  function pause(): void {playing = false;if (frame) view?.cancelAnimationFrame?.(frame);frame = 0;video.pause?.();feedback();}
  function schedule(): void {
    if (disposed || !playing || !visible || doc.hidden || reduced() || mode !== "simulation" || frame || !view?.requestAnimationFrame) return;
    frame = view.requestAnimationFrame(tick);
  }
  function tick(now: number): void {
    frame = 0;if (disposed || !playing || !visible || doc.hidden || reduced()) {pause();return;}
    elapsed = (now - start) / 1000;
    const playback = libraryPreviewPlayback(options.preset, options.settings(), elapsed);
    svg.setAttribute("opacity", String(playback.opacity));paint(playback.time);scrub.value = String(playback.time / duration());schedule();
  }
  function togglePlayback(): void {
    if (disposed) return;if (playing) {pause();return;}if (!visible || doc.hidden || reduced()) return;
    playing = true;start = (view?.performance?.now?.() ?? performance.now()) - elapsed * 1000;
    if (mode === "reference") {if (!asset) {playing = false;return;}void video.play?.().catch(() => {if (!disposed) pause();});}
    else schedule();feedback();
  }
  function attachMedia(): void {
    if (!asset || !visible || disposed || mode !== "reference") return;
    if (!video.getAttribute("src")) {video.setAttribute("poster", `../assets/text-previews/${asset.poster}`);video.setAttribute("src", `../assets/text-previews/${asset.video}`);video.load?.();}
  }
  function releaseMedia(): void {video.pause?.();video.removeAttribute("src");video.removeAttribute("poster");video.load?.();}
  async function fetchReference(): Promise<void> {
    const token = ++request;loading = true;feedback();
    try {const manifest = await (options.loadReference?.() ?? loadManifest());if (disposed || token !== request) return;asset = textReferenceAsset(manifest, options.preset.id);attachMedia();}
    catch {if (!disposed && token === request) asset = undefined;}
    finally {if (!disposed && token === request) {loading = false;feedback();}}
  }
  function selectMode(value: "simulation" | "reference"): void {
    if (disposed) return;pause();mode = value;simulation.setAttribute("aria-pressed", String(value === "simulation"));reference.setAttribute("aria-pressed", String(value === "reference"));
    svg.style.display = value !== "simulation" ? "none" : "";video.hidden = value !== "reference";label.hidden = value !== "simulation";
    if (value === "reference") {if (asset) attachMedia();else void fetchReference();}else {releaseMedia();paint(Number(scrub.value) * duration());}feedback();
  }
  const scrubInput = (): void => {if(disposed)return;pause();elapsed = Number(scrub.value) * duration();if (mode === "reference") {if (asset) video.currentTime = elapsed;}else {svg.setAttribute("opacity", "1");paint(elapsed);}};
  const sampleInput = (): void => {if (disposed) return;options.onSample(sample.value);paint(Number(scrub.value) * duration());};
  sample.addEventListener("input", sampleInput);scrub.addEventListener("input", scrubInput);
  const timeUpdate = (): void => {if (mode === "reference" && asset) scrub.value = String(video.currentTime / asset.durationSeconds);};video.addEventListener("timeupdate", timeUpdate);
  const mediaError = (): void => {if (disposed) return;pause();asset = undefined;feedback();};video.addEventListener("error", mediaError);
  const visibility = (): void => {if (doc.hidden) pause();};doc.addEventListener("visibilitychange", visibility);view?.addEventListener("blur", pause);
  const intersection = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === element) {visible = entry.isIntersecting;if (!visible) {pause();releaseMedia();}else attachMedia();}
  }, {threshold: .1}) : undefined;intersection?.observe(element);
  const motion = typeof MutationObserver !== "undefined" ? new MutationObserver(() => {if (reduced()) pause();}) : undefined;motion?.observe(doc.documentElement, {attributes: true, attributeFilter: ["data-reduced-motion"]});
  paint(duration() / 2);feedback();
  return {element, refresh() {if (disposed) return;elapsed = 0;start = view?.performance?.now?.() ?? performance.now();if (mode === "simulation") paint(Number(scrub.value) * duration());}, dispose() {
    if (disposed) return;pause();disposed = true;request++;releaseMedia();intersection?.disconnect();motion?.disconnect();doc.removeEventListener("visibilitychange", visibility);view?.removeEventListener("blur", pause);
    sample.removeEventListener?.("input", sampleInput);scrub.removeEventListener?.("input", scrubInput);video.removeEventListener?.("timeupdate", timeUpdate);video.removeEventListener?.("error", mediaError);clearNode(svg);
  }};
}
