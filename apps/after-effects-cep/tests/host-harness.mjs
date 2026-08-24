/**
 * Carrega modulos ExtendScript do host dentro do Node, para poderem ser
 * testados.
 *
 * Sem isto, a camada de host so seria exercitavel abrindo o After Effects a mao
 * — ou seja, na pratica, nao seria exercitada. Como todo modulo do host e um
 * IIFE que se pendura em `$.global`, basta fornecer um `$` falso e avaliar o
 * arquivo.
 *
 * Isto NAO substitui teste no host real. O que roda aqui e a logica pura:
 * serializacao, parsing, decisao do dispatcher, ordem de chamadas. O que so o
 * After Effects prova — se `beginUndoGroup` realmente agrupa, se o canal
 * `evalScript` preserva os bytes — continua em docs/HOST_LIMITATIONS.md como
 * IMPLEMENTED_NOT_HOST_VERIFIED.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Cria um escopo global falso equivalente ao `$.global` do ExtendScript.
 *
 * `hostGlobals` injeta os objetos que o After Effects fornece: `app`,
 * `CompItem`, `ParagraphJustification` e afins. Cada teste monta exatamente o
 * que precisa, e um teste que se esqueceu de montar algo falha com
 * "is not defined" em vez de passar por acidente.
 */
export async function loadHostModules(fileNames, hostGlobals = {}) {
  const scope = {};
  const dollar = { global: scope };

  for (const fileName of fileNames) {
    const source = await readFile(path.join(appRoot, "host", fileName), "utf8");

    if (/^#target\b/m.test(source)) {
      throw new Error(
        `${fileName} contém #target em posição de código. Ela é emitida apenas pelo build.`
      );
    }

    // O que um modulo anterior pendurou em $.global precisa estar visivel como
    // identificador nu para os proximos. E assim que funciona no ExtendScript:
    // `$.global.MotionJson = ...` torna `MotionJson` um global de verdade. Sem
    // reconstruir a lista a cada modulo, `dispatch.jsx` nao enxergaria
    // `MotionContracts`, e a ordem declarada em HOST_SOURCE_ORDER nao estaria
    // sendo exercitada de fato.
    const injected = { ...hostGlobals, ...scope };
    const globalNames = ["$", ...Object.keys(injected)];
    const globalValues = [dollar, ...Object.values(injected)];

    // new Function e restrito a este harness de teste. O codigo avaliado vem do
    // proprio repositorio e nunca de dado externo, e nada disto entra no bundle
    // distribuido — a secao 24 proibe geracao de codigo em runtime no produto,
    // nao no test runner.
    const factory = new Function(...globalNames, source);
    factory(...globalValues);
  }

  return scope;
}
