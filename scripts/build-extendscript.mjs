/**
 * Monta a camada de host em ExtendScript a partir dos fontes em
 * apps/after-effects-cep/host/src/.
 *
 * Por que existe um passo de montagem em vez de uma copia:
 *
 * 1. A diretiva `#target aftereffects` nao e JavaScript valido. Enquanto ela
 *    estava dentro do arquivo-fonte, nem o `tsc --checkJs` nem o `node --check`
 *    conseguiam parsear o host, e a unica verificacao possivel era ler o codigo.
 *    Mantendo a diretiva aqui, o fonte volta a ser JavaScript ES5 legitimo e
 *    passa a ser verificavel por ferramenta.
 *
 * 2. O ExtendScript nao tem sistema de modulos. Conforme o host cresce
 *    (CHMS-004 traz JSON, sha256, redaction, registry e dispatch), a unica forma
 *    de dividir o codigo em arquivos e concatena-los numa ordem conhecida. Cada
 *    fonte e um IIFE proprio que se pendura em `$.global`, entao a concatenacao
 *    e segura desde que a ordem seja explicita.
 *
 * A ordem e uma lista literal, nunca um glob: um glob resolve em ordem de
 * sistema de arquivos, que varia entre plataformas, e isso quebraria tanto o
 * carregamento quanto a comparacao de bytes do build.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const hostSrc = path.join(root, "apps", "after-effects-cep", "host", "src");

/**
 * Ordem de concatenacao. Dependencias primeiro.
 *
 * Lista literal, nunca glob. Um glob resolve em ordem de sistema de arquivos,
 * que difere entre Windows, macOS e o runner do CI — e como cada modulo depende
 * dos globais que os anteriores penduraram em `$.global`, uma ordem diferente
 * quebra o carregamento dentro do After Effects, onde o erro e mais caro de
 * diagnosticar.
 *
 * Os caminhos com `../generated/` sao codigo gerado a partir do TypeScript. Eles
 * vem antes de tudo porque o dispatcher e os comandos leem MotionContracts e
 * MotionDescriptors.
 */
export const HOST_SOURCE_ORDER = [
  "../generated/motion-contracts.jsx",
  "../generated/motion-descriptors.jsx",
  "json.jsx",
  "undo.jsx",
  "registry.jsx",
  "commands/context-read.jsx",
  "commands/capability-probe.jsx",
  "commands/diagnostics-echo.jsx",
  "commands/demo-create-composition.jsx",
  // dispatch por ultimo: ele e o unico simbolo publico, e so faz sentido depois
  // que todos os comandos ja se registraram.
  "dispatch.jsx"
];

const TARGET_DIRECTIVE = "#target aftereffects\n";

export async function buildExtendScript(outputPath) {
  const chunks = [];

  for (const fileName of HOST_SOURCE_ORDER) {
    const source = await readFile(path.join(hostSrc, fileName), "utf8");

    // A verificacao e por posicao, nao por ocorrencia textual: os fontes
    // documentam a propria diretiva em comentario, e uma busca por substring
    // acusaria a documentacao. O que importa e a diretiva em posicao de codigo,
    // ou seja, no inicio de uma linha.
    if (/^#target\b/m.test(source)) {
      throw new Error(
        `${fileName} contém a diretiva #target em posição de código. Ela é emitida ` +
          "uma única vez por este script; deixá-la no fonte impede a checagem de " +
          "sintaxe e produziria diretivas duplicadas no arquivo montado."
      );
    }

    chunks.push(source);
  }

  // Um unico \n separa a diretiva do primeiro fonte, e os fontes ja terminam com
  // quebra de linha, entao a juncao usa \n para produzir exatamente uma linha em
  // branco entre blocos.
  const bundle = TARGET_DIRECTIVE + "\n" + chunks.join("\n");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bundle, "utf8");

  return { files: HOST_SOURCE_ORDER.length, bytes: Buffer.byteLength(bundle, "utf8") };
}
