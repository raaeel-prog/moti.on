/**
 * Fronteira estreita com o runtime UXP.
 *
 * A apresentacao nao conhece o provider de arquivos nem tenta usar Node `fs`.
 * Este modulo recebe o objeto devolvido por `require("uxp")`, valida somente os
 * simbolos documentados e devolve resultados pequenos e testaveis.
 */

export type RuntimeProbeResult = boolean | "unknown";

export interface UxpHostEnvironment {
  hostVersion: string;
  uiLocale: string | undefined;
  canWriteFiles: RuntimeProbeResult;
}

interface UxpWritableFile {
  write(contents: string): Promise<unknown> | unknown;
}

interface UxpLocalFileSystem {
  getFileForSaving(
    suggestedName: string,
    options: { types: string[] }
  ): Promise<UxpWritableFile | null>;
}

interface UxpModuleShape {
  host?: {
    version?: unknown;
    uiLocale?: unknown;
  };
  storage?: {
    localFileSystem?: UxpLocalFileSystem;
  };
}

export type DiagnosticsExportResult =
  | { status: "saved" }
  | { status: "cancelled" }
  | { status: "unsupported"; reason: "picker-unavailable" | "file-write-unavailable" }
  | { status: "failed"; reason: "picker-failed" | "serialization-failed" | "write-failed" };

function normalizedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

/**
 * Le informacoes documentadas do host. Getters que lancam resultam em fatos
 * desconhecidos; ausencia do modulo nao e convertida em uma versao inventada.
 */
export function readUxpHostEnvironment(uxp: unknown): UxpHostEnvironment {
  const host = (() => {
    try {
      const module = uxp as UxpModuleShape | null;
      return {
        hostVersion: normalizedString(module?.host?.version) ?? "unknown",
        uiLocale: normalizedString(module?.host?.uiLocale) ?? undefined
      };
    } catch {
      return { hostVersion: "unknown", uiLocale: undefined };
    }
  })();

  const canWriteFiles: RuntimeProbeResult = (() => {
    try {
      const module = uxp as UxpModuleShape | null;
      return typeof module?.storage?.localFileSystem?.getFileForSaving === "function";
    } catch {
      return "unknown";
    }
  })();

  return { ...host, canWriteFiles };
}

/**
 * Salva o bundle somente no arquivo explicitamente escolhido pelo usuario.
 *
 * O resultado nunca inclui `nativePath`, nome escolhido ou a excecao original:
 * esses dados nao precisam atravessar a fronteira nem aparecer nos logs.
 */
export async function exportDiagnosticsBundle(
  uxp: unknown,
  bundle: unknown
): Promise<DiagnosticsExportResult> {
  let fileSystem: UxpLocalFileSystem | undefined;

  try {
    fileSystem = (uxp as UxpModuleShape | null)?.storage?.localFileSystem;
  } catch {
    return { status: "unsupported", reason: "picker-unavailable" };
  }

  if (!fileSystem || typeof fileSystem.getFileForSaving !== "function") {
    return { status: "unsupported", reason: "picker-unavailable" };
  }

  let contents: string;
  try {
    const serialized = JSON.stringify(bundle, null, 2);
    if (typeof serialized !== "string") {
      return { status: "failed", reason: "serialization-failed" };
    }
    contents = `${serialized}\n`;
  } catch {
    return { status: "failed", reason: "serialization-failed" };
  }

  let file: UxpWritableFile | null;
  try {
    file = await fileSystem.getFileForSaving("moti-on-diagnostics.json", {
      types: ["json"]
    });
  } catch {
    return { status: "failed", reason: "picker-failed" };
  }

  if (file === null) {
    return { status: "cancelled" };
  }

  let write: UxpWritableFile["write"];
  try {
    write = file.write;
  } catch {
    return { status: "unsupported", reason: "file-write-unavailable" };
  }

  if (typeof write !== "function") {
    return { status: "unsupported", reason: "file-write-unavailable" };
  }

  try {
    await write.call(file, contents);
    return { status: "saved" };
  } catch {
    return { status: "failed", reason: "write-failed" };
  }
}
