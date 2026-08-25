import { META_CLOSE, META_OPEN, type RigMetadata } from "@motion/contracts";

import { encodeBase64UrlUtf8 } from "./base64url.js";
import {
  parseStoredBlock,
  parseVerifiedSidecarPayload,
  type SidecarStoredBlock,
  type StoredBlock
} from "./block.js";
import { canonicalStringify } from "./canonical-json.js";
import { RigMetadataError, fail } from "./errors.js";
import { sha256Hex } from "./sha256.js";
import { utf8ByteLength } from "./utf8.js";
import {
  isRecord,
  normalizeRigMetadata,
  schemaVersionOf,
  validateRigMetadata
} from "./validation.js";

export interface MetadataWriteOptions {
  /**
   * Limite total, em bytes UTF-8, para o comentário resultante. O adapter do
   * host fornece esse valor: este pacote não inventa um limite para Layer.comment.
   */
  readonly maxCommentBytes: number;
}

export interface MetadataUpdateOptions extends MetadataWriteOptions {
  /** Obrigatório ao ajustar um rig cuja metadata atual mora em sidecar. */
  readonly currentSidecarPayload?: string;
}

export interface SidecarWritePlan {
  readonly rigId: string;
  /** JSON canônico; o adapter persiste de forma atômica no local permitido. */
  readonly payload: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface MetadataWritePlan {
  readonly comment: string;
  readonly storage: "inline" | "sidecar";
  readonly rigId: string;
  readonly metadata: Readonly<RigMetadata>;
  readonly byteLength: number;
  readonly sha256: string;
  readonly sidecar: SidecarWritePlan | null;
  /** Sidecar antigo que pode ser removido somente depois da escrita principal. */
  readonly obsoleteSidecarRigId: string | null;
}

export interface InlineMetadataRead {
  readonly storage: "inline";
  readonly rigId: string;
  readonly metadata: Readonly<RigMetadata>;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface SidecarMetadataRead {
  readonly storage: "sidecar";
  readonly rigId: string;
  readonly metadata: null;
  readonly byteLength: number;
  readonly sha256: string;
}

export type MetadataReadResult = InlineMetadataRead | SidecarMetadataRead;

export interface MetadataRemoveResult {
  readonly comment: string;
  readonly removed: boolean;
  readonly removedRigId: string | null;
  readonly sidecarDeleteRigId: string | null;
}

export interface RigMetadataMigration {
  readonly fromSchemaVersion: number;
  /** O retorno passa novamente por canonicalização e validação v1 estrita. */
  readonly migrate: (source: Readonly<Record<string, unknown>>) => unknown;
}

export interface MetadataMigrationOptions extends MetadataWriteOptions {
  /** Conteúdo fornecido pelo adapter quando o bloco atual aponta para sidecar. */
  readonly sidecarPayload?: string;
}

export interface MetadataMigrationPlan extends MetadataWritePlan {
  readonly fromSchemaVersion: number;
  readonly toSchemaVersion: 1;
}

function assertComment(comment: string): void {
  if (typeof comment !== "string") {
    fail("MALFORMED_BLOCK", "O comentário precisa ser uma string.");
  }
}

function validateLimit(options: MetadataWriteOptions): number {
  const value = options.maxCommentBytes;
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("INVALID_SIZE_LIMIT", "maxCommentBytes precisa ser um inteiro positivo seguro.");
  }
  return value;
}

function blockFor(envelope: unknown): string {
  const encoded = encodeBase64UrlUtf8(canonicalStringify(envelope));
  return `${META_OPEN}\n${encoded}\n${META_CLOSE}`;
}

function makeWritePlan(
  prefix: string,
  suffix: string,
  metadata: Readonly<RigMetadata>,
  maxCommentBytes: number,
  oldSidecarRigId: string | null
): MetadataWritePlan {
  const payload = canonicalStringify(metadata);
  const digest = sha256Hex(payload);
  const byteLength = utf8ByteLength(payload);
  const integrity = Object.freeze({ algorithm: "SHA-256", digest });

  const inlineBlock = blockFor({ integrity, metadata, storage: "inline" });
  const inlineComment = `${prefix}${inlineBlock}${suffix}`;
  if (utf8ByteLength(inlineComment) <= maxCommentBytes) {
    return Object.freeze({
      comment: inlineComment,
      storage: "inline",
      rigId: metadata.rigId,
      metadata,
      byteLength,
      sha256: digest,
      sidecar: null,
      obsoleteSidecarRigId: oldSidecarRigId
    });
  }

  const referenceBlock = blockFor({
    byteLength,
    integrity,
    rigId: metadata.rigId,
    storage: "sidecar"
  });
  const sidecarComment = `${prefix}${referenceBlock}${suffix}`;
  if (utf8ByteLength(sidecarComment) > maxCommentBytes) {
    fail(
      "COMMENT_CAPACITY_EXCEEDED",
      "Nem a referência sidecar cabe no limite do comentário sem apagar texto do usuário."
    );
  }

  const sidecar = Object.freeze({
    rigId: metadata.rigId,
    payload,
    byteLength,
    sha256: digest
  });
  return Object.freeze({
    comment: sidecarComment,
    storage: "sidecar",
    rigId: metadata.rigId,
    metadata,
    byteLength,
    sha256: digest,
    sidecar,
    obsoleteSidecarRigId: null
  });
}

function identityOf(stored: StoredBlock): string {
  if (stored.storage === "sidecar") {
    return stored.rigId;
  }
  return validateRigMetadata(stored.rawMetadata).rigId;
}

export function createRigMetadata(
  comment: string,
  metadata: RigMetadata,
  options: MetadataWriteOptions
): MetadataWritePlan {
  assertComment(comment);
  const maxCommentBytes = validateLimit(options);
  if (parseStoredBlock(comment) !== null) {
    fail("BLOCK_ALREADY_EXISTS", "Create não substitui um bloco de metadata existente.");
  }
  return makeWritePlan(comment, "", normalizeRigMetadata(metadata), maxCommentBytes, null);
}

export function readRigMetadata(comment: string): MetadataReadResult | null {
  assertComment(comment);
  const stored = parseStoredBlock(comment);
  if (stored === null) {
    return null;
  }
  if (stored.storage === "sidecar") {
    return Object.freeze({
      storage: "sidecar",
      rigId: stored.rigId,
      metadata: null,
      byteLength: stored.byteLength,
      sha256: stored.sha256
    });
  }

  const metadata = validateRigMetadata(stored.rawMetadata);
  return Object.freeze({
    storage: "inline",
    rigId: metadata.rigId,
    metadata,
    byteLength: stored.byteLength,
    sha256: stored.sha256
  });
}

export function resolveSidecarMetadata(
  reference: SidecarMetadataRead,
  payload: string
): Readonly<RigMetadata> {
  if (reference.storage !== "sidecar") {
    fail("MALFORMED_BLOCK", "Somente uma referência sidecar pode resolver payload externo.");
  }
  const stored: SidecarStoredBlock = {
    storage: "sidecar",
    located: Object.freeze({ start: 0, end: 0, prefix: "", suffix: "", encoded: "" }),
    rigId: reference.rigId,
    sha256: reference.sha256,
    byteLength: reference.byteLength
  };
  const metadata = validateRigMetadata(parseVerifiedSidecarPayload(stored, payload));
  if (metadata.rigId !== reference.rigId) {
    fail("RIG_ID_MISMATCH", "O sidecar verificado pertence a outro rig.");
  }
  return metadata;
}

export function updateRigMetadata(
  comment: string,
  metadata: RigMetadata,
  options: MetadataUpdateOptions
): MetadataWritePlan {
  assertComment(comment);
  const maxCommentBytes = validateLimit(options);
  const stored = parseStoredBlock(comment);
  if (stored === null) {
    fail("BLOCK_NOT_FOUND", "Adjust exige um bloco de metadata existente.");
  }

  const normalized = normalizeRigMetadata(metadata);
  let existingRigId: string;
  if (stored.storage === "sidecar") {
    if (options.currentSidecarPayload === undefined) {
      fail("SIDECAR_PAYLOAD_REQUIRED", "Update precisa validar a metadata sidecar atual.");
    }
    const current = validateRigMetadata(
      parseVerifiedSidecarPayload(stored, options.currentSidecarPayload)
    );
    if (current.rigId !== stored.rigId) {
      fail("RIG_ID_MISMATCH", "A referência atual aponta para um sidecar de outro rig.");
    }
    existingRigId = current.rigId;
  } else {
    existingRigId = identityOf(stored);
  }
  if (normalized.rigId !== existingRigId) {
    fail("RIG_ID_MISMATCH", "Update não pode trocar a identidade do rig.");
  }
  return makeWritePlan(
    stored.located.prefix,
    stored.located.suffix,
    normalized,
    maxCommentBytes,
    stored.storage === "sidecar" ? stored.rigId : null
  );
}

export function removeRigMetadata(comment: string): MetadataRemoveResult {
  assertComment(comment);
  const stored = parseStoredBlock(comment);
  if (stored === null) {
    return Object.freeze({
      comment,
      removed: false,
      removedRigId: null,
      sidecarDeleteRigId: null
    });
  }

  const rigId = identityOf(stored);
  return Object.freeze({
    comment: `${stored.located.prefix}${stored.located.suffix}`,
    removed: true,
    removedRigId: rigId,
    sidecarDeleteRigId: stored.storage === "sidecar" ? stored.rigId : null
  });
}

function freezeSource(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  for (const child of Object.values(value)) {
    if (isRecord(child)) {
      freezeSource(child);
    } else if (Array.isArray(child)) {
      freezeArray(child);
    }
  }
  return Object.freeze(value);
}

function freezeArray(value: unknown[]): readonly unknown[] {
  for (const child of value) {
    if (isRecord(child)) {
      freezeSource(child);
    } else if (Array.isArray(child)) {
      freezeArray(child);
    }
  }
  return Object.freeze(value);
}

function migrationFor(
  migrations: readonly RigMetadataMigration[],
  version: number
): RigMetadataMigration {
  const matches = migrations.filter((migration) => migration.fromSchemaVersion === version);
  if (matches.length > 1) {
    fail("AMBIGUOUS_MIGRATION", "Mais de uma migração foi registrada para o mesmo schema.", {
      schemaVersion: version
    });
  }
  const migration = matches[0];
  if (migration === undefined) {
    fail("MIGRATION_NOT_AVAILABLE", "Não existe migração explícita para este schema.", {
      schemaVersion: version
    });
  }
  if (!Number.isSafeInteger(migration.fromSchemaVersion)
    || migration.fromSchemaVersion < 0 || typeof migration.migrate !== "function") {
    fail("AMBIGUOUS_MIGRATION", "O registro de migração é inválido.");
  }
  return migration;
}

function sourceForMigration(
  stored: StoredBlock,
  options: MetadataMigrationOptions
): Record<string, unknown> {
  const source = stored.storage === "inline"
    ? stored.rawMetadata
    : (() => {
      if (options.sidecarPayload === undefined) {
        fail("SIDECAR_PAYLOAD_REQUIRED", "A migração precisa do payload sidecar atual.");
      }
      return parseVerifiedSidecarPayload(stored, options.sidecarPayload);
    })();

  if (!isRecord(source)) {
    fail("INVALID_METADATA", "A origem de migração precisa ser um objeto JSON.");
  }
  return source;
}

export function migrateRigMetadata(
  comment: string,
  migrations: readonly RigMetadataMigration[],
  options: MetadataMigrationOptions
): MetadataMigrationPlan {
  assertComment(comment);
  const maxCommentBytes = validateLimit(options);
  const stored = parseStoredBlock(comment);
  if (stored === null) {
    fail("BLOCK_NOT_FOUND", "Migrate exige um bloco de metadata existente.");
  }

  const source = sourceForMigration(stored, options);
  const fromSchemaVersion = schemaVersionOf(source);
  let normalized: Readonly<RigMetadata>;

  if (fromSchemaVersion === 1) {
    normalized = validateRigMetadata(source);
  } else {
    const migration = migrationFor(migrations, fromSchemaVersion);
    let output: unknown;
    try {
      output = migration.migrate(freezeSource(source));
    } catch (error) {
      if (error instanceof RigMetadataError) {
        throw error;
      }
      fail("MIGRATION_FAILED", "A função de migração falhou antes de produzir metadata v1.");
    }
    normalized = normalizeRigMetadata(output);
  }

  if (stored.storage === "sidecar" && normalized.rigId !== stored.rigId) {
    fail("RIG_ID_MISMATCH", "A migração não pode mudar a identidade da referência sidecar.");
  }

  const plan = makeWritePlan(
    stored.located.prefix,
    stored.located.suffix,
    normalized,
    maxCommentBytes,
    stored.storage === "sidecar" ? stored.rigId : null
  );
  return Object.freeze({ ...plan, fromSchemaVersion, toSchemaVersion: 1 });
}
