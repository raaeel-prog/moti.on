/**
 * Gera a tabela de descriptors que o dispatcher do ExtendScript consulta.
 *
 * Mesmo motivo do gerador de packages/contracts: o host nao importa TypeScript e
 * nao tem sistema de modulos, entao os descriptors existiriam duas vezes se
 * alguem os copiasse a mao. Copia manual diverge.
 *
 * O que e emitido e deliberadamente MENOR que o descriptor completo. O host
 * precisa saber se o comando muta, se e destrutivo e qual rotulo de Undo usar.
 * Ele nao precisa de `timeoutMs`, que e assunto do cliente, nem de
 * `requirements`, que no P0 nao tem sonda para consultar — o CHMS-006 traz a
 * capability matrix e ai os requisitos passam a ser verificaveis no host.
 * Emitir agora um campo que ninguem le criaria a impressao de que ele esta
 * sendo respeitado.
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
  "motion-descriptors.jsx"
);

function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Le os descriptors do modulo COMPILADO.
 *
 * Diferente do gerador de contracts, que le o fonte por parsing textual: aqui a
 * estrutura e um array de objetos com campos aninhados, e parsear isso a mao
 * seria fragil sem ganho. A contrapartida e que este gerador exige `tsc -b`
 * antes, e scripts/build.mjs garante essa ordem.
 */
async function loadDescriptors() {
  const distEntry = path.join(repoRoot, "packages", "command-registry", "dist", "index.js");
  const module = await import(`file://${distEntry.split(path.sep).join("/")}`);

  if (!Array.isArray(module.COMMAND_DESCRIPTORS) || module.COMMAND_DESCRIPTORS.length === 0) {
    throw new Error("COMMAND_DESCRIPTORS está vazio ou não é um array.");
  }

  return {
    descriptors: module.COMMAND_DESCRIPTORS,
    resolveUndoLabel: module.resolveUndoLabel,
    locales: module.SUPPORTED_LOCALES,
    defaultLocale: module.DEFAULT_LOCALE
  };
}

export async function renderModule() {
  const { descriptors, resolveUndoLabel, locales, defaultLocale } = await loadDescriptors();

  // Somente os comandos do After Effects. Emitir os do Premiere faria o host do
  // AE declarar conhecer comandos que ele nao implementa.
  const aeDescriptors = descriptors.filter((descriptor) => descriptor.hosts.includes("after-effects"));

  if (aeDescriptors.length === 0) {
    throw new Error("Nenhum descriptor de After Effects encontrado.");
  }

  const entries = aeDescriptors
    .map((descriptor) => {
      const labels = locales
        .map((locale) => `        ${quote(locale)}: ${quote(resolveUndoLabel(descriptor.undoLabelKey, locale))}`)
        .join(",\n");

      return `    ${quote(descriptor.id)}: {
      id: ${quote(descriptor.id)},
      destructive: ${descriptor.destructive ? "true" : "false"},
      mutates: ${descriptor.mutates ? "true" : "false"},
      supportsDryRun: ${descriptor.supportsDryRun ? "true" : "false"},
      undoLabelKey: ${quote(descriptor.undoLabelKey)},
      undoLabels: {
${labels}
      }
    }`;
    })
    .join(",\n");

  return `/**
 * ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 * Origem: packages/command-registry/src/{descriptors,undo-labels}.ts
 * Gerador: packages/command-registry/scripts/gen-extendscript.mjs
 *
 * Regenere com \`npm run build\`. O teste de drift em
 * packages/command-registry/tests/generated-drift.test.mjs falha se este arquivo
 * sair de sincronia com o fonte TypeScript.
 */
(function (global) {
  var DEFAULT_LOCALE = ${quote(defaultLocale)};

  var table = {
${entries}
  };

  /**
   * Resolve o rotulo de Undo no idioma do usuario. Locale desconhecido cai no
   * padrao: mostrar a chave crua no menu do After Effects seria pior que mostrar
   * o texto em ingles.
   */
  function undoLabelFor(descriptor, locale) {
    if (!descriptor || !descriptor.undoLabels) return "";
    if (locale && descriptor.undoLabels[locale]) return descriptor.undoLabels[locale];
    return descriptor.undoLabels[DEFAULT_LOCALE] || "";
  }

  global.MotionDescriptors = table;
  global.MotionDescriptors.__undoLabelFor = undoLabelFor;
}($.global));
`;
}

if (process.argv[1] && process.argv[1].endsWith("gen-extendscript.mjs")) {
  const rendered = await renderModule();

  if (process.argv.includes("--check")) {
    const current = await readFile(GENERATED_PATH, "utf8").catch(() => null);
    if (current !== rendered) {
      console.error("motion-descriptors.jsx está fora de sincronia. Rode `npm run build`.");
      process.exit(1);
    }
    console.log("motion-descriptors.jsx está sincronizado.");
  } else {
    await mkdir(path.dirname(GENERATED_PATH), { recursive: true });
    await writeFile(GENERATED_PATH, rendered, "utf8");
    console.log(`Descriptors ES5 gerados em ${path.relative(repoRoot, GENERATED_PATH)}.`);
  }
}
