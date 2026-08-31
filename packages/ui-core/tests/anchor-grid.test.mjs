import test from "node:test";
import assert from "node:assert/strict";

import { anchorGrid } from "../dist/shell.js";
import { createFakeDocument } from "./fake-dom.mjs";

/**
 * A grade 3x3 do alinhador de ancora.
 *
 * O `radiogroup` da ARIA nao e so um rotulo: promete que **uma** parada de
 * tabulacao chega ao grupo e que as setas andam dentro dele. Nove botoes
 * tabulaveis com setas inertes cumprem a aparencia e quebram a promessa, e o
 * usuario de teclado paga por nove Tab para atravessar um controle.
 */

const PONTOS = [
  "topLeft", "topCenter", "topRight",
  "middleLeft", "center", "middleRight",
  "bottomLeft", "bottomCenter", "bottomRight"
];

function montaGrade(valor, extras) {
  const document = createFakeDocument();
  const escolhas = [];
  const grade = anchorGrid(document, {
    value: valor,
    labels: PONTOS.map((ponto) => ({ value: ponto, label: ponto })),
    onSelect: (v) => escolhas.push(v),
    ...(extras || {})
  });
  return { document, grade, celulas: grade.children, escolhas };
}

test("apenas a celula marcada fica na ordem de tabulacao", () => {
  const { celulas } = montaGrade("center");

  const tabulaveis = celulas.filter((c) => c.getAttribute("tabindex") === "0");
  assert.equal(tabulaveis.length, 1, "o radiogroup e uma unica parada de Tab");
  assert.equal(tabulaveis[0].getAttribute("aria-label"), "center");
  assert.equal(celulas[0].getAttribute("tabindex"), "-1");
});

test("a grade continua alcancavel quando o valor nao corresponde a celula alguma", () => {
  const { celulas } = montaGrade("valorDesconhecido");

  const tabulaveis = celulas.filter((c) => c.getAttribute("tabindex") === "0");
  assert.equal(tabulaveis.length, 1, "sem isto o grupo inteiro sai do teclado");
  assert.equal(tabulaveis[0].getAttribute("aria-label"), "topLeft");
});

test("as setas horizontais andam pela grade e ja selecionam", () => {
  const { document, celulas, escolhas } = montaGrade("center");

  const evento = celulas[4].keydown("ArrowRight");

  assert.deepEqual(escolhas, ["middleRight"], "no radiogroup mover e escolher");
  assert.equal(document.activeElement, celulas[5], "o foco acompanha a escolha");
  assert.equal(evento.defaultPrevented, true, "a seta nao pode rolar o painel");
});

test("as setas verticais andam de linha, que e o que a geometria promete", () => {
  const { document, celulas, escolhas } = montaGrade("center");

  celulas[4].keydown("ArrowDown");

  assert.deepEqual(escolhas, ["bottomCenter"]);
  assert.equal(document.activeElement, celulas[7]);
});

test("as bordas dao a volta em vez de prender o foco", () => {
  const primeira = montaGrade("topLeft");
  primeira.celulas[0].keydown("ArrowLeft");
  assert.deepEqual(primeira.escolhas, ["bottomRight"]);

  const ultima = montaGrade("bottomRight");
  ultima.celulas[8].keydown("ArrowDown");
  assert.deepEqual(ultima.escolhas, ["topRight"], "a coluna da a volta, nao a lista");
});

test("Home e End vao aos extremos", () => {
  const inicio = montaGrade("center");
  inicio.celulas[4].keydown("Home");
  assert.deepEqual(inicio.escolhas, ["topLeft"]);

  const fim = montaGrade("center");
  fim.celulas[4].keydown("End");
  assert.deepEqual(fim.escolhas, ["bottomRight"]);
});

test("teclas alheias ao grupo seguem para o painel", () => {
  const { celulas, escolhas } = montaGrade("center");

  const evento = celulas[4].keydown("Tab");

  assert.deepEqual(escolhas, [], "Tab sai do grupo, nao anda dentro dele");
  assert.equal(evento.defaultPrevented, false);
});

test("a grade desabilitada nao anda nem escolhe pelo teclado", () => {
  const { document, celulas, escolhas } = montaGrade("center", { disabled: true });

  celulas[4].keydown("ArrowRight");

  assert.deepEqual(escolhas, []);
  assert.equal(document.activeElement, null, "foco em controle desabilitado nao");
});
