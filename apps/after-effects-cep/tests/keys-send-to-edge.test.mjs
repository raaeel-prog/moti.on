/**
 * `ae.keys.send-to-edge` — MASTER_BUILD_SPEC §15.5, "Enviar ao começo" e
 * "Enviar ao final".
 *
 * O que estes testes fixam, em ordem de importância:
 *
 * 1. o grupo se move **rígido** — o espaçamento interno é o "relative timing"
 *    que a §15.6 manda preservar, e é a diferença entre mover uma animação e
 *    deformá-la;
 * 2. cada `reference` mede contra a borda certa (composição, camada, work
 *    area), inclusive quando a camada não começa em zero — o caso em que um
 *    erro de referência passaria despercebido se a comp e a camada
 *    coincidissem;
 * 3. atravessar um keyframe não selecionado é recusado **antes** de escrever,
 *    e não corrigido depois: perda silenciosa de keyframe é o pior resultado
 *    possível para um comando de timing.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import {
  FakeCompItem,
  FakeKeyframeEase,
  FakeProperty,
  PropertyType,
  PropertyValueType,
  makeKey
} from "./keyframe-fakes.mjs";

/**
 * Camada dona da propriedade. O comando sobe a cadeia de `parentProperty` até
 * achar algo com `inPoint`, que é como o host expõe a camada.
 */
class FakeLayer {
  constructor(inPoint, outPoint) {
    this.name = "Camada";
    this.inPoint = inPoint;
    this.outPoint = outPoint;
    this.parentProperty = null;
  }
}

/** Propriedade pendurada numa camada, para a referência `layer`. */
function propriedadeEmCamada(keys, camada) {
  const propriedade = new FakeProperty("Opacity", keys);
  const grupo = { name: "Transform", matchName: "ADBE Transform Group", parentProperty: camada };
  propriedade.parentProperty = grupo;
  return propriedade;
}

async function fixture(comp) {
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  return loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx",
      "src/commands/keys-send-to-edge.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 }
    }
  );
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "send-to-edge-1",
    command: "ae.keys.send-to-edge",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

async function envia(comp, args) {
  const scope = await fixture(comp);
  return JSON.parse(scope.MotionAE.dispatch(request(args)));
}

const tempos = (property) => property.keys.map((k) => Number(k.time.toFixed(6)));

test("edge start com reference comp leva o primeiro key para 0 sem deformar o grupo", async () => {
  // Espaçamento propositalmente irregular (0,5 / 1,5): um deslocamento que
  // deformasse o grupo apareceria aqui e não apareceria com keys equidistantes.
  const property = new FakeProperty("Opacity", [
    makeKey(4, 10, 1, 1),
    makeKey(4.5, 20, 2, 2),
    makeKey(6, 30, 3, 3)
  ]);

  const resposta = await envia(new FakeCompItem([property]), { edge: "start", reference: "comp" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(tempos(property), [0, 0.5, 2]);
  assert.deepEqual(property.keys.map((k) => k.value), [10, 20, 30]);
});

test("edge end com reference comp encosta o ultimo key na duracao da composicao", async () => {
  const property = new FakeProperty("Opacity", [
    makeKey(1, 10, 1, 1),
    makeKey(1.5, 20, 2, 2),
    makeKey(3, 30, 3, 3)
  ]);
  const comp = new FakeCompItem([property]);
  comp.duration = 8;

  const resposta = await envia(comp, { edge: "end", reference: "comp" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(tempos(property), [6, 6.5, 8]);
});

test("reference workArea mede contra a work area, e nao contra a composicao", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);
  const comp = new FakeCompItem([property]);
  comp.duration = 30;
  comp.workAreaStart = 5;
  comp.workAreaDuration = 4;

  const resposta = await envia(comp, { edge: "end", reference: "workArea" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  // Fim da work area = 5 + 4 = 9. A comp termina em 30: se o comando tivesse
  // usado a composicao, o ultimo key estaria em 30.
  assert.deepEqual(tempos(property), [8, 9]);
});

test("reference layer mede contra o inPoint e o outPoint da camada dona", async () => {
  const camada = new FakeLayer(2, 7);
  const property = propriedadeEmCamada([makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)], camada);
  const comp = new FakeCompItem([property]);
  comp.duration = 30;

  const resposta = await envia(comp, { edge: "start", reference: "layer" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(tempos(property), [2, 3]);
});

test("o grupo nao pode atravessar um keyframe nao selecionado", async () => {
  const property = new FakeProperty("Opacity", [
    makeKey(0, 10, 1, 1),
    makeKey(5, 20, 2, 2),
    makeKey(6, 30, 3, 3)
  ]);
  // So os dois ultimos estao selecionados; o key em t=0 fica parado.
  property.selectedKeys = [2, 3];
  const antes = tempos(property);

  const resposta = await envia(new FakeCompItem([property]), { edge: "start", reference: "comp" });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
  assert.deepEqual(
    tempos(property),
    antes,
    "a recusa acontece antes da escrita — nada pode ter se movido"
  );
});

test("pedir a borda onde o grupo ja esta responde ok, sem inventar alteracao", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);

  const resposta = await envia(new FakeCompItem([property]), { edge: "start", reference: "comp" });

  // O descriptor declara allowsNoopSuccess: pedir o que ja esta feito e um
  // pedido satisfeito, e nao uma falha.
  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.shifted, 0);
  assert.deepEqual(tempos(property), [0, 1]);
});

test("selecao vazia e recusada, e nao tratada como no-op bem-sucedido", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);
  property.selectedKeys = [];

  const resposta = await envia(new FakeCompItem([property]), { edge: "start", reference: "comp" });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "NO_SELECTION");
});

test("edge e reference invalidos sao recusados no preflight", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);
  const comp = new FakeCompItem([property]);

  for (const args of [
    { edge: "meio", reference: "comp" },
    { edge: "start", reference: "galaxia" },
    { edge: "start" },
    { edge: "start", reference: "comp", extra: 1 }
  ]) {
    const resposta = await envia(comp, args);
    assert.equal(resposta.ok, false, JSON.stringify(args));
    assert.equal(resposta.error.code, "INVALID_PRESET", JSON.stringify(args));
  }
  assert.deepEqual(tempos(property), [0, 1], "preflight nao pode ter tocado no projeto");
});

test("ease, interpolacao e roving atravessam o deslocamento intactos", async () => {
  // Tres keys, e nao duas: roving so existe em key intermediaria — o After
  // Effects recusa roving na primeira e na ultima, e keyframe-operations.jsx
  // reproduz essa regra ao restaurar.
  const property = new FakeProperty("Opacity", [
    makeKey(2, 10, 11, 12),
    makeKey(3, 20, 21, 22),
    makeKey(5, 30, 31, 32)
  ]);
  property.keys[1].roving = true;
  property.keys[0].temporalContinuous = true;

  const resposta = await envia(new FakeCompItem([property]), { edge: "start", reference: "comp" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(tempos(property), [0, 1, 3]);
  assert.equal(property.keys[0].outEase[0].influence, 11);
  assert.equal(property.keys[0].inEase[0].influence, 12);
  assert.equal(property.keys[2].outEase[0].influence, 31);
  assert.equal(property.keys[2].inEase[0].influence, 32);
  assert.equal(property.keys[0].temporalContinuous, true);
  assert.equal(property.keys[1].roving, true);
});

test("varias propriedades sao deslocadas na mesma operacao", async () => {
  const a = new FakeProperty("Opacity", [makeKey(4, 10, 1, 1), makeKey(5, 20, 2, 2)]);
  const b = new FakeProperty("Rotation", [makeKey(2, 30, 3, 3), makeKey(6, 40, 4, 4)]);

  const resposta = await envia(new FakeCompItem([a, b]), { edge: "start", reference: "comp" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.shifted, 2);
  assert.deepEqual(tempos(a), [0, 1]);
  assert.deepEqual(tempos(b), [0, 4]);
});
