/**
 * Effector (`ae.rig.effector`).
 *
 * O critério de aceite tem duas metades: dentro do raio a influência segue a
 * curva, e **fora do raio a propriedade volta exatamente ao valor base**. A
 * segunda é a que importa — um effector que deixa resíduo fora do raio contamina
 * a composição inteira sem o usuário perceber.
 *
 * Para medi-las, a fórmula de influência é extraída do próprio template e
 * executada aqui. Copiar a fórmula para o teste faria ele concordar com uma
 * expressão que já divergiu.
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
    this.propertyValueType = PropertyValueType.TwoD_SPATIAL;
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
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
}

class FakeEffect {
  constructor(matchName, nome, lista) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.lista = lista ?? null;
    this.props = { "ADBE Slider Control-0001": new FakeProperty("ADBE Slider Control-0001", 0) };
  }
  property(chave) {
    return this.props[chave] ?? null;
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
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  canAddProperty() {
    return true;
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
    this.comment = "";
    this.removido = false;
    this.comp = opcoes.comp ?? null;
    this.position = new FakeProperty("ADBE Position", [960, 540]);
    this.scale = new FakeProperty("ADBE Scale", [100, 100]);
    this.rotation = new FakeProperty("ADBE Rotate Z", 0);
    this.opacity = new FakeProperty("ADBE Opacity", 100);
    this.efeitos = new FakeParade();
    this.transform = {
      property: (n) => {
        if (n === "ADBE Position") return this.position;
        if (n === "ADBE Scale") return this.scale;
        if (n === "ADBE Rotate Z") return this.rotation;
        if (n === "ADBE Opacity") return this.opacity;
        return null;
      }
    };
  }
  property(matchName) {
    if (matchName === "ADBE Transform Group") return this.transform;
    if (matchName === "ADBE Effect Parade") return this.efeitos;
    return null;
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
      "src/expression-templates.jsx",
      "src/keyframe-operations.jsx",
      "src/effect-operations.jsx",
      "src/rig-meta.jsx",
      "src/commands/rig-effector.jsx",
      "src/dispatch.jsx"
    ],
    { app, CompItem: FakeCompItem, Property: FakeProperty, PropertyType, PropertyValueType }
  );
  return { scope, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "eff-1",
    command: "ae.rig.effector",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const baseArgs = {
  effectorType: "null",
  radius: 400,
  falloffCurve: "linear",
  curve: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 },
  positionAmount: 200,
  scaleAmount: 0,
  rotationAmount: 0,
  opacityAmount: 0
};

/**
 * Extrai a fórmula de influência da expressão gerada e a torna chamável.
 *
 * Ler do template, e não reescrever a conta aqui, é o que faz o teste medir o
 * que o plugin realmente aplica.
 */
function avaliadorDeInfluencia(expressao) {
  const inicio = expressao.indexOf("var t = raio > 0");
  const fim = expressao.indexOf("var dir =");
  assert.ok(inicio >= 0 && fim > inicio, "o trecho de influencia nao foi encontrado");
  const corpo = expressao.slice(inicio, fim);

  const declaracoes = expressao.slice(0, expressao.indexOf("var ctrl ="));
  const curvaTipo = /var curva = (\d);/.exec(declaracoes)[1];
  const cx1 = Number(/var cx1 = ([-\d.]+);/.exec(declaracoes)[1]);
  const cy1 = Number(/var cy1 = ([-\d.]+);/.exec(declaracoes)[1]);
  const cx2 = Number(/var cx2 = ([-\d.]+);/.exec(declaracoes)[1]);
  const cy2 = Number(/var cy2 = ([-\d.]+);/.exec(declaracoes)[1]);

  // `new Function` restrito ao teste: a fonte vem do próprio repositório.
  const fabrica = new Function(
    "d",
    "raio",
    `var curva = ${curvaTipo}; var cx1 = ${cx1}; var cy1 = ${cy1}; var cx2 = ${cx2}; var cy2 = ${cy2};\n${corpo}\nreturn f;`
  );
  return fabrica;
}

test("fora do raio a influencia e exatamente zero", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]));

  scope.MotionAE.dispatch(request(baseArgs));
  const f = avaliadorDeInfluencia(camada.position.expression);

  // Na borda e além dela: zero exato, sem resíduo. Um effector que deixa
  // resíduo fora do raio contamina a composição inteira em silêncio.
  for (const d of [400, 400.0001, 500, 5000]) {
    assert.equal(f(d, 400), 0, `em d=${d} a influencia deveria ser zero`);
  }
});

test("no centro a influencia e maxima, e cresce monotonicamente em direcao a ele", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]));

  scope.MotionAE.dispatch(request(baseArgs));
  const f = avaliadorDeInfluencia(camada.position.expression);

  assert.equal(f(0, 400), 1);
  let anterior = f(400, 400);
  for (const d of [350, 300, 200, 100, 50, 0]) {
    const atual = f(d, 400);
    assert.ok(atual >= anterior, `a influencia caiu ao aproximar: d=${d}`);
    anterior = atual;
  }
});

test("smoothstep e achatada nas pontas, e a linear nao", async () => {
  const linear = new FakeLayer({ name: "A" });
  const suave = new FakeLayer({ name: "B" });

  const a = await fixture(new FakeCompItem([linear]));
  a.scope.MotionAE.dispatch(request({ ...baseArgs, falloffCurve: "linear" }));
  const fLinear = avaliadorDeInfluencia(linear.position.expression);

  const b = await fixture(new FakeCompItem([suave]));
  b.scope.MotionAE.dispatch(request({ ...baseArgs, falloffCurve: "smoothstep" }));
  const fSuave = avaliadorDeInfluencia(suave.position.expression);

  // Na metade do raio as duas valem 0,5; perto das pontas a smoothstep é mais
  // suave, que é a diferença entre as duas curvas.
  assert.ok(Math.abs(fLinear(200, 400) - 0.5) < 1e-9);
  assert.ok(Math.abs(fSuave(200, 400) - 0.5) < 1e-9);
  assert.ok(fSuave(360, 400) < fLinear(360, 400), "perto da borda a smoothstep cai mais rapido");
  // E as duas continuam zerando exatamente na borda.
  assert.equal(fSuave(400, 400), 0);
});

test("a curva Bezier customizada tambem zera na borda e satura no centro", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]));

  scope.MotionAE.dispatch(
    request({ ...baseArgs, falloffCurve: "bezier", curve: { x1: 0.9, y1: 0.1, x2: 0.1, y2: 0.9 } })
  );
  const f = avaliadorDeInfluencia(camada.position.expression);

  // A bisseccao tem precisão melhor que 1e-6 em x depois de vinte passos.
  assert.ok(Math.abs(f(400, 400)) < 1e-6, `na borda deu ${f(400, 400)}`);
  assert.ok(Math.abs(f(0, 400) - 1) < 1e-6, `no centro deu ${f(0, 400)}`);
});

test("o controller nasce com sliders, e nao com valores assados", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, radius: 750 })));

  assert.equal(resposta.ok, true);
  const controller = comp.todas.find((l) => l.name === "MOTION | EFFECTOR");
  assert.ok(controller);
  // Cinco sliders: raio e as quatro intensidades. É o que deixa o usuário
  // ajustar e animar sem rodar o comando de novo.
  assert.equal(controller.efeitos.numProperties, 5);
  const raio = controller.efeitos.filhos.find((e) => e.name === "Raio");
  assert.equal(raio.property("ADBE Slider Control-0001").value, 750);
  assert.deepEqual(calls, [["begin", "Moti.on: aplicar effector"], ["end"]]);
});

test("a expressao le o slider, e nao um numero fixo", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]));

  scope.MotionAE.dispatch(request({ ...baseArgs, radius: 750 }));

  const expr = camada.position.expression;
  assert.ok(expr.includes('var nomeRaio = "Raio";'));
  assert.ok(expr.includes("var raio = ctrl.effect(nomeRaio)(1);"));
  assert.ok(!expr.includes("750"), "o raio nao pode estar assado na expressao");
});

test("so as propriedades com intensidade recebem expressao", async () => {
  const camada = new FakeLayer({ name: "A" });
  const { scope } = await fixture(new FakeCompItem([camada]));

  scope.MotionAE.dispatch(
    request({ ...baseArgs, positionAmount: 0, scaleAmount: 50, rotationAmount: 0, opacityAmount: -40 })
  );

  assert.equal(camada.position.expression, "", "sem intensidade, sem expressao");
  assert.equal(camada.rotation.expression, "");
  assert.ok(camada.scale.expression.includes("mul(value, 1 + (quantia / 100) * f);"));
  assert.ok(camada.opacity.expression.includes("Math.max(0, Math.min(100, value + quantia * f));"));
});

test("todas as intensidades em zero e recusado, e nenhum controller e criado", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      request({ ...baseArgs, positionAmount: 0, scaleAmount: 0, rotationAmount: 0, opacityAmount: 0 })
    )
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(comp.numLayers, 1, "nenhum controller foi criado para nada");
  assert.deepEqual(calls, []);
});

test("expressao de usuario e preservada", async () => {
  const camada = new FakeLayer({ name: "A" });
  camada.position.expression = "wiggle(2, 30);";
  camada.position.expressionEnabled = true;
  const comp = new FakeCompItem([camada]);
  const { scope, calls } = await fixture(comp);

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "EXPRESSION_CONFLICT");
  assert.equal(camada.position.expression, "wiggle(2, 30);");
  assert.deepEqual(calls, []);
});

test("reaplicar reaproveita o controller existente", async () => {
  const camada = new FakeLayer({ name: "A" });
  const comp = new FakeCompItem([camada]);
  const { scope } = await fixture(comp);

  scope.MotionAE.dispatch(request(baseArgs));
  const antes = comp.numLayers;

  const segunda = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.controllerCreated, false);
  assert.equal(comp.numLayers, antes, "nenhum controller novo");
});
