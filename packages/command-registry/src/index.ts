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

export {
  QUICK_PROFILE_REGISTRY,
  createQuickProfileRegistry,
  defineQuickProfile,
  getQuickProfile,
  quickProfilesForHost,
  validateLiveControlParity,
  type LiveControlIdentity,
  type LiveControlParityResult,
  type QuickProfileContractIssue,
  type QuickProfileRegistration,
  type QuickProfileRegistry
} from "./quick-profile-registry.js";

export {
  deriveQuickDefaults,
  quickSecondsToFrames,
  resolveQuickPresetId,
  scaleQuickPixelsFrom1080,
  type QuickAnimationMode,
  type QuickAxis,
  type QuickDefaultOptions,
  type QuickDerivedDefaults,
  type QuickFrameRounding,
  type QuickPropertyTarget,
  type QuickRigIntent,
  type QuickTimingDefaults
} from "./quick-defaults.js";
