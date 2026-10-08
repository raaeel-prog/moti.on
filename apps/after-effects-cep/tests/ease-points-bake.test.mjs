/**
 * `ae.keys.ease.apply` com `points` (curva multiponto) e `bake` (easing
 * elastico/bounce assado em keyframes lineares).
 *
 * O que estes testes medem: tempos ajustados ao quadro, valor na corda, uma
 * curva por lado em cada no, recusa de colisao ANTES de qualquer escrita, e o
 * rollback com os mesmos codigos do caminho classico do comando.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { easingValue, normalizeCurveSegments, curveToTemporalEase } from "../../../packages/keyframe-core/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = { NO_VALUE: 0, ThreeD_SPATIAL: 2, ThreeD: 3, TwoD_SPATIAL: 4, TwoD: 5, OneD: 6, COLOR: 7, SHAPE: 12 };
const KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };
const FD = 1 / 25;

class FakeKeyframeEase {
  constructor(speed, influence) { this.speed = speed; this.influence = influence; }
}

const clone = (v) => (Array.isArray(v) ? [...v] : v);

function makeKey(time, value, eases) {
  return {
    time, value: clone(value),
    inInterpolation: KeyframeInterpolationType.BEZIER, outInterpolation: KeyframeInterpolationType.BEZIER,
    inEase: Array.from({ length: eases }, () => new FakeKeyframeEase(0, 16.67)),
    outEase: Array.from({ length: eases }, () => new FakeKeyframeEase(0, 16.67)),
    temporalContinuous: false, temporalAutoBezier: false, roving: false, selected: false, label: 0,
    spatialIn: [0, 0, 0], spatialOut: [0, 0, 0], spatialAuto: true
  };
}

class FakeProperty {
  constructor({ name = "Opacity", valueType = PropertyValueType.OneD, eases = 1, keys, selected }) {
    this.name = name; this.matchName = "ADBE " + name;
    this.propertyType = PropertyType.PROPERTY; this.propertyValueType = valueType;
    this.canVaryOverTime = true; this.expressionEnabled = false; this.parentProperty = null;
    this.eases = eases;
    this.keys = keys.map(([time, value]) => makeKey(time, value, eases));
    this.selectedKeys = selected ?? keys.map((_, i) => i + 1);
    for (const i of this.selectedKeys) this.keys[i - 1].selected = true;
    /** Toda escrita, na ordem. */
    this.chamadas = [];
    this.falhaEm = 0;
  }
  get numKeys() { return this.keys.length; }
  key(i) { const k = this.keys[i - 1]; if (!k) throw new Error(`key ${i} ausente`); return k; }
  keyTime(i) { return this.key(i).time; }
  keyValue(i) { return clone(this.key(i).value); }
  nearestKeyIndex(time) {
    let best = 1;
    for (let i = 1; i <= this.numKeys; i += 1) if (Math.abs(this.keyTime(i) - time) < Math.abs(this.keyTime(best) - time)) best = i;
    return best;
  }
  keyInInterpolationType(i) { return this.key(i).inInterpolation; }
  keyOutInterpolationType(i) { return this.key(i).outInterpolation; }
  keyInTemporalEase(i) { return this.key(i).inEase.map((e) => new FakeKeyframeEase(e.speed, e.influence)); }
  keyOutTemporalEase(i) { return this.key(i).outEase.map((e) => new FakeKeyframeEase(e.speed, e.influence)); }
  keyTemporalContinuous(i) { return this.key(i).temporalContinuous; }
  keyTemporalAutoBezier(i) { return this.key(i).temporalAutoBezier; }
  keyRoving(i) { return this.key(i).roving; }
  keySelected(i) { return this.key(i).selected; }
  keyLabel(i) { return this.key(i).label; }
  keyInSpatialTangent(i) { return clone(this.key(i).spatialIn); }
  keyOutSpatialTangent(i) { return clone(this.key(i).spatialOut); }
  keySpatialContinuous() { return false; }
  keySpatialAutoBezier(i) { return this.key(i).spatialAuto; }
  #falha(mensagem) {
    if (this.falhaEm > 0) { this.falhaEm -= 1; if (this.falhaEm === 0) throw new Error(mensagem); }
  }
  removeKey(i) { this.keys.splice(i - 1, 1); }
  setValueAtTime(time, value) {
    this.#falha("o host recusou a escrita");
    this.chamadas.push({ tipo: "valor", time, value: clone(value) });
    this.keys.push(makeKey(time, value, this.eases));
    this.keys.sort((a, b) => a.time - b.time);
  }
  setInterpolationTypeAtKey(i, entrada, saida) {
    this.chamadas.push({ tipo: "interpolacao", index: i, time: this.keyTime(i), inType: entrada, outType: saida });
    this.key(i).inInterpolation = entrada; this.key(i).outInterpolation = saida;
  }
  setTemporalEaseAtKey(i, entrada, saida) {
    this.#falha("o host recusou o ease");
    this.chamadas.push({ tipo: "ease", index: i, time: this.keyTime(i), inEase: entrada, outEase: saida });
    this.key(i).inEase = entrada.map((e) => new FakeKeyframeEase(e.speed, e.influence));
    this.key(i).outEase = saida.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  setTemporalContinuousAtKey(i, v) { this.key(i).temporalContinuous = v; }
  setTemporalAutoBezierAtKey(i, v) { this.key(i).temporalAutoBezier = v; }
  setRovingAtKey(i, v) { this.chamadas.push({ tipo: "roving", index: i, v }); this.key(i).roving = v; }
  setSelectedAtKey(i, v) { this.key(i).selected = v; }
  setLabelAtKey(i, v) { this.key(i).label = v; }
  setSpatialTangentsAtKey(i, a, b) { this.chamadas.push({ tipo: "tangente", index: i, a, b }); this.key(i).spatialIn = a; this.key(i).spatialOut = b; }
  setSpatialContinuousAtKey() {}
  setSpatialAutoBezierAtKey(i, v) { this.chamadas.push({ tipo: "autoBezier", index: i, v }); this.key(i).spatialAuto = v; }
}

class FakeCompItem {
  constructor(propriedades) {
    this.selectedLayers = []; this.selectedProperties = propriedades;
    this.frameDuration = FD; this.numLayers = 0; this.time = 0; this.duration = 10;
  }
}

async function dispatch(propriedades, args) {
  const comp = new FakeCompItem(propriedades);
  const scope = await loadHostModules(
    ["generated/motion-contracts.jsx", "generated/motion-descriptors.jsx", "src/json.jsx", "src/undo.jsx",
      "src/registry.jsx", "src/keyframe-operations.jsx", "src/commands/keys-ease.jsx", "src/dispatch.jsx"],
    {
      app: { project: { activeItem: comp, expressionEngine: "javascript-1.0" }, beginUndoGroup() {}, endUndoGroup() {} },
      CompItem: FakeCompItem, Property: FakeProperty, PropertyType, PropertyValueType,
      KeyframeEase: FakeKeyframeEase, KeyframeInterpolationType
    }
  );
  return JSON.parse(scope.MotionAE.dispatch(JSON.stringify({
    protocolVersion: 1, requestId: "ease-points-bake", command: "ae.keys.ease.apply", args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" }, options: {}
  })));
}

const CURVA = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1, applyIn: true, applyOut: true };
const PONTOS = [
  { x: 0.3, y: 0.9, inX: 0.2, inY: 0.5, outX: 0.4, outY: 1.2 },
  { x: 0.6, y: 0.7, inX: 0.5, inY: 0.8, outX: 0.7, outY: 0.6 }
];
const ELASTIC = { amp: 1, freq: 3.3, decay: 6.9, start: 0 };
const BOUNCE = { amp: 0.5, freq: 3, decay: 1.2, start: 0 };
const retrato = (p) => p.keys.map((k) => [k.time, k.value, k.inInterpolation, k.outInterpolation, k.outEase[0].influence]);

test("points: insere keys no quadro mais proximo, no valor da corda, e liga cada lado com a curva local", async () => {
  // 0..2 s: x=0.3 cai em 0.6 s (15 quadros), x=0.6 em 1.2 s (30 quadros).
  const p = new FakeProperty({ keys: [[0, 0], [2, 100]] });
  const r = await dispatch([p], { ...CURVA, points: PONTOS });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(p.keys.map((k) => [Math.round(k.time * 25), k.value]), [[0, 0], [15, 90], [30, 70], [50, 100]]);

  const { segments } = normalizeCurveSegments(CURVA, PONTOS);
  const eases = p.chamadas.filter((c) => c.tipo === "ease");
  assert.deepEqual(eases.map((c) => c.index), [1, 2, 3, 4]);
  // No 0 so recebe saida; nos interiores recebem (seg[i-1], seg[i]); o ultimo so entrada.
  assert.equal(eases[0].outEase[0].speed, curveToTemporalEase(segments[0], 0.6, 90).outPoint.speed);
  assert.equal(eases[0].inEase[0].influence, 16.67, "entrada do primeiro keyframe fica como estava");
  assert.equal(eases[1].inEase[0].speed, curveToTemporalEase(segments[0], 0.6, 90).inPoint.speed);
  assert.equal(eases[1].outEase[0].speed, curveToTemporalEase(segments[1], 0.6, -20).outPoint.speed);
  assert.equal(eases[2].inEase[0].speed, curveToTemporalEase(segments[1], 0.6, -20).inPoint.speed);
  assert.equal(eases[2].outEase[0].speed, curveToTemporalEase(segments[2], 0.8, 30).outPoint.speed);
  assert.equal(eases[3].inEase[0].speed, curveToTemporalEase(segments[2], 0.8, 30).inPoint.speed);
  assert.equal(eases[3].outEase[0].influence, 16.67);
  assert.equal(r.data.appliedCount, 4);
  assert.deepEqual(r.warnings, []);
});

test("points: applyIn/applyOut desligados preservam a ponta correspondente", async () => {
  const p = new FakeProperty({ keys: [[0, 0], [2, 100]] });
  const r = await dispatch([p], { ...CURVA, applyIn: false, points: [PONTOS[0]] });
  assert.equal(r.ok, true);
  const eases = p.chamadas.filter((c) => c.tipo === "ease");
  assert.deepEqual(eases.map((c) => c.index), [1, 2], "o ultimo keyframe nao foi tocado");
  assert.equal(r.data.appliedCount, 2);
});

test("points: 2D nao espacial interpola cada componente e espacial zera tangentes", async () => {
  const escala = new FakeProperty({ name: "Scale", valueType: PropertyValueType.TwoD, eases: 2, keys: [[0, [100, 50]], [1, [200, 150]]] });
  const posicao = new FakeProperty({ name: "Position", valueType: PropertyValueType.TwoD_SPATIAL, eases: 1, keys: [[0, [0, 0]], [1, [300, 400]]] });
  const r = await dispatch([escala, posicao], { ...CURVA, points: [{ x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 }] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(escala.keys[1].value, [150, 100]);
  assert.deepEqual(posicao.keys[1].value, [150, 200]);
  assert.deepEqual(posicao.chamadas.find((c) => c.tipo === "tangente"), { tipo: "tangente", index: 2, a: [0, 0], b: [0, 0] });
  assert.deepEqual(posicao.chamadas.find((c) => c.tipo === "autoBezier"), { tipo: "autoBezier", index: 2, v: false });
  assert.deepEqual(posicao.chamadas.find((c) => c.tipo === "roving"), { tipo: "roving", index: 2, v: false });
  assert.equal(escala.chamadas.some((c) => c.tipo === "tangente"), false, "propriedade nao espacial nao recebe tangente");
  // x=0.5 de 1 s sao 12,5 quadros: o host ajusta para o quadro 13 (0,52 s), e
  // a duracao do segmento que alimenta o ease e a ajustada, nao a nominal.
  assert.ok(Math.abs(posicao.keys[1].time - 13 * FD) < 1e-12);
  // Espacial: a corda ate o ponto mede 250 e o ease e um so.
  const { segments } = normalizeCurveSegments(CURVA, [{ x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 }]);
  const primeiro = posicao.chamadas.find((c) => c.tipo === "ease" && c.index === 1);
  assert.equal(primeiro.outEase.length, 1);
  assert.equal(primeiro.outEase[0].speed, curveToTemporalEase(segments[0], 13 * FD, 250).outPoint.speed);
  assert.equal(r.data.appliedCount, 6);
});

test("points: varios pares na mesma propriedade processam do ultimo para o primeiro", async () => {
  const p = new FakeProperty({ keys: [[0, 0], [2, 100], [4, 0]] });
  const r = await dispatch([p], { ...CURVA, points: [{ x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 }] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(p.keys.map((k) => [k.time, k.value]), [[0, 0], [1, 50], [2, 100], [3, 50], [4, 0]]);
  const valores = p.chamadas.filter((c) => c.tipo === "valor").map((c) => c.time);
  assert.deepEqual(valores, [3, 1], "o par mais tardio foi escrito primeiro");
  // O keyframe do meio e escrito duas vezes (saida pelo par tardio, entrada pelo
  // par anterior); appliedCount conta escritas, como no caminho classico.
  assert.equal(r.data.appliedCount, 6);
});

test("points: keys selecionadas sem vizinho por indice recusam com NO_SELECTION", async () => {
  // Keys 1 e 3 nao sao vizinhas: ha uma key entre elas fora da selecao.
  const p = new FakeProperty({ keys: [[0, 0], [0.6, 30], [2, 100]], selected: [1, 3] });
  const r = await dispatch([p], { ...CURVA, points: PONTOS });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NO_SELECTION");
  assert.match(r.error.message, /vizinhos/);
  assert.deepEqual(p.chamadas, []);
});

test("points: ponto que cai no quadro de um keyframe existente recusa com KEYFRAME_CONFLICT e nada e escrito", async () => {
  // Segmento de dois quadros: x=0.2 e 0,4 quadro, que arredonda para o quadro
  // do proprio keyframe inicial.
  const p = new FakeProperty({ keys: [[1, 0], [1 + 2 * FD, 100]] });
  const r = await dispatch([p], { ...CURVA, points: [{ x: 0.2, y: 0.5, inX: 0.1, inY: 0.4, outX: 0.3, outY: 0.6 }] });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "KEYFRAME_CONFLICT");
  assert.equal(r.error.details.propertyName, "Opacity");
  assert.ok(Math.abs(r.error.details.time - 1) < 1e-12);
  assert.deepEqual(p.chamadas, [], "a recusa vem do preflight, antes de qualquer escrita");
  assert.equal(p.numKeys, 2);
});

test("points: dois pontos no mesmo quadro colidem entre si", async () => {
  // Segmento de 2 quadros: x=0.3 e x=0.6 arredondam para o mesmo quadro.
  const p = new FakeProperty({ keys: [[0, 0], [3 * FD, 100]] });
  const r = await dispatch([p], { ...CURVA, points: [{ x: 0.3, y: 0.3, inX: 0.2, inY: 0.2, outX: 0.4, outY: 0.4 }, { x: 0.34, y: 0.4, inX: 0.32, inY: 0.3, outX: 0.5, outY: 0.5 }] });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "KEYFRAME_CONFLICT");
});

test("bake elastic: 1 s a 25 fps cria 24 keys lineares com o valor da referencia e preserva as pontas", async () => {
  const p = new FakeProperty({ keys: [[0, 0], [1, 100]] });
  p.keys[0].inInterpolation = KeyframeInterpolationType.HOLD;
  p.keys[1].outInterpolation = KeyframeInterpolationType.HOLD;
  const bake = { mode: "elastic", direction: "out", in: ELASTIC, out: ELASTIC };
  const r = await dispatch([p], { ...CURVA, bake });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(p.numKeys, 26);
  assert.equal(r.data.appliedCount, 24);
  for (let n = 1; n <= 24; n += 1) {
    const k = p.keys[n];
    assert.ok(Math.abs(k.time - n * FD) < 1e-12);
    const esperado = 0 + easingValue("elastic", bake, "out", (k.time - 0) / 1) * 100;
    assert.ok(Math.abs(k.value - esperado) <= 1e-9, `quadro ${n}: ${k.value} vs ${esperado}`);
    assert.equal(k.inInterpolation, KeyframeInterpolationType.LINEAR);
    assert.equal(k.outInterpolation, KeyframeInterpolationType.LINEAR);
  }
  assert.deepEqual([p.keys[0].time, p.keys[0].value, p.keys[0].inInterpolation, p.keys[0].outInterpolation], [0, 0, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.LINEAR]);
  assert.deepEqual([p.keys[25].time, p.keys[25].value, p.keys[25].inInterpolation, p.keys[25].outInterpolation], [1, 100, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD]);
  assert.equal(p.chamadas.some((c) => c.tipo === "ease"), false, "bake nao escreve ease temporal");
});

test("bake: inOut com metades bezier em escalar, 2D e espacial", async () => {
  const bake = { mode: "bounce", direction: "inOut", in: BOUNCE, out: BOUNCE, inCurve: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, outCurve: null };
  const opacidade = new FakeProperty({ keys: [[0, 10], [0.4, 90]] });
  const escala = new FakeProperty({ name: "Scale", valueType: PropertyValueType.TwoD, eases: 2, keys: [[0, [100, 50]], [0.4, [200, 150]]] });
  const posicao = new FakeProperty({ name: "Position", valueType: PropertyValueType.ThreeD_SPATIAL, eases: 1, keys: [[0, [0, 0, 0]], [0.4, [300, 400, 10]]] });
  const r = await dispatch([opacidade, escala, posicao], { ...CURVA, bake });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.appliedCount, 27);
  for (const prop of [opacidade, escala, posicao]) assert.equal(prop.numKeys, 11);
  for (let n = 1; n <= 9; n += 1) {
    const u = (n * FD) / 0.4;
    const e = easingValue("bounce", bake, "inOut", u);
    assert.ok(Math.abs(opacidade.keys[n].value - (10 + e * 80)) <= 1e-9);
    assert.ok(Math.abs(escala.keys[n].value[0] - (100 + e * 100)) <= 1e-9);
    assert.ok(Math.abs(escala.keys[n].value[1] - (50 + e * 100)) <= 1e-9);
    assert.ok(Math.abs(posicao.keys[n].value[2] - e * 10) <= 1e-9);
  }
  const tangentes = posicao.chamadas.filter((c) => c.tipo === "tangente");
  assert.equal(tangentes.length, 9);
  assert.deepEqual(tangentes[0].a, [0, 0, 0]);
  assert.equal(posicao.chamadas.filter((c) => c.tipo === "roving").length, 9);
  assert.equal(escala.chamadas.filter((c) => c.tipo === "tangente").length, 0);
});

test("bake: par sem duracao e contado como sem segmento; par de um quadro nao cria nada", async () => {
  const p = new FakeProperty({ keys: [[1, 0], [1, 100]] });
  const r = await dispatch([p], { ...CURVA, bake: { mode: "elastic", direction: "in", in: ELASTIC, out: ELASTIC } });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.appliedCount, 0);
  assert.equal(r.data.skippedCount, 1);
  assert.deepEqual(r.warnings.map((w) => w.code), ["EASE_NO_SELECTED_SEGMENT"]);
  const q = new FakeProperty({ keys: [[0, 0], [FD, 100]] });
  const vazio = await dispatch([q], { ...CURVA, bake: { mode: "elastic", direction: "in", in: ELASTIC, out: ELASTIC } });
  assert.equal(vazio.ok, true);
  assert.equal(vazio.data.appliedCount, 0);
  assert.equal(q.numKeys, 2);
});

test("bake: segmento acima de 3600 quadros e recusado no preflight", async () => {
  const p = new FakeProperty({ keys: [[0, 0], [3602 * FD, 100]] });
  const r = await dispatch([p], { ...CURVA, bake: { mode: "bounce", direction: "out", in: BOUNCE, out: BOUNCE } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "INVALID_PRESET");
  assert.equal(p.numKeys, 2);
});

test("bake: total acima de 10000 keys e recusado", async () => {
  const props = [];
  for (let i = 0; i < 3; i += 1) props.push(new FakeProperty({ name: "P" + i, keys: [[0, 0], [3500 * FD, 100]] }));
  const r = await dispatch(props, { ...CURVA, bake: { mode: "bounce", direction: "out", in: BOUNCE, out: BOUNCE } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "INVALID_PRESET");
  assert.match(r.error.message, /10\.000/);
});

test("bake: propriedade sem par recusa com NO_SELECTION; incompativel vira aviso", async () => {
  const p = new FakeProperty({ keys: [[0, 0], [1, 50], [2, 100]], selected: [1, 3] });
  const r = await dispatch([p], { ...CURVA, bake: { mode: "elastic", direction: "out", in: ELASTIC, out: ELASTIC } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NO_SELECTION");
  assert.match(r.error.message, /vizinhos/);
  const mascara = new FakeProperty({ name: "Mask Path", valueType: PropertyValueType.SHAPE, keys: [[0, 0], [1, 1]] });
  const valida = new FakeProperty({ keys: [[0, 0], [0.2, 100]] });
  const misto = await dispatch([mascara, valida], { ...CURVA, bake: { mode: "elastic", direction: "out", in: ELASTIC, out: ELASTIC } });
  assert.equal(misto.ok, true, JSON.stringify(misto.error));
  assert.equal(misto.data.appliedCount, 4);
  assert.equal(misto.data.skippedCount, 1);
  assert.deepEqual(misto.warnings.map((w) => w.code), ["EASE_PROPERTY_SKIPPED"]);
  assert.deepEqual(mascara.chamadas, []);
});

for (const modo of ["points", "bake"]) {
  const extra = modo === "points"
    ? { points: [{ x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 }] }
    : { bake: { mode: "elastic", direction: "out", in: ELASTIC, out: ELASTIC } };

  test(`${modo}: falha na segunda propriedade restaura a primeira com HOST_OPERATION_FAILED`, async () => {
    const primeira = new FakeProperty({ name: "Opacity", keys: [[0, 0], [1, 100]] });
    const segunda = new FakeProperty({ name: "Rotation", keys: [[0, 0], [1, 90]] });
    const antes = [retrato(primeira), retrato(segunda)];
    segunda.falhaEm = 2;
    const r = await dispatch([primeira, segunda], { ...CURVA, ...extra });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "HOST_OPERATION_FAILED");
    assert.deepEqual(retrato(primeira), antes[0], "a primeira propriedade voltou ao que era");
    assert.deepEqual(retrato(segunda), antes[1]);
  });

  test(`${modo}: falha na restauracao responde ROLLBACK_FAILED`, async () => {
    const p = new FakeProperty({ keys: [[0, 0], [1, 100]] });
    // Interpolacao e escrita tanto pelo comando quanto pela restauracao: com
    // ela recusando, a aplicacao falha e o rollback tambem.
    p.setInterpolationTypeAtKey = () => { throw new Error("o host esta recusando tudo"); };
    const r = await dispatch([p], { ...CURVA, ...extra });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "ROLLBACK_FAILED");
  });
}

test("preflight: formatos invalidos de points e bake, e combinacoes exclusivas", async () => {
  const ok = { x: 0.5, y: 0.5, inX: 0.4, inY: 0.4, outX: 0.6, outY: 0.6 };
  const invalidos = [
    ["points vazio", { points: [] }, -1],
    ["points demais", { points: Array.from({ length: 17 }, (_, i) => ({ ...ok, x: 0.05 + i * 0.05, inX: 0.05 + i * 0.05, outX: 0.05 + i * 0.05 })) }, -1],
    ["chave desconhecida", { points: [{ ...ok, z: 1 }] }, 0],
    ["campo nao numerico", { points: [{ ...ok, y: "1" }] }, 0],
    ["x fora de (0,1)", { points: [{ ...ok, x: 1, inX: 1, outX: 1 }] }, 0],
    ["x nao crescente", { points: [ok, { ...ok, x: 0.5 }] }, 1],
    ["folga menor que 0.01", { points: [ok, { ...ok, x: 0.505, inX: 0.505, outX: 0.6 }] }, 1],
    ["y acima de 2", { points: [{ ...ok, y: 2.5 }] }, 0],
    ["inX maior que x", { points: [{ ...ok, inX: 0.55 }] }, 0],
    ["outX acima de 1", { points: [{ ...ok, outX: 1.2 }] }, 0]
  ];
  for (const [nome, args, index] of invalidos) {
    const r = await dispatch([new FakeProperty({ keys: [[0, 0], [1, 100]] })], { ...CURVA, ...args });
    assert.equal(r.ok, false, nome);
    assert.equal(r.error.code, "INVALID_PRESET", nome);
    assert.equal(r.error.details.field, "points", nome);
    assert.equal(r.error.details.index, index, nome);
  }
  const bakeOk = { mode: "elastic", direction: "inOut", in: ELASTIC, out: ELASTIC };
  const bakesInvalidos = [
    ["modo", { ...bakeOk, mode: "back" }],
    ["direcao", { ...bakeOk, direction: "both" }],
    ["chave desconhecida", { ...bakeOk, extra: 1 }],
    ["chave desconhecida na oscilacao", { ...bakeOk, in: { ...ELASTIC, phase: 0 } }],
    ["amp fora", { ...bakeOk, out: { ...ELASTIC, amp: 4.1 } }],
    ["freq fora", { ...bakeOk, out: { ...ELASTIC, freq: 0.05 } }],
    ["decay fora", { ...bakeOk, in: { ...ELASTIC, decay: 31 } }],
    ["start fora", { ...bakeOk, in: { ...ELASTIC, start: 1 } }],
    ["curva com chave extra", { ...bakeOk, inCurve: { x1: 0, y1: 0, x2: 1, y2: 1, z: 0 } }],
    ["curva x fora", { ...bakeOk, outCurve: { x1: -0.1, y1: 0, x2: 1, y2: 1 } }],
    ["curva y fora", { ...bakeOk, outCurve: { x1: 0, y1: 0, x2: 1, y2: 2.1 } }],
    ["bake nao objeto", "elastic"]
  ];
  for (const [nome, bake] of bakesInvalidos) {
    const r = await dispatch([new FakeProperty({ keys: [[0, 0], [1, 100]] })], { ...CURVA, bake });
    assert.equal(r.ok, false, nome);
    assert.equal(r.error.code, "INVALID_PRESET", nome);
  }
  const build = { durationFrames: 15, useOpacity: true, opacityFrom: 0, opacityTo: 100, useRotation: false, rotationFrom: 0, rotationTo: 0, useScale: false, scaleFrom: 100, scaleTo: 100, usePosition: false, posFromX: 0, posFromY: 0, posToX: 0, posToY: 0 };
  for (const combo of [{ build, points: [ok] }, { build, bake: bakeOk }, { points: [ok], bake: bakeOk }]) {
    const r = await dispatch([new FakeProperty({ keys: [[0, 0], [1, 100]] })], { ...CURVA, ...combo });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_PRESET");
    assert.match(r.error.message, /apenas um de build, points ou bake/);
  }
});
