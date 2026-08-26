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
  "src/commands/expression-wiggle.jsx",
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

const CANONICO =
  "// MOTION_EXPRESSION v1 | ae.expression.wiggle\nseedRandom(0);\nwiggle(2, 30, 1, 0.5);";

class FakeProperty {
  constructor(options = {}) {
    this.propertyType = options.propertyType ?? PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.OneD;
    this.canSetExpression = options.canSetExpression ?? true;
    // Padrao 0: wiggle nao exige animacao previa, e o fixture reflete isso.
    this.numKeys = options.numKeys ?? 0;
    this.selected = options.selected ?? true;
    this._expression = options.expression ?? "";
    this._expressionEnabled = options.expressionEnabled ?? false;
    this.expressionError = "";
    this.rejectSource = options.rejectSource ?? null;
    this.writes = [];
  }

  get expression() {
    return this._expression;
  }

  set expression(value) {
    this.writes.push({ field: "expression", value });
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
    frequency: 2,
    amplitude: 30,
    octaves: 1,
    amplitudeMultiplier: 0.5,
    seed: 0,
    conflictMode: "skip",
    ...overrides
  };
}

function request(commandArgs = args()) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "wiggle-1",
    command: "ae.expression.wiggle",
    args: commandArgs,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { preserveSelection: true }
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

test("descriptor do Wiggle exige contexto real e declara no-op idempotente", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const descriptor = scope.MotionDescriptors["ae.expression.wiggle"];

  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.destructive, false);
  assert.equal(descriptor.allowsNoopSuccess, true);
});

test("wiggle aplica em propriedade SEM keyframes", async () => {
  // Esta e a diferenca de contrato em relacao a LoopOut e Smooth. Sacudir uma
  // camada parada e o uso principal do wiggle; exigir animacao previa aqui
  // bloquearia o caso mais comum.
  const parada = new FakeProperty({ numKeys: 0 });
  const { scope } = await fixture([parada]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 1);
  assert.equal(parada.expression, CANONICO);
  assert.equal(parada.expressionEnabled, true);
});

test("o renderer emite seedRandom antes do wiggle e nunca o argumento timeless", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  const fonte = scope.MotionExpressions.renderWiggle({
    frequency: 2,
    amplitude: 30,
    octaves: 1,
    amplitudeMultiplier: 0.5,
    seed: 0
  });

  assert.equal(fonte, CANONICO);
  assert.ok(!fonte.includes("timeless"));
  assert.ok(
    fonte.indexOf("seedRandom(") < fonte.indexOf("wiggle("),
    "a semente precisa ser fixada antes da chamada que ela governa"
  );
});

test("o host e a biblioteca TypeScript emitem exatamente a mesma fonte", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  const casos = [
    { frequency: 2, amplitude: 30, octaves: 1, amplitudeMultiplier: 0.5, seed: 0 },
    { frequency: 0.25, amplitude: 1000, octaves: 3, amplitudeMultiplier: 0, seed: 42 },
    { frequency: 100, amplitude: 0, octaves: 10, amplitudeMultiplier: 10, seed: 100000 },
    { frequency: 3.5, amplitude: 12.75, octaves: 2, amplitudeMultiplier: 0.75, seed: 7 }
  ];

  for (const tokens of casos) {
    assert.equal(
      scope.MotionExpressions.renderWiggle(tokens),
      renderExpression({ id: "ae.expression.wiggle", tokens }).source,
      `divergencia para ${JSON.stringify(tokens)}`
    );
  }
});

test("renderer recusa token fora de faixa em vez de emitir expressao", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const render = scope.MotionExpressions.renderWiggle;

  assert.throws(() => render(args({ frequency: 0 })), /Frequencia/);
  assert.throws(() => render(args({ frequency: 101 })), /Frequencia/);
  assert.throws(() => render(args({ amplitude: -1 })), /Amplitude/);
  assert.throws(() => render(args({ octaves: 0 })), /oitavas/);
  assert.throws(() => render(args({ octaves: 1.5 })), /oitavas/);
  assert.throws(() => render(args({ amplitudeMultiplier: -1 })), /[Mm]ultiplicador/);
  assert.throws(() => render(args({ seed: -1 })), /Semente/);
  assert.throws(() => render(args({ seed: 1.5 })), /Semente/);
  assert.throws(() => render(args({ frequency: "2); alert(1);//" })), /Frequencia/);
});

test("isManagedWiggle recusa corpo adulterado e semente removida", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const managed = scope.MotionExpressions.isManagedWiggle;
  const header = "// MOTION_EXPRESSION v1 | ae.expression.wiggle\n";

  assert.equal(managed(CANONICO), true);

  // Sem seedRandom o determinismo iria embora sem o usuario perceber.
  assert.equal(managed(header + "wiggle(2, 30, 1, 0.5);"), false);
  assert.equal(managed(header + "seedRandom(0);\nwiggle(2, 30, 1, 0.5); alert(1);"), false);
  assert.equal(managed(header + "seedRandom(0);\nwiggle(2.0, 30, 1, 0.5);"), false);
  assert.equal(managed(header + "seedRandom(0);\nwiggle(200, 30, 1, 0.5);"), false);
  assert.equal(managed("// MOTION_EXPRESSION v1 | ae.expression.smooth\nseedRandom(0);\nwiggle(2, 30, 1, 0.5);"), false);
  assert.equal(managed(""), false);
  assert.equal(managed(null), false);
});

test("preserva expressao alheia e recusa o lote inteiro", async () => {
  const valida = new FakeProperty();
  const doUsuario = new FakeProperty({ expression: "loopOut();", expressionEnabled: true });
  const { scope } = await fixture([valida, doUsuario]);

  const resposta = responder(scope, request());

  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.deepEqual(valida.writes, [], "conflito numa propriedade nao pode deixar outra ja escrita");
  assert.equal(doUsuario.expression, "loopOut();");
});

test("recusa propriedade sem suporte a expressao numerica", async () => {
  const texto = new FakeProperty({ propertyValueType: PropertyValueType.TEXT_DOCUMENT });
  const { scope } = await fixture([texto]);

  const resposta = responder(scope, request());

  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(texto.writes, []);
});

test("recusa argumento desconhecido, ausente e modo de conflito nao permitido", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  const extra = responder(scope, request({ ...args(), inesperado: 1 }));
  assert.equal(extra.error.code, "INVALID_PRESET");
  assert.equal(extra.error.details.field, "inesperado");

  const semSeed = { ...args() };
  delete semSeed.seed;
  assert.equal(responder(scope, request(semSeed)).error.details.field, "seed");

  const conflito = responder(scope, request(args({ conflictMode: "replace-with-backup" })));
  assert.equal(conflito.error.details.field, "conflictMode");
});

test("aplica em toda a selecao num unico grupo de Undo", async () => {
  const primeira = new FakeProperty();
  const segunda = new FakeProperty({ propertyValueType: PropertyValueType.ThreeD });
  const { scope, calls } = await fixture([primeira, segunda]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 2);
  assert.equal(calls.filter((call) => call.type === "beginUndoGroup").length, 1);
  assert.equal(calls.filter((call) => call.type === "endUndoGroup").length, 1);
});

test("reaplicar os mesmos tokens e sucesso sem mudanca", async () => {
  const jaAplicada = new FakeProperty({ expression: CANONICO, expressionEnabled: true });
  const { scope } = await fixture([jaAplicada]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 0);
  assert.equal(resposta.data.unchangedCount, 1);
  assert.deepEqual(jaAplicada.writes, []);
});

test("mudar so a semente reescreve a expressao gerenciada", async () => {
  // A semente e o controle de reprodutibilidade: mudar so ela precisa produzir
  // uma fonte diferente, senao o usuario nao teria como variar o movimento.
  const anterior = new FakeProperty({ expression: CANONICO, expressionEnabled: true });
  const { scope } = await fixture([anterior]);

  const resposta = responder(scope, request(args({ seed: 7 })));

  assert.equal(resposta.data.appliedCount, 1);
  assert.equal(
    anterior.expression,
    "// MOTION_EXPRESSION v1 | ae.expression.wiggle\nseedRandom(7);\nwiggle(2, 30, 1, 0.5);"
  );
});

test("rollback devolve o estado anterior quando o host recusa a expressao", async () => {
  const primeira = new FakeProperty();
  const recusa = new FakeProperty({ rejectSource: CANONICO });
  const { scope } = await fixture([primeira, recusa]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, false);
  assert.equal(primeira.expression, "", "a propriedade escrita antes da falha precisa voltar");
  assert.equal(primeira.expressionEnabled, false);
});
