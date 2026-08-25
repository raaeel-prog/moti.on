/**
 * Matriz de capacidades por host, conforme §9 do master spec.
 *
 * A regra que dá sentido ao arquivo inteiro: *"Nenhuma feature deve depender
 * apenas de `parseFloat(hostVersion)`."* Versão serve para rotular o tier e para
 * decidir se vale a pena tentar sondar; nunca para liberar ou bloquear uma
 * funcionalidade sozinha. O que libera é a presença do símbolo.
 *
 * A implementação das sondas fica em `packages/capability-matrix` (CHMS-006).
 * Aqui só mora o formato, porque tanto o painel quanto o host precisam concordar
 * sobre ele antes de qualquer sonda existir.
 */
import type { HostId } from "./protocol.js";

/**
 * Faixas de suporte. As do Premiere vêm da §4.2; as do After Effects não são
 * definidas pela especificação e estão propostas em
 * `docs/adr/0003-tiers-de-suporte-after-effects.md`.
 */
export type SupportTier = "full" | "compatible" | "baseline" | "unsupported" | "unknown";

/**
 * Estado de uma capacidade sondada.
 *
 * `"unknown"` não é enfeite. Algumas sondas podem lançar — ler uma preferência
 * do After Effects, por exemplo — e nesse caso a resposta honesta é "não foi
 * possível determinar". Colapsar isso em `false` faria a interface afirmar que
 * um recurso está indisponível quando ninguém verificou, e colapsar em `true`
 * seria pior ainda.
 */
export type CapabilityState = "available" | "unavailable" | "unknown";

export interface CapabilityFinding {
  state: CapabilityState;
  /**
   * Chave i18n explicando o estado. Obrigatória quando não é `"available"`.
   *
   * A §9 exige que todo botão desabilitado explique exatamente qual requisito
   * falta. Sem uma razão que resolva nas duas traduções, a interface só consegue
   * dizer "indisponível", que não ajuda ninguém.
   */
  reasonKey?: string;
}

/**
 * Formato verbatim da §9. Os campos opcionais são os que só um dos hosts
 * responde: `hasActiveComp` não significa nada no Premiere, e `hasActiveSequence`
 * não significa nada no After Effects.
 */
export interface HostCapabilities {
  host: HostId;
  hostVersion: string;
  supportTier: SupportTier;

  hasProject: boolean;
  hasActiveComp?: boolean;
  hasActiveSequence?: boolean;

  canWriteFiles: boolean;
  canAccessNetwork: boolean;

  canUseNativeAddon: boolean;
  canReachCompanion: boolean;

  canInsertMogrt: boolean;
  canReadTranscript: boolean;
  canImportTranscript: boolean;
  canQueryTranscriptLanguages: boolean;
  canReadCaptionTracks: boolean;

  expressionEngine?: "javascript" | "legacy" | "unknown";

  /**
   * Detalhe por capacidade, para a view Settings → System Check.
   *
   * Os booleanos acima são o que o código consulta; este mapa é o que a
   * interface mostra. Um booleano `false` sozinho não distingue "o host não
   * suporta" de "não conseguimos verificar" de "existe mas não foi empacotado
   * neste build", e essas três coisas pedem mensagens diferentes.
   */
  findings: Partial<Record<CapabilityKey, CapabilityFinding>>;
}

export type CapabilityKey =
  | "hasProject"
  | "hasActiveComp"
  | "hasActiveSequence"
  | "canWriteFiles"
  | "canAccessNetwork"
  | "canUseNativeAddon"
  | "canReachCompanion"
  | "canInsertMogrt"
  | "canReadTranscript"
  | "canImportTranscript"
  | "canQueryTranscriptLanguages"
  | "canReadCaptionTracks"
  | "expressionEngine";

/**
 * Requisito declarado por um comando no seu descriptor. O dispatcher recusa o
 * comando antes de qualquer mutação quando um requisito não é atendido.
 */
export type CapabilityRequirement = CapabilityKey;
