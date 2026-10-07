/**
 * Live Controls em Inertial, Smooth e LoopOut.
 *
 * Estes testes nasceram de duas mutações que passaram batidas: desligar o
 * `emitLiveControls` do Smooth não derrubava nada, e trocar a ordem dos tipos
 * do LoopOut também não. A segunda é o risco que o próprio comentário do
 * comando descreve — "divergir faz o usuário escolher vaivém e receber ciclo" —
 * e não havia teste algum sustentando aquela frase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadHostModules } from "./grouped-host-harness.mjs";

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
    return typeof chave === "number" || typeof chave === "string" ? this.param : null;
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
  constructor() {
    this.name = "Camada";
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
  constructor(camada, numKeys) {
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canSetExpression = true;
    this.numKeys = numKeys;
    this.selected = true;
    this.expressionError = "";
    this._expression = "";
    this._expressionEnabled = false;
    this.parentProperty = { name: "Transform", parentProperty: camada };
  }
  get expression() {
    return this._expression;
  }
  set expression(v) {
    this._expression = v;
  }
  get expressionEnabled() {
    return this._expressionEnabled;
  }
  set expressionEnabled(v) {
    this._expressionEnabled = v;
  }
}

/** Roda um comando com Live Controls ligados e devolve o que aconteceu. */
async function aplica(comando, arquivo, args, numKeys = 4) {
  const camada = new FakeLayer();
  const propriedade = new FakeProperty(camada, numKeys);

  class FakeCompItem {
    constructor() {
      this.selectedProperties = [propriedade];
      this.selectedLayers = [];
      this.time = 0;
      this.frameRate = 30;
      this.duration = 10;
    }
  }
  const comp = new FakeCompItem();
  const scope = await loadHostModules(
    [
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
      `src/commands/${arquivo}`,
      "src/dispatch.jsx"
    ],
    {
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
    }
  );

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "live-1",
        command: comando,
        args,
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: { emitLiveControls: true }
      })
    )
  );
  return { resposta, camada, propriedade };
}

test("Inertial cria os tres controles e a expressao le deles", async () => {
  const { resposta, camada, propriedade } = await aplica(
    "ae.animate.inertial",
    "animate-inertial.jsx",
    { amplitude: 60, frequency: 2.5, decay: 6, maxDurationFrames: 120, startMode: "lastKey" }
  );

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(camada.controles, ["Moti.on · Inertial"]);
  assert.deepEqual(camada.efeitos.filhos[0].params.map(p => p.name), ["Amplitude", "Frequência", "Decaimento"]);
  assert.match(propriedade.expression, /var amp = .*effect\("Moti\.on · Inertial"\)\(1\)/);
  // `maxDurF` continua cravado: é teto de segurança, não intensidade.
  assert.match(propriedade.expression, /var maxDurF = 120;/);
});

test("Smooth cria os dois controles e a expressao le deles", async () => {
  // A mutação que motivou este teste: trocar `live` por `false` no comando não
  // derrubava nada, porque o caminho vivo do Smooth não tinha cobertura.
  const { resposta, camada, propriedade } = await aplica(
    "ae.expression.smooth",
    "expression-smooth.jsx",
    { widthSeconds: 0.2, samples: 5, referenceTime: "current", conflictMode: "skip" }
  );

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.controles.length, 1);
  assert.equal(camada.efeitos.filhos[0].numProperties, 6);
  assert.match(propriedade.expression, /effect\("Moti\.on · Smooth"\)\(1\)/);
  assert.match(propriedade.expression, /smooth\(/);
  assert.equal(camada.efeitos.filhos[0].param.value, 0.2);

});

test("LoopOut cria dropdown mais slider, e o tipo vira indice", async () => {
  const { resposta, camada, propriedade } = await aplica(
    "ae.expression.loopout",
    "expression-loopout.jsx",
    { type: "pingpong", numKeyframes: 0, duration: 0, useDuration: false, conflictMode: "skip" }
  );

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.controles.length, 1);
  assert.equal(camada.efeitos.filhos[0].numProperties, 6);
  assert.equal(camada.efeitos.filhos[0].param.value, 2);
  assert.match(propriedade.expression, /'cycle', 'pingpong', 'offset', 'continue'/);
  assert.match(propriedade.expression, /loopOutDuration\(mode,/);

});

test("a ordem dos tipos do LoopOut e a mesma no comando e no template", () => {
  // Sem esta conferência, trocar a ordem num dos dois lados faz o usuário
  // escolher "vaivém" no dropdown e receber "ciclo" — e nada acusa: a expressão
  // continua válida, só aponta para o tipo errado.
  const raiz = new URL("../../../", import.meta.url);
  const comando = readFileSync(
    new URL("apps/after-effects-cep/host/src/commands/expression-loopout.jsx", raiz),
    "utf8"
  );
  const template = readFileSync(
    new URL("apps/after-effects-cep/host/src/expression-templates.jsx", raiz),
    "utf8"
  );

  const doComando = /var TIPOS_LIVE = \[([^\]]+)\]/.exec(comando);
  const doTemplate = /var LOOPOUT_LIVE_TYPES = \[([^\]]+)\]/.exec(template);
  assert.ok(doComando, "TIPOS_LIVE não encontrado no comando");
  assert.ok(doTemplate, "LOOPOUT_LIVE_TYPES não encontrado no template");

  const lista = (bruto) => [...bruto.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  const a = lista(doComando[1]);
  const b = lista(doTemplate[1]);

  assert.ok(a.length >= 3, `só ${a.length} tipo(s) lido(s) do comando`);
  assert.deepEqual(a, b, "a ordem dos tipos divergiu entre o comando e o template");
});

