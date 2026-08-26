import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

/**
 * Cobertura de `ae.layer.rename` e `ae.layer.reverse-order`.
 *
 * Os dois chegaram sem teste nenhum. São ~1.100 linhas, e a parte mais
 * sensível — o validador de regex — é exatamente o tipo de lógica cuja
 * regressão não aparece: uma regex catastrófica aceita não quebra nada visível,
 * só trava o After Effects num nome específico.
 */

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/commands/layer-rename.jsx",
  "src/commands/layer-reverse-order.jsx",
  "src/dispatch.jsx"
];

class FakeSource {
  constructor(nome) {
    this.name = nome;
  }
}

class FakeLayer {
  constructor(comp, nome, opcoes = {}) {
    this.comp = comp;
    this.name = nome;
    this.selected = opcoes.selected ?? true;
    this.startTime = opcoes.startTime ?? 0;
    this.trackMatteType = opcoes.trackMatteType ?? null;
    this.parent = null;
    this.source = opcoes.source === null ? null : new FakeSource(opcoes.source ?? `${nome}.mov`);
  }

  get index() {
    return this.comp.camadas.indexOf(this) + 1;
  }

  moveToBeginning() {
    const at = this.comp.camadas.indexOf(this);
    this.comp.camadas.splice(at, 1);
    this.comp.camadas.unshift(this);
  }

  moveAfter(outra) {
    const at = this.comp.camadas.indexOf(this);
    this.comp.camadas.splice(at, 1);
    this.comp.camadas.splice(this.comp.camadas.indexOf(outra) + 1, 0, this);
  }
}

class FakeCompItem {
  constructor() {
    this.camadas = [];
    this.width = 640;
    this.height = 360;
    this.time = 0;
  }

  get numLayers() {
    return this.camadas.length;
  }

  layer(indice) {
    return this.camadas[indice - 1] ?? null;
  }

  get selectedLayers() {
    return this.camadas.filter((camada) => camada.selected === true);
  }
}

async function fixture({ semComp = false } = {}) {
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: semComp ? null : comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(MODULES, { app, CompItem: FakeCompItem });
  return { scope, comp };
}

function empilha(comp, ...nomes) {
  return nomes.map((nome) => {
    const camada = new FakeLayer(comp, nome);
    comp.camadas.push(camada);
    return camada;
  });
}

function despacha(scope, command, commandArgs) {
  return JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: `t-${command}`,
        command,
        args: commandArgs,
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: { preserveSelection: true }
      })
    )
  );
}

function renameArgs(overrides = {}) {
  return {
    scope: "selected",
    prefix: "",
    suffix: "",
    find: "",
    replace: "",
    regex: false,
    counterStart: 1,
    padding: 0,
    sourceName: false,
    preview: false,
    ...overrides
  };
}

function reverseArgs(overrides = {}) {
  return {
    scope: "selected",
    preserveTrackMattes: true,
    preserveParents: true,
    reverseTimingToo: false,
    ...overrides
  };
}

const nomes = (comp) => comp.camadas.map((camada) => camada.name);

// ---------------------------------------------------------------- rename ---

test("o preview lista exatamente os nomes finais, e não escreve nenhum", async () => {
  // A §7 é literal: "Preview lista exatamente os nomes finais". Um preview que
  // divergisse do apply seria pior que nenhum preview — a pessoa confirmaria
  // uma coisa e receberia outra.
  const { scope, comp } = await fixture();
  empilha(comp, "alpha", "beta");

  const previsto = despacha(
    scope,
    "ae.layer.rename.preview",
    renameArgs({ preview: true, prefix: "SEQ_", padding: 2 })
  );

  assert.equal(previsto.ok, true);
  assert.deepEqual(
    previsto.data.items.map((item) => item.after),
    ["SEQ_alpha01", "SEQ_beta02"]
  );
  assert.deepEqual(nomes(comp), ["alpha", "beta"], "preview não pode escrever");

  const aplicado = despacha(scope, "ae.layer.rename", renameArgs({ prefix: "SEQ_", padding: 2 }));

  assert.equal(aplicado.ok, true);
  assert.deepEqual(
    nomes(comp),
    previsto.data.items.map((item) => item.after),
    "o apply precisa produzir exatamente o que o preview mostrou"
  );
});

test("o contador é determinístico e respeita início e padding", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "a", "b", "c");

  despacha(scope, "ae.layer.rename", renameArgs({ counterStart: 9, padding: 3, prefix: "L" }));

  assert.deepEqual(nomes(comp), ["La009", "Lb010", "Lc011"]);
});

test("find/replace literal não interpreta metacaracteres de regex", async () => {
  // Com `regex: false` o texto é literal. Tratar `.` como coringa aqui
  // renomearia camadas que a pessoa não pediu.
  const { scope, comp } = await fixture();
  empilha(comp, "a.b", "axb");

  despacha(scope, "ae.layer.rename", renameArgs({ find: ".", replace: "-" }));

  assert.deepEqual(nomes(comp), ["a-b", "axb"]);
});

test("regex conservadora funciona; regex catastrófica é recusada", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "cena_01_final");

  const ok = despacha(
    scope,
    "ae.layer.rename",
    renameArgs({ regex: true, find: "_[0-9]+_", replace: "-" })
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(nomes(comp), ["cena-final"]);

  // Grupo com alternância, quantificado de novo: o padrão clássico de
  // backtracking exponencial.
  const recusada = despacha(
    scope,
    "ae.layer.rename",
    renameArgs({ regex: true, find: "(a|aa)+$", replace: "x" })
  );
  assert.equal(recusada.ok, false);
  assert.equal(recusada.error.code, "INVALID_PRESET");
  assert.equal(recusada.error.details.field, "find");
});

test("o validador de regex recusa a família inteira de construções perigosas", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "x");

  const perigosas = [
    "(a+)+",
    "(a|aa)*",
    "(?:abc)+x{1,999999}",
    "(?=lookahead)",
    "(a)\\1",
    "a{2000}",
    "["
  ];

  for (const find of perigosas) {
    const resposta = despacha(scope, "ae.layer.rename", renameArgs({ regex: true, find, replace: "" }));
    assert.equal(resposta.ok, false, `deveria recusar: ${find}`);
    assert.equal(resposta.error.details.field, "find", `deveria recusar: ${find}`);
  }

  assert.deepEqual(nomes(comp), ["x"], "nenhuma recusa pode ter escrito");
});

test("sourceName sincroniza a fonte com o nome final da camada", async () => {
  // A §7 exige que renomear a fonte seja opção separada. Com a opção ligada, a
  // fonte recebe o nome FINAL da camada — e não o nome dela própria passado
  // pelas regras, que deixaria camada e fonte divergindo a cada aplicação.
  const semFonte = await fixture();
  const [a] = empilha(semFonte.comp, "camada");
  despacha(semFonte.scope, "ae.layer.rename", renameArgs({ prefix: "P_" }));
  assert.equal(a.name, "P_camada");
  assert.equal(a.source.name, "camada.mov", "a fonte não pode mudar sem sourceName");

  const comFonte = await fixture();
  const [b] = empilha(comFonte.comp, "camada");
  despacha(comFonte.scope, "ae.layer.rename", renameArgs({ prefix: "P_", sourceName: true }));
  assert.equal(b.source.name, "P_camada");
});

test("duas camadas com a mesma fonte e nomes finais divergentes são recusadas", async () => {
  // Sem este guarda, a última camada processada venceria e a fonte terminaria
  // com um nome que só corresponde a uma delas — em silêncio.
  const { scope, comp } = await fixture();
  const [a, b] = empilha(comp, "primeira", "segunda");
  const compartilhada = a.source;
  b.source = compartilhada;

  const resposta = despacha(scope, "ae.layer.rename", renameArgs({ sourceName: true, prefix: "X" }));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(nomes(comp), ["primeira", "segunda"], "nada pode ser escrito");
  assert.equal(compartilhada.name, "primeira.mov");
});

test("escopo composition alcança camadas não selecionadas", async () => {
  const { scope, comp } = await fixture();
  const [a, b] = empilha(comp, "a", "b");
  b.selected = false;

  despacha(scope, "ae.layer.rename", renameArgs({ scope: "composition", prefix: "X" }));

  assert.deepEqual(nomes(comp), ["Xa", "Xb"]);
  assert.ok(a.name.startsWith("X") && b.name.startsWith("X"));
});

test("renomear para o nome que já existe é no-op contado, não erro", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "a", "b");

  const resposta = despacha(scope, "ae.layer.rename", renameArgs());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 0);
  assert.equal(resposta.data.unchangedCount, 2);
});

test("argumentos de rename fora do contrato são recusados antes de escrever", async () => {
  const casos = [
    ["scope", { scope: "tudo" }],
    ["regex", { regex: "sim" }],
    ["padding", { padding: -1 }],
    ["sourceName", { sourceName: 1 }],
    ["preview", { preview: "nao" }],
    ["descricao", { descricao: "extra" }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    empilha(comp, "a");
    const resposta = despacha(scope, "ae.layer.rename", renameArgs(extras));
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.deepEqual(nomes(comp), ["a"]);
  }
});

// --------------------------------------------------------------- reverse ---

test("a ordem inverte, e o preview mostra a mesma ordem sem aplicá-la", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "topo", "meio", "base");

  const previsto = despacha(scope, "ae.layer.reverse-order.preview", reverseArgs());
  assert.equal(previsto.ok, true);
  assert.deepEqual(nomes(comp), ["topo", "meio", "base"], "preview não pode mover");

  const aplicado = despacha(scope, "ae.layer.reverse-order", reverseArgs());
  assert.equal(aplicado.ok, true);
  assert.deepEqual(nomes(comp), ["base", "meio", "topo"]);
});

test("o preview de reverse devolve registros, e não apenas nomes", async () => {
  // O painel tipava `before`/`after` como `string[]` e o guarda rejeitava a
  // prévia em silêncio: a lista ficava eternamente em "calculando". Só a
  // execução em host mostrou. Este teste fixa o formato do lado que o define.
  const { scope, comp } = await fixture();
  empilha(comp, "topo", "base");

  const previsto = despacha(scope, "ae.layer.reverse-order.preview", reverseArgs());

  for (const lista of [previsto.data.before, previsto.data.after]) {
    assert.ok(Array.isArray(lista));
    for (const entrada of lista) {
      assert.equal(typeof entrada, "object");
      assert.equal(typeof entrada.index, "number");
      assert.equal(typeof entrada.originalIndex, "number");
      assert.equal(typeof entrada.name, "string");
      assert.equal(typeof entrada.startTime, "number");
    }
  }
  assert.deepEqual(
    previsto.data.after.map((entrada) => entrada.name),
    ["base", "topo"]
  );
});

test("o preview de rename devolve índice, antes e depois por camada", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "um");

  const previsto = despacha(scope, "ae.layer.rename.preview", renameArgs({ preview: true, prefix: "N" }));

  assert.equal(typeof previsto.data.totalCount, "number");
  assert.equal(typeof previsto.data.changedCount, "number");
  assert.equal(typeof previsto.data.sourceChangedCount, "number");
  const [item] = previsto.data.items;
  assert.equal(typeof item.index, "number");
  assert.equal(item.before, "um");
  assert.equal(item.after, "Num");
});

test("o timing só muda quando pedido explicitamente", async () => {
  // A §7 é explícita: "timing só muda se checkbox explícito". Mover camadas no
  // tempo sem pedido destruiria sincronia que a pessoa montou à mão.
  const semTiming = await fixture();
  const [a, b] = empilha(semTiming.comp, "a", "b");
  a.startTime = 0;
  b.startTime = 2;

  despacha(semTiming.scope, "ae.layer.reverse-order", reverseArgs({ reverseTimingToo: false }));
  assert.equal(a.startTime, 0, "o tempo não pode mudar sozinho");
  assert.equal(b.startTime, 2);

  const comTiming = await fixture();
  const [c, d] = empilha(comTiming.comp, "c", "d");
  c.startTime = 0;
  d.startTime = 2;

  despacha(comTiming.scope, "ae.layer.reverse-order", reverseArgs({ reverseTimingToo: true }));
  assert.equal(c.startTime, 2);
  assert.equal(d.startTime, 0);
});

test("inverter duas vezes devolve a ordem original", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "a", "b", "c", "d");

  despacha(scope, "ae.layer.reverse-order", reverseArgs());
  despacha(scope, "ae.layer.reverse-order", reverseArgs());

  assert.deepEqual(nomes(comp), ["a", "b", "c", "d"]);
});

test("uma única camada não tem o que inverter", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "sozinha");

  const resposta = despacha(scope, "ae.layer.reverse-order", reverseArgs());

  // Reverter uma camada não é um pedido idempotente satisfeito: é um pedido que
  // não faz sentido, e o descriptor declara allowsNoopSuccess false.
  assert.equal(resposta.ok, false);
  assert.deepEqual(nomes(comp), ["sozinha"]);
});

test("argumentos de reverse fora do contrato são recusados", async () => {
  const casos = [
    ["scope", { scope: "todas" }],
    ["preserveTrackMattes", { preserveTrackMattes: 1 }],
    ["preserveParents", { preserveParents: "sim" }],
    ["reverseTimingToo", { reverseTimingToo: null }],
    ["extra", { extra: true }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    empilha(comp, "a", "b");
    const resposta = despacha(scope, "ae.layer.reverse-order", reverseArgs(extras));
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.details.field, campo);
    assert.deepEqual(nomes(comp), ["a", "b"]);
  }
});

test("sem seleção e sem composição falham com códigos distintos", async () => {
  const semSelecao = await fixture();
  const [a] = empilha(semSelecao.comp, "a");
  a.selected = false;
  assert.equal(despacha(semSelecao.scope, "ae.layer.rename", renameArgs()).error.code, "NO_SELECTION");

  const semComp = await fixture({ semComp: true });
  assert.equal(
    despacha(semComp.scope, "ae.layer.reverse-order", reverseArgs()).error.code,
    "NO_ACTIVE_COMP"
  );
});
