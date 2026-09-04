/**
 * CHMS-021 — Trim Paths.
 *
 * Os dois critérios de aceite do master spec viram teste: funciona com múltiplos
 * grupos, e o modo Adjust altera o operador existente em vez de empilhar outro.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
const PropertyValueType = {
  NO_VALUE: 0,
  ThreeD_SPATIAL: 6,
  ThreeD: 4,
  TwoD_SPATIAL: 3,
  TwoD: 2,
  OneD: 1,
  COLOR: 9,
  CUSTOM_VALUE: 7,
  MARKER: 8,
  TEXT_DOCUMENT: 12
};

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

class FakeProperty {
  constructor(matchName, valor) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canVaryOverTime = true;
    this.canSetExpression = false;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = valor;
    this.keys = [];
  }
  get numKeys() {
    return this.keys.length;
  }
  key(index) {
    const key = this.keys[index - 1];
    if (!key) throw new Error(`key ${index} ausente`);
    return key;
  }
  setValue(valor) {
    if (this.keys.length > 0) throw new Error("setValue numa propriedade animada");
    this.value = valor;
  }
  setValueAtTime(time, valor) {
    this.keys.push({
      time,
      value: valor,
      inInterpolation: 2,
      outInterpolation: 2,
      inEase: [new FakeKeyframeEase(0, 16.67)],
      outEase: [new FakeKeyframeEase(0, 16.67)],
      temporalContinuous: false,
      temporalAutoBezier: false,
      roving: false,
      selected: false,
      label: 0
    });
    this.keys.sort((a, b) => a.time - b.time);
  }
  removeKey(index) {
    this.keys.splice(index - 1, 1);
  }
  keyTime(i) {
    return this.key(i).time;
  }
  keyValue(i) {
    return this.key(i).value;
  }
  keyInInterpolationType(i) {
    return this.key(i).inInterpolation;
  }
  keyOutInterpolationType(i) {
    return this.key(i).outInterpolation;
  }
  keyInTemporalEase(i) {
    return this.key(i).inEase;
  }
  keyOutTemporalEase(i) {
    return this.key(i).outEase;
  }
  keyTemporalContinuous(i) {
    return this.key(i).temporalContinuous;
  }
  keyTemporalAutoBezier(i) {
    return this.key(i).temporalAutoBezier;
  }
  keyRoving(i) {
    return this.key(i).roving;
  }
  keySelected(i) {
    return this.key(i).selected;
  }
  keyLabel(i) {
    return this.key(i).label;
  }
  setInterpolationTypeAtKey() {}
  setTemporalEaseAtKey() {}
  setTemporalContinuousAtKey() {}
  setTemporalAutoBezierAtKey() {}
  setRovingAtKey() {}
  setSelectedAtKey() {}
  setLabelAtKey() {}
}

class FakePropertyGroup {
  constructor(matchName, filhos = []) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.filhos = filhos;
    this.removido = false;
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((filho) => filho.matchName === chave) ?? null;
  }
  addProperty(matchName) {
    if (matchName !== "ADBE Vector Filter - Trim") throw new Error(`matchName inesperado: ${matchName}`);
    const trim = new FakePropertyGroup(matchName, [
      new FakeProperty("ADBE Vector Trim Start", 0),
      new FakeProperty("ADBE Vector Trim End", 100),
      new FakeProperty("ADBE Vector Trim Offset", 0)
    ]);
    trim.name = "Trim Paths 1";
    this.filhos.push(trim);
    return trim;
  }
  remove() {
    this.removido = true;
  }
}

function grupoDeForma() {
  return new FakePropertyGroup("ADBE Vector Group", [
    new FakePropertyGroup("ADBE Vectors Group", [new FakePropertyGroup("ADBE Vector Shape - Rect", [])])
  ]);
}

class FakeShapeLayer {
  constructor(quantosGrupos = 1) {
    this.name = "Forma";
    const grupos = [];
    for (let i = 0; i < quantosGrupos; i += 1) grupos.push(grupoDeForma());
    this.contents = new FakePropertyGroup("ADBE Root Vectors Group", grupos);
  }
  property(matchName) {
    return matchName === "ADBE Root Vectors Group" ? this.contents : null;
  }
}

class FakeSolidLayer {
  property() {
    return null;
  }
}

class FakeCompItem {
  constructor(layers = [], time = 1) {
    this.selectedLayers = layers;
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.time = time;
    this.numLayers = layers.length;
  }
  layer(index) {
    return this.selectedLayers[index - 1];
  }
}

async function fixture(comp) {
  const calls = [];
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup(label) {
      calls.push(["begin", label]);
    },
    endUndoGroup() {
      calls.push(["end"]);
    }
  };
  const scope = await loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx",
      "src/commands/shape-trim-path.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      ShapeLayer: FakeShapeLayer,
      Property: FakeProperty,
      PropertyGroup: FakePropertyGroup,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase
    }
  );
  return { scope, app, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "trim-1",
    command: "ae.shape.trim-path",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const baseArgs = {
  scope: "layer",
  start: 0,
  end: 100,
  offset: 0,
  animate: false,
  durationFrames: 24,
  reverse: false
};

function trimDe(container) {
  return container.filhos.find((filho) => filho.matchName === "ADBE Vector Filter - Trim") ?? null;
}

test("Trim Paths entra na raiz da camada e recebe o nome gerenciado", async () => {
  const layer = new FakeShapeLayer(2);
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, start: 10, end: 80 })));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.addedCount, 1, "escopo layer usa um operador so para a camada inteira");
  const trim = trimDe(layer.contents);
  assert.ok(trim, "esperava Trim Paths na raiz");
  assert.equal(trim.name, "MOTION | TRIM");
  assert.equal(trim.property("ADBE Vector Trim Start").value, 10);
  assert.equal(trim.property("ADBE Vector Trim End").value, 80);
  assert.deepEqual(calls, [["begin", "Moti.on: cortar traçados"], ["end"]]);
});

test("escopo por grupo funciona com multiplos grupos", async () => {
  const layer = new FakeShapeLayer(3);
  const { scope } = await fixture(new FakeCompItem([layer]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, scope: "group" })));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.addedCount, 3);
  for (const grupo of layer.contents.filhos) {
    const inner = grupo.property("ADBE Vectors Group");
    assert.ok(trimDe(inner), "cada grupo recebeu o proprio Trim Paths");
  }
  assert.equal(trimDe(layer.contents), null, "a raiz nao recebe operador no escopo por grupo");
});

test("o modo Adjust altera o operador existente em vez de empilhar outro", async () => {
  const layer = new FakeShapeLayer(1);
  const { scope } = await fixture(new FakeCompItem([layer]));

  scope.MotionAE.dispatch(request({ ...baseArgs, start: 0, end: 50 }));
  const primeiro = trimDe(layer.contents);
  assert.equal(primeiro.property("ADBE Vector Trim End").value, 50);

  const segunda = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, start: 0, end: 90 })));

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.addedCount, 0);
  assert.equal(segunda.data.adjustedCount, 1);
  const operadores = layer.contents.filhos.filter((f) => f.matchName === "ADBE Vector Filter - Trim");
  assert.equal(operadores.length, 1, "nao pode existir um segundo Trim Paths");
  assert.equal(operadores[0].property("ADBE Vector Trim End").value, 90);
});

test("Trim Paths do usuario e preservado, e o comando recusa antes do Undo", async () => {
  const layer = new FakeShapeLayer(1);
  // Operador que o usuario criou: sem o prefixo gerenciado.
  const doUsuario = layer.contents.addProperty("ADBE Vector Filter - Trim");
  doUsuario.name = "Meu trim";
  doUsuario.property("ADBE Vector Trim End").value = 42;

  const { scope, calls } = await fixture(new FakeCompItem([layer]));
  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "TRACK_CONFLICT");
  assert.deepEqual(calls, [], "recusa antes de abrir o grupo de Undo");
  assert.equal(doUsuario.property("ADBE Vector Trim End").value, 42, "o operador do usuario nao foi tocado");
});

test("a revelacao animada anima End a partir de Start, comecando no CTI", async () => {
  const layer = new FakeShapeLayer(1);
  const comp = new FakeCompItem([layer], 2);
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request({ ...baseArgs, start: 0, end: 100, animate: true, durationFrames: 25 }));

  const trim = trimDe(layer.contents);
  const fim = trim.property("ADBE Vector Trim End");
  assert.equal(trim.property("ADBE Vector Trim Start").numKeys, 0, "a ponta parada fica estatica");
  assert.deepEqual(fim.keys.map((k) => [k.time, k.value]), [[2, 0], [3, 100]]);
});

test("reverse troca qual ponta anda: desenhar do comeco vira apagar do fim", async () => {
  const layer = new FakeShapeLayer(1);
  const { scope } = await fixture(new FakeCompItem([layer], 0));

  scope.MotionAE.dispatch(request({ ...baseArgs, animate: true, reverse: true, durationFrames: 25 }));

  const trim = trimDe(layer.contents);
  assert.equal(trim.property("ADBE Vector Trim End").numKeys, 0);
  assert.deepEqual(
    trim.property("ADBE Vector Trim Start").keys.map((k) => [k.time, k.value]),
    [[0, 100], [1, 0]]
  );
});

test("camada que nao e de forma e recusada com tipo de selecao", async () => {
  const { scope, calls } = await fixture(new FakeCompItem([new FakeSolidLayer()]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(calls, []);
});

test("Start maior ou igual a End e recusado antes de tocar o projeto", async () => {
  const layer = new FakeShapeLayer(1);
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, start: 80, end: 20 })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "start");
  assert.equal(trimDe(layer.contents), null);
  assert.deepEqual(calls, []);
});
