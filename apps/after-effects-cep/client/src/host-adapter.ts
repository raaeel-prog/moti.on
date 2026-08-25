/**
 * Adapter de host do After Effects.
 *
 * **Único arquivo do repositório autorizado a chamar `evalScript`.**
 *
 * `scripts/validate.mjs` verifica isso no bundle construído: exatamente uma
 * ocorrência de `evalScript(`. Não é regra de estilo. `evalScript` recebe uma
 * string de código que o After Effects avalia com acesso total ao projeto e ao
 * sistema de arquivos do usuário; espalhar chamadas por vários arquivos torna
 * impossível auditar o que atravessa a fronteira. Concentrando aqui, a auditoria
 * é ler um arquivo. Por isso o bootstrap e o despacho passam os dois pela função
 * `evaluate` abaixo, em vez de chamar o CSInterface direto.
 *
 * A camada de apresentação nunca vê este módulo. Ela fala com o
 * `CommandClient`, que fala com o `Transport` — e o `Transport` é uma interface
 * de duas linhas, o que torna toda a lógica de correlação e timeout testável sem
 * abrir o After Effects.
 */
import {
  ERROR_META,
  HOST_BOOTSTRAP_OK,
  MAX_INLINE_EVALSCRIPT_CHARS,
  PROTOCOL_VERSION,
  buildDispatchCall,
  buildHostBootstrapCall,
  encodeForEvalScript,
  type CommandContext,
  type CommandResponse,
  type ErrorCode
} from "@motion/contracts";
import {
  createCommandClient,
  getDescriptor,
  type CommandClient,
  type Transport
} from "@motion/command-registry";

/**
 * Subconjunto do CSInterface que este adapter usa.
 *
 * Declarado aqui em vez de importar tipos do arquivo da Adobe: o
 * `client/lib/CSInterface.js` é código de terceiros distribuído sem tipos, e
 * declarar só o que se usa deixa explícito qual é a superfície de contato.
 */
interface CsInterfaceLike {
  evalScript(script: string, callback: (result: string) => void): void;
  getHostEnvironment(): { appVersion?: string; appUILocale?: string };
  getSystemPath(pathType: string): string;
}

declare const CSInterface: new () => CsInterfaceLike;
declare const SystemPath: { EXTENSION: string };

/**
 * Resposta que o CEP devolve quando o próprio `evalScript` falhou — antes de o
 * código chegar a rodar.
 *
 * String mágica, não código de erro. É o que o CEP retorna, e reconhecê-la é a
 * diferença entre "o host não conseguiu executar" e "o host executou e devolveu
 * algo ilegível". Na prática, é também o sintoma de o host nunca ter sido
 * carregado: `MotionAE.dispatch(...)` com `MotionAE` indefinido lança dentro do
 * ExtendScript, e o CEP resume tudo nesta string.
 */
const CEP_EVAL_FAILURE = "EvalScript error.";

interface LocalRequestMetadata {
  requestId: string;
  command: string;
  mutates: boolean;
  retrySafe: boolean;
}

/**
 * O `Transport` recebe texto porque é compartilhado entre runtimes, mas neste
 * adapter o texto só pode vir do `CommandClient`. Ainda assim, a política de
 * retry não confia numa propriedade solta do envelope: cruza o id do comando
 * com o descriptor allowlisted e falha fechada quando a correlação não existe.
 */
function readLocalRequestMetadata(serialized: string): LocalRequestMetadata {
  const parsed: unknown = JSON.parse(serialized);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Envelope local inválido: raiz não é objeto.");
  }

  const candidate = parsed as Record<string, unknown>;
  const requestId = candidate["requestId"];
  const command = candidate["command"];

  if (typeof requestId !== "string" || requestId.length === 0 || typeof command !== "string") {
    throw new Error("Envelope local inválido: requestId ou command ausente.");
  }

  const descriptor = getDescriptor(command);
  if (!descriptor || !descriptor.hosts.includes("after-effects")) {
    throw new Error(`Comando não permitido no adapter do After Effects: ${command}`);
  }

  return {
    requestId,
    command,
    mutates: descriptor.mutates,
    // Falha fechada: um descriptor inconsistente (destructive sem mutates) não
    // pode converter um comando perigoso em candidato a replay.
    retrySafe: descriptor.mutates === false && descriptor.destructive === false
  };
}

function sendTransportFailure(
  request: LocalRequestMetadata,
  onResult: (raw: string) => void,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown>
): void {
  const meta = ERROR_META[code];
  const response: CommandResponse = {
    protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId,
    ok: false,
    data: null,
    warnings: [],
    error: {
      code,
      message,
      recoverable: meta.recoverable,
      action: meta.actionKey,
      details: {
        command: request.command,
        ...details
      }
    },
    timing: { startedAt: new Date().toISOString(), durationMs: 0 }
  };

  onResult(JSON.stringify(response));
}

export interface AeHostAdapter {
  client: CommandClient;
  /** Locale da interface do After Effects, quando o CEP o expõe. */
  uiLocale(): string | undefined;
}

export function createAeHostAdapter(logger: {
  warn(message: string, details?: Record<string, unknown>): void;
}): AeHostAdapter | null {
  if (typeof CSInterface === "undefined") {
    // O painel foi aberto fora do CEP. Devolver null em vez de lançar deixa a
    // interface mostrar um estado honesto — "não estou dentro do After Effects"
    // — em vez de uma tela em branco.
    return null;
  }

  const csInterface = new CSInterface();

  /**
   * Já foi confirmado que o `host/index.jsx` desta instalação foi avaliado por
   * esta instância do adapter.
   *
   * Não inferimos prontidão pela presença de um `MotionAE.dispatch` persistente:
   * ele pode pertencer a uma instalação anterior. Cada adapter carrega o arquivo
   * atual uma vez e invalida o cache no primeiro sinal de perda do engine.
   */
  let hostReady = false;

  type BootstrapWaiter = (loaded: boolean, result: string) => void;
  let bootstrapInFlight = false;
  let bootstrapWaiters: BootstrapWaiter[] = [];

  /** O único ponto de contato com `evalScript` no repositório. */
  function evaluate(script: string, onResult: (raw: string) => void): void {
    csInterface.evalScript(script, onResult);
  }

  function finishBootstrap(loaded: boolean, result: string): void {
    hostReady = loaded;
    bootstrapInFlight = false;

    const waiters = bootstrapWaiters;
    bootstrapWaiters = [];
    for (const waiter of waiters) waiter(loaded, result);
  }

  /**
   * Carrega o host em single-flight.
   *
   * Chamadas que chegam enquanto `$.evalFile` está em andamento entram na fila
   * e recebem o mesmo resultado. Isso impede duas avaliações concorrentes do
   * bundle de disputarem a escrita do namespace global do ExtendScript.
   */
  function loadHost(done: BootstrapWaiter): void {
    bootstrapWaiters.push(done);
    if (bootstrapInFlight) return;

    bootstrapInFlight = true;
    let call: string;

    try {
      call = buildHostBootstrapCall(csInterface.getSystemPath(SystemPath.EXTENSION));
    } catch {
      logger.warn("O caminho do host ExtendScript não pôde ser resolvido.");
      finishBootstrap(false, "BOOTSTRAP_CALL_FAILED");
      return;
    }

    try {
      evaluate(call, (raw) => {
        const loaded = raw === HOST_BOOTSTRAP_OK;

        if (!loaded) {
          logger.warn(
            "O host ExtendScript não pôde ser carregado. Reinstale a extensão e reabra o painel.",
            {
              resultado:
                raw === CEP_EVAL_FAILURE
                  ? "CEP_EVAL_FAILURE"
                  : raw === "bootstrap-failed"
                    ? "BOOTSTRAP_FAILED"
                    : "DISPATCH_NOT_READY"
            }
          );
        }

        finishBootstrap(
          loaded,
          loaded
            ? "READY"
            : raw === CEP_EVAL_FAILURE
              ? "CEP_EVAL_FAILURE"
              : raw === "bootstrap-failed"
                ? "BOOTSTRAP_FAILED"
                : "DISPATCH_NOT_READY"
        );
      });
    } catch {
      logger.warn("O CEP recusou a chamada de bootstrap do host ExtendScript.");
      finishBootstrap(false, "BOOTSTRAP_CALL_FAILED");
    }
  }

  /**
   * Garante que o host está carregado antes de despachar.
   *
   * Sem `<ScriptPath>` no manifest, a primeira chamada desta instância sempre
   * passa por `$.evalFile`. Depois disso o resultado fica em cache até um
   * `EvalScript error.` indicar que o engine foi perdido.
   */
  function ensureHost(done: (ready: boolean, result: string) => void): void {
    if (hostReady) {
      done(true, "READY");
      return;
    }
    loadHost(done);
  }

  function dispatch(
    call: string,
    request: LocalRequestMetadata,
    onResult: (raw: string) => void,
    mayRetry: boolean,
    retried: boolean
  ): void {
    evaluate(call, (raw) => {
      if (raw !== CEP_EVAL_FAILURE) {
        onResult(raw);
        return;
      }

      // O host sumiu entre a verificação e o despacho. Acontece de verdade
      // quando o motor ExtendScript é reiniciado com o painel aberto.
      hostReady = false;

      if (!mayRetry) {
        logger.warn("O CEP não conseguiu avaliar o comando no host.", {
          command: request.command,
          retried,
          mutates: request.mutates
        });
        sendTransportFailure(
          request,
          onResult,
          request.mutates ? "HOST_OPERATION_FAILED" : "INTERNAL_ERROR",
          request.mutates
            ? "O CEP perdeu a resposta do host. A operação pode ter sido aplicada; confira o histórico de Desfazer antes de tentar novamente."
            : "O CEP não conseguiu avaliar o comando no host.",
          {
            reason: "CEP_EVAL_FAILURE",
            mayHaveMutated: request.mutates,
            retryAttempted: retried
          }
        );
        return;
      }

      loadHost((loaded, bootstrapResult) => {
        // Uma mutação que devolveu a falha genérica do CEP tem resultado
        // ambíguo. Recarregamos o engine para os próximos comandos, mas jamais
        // repetimos a mutação atual.
        if (!request.retrySafe) {
          logger.warn("O CEP perdeu a resposta de uma mutação; o host foi recarregado sem replay.", {
            command: request.command,
            hostReloaded: loaded,
            bootstrapResult
          });
          sendTransportFailure(
            request,
            onResult,
            "HOST_OPERATION_FAILED",
            "O CEP perdeu a resposta do host. A operação pode ter sido aplicada; confira o histórico de Desfazer antes de tentar novamente.",
            {
              reason: "CEP_EVAL_FAILURE",
              mayHaveMutated: true,
              retryAttempted: false,
              hostReloaded: loaded,
              bootstrapResult
            }
          );
          return;
        }

        if (!loaded) {
          sendTransportFailure(
            request,
            onResult,
            "INTERNAL_ERROR",
            "O dispatcher do After Effects não pôde ser recarregado.",
            {
              reason: "HOST_BOOTSTRAP_FAILED",
              bootstrapResult,
              mayHaveMutated: false,
              retryAttempted: false
            }
          );
          return;
        }
        dispatch(call, request, onResult, false, true);
      });
    });
  }

  const transport: Transport = {
    send(serialized, onResult) {
      const request = readLocalRequestMetadata(serialized);
      const encodedChars = encodeForEvalScript(serialized).length;

      if (encodedChars > MAX_INLINE_EVALSCRIPT_CHARS) {
        logger.warn("Pedido recusado antes do evalScript: payload inline excede o limite.", {
          command: request.command,
          encodedChars,
          maxInlineChars: MAX_INLINE_EVALSCRIPT_CHARS
        });
        sendTransportFailure(
          request,
          onResult,
          "INTERNAL_ERROR",
          "O pedido é grande demais para o canal inline e o transporte por arquivo temporário ainda não está disponível.",
          {
            reason: "INLINE_PAYLOAD_TOO_LARGE",
            encodedChars,
            maxInlineChars: MAX_INLINE_EVALSCRIPT_CHARS,
            mayHaveMutated: false
          }
        );
        return;
      }

      // A chamada é construída antes de entrar em qualquer callback do CEP. Se
      // o encoder detectar um defeito, a exceção síncrona é convertida pelo
      // CommandClient em falha tipada, sem ficar presa até o timeout.
      const call = buildDispatchCall(serialized);

      ensureHost((ready, bootstrapResult) => {
        if (!ready) {
          sendTransportFailure(
            request,
            onResult,
            "INTERNAL_ERROR",
            "O dispatcher do After Effects não pôde ser carregado.",
            {
              reason: "HOST_BOOTSTRAP_FAILED",
              bootstrapResult,
              mayHaveMutated: false
            }
          );
          return;
        }
        dispatch(call, request, onResult, true, false);
      });
    }
  };

  const context = (): CommandContext => {
    const environment = csInterface.getHostEnvironment();
    return {
      host: "after-effects",
      hostVersion: environment.appVersion ?? "unknown",
      ...(environment.appUILocale ? { locale: environment.appUILocale } : {})
    };
  };

  return {
    client: createCommandClient({ transport, context, logger }),
    uiLocale: () => csInterface.getHostEnvironment().appUILocale
  };
}
