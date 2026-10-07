/**
 * As decisões que o `derive` das ferramentas de operação toma sozinho.
 *
 * O teste vizinho (`apps/after-effects-cep/tests/quick-args-aceitos.test.mjs`)
 * prova que os argumentos derivados têm o FORMATO que o host aceita. Ele passaria
 * igual se o Null nunca parenteasse nada e o Inverter ordem sempre virasse a
 * composição inteira: os dois seriam argumentos perfeitamente válidos, e
 * perfeitamente errados.
 *
 * Aqui está o significado. Cada afirmação corresponde a um clique que o usuário
 * dá e a um resultado que ele espera — e a um estrago concreto se a derivação
 * mudar sem que ninguém perceba.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getQuickProfile } from "../dist/index.js";

function contexto(overrides = {}) {
  return {
    host: "after-effects",
    hostVersion: "26.3",
    fps: 30,
    compWidth: 1920,
    compHeight: 1080,
    compDurationSeconds: 10,
    currentTimeSeconds: 1,
    workAreaStart: 0,
    workAreaDuration: 10,
    selectionCount: 0,
    selectionLayerCount: 0,
    selectionKinds: [],
    selectionHasKeyframes: false,
    selectionHasExpressions: false,
    selectionIs3D: false,
    averageLayerDurationSeconds: 5,
    existingRigIdsInSelection: [],
    ...overrides
  };
}

function derivar(commandId, overrides = {}) {
  const perfil = getQuickProfile(commandId);
  assert.ok(perfil, `${commandId} não tem QuickProfile`);
  assert.ok(perfil.derive, `${commandId} não tem derive`);
  return perfil.derive(contexto(overrides));
}

test("Null com camadas selecionadas vira controlador; sem seleção, vai ao centro", () => {
  // Com seleção, o clique precisa produzir o controlador inteiro — null na
  // âncora média COM as camadas parenteadas. Um null solto no meio da tela
  // obrigaria o usuário a fazer o parenteamento à mão, que é justamente o
  // trabalho que a ferramenta existe para poupar.
  const comSelecao = derivar("ae.layer.create-null", {
    selectionLayerCount: 3,
    selectionCount: 0
  });
  assert.equal(comSelecao.placement, "averageAnchor");
  assert.equal(comSelecao.parentSelected, true);
  assert.equal(
    comSelecao.preserveWorldTransform,
    true,
    "sem preservar o transform, parentear faz as camadas saltarem de lugar"
  );

  // Sem seleção não há de onde tirar média, e `averageAnchor` seria recusado
  // pelo host. Centro da composição é o único posicionamento que funciona.
  const semSelecao = derivar("ae.layer.create-null");
  assert.equal(semSelecao.placement, "compCenter");
  assert.equal(semSelecao.parentSelected, false);
});

test("Null conta CAMADAS, e nao propriedades selecionadas", () => {
  // Este é o caso mais comum de todos: clicar em duas camadas na timeline
  // seleciona zero propriedades. Um derive que lesse `selectionCount` veria
  // vazio e criaria um null solto no centro, sem parentear nada.
  const camadasSemPropriedades = derivar("ae.layer.create-null", {
    selectionLayerCount: 2,
    selectionCount: 0
  });
  assert.equal(camadasSemPropriedades.parentSelected, true);
  assert.equal(camadasSemPropriedades.placement, "averageAnchor");
});

test("Null acompanha a dimensao da selecao", () => {
  // Parentear camadas 3D a um null 2D achata a cena inteira, e o estrago é
  // silencioso: nada falha, a composição só passa a estar errada.
  assert.equal(derivar("ae.layer.create-null", { selectionIs3D: true }).dimension, "3d");
  assert.equal(derivar("ae.layer.create-null", { selectionIs3D: false }).dimension, "2d");
});

test("o tamanho do Null escala com a resolucao e respeita a faixa do host", () => {
  const hd = derivar("ae.layer.create-null").size;
  const quatroK = derivar("ae.layer.create-null", { compWidth: 3840, compHeight: 2160 }).size;
  const minusculo = derivar("ae.layer.create-null", { compWidth: 64, compHeight: 64 }).size;

  assert.equal(hd, 100, "1080p é a base da escala");
  assert.equal(quatroK, 200, "numa 4K o null precisa dobrar para continuar clicável");

  for (const tamanho of [hd, quatroK, minusculo]) {
    assert.ok(Number.isInteger(tamanho), "o host exige inteiro");
    assert.ok(tamanho >= 1 && tamanho <= 10000, `${tamanho} está fora da faixa do host`);
  }
});

test("Inverter ordem so usa escopo 'selected' quando ha o que inverter", () => {
  // Inverter uma lista de uma camada não muda nada, e o descritor declara
  // `allowsNoopSuccess: false` — o clique falharia com "nada mudou". Com zero ou
  // uma camada, a composição é o único escopo em que a ferramenta faz algo.
  assert.equal(derivar("ae.layer.reverse-order", { selectionLayerCount: 0 }).scope, "composition");
  assert.equal(derivar("ae.layer.reverse-order", { selectionLayerCount: 1 }).scope, "composition");
  assert.equal(derivar("ae.layer.reverse-order", { selectionLayerCount: 2 }).scope, "selected");
  assert.equal(derivar("ae.layer.reverse-order", { selectionLayerCount: 9 }).scope, "selected");

  const derivado = derivar("ae.layer.reverse-order", { selectionLayerCount: 3 });
  assert.equal(derivado.preserveTrackMattes, true);
  assert.equal(derivado.preserveParents, true);
  assert.equal(
    derivado.reverseTimingToo,
    false,
    "inverter também o tempo é uma segunda operação, e ninguém a pediu num clique"
  );
});

test("Espelhar e horizontal em torno da ancora, com texto legivel", () => {
  // A camada não pode sair do lugar: pivô na âncora. E texto espelhado
  // raramente é o pedido de quem clica em "Espelhar".
  const derivado = derivar("ae.layer.flip");
  assert.deepEqual(derivado, {
    axis: "horizontal",
    pivot: "anchor",
    groupMode: "each",
    preserveTextReadability: true
  });
});

test("Ancora centraliza sem deixar a camada saltar", () => {
  const derivado = derivar("ae.anchor.align");
  assert.equal(derivado.gridPoint, "center");
  assert.equal(
    derivado.preserveVisualPosition,
    true,
    "sem isto, centralizar a âncora move a camada na tela"
  );
  assert.equal(derivado.preview, false, "o comando de aplicação exige preview falso");
  assert.equal(derivado.fixedTime, 0, "campo inativo precisa ir canônico, e não com resíduo");
});

test("a curva de velocidade NAO e uma ferramenta de clique rapido", () => {
  // Ela teve um QuickProfile por um dia, e foi um erro: a curva é o parâmetro
  // contínuo da ferramenta, e o §A1.2 diz que um Quick sem Live Control é
  // incompleto quando existe parâmetro contínuo. Não há Live Control possível
  // aqui — a curva vive nos keyframes, não num slider —, então o caminho certo
  // é a tela, onde o gráfico mostra o que será aplicado antes de aplicar.
  assert.equal(getQuickProfile("ae.keys.ease.apply"), undefined);
});

test("as ferramentas de operacao nao prometem Live Controls", () => {
  // O painel decide por este número qual mensagem mostrar depois do clique.
  // Um perfil de operação que declarasse controles mandaria o usuário procurar
  // um Effect Controls vazio.
  const operacoes = [
    "ae.layer.create-null",
    "ae.layer.flip",
    "ae.layer.reverse-order",
    "ae.anchor.align",
    "ae.keys.reverse",
    "ae.keys.reverse-values",
    "ae.keys.send-to-edge"
  ];
  for (const commandId of operacoes) {
    assert.equal(
      getQuickProfile(commandId).liveControls.length,
      0,
      `${commandId} declara Live Controls que a operação não materializa`
    );
  }

  // E o controle: as de expressão continuam prometendo os seus.
  assert.ok(getQuickProfile("ae.expression.wiggle").liveControls.length > 0);
});

test("as duas operacoes sem argumento nao inventam um derive", () => {
  // Inverter keys no tempo e inverter valores não recebem argumento nenhum. Um
  // `derive` ali produziria um objeto que o host recusaria como campo
  // desconhecido.
  assert.equal(getQuickProfile("ae.keys.reverse").derive, undefined);
  assert.equal(getQuickProfile("ae.keys.reverse-values").derive, undefined);
});
