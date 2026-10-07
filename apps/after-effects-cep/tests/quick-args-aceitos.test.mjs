/**
 * Os argumentos que o `derive` do QuickProfile produz precisam ser aceitos pelo
 * `preflight` do comando de verdade.
 *
 * ## Por que este teste existe
 *
 * O clique rápido não passa por tela nenhuma: `applyQuickPreset` chama
 * `derive(contexto)` e manda o resultado direto ao host. Se um campo sair com o
 * tipo errado, ou faltar, ou vier com valor fora da faixa, o host responde
 * `INVALID_PRESET` e o usuário vê a ferramenta falhar no primeiro clique — sem
 * nada no painel que explique o quê.
 *
 * Isso já aconteceu neste projeto: o perfil do Smooth mandava
 * `referenceTime: null` num campo que só aceita `"current"` ou um número maior
 * ou igual a zero. Nenhum teste de unidade pegava, porque as duas pontas
 * estavam certas separadamente — o que estava errado era o encontro delas.
 *
 * ## Como ele mede
 *
 * O ambiente tem uma composição ativa e seleção vazia. A composição precisa
 * existir: o dispatcher checa `hasActiveComp` ANTES de chamar o preflight, então
 * um comando pode legitimamente assumir que ela está lá — e alguns assumem.
 * Testar com composição nula mediria um estado que o produto nunca produz.
 *
 * Com seleção vazia, o preflight de um comando bem-argumentado responde
 * `NO_SELECTION`. A afirmação é estreita e é sobre o formato: nenhum
 * `INVALID_PRESET`.
 *
 * Os dois últimos testes são o instrumento. Eles estragam os argumentos de
 * propósito e exigem `INVALID_PRESET` de volta — sem isso, um comando que
 * checasse a seleção antes dos argumentos faria todos os outros passarem sem
 * validar coisa alguma.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { HOST_SOURCE_ORDER } from "../../../scripts/build-extendscript.mjs";
import { quickProfilesForHost } from "../../../packages/command-registry/dist/index.js";

/**
 * `HOST_SOURCE_ORDER` é relativa a `host/src`; o harness é relativo a `host`.
 * Carregar a ordem real, e não uma lista escrita à mão, é o que faz um comando
 * novo entrar aqui sozinho.
 */
const MODULOS = HOST_SOURCE_ORDER.map((caminho) =>
  caminho.startsWith("../") ? caminho.slice(3) : `src/${caminho}`
);

class CompItem {
  constructor() {
    this.name = "Comp 1";
    this.width = 1920;
    this.height = 1080;
    this.duration = 10;
    this.frameRate = 30;
    this.time = 1;
    this.workAreaStart = 0;
    this.workAreaDuration = 10;
    this.numLayers = 0;
    this.selectedLayers = [];
    this.selectedProperties = [];
    this.markers = { numKeys: 0 };
    this.layers = { length: 0 };
  }

  layer() {
    return null;
  }
}

class FootageItem {}

function globaisDoHost() {
  return {
    app: {
      project: {
        // Composição ativa de verdade: o dispatcher só chega ao preflight
        // depois de aprovar `hasActiveComp`, então esta é a única forma do
        // ambiente que o comando realmente encontra.
        activeItem: new CompItem(),
        expressionEngine: "javascript-1.0",
        items: { length: 0 }
      }
    },
    CompItem,
    FootageItem,
    PropertyType: { PROPERTY: 6412, INDEXED_GROUP: 6413, NAMED_GROUP: 6414 },
    KeyframeInterpolationType: { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 },
    PropertyValueType: { NO_VALUE: 6613, ThreeD_SPATIAL: 6614, TwoD_SPATIAL: 6616 },
    KeyframeEase: class {},
    ParagraphJustification: { LEFT_JUSTIFY: 7415, CENTER_JUSTIFY: 7416 },
    BlendingMode: { NORMAL: 5012, ADD: 5006 },
    TrackMatteType: { NO_TRACK_MATTE: 6012, ALPHA: 6013 },
    LayerQuality: { BEST: 3113 },
    File: class {},
    Folder: class {}
  };
}

/**
 * Contextos representativos.
 *
 * Não é um contexto só: os `derive` ramificam por seleção, por 3D e por
 * resolução, e um contexto único deixaria os outros ramos sem prova. Estes
 * quatro cobrem os ramos que os perfis atuais realmente têm.
 */
function contextos() {
  const base = {
    host: "after-effects",
    hostVersion: "26.3",
    fps: 30,
    compWidth: 1920,
    compHeight: 1080,
    compDurationSeconds: 10,
    currentTimeSeconds: 1,
    workAreaStart: 0,
    workAreaDuration: 10,
    selectionCount: 2,
    selectionLayerCount: 2,
    selectionKinds: [],
    selectionHasKeyframes: true,
    selectionHasExpressions: false,
    selectionIs3D: false,
    averageLayerDurationSeconds: 5,
    existingRigIdsInSelection: []
  };

  return [
    { nome: "1080p, duas camadas, 2D", contexto: base },
    {
      nome: "sem seleção nenhuma",
      contexto: {
        ...base,
        selectionCount: 0,
        selectionLayerCount: 0,
        selectionHasKeyframes: false,
        averageLayerDurationSeconds: 0
      }
    },
    {
      nome: "4K com uma camada 3D",
      contexto: {
        ...base,
        compWidth: 3840,
        compHeight: 2160,
        selectionCount: 1,
        selectionLayerCount: 1,
        selectionIs3D: true
      }
    },
    {
      // Comp pequena e vertical: `scaleQuickPixelsFrom1080` divide por menos de
      // 1080 aqui, e é onde um tamanho derivado pode cair abaixo do mínimo que
      // o host aceita.
      nome: "vertical pequena, no fim da comp",
      contexto: {
        ...base,
        compWidth: 240,
        compHeight: 426,
        currentTimeSeconds: 10,
        workAreaStart: 9,
        workAreaDuration: 1
      }
    }
  ];
}

const escopo = await loadHostModules(MODULOS, globaisDoHost());
const PERFIS = quickProfilesForHost("after-effects");

test("todo QuickProfile do After Effects tem comando registrado no host", () => {
  assert.ok(PERFIS.length > 0, "nenhum QuickProfile registrado — o teste não mediria nada");
  for (const { commandId } of PERFIS) {
    assert.ok(
      escopo.MotionRegistry.get(commandId),
      `${commandId} tem QuickProfile mas não está registrado no host`
    );
  }
});

for (const { commandId, profile } of PERFIS) {
  test(`${commandId}: os argumentos derivados passam pelo preflight do host`, () => {
    const handler = escopo.MotionRegistry.get(commandId);

    for (const { nome, contexto } of contextos()) {
      const args = profile.derive ? profile.derive(contexto) : {};
      const falha = handler.preflight(args, {}, { emitLiveControls: true });

      if (falha && falha.code === "INVALID_PRESET") {
        assert.fail(
          `${commandId} recusou os próprios argumentos (${nome}): ${falha.message} ` +
            `${JSON.stringify(falha.details)} — argumentos: ${JSON.stringify(args)}`
        );
      }
    }
  });
}

test("o instrumento: todo comando com derive recusa um campo a mais", () => {
  // Se este teste falhar, os de cima estavam passando de graça — seria sinal de
  // que o preflight desiste (por seleção vazia, por exemplo) antes de olhar os
  // argumentos, e a aprovação não significaria nada.
  //
  // Comando sem `derive` fica de fora porque não recebe argumento nenhum: nele
  // não há formato para estragar.
  const comDerive = PERFIS.filter(({ profile }) => Boolean(profile.derive));
  assert.ok(comDerive.length >= 10, "poucos perfis com derive — o instrumento cobriria pouco");

  const contexto = contextos()[0].contexto;
  for (const { commandId, profile } of comDerive) {
    const args = { ...profile.derive(contexto), campoQueNaoExiste: true };
    const falha = escopo.MotionRegistry.get(commandId).preflight(args, {}, {});
    assert.ok(falha, `${commandId} aceitou um argumento que não existe`);
    assert.equal(
      falha.code,
      "INVALID_PRESET",
      `${commandId} devia recusar pelo argumento a mais, e recusou por ${falha.code}`
    );
  }
});

test("o instrumento: valor fora do dominio e campo faltando tambem sao recusados", () => {
  // Os outros dois modos de falha de um `derive` malfeito: valor de um conjunto
  // fechado escrito errado, e campo obrigatório esquecido.
  const forasDeDominio = [
    ["ae.layer.flip", { axis: "diagonal", pivot: "anchor", groupMode: "each", preserveTextReadability: true }],
    ["ae.layer.reverse-order", { scope: "tudo", preserveTrackMattes: true, preserveParents: true, reverseTimingToo: false }],
    ["ae.keys.send-to-edge", { edge: "meio", reference: "comp" }],
    ["ae.layer.create-null", { placement: "meio", dimension: "2d", parentSelected: false, preserveWorldTransform: true, size: 100, label: 0 }]
  ];

  for (const [commandId, args] of forasDeDominio) {
    const falha = escopo.MotionRegistry.get(commandId).preflight(args, {}, {});
    assert.equal(falha?.code, "INVALID_PRESET", `${commandId} aceitou valor fora do domínio`);
  }

  const faltando = escopo.MotionRegistry.get("ae.layer.flip").preflight(
    { axis: "horizontal", pivot: "anchor", groupMode: "each" },
    {},
    {}
  );
  assert.equal(faltando?.code, "INVALID_PRESET");
  assert.equal(faltando.details?.field, "preserveTextReadability");
});

