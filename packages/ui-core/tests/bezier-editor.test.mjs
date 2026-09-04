/**
 * O editor de curva do CHMS-018 nascia sem teste, sem teclado e com cor fora do
 * tema. Estes testes fixam as tres coisas.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createFakeDocument } from "./fake-dom.mjs";
import { bezierEditor } from "../dist/index.js";

const rotulos = {
  label: "Curva de suavização",
  outHandleLabel: "Alça de saída",
  inHandleLabel: "Alça de entrada"
};

function montar(overrides = {}) {
  const doc = createFakeDocument();
  const mudancas = [];
  const node = bezierEditor(doc, {
    x1: 0.25,
    y1: 0.1,
    x2: 0.25,
    y2: 1,
    ...rotulos,
    onChange: (x1, y1, x2, y2) => mudancas.push([x1, y1, x2, y2]),
    ...overrides
  });
  const alcas = node.getElementsByTagName("circle");
  return { doc, node, mudancas, alcas };
}

test("as alcas sao paradas de Tab, com papel e nome acessivel", () => {
  const { node, alcas } = montar();

  const svg = node.getElementsByTagName("svg")[0];
  assert.equal(svg.getAttribute("role"), "group");
  assert.equal(svg.getAttribute("aria-label"), rotulos.label);

  assert.equal(alcas.length, 2);
  assert.equal(alcas[0].getAttribute("role"), "slider");
  assert.equal(alcas[0].getAttribute("tabindex"), "0");
  assert.equal(alcas[0].getAttribute("aria-label"), rotulos.outHandleLabel);
  assert.equal(alcas[1].getAttribute("aria-label"), rotulos.inHandleLabel);
});

test("as setas movem a alca e o valor lido acompanha", () => {
  const { mudancas, alcas } = montar();

  assert.equal(alcas[0].getAttribute("aria-valuetext"), "0.25, 0.1");

  const evento = alcas[0].keydown("ArrowRight");
  assert.equal(evento.defaultPrevented, true, "a seta precisa consumir o evento");
  assert.deepEqual(mudancas.at(-1), [0.26, 0.1, 0.25, 1]);
  assert.equal(alcas[0].getAttribute("aria-valuetext"), "0.26, 0.1");

  alcas[0].keydown("ArrowUp");
  assert.deepEqual(mudancas.at(-1), [0.26, 0.11, 0.25, 1]);
});

test("o eixo X para em 0 e em 1, que e o limite do segmento no After Effects", () => {
  const { mudancas, alcas } = montar({ x1: 0.99, y1: 0.5 });

  alcas[0].keydown("End");
  assert.equal(mudancas.at(-1)[0], 1);

  alcas[0].keydown("ArrowRight");
  assert.equal(mudancas.at(-1)[0], 1, "nao pode passar de 1");

  alcas[0].keydown("Home");
  assert.equal(mudancas.at(-1)[0], 0);

  alcas[0].keydown("ArrowLeft");
  assert.equal(mudancas.at(-1)[0], 0, "nao pode ficar negativo");
});

test("o eixo Y aceita overshoot, porque a curva com ultrapassagem e legitima", () => {
  const { mudancas, alcas } = montar({ x1: 0.5, y1: 1 });

  alcas[0].keydown("ArrowUp");
  assert.ok(mudancas.at(-1)[1] > 1, `esperava passar de 1, veio ${mudancas.at(-1)[1]}`);
});

test("tecla sem funcao nao mexe na curva nem consome o evento", () => {
  const { mudancas, alcas } = montar();

  const evento = alcas[0].keydown("a");
  assert.equal(evento.defaultPrevented, false);
  assert.equal(mudancas.length, 0);
});

test("nenhuma cor literal: o desenho inteiro vem por classe do tema", () => {
  const { node } = montar();

  const todos = [node, ...node.getElementsByTagName("svg"), ...node.getElementsByTagName("circle"),
    ...node.getElementsByTagName("path"), ...node.getElementsByTagName("line"),
    ...node.getElementsByTagName("rect")];

  for (const elemento of todos) {
    const classe = elemento.className || elemento.getAttribute("class") || "";
    assert.match(classe, /^ch-bezier/, `elemento ${elemento.tagName} sem classe do tema`);
    for (const atributo of ["fill", "stroke", "style"]) {
      assert.equal(
        elemento.getAttribute(atributo),
        undefined,
        `${elemento.tagName} define ${atributo} no elemento em vez de usar token`
      );
    }
  }
});

test("runtime sem createElementNS recebe o container vazio, e nao uma excecao", () => {
  const doc = createFakeDocument({ supportsNamespaces: false });
  const node = bezierEditor(doc, { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1, ...rotulos, onChange: () => {} });

  assert.equal(node.className, "ch-bezier");
  assert.equal(node.children.length, 0);
});

test("o editor nao registra listener no document", () => {
  const doc = createFakeDocument();
  let registrosNoDocumento = 0;
  doc.addEventListener = () => {
    registrosNoDocumento += 1;
  };

  bezierEditor(doc, { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1, ...rotulos, onChange: () => {} });

  // A versao anterior pendurava mousemove e mouseup no document e tentava
  // remove-los com um MutationObserver que so via remocao direta do container:
  // a cada redesenho da view sobrava um par de listeners.
  assert.equal(registrosNoDocumento, 0);
});
