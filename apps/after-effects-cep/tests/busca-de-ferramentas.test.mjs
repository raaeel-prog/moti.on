/**
 * A ligação entre o painel do After Effects e o navegador de ferramentas.
 *
 * O comportamento do navegador — filtro, agrupamento, contagem, âncora de
 * teclado — é testado de verdade em `packages/ui-core/tests/tool-browser.test.mjs`,
 * contra o DOM falso. Este arquivo já teve essas verificações, mas todas eram
 * greps no código-fonte: provavam que uma linha existia, não que ela fazia a
 * coisa certa. Nenhuma delas pegaria "o filtro escondeu o ladrilho errado".
 *
 * O que sobra aqui é o que só existe deste lado: a categorização do catálogo e
 * as duas regras do adaptador que, se quebrarem, não produzem erro nenhum — só
 * um painel pior. A verificação continua estática porque `main.ts` monta o
 * shell no import; é a mesma técnica de `tool-icons.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fonte = readFileSync(path.join(raiz, "apps/after-effects-cep/client/src/main.ts"), "utf8");

/** Recorta do `{` de abertura até a chave que o fecha, contando aninhamento. */
function recortarBloco(texto, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "{") profundidade += 1;
    else if (c === "}") {
      profundidade -= 1;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

function corpoDe(assinatura) {
  const inicio = fonte.indexOf(assinatura);
  assert.ok(inicio >= 0, `${assinatura} não existe mais no painel`);
  const corpo = recortarBloco(fonte, fonte.indexOf("{", inicio));
  assert.ok(corpo !== null, `não consegui recortar o corpo de ${assinatura}`);
  return corpo;
}

const adaptador = corpoDe("function renderToolBrowser(");

test("o adaptador liga o catálogo real à biblioteca Quick", () => {
  assert.ok(adaptador.includes("createQuickLibrary"));
  assert.ok(adaptador.includes("navigation: libraryNavigation"));
});

test("toda categoria declarada tem ao menos uma ferramenta", () => {
  // O compilador já cobre o outro lado: `Record<ToolId, ToolCategory>` recusa
  // ferramenta sem categoria. O que ele NÃO vê é uma categoria vazia — ela
  // renderiza uma seção que nasce escondida, deixando uma chave de tradução
  // que nunca aparece e ninguém sabe que está morta.
  const ordem = [...fonte.matchAll(/const TOOL_CATEGORIES = \[([\s\S]*?)\] as const;/g)];
  assert.equal(ordem.length, 1, "TOOL_CATEGORIES não foi encontrado exatamente uma vez");
  const categorias = [...ordem[0][1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(categorias.length >= 2, `só ${categorias.length} categoria(s) lida(s)`);

  const inicioMapa = fonte.indexOf("const TOOL_CATEGORY: Record<ToolId, ToolCategory> = {");
  assert.ok(inicioMapa >= 0, "o mapa de categorias sumiu");
  const mapa = recortarBloco(fonte, fonte.indexOf("{", inicioMapa));
  const usadas = new Set([...mapa.matchAll(/:\s*"([a-z]+)"/g)].map((m) => m[1]));

  assert.deepEqual(
    categorias.filter((c) => !usadas.has(c)),
    [],
    "estas categorias não têm nenhuma ferramenta"
  );
  assert.deepEqual(
    [...usadas].filter((c) => !categorias.includes(c)),
    [],
    "estas categorias são usadas mas não estão na ordem de exibição"
  );
});

test("toda categoria tem rotulo localizado que existe no catalogo", () => {
  const inicio = fonte.indexOf("const CATEGORY_NAME_KEY: Record<ToolCategory, MessageKey> = {");
  assert.ok(inicio >= 0, "o mapa de rótulos sumiu");
  const mapa = recortarBloco(fonte, fonte.indexOf("{", inicio));
  const chaves = [...mapa.matchAll(/"(tools\.category\.[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(chaves.length >= 2, `só ${chaves.length} rótulo(s) lido(s)`);

  const locales = readFileSync(path.join(raiz, "packages/ui-core/src/locales.ts"), "utf8");
  assert.deepEqual(
    chaves.filter((chave) => !locales.includes(`"${chave}":`)),
    [],
    "estas categorias apontam para chave inexistente no catálogo"
  );
});

