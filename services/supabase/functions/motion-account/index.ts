// Moti.on account endpoint. Deno (Supabase Edge Functions).
// Identity comes only from the caller's Supabase session; every write goes through
// the service-only RPCs in migrations/, which revalidate their input.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LEASE_PRIVATE_KEY = Deno.env.get("MOTION_LEASE_PRIVATE_KEY") ?? "";
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const MAX_BODY = 1048576;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
// Stable codes only: no provider text, token or SQL message reaches the client.
const reject = (status: number, code: string): Response => json(status, { error: code });

let signingKey: Promise<CryptoKey> | null = null;
function leaseKey(): Promise<CryptoKey> {
  signingKey ??= (async () => {
    const der = Uint8Array.from(atob(LEASE_PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), c => c.charCodeAt(0));
    return crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
  })();
  return signingKey;
}
const base64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  if (!response.ok) { console.error(`rpc ${name} failed`, response.status); throw new Error("RPC_FAILED"); }
  return response.json();
}

async function caller(request: Request): Promise<string | null> {
  const token = /^Bearer ([A-Za-z0-9._-]{20,16000})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" && IDENTIFIER.test(user.id) ? user.id : null;
}

async function license(userId: string, action: string, deviceId: string, deviceName: string): Promise<Response> {
  const result = await rpc("motion_license", { p_user: userId, p_device: deviceId, p_name: deviceName, p_action: action }) as Record<string, unknown>;
  const body: Record<string, unknown> = { state: result.state, devices: result.devices };
  if (result.state === "active") {
    // The lease binds account, device and license; the panel verifies it with the public key.
    const payload = JSON.stringify({
      version: 1, audience: "motion-plugin", accountId: userId, deviceId, licenseId: String(result.licenseId),
      issuedAt: Math.floor(Number(result.issuedAt)), expiresAt: Math.floor(Number(result.expiresAt))
    });
    const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", await leaseKey(), new TextEncoder().encode(payload)));
    body.lease = { payload, signature: base64Url(signature) };
  }
  return json(200, body);
}

Deno.serve(async request => {
  if (request.method !== "POST") return reject(405, "METHOD_NOT_ALLOWED");
  if (!SUPABASE_URL || !SERVICE_KEY || !LEASE_PRIVATE_KEY) return reject(503, "SERVICE_NOT_CONFIGURED");
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY) return reject(413, "REQUEST_TOO_LARGE");
  const userId = await caller(request);
  if (!userId) return reject(401, "SESSION_EXPIRED");
  let input: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reject(413, "REQUEST_TOO_LARGE");
    input = JSON.parse(text);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch { return reject(400, "REQUEST_INVALID"); }
  try {
    const action = input.action;
    if (action === "license.status" || action === "license.activate" || action === "license.deactivate") {
      const deviceId = input.deviceId, deviceName = input.deviceName;
      if (typeof deviceId !== "string" || !IDENTIFIER.test(deviceId) || typeof deviceName !== "string" || deviceName.length < 1 || deviceName.length > 80) return reject(400, "REQUEST_INVALID");
      return await license(userId, action.slice(8), deviceId, deviceName);
    }
    if (action === "sync") {
      if (!Array.isArray(input.operations) || input.operations.length > 100) return reject(400, "REQUEST_INVALID");
      // Sync belongs to licensed accounts only; the RPC owns record validation.
      const status = await rpc("motion_license", { p_user: userId, p_device: "sync-check", p_name: "sync", p_action: "status" }) as { state?: unknown };
      if (status.state === "missing" || status.state === "revoked" || status.state === "expired") return reject(403, "LICENSE_REQUIRED");
      return json(200, await rpc("motion_sync", { p_user: userId, p_operations: input.operations }));
    }
    return reject(400, "REQUEST_INVALID");
  } catch { return reject(500, "SERVICE_UNAVAILABLE"); }
});
