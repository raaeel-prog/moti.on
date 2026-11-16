import type { AccountClient, AccountClientOptions } from "@motion/account-client";
import type { StockClient, StockDownloadTicket } from "@motion/asset-sdk";
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

// ---------- Banco de mídia (MASTER_BUILD_SPEC §18) ----------
// Search and download tickets go through the account session to `motion-assets`; the file
// itself is fetched by account/stock-download.cjs (Node side of CEP), never by the page.
let stockClient: Promise<StockClient> | null = null;
interface StockDownloader { download(request: Record<string, unknown>, onProgress?: (progress: { bytes: number; total: number | null }) => void): { promise: Promise<{ reused: boolean }>; cancel(): void } }
let downloader: StockDownloader | null = null;

export function loadStockClient(): Promise<StockClient> {
  stockClient ??= (async () => {
    const [{ createStockClient }, account] = await Promise.all([import("@motion/asset-sdk"), loadAccount()]);
    return createStockClient(body => account.assets(body));
  })().catch(error => { stockClient = null; throw error; });
  return stockClient;
}
function stockDownloader(): StockDownloader | null {
  if (downloader) return downloader;
  try {
    const win = window as AccountWindow;
    if (win.cep_node && win.CSInterface && win.SystemPath) {
      const root = new win.CSInterface().getSystemPath(win.SystemPath.EXTENSION);
      downloader = (win.cep_node.require(root + "/account/stock-download.cjs") as { createStockDownloader(): StockDownloader }).createStockDownloader();
    }
  } catch { /* Reported as DOWNLOAD_UNAVAILABLE. */ }
  return downloader;
}
export function downloadStock(ticket: StockDownloadTicket, onProgress: (fraction: number | null) => void): { promise: Promise<{ reused: boolean }>; cancel(): void } {
  const runtime = stockDownloader();
  if (!runtime) return { promise: Promise.reject(new Error("DOWNLOAD_UNAVAILABLE")), cancel() { /* Nothing started. */ } };
  return runtime.download({ provider: ticket.item.provider, assetId: ticket.item.providerAssetId, extension: ticket.rendition.extension, url: ticket.rendition.url,
    maxBytes: ticket.rendition.maxBytes, item: ticket.item }, progress => onProgress(progress.total ? Math.min(1, progress.bytes / progress.total) : null));
}
/** Credits and license pages open in the user's browser; only HTTPS. */
export function openExternal(url: string): void {
  try {
    if (new URL(url).protocol !== "https:") return;
    const win = window as AccountWindow;
    if (win.CSInterface) new win.CSInterface().openURLInDefaultBrowser(url);
  } catch { /* Invalid URL or no host: nothing opens. */ }
}
/** Same textarea path as the diagnostics export: CEP's Chromium may refuse navigator.clipboard on file://. */
export function copyText(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text; document.body.appendChild(area); area.select();
  let copied: boolean;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  document.body.removeChild(area);
  return copied;
}
