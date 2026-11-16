/**
 * Banco de mídia: cliente do BFF `motion-assets` (MASTER_BUILD_SPEC §18).
 * Host-independent: the transport is injected (CEP account client today, UXP later).
 * Every response is validated here, so the panel only renders checked values.
 */
import { STOCK_EXTENSIONS, STOCK_PROVIDER_IDS, type StockExtension, type StockProviderId } from "@motion/contracts";

export type StockMediaType = "video" | "image" | "audio";
export type StockOrientation = "landscape" | "portrait" | "square";
export interface StockLicense { code: string; label: string; url: string; commercialUse: boolean; attributionRequired: boolean }
export interface StockItem {
  id: string; provider: StockProviderId; providerAssetId: string; type: StockMediaType; title: string;
  thumbnailUrl: string; previewUrl: string; previewMimeType: string;
  width?: number; height?: number; durationMs?: number;
  author: { name: string; url?: string }; sourceUrl: string; license: StockLicense; attributionText: string;
}
export interface StockPage { provider: StockProviderId; type: StockMediaType; items: StockItem[]; page: number; nextPage: number | null; total: number }
export interface StockProviderInfo { id: StockProviderId; name: string; types: StockMediaType[] }
export interface StockRendition { url: string; mimeType: string; extension: StockExtension; maxBytes: number }
export interface StockDownloadTicket { item: StockItem; rendition: StockRendition }
export interface StockSearchQuery { provider: StockProviderId; type: StockMediaType; query: string; page?: number; orientation?: StockOrientation }
export interface StockClient {
  providers(): Promise<StockProviderInfo[]>;
  search(query: StockSearchQuery): Promise<StockPage>;
  /** Asks the BFF for the downloadable rendition (and registers the download where the provider requires it). */
  prepareDownload(item: Pick<StockItem, "provider" | "type" | "providerAssetId">): Promise<StockDownloadTicket>;
}
export class StockError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }

/** Must match services/supabase/functions/_shared/stock-providers.ts and account/stock-download.cjs. */
export const STOCK_MEDIA_HOSTS: readonly string[] = [
  "images.pexels.com", "videos.pexels.com", "cdn.pixabay.com", "pixabay.com", "images.unsplash.com", "cdn.freesound.org", "freesound.org"
];
const SOURCE_HOSTS = ["www.pexels.com", "pexels.com", "pixabay.com", "unsplash.com", "freesound.org", "creativecommons.org"];
const TYPES: readonly StockMediaType[] = ["video", "image", "audio"];
const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Json = Record<string, unknown>;
const obj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused.
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function https(value: unknown, hosts: readonly string[]): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.includes(url.hostname); }
  catch { return false; }
}
const provider = (v: unknown): v is StockProviderId => (STOCK_PROVIDER_IDS as readonly unknown[]).includes(v);
const mediaType = (v: unknown): v is StockMediaType => (TYPES as readonly unknown[]).includes(v);

function license(v: unknown): StockLicense | null {
  if (!obj(v) || !str(v["code"], 40) || !str(v["label"], 80) || !https(v["url"], SOURCE_HOSTS) || typeof v["commercialUse"] !== "boolean" || typeof v["attributionRequired"] !== "boolean") return null;
  return { code: v["code"], label: v["label"], url: v["url"], commercialUse: v["commercialUse"], attributionRequired: v["attributionRequired"] };
}
/** Returns a fresh, typed copy, or null if any field is outside the contract. */
export function parseStockItem(v: unknown): StockItem | null {
  if (!obj(v) || !provider(v["provider"]) || !mediaType(v["type"]) || typeof v["providerAssetId"] !== "string" || !ASSET_ID.test(v["providerAssetId"])) return null;
  if (v["id"] !== `${v["provider"]}:${v["providerAssetId"]}` || !str(v["title"], 120) || !str(v["attributionText"], 400) || !str(v["previewMimeType"], 40)) return null;
  if (!https(v["thumbnailUrl"], STOCK_MEDIA_HOSTS) || !https(v["previewUrl"], STOCK_MEDIA_HOSTS) || !https(v["sourceUrl"], SOURCE_HOSTS)) return null;
  const author = v["author"], terms = license(v["license"]);
  if (!obj(author) || !str(author["name"], 120) || (author["url"] !== undefined && !https(author["url"], SOURCE_HOSTS)) || !terms) return null;
  for (const key of ["width", "height", "durationMs"]) if (v[key] !== undefined && !count(v[key])) return null;
  const item: StockItem = { id: v["id"] as string, provider: v["provider"], providerAssetId: v["providerAssetId"], type: v["type"], title: v["title"],
    thumbnailUrl: v["thumbnailUrl"], previewUrl: v["previewUrl"], previewMimeType: v["previewMimeType"],
    author: author["url"] === undefined ? { name: author["name"] } : { name: author["name"], url: author["url"] as string },
    sourceUrl: v["sourceUrl"], license: terms, attributionText: v["attributionText"] };
  if (v["width"] !== undefined) item.width = v["width"] as number;
  if (v["height"] !== undefined) item.height = v["height"] as number;
  if (v["durationMs"] !== undefined) item.durationMs = v["durationMs"] as number;
  return item;
}

export function parseStockPage(v: unknown): StockPage {
  if (!obj(v) || !provider(v["provider"]) || !mediaType(v["type"]) || !Array.isArray(v["items"]) || v["items"].length > 200 || !count(v["page"]) || !count(v["total"])
    || !(v["nextPage"] === null || count(v["nextPage"]))) throw new StockError("RESPONSE_INVALID");
  // A single malformed entry is dropped, not allowed to blank the whole page.
  const items = v["items"].map(parseStockItem).filter((item): item is StockItem => item !== null && item.provider === v["provider"] && item.type === v["type"]);
  return { provider: v["provider"], type: v["type"], items, page: v["page"], nextPage: v["nextPage"] as number | null, total: v["total"] };
}

export function parseStockTicket(v: unknown): StockDownloadTicket {
  const item = obj(v) ? parseStockItem(v["item"]) : null, r = obj(v) ? v["rendition"] : null;
  if (!item || !obj(r) || !https(r["url"], STOCK_MEDIA_HOSTS) || !str(r["mimeType"], 40) || !(STOCK_EXTENSIONS as readonly unknown[]).includes(r["extension"])
    || !count(r["maxBytes"]) || (r["maxBytes"] as number) < 1) throw new StockError("RESPONSE_INVALID");
  return { item, rendition: { url: r["url"], mimeType: r["mimeType"], extension: r["extension"] as StockExtension, maxBytes: r["maxBytes"] as number } };
}

function parseProviders(v: unknown): StockProviderInfo[] {
  if (!obj(v) || !Array.isArray(v["providers"])) throw new StockError("RESPONSE_INVALID");
  return v["providers"].flatMap(p => obj(p) && provider(p["id"]) && str(p["name"], 40) && Array.isArray(p["types"]) && p["types"].every(mediaType)
    ? [{ id: p["id"], name: p["name"], types: [...(p["types"] as StockMediaType[])] }] : []);
}

export function createStockClient(call: (body: Record<string, unknown>) => Promise<unknown>): StockClient {
  async function send(body: Record<string, unknown>): Promise<unknown> {
    try { return await call(body); }
    catch (error) { throw new StockError(error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message) ? error.message : "NETWORK_UNAVAILABLE"); }
  }
  return {
    async providers() { return parseProviders(await send({ action: "assets.providers" })); },
    async search(query) {
      const body: Record<string, unknown> = { action: "assets.search", provider: query.provider, type: query.type, query: query.query.trim().slice(0, 100), page: query.page ?? 1 };
      if (query.orientation) body["orientation"] = query.orientation;
      return parseStockPage(await send(body));
    },
    async prepareDownload(item) {
      return parseStockTicket(await send({ action: "assets.download", provider: item.provider, type: item.type, assetId: item.providerAssetId }));
    }
  };
}

/** Plain-language messages for the stable codes (pt-BR / en-US). */
export function stockErrorMessage(code: string, pt: boolean): string {
  const table: Record<string, [string, string]> = {
    LICENSE_REQUIRED: ["O Banco de mídia é liberado para contas aprovadas. Veja Configurações → Conta.", "The stock library needs an approved account. See Settings → Account."],
    SIGN_IN_REQUIRED: ["Entre com sua conta para usar o Banco de mídia.", "Sign in to use the stock library."],
    SESSION_EXPIRED: ["Sua sessão expirou. Entre de novo em Configurações → Conta.", "Your session expired. Sign in again in Settings → Account."],
    SETUP_REQUIRED: ["O serviço de conta ainda não foi configurado neste plugin.", "The account service is not configured in this plugin."],
    RATE_LIMITED: ["Muitas buscas em pouco tempo. Espere um minuto.", "Too many searches. Wait a minute."],
    PROVIDER_RATE_LIMITED: ["Este banco atingiu o limite de uso. Tente outro banco ou mais tarde.", "This provider hit its usage limit. Try another one or later."],
    PROVIDER_DISABLED: ["Este banco foi desligado pelo administrador.", "This provider was turned off by the administrator."],
    PROVIDER_UNAVAILABLE: ["O banco não respondeu. Tente de novo.", "The provider did not respond. Try again."],
    ASSET_NOT_FOUND: ["Esta mídia não está mais disponível.", "This media is no longer available."],
    ASSET_REMOVED: ["Esta mídia foi removida pelo banco.", "This media was removed by the provider."],
    DOWNLOAD_TOO_LARGE: ["O arquivo é maior que o limite permitido.", "The file exceeds the allowed size."],
    DOWNLOAD_TYPE_MISMATCH: ["O arquivo recebido não é a mídia esperada e foi descartado.", "The received file is not the expected media and was discarded."],
    DOWNLOAD_CANCELLED: ["Download cancelado.", "Download cancelled."],
    DISK_FULL: ["Sem espaço em disco para baixar a mídia.", "Not enough disk space for the download."],
    DOWNLOAD_UNAVAILABLE: ["O download só funciona no After Effects.", "Downloads only work inside After Effects."]
  };
  const entry = table[code];
  if (entry) return pt ? entry[0] : entry[1];
  return pt ? "Sem conexão com o Banco de mídia. Verifique a internet e tente de novo." : "Cannot reach the stock library. Check the connection and try again.";
}
