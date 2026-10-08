/**
 * `selectionSignature` do `ae.context.read` e `MotionSelection.signature` sao
 * a mesma string: e ela que o painel manda de volta em `expectedSelection`.
 * Mudar tempos de keyframe nao a altera; mudar a selecao de camadas ou de
 * propriedades, sim.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { FakeProperty, FakeLayer, FakeCompItem, EASE_MODULES, hostGlobals, makeApp, dispatchWith } from "./ease-fakes.mjs";

function cena() {
  const camada = new FakeLayer({ index: 2, name: "Texto" });
  const outra = new FakeLayer({ index: 3, name: "Fundo" });
  const opacidade = new FakeProperty({ keys: [[0, 0], [1, 100]], layer: camada, propertyIndex: 11 });
  const escala = new FakeProperty({ name: "Scale", keys: [[0, 0], [1, 100]], layer: camada, propertyIndex: 6 });
  const comp = new FakeCompItem([opacidade], { id: 42, layers: [camada, outra], selectedLayers: [camada] });
  return { comp, camada, outra, opacidade, escala };
}

test("context.read devolve a assinatura calculada por MotionSelection", async () => {
  const { comp } = cena();
  const app = makeApp(comp);
  const scope = await loadHostModules(EASE_MODULES, hostGlobals(app));
  const r = await dispatchWith({ comp, app, command: "ae.context.read", requestId: "ctx" }, {});
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.data.selectionSignature, scope.MotionSelection.signature(comp));
  assert.equal(r.data.selectionSignature, "42|L2|P2:11");
});

test("editar tempos de keyframe nao muda a assinatura; mudar a selecao muda", async () => {
  const { comp, outra, opacidade, escala } = cena();
  const scope = await loadHostModules(EASE_MODULES, hostGlobals(makeApp(comp)));
  const antes = scope.MotionSelection.signature(comp);
  opacidade.keys[1].time = 3;
  opacidade.keys[0].value = 20;
  opacidade.selectedKeys = [2];
  assert.equal(scope.MotionSelection.signature(comp), antes);
  comp.selectedProperties = [opacidade, escala];
  const comEscala = scope.MotionSelection.signature(comp);
  assert.notEqual(comEscala, antes);
  assert.equal(comEscala, "42|L2|P2:11|P2:6");
  comp.selectedLayers = [outra];
  assert.notEqual(scope.MotionSelection.signature(comp), comEscala);
  comp.selectedLayers = [];
  comp.selectedProperties = [];
  assert.equal(scope.MotionSelection.signature(comp), "42");
});
