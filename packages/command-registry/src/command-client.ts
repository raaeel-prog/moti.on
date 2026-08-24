/**
 * Cliente de comandos.
 *
 * Transporta um `CommandRequest` até o host e devolve o `CommandResponse`,
 * sem saber qual host é. O `Transport` é injetado: no After Effects ele embrulha
 * `evalScript`, no Premiere embrulha o adapter UXP, e nos testes é uma função
 * comum. É isso que torna a lógica de correlação e timeout testável sem abrir
 * nenhum aplicativo Adobe.
 *
 * Três comportamentos aqui não são óbvios e são os que mais importam:
 *
 * 1. **Resposta com `requestId` desconhecido é descartada**, não tratada como
 *    erro. Ela existe: um `evalScript` que estourou o timeout ainda chama o
 *    callback depois. Resolver a promessa atual com o resultado de um pedido
 *    anterior mostraria ao usuário o resultado da operação errada.
 *
 * 2. **Timeout nunca afirma que nada aconteceu.** O `evalScript` não tem
 *    cancelamento: quando o tempo estoura, o host pode estar no meio da operação
 *    ou já tê-la concluído. Dizer "falhou" seria mentira; a mensagem manda o
 *    usuário conferir o histórico de Undo.
 *
 * 3. **Ausência de exceção não é sucesso.** Toda resposta passa por
 *    `isCommandResponse` antes de ser entregue.
 */
import {
  ERROR_META,
  PROTOCOL_VERSION,
  isCommandResponse,
  type CommandContext,
  type CommandOptions,
  type CommandRequest,
  type CommandResponse,
  type ErrorCode
} from "@motion/contracts";

import { getDescriptor } from "./descriptors.js";

export interface Transport {
  /**
   * Envia o pedido serializado. `onResult` recebe o texto cru que o host
   * devolveu — nunca um objeto: o que atravessa a fronteira é sempre string.
   */
  send(serialized: string, onResult: (raw: string) => void): void;
}

export interface CommandClientLogger {
  warn(message: string, details?: Record<string, unknown>): void;
}

export interface CommandClientOptions {
  transport: Transport;
  context: () => CommandContext;
  logger: CommandClientLogger;
  /** Injetável para o teste de timeout não precisar esperar de verdade. */
  now?: () => number;
  /** Injetável para o teste poder fixar ids. */
  idFactory?: () => string;
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Gera `requestId`.
 *
 * `crypto.randomUUID` quando existe. O fallback não é decorativo: o CEP 12 usa
 * um Chromium embutido antigo e o UXP tem um runtime próprio; assumir a presença
 * de `crypto` produziria uma falha em runtime dentro do host, que é o lugar mais
 * caro de descobrir qualquer coisa.
 */
function createIdFactory(): () => string {
  const cryptoObject = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

  if (typeof cryptoObject?.randomUUID === "function") {
    return () => cryptoObject.randomUUID!();
  }

  let counter = 0;
  return () => {
    counter += 1;
    return `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 10)}`;
  };
}

function failureResponse(
  requestId: string,
  code: ErrorCode,
  message: string,
  startedAt: string,
  durationMs: number,
  details?: unknown
): CommandResponse {
  const meta = ERROR_META[code];
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    data: null,
    warnings: [],
    error: {
      code,
      message,
      recoverable: meta.recoverable,
      action: meta.actionKey,
      details: details ?? null
    },
    timing: { startedAt, durationMs }
  };
}

interface PendingEntry {
  timeoutHandle: unknown;
  settle: (response: CommandResponse) => void;
  /**
   * Marcado quando o timeout já resolveu a promessa. O callback atrasado do
   * `evalScript` ainda vai chegar, e precisa ser ignorado sem estourar.
   */
  abandoned: boolean;
}

export interface CommandClient {
  execute<TData = unknown>(
    command: string,
    args?: unknown,
    options?: CommandOptions
  ): Promise<CommandResponse<TData>>;
  /** Quantos pedidos aguardam resposta. Usado nos testes de vazamento. */
  pendingCount(): number;
}

export function createCommandClient(config: CommandClientOptions): CommandClient {
  const {
    transport,
    context,
    logger,
    now = () => Date.now(),
    idFactory = createIdFactory(),
    setTimeoutFn = (handler, ms) => setTimeout(handler, ms),
    clearTimeoutFn = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  } = config;

  const pending = new Map<string, PendingEntry>();

  function deliver(raw: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      // Sem requestId não há a quem entregar. O timeout do pedido correspondente
      // é quem fecha o caso; falhar aqui, sem saber a quem pertence, resolveria
      // a promessa errada.
      logger.warn("Resposta do host não é JSON válido.", { length: raw.length });
      return;
    }

    if (!isCommandResponse(parsed)) {
      logger.warn("Resposta do host não segue o contrato v1.", {
        protocolVersion: (parsed as { protocolVersion?: unknown })?.protocolVersion
      });
      return;
    }

    const entry = pending.get(parsed.requestId);

    if (!entry) {
      // Regra de resposta obsoleta. Acontece de verdade: um evalScript que
      // estourou o timeout ainda chama o callback depois.
      logger.warn("Resposta descartada: requestId desconhecido.", {
        requestId: parsed.requestId
      });
      return;
    }

    if (entry.abandoned) return;

    clearTimeoutFn(entry.timeoutHandle);
    pending.delete(parsed.requestId);
    entry.settle(parsed);
  }

  function execute<TData>(
    command: string,
    args: unknown = {},
    options?: CommandOptions
  ): Promise<CommandResponse<TData>> {
    const requestId = idFactory();
    const startedMs = now();
    const startedAt = new Date(startedMs).toISOString();
    const descriptor = getDescriptor(command);

    if (!descriptor) {
      // Falha local, sem ida ao host: pedir um comando inexistente é defeito do
      // painel, e mandá-lo ao host só adiaria a descoberta.
      return Promise.resolve(
        failureResponse(
          requestId,
          "INTERNAL_ERROR",
          `Comando desconhecido: ${command}`,
          startedAt,
          0,
          { command }
        ) as CommandResponse<TData>
      );
    }

    const request: CommandRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      command,
      args,
      context: context(),
      ...(options ? { options } : {})
    };

    return new Promise<CommandResponse<TData>>((resolve) => {
      const entry: PendingEntry = {
        abandoned: false,
        timeoutHandle: undefined,
        settle: (response) => resolve(response as CommandResponse<TData>)
      };

      entry.timeoutHandle = setTimeoutFn(() => {
        entry.abandoned = true;
        pending.delete(requestId);

        resolve(
          failureResponse(
            requestId,
            "HOST_OPERATION_FAILED",
            `O host não respondeu em ${descriptor.timeoutMs} ms. ` +
              "A operação pode ter sido aplicada mesmo assim — verifique o histórico de Desfazer " +
              "antes de tentar de novo.",
            startedAt,
            now() - startedMs,
            { command, timeoutMs: descriptor.timeoutMs }
          ) as CommandResponse<TData>
        );
      }, descriptor.timeoutMs);

      pending.set(requestId, entry);

      try {
        transport.send(JSON.stringify(request), deliver);
      } catch (error) {
        clearTimeoutFn(entry.timeoutHandle);
        pending.delete(requestId);
        resolve(
          failureResponse(
            requestId,
            "INTERNAL_ERROR",
            "Falha ao enviar o comando para o host.",
            startedAt,
            now() - startedMs,
            { command, reason: error instanceof Error ? error.message : String(error) }
          ) as CommandResponse<TData>
        );
      }
    });
  }

  return {
    execute,
    pendingCount: () => pending.size
  };
}
