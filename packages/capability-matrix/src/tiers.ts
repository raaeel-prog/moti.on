/**
 * Faixas de suporte por host.
 *
 * O tier é um **rótulo**, e é tudo o que a versão decide. Ele responde "quanto
 * deste produto é esperado funcionar nesta instalação" e serve para a mensagem
 * que o usuário lê. Não decide se um comando roda: isso é a sonda de símbolo.
 *
 * A distinção importa porque as duas coisas divergem na prática. Um Premiere
 * 26.3 com o módulo de transcrição indisponível tem tier `full` e a capacidade
 * ausente; um 26.2 pode ter a capacidade presente. Colapsar as duas num número
 * só é o que produz um botão desabilitado sem explicação.
 */
import type { HostId, SupportTier } from "@motion/contracts";

import { isAtLeast, isBelow, type HostVersion } from "./version.js";

/**
 * Premiere Pro, conforme §4.2 do master spec.
 *
 * `unsupported` abaixo de 25.6 é, na prática, inalcançável: o `host.minVersion`
 * do manifest já impede o plugin de carregar. Fica declarado mesmo assim porque
 * o código não deve depender de uma proteção que vive noutro arquivo.
 */
export function premiereTier(version: HostVersion): SupportTier {
  if (isBelow(version, "25.6.0")) return "unsupported";
  if (isAtLeast(version, "26.3.0")) return "full";
  if (isAtLeast(version, "26.2.0")) return "compatible";
  return "baseline";
}

/**
 * After Effects.
 *
 * **A especificação não define tiers para o After Effects.** A §4.2 só descreve
 * as faixas do Premiere. Estes valores são proposta, não transcrição, e estão
 * registrados em `docs/adr/0003-tiers-de-suporte-after-effects.md` — inventar em
 * silêncio uma regra que o documento normativo não tem seria pior do que
 * declarar a lacuna.
 *
 * O manifest CSXS declara `Version="[25.0,99.9]"`, então o CEP já recusa
 * carregar abaixo de 25.0 e `unsupported` também é quase inalcançável aqui.
 */
export function afterEffectsTier(version: HostVersion): SupportTier {
  if (isBelow(version, "25.0.0")) return "unsupported";
  return "full";
}

export function tierFor(host: HostId, version: HostVersion): SupportTier {
  return host === "premiere-pro" ? premiereTier(version) : afterEffectsTier(version);
}

/**
 * Chave i18n explicando o tier. Chave, e não frase: o usuário lê no idioma dele.
 */
export function tierReasonKey(host: HostId, tier: SupportTier): string {
  return `capability.tier.${host === "premiere-pro" ? "premiere" : "afterEffects"}.${tier}`;
}
