/**
 * Ponto de entrada de `@motion/contracts`.
 *
 * Este package é o único lugar onde o formato do protocolo é definido. Painel,
 * adapter de host e camada ExtendScript concordam por causa deste arquivo — e
 * quando divergem, é aqui que a divergência aparece, não em runtime dentro do
 * After Effects.
 */

export {
  ERROR_CODES,
  ERROR_META,
  isErrorCode,
  type ErrorCode,
  type ErrorMeta
} from "./errors.js";

export {
  PROTOCOL_VERSION,
  isCommandResponse,
  type CommandContext,
  type CommandFailure,
  type CommandOptions,
  type CommandRequest,
  type CommandResponse,
  type CommandTiming,
  type CommandWarning,
  type HostId,
  type ProtocolVersion
} from "./protocol.js";

export {
  type CapabilityFinding,
  type CapabilityKey,
  type CapabilityRequirement,
  type CapabilityState,
  type HostCapabilities,
  type SupportTier
} from "./capabilities.js";

export {
  EXPRESSION_HEADER,
  META_CLOSE,
  META_OPEN,
  RIG_PREFIX,
  type RigMetadata
} from "./rig-metadata.js";

export {
  LEGACY_CODE_MAP,
  fromLegacy,
  mapLegacyCode,
  toLegacy,
  type LegacyEnvelope
} from "./legacy.js";

export {
  HOST_BOOTSTRAP_OK,
  HOST_SCRIPT_RELATIVE_PATH,
  MAX_INLINE_CHARS,
  MAX_INLINE_EVALSCRIPT_CHARS,
  buildDispatchCall,
  buildHostBootstrapCall,
  decodeFromHost,
  encodeForEvalScript,
  needsTempFileTransport
} from "./evalscript.js";

export {
  CONTRACT_SCHEMA_VERSION,
  isCommandRequest,
  isHostCapabilities,
  isRigMetadata,
  validateCommandRequest,
  validateCommandResponse,
  validateHostCapabilities,
  validateRigMetadata,
  type ContractValidationIssue,
  type ContractValidationResult
} from "./validators.js";
