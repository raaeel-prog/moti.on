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
  "src/commands/expression-flicker.jsx",
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
  "// MOTION_EXPRESSION v1 | ae.expression.flicker\nseedRandom(0);\nposterizeTime(12);\nvalue * random(0, 1);";

class FakeProperty {
  constructor(options = {}) {
    this.propertyType = options.propertyType ?? PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.OneD;
    this.canSetExpression = options.canSetExpression ?? true;
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
  return { rate: 12, minFactor: 0, maxFactor: 1, seed: 0, conflictMode: "skip", ...overrides };
}

function request(commandArgs = args()) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "flicker-1",
    command: "ae.expression.flicker",
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

test("descriptor do Flicker exige contexto real e declara no-op idempotente", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const descriptor = scope.MotionDescriptors["ae.expression.flicker"];

  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.allowsNoopSuccess, true);
});

test("o template multiplica o valor da propriedade, e nao o substitui", async () => {
  // random(min, max) com dois numeros devolve ESCALAR. Sem `value *`, qualquer
  // propriedade 2D ou 3D quebraria dentro do After Effects.
  const { scope } = await fixture([new FakeProperty()]);
  const fonte = scope.MotionExpressions.renderFlicker(args());

  assert.equal(fonte, CANONICO);
  assert.ok(fonte.includes("value * random("), "a multiplicacao e o que carrega a dimensionalidade");
  assert.ok(fonte.indexOf("seedRandom(") < fonte.indexOf("posterizeTime("));
});

test("aplica em propriedade multidimensional sem tratamento especial", async () => {
  // O mesmo template serve 1D, 2D, 3D e cor porque `value` traz a dimensao.
  const umaD = new FakeProperty({ propertyValueType: PropertyValueType.OneD });
  const duasD = new FakeProperty({ propertyValueType: PropertyValueType.TwoD_SPATIAL });
  const tresD = new FakeProperty({ propertyValueType: PropertyValueType.ThreeD });
  const cor = new FakeProperty({ propertyValueType: PropertyValueType.COLOR });
  const { scope } = await fixture([umaD, duasD, tresD, cor]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 4);
  for (const propriedade of [umaD, duasD, tresD, cor]) {
    assert.equal(propriedade.expression, CANONICO);
  }
});

test("aplica em propriedade SEM keyframes", async () => {
  const parada = new FakeProperty({ numKeys: 0 });
  const { scope } = await fixture([parada]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 1);
});

test("o host e a biblioteca TypeScript emitem exatamente a mesma fonte", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  const casos = [
    { rate: 12, minFactor: 0, maxFactor: 1, seed: 0 },
    { rate: 24, minFactor: 0.25, maxFactor: 0.75, seed: 9 },
    { rate: 120, minFactor: 10, maxFactor: 10, seed: 100000 },
    { rate: 0.5, minFactor: 0, maxFactor: 0, seed: 1 }
  ];

  for (const tokens of casos) {
    assert.equal(
      scope.MotionExpressions.renderFlicker(tokens),
      renderExpression({ id: "ae.expression.flicker", tokens }).source,
      `divergencia para ${JSON.stringify(tokens)}`
    );
  }
});

test("recusa faixa invertida antes de emitir fonte", async () => {
  const { scope } = await fixture([new FakeProperty()]);

  assert.throws(
    () => scope.MotionExpressions.renderFlicker(args({ minFactor: 1, maxFactor: 0 })),
    /minimo maior/
  );

  const resposta = responder(scope, request(args({ minFactor: 1, maxFactor: 0 })));
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "minFactor");
});

test("renderer recusa token fora de faixa", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const render = scope.MotionExpressions.renderFlicker;

  assert.throws(() => render(args({ rate: 0 })), /Taxa/);
  assert.throws(() => render(args({ rate: 121 })), /Taxa/);
  assert.throws(() => render(args({ minFactor: -1 })), /minimo/);
  assert.throws(() => render(args({ maxFactor: 11 })), /maximo/);
  assert.throws(() => render(args({ seed: 1.5 })), /Semente/);
  assert.throws(() => render(args({ rate: "12); alert(1);//" })), /Taxa/);
});

test("isManagedFlicker recusa corpo adulterado", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const managed = scope.MotionExpressions.isManagedFlicker;
  const header = "// MOTION_EXPRESSION v1 | ae.expression.flicker\n";

  assert.equal(managed(CANONICO), true);
  assert.equal(managed(header + "seedRandom(0);\nposterizeTime(12);\nvalue * random(0, 1); alert(1);"), false);
  // Sem posterizeTime a taxa deixaria de existir sem o usuario perceber.
  assert.equal(managed(header + "seedRandom(0);\nvalue * random(0, 1);"), false);
  // Sem `value *` quebraria propriedade multidimensional.
  assert.equal(managed(header + "seedRandom(0);\nposterizeTime(12);\nrandom(0, 1);"), false);
  // Faixa invertida gravada a mao.
  assert.equal(managed(header + "seedRandom(0);\nposterizeTime(12);\nvalue * random(1, 0);"), false);
  assert.equal(managed(""), false);
});

test("preserva expressao alheia e recusa o lote inteiro", async () => {
  const valida = new FakeProperty();
  const doUsuario = new FakeProperty({ expression: "wiggle(2, 30);", expressionEnabled: true });
  const { scope } = await fixture([valida, doUsuario]);

  const resposta = responder(scope, request());

  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.deepEqual(valida.writes, []);
});

test("aplica num unico grupo de Undo e reaplicar e no-op", async () => {
  const propriedade = new FakeProperty();
  const { scope, calls } = await fixture([propriedade]);

  assert.equal(responder(scope, request()).data.appliedCount, 1);
  propriedade.writes.length = 0;

  const segunda = responder(scope, request());
  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.appliedCount, 0);
  assert.equal(segunda.data.unchangedCount, 1);
  assert.deepEqual(propriedade.writes, []);
  assert.equal(calls.filter((call) => call.type === "beginUndoGroup").length, 2);
});

test("rollback devolve o estado anterior quando o host recusa a expressao", async () => {
  const primeira = new FakeProperty();
  const recusa = new FakeProperty({ rejectSource: CANONICO });
  const { scope } = await fixture([primeira, recusa]);

  const resposta = responder(scope, request());

  assert.equal(resposta.ok, false);
  assert.equal(primeira.expression, "");
  assert.equal(primeira.expressionEnabled, false);
});
