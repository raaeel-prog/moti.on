/**
 * Logger estruturado do painel — CHMS-007.
 *
 * Formato da entrada fixado pela §26 do master spec. O logger é um buffer em
 * memória, por sessão: não escreve em disco. Persistência exigiria acesso ao
 * filesystem a partir da camada de apresentação, que é justamente o que a
 * arquitetura de `packages/` proíbe; o que o usuário leva para o suporte sai por
 * `exportBundle`, num gesto explícito dele.
 *
 * Este módulo satisfaz `CommandClientLogger` de `@motion/command-registry`, e é
 * por isso que o `warn(message, details?)` tem essa assinatura: o cliente de
 * comandos já usa esse contrato para reportar resposta descartada e timeout.
 */
import type { CommandResponse, HostId } from "@motion/contracts";

import { redactText, redactValue } from "./redaction.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogResult = "success" | "failure" | "cancelled";

/** Host ainda não identificado: o painel loga antes da primeira resposta. */
export type LoggedHost = HostId | "unknown";

export const LOG_SCHEMA_VERSION = 1;

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_DEBUG_WINDOW_MS = 15 * 60 * 1000;
const OVERSIZED_ENTRY_MESSAGE = "«entrada truncada: excedeu o limite local»";

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly requestId: string;
  readonly host: LoggedHost;
  readonly hostVersion: string | null;
  readonly command: string | null;
  readonly durationMs: number | null;
  readonly result: LogResult;
  readonly errorCode: string | null;
  readonly message?: string;
  readonly data?: unknown;
}

export interface LogFields {
  requestId?: string;
  command?: string;
  durationMs?: number;
  result?: LogResult;
  errorCode?: string;
  message?: string;
  data?: unknown;
}

export interface SupportBundle {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly host: LoggedHost;
  readonly hostVersion: string | null;
  readonly pluginVersion: string | null;
  readonly debugMode: boolean;
  readonly droppedEntries: number;
  readonly counts: Readonly<Record<LogLevel, number>>;
  readonly entries: readonly LogEntry[];
}

export interface LoggerSize {
  readonly entries: number;
  /** Bytes UTF-8 das entradas JSON retidas, sem o envelope do support bundle. */
  readonly bytes: number;
  readonly dropped: number;
}

export interface LoggerOptions {
  host?: LoggedHost;
  hostVersion?: string;
  pluginVersion?: string;
  maxEntries?: number;
  maxBytes?: number;
  /** Injetável para o teste fixar o relógio em vez de esperar. */
  clock?: () => number;
  /** Injetável para o teste fixar ids. */
  idFactory?: () => string;
}

export interface MotionLogger {
  debug(message: string, fields?: LogFields): LogEntry | null;
  info(message: string, fields?: LogFields): LogEntry | null;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, fields?: LogFields): LogEntry | null;

  /** Registra o resultado de um comando a partir da resposta do contrato. */
  recordResponse(command: string, response: CommandResponse): LogEntry | null;

  setHost(host: LoggedHost, hostVersion?: string): void;

  enableDebugMode(durationMs?: number): void;
  disableDebugMode(): void;
  isDebugMode(): boolean;

  entries(): readonly LogEntry[];
  size(): LoggerSize;
  clear(): number;
  exportBundle(): SupportBundle;
}

/**
 * `crypto.randomUUID` quando existe.
 *
 * O fallback não é decorativo, pelo mesmo motivo documentado em
 * `command-client.ts`: o CEP 12 embute um Chromium antigo e o UXP tem runtime
 * próprio. Estes ids correlacionam linhas de log, não protegem nada — a
 * qualidade do gerador aleatório não é requisito de segurança aqui.
 */
function createIdFactory(): () => string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

  if (typeof cryptoRef?.randomUUID === "function") {
    return () => cryptoRef.randomUUID!();
  }

  let counter = 0;
  return () => {
    counter += 1;
    return `local-${counter.toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  };
}

function emptyCounts(): Record<LogLevel, number> {
  return { debug: 0, info: 0, warn: 0, error: 0 };
}

/**
 * Mede bytes UTF-8 sem depender de `Buffer` (Node) nem de `TextEncoder` (nem
 * todo runtime UXP/CEP o expõe). Pares substitutos formam quatro bytes; um
 * substituto solitário segue o comportamento do encoder UTF-8 e ocupa três.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

function positiveSafeInteger(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} precisa ser um inteiro positivo seguro.`);
  }
  return resolved;
}

/**
 * Congela também arrays e objetos aninhados.
 *
 * `redactValue` já devolve uma árvore nova, acíclica e limitada em profundidade,
 * então não há referência do chamador a preservar nem ciclo a percorrer aqui.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return Object.freeze(value) as T;
}

export function createLogger(options: LoggerOptions = {}): MotionLogger {
  const clock = options.clock ?? (() => Date.now());
  const nextId = options.idFactory ?? createIdFactory();
  const maxEntries = positiveSafeInteger("maxEntries", options.maxEntries, DEFAULT_MAX_ENTRIES);
  const maxBytes = positiveSafeInteger("maxBytes", options.maxBytes, DEFAULT_MAX_BYTES);
  const pluginVersion = options.pluginVersion ?? null;

  let host: LoggedHost = options.host ?? "unknown";
  let hostVersion: string | null = options.hostVersion ?? null;

  let entries: LogEntry[] = [];
  let bytes = 0;
  let dropped = 0;
  let debugUntil = 0;

  function isDebugMode(): boolean {
    return debugUntil > clock();
  }

  function sizeOf(entry: LogEntry): number {
    return utf8ByteLength(JSON.stringify(entry));
  }

  /**
   * Rotação: descarta as entradas mais antigas quando qualquer limite estoura.
   *
   * Os dois limites existem porque contagem sozinha não protege memória — uma
   * única entrada com payload grande pesa mais que centenas de linhas curtas — e
   * bytes sozinho não protege o bundle de virar ilegível.
   */
  function rotate(): void {
    while (entries.length > maxEntries || bytes > maxBytes) {
      const removed = entries.shift();
      if (!removed) {
        break;
      }
      bytes -= sizeOf(removed);
      dropped += 1;
    }
  }

  /**
   * Uma única mensagem não pode furar o orçamento inteiro.
   *
   * Primeiro preservamos metadata de correlação e substituímos mensagem/data por
   * um marcador fixo. Se até essa entrada mínima não couber (configuração muito
   * pequena ou metadata hostil), ela é descartada em vez de mentir no `bytes`.
   */
  function fitEntry(entry: LogEntry): LogEntry | null {
    if (sizeOf(entry) <= maxBytes) {
      return deepFreeze(entry);
    }

    const compact: LogEntry = {
      timestamp: entry.timestamp,
      level: entry.level,
      requestId: entry.requestId,
      host: entry.host,
      hostVersion: entry.hostVersion,
      command: entry.command,
      durationMs: entry.durationMs,
      result: entry.result,
      errorCode: entry.errorCode,
      message: OVERSIZED_ENTRY_MESSAGE
    };

    if (sizeOf(compact) > maxBytes) {
      dropped += 1;
      return null;
    }

    return deepFreeze(compact);
  }

  function write(level: LogLevel, message: string, fields: LogFields = {}): LogEntry | null {
    // Fora do modo debug a entrada de debug nem é construída: ela existe para
    // investigação pontual, e mantê-la ligada por padrão encheria a rotação de
    // ruído, expulsando justamente os erros que interessam.
    if (level === "debug" && !isDebugMode()) {
      return null;
    }

    const defaultResult: LogResult = level === "error" ? "failure" : "success";

    const combinedMessage = fields.message === undefined
      ? message
      : `${message} ${fields.message}`.trim();
    const entry: LogEntry = {
      timestamp: new Date(clock()).toISOString(),
      level,
      requestId: fields.requestId ?? nextId(),
      host,
      hostVersion,
      command: fields.command ?? null,
      durationMs: fields.durationMs ?? null,
      result: fields.result ?? defaultResult,
      errorCode: fields.errorCode ?? null,
      message: redactText(combinedMessage),
      ...(fields.data !== undefined && fields.data !== null
        ? { data: redactValue(fields.data) }
        : {})
    };

    const retained = fitEntry(entry);
    if (!retained) {
      return null;
    }

    entries.push(retained);
    bytes += sizeOf(retained);
    rotate();

    return retained;
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    error: (message, fields) => write("error", message, fields),

    // Assinatura exigida por CommandClientLogger. `details` vem do cliente de
    // comandos e pode conter trecho de resposta do host, por isso é redigido
    // como qualquer outro dado.
    warn(message, details) {
      write("warn", message, details ? { data: details } : {});
    },

    recordResponse(command, response) {
      const failure = response.error;

      // A mensagem e o payload vêm do host e podem conter nomes de projeto,
      // layers, mídia ou texto criativo dentro de uma frase sem chave estrutural
      // que permita redaction confiável. O log persistente registra somente a
      // metadata segura; a UI ainda recebe a resposta completa para orientar o
      // usuário. Debug não enfraquece esta fronteira de privacidade.
      return write(response.ok ? "info" : "error", command, {
        requestId: response.requestId,
        command,
        result: response.ok ? "success" : "failure",
        ...(response.timing ? { durationMs: response.timing.durationMs } : {}),
        ...(failure ? { errorCode: failure.code } : {})
      });
    },

    setHost(nextHost, nextVersion) {
      host = nextHost;
      if (nextVersion !== undefined) {
        hostVersion = nextVersion;
      }
    },

    enableDebugMode(durationMs) {
      const windowMs = durationMs ?? DEFAULT_DEBUG_WINDOW_MS;
      if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new RangeError("durationMs precisa ser um número positivo e finito.");
      }
      debugUntil = clock() + windowMs;
    },
    disableDebugMode() {
      debugUntil = 0;
    },
    isDebugMode,

    entries: () => deepFreeze(entries.slice()),
    size: () => deepFreeze({ entries: entries.length, bytes, dropped }),

    clear() {
      const removed = entries.length;
      entries = [];
      bytes = 0;
      dropped = 0;
      return removed;
    },

    exportBundle() {
      const counts = emptyCounts();
      for (const entry of entries) {
        counts[entry.level] += 1;
      }

      return deepFreeze({
        schemaVersion: LOG_SCHEMA_VERSION,
        generatedAt: new Date(clock()).toISOString(),
        host,
        hostVersion,
        pluginVersion,
        debugMode: isDebugMode(),
        droppedEntries: dropped,
        counts,
        // As entradas já foram redigidas e congeladas na escrita. O envelope e
        // seu array também são congelados para nenhum consumidor reintroduzir
        // dado privado antes de serializar/exportar.
        entries: entries.slice()
      });
    }
  };
}
