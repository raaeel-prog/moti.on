import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = {
  NO_VALUE: 0,
  CUSTOM_VALUE: 7,
  MARKER: 8,
  TEXT_DOCUMENT: 12,
  OneD: 5
};

class FakeProperty {
  constructor(options = {}) {
    this.propertyType = options.propertyType ?? PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.OneD;
    this.canSetExpression = options.canSetExpression ?? true;
    this.expression = options.expression ?? "";
    this.expressionEnabled = options.expressionEnabled ?? false;
    this.keys = options.keys ? [...options.keys] : [];
    this.writes = [];
  }
  get numKeys() { return this.keys.length; }
  keyTime(index) { return this.keys[index - 1].time; }
  keyValue(index) { return this.keys[index - 1].value; }
  setValueAtTime(time, value) {
    this.keys.push({ time, value });
    this.keys.sort((a, b) => a.time - b.time);
  }
  removeKey(index) {
    this.keys.splice(index - 1, 1);
  }
}

class FakeMarkerValue {
  constructor(comment) {
    this.comment = comment;
  }
}

class FakeLayer {
  constructor(options = {}) {
    this.canSetTimeRemapEnabled = options.canSetTimeRemapEnabled ?? true;
    this.timeRemapEnabled = options.timeRemapEnabled ?? false;
    this.inPoint = options.inPoint ?? 0;
    this.outPoint = options.outPoint ?? 4;
    this.position = options.position ?? new FakeProperty({ keys: [{ time: 0, value: [0, 0] }, { time: 1, value: [100, 0] }] });
    this.marker = options.marker ?? new FakeProperty();
    this.timeRemap = options.timeRemap ?? new FakeProperty();
  }
  property(matchName) {
    if (matchName === "ADBE Marker") return this.marker;
    if (matchName === "ADBE Time Remapping") return this.timeRemapEnabled ? this.timeRemap : null;
    if (matchName === "ADBE Transform Group") {
      return { property: (name) => name === "ADBE Position" ? this.position : null };
    }
    return null;
  }
}

class FakeCompItem {
  constructor(layers = [new FakeLayer()]) {
    this.selectedLayers = layers;
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.time = 1;
  }
}

async function fixture(comp = new FakeCompItem()) {
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
    "src/expression-templates.jsx",
    "src/commands/time-controller.jsx",
    "src/commands/animate-kinetic.jsx",
    "src/commands/time-marker-loop.jsx",
    "src/dispatch.jsx"
  ], {
    app,
    CompItem: FakeCompItem,
    Property: FakeProperty,
    PropertyType,
    PropertyValueType,
    MarkerValue: FakeMarkerValue,
    TextLayer: class FakeTextLayer {}
  });
  return { scope, app, comp, calls };
}

function request(command, args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: `${command}-1`,
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const timeArgs = {
  applyTo: "layer",
  speedPercent: 50,
  offsetFrames: 2,
  reverse: false,
  freeze: false,
  freezeFrame: 0
};

const markerArgs = {
  inMarkerName: "loop_in",
  outMarkerName: "loop_out",
  loopType: "cycle",
  autoCreateMarkers: true,
  clampToLayer: true
};

test("Time Controller habilita Time Remap e aplica expression gerenciada em um Undo do dispatcher", async () => {
  const layer = new FakeLayer();
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.time.controller", timeArgs)));

  assert.equal(response.ok, true);
  assert.equal(layer.timeRemapEnabled, true);
  assert.match(layer.timeRemap.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.time\.controller\n/);
  assert.equal(layer.timeRemap.expressionEnabled, true);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar controlador de tempo"], ["end"]]);
});

test("Time Controller recusa expressao de usuario antes de abrir Undo", async () => {
  const layer = new FakeLayer({
    timeRemapEnabled: true,
    timeRemap: new FakeProperty({ expression: "loopOut();", expressionEnabled: true })
  });
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.time.controller", timeArgs)));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "EXPRESSION_CONFLICT");
  assert.deepEqual(calls, []);
  assert.equal(layer.timeRemap.expression, "loopOut();");
});

test("Marker Loop escapa nomes de marker na expressao e cria markers faltantes", async () => {
  const layer = new FakeLayer();
  const { scope } = await fixture(new FakeCompItem([layer]));

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.time.marker-loop", {
    ...markerArgs,
    inMarkerName: "loop_\")in",
    outMarkerName: "fim\\loop",
    loopType: "pingpong"
  })));

  assert.equal(response.ok, true);
  assert.equal(response.data.markerCount, 2);
  // O nome e loop_")in: num literal de expressao so a aspa precisa de escape,
  // porque parentese nao tem significado dentro de string.
  assert.match(layer.timeRemap.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.time\.marker-loop\n/);
  assert.ok(layer.timeRemap.expression.includes('var mIn = "loop_\\")in";'));
  assert.ok(layer.timeRemap.expression.includes('var mOut = "fim\\\\loop";'));
  assert.ok(layer.timeRemap.expression.includes("thisLayer.marker.key(mIn).time"));
  assert.ok(!layer.timeRemap.expression.includes("alert("));
  assert.deepEqual(layer.marker.keys.map((key) => key.value.comment), ["loop_\")in", "fim\\loop"]);
});

test("Marker Loop sem autocriacao exige markers existentes e ordenados", async () => {
  const layer = new FakeLayer({
    marker: new FakeProperty({
      keys: [
        { time: 2, value: new FakeMarkerValue("loop_in") },
        { time: 1, value: new FakeMarkerValue("loop_out") }
      ]
    })
  });
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.time.marker-loop", {
    ...markerArgs,
    autoCreateMarkers: false
  })));

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "KEYFRAME_CONFLICT");
  assert.deepEqual(calls, []);
});

test("Kinetic nao abre Undo proprio e usa diferenca entre as duas primeiras keys", async () => {
  const layer = new FakeLayer();
  const { scope, calls } = await fixture(new FakeCompItem([layer]));

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.kinetic", {
    direction: "in",
    durationFrames: 15,
    overshoot: 1.2,
    rotation: 0,
    scale: 0,
    opacity: 0,
    staggerFrames: 0,
    splitMode: "none"
  })));

  assert.equal(response.ok, true);
  assert.match(layer.position.expression, /var k2 = thisProperty\.key\(2\);/);
  assert.ok(layer.position.expression.includes("sub(k2.value, k1.value)"));
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar animação kinetic"], ["end"]]);
});
