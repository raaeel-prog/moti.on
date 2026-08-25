/**
 * Gera o modulo ES5 que a camada ExtendScript consome.
 *
 * O host do After Effects nao importa TypeScript e nao tem sistema de modulos.
 * Sem isto, as constantes do contrato existiriam duas vezes — uma em TypeScript
 * e outra copiada a mao no .jsx — e a copia divergiria. Nao "poderia divergir":
 * copias manuais de listas de 22 itens divergem.
 *
 * A saida e literal de objeto ES5 puro, sem virgula sobrando, e passa pelo
 * scanner de scripts/check-extendscript.mjs como qualquer outro fonte do host.
 *
 * Uso:
 *   node packages/contracts/scripts/gen-extendscript.mjs            grava
 *   node packages/contracts/scripts/gen-extendscript.mjs --check    so verifica
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");

export const GENERATED_PATH = path.join(
  repoRoot,
  "apps",
  "after-effects-cep",
  "host",
  "generated",
  "motion-contracts.jsx"
);

/**
 * Le as constantes do FONTE TypeScript por parsing textual, e nao importando o
 * modulo compilado.
 *
 * O motivo e ordem de build: a geracao roda antes do `tsc -b`, entao
 * packages/contracts/dist pode nao existir ainda. Ler o fonte tambem faz o
 * gerador falhar alto se alguem mudar a forma da declaracao, em vez de emitir
 * silenciosamente um modulo vazio.
 */
async function readContractConstants() {
  const errorsSource = await readFile(
    path.join(repoRoot, "packages", "contracts", "src", "errors.ts"),
    "utf8"
  );

  const codesBlock = errorsSource.match(/export const ERROR_CODES = \[([\s\S]*?)\] as const;/);
  if (!codesBlock) {
    throw new Error("Não foi possível localizar ERROR_CODES em packages/contracts/src/errors.ts.");
  }
  const errorCodes = [...codesBlock[1].matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
  if (errorCodes.length === 0) {
    throw new Error("ERROR_CODES foi encontrado mas está vazio.");
  }

  const metaBlock = errorsSource.match(
    /export const ERROR_META: Record<ErrorCode, ErrorMeta> = \{([\s\S]*?)\n\};/
  );
  if (!metaBlock) {
    throw new Error("Não foi possível localizar ERROR_META em packages/contracts/src/errors.ts.");
  }
  /** @type {Record<string, boolean>} */
  const recoverable = {};
  /** @type {Record<string, string>} */
  const actions = {};
  for (const entry of metaBlock[1].matchAll(
    /([A-Z_]+):\s*\{\s*recoverable:\s*(true|false),\s*actionKey:\s*"([^"]+)"/g
  )) {
    recoverable[entry[1]] = entry[2] === "true";
    actions[entry[1]] = entry[3];
  }

  const missing = errorCodes.filter((code) => !(code in recoverable) || !(code in actions));
  if (missing.length > 0) {
    throw new Error(`ERROR_META não cobre: ${missing.join(", ")}`);
  }

  const rigSource = await readFile(
    path.join(repoRoot, "packages", "contracts", "src", "rig-metadata.ts"),
    "utf8"
  );
  const readString = (name) => {
    const found = rigSource.match(new RegExp(`export const ${name} = "([^"]*)";`));
    if (!found) throw new Error(`Não foi possível localizar ${name} em rig-metadata.ts.`);
    return found[1];
  };

  const protocolSource = await readFile(
    path.join(repoRoot, "packages", "contracts", "src", "protocol.ts"),
    "utf8"
  );
  const versionMatch = protocolSource.match(/export const PROTOCOL_VERSION = (\d+) as const;/);
  if (!versionMatch) {
    throw new Error("Não foi possível localizar PROTOCOL_VERSION em protocol.ts.");
  }

  return {
    protocolVersion: Number(versionMatch[1]),
    errorCodes,
    recoverable,
    actions,
    metaOpen: readString("META_OPEN"),
    metaClose: readString("META_CLOSE"),
    rigPrefix: readString("RIG_PREFIX"),
    expressionHeader: readString("EXPRESSION_HEADER")
  };
}

/**
 * Escapa uma string para literal ES5. Os valores aqui sao ASCII e vem do proprio
 * repositorio, mas emitir sem escapar seria confiar em algo que ninguem garante.
 */
function quote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function renderModule() {
  const c = await readContractConstants();

  const errorEntries = c.errorCodes
    .map((code) => `      ${code}: ${quote(code)}`)
    .join(",\n");

  const recoverableEntries = c.errorCodes
    .map((code) => `      ${code}: ${c.recoverable[code] ? "true" : "false"}`)
    .join(",\n");

  const actionEntries = c.errorCodes
    .map((code) => `      ${code}: ${quote(c.actions[code])}`)
    .join(",\n");

  return `/**
 * ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 * Origem: packages/contracts/src/{errors,protocol,rig-metadata}.ts
 * Gerador: packages/contracts/scripts/gen-extendscript.mjs
 *
 * Regenere com \`npm run build\`. O teste de drift em
 * packages/contracts/tests/generated-drift.test.mjs falha se este arquivo sair
 * de sincronia com o fonte TypeScript.
 */
(function (global) {
  global.MotionContracts = {
    PROTOCOL_VERSION: ${c.protocolVersion},

    ERROR: {
${errorEntries}
    },

    ERROR_RECOVERABLE: {
${recoverableEntries}
    },

    ERROR_ACTION: {
${actionEntries}
    },

    META_OPEN: ${quote(c.metaOpen)},
    META_CLOSE: ${quote(c.metaClose)},
    RIG_PREFIX: ${quote(c.rigPrefix)},
    EXPRESSION_HEADER: ${quote(c.expressionHeader)}
  };
}($.global));
`;
}

if (process.argv[1] && process.argv[1].endsWith("gen-extendscript.mjs")) {
  const rendered = await renderModule();

  if (process.argv.includes("--check")) {
    const current = await readFile(GENERATED_PATH, "utf8").catch(() => null);
    if (current !== rendered) {
      console.error(
        "motion-contracts.jsx está fora de sincronia com o contrato TypeScript. Rode `npm run build`."
      );
      process.exit(1);
    }
    console.log("motion-contracts.jsx está sincronizado.");
  } else {
    await mkdir(path.dirname(GENERATED_PATH), { recursive: true });
    await writeFile(GENERATED_PATH, rendered, "utf8");
    console.log(`Contrato ES5 gerado em ${path.relative(repoRoot, GENERATED_PATH)}.`);
  }
}
