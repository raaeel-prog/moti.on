/**
 * `ae.keys.reverse-values` (CROSSHOST_STUDIO_MASTER_IMPLEMENTATION_SPEC_v2.md
 * §15.2.3) — inverte os VALORES dos keyframes selecionados, mantendo os
 * TEMPOS originais. Complementa `ae.keys.reverse`, que já existe neste
 * repositório mas implementa a operação DIFERENTE que o addendum chama de
 * Mirror (§15.2.2): move os tempos, mantém o valor grudado no keyframe.
 *
 * Estes testes fixam o algoritmo derivado no comentário do próprio comando —
 * "tocar a animação de trás para frente sem mover os tempos" — e, no teste de
 * distinção, provam que este comando não é uma reimplementação de Mirror sob
 * outro nome.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import {
  FakeCompItem,
  FakeKeyframeEase,
  FakeProperty,
  PropertyType,
  PropertyValueType,
  makeKey
} from "./keyframe-fakes.mjs";

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
      "src/keyframe-operations.jsx",
      ...files,
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
  return { scope, calls };
}

function request(command, args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: `${command}-1`,
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

function retrato(property) {
  return property.keys.map((k) => [k.time, k.value]);
}

test("os tempos ficam parados; so os valores trocam de lugar, invertidos", async () => {
  const property = new FakeProperty("Opacity", [
    makeKey(0, 10, 1, 1),
    makeKey(1, 20, 2, 2),
    makeKey(2, 30, 3, 3),
    makeKey(3, 40, 4, 4)
  ]);

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse-values", {})));

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(
    property.keys.map((k) => k.time),
    [0, 1, 2, 3],
    "os tempos nao podem mudar — é o que distingue esta operação de Mirror"
  );
  assert.deepEqual(property.keys.map((k) => k.value), [40, 30, 20, 10]);
});

test("o ease de cada keyframe novo vem do PARCEIRO espelhado, com entrada e saida trocadas", async () => {
  // Cada keyframe carrega uma influencia de saida/entrada distinta e
  // identificavel (10,11 / 20,21 / 30,31 / 40,41), para o teste conseguir
  // apontar exatamente de qual keyframe original o ease do resultado veio.
  const property = new FakeProperty("Opacity", [
    makeKey(0, "a", 10, 11),
    makeKey(1, "b", 20, 21),
    makeKey(2, "c", 30, 31),
    makeKey(3, "d", 40, 41)
  ]);

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse-values", {})));
  assert.equal(resposta.ok, true, JSON.stringify(resposta));

  // Novo keyframe 1 (t=0) recebe o pacote do parceiro (o antigo keyframe 4,
  // valor "d", influencias 40/41) com entrada e saida trocadas: o outEase do
  // parceiro (40) vira o inEase do novo, e o inEase do parceiro (41) vira o
  // outEase do novo.
  assert.equal(property.keys[0].inEase[0].influence, 40);
  assert.equal(property.keys[0].outEase[0].influence, 41);

  // Novo keyframe 4 (t=3) recebe o pacote do parceiro (o antigo keyframe 1,
  // valor "a", influencias 10/11), trocado do mesmo jeito.
  assert.equal(property.keys[3].inEase[0].influence, 10);
  assert.equal(property.keys[3].outEase[0].influence, 11);
});

test("selecao com quantidade impar: o keyframe central mantem o valor mas troca o ease", async () => {
  const property = new FakeProperty("Opacity", [
    makeKey(0, 10, 1, 2),
    makeKey(1, 20, 3, 4),
    makeKey(2, 30, 5, 6)
  ]);

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse-values", {})));
  assert.equal(resposta.ok, true, JSON.stringify(resposta));

  assert.deepEqual(property.keys.map((k) => k.value), [30, 20, 10]);
  // O keyframe do meio (indice 2, t=1) e seu proprio parceiro: o valor 20
  // continua 20, mas out/in trocam de lado (3<->4 vira 4/3... com o mesmo
  // raciocinio de troca: inEase recebe o antigo outEase, outEase recebe o
  // antigo inEase).
  assert.equal(property.keys[1].value, 20);
  assert.equal(property.keys[1].inEase[0].influence, 3);
  assert.equal(property.keys[1].outEase[0].influence, 4);
});

test("uma unica key selecionada nao tem o que trocar: comando recusa em vez de fingir sucesso", async () => {
  // `allowsNoopSuccess: false` no descriptor (mesma escolha de ae.keys.reverse):
  // um comando que muta e não muda nada responde ok:false por construção do
  // dispatcher, não por decisão deste comando. É o mesmo contrato de §8.
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);
  property.selectedKeys = [1];

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse-values", {})));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.equal(resposta.warnings[0].code, "NO_CHANGE_APPLIED");
  assert.deepEqual(property.keys.map((k) => k.value), [10, 20], "nada foi escrito");
});

test("nao abre grupo de Undo proprio: o dispatcher e quem abre, com o rotulo do descriptor", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2)]);
  const { scope, calls } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);

  scope.MotionAE.dispatch(request("ae.keys.reverse-values", {}));

  assert.deepEqual(calls, [["begin", "Moti.on: inverter valores dos keyframes"], ["end"]]);
});

test("falha na escrita devolve os keyframes que existiam, tempos e valores originais", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2), makeKey(2, 30, 3, 3)]);
  const antes = retrato(property);
  property.falhaEm = 3;

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse-values.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse-values", {})));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(retrato(property), antes, "os keyframes originais voltaram");
});

test("e realmente diferente de ae.keys.reverse (Mirror) no mesmo insumo", async () => {
  // Tempos IGUALMENTE espaçados escondem a diferença: espelhar uma progressão
  // aritmética no tempo produz, por coincidência aritmética, a mesma sequência
  // de valores-por-posição que inverter os valores nos tempos fixos. Os dois
  // só divergem de verdade — no invariante que de fato distingue as duas
  // operações, os TEMPOS — quando o espaçamento não é uniforme.
  const base = [makeKey(0, 10, 1, 1), makeKey(1, 20, 2, 2), makeKey(2, 30, 3, 3), makeKey(10, 40, 4, 4)];

  const paraValores = new FakeProperty("Opacity", base);
  const { scope: scopeValores } = await fixture(new FakeCompItem([paraValores]), [
    "src/commands/keys-reverse-values.jsx"
  ]);
  scopeValores.MotionAE.dispatch(request("ae.keys.reverse-values", {}));

  const paraMirror = new FakeProperty("Opacity", base);
  const { scope: scopeMirror } = await fixture(new FakeCompItem([paraMirror]), ["src/commands/keys-reverse.jsx"]);
  scopeMirror.MotionAE.dispatch(request("ae.keys.reverse", {}));

  // Reverse Values: os tempos originais não mudam — nem o conjunto, nem a
  // posição de cada um.
  assert.deepEqual(paraValores.keys.map((k) => k.time), [0, 1, 2, 10]);
  assert.deepEqual(paraValores.keys.map((k) => k.value), [40, 30, 20, 10]);

  // Mirror: o pivô é o ponto médio da seleção — (0+10)/2=5 — e os NOVOS
  // tempos são 5*2-tempoOriginal. O conjunto de tempos que sobra é
  // {10,9,8,0}, que não tem 3 dos 4 elementos em comum com o conjunto
  // original {0,1,2,10}. Isso é o que prova que Mirror move tempos e
  // Reverse Values não.
  assert.deepEqual(
    paraMirror.keys.map((k) => k.time).sort((a, b) => a - b),
    [0, 8, 9, 10]
  );
});
