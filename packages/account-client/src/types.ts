/** All adapters must fail explicitly: never substitute plaintext for the secure vault. */
export interface AccountConfig { url: string; publishableKey: string; leasePublicKey: string }
export interface AccountTransport {
  /** Enforce HTTPS, exact configured origin, no redirects, bounded response, and a 15s timeout. */
  request(request: { method: "GET" | "POST"; url: string; headers: Record<string, string>; body?: unknown }): Promise<{ status: number; body: unknown }>;
}
export interface SecureVault {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface AccountCrypto {
  randomId(): string;
  /** Cryptographically random RFC7636 verifier, 43–128 unreserved characters. */
  randomVerifier(): string;
  sha256Base64Url(value: string): Promise<string>;
  /** Verify UTF-8 payload bytes against base64url signature, using the configured Ed25519 key. */
  verifyEd25519(payload: string, signature: string, publicKey: string): Promise<boolean>;
}
export interface LoginAttempt {
  /** Loopback HTTP URL bound to 127.0.0.1, with unpredictable path and ephemeral port. No query. */
  redirectUri: string;
  open(url: string): Promise<void>;
  /** Read code and motion_state from callback query; reject provider errors. Timeout after 5 minutes. */
  waitForCallback(): Promise<{ code: string; state: string }>;
  close(): Promise<void>;
}
export interface AccountLogin { begin(): Promise<LoginAttempt> }
/** Non-secret JSON only. Account ID must be part of the persisted namespace. Atomic writes required. */
export interface AccountStorage { read(accountId: string): Promise<string | null>; write(accountId: string, value: string): Promise<void> }
export type SyncKind = "preferences" | "favorites" | "variants" | "gradients";
export interface SyncRecord { kind: SyncKind; id: string; value: unknown; revision: number; deleted: boolean }
export interface SyncOperation extends Omit<SyncRecord, "revision"> { mutationId: string; baseRevision: number }
export interface SyncSnapshot { status: "idle" | "syncing" | "offline" | "error"; pending: number; conflicts: number; records: SyncRecord[] }
export interface AccountUser { id: string; email: string; name: string }
export interface AccountDevice { id: string; name: string; activatedAt: string }
export interface SignedLease { payload: string; signature: string }
export interface LeaseClaims { version: 1; audience: "motion-plugin"; accountId: string; deviceId: string; licenseId: string; issuedAt: number; expiresAt: number }
export type LicenseState = "unavailable" | "missing" | "active" | "expired" | "revoked" | "device_limit" | "inactive";
export interface AccountSnapshot {
  status: "setup_required" | "signed_out" | "signing_in" | "signed_in" | "offline" | "expired" | "error";
  user: AccountUser | null;
  license: { state: LicenseState; expiresAt: number | null; canMutate: boolean };
  deviceId: string | null;
  devices: AccountDevice[];
  persistence: "secure" | "unavailable";
  sync: SyncSnapshot;
  /** Stable code, no provider response, token, email or private path. */
  error: string | null;
}
export interface AccountClientOptions {
  config?: AccountConfig;
  transport: AccountTransport;
  vault: SecureVault;
  crypto: AccountCrypto;
  login: AccountLogin;
  storage: AccountStorage;
  now?: () => number;
  deviceName?: string;
}
export interface AccountClient {
  snapshot(): AccountSnapshot;
  subscribe(listener: (snapshot: AccountSnapshot) => void): () => void;
  initialize(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  activateDevice(): Promise<void>;
  deactivateDevice(deviceId?: string): Promise<void>;
  /** Returns a fresh expiration check; caller must use this immediately before every creative mutation. */
  canMutate(): boolean;
  enqueue(kind: SyncKind, id: string, value: unknown, deleted?: boolean): Promise<void>;
  /** Merges local entries once per account. Existing cloud preferences win; favorites and recipes merge. */
  importLocal(records: Array<Pick<SyncRecord, "kind" | "id" | "value">>): Promise<void>;
  sync(): Promise<SyncRecord[]>;
}
