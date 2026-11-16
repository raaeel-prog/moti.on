// Moti.on stock media BFF (MASTER_BUILD_SPEC §18.3). Provider keys exist only as function secrets;
// the panel receives normalized metadata and allowlisted media URLs, never a key.
// Runtime-neutral (Request/Response/fetch/crypto.subtle) so Node tests can drive it directly.
import {
  ASSET_ID, PROVIDER_SECRETS, STOCK_PROVIDERS, isProviderId, mediaUrl,
  type ProviderCall, type StockMediaType, type StockOrientation, type StockProviderId, type StockSearchRequest
} from "../_shared/stock-providers.ts";

export interface AssetsDeps {
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof fetch;
  now?: () => number;
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const MAX_BODY = 16384, MAX_PROVIDER_BODY = 4 * 1024 * 1024, PROVIDER_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 24 * 3600 * 1000, DEFAULT_PER_MINUTE = 40, PER_PAGE = 24;
const TYPES: readonly StockMediaType[] = ["video", "image", "audio"];
const ORIENTATIONS: readonly StockOrientation[] = ["landscape", "portrait", "square"];

// No parameter properties: Node's type stripping (used by the tests) only accepts erasable syntax.
class Rejection extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function enabledProviders(env: AssetsDeps["env"]): StockProviderId[] {
  return (Object.keys(STOCK_PROVIDERS) as StockProviderId[]).filter(id => (env[PROVIDER_SECRETS[id]] ?? "").trim().length >= 8);
}

/** Validated search request; anything unexpected is rejected, not coerced. */
export function searchRequest(input: Record<string, unknown>): { provider: StockProviderId; request: StockSearchRequest } {
  const { provider, type, query, page = 1, orientation } = input;
  const text = typeof query === "string" ? query.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!isProviderId(provider) || !TYPES.includes(type as StockMediaType) || text.length < 1 || text.length > 100
    || !(Number.isInteger(page) && (page as number) >= 1 && (page as number) <= 100)
    || (orientation !== undefined && !ORIENTATIONS.includes(orientation as StockOrientation))) throw new Rejection(400, "REQUEST_INVALID");
  const request: StockSearchRequest = { type: type as StockMediaType, query: text, page: page as number, perPage: PER_PAGE };
  if (orientation !== undefined && type !== "audio") request.orientation = orientation as StockOrientation;
  return { provider, request };
}

export function createAssetsHandler(deps: AssetsDeps): (request: Request) => Promise<Response> {
  const env = deps.env, now = deps.now ?? Date.now;
  const base = env.SUPABASE_URL ?? "", service = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const perMinute = Math.min(600, Math.max(5, Number.parseInt(env.MOTION_ASSETS_PER_MINUTE ?? "", 10) || DEFAULT_PER_MINUTE));

  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await deps.fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers: serviceHeaders, body: JSON.stringify(args) });
    if (!response.ok) throw new Rejection(503, "SERVICE_UNAVAILABLE");
    return response.json();
  }
  async function caller(request: Request): Promise<string> {
    const token = /^Bearer ([A-Za-z0-9._-]{20,16000})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!token) throw new Rejection(401, "SESSION_EXPIRED");
    const response = await deps.fetch(`${base}/auth/v1/user`, { headers: { apikey: service, Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Rejection(401, "SESSION_EXPIRED");
    const user = await response.json() as { id?: unknown };
    if (typeof user.id !== "string" || !IDENTIFIER.test(user.id)) throw new Rejection(401, "SESSION_EXPIRED");
    return user.id;
  }
  /** Same gate as account sync: the stock library belongs to approved accounts only. */
  async function authorize(userId: string): Promise<void> {
    const status = await rpc("motion_license", { p_user: userId, p_device: "assets-check", p_name: "assets", p_action: "status" }) as { state?: unknown };
    if (status.state === "missing" || status.state === "revoked" || status.state === "expired") throw new Rejection(403, "LICENSE_REQUIRED");
    if (await rpc("motion_asset_quota", { p_user: userId, p_limit: perMinute }) !== true) throw new Rejection(429, "RATE_LIMITED");
  }

  async function cacheRead(key: string): Promise<unknown> {
    try {
      const response = await deps.fetch(`${base}/rest/v1/motion_asset_cache?select=value&key=eq.${key}&expires_at=gt.${encodeURIComponent(new Date(now()).toISOString())}`, { headers: serviceHeaders });
      if (!response.ok) return null;
      const rows = await response.json() as Array<{ value?: unknown }>;
      return Array.isArray(rows) && rows[0] ? rows[0].value ?? null : null;
    } catch { return null; }
  }
  async function cacheWrite(key: string, value: unknown): Promise<void> {
    try {
      await deps.fetch(`${base}/rest/v1/motion_asset_cache`, { method: "POST", headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key, value, expires_at: new Date(now() + CACHE_TTL_MS).toISOString() }) });
    } catch { /* A cold cache only costs one more provider call. */ }
  }

  async function provider(call: ProviderCall): Promise<unknown> {
    let response: Response;
    try { response = await deps.fetch(call.url, { headers: { Accept: "application/json", ...call.headers }, redirect: "error", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }); }
    catch { throw new Rejection(502, "PROVIDER_UNAVAILABLE"); }
    if (response.status === 404) throw new Rejection(404, "ASSET_NOT_FOUND");
    if (response.status === 429) throw new Rejection(429, "PROVIDER_RATE_LIMITED");
    if (!response.ok) { console.error("stock provider status", new URL(call.url).hostname, response.status); throw new Rejection(502, "PROVIDER_UNAVAILABLE"); }
    const body = await response.text();
    if (body.length > MAX_PROVIDER_BODY) throw new Rejection(502, "PROVIDER_UNAVAILABLE");
    try { return JSON.parse(body); } catch { throw new Rejection(502, "PROVIDER_UNAVAILABLE"); }
  }
  function keyFor(id: StockProviderId, type: StockMediaType): string {
    const key = (env[PROVIDER_SECRETS[id]] ?? "").trim();
    if (key.length < 8) throw new Rejection(409, "PROVIDER_DISABLED");
    if (!STOCK_PROVIDERS[id].types.includes(type)) throw new Rejection(400, "REQUEST_INVALID");
    return key;
  }

  async function search(input: Record<string, unknown>): Promise<unknown> {
    const { provider: id, request } = searchRequest(input), adapter = STOCK_PROVIDERS[id], key = keyFor(id, request.type);
    const cacheKey = await sha256(JSON.stringify(["search-v1", id, request]));
    const cached = await cacheRead(cacheKey);
    if (cached) return cached;
    let result;
    try { result = adapter.parseSearch(await provider(adapter.searchCall(request, key)), request); }
    catch (error) { if (error instanceof Rejection) throw error; throw new Rejection(502, "PROVIDER_UNAVAILABLE"); }
    const body = { provider: id, type: request.type, ...result };
    await cacheWrite(cacheKey, body);
    return body;
  }
  /** Detail is re-read from the provider: the panel never chooses which URL gets downloaded. */
  async function download(input: Record<string, unknown>): Promise<unknown> {
    const { provider: id, type, assetId } = input;
    if (!isProviderId(id) || !TYPES.includes(type as StockMediaType) || typeof assetId !== "string" || !ASSET_ID.test(assetId)) throw new Rejection(400, "REQUEST_INVALID");
    const adapter = STOCK_PROVIDERS[id], key = keyFor(id, type as StockMediaType);
    const body = await provider(adapter.detailCall(type as StockMediaType, assetId, key));
    const detail = adapter.parseDetail(body, type as StockMediaType);
    if (!detail || detail.item.type !== type || !mediaUrl(detail.rendition.url)) throw new Rejection(404, "ASSET_NOT_FOUND");
    const track = adapter.trackCall?.(body, key);
    if (track) { try { await provider(track); } catch { throw new Rejection(502, "PROVIDER_UNAVAILABLE"); } }
    return detail;
  }

  return async request => {
    try {
      if (request.method !== "POST") throw new Rejection(405, "METHOD_NOT_ALLOWED");
      if (!base || !service) throw new Rejection(503, "SERVICE_NOT_CONFIGURED");
      if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY) throw new Rejection(413, "REQUEST_TOO_LARGE");
      const userId = await caller(request);
      let input: Record<string, unknown>;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY) throw new Rejection(413, "REQUEST_TOO_LARGE");
        input = JSON.parse(text);
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
      } catch (error) { if (error instanceof Rejection) throw error; throw new Rejection(400, "REQUEST_INVALID"); }
      await authorize(userId);
      switch (input.action) {
        case "assets.providers": return json(200, { providers: enabledProviders(env).map(id => ({ id, name: STOCK_PROVIDERS[id].name, types: [...STOCK_PROVIDERS[id].types] })) });
        case "assets.search": return json(200, await search(input));
        case "assets.download": return json(200, await download(input));
        default: throw new Rejection(400, "REQUEST_INVALID");
      }
    } catch (error) {
      // Stable codes only: no provider text, key, token or SQL message reaches the client.
      return error instanceof Rejection ? json(error.status, { error: error.code }) : json(500, { error: "SERVICE_UNAVAILABLE" });
    }
  };
}
