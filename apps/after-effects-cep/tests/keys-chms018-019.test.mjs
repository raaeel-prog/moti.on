/**
 * Regressoes de CHMS-018 (ease por curva) e CHMS-019 (reverse/clone de keys),
 * mais as duas garantias que faltavam no Kinetic e no Marker Loop.
 *
 * Cada teste aqui existe por causa de um defeito medido, e nao por cobertura:
 * o nome diz o que quebrava antes.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
const PropertyValueType = {
  NO_VALUE: 0,
  CUSTOM_VALUE: 7,
  MARKER: 8,
  TEXT_DOCUMENT: 12,
  OneD: 5,
  TwoD_SPATIAL: 3
};

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

class FakeProperty {
  constructor(options = {}) {
    this.name = options.name ?? "Position";
    this.matchName = options.matchName ?? "ADBE Position";
    this.propertyType = options.propertyType ?? PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.OneD;
    this.canVaryOverTime = options.canVaryOverTime ?? true;
    this.canSetExpression = options.canSetExpression ?? true;
    this.expression = options.expression ?? "";
    this.expressionEnabled = options.expressionEnabled ?? false;
    this.expressionError = "";
    this.parentProperty = options.parentProperty ?? null;
    this.keys = options.keys ? [...options.keys] : [];
    this.selectedKeys = options.selectedKeys ?? [];
    this.temporalEaseWrites = [];
    this.interpolationWrites = [];
  }
  get numKeys() {
    return this.keys.length;
  }
  keyTime(index) {
    return this.keys[index - 1].time;
  }
  keyValue(index) {
    return this.keys[index - 1].value;
  }
  keyInTemporalEase(index) {
    return this.keys[index - 1].inEase ?? [new FakeKeyframeEase(0, 16.67)];
  }
  keyOutTemporalEase(index) {
    return this.keys[index - 1].outEase ?? [new FakeKeyframeEase(0, 16.67)];
  }
  keyInInterpolationType() {
    return 1;
  }
  keyOutInterpolationType() {
    return 1;
  }
  setTemporalEaseAtKey(index, inEase, outEase) {
    this.temporalEaseWrites.push({ index, inEase, outEase });
    this.keys[index - 1].inEase = inEase;
    this.keys[index - 1].outEase = outEase;
  }
  setInterpolationTypeAtKey(index, inType, outType) {
    this.interpolationWrites.push({ index, inType, outType });
  }

  // Restante do protocolo de keyframe que MotionKeyframes.captureProperty e
  // restoreProperty exercitam. Sem ele, capture lanca e o comando falha por
  // motivo que nada tem a ver com o que o teste esta medindo.
  key(index) {
    const key = this.keys[index - 1];
    if (!key) throw new Error(`key ${index} ausente`);
    return key;
  }
  keyTemporalContinuous(index) { return this.key(index).temporalContinuous ?? false; }
  keyTemporalAutoBezier(index) { return this.key(index).temporalAutoBezier ?? false; }
  keyRoving(index) { return this.key(index).roving ?? false; }
  keySelected(index) { return this.selectedKeys.indexOf(index) >= 0; }
  removeKey(index) { this.keys.splice(index - 1, 1); }
  setValueAtTime(time, value) {
    const existente = this.keys.find((key) => Math.abs(key.time - time) < 1e-9);
    if (existente) {
      existente.value = value;
      return;
    }
    this.keys.push({ time, value });
    this.keys.sort((a, b) => a.time - b.time);
  }
  setTemporalContinuousAtKey(index, value) { this.key(index).temporalContinuous = value; }
  setTemporalAutoBezierAtKey(index, value) { this.key(index).temporalAutoBezier = value; }
  setRovingAtKey(index, value) { this.key(index).roving = value; }
  setSelectedAtKey(index, value) {
    const posicao = this.selectedKeys.indexOf(index);
    if (value && posicao < 0) this.selectedKeys.push(index);
    if (!value && posicao >= 0) this.selectedKeys.splice(posicao, 1);
  }
}

class FakeTransformGroup {
  constructor(position) {
    this.position = position;
  }
  property(name) {
    return name === "ADBE Position" ? this.position : null;
  }
}

class FakeLayer {
  constructor(options = {}) {
    this.name = options.name ?? "Camada";
    this.startTime = options.startTime ?? 0;
    this.inPoint = options.inPoint ?? 0;
    this.outPoint = options.outPoint ?? 4;
    this.position = options.position ?? new FakeProperty({ keys: [] });
    this.position.parentProperty = new FakeTransformGroup(this.position);
    this.position.parentProperty.parentProperty = this;
    this.parentProperty = null;
  }
  property(matchName) {
    if (matchName === "ADBE Transform Group") return this.position.parentProperty;
    return null;
  }
}

class FakeCompItem {
  constructor(layers = [], selectedProperties = []) {
    this.selectedLayers = layers;
    this.selectedProperties = selectedProperties;
    this.frameDuration = 1 / 25;
    this.numLayers = layers.length;
  }
  layer(index) {
    return this.selectedLayers[index - 1];
  }
}

async function fixture(comp, files) {
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
      "src/expression-templates.jsx",
      "src/keyframe-operations.jsx",
      ...files,
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 },
      TextLayer: class FakeTextLayer {},
      MarkerValue: class FakeMarkerValue {}
    }
  );
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

const kineticArgs = {
  direction: "in",
  durationFrames: 15,
  overshoot: 1.2,
  rotation: 0,
  scale: 0,
  opacity: 0,
  staggerFrames: 0,
  splitMode: "none"
};

function keyedPosition(name) {
  return new FakeProperty({
    name,
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ]
  });
}

test("Reverse e Clone deixam o grupo de Undo para o dispatcher, com o rotulo localizado", async () => {
  for (const [command, file, rotulo] of [
    ["ae.keys.reverse", "src/commands/keys-reverse.jsx", "Moti.on: inverter keyframes"],
    ["ae.keys.clone", "src/commands/keys-clone.jsx", "Moti.on: duplicar keyframes"]
  ]) {
    const property = keyedPosition("Position");
    property.selectedKeys = [1, 2];
    const layer = new FakeLayer({ position: property });
    const { scope, calls } = await fixture(new FakeCompItem([layer], [property]), [file]);

    const response = JSON.parse(scope.MotionAE.dispatch(request(command, command === "ae.keys.clone" ? { mode: "repeat" } : {})));

    assert.equal(response.ok, true, `${command} deveria concluir`);
    // Exatamente um par begin/end, e o rotulo vem do descriptor em pt-BR.
    // Antes cada comando abria um segundo grupo com rotulo em ingles fixo, e o
    // After Effects nao aninha grupos: o de dentro fechava o de fora.
    assert.deepEqual(calls, [["begin", rotulo], ["end"]], `${command} abriu grupo proprio`);
  }
});

test("Kinetic aplica a cada camada as propriedades daquela camada", async () => {
  const posA = keyedPosition("A");
  const posB = keyedPosition("B");
  const layerA = new FakeLayer({ name: "A", position: posA });
  const layerB = new FakeLayer({ name: "B", position: posB });
  const { scope } = await fixture(
    new FakeCompItem([layerA, layerB], [posA, posB]),
    ["src/commands/animate-kinetic.jsx"]
  );

  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.kinetic", kineticArgs)));

  assert.equal(response.ok, true);
  // `comp.selectedProperties` e da composicao inteira. Lida sem filtrar por
  // camada, a propriedade da primeira recebia a expressao duas vezes e a
  // segunda camada ficava sem nada.
  assert.equal(response.data.appliedCount, 2);
  assert.ok(posA.expression.includes("MOTION_EXPRESSION v1 | ae.animate.kinetic"));
  assert.ok(posB.expression.includes("MOTION_EXPRESSION v1 | ae.animate.kinetic"));
});

test("stagger zero nao vira dois, e o atraso mora na expressao e nao no startTime", async () => {
  const posA = keyedPosition("A");
  const posB = keyedPosition("B");
  const layerA = new FakeLayer({ name: "A", position: posA });
  const layerB = new FakeLayer({ name: "B", position: posB });
  const { scope } = await fixture(
    new FakeCompItem([layerA, layerB], [posA, posB]),
    ["src/commands/animate-kinetic.jsx"]
  );

  JSON.parse(scope.MotionAE.dispatch(request("ae.animate.kinetic", { ...kineticArgs, staggerFrames: 0 })));

  // `Number(args.staggerFrames) || 2` convertia o zero pedido em dois frames.
  assert.ok(posA.expression.includes("var delayF = 0;"));
  assert.ok(posB.expression.includes("var delayF = 0;"));
  // E o atraso nao pode deslocar a camada: startTime acumula a cada reaplicacao
  // e nao volta quando a expressao e removida.
  assert.equal(layerA.startTime, 0);
  assert.equal(layerB.startTime, 0);
});

test("stagger positivo entra como token por camada, sem tocar o startTime", async () => {
  const posA = keyedPosition("A");
  const posB = keyedPosition("B");
  const layerA = new FakeLayer({ name: "A", position: posA });
  const layerB = new FakeLayer({ name: "B", position: posB });
  const { scope } = await fixture(
    new FakeCompItem([layerA, layerB], [posA, posB]),
    ["src/commands/animate-kinetic.jsx"]
  );

  JSON.parse(scope.MotionAE.dispatch(request("ae.animate.kinetic", { ...kineticArgs, staggerFrames: 3 })));

  assert.ok(posA.expression.includes("var delayF = 0;"));
  assert.ok(posB.expression.includes("var delayF = 3;"));
  assert.equal(layerB.startTime, 0);
});

test("reaplicar Kinetic com o mesmo pedido produz exatamente a mesma expressao", async () => {
  const pos = keyedPosition("A");
  const layer = new FakeLayer({ position: pos });
  const { scope } = await fixture(new FakeCompItem([layer], [pos]), ["src/commands/animate-kinetic.jsx"]);

  scope.MotionAE.dispatch(request("ae.animate.kinetic", kineticArgs));
  const primeira = pos.expression;
  const segunda = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.kinetic", kineticArgs)));

  assert.equal(segunda.ok, true);
  assert.equal(pos.expression, primeira);
});

test("expressao de usuario com o cabecalho colado nao e tratada como gerenciada", async () => {
  const { scope } = await fixture(new FakeCompItem([], []), ["src/commands/animate-kinetic.jsx"]);
  const { MotionExpressions } = scope;

  const gerada = MotionExpressions.renderKinetic({
    durationFrames: 15,
    overshoot: 1.2,
    direction: "both",
    delayFrames: 0
  });
  assert.equal(MotionExpressions.isManagedKinetic(gerada), true);

  // O reconhecedor anterior aceitava qualquer corpo sem "alert(" e sem "eval(".
  // Blocklist falha aberta: bastava colar o cabecalho para o plugin sobrescrever
  // a expressao do usuario achando que era sua.
  assert.equal(
    MotionExpressions.isManagedKinetic("// MOTION_EXPRESSION v1 | ae.animate.kinetic\nwiggle(2, 30);"),
    false
  );
  assert.equal(MotionExpressions.isManagedKinetic(gerada + "\nwiggle(2, 30);"), false);
  assert.equal(MotionExpressions.isManagedKinetic(gerada.replace("var ov = 1.2;", "var ov = 1.2; x();")), false);
});

test("corpo adulterado de Marker Loop deixa de ser reconhecido como gerenciado", async () => {
  const { scope } = await fixture(new FakeCompItem([], []), ["src/commands/animate-kinetic.jsx"]);
  const { MotionExpressions } = scope;

  const gerada = MotionExpressions.renderMarkerLoop({
    inMarkerName: "loop_in",
    outMarkerName: "loop_out",
    loopType: "cycle",
    clampToLayer: true
  });

  assert.equal(MotionExpressions.isManagedMarkerLoop(gerada), true);
  assert.match(gerada, /^\/\/ MOTION_EXPRESSION v1 \| ae\.time\.marker-loop\n/);
  assert.equal(
    MotionExpressions.isManagedMarkerLoop("// MOTION_EXPRESSION v1 | ae.time.marker-loop\nvalue;"),
    false
  );
  assert.equal(MotionExpressions.isManagedMarkerLoop(gerada + "value * 2;"), false);
});

test("Ease relata quantos keyframes recebeu a curva, e nao um changed fixo", async () => {
  const property = new FakeProperty({
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ],
    selectedKeys: [1, 2]
  });
  const layer = new FakeLayer({ position: property });
  const { scope } = await fixture(
    new FakeCompItem([layer], [property]),
    ["src/commands/keys-ease.jsx"]
  );

  const response = JSON.parse(
    scope.MotionAE.dispatch(
      request("ae.keys.ease.apply", { x1: 0.5, y1: 1, x2: 0.5, y2: 0, applyIn: true, applyOut: true })
    )
  );

  assert.equal(response.ok, true);
  assert.equal(response.data.appliedCount, 2);
  assert.equal(property.temporalEaseWrites.length, 2);
});

test("Ease com handle vertical pede velocidade, e nao pausa", async () => {
  const property = new FakeProperty({
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ],
    selectedKeys: [1]
  });
  const layer = new FakeLayer({ position: property });
  const { scope } = await fixture(
    new FakeCompItem([layer], [property]),
    ["src/commands/keys-ease.jsx"]
  );

  // x1 = 0 e handle vertical: a curva sai do keyframe na velocidade maxima.
  // `x1 === 0 ? 0 : y1 / x1` devolvia zero — uma pausa — em silencio.
  scope.MotionAE.dispatch(
    request("ae.keys.ease.apply", { x1: 0, y1: 1, x2: 0.5, y2: 0, applyIn: false, applyOut: true })
  );

  const escrita = property.temporalEaseWrites[0];
  assert.ok(escrita, "esperava uma escrita de ease");
  assert.ok(escrita.outEase[0].speed > 0, `velocidade de saida deveria ser positiva, veio ${escrita.outEase[0].speed}`);
  assert.equal(escrita.outEase[0].influence, 0.1);
});
