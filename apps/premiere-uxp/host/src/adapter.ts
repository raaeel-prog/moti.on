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
  isErrorCode,
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
  /** Versao observada em `require("uxp").host.version`. */
  hostVersion: string;
  /** Fatos do runtime UXP que nao pertencem ao modulo `premierepro`. */
  runtime: {
    canWriteFiles: boolean | "unknown";
  };
}

export interface PremiereAdapterOptions {
  premiere: PremiereModule;
  logger: { warn(message: string, details?: Record<string, unknown>): void };
  runtime?: {
    canWriteFiles?: boolean | "unknown";
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isCommandOutcome(value: unknown): value is CommandOutcome {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value["changed"] !== "boolean" || !Array.isArray(value["warnings"])) {
    return false;
  }
  if (!isRecord(value["data"])) {
    return false;
  }

  return value["warnings"].every(
    (warning) =>
      isRecord(warning) &&
      isNonEmptyString(warning["code"]) &&
      isNonEmptyString(warning["message"])
  );
}

const BOOLEAN_OPTION_NAMES = new Set([
  "dryRun",
  "allowDestructive",
  "preserveSelection",
  "emitLiveControls"
]);
const ALLOWED_OPTION_NAMES = new Set([
  ...BOOLEAN_OPTION_NAMES,
  "mode",
  "targetRigId"
]);

/** Valida o envelope antes de qualquer leitura do projeto. */
function validateEnvelope(request: unknown): CommandFailure | null {
  if (!isRecord(request)) {
    return fail("INTERNAL_ERROR", "Pedido não é um objeto.");
  }
  if (!isNonEmptyString(request["requestId"])) {
    return fail("INTERNAL_ERROR", "requestId precisa ser uma string não vazia.");
  }
  if (!isNonEmptyString(request["command"])) {
    return fail("INTERNAL_ERROR", "command precisa ser uma string não vazia.");
  }
  if (!isRecord(request["args"])) {
    return fail("INTERNAL_ERROR", "args precisa ser um objeto.");
  }

  const context = request["context"];
  if (!isRecord(context)) {
    return fail("INTERNAL_ERROR", "context precisa ser um objeto.");
  }
  if (context["host"] !== "premiere-pro") {
    return fail("INTERNAL_ERROR", "O envelope foi destinado a outro host.", {
      expected: "premiere-pro",
      received: context["host"]
    });
  }
  if (!isNonEmptyString(context["hostVersion"])) {
    return fail("INTERNAL_ERROR", "context.hostVersion precisa ser uma string não vazia.");
  }
  if (context["locale"] !== undefined && !isNonEmptyString(context["locale"])) {
    return fail("INTERNAL_ERROR", "context.locale precisa ser uma string não vazia.");
  }

  const options = request["options"];
  if (options === undefined) {
    return null;
  }
  if (!isRecord(options)) {
    return fail("INTERNAL_ERROR", "options precisa ser um objeto.");
  }

  for (const [name, value] of Object.entries(options)) {
    if (!ALLOWED_OPTION_NAMES.has(name)) {
      return fail("INTERNAL_ERROR", "Opção desconhecida no envelope.", { option: name });
    }
    if (BOOLEAN_OPTION_NAMES.has(name) && typeof value !== "boolean") {
      return fail("INTERNAL_ERROR", `A opção ${name} precisa ser booleana.`, { option: name });
    }
    if (name === "mode" && value !== "quick" && value !== "advanced") {
      return fail("INTERNAL_ERROR", "A opção mode precisa ser quick ou advanced.", {
        option: name
      });
    }
    if (name === "targetRigId" && !isNonEmptyString(value)) {
      return fail("INTERNAL_ERROR", "A opção targetRigId precisa ser uma string não vazia.", {
        option: name
      });
    }
  }

  return null;
}

/** Impõe código, recoverable e action canônicos mesmo para handler defeituoso. */
function normalizeFailure(value: unknown): CommandFailure {
  if (!isRecord(value)) {
    return fail("INTERNAL_ERROR", "O preflight devolveu um erro inválido.");
  }

  const code = isErrorCode(value["code"]) ? value["code"] : "INTERNAL_ERROR";
  const message = isNonEmptyString(value["message"])
    ? value["message"]
    : "O comando foi recusado sem mensagem.";
  return fail(code, message, value["details"]);
}

export function createPremiereAdapter(options: PremiereAdapterOptions) {
  const { premiere, logger, runtime, now = () => Date.now() } = options;
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

    const envelopeError = validateEnvelope(request as unknown);
    if (envelopeError) {
      return respond(requestId, false, null, [], envelopeError, startedAt, startedMs);
    }

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

      if (request.options?.dryRun === true && descriptor.supportsDryRun !== true) {
        return respond(
          requestId, false, null, [],
          fail("CAPABILITY_UNAVAILABLE", "Este comando não oferece execução sem mutação.", {
            command: request.command,
            option: "dryRun"
          }),
          startedAt, startedMs
        );
      }

      if (request.options?.dryRun === true && descriptor.mutates) {
        return respond(
          requestId, false, null, [],
          fail("CAPABILITY_UNAVAILABLE", "A pré-visualização sem mutação não está implementada.", {
            command: request.command,
            option: "dryRun"
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
        undoLabel: resolveUndoLabel(descriptor.undoLabelKey, request.context?.locale),
        hostVersion:
          typeof request.context?.hostVersion === "string" && request.context.hostVersion.trim() !== ""
            ? request.context.hostVersion.trim()
            : "unknown",
        runtime: {
          canWriteFiles: runtime?.canWriteFiles ?? "unknown"
        }
      };

      const preflightError = await handler.preflight(context);
      if (preflightError) {
        return respond(
          requestId, false, null, [], normalizeFailure(preflightError), startedAt, startedMs
        );
      }

      const outcome = await handler.run(context);

      if (!isCommandOutcome(outcome as unknown)) {
        return respond(
          requestId, false, null, [],
          fail("INTERNAL_ERROR", "O comando não devolveu um resultado válido.", {
            command: request.command
          }),
          startedAt, startedMs
        );
      }

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
