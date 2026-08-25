import type { RigMetadata } from "@motion/contracts";

import { canonicalStringify, parseCanonicalJson } from "./canonical-json.js";
import { RigMetadataError, fail } from "./errors.js";

const REQUIRED_KEYS = [
  "schemaVersion",
  "rigId",
  "rigType",
  "pluginVersion",
  "createdAt",
  "memberLayerUuids"
] as const;

const OPTIONAL_KEYS = [
  "controllerLayerUuid",
  "presetId",
  "userOverrides"
] as const;

const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function schemaVersionOf(value: unknown): number {
  if (!isRecord(value) || !Number.isSafeInteger(value.schemaVersion)
    || (value.schemaVersion as number) < 0) {
    fail("INVALID_METADATA", "A metadata precisa declarar schemaVersion inteiro e não negativo.");
  }
  return value.schemaVersion as number;
}

function requireNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("INVALID_METADATA", `O campo ${field} precisa ser uma string não vazia.`);
  }
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

function requireCanonicalUuid(value: unknown, field: string): asserts value is string {
  if (!isCanonicalUuid(value)) {
    fail("INVALID_METADATA", `${field} precisa ser um UUID RFC 4122 canônico em lowercase.`);
  }
}

function assertExactShape(value: Record<string, unknown>): void {
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("INVALID_METADATA", `A metadata não possui o campo obrigatório ${key}.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail("INVALID_METADATA", "A metadata v1 contém um campo desconhecido.", { field: key });
    }
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export function validateRigMetadata(value: unknown): Readonly<RigMetadata> {
  const version = schemaVersionOf(value);
  if (version !== 1) {
    fail("UNKNOWN_SCHEMA_VERSION", "A versão de schema da metadata não é suportada.", {
      received: version,
      supported: 1
    });
  }
  if (!isRecord(value)) {
    fail("INVALID_METADATA", "A metadata precisa ser um objeto JSON.");
  }

  assertExactShape(value);
  requireCanonicalUuid(value.rigId, "rigId");
  requireNonEmptyString(value.rigType, "rigType");
  requireNonEmptyString(value.pluginVersion, "pluginVersion");
  requireNonEmptyString(value.createdAt, "createdAt");

  const parsedTimestamp = Date.parse(value.createdAt);
  const normalizedTimestamp = value.createdAt.includes(".")
    ? value.createdAt
    : value.createdAt.replace(/Z$/, ".000Z");
  if (!UTC_TIMESTAMP.test(value.createdAt) || !Number.isFinite(parsedTimestamp)
    || new Date(parsedTimestamp).toISOString() !== normalizedTimestamp) {
    fail("INVALID_METADATA", "createdAt precisa ser um timestamp UTC ISO-8601 válido.");
  }

  if (!Array.isArray(value.memberLayerUuids)) {
    fail("INVALID_METADATA", "memberLayerUuids precisa ser um array.");
  }
  const members = new Set<string>();
  for (const member of value.memberLayerUuids) {
    requireCanonicalUuid(member, "memberLayerUuids[]");
    if (members.has(member)) {
      fail("INVALID_METADATA", "memberLayerUuids não pode conter identidades duplicadas.");
    }
    members.add(member);
  }

  if (Object.prototype.hasOwnProperty.call(value, "controllerLayerUuid")) {
    requireCanonicalUuid(value.controllerLayerUuid, "controllerLayerUuid");
  }
  if (Object.prototype.hasOwnProperty.call(value, "presetId")) {
    requireNonEmptyString(value.presetId, "presetId");
  }
  if (Object.prototype.hasOwnProperty.call(value, "userOverrides")
    && !isRecord(value.userOverrides)) {
    fail("INVALID_METADATA", "userOverrides precisa ser um objeto JSON.");
  }

  return deepFreeze(value as unknown as RigMetadata);
}

/**
 * Desacopla a saída do objeto fornecido pelo caller e converte qualquer falha
 * estrutural do JSON na fronteira pública em INVALID_METADATA.
 */
export function normalizeRigMetadata(value: unknown): Readonly<RigMetadata> {
  let canonical: string;
  try {
    canonical = canonicalStringify(value);
  } catch (error) {
    if (error instanceof RigMetadataError && error.code === "INVALID_JSON_VALUE") {
      fail("INVALID_METADATA", "A metadata contém valor que não pode ser persistido em JSON.");
    }
    throw error;
  }
  return validateRigMetadata(parseCanonicalJson(canonical));
}
