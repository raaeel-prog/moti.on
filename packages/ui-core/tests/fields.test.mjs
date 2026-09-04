import test from "node:test";
import assert from "node:assert/strict";

import { checkboxField, numberField, searchField, selectField } from "../dist/shell.js";
import { createFakeDocument } from "./fake-dom.mjs";

test("selectField mantém label acessível e confirma somente opções declaradas pela view", () => {
  const document = createFakeDocument();
  let selected = null;
  const field = selectField(document, {
    id: "loop-type",
    label: "Tipo",
    value: "cycle",
    options: [
      { value: "cycle", label: "Ciclo" },
      { value: "pingpong", label: "Vai e volta" }
    ],
    onChange: (value) => {
      selected = value;
    }
  });

  const label = field.getElementsByTagName("label")[0];
  const select = field.getElementsByTagName("select")[0];
  assert.equal(label.htmlFor, "loop-type");
  assert.equal(select.id, "loop-type");
  assert.equal(select.value, "cycle");

  select.value = "pingpong";
  select.emit("change");
  assert.equal(selected, "pingpong");
});

test("numberField separa preview de commit e mantém unidade fora do valor", () => {
  const document = createFakeDocument();
  const inputs = [];
  const commits = [];
  const field = numberField(document, {
    id: "loop-duration",
    label: "Duração",
    value: 1.5,
    min: 0.01,
    max: 3600,
    step: 0.01,
    unit: "s",
    onInput: (value) => inputs.push(value),
    onCommit: (value) => commits.push(value)
  });

  const input = field.getElementsByTagName("input")[0];
  input.value = "2.25";
  input.emit("input");
  input.emit("change");

  assert.deepEqual(inputs, [2.25]);
  assert.deepEqual(commits, [2.25]);
  assert.match(field.allText, /Duração/);
  assert.match(field.allText, /s/);
  assert.doesNotMatch(field.allText, /2\.25 s/);
});

test("checkboxField propaga estado e campo desabilitado explica o motivo", () => {
  const document = createFakeDocument();
  let checked = null;
  const field = checkboxField(document, {
    id: "safe-mode",
    label: "Preservar expressão",
    checked: true,
    disabled: true,
    disabledReason: "Obrigatório nesta versão",
    onChange: (value) => {
      checked = value;
    }
  });

  const input = field.getElementsByTagName("input")[0];
  assert.equal(input.checked, true);
  assert.equal(input.disabled, true);
  assert.equal(input.title, "Obrigatório nesta versão");

  input.checked = false;
  input.emit("change");
  assert.equal(checked, false);
});

test("searchField reage a cada tecla, e nao so ao change", () => {
  // É o oposto deliberado de textField. Um campo de busca que só respondesse no
  // `change` faria o usuário digitar às cegas até tirar o foco do campo.
  const document = createFakeDocument();
  const teclas = [];
  const field = searchField(document, {
    id: "tools-search",
    label: "Buscar ferramenta",
    value: "",
    placeholder: "Nome ou descrição",
    onInput: (value) => teclas.push(value)
  });

  const label = field.getElementsByTagName("label")[0];
  const input = field.getElementsByTagName("input")[0];
  assert.equal(label.htmlFor, "tools-search");
  assert.equal(input.id, "tools-search");
  assert.equal(input.getAttribute("placeholder"), "Nome ou descrição");
  assert.equal(input.getAttribute("autocomplete"), "off");

  input.value = "ne";
  input.emit("input");
  input.value = "neo";
  input.emit("input");
  assert.deepEqual(teclas, ["ne", "neo"]);

  // `change` não pode disparar uma segunda vez: o consumidor filtraria duas
  // vezes o mesmo texto ao sair do campo.
  input.emit("change");
  assert.deepEqual(teclas, ["ne", "neo"]);
});

test("searchField cai para type=text quando o runtime nao conhece type=search", () => {
  // UXP não é um navegador completo; um input de tipo desconhecido vira um
  // campo inerte, e um filtro que não aceita digitação é pior que nenhum.
  const document = createFakeDocument();
  const original = document.createElement;
  document.createElement = (tag) => {
    const node = original.call(document, tag);
    if (tag === "input") {
      Object.defineProperty(node, "type", {
        get: () => node.__type ?? "text",
        set: (v) => {
          node.__type = v === "search" ? "text" : v;
        },
        configurable: true
      });
    }
    return node;
  };

  const field = searchField(document, {
    id: "busca",
    label: "Buscar",
    value: "",
    onInput: () => {}
  });
  document.createElement = original;

  const input = field.getElementsByTagName("input")[0];
  assert.equal(input.type, "text");
});
