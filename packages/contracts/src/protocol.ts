/**
 * Contrato de comandos entre o painel e o host.
 *
 * Os tipos seguem a §8 do master spec. Duas diferenças em relação ao texto da
 * especificação, ambas deliberadas e ambas apertando o contrato em vez de
 * afrouxá-lo:
 *
 * 1. `CommandFailure.code` é `ErrorCode`, a união fechada, e não `string`. Um
 *    comando não consegue mais inventar um código no momento em que falha, que é
 *    exatamente quando a pressa costuma vencer a disciplina.
 *
 * 2. `CommandFailure.action` é chave i18n, não frase. A §8 exige ação corretiva
 *    no erro e a §22.3 exige pt-BR e en-US desde o início; frase pronta no
 *    envelope tornaria todo erro monolíngue.
 */
import type { ErrorCode } from "./errors.js";
import { isCommandResponseValue } from "./validators.js";

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type HostId = "after-effects" | "premiere-pro";

export interface CommandContext {
  host: HostId;
  hostVersion: string;
  /**
   * Identificador estável do projeto aberto, derivado por hash. Nunca o caminho
   * nem o nome: a §25 proíbe registrar essas duas coisas, e este campo circula
   * em log e em telemetria.
   */
  projectFingerprint?: string;
  activeItemId?: string;
  /**
   * Locale da interface, por exemplo `"pt-BR"`.
   *
   * O host precisa dele por um motivo específico: o rótulo que aparece em
   * `Edit > Undo` é escrito pelo host, e o usuário lê esse menu no idioma dele.
   * Toda a demais tradução acontece no painel.
   *
   * Campo opcional acrescentado depois da v1 inicial. Pelo `docs/adr/0002`, campo
   * opcional novo não sobe `PROTOCOL_VERSION`: um host antigo simplesmente não o
   * lê, e um host novo trata a ausência caindo no idioma padrão.
   */
  locale?: string;
}

export interface CommandOptions {
  /**
   * Executa validação e cálculo, e devolve o que aconteceria, sem tocar no
   * projeto. Só faz sentido para comandos cujo descriptor declara
   * `supportsDryRun`.
   */
  dryRun?: boolean;
  /**
   * Consentimento explícito para um comando que apaga ou substitui dado do
   * usuário. Comandos com `destructive: true` no descriptor falham com
   * `PERMISSION_DENIED` sem isto — o padrão é não destruir.
   */
  allowDestructive?: boolean;
  /**
   * Restaura seleção, item ativo e tempo corrente ao final. O padrão da UI é
   * ligado; comandos cuja finalidade é justamente mudar a seleção declaram isso
   * e são a exceção.
   */
  preserveSelection?: boolean;
}

export interface CommandRequest<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  protocolVersion: ProtocolVersion;
  /** Correlaciona resposta com pedido. Resposta com id desconhecido é descartada. */
  requestId: string;
  command: string;
  args: TArgs;
  context: CommandContext;
  options?: CommandOptions;
}

/**
 * Aviso: algo que o usuário precisa saber, mas que não impediu a operação.
 *
 * Existe para o caso em que a alternativa seria silêncio. A §34 proíbe fallback
 * que muda o resultado visual sem avisar; quando um fallback é legítimo — Lens
 * Blur indisponível, cair para Gaussian — ele sai daqui, não de um log que
 * ninguém lê.
 */
export interface CommandWarning {
  code: string;
  message: string;
  details?: unknown;
}

export interface CommandFailure {
  code: ErrorCode;
  message: string;
  /** Repetir a mesma ação pode dar certo? Ver ERROR_META. */
  recoverable: boolean;
  /** Chave i18n da ação corretiva. */
  action: string;
  details?: unknown;
}

export interface CommandTiming {
  startedAt: string;
  durationMs: number;
}

export interface CommandResponse<TData = unknown> {
  protocolVersion: ProtocolVersion;
  requestId: string;
  ok: boolean;
  data: TData | null;
  /** Sempre presente, mesmo vazio: quem consome nunca precisa checar por undefined. */
  warnings: CommandWarning[];
  error: CommandFailure | null;
  timing?: CommandTiming;
}

/**
 * Guarda de fronteira. O que volta do `evalScript` ou do adapter UXP é dado
 * externo até ser verificado, mesmo tendo sido produzido por código deste
 * repositório: um host em versão antiga, um arquivo temporário truncado ou uma
 * resposta de outra sessão chegam pelo mesmo canal.
 */
export function isCommandResponse(value: unknown): value is CommandResponse {
  return isCommandResponseValue(value);
}
