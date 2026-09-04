/**
 * Os tres comandos que faltavam para fechar o escopo P1: Inertial, Jump e
 * Copy/Paste Keys.
 *
 * Os criterios de aceite do master spec estao citados nos nomes dos testes, para
 * que uma falha aponte para a regra e nao so para a linha.
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
const KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };

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
    inInterpolation: KeyframeInterpolationType.BEZIER,
    outInterpolation: KeyframeInterpolationType.BEZIER,
    inEase: [new FakeKeyframeEase(0, 16.67)],
    outEase: [new FakeKeyframeEase(0, 16.67)],
    temporalContinuous: false,
    temporalAutoBezier: false,
    inTangent: [0, 0],
    outTangent: [0, 0],
    spatialContinuous: false,
    spatialAutoBezier: false,
    roving: false,
    selected: false,
    label: 0,
    ...overrides
  };
}

class FakeProperty {
  constructor(options = {}) {
    this.name = options.name ?? "Position";
    this.matchName = options.matchName ?? "ADBE Position";
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = options.propertyValueType ?? PropertyValueType.TwoD_SPATIAL;
    this.canVaryOverTime = options.canVaryOverTime ?? true;
    this.canSetExpression = options.canSetExpression ?? true;
    this.expression = options.expression ?? "";
    this.expressionEnabled = options.expressionEnabled ?? false;
    this.expressionError = "";
    this.parentProperty = options.parentProperty ?? null;
    this.value = options.value ?? [100, 200];
    this.keys = (options.keys ?? []).map((key) => ({ ...key, value: clone(key.value) }));
    this.selectedKeys = options.selectedKeys ?? [];
  }

  get numKeys() {
    return this.keys.length;
  }
  key(index) {
    const key = this.keys[index - 1];
    if (!key) throw new Error(`key ${index} ausente`);
    return key;
  }
  valueAtTime(time) {
    if (this.keys.length === 0) return clone(this.value);
    let escolhida = this.keys[0];
    for (const key of this.keys) if (key.time <= time) escolhida = key;
    return clone(escolhida.value);
  }
  keyTime(index) {
    return this.key(index).time;
  }
  keyValue(index) {
    return clone(this.key(index).value);
  }
  keyInInterpolationType(index) {
    return this.key(index).inInterpolation;
  }
  keyOutInterpolationType(index) {
    return this.key(index).outInterpolation;
  }
  keyInTemporalEase(index) {
    return this.key(index).inEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  keyOutTemporalEase(index) {
    return this.key(index).outEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  keyTemporalContinuous(index) {
    return this.key(index).temporalContinuous;
  }
  keyTemporalAutoBezier(index) {
    return this.key(index).temporalAutoBezier;
  }
  keyInSpatialTangent(index) {
    return [...this.key(index).inTangent];
  }
  keyOutSpatialTangent(index) {
    return [...this.key(index).outTangent];
  }
  keySpatialContinuous(index) {
    return this.key(index).spatialContinuous;
  }
  keySpatialAutoBezier(index) {
    return this.key(index).spatialAutoBezier;
  }
  keyRoving(index) {
    return this.key(index).roving;
  }
  keySelected(index) {
    return this.key(index).selected;
  }
  keyLabel(index) {
    return this.key(index).label;
  }
  removeKey(index) {
    this.keys.splice(index - 1, 1);
  }
  setValueAtTime(time, value) {
    const existente = this.keys.find((key) => Math.abs(key.time - time) < 1e-9);
    if (existente) {
      existente.value = clone(value);
      return;
    }
    this.keys.push(makeKey(time, value));
    this.keys.sort((a, b) => a.time - b.time);
  }
  setInterpolationTypeAtKey(index, inType, outType) {
    this.key(index).inInterpolation = inType;
    this.key(index).outInterpolation = outType;
  }
  setTemporalEaseAtKey(index, inEase, outEase) {
    this.key(index).inEase = inEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
    this.key(index).outEase = outEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  setTemporalContinuousAtKey(index, value) {
    this.key(index).temporalContinuous = value;
  }
  setTemporalAutoBezierAtKey(index, value) {
    this.key(index).temporalAutoBezier = value;
  }
  setSpatialTangentsAtKey(index, inTangent, outTangent) {
    this.key(index).inTangent = [...inTangent];
    this.key(index).outTangent = [...outTangent];
  }
  setSpatialContinuousAtKey(index, value) {
    this.key(index).spatialContinuous = value;
  }
  setSpatialAutoBezierAtKey(index, value) {
    this.key(index).spatialAutoBezier = value;
  }
  setRovingAtKey(index, value) {
    this.key(index).roving = value;
  }
  setSelectedAtKey(index, value) {
    this.key(index).selected = value;
  }
  setLabelAtKey(index, value) {
    this.key(index).label = value;
  }
}

class FakeTransformGroup {
  constructor(layer, props) {
    this.parentProperty = layer;
    this.props = props;
    for (const property of Object.values(props)) property.parentProperty = this;
  }
  property(matchName) {
    return this.props[matchName] ?? null;
  }
}

class FakeLayer {
  constructor(options = {}) {
    this.name = options.name ?? "Camada";
    this.parent = options.parent ?? null;
    this.parentProperty = null;
    this.inPoint = options.inPoint ?? 0;
    this.outPoint = options.outPoint ?? 4;
    this.position = options.position ?? new FakeProperty({ value: [100, 200] });
    this.scale =
      options.scale ??
      new FakeProperty({
        name: "Scale",
        matchName: "ADBE Scale",
        propertyValueType: PropertyValueType.TwoD,
        value: [100, 100]
      });
    this.transform = new FakeTransformGroup(this, {
      "ADBE Position": this.position,
      "ADBE Scale": this.scale
    });
  }
  property(matchName) {
    return matchName === "ADBE Transform Group" ? this.transform : null;
  }
}

class FakeCompItem {
  constructor(layers = [], selectedProperties = [], time = 1) {
    this.selectedLayers = layers;
    this.selectedProperties = selectedProperties;
    this.frameDuration = 1 / 25;
    this.time = time;
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
      "src/transform-math.jsx",
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
      KeyframeInterpolationType,
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

const INERTIAL = ["src/commands/animate-inertial.jsx"];
const JUMP = ["src/commands/animate-jump.jsx"];
const COPY = ["src/commands/keys-copy.jsx"];

const inertialArgs = {
  amplitude: 100,
  frequency: 2,
  decay: 4,
  maxDurationFrames: 30,
  startMode: "everyKey"
};

function animatedPosition() {
  return new FakeProperty({
    keys: [makeKey(0, [0, 0]), makeKey(1, [100, 0])],
    selectedKeys: [1, 2]
  });
}

/* ------------------------------------------------------------------ Inertial */

test("Inertial aplica expressao gerenciada num Undo do dispatcher", async () => {
  const position = animatedPosition();
  const layer = new FakeLayer({ position });
  const { scope, calls } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 1);
  assert.match(position.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.animate\.inertial\n/);
  assert.equal(position.expressionEnabled, true);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar inércia"], ["end"]]);
});

test("Inertial nao gera NaN antes do primeiro keyframe: o indice cai para zero", async () => {
  const position = animatedPosition();
  const layer = new FakeLayer({ position });
  const { scope } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs));

  // `nearestKey` devolve o keyframe 1 mesmo quando `time` esta antes dele. Sem o
  // ajuste, `key(0)` lanca e a propriedade vira NaN — que e exatamente o que o
  // criterio de aceite proibe.
  assert.ok(position.expression.includes("if (thisProperty.key(n).time > time) n = n - 1;"));
  assert.ok(position.expression.includes("var elegivel = n > 0 &&"));
});

test("Inertial converge para o valor final no limite configurado", async () => {
  const position = animatedPosition();
  const layer = new FakeLayer({ position });
  const { scope } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs));

  // A janela linear zera exatamente em maxDur; so o decaimento exponencial
  // deixaria residuo e a propriedade saltaria de volta no frame seguinte.
  assert.ok(position.expression.includes("var janela = 1 - t / maxDur;"));
  assert.ok(position.expression.includes("if (t >= 0 && t <= maxDur) {"));
});

test("Inertial usa add/mul: o motor JavaScript nao soma array com operador", async () => {
  const position = animatedPosition();
  const layer = new FakeLayer({ position });
  const { scope } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs));

  assert.ok(position.expression.includes("add(value, mul(v, oscilacao))"));
});

test("Inertial recusa propriedade com menos de dois keyframes", async () => {
  const position = new FakeProperty({ keys: [makeKey(0, [0, 0])] });
  const layer = new FakeLayer({ position });
  const { scope, calls } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.deepEqual(calls, [], "recusa antes de abrir o Undo");
});

test("Inertial preserva expressao de usuario e nao abre Undo", async () => {
  const position = new FakeProperty({
    keys: [makeKey(0, [0, 0]), makeKey(1, [100, 0])],
    expression: "wiggle(2, 30);",
    expressionEnabled: true
  });
  const layer = new FakeLayer({ position });
  const { scope, calls } = await fixture(new FakeCompItem([layer], [position]), INERTIAL);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.inertial", inertialArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.equal(position.expression, "wiggle(2, 30);");
  assert.deepEqual(calls, []);
});

/* ---------------------------------------------------------------------- Jump */

const jumpArgs = {
  height: 300,
  durationFrames: 20,
  direction: "up",
  squashStretch: 0,
  anticipationFrames: 0,
  staggerFrames: 0
};

test("Jump: a camada comeca e termina no mesmo ponto", async () => {
  const layer = new FakeLayer({ position: new FakeProperty({ value: [100, 200] }) });
  const { scope } = await fixture(new FakeCompItem([layer], [], 1), JUMP);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.jump", jumpArgs)));

  assert.equal(resposta.ok, true);
  const keys = layer.position.keys;
  assert.equal(keys.length, 3, "chao, apice, chao");
  assert.deepEqual(keys[0].value, [100, 200]);
  assert.deepEqual(keys[keys.length - 1].value, [100, 200], "o pouso volta ao ponto de partida");
});

test("Jump: a altura maxima corresponde ao input", async () => {
  const layer = new FakeLayer({ position: new FakeProperty({ value: [100, 200] }) });
  const { scope } = await fixture(new FakeCompItem([layer], [], 1), JUMP);

  scope.MotionAE.dispatch(request("ae.animate.jump", jumpArgs));

  // Y cresce para baixo no After Effects: subir 300 px e ir para 200 - 300.
  assert.deepEqual(layer.position.keys[1].value, [100, -100]);
});

for (const fps of [24, 30, 60]) {
  test(`Jump: a duracao corresponde ao input a ${fps} fps`, async () => {
    const layer = new FakeLayer({ position: new FakeProperty({ value: [0, 0] }) });
    const comp = new FakeCompItem([layer], [], 2);
    comp.frameDuration = 1 / fps;
    const { scope } = await fixture(comp, JUMP);

    scope.MotionAE.dispatch(request("ae.animate.jump", jumpArgs));

    const keys = layer.position.keys;
    const duracao = keys[keys.length - 1].time - keys[0].time;
    assert.ok(
      Math.abs(duracao - jumpArgs.durationFrames / fps) < 1e-9,
      `a ${fps} fps a duracao veio ${duracao}, esperava ${jumpArgs.durationFrames / fps}`
    );
    assert.ok(Math.abs(keys[0].time - comp.time) < 1e-9, "o salto comeca no CTI");
  });
}

test("Jump com antecipacao mantem a camada no chao ate a decolagem", async () => {
  const layer = new FakeLayer({ position: new FakeProperty({ value: [50, 50] }) });
  const comp = new FakeCompItem([layer], [], 0);
  const { scope } = await fixture(comp, JUMP);

  scope.MotionAE.dispatch(request("ae.animate.jump", { ...jumpArgs, anticipationFrames: 4 }));

  const keys = layer.position.keys;
  assert.equal(keys.length, 4);
  assert.deepEqual(keys[0].value, [50, 50]);
  assert.deepEqual(keys[1].value, [50, 50], "durante a antecipacao quem agacha e o Scale");
  assert.ok(Math.abs(keys[1].time - 4 / 25) < 1e-9);
  assert.deepEqual(keys[3].value, [50, 50]);
});

test("Jump com squash/stretch termina com Scale de volta ao normal", async () => {
  const layer = new FakeLayer();
  const { scope } = await fixture(new FakeCompItem([layer], [], 0), JUMP);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.animate.jump", { ...jumpArgs, squashStretch: 20 }))
  );

  assert.equal(resposta.ok, true);
  const escalas = layer.scale.keys;
  assert.ok(escalas.length >= 4);
  assert.deepEqual(escalas[0].value, [100, 100]);
  // Toda a deformacao cabe dentro da janela: o ultimo key volta ao normal e nao
  // sobra rabo de animacao depois da duracao declarada.
  assert.deepEqual(escalas[escalas.length - 1].value, [100, 100]);
  const pouso = escalas[escalas.length - 1].time;
  assert.ok(Math.abs(pouso - 20 / 25) < 1e-9);
});

test("Jump escalona por camada sem tocar o startTime", async () => {
  const a = new FakeLayer({ name: "A", position: new FakeProperty({ value: [0, 0] }) });
  const b = new FakeLayer({ name: "B", position: new FakeProperty({ value: [0, 0] }) });
  const { scope } = await fixture(new FakeCompItem([a, b], [], 0), JUMP);

  scope.MotionAE.dispatch(request("ae.animate.jump", { ...jumpArgs, staggerFrames: 5 }));

  assert.ok(Math.abs(a.position.keys[0].time - 0) < 1e-9);
  assert.ok(Math.abs(b.position.keys[0].time - 5 / 25) < 1e-9);
});

test("Jump recusa camada cujo pai gira, em vez de gravar um salto torto", async () => {
  const pai = new FakeLayer({ name: "Pai" });
  // Um pai girado faz o eixo Y da camada filha apontar para outro lugar.
  pai.transform.props["ADBE Rotate Z"] = new FakeProperty({
    name: "Rotation",
    matchName: "ADBE Rotate Z",
    propertyValueType: PropertyValueType.OneD,
    value: 30
  });
  const filha = new FakeLayer({ name: "Filha", parent: pai });
  const { scope, calls } = await fixture(new FakeCompItem([filha], [], 0), JUMP);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.animate.jump", jumpArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(calls, []);
  assert.equal(filha.position.numKeys, 0, "nada foi gravado");
});

test("Jump recusa antecipacao maior que a janela", async () => {
  const layer = new FakeLayer();
  const { scope } = await fixture(new FakeCompItem([layer], [], 0), JUMP);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.animate.jump", { ...jumpArgs, durationFrames: 8, anticipationFrames: 6 }))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "anticipationFrames");
});

/* ---------------------------------------------------------------- Copy Keys */

const pasteArgs = {
  pasteTime: "cti",
  mappingMode: "matchName",
  relativeTiming: true,
  includeExpressions: false,
  includeTangents: true
};

test("Copy nao muta e nao abre grupo de Undo", async () => {
  const origem = animatedPosition();
  const layer = new FakeLayer({ position: origem });
  const { scope, calls } = await fixture(new FakeCompItem([layer], [origem], 0), COPY);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.copy", {})));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.propertyCount, 1);
  assert.equal(resposta.data.keyCount, 2);
  // Copiar e leitura: um grupo de Undo aqui poluiria o historico com uma
  // entrada que nao desfaz nada.
  assert.deepEqual(calls, []);
});

test("round-trip de keyframes preserva valores, eases e tangentes", async () => {
  const origem = new FakeProperty({
    keys: [
      makeKey(0, [0, 0], {
        inEase: [new FakeKeyframeEase(11, 22)],
        outEase: [new FakeKeyframeEase(33, 44)],
        inTangent: [5, -5],
        outTangent: [-7, 7],
        roving: false
      }),
      makeKey(1, [100, 40], {
        inEase: [new FakeKeyframeEase(55, 66)],
        outEase: [new FakeKeyframeEase(77, 88)],
        inTangent: [1, 2],
        outTangent: [3, 4]
      })
    ],
    selectedKeys: [1, 2]
  });
  const destino = new FakeProperty({ value: [0, 0] });
  const layerOrigem = new FakeLayer({ name: "Origem", position: origem });
  const layerDestino = new FakeLayer({ name: "Destino", position: destino });

  const comp = new FakeCompItem([layerOrigem, layerDestino], [origem], 0);
  const { scope } = await fixture(comp, COPY);

  assert.equal(JSON.parse(scope.MotionAE.dispatch(request("ae.keys.copy", {}))).ok, true);

  comp.selectedProperties = [destino];
  const colagem = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.paste", pasteArgs)));

  assert.equal(colagem.ok, true);
  assert.equal(colagem.data.pastedKeys, 2);
  assert.equal(destino.numKeys, 2);
  assert.deepEqual(destino.keys.map((k) => k.value), [[0, 0], [100, 40]]);
  assert.deepEqual(
    destino.keys.map((k) => [k.inEase[0].speed, k.inEase[0].influence]),
    [[11, 22], [55, 66]]
  );
  assert.deepEqual(
    destino.keys.map((k) => [k.outEase[0].speed, k.outEase[0].influence]),
    [[33, 44], [77, 88]]
  );
  assert.deepEqual(destino.keys[0].inTangent, [5, -5]);
  assert.deepEqual(destino.keys[1].outTangent, [3, 4]);
});

test("colar no CTI ancora o bloco e preserva os intervalos", async () => {
  const origem = new FakeProperty({
    keys: [makeKey(0, [0, 0]), makeKey(2, [100, 0])],
    selectedKeys: [1, 2]
  });
  const destino = new FakeProperty({ value: [0, 0] });
  const comp = new FakeCompItem(
    [new FakeLayer({ position: origem }), new FakeLayer({ position: destino })],
    [origem],
    3
  );
  const { scope } = await fixture(comp, COPY);

  scope.MotionAE.dispatch(request("ae.keys.copy", {}));
  comp.selectedProperties = [destino];
  scope.MotionAE.dispatch(request("ae.keys.paste", pasteArgs));

  assert.deepEqual(destino.keys.map((k) => k.time), [3, 5], "o bloco pousa no CTI e mantem o intervalo de 2s");
});

test("incompatibilidade de dimensao vira warning, e nao derruba a colagem inteira", async () => {
  const origem2d = new FakeProperty({ keys: [makeKey(0, [0, 0]), makeKey(1, [10, 10])], selectedKeys: [1, 2] });
  const origemEscala = new FakeProperty({
    name: "Scale",
    matchName: "ADBE Scale",
    propertyValueType: PropertyValueType.TwoD,
    keys: [makeKey(0, [100, 100]), makeKey(1, [50, 50])],
    selectedKeys: [1, 2]
  });
  // Destino de Position com tres dimensoes: colar um valor 2D nele gravaria um
  // valor de tamanho errado.
  const destino3d = new FakeProperty({
    propertyValueType: PropertyValueType.ThreeD_SPATIAL,
    keys: [makeKey(0, [0, 0, 0])]
  });
  const destinoEscala = new FakeProperty({
    name: "Scale",
    matchName: "ADBE Scale",
    propertyValueType: PropertyValueType.TwoD,
    value: [100, 100]
  });

  const comp = new FakeCompItem(
    [new FakeLayer({ position: origem2d, scale: origemEscala })],
    [origem2d, origemEscala],
    0
  );
  const { scope } = await fixture(comp, COPY);

  scope.MotionAE.dispatch(request("ae.keys.copy", {}));
  comp.selectedProperties = [destino3d, destinoEscala];
  const colagem = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.paste", pasteArgs)));

  assert.equal(colagem.ok, true, "as propriedades compativeis ainda colam");
  assert.equal(colagem.data.pastedProperties, 1);
  assert.equal(colagem.warnings.length, 1);
  assert.equal(colagem.warnings[0].code, "paste.dimensionMismatch");
  assert.equal(destino3d.numKeys, 1, "o destino incompativel ficou intacto");
  assert.equal(destinoEscala.numKeys, 2);
});

test("colar sem ter copiado recusa antes de abrir o Undo", async () => {
  const destino = new FakeProperty({ value: [0, 0] });
  const comp = new FakeCompItem([new FakeLayer({ position: destino })], [destino], 0);
  const { scope, calls } = await fixture(comp, COPY);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.paste", pasteArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.deepEqual(calls, []);
});
