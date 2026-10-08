/**
 * `ae.keys.ease.apply` com `expectedSelection` e `session`: o host recusa uma
 * selecao que mudou, descarta os keyframes que ele proprio gerou num pedido
 * anterior antes de reaplicar, e nunca apaga um keyframe que nao criou.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FakeProperty, FakeLayer, FakeCompItem, KeyframeInterpolationType, FD, makeApp, dispatchWith } from "./ease-fakes.mjs";

const CURVA = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1, applyIn: true, applyOut: true };
const PONTOS = [
  { x: 0.3, y: 0.9, inX: 0.2, inY: 0.5, outX: 0.4, outY: 1.2 },
  { x: 0.6, y: 0.7, inX: 0.5, inY: 0.8, outX: 0.7, outY: 0.6 }
];
const OUTROS = [
  { x: 0.4, y: 0.8, inX: 0.3, inY: 0.5, outX: 0.5, outY: 1.1 },
  { x: 0.7, y: 0.6, inX: 0.6, inY: 0.7, outX: 0.8, outY: 0.5 }
];
const ELASTIC = { amp: 1, freq: 3.3, decay: 6.9, start: 0 };
const BAKE = { mode: "elastic", direction: "out", in: ELASTIC, out: ELASTIC };
const quadros = (p) => p.keys.map((k) => Math.round(k.time * 25));
const retrato = (p) => p.keys.map((k) => [k.time, k.value, k.inInterpolation, k.outInterpolation, k.outEase[0].influence, k.selected]);

function cena() {
  const layer = new FakeLayer({ index: 1, name: "Shape" });
  const p = new FakeProperty({ keys: [[0, 0], [2, 100]], layer, propertyIndex: 1 });
  const comp = new FakeCompItem([p]);
  const app = makeApp(comp);
  const assinatura = "1|P1:1";
  return { p, comp, app, assinatura, run: (args) => dispatchWith({ comp, app }, args) };
}

test("points: a sessao devolvida descreve os keyframes gerados; pontas selecionadas, gerados nao", async () => {
  const c = cena();
  const r = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.session.signature, c.assinatura);
  assert.equal(r.data.session.segments.length, 1);
  const seg = r.data.session.segments[0];
  assert.equal(seg.propertyId, "1:ADBE Opacity#1");
  assert.equal(seg.layerIndex, 1);
  assert.deepEqual([seg.t0, seg.t1], [0, 2]);
  assert.deepEqual(seg.generated.map((g) => [Math.round(g.time * 25), g.value]), [[15, 90], [30, 70]]);
  assert.equal(r.data.removedCount, 0);
  assert.deepEqual(c.p.keys.map((k) => k.selected), [true, false, false, true]);
});

test("points de novo com a sessao: os gerados sao trocados, sem acumular keyframes", async () => {
  const c = cena();
  const primeiro = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  const segundo = await c.run({ ...CURVA, points: OUTROS, expectedSelection: c.assinatura, session: primeiro.data.session });
  assert.equal(segundo.ok, true, JSON.stringify(segundo.error));
  assert.equal(c.p.numKeys, 4);
  assert.deepEqual(quadros(c.p), [0, 20, 35, 50]);
  assert.equal(segundo.data.removedCount, 2);
  assert.deepEqual(segundo.data.session.segments[0].generated.map((g) => Math.round(g.time * 25)), [20, 35]);
  assert.deepEqual(c.p.keys.map((k) => k.selected), [true, false, false, true]);
});

test("curva simples com a sessao: os gerados somem e as duas pontas recebem a curva", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  c.p.chamadas.length = 0;
  const simples = await c.run({ ...CURVA, expectedSelection: c.assinatura, session: pontos.data.session });
  assert.equal(simples.ok, true, JSON.stringify(simples.error));
  assert.equal(c.p.numKeys, 2);
  assert.equal(simples.data.removedCount, 2);
  assert.equal(simples.data.appliedCount, 2);
  assert.deepEqual(c.p.chamadas.filter((x) => x.tipo === "ease").map((x) => x.index), [1, 2]);
  assert.deepEqual(simples.data.session.segments, [{ propertyId: "1:ADBE Opacity#1", layerIndex: 1, t0: 0, t1: 2, generated: [] }]);
});

test("bake depois de points substitui os pontos por um keyframe por quadro, e points de volta", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  const assado = await c.run({ ...CURVA, bake: BAKE, expectedSelection: c.assinatura, session: pontos.data.session });
  assert.equal(assado.ok, true, JSON.stringify(assado.error));
  assert.equal(assado.data.removedCount, 2);
  assert.equal(c.p.numKeys, 51);
  for (let n = 0; n < 51; n += 1) assert.ok(Math.abs(c.p.keys[n].time - n * FD) < 1e-12);
  for (let n = 1; n < 50; n += 1) assert.equal(c.p.keys[n].inInterpolation, KeyframeInterpolationType.LINEAR);
  assert.equal(assado.data.session.segments[0].generated.length, 49);
  const deVolta = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura, session: assado.data.session });
  assert.equal(deVolta.ok, true, JSON.stringify(deVolta.error));
  assert.equal(deVolta.data.removedCount, 49);
  assert.deepEqual(quadros(c.p), [0, 15, 30, 50]);
  assert.equal(deVolta.data.session.segments[0].generated.length, 2);
});

test("keyframe gerado editado pelo usuario: KEYFRAME_CONFLICT com chave propria, sem escrita", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  c.p.keys[1].value = 91;
  c.p.chamadas.length = 0;
  const r = await c.run({ ...CURVA, points: OUTROS, expectedSelection: c.assinatura, session: pontos.data.session });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "KEYFRAME_CONFLICT");
  assert.equal(r.error.details.messageKey, "hostError.easeGeneratedEdited");
  assert.deepEqual(c.p.chamadas, []);
  assert.equal(c.p.numKeys, 4);
  assert.equal(c.app.undoGroups, 1, "so o primeiro pedido abriu grupo de Undo");
});

test("keyframe do usuario dentro do segmento: KEYFRAME_CONFLICT, nada e apagado", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  c.p.setValueAtTime(1, 55);
  c.p.chamadas.length = 0;
  const r = await c.run({ ...CURVA, points: OUTROS, expectedSelection: c.assinatura, session: pontos.data.session });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "KEYFRAME_CONFLICT");
  assert.match(r.error.message, /Ja existe um keyframe/);
  assert.notEqual(r.error.details.messageKey, "hostError.easeGeneratedEdited");
  assert.deepEqual(c.p.chamadas, []);
  assert.equal(c.p.numKeys, 5);
});

test("expectedSelection diferente da selecao atual: STALE_SELECTION antes do grupo de Undo", async () => {
  const c = cena();
  const r = await c.run({ ...CURVA, points: PONTOS, expectedSelection: "1|P2:1" });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "STALE_SELECTION");
  assert.equal(r.error.details.messageKey, "hostError.staleSelection");
  assert.deepEqual(c.p.chamadas, []);
  assert.equal(c.app.undoGroups, 0);
});

test("sessao com assinatura de outra selecao: STALE_SELECTION", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  const r = await c.run({ ...CURVA, points: OUTROS, session: { ...pontos.data.session, signature: "2|P1:1" } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "STALE_SELECTION");
  assert.equal(c.p.numKeys, 4);
  assert.equal(c.app.undoGroups, 1);
});

test("falha de escrita na reaplicacao: rollback devolve os gerados e a selecao exatamente", async () => {
  const c = cena();
  const pontos = await c.run({ ...CURVA, points: PONTOS, expectedSelection: c.assinatura });
  const antes = retrato(c.p);
  c.p.falhaEm = 1;
  const r = await c.run({ ...CURVA, points: OUTROS, expectedSelection: c.assinatura, session: pontos.data.session });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(retrato(c.p), antes);
  assert.deepEqual(c.p.selectedKeys, [1, 4]);
});

test("curva simples sem sessao continua devolvendo a sessao dos pares vizinhos", async () => {
  const c = cena();
  const r = await c.run({ ...CURVA });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.appliedCount, 2);
  assert.equal(r.data.removedCount, 0);
  assert.deepEqual(r.data.session, { signature: c.assinatura, segments: [{ propertyId: "1:ADBE Opacity#1", layerIndex: 1, t0: 0, t1: 2, generated: [] }] });
});

test("sessao malformada e recusada como INVALID_PRESET", async () => {
  const c = cena();
  const seg = { propertyId: "1:ADBE Opacity#1", layerIndex: 1, t0: 0, t1: 2, generated: [{ time: 0.6, value: 90 }] };
  const casos = [
    ["chave extra", { signature: c.assinatura, segments: [seg], extra: 1 }],
    ["sem assinatura", { segments: [seg] }],
    ["t1 <= t0", { signature: c.assinatura, segments: [{ ...seg, t1: 0 }] }],
    ["valor com 5 componentes", { signature: c.assinatura, segments: [{ ...seg, generated: [{ time: 0.6, value: [1, 2, 3, 4, 5] }] }] }],
    ["valor nao finito", { signature: c.assinatura, segments: [{ ...seg, generated: [{ time: 0.6, value: "90" }] }] }],
    ["segmentos demais", { signature: c.assinatura, segments: Array.from({ length: 201 }, () => seg) }]
  ];
  for (const [nome, session] of casos) {
    const r = await c.run({ ...CURVA, session });
    assert.equal(r.ok, false, nome);
    assert.equal(r.error.code, "INVALID_PRESET", nome);
  }
  const tipo = await c.run({ ...CURVA, expectedSelection: 7 });
  assert.equal(tipo.error.code, "INVALID_PRESET");
  assert.equal(c.p.numKeys, 2);
});
