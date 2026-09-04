/**
 * A busca da grade de ferramentas.
 *
 * O que este teste protege é um bug de uma linha: se o `onInput` do campo de
 * busca chamar `shell.rerender()`, o redesenho recria o próprio input e o foco
 * morre a cada tecla. O painel fica digitável só uma letra por vez, e nada —
 * lint, typecheck, os outros testes — acusa isso.
 *
 * A verificação é estática porque `main.ts` monta o shell no import: importá-lo
 * exigiria um DOM inteiro para responder uma pergunta sobre o próprio código.
 * É a mesma técnica de `tool-icons.test.mjs` e `padroes-aceitos.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MAIN = path.join(raiz, "apps/after-effects-cep/client/src/main.ts");

/** Recorta do `{` de abertura até a chave que o fecha, contando aninhamento. */
function recortarBloco(fonte, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === "{") profundidade += 1;
    else if (c === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  return null;
}

function corpoDe(fonte, assinatura) {
  const inicio = fonte.indexOf(assinatura);
  assert.ok(inicio >= 0, `${assinatura} não existe mais no painel`);
  const corpo = recortarBloco(fonte, fonte.indexOf("{", inicio));
  assert.ok(corpo !== null, `não consegui recortar o corpo de ${assinatura}`);
  return corpo;
}

const fonte = readFileSync(MAIN, "utf8");
const navegador = corpoDe(fonte, "function renderToolBrowser(");

test("o recorte pega mesmo o navegador de ferramentas, e nao um trecho qualquer", () => {
  // Instrumento antes da medida: um recorte vazio faria os testes abaixo
  // passarem sem verificar nada.
  assert.ok(navegador.includes("searchField("), "o campo de busca sumiu do navegador");
  assert.ok(navegador.includes("toolGrid("), "a grade sumiu do navegador");
  assert.ok(navegador.length > 500, "o recorte veio curto demais para ser o corpo real");
});

test("o filtro nao redesenha a tela: o foco precisa sobreviver a digitacao", () => {
  const inicioDoInput = navegador.indexOf("onInput:");
  assert.ok(inicioDoInput >= 0, "o campo de busca não tem onInput");

  // O corpo do onInput vai do `{` seguinte até a chave que o fecha.
  const corpoDoInput = recortarBloco(navegador, navegador.indexOf("{", inicioDoInput));
  assert.ok(corpoDoInput !== null, "não consegui recortar o corpo do onInput");

  assert.ok(
    !corpoDoInput.includes("rerender"),
    "onInput chama rerender: o input é recriado e o foco morre a cada tecla"
  );
});

test("escolher uma ferramenta continua redesenhando", () => {
  // O contraponto do teste acima: o `onSelect` do ladrilho **precisa**
  // redesenhar, porque troca a tela inteira. Sem esta asserção, apagar o
  // rerender de lá também passaria.
  const inicioDoSelect = navegador.indexOf("onSelect:");
  assert.ok(inicioDoSelect >= 0, "o ladrilho não tem onSelect");
  const corpoDoSelect = recortarBloco(navegador, navegador.indexOf("{", inicioDoSelect));
  assert.ok(corpoDoSelect?.includes("rerender"), "onSelect precisa redesenhar ao abrir a ferramenta");
});

test("a consulta sobrevive ao redesenho, em vez de morar so no input", () => {
  // Voltar da ferramenta para a grade remonta tudo. Se a consulta morasse
  // apenas no DOM, o filtro se perderia nessa volta e a grade reapareceria
  // inteira sem o usuário ter apagado nada.
  assert.ok(navegador.includes("state.toolQuery"), "a consulta não está no estado do painel");
  assert.ok(
    navegador.includes("aplicarFiltro(state.toolQuery)"),
    "o filtro não é reaplicado a partir do estado quando a grade é remontada"
  );
});

test("a busca cobre nome e descricao, e a contagem nao interrompe o leitor de tela", () => {
  assert.ok(
    navegador.includes("item.nameKey") && navegador.includes("item.descriptionKey"),
    "a busca precisa olhar nome e descrição"
  );
  assert.ok(
    navegador.includes('"status"') && navegador.includes('"polite"'),
    "a contagem muda a cada tecla: precisa ser status/polite, nunca alert"
  );
});
