/**
 * CHMS-009: metadata gerenciada de rigs.
 *
 * Este pacote é propositalmente puro. Ele não conhece Layer.comment, paths,
 * filesystem, CEP ou UXP; adapters aplicam os planos somente depois de concluir
 * seu próprio preflight/Undo. Isso permite testar preservação e corrupção sem
 * fingir que houve execução em um host Adobe.
 */

export { META_CLOSE, META_OPEN, type RigMetadata } from "@motion/contracts";

export {
  RIG_METADATA_ERROR_CODES,
  RigMetadataError,
  type RigMetadataErrorCode
} from "./errors.js";

export { canonicalStringify, type JsonPrimitive, type JsonValue } from "./canonical-json.js";
export { sha256Hex } from "./sha256.js";
export { utf8ByteLength } from "./utf8.js";

export {
  createRigMetadata,
  migrateRigMetadata,
  readRigMetadata,
  removeRigMetadata,
  resolveSidecarMetadata,
  updateRigMetadata,
  type InlineMetadataRead,
  type MetadataMigrationOptions,
  type MetadataMigrationPlan,
  type MetadataReadResult,
  type MetadataRemoveResult,
  type MetadataUpdateOptions,
  type MetadataWriteOptions,
  type MetadataWritePlan,
  type RigMetadataMigration,
  type SidecarMetadataRead,
  type SidecarWritePlan
} from "./metadata.js";
