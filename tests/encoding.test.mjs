import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

/**
 * Guarda de codificacao.
 *
 * Este projeto e escrito em portugues, e strings de interface passam por
 * ferramentas, scripts e editores diferentes. Quando um arquivo UTF-8 e lido
 * como Latin-1 e regravado, "Repeticao" vira "RepetiÃ§Ã£o" — e o resultado nao
 * quebra build, nao quebra teste e nao quebra tipo. Ele so aparece na tela do
 * usuario.
 *
 * Aconteceu de verdade: `loopOut.section.main`, `loopOut.section.safety` e uma
 * mensagem de log chegaram corrompidas ao repositorio e passaram por todos os
 * outros gates. Este teste existe para que a proxima vez seja um teste vermelho,
 * e nao um relato de usuario.
 */

const RAIZES = [
  new URL("../packages/", import.meta.url),
  new URL("../apps/", import.meta.url),
  new URL("../scripts/", import.meta.url),
  new URL("../tests/", import.meta.url)
];

const EXTENSOES = /\.(?:ts|tsx|mjs|js|jsx|json|css|html)$/;

/** Diretorios derivados: o que importa e o fonte, e dist/ e regerado. */
const IGNORADOS = new Set(["node_modules", "dist", "generated", ".tsbuildinfo"]);

/**
 * Sequencias que so aparecem quando UTF-8 foi interpretado como Latin-1.
 *
 * `Ã` seguido do intervalo abaixo cobre todas as acentuadas do portugues; `Â`
 * seguido de pontuacao cobre o caso de nao-quebra e simbolos. Um `Ã` legitimo
 * seguido de espaco ou fim de palavra nao casa.
 */
const MOJIBAKE = /Ã[-¿]|Â[-¿]|â€[“”]/;

async function listarArquivos(diretorio) {
  const encontrados = [];

  let entradas;
  try {
    entradas = await readdir(diretorio, { withFileTypes: true });
  } catch {
    return encontrados;
  }

  for (const entrada of entradas) {
    if (IGNORADOS.has(entrada.name)) continue;

    const url = new URL(entrada.name + (entrada.isDirectory() ? "/" : ""), diretorio);
    if (entrada.isDirectory()) {
      encontrados.push(...(await listarArquivos(url)));
    } else if (EXTENSOES.test(entrada.name)) {
      encontrados.push(url);
    }
  }

  return encontrados;
}

test("nenhum arquivo-fonte contem texto com codificacao corrompida", async () => {
  // Arrange
  const suspeitos = [];

  // Act
  for (const raiz of RAIZES) {
    for (const arquivo of await listarArquivos(raiz)) {
      const conteudo = await readFile(arquivo, "utf8");
      const linhas = conteudo.split("\n");

      for (let i = 0; i < linhas.length; i += 1) {
        const linha = linhas[i];
        // O proprio teste declara as sequencias que procura; ignora-lo evita que
        // o guarda acuse a si mesmo.
        if (arquivo.pathname.endsWith("tests/encoding.test.mjs")) continue;
        if (MOJIBAKE.test(linha)) {
          const caminho = arquivo.pathname.split("/moti.on/")[1] ?? arquivo.pathname;
          suspeitos.push(`${caminho}:${i + 1}: ${linha.trim().slice(0, 100)}`);
        }
      }
    }
  }

  // Assert
  assert.deepEqual(
    suspeitos,
    [],
    "Texto com codificação corrompida (UTF-8 lido como Latin-1). Regrave o arquivo em UTF-8."
  );
});

test("o detector reconhece as sequencias que motivaram este guarda", () => {
  // Sem isto, um detector quebrado passaria despercebido para sempre: ele
  // simplesmente nunca acusaria nada.
  assert.equal(MOJIBAKE.test("RepetiÃ§Ã£o"), true);
  assert.equal(MOJIBAKE.test("SeguranÃ§a"), true);
  assert.equal(MOJIBAKE.test("invÃ¡lida"), true);
  assert.equal(MOJIBAKE.test("ComposiÃ§Ã£o"), true);

  // Texto correto em portugues nao pode ser acusado.
  assert.equal(MOJIBAKE.test("Repetição"), false);
  assert.equal(MOJIBAKE.test("Segurança"), false);
  assert.equal(MOJIBAKE.test("Composição não é inválida"), false);
  assert.equal(MOJIBAKE.test("largura × altura"), false);
  assert.equal(MOJIBAKE.test("— travessão"), false);
});
