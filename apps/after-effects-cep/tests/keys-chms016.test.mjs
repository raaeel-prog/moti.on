import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, GROUP: 2 };
const PropertyValueType = {
  OneD: 1,
  TwoD: 2,
  TwoD_SPATIAL: 3,
  ThreeD: 4,
  ThreeD_SPATIAL: 5,
  COLOR: 6,
  TEXT_DOCUMENT: 7
};

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

function clone(value) {
  return Array.isArray(value) ? [...value] : value;
}

function makeKey(time, value, overrides = {}) {
  return {
    time,
    value: clone(value),
    inInterpolation: "bezier",
    outInterpolation: "bezier",
    inEase: [new FakeKeyframeEase(time + 1, 33)],
    outEase: [new FakeKeyframeEase(time + 2, 67)],
    temporalContinuous: false,
    temporalAutoBezier: false,
    inTangent: [time, -time],
    outTangent: [-time, time],
    spatialContinuous: false,
    spatialAutoBezier: false,
    roving: false,
    selected: time === 1,
    label: Math.max(0, Math.min(16, Math.round(time) + 1)),
    ...overrides
  };
}

class FakeProperty {
  constructor(layer, name, keys, options = {}) {
    this.parentProperty = layer;
    this.name = name;
    this.matchName = `ADBE ${name}`;
    this.propertyIndex = options.propertyIndex ?? 1;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = options.spatial ? PropertyValueType.TwoD_SPATIAL : PropertyValueType.OneD;
    this.keys = keys.map((key) => ({ ...key, value: clone(key.value) }));
    this.removeCalls = [];
    this.throwRemoveOnceAt = null;
    this.throwSetValueOnce = false;
  }

  get numKeys() { return this.keys.length; }
  key(index) {
    const key = this.keys[index - 1];
    if (!key) throw new Error(`key ${index} ausente`);
    return key;
  }
  keyTime(index) { return this.key(index).time; }
  keyValue(index) { return clone(this.key(index).value); }
  keyInInterpolationType(index) { return this.key(index).inInterpolation; }
  keyOutInterpolationType(index) { return this.key(index).outInterpolation; }
  keyInTemporalEase(index) { return this.key(index).inEase.map((ease) => new FakeKeyframeEase(ease.speed, ease.influence)); }
  keyOutTemporalEase(index) { return this.key(index).outEase.map((ease) => new FakeKeyframeEase(ease.speed, ease.influence)); }
  keyTemporalContinuous(index) { return this.key(index).temporalContinuous; }
  keyTemporalAutoBezier(index) { return this.key(index).temporalAutoBezier; }
  keyInSpatialTangent(index) { return [...this.key(index).inTangent]; }
  keyOutSpatialTangent(index) { return [...this.key(index).outTangent]; }
  keySpatialContinuous(index) { return this.key(index).spatialContinuous; }
  keySpatialAutoBezier(index) { return this.key(index).spatialAutoBezier; }
  keyRoving(index) { return this.key(index).roving; }
  keySelected(index) { return this.key(index).selected; }
  keyLabel(index) { return this.key(index).label; }

  removeKey(index) {
    this.removeCalls.push(index);
    if (this.throwRemoveOnceAt === index) {
      this.throwRemoveOnceAt = null;
      throw new Error("remove falhou uma vez");
    }
    this.keys.splice(index - 1, 1);
  }

  setValueAtTime(time, value) {
    if (this.throwSetValueOnce) {
      this.throwSetValueOnce = false;
      throw new Error("setValueAtTime falhou uma vez");
    }
    const existing = this.keys.find((key) => Math.abs(key.time - time) < 1e-9);
    if (existing) {
      existing.value = clone(value);
      return;
    }
    this.keys.push(makeKey(time, value));
    this.keys.sort((a, b) => a.time - b.time);
  }

  setInterpolationTypeAtKey(index, input, output) {
    this.key(index).inInterpolation = input;
    this.key(index).outInterpolation = output;
  }
  setTemporalEaseAtKey(index, input, output) {
    this.key(index).inEase = input.map((ease) => new FakeKeyframeEase(ease.speed, ease.influence));
    this.key(index).outEase = output.map((ease) => new FakeKeyframeEase(ease.speed, ease.influence));
  }
  setTemporalContinuousAtKey(index, value) { this.key(index).temporalContinuous = value; }
  setTemporalAutoBezierAtKey(index, value) { this.key(index).temporalAutoBezier = value; }
  setSpatialTangentsAtKey(index, input, output) {
    this.key(index).inTangent = [...input];
    this.key(index).outTangent = [...output];
  }
  setSpatialContinuousAtKey(index, value) { this.key(index).spatialContinuous = value; }
  setSpatialAutoBezierAtKey(index, value) { this.key(index).spatialAutoBezier = value; }
  setRovingAtKey(index, value) { this.key(index).roving = value; }
  setSelectedAtKey(index, value) { this.key(index).selected = value; }
  setLabelAtKey(index, value) { this.key(index).label = value; }
}

class FakeLayer {
  constructor(index, name, startTime, point = [0, 0]) {
    this.parentProperty = null;
    this.index = index;
    this.name = name;
    this.startTime = startTime;
    this.point = point;
    this.selected = true;
  }
  property(matchName) {
    assert.equal(matchName, "ADBE Transform Group");
    return { property: () => ({ value: [0, 0] }) };
  }
  sourcePointToComp() { return [...this.point]; }
}

class FakeCompItem {
  constructor(layers) {
    this._layers = layers;
    this.selectedLayers = [...layers];
    this.selectedProperties = [];
    this.time = 2;
    this.workAreaStart = 1;
    this.workAreaDuration = 2;
    this.frameDuration = 0.04;
  }
  get numLayers() { return this._layers.length; }
  layer(index) { return this._layers[index - 1] ?? null; }
}

function request(command, args, options = {}) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: `${command}-1`,
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options
  });
}

function cutArgs(overrides = {}) {
  return {
    rangeMode: "beforeCti",
    startTime: 0,
    endTime: 0,
    includeBoundary: false,
    previewOnly: true,
    ...overrides
  };
}

function delayArgs(overrides = {}) {
  return {
    delayFrames: 3,
    order: "timeline",
    reverse: false,
    randomSeed: 7,
    spatialOrigin: [0, 0],
    shiftMode: "layerStart",
    ...overrides
  };
}

async function fixture() {
  const layers = [
    new FakeLayer(1, "C", 0, [30, 0]),
    new FakeLayer(2, "A", 1, [10, 0]),
    new FakeLayer(3, "B", 2, [20, 0])
  ];
  const comp = new FakeCompItem(layers);
  const calls = [];
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup(label) { calls.push(["begin", label]); },
    endUndoGroup() { calls.push(["end"]); }
  };
  const scope = await loadHostModules([
    "generated/motion-contracts.jsx",
    "generated/motion-descriptors.jsx",
    "src/json.jsx",
    "src/undo.jsx",
    "src/registry.jsx",
    "src/keyframe-operations.jsx",
    "src/commands/keys-cut.jsx",
    "src/commands/keys-delay.jsx",
    "src/dispatch.jsx"
  ], { app, CompItem: FakeCompItem, PropertyType, PropertyValueType, KeyframeEase: FakeKeyframeEase });
  return { scope, app, comp, layers, calls };
}

test("CutKeys preview e apply usam o mesmo plano e removem indices decrescentes", async () => {
  const f = await fixture();
  const property = new FakeProperty(f.layers[0], "Opacity", [0, 1, 2, 3].map((time) => makeKey(time, time * 10)));
  f.comp.selectedProperties = [property];

  const preview = JSON.parse(f.scope.MotionAE.dispatch(request("ae.keys.cut.preview", cutArgs())));
  assert.equal(preview.ok, true);
  assert.equal(preview.data.totalCount, 2);
  assert.deepEqual(property.keys.map((key) => key.time), [0, 1, 2, 3]);

  const denied = JSON.parse(f.scope.MotionAE.dispatch(request("ae.keys.cut", cutArgs({ previewOnly: false }))));
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "PERMISSION_DENIED");
  assert.equal(f.calls.length, 0);

  const applied = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.cut",
    cutArgs({ previewOnly: false }),
    { allowDestructive: true, preserveSelection: true }
  )));
  assert.equal(applied.ok, true);
  assert.equal(applied.data.totalCount, preview.data.totalCount);
  assert.deepEqual(property.removeCalls, [2, 1]);
  assert.deepEqual(property.keys.map((key) => key.time), [2, 3]);
  assert.deepEqual(f.calls, [["begin", "Moti.on: cortar keyframes"], ["end"]]);
});

test("CutKeys cobre boundaries de work area e intervalo entre markers", async () => {
  const f = await fixture();
  const property = new FakeProperty(f.layers[0], "Scale", [0, 1, 2, 3, 4].map((time) => makeKey(time, time)));
  f.comp.selectedProperties = [property];

  const cases = [
    [cutArgs({ rangeMode: "insideWorkArea", includeBoundary: true }), 3],
    [cutArgs({ rangeMode: "insideWorkArea", includeBoundary: false }), 1],
    [cutArgs({ rangeMode: "outsideWorkArea", includeBoundary: true }), 4],
    [cutArgs({ rangeMode: "outsideWorkArea", includeBoundary: false }), 2],
    [cutArgs({ rangeMode: "betweenMarkers", startTime: 1, endTime: 3, includeBoundary: true }), 3],
    [cutArgs({ rangeMode: "betweenMarkers", startTime: 1, endTime: 3, includeBoundary: false }), 1]
  ];
  for (const [args, expected] of cases) {
    const response = JSON.parse(f.scope.MotionAE.dispatch(request("ae.keys.cut.preview", args)));
    assert.equal(response.ok, true);
    assert.equal(response.data.totalCount, expected);
  }
});

test("CutKeys restaura snapshot completo quando uma remocao falha", async () => {
  const f = await fixture();
  const original = [0, 1, 2].map((time) => makeKey(time, [time, time + 1], { label: time + 4 }));
  const property = new FakeProperty(f.layers[0], "Position", original, { spatial: true });
  property.throwRemoveOnceAt = 1;
  f.comp.selectedProperties = [property];

  const response = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.cut",
    cutArgs({ previewOnly: false }),
    { allowDestructive: true }
  )));
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(property.keys, original);
});

test("Delay random e deterministico e reverse inverte exatamente o plano", async () => {
  const f = await fixture();
  const first = JSON.parse(f.scope.MotionAE.dispatch(request("ae.keys.delay.preview", delayArgs({ order: "random" }))));
  const second = JSON.parse(f.scope.MotionAE.dispatch(request("ae.keys.delay.preview", delayArgs({ order: "random" }))));
  assert.deepEqual(first.data.targets, second.data.targets);

  const reversed = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay.preview",
    delayArgs({ order: "random", reverse: true })
  )));
  assert.deepEqual(
    reversed.data.targets.map((target) => target.name),
    [...first.data.targets].reverse().map((target) => target.name)
  );
});

test("Delay em camadas aplica offsets por frame num unico Undo", async () => {
  const f = await fixture();
  const preview = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay.preview",
    delayArgs({ order: "name", delayFrames: 5 })
  )));
  assert.deepEqual(preview.data.targets.map((target) => target.name), ["A", "B", "C"]);
  assert.deepEqual(preview.data.targets.map((target) => target.offsetFrames), [0, 5, 10]);

  const applied = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay",
    delayArgs({ order: "name", delayFrames: 5 })
  )));
  assert.equal(applied.ok, true);
  assert.deepEqual(f.layers.map((layer) => layer.startTime), [0.4, 1, 2.2]);
  assert.deepEqual(f.calls, [["begin", "Moti.on: atrasar animação"], ["end"]]);
});

test("Delay de keyframes preserva spacing e metadata", async () => {
  const f = await fixture();
  const first = new FakeProperty(f.layers[0], "X", [makeKey(0, 1), makeKey(1.5, 2)]);
  const secondOriginal = [makeKey(2, 3, { label: 8 }), makeKey(4.5, 4, { label: 9 })];
  const second = new FakeProperty(f.layers[1], "Y", secondOriginal);
  f.comp.selectedProperties = [first, second];

  const response = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay",
    delayArgs({ shiftMode: "keyframes", delayFrames: 5 })
  )));
  assert.equal(response.ok, true);
  assert.deepEqual(first.keys.map((key) => key.time), [0, 1.5]);
  assert.deepEqual(second.keys.map((key) => key.time), [2.2, 4.7]);
  assert.equal(second.keys[1].time - second.keys[0].time, 2.5);
  assert.deepEqual(second.keys.map((key) => key.label), [8, 9]);
  assert.deepEqual(second.keys.map((key) => key.selected), secondOriginal.map((key) => key.selected));
  assert.deepEqual(second.keys.map((key) => key.inEase), secondOriginal.map((key) => key.inEase));
});

test("Delay por distancia usa coordenadas de composicao, nao indice", async () => {
  const f = await fixture();
  const response = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay.preview",
    delayArgs({ order: "distance", spatialOrigin: [0, 0] })
  )));
  assert.equal(response.ok, true);
  assert.deepEqual(response.data.targets.map((target) => target.name), ["A", "B", "C"]);
});

test("comandos de keys recusam campos extras antes de Undo", async () => {
  const f = await fixture();
  f.comp.selectedProperties = [
    new FakeProperty(f.layers[0], "X", [makeKey(0, 1)]),
    new FakeProperty(f.layers[1], "Y", [makeKey(0, 1)])
  ];
  const cut = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.cut.preview",
    cutArgs({ source: "alert(1)" })
  )));
  const delay = JSON.parse(f.scope.MotionAE.dispatch(request(
    "ae.keys.delay",
    delayArgs({ source: "alert(1)" })
  )));
  assert.equal(cut.error.code, "INVALID_PRESET");
  assert.equal(delay.error.code, "INVALID_PRESET");
  assert.equal(f.calls.length, 0);
});
