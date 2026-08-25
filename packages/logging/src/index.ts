/**
 * Ponto de entrada de `@motion/logging`.
 *
 * Observabilidade local do painel: entrada estruturada conforme a §26, redaction
 * aplicada na escrita conforme a §25, e bundle de suporte exportável pelo
 * usuário. Nada aqui toca host, filesystem ou rede.
 */

export {
  LOG_SCHEMA_VERSION,
  createLogger,
  type LogEntry,
  type LogFields,
  type LogLevel,
  type LogResult,
  type LoggedHost,
  type LoggerOptions,
  type LoggerSize,
  type MotionLogger,
  type SupportBundle
} from "./logger.js";

export {
  PLACEHOLDER,
  isSensitiveKey,
  redactText,
  redactValue
} from "./redaction.js";
