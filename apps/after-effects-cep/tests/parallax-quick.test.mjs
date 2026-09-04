/**
 * CHMS-022 — Parallax Quick Rig.
 *
 * O critério de aceite central: com três camadas de tamanhos diferentes, o
 * primeiro frame permanece visualmente equivalente. Isso é medido aqui — não
 * assumido — reconstruindo o tamanho aparente de cada camada antes e depois.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2 };
const PropertyValueType = { NO_VALUE: 0, ThreeD_SPATIAL: 6, ThreeD: 4, OneD: 1 };

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
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.parent = null;
    this.comment = opcoes.comment ?? "";
    this.threeDLayer = opcoes.threeDLayer ?? false;
    this.removido = false;
    /** Tamanho da fonte, usado só pelo teste para medir o tamanho aparente. */
    this.sourceWidth = opcoes.sourceWidth ?? 100;
    this.position = new FakeProperty("ADBE Position", opcoes.position ?? [960, 540]);
    this.scale = new FakeProperty("ADBE Scale", opcoes.scale ?? [100, 100]);
    this.zoom = new FakeProperty("ADBE Camera Zoom", opcoes.zoom ?? 1000);
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Scale") return this.scale;
        if (n === "ADBE Camera Zoom") return this.zoom;
        return null;
      }
    };
  }
  property(matchName) {
    return matchName === "ADBE Transform Group" ? this.transform : null;
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
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.width = opcoes.width ?? 1920;
    this.height = opcoes.height ?? 1080;
    this.time = 0;
    this.layers = {
      addNull: () => {
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1 });
        this.todas.push(n);
        return n;
      },
      addCamera: (nome) => {
        const c = new FakeCameraLayer({ name: nome, index: this.todas.length + 1, zoom: 1000 });
        this.todas.push(c);
        return c;
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
      "src/rig-meta.jsx",
      "src/commands/animate-parallax-quick.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      CameraLayer: FakeCameraLayer,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType
    }
  );
  return { scope, app, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "parallax-1",
    command: "ae.animate.parallax.quick",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const baseArgs = {
  depthStep: 500,
  strength: 1,
  orderMode: "selection",
  createCamera: true,
  preserveFraming: true,
  controllerName: "MOTION | PARALLAX"
};

/**
 * Tamanho aparente de uma camada: o tamanho da fonte, vezes a escala, dividido
 * pelo encolhimento da perspectiva na profundidade z.
 */
function tamanhoAparente(layer, distancia) {
  const z = layer.position.value[2] ?? 0;
  const escala = layer.scale.value[0] / 100;
  return (layer.sourceWidth * escala * distancia) / (distancia + z);
}

test("o primeiro frame permanece equivalente com tres camadas de tamanhos diferentes", async () => {
  const a = new FakeLayer({ name: "A", index: 1, sourceWidth: 100 });
  const b = new FakeLayer({ name: "B", index: 2, sourceWidth: 640 });
  const c = new FakeLayer({ name: "C", index: 3, sourceWidth: 1920 });
  const comp = new FakeCompItem([a, b, c], { selecionadas: [a, b, c] });

  const antes = [a, b, c].map((l) => tamanhoAparente(l, 1000));
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.mode, "create");
  assert.equal(resposta.data.layerCount, 3);

  const depois = [a, b, c].map((l) => tamanhoAparente(l, resposta.data.cameraDistance));
  for (let i = 0; i < 3; i += 1) {
    assert.ok(
      Math.abs(depois[i] - antes[i]) < 1e-9,
      `camada ${i}: aparente ${depois[i]} contra ${antes[i]} antes do rig`
    );
  }
  assert.deepEqual(calls, [["begin", "Moti.on: criar rig de parallax"], ["end"]]);
});

test("a profundidade cresce por camada e produz z distintos", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const c = new FakeLayer({ name: "C", index: 3 });
  const comp = new FakeCompItem([a, b, c], { selecionadas: [a, b, c] });
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request({ ...baseArgs, depthStep: 400, strength: 2 }));

  // z = indice * depthStep * strength
  assert.equal(a.position.value[2], 0);
  assert.equal(b.position.value[2], 800);
  assert.equal(c.position.value[2], 1600);
});

test("as camadas viram 3D e ficam parenteadas ao controller", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request(baseArgs));

  const controller = comp.todas.find((l) => l.name === "MOTION | PARALLAX");
  assert.ok(controller, "esperava o controller");
  assert.equal(controller.threeDLayer, true);
  for (const camada of [a, b]) {
    assert.equal(camada.threeDLayer, true);
    assert.equal(camada.parent, controller);
  }
});

test("a metadata do rig entra no comentario, entre os marcadores do contrato", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request(baseArgs));

  const controller = comp.todas.find((l) => l.name === "MOTION | PARALLAX");
  assert.ok(controller.comment.includes("[MOTION_META_V1]"));
  assert.ok(controller.comment.includes("[/MOTION_META_V1]"));
  assert.ok(controller.comment.includes('"rigType":"parallax.quick"'));
});

test("o comentario que o usuario escreveu e preservado", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp);

  // O null é criado pelo comando, então o comentário do usuário é simulado
  // escrevendo nele antes de o rig gravar a metadata.
  const original = comp.layers.addNull;
  comp.layers.addNull = () => {
    const n = original();
    n.comment = "anotacao do usuario";
    return n;
  };

  scope.MotionAE.dispatch(request(baseArgs));

  const controller = comp.todas.find((l) => l.name === "MOTION | PARALLAX");
  assert.ok(
    controller.comment.indexOf("anotacao do usuario") >= 0,
    "o comentario do usuario e campo dele: o plugin so escreve entre os marcadores"
  );
});

test("com rig existente o comando entra em Adjust em vez de duplicar", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request(baseArgs));
  const camadasDepoisDoPrimeiro = comp.numLayers;

  const segunda = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, depthStep: 1000 })));

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.mode, "adjust");
  assert.equal(comp.numLayers, camadasDepoisDoPrimeiro, "nenhum controller novo foi criado");
  // Os membros vêm do parentesco, e o novo passo já vale.
  assert.equal(b.position.value[2], 1000);
});

test("uma camada so e recusada: sem duas nao existe paralaxe", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const comp = new FakeCompItem([a], { selecionadas: [a] });
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.deepEqual(calls, []);
});

test("camada com keyframes em Position e recusada antes de sobrescrever a animacao", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  a.position.keys.push({ time: 0, value: [0, 0] });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
  assert.deepEqual(calls, []);
  assert.equal(a.threeDLayer, false, "nada foi tocado");
});

test("sem preservar enquadramento a escala nao e compensada", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const comp = new FakeCompItem([a, b], { selecionadas: [a, b] });
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request({ ...baseArgs, preserveFraming: false }));

  assert.deepEqual(b.scale.value, [100, 100], "a escala fica como estava");
  assert.equal(b.position.value[2], 500, "mas a profundidade e aplicada");
});
