/**
 * Parallax completo — foco, zoom, wiggle e bake (CHMS-023).
 *
 * Estes testes existem porque a primeira versao destes quatro comandos violava
 * varios contratos do projeto de uma vez. Cada teste aqui prende um deles:
 *
 *  - abria grupo de Undo dentro do `run`, aninhando no do dispatcher;
 *  - achava a camera montando o nome dela a partir do nome do controller, com
 *    um fallback literal para "Camera 1";
 *  - usava `Number(x) || padrao`, que troca um zero legitimo pelo padrao;
 *  - aceitava qualquer argumento, sem lista de permitidos;
 *  - escrevia expressao sem cabecalho gerenciado e sem checar `expressionError`.
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
    this.propertyValueType = PropertyValueType.ThreeD;
    this.canSetExpression = true;
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = valor;
    this.keys = [];
    this._expression = "";
    /** Preenchido pelo teste para simular a recusa do After Effects. */
    this.recusaExpressao = false;
  }
  get expression() {
    return this._expression;
  }
  set expression(texto) {
    this._expression = texto;
    // O After Effects nao lanca ao recusar: reporta aqui e deixa a propriedade
    // acesa e quebrada. A fidelidade importa — sem ela o teste concordaria com
    // um comando que nunca verifica.
    this.expressionError = texto !== "" && this.recusaExpressao ? "syntax error" : "";
  }
  get numKeys() {
    return this.keys.length;
  }
  keyTime(i) {
    return this.keys[i - 1].t;
  }
  keyValue(i) {
    return this.keys[i - 1].v;
  }
  setValue(v) {
    this.value = clone(v);
  }
  setValueAtTime(t, v) {
    const existente = this.keys.findIndex((k) => Math.abs(k.t - t) < 1e-9);
    if (existente >= 0) this.keys[existente] = { t, v: clone(v) };
    else this.keys.push({ t, v: clone(v) });
    this.keys.sort((a, b) => a.t - b.t);
  }
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
  setTemporalEaseAtKey(i, dentro, fora) {
    this.keys[i - 1].ease = { dentro, fora };
  }
  valueAtTime(t) {
    // Uma rampa qualquer, so para o bake ter o que amostrar.
    return [t * 100, t * 50, 0];
  }
}

class FakeEffect {
  constructor(matchName, nome, lista) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.lista = lista ?? null;
    this.slider = new FakeProperty("ADBE Slider Control-0001", 0);
  }
  property(chave) {
    if (chave === 1 || chave === "ADBE Slider Control-0001") return this.slider;
    return null;
  }
  remove() {
    if (this.lista) {
      const i = this.lista.filhos.indexOf(this);
      if (i >= 0) this.lista.filhos.splice(i, 1);
    }
  }
}

class FakeParade {
  constructor() {
    this.filhos = [];
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.name === chave || f.matchName === chave) ?? null;
  }
  addProperty(matchName) {
    const efeito = new FakeEffect(matchName, undefined, this);
    this.filhos.push(efeito);
    return efeito;
  }
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.parent = null;
    this.comment = opcoes.comment ?? "";
    this.anchorPoint = [0, 0, 0];
    this.position = new FakeProperty("ADBE Position", [960, 540, 0]);
    this.scale = new FakeProperty("ADBE Scale", [100, 100, 100]);
    this.efeitos = new FakeParade();
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
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
}

class FakeCameraLayer extends FakeLayer {
  constructor(opcoes = {}) {
    super(opcoes);
    this.zoom = new FakeProperty("ADBE Camera Zoom", 1000);
    this.focus = new FakeProperty("ADBE Camera Focus Distance", 1000);
    this.dof = new FakeProperty("ADBE Camera Depth of Field", 0);
    this.opcoesCamera = {
      property: (n) => {
        if (n === "ADBE Camera Zoom") return this.zoom;
        if (n === "ADBE Camera Focus Distance") return this.focus;
        if (n === "ADBE Camera Depth of Field") return this.dof;
        return null;
      }
    };
  }
  property(matchName) {
    if (matchName === "ADBE Camera Options Group") return this.opcoesCamera;
    return super.property(matchName);
  }
}

class FakeCompItem {
  constructor(layers = [], camera = null) {
    this.todas = layers;
    this.selectedLayers = [...layers];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.workAreaStart = 0;
    this.workAreaDuration = 2;
    this.width = 1920;
    this.height = 1080;
    this.time = 0;
    this.activeCamera = camera;
  }
  get numLayers() {
    return this.todas.length;
  }
  layer(i) {
    return this.todas[i - 1] ?? null;
  }
}

/**
 * Um controller com o bloco de metadata do rig no comentario.
 *
 * O bloco e montado pelo proprio `MotionRigMeta.write`, e nao escrito a mao no
 * teste: assim o teste continua valendo se os marcadores mudarem.
 */
function controllerDeParallax(scope, nome = "Controller") {
  const l = new FakeLayer({ name: nome, index: 1 });
  l.comment = scope.MotionRigMeta.write("", '{"rigType":"parallax.quick","v":1}');
  return l;
}

async function fixture({ comCamera = true, nomeCamera = "Qualquer nome" } = {}) {
  const calls = [];
  const scopeParcial = await loadHostModules(
    ["generated/motion-contracts.jsx", "src/json.jsx", "src/rig-meta.jsx"],
    {}
  );

  const controller = controllerDeParallax(scopeParcial, "Controller");
  const alvo = new FakeLayer({ name: "Alvo", index: 2 });
  const camera = comCamera ? new FakeCameraLayer({ name: nomeCamera, index: 3 }) : null;

  const layers = camera ? [controller, alvo, camera] : [controller, alvo];
  const comp = new FakeCompItem(layers, camera);
  comp.selectedLayers = [alvo];

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
      "src/expression-templates.jsx",
      "src/keyframe-operations.jsx",
      "src/rig-meta.jsx",
      "src/commands/parallax-advanced.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      CameraLayer: FakeCameraLayer,
      KeyframeEase: class {
        constructor(speed, influence) {
          this.speed = speed;
          this.influence = influence;
        }
      },
      PropertyType,
      PropertyValueType
    }
  );

  return { scope, comp, controller, alvo, camera, calls };
}

function request(command, args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "px-1",
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const responder = (scope, command, args) => JSON.parse(scope.MotionAE.dispatch(request(command, args)));

const FOCO = { targetLayerName: "Alvo", focusOffset: 0, enableDepthOfField: true };
const WIGGLE = { frequency: 2, amplitude: 50, seed: 7 };
const ZOOM = { zoomLevel: 2000, durationFrames: 30 };
const BAKE = { stepFrames: 1 };

test("nenhuma das quatro operacoes abre um grupo de Undo proprio", async () => {
  // O After Effects nao aninha grupos de Undo: um `endUndoGroup` interno fecha o
  // grupo do dispatcher, e o resto da operacao cai fora do Undo. O usuario
  // aperta Ctrl+Z e desfaz so um pedaco.
  const f = await fixture();
  f.alvo.position.expression = "wiggle(1,1)";
  f.alvo.position.expressionEnabled = true;

  responder(f.scope, "ae.parallax.auto-focus", FOCO);
  responder(f.scope, "ae.parallax.wiggle", WIGGLE);
  responder(f.scope, "ae.parallax.zoom", ZOOM);
  responder(f.scope, "ae.parallax.bake", BAKE);

  const aberturas = f.calls.filter(([tipo]) => tipo === "begin");
  const fechamentos = f.calls.filter(([tipo]) => tipo === "end");
  assert.equal(aberturas.length, 4, "um grupo por comando, aberto pelo dispatcher");
  assert.equal(fechamentos.length, 4);

  // Nunca dois "begin" seguidos: seria aninhamento.
  for (let i = 1; i < f.calls.length; i += 1) {
    assert.ok(
      !(f.calls[i - 1][0] === "begin" && f.calls[i][0] === "begin"),
      "dois grupos de Undo abertos em sequencia"
    );
  }
});

test("a camera e achada pela estrutura, mesmo com um nome que nao segue padrao nenhum", async () => {
  // A versao anterior montava "<controller> | CAMERA" e caia em "Camera 1".
  const f = await fixture({ nomeCamera: "zzz camera do cliente" });

  const resposta = responder(f.scope, "ae.parallax.auto-focus", FOCO);

  assert.equal(resposta.ok, true, JSON.stringify(resposta.error ?? null));
  assert.ok(f.camera.focus.expression.length > 0, "a expressao de foco foi escrita na camera certa");
});

test("sem camera ativa o comando recusa, em vez de adivinhar", async () => {
  const f = await fixture({ comCamera: false });

  const resposta = responder(f.scope, "ae.parallax.auto-focus", FOCO);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
});

test("amplitude zero continua zero, e nao vira o padrao", async () => {
  // `Number(args.amplitude) || 50` trocava um zero legitimo por 50. Zero e um
  // pedido valido: desligar o balanco sem remover o rig.
  const f = await fixture();

  const resposta = responder(f.scope, "ae.parallax.wiggle", { ...WIGGLE, amplitude: 0 });

  assert.equal(resposta.ok, true, JSON.stringify(resposta.error ?? null));
  const amp = f.controller.efeitos.property("Parallax Amplitude");
  assert.equal(amp.property(1).value, 0);
});

test("argumento desconhecido e recusado no preflight", async () => {
  const f = await fixture();

  const resposta = responder(f.scope, "ae.parallax.wiggle", { ...WIGGLE, turbo: true });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "turbo");
});

test("as expressoes levam o cabecalho gerenciado e sao reconhecidas de volta", async () => {
  const f = await fixture();

  responder(f.scope, "ae.parallax.auto-focus", FOCO);
  responder(f.scope, "ae.parallax.wiggle", WIGGLE);

  assert.match(f.camera.focus.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.parallax\.auto-focus\n/);
  assert.match(f.camera.position.expression, /^\/\/ MOTION_EXPRESSION v1 \| ae\.parallax\.wiggle\n/);

  assert.equal(f.scope.MotionExpressions.isManagedParallaxFocus(f.camera.focus.expression), true);
  assert.equal(f.scope.MotionExpressions.isManagedParallaxWiggle(f.camera.position.expression), true);
});

test("expressao de usuario na propriedade faz o comando recusar, sem sobrescrever", async () => {
  const f = await fixture();
  f.camera.focus.expression = "minhaExpressao()";

  const resposta = responder(f.scope, "ae.parallax.auto-focus", FOCO);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.equal(f.camera.focus.expression, "minhaExpressao()", "a expressao do usuario ficou intacta");
});

test("expressao recusada pelo After Effects volta atras, sem deixar a propriedade quebrada", async () => {
  const f = await fixture();
  f.camera.focus.recusaExpressao = true;

  const resposta = responder(f.scope, "ae.parallax.auto-focus", FOCO);

  assert.equal(resposta.ok, false);
  assert.equal(f.camera.focus.expression, "", "a propriedade voltou ao estado anterior");
  assert.equal(f.camera.dof.value, 0, "a profundidade de campo nao ficou ligada pela metade");
});

test("o wiggle remove os sliders que criou quando a expressao e recusada", async () => {
  const f = await fixture();
  f.camera.position.recusaExpressao = true;

  const resposta = responder(f.scope, "ae.parallax.wiggle", WIGGLE);

  assert.equal(resposta.ok, false);
  assert.equal(f.controller.efeitos.numProperties, 0, "nenhum slider sobrou no controller");
  assert.equal(f.camera.position.expression, "");
});

test("o zoom escreve duas chaves e as encontra pelo tempo, mesmo com chaves depois", async () => {
  const f = await fixture();
  // Uma chave muito depois: "as duas ultimas" seriam as erradas.
  f.camera.zoom.setValueAtTime(10, 5000);

  const resposta = responder(f.scope, "ae.parallax.zoom", ZOOM);

  assert.equal(resposta.ok, true, JSON.stringify(resposta.error ?? null));
  const t2 = 30 * f.comp.frameDuration;
  const chaveFinal = f.camera.zoom.keys.find((k) => Math.abs(k.t - t2) < 1e-9);
  assert.ok(chaveFinal, "a chave final foi escrita no tempo pedido");
  assert.equal(chaveFinal.v, 2000);
  assert.ok(chaveFinal.ease, "o ease caiu na chave nova, e nao na que ja existia");
  assert.equal(f.camera.zoom.keys.find((k) => k.t === 10).ease, undefined);
});

test("o bake anda na grade de quadros, sem acumular erro de ponto flutuante", async () => {
  const f = await fixture();
  f.alvo.position.expression = "wiggle(1, 10)";
  f.alvo.position.expressionEnabled = true;

  const resposta = responder(f.scope, "ae.parallax.bake", BAKE);

  assert.equal(resposta.ok, true, JSON.stringify(resposta.error ?? null));

  const quadros = Math.floor(f.comp.workAreaDuration / f.comp.frameDuration);
  assert.equal(f.alvo.position.numKeys, quadros + 1);

  // Cada amostra tem de cair exatamente num quadro. Somar `frameDuration`
  // repetidamente sai da grade: no quadro 50 o erro ja e visivel.
  for (const chave of f.alvo.position.keys) {
    const indice = chave.t / f.comp.frameDuration;
    assert.ok(
      Math.abs(indice - Math.round(indice)) < 1e-9,
      `a amostra em ${chave.t}s caiu entre dois quadros (quadro ${indice})`
    );
  }
  assert.equal(f.alvo.position.expression, "", "a expressao foi removida depois de assada");
});

test("o bake recusa no preflight quando nao ha expressao para assar", async () => {
  // O descriptor declara `allowsNoopSuccess: false`, entao devolver
  // `changed: false` no `run` seria erro — e o grupo de Undo ja teria aberto.
  const f = await fixture();

  const resposta = responder(f.scope, "ae.parallax.bake", BAKE);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.equal(f.calls.length, 0, "nenhum grupo de Undo foi aberto para uma operacao que nao acontece");
});

test("sem rig de parallax na composicao, as operacoes recusam", async () => {
  const f = await fixture();
  f.controller.comment = "";

  for (const [comando, args] of [
    ["ae.parallax.auto-focus", FOCO],
    ["ae.parallax.wiggle", WIGGLE],
    ["ae.parallax.zoom", ZOOM]
  ]) {
    const resposta = responder(f.scope, comando, args);
    assert.equal(resposta.ok, false, `${comando} deveria recusar`);
    assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  }
});
