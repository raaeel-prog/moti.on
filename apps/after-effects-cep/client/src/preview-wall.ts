/** Many rendered previews playing at once, the way Animation Composer's batch
 * player does: every card on screen animates, each from frames decoded once
 * (preview-frames.ts), and one animation-frame loop draws all of them. Nothing
 * on screen is a <video>, so there is no decoder per card to stall or blink.
 *
 * Each card gets its own canvas over its still. A card starts only once its
 * whole clip is decoded (a 320 × 180 clip takes about 100 ms in After Effects),
 * so even its first cycle plays at full rate from the first frame; until then
 * the still stays. Streaming playback started at the first frame starved every
 * card while a screen decoded (about 2 fps, measured in the host). A clip that
 * cannot be decoded leaves the still (`data-state="failed"`). Frames are chosen
 * by each card's clock, so a slow animation frame skips ahead instead of
 * slowing the motion down. */
import { bakeKey, browserFrameEnvironment, createFrameCache, type BakeSpec, type BakedClip, type FrameCache } from "./preview-frames.js";

export interface PreviewWall {
  /** Plays `spec` over `host`. The same host and clip keep playing; a paused one continues. */
  attach(host: HTMLElement, spec: BakeSpec): void;
  /** Removes the host's canvas, leaving its still. */
  detach(host: HTMLElement): void;
  /** Freezes one host, or every host, on the frame it shows. */
  pause(host?: HTMLElement): void;
  resume(host?: HTMLElement): void;
  hosts(): HTMLElement[];
  dispose(): void;
}

export interface WallEnvironment {
  readonly frames: FrameCache;
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  /** Draws one frame filling the canvas. */
  draw(canvas: HTMLCanvasElement, frame: ImageBitmap, clip: BakedClip): void;
}

interface Surface {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  spec: BakeSpec;
  key: string;
  generation: number;
  clip: BakedClip | null;
  /** A clip still decoding for this card, held so it is not evicted before it plays. */
  waiting: BakedClip | null;
  startedAt: number;
  pausedAt: number | null;
  lastIndex: number;
}

const sharedCaches = new WeakMap<Document, FrameCache>();

/** Every wall of a panel shares one cache, so a clip decoded for a card also serves its tile. */
export function sharedFrameCache(doc: Document): FrameCache {
  let cache = sharedCaches.get(doc);
  if (!cache) { cache = createFrameCache(browserFrameEnvironment(doc)); sharedCaches.set(doc, cache); }
  return cache;
}

export function browserWallEnvironment(doc: Document): WallEnvironment {
  return {
    frames: sharedFrameCache(doc),
    now: () => globalThis.performance.now(),
    requestFrame: callback => globalThis.requestAnimationFrame(callback),
    cancelFrame: handle => globalThis.cancelAnimationFrame(handle),
    draw(canvas, frame, clip) {
      if (canvas.width !== clip.width) canvas.width = clip.width;
      if (canvas.height !== clip.height) canvas.height = clip.height;
      canvas.getContext("2d")?.drawImage(frame, 0, 0, clip.width, clip.height);
    }
  };
}

/** The frame a clip shows `elapsed` ms after it started, looping. */
export function frameAt(clip: Pick<BakedClip, "frames" | "frameMs" | "durationMs">, elapsed: number): number {
  const looped = ((elapsed % clip.durationMs) + clip.durationMs) % clip.durationMs;
  return Math.min(clip.frames.length - 1, Math.floor(looped / clip.frameMs));
}

/** Width a preview is decoded at: its on-screen size, kept between 160 and 320 px in 16 px steps.
 * `measured` is the host's CSS width when the caller already knows it: reading
 * `clientWidth` forces a layout of the whole grid, so a grid of identical cards
 * measures once per layout change instead of once per card per frame. */
export function previewSpec(host: HTMLElement, src: string, fps: number, measured?: number): BakeSpec {
  const ratio = typeof globalThis.devicePixelRatio === "number" && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const shown = Math.ceil(((measured ?? host.clientWidth ?? 0) * ratio) / 16) * 16;
  const width = Math.max(160, Math.min(320, shown || 320));
  return { src, fps, width, height: Math.round(width * 9 / 16) };
}

export function createPreviewWall(doc: Document, className: string, environment?: WallEnvironment): PreviewWall {
  const env = environment ?? browserWallEnvironment(doc);
  const surfaces = new Map<HTMLElement, Surface>();
  let loop = 0, disposed = false;

  const shown = (surface: Surface, value: boolean): void => surface.canvas.setAttribute("data-shown", String(value));
  function paint(surface: Surface, now: number): void {
    const clip = surface.clip;
    if (!clip) return;
    const at = surface.pausedAt ?? now;
    // While the clip still decodes, its clock never runs past the last decoded
    // frame: a busy machine makes the card wait a moment, never skip ahead.
    if (!clip.complete && surface.pausedAt === null && at - surface.startedAt > (clip.frames.length - 1) * clip.frameMs) {
      surface.startedAt = at - (clip.frames.length - 1) * clip.frameMs;
    }
    const index = frameAt(clip, at - surface.startedAt);
    if (index === surface.lastIndex) return;
    surface.lastIndex = index;
    env.draw(surface.canvas, clip.frames[index]!, clip);
  }
  const playing = (surface: Surface): boolean => surface.clip !== null && surface.pausedAt === null;
  function run(): void {
    loop = 0;
    if (disposed) return;
    const now = env.now();
    let any = false;
    for (const surface of surfaces.values()) if (playing(surface)) { paint(surface, now); any = true; }
    if (any) loop = env.requestFrame(run);
  }
  function wake(): void {
    if (!loop && !disposed && [...surfaces.values()].some(playing)) loop = env.requestFrame(run);
  }
  function begin(surface: Surface, clip: BakedClip): void {
    if (surface.waiting === clip) surface.waiting = null; else env.frames.retain(clip.key);
    surface.clip = clip; surface.startedAt = env.now(); surface.pausedAt = null; surface.lastIndex = -1;
    surface.canvas.removeAttribute("data-state");
    paint(surface, surface.startedAt); shown(surface, true);
    wake();
  }
  function load(surface: Surface): void {
    const expected = surface.generation;
    surface.canvas.setAttribute("data-state", "loading");
    const current = (): boolean => surfaces.get(surface.host) === surface && surface.generation === expected;
    const whole = (clip: BakedClip): void => {
      if (clip.complete) { begin(surface, clip); return; }
      env.frames.retain(clip.key); surface.waiting = clip;
      clip.done.then(() => { if (current() && surface.waiting === clip) begin(surface, clip); });
    };
    const ready = env.frames.peek(surface.spec);
    if (ready) { whole(ready); return; }
    env.frames.get(surface.spec).then(
      clip => { if (current()) whole(clip); },
      () => { if (current()) surface.canvas.setAttribute("data-state", "failed"); }
    );
  }
  function unload(surface: Surface): void {
    surface.generation++;
    if (surface.clip) env.frames.release(surface.clip.key);
    if (surface.waiting) { env.frames.release(surface.waiting.key); surface.waiting = null; }
    surface.clip = null; surface.pausedAt = null; surface.lastIndex = -1;
    shown(surface, false);
  }
  function detach(host: HTMLElement): void {
    const surface = surfaces.get(host);
    if (!surface) return;
    unload(surface);
    surfaces.delete(host);
    surface.canvas.parentNode?.removeChild(surface.canvas);
    if (![...surfaces.values()].some(playing) && loop) { env.cancelFrame(loop); loop = 0; }
  }
  function pauseOne(surface: Surface): void { if (surface.clip && surface.pausedAt === null) surface.pausedAt = env.now(); }
  function resumeOne(surface: Surface): void {
    if (surface.clip && surface.pausedAt !== null) { surface.startedAt += env.now() - surface.pausedAt; surface.pausedAt = null; }
  }

  return {
    attach(host, spec) {
      if (disposed) return;
      const key = bakeKey(spec), current = surfaces.get(host);
      if (current && current.key === key && current.canvas.parentNode === host) { resumeOne(current); wake(); return; }
      let surface = current;
      if (surface) unload(surface);
      else {
        const canvas = doc.createElement("canvas");
        canvas.className = className;
        canvas.setAttribute("aria-hidden", "true");
        surface = { host, canvas, spec, key, generation: 0, clip: null, waiting: null, startedAt: 0, pausedAt: null, lastIndex: -1 };
        surfaces.set(host, surface);
      }
      surface.spec = spec; surface.key = key;
      shown(surface, false);
      if (surface.canvas.parentNode !== host) host.appendChild(surface.canvas);
      load(surface);
    },
    detach,
    pause(host) {
      if (host) { const surface = surfaces.get(host); if (surface) pauseOne(surface); }
      else for (const surface of surfaces.values()) pauseOne(surface);
      if (![...surfaces.values()].some(playing) && loop) { env.cancelFrame(loop); loop = 0; }
    },
    resume(host) {
      if (host) { const surface = surfaces.get(host); if (surface) resumeOne(surface); }
      else for (const surface of surfaces.values()) resumeOne(surface);
      wake();
    },
    hosts: () => [...surfaces.keys()],
    dispose() {
      for (const host of [...surfaces.keys()]) detach(host);
      disposed = true;
      if (loop) env.cancelFrame(loop);
      loop = 0;
    }
  };
}
