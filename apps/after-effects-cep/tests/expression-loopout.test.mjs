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
  "src/commands/expression-loopout.jsx",
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
    type: "cycle",
    numKeyframes: 0,
    duration: 0,
    useDuration: false,
    conflictMode: "skip",
    ...overrides
  };
}

function request(commandArgs = args(), options = { preserveSelection: true }) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "loop-1",
    command: "ae.expression.loopout",
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

test("descriptor do LoopOut exige contexto real e declara no-op idempotente explicitamente", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const descriptor = scope.MotionDescriptors["ae.expression.loopout"];
  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.destructive, false);
  assert.equal(descriptor.allowsNoopSuccess, true);
});

test("renderer produz apenas as fontes canonicas versionadas", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  assert.equal(
    scope.MotionExpressions.renderLoopOut(args()),
    '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("cycle", 0);'
  );
  assert.equal(
    scope.MotionExpressions.renderLoopOut(args({ type: "offset", useDuration: true, duration: 1.25 })),
    '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOutDuration("offset", 1.25);'
  );
  assert.equal(
    scope.MotionExpressions.renderLoopOut(args({ type: "continue", numKeyframes: 999, duration: 10, useDuration: true })),
    '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("continue");'
  );
  assert.throws(
    () => scope.MotionExpressions.renderLoopOut(args({ type: 'cycle"); alert(1);//' })),
    /invalido/
  );
});

test("renderer ES5 permanece byte a byte igual ao registro puro CHMS-011", async () => {
  const { scope } = await fixture([new FakeProperty()]);
  const cases = [
    { type: "cycle", numKeyframes: 0, duration: 0, useDuration: false },
    { type: "pingpong", numKeyframes: 3, duration: 0, useDuration: false },
    { type: "offset", numKeyframes: 0, duration: 1.25, useDuration: true },
    { type: "continue", numKeyframes: 0, duration: 0, useDuration: false }
  ];

  for (const tokens of cases) {
    const pure = renderExpression({ id: "ae.expression.loopout", tokens });
    assert.equal(scope.MotionExpressions.renderLoopOut(tokens), pure.source);
  }
});

test("aplica em lote com um Undo e preserva selecao e CTI", async () => {
  const first = new FakeProperty();
  const second = new FakeProperty({ propertyValueType: PropertyValueType.TwoD_SPATIAL });
  const { scope, comp, calls } = await fixture([first, second]);
  const beforeSelection = comp.selectedProperties.slice();
  const beforeTime = comp.time;

  const response = JSON.parse(scope.MotionAE.dispatch(request()));

  assert.equal(response.ok, true);
  assert.deepEqual(response.data, { appliedCount: 2, unchangedCount: 0 });
  assert.match(first.expression, /^\/\/ MOTION_EXPRESSION v1/);
  assert.equal(first.expressionEnabled, true);
  assert.equal(second.expressionEnabled, true);
  assert.deepEqual(comp.selectedProperties, beforeSelection);
  assert.equal(comp.time, beforeTime);
  assert.deepEqual(calls, [
    { type: "beginUndoGroup", label: "Moti.on: aplicar LoopOut" },
    { type: "endUndoGroup" }
  ]);
});

test("repetir a mesma configuracao e sucesso idempotente sem writes", async () => {
  const source = '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("cycle", 0);';
  const property = new FakeProperty({ expression: source, expressionEnabled: true });
  const { scope } = await fixture([property]);

  const response = JSON.parse(scope.MotionAE.dispatch(request()));

  assert.equal(response.ok, true);
  assert.deepEqual(response.data, { appliedCount: 0, unchangedCount: 1 });
  assert.deepEqual(property.writes, []);
});

test("expressao do usuario recusa o lote inteiro antes de Undo", async () => {
  const empty = new FakeProperty();
  const user = new FakeProperty({ expression: "wiggle(2, 30);", expressionEnabled: true });
  const { scope, calls } = await fixture([empty, user]);

  const response = JSON.parse(scope.MotionAE.dispatch(request()));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "EXPRESSION_CONFLICT");
  assert.deepEqual(empty.writes, []);
  assert.deepEqual(user.writes, []);
  assert.deepEqual(calls, []);
});

test("grupo, tipo nao numerico e propriedade com menos de duas keys falham fechados", async () => {
  const cases = [
    [new FakeProperty({ propertyType: PropertyType.GROUP }), "INVALID_SELECTION_TYPE"],
    [new FakeProperty({ propertyValueType: PropertyValueType.TEXT_DOCUMENT }), "INVALID_SELECTION_TYPE"],
    [new FakeProperty({ numKeys: 1 }), "KEYFRAME_CONFLICT"]
  ];
  for (const [property, code] of cases) {
    const { scope, calls } = await fixture([property]);
    const response = JSON.parse(scope.MotionAE.dispatch(request()));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code);
    assert.deepEqual(property.writes, []);
    assert.deepEqual(calls, []);
  }
});

test("payload extra, injection e intervalos incoerentes nunca chegam ao Undo", async () => {
  const invalid = [
    args({ source: "alert(1)" }),
    args({ type: 'cycle"); alert(1);//' }),
    args({ numKeyframes: 1.5 }),
    args({ numKeyframes: 1001 }),
    args({ duration: 1 }),
    args({ useDuration: true, duration: 0 }),
    args({ conflictMode: "replace-with-backup" }),
    args({ type: "continue", numKeyframes: 1 })
  ];
  for (const commandArgs of invalid) {
    const property = new FakeProperty();
    const { scope, calls } = await fixture([property]);
    const response = JSON.parse(scope.MotionAE.dispatch(request(commandArgs)));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, "INVALID_PRESET");
    assert.deepEqual(property.writes, []);
    assert.deepEqual(calls, []);
  }
});

test("falha de avaliacao restaura todas as propriedades tocadas", async () => {
  const desired = '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("cycle", 0);';
  const first = new FakeProperty();
  const second = new FakeProperty({ rejectSource: desired });
  const { scope, calls } = await fixture([first, second]);

  const response = JSON.parse(scope.MotionAE.dispatch(request()));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(first.expression, "");
  assert.equal(first.expressionEnabled, false);
  assert.equal(second.expression, "");
  assert.equal(second.expressionEnabled, false);
  assert.equal(calls.filter((call) => call.type === "beginUndoGroup").length, 1);
  assert.equal(calls.filter((call) => call.type === "endUndoGroup").length, 1);
});

test("falha durante rollback sobe como ROLLBACK_FAILED", async () => {
  const desired = '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("cycle", 0);';
  const first = new FakeProperty({ failRestoreTo: "" });
  const second = new FakeProperty({ rejectSource: desired });
  const { scope } = await fixture([first, second]);

  const response = JSON.parse(scope.MotionAE.dispatch(request()));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "ROLLBACK_FAILED");
  assert.equal(response.error.action, "error.action.undoManually");
});

test("expressao LoopOut gerenciada pode ser ajustada sem abrir replace de usuario", async () => {
  const previous = '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("cycle", 0);';
  const property = new FakeProperty({ expression: previous, expressionEnabled: true });
  const { scope } = await fixture([property]);

  const response = JSON.parse(
    scope.MotionAE.dispatch(request(args({ type: "pingpong", numKeyframes: 2 })))
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.appliedCount, 1);
  assert.equal(
    property.expression,
    '// MOTION_EXPRESSION v1 | ae.expression.loopout\nloopOut("pingpong", 2);'
  );
});
