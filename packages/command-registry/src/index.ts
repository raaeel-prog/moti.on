/**
 * Ponto de entrada de `@motion/command-registry`.
 */

export {
  COMMAND_DESCRIPTORS,
  descriptorsForHost,
  getDescriptor,
  type CommandDescriptor
} from "./descriptors.js";

export {
  createCommandClient,
  type CommandClient,
  type CommandClientLogger,
  type CommandClientOptions,
  type Transport
} from "./command-client.js";

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  UNDO_LABELS,
  isSupportedLocale,
  resolveUndoLabel,
  type SupportedLocale
} from "./undo-labels.js";
