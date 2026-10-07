/**
 * O `QuickProfile` declara quais Live Controls a ferramenta cria; o comando no
 * host declara a mesma lista de novo, em ExtendScript. As duas listas existem
 * porque as duas pontas precisam dela e não compartilham módulo — o host não
 * importa TypeScript.
 *
 * A duplicação é intencional, mas só é segura se alguém conferir. É para isso
 * que `validateLiveControlParity` existe no registry, e é o que este teste usa:
 * ele compara `paramId` e `order` das duas pontas.
 *
 * O que quebra sem este guarda: acrescentar um slider no host e esquecer o
 * perfil faz o painel mostrar três controles e o After Effects ganhar quatro.
 * Trocar a ordem faz o painel rotular o slider errado. Nenhum dos dois produz
 * erro — só um plugin que mente sobre si mesmo.
 *
 * ## Perfis sem Live Controls entram no mesmo guarda
 *
 * As ferramentas de operação — Null, Espelhar, Inverter ordem — declaram
 * `liveControls: []`, porque não há valor contínuo a controlar depois que a
 * operação terminou. Elas NÃO ficam de fora daqui: um perfil vazio é uma
 * afirmação verificável — "este comando não materializa controle nenhum" — e o
 * teste a confere lendo o fonte do host. Dispensá-las transformaria o vazio
 * numa desculpa, e o dia em que alguém acrescentasse `LIVE_BINDINGS` num desses
 * comandos o painel prometeria zero controles enquanto o After Effects ganharia
 * quatro, sem nada quebrar.
 */
import { numericBindings } from "../apps/after-effects-cep/tests/quick-binding-harness.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  quickProfilesForHost,
  validateLiveControlParity
} from "../packages/command-registry/dist/index.js";

/** Onde vive a lista do host, por comando. Precisa cobrir TODO QuickProfile. */
const FONTE_DO_HOST = new Map([
  ["ae.expression.wiggle", "apps/after-effects-cep/host/src/commands/expression-wiggle.jsx"],
  ["ae.expression.flicker", "apps/after-effects-cep/host/src/commands/expression-flicker.jsx"],
  ["ae.audio.beat", "apps/after-effects-cep/host/src/commands/audio-beat.jsx"],
  ["ae.animate.inertial", "apps/after-effects-cep/host/src/commands/animate-inertial.jsx"],
  ["ae.expression.smooth", "apps/after-effects-cep/host/src/commands/expression-smooth.jsx"],
  ["ae.expression.loopout", "apps/after-effects-cep/host/src/commands/expression-loopout.jsx"],
  ["ae.layer.create-null", "apps/after-effects-cep/host/src/commands/layer-create-null.jsx"],
  ["ae.layer.flip", "apps/after-effects-cep/host/src/commands/layer-flip.jsx"],
  ["ae.layer.reverse-order", "apps/after-effects-cep/host/src/commands/layer-reverse-order.jsx"],
  ["ae.anchor.align", "apps/after-effects-cep/host/src/commands/anchor-align.jsx"],
  ["ae.keys.reverse", "apps/after-effects-cep/host/src/commands/keys-reverse.jsx"],
  ["ae.keys.reverse-values", "apps/after-effects-cep/host/src/commands/keys-reverse-values.jsx"],
  ["ae.keys.send-to-edge", "apps/after-effects-cep/host/src/commands/keys-send-to-edge.jsx"]
]);

async function fonteDoHost(caminho) {
  return readFile(new URL(`../${caminho}`, import.meta.url), "utf8");
}

/**
 * Lê `LIVE_BINDINGS` do fonte do host.
 *
 * Leitura de texto, e não import: o arquivo é ExtendScript e não carrega em
 * Node sem o harness inteiro do host. `paramId` e `order` são o suficiente —
 * são exatamente os dois campos que a paridade do contrato A9 compara.
 */
async function bindingsDoHost(caminho) {
  const kind = /expression-(wiggle|flicker|smooth|loopout)\.jsx$/.exec(caminho)?.[1];
  if (kind) return (await numericBindings(kind)).map(({paramId,order}) => ({paramId,order}));
  const fonte = await fonteDoHost(caminho);
  const inicio = fonte.indexOf("var LIVE_BINDINGS");
  assert.ok(inicio >= 0, `LIVE_BINDINGS não encontrado em ${caminho}`);
  const fim = fonte.indexOf("\n  ]);", inicio);
  assert.ok(fim > inicio, `fim de LIVE_BINDINGS não encontrado em ${caminho}`);
  const bloco = fonte.slice(inicio, fim);

  const encontrados = [
    ...bloco.matchAll(/paramId:\s*"([^"]+)"[\s\S]*?order:\s*(\d+)/g)
  ].map((m) => ({ paramId: m[1], order: Number(m[2]) }));

  assert.ok(encontrados.length > 0, `nenhum binding lido de ${caminho}`);
  return encontrados;
}

test("o extrator le mesmo os bindings do host, e nao um trecho qualquer", async () => {
  // Instrumento antes da medida: um extrator que devolvesse lista vazia faria
  // a paridade passar sem comparar nada.
  const lidos = await bindingsDoHost(FONTE_DO_HOST.get("ae.expression.wiggle"));
  assert.deepEqual(
    lidos.map((b) => b.paramId),
    ["frequency", "amplitude", "seed", "intensity", "enabled", "octaves", "amplitudeMultiplier"]
  );
  assert.deepEqual(
    lidos.map((b) => b.order),
    [1, 2, 3, 4, 5, 6, 7]
  );
});

test("todo comando com QuickProfile tem a lista do host conferida aqui", async () => {
  // Sem isto, uma ferramenta nova com QuickProfile entraria sem paridade
  // nenhuma e o guarda passaria a proteger só o que já existia.
  const comPerfil = quickProfilesForHost("after-effects").map((r) => r.commandId);
  const semConferencia = comPerfil.filter((id) => !FONTE_DO_HOST.has(id));
  assert.deepEqual(
    semConferencia,
    [],
    "estes comandos declaram QuickProfile e ninguém confere a lista do host"
  );
});

test("a tabela nao guarda comando que perdeu o QuickProfile", async () => {
  // A checagem contrária: uma entrada órfã aqui daria a impressão de cobertura
  // sobre um perfil que não existe mais.
  const comPerfil = new Set(quickProfilesForHost("after-effects").map((r) => r.commandId));
  const orfaos = [...FONTE_DO_HOST.keys()].filter((id) => !comPerfil.has(id));
  assert.deepEqual(orfaos, [], "estas entradas conferem um QuickProfile que não existe");
});

for (const [commandId, caminho] of FONTE_DO_HOST) {
  test(`${commandId}: perfil e host materializam os mesmos Live Controls`, async () => {
    const registro = quickProfilesForHost("after-effects").find((r) => r.commandId === commandId);
    assert.ok(registro, `${commandId} não tem QuickProfile registrado`);

    const esperado = registro.profile.liveControls.map((b) => ({
      paramId: b.paramId,
      order: b.order
    }));

    if (esperado.length === 0) {
      // Perfil de operação. O vazio é a afirmação a conferir: o host não pode
      // ter uma lista de bindings que o painel não anuncia.
      const fonte = await fonteDoHost(caminho);
      assert.equal(
        fonte.includes("var LIVE_BINDINGS"),
        false,
        `${commandId}: o perfil declara zero Live Controls, mas o host tem LIVE_BINDINGS`
      );
      return;
    }

    const real = await bindingsDoHost(caminho);
    const resultado = validateLiveControlParity(esperado, real);
    assert.equal(
      resultado.valid,
      true,
      `${commandId}: ` + resultado.issues.map((i) => `${i.path} ${i.message}`).join("; ")
    );
  });
}
