/**
 * Ease por TIPO de propriedade.
 *
 * ## O defeito que estes testes existem para impedir
 *
 * `ae.keys.ease.apply` falhava com `HOST_OPERATION_FAILED` sempre que a
 * propriedade selecionada era espacial — Position, que é a mais usada de todas.
 * A causa: o comando deduzia a dimensionalidade do VALOR a partir do comprimento
 * do EASE. Numa propriedade espacial o After Effects guarda um único
 * `KeyframeEase` (a velocidade ao longo do caminho é unidimensional), enquanto
 * `keyValue()` devolve `[x, y]` ou `[x, y, z]`. Com `dimensions === 1` o código
 * caía no ramo escalar e fazia `Number([100, 200, 0])`, que é `NaN`.
 *
 * O `NaN` atravessava `curveToEase` inteiro — porque `NaN !== 0` é verdadeiro —
 * e chegava ao After Effects como `new KeyframeEase(NaN, ...)`. O AE lançava, o
 * dispatcher descartava a mensagem, e o usuário via só um código.
 *
 * Nenhum teste pegava isso: **nenhum fake do repositório tinha os tipos
 * espaciais**. `ease-paridade.test.mjs` declara apenas `OneD`;
 * `keys-chms018-019.test.mjs` chega a chamar a propriedade de "Position" mas a
 * tipa como `OneD`, o que dava uma falsa sensação de cobertura. Este arquivo
 * cobre a matriz de tipos que faltava.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { curveToTemporalEase } from "../../../packages/keyframe-core/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };

// Os valores são os do After Effects real. `SHAPE` e os dois espaciais nunca
// tinham aparecido em fake nenhum deste repositório.
const PropertyValueType = {
  NO_VALUE: 0,
  ThreeD_SPATIAL: 2,
  ThreeD: 3,
  TwoD_SPATIAL: 4,
  TwoD: 5,
  OneD: 6,
  COLOR: 7,
  CUSTOM_VALUE: 8,
  MARKER: 9,
  LAYER_INDEX: 10,
  MASK_INDEX: 11,
  SHAPE: 12,
  TEXT_DOCUMENT: 13
};

const KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

class FakeProperty {
  /**
   * @param {object} opcoes
   * @param {number} opcoes.valueType
   * @param {number} opcoes.easesPorKeyframe quantos KeyframeEase o AE devolve
   * @param {{time: number, value: unknown}[]} opcoes.keys
   */
  constructor(opcoes) {
    this.name = opcoes.name ?? "Position";
    this.matchName = opcoes.matchName ?? "ADBE Position";
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = opcoes.valueType;
    this.canVaryOverTime = true;
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.keys = opcoes.keys;
    this.selectedKeys = opcoes.keys.map((_, i) => i + 1);
    this.easesPorKeyframe = opcoes.easesPorKeyframe;
    this.interpolacaoAtual = opcoes.interpolacao ?? KeyframeInterpolationType.LINEAR;

    /** Toda escrita, na ordem em que aconteceu. É como o teste vê a sequência. */
    this.chamadas = [];
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
  #easeAtual() {
    const saida = [];
    for (let i = 0; i < this.easesPorKeyframe; i += 1) saida.push(new FakeKeyframeEase(0, 16.67));
    return saida;
  }
  keyInTemporalEase() {
    return this.#easeAtual();
  }
  keyOutTemporalEase() {
    return this.#easeAtual();
  }
  keyInInterpolationType() {
    return this.interpolacaoAtual;
  }
  keyOutInterpolationType() {
    return this.interpolacaoAtual;
  }
  setTemporalEaseAtKey(index, inEase, outEase) {
    // O After Effects recusa ease temporal num keyframe ainda marcado como
    // Hold. O fake reproduz essa recusa, senão o teste de ordem não mediria
    // nada — passaria com as chamadas em qualquer ordem.
    if (this.interpolacaoAtual === KeyframeInterpolationType.HOLD) {
      throw new Error("Cannot set temporal ease on a hold keyframe");
    }
    for (const ease of [...inEase, ...outEase]) {
      if (!Number.isFinite(ease.speed)) {
        throw new Error(`speed invalido: ${ease.speed}`);
      }
    }
    this.chamadas.push({ tipo: "ease", index, inEase, outEase });
  }
  setInterpolationTypeAtKey(index, inType, outType) {
    this.chamadas.push({ tipo: "interpolacao", index, inType, outType });
    if (inType === KeyframeInterpolationType.BEZIER || outType === KeyframeInterpolationType.BEZIER) {
      this.interpolacaoAtual = KeyframeInterpolationType.BEZIER;
    }
  }

  // Protocolo de captura/restauro, para o snapshot do rollback não lançar.
  keyTemporalContinuous() {
    return false;
  }
  keyTemporalAutoBezier() {
    return false;
  }
  keyRoving() {
    if (![PropertyValueType.TwoD_SPATIAL, PropertyValueType.ThreeD_SPATIAL].includes(this.propertyValueType)) throw new Error("Non-spatial property has no roving");
    return false;
  }
  keySelected(index) {
    return this.selectedKeys.indexOf(index) >= 0;
  }
  keyInSpatialTangent() {
    return [0, 0, 0];
  }
  keyOutSpatialTangent() {
    return [0, 0, 0];
  }
  keySpatialContinuous() {
    return false;
  }
  keySpatialAutoBezier() {
    return false;
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
  setSpatialTangentsAtKey() {}
  setSpatialContinuousAtKey() {}
  setSpatialAutoBezierAtKey() {}
}

class FakeCompItem {
  constructor(selectedProperties) {
    this.selectedLayers = [];
    this.selectedProperties = selectedProperties;
    this.frameDuration = 1 / 25;
    this.numLayers = 0;
  }
}

const CURVA = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };

async function aplicar(propriedades, curva = CURVA, lados = { applyIn: true, applyOut: true }) {
  const comp = new FakeCompItem(propriedades);
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
      app: {
        project: { activeItem: comp, expressionEngine: "javascript-1.0" },
        beginUndoGroup() {},
        endUndoGroup() {}
      },
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType
    }
  );

  return JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "ease-tipos",
        command: "ae.keys.ease.apply",
        args: { ...curva, ...lados },
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: {}
      })
    )
  );
}

for (const espacial of ["TwoD_SPATIAL", "ThreeD_SPATIAL"]) {
  test(`${espacial}: a curva entra pelo comprimento do caminho, e nao vira NaN`, async () => {
    // 300 e 400 nos dois eixos: a corda mede exatamente 500, então o valor
    // esperado é um número redondo e a asserção não depende de arredondamento.
    const tresD = espacial === "ThreeD_SPATIAL";
    const inicio = tresD ? [0, 0, 0] : [0, 0];
    const fim = tresD ? [300, 400, 0] : [300, 400];

    const propriedade = new FakeProperty({
      valueType: PropertyValueType[espacial],
      // O ponto do defeito: UM ease, mesmo com valor de duas ou três componentes.
      easesPorKeyframe: 1,
      keys: [
        { time: 0, value: inicio },
        { time: 1, value: fim }
      ]
    });

    const resposta = await aplicar([propriedade]);

    assert.equal(resposta.ok, true, `host recusou: ${JSON.stringify(resposta.error)}`);
    assert.equal(resposta.data.appliedCount, 2);

    const saidaDoPrimeiro = propriedade.chamadas.find(
      (c) => c.tipo === "ease" && c.index === 1
    ).outEase[0];
    const referencia = curveToTemporalEase(CURVA, 1, 500);

    assert.equal(
      saidaDoPrimeiro.speed,
      referencia.outPoint.speed,
      "a velocidade precisa sair da distância percorrida no segmento"
    );
    assert.ok(Number.isFinite(saidaDoPrimeiro.speed), "NaN é exatamente o defeito antigo");
  });
}

test("ThreeD nao espacial usa a diferenca de cada dimensao, uma por ease", async () => {
  // Scale: três eases independentes, cada um descrevendo a própria componente.
  // Aqui o ramo por dimensão é o certo — e é o que o código já fazia.
  const propriedade = new FakeProperty({
    name: "Scale",
    valueType: PropertyValueType.ThreeD,
    easesPorKeyframe: 3,
    keys: [
      { time: 0, value: [100, 100, 100] },
      { time: 1, value: [200, 400, 100] }
    ]
  });

  const resposta = await aplicar([propriedade]);
  assert.equal(resposta.ok, true, `host recusou: ${JSON.stringify(resposta.error)}`);

  const saida = propriedade.chamadas.find((c) => c.tipo === "ease" && c.index === 1).outEase;
  assert.equal(saida.length, 3);

  for (const [dimensao, diferenca] of [
    [0, 100],
    [1, 300],
    [2, 0]
  ]) {
    assert.equal(
      saida[dimensao].speed,
      curveToTemporalEase(CURVA, 1, diferenca).outPoint.speed,
      `dimensão ${dimensao} não usou a própria diferença`
    );
  }
});

test("OneD continua pela diferenca direta", async () => {
  const propriedade = new FakeProperty({
    name: "Opacity",
    valueType: PropertyValueType.OneD,
    easesPorKeyframe: 1,
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ]
  });

  const resposta = await aplicar([propriedade]);
  assert.equal(resposta.ok, true);
  assert.equal(
    propriedade.chamadas.find((c) => c.tipo === "ease" && c.index === 1).outEase[0].speed,
    curveToTemporalEase(CURVA, 1, 100).outPoint.speed
  );
});

test("Mask Path nao e escrita, e o usuario fica sabendo por que", async () => {
  // SHAPE ficava de fora da lista de recusa E da allowlist de captura: era
  // escrita sem snapshot, e o rollback não teria o que restaurar.
  const mascara = new FakeProperty({
    name: "Mask Path",
    matchName: "ADBE Mask Shape",
    valueType: PropertyValueType.SHAPE,
    easesPorKeyframe: 1,
    keys: [
      { time: 0, value: { vertices: [] } },
      { time: 1, value: { vertices: [] } }
    ]
  });

  const resposta = await aplicar([mascara]);

  assert.deepEqual(mascara.chamadas, [], "nada pode ter sido escrito numa propriedade sem snapshot");
  assert.equal(resposta.data.appliedCount, 0);
  assert.equal(resposta.data.skippedCount, 1);
  assert.equal(
    resposta.warnings[0].code,
    "EASE_PROPERTY_SKIPPED",
    "sem aviso, o painel diria 'curva aplicada' sobre zero keyframes"
  );
});

test("selecao mista aplica no que da e avisa sobre o resto", async () => {
  const opacidade = new FakeProperty({
    name: "Opacity",
    valueType: PropertyValueType.OneD,
    easesPorKeyframe: 1,
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ]
  });
  const mascara = new FakeProperty({
    name: "Mask Path",
    valueType: PropertyValueType.SHAPE,
    easesPorKeyframe: 1,
    keys: [
      { time: 0, value: {} },
      { time: 1, value: {} }
    ]
  });

  const resposta = await aplicar([opacidade, mascara]);

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 2, "a opacidade recebeu os dois keyframes");
  assert.equal(resposta.data.skippedCount, 1);
  assert.deepEqual(mascara.chamadas, []);
});

test("keyframe Hold recebe Bezier ANTES do ease", async () => {
  // O fake recusa ease sobre Hold, como o After Effects faz. Se a ordem
  // voltar a ser ease-primeiro, este teste falha com HOST_OPERATION_FAILED.
  const propriedade = new FakeProperty({
    name: "Opacity",
    valueType: PropertyValueType.OneD,
    easesPorKeyframe: 1,
    interpolacao: KeyframeInterpolationType.HOLD,
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 100 }
    ]
  });

  const resposta = await aplicar([propriedade]);

  assert.equal(resposta.ok, true, `host recusou: ${JSON.stringify(resposta.error)}`);
  const primeira = propriedade.chamadas[0];
  assert.equal(primeira.tipo, "interpolacao", "trocar para Bezier precisa vir primeiro");
  assert.equal(propriedade.chamadas[1].tipo, "ease");
});

test("curveToEase recusa entrada nao finita em vez de propagar NaN", async () => {
  // A guarda que impede o defeito de voltar por outro caminho: qualquer chamador
  // que passe NaN falha aqui, com uma frase, antes de qualquer escrita.
  const scope = await loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx"
    ],
    { PropertyType, PropertyValueType }
  );

  for (const [nome, curva, duracao, diferenca] of [
    ["diferenca NaN", CURVA, 1, Number.NaN],
    ["duracao NaN", CURVA, Number.NaN, 100],
    ["x1 NaN", { ...CURVA, x1: Number.NaN }, 1, 100],
    ["diferenca infinita", CURVA, 1, Number.POSITIVE_INFINITY]
  ]) {
    assert.throws(
      () => scope.MotionKeyframes.curveToEase(curva, duracao, diferenca),
      /Curva de ease invalida/,
      `${nome} passou batido`
    );
  }

  // E o controle: entrada boa continua funcionando.
  const ok = scope.MotionKeyframes.curveToEase(CURVA, 1, 100);
  assert.ok(Number.isFinite(ok.outSpeed) && Number.isFinite(ok.inSpeed));
});


test("selecao interna preserva lados externos e ignora saltos", async () => {
  const p = new FakeProperty({ valueType: PropertyValueType.OneD, easesPorKeyframe: 1,
    keys: [0, 1, 2, 3].map(time => ({ time, value: time * 30 })) });
  p.selectedKeys = [2, 3];
  const result = await aplicar([p]);
  assert.equal(result.ok, true);
  assert.equal(result.data.appliedCount, 2);
  const ease = p.chamadas.filter(c => c.tipo === "ease");
  assert.deepEqual(ease.map(c => c.index), [2, 3]);
  assert.equal(ease[0].inEase[0].influence, 16.67);
  assert.equal(ease[1].outEase[0].influence, 16.67);
  p.chamadas.length = 0; p.selectedKeys = [1, 3];
  const skipped = await aplicar([p]);
  assert.equal(skipped.data.appliedCount, 0);
  assert.equal(p.chamadas.length, 0);
  assert.deepEqual(skipped.warnings.map(w => w.code), ["EASE_NO_SELECTED_SEGMENT"]);
  assert.match(skipped.warnings[0].message, /consecutivos/);
});

test("propriedade numerica sem segmento recebe orientacao de selecao, sem aviso de tipo incompativel", async () => {
  for (const scenario of [
    { times: [0], selected: [1], sides: { applyIn: true, applyOut: true } },
    { times: [0, 1], selected: [1], sides: { applyIn: true, applyOut: false } },
    { times: [0, 1], selected: [2], sides: { applyIn: false, applyOut: true } }
  ]) {
    const p = new FakeProperty({ valueType: PropertyValueType.OneD, easesPorKeyframe: 1,
      keys: scenario.times.map(time => ({ time, value: time * 30 })) });
    p.selectedKeys = scenario.selected;
    const result = await aplicar([p], CURVA, scenario.sides);
    assert.equal(result.data.appliedCount, 0);
    assert.equal(result.data.skippedCount, 1);
    assert.deepEqual(p.chamadas, []);
    assert.deepEqual(result.warnings.map(w => w.code), ["EASE_NO_SELECTED_SEGMENT"]);
    assert.match(result.warnings[0].message, /Entrada\/Saida/);
  }
});

test("avisos distinguem propriedade incompativel e selecao sem segmento no mesmo pedido", async () => {
  const isolated = new FakeProperty({ valueType: PropertyValueType.OneD, easesPorKeyframe: 1,
    keys: [{ time: 0, value: 42 }] });
  const unsupported = new FakeProperty({ valueType: PropertyValueType.SHAPE, easesPorKeyframe: 1,
    keys: [{ time: 0, value: {} }, { time: 1, value: {} }] });
  const valid = new FakeProperty({ valueType: PropertyValueType.OneD, easesPorKeyframe: 1,
    keys: [{ time: 0, value: 0 }, { time: 1, value: 100 }] });
  const result = await aplicar([isolated, unsupported, valid]);
  assert.equal(result.data.appliedCount, 2);
  assert.equal(result.data.skippedCount, 2);
  assert.deepEqual(result.warnings.map(w => ({ code: w.code, properties: w.details.properties })), [
    { code: "EASE_PROPERTY_SKIPPED", properties: 1 },
    { code: "EASE_NO_SELECTED_SEGMENT", properties: 1 }
  ]);
});
