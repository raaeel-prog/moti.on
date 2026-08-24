/**
 * Ponto de entrada de `@motion/capability-matrix`.
 */

export {
  compareVersions,
  formatVersion,
  isAtLeast,
  isBelow,
  parseHostVersion,
  type HostVersion
} from "./version.js";

export { afterEffectsTier, premiereTier, tierFor, tierReasonKey } from "./tiers.js";

export {
  buildCapabilities,
  summaryReasonKey,
  type ProbeFacts,
  type ProbeResult
} from "./probe.js";

export {
  INVALIDATION_TRIGGERS,
  createCapabilityStore,
  type CapabilityStore,
  type CapabilityStoreOptions
} from "./session-cache.js";
