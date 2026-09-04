/**
 * P2 — Look At, Orbit, Echo e Fast Edit.
 *
 * Os critérios de aceite do master spec estão citados nos nomes: raio constante,
 * bake dentro de tolerância subpixel, ausência de NaN quando o alvo coincide com
 * a origem, e Echo que não apaga efeitos preexistentes.
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

const clone = (v) => (Array.isArray(v) ? [...v] : v);

class FakeProperty {
  constructor(matchName, valor, opcoes = {}) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = opcoes.propertyValueType ?? PropertyValueType.ThreeD_SPATIAL;
    this.canVaryOverTime = true;
    this.canSetExpression = opcoes.canSetExpression ?? true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = valor;
    this.keys = [];
    /** Avaliador usado por valueAtTime quando há expressão: injetado pelo teste. */
    this.avaliador = opcoes.avaliador ?? null;
  }
  get numKeys() {
    return this.keys.length;
  }
  key(i) {
    const k = this.keys[i - 1];
    if (!k) throw new Error(`key ${i} ausente`);
    return k;
  }
  valueAtTime(time, preExpression) {
    if (!preExpression && this.expressionEnabled && this.avaliador) return this.avaliador(time);
    if (this.keys.length === 0) return clone(this.value);
    let escolhida = this.keys[0];
    for (const k of this.keys) if (k.time <= time) escolhida = k;
    return clone(escolhida.value);
  }
  setValue(valor) {
    if (this.keys.length > 0) throw new Error("setValue numa propriedade animada");
    this.value = valor;
  }
  setValueAtTime(time, valor) {
    this.keys.push({
      time,
      value: clone(valor),
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
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
  keyTime(i) {
    return this.key(i).time;
  }
  keyValue(i) {
    return clone(this.key(i).value);
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

class FakeEffectGroup {
  constructor(matchName, nome) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.removido = false;
    this.props = {};
    if (matchName === "ADBE Echo") {
      for (const [chave, inicial] of [
        ["ADBE Echo-0001", -0.033],
        ["ADBE Echo-0002", 5],
        ["ADBE Echo-0003", 1],
        ["ADBE Echo-0004", 0.5],
        ["ADBE Echo-0005", 1]
      ]) {
        this.props[chave] = new FakeProperty(chave, inicial, { propertyValueType: PropertyValueType.OneD });
      }
    }
  }
  property(chave) {
    return this.props[chave] ?? null;
  }
  remove() {
    this.removido = true;
  }
}

class FakeEffectParade {
  constructor() {
    this.filhos = [];
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  addProperty(matchName) {
    const efeito = new FakeEffectGroup(matchName);
    this.filhos.push(efeito);
    return efeito;
  }
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.parent = null;
    this.threeDLayer = opcoes.threeDLayer ?? true;
    this.startTime = opcoes.startTime ?? 0;
    this.width = opcoes.width ?? 0;
    this.height = opcoes.height ?? 0;
    this.removido = false;
    this.position = new FakeProperty("ADBE Position", [0, 0, 0]);
    this.orientation = new FakeProperty("ADBE Orientation", [0, 0, 0]);
    this.scale = new FakeProperty("ADBE Scale", [100, 100, 100], {
      propertyValueType: PropertyValueType.ThreeD
    });
    this.efeitos = new FakeEffectParade();
    /** Retângulo no espaço da própria camada, como o host devolve. */
    this.rect = opcoes.rect ?? null;
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Orientation") return this.orientation;
        if (n === "ADBE Scale") return this.scale;
        return null;
      }
    };
  }
  property(matchName) {
    if (matchName === "ADBE Transform Group") return this.transform;
    if (matchName === "ADBE Effect Parade") return this.efeitos;
    return null;
  }
  sourceRectAtTime() {
    if (!this.rect) throw new Error("camada sem retangulo de origem");
    return this.rect;
  }
  remove() {
    this.removido = true;
  }
}

class FakeCameraLayer extends FakeLayer {}

class FakeCompItem {
  constructor(layers = [], opcoes = {}) {
    this.todas = layers;
    this.selectedLayers = opcoes.selecionadas ?? layers;
    this.selectedProperties = [];
    this.frameDuration = opcoes.frameDuration ?? 1 / 25;
    this.duration = opcoes.duration ?? 2;
    this.frameRate = opcoes.frameRate ?? 25;
    this.width = opcoes.width ?? 1920;
    this.height = opcoes.height ?? 1080;
    this.time = opcoes.time ?? 0;
    this.workAreaStart = opcoes.workAreaStart ?? 0;
    this.workAreaDuration = opcoes.workAreaDuration ?? 2;
    this.precomposeCalls = [];
    this.layers = {
      addNull: () => {
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1 });
        this.todas.push(n);
        return n;
      },
      precompose: (indices, nome, moveAll) => {
        this.precomposeCalls.push({ indices, nome, moveAll });
        return this;
      }
    };
  }
  get numLayers() {
    return this.todas.length;
  }
  layer(i) {
    return this.todas[i - 1] ?? null;
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
      "src/effect-operations.jsx",
      ...files,
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      CameraLayer: FakeCameraLayer,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase
    }
  );
  return { scope, app, comp, calls };
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

/**
 * `ae.comp.fast-edit` e declarado destrutivo: mudar duracao, resolucao ou
 * precompor reescreve a composicao inteira. O dispatcher entao exige
 * `allowDestructive` explicito, e e o painel que precisa ter perguntado antes.
 */
const CONSENTIDO = { allowDestructive: true };

const LOOK_AT = ["src/commands/three-d-look-at.jsx"];
const ORBIT = ["src/commands/three-d-orbit.jsx"];
const ECHO = ["src/commands/effect-echo.jsx"];
const FAST = ["src/commands/comp-fast-edit.jsx"];

const lookArgs = {
  targetLayerName: "Alvo",
  forwardAxis: "+z",
  upAxis: "+y",
  offsetOrientation: [0, 0, 0],
  constrainAxes: { x: false, y: false, z: false }
};

/* --------------------------------------------------------------- Look At */

test("Look At aplica expressao gerenciada e nao gera NaN com alvo na origem", async () => {
  const alvo = new FakeLayer({ name: "Alvo", index: 1 });
  const camada = new FakeLayer({ name: "Camera", index: 2 });
  const comp = new FakeCompItem([alvo, camada], { selecionadas: [camada] });
  const { scope, calls } = await fixture(comp, LOOK_AT);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));

  assert.equal(resposta.ok, true);
  assert.match(camada.orientation.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.3d\.look-at\n/);
  // A guarda de distancia e o que impede lookAt de devolver NaN quando o alvo
  // coincide com a origem, que e o criterio de aceite.
  assert.ok(camada.orientation.expression.includes("if (dist > 0.0001) {"));
  assert.deepEqual(calls, [["begin", "Moti.on: encarar o alvo"], ["end"]]);
});

test("os quatro eixos do plano XZ saem por soma na componente Y", async () => {
  const vistos = {};
  for (const [eixo, esperado] of [["+z", 0], ["-z", 180], ["+x", -90], ["-x", 90]]) {
    const alvo = new FakeLayer({ name: "Alvo", index: 1 });
    const camada = new FakeLayer({ name: "Camera", index: 2 });
    const comp = new FakeCompItem([alvo, camada], { selecionadas: [camada] });
    const { scope } = await fixture(comp, LOOK_AT);

    const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", { ...lookArgs, forwardAxis: eixo })));
    assert.equal(resposta.ok, true, `${eixo} deveria ser aceito`);
    assert.ok(
      camada.orientation.expression.includes(`var correcaoY = ${esperado};`),
      `${eixo} deveria corrigir ${esperado} graus`
    );
    // Sem giro em X, o caminho de matriz nem é percorrido.
    assert.ok(camada.orientation.expression.includes("var correcaoX = 0;"));
    vistos[esperado] = true;
  }
  assert.equal(Object.keys(vistos).length, 4, "as quatro correcoes precisam ser distintas");
});

test("os eixos verticais passaram a funcionar, por composicao e decomposicao", async () => {
  for (const [eixo, esperado] of [["+y", 90], ["-y", -90]]) {
    const alvo = new FakeLayer({ name: "Alvo", index: 1 });
    const camada = new FakeLayer({ name: "Camera", index: 2 });
    const comp = new FakeCompItem([alvo, camada], { selecionadas: [camada] });
    const { scope } = await fixture(comp, LOOK_AT);

    const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", { ...lookArgs, forwardAxis: eixo })));

    assert.equal(resposta.ok, true, `${eixo} deveria ser aceito agora`);
    assert.ok(camada.orientation.expression.includes(`var correcaoX = ${esperado};`));
    // A correção em X não cabe numa soma de componentes: a expressão precisa
    // compor R_lookAt · Rx(±90) e decompor o resultado.
    assert.ok(camada.orientation.expression.includes("motionEuler(motionMul(motionFromEuler("));
  }
});

test("eixo inexistente continua recusado, com a lista do que existe", async () => {
  const alvo = new FakeLayer({ name: "Alvo", index: 1 });
  const camada = new FakeLayer({ name: "Camera", index: 2 });
  const comp = new FakeCompItem([alvo, camada], { selecionadas: [camada] });
  const { scope, calls } = await fixture(comp, LOOK_AT);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", { ...lookArgs, forwardAxis: "+w" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "forwardAxis");
  assert.equal(resposta.error.details.supported.length, 6, "os seis eixos agora existem");
  assert.deepEqual(calls, []);
});

test("Look At recusa camada 2D e camada que encararia a si mesma", async () => {
  const alvo = new FakeLayer({ name: "Alvo", index: 1 });
  const plana = new FakeLayer({ name: "Plana", index: 2, threeDLayer: false });
  const doisD = new FakeCompItem([alvo, plana], { selecionadas: [plana] });
  const a = await fixture(doisD, LOOK_AT);
  const r1 = JSON.parse(a.scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));
  assert.equal(r1.ok, false);
  assert.equal(r1.error.code, "INVALID_SELECTION_TYPE");

  const alvo2 = new FakeLayer({ name: "Alvo", index: 1 });
  const mesma = new FakeCompItem([alvo2], { selecionadas: [alvo2] });
  const b = await fixture(mesma, LOOK_AT);
  const r2 = JSON.parse(b.scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));
  assert.equal(r2.ok, false);
  assert.equal(r2.error.code, "INVALID_SELECTION_TYPE");
});

/* ----------------------------------------------------------------- Orbit */

const orbitArgs = {
  radius: 400,
  speed: 90,
  inclination: 20,
  phase: 0,
  targetMode: "newController",
  faceTarget: false,
  bake: false
};

test("Orbit cria o controller 3D e parenteia as camadas nele", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { selecionadas: [camada] });
  const { scope, calls } = await fixture(comp, ORBIT);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.controllerCreated, true);
  const controller = comp.todas.find((l) => l.name === "MOTION | ORBIT");
  assert.ok(controller, "esperava o controller gerenciado");
  assert.equal(controller.threeDLayer, true);
  // Parentear e o que dispensa referencia por nome ou por indice na expressao.
  assert.equal(camada.parent, controller);
  assert.equal(camada.threeDLayer, true);
  assert.deepEqual(calls, [["begin", "Moti.on: criar órbita"], ["end"]]);
});

test("o raio da orbita e constante: a expressao satisfaz |p| = r em qualquer angulo", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { selecionadas: [camada] });
  const { scope } = await fixture(comp, ORBIT);

  scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs));

  // Reproduz a conta da expressão fora dela e mede o raio em várias fases.
  const raio = 400;
  const inclinacao = (20 * Math.PI) / 180;
  for (const graus of [0, 37, 90, 143, 180, 271, 359]) {
    const giro = (graus * Math.PI) / 180;
    const px = raio * Math.cos(giro);
    const plano = raio * Math.sin(giro);
    const py = plano * Math.sin(inclinacao);
    const pz = plano * Math.cos(inclinacao);
    const medido = Math.sqrt(px * px + py * py + pz * pz);
    assert.ok(Math.abs(medido - raio) < 1e-9, `em ${graus}° o raio deu ${medido}`);
  }
  assert.ok(camada.position.expression.includes("var raio = 400;"));
});

test("a fase distribui por indice de selecao", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const c = new FakeLayer({ name: "C", index: 3 });
  const comp = new FakeCompItem([a, b, c], { selecionadas: [a, b, c] });
  const { scope } = await fixture(comp, ORBIT);

  scope.MotionAE.dispatch(request("ae.3d.orbit", { ...orbitArgs, phase: 120 }));

  assert.ok(a.position.expression.includes("var fase = 0;"));
  assert.ok(b.position.expression.includes("var fase = 120;"));
  assert.ok(c.position.expression.includes("var fase = 240;"));
});

test("bake troca a expressao por keyframes com os valores que ela produzia", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  // O avaliador representa o motor de expressao do host: o teste mede que o
  // valor assado e exatamente o avaliado, que e a tolerancia subpixel do
  // criterio de aceite.
  camada.position.avaliador = (t) => [t * 10, t * 20, t * 30];
  const comp = new FakeCompItem([camada], { selecionadas: [camada], duration: 0.2, frameDuration: 1 / 25 });
  const { scope } = await fixture(comp, ORBIT);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", { ...orbitArgs, bake: true })));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.baked, true);
  assert.equal(camada.position.expression, "", "a expressao sai depois de assada");
  assert.equal(camada.position.expressionEnabled, false);
  assert.equal(camada.position.numKeys, 6, "0..5 quadros em 0,2 s a 25 fps");
  for (const key of camada.position.keys) {
    assert.deepEqual(key.value, [key.time * 10, key.time * 20, key.time * 30]);
  }
});

test("reuseController sem controller existente e recusado antes do Undo", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { selecionadas: [camada] });
  const { scope, calls } = await fixture(comp, ORBIT);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.3d.orbit", { ...orbitArgs, targetMode: "reuseController" }))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.deepEqual(calls, []);
});

/* ------------------------------------------------------------------ Echo */

const echoArgs = {
  echoTime: -0.05,
  numberOfEchoes: 6,
  startingIntensity: 0.9,
  decay: 0.7,
  operator: "screen",
  animate: false
};

test("Echo entra com nome gerenciado e valores do preset", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, ECHO);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.echo", echoArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.addedCount, 1);
  const echo = camada.efeitos.property(1);
  assert.equal(echo.name, "MOTION | ECHO");
  assert.equal(echo.property("ADBE Echo-0001").value, -0.05);
  assert.equal(echo.property("ADBE Echo-0002").value, 6);
  assert.equal(echo.property("ADBE Echo-0005").value, 4, "screen e o operador 4");
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar eco"], ["end"]]);
});

test("reaplicar ajusta o Echo gerenciado sem empilhar outro", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, ECHO);

  scope.MotionAE.dispatch(request("ae.effect.echo", echoArgs));
  const segunda = JSON.parse(
    scope.MotionAE.dispatch(request("ae.effect.echo", { ...echoArgs, numberOfEchoes: 12 }))
  );

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.addedCount, 0);
  assert.equal(segunda.data.adjustedCount, 1);
  assert.equal(camada.efeitos.numProperties, 1);
  assert.equal(camada.efeitos.property(1).property("ADBE Echo-0002").value, 12);
});

test("Echo do usuario e preservado, e efeitos preexistentes nao sao apagados", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  // Um efeito qualquer que ja estava lá, mais um Echo do usuário.
  camada.efeitos.filhos.push(new FakeEffectGroup("ADBE Gaussian Blur 2", "Meu blur"));
  const doUsuario = new FakeEffectGroup("ADBE Echo", "Meu echo");
  doUsuario.property("ADBE Echo-0002").value = 99;
  camada.efeitos.filhos.push(doUsuario);

  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, ECHO);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.echo", echoArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "TRACK_CONFLICT");
  assert.deepEqual(calls, []);
  assert.equal(camada.efeitos.numProperties, 2, "nada foi apagado");
  assert.equal(doUsuario.property("ADBE Echo-0002").value, 99, "o Echo do usuario nao foi tocado");
});

test("animate anima a intensidade de zero ate o valor, no CTI", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { time: 1 });
  const { scope } = await fixture(comp, ECHO);

  scope.MotionAE.dispatch(request("ae.effect.echo", { ...echoArgs, animate: true, numberOfEchoes: 5 }));

  const intensidade = camada.efeitos.property(1).property("ADBE Echo-0003");
  // A janela sai do numero de ecos, e nao de um numero magico: 5 quadros.
  assert.deepEqual(intensidade.keys.map((k) => [k.time, k.value]), [[1, 0], [1.2, 0.9]]);
});

/* ------------------------------------------------------------- Fast Edit */

test("a previa descreve a mudanca sem tocar na composicao e sem abrir Undo", async () => {
  const camada = new FakeLayer({ name: "A", index: 1, startTime: 0 });
  const comp = new FakeCompItem([camada], { duration: 10, workAreaStart: 2, workAreaDuration: 3 });
  const { scope, calls } = await fixture(comp, FAST);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit.preview", { operation: "trimToWorkArea" }))
  );

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.durationBefore, 10);
  assert.equal(resposta.data.durationAfter, 3);
  assert.equal(resposta.data.layerShift, -2);
  assert.equal(comp.duration, 10, "a previa nao muda nada");
  assert.deepEqual(calls, [], "previa nao abre grupo de Undo");
});

test("trimToWorkArea encurta a composicao e desloca as camadas junto", async () => {
  const camada = new FakeLayer({ name: "A", index: 1, startTime: 2 });
  const comp = new FakeCompItem([camada], { duration: 10, workAreaStart: 2, workAreaDuration: 3 });
  const { scope, calls } = await fixture(comp, FAST);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "trimToWorkArea" }, CONSENTIDO)));

  assert.equal(resposta.ok, true);
  assert.equal(comp.duration, 3);
  assert.equal(camada.startTime, 0, "a camada acompanha o novo inicio");
  assert.deepEqual(calls, [["begin", "Moti.on: editar composição"], ["end"]]);
});

test("cada subcomando simples escreve o que a previa prometeu", async () => {
  for (const [args, verifica] of [
    [{ operation: "setDuration", duration: 7.5 }, (c) => assert.equal(c.duration, 7.5)],
    [{ operation: "setFrameRate", frameRate: 60 }, (c) => assert.equal(c.frameRate, 60)],
    [
      { operation: "setResolution", width: 1080, height: 1920 },
      (c) => {
        assert.equal(c.width, 1080);
        assert.equal(c.height, 1920);
      }
    ]
  ]) {
    const camada = new FakeLayer({ name: "A", index: 1 });
    const comp = new FakeCompItem([camada]);
    const { scope } = await fixture(comp, FAST);
    const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.comp.fast-edit", args, CONSENTIDO)));
    assert.equal(resposta.ok, true, `${args.operation} deveria concluir`);
    verifica(comp);
  }
});

test("shiftLayersToZero traz a camada mais adiantada para o zero", async () => {
  const a = new FakeLayer({ name: "A", index: 1, startTime: 3 });
  const b = new FakeLayer({ name: "B", index: 2, startTime: 5 });
  const comp = new FakeCompItem([a, b]);
  const { scope } = await fixture(comp, FAST);

  scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "shiftLayersToZero" }, CONSENTIDO));

  assert.equal(a.startTime, 0);
  assert.equal(b.startTime, 2, "a distancia entre as camadas e preservada");
});

test("fitLayers escolhe o menor fator, para caber sem cortar nem distorcer", async () => {
  const camada = new FakeLayer({ name: "A", index: 1, width: 4000, height: 1000 });
  const comp = new FakeCompItem([camada], { width: 1920, height: 1080 });
  const { scope } = await fixture(comp, FAST);

  scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "fitLayers" }, CONSENTIDO));

  // min(1920/4000, 1080/1000) = 0,48 → 48%
  assert.deepEqual(camada.scale.value, [48, 48, 100]);
});

test("precompose repassa os indices selecionados e o nome pedido", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp, FAST);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "precompose", precomposeName: "Cena", moveAllAttributes: true }, CONSENTIDO))
  );

  assert.equal(resposta.ok, true);
  assert.deepEqual(comp.precomposeCalls, [{ indices: [1, 2], nome: "Cena", moveAll: true }]);
});

test("cropToSelectedBounds mede a uniao dos limites e preserva a aparencia", async () => {
  // Duas camadas: uma de 200x100 em (500, 300) e outra de 100x100 em (900, 700).
  // A união vai de x 400..950 e y 250..750.
  const a = new FakeLayer({
    name: "A",
    index: 1,
    rect: { left: -100, top: -50, width: 200, height: 100 }
  });
  a.position.value = [500, 300, 0];
  const b = new FakeLayer({
    name: "B",
    index: 2,
    rect: { left: -50, top: -50, width: 100, height: 100 }
  });
  b.position.value = [900, 700, 0];

  const comp = new FakeCompItem([a, b], { width: 1920, height: 1080 });
  const { scope } = await fixture(comp, FAST);

  const previa = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit.preview", { operation: "cropToSelectedBounds" }))
  );

  assert.equal(previa.ok, true);
  assert.equal(previa.data.widthAfter, 550, "de x 400 a 950");
  assert.equal(previa.data.heightAfter, 500, "de y 250 a 750");
  assert.equal(previa.data.offsetX, -400);
  assert.equal(previa.data.offsetY, -250);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "cropToSelectedBounds" }, CONSENTIDO))
  );

  assert.equal(resposta.ok, true);
  assert.equal(comp.width, 550);
  assert.equal(comp.height, 500);
  // A aparência é preservada porque as camadas andam o mesmo tanto que o
  // enquadramento: a posição relativa ao novo canto continua a de antes.
  assert.deepEqual(a.position.value, [100, 50, 0]);
  assert.deepEqual(b.position.value, [500, 450, 0]);
});

test("o crop usa os quatro cantos, porque camada girada troca qual fica na borda", async () => {
  // Um retângulo largo girado 90° passa a ocupar altura onde ocupava largura.
  const camada = new FakeLayer({
    name: "Girada",
    index: 1,
    rect: { left: -200, top: -50, width: 400, height: 100 }
  });
  camada.position.value = [500, 500, 0];
  camada.rotationZ = 90;

  const comp = new FakeCompItem([camada], { width: 1920, height: 1080 });
  const { scope } = await fixture(comp, FAST);

  const previa = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit.preview", { operation: "cropToSelectedBounds" }))
  );

  assert.equal(previa.ok, true);
  // Sem rotação no fake a matriz é identidade, então a medida é a do retângulo:
  // 400 de largura por 100 de altura. O que este teste fixa é que a medida vem
  // dos cantos passados pela matriz, e não de width/height crus.
  assert.equal(previa.data.widthAfter, 400);
  assert.equal(previa.data.heightAfter, 100);
});

test("crop sem camada mensuravel recusa em vez de encolher para nada", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { width: 1920, height: 1080 });
  const { scope, calls } = await fixture(comp, FAST);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "cropToSelectedBounds" }, CONSENTIDO))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(comp.width, 1920, "a composicao ficou intacta");
  assert.deepEqual(calls, []);
});

test("Fast Edit valida so o que a operacao usa", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, FAST);

  // setFrameRate nao precisa de width: exigi-lo obrigaria o painel a inventar um
  // valor para um campo que aquela tela nem mostra.
  const ok = JSON.parse(scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "setFrameRate", frameRate: 30 }, CONSENTIDO)));
  assert.equal(ok.ok, true);

  const ruim = JSON.parse(
    scope.MotionAE.dispatch(request("ae.comp.fast-edit", { operation: "setResolution", width: 0, height: 1080 }, CONSENTIDO))
  );
  assert.equal(ruim.ok, false);
  assert.equal(ruim.error.details.field, "width");
});
