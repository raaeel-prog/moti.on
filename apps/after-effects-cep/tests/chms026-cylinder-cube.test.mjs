/**
 * CHMS-026 — Cylinder e Cube.
 *
 * Os dois critérios de aceite são geométricos, então são **medidos** aqui e não
 * afirmados: a distribuição do cilindro é conferida ângulo a ângulo, e a
 * orientação de cada face do cubo é reconstruída por `MotionTransform` para ver
 * se a normal aponta mesmo para fora — em vez de confiar na tabela de números.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = { NO_VALUE: 0, OneD: 1, ThreeD: 4, ThreeD_SPATIAL: 5 };

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
    this._parent = null;
    this.comment = opcoes.comment ?? "";
    this.threeDLayer = opcoes.threeDLayer ?? false;
    this.locked = false;
    this.removido = false;
    this.width = opcoes.width ?? 500;
    this.height = opcoes.height ?? 500;
    this.bounds = opcoes.bounds ?? null;
    this.duplicadas = 0;
    this.comp = opcoes.comp ?? null;
    this.selected = false;
    this.position = new FakeProperty("ADBE Position", opcoes.position ?? [960, 540]);
    this.anchor = new FakeProperty("ADBE Anchor Point", opcoes.anchor ?? [this.width / 2, this.height / 2]);
    this.orientation = new FakeProperty("ADBE Orientation", [0, 0, 0]);
    this.scale = new FakeProperty("ADBE Scale", [100, 100, 100]);
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Anchor Point") return this.anchor;
        if (n === "ADBE Orientation") return this.orientation;
        if (n === "ADBE Scale") return this.scale;
        return null;
      }
    };
  }
  property(matchName) {
    return matchName === "ADBE Transform Group" ? this.transform : null;
  }
  sourceRectAtTime() {
    return this.bounds ?? { left: 0, top: 0, width: this.width, height: this.height };
  }
  get parent() { return this._parent; }
  set parent(next) {
    // AE `parent =` preserva o mundo e reescreve Position. Um fake que apenas
    // atribui o ponteiro mascara o bug de geometria local dos rigs.
    const old = this._parent?.position.value ?? [0, 0, 0];
    const novo = next?.position.value ?? [0, 0, 0];
    const value = [...this.position.value];
    while (value.length < 3) value.push(0);
    this.position.value = value.map((v, i) => v + (old[i] ?? 0) - (novo[i] ?? 0));
    this._parent = next;
  }
  setParentWithJump(next) { this._parent = next; }
  duplicate() {
    this.duplicadas += 1;
    const copia = new FakeLayer({
      name: `${this.name} ${this.duplicadas}`,
      index: 99,
      comp: this.comp,
      width: this.width,
      height: this.height,
      bounds: this.bounds
    });
    copia.position.value = clone(this.position.value);
    copia.anchor.value = clone(this.anchor.value);
    copia.orientation.value = clone(this.orientation.value);
    copia.scale.value = clone(this.scale.value);
    copia.threeDLayer = this.threeDLayer;
    if (this.comp) {
      this.comp.todas.push(copia);
      this.comp.selectedLayers = [copia];
    }
    return copia;
  }
  remove() {
    this.removido = true;
    if (this.comp) {
      const i = this.comp.todas.indexOf(this);
      if (i >= 0) this.comp.todas.splice(i, 1);
    }
  }
}

class FakeCameraLayer extends FakeLayer {}

class FakeCompItem {
  constructor(layers = [], opcoes = {}) {
    this.todas = layers;
    for (const l of layers) l.comp = this;
    this.selectedLayers = [...(opcoes.selecionadas ?? layers)];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.width = 1920;
    this.height = 1080;
    this.time = 0;
    this.layers = {
      addNull: () => {
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1, comp: this });
        this.todas.push(n);
        this.selectedLayers = [n];
        return n;
      },
      addCamera: (nome) => {
        const c = new FakeCameraLayer({ name: nome, index: this.todas.length + 1, comp: this });
        this.todas.push(c);
        this.selectedLayers = [c];
        return c;
      }
    };
  }
  get numLayers() {
    return this.todas.length;
  }
  get selectedLayers() { return this.todas.filter((l) => l.selected); }
  set selectedLayers(layers) {
    for (const layer of this.todas) layer.selected = false;
    for (const layer of layers) layer.selected = true;
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
      "src/rig-meta.jsx",
      ...files,
      "src/dispatch.jsx"
    ],
    { app, CompItem: FakeCompItem, CameraLayer: FakeCameraLayer, Property: FakeProperty, PropertyType, PropertyValueType }
  );
  return { scope, comp, calls };
}

function request(command, args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: `${command}-1`,
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { allowDestructive: true }
  });
}

const CYLINDER = ["src/commands/three-d-cylinder.jsx"];
const CUBE = ["src/commands/three-d-cube.jsx"];

const cylArgs = {
  radius: 500,
  height: 0,
  count: 8,
  faceMode: "outward",
  startAngle: 0,
  arcDegrees: 360,
  createCamera: false
};

/* -------------------------------------------------------------- Cylinder */

test("num arco fechado as camadas ficam uniformemente distribuidas, sem duas no mesmo ponto", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, CYLINDER);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cylinder", cylArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.layerCount, 8);
  // 360° com 8 camadas: passo de 45°, e a oitava em 315° — não em 360°, que
  // seria o mesmo ponto da primeira.
  assert.equal(resposta.data.stepDegrees, 45);

  const membros = comp.todas.filter((l) => l.name !== "MOTION | CYLINDER");
  const angulos = membros.map((l) => {
    const [x, , z] = l.position.value;
    let g = (Math.atan2(z, x) * 180) / Math.PI;
    if (g < 0) g += 360;
    return Math.round(g);
  });
  assert.deepEqual(angulos.sort((a, b) => a - b), [0, 45, 90, 135, 180, 225, 270, 315]);
  assert.deepEqual(comp.selectedLayers, [camada], "selecao original preservada");
  assert.deepEqual(calls, [["begin", "Moti.on: montar cilindro"], ["end"]]);
});

test("num arco aberto a primeira e a ultima camada caem nas pontas", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CYLINDER);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 3, arcDegrees: 90 }))
  );

  // Dividir por `count` daria 0°, 30° e 60°: o arco de 90° não seria preenchido.
  assert.equal(resposta.data.stepDegrees, 45);
});

test("o raio e o mesmo em todas as camadas", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CYLINDER);

  scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 6, radius: 700 }));

  for (const membro of comp.todas.filter((l) => l.name !== "MOTION | CYLINDER")) {
    const [x, , z] = membro.position.value;
    assert.ok(Math.abs(Math.sqrt(x * x + z * z) - 700) < 1e-9, `raio deu ${Math.sqrt(x * x + z * z)}`);
  }
});

test("a orientacao outward aponta a face para fora do eixo", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CYLINDER);
  const T = scope.MotionTransform;

  scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 4 }));

  for (const membro of comp.todas.filter((l) => l.name !== "MOTION | CYLINDER")) {
    const [x, , z] = membro.position.value;
    const radial = [x / 500, 0, z / 500];
    // A face visível de uma camada olha para -Z; girada pela orientação, ela
    // tem de coincidir com o radial.
    const normal = T.apply(T.matrixFromEuler(membro.orientation.value), [0, 0, -1]);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(normal[i] - radial[i]) < 1e-9, `componente ${i}: ${normal[i]} contra ${radial[i]}`);
    }
  }
});

test("faceMode none deixa a orientacao como estava", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CYLINDER);

  scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 2, faceMode: "none" }));

  for (const membro of comp.todas.filter((l) => l.name !== "MOTION | CYLINDER")) {
    assert.deepEqual(membro.orientation.value, [0, 0, 0]);
  }
});

test("com rig existente o cilindro ajusta em vez de recriar", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CYLINDER);

  scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 4, radius: 300 }));
  const antes = comp.numLayers;

  const segunda = JSON.parse(
    scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 4, radius: 800 }))
  );

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.mode, "adjust");
  assert.equal(comp.numLayers, antes, "nenhuma camada nova");
  for (const membro of comp.todas.filter((l) => l.name !== "MOTION | CYLINDER")) {
    const [x, , z] = membro.position.value;
    assert.ok(Math.abs(Math.sqrt(x * x + z * z) - 800) < 1e-9, "o raio novo ja vale");
  }
});

test("Cylinder recusa count diferente no Adjust, em vez de ignora-lo", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Origem" })]);
  const { scope, calls } = await fixture(comp, CYLINDER);
  assert.equal(JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 3 }))).ok, true);
  const antes = comp.numLayers;
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 5 })));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(comp.numLayers, antes);
  assert.equal(calls.length, 2, "Adjust recusado nao abre Undo");
});

test("Cylinder valida toda a selecao antes de abrir Undo", async () => {
  const a = new FakeLayer({ name: "A" });
  const b = new FakeLayer({ name: "B" });
  b.locked = true;
  const comp = new FakeCompItem([a, b]);
  const { scope, calls } = await fixture(comp, CYLINDER);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 2 })));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(calls, []);
  assert.equal(comp.numLayers, 2);
});

test("Cylinder restaura a camada se o write falhar depois do novo parent", async () => {
  const origem = new FakeLayer({ name: "A", position: [200, 300] });
  const comp = new FakeCompItem([origem]);
  const { scope } = await fixture(comp, CYLINDER);
  const original = origem.position.setValue.bind(origem.position);
  let falhar = true;
  origem.position.setValue = (valor) => {
    if (falhar) { falhar = false; throw new Error("falha simulada"); }
    original(valor);
  };
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cylinder", { ...cylArgs, count: 1 })));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.equal(comp.numLayers, 1);
  assert.equal(origem.parent, null);
  assert.equal(origem.threeDLayer, false);
  assert.deepEqual(origem.position.value, [200, 300]);
});

/* ------------------------------------------------------------------ Cube */

const cubeArgs = {
  size: 400,
  sourceMode: "duplicateOne",
  faceFit: true,
  createCamera: false,
  controllerOrientation: [0, 0, 0],
  keepSources: true
};

test("as seis faces ficam a meia aresta do centro, uma por eixo", async () => {
  const camada = new FakeLayer({ name: "Face", width: 500, height: 500 });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, CUBE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.faceCount, 6);

  const faces = comp.todas.filter((l) => l.name.startsWith("MOTION | CUBE ")).map((l) => l.position.value);
  assert.equal(faces.length, 6);
  // Cada face a 200 do centro, uma em cada sentido dos três eixos.
  const esperado = [
    [0, 0, -200],
    [0, 0, 200],
    [-200, 0, 0],
    [200, 0, 0],
    [0, -200, 0],
    [0, 200, 0]
  ];
  for (const posicao of esperado) {
    assert.ok(
      faces.some((f) => f.every((v, i) => Math.abs(v - posicao[i]) < 1e-9)),
      `faltou a face em ${posicao.join(", ")}`
    );
  }
  assert.deepEqual(calls, [["begin", "Moti.on: montar cubo"], ["end"]]);
});

test("a normal de cada face aponta para fora do cubo", async () => {
  const camada = new FakeLayer({ name: "Face" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CUBE);
  const T = scope.MotionTransform;

  scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs));

  for (const face of comp.todas.filter((l) => l.name.startsWith("MOTION | CUBE "))) {
    const posicao = face.position.value;
    const distancia = Math.sqrt(posicao.reduce((a, v) => a + v * v, 0));
    const paraFora = posicao.map((v) => v / distancia);
    // A face visível olha para -Z; girada pela orientação, tem de coincidir com
    // a direção que sai do centro do cubo.
    const normal = T.apply(T.matrixFromEuler(face.orientation.value), [0, 0, -1]);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(
        Math.abs(normal[i] - paraFora[i]) < 1e-9,
        `${face.name} componente ${i}: normal ${normal[i]}, esperava ${paraFora[i]}`
      );
    }
  }
});

test("faceFit escala a camada para ela ter exatamente a aresta do cubo", async () => {
  const camada = new FakeLayer({ name: "Face", width: 800, height: 200 });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CUBE);

  scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, size: 400 }));

  for (const face of comp.todas.filter((l) => l.name.startsWith("MOTION | CUBE "))) {
    // 400/800 = 50% na largura, 400/200 = 200% na altura: é o que fecha as
    // emendas em vez de deixar sobra ou falta na borda.
    assert.equal(face.scale.value[0], 50);
    assert.equal(face.scale.value[1], 200);
  }
});

test("Cube usa os limites visiveis de uma shape, nao o tamanho da composicao", async () => {
  const camada = new FakeLayer({
    name: "Moti.on Shape", width: 1920, height: 1080, anchor: [0, 0],
    bounds: { left: -160, top: -90, width: 320, height: 180 }
  });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CUBE);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));
  assert.equal(resposta.ok, true);
  const faces = comp.todas.filter(l => l.name.startsWith("MOTION | CUBE "));
  assert.equal(faces.length, 6);
  for (const face of faces) {
    assert.equal(face.scale.value[0], 125);
    assert.ok(Math.abs(face.scale.value[1] - 400 / 180 * 100) < 0.0001);
  }
  assert.equal(camada.threeDLayer, false, "a fonte original permanece intacta");
});

test("as faces sao filhas do controller, que gira o conjunto como unidade", async () => {
  const camada = new FakeLayer({ name: "Face" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CUBE);

  scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, controllerOrientation: [15, 30, 45] }));

  const controller = comp.todas.find((l) => l.name === "MOTION | CUBE");
  assert.ok(controller);
  assert.deepEqual(controller.orientation.value, [15, 30, 45]);
  for (const face of comp.todas.filter((l) => l.name.startsWith("MOTION | CUBE "))) {
    assert.equal(face.parent, controller, "girar o pai gira as seis juntas");
    assert.equal(face.threeDLayer, true);
  }
});

test("o modo de seis camadas exige exatamente seis", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "A" }), new FakeLayer({ name: "B" })]);
  const { scope, calls } = await fixture(comp, CUBE);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, sourceMode: "sixLayers" }))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.equal(resposta.error.details.required, 6);
  assert.deepEqual(calls, []);
});

test("faceFit sem tamanho de origem e recusado antes de criar o rig", async () => {
  const camada = new FakeLayer({ name: "Face", width: 0, height: 0 });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, CUBE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(comp.numLayers, 1, "nenhuma camada foi criada");
  assert.deepEqual(calls, []);
});

test("Cube recusa Anchor Point descentralizado antes de mutar", async () => {
  const camada = new FakeLayer({ name: "Face", width: 400, height: 400, anchor: [0, 0] });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, CUBE);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(calls, []);
  assert.equal(comp.numLayers, 1);
});

test("Cube preserva keyframes existentes ao recusar antes do Undo", async () => {
  const camada = new FakeLayer({ name: "Face" });
  camada.position.keys = [{ time: 0, value: [1, 2] }];
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, CUBE);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
  assert.equal(camada.position.numKeys, 1);
  assert.deepEqual(calls, []);
});

test("a metadata do rig entra no comentario do controller", async () => {
  const camada = new FakeLayer({ name: "Face" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, CUBE);

  scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs));

  const controller = comp.todas.find((l) => l.name === "MOTION | CUBE");
  assert.ok(controller.comment.includes('"rigType":"cube"'));
  assert.ok(controller.comment.includes("[MOTION_META_V1]"));
});

test("keepSources=true deixa a origem intacta e duplica as seis faces", async () => {
  const origem = new FakeLayer({ name: "Arte original", position: [50, 60] });
  origem.comment = "comentario do usuario";
  const comp = new FakeCompItem([origem]);
  const { scope } = await fixture(comp, CUBE);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs)));
  assert.equal(resposta.ok, true);
  assert.equal(comp.numLayers, 8);
  assert.equal(origem.name, "Arte original");
  assert.equal(origem.comment, "comentario do usuario");
  assert.equal(origem.parent, null);
  assert.deepEqual(origem.position.value, [50, 60]);
  assert.deepEqual(comp.selectedLayers, [origem], "selecao original preservada");
});

test("keepSources=false usa a origem como primeira face", async () => {
  const origem = new FakeLayer({ name: "Arte original" });
  const comp = new FakeCompItem([origem]);
  const { scope } = await fixture(comp, CUBE);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, keepSources: false })));
  assert.equal(resposta.ok, true);
  assert.equal(comp.numLayers, 7);
  assert.equal(origem.name, "MOTION | CUBE front");
  assert.ok(origem.parent);
});

test("Cube Adjust preserva papel de cada face mesmo apos reordenar a timeline", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Arte" })]);
  const { scope } = await fixture(comp, CUBE);
  assert.equal(JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", cubeArgs))).ok, true);
  const front = comp.todas.find((l) => l.name === "MOTION | CUBE front");
  const back = comp.todas.find((l) => l.name === "MOTION | CUBE back");
  comp.todas.reverse();
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, size: 600, controllerOrientation: [10, 20, 30] })));
  assert.equal(resposta.ok, true);
  assert.deepEqual(front.position.value, [0, 0, -300]);
  assert.deepEqual(back.position.value, [0, 0, 300]);
  assert.deepEqual(comp.todas.find((l) => l.name === "MOTION | CUBE").orientation.value, [10, 20, 30]);
});

test("Cube restaura nome, parent, comentario e transform se uma face falhar", async () => {
  const origem = new FakeLayer({ name: "Arte", position: [10, 20] });
  origem.comment = "meu comentario";
  const comp = new FakeCompItem([origem]);
  const { scope } = await fixture(comp, CUBE);
  const original = origem.orientation.setValue.bind(origem.orientation);
  let falhar = true;
  origem.orientation.setValue = (valor) => {
    if (falhar) { falhar = false; throw new Error("falha simulada"); }
    original(valor);
  };
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.3d.cube", { ...cubeArgs, keepSources: false })));
  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.equal(comp.numLayers, 1);
  assert.equal(origem.name, "Arte");
  assert.equal(origem.comment, "meu comentario");
  assert.equal(origem.parent, null);
  assert.equal(origem.threeDLayer, false);
  assert.deepEqual(origem.position.value, [10, 20]);
});

