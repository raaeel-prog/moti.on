/**
 * CHMS-024 — transições de câmera.
 *
 * O critério de aceite é "11 presets sem dependência externa". Os dois lados são
 * verificados: que são mesmo onze e que cada um move a propriedade certa no
 * sentido certo, e que nada além da câmera nativa é usado.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = { NO_VALUE: 0, OneD: 1, ThreeD: 4, ThreeD_SPATIAL: 5 };
const KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

const clone = (v) => (Array.isArray(v) ? [...v] : v);

class FakeProperty {
  constructor(matchName, valor) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.ThreeD_SPATIAL;
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = valor;
    this.keys = [];
  }
  get numKeys() {
    return this.keys.length;
  }
  setValue(v) {
    this.value = clone(v);
  }
  setValueAtTime(t, v) {
    this.keys.push({ time: t, value: clone(v), inEase: [], outEase: [], inInterp: 1, outInterp: 1 });
    this.keys.sort((a, b) => a.time - b.time);
  }
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
  setInterpolationTypeAtKey(i, entrada, saida) {
    this.keys[i - 1].inInterp = entrada;
    this.keys[i - 1].outInterp = saida;
  }
  setTemporalEaseAtKey(i, entrada, saida) {
    this.keys[i - 1].inEase = entrada.map((e) => new FakeKeyframeEase(e.speed, e.influence));
    this.keys[i - 1].outEase = saida.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.parent = opcoes.parent ?? null;
    this.comment = "";
    this.position = new FakeProperty("ADBE Position", [960, 540, -1000]);
    this.orientation = new FakeProperty("ADBE Orientation", [0, 0, 0]);
    this.zoom = new FakeProperty("ADBE Camera Zoom", 1000);
    this.zoom.propertyValueType = PropertyValueType.OneD;
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Orientation") return this.orientation;
        if (n === "ADBE Camera Zoom") return this.zoom;
        return null;
      }
    };
  }
  property(matchName) {
    return matchName === "ADBE Transform Group" ? this.transform : null;
  }
}

class FakeCameraLayer extends FakeLayer {}

class FakeCompItem {
  constructor(layers = []) {
    this.todas = layers;
    this.selectedLayers = [...layers];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.width = 1920;
    this.height = 1080;
    this.time = 1;
  }
  get numLayers() {
    return this.todas.length;
  }
  layer(i) {
    return this.todas[i - 1] ?? null;
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
      "src/commands/camera-transition.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      CameraLayer: FakeCameraLayer,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType
    }
  );
  return { scope, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "cam-1",
    command: "ae.camera.transition",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

/** Curva linear: mantém o teste focado no movimento, não no ease. */
const LINEAR = { x1: 0, y1: 0, x2: 1, y2: 1 };

const baseArgs = {
  preset: "pushIn",
  durationFrames: 25,
  amount: 500,
  curve: LINEAR,
  cameraName: ""
};

function comCamera() {
  const camera = new FakeCameraLayer({ name: "Camera 1", index: 1 });
  return { camera, comp: new FakeCompItem([camera]) };
}

test("a transicao escreve dois keyframes na janela pedida", async () => {
  const { camera, comp } = comCamera();
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(camera.position.numKeys, 2);
  // Começa no indicador de tempo e dura o que foi pedido: 25 quadros a 25 fps.
  assert.equal(resposta.data.startTime, 1);
  assert.equal(resposta.data.endTime, 2);
  assert.deepEqual(calls, [["begin", "Moti.on: transição de câmera"], ["end"]]);
});

test("os onze presets existem e cada um move a propriedade certa", async () => {
  // A tabela do teste é escrita à mão de propósito: derivar do próprio comando
  // faria o teste concordar com qualquer coisa que estivesse lá.
  const esperado = [
    ["pushIn", "position", 2, 1],
    ["pullOut", "position", 2, -1],
    ["truckLeft", "position", 0, -1],
    ["truckRight", "position", 0, 1],
    ["craneUp", "position", 1, -1],
    ["craneDown", "position", 1, 1],
    ["panLeft", "orientation", 1, -1],
    ["panRight", "orientation", 1, 1],
    ["tiltUp", "orientation", 0, -1],
    ["tiltDown", "orientation", 0, 1],
    ["zoomIn", "zoom", null, 1]
  ];
  assert.equal(esperado.length, 11, "o criterio de aceite pede onze presets");

  for (const [preset, propriedade, eixo, sentido] of esperado) {
    const { camera, comp } = comCamera();
    const { scope } = await fixture(comp);

    const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, preset, amount: 100 })));
    assert.equal(resposta.ok, true, `${preset} deveria aplicar`);

    const alvo = camera[propriedade];
    assert.equal(alvo.numKeys, 2, `${preset} deveria escrever dois keyframes`);

    const [inicio, fim] = alvo.keys;
    if (eixo === null) {
      assert.equal(fim.value - inicio.value, 100 * sentido, `${preset}: deslocamento errado`);
    } else {
      for (let i = 0; i < inicio.value.length; i += 1) {
        const delta = fim.value[i] - inicio.value[i];
        const esperadoDelta = i === eixo ? 100 * sentido : 0;
        assert.equal(delta, esperadoDelta, `${preset}: eixo ${i} andou ${delta}`);
      }
    }
  }
});

test("a curva do editor vira o ease dos dois keyframes", async () => {
  const { camera, comp } = comCamera();
  const { scope } = await fixture(comp);

  // Uma curva com alças curtas: influência 20% na saída e 20% na entrada.
  scope.MotionAE.dispatch(
    request({ ...baseArgs, curve: { x1: 0.2, y1: 0, x2: 0.8, y2: 1 }, amount: 500, durationFrames: 25 })
  );

  const [inicio, fim] = camera.position.keys;
  assert.ok(Math.abs(inicio.outEase[0].influence - 20) < 1e-9);
  assert.ok(Math.abs(fim.inEase[0].influence - 20) < 1e-9);
  // A curva é achatada nas pontas (y1 = 0, y2 = 1), então a velocidade é zero
  // nos dois extremos: é o "ease" clássico.
  assert.equal(inicio.outEase[0].speed, 0);
  assert.equal(fim.inEase[0].speed, 0);
  assert.equal(inicio.inInterp, KeyframeInterpolationType.BEZIER);
});

test("uma curva com alca vertical pede velocidade, e nao pausa", async () => {
  const { camera, comp } = comCamera();
  const { scope } = await fixture(comp);

  // x1 = 0 é alça vertical: a curva sai do keyframe na velocidade máxima. É a
  // mesma proteção que o `ae.keys.ease.apply` tem, porque a conversão é a mesma.
  scope.MotionAE.dispatch(request({ ...baseArgs, curve: { x1: 0, y1: 1, x2: 0.5, y2: 0 }, amount: 500 }));

  const saida = camera.position.keys[0].outEase[2];
  assert.ok(saida.speed !== 0, "a velocidade de saida no eixo que anda nao pode ser zero");
  assert.equal(saida.influence, 0.1);
});

test("preset desconhecido e recusado com a lista do que existe", async () => {
  const { comp } = comCamera();
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, preset: "dollyZoom" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.supported.length, 11);
  assert.deepEqual(calls, []);
});

test("amplitude zero e recusada, porque deixaria dois keyframes identicos", async () => {
  const { camera, comp } = comCamera();
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, amount: 0 })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.details.field, "amount");
  assert.equal(camera.position.numKeys, 0);
});

test("camera com pai e recusada, porque o deslocamento sairia torto", async () => {
  const pai = new FakeLayer({ name: "Pai", index: 1 });
  const camera = new FakeCameraLayer({ name: "Camera 1", index: 2, parent: pai });
  const { scope, calls } = await fixture(new FakeCompItem([pai, camera]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(camera.position.numKeys, 0);
  assert.deepEqual(calls, []);
});

test("propriedade que ja tem keyframes e recusada antes de sobrescrever", async () => {
  const { camera, comp } = comCamera();
  camera.position.setValueAtTime(0, [0, 0, 0]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
  assert.equal(camera.position.numKeys, 1, "o keyframe que existia continua la");
  assert.deepEqual(calls, []);
});

test("sem camera na composicao o comando recusa", async () => {
  const { scope } = await fixture(new FakeCompItem([new FakeLayer({ name: "Solida", index: 1 })]));

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
});

test("X da curva fora de 0..1 e recusado", async () => {
  const { comp } = comCamera();
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request({ ...baseArgs, curve: { x1: -0.5, y1: 0, x2: 1, y2: 1 } }))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.details.field, "curve");
});
