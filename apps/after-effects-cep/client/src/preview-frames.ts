/** Rendered previews are decoded into frames held in memory, then drawn by a
 * clock (see preview-wall.ts). This is how Animation Composer keeps a grid of
 * previews steady and smooth: its renderer writes every frame of the comp
 * (29.97 fps, 320×180, tuned for fast decoding) and its panel draws the decoded
 * frames itself, so no live <video> can seek, buffer or blink.
 *
 * Like its batch player, a clip streams: `get` resolves as soon as the first
 * frame is decoded and the rest keeps arriving while the card already plays
 * (decoding runs far faster than 30 fps, so playback never catches up). A few
 * hidden decoders run side by side, the way Animation Composer runs several
 * workers, so the cards of a screen start together instead of one after another.
 *
 * Every frame of the clip is kept, scaled to the size it is shown at. New bakes
 * wait while the list scrolls. Past the memory budget, finished clips that no
 * card shows are dropped least-recently-used first; a clip on screen, or one
 * still decoding, is never dropped. */

import { createWorkerDecoder, type WorkerDecoder } from "./preview-decoder.js";

export interface BakeSpec {
  readonly src: string;
  /** The clip's own frame rate: every frame is kept. */
  readonly fps: number;
  readonly width: number;
  readonly height: number;
}

/** "now": a card on screen waits for it. "ahead": decoded early for a card about to scroll in, after every "now". */
export type BakePriority = "now" | "ahead";

export interface BakedClip {
  readonly key: string;
  readonly src: string;
  /** Grows while the clip decodes; complete once `done` resolves. */
  readonly frames: readonly ImageBitmap[];
  readonly width: number;
  readonly height: number;
  readonly frameMs: number;
  /** The whole clip's length, known before its frames are. */
  readonly durationMs: number;
  readonly bytes: number;
  readonly complete: boolean;
  /** Resolves when every frame is decoded (or decoding stopped early). */
  readonly done: Promise<void>;
}

/** Frames of one clip in order, from whichever decoder produced them. */
export interface FrameStream {
  readonly count: number;
  readonly frameMs: number;
  /** The next frame, or null once the clip is done. */
  next(): Promise<ImageBitmap | null>;
  cancel(): void;
}

export interface FrameEnvironment {
  /** Decodes off the main thread (WebCodecs in workers); rejects when it cannot, and the <video> decoder is used. */
  open?(spec: BakeSpec): Promise<FrameStream>;
  /** A decoder element, never attached to the document. */
  createVideo(): HTMLVideoElement;
  /** Copies the frame the decoder shows, scaled to `width` × `height`. */
  capture(video: HTMLVideoElement, width: number, height: number): Promise<ImageBitmap>;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface FrameCacheOptions {
  readonly maxFrames?: number;
  readonly budgetBytes?: number;
  readonly timeoutMs?: number;
  /** <video> decoders running at once (each costs the panel thread). */
  readonly decoders?: number;
  /** Clips decoding at once in workers: paced and off-thread, so every card on screen can start together. */
  readonly streams?: number;
  /** Gap between starting two worker streams, so a full screen does not open every decoder in the same frame. */
  readonly staggerMs?: number;
}

export interface FrameCache {
  /** Resolves with the clip once its first frame is decoded; concurrent calls share one bake, the latest asked goes first. */
  get(spec: BakeSpec, priority?: BakePriority): Promise<BakedClip>;
  /** The clip if decoding has started showing frames, marking it as just used. */
  peek(spec: BakeSpec): BakedClip | undefined;
  /** A retained clip (on screen) is never evicted; calls are counted. */
  retain(key: string): void;
  release(key: string): void;
  /** While held (the list is scrolling), no new bake starts. */
  hold(held: boolean): void;
  residentBytes(): number;
  dispose(): void;
}

export function bakeKey(spec: BakeSpec): string {
  return `${spec.src}|${spec.fps}|${spec.width}x${spec.height}`;
}

/** In After Effects the workers decode about 1,400 frames a second in all,
 * however many run: one 320 × 180 clip alone takes about 100 ms, twelve at
 * once about a second each. So a few clips decode at a time, each at full
 * speed, the card in view first; a screen of cards fills in well under a
 * second and each card starts complete. 320 MB holds a screen of cards plus
 * a scroll's worth of recently seen ones (about 12 MB per 208 px clip). */
const DEFAULTS = { maxFrames: 240, budgetBytes: 320 * 1024 * 1024, timeoutMs: 4000, decoders: 3, streams: 3, staggerMs: 0 };

interface MutableClip {
  key: string; src: string; frames: ImageBitmap[]; width: number; height: number;
  frameMs: number; durationMs: number; bytes: number; complete: boolean; done: Promise<void>;
}
interface Pending { spec: BakeSpec; key: string; ahead: boolean; resolve(clip: BakedClip): void; reject(error: Error): void; }

/** Waits for `ok` on the element, rejecting on `error` or after `ms`. */
function once(video: HTMLVideoElement, ok: string, env: FrameEnvironment, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error?: Error): void => {
      env.clearTimeout(timer);
      video.removeEventListener(ok, onOk);
      video.removeEventListener("error", onError);
      if (error) reject(error); else resolve();
    };
    const onOk = (): void => done();
    const onError = (): void => done(new Error(`preview decode failed: ${video.error?.message ?? "media error"}`));
    const timer = env.setTimeout(() => done(new Error(`preview ${ok} timed out`)), ms);
    video.addEventListener(ok, onOk);
    video.addEventListener("error", onError);
  });
}

function closeAll(frames: readonly ImageBitmap[]): void { for (const frame of frames) frame.close(); }

export function createFrameCache(env: FrameEnvironment, options: FrameCacheOptions = {}): FrameCache {
  const settings = { ...DEFAULTS, ...options };
  const clips = new Map<string, MutableClip>();
  const used = new Map<string, number>();
  const retained = new Map<string, number>();
  const inflight = new Map<string, Promise<BakedClip>>();
  const queue: Pending[] = [];
  let resident = 0, running = 0, held = false, disposed = false, tick = 0;
  /** Off-thread decoding works here until a worker refuses a clip. */
  let workersUsable = typeof env.open === "function";

  function drop(key: string): void {
    const clip = clips.get(key);
    if (!clip) return;
    clips.delete(key); used.delete(key); resident -= clip.bytes;
    closeAll(clip.frames);
  }
  function evict(): void {
    if (resident <= settings.budgetBytes) return;
    const order = [...clips.values()].filter(clip => clip.complete && !retained.get(clip.key)).sort((a, b) => (used.get(a.key) ?? 0) - (used.get(b.key) ?? 0));
    for (const clip of order) {
      if (resident <= settings.budgetBytes) break;
      drop(clip.key);
    }
  }

  /** The fallback decoder: a hidden <video> stepped frame by frame by seeking.
   * @returns a stream that frees the element when it ends or is cancelled. */
  async function openVideo(spec: BakeSpec): Promise<FrameStream> {
    const video = env.createVideo();
    // A host without a real media element (tests, a broken panel) keeps the still.
    if (typeof video.addEventListener !== "function" || typeof video.load !== "function") throw new Error("preview decoder unavailable");
    const release = (): void => { video.removeAttribute?.("src"); video.load?.(); };
    try {
      video.muted = true; video.preload = "auto"; video.playsInline = true;
      const loaded = once(video, "loadeddata", env, settings.timeoutMs);
      video.src = spec.src;
      await loaded;
    } catch (error) { release(); throw error; }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) { release(); throw new Error("preview has no duration"); }
    const step = 1 / spec.fps, count = Math.max(1, Math.min(settings.maxFrames, Math.round(duration * spec.fps)));
    let index = 0, closed = false;
    return {
      count, frameMs: step * 1000,
      async next() {
        if (closed || index >= count) { if (!closed) { closed = true; release(); } return null; }
        // Aim at the middle of each frame so rounding never lands on the previous one.
        const at = Math.min(duration - 0.001, (index + 0.5) * step);
        index++;
        if (Math.abs(video.currentTime - at) > 0.0001) {
          const seeked = once(video, "seeked", env, settings.timeoutMs);
          video.currentTime = at;
          await seeked;
        }
        return env.capture(video, spec.width, spec.height);
      },
      cancel() { if (!closed) { closed = true; release(); } }
    };
  }

  async function open(spec: BakeSpec): Promise<FrameStream> {
    if (env.open && workersUsable) {
      try { return await env.open(spec); } catch { workersUsable = false; /* no off-thread decoding here: use the <video> decoder */ }
    }
    return openVideo(spec);
  }

  /** Decodes `job`, handing the clip over at its first frame and filling it in after. */
  async function bake(job: Pending): Promise<void> {
    const { spec, key } = job;
    let handed = false, clip: MutableClip | null = null, stream: FrameStream | null = null, finish: () => void = () => undefined;
    try {
      stream = await open(spec);
      const count = Math.min(settings.maxFrames, stream.count), frameBytes = spec.width * spec.height * 4;
      clip = { key, src: spec.src, frames: [], width: spec.width, height: spec.height, frameMs: stream.frameMs, durationMs: count * stream.frameMs, bytes: 0, complete: false, done: new Promise(resolve => { finish = resolve; }) };
      for (let i = 0; i < count; i++) {
        if (disposed) throw new Error("frame cache disposed");
        const frame = await stream.next();
        if (!frame) break;
        if (disposed) { frame.close(); throw new Error("frame cache disposed"); }
        clip.frames.push(frame); clip.bytes += frameBytes; resident += frameBytes;
        if (!handed) {
          // The first frame is on screen at once; the card plays while the rest decodes.
          handed = true;
          clips.set(key, clip); used.set(key, ++tick);
          job.resolve(clip);
        }
      }
      if (!handed) throw new Error("preview has no frames");
      clip.durationMs = Math.max(clip.frameMs, clip.frames.length * clip.frameMs);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (!handed) {
        if (clip) { resident -= clip.bytes; closeAll(clip.frames); }
        job.reject(failure);
      } else if (clip) {
        // Already playing: keep the frames that decoded and loop over them.
        clip.durationMs = Math.max(clip.frameMs, clip.frames.length * clip.frameMs);
      }
    } finally {
      stream?.cancel();
      if (clip) { clip.complete = true; finish(); }
      if (disposed && clip && handed) drop(key);
      else evict();
    }
  }

  let staggerTimer = 0, lastStart = -Infinity;
  function pump(): void {
    while (!held && !disposed && running < (workersUsable ? settings.streams : settings.decoders) && queue.length) {
      if (workersUsable && settings.staggerMs > 0) {
        const wait = lastStart + settings.staggerMs - Date.now();
        if (wait > 0) { if (!staggerTimer) staggerTimer = env.setTimeout(() => { staggerTimer = 0; pump(); }, wait); return; }
        lastStart = Date.now();
      }
      // The most recent request is what the user is looking at now.
      // A card in view goes before any decoding ahead of the scroll.
      let at = queue.length - 1;
      for (let i = queue.length - 1; i >= 0; i--) if (!queue[i]!.ahead) { at = i; break; }
      const job = queue.splice(at, 1)[0]!;
      running++;
      void bake(job).finally(() => { running--; inflight.delete(job.key); pump(); });
    }
  }

  return {
    get(spec, priority = "now") {
      const key = bakeKey(spec), ready = clips.get(key);
      if (ready) { used.set(key, ++tick); return Promise.resolve(ready); }
      const pending = inflight.get(key);
      if (pending) {
        // Asked again while still waiting: move it to the front of the line.
        const at = queue.findIndex(job => job.key === key);
        if (at >= 0) { const [job] = queue.splice(at, 1); if (priority === "now") job!.ahead = false; queue.push(job!); }
        return pending;
      }
      if (disposed) return Promise.reject(new Error("frame cache disposed"));
      const promise = new Promise<BakedClip>((resolve, reject) => queue.push({ spec, key, ahead: priority === "ahead", resolve, reject }));
      inflight.set(key, promise);
      pump();
      return promise;
    },
    peek(spec) {
      const key = bakeKey(spec), clip = clips.get(key);
      if (clip) used.set(key, ++tick);
      return clip;
    },
    retain(key) { retained.set(key, (retained.get(key) ?? 0) + 1); },
    release(key) {
      const count = (retained.get(key) ?? 0) - 1;
      if (count > 0) retained.set(key, count); else retained.delete(key);
      evict();
    },
    hold(value) { held = value; if (!held) pump(); },
    residentBytes: () => resident,
    dispose() {
      disposed = true;
      if (staggerTimer) { env.clearTimeout(staggerTimer); staggerTimer = 0; }
      for (const job of queue.splice(0)) job.reject(new Error("frame cache disposed"));
      for (const key of [...clips.keys()]) drop(key);
      used.clear(); retained.clear(); resident = 0;
    }
  };
}

/** Browser environment: workers with WebCodecs when available, else a detached <video>. */
export function browserFrameEnvironment(doc: Document): FrameEnvironment {
  let workers: WorkerDecoder | null | undefined;
  return {
    open(spec) {
      if (workers === undefined) workers = createWorkerDecoder(doc);
      return workers ? workers.open(spec) : Promise.reject(new Error("no off-thread decoder"));
    },
    createVideo: () => doc.createElement("video"),
    capture: (video, width, height) => typeof globalThis.createImageBitmap === "function"
      ? globalThis.createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" })
      : Promise.reject(new Error("createImageBitmap unavailable")),
    setTimeout: (callback, ms) => Number(globalThis.setTimeout(callback, ms)),
    clearTimeout: handle => globalThis.clearTimeout(handle)
  };
}
