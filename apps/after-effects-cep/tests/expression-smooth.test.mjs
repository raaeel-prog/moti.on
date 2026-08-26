import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { renderExpression } from "../../../packages/expression-library/dist/index.js";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/expression-templates.jsx",
  "src/commands/expression-smooth.jsx",
  "src/dispatch.jsx"
];

const PropertyType = { PROPERTY: 1, GROUP: 2 };
const PropertyValueType = {
  NO_VALUE: 0,
  ThreeD_SPATIAL: 1,
  ThreeD: 2,
  TwoD_SPATIAL: 3,
  TwoD: 4,
  OneD: 5,
  COLOR: 6,
  CUSTOM_VALUE: 7,
  MARKER: 8,
  LAYER_INDEX: 9,
  MASK_INDEX: 10,
  SHAPE: 11,
  TEXT_DOCUMENT: 12
};

const CANONICO = "// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(0.2, 5, time);";

class FakeProperty {
  constructor(options = {}) {
    this.propertyType = options.propertyType ?? PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.OneD;
    this.canSetExpression = options.canSetExpression ?? true;
    this.numKeys = options.numKeys ?? 2;
    this.selected = options.selected ?? true;
    this._expression = options.expression ?? "";
    this._expressionEnabled = options.expressionEnabled ?? false;
    this.expressionError = "";
    this.rejectSource = options.rejectSource ?? null;
    this.failRestoreTo = options.failRestoreTo;
    this.writes = [];
  }

  get expression() {
    return this._expression;
  }

  set expression(value) {
    this.writes.push({ field: "expression", value });
    if (this.failRestoreTo !== undefined && value === this.failRestoreTo && this._expression !== value) {
      throw new Error("restore failed");
    }
    this._expression = value;
    this._expressionEnabled = value !== "";
    this.expressionError = value === this.rejectSource ? "synthetic expression error" : "";
  }

  get expressionEnabled() {
    return this._expressionEnabled;
  }

  set expressionEnabled(value) {
    this.writes.push({ field: "expressionEnabled", value });
    this._expressionEnabled = value;
  }
}

function args(overrides = {}) {
  return {
    widthSeconds: 0.2,
    samples: 5,
    referenceTime: "current",
    conflictMode: "skip",
    ...overrides
  };
}

function request(commandArgs = args(), options = { preserveSelection: true }) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "smooth-1",
    command: "ae.expression.smooth",
    args: commandArgs,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options
  });
}

async function fixture(properties) {
  const calls = [];
  class FakeCompItem {
    constructor() {
      this.selectedProperties = properties;
      this.time = 1.25;
    }
  }
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup(label) {
      calls.push({ type: "beginUndoGroup", label });
    },
    endUndoGroup() {
      calls.push({ type: "endUndoGroup" });
    }
  };
  const scope = await loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    PropertyType,
    PropertyValueType
  });
  return { scope, app, comp, calls };
}

function responder(scope, payload) {
  return JSON.parse(scope.MotionAE.dispatch(payload));
}

test("descriptor do Smooth exige contexto real e declara no-op idempotente", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const descriptor = scope.MotionDescriptors["ae.expression.smooth"];

  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.destructive, false);
  assert.equal(descriptor.allowsNoopSuccess, true);
});

test("renderer produz a fonte canonica versionada", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  assert.equal(scope.MotionExpressions.renderSmooth(args()), CANONICO);
  assert.equal(
    scope.MotionExpressions.renderSmooth(args({ widthSeconds: 1.5, samples: 21, referenceTime: 0 })),
    "// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(1.5, 21, 0);"
  );
});

test("o host e a biblioteca TypeScript emitem exatamente a mesma fonte", async () => {
  // Duas implementacoes do mesmo template: uma em ES5 no host, outra em
  // TypeScript no painel. Se divergirem, `isManagedSmooth` deixa de reconhecer o
  // que o painel gerou e o comando passa a tratar a propria expressao como
  // conflito alheio.
  const { scope } = await fixture([new FakeProperty()]);

  const casos = [
    { widthSeconds: 0.2, samples: 5, referenceTime: "current" },
    { widthSeconds: 1.5, samples: 21, referenceTime: 0 },
    { widthSeconds: 3600, samples: 101, referenceTime: 12.75 },
    { widthSeconds: 0.001, samples: 1, referenceTime: "current" }
  ];

  for (const tokens of casos) {
    assert.equal(
      scope.MotionExpressions.renderSmooth(tokens),
      renderExpression({ id: "ae.expression.smooth", tokens }).source,
      `divergencia para ${JSON.stringify(tokens)}`
    );
  }
});

test("renderer recusa token fora de faixa em vez de emitir expressao", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ widthSeconds: 0 })), /Largura/);
  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ widthSeconds: 3601 })), /Largura/);
  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ samples: 0 })), /amostras/);
  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ samples: 4.5 })), /amostras/);
  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ samples: 102 })), /amostras/);
  assert.throws(() => scope.MotionExpressions.renderSmooth(args({ referenceTime: -1 })), /referencia/);
  assert.throws(
    () => scope.MotionExpressions.renderSmooth(args({ referenceTime: 'time); alert(1);//' })),
    /referencia/
  );
});

test("isManagedSmooth aceita o canonico e recusa corpo adulterado", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const managed = scope.MotionExpressions.isManagedSmooth;

  assert.equal(managed(CANONICO), true);
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(1.5, 21, 0);"), true);

  // Cabecalho gerenciado com corpo editado a mao nao pode passar por nosso.
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(0.2, 5, time); alert(1);"), false);
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.smooth\nwiggle(2, 30);"), false);
  assert.equal(managed("// MOTION_EXPRESSION v2 | ae.expression.smooth\nsmooth(0.2, 5, time);"), false);
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut(\"cycle\", 0);"), false);
  assert.equal(managed("smooth(0.2, 5, time);"), false);
  // Numero fora da forma canonica: 0.20 nao e o que o renderer emitiria.
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(0.20, 5, time);"), false);
  assert.equal(managed(""), false);
  assert.equal(managed(null), false);
});

test("recusa sem composicao ativa, sem selecao e com argumento desconhecido", async () => {
  const { scope, app, comp } = await fixture([new FakeProperty()]);

  comp.selectedProperties = [];
  assert.equal(responder(scope, request()).error.code, "NO_SELECTION");

  app.project.activeItem = null;
  assert.equal(responder(scope, request()).error.code, "NO_ACTIVE_COMP");

  app.project.activeItem = comp;
  comp.selectedProperties = [new FakeProperty()];
  const extra = responder(scope, request({ ...args(), inesperado: 1 }));
  assert.equal(extra.error.code, "INVALID_PRESET");
  assert.equal(extra.error.details.field, "inesperado");
});

test("recusa propriedade sem suporte a expressao numerica", async () => {
  const texto = new FakeProperty({ propertyValueType: PropertyValueType.TEXT_DOCUMENT });
  const { scope } = await fixture([texto]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(texto.writes, [], "nada pode ser escrito numa selecao recusada");
});

test("recusa propriedade com menos de dois keyframes", async () => {
  // smooth() sobre valor constante devolve a constante: o usuario leria o
  // sucesso como "o comando nao fez nada".
  const parada = new FakeProperty({ numKeys: 1 });
  const { scope } = await fixture([parada]);

  const resposta = responder(scope, request());

  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
  assert.equal(resposta.error.details.minimumKeys, 2);
  assert.deepEqual(parada.writes, []);
});

test("preserva expressao alheia e recusa o lote inteiro", async () => {
  // A primeira propriedade e valida; a segunda tem expressao do usuario. Nada
  // pode ser escrito, nem mesmo na primeira.
  const valida = new FakeProperty();
  const doUsuario = new FakeProperty({ expression: "wiggle(2, 30);", expressionEnabled: true });
  const { scope } = await fixture([valida, doUsuario]);

  const resposta = responder(scope, request());

  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.deepEqual(valida.writes, [], "conflito numa propriedade nao pode deixar outra ja escrita");
  assert.equal(doUsuario.expression, "wiggle(2, 30);");
});

test("aplica em toda a selecao e informa a contagem", async () => {
  const primeira = new FakeProperty();
  const segunda = new FakeProperty({ propertyValueType: PropertyValueType.ThreeD });
  const { scope, calls } = await fixture([primeira, segunda]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 2);
  assert.equal(resposta.data.unchangedCount, 0);
  assert.equal(primeira.expression, CANONICO);
  assert.equal(segunda.expression, CANONICO);
  assert.equal(primeira.expressionEnabled, true);

  // A mutacao inteira precisa caber num unico grupo de Undo.
  assert.equal(calls.filter((call) => call.type === "beginUndoGroup").length, 1);
  assert.equal(calls.filter((call) => call.type === "endUndoGroup").length, 1);
});

test("reaplicar o mesmo Smooth e sucesso sem mudanca, nao falha", async () => {
  const jaAplicada = new FakeProperty({ expression: CANONICO, expressionEnabled: true });
  const { scope } = await fixture([jaAplicada]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 0);
  assert.equal(resposta.data.unchangedCount, 1);
  assert.deepEqual(jaAplicada.writes, [], "estado ja correto nao pode gerar escrita");
});

test("substitui um Smooth gerenciado anterior por tokens novos", async () => {
  const anterior = new FakeProperty({ expression: CANONICO, expressionEnabled: true });
  const { scope } = await fixture([anterior]);

  const resposta = responder(scope, request(args({ widthSeconds: 1.5, samples: 21 })));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 1);
  assert.equal(anterior.expression, "// MOTION_EXPRESSION v1 | ae.expression.smooth\nsmooth(1.5, 21, time);");
});

test("rollback devolve o estado anterior quando o host recusa a expressao", async () => {
  // A segunda propriedade faz o After Effects reportar expressionError. A
  // primeira ja tinha sido escrita e precisa voltar ao que era.
  const primeira = new FakeProperty();
  const recusa = new FakeProperty({ rejectSource: CANONICO });
  const { scope } = await fixture([primeira, recusa]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, false);
  assert.equal(primeira.expression, "", "a propriedade escrita antes da falha precisa voltar");
  assert.equal(primeira.expressionEnabled, false);
});
