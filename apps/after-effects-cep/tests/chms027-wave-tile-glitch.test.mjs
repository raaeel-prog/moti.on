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
  "ADBE Tile": ["ADBE Tile-0004", "ADBE Tile-0005", "ADBE Tile-0006"],
  "ADBE Geometry2": ["ADBE Geometry2-0004"],
  "ADBE Channel Blur": ["ADBE Channel Blur-0001", "ADBE Channel Blur-0003"],
  "ADBE Noise": ["ADBE Noise-0001"]
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
    this.selectedLayers = [...(opcoes.selecionadas ?? layers)];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = opcoes.duration ?? 2;
    this.width = 1920;
    this.height = 1080;
    this.time = opcoes.time ?? 0;
    this.layers = {
      addNull: () => {
        const n = new FakeLayer({ name: "Null 1", index: this.todas.length + 1, comp: this });
        this.todas.push(n);
        return n;
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
  return { scope, comp, calls };
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
const GLITCH = ["src/commands/effect-glitch.jsx"];

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

test("sem o Wave Warp instalado o modo efeito recusa, e nao cai calado para transform", async () => {
  const camada = new FakeLayer({ name: "A", indisponiveis: ["ADBE Wave Warp"] });
  const { scope, calls } = await fixture(new FakeCompItem([camada]), WAVE);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.wave", { ...waveArgs, mode: "effect" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
  // Trocar o resultado visual sem avisar seria pior do que recusar.
  assert.equal(camada.position.expression, "");
  assert.deepEqual(calls, []);
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

test("o glitch mora numa adjustment layer propria", async () => {
  const camada = new FakeLayer({ name: "Conteudo" });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp, GLITCH);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.glitch", glitchArgs)));

  assert.equal(resposta.ok, true);
  const controller = comp.todas.find((l) => l.name === "MOTION | GLITCH");
  assert.ok(controller, "esperava a adjustment layer do rig");
  // É o que permite zerar o efeito desligando o olho de uma camada só.
  assert.equal(controller.adjustmentLayer, true);
  assert.equal(resposta.data.effectCount, 3);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar glitch"], ["end"]]);
});

test("o deslocamento usa semente reproduzivel e trava o sorteio na frequencia", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Conteudo" })]);
  const { scope } = await fixture(comp, GLITCH);

  scope.MotionAE.dispatch(request("ae.effect.glitch", glitchArgs));

  const controller = comp.todas.find((l) => l.name === "MOTION | GLITCH");
  const deslocador = controller.efeitos.property("ADBE Geometry2");
  const expr = deslocador.property("ADBE Geometry2-0004").expression;
  // Sem posterizeTime o valor mudaria a cada frame e viraria tremor, não glitch.
  assert.ok(expr.includes("posterizeTime(freq);"));
  // Sem o segundo argumento em true a sequência não seria reproduzível.
  assert.ok(expr.includes("seedRandom(semente, true);"));
  assert.ok(expr.includes("var semente = 7;"));
});

test("efeito ausente na instalacao vira warning, e o glitch continua", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Conteudo" })]);
  const { scope } = await fixture(comp, GLITCH);
  // O null criado herda a lista de efeitos padrão; marcamos o ruído como ausente.
  const originalAddNull = comp.layers.addNull;
  comp.layers.addNull = () => {
    const n = originalAddNull();
    n.efeitos.indisponiveis = ["ADBE Noise"];
    return n;
  };

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.glitch", glitchArgs)));

  assert.equal(resposta.ok, true, "um glitch com dois dos tres efeitos ainda e um glitch");
  assert.equal(resposta.data.effectCount, 2);
  assert.equal(resposta.warnings.length, 1);
  assert.equal(resposta.warnings[0].code, "glitch.effectUnavailable");
});

test("reaplicar substitui os efeitos gerenciados sem tocar os do usuario", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Conteudo" })]);
  const { scope } = await fixture(comp, GLITCH);

  scope.MotionAE.dispatch(request("ae.effect.glitch", glitchArgs));
  const controller = comp.todas.find((l) => l.name === "MOTION | GLITCH");
  // Um efeito que o usuário aplicou por cima do rig.
  const doUsuario = new FakeEffect("ADBE Noise", "Meu ruido", controller.efeitos);
  controller.efeitos.filhos.push(doUsuario);
  const antes = controller.efeitos.numProperties;

  scope.MotionAE.dispatch(request("ae.effect.glitch", { ...glitchArgs, intensity: 0.4 }));

  assert.equal(controller.efeitos.numProperties, antes, "nem empilhou nem apagou o do usuario");
  assert.ok(
    controller.efeitos.filhos.some((e) => e.name === "Meu ruido"),
    "o efeito do usuario continua la"
  );
});

test("o modo one-shot limita o rig a janela pedida", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Conteudo" })], { time: 1 });
  const { scope } = await fixture(comp, GLITCH);

  scope.MotionAE.dispatch(request("ae.effect.glitch", { ...glitchArgs, mode: "oneShot", durationFrames: 25 }));

  const controller = comp.todas.find((l) => l.name === "MOTION | GLITCH");
  assert.equal(controller.inPoint, 1);
  assert.equal(controller.outPoint, 2, "um segundo a 25 fps");
});

test("nenhum efeito disponivel derruba o comando e remove a camada criada", async () => {
  const comp = new FakeCompItem([new FakeLayer({ name: "Conteudo" })]);
  const { scope } = await fixture(comp, GLITCH);
  const originalAddNull = comp.layers.addNull;
  comp.layers.addNull = () => {
    const n = originalAddNull();
    n.efeitos.indisponiveis = ["ADBE Geometry2", "ADBE Channel Blur", "ADBE Noise"];
    return n;
  };

  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.effect.glitch", glitchArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.equal(
    comp.todas.filter((l) => l.name === "MOTION | GLITCH").length,
    0,
    "a adjustment layer criada foi removida"
  );
});
