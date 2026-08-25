import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterEffectsTier,
  buildCapabilities,
  compareVersions,
  createCapabilityStore,
  isAtLeast,
  parseHostVersion,
  premiereTier
} from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Comparacao de versao
// ---------------------------------------------------------------------------

test("parseFloat colocaria 25.10 abaixo de 25.9 — parseHostVersion nao", () => {
  // Este e o teste que da razao de existir ao modulo inteiro.
  // parseFloat("25.10") === 25.1, e 25.1 < 25.9. Um gate escrito com parseFloat
  // BLOQUEIA a versao mais nova e libera a mais velha, e nao falha em teste
  // nenhum enquanto os numeros menores nao passarem de 9.
  assert.ok(parseFloat("25.10") < parseFloat("25.9"), "Premissa do teste mudou.");

  const novo = parseHostVersion("25.10");
  const velho = parseHostVersion("25.9");
  assert.equal(compareVersions(novo, velho), 1, "25.10 precisa ser maior que 25.9.");
});

test("parseHostVersion le os formatos que os hosts realmente reportam", () => {
  // Os hosts Adobe nao tem formato unico. A regra e ler os numeros iniciais e
  // ignorar o resto, em vez de tentar entender cada variacao.
  const cases = [
    ["25.6.0", { major: 25, minor: 6, patch: 0 }],
    ["26.3", { major: 26, minor: 3, patch: 0 }],
    ["25", { major: 25, minor: 0, patch: 0 }],
    ["25.0x123", { major: 25, minor: 0, patch: 0 }],
    ["25.6.0 (Build 55)", { major: 25, minor: 6, patch: 0 }],
    ["  26.1.2  ", { major: 26, minor: 1, patch: 2 }]
  ];

  for (const [raw, expected] of cases) {
    const parsed = parseHostVersion(raw);
    assert.ok(parsed, `Não conseguiu ler "${raw}".`);
    assert.equal(parsed.major, expected.major, raw);
    assert.equal(parsed.minor, expected.minor, raw);
    assert.equal(parsed.patch, expected.patch, raw);
  }
});

test("parseHostVersion devolve null quando nao ha versao a ler", () => {
  // null e "não sei", e é diferente de 0.0.0, que seria "versão muito antiga".
  for (const raw of ["", "   ", "Unknown", null, undefined, 25.6, {}]) {
    assert.equal(parseHostVersion(raw), null, `"${String(raw)}" deveria produzir null.`);
  }
});

test("o pacote nao usa parseFloat em lugar nenhum", async () => {
  // A §9 proíbe depender de parseFloat(hostVersion). Uma varredura no fonte é o
  // que impede a prática de voltar num arquivo novo.
  const files = await readdir(path.join(packageRoot, "src"));
  for (const file of files) {
    const source = await readFile(path.join(packageRoot, "src", file), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!code.includes("parseFloat"), `parseFloat encontrado em src/${file}.`);
  }
});

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

test("as fronteiras de tier do Premiere batem com a especificacao", () => {
  const cases = [
    ["25.5.9", "unsupported"],
    ["25.6.0", "baseline"],
    ["26.1.9", "baseline"],
    ["26.2.0", "compatible"],
    ["26.2.7", "compatible"],
    ["26.3.0", "full"],
    ["27.0.0", "full"]
  ];

  for (const [version, expected] of cases) {
    assert.equal(premiereTier(parseHostVersion(version)), expected, `Premiere ${version}`);
  }
});

test("os tiers do After Effects sao proposta registrada, nao transcricao", () => {
  assert.equal(afterEffectsTier(parseHostVersion("24.9.9")), "unsupported");
  assert.equal(afterEffectsTier(parseHostVersion("25.0.0")), "full");
  assert.equal(afterEffectsTier(parseHostVersion("26.0.0")), "full");
});

test("isAtLeast compara componente a componente", () => {
  assert.ok(isAtLeast(parseHostVersion("26.10.0"), "26.9.0"));
  assert.ok(isAtLeast(parseHostVersion("25.6.0"), "25.6.0"));
  assert.ok(!isAtLeast(parseHostVersion("25.5.99"), "25.6.0"));
});

// ---------------------------------------------------------------------------
// Derivacao da matriz
// ---------------------------------------------------------------------------

function factsFor(overrides = {}) {
  return {
    host: "premiere-pro",
    hostVersion: "26.3.0",
    hasProject: true,
    hasActiveSequence: true,
    canWriteFiles: true,
    canAccessNetwork: false,
    canUseNativeAddon: false,
    canReachCompanion: false,
    canInsertMogrt: true,
    canReadTranscript: false,
    canImportTranscript: false,
    canQueryTranscriptLanguages: false,
    canReadCaptionTracks: false,
    ...overrides
  };
}

test("uma sonda que nao pode concluir vira unknown, nunca false", () => {
  // Colapsar "não sei" em false faria a interface AFIRMAR que um recurso está
  // indisponível quando ninguém verificou. Colapsar em true seria pior.
  const capabilities = buildCapabilities(factsFor({ canWriteFiles: "unknown" }));

  assert.equal(capabilities.findings.canWriteFiles.state, "unknown");
  assert.ok(capabilities.findings.canWriteFiles.reasonKey);

  // O booleano do contrato não tem terceiro estado, e para decidir se pode
  // executar algo "não sei" precisa se comportar como "não".
  assert.equal(capabilities.canWriteFiles, false);
});

test("toda capacidade indisponivel ou desconhecida traz uma chave de motivo", () => {
  // A §9 exige que todo botão desabilitado explique exatamente qual requisito
  // falta. Sem chave de motivo a interface só consegue dizer "indisponível".
  const capabilities = buildCapabilities(factsFor({ canReadTranscript: false }));

  for (const [key, finding] of Object.entries(capabilities.findings)) {
    if (finding.state === "available") continue;
    assert.ok(
      typeof finding.reasonKey === "string" && finding.reasonKey.length > 0,
      `${key} está "${finding.state}" sem chave de motivo.`
    );
    assert.match(finding.reasonKey, /^capability\./, `${key}: motivo precisa ser chave i18n.`);
  }
});

test("um motivo especifico da sonda vence o motivo generico", () => {
  const capabilities = buildCapabilities(
    factsFor({
      canUseNativeAddon: false,
      reasons: { canUseNativeAddon: "capability.reason.addonNotPackaged" }
    })
  );

  // "Não empacotado neste build" e "seu host não suporta" pedem ações
  // diferentes do usuário — a primeira não é culpa da instalação dele.
  assert.equal(capabilities.findings.canUseNativeAddon.reasonKey, "capability.reason.addonNotPackaged");
});

test("campos de outro host nao aparecem na matriz", () => {
  // hasActiveComp não significa nada no Premiere. Emitir os dois em toda matriz
  // produziria linhas permanentemente vermelhas na tela de System Check para
  // coisas que não existem naquele host.
  const premiere = buildCapabilities(factsFor());
  assert.equal(premiere.hasActiveComp, undefined);
  assert.equal(premiere.findings.hasActiveComp, undefined);
  assert.equal(premiere.findings.hasActiveSequence.state, "available");

  const ae = buildCapabilities(
    factsFor({ host: "after-effects", hostVersion: "25.0", hasActiveComp: true, hasActiveSequence: undefined })
  );
  assert.equal(ae.hasActiveSequence, undefined);
  assert.equal(ae.findings.hasActiveSequence, undefined);
  assert.equal(ae.hasActiveComp, true);
});

test("expressionEngine so existe no After Effects e nao chuta javascript", () => {
  const premiere = buildCapabilities(factsFor());
  assert.equal(premiere.expressionEngine, undefined);

  const cases = [
    ["javascript-1.0", "javascript"],
    ["extendscript", "legacy"],
    ["algo-que-ninguem-viu", "unknown"],
    ["", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"]
  ];

  for (const [raw, expected] of cases) {
    const ae = buildCapabilities(
      factsFor({ host: "after-effects", hostVersion: "25.0", expressionEngine: raw, hasActiveSequence: undefined })
    );
    assert.equal(ae.expressionEngine, expected, `expressionEngine "${String(raw)}"`);
  }
});

test("versao ilegivel nao produz um tier inventado", () => {
  const capabilities = buildCapabilities(factsFor({ hostVersion: "sei la" }));
  assert.equal(capabilities.supportTier, "unknown");
  assert.equal(capabilities.hostVersion, "sei la", "A string original precisa sobreviver para diagnóstico.");
});

test("a matriz e congelada", () => {
  // A matriz é um instantâneo do que foi medido. Se um consumidor pudesse
  // alterá-la, um relatório de diagnóstico deixaria de refletir a sonda.
  const capabilities = buildCapabilities(factsFor());
  assert.ok(Object.isFrozen(capabilities));
  assert.ok(Object.isFrozen(capabilities.findings));
  assert.ok(Object.isFrozen(capabilities.findings.canWriteFiles));
  assert.throws(() => {
    capabilities.findings.canWriteFiles.state = "unavailable";
  }, TypeError);
  assert.equal(capabilities.findings.canWriteFiles.state, "available");
});

// ---------------------------------------------------------------------------
// Cache de sessao
// ---------------------------------------------------------------------------

test("o store sonda uma vez e reaproveita", async () => {
  let probes = 0;
  const store = createCapabilityStore({
    probe: async () => {
      probes += 1;
      return buildCapabilities(factsFor());
    }
  });

  await store.get();
  await store.get();
  await store.get();

  assert.equal(probes, 1);
});

test("chamadas simultaneas compartilham a mesma sondagem", async () => {
  // Sem isto, dois botões clicados em sequência disparariam duas travessias
  // completas do evalScript para descobrir a mesma coisa.
  let probes = 0;
  const store = createCapabilityStore({
    probe: async () => {
      probes += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return buildCapabilities(factsFor());
    }
  });

  await Promise.all([store.get(), store.get(), store.get()]);
  assert.equal(probes, 1);
});

test("invalidate forca nova sondagem e registra o motivo", async () => {
  let probes = 0;
  const store = createCapabilityStore({
    probe: async () => {
      probes += 1;
      return buildCapabilities(factsFor());
    }
  });

  await store.get();
  store.invalidate("panel.visibilityChange");
  await store.get();

  assert.equal(probes, 2);
  assert.equal(store.lastInvalidationReason(), "panel.visibilityChange");
});

test("falha de sondagem nao fica em cache", async () => {
  // Guardar o erro deixaria a sessão inteira presa a uma indisponibilidade
  // momentânea.
  let attempt = 0;
  const store = createCapabilityStore({
    probe: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("host não respondeu");
      return buildCapabilities(factsFor());
    }
  });

  await assert.rejects(() => store.get(), /não respondeu/);
  const capabilities = await store.get();
  assert.equal(capabilities.host, "premiere-pro");
});

test("o store nao expoe nenhum caminho de persistencia", async () => {
  // A §9 exige cache por sessão apenas. Uma matriz persistida continuaria
  // afirmando o estado de ontem depois que o usuário ligasse uma preferência,
  // instalasse uma atualização ou conectasse a rede.
  const store = createCapabilityStore({ probe: async () => buildCapabilities(factsFor()) });

  assert.deepEqual(
    Object.keys(store).sort(),
    ["get", "invalidate", "lastInvalidationReason", "subscribe"],
    "Uma API nova no store precisa ser revisada: nada aqui pode escrever em disco."
  );

  const source = await readFile(path.join(packageRoot, "src/session-cache.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const name of ["localStorage", "sessionStorage", "writeFile", "setItem", "indexedDB"]) {
    assert.ok(!code.includes(name), `session-cache.ts referencia ${name}.`);
  }
});

test("subscribe notifica quando a matriz e recalculada", async () => {
  const seen = [];
  const store = createCapabilityStore({ probe: async () => buildCapabilities(factsFor()) });

  const unsubscribe = store.subscribe((capabilities) => seen.push(capabilities.supportTier));
  await store.get();
  store.invalidate("user.explicitRefresh");
  await store.get();

  unsubscribe();
  store.invalidate("user.explicitRefresh");
  await store.get();

  assert.deepEqual(seen, ["full", "full"], "O listener removido não pode continuar recebendo.");
});
