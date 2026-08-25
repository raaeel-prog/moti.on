import { META_CLOSE, META_OPEN } from "@motion/contracts";

import { decodeBase64UrlUtf8 } from "./base64url.js";
import { canonicalStringify, parseCanonicalJson, type JsonValue } from "./canonical-json.js";
import { fail } from "./errors.js";
import { sha256Hex } from "./sha256.js";
import { utf8ByteLength } from "./utf8.js";
import { isCanonicalUuid, isRecord } from "./validation.js";

export interface LocatedMetadataBlock {
  readonly start: number;
  readonly end: number;
  readonly prefix: string;
  readonly suffix: string;
  readonly encoded: string;
}

export interface InlineStoredBlock {
  readonly storage: "inline";
  readonly located: LocatedMetadataBlock;
  readonly rawMetadata: JsonValue;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface SidecarStoredBlock {
  readonly storage: "sidecar";
  readonly located: LocatedMetadataBlock;
  readonly rigId: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export type StoredBlock = InlineStoredBlock | SidecarStoredBlock;

function occurrences(value: string, token: string): number[] {
  const positions: number[] = [];
  let offset = 0;
  while (offset <= value.length - token.length) {
    const found = value.indexOf(token, offset);
    if (found < 0) {
      break;
    }
    positions.push(found);
    offset = found + token.length;
  }
  return positions;
}

function assertNoReservedForeignFormat(comment: string): void {
  if (/\[\/?CHMS_META_[^\]]*\]/.test(comment)) {
    fail(
      "LEGACY_FORMAT_UNSUPPORTED",
      "Metadata CHMS legada não é migrada: o formato nunca foi publicado."
    );
  }

  const markers = comment.match(/\[\/?MOTION_META_[^\]]*\]/g) ?? [];
  if (markers.some((marker) => marker !== META_OPEN && marker !== META_CLOSE)) {
    fail("UNKNOWN_FORMAT_VERSION", "O comentário contém um formato MOTION_META desconhecido.");
  }
}

export function locateMetadataBlock(comment: string): LocatedMetadataBlock | null {
  assertNoReservedForeignFormat(comment);
  const opens = occurrences(comment, META_OPEN);
  const closes = occurrences(comment, META_CLOSE);

  if (opens.length === 0 && closes.length === 0) {
    return null;
  }
  if (opens.length > 1 || closes.length > 1) {
    fail("DUPLICATE_BLOCK", "O comentário contém mais de um bloco de metadata reservado.", {
      opens: opens.length,
      closes: closes.length
    });
  }
  if (opens.length !== 1 || closes.length !== 1) {
    fail("ORPHAN_DELIMITER", "O comentário contém delimitador de metadata órfão.");
  }

  const start = opens[0] as number;
  const closeStart = closes[0] as number;
  if (closeStart < start + META_OPEN.length) {
    fail("ORPHAN_DELIMITER", "O delimitador de fechamento aparece antes da abertura.");
  }
  const end = closeStart + META_CLOSE.length;
  const body = comment.slice(start + META_OPEN.length, closeStart);
  const encoded = body.trim();
  if (encoded.length === 0 || /\s/.test(encoded)) {
    fail("INVALID_BASE64URL", "O bloco não contém um payload base64url compacto.");
  }

  return Object.freeze({
    start,
    end,
    prefix: comment.slice(0, start),
    suffix: comment.slice(end),
    encoded
  });
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    fail("MALFORMED_BLOCK", `${label} possui campos ausentes ou desconhecidos.`);
  }
}

function readIntegrity(value: unknown): string {
  if (!isRecord(value)) {
    fail("MALFORMED_BLOCK", "O envelope não possui descritor de integridade.");
  }
  assertExactKeys(value, ["algorithm", "digest"], "integrity");
  if (value.algorithm !== "SHA-256" || typeof value.digest !== "string"
    || !/^[0-9a-f]{64}$/.test(value.digest)) {
    fail("MALFORMED_BLOCK", "O descritor de integridade SHA-256 é inválido.");
  }
  return value.digest;
}

export function parseStoredBlock(comment: string): StoredBlock | null {
  const located = locateMetadataBlock(comment);
  if (located === null) {
    return null;
  }

  const decoded = decodeBase64UrlUtf8(located.encoded);
  const envelope = parseCanonicalJson(decoded);
  if (!isRecord(envelope)) {
    fail("MALFORMED_BLOCK", "O envelope de metadata precisa ser um objeto JSON.");
  }

  if (envelope.storage === "inline") {
    assertExactKeys(envelope, ["integrity", "metadata", "storage"], "envelope inline");
    const digest = readIntegrity(envelope.integrity);
    const payload = canonicalStringify(envelope.metadata);
    if (sha256Hex(payload) !== digest) {
      fail("INTEGRITY_MISMATCH", "O checksum da metadata inline não confere.");
    }
    return Object.freeze({
      storage: "inline",
      located,
      rawMetadata: envelope.metadata as JsonValue,
      sha256: digest,
      byteLength: utf8ByteLength(payload)
    });
  }

  if (envelope.storage === "sidecar") {
    assertExactKeys(
      envelope,
      ["byteLength", "integrity", "rigId", "storage"],
      "envelope sidecar"
    );
    const digest = readIntegrity(envelope.integrity);
    if (!isCanonicalUuid(envelope.rigId)
      || !Number.isSafeInteger(envelope.byteLength) || (envelope.byteLength as number) < 0) {
      fail("MALFORMED_BLOCK", "A referência sidecar possui identidade ou tamanho inválido.");
    }
    return Object.freeze({
      storage: "sidecar",
      located,
      rigId: envelope.rigId,
      sha256: digest,
      byteLength: envelope.byteLength as number
    });
  }

  fail("MALFORMED_BLOCK", "O envelope declara um modo de armazenamento desconhecido.");
}

export function parseVerifiedSidecarPayload(
  stored: SidecarStoredBlock,
  payload: string
): JsonValue {
  if (utf8ByteLength(payload) !== stored.byteLength || sha256Hex(payload) !== stored.sha256) {
    fail("INTEGRITY_MISMATCH", "O tamanho ou checksum do sidecar não confere.");
  }
  return parseCanonicalJson(payload);
}
