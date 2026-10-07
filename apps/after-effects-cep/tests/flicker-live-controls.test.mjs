/**
 * Flicker com Live Controls.
 *
 * O cenário é o mesmo de `wiggle-live-controls.test.mjs`, e de propósito: as
 * duas ferramentas passam pelo mesmo `MotionLivePreset`, então o que muda aqui
 * são os quatro parâmetros e o formato da expressão. Repetir os casos garante
 * que a segunda ferramenta não ficou funcionando "por acaso" — foi ligada pelo
 * mesmo caminho que o teste do Wiggle já prova.
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
  "src/commands/expression-flicker.jsx",
  "src/dispatch.jsx"
];

const PropertyType = { PROPERTY: 1, GROUP: 2, INDEXED_GROUP: 3 };
const PropertyValueType = { OneD: 5, TwoD: 4, ThreeD: 2, COLOR: 6 };

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

class FakeEffect {
  constructor(matchName, parade) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.parade = parade;
    this.param = new FakeParam();
  }
  get propertyIndex() {
    return this.parade.filhos.indexOf(this) + 1;
  }
  get numProperties() {
    return 1;
  }
  property(chave) {
    return chave === 1 || chave === "ADBE Slider Control-0001" ? this.param : null;
  }
  remove() {
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
  get controles() {
    return this.efeitos.filhos.map((f) => f.name);
  }
}

class FakeProperty {
  constructor(camada, opcoes = {}) {
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canSetExpression = true;
    this.numKeys = 0;
    this.selected = true;
    this.expressionError = "";
    this._expression = "";
    this._expressionEnabled = false;
    this.rejeitar = opcoes.rejeitar ?? false;
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

async function aplica(propriedades, opcoes = {}) {
  class FakeCompItem {
    constructor() {
      this.selectedProperties = propriedades;
      this.time = 0;
    }
  }
  const comp = new FakeCompItem();
  const scope = await loadHostModules(MODULES, {
    app: {
      version: "26.3x87",
      project: { activeItem: comp, expressionEngine: "javascript-1.0" },
      beginUndoGroup() {},
      endUndoGroup() {}
    },
    CompItem: FakeCompItem,
    Property: FakeProperty,
    PropertyType,
    PropertyValueType
  });
  return JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "flicker-live-1",
        command: "ae.expression.flicker",
        args: { rate: 8, minFactor: 0.4, maxFactor: 1, seed: 7, conflictMode: "skip" },
        context: { host: "after-effects", hostVersion: "26.3", locale: opcoes.locale ?? "pt_BR" },
        options: { emitLiveControls: opcoes.live ?? true }
      })
    )
  );
}

test("clicar cria os quatro sliders e liga a expressao neles", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const resposta = await aplica([propriedade]);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.controles.length, 1);
  assert.equal(camada.efeitos.filhos[0].numProperties, 6);
  assert.equal(camada.controles[0], "Moti.on · Flicker");
  assert.equal(camada.efeitos.filhos[0].property(1).name, "Frequência");
  assert.match(propriedade.expression, /Math.floor\(time \* rate\)/);
  assert.match(propriedade.expression, /result = value \* factor/);
  assert.equal(propriedade.expressionEnabled, true);
});

test("os valores pedidos entram nos sliders", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  await aplica([propriedade]);

  assert.deepEqual(
    camada.efeitos.filhos[0].params.map((p) => p.value),
    [8, 0.4, 1, 7, 100, 1]
  );
});

test("o nome do controle acompanha o idioma", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  await aplica([propriedade], { locale: "en_US" });

  assert.equal(camada.efeitos.filhos[0].property(1).name, "Frequency");
  assert.match(propriedade.expression, /effect\("Moti\.on · Flicker"\)\(1\)/);
});

test("expressao recusada leva os controles criados junto", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada, { rejeitar: true });

  const resposta = await aplica([propriedade]);

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.deepEqual(camada.controles, []);
});

test("sem emitLiveControls os numeros continuam cravados", async () => {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada);

  const resposta = await aplica([propriedade], { live: false });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(camada.controles, []);
  assert.match(propriedade.expression, /posterizeTime\(8\)/);
});

