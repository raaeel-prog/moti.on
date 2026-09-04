/**
 * Nenhum comando abre grupo de Undo próprio.
 *
 * O dispatcher envolve o `run` em `MotionUndo.withUndoGroup` quando o descriptor
 * declara `mutates`, e usa o rótulo localizado do próprio descriptor. O After
 * Effects **não aninha** grupos de Undo: um `endUndoGroup` dentro do comando
 * fecha o grupo de fora no meio da operação, e o que vier depois cai fora do
 * Undo. O usuário aperta Ctrl+Z e desfaz só um pedaço.
 *
 * Um comando com grupo próprio também perde o rótulo traduzido: o menu do host
 * passa a mostrar a string cravada no comando, em inglês.
 *
 * Este teste existe porque o defeito reapareceu. Foi corrigido em
 * `keys-reverse` e `keys-clone`, voltou em `parallax-advanced`, e estava em
 * cinco comandos ao mesmo tempo — inclusive `ae.project.clean`, que é
 * destrutivo e remove itens do projeto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const COMANDOS = new URL("../host/src/commands/", import.meta.url);

/**
 * Remove comentários antes de procurar a chamada.
 *
 * Sem isto o próprio comentário que explica a regra — presente em
 * `keys-reverse` e `keys-clone` — seria acusado como violação.
 */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("nenhum comando do host abre grupo de Undo proprio", async () => {
  const arquivos = (await readdir(COMANDOS)).filter((n) => n.endsWith(".jsx"));
  assert.ok(arquivos.length > 40, `poucos comandos encontrados (${arquivos.length})`);

  const infratores = [];
  for (const nome of arquivos) {
    const fonte = semComentarios(await readFile(new URL(nome, COMANDOS), "utf8"));
    const abre = (fonte.match(/app\.beginUndoGroup\s*\(/g) ?? []).length;
    const fecha = (fonte.match(/app\.endUndoGroup\s*\(/g) ?? []).length;
    if (abre > 0 || fecha > 0) infratores.push(`${nome}: ${abre} begin, ${fecha} end`);
  }

  assert.deepEqual(
    infratores,
    [],
    "estes comandos aninham grupo de Undo dentro do grupo que o dispatcher ja abriu"
  );
});

test("o dispatcher continua sendo quem abre o grupo", async () => {
  // A regra acima só faz sentido enquanto o dispatcher assume a
  // responsabilidade. Se ele parar, o teste de cima passaria a exigir o
  // contrário do necessário — e ninguém abriria grupo nenhum.
  const dispatch = await readFile(new URL("../host/src/dispatch.jsx", import.meta.url), "utf8");

  assert.match(dispatch, /MotionUndo\.withUndoGroup\(/, "o dispatcher nao abre mais o grupo de Undo");
  assert.match(
    dispatch,
    /__undoLabelFor\(/,
    "o dispatcher nao usa mais o rotulo localizado do descriptor"
  );
});
