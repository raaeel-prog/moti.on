import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/commands/layer-list.jsx",
  "src/commands/layer-parent.jsx",
  "src/dispatch.jsx"
];

/**
 * Camada.
 *
 * `metodos` registra COMO cada parentesco foi feito. É o que importa aqui:
 * `parent =` preserva o world transform e `setParentWithJump` não — medido em
 * AE 26.3x87, em docs/research/after-effects-parenting.md. Escolher a chamada
 * errada não levanta exceção nenhuma; produz camadas visualmente erradas. Um
 * double que só guardasse o pai final aceitaria a inversão em silêncio.
 */
class FakeLayer {
  constructor(comp, nome) {
    this.comp = comp;
    this.name = nome;
    this.selected = false;
    this.nullLayer = false;
    this._parent = null;
    this.metodos = [];
  }

  get index() {
    return this.comp.camadas.indexOf(this) + 1;
  }

  get parent() {
    return this._parent;
  }

  set parent(valor) {
    this.metodos.push({ metodo: "parent=", alvo: valor ? valor.name : null });
    this._parent = valor;
  }

  setParentWithJump(valor) {
    this.metodos.push({ metodo: "withJump", alvo: valor ? valor.name : null });
    this._parent = valor;
  }
}

class FakeTextLayer extends FakeLayer {}
class FakeShapeLayer extends FakeLayer {}

class FakeCompItem {
  constructor() {
    this.camadas = [];
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

function args(overrides = {}) {
  return {
    targetLayerIndex: 0,
    targetLayerName: "",
    preserveWorldTransform: true,
    unparent: false,
    chainMode: "target",
    ...overrides
  };
}

function request(command, commandArgs) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "parent-1",
    command,
    args: commandArgs ?? {},
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { preserveSelection: true }
  });
}

async function fixture({ semComp = false } = {}) {
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: semComp ? null : comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    TextLayer: FakeTextLayer,
    ShapeLayer: FakeShapeLayer
  });
  return { scope, comp };
}

/** Acrescenta camadas na ordem da timeline, do topo para baixo. */
function empilha(comp, ...nomes) {
  return nomes.map((nome) => {
    const camada = new FakeLayer(comp, nome);
    comp.camadas.push(camada);
    return camada;
  });
}

function responder(scope, payload) {
  return JSON.parse(scope.MotionAE.dispatch(payload));
}

function parentear(scope, extras = {}) {
  return responder(scope, request("ae.layer.parent", args(extras)));
}

test("descriptors distinguem leitura de mutação", async () => {
  const { scope } = await fixture();

  const lista = scope.MotionDescriptors["ae.layer.list"];
  assert.equal(lista.mutates, false);
  assert.equal(lista.undoLabelKey, "undo.none");

  const parent = scope.MotionDescriptors["ae.layer.parent"];
  assert.equal(parent.mutates, true);
  assert.equal(parent.allowsNoopSuccess, true);
  assert.equal(parent.undoLabelKey, "undo.ae.layer.parent");
  // Parentesco é transform puro: exigir motor de expressões desabilitaria o
  // comando em projetos onde ele funciona perfeitamente.
  assert.deepEqual(parent.requirements, ["hasProject", "hasActiveComp"]);
});

test("a lista devolve índice, nome, tipo, pai e seleção", async () => {
  const { scope, comp } = await fixture();
  const [a, b] = empilha(comp, "A", "B");
  b.parent = a;
  b.selected = true;
  const texto = new FakeTextLayer(comp, "Titulo");
  comp.camadas.push(texto);

  const resposta = responder(scope, request("ae.layer.list"));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.totalCount, 3);
  assert.equal(resposta.data.truncated, false);
  assert.deepEqual(resposta.data.layers[0], {
    index: 1,
    name: "A",
    type: "other",
    parentIndex: null,
    selected: false
  });
  assert.deepEqual(resposta.data.layers[1], {
    index: 2,
    name: "B",
    type: "other",
    parentIndex: 1,
    selected: true
  });
  assert.equal(resposta.data.layers[2].type, "text");
});

test("preserveWorldTransform escolhe `parent =`, e não setParentWithJump", async () => {
  // Se estes dois testes trocarem de lugar, o comando continua "funcionando" e
  // as camadas pulam. Nenhuma exceção denunciaria.
  const { scope, comp } = await fixture();
  const [alvo, filha] = empilha(comp, "ALVO", "FILHA");
  filha.selected = true;

  const resposta = parentear(scope, { targetLayerIndex: 1, targetLayerName: "ALVO" });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 1);
  assert.equal(filha.parent, alvo);
  assert.deepEqual(filha.metodos, [{ metodo: "parent=", alvo: "ALVO" }]);
});

test("sem preserveWorldTransform o comando usa setParentWithJump", async () => {
  const { scope, comp } = await fixture();
  const [, filha] = empilha(comp, "ALVO", "FILHA");
  filha.selected = true;

  parentear(scope, {
    targetLayerIndex: 1,
    targetLayerName: "ALVO",
    preserveWorldTransform: false
  });

  assert.deepEqual(filha.metodos, [{ metodo: "withJump", alvo: "ALVO" }]);
});

test("desparentar zera o pai e não aceita alvo", async () => {
  const { scope, comp } = await fixture();
  const [alvo, filha] = empilha(comp, "ALVO", "FILHA");
  filha.parent = alvo;
  filha.metodos.length = 0;
  filha.selected = true;

  const resposta = parentear(scope, { unparent: true });

  assert.equal(resposta.ok, true);
  assert.equal(filha.parent, null);
  assert.deepEqual(filha.metodos, [{ metodo: "parent=", alvo: null }]);

  const comAlvo = parentear(scope, {
    unparent: true,
    targetLayerIndex: 1,
    targetLayerName: "ALVO"
  });
  assert.equal(comAlvo.ok, false);
  assert.equal(comAlvo.error.code, "INVALID_PRESET");
  assert.equal(comAlvo.error.details.field, "targetLayerIndex");
});

test("o encadeamento segue a ordem da timeline, não a da seleção", async () => {
  // `selectedLayers` não garante ordem. Encadear na ordem de seleção daria uma
  // hierarquia diferente a cada clique, com os mesmos inputs.
  const { scope, comp } = await fixture();
  const [alvo, a, b, c] = empilha(comp, "ALVO", "A", "B", "C");
  for (const camada of [a, b, c]) camada.selected = true;

  const resposta = parentear(scope, {
    targetLayerIndex: 1,
    targetLayerName: "ALVO",
    chainMode: "chain"
  });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 3);
  assert.equal(a.parent, b, "A vai para a de baixo");
  assert.equal(b.parent, c, "B vai para a de baixo");
  assert.equal(c.parent, alvo, "a última da pilha vai para o alvo");
});

test("encadear sem alvo é permitido; parentear sem alvo não é", async () => {
  const { scope, comp } = await fixture();
  const [a, b] = empilha(comp, "A", "B");
  a.selected = true;
  b.selected = true;

  const encadeia = parentear(scope, { chainMode: "chain" });
  assert.equal(encadeia.ok, true);
  assert.equal(a.parent, b);
  assert.equal(b.parent, null, "a última fica sem pai quando não há alvo");

  const semAlvo = parentear(scope, { chainMode: "target" });
  assert.equal(semAlvo.ok, false);
  assert.equal(semAlvo.error.details.field, "targetLayerIndex");
});

test("ciclo e auto-parentesco são recusados antes de qualquer mutação", async () => {
  const { scope, comp } = await fixture();
  const [avo, pai, filho] = empilha(comp, "AVO", "PAI", "FILHO");
  pai.parent = avo;
  filho.parent = pai;
  for (const camada of [avo, pai, filho]) camada.metodos.length = 0;

  // Parentear o avô ao neto fecharia o ciclo.
  avo.selected = true;
  const ciclo = parentear(scope, { targetLayerIndex: 3, targetLayerName: "FILHO" });
  assert.equal(ciclo.ok, false);
  assert.equal(ciclo.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(avo.metodos, [], "nada pode ser escrito antes da recusa");

  // Uma camada como pai de si mesma.
  avo.selected = false;
  pai.selected = true;
  const auto = parentear(scope, { targetLayerIndex: 2, targetLayerName: "PAI" });
  assert.equal(auto.ok, false);
  assert.equal(auto.error.code, "INVALID_SELECTION_TYPE");
});

test("o nome do alvo funciona como soma de verificação contra timeline mudado", async () => {
  // O índice sozinho acertaria a camada errada em silêncio se a pilha tivesse
  // mudado entre a leitura da lista e o clique em Aplicar.
  const { scope, comp } = await fixture();
  const [, filha] = empilha(comp, "ALVO", "FILHA");
  filha.selected = true;

  const resposta = parentear(scope, { targetLayerIndex: 1, targetLayerName: "OUTRO NOME" });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(filha.metodos, []);
});

test("alvo fora da composição é recusado", async () => {
  const { scope, comp } = await fixture();
  const [, filha] = empilha(comp, "ALVO", "FILHA");
  filha.selected = true;

  const resposta = parentear(scope, { targetLayerIndex: 99, targetLayerName: "ALVO" });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
});

test("reparentar para o mesmo pai é no-op, não reescrita", async () => {
  // Reescrever levaria o After Effects a recalcular o transform sem necessidade,
  // e cada reaplicação acumularia erro de arredondamento na posição.
  const { scope, comp } = await fixture();
  const [alvo, filha] = empilha(comp, "ALVO", "FILHA");
  filha.parent = alvo;
  filha.metodos.length = 0;
  filha.selected = true;

  const resposta = parentear(scope, { targetLayerIndex: 1, targetLayerName: "ALVO" });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 0);
  assert.equal(resposta.data.unchangedCount, 1);
  assert.deepEqual(filha.metodos, [], "nenhuma escrita para um estado já correto");
});

test("uma falha no meio restaura os pais pelo mesmo método da ida", async () => {
  // Restaurar por outro método deixaria a camada num terceiro lugar: `parent =`
  // preserva o mundo e `setParentWithJump` preserva os valores crus.
  const { scope, comp } = await fixture();
  const [, a, b] = empilha(comp, "ALVO", "A", "B");
  const antigo = new FakeLayer(comp, "ANTIGO");
  comp.camadas.push(antigo);
  a.parent = antigo;
  b.parent = antigo;
  a.metodos.length = 0;
  b.metodos.length = 0;
  a.selected = true;
  b.selected = true;

  // A segunda camada recusa a atribuição.
  Object.defineProperty(b, "parent", {
    get() {
      return this._parent;
    },
    set() {
      throw new Error("falha sintetica do host");
    },
    configurable: true
  });

  const resposta = parentear(scope, { targetLayerIndex: 1, targetLayerName: "ALVO" });

  assert.equal(resposta.ok, false);
  assert.equal(a.parent, antigo, "a primeira precisa voltar ao pai anterior");
  assert.deepEqual(a.metodos, [
    { metodo: "parent=", alvo: "ALVO" },
    { metodo: "parent=", alvo: "ANTIGO" }
  ]);
});

test("sem seleção e sem composição falham com códigos distintos", async () => {
  const semSelecao = await fixture();
  empilha(semSelecao.comp, "A");
  assert.equal(parentear(semSelecao.scope, { chainMode: "chain" }).error.code, "NO_SELECTION");

  const semComp = await fixture({ semComp: true });
  assert.equal(parentear(semComp.scope, { chainMode: "chain" }).error.code, "NO_ACTIVE_COMP");
});

test("argumentos fora do contrato são recusados", async () => {
  const casos = [
    ["preserveWorldTransform", { preserveWorldTransform: "sim" }],
    ["unparent", { unparent: 1 }],
    ["chainMode", { chainMode: "cascata" }],
    ["targetLayerIndex", { targetLayerIndex: -1 }],
    ["targetLayerIndex", { targetLayerIndex: 1.5 }],
    ["targetLayerName", { targetLayerName: 7 }],
    ["chainMode", { unparent: true, chainMode: "chain" }],
    // `chain` é o único modo que aceita índice 0, então é onde o nome órfão
    // fica isolado: no modo `target` a queixa mais fundamental é o alvo ausente.
    ["targetLayerName", { chainMode: "chain", targetLayerName: "sem indice" }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    const [, filha] = empilha(comp, "ALVO", "FILHA");
    filha.selected = true;

    const resposta = parentear(scope, extras);
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.deepEqual(filha.metodos, []);
  }
});

test("argumento desconhecido é recusado em vez de ignorado", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "A")[0].selected = true;

  const resposta = parentear(scope, { pivot: "center" });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.details.field, "pivot");
});
