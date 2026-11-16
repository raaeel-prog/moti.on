"use strict";
// Banco de midia: downloads de midia para a pasta do Moti.on no perfil do usuario.
// MASTER_BUILD_SPEC §18.6 / skill integrating-asset-services ("Download security"):
// HTTPS only, allowlisted CDNs (also after redirects), byte limit, idle timeout,
// content signature check, SHA-256, write to a private temp file, then rename.
// The host derives the same path from provider + id + extension (stock-import.jsx).
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MEDIA_HOSTS = ["images.pexels.com", "videos.pexels.com", "cdn.pixabay.com", "pixabay.com", "images.unsplash.com", "cdn.freesound.org", "freesound.org"];
const PROVIDERS = ["pexels", "pixabay", "unsplash", "freesound"];
const EXTENSIONS = ["jpg", "png", "mp4", "mov", "mp3", "wav"];
const LIBRARY_DIR = ["Moti.on", "Banco de midia"];
const MAX_REDIRECTS = 3, IDLE_TIMEOUT_MS = 30000, HARD_MAX = 1024 * 1024 * 1024;

/** Same folder AE reports as Folder.userData. */
function defaultRoot() {
  if (process.platform === "win32") return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(os.homedir(), "Library", "Application Support");
}

function allowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && MEDIA_HOSTS.includes(url.hostname) ? url : null;
  } catch { return null; }
}

/** Does the first bytes' signature match the extension? Headers alone are never trusted. */
function signatureMatches(extension, head) {
  const ascii = (from, to) => head.slice(from, to).toString("latin1");
  switch (extension) {
    case "jpg": return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "png": return head.length >= 8 && head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "mp4": case "mov": return head.length >= 12 && ascii(4, 8) === "ftyp";
    case "mp3": return head.length >= 3 && (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0));
    case "wav": return head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    default: return false;
  }
}

function fail(code) { const error = new Error(code); error.code = code; return error; }

function validRequest(request) {
  return request && PROVIDERS.includes(request.provider) && typeof request.assetId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(request.assetId)
    && EXTENSIONS.includes(request.extension) && Number.isSafeInteger(request.maxBytes) && request.maxBytes > 0 && request.maxBytes <= HARD_MAX
    && allowedUrl(request.url) !== null;
}

exports.MEDIA_HOSTS = MEDIA_HOSTS;
exports.signatureMatches = signatureMatches;

/**
 * @param {{ root?: string, https?: { get: Function } }} [options] injectable for tests
 */
exports.createStockDownloader = function createStockDownloader(options = {}) {
  const https = options.https || require("https");
  const library = path.join(options.root || defaultRoot(), ...LIBRARY_DIR);

  function target(request) { return path.join(library, request.provider, `${request.assetId}.${request.extension}`); }

  /** A previous verified download is reused only if its sidecar checksum still matches. */
  function existing(file) {
    try {
      const sidecar = JSON.parse(fs.readFileSync(`${file}.chms-asset.json`, "utf8"));
      const data = fs.readFileSync(file);
      const sha256 = crypto.createHash("sha256").update(data).digest("hex");
      return sidecar && sidecar.sha256 === sha256 ? { bytes: data.length, sha256, reused: true } : null;
    } catch { return null; }
  }

  function fetchTo(url, request, temp, onProgress, state, redirects = 0) {
    return new Promise((resolve, reject) => {
      const call = https.get(url, { headers: { Accept: "*/*", "User-Agent": "Moti.on" } }, response => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const next = redirects < MAX_REDIRECTS ? allowedUrl(new URL(response.headers.location, url).toString()) : null;
          if (!next) { reject(fail("DOWNLOAD_REDIRECT_BLOCKED")); return; }
          fetchTo(next, request, temp, onProgress, state, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) { response.resume(); reject(fail(status === 404 || status === 410 ? "ASSET_REMOVED" : "DOWNLOAD_FAILED")); return; }
        const declared = Number(response.headers["content-length"] || 0);
        if (declared > request.maxBytes) { response.resume(); reject(fail("DOWNLOAD_TOO_LARGE")); return; }
        const hash = crypto.createHash("sha256"), out = fs.createWriteStream(temp, { flags: "wx", mode: 0o600 });
        let bytes = 0, head = Buffer.alloc(0), settled = false;
        const finish = error => {
          if (settled) return; settled = true; call.setTimeout(0);
          if (error) { response.destroy(); out.destroy(); reject(error); return; }
          out.end(() => resolve({ bytes, sha256: hash.digest("hex"), head }));
        };
        state.abort = () => finish(fail("DOWNLOAD_CANCELLED"));
        out.on("error", error => finish(fail(error && error.code === "ENOSPC" ? "DISK_FULL" : "DOWNLOAD_WRITE_FAILED")));
        response.on("data", chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > request.maxBytes) { finish(fail("DOWNLOAD_TOO_LARGE")); return; }
          if (head.length < 16) head = Buffer.concat([head, chunk]).slice(0, 16);
          hash.update(chunk); out.write(chunk);
          if (onProgress) onProgress({ bytes, total: declared || null });
        });
        response.on("error", () => finish(fail("DOWNLOAD_FAILED")));
        response.on("end", () => finish(null));
      });
      call.setTimeout(IDLE_TIMEOUT_MS, () => call.destroy(fail("DOWNLOAD_TIMEOUT")));
      call.on("error", error => reject(error && typeof error.code === "string" && error.code.startsWith("DOWNLOAD_") ? error : fail("NETWORK_UNAVAILABLE")));
      state.abort = () => { call.destroy(); reject(fail("DOWNLOAD_CANCELLED")); };
    });
  }

  /**
   * @param {{ provider: string, assetId: string, extension: string, url: string, maxBytes: number, item: object }} request
   * @param {(progress: { bytes: number, total: number | null }) => void} [onProgress]
   * @returns {{ promise: Promise<{ bytes: number, sha256: string, reused: boolean }>, cancel(): void }}
   */
  function download(request, onProgress) {
    const state = { abort: () => {}, cancelled: false };
    const promise = (async () => {
      if (!validRequest(request)) throw fail("DOWNLOAD_REQUEST_INVALID");
      const file = target(request);
      const reused = existing(file);
      if (reused) return reused;
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.part-${crypto.randomBytes(6).toString("hex")}`;
      try {
        if (state.cancelled) throw fail("DOWNLOAD_CANCELLED");
        const result = await fetchTo(allowedUrl(request.url).toString(), request, temp, onProgress, state);
        if (result.bytes < 16 || !signatureMatches(request.extension, result.head)) throw fail("DOWNLOAD_TYPE_MISMATCH");
        fs.renameSync(temp, file);
        const sidecar = { schemaVersion: 1, provider: request.provider, assetId: request.assetId, file: path.basename(file), bytes: result.bytes, sha256: result.sha256,
          downloadedAt: new Date().toISOString(), item: request.item ?? null };
        fs.writeFileSync(`${file}.chms-asset.json`, JSON.stringify(sidecar, null, 2) + "\n", { mode: 0o600 });
        return { bytes: result.bytes, sha256: result.sha256, reused: false };
      } finally { try { fs.rmSync(temp, { force: true }); } catch { /* Temp already moved or never created. */ } }
    })();
    return { promise, cancel() { state.cancelled = true; state.abort(); } };
  }

  return { library, target, download };
};
