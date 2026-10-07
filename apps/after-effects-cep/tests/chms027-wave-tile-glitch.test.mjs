/**
 * CHMS-027 — Wave, Tile e Glitch.
 *
 * Os critérios de aceite do master spec estão nos nomes: amplitude zero volta à
 * aparência original, aumentar o tamanho de saída não cria emenda com mirror,
 * Adjust atualiza o rig existente, e desativar o controller do glitch zera o
 * efeito sem tocar outras adjustment layers.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2 };
const PropertyValueType = {
  NO_VALUE: 0,
  OneD: 1,
  TwoD: 2,
  TwoD_SPATIAL: 3,
  ThreeD: 4,
  ThreeD_SPATIAL: 5,
  COLOR: 6,
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
  constructor(matchName, valor) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.TwoD_SPATIAL;
    this.canVaryOverTime = true;
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = valor;
    this.keys = [];
    this.avaliador = null;
  }
  get numKeys() {
    return this.keys.length;
  }
  setValue(v) {
    if (this.keys.length > 0) throw new Error("setValue numa propriedade animada");
    this.value = clone(v);
  }
  setValueAtTime(t, v) {
    this.keys.push({ time: t, value: clone(v) });
    this.keys.sort((a, b) => a.time - b.time);
  }
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
  valueAtTime(t, pre) {
    if (!pre && this.expressionEnabled && this.avaliador) return this.avaliador(t);
    return clone(this.value);
  }
}

/** Parâmetros que cada efeito nativo expõe, para o fake recusar o que não existe. */
const PARAMS = {
  "ADBE Wave Warp": ["ADBE Wave Warp-0001", "ADBE Wave Warp-0002", "ADBE Wave Warp-0003", "ADBE Wave Warp-0004", "ADBE Wave Warp-0005"],
  "CHMS Wave Core": Array.from({ length: 5 }, (_, i) => `CHMS Wave Core-100${i + 1}`),
  "ADBE Tile": ["ADBE Tile-0004", "ADBE Tile-0005", "ADBE Tile-0006"],
  "ADBE Geometry2": ["ADBE Geometry2-0004"],
  "ADBE Channel Blur": ["ADBE Channel Blur-0001", "ADBE Channel Blur-0003"],
  "ADBE Noise": ["ADBE Noise-0001"],
  "CHMS Motion Core": Array.from({ length: 5 }, (_, i) => `CHMS Motion Core-000${i + 1}`)
};

class FakeEffect {
  constructor(matchName, nome, lista) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.removido = false;
    this.lista = lista ?? null;
    this.props = {};
    for (const chave of PARAMS[matchName] ?? []) this.props[chave] = new FakeProperty(chave, 0);
  }
  property(chave) {
    return this.props[chave] ?? null;
  }
  remove() {
    this.removido = true;
    // O host tira o efeito da lista de verdade; um fake que so marca uma flag
    // faria o teste concordar com um comando que nunca remove nada.
    if (this.lista) {
      const i = this.lista.filhos.indexOf(this);
      if (i >= 0) this.lista.filhos.splice(i, 1);
    }
  }
}

class FakeParade {
  /** `indisponiveis` simula uma instalação sem aquele efeito. */
  constructor(indisponiveis = []) {
    this.filhos = [];
    this.indisponiveis = indisponiveis;
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  canAddProperty(matchName) {
    return !this.indisponiveis.includes(matchName) && Object.prototype.hasOwnProperty.call(PARAMS, matchName);
  }
  addProperty(matchName) {
    if (!this.canAddProperty(matchName)) throw new Error(`efeito indisponivel: ${matchName}`);
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
    this.adjustmentLayer = opcoes.adjustmentLayer ?? false;
    this.inPoint = 0;
    this.outPoint = 5;
    this.removido = false;
    this.comment = opcoes.comment ?? "";
    this.locked = opcoes.locked ?? false;
    this.nullLayer = opcoes.nullLayer ?? false;
    this.selected = false;
    this.position = new FakeProperty("ADBE Position", opcoes.position ?? [960, 540]);
    this.efeitos = new FakeParade(opcoes.indisponiveis ?? []);
    this.transform = { property: (n) => (n === "ADBE Position" ? this.position : null) };
    this.duplicadas = 0;
    this.comp = opcoes.comp ?? null;
  }
  property(matchName) {
    if (matchName === "ADBE Transform Group") return this.transform;
    if (matchName === "ADBE Effect Parade") return this.efeitos;
    return null;
  }
  duplicate() {
    this.duplicadas += 1;
    const copia = new FakeLayer({ name: `${this.name} ${this.duplicadas}`, index: 99, comp: this.comp });
    copia.position.value = clone(this.position.value);
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
  constructor(layers = [], opcoes = {}) {
    this.todas = layers;
    for (const l of layers) l.comp = this;
    // O host devolve um array novo a cada leitura; compartilhar a referencia
    // com `todas` faria o fake mentir sobre isso.
    for (const layer of opcoes.selecionadas ?? layers) layer.selected = true;
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = opcoes.duration ?? 2;
    this.width = 1920;
    this.height = 1080;
    this.pixelAspect = 1.25;
    this.sources = [];
    this.time = opcoes.time ?? 0;
    this.layers = {
      addSolid: (color, name, width, height, pixelAspect, duration) => {
        for (const layer of this.todas) layer.selected = false;
        for (const property of this.selectedProperties) property.selected = false;
        const n = new FakeLayer({ name, comp: this });
        n.selected = true;
        n.source = {
          color, width, height, pixelAspect, duration,
          get usedIn() { return n.removido ? [] : [n.comp]; },
          remove: () => this.sources.splice(this.sources.indexOf(n.source), 1)
        };
        this.sources.push(n.source);
        this.todas.unshift(n);
        return n;
      },
      addNull: () => {
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1, comp: this });
        this.todas.push(n);
        return n;
      }
    };
  }
  get selectedLayers() { return this.todas.filter((layer) => layer.selected); }
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
    effects: [{ matchName: "CHMS Motion Core" }],
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
      "src/effect-operations.jsx",
      ...files,
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase
    }
  );
  return { scope, comp, calls, app };
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

const CONSENTIDO = { allowDestructive: true };
const WAVE = ["src/commands/effect-wave.jsx"];
const TILE = ["src/commands/effect-tile.jsx"];
const GLITCH = ["src/rig-meta.jsx", "src/commands/effect-glitch.jsx"];

const waveArgs = {
  mode: "transform",
  amplitude: 50,
  frequency: 2,
  speed: 1,
  direction: "vertical",
  phase: 0,
  falloff: 0,
  bake: false
};

/* ------------------------------------------------------------------ Wave */

test("amplitude zero devolve exatamente a aparencia original", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]), WAVE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, amplitude: 0 })));

  assert.equal(resposta.ok, true);
  // `add(value, [0, 0])` é `value`: nenhum arredondamento entra no caminho.
  assert.ok(camada.position.expression.includes("var amp = 0;"));
  assert.ok(camada.position.expression.includes("add(value, horizontal ? [deslocamento, 0] : [0, deslocamento]);"));
});

test("o falloff atenua a amplitude a cada camada seguinte", async () => {
  const a = new FakeLayer({ name: "A", index: 1 });
  const b = new FakeLayer({ name: "B", index: 2 });
  const c = new FakeLayer({ name: "C", index: 3 });
  const { scope } = await fixture(new FakeCompItem([a, b, c]), WAVE);

  scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, amplitude: 100, falloff: 0.5 }));

  assert.ok(a.position.expression.includes("var amp = 100;"));
  assert.ok(b.position.expression.includes("var amp = 50;"));
  assert.ok(c.position.expression.includes("var amp = 25;"));
});

test("bake troca a expressao por keyframes com os valores avaliados", async () => {
  const camada = new FakeLayer({ name: "A" });
  camada.position.avaliador = (t) => [t * 3, t * 7];
  const comp = new FakeCompItem([camada], { duration: 0.2 });
  const { scope } = await fixture(comp, WAVE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, bake: true })));

  assert.equal(resposta.ok, true);
  assert.equal(camada.position.expression, "");
  assert.equal(camada.position.numKeys, 6);
  for (const k of camada.position.keys) assert.deepEqual(k.value, [k.time * 3, k.time * 7]);
});

test("assar no modo efeito e recusado, porque nao ha expressao para assar", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope, calls } = await fixture(new FakeCompItem([camada]), WAVE);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, mode: "effect", bake: true }))
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.details.field, "bake");
  assert.deepEqual(calls, []);
});

test("sem o Moti.on Wave instalado o modo efeito recusa, e nao cai calado para transform", async () => {
  const camada = new FakeLayer({ name: "A", indisponiveis: ["CHMS Wave Core"] });
  const { scope, calls } = await fixture(new FakeCompItem([camada]), WAVE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, mode: "effect" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
  // Trocar o resultado visual sem avisar seria pior do que recusar.
  assert.equal(camada.position.expression, "");
  assert.deepEqual(calls, []);
});

test("Wave native maps wavelength, direction, phase and reuses the same effect", async () => {
  const layer = new FakeLayer();
  const { scope } = await fixture(new FakeCompItem([layer]), WAVE);
  const send = (overrides) => JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, mode: "effect", frequency: 40, phase: 135, ...overrides })));
  assert.equal(send({}).ok, true);
  const effect = layer.efeitos.filhos[0];
  const values = () => Object.values(effect.props).map((p) => p.value);
  assert.deepEqual(values(), [50, 40, 90, 1, 135]);
  assert.equal(send({ amplitude: -1, direction: "horizontal", speed: -2, phase: -45 }).ok, true);
  assert.equal(layer.efeitos.filhos.length, 1);
  assert.equal(layer.efeitos.filhos[0], effect);
  assert.deepEqual(values(), [-1, 40, 0, -2, -45]);
});

test("Wave rejects zero wavelength, locked layers, old rigs and manual animation before Undo", async () => {
  for (const kind of ["zero", "locked", "legacy", "keys", "expression", "old-core"]) {
    const layer = new FakeLayer({ locked: kind === "locked" });
    if (kind === "legacy") layer.efeitos.addProperty("ADBE Wave Warp").name = "MOTION | WAVE";
    if (["keys", "expression", "old-core"].includes(kind)) {
      const effect = layer.efeitos.addProperty("CHMS Wave Core");
      effect.name = "MOTION | WAVE";
      if (kind === "keys") effect.props["CHMS Wave Core-1001"].setValueAtTime(0, 70);
      if (kind === "expression") effect.props["CHMS Wave Core-1001"].expression = "value + 10";
      if (kind === "old-core") delete effect.props["CHMS Wave Core-1005"];
    }
    const count = layer.efeitos.filhos.length;
    const { scope, calls } = await fixture(new FakeCompItem([layer]), WAVE);
    const result = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, mode: "effect", frequency: kind === "zero" ? 0 : 40 })));
    assert.equal(result.ok, false, kind);
    assert.deepEqual(calls, [], kind);
    assert.equal(layer.efeitos.filhos.length, count, kind);
    if (kind === "keys") assert.equal(layer.efeitos.filhos[0].props["CHMS Wave Core-1001"].numKeys, 1);
    if (kind === "expression") assert.equal(layer.efeitos.filhos[0].props["CHMS Wave Core-1001"].expression, "value + 10");
  }
});

/* ------------------------------------------------------------------ Tile */

const tileArgs = {
  mode: "effect",
  outputWidth: 200,
  outputHeight: 200,
  mirrorEdges: true,
  gridRows: 2,
  gridColumns: 2,
  spacing: 100
};

test("Motion Tile grava a saida pedida e espelha a borda", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope, calls } = await fixture(new FakeCompItem([camada]), TILE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.tile", tileArgs, CONSENTIDO)));

  assert.equal(resposta.ok, true);
  const tile = camada.efeitos.property(1);
  assert.equal(tile.name, "MOTION | TILE");
  assert.equal(tile.property("ADBE Tile-0004").value, 200);
  assert.equal(tile.property("ADBE Tile-0005").value, 200);
  // Espelhar a borda é o que evita a emenda quando a saída cresce.
  assert.equal(tile.property("ADBE Tile-0006").value, 1);
  assert.deepEqual(calls, [["begin", "Moti.on: repetir camadas"], ["end"]]);
});

test("reaplicar ajusta o Motion Tile gerenciado sem empilhar outro", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]), TILE);

  scope.MotionAE.dispatch(request("ae.effect.tile", tileArgs, CONSENTIDO));
  scope.MotionAE.dispatch(request("ae.effect.tile", { ...tileArgs, outputWidth: 400 }, CONSENTIDO));

  assert.equal(camada.efeitos.numProperties, 1);
  assert.equal(camada.efeitos.property(1).property("ADBE Tile-0004").value, 400);
});

test("o modo grade cria as duplicatas menos a celula original", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, TILE);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      request("ae.effect.tile", { ...tileArgs, mode: "grid", gridRows: 2, gridColumns: 3 }, CONSENTIDO)
    )
  );

  assert.equal(resposta.ok, true);
  // 2x3 = 6 células; a (0,0) é a própria camada, então 5 duplicatas.
  assert.equal(resposta.data.appliedCount, 5);
  assert.equal(camada.duplicadas, 5);
  const controller = comp.todas.find((l) => l.name === "MOTION | TILE GRID");
  assert.ok(controller);
  assert.equal(camada.parent, controller);
});

test("Motion Tile do usuario e preservado", async () => {
  const camada = new FakeLayer({ name: "A" });
  const doUsuario = new FakeEffect("ADBE Tile", "Meu tile", camada.efeitos);
  doUsuario.property("ADBE Tile-0004").value = 777;
  camada.efeitos.filhos.push(doUsuario);
  const { scope, calls } = await fixture(new FakeCompItem([camada]), TILE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.tile", tileArgs, CONSENTIDO)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "TRACK_CONFLICT");
  assert.equal(doUsuario.property("ADBE Tile-0004").value, 777);
  assert.deepEqual(calls, []);
});

test("grade grande demais e recusada antes de criar camada nenhuma", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp, TILE);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      request("ae.effect.tile", { ...tileArgs, mode: "grid", gridRows: 100, gridColumns: 100 }, CONSENTIDO)
    )
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(camada.duplicadas, 0);
});

/* ---------------------------------------------------------------- Glitch */

const glitchArgs = {
  mode: "continuous",
  intensity: 0.8,
  frequency: 12,
  rgbSplit: 20,
  displacement: 60,
  frameHold: false,
  seed: 7,
  durationFrames: 12
};

const controllerOf = (comp) => comp.todas.find((layer) => layer.comment.includes('"rigType":"glitchNative"'));
const engineOf = (controller) => controller.efeitos.property("CHMS Motion Core");
const sendGlitch = (scope, args = glitchArgs) => JSON.parse(scope.MotionAE.dispatch(request("ae.effect.glitch", args)));

test("Glitch cria solid do tamanho da composicao, adjustment e controles C++ completos em um Undo", async () => {
  const camada = new FakeLayer({ name: "Conteudo" });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, GLITCH);
  const resposta = sendGlitch(scope);
  assert.equal(resposta.ok, true);
  const controller = controllerOf(comp);
  assert.ok(controller);
  assert.equal(controller.adjustmentLayer, true);
  assert.equal(controller.source.width, comp.width);
  assert.equal(controller.source.height, comp.height);
  assert.equal(controller.source.pixelAspect, comp.pixelAspect);
  assert.equal(controller.inPoint, 0);
  assert.equal(controller.outPoint, comp.duration);
  assert.equal(comp.todas[0], controller, "o adjustment cobre o conteudo abaixo");
  assert.equal(resposta.data.effectCount, 1);
  assert.equal(resposta.data.controllerCreated, true);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar glitch"], ["end"]]);
  const engine = engineOf(controller);
  assert.deepEqual(Object.values(engine.props).map((prop) => prop.value), [80, 20, 12, 60, 7]);
});

test("Glitch detecta core ausente antes de criar layer ou abrir Undo, inclusive comp vazia", async () => {
  for (const layers of [[], [new FakeLayer()]]) {
    const comp = new FakeCompItem(layers);
    const { scope, calls, app } = await fixture(comp, GLITCH);
    app.effects = [];
    const resposta = sendGlitch(scope);
    assert.equal(resposta.ok, false);
    assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
    assert.equal(resposta.error.details.effect, "CHMS Motion Core");
    assert.equal(comp.numLayers, layers.length);
    assert.equal(comp.sources.length, 0);
    assert.deepEqual(calls, []);
  }
});

test("Glitch rejeita falso positivo do catalogo quando canAddProperty recusa", async () => {
  const comp = new FakeCompItem([new FakeLayer({ indisponiveis: ["CHMS Motion Core"] })]);
  const { scope, calls } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope).error.code, "CAPABILITY_UNAVAILABLE");
  assert.equal(comp.numLayers, 1);
  assert.deepEqual(calls, []);
});

test("Glitch funciona numa composicao vazia com core disponivel", async () => {
  const comp = new FakeCompItem();
  const { scope } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope).ok, true);
  assert.equal(comp.numLayers, 1);
});

test("Glitch atualiza engine in-place por metadata, preserva nome e efeitos alheios inclusive MOTION", async () => {
  const comp = new FakeCompItem([new FakeLayer()]);
  const { scope } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope).ok, true);
  const controller = controllerOf(comp);
  const engine = engineOf(controller);
  controller.name = "Meu glitch";
  controller.comment = "Notas antes\n" + controller.comment + "\nNotas depois";
  const user = new FakeEffect("ADBE Noise", "MOTION | Efeito alheio", controller.efeitos);
  controller.efeitos.filhos.push(user);
  const response = sendGlitch(scope, { ...glitchArgs, intensity: 0.405, rgbSplit: 20.7, frequency: 3.5, displacement: 12.25 });
  assert.equal(response.ok, true);
  assert.equal(response.data.controllerCreated, false);
  assert.equal(comp.numLayers, 2);
  assert.equal(engineOf(controller), engine);
  assert.equal(controller.efeitos.filhos[1], user);
  assert.equal(controller.efeitos.numProperties, 2);
  assert.equal(controller.name, "Meu glitch");
  assert.ok(controller.comment.startsWith("Notas antes\n"));
  assert.ok(controller.comment.endsWith("\nNotas depois"));
  assert.deepEqual(Object.values(engine.props).map((prop) => prop.value), [41, 21, 3.5, 12.25, 7]);
});

test("Glitch preserva keyframes e expressoes manuais dos controles nativos", async () => {
  const comp = new FakeCompItem([new FakeLayer()]);
  const { scope } = await fixture(comp, GLITCH);
  sendGlitch(scope);
  const engine = engineOf(controllerOf(comp));
  const intensity = engine.property("CHMS Motion Core-0001");
  intensity.setValueAtTime(0, 10);
  intensity.setValueAtTime(1, 90);
  const split = engine.property("CHMS Motion Core-0002");
  split.expression = "wiggle(3, 5)";
  split.expressionEnabled = false;
  const response = sendGlitch(scope, { ...glitchArgs, intensity: 0.2, rgbSplit: 15, frequency: 9 });
  assert.equal(response.ok, true);
  assert.deepEqual(intensity.keys, [{ time: 0, value: 10 }, { time: 1, value: 90 }]);
  assert.equal(split.expression, "wiggle(3, 5)");
  assert.equal(split.expressionEnabled, false);
  assert.equal(engine.property("CHMS Motion Core-0003").value, 9);
  assert.deepEqual(response.warnings.map((warning) => warning.details.field), ["intensity", "rgbSplit"]);
});

test("Glitch limita oneShot ao fim da comp e continuous restaura a janela inteira", async () => {
  const comp = new FakeCompItem([new FakeLayer()], { time: 1.8 });
  const { scope } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope, { ...glitchArgs, mode: "oneShot", durationFrames: 25 }).ok, true);
  const controller = controllerOf(comp);
  assert.equal(controller.inPoint, 1.8);
  assert.equal(controller.outPoint, 2);
  assert.equal(sendGlitch(scope).ok, true);
  assert.equal(controller.inPoint, 0);
  assert.equal(controller.outPoint, 2);
});

test("Glitch preserva selecao de camadas/propriedades e CTI", async () => {
  const selected = new FakeLayer();
  const unselected = new FakeLayer();
  const comp = new FakeCompItem([selected, unselected], { selecionadas: [selected], time: 0.6 });
  selected.position.selected = true;
  comp.selectedProperties = [selected.position];
  const { scope } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope).ok, true);
  assert.deepEqual(comp.selectedLayers, [selected]);
  assert.equal(selected.position.selected, true);
  assert.equal(comp.time, 0.6);
});

test("Glitch falha ao criar o efeito e remove solid/fonte sem afetar selecao e Undo", async () => {
  const layer = new FakeLayer();
  const comp = new FakeCompItem([layer], { time: 0.6 });
  const { scope, calls } = await fixture(comp, GLITCH);
  const addSolid = comp.layers.addSolid;
  comp.layers.addSolid = (...args) => {
    const n = addSolid(...args);
    n.efeitos.addProperty = () => { throw new Error("falha de instancia"); };
    return n;
  };
  const response = sendGlitch(scope);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(comp.numLayers, 1);
  assert.equal(comp.sources.length, 0);
  assert.deepEqual(comp.selectedLayers, [layer]);
  assert.equal(comp.time, 0.6);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar glitch"], ["end"]]);
});

test("Glitch restaura parametros e timing se Adjust falhar no meio", async () => {
  const comp = new FakeCompItem([new FakeLayer()], { time: 0.4 });
  const { scope } = await fixture(comp, GLITCH);
  sendGlitch(scope, { ...glitchArgs, mode: "oneShot" });
  const controller = controllerOf(comp);
  const engine = engineOf(controller);
  const before = Object.values(engine.props).map((prop) => prop.value);
  const comment = controller.comment;
  const prop = engine.property("CHMS Motion Core-0003");
  const originalSet = prop.setValue.bind(prop);
  let fail = true;
  prop.setValue = (v) => { if (fail) { fail = false; throw new Error("falha de escrita"); } originalSet(v); };
  const response = sendGlitch(scope, { ...glitchArgs, intensity: 0.1, rgbSplit: 5 });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(Object.values(engine.props).map((p) => p.value), before);
  assert.equal(controller.inPoint, 0.4);
  assert.equal(controller.outPoint, 0.4 + 12 / 25);
  assert.equal(controller.comment, comment);
  assert.equal(controller.efeitos.numProperties, 1);
});

test("Glitch recusa null legado, controller bloqueado e plugin antigo sem mutacao", async () => {
  for (const kind of ["null", "locked", "oldPlugin"]) {
    const comp = new FakeCompItem([new FakeLayer()]);
    const { scope, calls } = await fixture(comp, GLITCH);
    sendGlitch(scope);
    const controller = controllerOf(comp);
    if (kind === "null") { controller.nullLayer = true; controller.comment = ""; }
    if (kind === "locked") controller.locked = true;
    if (kind === "oldPlugin") delete engineOf(controller).props["CHMS Motion Core-0003"];
    calls.length = 0;
    const response = sendGlitch(scope);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, kind === "oldPlugin" ? "CAPABILITY_UNAVAILABLE" : "TRACK_CONFLICT");
    assert.equal(comp.numLayers, 2);
    assert.deepEqual(calls, []);
  }
});

test("Glitch nao assume propriedade de camada alheia com o mesmo nome", async () => {
  const user = new FakeLayer({ name: "MOTION | GLITCH_CORE" });
  user.efeitos.filhos.push(new FakeEffect("ADBE Noise", "MOTION | Noise", user.efeitos));
  const comp = new FakeCompItem([user]);
  const { scope } = await fixture(comp, GLITCH);
  assert.equal(sendGlitch(scope).ok, true);
  assert.equal(comp.numLayers, 2);
  assert.equal(user.efeitos.numProperties, 1);
  assert.equal(user.adjustmentLayer, false);
});

test("Glitch remover camada do rig nao remove conteudo nem outra adjustment layer", async () => {
  const content = new FakeLayer();
  const userAdjustment = new FakeLayer({ adjustmentLayer: true });
  const comp = new FakeCompItem([content, userAdjustment]);
  const { scope } = await fixture(comp, GLITCH);
  sendGlitch(scope);
  controllerOf(comp).remove();
  assert.deepEqual(comp.todas, [content, userAdjustment]);
});

test("Glitch valida todos inputs e recusa frameHold nao implementado antes de Undo", async () => {
  const invalid = [
    { intensity: -0.1 }, { intensity: "0.5" }, { frequency: -1 }, { frequency: 121 },
    { rgbSplit: 201 }, { displacement: 2001 }, { seed: -1 }, { seed: 1.5 },
    { seed: 1000001 }, { durationFrames: 0 }, { durationFrames: 1.5 },
    { durationFrames: 10001 }, { frameHold: "false" }, { mode: "auto" }, { unknown: true }
  ];
  for (const override of invalid) {
    const comp = new FakeCompItem([new FakeLayer()]);
    const { scope, calls } = await fixture(comp, GLITCH);
    const response = sendGlitch(scope, { ...glitchArgs, ...override });
    assert.equal(response.ok, false, JSON.stringify(override));
    assert.equal(response.error.code, "INVALID_PRESET");
    assert.equal(comp.numLayers, 1);
    assert.deepEqual(calls, []);
  }
  const { scope, calls } = await fixture(new FakeCompItem(), GLITCH);
  assert.equal(sendGlitch(scope, { ...glitchArgs, frameHold: true }).error.code, "CAPABILITY_UNAVAILABLE");
  assert.deepEqual(calls, []);
});


test("Glitch recusa o stack legado sem aplicar core por cima nem apagar efeitos", async () => {
  const old = new FakeLayer({ name: "MOTION | GLITCH", nullLayer: true, adjustmentLayer: true });
  const oldEffect = new FakeEffect("ADBE Channel Blur", "MOTION | ADBE Channel Blur", old.efeitos);
  old.efeitos.filhos.push(oldEffect);
  const comp = new FakeCompItem([new FakeLayer(), old]);
  const { scope, calls } = await fixture(comp, GLITCH);
  const response = sendGlitch(scope);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "TRACK_CONFLICT");
  assert.equal(response.error.details.reason, "legacyEffectStack");
  assert.equal(comp.numLayers, 2);
  assert.equal(old.efeitos.filhos[0], oldEffect);
  assert.deepEqual(calls, []);
});

test('Tile grid reapplies, resizes and survives renaming without duplication or selection drift', async () => {
  const layer = new FakeLayer({name:'Source', position:[123, 234], comment:'User notes'});
  const comp = new FakeCompItem([layer], {time: 0.75});
  const {scope} = await fixture(comp, TILE);
  const apply = (extra={}) => JSON.parse(scope.MotionAE.dispatch(request('ae.effect.tile', {...tileArgs, mode:'grid', ...extra}, CONSENTIDO)));
  assert.equal(apply().ok, true);
  const controller = layer.parent;
  controller.name = 'User renamed controller';
  assert.equal(comp.numLayers, 5);
  assert.deepEqual(comp.selectedLayers, [layer]);
  assert.equal(apply({spacing:50}).ok, true);
  assert.equal(comp.numLayers, 5);
  assert.deepEqual(layer.position.value, [123,234]);
  const right = comp.todas.find(l=>l.comment.indexOf('[MOTION_TILE_CELL_V1]0,1')>=0);
  assert.deepEqual(right.position.value, [173,234]);
  assert.equal(apply({gridColumns:3}).ok, true);
  assert.equal(comp.numLayers, 7);
  assert.equal(apply({gridRows:1, gridColumns:2}).ok, true);
  assert.equal(comp.numLayers, 3);
  assert.equal(layer.parent, controller);
  assert.match(layer.comment, /^User notes\n/);
  assert.equal(comp.time, 0.75);
});

test('Tile grid failure restores original parenting, position, comments and removes all created layers', async () => {
  const first = new FakeLayer({name:'First', comment:'User comment', position:[45,67]});
  const second = new FakeLayer({name:'Second'});
  const comp = new FakeCompItem([first,second]);
  second.duplicate = () => {throw new Error('host failure');};
  const {scope} = await fixture(comp, TILE);
  const result = JSON.parse(scope.MotionAE.dispatch(request('ae.effect.tile', {...tileArgs,mode:'grid'}, CONSENTIDO)));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'HOST_OPERATION_FAILED');
  assert.equal(comp.numLayers, 2);
  assert.equal(first.parent, null);
  assert.deepEqual(first.position.value,[45,67]);
  assert.equal(first.comment,'User comment');
  assert.equal(second.parent,null);
  assert.deepEqual(comp.selectedLayers,[first,second]);
});

test('Tile preflight protects manual animation, parents, 3D and separated dimensions', async () => {
  for (const mode of ['locked','keys','expression','parent','3d','separated']) {
    const layer = new FakeLayer();
    if(mode==='locked') layer.locked=true;
    if(mode==='keys') layer.position.setValueAtTime(0,[1,2]);
    if(mode==='expression') layer.position.expression='value';
    if(mode==='parent') layer.parent=new FakeLayer();
    if(mode==='3d') layer.threeDLayer=true;
    if(mode==='separated') layer.position.dimensionsSeparated=true;
    const comp = new FakeCompItem([layer]);
    const {scope,calls} = await fixture(comp,TILE);
    const result=JSON.parse(scope.MotionAE.dispatch(request('ae.effect.tile',{...tileArgs,mode:'grid'},CONSENTIDO)));
    assert.equal(result.ok,false,mode);
    assert.deepEqual(calls,[],mode);
    assert.equal(comp.numLayers,1);
  }
});

test('Tile effect preserves user keys on repeated Apply', async () => {
  const layer=new FakeLayer();
  const {scope,calls}=await fixture(new FakeCompItem([layer]),TILE);
  scope.MotionAE.dispatch(request('ae.effect.tile',tileArgs,CONSENTIDO));
  const prop=layer.efeitos.property(1).property('ADBE Tile-0004');
  prop.setValueAtTime(0,150);
  calls.length=0;
  const response=JSON.parse(scope.MotionAE.dispatch(request('ae.effect.tile',{...tileArgs,outputWidth:300},CONSENTIDO)));
  assert.equal(response.error.code,'KEYFRAME_CONFLICT');
  assert.deepEqual(calls,[]);
  assert.equal(prop.keys[0].value,150);
});

