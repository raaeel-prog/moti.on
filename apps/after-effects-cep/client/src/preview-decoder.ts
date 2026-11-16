/** Decodes rendered previews off the panel's main thread, the way Animation
 * Composer's batch player does with libvpx in workers: a small pool of Web
 * Workers demuxes each MP4 and decodes every frame with WebCodecs, scales it to
 * the card and hands the bitmaps back at full speed. The panel thread only
 * draws; the frame cache keeps only a few clips decoding at once, so each one
 * finishes in a fraction of a second instead of all of them trickling in.
 *
 * CEP 12 in After Effects 2026 is Chromium 99, which has WebCodecs in workers.
 * Anything missing (no Worker, no VideoDecoder, a codec it refuses) rejects
 * `open`, and the frame cache falls back to its <video> decoder. */
import type { BakeSpec, FrameStream } from "./preview-frames.js";


export interface WorkerDecoder {
  open(spec: BakeSpec): Promise<FrameStream>;
  dispose(): void;
}

interface Job { id: number; frames: ImageBitmap[]; waiting: ((frame: ImageBitmap | null) => void) | null; ended: boolean; error: Error | null; onHeader(header: { count: number; frameMs: number } | Error): void; }
type FromWorker =
  | { id: number; kind: "header"; count: number; frameMs: number }
  | { id: number; kind: "frame"; bitmap: ImageBitmap }
  | { id: number; kind: "done" }
  | { id: number; kind: "error"; message: string };

export interface Mp4Sample { offset: number; size: number; time: number; duration: number; key: boolean; }
export interface Mp4Track { codec: string; width: number; height: number; description: Uint8Array; timescale: number; samples: Mp4Sample[]; }

/** Reads the single video track of an MP4: codec, avcC and the sample table.
 * Self-contained (it runs inside the decode worker): it uses nothing outside itself. */
export function demuxMp4(buffer: ArrayBuffer): Mp4Track {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const find = (start: number, end: number, type: string): [number, number] | null => {
    let at = start;
    while (at + 8 <= end) {
      let size = view.getUint32(at), header = 8;
      if (size === 1) { size = Number(view.getBigUint64(at + 8)); header = 16; }
      if (size === 0) size = end - at;
      if (size < header) return null;
      const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
      if (name === type) return [at + header, at + size];
      at += size;
    }
    return null;
  };
  const path = (start: number, end: number, names: string[]): [number, number] => {
    let range: [number, number] | null = [start, end];
    for (const name of names) { range = range ? find(range[0], range[1], name) : null; if (!range) throw new Error(`mp4: no ${name}`); }
    return range!;
  };
  const moov = path(0, buffer.byteLength, ["moov"]);
  const trak = path(moov[0], moov[1], ["trak"]);
  const mdia = path(trak[0], trak[1], ["mdia"]);
  const mdhd = path(mdia[0], mdia[1], ["mdhd"]);
  const timescale = view.getUint8(mdhd[0]) === 1 ? view.getUint32(mdhd[0] + 20) : view.getUint32(mdhd[0] + 12);
  const stbl = path(mdia[0], mdia[1], ["minf", "stbl"]);
  const stsd = path(stbl[0], stbl[1], ["stsd"]);
  const entry = stsd[0] + 8; // version/flags + entry count
  const format = String.fromCharCode(bytes[entry + 4]!, bytes[entry + 5]!, bytes[entry + 6]!, bytes[entry + 7]!);
  if (format !== "avc1" && format !== "avc3") throw new Error(`mp4: unsupported ${format}`);
  const width = view.getUint16(entry + 32), height = view.getUint16(entry + 34);
  const avcC = find(entry + 86, entry + view.getUint32(entry), "avcC");
  if (!avcC) throw new Error("mp4: no avcC");
  const description = bytes.slice(avcC[0], avcC[1]);
  const hex = (value: number): string => value.toString(16).padStart(2, "0");
  const codec = `${format}.${hex(description[1]!)}${hex(description[2]!)}${hex(description[3]!)}`;

  const stts = path(stbl[0], stbl[1], ["stts"]), durations: number[] = [];
  for (let i = 0, n = view.getUint32(stts[0] + 4); i < n; i++) {
    const count = view.getUint32(stts[0] + 8 + i * 8), delta = view.getUint32(stts[0] + 12 + i * 8);
    for (let k = 0; k < count; k++) durations.push(delta);
  }
  const stsz = path(stbl[0], stbl[1], ["stsz"]), fixed = view.getUint32(stsz[0] + 4), total = view.getUint32(stsz[0] + 8);
  const sizes: number[] = [];
  for (let i = 0; i < total; i++) sizes.push(fixed || view.getUint32(stsz[0] + 12 + i * 4));
  const stsc = path(stbl[0], stbl[1], ["stsc"]), runs: [number, number][] = [];
  for (let i = 0, n = view.getUint32(stsc[0] + 4); i < n; i++) runs.push([view.getUint32(stsc[0] + 8 + i * 12), view.getUint32(stsc[0] + 12 + i * 12)]);
  const stco = find(stbl[0], stbl[1], "stco"), co64 = stco ? null : find(stbl[0], stbl[1], "co64");
  const chunks: number[] = [];
  if (stco) for (let i = 0, n = view.getUint32(stco[0] + 4); i < n; i++) chunks.push(view.getUint32(stco[0] + 8 + i * 4));
  else if (co64) for (let i = 0, n = view.getUint32(co64[0] + 4); i < n; i++) chunks.push(Number(view.getBigUint64(co64[0] + 8 + i * 8)));
  else throw new Error("mp4: no chunk offsets");
  const stss = find(stbl[0], stbl[1], "stss"), sync = new Set<number>();
  if (stss) for (let i = 0, n = view.getUint32(stss[0] + 4); i < n; i++) sync.add(view.getUint32(stss[0] + 8 + i * 4));

  const samples: Mp4Sample[] = [];
  let sample = 0, time = 0;
  for (let c = 0; c < chunks.length && sample < total; c++) {
    let perChunk = 0;
    for (const [first, count] of runs) if (c + 1 >= first) perChunk = count;
    let offset = chunks[c]!;
    for (let k = 0; k < perChunk && sample < total; k++) {
      const size = sizes[sample]!, duration = durations[sample] ?? durations[durations.length - 1] ?? 0;
      samples.push({ offset, size, time, duration, key: !stss || sync.has(sample + 1) });
      offset += size; time += duration; sample++;
    }
  }
  return { codec, width, height, description, timescale, samples };
}


/** Worker source: self-contained, serialized into a Blob. It must not reference anything outside itself. */
function previewWorkerMain(demux: (buffer: ArrayBuffer) => Mp4Track): void {
  interface DecodeRequest { id: number; bytes: ArrayBuffer; width: number; height: number; fps: number; }
  const scope = globalThis as unknown as { postMessage(message: unknown, transfer?: Transferable[]): void; onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null };

  async function decode(request: DecodeRequest): Promise<void> {
    const { id, bytes, width, height, fps } = request;
    const track = demux(bytes);
    const config = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, description: track.description };
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) throw new Error(`codec ${track.codec} unsupported`);
    const last = track.samples[track.samples.length - 1];
    const seconds = last ? (last.time + last.duration) / track.timescale : 0;
    const count = Math.max(1, Math.round(seconds * fps));
    scope.postMessage({ id, kind: "header", count, frameMs: 1000 / fps });
    // Keep one decoded frame per output slot, so a 30 fps source feeds a 15 fps tile with every other frame.
    let nextSlot = 0, chain = Promise.resolve(), failure: Error | null = null;
    const decoder = new VideoDecoder({
      output(frame) {
        const slot = Math.floor(((frame.timestamp / 1e6) * fps) + 1e-6);
        if (slot < nextSlot || nextSlot >= count) { frame.close(); return; }
        nextSlot = slot + 1;
        chain = chain.then(() => createImageBitmap(frame, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" }))
          .then(bitmap => { scope.postMessage({ id, kind: "frame", bitmap }, [bitmap]); })
          .finally(() => frame.close());
      },
      error(error) { failure = error instanceof Error ? error : new Error(String(error)); }
    });
    decoder.configure(config);
    const source = new Uint8Array(bytes);
    for (const s of track.samples) {
      decoder.decode(new EncodedVideoChunk({ type: s.key ? "key" : "delta", timestamp: Math.round(s.time / track.timescale * 1e6), duration: Math.round(s.duration / track.timescale * 1e6), data: source.subarray(s.offset, s.offset + s.size) }));
    }
    await decoder.flush();
    decoder.close();
    await chain;
    if (failure) throw failure;
    scope.postMessage({ id, kind: "done" });
  }

  scope.onmessage = event => {
    decode(event.data).catch(error => scope.postMessage({ id: event.data.id, kind: "error", message: String(error instanceof Error ? error.message : error) }));
  };
}

/** Bytes of a preview: `fetch`, or Node's fs when CEP refuses file:// fetches. */
async function loadBytes(doc: Document, src: string): Promise<ArrayBuffer> {
  const url = new URL(src, doc.baseURI);
  try {
    const response = await fetch(url.href);
    if (response.ok || url.protocol === "file:") return await response.arrayBuffer();
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const node = (doc.defaultView as unknown as { cep_node?: { require(name: string): unknown } } | null)?.cep_node;
    if (!node || url.protocol !== "file:") throw error;
    const fs = node.require("fs") as { readFileSync(path: string): Uint8Array };
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    const data = fs.readFileSync(path);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
}

/** A pool of `size` decode workers; null when this runtime cannot decode off-thread. */
export function createWorkerDecoder(doc: Document, size = 2): WorkerDecoder | null {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view || typeof view.Worker !== "function" || typeof (view as unknown as { VideoDecoder?: unknown }).VideoDecoder !== "function" || typeof view.Blob !== "function" || typeof view.URL?.createObjectURL !== "function") return null;
  const source = `(${previewWorkerMain.toString()})(${demuxMp4.toString()});`;
  const url = view.URL.createObjectURL(new view.Blob([source], { type: "text/javascript" }));
  const workers: { worker: Worker; busy: number }[] = [];
  const jobs = new Map<number, Job>();
  let nextId = 1, broken = false;

  function deliver(job: Job, frame: ImageBitmap | null): void {
    if (job.waiting) { const waiting = job.waiting; job.waiting = null; waiting(frame); }
    else if (frame) job.frames.push(frame);
  }
  function receive(message: FromWorker): void {
    const job = jobs.get(message.id);
    if (!job) { if (message.kind === "frame") message.bitmap.close(); return; }
    if (message.kind === "header") job.onHeader({ count: message.count, frameMs: message.frameMs });
    else if (message.kind === "frame") deliver(job, message.bitmap);
    else {
      job.ended = true;
      if (message.kind === "error") { job.error = new Error(message.message); job.onHeader(job.error); }
      deliver(job, null);
    }
  }
  function pick(): { worker: Worker; busy: number } {
    while (workers.length < size) {
      const worker = new view!.Worker(url);
      worker.onmessage = event => receive(event.data as FromWorker);
      worker.onerror = () => { broken = true; for (const job of jobs.values()) { job.ended = true; job.error = new Error("preview worker failed"); job.onHeader(job.error); deliver(job, null); } };
      workers.push({ worker, busy: 0 });
    }
    return workers.reduce((least, item) => item.busy < least.busy ? item : least);
  }

  return {
    async open(spec) {
      if (broken) throw new Error("preview worker unavailable");
      const bytes = await loadBytes(doc, spec.src);
      const slot = pick(), id = nextId++;
      slot.busy++;
      return await new Promise<FrameStream>((resolve, reject) => {
        let opened = false;
        const finish = (): void => { if (jobs.delete(id)) slot.busy--; };
        const job: Job = { id, frames: [], waiting: null, ended: false, error: null, onHeader(header) {
          if (opened) return;
          opened = true;
          if (header instanceof Error) { finish(); reject(header); return; }
          resolve({
            count: header.count, frameMs: header.frameMs,
            next() {
              const ready = job.frames.shift();
              if (ready) return Promise.resolve(ready);
              if (job.ended) { finish(); return job.error ? Promise.reject(job.error) : Promise.resolve(null); }
              return new Promise<ImageBitmap | null>(done => { job.waiting = frame => { if (!frame) finish(); done(frame); }; });
            },
            cancel() { for (const frame of job.frames.splice(0)) frame.close(); finish(); }
          });
        } };
        jobs.set(id, job);
        slot.worker.postMessage({ id, bytes, width: spec.width, height: spec.height, fps: spec.fps }, [bytes]);
      });
    },
    dispose() {
      for (const { worker } of workers) worker.terminate();
      workers.length = 0;
      for (const job of jobs.values()) for (const frame of job.frames) frame.close();
      jobs.clear();
      view.URL.revokeObjectURL(url);
    }
  };
}
