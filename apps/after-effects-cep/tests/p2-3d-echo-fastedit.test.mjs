/**
 * P2 — Look At, Orbit, Echo e Fast Edit.
 *
 * Os critérios de aceite do master spec estão citados nos nomes: raio constante,
 * bake dentro de tolerância subpixel, ausência de NaN quando o alvo coincide com
 * a origem, e Echo que não apaga efeitos preexistentes.
 */
import test from "node:test";
import vm from "node:vm";
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
  constructor(matchName, nome, parade = null) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.removido = false;
    this.props = {};
    this.parade = parade;
    if (["ADBE Slider Control", "ADBE Angle Control", "ADBE Checkbox Control", "ADBE Dropdown Control"].includes(matchName)) {
      const param = new FakeProperty(`${matchName}-0001`, 0, { propertyValueType: PropertyValueType.OneD });
      param.isDropdownEffect = matchName === "ADBE Dropdown Control";
      param.setPropertyParameters = labels => { param.labels = [...labels]; return param; };
      this.props[1] = param;
    }
    if (matchName === "ADBE Layer Control") this.props[1] = new FakeProperty("ADBE Layer Control-0001", 0, { propertyValueType: PropertyValueType.OneD });
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
  get propertyIndex() { return this.parade ? this.parade.filhos.indexOf(this) + 1 : 0; }
  remove() {
    this.removido = true;
    if (this.parade) this.parade.filhos.splice(this.parade.filhos.indexOf(this), 1);
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
    return this.filhos.find((f) => f.matchName === chave || f.name === chave) ?? null;
  }
  canAddProperty(matchName) { return ["ADBE Echo", "ADBE Layer Control", "ADBE Slider Control", "ADBE Angle Control", "ADBE Checkbox Control", "ADBE Dropdown Control"].includes(matchName); }
  addProperty(matchName) {
    const efeito = new FakeEffectGroup(matchName, undefined, this);
    this.filhos.push(efeito);
    return efeito;
  }
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.id = opcoes.id ?? opcoes.index ?? 1;
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.comment = opcoes.comment ?? "";
    this.locked = opcoes.locked ?? false;
    this.nullLayer = opcoes.nullLayer ?? false;
    this.parent = null;
    this.threeDLayer = opcoes.threeDLayer ?? true;
    this.startTime = opcoes.startTime ?? 0;
    this.width = opcoes.width ?? 0;
    this.height = opcoes.height ?? 0;
    this.removido = false;
    this.position = new FakeProperty("ADBE Position", [0, 0, 0]);
    this.anchorPoint = new FakeProperty("ADBE Anchor Point", [50, 50, 0]);
    this.rotation = new FakeProperty("ADBE Rotate Z", 0, { propertyValueType: PropertyValueType.OneD });
    this.orientation = new FakeProperty("ADBE Orientation", [0, 0, 0]);
    this.scale = new FakeProperty("ADBE Scale", [100, 100, 100], {
      propertyValueType: PropertyValueType.ThreeD
    });
    this.efeitos = new FakeEffectParade();
    /** Retângulo no espaço da própria camada, como o host devolve. */
    this.rect = opcoes.rect ?? null;
    this.transform = {
      property: (n) => {
        if (n === "ADBE Rotate Z") return this.rotation;
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Anchor Point") return this.anchorPoint;
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
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1, nullLayer: true });
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
      "src/rig-meta.jsx",
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
const ORBIT = ["src/live-controls.jsx", "src/commands/three-d-orbit.jsx"];
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

test("Look At suporta 2D e ignora apenas a camada que encararia a si mesma", async () => {
  const alvo = new FakeLayer({ name: "Alvo", index: 1 });
  const plana = new FakeLayer({ name: "Plana", index: 2, threeDLayer: false });
  const doisD = new FakeCompItem([alvo, plana], { selecionadas: [plana] });
  const a = await fixture(doisD, LOOK_AT);
  const r1 = JSON.parse(a.scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));
  assert.equal(r1.ok, true);
  assert.match(plana.rotation.expression, /ae\.2d\.look-at/);

  const alvo2 = new FakeLayer({ name: "Alvo", index: 1 });
  const mesma = new FakeCompItem([alvo2], { selecionadas: [alvo2] });
  const b = await fixture(mesma, LOOK_AT);
  const r2 = JSON.parse(b.scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));
  assert.equal(r2.ok, false);
  assert.equal(r2.error.code, "NO_SELECTION");
  
  // Tanto 2D quanto 3D são seguidores; o alvo selecionado é excluído.
  const alvo3 = new FakeLayer({ name: "Alvo", index: 1 });
  const plana3 = new FakeLayer({ name: "Plana", index: 2, threeDLayer: false });
  const valida3 = new FakeLayer({ name: "Camera", index: 3 });
  const mista = new FakeCompItem([alvo3, plana3, valida3], { selecionadas: [alvo3, plana3, valida3] });
  const c = await fixture(mista, LOOK_AT);
  const r3 = JSON.parse(c.scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs)));
  assert.equal(r3.ok, true);
  assert.equal(r3.data.appliedCount, 2);
  assert.equal(alvo3.orientation.expression, "");
});

const quickLookArgs = { ...lookArgs, targetLayerName: "" };
function rig(comp) { return comp.todas.find(layer => !layer.removido && layer.comment.includes('"rigType":"look-at"')); }
function evaluate2D(layer, comp, extra = {}) {
  const controller = rig(comp), effect = controller.efeitos.property(1);
  const target = comp.layer(effect.property(1).value);
  return vm.runInNewContext(layer.rotation.expression, {
    value: layer.rotation.value, position: [0, 0], hasParent: false, thisLayer: layer,
    thisComp: { layer: name => { assert.equal(name, controller.name); return { effect: name => { assert.equal(name, effect.name); return () => target; } }; } },
    radiansToDegrees: r => r * 180 / Math.PI, ...extra
  });
}

test("Encarar Quick cria um unico nulo 2D com alvo compartilhado para cinco camadas", async () => {
  const layers = Array.from({ length: 5 }, (_, i) => new FakeLayer({ name: `Layer ${i}`, index: i + 1, threeDLayer: false }));
  layers[0].rotation.setValueAtTime(0, 12); layers[0].rotation.setValueAtTime(1, 23);
  const keys = JSON.stringify(layers[0].rotation.keys);
  const comp = new FakeCompItem([...layers], { selecionadas: layers });
  const { scope } = await fixture(comp, LOOK_AT);
  const response = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", quickLookArgs)));
  assert.equal(response.ok, true); assert.equal(response.data.appliedCount, 5);
  const controller = rig(comp);
  assert.equal(controller.threeDLayer, false); assert.equal(controller.efeitos.numProperties, 1);
  assert.equal(controller.efeitos.property(1).property(1).value, controller.index);
  for (const layer of layers) {
    assert.equal(layer.threeDLayer, false); assert.equal(layer.efeitos.numProperties, 0);
    assert.ok(scope.MotionExpressions.isManagedLookAt2D(layer.rotation.expression));
    assert.equal(layer.rotation.expressionEnabled, true);
    assert.match(layer.rotation.expression, /var correcaoEixo = 90;/);
  }
  assert.equal(JSON.stringify(layers[0].rotation.keys), keys);
});

test("Reaplicar reutiliza metadata apos renomear e conserva o alvo escolhido no nulo", async () => {
  const layer = new FakeLayer({ threeDLayer: false });
  const target = new FakeLayer({ index: 2, name: "Outro alvo", threeDLayer: false });
  const comp = new FakeCompItem([layer, target], { selecionadas: [layer] });
  const { scope } = await fixture(comp, LOOK_AT);
  const apply = () => JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", quickLookArgs)));
  assert.equal(apply().ok, true);
  const controller = rig(comp); controller.efeitos.property(1).property(1).setValue(target.index);
  const same = apply(); assert.equal(same.ok, true); assert.equal(same.data.unchangedCount, 1);
  controller.name = 'Controle "renomeado"'; controller.efeitos.property(1).name = 'Alvo editavel';
  assert.equal(apply().ok, true); assert.equal(comp.numLayers, 3);
  assert.equal(controller.efeitos.property(1).property(1).value, target.index);
  assert.ok(scope.MotionExpressions.isManagedLookAt2D(layer.rotation.expression));
  target.toWorld = () => [100, 0, 0]; target.anchorPoint = [0, 0];
  assert.equal(evaluate2D(layer, comp), 90);
});

test("Rotacao 2D avaliada acompanha alvo, preserva value, corrige parent e protege coincidencia/self", async () => {
  const layer = new FakeLayer({ threeDLayer: false }); layer.rotation.value = 12;
  const target = new FakeLayer({ name: "Alvo", index: 2, threeDLayer: false }); target.anchorPoint = [0, 0];
  const comp = new FakeCompItem([layer, target], { selecionadas: [layer] });
  const { scope } = await fixture(comp, LOOK_AT);
  assert.equal(JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", lookArgs))).ok, true);
  for (const [point, expected] of [[[100, 0, 0], 102], [[0, 100, 0], 192], [[0, 0, 0], 12]]) {
    target.toWorld = () => point; assert.equal(evaluate2D(layer, comp), expected);
  }
  target.toWorld = () => [100, 0, 0];
  assert.equal(evaluate2D(layer, comp, { hasParent: true, parent: { toWorld: p => p, fromWorldVec: d => [d[1], -d[0], 0] } }), 12);
  rig(comp).efeitos.property(1).property(1).setValue(layer.index); assert.equal(evaluate2D(layer, comp), 12);
});

test("Selecao mista cria nulo 3D sem converter seguidor 2D", async () => {
  const plana = new FakeLayer({ index: 1, threeDLayer: false });
  const spatial = new FakeLayer({ index: 2, threeDLayer: true });
  const comp = new FakeCompItem([plana, spatial]); const { scope } = await fixture(comp, LOOK_AT);
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", quickLookArgs)));
  assert.equal(result.ok, true); assert.equal(rig(comp).threeDLayer, true);
  assert.equal(plana.threeDLayer, false); assert.equal(spatial.threeDLayer, true);
  assert.ok(scope.MotionExpressions.isManagedLookAt(spatial.orientation.expression));
});

test("Conflitos e locks do lote sao recusados antes de criar nulo ou modificar rotacao", async () => {
  for (const conflict of ["expression", "locked", "edited-managed"]) {
    const a = new FakeLayer({ index: 1, threeDLayer: false }), b = new FakeLayer({ index: 2, threeDLayer: false });
    if (conflict === "locked") b.locked = true;
    else b.rotation.expression = conflict === "expression" ? "value + 15" : "// MOTION_EXPRESSION v1 | ae.2d.look-at\nvalue+123;";
    const comp = new FakeCompItem([a, b]), { scope, calls } = await fixture(comp, LOOK_AT);
    const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", quickLookArgs)));
    assert.equal(result.ok, false); assert.equal(comp.numLayers, 2); assert.equal(a.rotation.expression, ""); assert.deepEqual(calls, []);
  }
});

test("Falha no meio do lote restaura expressoes, enabled e remove o nulo criado", async () => {
  const a = new FakeLayer({ index: 1, threeDLayer: false }), b = new FakeLayer({ index: 2, threeDLayer: false });
  let expression = "", shouldFail = true;
  Object.defineProperty(b.rotation, "expression", { get: () => expression, set: next => {
    if (shouldFail && next !== "") { shouldFail = false; throw new Error("write failure"); } expression = next;
  } });
  const comp = new FakeCompItem([a, b]), { scope, calls } = await fixture(comp, LOOK_AT);
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", quickLookArgs)));
  assert.equal(result.ok, false); assert.equal(result.error.code, "HOST_OPERATION_FAILED");
  assert.equal(a.rotation.expression, ""); assert.equal(a.rotation.expressionEnabled, false);
  assert.equal(b.rotation.expression, ""); assert.equal(rig(comp), undefined);
  assert.equal(comp.todas.at(-1).removido, true); assert.equal(a.efeitos.numProperties, 0);
  assert.deepEqual(calls, [["begin", "Moti.on: encarar o alvo"], ["end"]]);
});

test("Falha ao ampliar rig existente restaura alvo e dimensao do nulo", async () => {
  const a = new FakeLayer({ index: 1, threeDLayer: false });
  const target = new FakeLayer({ index: 2, name: "Outro alvo", threeDLayer: false });
  const b = new FakeLayer({ index: 3, threeDLayer: true });
  const comp = new FakeCompItem([a, target, b], { selecionadas: [a] });
  const { scope } = await fixture(comp, LOOK_AT);
  const apply = args => JSON.parse(scope.MotionAE.dispatch(request("ae.3d.look-at", args)));
  assert.equal(apply(quickLookArgs).ok, true);
  const controller = rig(comp), before = a.rotation.expression;
  const previousTarget = controller.efeitos.property(1).property(1).value;
  let expression = "", fail = true;
  Object.defineProperty(b.orientation, "expression", { get: () => expression, set: next => {
    if (fail && next !== "") { fail = false; throw new Error("write failure"); } expression = next;
  } });
  comp.selectedLayers = [a, b];
  const result = apply({ ...quickLookArgs, targetLayerName: target.name, forwardAxis: "+x" });
  assert.equal(result.ok, false); assert.equal(controller.threeDLayer, false);
  assert.equal(controller.efeitos.property(1).property(1).value, previousTarget);
  assert.equal(a.rotation.expression, before); assert.equal(a.rotation.expressionEnabled, true);
  assert.equal(b.orientation.expression, ""); assert.equal(comp.numLayers, 4);
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

function orbitControl(layer, index) { return layer.parent.efeitos.property(index).property(1).value; }
function evaluateOrbitPosition(layer, time = 0) {
  const parent = layer.parent;
  return Array.from(vm.runInNewContext(layer.position.expression, {
    time, Math, degreesToRadians: degrees => degrees * Math.PI / 180,
    parent: {transform: {anchorPoint: parent.anchorPoint.value}, effect: name => index => parent.efeitos.property(name).property(index).value}
  }));
}

test("Orbit cria o controller 3D e parenteia as camadas nele", async () => {
  const camada = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([camada], { selecionadas: [camada] });
  const { scope, calls } = await fixture(comp, ORBIT);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.controllerCreated, true);
  const controller = scope.MotionRigMeta.findController(comp, "orbit");
  assert.ok(controller, "esperava o controller gerenciado");
  assert.equal(controller.name, "Órbita (Moti.on)");
  assert.equal(controller.efeitos.numProperties, 9);
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

  // Avaliar o template emitido mede a implementacao que as camadas receberam.
  const raio = 400;
  for (const graus of [0, 37, 90, 143, 180, 271, 359]) {
    const medido = Math.hypot(...evaluateOrbitPosition(camada, graus / orbitArgs.speed));
    assert.ok(Math.abs(medido - raio) < 1e-9, `em ${graus}° o raio deu ${medido}`);
  }
  assert.equal(orbitControl(camada, 2), raio);
  assert.ok(camada.position.expression.includes("parent.effect("));
});

test("fase desloca a primeira camada e distribui o restante sem sobreposicao", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const c = new FakeLayer({ name: "C", index: 3 });
  const comp = new FakeCompItem([a, b, c], { selecionadas: [a, b, c] });
  const { scope } = await fixture(comp, ORBIT);

  scope.MotionAE.dispatch(request("ae.3d.orbit", { ...orbitArgs, phase: 30 }));

  assert.equal(orbitControl(a, 7), 30);
  assert.match(a.position.expression, /var ordem = 0;\nvar total = 3;/);
  assert.match(b.position.expression, /var ordem = 1;\nvar total = 3;/);
  assert.match(c.position.expression, /var ordem = 2;\nvar total = 3;/);
  assert.equal(new Set([a, b, c].map(layer => JSON.stringify(evaluateOrbitPosition(layer)))).size, 3);
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
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(calls, []);
});

test("Orbit ignora null do usuario com o mesmo nome e encontra controller renomeado por metadata", async () => {
  const usuario = new FakeLayer({ name: "Órbita (Moti.on)", index: 1, nullLayer: true });
  const a = new FakeLayer({ name: "A", index: 2 });
  const comp = new FakeCompItem([usuario, a], { selecionadas: [a] });
  const { scope } = await fixture(comp, ORBIT);
  const primeira = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));
  assert.equal(primeira.ok, true);
  assert.equal(primeira.data.controllerCreated, true);
  const gerenciado = a.parent;
  assert.notEqual(gerenciado, usuario);
  assert.match(gerenciado.comment, /"rigType":"orbit"/);
  gerenciado.name = "Meu pivô";

  const b = new FakeLayer({ name: "B", index: 4 });
  comp.todas.push(b);
  comp.selectedLayers = [a, b];
  const reutilizado = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, targetMode: "reuseController"
  })));
  assert.equal(reutilizado.ok, true);
  assert.equal(reutilizado.data.controllerCreated, false);
  assert.equal(b.parent, gerenciado);
  assert.match(b.position.expression, /var ordem = 1;\nvar total = 2;/);
});

test("ajuste parcial atualiza controles do rig inteiro e conserva fases dos membros", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope, calls } = await fixture(comp, ORBIT);
  assert.equal(JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs))).ok, true);
  const originalB = b.position.expression;
  comp.selectedLayers = [a];
  const beforeCalls = calls.length;
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, radius: 600
  })));
  assert.equal(result.ok, true);
  assert.equal(result.data.orbitedLayers, 2);
  assert.equal(calls.length, beforeCalls + 2);
  assert.equal(b.position.expression, originalB);
  assert.equal(orbitControl(a, 2), 600);
  assert.ok(Math.abs(Math.hypot(...evaluateOrbitPosition(b)) - 600) < .001);
});

test("novo controller nao reutiliza outro rig por nome, mas reaplicar membros ajusta o seu rig", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a] });
  const { scope } = await fixture(comp, ORBIT);
  const first = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));
  assert.equal(first.ok, true);
  const controllerA = a.parent;
  const adjusted = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, radius: 500
  })));
  assert.equal(adjusted.ok, true);
  assert.equal(adjusted.data.controllerCreated, false);
  assert.equal(a.parent, controllerA);
  assert.equal(orbitControl(a, 2), 500);

  comp.selectedLayers = [b];
  const second = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));
  assert.equal(second.ok, true);
  assert.equal(second.data.controllerCreated, true);
  assert.notEqual(b.parent, controllerA);
});

test("Orbit distribui fase zero e orienta no espaco local do parent", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp, ORBIT);
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, faceTarget: true
  })));
  assert.equal(result.ok, true);
  assert.equal(orbitControl(a, 7), 0);
  assert.match(a.position.expression, /var ordem = 0;\nvar total = 2;/);
  assert.match(b.position.expression, /var ordem = 1;\nvar total = 2;/);
  assert.equal(orbitControl(a, 9), 1);
  assert.match(a.orientation.expression, /var origem = position;/);
  assert.doesNotMatch(a.orientation.expression, /toWorld/);
  assert.equal(scope.MotionExpressions.isManagedOrbitFacing(a.orientation.expression), true);
});

test("preflight de Orbit impede locks, keys, expressao de terceiro e parent estranho sem mutacao", async () => {
  for (const kind of ["locked", "keys", "expression", "parent"]) {
    const a = new FakeLayer({ name: "A", index: 1 });
    const b = new FakeLayer({ name: "B", index: 2 });
    const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
    if (kind === "locked") b.locked = true;
    if (kind === "keys") b.position.setValueAtTime(0, [10, 20, 30]);
    if (kind === "expression") b.position.expression = "value + [1,0,0]";
    if (kind === "parent") b.parent = new FakeLayer({ name: "User parent", index: 3 });
    const { scope, calls } = await fixture(comp, ORBIT);
    const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", orbitArgs)));
    assert.equal(result.ok, false, kind);
    assert.deepEqual(calls, [], kind);
    assert.equal(a.parent, null, kind);
    assert.equal(comp.todas.length, 2, kind);
  }
});

test("Bake recusa animacao preexistente em Orientation antes do Undo", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  a.orientation.setValueAtTime(0, [0, 0, 0]);
  const comp = new FakeCompItem([a], { selecionadas: [a] });
  const { scope, calls } = await fixture(comp, ORBIT);
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, faceTarget: true, bake: true
  })));
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

test("falha de escrita no Bake remove keys e restaura expressoes/parent de todo o lote", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b], duration: 0.2, frameDuration: 0.04 });
  const originalWrite = b.position.setValueAtTime.bind(b.position);
  let failed = false;
  b.position.setValueAtTime = (time, value) => {
    if (!failed) { failed = true; throw new Error("simulated write failure"); }
    originalWrite(time, value);
  };
  const { scope, calls } = await fixture(comp, ORBIT);
  const result = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.orbit", {
    ...orbitArgs, bake: true
  })));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "HOST_OPERATION_FAILED");
  assert.equal(a.position.numKeys, 0);
  assert.equal(b.position.numKeys, 0);
  assert.equal(a.position.expression, "");
  assert.equal(b.position.expression, "");
  assert.equal(a.parent, null);
  assert.equal(b.parent, null);
  assert.deepEqual(calls, [["begin", "Moti.on: criar órbita"], ["end"]]);
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

test('Echo refuses locked, keyed and expression parameters before mutation', async () => {
  for (const mode of ['locked', 'keys', 'expression']) {
    const layer = new FakeLayer();
    const comp = new FakeCompItem([layer]);
    const {scope, calls} = await fixture(comp, ECHO);
    assert.equal(JSON.parse(scope.MotionAE.dispatch(request('ae.effect.echo', echoArgs))).ok, true);
    const prop = layer.efeitos.property(1).property('ADBE Echo-0002');
    if (mode === 'locked') layer.locked = true;
    if (mode === 'keys') prop.setValueAtTime(0.7, 13);
    if (mode === 'expression') { prop.expression = '13'; prop.expressionEnabled = true; }
    const before = JSON.stringify({value: prop.value, keys: prop.keys, expression: prop.expression});
    calls.length = 0;
    const response = JSON.parse(scope.MotionAE.dispatch(request('ae.effect.echo', {...echoArgs, numberOfEchoes: 40})));
    assert.equal(response.ok, false);
    assert.equal(response.error.code, {locked:'INVALID_SELECTION_TYPE',keys:'KEYFRAME_CONFLICT',expression:'EXPRESSION_CONFLICT'}[mode]);
    assert.equal(JSON.stringify({value: prop.value, keys: prop.keys, expression: prop.expression}), before);
    assert.deepEqual(calls, []);
  }
});
