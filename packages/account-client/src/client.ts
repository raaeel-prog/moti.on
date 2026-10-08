import type { AccountClient, AccountClientOptions, AccountDevice, AccountSnapshot, AccountUser, LeaseClaims, LicenseState, LoginAttempt, SignedLease } from "./types.js";
import { clone, identifier, leaseClaims, object, signedLease, validConfig, validUser } from "./validation.js";
import { createSyncController } from "./sync.js";
interface SavedSession { version: 1; user: AccountUser; refreshToken: string; lease: SignedLease | null; lastSeen: number }
const SESSION_KEY = "motion.account.session.v1", DEVICE_KEY = "motion.account.device.v1";
class AccountError extends Error { constructor(readonly code: string) { super(code); } }
function safeCode(error: unknown): string { return error instanceof AccountError ? error.code : error instanceof Error && /^(SYNC_[A-Z_]+|SIGN_IN_REQUIRED)$/.test(error.message) ? error.message : "NETWORK_UNAVAILABLE"; }
export function createAccountClient(options: AccountClientOptions): AccountClient {
  const now = options.now ?? Date.now, configured = validConfig(options.config), config = options.config;
  const sync = createSyncController(options.storage, () => options.crypto.randomId());
  const listeners = new Set<(snapshot: AccountSnapshot) => void>();
  let status: AccountSnapshot["status"] = configured ? "signed_out" : "setup_required", user: AccountUser | null = null;
  let licenseState: LicenseState = "unavailable", deviceId: string | null = null, devices: AccountDevice[] = [];
  let persistence: AccountSnapshot["persistence"] = "secure", error: string | null = null;
  let lease: SignedLease | null = null, claims: LeaseClaims | null = null, lastSeen = 0;
  let refreshToken = "", accessToken = "", accessExpires = 0, epoch = 0;
  let login: LoginAttempt | null = null, refreshWork: Promise<void> | null = null;
  const scopedKey = (key: string): string => `${key}:${config?.url ?? "unconfigured"}`;
  function permitted(): boolean { const time = now(); return configured && user !== null && claims !== null && licenseState === "active" && claims.accountId === user.id && claims.deviceId === deviceId && time >= claims.issuedAt - 60_000 && time >= lastSeen - 60_000 && time < claims.expiresAt; }
  function snapshot(): AccountSnapshot {
    const canMutate = permitted();
    return { status, user: user ? { ...user } : null, license: { state: licenseState === "active" && !canMutate ? "expired" : licenseState, expiresAt: claims?.expiresAt ?? null, canMutate }, deviceId, devices: devices.map(item => ({ ...item })), persistence, sync: sync.snapshot(), error };
  }
  function emit(): void { for (const listener of listeners) { try { listener(snapshot()); } catch { /* An observer cannot interrupt credential lifecycle. */ } } }
  function requireConfig(): void { if (!configured) throw new AccountError("SETUP_REQUIRED"); }
  const ensureEpoch = (expected: number): void => { if (epoch !== expected) throw new AccountError("OPERATION_CANCELLED"); };
  async function persist(): Promise<void> {
    if (!user || !refreshToken) return;
    lastSeen = Math.max(lastSeen, now());
    const saved: SavedSession = { version: 1, user, refreshToken, lease, lastSeen };
    try { await options.vault.write(scopedKey(SESSION_KEY), JSON.stringify(saved)); persistence = "secure"; }
    catch { persistence = "unavailable"; error = "VAULT_UNAVAILABLE"; }
  }
  async function request(path: string, body?: unknown, authenticated = false, method: "GET" | "POST" = "POST"): Promise<unknown> {
    requireConfig();
    const expected = epoch;
    if (authenticated && (!accessToken || now() >= accessExpires - 30_000)) await refreshAuth();
    ensureEpoch(expected);
    const response = await options.transport.request({ method, url: `${config!.url}${path}`, headers: { apikey: config!.publishableKey, "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${accessToken}` } : {}) }, ...(body === undefined ? {} : { body }) });
    ensureEpoch(expected);
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401 || response.status === 403) {
        accessToken = ""; accessExpires = 0; claims = null; lease = null; licenseState = "unavailable"; status = "expired";
        await persist(); throw new AccountError("SESSION_EXPIRED");
      }
      if (response.status === 429) throw new AccountError("RATE_LIMITED");
      throw new AccountError(response.status >= 500 ? "SERVICE_UNAVAILABLE" : "REQUEST_REJECTED");
    }
    return response.body;
  }
  async function verifyLease(candidate: unknown): Promise<void> {
    if (!signedLease(candidate)) throw new AccountError("LEASE_INVALID");
    let parsed: unknown; try { parsed = JSON.parse(candidate.payload); } catch { throw new AccountError("LEASE_INVALID"); }
    if (!leaseClaims(parsed) || parsed.accountId !== user?.id || parsed.deviceId !== deviceId || parsed.issuedAt > now() + 60_000 || !(await options.crypto.verifyEd25519(candidate.payload, candidate.signature, config!.leasePublicKey))) throw new AccountError("LEASE_INVALID");
    lease = clone(candidate); claims = parsed; licenseState = now() < parsed.expiresAt && now() >= lastSeen - 60_000 ? "active" : "expired";
  }
  async function acceptSession(body: unknown): Promise<void> {
    if (!object(body) || typeof body["access_token"] !== "string" || body["access_token"].length < 20 || body["access_token"].length > 16000 || typeof body["refresh_token"] !== "string" || body["refresh_token"].length < 16 || body["refresh_token"].length > 16000 || !object(body["user"]) || !identifier(body["user"]["id"]) || typeof body["expires_in"] !== "number" || body["expires_in"] <= 0 || body["expires_in"] > 86400) throw new AccountError("SESSION_INVALID");
    const raw = body["user"], metadata = object(raw["user_metadata"]) ? raw["user_metadata"] : {};
    const nextUser: AccountUser = { id: raw["id"] as string, email: typeof raw["email"] === "string" ? raw["email"].slice(0, 320) : "", name: typeof metadata["full_name"] === "string" ? metadata["full_name"].slice(0, 200) : "" };
    if (user && user.id !== nextUser.id) throw new AccountError("ACCOUNT_MISMATCH");
    const changed = user?.id !== nextUser.id;
    user = nextUser; accessToken = body["access_token"]; refreshToken = body["refresh_token"]; accessExpires = now() + body["expires_in"] * 1000; status = "signed_in";
    if (changed) await sync.load(user.id);
    await persist();
  }
  async function refreshAuth(): Promise<void> {
    if (refreshWork) return refreshWork;
    if (!refreshToken) throw new AccountError("SIGN_IN_REQUIRED");
    const token = refreshToken, expected = epoch;
    refreshWork = (async () => {
      try { const result = await request("/auth/v1/token?grant_type=refresh_token", { refresh_token: token }); ensureEpoch(expected); await acceptSession(result); }
      catch (caught) {
        if (safeCode(caught) === "SESSION_EXPIRED" || safeCode(caught) === "REQUEST_REJECTED") { refreshToken = ""; claims = null; lease = null; licenseState = "unavailable"; status = "expired"; try { await options.vault.remove(scopedKey(SESSION_KEY)); } catch { persistence = "unavailable"; } }
        throw caught;
      }
    })().finally(() => { refreshWork = null; });
    return refreshWork;
  }
  async function license(action: "status" | "activate" | "deactivate", target?: string): Promise<void> {
    if (!user || !deviceId) throw new AccountError("SIGN_IN_REQUIRED");
    const body = await request("/functions/v1/motion-account", { action: `license.${action}`, deviceId: target ?? deviceId, deviceName: (options.deviceName ?? "Moti.on").slice(0, 80) }, true);
    if (!object(body) || !["missing", "active", "expired", "revoked", "device_limit", "inactive"].includes(String(body["state"])) || !Array.isArray(body["devices"]) || !body["devices"].every(item => object(item) && identifier(item["id"]) && typeof item["name"] === "string" && item["name"].length <= 80 && typeof item["activatedAt"] === "string")) throw new AccountError("LICENSE_RESPONSE_INVALID");
    devices = body["devices"] as AccountDevice[];
    if (body["state"] === "active") { try { await verifyLease(body["lease"]); } catch (caught) { claims = null; lease = null; licenseState = "unavailable"; await persist(); throw caught; } }
    else { claims = null; lease = null; licenseState = body["state"] as LicenseState; }
    error = null; status = "signed_in"; await persist();
  }
  async function attempt(work: () => Promise<void>): Promise<void> {
    try { error = null; await work(); }
    catch (caught) { error = safeCode(caught); if (error !== "OPERATION_CANCELLED") status = error === "SETUP_REQUIRED" ? "setup_required" : error === "SESSION_EXPIRED" ? "expired" : user && permitted() ? "offline" : "error"; }
    emit();
  }
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => { listeners.delete(listener); }; },
    async initialize() {
      await attempt(async () => {
        requireConfig(); const expected = epoch;
        try {
          const storedId = await options.vault.read(scopedKey(DEVICE_KEY)); ensureEpoch(expected);
          deviceId = storedId && identifier(storedId) ? storedId : options.crypto.randomId();
          if (!identifier(deviceId)) throw new AccountError("DEVICE_INVALID");
          if (deviceId !== storedId) await options.vault.write(scopedKey(DEVICE_KEY), deviceId);
          const raw = await options.vault.read(scopedKey(SESSION_KEY)); ensureEpoch(expected);
          if (!raw) return;
          let saved: unknown; try { saved = JSON.parse(raw); } catch { throw new AccountError("VAULT_DATA_INVALID"); }
          if (!object(saved) || saved["version"] !== 1 || !validUser(saved["user"]) || typeof saved["refreshToken"] !== "string" || saved["refreshToken"].length > 16000 || typeof saved["lastSeen"] !== "number" || !Number.isSafeInteger(saved["lastSeen"])) throw new AccountError("VAULT_DATA_INVALID");
          user = saved["user"]; refreshToken = saved["refreshToken"]; lastSeen = saved["lastSeen"]; await sync.load(user.id);
          if (saved["lease"]) await verifyLease(saved["lease"]);
        } catch (caught) { if (!(caught instanceof AccountError)) { persistence = "unavailable"; throw new AccountError("VAULT_UNAVAILABLE"); } throw caught; }
        if (refreshToken) { await refreshAuth(); await license("status"); }
      });
    },
    async signIn() {
      if (login) return;
      await attempt(async () => {
        requireConfig(); if (!deviceId) throw new AccountError("VAULT_UNAVAILABLE");
        // Switching accounts starts with explicit signOut so no prior queue or lease can leak.
        if (user) throw new AccountError("SIGN_OUT_FIRST");
        const expected = ++epoch; status = "signing_in"; emit();
        const verifier = options.crypto.randomVerifier(), state = options.crypto.randomVerifier();
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !/^[A-Za-z0-9._~-]{43,128}$/.test(state)) throw new AccountError("CRYPTO_UNAVAILABLE");
        login = await options.login.begin();
        const current = login;
        try {
          if (!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}\/[a-zA-Z0-9/_-]+$/.test(current.redirectUri)) throw new AccountError("CALLBACK_INVALID");
          const challenge = await options.crypto.sha256Base64Url(verifier), redirect = `${current.redirectUri}?motion_state=${encodeURIComponent(state)}`;
          if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new AccountError("CRYPTO_UNAVAILABLE");
          const callback = current.waitForCallback();
          await current.open(`${config!.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256&scopes=${encodeURIComponent("openid email profile")}`);
          const result = await callback; ensureEpoch(expected);
          if (result.state !== state || !/^[a-zA-Z0-9._~-]{8,2048}$/.test(result.code)) throw new AccountError("OAUTH_STATE_INVALID");
          const body = await request("/auth/v1/token?grant_type=pkce", { auth_code: result.code, code_verifier: verifier });
          ensureEpoch(expected); await acceptSession(body); await license("status");
        } finally { await current.close(); if (login === current) login = null; }
      });
    },
    async signOut() {
      const token = accessToken; ++epoch;
      if (login) { const current = login; login = null; await current.close().catch(() => undefined); }
      user = null; refreshToken = ""; accessToken = ""; accessExpires = 0; claims = null; lease = null; devices = []; licenseState = "unavailable"; status = configured ? "signed_out" : "setup_required"; error = null;
      await sync.load(null);
      try { await options.vault.remove(scopedKey(SESSION_KEY)); } catch { persistence = "unavailable"; error = "VAULT_UNAVAILABLE"; }
      emit();
      if (token && configured) { try { await options.transport.request({ method: "POST", url: `${config!.url}/auth/v1/logout?scope=local`, headers: { apikey: config!.publishableKey, Authorization: `Bearer ${token}` } }); } catch { /* Local logout has completed; remote revocation can be unavailable offline. */ } }
    },
    async refresh() { await attempt(async () => { await refreshAuth(); await license("status"); }); },
    async activateDevice() { await attempt(() => license("activate")); },
    async deactivateDevice(target) { await attempt(() => license("deactivate", target)); },
    canMutate() { const result = permitted(); if (result) lastSeen = Math.max(lastSeen, now()); return result; },
    async enqueue(kind, id, value, deleted = false) { if (!user) throw new AccountError("SIGN_IN_REQUIRED"); await sync.enqueue(kind, id, value, deleted); emit(); },
    async importLocal(records) { if (!user) throw new AccountError("SIGN_IN_REQUIRED"); await sync.importLocal(records); emit(); },
    async sync() {
      if (!user) throw new AccountError("SIGN_IN_REQUIRED");
      const expected = epoch;
      try {
        const records = await sync.sync(async (accountId, operations) => { ensureEpoch(expected); if (user?.id !== accountId) throw new AccountError("ACCOUNT_MISMATCH"); return request("/functions/v1/motion-account", { action: "sync", operations }, true); });
        ensureEpoch(expected); emit(); return records;
      } catch (caught) { error = safeCode(caught); emit(); throw new AccountError(error); }
    }
  };
}
