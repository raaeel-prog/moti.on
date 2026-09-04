/**
 * Paridade entre a referência e o host.
 *
 * `packages/keyframe-core/src/bezier.ts` é a implementação de referência da
 * conversão curva→ease; `host/src/commands/keys-ease.jsx` é a que roda de
 * verdade dentro do After Effects. Elas não podem ser a mesma função — uma é
 * TypeScript de módulo, a outra é ExtendScript concatenado — mas precisam
 * produzir exatamente o mesmo número.
 *
 * Sem este teste, corrigir uma e esquecer a outra é um erro silencioso: o teste
 * da referência continua verde enquanto o plugin aplica outra curva. Foi assim
 * que a inclinação com alça vertical ficou errada nas duas ao mesmo tempo.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { curveToTemporalEase } from "../../../packages/keyframe-core/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = { NO_VALUE: 0, CUSTOM_VALUE: 7, MARKER: 8, TEXT_DOCUMENT: 12, OneD: 5 };

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

class FakeProperty {
  constructor(keys, selectedKeys) {
    this.name = "Opacity";
    this.matchName = "ADBE Opacity";
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canVaryOverTime = true;
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.keys = keys;
    this.selectedKeys = selectedKeys;
    this.escritas = [];
  }
  get numKeys() {
    return this.keys.length;
  }
  keyTime(index) {
    return this.keys[index - 1].time;
  }
  keyValue(index) {
    return this.keys[index - 1].value;
  }
  keyInTemporalEase() {
    return [new FakeKeyframeEase(0, 16.67)];
  }
  keyOutTemporalEase() {
    return [new FakeKeyframeEase(0, 16.67)];
  }
  keyInInterpolationType() {
    return 1;
  }
  keyOutInterpolationType() {
    return 1;
  }
  setTemporalEaseAtKey(index, inEase, outEase) {
    this.escritas.push({ index, inEase, outEase });
  }
  setInterpolationTypeAtKey() {}

  // Restante do protocolo de keyframe. O comando passou a capturar uma copia
  // intacta antes de escrever, para poder desfazer se uma das escritas falhar
  // no meio; sem estes metodos a captura lanca e o pedido volta como falha de
  // host, escondendo o que o teste quer medir.
  keyTemporalContinuous() {
    return false;
  }
  keyTemporalAutoBezier() {
    return false;
  }
  keyRoving() {
    return false;
  }
  keySelected(index) {
    return this.selectedKeys.indexOf(index) >= 0;
  }
  removeKey(index) {
    this.keys.splice(index - 1, 1);
  }
  setValueAtTime(time, value) {
    this.keys.push({ time, value });
    this.keys.sort((a, b) => a.time - b.time);
  }
  setTemporalContinuousAtKey() {}
  setTemporalAutoBezierAtKey() {}
  setRovingAtKey() {}
  setSelectedAtKey() {}
}

class FakeCompItem {
  constructor(selectedProperties) {
    this.selectedLayers = [];
    this.selectedProperties = selectedProperties;
    this.frameDuration = 1 / 25;
    this.numLayers = 0;
  }
}

/**
 * Roda a curva pelo host e devolve o ease escrito no primeiro keyframe do
 * segmento — o mesmo par que `curveToTemporalEase` devolve.
 */
async function easePeloHost(curva, duracao, diferenca) {
  const property = new FakeProperty(
    [
      { time: 0, value: 0 },
      { time: duracao, value: diferenca }
    ],
    [1, 2]
  );
  const comp = new FakeCompItem([property]);
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };

  const scope = await loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx",
      "src/commands/keys-ease.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 }
    }
  );

  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "ease-paridade",
        command: "ae.keys.ease.apply",
        args: { ...curva, applyIn: true, applyOut: true },
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: {}
      })
    )
  );
  assert.equal(resposta.ok, true, `host recusou o pedido: ${JSON.stringify(resposta.error)}`);

  // A saída do keyframe 1 e a entrada do keyframe 2 descrevem o mesmo segmento.
  const escritaKey1 = property.escritas.find((escrita) => escrita.index === 1);
  const escritaKey2 = property.escritas.find((escrita) => escrita.index === 2);
  assert.ok(escritaKey1 && escritaKey2, "esperava ease escrito nos dois keyframes");

  return {
    outPoint: { speed: escritaKey1.outEase[0].speed, influence: escritaKey1.outEase[0].influence },
    inPoint: { speed: escritaKey2.inEase[0].speed, influence: escritaKey2.inEase[0].influence }
  };
}

const casos = [
  { nome: "linear", curva: { x1: 0, y1: 0, x2: 1, y2: 1 }, duracao: 1, diferenca: 100 },
  { nome: "ease in-out simetrico", curva: { x1: 0.33, y1: 0, x2: 0.67, y2: 1 }, duracao: 2, diferenca: 100 },
  { nome: "alca vertical na saida", curva: { x1: 0, y1: 1, x2: 0.5, y2: 0 }, duracao: 1, diferenca: 50 },
  { nome: "alca vertical na entrada", curva: { x1: 0.5, y1: 1, x2: 1, y2: 0 }, duracao: 1, diferenca: 50 },
  { nome: "overshoot em Y", curva: { x1: 0.2, y1: 1.6, x2: 0.4, y2: 1.3 }, duracao: 0.5, diferenca: -240 },
  { nome: "diferenca zero", curva: { x1: 0.4, y1: 0.2, x2: 0.6, y2: 0.8 }, duracao: 1, diferenca: 0 },
  { nome: "duracao curta", curva: { x1: 0.1, y1: 0.9, x2: 0.9, y2: 0.1 }, duracao: 0.04, diferenca: 12 }
];

for (const caso of casos) {
  test(`referencia e host concordam na curva: ${caso.nome}`, async () => {
    const referencia = curveToTemporalEase(caso.curva, caso.duracao, caso.diferenca);
    const host = await easePeloHost(caso.curva, caso.duracao, caso.diferenca);

    // Comparacao exata, e nao por tolerancia: as duas fazem a mesma conta com os
    // mesmos doubles. Qualquer divergencia aqui e divergencia de formula.
    assert.deepEqual(host, referencia, `${caso.nome} divergiu entre referencia e host`);
  });
}
