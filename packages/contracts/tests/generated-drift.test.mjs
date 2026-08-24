import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GENERATED_PATH, renderModule } from "../scripts/gen-extendscript.mjs";
import { findBannedConstructs } from "../../../scripts/check-extendscript.mjs";

/**
 * O contrato existe duas vezes: em TypeScript, para o painel, e num modulo ES5
 * gerado, para o ExtendScript. Duas copias divergem — nao "podem divergir".
 * Estes testes sao o que torna a divergencia impossivel de passar despercebida.
 */

test("o arquivo gerado corresponde exatamente ao que o gerador produz hoje", async () => {
  const expected = await renderModule();
  const actual = await readFile(GENERATED_PATH, "utf8");

  assert.equal(
    actual,
    expected,
    "apps/after-effects-cep/host/generated/motion-contracts.jsx está desatualizado. " +
      "Rode `npm run build` para regenerá-lo. Nunca edite o arquivo à mão."
  );
});

test("o modulo gerado respeita o subconjunto ExtendScript", async () => {
  // Codigo gerado nao esta acima da regra. Se o gerador passar a emitir um
  // construto que o After Effects nao aceita, o host quebra no carregamento e a
  // origem seria dificil de rastrear.
  const source = await readFile(GENERATED_PATH, "utf8");
  assert.deepEqual(findBannedConstructs(source), []);
});

test("o modulo gerado avisa que nao deve ser editado a mao", async () => {
  const source = await readFile(GENERATED_PATH, "utf8");
  assert.match(source, /ARQUIVO GERADO/);
  assert.match(source, /gen-extendscript\.mjs/);
});

test("o gerador falha alto se o fonte do contrato mudar de forma", async () => {
  // renderModule le o fonte TypeScript por parsing textual. Se alguem trocar a
  // forma da declaracao de ERROR_CODES, o gerador tem que estourar, e nao emitir
  // um modulo vazio que o host carregaria sem reclamar.
  const rendered = await renderModule();
  assert.match(rendered, /global\.MotionContracts = \{/);
  assert.match(rendered, /PROTOCOL_VERSION: 1/);
  assert.match(rendered, /META_OPEN: "\[MOTION_META_V1\]"/);
  assert.match(rendered, /EXPRESSION_HEADER: "\/\/ MOTION_EXPRESSION v1 \| "/);
});
