/**
 * Command bus do Premiere Pro.
 *
 * Mesmo registro de comandos, mesmos 22 códigos de erro, mesma regra do `ok` e
 * mesmo tratamento de `protocolVersion` do host do After Effects. A única
 * diferença estrutural é que aqui o `run` é assíncrono — as APIs de leitura do
 * Premiere devolvem `Promise` — enquanto a fronteira de transação, essa, é
 * síncrona.
 *
 * Não existe `evalScript` deste lado: o UXP roda no mesmo runtime do painel, e o
 * módulo `premierepro` é chamado direto. Por isso não há escape a fazer, e
 * também por isso o adapter é o **único** arquivo que toca o módulo — a mesma
 * regra de fronteira do After Effects, pelo mesmo motivo: concentrar o contato
 * com o host num lugar auditável.
 */
import {
  ERROR_META,
  PROTOCOL_VERSION,
  type CommandFailure,
  type CommandRequest,
  type CommandResponse,
  type CommandWarning,
  type ErrorCode
} from "@motion/contracts";
import { getDescriptor, resolveUndoLabel } from "@motion/command-registry";

import type { PremiereModule, PremiereProject } from "./premiere-api.js";

export interface CommandOutcome {
  /**
   * A alteração esperada foi aplicada?
   *
   * Comando que não muta devolve `false` e o dispatcher ignora. Comando que muta
   * e devolve `false` responde `ok: false` — a regra da §8, imposta aqui e não
   * confiada a cada comando.
   */
  changed: boolean;
  warnings: CommandWarning[];
  data: Record<string, unknown>;
}

export interface PremiereCommandHandler {
  /** Toda a validação, com o projeto ainda intacto. `null` significa "pode seguir". */
  preflight(context: PremiereCommandContext): Promise<CommandFailure | null>;
  run(context: PremiereCommandContext): Promise<CommandOutcome>;
}

export interface PremiereCommandContext {
  premiere: PremiereModule;
  project: PremiereProject | null;
  args: Record<string, unknown>;
  undoLabel: string;
}

export interface PremiereAdapterOptions {
  premiere: PremiereModule;
  logger: { warn(message: string, details?: Record<string, unknown>): void };
  now?: () => number;
}

function fail(code: ErrorCode, message: string, details?: unknown): CommandFailure {
  const meta = ERROR_META[code];
  return {
    code,
    message,
    recoverable: meta.recoverable,
    action: meta.actionKey,
    details: details ?? null
  };
}

export function createPremiereAdapter(options: PremiereAdapterOptions) {
  const { premiere, logger, now = () => Date.now() } = options;
  const handlers = new Map<string, PremiereCommandHandler>();

  function register(id: string, handler: PremiereCommandHandler): void {
    if (handlers.has(id)) {
      // Dois arquivos disputando o mesmo id: o último venceria em silêncio, e o
      // comando acionado não seria o que o desenvolvedor pensa.
      throw new Error(`Comando já registrado: ${id}`);
    }
    handlers.set(id, handler);
  }

  function respond(
    requestId: string,
    ok: boolean,
    data: Record<string, unknown> | null,
    warnings: CommandWarning[],
    error: CommandFailure | null,
    startedAt: string,
    startedMs: number
  ): CommandResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      ok,
      data: ok ? (data ?? {}) : null,
      warnings,
      error,
      timing: { startedAt, durationMs: now() - startedMs }
    };
  }

  async function dispatch(request: CommandRequest): Promise<CommandResponse> {
    const startedMs = now();
    const startedAt = new Date(startedMs).toISOString();
    const requestId = typeof request?.requestId === "string" ? request.requestId : "unknown";

    // Recusa, nunca adivinhação. Ver docs/adr/0002.
    if (request?.protocolVersion !== PROTOCOL_VERSION) {
      return respond(
        requestId, false, null, [],
        fail("INTERNAL_ERROR", "Versão de protocolo incompatível.", {
          expected: PROTOCOL_VERSION,
          received: request?.protocolVersion
        }),
        startedAt, startedMs
      );
    }

    const descriptor = getDescriptor(request.command);
    if (!descriptor || !descriptor.hosts.includes("premiere-pro")) {
      return respond(
        requestId, false, null, [],
        fail("INTERNAL_ERROR", "Comando desconhecido neste host.", { command: request.command }),
        startedAt, startedMs
      );
    }

    const handler = handlers.get(request.command);
    if (!handler) {
      // Defeito de build, não do usuário: um botão que existe e não faz nada.
      return respond(
        requestId, false, null, [],
        fail("INTERNAL_ERROR", "Comando declarado mas não implementado neste build.", {
          command: request.command
        }),
        startedAt, startedMs
      );
    }

    try {
      if (descriptor.destructive && request.options?.allowDestructive !== true) {
        return respond(
          requestId, false, null, [],
          fail("PERMISSION_DENIED", "Esta operação apaga ou substitui dados e exige confirmação explícita.", {
            command: request.command
          }),
          startedAt, startedMs
        );
      }

      const project = await premiere.Project.getActiveProject();

      // Requisito de capacidade. A matriz completa chega no CHMS-006; aqui só o
      // requisito que os comandos do P0 realmente declaram.
      if (descriptor.requirements.includes("hasProject") && !project) {
        return respond(
          requestId, false, null, [],
          fail("NO_ACTIVE_PROJECT", "Nenhum projeto aberto no Premiere Pro."),
          startedAt, startedMs
        );
      }

      const context: PremiereCommandContext = {
        premiere,
        project,
        args: (request.args as Record<string, unknown>) ?? {},
        undoLabel: resolveUndoLabel(descriptor.undoLabelKey, request.context?.locale)
      };

      const preflightError = await handler.preflight(context);
      if (preflightError) {
        return respond(requestId, false, null, [], preflightError, startedAt, startedMs);
      }

      const outcome = await handler.run(context);

      // A regra do `ok` da §8, imposta pelo adapter.
      if (descriptor.mutates && !outcome.changed) {
        return respond(
          requestId, false, null,
          [
            ...outcome.warnings,
            {
              code: "NO_CHANGE_APPLIED",
              message: "O comando terminou sem aplicar a alteração esperada.",
              details: null
            }
          ],
          fail("HOST_OPERATION_FAILED", "Nenhuma alteração foi aplicada ao projeto.", {
            command: request.command
          }),
          startedAt, startedMs
        );
      }

      return respond(requestId, true, outcome.data, outcome.warnings, null, startedAt, startedMs);
    } catch (error) {
      // Exceção que escapa do handler não vira sucesso e não vira mensagem
      // genérica sem código.
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Comando falhou no host do Premiere.", { command: request.command });
      return respond(
        requestId, false, null, [],
        fail("HOST_OPERATION_FAILED", message, { command: request.command }),
        startedAt, startedMs
      );
    }
  }

  return { dispatch, register, registeredIds: () => [...handlers.keys()] };
}
