/**
 * Banco de mídia (`ae.stock.import`, MASTER_BUILD_SPEC §18, ADR 0008).
 *
 * O painel baixa o arquivo para a pasta do Moti.on no perfil do usuário e o host
 * importa de lá. O payload nunca leva caminho: o host deriva o arquivo de
 * `provider` + `assetId` + `extension` sob `Folder.userData`, com as mesmas
 * regras que o downloader usa para gravar.
 */
export const STOCK_PROVIDER_IDS = ["pexels", "pixabay", "unsplash", "freesound"] as const;
export type StockProviderId = (typeof STOCK_PROVIDER_IDS)[number];
export const STOCK_EXTENSIONS = ["jpg", "png", "mp4", "mov", "mp3", "wav"] as const;
export type StockExtension = (typeof STOCK_EXTENSIONS)[number];
export const STOCK_PROVIDER_NAMES: Readonly<Record<StockProviderId, string>> = { pexels: "Pexels", pixabay: "Pixabay", unsplash: "Unsplash", freesound: "Freesound" };
export const STOCK_LIMITS = { title: 120, credit: 400 } as const;
/** Pasta relativa a `Folder.userData` (AE) / APPDATA ou Application Support (Node). */
export const STOCK_LIBRARY_DIR = "Moti.on/Banco de midia";
const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused.
const PRINTABLE = /^[^\u0000-\u001f\u007f]*$/;

export interface StockImportArgs {
  provider: StockProviderId;
  assetId: string;
  extension: StockExtension;
  title: string;
  /** Texto de crédito exibido ao usuário; vai para o comentário do item no Projeto. */
  credit: string;
}

export function stockFileName(provider: StockProviderId, assetId: string, extension: StockExtension): string {
  return `${provider}/${assetId}.${extension}`;
}

/** Mesmas regras do preflight de `ae.stock.import`. Retorna o campo inválido. */
export function stockImportError(args: unknown): string | null {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return "args";
  const record = args as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["provider", "assetId", "extension", "title", "credit"].includes(key)) return key;
  if (!(STOCK_PROVIDER_IDS as readonly unknown[]).includes(record["provider"])) return "provider";
  if (typeof record["assetId"] !== "string" || !ASSET_ID.test(record["assetId"])) return "assetId";
  if (!(STOCK_EXTENSIONS as readonly unknown[]).includes(record["extension"])) return "extension";
  const title = record["title"], credit = record["credit"];
  if (typeof title !== "string" || title.trim().length < 1 || title.length > STOCK_LIMITS.title || !PRINTABLE.test(title)) return "title";
  if (typeof credit !== "string" || credit.length > STOCK_LIMITS.credit || !PRINTABLE.test(credit)) return "credit";
  return null;
}
