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
  type CommandMode,
  type CommandFailure,
  type CommandOptions,
  type CommandRequest,
  type CommandRequestOptions,
  type CommandResponse,
  type CommandTiming,
  type CommandWarning,
  type HostId,
  type ProtocolVersion
} from "./protocol.js";

export {
  QUICK_PROFILE_LOCALES,
  type LiveControlBinding,
  type LiveControlKind,
  type LiveControlOption,
  type LiveControlTarget,
  type LiveControlUnit,
  type QuickContext,
  type QuickLocalizedText,
  type QuickProfile,
  type QuickProfileLocale,
  type QuickSelectionKind
} from "./quick-profile.js";

export {
  PRESET_SCHEMA_VERSION,
  type PresetControl,
  type PresetDefinition,
  type PresetDefinitionV1,
  type PresetDefinitionV2,
  type PresetJsonPrimitive,
  type PresetJsonValue,
  type PresetPreviewV1,
  type PresetPreviewV2,
  type PresetQuickDefinition,
  type PresetSignatureVerifier,
  type PresetV1DowngradeOptions,
  type PresetV2MigrationOptions,
  type PresetV2MigrationPreview
} from "./presets.js";

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
  downgradePresetV2ToV1,
  isCommandRequest,
  isHostCapabilities,
  isPresetDefinition,
  isPresetDefinitionV1,
  isRigMetadata,
  migratePresetV1ToV2,
  validateCommandRequest,
  validateCommandResponse,
  validateHostCapabilities,
  validatePresetDefinition,
  validatePresetDefinitionV1,
  validateRemotePresetDefinition,
  validateRigMetadata,
  type ContractValidationIssue,
  type ContractValidationResult
} from "./validators.js";
