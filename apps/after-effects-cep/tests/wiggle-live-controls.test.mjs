/**
 * Wiggle com Live Controls: a corrente inteira, do `emitLiveControls` do
 * envelope até o slider no Effect Controls.
 *
 * É o comportamento que o produto vende — clicar e sair com um controle
 * ajustável dentro do After Effects, em vez de números cravados na expressão.
 * Três coisas precisam ser verdade ao mesmo tempo, e cada uma tem seu teste:
 *
 *  1. os controles nascem na camada dona da propriedade;
 *  2. a expressão aponta para o nome que o efeito **realmente** recebeu, e não
 *     para um nome cravado — que quebraria fora do português;
 *  3. se a escrita da expressão falhar depois, os controles criados somem
 *     junto, senão o Effect Controls fica com sliders órfãos.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./grouped-host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/effect-operations.jsx",
  "src/keyframe-operations.jsx",
  "src/expression-templates.jsx",
  "src/live-controls.jsx",
  "src/live-preset.jsx",
  "src/quick-effects.jsx",
  "src/commands/expression-wiggle.jsx",
  "src/dispatch.jsx"
];

const PropertyType = { PROPERTY: 1, GROUP: 2, INDEXED_GROUP: 3 };
const PropertyValueType = { OneD: 5, TwoD: 4, ThreeD: 2, COLOR: 6 };

/** Parâmetro de um Expression Control criado pelo host. */
class FakeParam {
  constructor() {
    this.value = 0;
    this.numKeys = 0;
    this.canSetExpression = false;
  }
  setValue(v) {
    this.value = v;
  }
  removeKey() {}
}

/** Um Expression Control dentro do Effect Controls. */
class FakeEffect {
  constructor(matchName, parade) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.parade = parade;
    this.param = new FakeParam();
    this.removido = false;
  }
  get propertyIndex() {
    return this.parade.filhos.indexOf(this) + 1;
  }
  get numProperties() {
    return 1;
  }
  property(chave) {
    // O host sempre lê o parâmetro por índice `(1)`, nunca pelo nome
    // localizado — é a regra que o próprio live-controls.jsx declara.
    return chave === 1 || chave === "ADBE Slider Control-0001" ? this.param : null;
  }
  remove() {
    this.removido = true;
    const i = this.parade.filhos.indexOf(this);
    if (i >= 0) this.parade.filhos.splice(i, 1);
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
    return this.filhos.find((f) => f.name === chave) ?? null;
  }
  canAddProperty() {
    return true;
  }
  addProperty(matchName) {
    const efeito = new FakeEffect(matchName, this);
    this.filhos.push(efeito);
    return efeito;
  }
}

class FakeLayer {
  constructor(nome = "Camada") {
    this.name = nome;
    this.parentProperty = null;
    this.efeitos = new FakeParade();
  }
  property(matchName) {
    return matchName === "ADBE Effect Parade" ? this.efeitos : null;
  }
  /** Nomes dos controles no Effect Controls, na ordem em que aparecem. */
  get controles() {
    return this.efeitos.filhos.map((f) => f.name);
  }
}

/** Propriedade selecionada, pendurada numa camada por `parentProperty`. */
class FakeProperty {
  constructor(camada, opcoes = {}) {
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canSetExpression = true;
    this.numKeys = 0;
    this.value = 100;
    this.name = "Rotation"; this.matchName = "ADBE Rotate Z";
    this.selected = true;
    this.expressionError = "";
    this._expression = opcoes.expression ?? "";
    this._expressionEnabled = false;
    this.rejeitar = opcoes.rejeitar ?? false;
    // O grupo Transform fica no meio do caminho, como no host real: o comando
    // precisa subir mais de um nível para achar a camada.
    this.parentProperty = { name: "Transform", parentProperty: camada };
  }
  get expression() {
    return this._expression;
  }
  set expression(value) {
    if (this.rejeitar && value !== "") {
      this.expressionError = "After Effects recusou";
      this._expression = value;
      return;
    }
    this._expression = value;
  }
  get expressionEnabled() {
    return this._expressionEnabled;
  }
  set expressionEnabled(value) {
    this._expressionEnabled = value;
  }
}

async function fixture(propriedades) {
  class FakeCompItem {
    constructor() {
      this.selectedProperties = propriedades;
      this.time = 0;
    }
  }
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  return loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    Property: FakeProperty,
    PropertyType,
    PropertyValueType
  });
}

function request(opcoes = {}) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "wiggle-live-1",
    command: "ae.expression.wiggle",
    args: {
      frequency: 2,
      amplitude: 30,
      octaves: 1,
      amplitudeMultiplier: 0.5,
      seed: 7,
      conflictMode: "skip"
    },
    context: { host: "after-effects", hostVersion: "26.3", locale: opcoes.locale ?? "pt_BR" },
    options: { mode: opcoes.mode ?? "advanced", emitLiveControls: opcoes.live ?? true }
  });
}

async function aplica(propriedades, opcoes = {}) {
  const scope = await fixture(propriedades);
  return JSON.parse(scope.MotionAE.dispatch(request(opcoes)));
}

test("clicar cria controles nativos por propriedade e liga a expressão", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const resposta = await aplica([propriedade]);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.controles.length, 1);
  assert.equal(camada.efeitos.filhos[0].numProperties, 7);
  assert.equal(camada.controles[0], "Moti.on · Wiggle");
  assert.equal(camada.efeitos.filhos[0].property(1).name, "Frequência");
  assert.equal(camada.efeitos.filhos[0].property(5).name, "Ativo");
  assert.match(propriedade.expression, /effect\("Moti\.on · Wiggle"\)\(1\)/);
  assert.match(propriedade.expression, /var w = wiggle\(f, a,/);
  assert.equal(propriedade.expressionEnabled, true);
});

test("os valores pedidos entram nos sliders, para o clique ja sair animado", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  await aplica([propriedade]);

  const valores = camada.efeitos.filhos[0].params.map((p) => p.value);
  assert.deepEqual(valores, [2, 30, 7, 100, 1, 1, 0.5], "parâmetros e controles de ativação");
});

test("o nome do controle acompanha o idioma, e a expressao acompanha o nome", async () => {
  // O defeito que este teste existe para impedir: uma versão anterior cravava
  // "Frequência" na expressão. Num After Effects em inglês o controle nasce
  // "Frequency" e a expressão apontava para um efeito inexistente.
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const resposta = await aplica([propriedade], { locale: "en_US" });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.ok(
    camada.efeitos.filhos[0].property(1).name === "Frequency",
    "o controle precisa nascer em inglês: " + camada.controles[0]
  );
  assert.match(propriedade.expression, /effect\("Moti\.on · Wiggle"\)\(1\)/);
  assert.ok(
    propriedade.expression.indexOf("Frequência") < 0,
    "a expressão não pode carregar o nome de outro idioma"
  );
});

test("duas propriedades da mesma camada mantêm controles independentes", async () => {
  // Selecionar Position e Rotation da mesma layer não pode produzir seis
  // sliders: seriam dois conjuntos concorrendo pela mesma animação.
  const camada = new FakeLayer();
  const a = new FakeProperty(camada);
  const b = new FakeProperty(camada);

  const resposta = await aplica([a, b]);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.controles.length, 2);
  assert.notEqual(a.expression, b.expression);
  assert.equal(new Set(camada.controles).size, 2);
});

test("camadas diferentes ganham conjuntos proprios", async () => {
  const camadaA = new FakeLayer("A");
  const camadaB = new FakeLayer("B");
  const a = new FakeProperty(camadaA);
  const b = new FakeProperty(camadaB);

  const resposta = await aplica([a, b]);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camadaA.controles.length, 1);
  assert.equal(camadaB.controles.length, 1);
});

test("expressao recusada pelo host leva os controles criados junto", async () => {
  // Sem isso o Effect Controls ficaria com três sliders órfãos que nenhuma
  // expressão lê, e o usuário teria que apagá-los à mão.
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada, { rejeitar: true });

  const resposta = await aplica([propriedade]);

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.deepEqual(camada.controles, [], "os controles precisam sumir no rollback");
  assert.equal(propriedade.expression, "", "a expressão volta ao que era");
});

test("sem emitLiveControls o comportamento antigo continua, com numeros cravados", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const resposta = await aplica([propriedade], { live: false });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(camada.controles, [], "nenhum controle sem o opt-in");
  assert.match(propriedade.expression, /wiggle\(2, 30, 1, 0\.5\)/);
});

test("reaplicar sobre a propria expressao viva nao e tratado como conflito", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const primeira = await aplica([propriedade]);
  assert.equal(primeira.ok, true, JSON.stringify(primeira));

  // Segunda passada: a expressão que já está lá é gerenciada, então o comando
  // precisa reconhecê-la em vez de recusar com EXPRESSION_CONFLICT.
  const segunda = await aplica([propriedade]);
  assert.notEqual(
    segunda.error?.code,
    "EXPRESSION_CONFLICT",
    "a própria expressão viva foi tratada como de terceiro"
  );
});


test("Quick reaplica preservando valor e animação dos controles", async () => {
  const layer = new FakeLayer(); const property = new FakeProperty(layer);
  await aplica([property], {mode: "quick"});
  const source = property.expression;
  layer.efeitos.filhos[0].property(2).value = 77; layer.efeitos.filhos[0].property(2).numKeys = 2;
  const result = await aplica([property], {mode: "quick"});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.appliedCount, 0); assert.equal(result.data.unchangedCount, 1);
  assert.equal(layer.controles.length, 1); assert.equal(layer.efeitos.filhos[0].property(2).value, 77);
  assert.equal(property.expression, source);
});

test("controle removido ou expressão alterada recusa sem efeitos auxiliares", async () => {
  const layer = new FakeLayer(); const property = new FakeProperty(layer);
  await aplica([property]); const original = property.expression;
  layer.efeitos.filhos[0].remove();
  let result = await aplica([property], {mode: "quick"});
  assert.equal(result.ok, false); assert.equal(result.error.code, "EXPRESSION_CONFLICT");
  assert.equal(layer.controles.length, 0); assert.equal(property.expression, original);
  property._expression += "\n// custom";
  result = await aplica([property]); assert.equal(result.ok, false);
  assert.equal(layer.controles.length, 0);
});

test("conflito em qualquer alvo recusa o lote antes de criar controles", async () => {
  const layer = new FakeLayer(); const a = new FakeProperty(layer); const b = new FakeProperty(layer, {expression: "value*2"});
  const result = await aplica([a,b]); assert.equal(result.ok, false);
  assert.equal(layer.controles.length, 0); assert.equal(a.expression, ""); assert.equal(b.expression, "value*2");
});

test("falha no segundo alvo restaura expressões e remove todos os controles", async () => {
  const layer = new FakeLayer(); const a = new FakeProperty(layer); const b = new FakeProperty(layer, {rejeitar:true});
  const result = await aplica([a,b]); assert.equal(result.ok, false);
  assert.equal(layer.controles.length, 0); assert.equal(a.expression, ""); assert.equal(b.expression, "");
});

test("consulta de controle longo usa identidade por nome sem property(string)", async () => {
  const layer = new FakeLayer(); const property = new FakeProperty(layer);
  const get = layer.efeitos.property.bind(layer.efeitos);
  layer.efeitos.property = key => { if (typeof key === "string" && Buffer.byteLength(key) > 39) throw new Error("AE name limit"); return get(key); };
  await aplica([property]); const result = await aplica([property], {mode:"quick"});
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.data.unchangedCount,1);
});

