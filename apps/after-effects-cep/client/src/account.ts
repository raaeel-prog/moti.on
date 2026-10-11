import type { AccountClient, AccountClientOptions } from "@motion/account-client";
let client: AccountClient | null = null;
let loading: Promise<AccountClient> | null = null;
interface AccountWindow extends Window {
  cep_node?: { require(path: string): unknown };
  CSInterface?: new () => { getSystemPath(kind: string): string; openURLInDefaultBrowser(url: string): void };
  SystemPath?: { EXTENSION: string };
}
export function accountSnapshot(): ReturnType<AccountClient["snapshot"]> | null { return client?.snapshot() ?? null; }
let developerUnlock: boolean | null = null;
/**
 * Modo desenvolvedor: so existe quando scripts/install-ae-dev.sh --dev-unlock (ou
 * install-ae-dev.ps1 -DevUnlock, no Windows) grava
 * account/developer-unlock na pasta instalada. O arquivo nunca entra em dist/.
 */
export function isDeveloperUnlocked(): boolean {
  if (developerUnlock !== null) return developerUnlock;
  developerUnlock = false;
  try {
    const win = window as AccountWindow;
    if (win.cep_node && win.CSInterface && win.SystemPath) {
      const root = new win.CSInterface().getSystemPath(win.SystemPath.EXTENSION);
      developerUnlock = (win.cep_node.require("fs") as { existsSync(path: string): boolean }).existsSync(root + "/account/developer-unlock") === true;
    }
  } catch { /* Fail closed. */ }
  return developerUnlock;
}
export function accountCanMutate(): boolean { return isDeveloperUnlocked() || (client?.canMutate() ?? false); }
export function loadAccount(): Promise<AccountClient> {
  if (loading) return loading;
  loading = (async () => {
    const { createAccountClient } = await import("@motion/account-client");
    const unavailable = async (): Promise<never> => { throw new Error("VAULT_UNAVAILABLE"); };
    let runtime: Omit<AccountClientOptions, "storage"> = {
      transport: { request: unavailable }, vault: { read: unavailable, write: unavailable, remove: unavailable },
      crypto: { randomId: () => "", randomVerifier: () => "", sha256Base64Url: unavailable, verifyEd25519: unavailable }, login: { begin: unavailable }
    };
    const win = window as AccountWindow;
    try {
      if (win.cep_node && win.CSInterface && win.SystemPath) {
        const cs = new win.CSInterface();
        const module = win.cep_node.require(cs.getSystemPath(win.SystemPath.EXTENSION) + "/account/runtime.cjs");
        runtime = (module as { createRuntime(open: (url: string) => Promise<void>): Omit<AccountClientOptions, "storage"> }).createRuntime(async url => { cs.openURLInDefaultBrowser(url); });
      }
    } catch { /* An unavailable native integration is visible in account state. */ }
    client = createAccountClient({ ...runtime, storage: {
      async read(id) { return window.localStorage.getItem("motion.account.sync.v1:" + id); },
      async write(id, value) { window.localStorage.setItem("motion.account.sync.v1:" + id, value); }
    } });
    await client.initialize();
    return client;
  })();
  return loading;
}
export async function authorizeCreativeOperation(): Promise<boolean> { if (isDeveloperUnlocked()) return true; try { return (await loadAccount()).canMutate(); } catch { return false; } }
