/**
 * Derivação da matriz de capacidades.
 *
 * `buildCapabilities` é **pura**: recebe fatos crus e devolve a matriz. Cada host
 * coleta os fatos do seu jeito — o After Effects por um comando no ExtendScript,
 * o Premiere lendo o módulo direto — e a derivação é a mesma nos dois. Isso é o
 * que impede as duas plataformas de divergirem em silêncio sobre o que
 * significa "disponível".
 *
 * A regra que atravessa o arquivo inteiro: **um fato que não pôde ser medido é
 * `"unknown"`, nunca `false`**. Colapsar em `false` faria a interface afirmar que
 * um recurso está indisponível quando ninguém verificou; colapsar em `true` seria
 * pior. `"unknown"` é a única resposta que não mente, e obriga a interface a
 * dizer "não foi possível determinar" — que é a informação que o usuário precisa
 * para saber que precisa investigar.
 */
import type {
  CapabilityFinding,
  CapabilityKey,
  HostCapabilities,
  HostId
} from "@motion/contracts";

import { tierFor, tierReasonKey } from "./tiers.js";
import { parseHostVersion } from "./version.js";

/**
 * Resultado cru de uma sonda.
 *
 * `true`/`false` significam medido. `"unknown"` significa que a sonda não pôde
 * concluir — leitura que lançou, símbolo que não pôde ser inspecionado, host que
 * não respondeu.
 */
export type ProbeResult = boolean | "unknown";

export interface ProbeFacts {
  host: HostId;
  hostVersion: string;

  hasProject: ProbeResult;
  hasActiveComp?: ProbeResult;
  hasActiveSequence?: ProbeResult;

  canWriteFiles: ProbeResult;
  canAccessNetwork: ProbeResult;

  canUseNativeAddon: ProbeResult;
  canReachCompanion: ProbeResult;

  canInsertMogrt: ProbeResult;
  canReadTranscript: ProbeResult;
  canImportTranscript: ProbeResult;
  canQueryTranscriptLanguages: ProbeResult;
  canReadCaptionTracks: ProbeResult;

  expressionEngine?: string | null;

  /**
   * Razões conhecidas por capacidade.
   *
   * Onde o motivo é sabido — "não empacotado neste build", "a preferência do
   * host está desligada" —, ele é muito mais útil que um `false` mudo. A §9
   * exige que todo botão desabilitado explique exatamente qual requisito falta.
   */
  reasons?: Partial<Record<CapabilityKey, string>>;
}

function toFinding(result: ProbeResult, reasonKey?: string): CapabilityFinding {
  if (result === true) return { state: "available" };
  if (result === "unknown") {
    return { state: "unknown", reasonKey: reasonKey ?? "capability.reason.couldNotDetermine" };
  }
  return { state: "unavailable", reasonKey: reasonKey ?? "capability.reason.notAvailable" };
}

/**
 * Um `ProbeResult` vira `boolean` para os campos que a §9 declara booleanos.
 *
 * `"unknown"` vira `false` **apenas aqui**, e apenas porque o tipo do contrato
 * não tem terceiro estado. O estado real sobrevive em `findings`, e é dele que a
 * interface tira o que mostrar. O código que decide se pode executar algo usa o
 * booleano, e para essa decisão "não sei" precisa se comportar como "não" — é o
 * lado seguro.
 */
function toBoolean(result: ProbeResult): boolean {
  return result === true;
}

/**
 * Tipo de retorno estreitado de proposito.
 *
 * `HostCapabilities["expressionEngine"]` inclui `undefined`, porque o campo e
 * opcional no contrato — ele nao existe no Premiere. Mas esta funcao nunca
 * devolve `undefined`: entrada ausente ou irreconhecivel vira `"unknown"`, que e
 * a resposta honesta. Declarar o tipo largo faria `exactOptionalPropertyTypes`
 * recusar a atribuicao, e o certo e estreitar aqui e nao afrouxar o contrato.
 */
type ExpressionEngine = "javascript" | "legacy" | "unknown";

function normalizeExpressionEngine(raw: string | null | undefined): ExpressionEngine {
  if (typeof raw !== "string" || raw === "") return "unknown";
  const value = raw.toLowerCase();
  if (value.includes("javascript")) return "javascript";
  if (value.includes("extendscript") || value.includes("legacy")) return "legacy";
  // Um valor que existe mas não é reconhecido não é "javascript" por otimismo.
  return "unknown";
}

export function buildCapabilities(facts: ProbeFacts): HostCapabilities {
  const parsed = parseHostVersion(facts.hostVersion);
  const reasons = facts.reasons ?? {};

  const findings: Partial<Record<CapabilityKey, CapabilityFinding>> = {
    hasProject: toFinding(facts.hasProject, reasons.hasProject),
    canWriteFiles: toFinding(facts.canWriteFiles, reasons.canWriteFiles),
    canAccessNetwork: toFinding(facts.canAccessNetwork, reasons.canAccessNetwork),
    canUseNativeAddon: toFinding(facts.canUseNativeAddon, reasons.canUseNativeAddon),
    canReachCompanion: toFinding(facts.canReachCompanion, reasons.canReachCompanion),
    canInsertMogrt: toFinding(facts.canInsertMogrt, reasons.canInsertMogrt),
    canReadTranscript: toFinding(facts.canReadTranscript, reasons.canReadTranscript),
    canImportTranscript: toFinding(facts.canImportTranscript, reasons.canImportTranscript),
    canQueryTranscriptLanguages: toFinding(
      facts.canQueryTranscriptLanguages,
      reasons.canQueryTranscriptLanguages
    ),
    canReadCaptionTracks: toFinding(facts.canReadCaptionTracks, reasons.canReadCaptionTracks)
  };

  // Campos que só um dos hosts responde. `hasActiveComp` não significa nada no
  // Premiere e `hasActiveSequence` não significa nada no After Effects; emitir
  // os dois em toda matriz produziria linhas permanentemente vermelhas na tela
  // de System Check para coisas que não existem naquele host.
  if (facts.hasActiveComp !== undefined) {
    findings.hasActiveComp = toFinding(facts.hasActiveComp, reasons.hasActiveComp);
  }
  if (facts.hasActiveSequence !== undefined) {
    findings.hasActiveSequence = toFinding(facts.hasActiveSequence, reasons.hasActiveSequence);
  }

  const expressionEngine = normalizeExpressionEngine(facts.expressionEngine);
  if (facts.host === "after-effects") {
    findings.expressionEngine =
      expressionEngine === "unknown"
        ? { state: "unknown", reasonKey: "capability.reason.couldNotDetermine" }
        : { state: "available" };
  }

  const capabilities: HostCapabilities = {
    host: facts.host,
    hostVersion: facts.hostVersion,
    // Sem versão legível não há tier a afirmar. `unsupported` seria uma
    // afirmação forte sobre algo que não foi medido.
    supportTier: parsed ? tierFor(facts.host, parsed) : "unknown",

    hasProject: toBoolean(facts.hasProject),
    canWriteFiles: toBoolean(facts.canWriteFiles),
    canAccessNetwork: toBoolean(facts.canAccessNetwork),
    canUseNativeAddon: toBoolean(facts.canUseNativeAddon),
    canReachCompanion: toBoolean(facts.canReachCompanion),
    canInsertMogrt: toBoolean(facts.canInsertMogrt),
    canReadTranscript: toBoolean(facts.canReadTranscript),
    canImportTranscript: toBoolean(facts.canImportTranscript),
    canQueryTranscriptLanguages: toBoolean(facts.canQueryTranscriptLanguages),
    canReadCaptionTracks: toBoolean(facts.canReadCaptionTracks),
    findings
  };

  if (facts.hasActiveComp !== undefined) {
    capabilities.hasActiveComp = toBoolean(facts.hasActiveComp);
  }
  if (facts.hasActiveSequence !== undefined) {
    capabilities.hasActiveSequence = toBoolean(facts.hasActiveSequence);
  }
  if (facts.host === "after-effects") {
    capabilities.expressionEngine = expressionEngine;
  }

  if (!parsed) {
    capabilities.findings.hasProject = capabilities.findings.hasProject ?? { state: "unknown" };
  }

  // O snapshot precisa ser imutavel por inteiro. Congelar apenas o envelope
  // ainda permitiria alterar uma finding sem executar uma nova sonda.
  for (const key in capabilities.findings) {
    if (Object.prototype.hasOwnProperty.call(capabilities.findings, key)) {
      const finding = capabilities.findings[key as CapabilityKey];
      if (finding) {
        Object.freeze(finding);
      }
    }
  }
  Object.freeze(capabilities.findings);

  // Congelado: a matriz é um instantâneo do que foi medido. Se um consumidor
  // pudesse alterá-la, um relatório de diagnóstico deixaria de refletir o que a
  // sonda realmente encontrou.
  return Object.freeze(capabilities);
}

/**
 * Chave i18n do tier, para a linha de resumo da tela de System Check.
 */
export function summaryReasonKey(capabilities: HostCapabilities): string {
  return tierReasonKey(capabilities.host, capabilities.supportTier);
}
