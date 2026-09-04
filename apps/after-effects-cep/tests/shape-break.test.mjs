/**
 * CHMS-025 — Break Shape.
 *
 * O critério de aceite é uma comparação visual dentro de 1 px, e isso reduz a
 * uma propriedade numérica: um ponto no espaço do grupo tem de cair na mesma
 * posição da composição antes e depois de separar. É isso que os testes medem,
 * reconstruindo a cadeia de transforms com `MotionTransform` — o render em si só
 * o After Effects prova.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2 };
const PropertyValueType = { NO_VALUE: 0, OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, ThreeD: 4 };

const clone = (v) => (Array.isArray(v) ? [...v] : v);

class FakeProperty {
  constructor(matchName, valor) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.TwoD;
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

/** Transform de grupo de shape, com os valores que o comando lê e escreve. */
function transformDeGrupo(opcoes = {}) {
  const grupo = new FakePropertyGroup("ADBE Vector Transform Group");
  grupo.filhos.push(new FakeProperty("ADBE Vector Anchor", opcoes.anchor ?? [0, 0]));
  grupo.filhos.push(new FakeProperty("ADBE Vector Position", opcoes.position ?? [0, 0]));
  grupo.filhos.push(new FakeProperty("ADBE Vector Scale", opcoes.scale ?? [100, 100]));
  grupo.filhos.push(new FakeProperty("ADBE Vector Rotation", opcoes.rotation ?? 0));
  grupo.filhos.push(new FakeProperty("ADBE Vector Skew", opcoes.skew ?? 0));
  return grupo;
}

class FakePropertyGroup {
  constructor(matchName, nome) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.filhos = [];
    this.pai = null;
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  remove() {
    if (this.pai) {
      const i = this.pai.filhos.indexOf(this);
      if (i >= 0) this.pai.filhos.splice(i, 1);
    }
  }
  /** Cópia profunda, que é o que `duplicate` da camada precisa fazer. */
  clonar() {
    const copia = new FakePropertyGroup(this.matchName, this.name);
    for (const filho of this.filhos) {
      if (filho instanceof FakePropertyGroup) {
        const filhoCopia = filho.clonar();
        filhoCopia.pai = copia;
        copia.filhos.push(filhoCopia);
      } else {
        copia.filhos.push(new FakeProperty(filho.matchName, clone(filho.value)));
      }
    }
    return copia;
  }
}

function grupoDeForma(nome, transformOpcoes) {
  const grupo = new FakePropertyGroup("ADBE Vector Group", nome);
  const conteudo = new FakePropertyGroup("ADBE Vectors Group");
  conteudo.pai = grupo;
  grupo.filhos.push(conteudo);
  const transform = transformDeGrupo(transformOpcoes);
  transform.pai = grupo;
  grupo.filhos.push(transform);
  return grupo;
}

class FakeShapeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Forma";
    this.index = opcoes.index ?? 1;
    this.parent = null;
    this.comment = "";
    this.removido = false;
    this.comp = opcoes.comp ?? null;

    this.contents = new FakePropertyGroup("ADBE Root Vectors Group");
    for (const grupo of opcoes.grupos ?? []) {
      grupo.pai = this.contents;
      this.contents.filhos.push(grupo);
    }

    this.anchor = new FakeProperty("ADBE Anchor Point", opcoes.anchor ?? [0, 0]);
    this.position = new FakeProperty("ADBE Position", opcoes.position ?? [0, 0]);
    this.scale = new FakeProperty("ADBE Scale", opcoes.scale ?? [100, 100]);
    this.rotation = new FakeProperty("ADBE Rotate Z", opcoes.rotation ?? 0);
    this.transformGroup = {
      property: (n) => {
        if (n === "ADBE Anchor Point") return this.anchor;
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Scale") return this.scale;
        if (n === "ADBE Rotate Z") return this.rotation;
        // `linearMatrix` também procura orientação e rotações X/Y, que uma
        // camada 2D não tem: devolver null é o que o host faz.
        return null;
      }
    };
  }
  property(matchName) {
    if (matchName === "ADBE Root Vectors Group") return this.contents;
    if (matchName === "ADBE Transform Group") return this.transformGroup;
    return null;
  }
  duplicate() {
    const copia = new FakeShapeLayer({
      name: this.name,
      index: 99,
      comp: this.comp,
      anchor: clone(this.anchor.value),
      position: clone(this.position.value),
      scale: clone(this.scale.value),
      rotation: this.rotation.value
    });
    copia.contents = this.contents.clonar();
    for (const filho of copia.contents.filhos) filho.pai = copia.contents;
    if (this.comp) this.comp.todas.push(copia);
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

class FakeCompItem {
  constructor(layers = []) {
    this.todas = layers;
    for (const l of layers) l.comp = this;
    this.selectedLayers = [...layers];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.width = 1920;
    this.height = 1080;
    this.time = 0;
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
      "src/transform-math.jsx",
      "src/commands/shape-break.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      ShapeLayer: FakeShapeLayer,
      Property: FakeProperty,
      PropertyGroup: FakePropertyGroup,
      PropertyType,
      PropertyValueType
    }
  );
  return { scope, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "break-1",
    command: "ae.shape.break",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { allowDestructive: true }
  });
}

const baseArgs = {
  recursive: false,
  keepOriginal: true,
  preserveAppearance: true,
  namingMode: "groupName"
};

/**
 * Onde um ponto do espaço do grupo cai na composição, passando pelo transform do
 * grupo e depois pelo da camada.
 */
function pontoNaComposicao(T, ponto, camada, grupoTransform) {
  const ler = (grupo, matchName, padrao) => {
    const p = grupo.property(matchName);
    return p ? clone(p.value) : padrao;
  };

  const ancoraGrupo = ler(grupoTransform, "ADBE Vector Anchor", [0, 0]);
  const posicaoGrupo = ler(grupoTransform, "ADBE Vector Position", [0, 0]);
  const escalaGrupo = ler(grupoTransform, "ADBE Vector Scale", [100, 100]);
  const rotacaoGrupo = ler(grupoTransform, "ADBE Vector Rotation", 0);

  const linearGrupo = T.multiply(T.rotZ(rotacaoGrupo), [
    escalaGrupo[0] / 100, 0, 0,
    0, escalaGrupo[1] / 100, 0,
    0, 0, 1
  ]);
  const noEspacoDaCamada = T.apply(linearGrupo, [ponto[0] - ancoraGrupo[0], ponto[1] - ancoraGrupo[1]]);
  const aposGrupo = [noEspacoDaCamada[0] + posicaoGrupo[0], noEspacoDaCamada[1] + posicaoGrupo[1]];

  const linearCamada = T.linearMatrix(camada);
  const ancoraCamada = camada.anchor.value;
  const posicaoCamada = camada.position.value;
  const girado = T.apply(linearCamada, [aposGrupo[0] - ancoraCamada[0], aposGrupo[1] - ancoraCamada[1]]);
  return [girado[0] + posicaoCamada[0], girado[1] + posicaoCamada[1]];
}

test("cada grupo vira uma camada, e a original pode ficar", async () => {
  const camada = new FakeShapeLayer({
    name: "Placa",
    grupos: [grupoDeForma("Circulo"), grupoDeForma("Quadrado"), grupoDeForma("Triangulo")]
  });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.brokenLayers, 3);
  const novas = comp.todas.filter((l) => l !== camada);
  assert.equal(novas.length, 3);
  // Cada camada nova ficou com exatamente um grupo.
  for (const nova of novas) {
    const grupos = nova.contents.filhos.filter((f) => f.matchName === "ADBE Vector Group");
    assert.equal(grupos.length, 1);
  }
  assert.deepEqual(calls, [["begin", "Moti.on: separar formas"], ["end"]]);
});

test("a aparencia e preservada: o ponto cai no mesmo lugar depois de separar", async () => {
  // Camada girada e escalada, com grupos deslocados e girados: o caso em que uma
  // composição errada de matrizes apareceria.
  const grupoA = grupoDeForma("A", { position: [120, -40], anchor: [10, 5], scale: [150, 150], rotation: 25 });
  const grupoB = grupoDeForma("B", { position: [-80, 90], scale: [50, 50], rotation: -15 });
  const camada = new FakeShapeLayer({
    name: "Placa",
    grupos: [grupoA, grupoB],
    anchor: [30, 20],
    position: [900, 500],
    scale: [120, 120],
    rotation: 40
  });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);
  const T = scope.MotionTransform;

  // Onde três pontos do grupo A caem antes de separar.
  const pontos = [[0, 0], [100, 0], [0, 60]];
  const antes = pontos.map((p) =>
    pontoNaComposicao(T, p, camada, grupoA.property("ADBE Vector Transform Group"))
  );

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));
  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.flattened, 2, "os dois grupos foram achatados");

  const novaA = comp.todas.find((l) => l.name === "MOTION | A");
  assert.ok(novaA, "esperava a camada do grupo A");
  const grupoNaCopia = novaA.contents.filhos.find((f) => f.matchName === "ADBE Vector Group");
  const depois = pontos.map((p) =>
    pontoNaComposicao(T, p, novaA, grupoNaCopia.property("ADBE Vector Transform Group"))
  );

  for (let i = 0; i < pontos.length; i += 1) {
    const dx = depois[i][0] - antes[i][0];
    const dy = depois[i][1] - antes[i][1];
    const distancia = Math.sqrt(dx * dx + dy * dy);
    // O critério de aceite pede 1 px; a composição é exata, então o erro é de
    // máquina.
    assert.ok(distancia < 1e-9, `ponto ${i} moveu ${distancia} px`);
  }
});

test("o transform do grupo e zerado depois de absorvido", async () => {
  const grupo = grupoDeForma("A", { position: [120, -40], scale: [150, 150], rotation: 25 });
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupo, grupoDeForma("B")] });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request(baseArgs));

  const nova = comp.todas.find((l) => l.name === "MOTION | A");
  const transform = nova.contents.filhos
    .find((f) => f.matchName === "ADBE Vector Group")
    .property("ADBE Vector Transform Group");
  // Deixá-lo como estava aplicaria a transformação duas vezes.
  assert.deepEqual(transform.property("ADBE Vector Position").value, [0, 0]);
  assert.deepEqual(transform.property("ADBE Vector Scale").value, [100, 100]);
  assert.equal(transform.property("ADBE Vector Rotation").value, 0);
});

test("grupo com cisalhamento fica aninhado e o comando avisa", async () => {
  const grupo = grupoDeForma("Torto", { skew: 20 });
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupo, grupoDeForma("Reto")] });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true, "os outros grupos ainda separam");
  // Cisalhamento não existe no transform de camada: achatar mudaria o desenho.
  assert.equal(resposta.data.flattened, 1);
  assert.equal(resposta.warnings.length, 1);
  assert.equal(resposta.warnings[0].code, "break.skewNotFlattened");
});

test("escala nao uniforme com rotacao no meio nao e achatada, e avisa", async () => {
  // Camada com escala não uniforme, grupo girado: a matriz combinada tem
  // cisalhamento, e o transform de camada não representa isso.
  const grupo = grupoDeForma("Girado", { rotation: 30 });
  const camada = new FakeShapeLayer({
    name: "Placa",
    grupos: [grupo, grupoDeForma("Reto")],
    scale: [200, 80]
  });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true);
  const aviso = resposta.warnings.find((w) => w.code === "break.transformNotFlattened");
  assert.ok(aviso, "esperava o aviso de transform nao achatado");
});

test("sem preservar aparencia o transform do grupo fica como estava", async () => {
  const grupo = grupoDeForma("A", { position: [120, -40], rotation: 25 });
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupo, grupoDeForma("B")] });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, preserveAppearance: false })));

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.flattened, 0);
  const nova = comp.todas.find((l) => l.name === "MOTION | A");
  const transform = nova.contents.filhos
    .find((f) => f.matchName === "ADBE Vector Group")
    .property("ADBE Vector Transform Group");
  assert.deepEqual(transform.property("ADBE Vector Position").value, [120, -40]);
});

test("keepOriginal falso remove a camada de origem", async () => {
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupoDeForma("A"), grupoDeForma("B")] });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request({ ...baseArgs, keepOriginal: false }));

  assert.equal(camada.removido, true);
  assert.equal(comp.todas.indexOf(camada), -1);
});

test("o nome indexado usa a camada de origem", async () => {
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupoDeForma("A"), grupoDeForma("B")] });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request({ ...baseArgs, namingMode: "indexed" }));

  const nomes = comp.todas.filter((l) => l !== camada).map((l) => l.name);
  assert.deepEqual(nomes.sort(), ["MOTION | Placa 1", "MOTION | Placa 2"]);
});

test("camada com um grupo so e recusada, porque nao ha o que separar", async () => {
  const camada = new FakeShapeLayer({ name: "Placa", grupos: [grupoDeForma("Unico")] });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(resposta.error.details.groups, 1);
  assert.equal(comp.numLayers, 1);
  assert.deepEqual(calls, []);
});

test("camada que nao e de forma e recusada", async () => {
  const comp = new FakeCompItem([]);
  comp.todas = [{ name: "Solida", property: () => null }];
  comp.selectedLayers = [...comp.todas];
  const { scope } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
});
