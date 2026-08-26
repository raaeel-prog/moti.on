import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import { ERROR_META } from "../../contracts/dist/index.js";
import { createI18n, interpolate, normalizeLocale } from "../dist/i18n.js";
import { CATALOGS, FALLBACK_LOCALE } from "../dist/locales.js";

const ARQUIVOS_COM_CHAVE_LITERAL = [
  "apps/after-effects-cep/client/src/main.ts",
  "apps/premiere-uxp/client/src/main.ts"
];

const DIRETORIOS_QUE_PRODUZEM_CAPACIDADES = [
  new URL("../../capability-matrix/src/", import.meta.url),
  new URL("../../../apps/after-effects-cep/host/src/", import.meta.url),
  new URL("../../../apps/premiere-uxp/host/src/", import.meta.url)
];

async function listarFontes(diretorio) {
  const arquivos = [];

  for (const entrada of await readdir(diretorio, { withFileTypes: true })) {
    const url = new URL(entrada.name + (entrada.isDirectory() ? "/" : ""), diretorio);
    if (entrada.isDirectory()) {
      arquivos.push(...(await listarFontes(url)));
    } else if (/\.(?:ts|tsx|js|jsx)$/.test(entrada.name)) {
      arquivos.push(url);
    }
  }

  return arquivos;
}

test("aceita o formato com underscore que o After Effects realmente devolve", () => {
  // Medido em host real: appUILocale = "pt_BR" no After Effects 26.3. Uma
  // comparacao direta com "pt-BR" jogaria todo usuario brasileiro no ingles.
  assert.equal(normalizeLocale("pt_BR"), "pt-BR");
  assert.equal(normalizeLocale("pt-BR"), "pt-BR");
  assert.equal(normalizeLocale("pt"), "pt-BR");
  assert.equal(normalizeLocale("en_US"), "en-US");
});

test("idioma sem catalogo devolve null, e nao o fallback", () => {
  // Quem chama decide o que fazer, e o teste distingue "nao suportado" de
  // "caiu no ingles".
  assert.equal(normalizeLocale("ja-JP"), null);
  assert.equal(normalizeLocale(undefined), null);
  assert.equal(normalizeLocale(""), null);
});

test("idioma nao suportado cai no fallback em ingles", () => {
  const i18n = createI18n({ locale: "ja-JP" });

  assert.equal(i18n.locale(), FALLBACK_LOCALE);
  assert.equal(i18n.t("nav.context"), "Context");
});

test("interpola parametros sem concatenar fragmentos traduzidos", () => {
  const i18n = createI18n({ locale: "pt-BR" });

  assert.equal(i18n.t("message.logsCleared", { count: 12 }), "Registros removidos: 12.");
  assert.equal(interpolate("{a} e {b}", { a: 1, b: 2 }), "1 e 2");
});

test("parametro ausente deixa o marcador visivel em vez de escrever undefined", () => {
  assert.equal(interpolate("{count} registros", {}), "{count} registros");
});

test("chave inexistente devolve a propria chave", () => {
  // Feio de proposito: aparece no teste e na revisao, enquanto string vazia
  // passaria despercebida ate um usuario ver um rotulo em branco.
  const i18n = createI18n({ locale: "pt-BR" });

  assert.equal(i18n.t("chave.inexistente"), "chave.inexistente");
  assert.equal(i18n.has("chave.inexistente"), false);
});

test("pt-BR exibe virgula decimal sem alterar o numero de origem", () => {
  // Arrange
  const ptBR = createI18n({ locale: "pt-BR" });
  const enUS = createI18n({ locale: "en-US" });
  const valor = 29.97;

  // Act + Assert
  assert.equal(ptBR.formatNumber(valor, 2), "29,97");
  assert.equal(enUS.formatNumber(valor, 2), "29.97");
  assert.equal(valor, 29.97, "a representacao interna nao pode mudar");
});

test("formatNumber devolve o tracinho para valor ausente ou invalido", () => {
  const i18n = createI18n({ locale: "pt-BR" });

  assert.equal(i18n.formatNumber(null), "—");
  assert.equal(i18n.formatNumber(undefined), "—");
  assert.equal(i18n.formatNumber(Number.NaN), "—");
  assert.equal(i18n.formatNumber(Number.POSITIVE_INFINITY), "—");
});

test("setLocale troca o idioma em tempo de execucao", () => {
  const i18n = createI18n({ locale: "pt-BR" });

  assert.equal(i18n.t("nav.system"), "Sistema");
  assert.equal(i18n.setLocale("en_US"), "en-US");
  assert.equal(i18n.t("nav.system"), "System");
});

test("os dois catalogos declaram exatamente as mesmas chaves", () => {
  // A paridade ja e garantida pelo tipo; o teste existe para o caso de alguem
  // afrouxar a tipagem de CATALOGS no futuro.
  const chaves = Object.values(CATALOGS).map((catalogo) => Object.keys(catalogo).sort());

  for (const conjunto of chaves) {
    assert.deepEqual(conjunto, chaves[0]);
  }
});

test("nenhuma mensagem ficou sem traduzir entre os catalogos", () => {
  // Copiar o portugues para o catalogo ingles e o jeito mais comum de "traduzir"
  // sem traduzir. Termos que sao iguais nos dois idiomas ficam de fora.
  const iguaisPorNatureza = new Set([
    "app.title",
    "app.subtitle.afterEffects",
    "app.subtitle.premiere",
    // Nomes proprios das expressoes do After Effects: traduzir "Smooth" faria o
    // rotulo divergir do que a documentacao da Adobe chama. As descricoes de
    // cada ferramenta, essas sim, sao traduzidas — e o teste as cobre.
    "tool.loopOut.name",
    "tool.smooth.name",
    "tool.wiggle.name",
    "tool.flicker.name",
    // Simbolo de unidade e nome de parametro iguais nos dois idiomas.
    "wiggle.unit.hertz",
    "wiggle.amplitude",
    "flicker.unit.perSecond",
    // Simbolo de unidade, igual nos dois idiomas.
    "smooth.unit.seconds",
    "textBox.unit.px",
    "textBox.unit.percent",
    // Nome proprio e simbolos de dimensao, iguais nos dois idiomas.
    "tool.createNull.name",
    "createNull.dimension.2d",
    "createNull.dimension.3d",
    "context.compositionValue",
    "value.none",
    "error.withCode"
  ]);

  const ptBR = CATALOGS["pt-BR"];
  const enUS = CATALOGS["en-US"];
  const suspeitas = Object.keys(ptBR).filter(
    (chave) => !iguaisPorNatureza.has(chave) && ptBR[chave] === enUS[chave]
  );

  assert.deepEqual(suspeitas, []);
});

test("toda chave literal usada nos paineis existe no catalogo", async () => {
  // Arrange
  const i18n = createI18n({ locale: "pt-BR" });
  const ausentes = [];

  // Act
  for (const arquivo of ARQUIVOS_COM_CHAVE_LITERAL) {
    const source = await readFile(new URL(`../../../${arquivo}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/i18n\.t\(\s*"([^"{]+)"\s*[,)]/g)) {
      if (!i18n.has(match[1])) ausentes.push(`${arquivo}: ${match[1]}`);
    }
  }

  // Assert
  assert.deepEqual(ausentes, []);
});

test("as chaves montadas por template tambem existem", () => {
  // Os paineis montam capability.key.*, capability.state.*, capability.tier.* e
  // capability.reason.* a partir do dado da matriz de capacidades.
  const i18n = createI18n({ locale: "pt-BR" });

  const capacidades = [
    "hasProject", "hasActiveComp", "hasActiveSequence", "canWriteFiles",
    "canAccessNetwork", "canUseNativeAddon", "canReachCompanion", "canInsertMogrt",
    "canReadTranscript", "canImportTranscript", "canQueryTranscriptLanguages",
    "canReadCaptionTracks", "expressionEngine"
  ];
  const tiers = ["full", "compatible", "baseline", "unsupported", "unknown"];

  for (const chave of capacidades) {
    assert.equal(i18n.has(`capability.key.${chave}`), true, chave);
  }
  for (const estado of ["available", "unavailable", "unknown"]) {
    assert.equal(i18n.has(`capability.state.${estado}`), true, estado);
  }
  for (const tier of tiers) {
    assert.equal(i18n.has(`capability.tier.afterEffects.${tier}`), true, tier);
    assert.equal(i18n.has(`capability.tier.premiere.${tier}`), true, tier);
  }
  for (const motivo of ["couldNotDetermine", "notAvailable"]) {
    assert.equal(i18n.has(`capability.reason.${motivo}`), true, motivo);
  }
});

test("os motivos que a matriz e os dois hosts emitem tem traducao", async () => {
  // Le as chaves direto de todos os produtores. Um probe de host pode emitir um
  // motivo que nao aparece na matriz compartilhada.
  const i18n = createI18n({ locale: "pt-BR" });
  const encontradas = new Set();

  for (const diretorio of DIRETORIOS_QUE_PRODUZEM_CAPACIDADES) {
    for (const arquivo of await listarFontes(diretorio)) {
      const source = await readFile(arquivo, "utf8");
      for (const match of source.matchAll(/["'](capability\.reason\.[a-zA-Z0-9._-]+)["']/g)) {
        encontradas.add(match[1]);
      }
    }
  }

  const semTraducao = [...encontradas].filter((chave) => !i18n.has(chave));

  assert.deepEqual(semTraducao, []);
  assert.ok(encontradas.size > 0, "o teste precisa ter encontrado algum motivo");
});

test("toda acao corretiva declarada em ERROR_META tem traducao", () => {
  const i18n = createI18n({ locale: "pt-BR" });
  const encontradas = new Set();

  for (const metadata of Object.values(ERROR_META)) {
    if (metadata.actionKey) {
      encontradas.add(metadata.actionKey);
    }
  }

  const semTraducao = [...encontradas].filter((chave) => !i18n.has(chave));

  assert.deepEqual(semTraducao, []);
  assert.ok(encontradas.size > 0, "o teste precisa ter encontrado alguma acao corretiva");
});
