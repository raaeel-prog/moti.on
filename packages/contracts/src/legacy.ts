/**
 * Ponte entre o envelope legado do starter e o `CommandResponse` v1.
 *
 * O starter respondia `{ ok, data, error: { code, message, details } }` — sem
 * `protocolVersion`, sem `requestId`, sem `warnings`, sem `timing`, e com
 * códigos de erro que cada host inventava no lugar da chamada.
 *
 * Os quatro comandos que já funcionam continuam funcionando durante a transição,
 * e o painel passa a ver o formato novo. Quando o CHMS-004 e o CHMS-005
 * substituírem as duas camadas de host, esta ponte sai — e sair é o objetivo,
 * não um efeito colateral: uma camada de compatibilidade que nunca é removida
 * vira contrato permanente por inércia.
 */
import { ERROR_META, isErrorCode, type ErrorCode } from "./errors.js";
import {
  PROTOCOL_VERSION,
  type CommandFailure,
  type CommandResponse
} from "./protocol.js";

export interface LegacyEnvelope {
  ok: boolean;
  data: Record<string, unknown> | null;
  error: {
    code?: string;
    message?: string;
    details?: unknown;
    /** O host ExtendScript emitia `line` em vez de `details`. */
    line?: number | null;
  } | null;
}

/**
 * Códigos que os dois hosts emitiam, mapeados para a lista fechada da §8.
 *
 * `NO_ACTIVE_PROJECT` era o único que já coincidia. Os demais eram nomes locais:
 * o host do After Effects usava `AE_CONTEXT_ERROR`, o adapter do Premiere usava
 * `PREMIERE_CONTEXT_ERROR`, e o parser do protocolo usava três variações para
 * "a resposta veio malformada".
 */
export const LEGACY_CODE_MAP: Record<string, ErrorCode> = {
  NO_ACTIVE_PROJECT: "NO_ACTIVE_PROJECT",

  // Falhas ao ler o contexto do host: o host respondeu, mas a leitura estourou.
  AE_CONTEXT_ERROR: "HOST_OPERATION_FAILED",
  PREMIERE_CONTEXT_ERROR: "HOST_OPERATION_FAILED",
  AE_CREATE_COMP_ERROR: "HOST_OPERATION_FAILED",
  AFTER_EFFECTS_ERROR: "HOST_OPERATION_FAILED",

  // Falhas do autoteste: defeito do próprio plugin, não do projeto do usuário.
  SELF_TEST_FAILED: "INTERNAL_ERROR",
  SELF_TEST_ERROR: "INTERNAL_ERROR",

  // Falhas do canal entre painel e host. Todas viram HOST_OPERATION_FAILED
  // porque compartilham a consequência que importa: a operação PODE ter sido
  // aplicada no host, e o usuário precisa conferir o histórico de Undo. Tratá-las
  // como INTERNAL_ERROR sugeriria que nada aconteceu, o que não é verdade.
  EMPTY_HOST_RESPONSE: "HOST_OPERATION_FAILED",
  INVALID_HOST_RESPONSE: "HOST_OPERATION_FAILED",
  HOST_RESPONSE_PARSE_ERROR: "HOST_OPERATION_FAILED",
  NO_CSINTERFACE: "CAPABILITY_UNAVAILABLE",

  UNHANDLED_UI_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "INTERNAL_ERROR"
};

/**
 * Traduz um código legado. Códigos que já pertencem à lista fechada passam
 * direto; o que não é reconhecido vira `INTERNAL_ERROR` — e o código original
 * sobrevive em `details`, para não sumir do diagnóstico.
 */
export function mapLegacyCode(code: string | undefined): ErrorCode {
  if (!code) return "INTERNAL_ERROR";
  const mapped = LEGACY_CODE_MAP[code];
  if (mapped) return mapped;
  return isErrorCode(code) ? code : "INTERNAL_ERROR";
}

export function fromLegacy(
  envelope: LegacyEnvelope,
  requestId: string,
  startedAt: string,
  durationMs: number
): CommandResponse {
  let error: CommandFailure | null = null;

  if (!envelope.ok) {
    const originalCode = envelope.error?.code;
    const code = mapLegacyCode(originalCode);
    const meta = ERROR_META[code];

    // O código original vira detalhe sempre que a tradução perdeu informação.
    // Sem isso, um AE_CREATE_COMP_ERROR e um AE_CONTEXT_ERROR ficariam
    // indistinguíveis no log, e os dois pedem investigação diferente.
    const details =
      originalCode && originalCode !== code
        ? { legacyCode: originalCode, legacyDetails: envelope.error?.details ?? envelope.error?.line ?? null }
        : (envelope.error?.details ?? envelope.error?.line ?? null);

    error = {
      code,
      message: envelope.error?.message ?? "Erro sem mensagem.",
      recoverable: meta.recoverable,
      action: meta.actionKey,
      details
    };
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: envelope.ok,
    data: envelope.ok ? (envelope.data ?? {}) : null,
    // O envelope legado não tem canal de aviso. Vazio é a verdade, não um
    // placeholder: nenhum dos comandos legados produz aviso.
    warnings: [],
    error,
    timing: { startedAt, durationMs }
  };
}

/**
 * Caminho inverso, para o host legado que ainda espera o formato antigo.
 *
 * Perde `warnings` e `timing`, que o formato antigo não representa. Por isso a
 * conversão só é usada na direção host-legado, nunca para armazenar.
 */
export function toLegacy(response: CommandResponse): LegacyEnvelope {
  return {
    ok: response.ok,
    data: response.ok ? ((response.data as Record<string, unknown> | null) ?? {}) : null,
    error: response.error
      ? {
          code: response.error.code,
          message: response.error.message,
          details: response.error.details ?? null
        }
      : null
  };
}
