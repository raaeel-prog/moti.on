export function attachLicensedAccount(window, CSInterface) {
  // Inject a licensed account at the native IO boundary; production stays fail-closed.
  const userId = "fixture-user", deviceId = "fixture-device", time = Date.now();
  const lease = { payload: JSON.stringify({ version: 1, audience: "motion-plugin", accountId: userId, deviceId, licenseId: "fixture-license", issuedAt: time, expiresAt: time + 86400000 }), signature: "a".repeat(86) };
  window.CSInterface = CSInterface; window.SystemPath = { EXTENSION: "extension" };
  window.localStorage = { getItem: () => null, setItem() {} };
  window.cep_node = { require: () => ({ createRuntime: () => ({
    config: { url: "https://fixture.supabase.co", publishableKey: "fixture-public-key", leasePublicKey: "x".repeat(40) },
    vault: { async read(key) { return key.includes("device") ? deviceId : JSON.stringify({ version: 1, user: { id: userId, email: "", name: "Fixture" }, refreshToken: "r".repeat(32), lease, lastSeen: time }); }, async write() {}, async remove() {} },
    crypto: { randomId: () => deviceId, randomVerifier: () => "v".repeat(43), async sha256Base64Url() { return "c".repeat(43); }, async verifyEd25519() { return true; } },
    transport: { async request({url}) { return { status: 200, body: url.includes("/auth/") ? { access_token: "a".repeat(32), refresh_token: "r".repeat(32), expires_in: 3600, user: { id: userId } } : { state: "active", devices: [], lease } }; } },
    login: { async begin() { throw new Error("Not used by fixture"); } }
  }) }) };
}
