/**
 * `ToolDefinition.id` carrega a regra "precisa bater com uma chave de icone do
 * shell", mas nada a verificava: acrescentar uma ferramenta e esquecer o icone
 * passava por lint, typecheck e testes, e so aparecia como um quadrado vazio na
 * grade dentro do After Effects.
 *
 * O teste le os dois fontes em vez de importar o painel porque `main.ts` monta o
 * shell no import e precisaria de um DOM inteiro so para responder uma pergunta
 * estatica: quais ids existem, e quais icones existem.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function lerFonte(relativo) {
  return readFileSync(path.join(raiz, relativo), "utf8");
}

/** Ids declarados no registro de ferramentas do painel do After Effects. */
function idsDeFerramenta() {
  const fonte = lerFonte("apps/after-effects-cep/client/src/main.ts");
  const inicio = fonte.indexOf("const TOOLS: readonly ToolDefinition[] = [");
  assert.ok(inicio >= 0, "registro TOOLS nao encontrado");
  const fim = fonte.indexOf("\n];", inicio);
  assert.ok(fim > inicio, "fim do registro TOOLS nao encontrado");

  const bloco = fonte.slice(inicio, fim);
  const ids = [...bloco.matchAll(/^\s{4}id: "([a-zA-Z]+)",$/gm)].map((m) => m[1]);
  assert.ok(ids.length > 0, "nenhum id de ferramenta encontrado");
  return ids;
}

/** Chaves de um dos dois mapas de icone do shell. */
function chavesDeIcone(nomeDoMapa) {
  const fonte = lerFonte("packages/ui-core/src/shell.ts");
  const inicio = fonte.indexOf(`const ${nomeDoMapa}: Record<string, string> = {`);
  assert.ok(inicio >= 0, `${nomeDoMapa} nao encontrado`);
  const fim = fonte.indexOf("\n};", inicio);
  assert.ok(fim > inicio, `fim de ${nomeDoMapa} nao encontrado`);

  const bloco = fonte.slice(inicio, fim);
  return [...bloco.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((m) => m[1]);
}

test("toda ferramenta da grade tem desenho e glifo de icone", () => {
  const ids = idsDeFerramenta();
  const desenhos = chavesDeIcone("ICON_PATHS");
  const glifos = chavesDeIcone("ICON_FALLBACKS");

  const semDesenho = ids.filter((id) => !desenhos.includes(id));
  assert.deepEqual(semDesenho, [], `ferramenta sem entrada em ICON_PATHS: ${semDesenho.join(", ")}`);

  // O glifo textual e o que aparece num runtime sem createElementNS. Sem ele a
  // ferramenta existe mas o ladrilho fica mudo.
  const semGlifo = ids.filter((id) => !glifos.includes(id));
  assert.deepEqual(semGlifo, [], `ferramenta sem entrada em ICON_FALLBACKS: ${semGlifo.join(", ")}`);
});

/** Pares `chave: "valor"` de um dos dois mapas de icone. */
function paresDeIcone(nomeDoMapa) {
  const fonte = lerFonte("packages/ui-core/src/shell.ts");
  const inicio = fonte.indexOf(`const ${nomeDoMapa}: Record<string, string> = {`);
  assert.ok(inicio >= 0, `${nomeDoMapa} nao encontrado`);
  const fim = fonte.indexOf("\n};", inicio);
  const bloco = fonte.slice(inicio, fim);
  return [...bloco.matchAll(/^\s{2}([a-zA-Z]+): "([^"]+)"/gm)].map((m) => [m[1], m[2]]);
}

/** @param {Array<[string, string]>} pares */
function valoresRepetidos(pares) {
  const porValor = new Map();
  for (const [chave, valor] of pares) {
    if (!porValor.has(valor)) porValor.set(valor, []);
    porValor.get(valor).push(chave);
  }
  return [...porValor.entries()]
    .filter(([, chaves]) => chaves.length > 1)
    .map(([, chaves]) => chaves.join(" = "));
}

test("os glifos de fallback sao distintos entre si", () => {
  // Dois ladrilhos com o mesmo glifo sao indistinguiveis no runtime sem SVG, que
  // e exatamente o runtime onde o glifo e a unica pista visual.
  assert.deepEqual(valoresRepetidos(paresDeIcone("ICON_FALLBACKS")), [], "ha glifo de fallback repetido");
});

test("os desenhos SVG sao distintos entre si", () => {
  // Este teste faltava, e por isso tres ferramentas — Formas, Illustrator para
  // vetor e Texto para vetor — passaram a compartilhar o mesmo caminho SVG sem
  // que nada acusasse. O guarda do glifo existia; o do desenho, nao. E o SVG e
  // justamente o que aparece no CEP, onde `createElementNS` existe.
  assert.deepEqual(valoresRepetidos(paresDeIcone("ICON_PATHS")), [], "ha desenho de icone repetido");
});

test("o registro de ferramentas cobre os comandos P1 do master spec", async () => {
  const { COMMAND_DESCRIPTORS } = await import("../../../packages/command-registry/dist/descriptors.js");
  const registrados = COMMAND_DESCRIPTORS.map((descriptor) => descriptor.id);

  // Lista literal da secao "P1 — Core After Effects" do master spec. Escrita a
  // mao de proposito: derivar do proprio registro faria o teste concordar com
  // qualquer coisa que estivesse la.
  const p1 = [
    "ae.expression.wiggle",
    "ae.expression.flicker",
    "ae.text.box",
    "ae.animate.inertial",
    "ae.animate.jump",
    "ae.expression.loopout",
    "ae.expression.smooth",
    "ae.keys.cut",
    "ae.keys.delay",
    "ae.layer.create-null",
    "ae.keys.copy",
    "ae.layer.flip",
    "ae.layer.parent",
    "ae.layer.rename",
    "ae.layer.reverse-order"
  ];

  const faltando = p1.filter((id) => !registrados.includes(id));
  assert.deepEqual(faltando, [], `comando P1 sem descriptor: ${faltando.join(", ")}`);
});
