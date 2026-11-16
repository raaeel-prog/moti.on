// Stock media providers behind the Moti.on BFF (MASTER_BUILD_SPEC §18).
// Pure module: no Deno or Node API, so the Edge Function and the Node tests share it.
// Every provider response is untrusted: each field is checked before it reaches the panel,
// and every media URL must be HTTPS on a host listed in MEDIA_HOSTS.

export type StockProviderId = "pexels" | "pixabay" | "unsplash" | "freesound";
export type StockMediaType = "video" | "image" | "audio";
export type StockOrientation = "landscape" | "portrait" | "square";

export interface StockLicense {
  code: string; label: string; url: string;
  commercialUse: boolean; attributionRequired: boolean;
}
export interface StockItem {
  id: string; provider: StockProviderId; providerAssetId: string; type: StockMediaType;
  title: string; thumbnailUrl: string; previewUrl: string; previewMimeType: string;
  width?: number; height?: number; durationMs?: number;
  author: { name: string; url?: string };
  sourceUrl: string; license: StockLicense; attributionText: string;
}
export interface StockRendition { url: string; mimeType: string; extension: "jpg" | "png" | "mp4" | "mov" | "mp3" | "wav"; maxBytes: number }
export interface StockSearchRequest { type: StockMediaType; query: string; page: number; perPage: number; orientation?: StockOrientation }
export interface StockSearchPage { items: StockItem[]; page: number; nextPage: number | null; total: number }
/** What the BFF asks the network for. Secrets live only in headers built from env. */
export interface ProviderCall { url: string; headers: Record<string, string> }
export interface StockProvider {
  id: StockProviderId; name: string; types: readonly StockMediaType[];
  searchCall(request: StockSearchRequest, key: string): ProviderCall;
  parseSearch(body: unknown, request: StockSearchRequest): StockSearchPage;
  detailCall(type: StockMediaType, assetId: string, key: string): ProviderCall;
  parseDetail(body: unknown, type: StockMediaType): { item: StockItem; rendition: StockRendition } | null;
  /** Unsplash requires a tracking hit when a photo is downloaded or imported. */
  trackCall?(body: unknown, key: string): ProviderCall | null;
}

export const MEDIA_HOSTS: readonly string[] = [
  "images.pexels.com", "videos.pexels.com", "cdn.pixabay.com", "pixabay.com",
  "images.unsplash.com", "cdn.freesound.org", "freesound.org"
];
const SOURCE_HOSTS = ["www.pexels.com", "pexels.com", "pixabay.com", "unsplash.com", "freesound.org"];
export const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MB = 1024 * 1024;
const LIMITS: Record<StockMediaType, number> = { image: 80 * MB, video: 700 * MB, audio: 60 * MB };
const UTM = "utm_source=moti_on&utm_medium=referral";

// ---------- defensive readers ----------
type Json = Record<string, unknown>;
const obj = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
function text(value: unknown, max = 200): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e9 ? Math.round(value) : undefined;
}
function id(value: unknown): string | null { const v = text(value, 64); return ASSET_ID.test(v) ? v : null; }
/** Media URLs: HTTPS on an allowlisted CDN, no credentials, no odd ports. */
export function mediaUrl(value: unknown): string | null { return safeUrl(value, MEDIA_HOSTS); }
function sourceUrl(value: unknown): string | null { return safeUrl(value, SOURCE_HOSTS); }
function safeUrl(value: unknown, hosts: readonly string[]): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}
function withUtm(url: string | null): string | undefined {
  if (!url) return undefined;
  return url + (url.includes("?") ? "&" : "?") + UTM;
}
function compact<T extends Json>(value: T): T {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}
function item(fields: Omit<StockItem, "id" | "attributionText">, attribution: string): StockItem {
  return compact({ id: `${fields.provider}:${fields.providerAssetId}`, ...fields, author: compact({ ...fields.author }), attributionText: attribution.slice(0, 400) });
}
function page(items: StockItem[], request: StockSearchRequest, total: unknown, hasMore: boolean): StockSearchPage {
  const count = int(total) ?? 0;
  return { items, page: request.page, nextPage: hasMore && request.page < 100 ? request.page + 1 : null, total: Math.min(count, 1_000_000) };
}
const query = (params: Record<string, string | number | undefined>): string =>
  Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

// ---------- Pexels ----------
const PEXELS_LICENSE: StockLicense = { code: "pexels", label: "Licença Pexels", url: "https://www.pexels.com/license/", commercialUse: true, attributionRequired: false };
function pexelsPhoto(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw) || !obj(raw.src)) return null;
  const assetId = id(raw.id), thumb = mediaUrl(raw.src.medium), full = mediaUrl(raw.src.original) ?? mediaUrl(raw.src.large2x);
  if (!assetId || !thumb || !full) return null;
  const author = text(raw.photographer, 120) || "Pexels";
  const result = item({ provider: "pexels", providerAssetId: assetId, type: "image", title: text(raw.alt, 120) || `Pexels ${assetId}`,
    thumbnailUrl: thumb, previewUrl: mediaUrl(raw.src.large) ?? thumb, previewMimeType: "image/jpeg", width: int(raw.width), height: int(raw.height),
    author: { name: author, url: withUtm(sourceUrl(raw.photographer_url)) }, sourceUrl: withUtm(sourceUrl(raw.url)) ?? "https://www.pexels.com/", license: PEXELS_LICENSE },
    `Foto de ${author} no Pexels`);
  const extension = /\.png(\?|$)/i.test(full) ? "png" : "jpg";
  return { item: result, rendition: { url: full, mimeType: extension === "png" ? "image/png" : "image/jpeg", extension, maxBytes: LIMITS.image } };
}
/** Prefer 1080p-class HD (what an editor expects), then the largest file under 4K, then any MP4. */
function pexelsFile(files: unknown[]): { url: string; width?: number; height?: number } | null {
  const mp4 = files.filter(obj).map(f => ({ url: mediaUrl(f.link), type: text(f.file_type), width: int(f.width), height: int(f.height) }))
    .filter((f): f is { url: string; type: string; width: number | undefined; height: number | undefined } => Boolean(f.url) && f.type === "video/mp4");
  const edge = (f: { width?: number | undefined; height?: number | undefined }): number => Math.max(f.width ?? 0, f.height ?? 0);
  const ranked = [...mp4].sort((a, b) => edge(b) - edge(a));
  const choice = ranked.find(f => edge(f) <= 1920 && edge(f) >= 1280) ?? ranked.find(f => edge(f) <= 3840) ?? ranked[0];
  return choice ? compact({ url: choice.url, width: choice.width, height: choice.height }) : null;
}
function pexelsVideo(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw)) return null;
  const files = list(raw.video_files), assetId = id(raw.id), thumb = mediaUrl(raw.image), file = pexelsFile(files);
  if (!assetId || !thumb || !file) return null;
  const small = [...files].filter(obj).map(f => ({ url: mediaUrl(f.link), w: int(f.width) ?? 0, type: text(f.file_type) }))
    .filter(f => f.url && f.type === "video/mp4").sort((a, b) => a.w - b.w)[0]?.url ?? file.url;
  const user = obj(raw.user) ? raw.user : {}, author = text(user.name, 120) || "Pexels", seconds = int(raw.duration);
  const result = item({ provider: "pexels", providerAssetId: assetId, type: "video", title: `Vídeo Pexels ${assetId}`,
    thumbnailUrl: thumb, previewUrl: small, previewMimeType: "video/mp4", width: file.width ?? int(raw.width), height: file.height ?? int(raw.height),
    durationMs: seconds ? seconds * 1000 : undefined, author: { name: author, url: withUtm(sourceUrl(user.url)) },
    sourceUrl: withUtm(sourceUrl(raw.url)) ?? "https://www.pexels.com/", license: PEXELS_LICENSE }, `Vídeo de ${author} no Pexels`);
  return { item: result, rendition: { url: file.url, mimeType: "video/mp4", extension: "mp4", maxBytes: LIMITS.video } };
}
const pexels: StockProvider = {
  id: "pexels", name: "Pexels", types: ["video", "image"],
  searchCall(r, key) {
    const base = r.type === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
    return { url: `${base}?${query({ query: r.query, page: r.page, per_page: r.perPage, orientation: r.orientation })}`, headers: { Authorization: key } };
  },
  parseSearch(body, r) {
    if (!obj(body)) throw new Error("PROVIDER_RESPONSE_INVALID");
    const raw = list(r.type === "video" ? body.videos : body.photos);
    const items = raw.map(entry => (r.type === "video" ? pexelsVideo(entry) : pexelsPhoto(entry))?.item).filter((x): x is StockItem => Boolean(x));
    return page(items, r, body.total_results, typeof body.next_page === "string");
  },
  detailCall(type, assetId, key) {
    return { url: type === "video" ? `https://api.pexels.com/videos/videos/${assetId}` : `https://api.pexels.com/v1/photos/${assetId}`, headers: { Authorization: key } };
  },
  parseDetail(body, type) { return type === "video" ? pexelsVideo(body) : pexelsPhoto(body); }
};

// ---------- Pixabay ----------
const PIXABAY_LICENSE: StockLicense = { code: "pixabay", label: "Licença de Conteúdo Pixabay", url: "https://pixabay.com/service/license-summary/", commercialUse: true, attributionRequired: false };
function pixabayAuthor(raw: Json): { name: string; url?: string } {
  const name = text(raw.user, 120) || "Pixabay", user = id(raw.user_id);
  return compact({ name, url: user && /^[A-Za-z0-9_-]{1,60}$/.test(name) ? withUtm(`https://pixabay.com/users/${name}-${user}/`) : undefined });
}
function pixabayTitle(raw: Json, fallback: string): string {
  const tags = text(raw.tags, 120);
  return tags ? tags.charAt(0).toUpperCase() + tags.slice(1) : fallback;
}
function pixabayImage(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw)) return null;
  const assetId = id(raw.id), thumb = mediaUrl(raw.webformatURL) ?? mediaUrl(raw.previewURL), full = mediaUrl(raw.largeImageURL);
  if (!assetId || !thumb || !full) return null;
  const author = pixabayAuthor(raw);
  const result = item({ provider: "pixabay", providerAssetId: assetId, type: "image", title: pixabayTitle(raw, `Pixabay ${assetId}`),
    thumbnailUrl: thumb, previewUrl: thumb, previewMimeType: "image/jpeg", width: int(raw.imageWidth), height: int(raw.imageHeight),
    author, sourceUrl: withUtm(sourceUrl(raw.pageURL)) ?? "https://pixabay.com/", license: PIXABAY_LICENSE }, `Imagem de ${author.name} no Pixabay`);
  const extension = /\.png(\?|$)/i.test(full) ? "png" : "jpg";
  return { item: result, rendition: { url: full, mimeType: extension === "png" ? "image/png" : "image/jpeg", extension, maxBytes: LIMITS.image } };
}
function pixabayVideo(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw) || !obj(raw.videos)) return null;
  const videos = raw.videos, assetId = id(raw.id);
  const pick = (name: string): Json | null => obj(videos[name]) && mediaUrl(videos[name].url) ? videos[name] as Json : null;
  const best = pick("large") ?? pick("medium") ?? pick("small"), small = pick("tiny") ?? pick("small") ?? best;
  const thumb = mediaUrl(best?.thumbnail) ?? mediaUrl(small?.thumbnail);
  if (!assetId || !best || !small || !thumb) return null;
  const author = pixabayAuthor(raw), seconds = int(raw.duration);
  const result = item({ provider: "pixabay", providerAssetId: assetId, type: "video", title: pixabayTitle(raw, `Vídeo Pixabay ${assetId}`),
    thumbnailUrl: thumb, previewUrl: mediaUrl(small.url)!, previewMimeType: "video/mp4", width: int(best.width), height: int(best.height),
    durationMs: seconds ? seconds * 1000 : undefined, author, sourceUrl: withUtm(sourceUrl(raw.pageURL)) ?? "https://pixabay.com/", license: PIXABAY_LICENSE },
    `Vídeo de ${author.name} no Pixabay`);
  return { item: result, rendition: { url: mediaUrl(best.url)!, mimeType: "video/mp4", extension: "mp4", maxBytes: LIMITS.video } };
}
const pixabayOrientation = (o?: StockOrientation): string | undefined => o === "landscape" ? "horizontal" : o === "portrait" ? "vertical" : undefined;
const pixabay: StockProvider = {
  id: "pixabay", name: "Pixabay", types: ["video", "image"],
  searchCall(r, key) {
    const base = r.type === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/";
    const params = { key, q: r.query, page: r.page, per_page: Math.max(3, r.perPage), safesearch: "true",
      ...(r.type === "image" ? { image_type: "photo", orientation: pixabayOrientation(r.orientation) } : {}) };
    return { url: `${base}?${query(params)}`, headers: {} };
  },
  parseSearch(body, r) {
    if (!obj(body)) throw new Error("PROVIDER_RESPONSE_INVALID");
    const items = list(body.hits).map(entry => (r.type === "video" ? pixabayVideo(entry) : pixabayImage(entry))?.item).filter((x): x is StockItem => Boolean(x));
    const reachable = int(body.totalHits) ?? 0;
    return page(items, r, body.totalHits, r.page * r.perPage < reachable);
  },
  detailCall(type, assetId, key) {
    return { url: `${type === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/"}?${query({ key, id: assetId })}`, headers: {} };
  },
  parseDetail(body, type) {
    const first = obj(body) ? list(body.hits)[0] : undefined;
    return type === "video" ? pixabayVideo(first) : pixabayImage(first);
  }
};

// ---------- Unsplash ----------
const UNSPLASH_LICENSE: StockLicense = { code: "unsplash", label: "Licença Unsplash", url: "https://unsplash.com/license", commercialUse: true, attributionRequired: true };
function unsplashPhoto(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw) || !obj(raw.urls) || !obj(raw.user)) return null;
  const assetId = id(raw.id), thumb = mediaUrl(raw.urls.small), full = mediaUrl(raw.urls.full);
  if (!assetId || !thumb || !full) return null;
  const links = obj(raw.user.links) ? raw.user.links : {}, author = text(raw.user.name, 120) || "Unsplash";
  const page = obj(raw.links) ? withUtm(sourceUrl(raw.links.html)) : undefined;
  const result = item({ provider: "unsplash", providerAssetId: assetId, type: "image", title: text(raw.description ?? raw.alt_description, 120) || `Unsplash ${assetId}`,
    thumbnailUrl: thumb, previewUrl: mediaUrl(raw.urls.regular) ?? thumb, previewMimeType: "image/jpeg", width: int(raw.width), height: int(raw.height),
    author: { name: author, url: withUtm(sourceUrl(links.html)) }, sourceUrl: page ?? `https://unsplash.com/?${UTM}`, license: UNSPLASH_LICENSE },
    `Foto de ${author} no Unsplash`);
  return { item: result, rendition: { url: full, mimeType: "image/jpeg", extension: "jpg", maxBytes: LIMITS.image } };
}
const unsplashHeaders = (key: string): Record<string, string> => ({ Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });
const unsplash: StockProvider = {
  id: "unsplash", name: "Unsplash", types: ["image"],
  searchCall(r, key) {
    const orientation = r.orientation === "square" ? "squarish" : r.orientation;
    return { url: `https://api.unsplash.com/search/photos?${query({ query: r.query, page: r.page, per_page: Math.min(30, r.perPage), orientation, content_filter: "high" })}`, headers: unsplashHeaders(key) };
  },
  parseSearch(body, r) {
    if (!obj(body)) throw new Error("PROVIDER_RESPONSE_INVALID");
    const items = list(body.results).map(entry => unsplashPhoto(entry)?.item).filter((x): x is StockItem => Boolean(x));
    return page(items, r, body.total, r.page < (int(body.total_pages) ?? 0));
  },
  detailCall(_type, assetId, key) { return { url: `https://api.unsplash.com/photos/${assetId}`, headers: unsplashHeaders(key) }; },
  parseDetail(body) { return unsplashPhoto(body); },
  trackCall(body, key) {
    const location = obj(body) && obj(body.links) && typeof body.links.download_location === "string" ? body.links.download_location : "";
    try { const url = new URL(location); return url.protocol === "https:" && url.hostname === "api.unsplash.com" && !url.port ? { url: url.toString(), headers: unsplashHeaders(key) } : null; }
    catch { return null; }
  }
};

// ---------- Freesound ----------
// The license belongs to each sound. Only CC0 and CC BY are offered: both allow commercial use.
// CC BY-NC and Sampling+ are dropped here, not merely labelled (ADR 0008).
function freesoundLicense(value: unknown): StockLicense | null {
  const url = typeof value === "string" ? value.toLowerCase() : "";
  const version = /\/(\d\.\d)\/?$/.exec(url)?.[1] ?? "4.0";
  if (/creativecommons\.org\/publicdomain\/zero\//.test(url)) return { code: "cc0", label: "CC0 (domínio público)", url: "https://creativecommons.org/publicdomain/zero/1.0/", commercialUse: true, attributionRequired: false };
  if (/creativecommons\.org\/licenses\/by\/\d/.test(url)) return { code: "cc-by", label: `CC BY ${version}`, url: `https://creativecommons.org/licenses/by/${version}/`, commercialUse: true, attributionRequired: true };
  return null;
}
const FREESOUND_FIELDS = "id,name,username,license,previews,duration,url,images";
function freesoundSound(raw: unknown): { item: StockItem; rendition: StockRendition } | null {
  if (!obj(raw) || !obj(raw.previews)) return null;
  const assetId = id(raw.id), license = freesoundLicense(raw.license), preview = mediaUrl(raw.previews["preview-hq-mp3"]);
  const images = obj(raw.images) ? raw.images : {}, wave = mediaUrl(images.waveform_m) ?? mediaUrl(images.spectral_m);
  const seconds = typeof raw.duration === "number" && Number.isFinite(raw.duration) && raw.duration > 0 ? raw.duration : 0;
  if (!assetId || !license || !preview || !wave || seconds > 900) return null;
  const author = text(raw.username, 120) || "Freesound", title = text(raw.name, 120) || `Freesound ${assetId}`;
  const result = item({ provider: "freesound", providerAssetId: assetId, type: "audio", title, thumbnailUrl: wave, previewUrl: preview, previewMimeType: "audio/mpeg",
    durationMs: seconds ? Math.round(seconds * 1000) : undefined, author: { name: author, url: `https://freesound.org/people/${encodeURIComponent(author)}/` },
    sourceUrl: sourceUrl(raw.url) ?? `https://freesound.org/s/${assetId}/`, license },
    `"${title}" de ${author} (freesound.org/s/${assetId}) — ${license.label}`);
  return { item: result, rendition: { url: preview, mimeType: "audio/mpeg", extension: "mp3", maxBytes: LIMITS.audio } };
}
const freesound: StockProvider = {
  id: "freesound", name: "Freesound", types: ["audio"],
  searchCall(r, key) {
    return { url: `https://freesound.org/apiv2/search/text/?${query({ query: r.query, page: r.page, page_size: r.perPage, fields: FREESOUND_FIELDS })}`, headers: { Authorization: `Token ${key}` } };
  },
  parseSearch(body, r) {
    if (!obj(body)) throw new Error("PROVIDER_RESPONSE_INVALID");
    const items = list(body.results).map(entry => freesoundSound(entry)?.item).filter((x): x is StockItem => Boolean(x));
    return page(items, r, body.count, typeof body.next === "string");
  },
  detailCall(_type, assetId, key) { return { url: `https://freesound.org/apiv2/sounds/${assetId}/?${query({ fields: FREESOUND_FIELDS })}`, headers: { Authorization: `Token ${key}` } }; },
  parseDetail(body) { return freesoundSound(body); }
};

export const STOCK_PROVIDERS: Readonly<Record<StockProviderId, StockProvider>> = { pexels, pixabay, unsplash, freesound };
/** Secret name per provider, set by `services/supabase/scripts/assets-setup.mjs`. */
export const PROVIDER_SECRETS: Readonly<Record<StockProviderId, string>> = {
  pexels: "PEXELS_API_KEY", pixabay: "PIXABAY_API_KEY", unsplash: "UNSPLASH_ACCESS_KEY", freesound: "FREESOUND_API_KEY"
};
export function isProviderId(value: unknown): value is StockProviderId { return typeof value === "string" && Object.prototype.hasOwnProperty.call(STOCK_PROVIDERS, value); }
