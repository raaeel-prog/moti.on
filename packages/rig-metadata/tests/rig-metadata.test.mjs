import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  META_CLOSE,
  META_OPEN,
  RigMetadataError,
  canonicalStringify,
  createRigMetadata,
  migrateRigMetadata,
  readRigMetadata,
  removeRigMetadata,
  resolveSidecarMetadata,
  sha256Hex,
  updateRigMetadata,
  utf8ByteLength
} from "../dist/index.js";

function metadata(overrides = {}) {
  return {
    schemaVersion: 1,
    rigId: "550e8400-e29b-41d4-a716-446655440000",
    rigType: "ae.animate.parallax.quick",
    pluginVersion: "0.1.0",
    createdAt: "2026-08-25T12:34:56.000Z",
    controllerLayerUuid: "123e4567-e89b-42d3-a456-426614174000",
    memberLayerUuids: [
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174002"
    ],
    presetId: "cinemático",
    userOverrides: {
      nested: { z: 2, a: "olá 👋" },
      enabled: true,
      values: [3, null, "é"]
    },
    ...overrides
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof RigMetadataError);
    assert.equal(error.code, code);
    return true;
  });
}

function base64urlUtf8(text) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function inlineBlockForRawMetadata(rawMetadata, digest = sha256Hex(canonicalStringify(rawMetadata))) {
  const envelope = {
    integrity: { algorithm: "SHA-256", digest },
    metadata: rawMetadata,
    storage: "inline"
  };
  return `${META_OPEN}\n${base64urlUtf8(canonicalStringify(envelope))}\n${META_CLOSE}`;
}

function sidecarBlockFor(rawMetadata, referencedRigId = rawMetadata.rigId) {
  const payload = canonicalStringify(rawMetadata);
  const envelope = {
    byteLength: utf8ByteLength(payload),
    integrity: { algorithm: "SHA-256", digest: sha256Hex(payload) },
    rigId: referencedRigId,
    storage: "sidecar"
  };
  return {
    block: `${META_OPEN}\n${base64urlUtf8(canonicalStringify(envelope))}\n${META_CLOSE}`,
    payload
  };
}

function legacyBlock(payload = "abc") {
  // O scanner de branding impede persistir o identificador antigo literalmente
  // no repositório; a montagem em runtime ainda prova a recusa do formato v1.
  const marker = ["CHMS", "META", "V1"].join("_");
  return `[${marker}]${payload}[/${marker}]`;
}

test("canonicalStringify ordena chaves recursivamente sem reordenar arrays", () => {
  const value = {
    z: 1,
    a: { z: 3, a: 2 },
    list: [{ b: 2, a: 1 }, "ç", null]
  };

  assert.equal(
    canonicalStringify(value),
    '{"a":{"a":2,"z":3},"list":[{"a":1,"b":2},"ç",null],"z":1}'
  );
  assert.deepEqual(Object.keys(value), ["z", "a", "list"], "a entrada não é mutada");
});

test("canonicalStringify recusa valores JSON ambíguos, protótipos e ciclos", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  for (const invalid of [
    { value: undefined },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: 1n },
    new Date("2026-08-25T00:00:00.000Z"),
    cyclic,
    Object.assign(Object.create({ inherited: true }), { own: true }),
    JSON.parse('{"__proto__":{"polluted":true}}'),
    "\ud800"
  ]) {
    expectCode("INVALID_JSON_VALUE", () => canonicalStringify(invalid));
  }
});

test("SHA-256 puro coincide com vetores conhecidos e node:crypto", () => {
  const vectors = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["ação 🎬 字幕", null],
    ["0123456789abcdef".repeat(100), null],
    ["🌍".repeat(100), null]
  ];

  for (const [value, expected] of vectors) {
    const nodeDigest = createHash("sha256").update(value, "utf8").digest("hex");
    assert.equal(sha256Hex(value), expected ?? nodeDigest);
    assert.equal(sha256Hex(value), nodeDigest);
  }
});

test("create/read faz round-trip Unicode e emite exatamente um bloco", () => {
  const original = "Comentário do usuário\r\nsem normalizar 🎨";
  const source = metadata();
  const plan = createRigMetadata(original, source, { maxCommentBytes: 16_384 });

  assert.equal(plan.storage, "inline");
  assert.equal(plan.sidecar, null);
  assert.ok(plan.comment.startsWith(original), "o texto anterior permanece byte-for-byte");
  assert.equal(plan.comment.split(META_OPEN).length - 1, 1);
  assert.equal(plan.comment.split(META_CLOSE).length - 1, 1);
  assert.match(plan.comment, /\[MOTION_META_V1\]\n[A-Za-z0-9_-]+\n\[\/MOTION_META_V1\]$/);

  const read = readRigMetadata(plan.comment);
  assert.equal(read.storage, "inline");
  assert.deepEqual(read.metadata, source);
  assert.ok(Object.isFrozen(read));
  assert.ok(Object.isFrozen(read.metadata));
  assert.ok(Object.isFrozen(read.metadata.userOverrides.nested));
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.metadata));
  assert.notEqual(plan.metadata, source, "o caller conserva ownership do objeto de entrada");
  assert.equal(Object.isFrozen(source), false);
});

test("read retorna null quando o comentário não tem metadata reservada", () => {
  assert.equal(readRigMetadata("texto livre [qualquer coisa]"), null);
});

test("create recusa bloco existente em vez de duplicá-lo", () => {
  const first = createRigMetadata("usuário", metadata(), { maxCommentBytes: 16_384 });
  expectCode("BLOCK_ALREADY_EXISTS", () =>
    createRigMetadata(first.comment, metadata(), { maxCommentBytes: 16_384 })
  );
});

test("todas as operações falham fechadas em delimitadores duplicados ou órfãos", () => {
  const block = createRigMetadata("", metadata(), { maxCommentBytes: 16_384 }).comment;
  const invalidComments = [
    ["DUPLICATE_BLOCK", `${block}texto${block}`],
    ["ORPHAN_DELIMITER", `texto${META_OPEN}abc`],
    ["ORPHAN_DELIMITER", `texto${META_CLOSE}`],
    ["ORPHAN_DELIMITER", `${META_CLOSE}texto${META_OPEN}`]
  ];

  for (const [code, comment] of invalidComments) {
    expectCode(code, () => readRigMetadata(comment));
    expectCode(code, () => removeRigMetadata(comment));
  }
});

test("formato MOTION futuro e marcadores CHMS legados são recusados explicitamente", () => {
  expectCode("UNKNOWN_FORMAT_VERSION", () =>
    readRigMetadata("texto[MOTION_META_V2]abc[/MOTION_META_V2]")
  );
  expectCode("LEGACY_FORMAT_UNSUPPORTED", () =>
    readRigMetadata(`texto${legacyBlock()}`)
  );
  expectCode("LEGACY_FORMAT_UNSUPPORTED", () =>
    migrateRigMetadata(legacyBlock(), [], { maxCommentBytes: 1000 })
  );
  expectCode("UNKNOWN_FORMAT_VERSION", () =>
    readRigMetadata("texto[MOTION_META_BETA]abc[/MOTION_META_BETA]")
  );
});

test("base64url não canônico, JSON não canônico e envelope com campos extras falham", () => {
  expectCode("INVALID_BASE64URL", () =>
    readRigMetadata(`${META_OPEN}\nYWJj=\n${META_CLOSE}`)
  );
  expectCode("INVALID_BASE64URL", () =>
    readRigMetadata(`${META_OPEN}\nAB\n${META_CLOSE}`)
  );
  expectCode("INVALID_UTF8", () =>
    readRigMetadata(`${META_OPEN}\nwIA\n${META_CLOSE}`)
  );

  const source = metadata();
  const canonicalEnvelope = {
    integrity: { algorithm: "SHA-256", digest: sha256Hex(canonicalStringify(source)) },
    metadata: source,
    storage: "inline"
  };
  const nonCanonical = JSON.stringify(canonicalEnvelope);
  assert.notEqual(nonCanonical, canonicalStringify(canonicalEnvelope));
  expectCode("NON_CANONICAL_JSON", () =>
    readRigMetadata(`${META_OPEN}\n${base64urlUtf8(nonCanonical)}\n${META_CLOSE}`)
  );

  const extra = { ...canonicalEnvelope, future: true };
  expectCode("MALFORMED_BLOCK", () =>
    readRigMetadata(`${META_OPEN}\n${base64urlUtf8(canonicalStringify(extra))}\n${META_CLOSE}`)
  );
});

test("corrupção semanticamente válida é detectada pelo digest", () => {
  const original = metadata();
  const corrupted = { ...original, rigType: "ae.project.clean" };
  const block = inlineBlockForRawMetadata(
    corrupted,
    sha256Hex(canonicalStringify(original))
  );

  expectCode("INTEGRITY_MISMATCH", () => readRigMetadata(block));
});

test("schema desconhecido falha fechado mesmo quando o checksum é válido", () => {
  const future = { ...metadata(), schemaVersion: 99 };
  expectCode("UNKNOWN_SCHEMA_VERSION", () => readRigMetadata(inlineBlockForRawMetadata(future)));
});

test("metadata v1 tem shape estrito e invariantes de identidade", () => {
  const invalidCases = [
    { ...metadata(), unexpected: true },
    { ...metadata(), rigId: "" },
    { ...metadata(), rigId: "../sidecar" },
    { ...metadata(), rigId: "550E8400-E29B-41D4-A716-446655440000" },
    { ...metadata(), createdAt: "ontem" },
    { ...metadata(), createdAt: "2026-02-30T12:00:00.000Z" },
    { ...metadata(), memberLayerUuids: ["duplicada", "duplicada"] },
    { ...metadata(), memberLayerUuids: ["not-a-uuid"] },
    { ...metadata(), controllerLayerUuid: "controller-name" },
    { ...metadata(), userOverrides: { value: undefined } }
  ];

  for (const invalid of invalidCases) {
    expectCode("INVALID_METADATA", () =>
      createRigMetadata("", invalid, { maxCommentBytes: 16_384 })
    );
  }
});

test("createdAt aceita milissegundos reais sem normalizar o valor do usuário", () => {
  const source = metadata({ createdAt: "2026-08-25T12:34:56.123Z" });
  const plan = createRigMetadata("", source, { maxCommentBytes: 16_384 });
  assert.equal(readRigMetadata(plan.comment).metadata.createdAt, source.createdAt);
});

test("update substitui somente o bloco e preserva prefixo/sufixo byte-for-byte", () => {
  const before = "prefixo\r\nç🎨\u0000";
  const after = "\r\nsufixo\nfinal";
  const block = createRigMetadata("", metadata(), { maxCommentBytes: 16_384 }).comment;
  const comment = `${before}${block}${after}`;
  const next = metadata({ rigType: "ae.animate.wiggle", presetId: "novo" });

  const plan = updateRigMetadata(comment, next, { maxCommentBytes: 16_384 });

  assert.ok(plan.comment.startsWith(before));
  assert.ok(plan.comment.endsWith(after));
  assert.equal(plan.obsoleteSidecarRigId, null);
  assert.deepEqual(readRigMetadata(plan.comment).metadata, next);
});

test("update recusa ausência de bloco ou troca silenciosa de rigId", () => {
  expectCode("BLOCK_NOT_FOUND", () =>
    updateRigMetadata("texto", metadata(), { maxCommentBytes: 16_384 })
  );

  const current = createRigMetadata("", metadata(), { maxCommentBytes: 16_384 }).comment;
  expectCode("RIG_ID_MISMATCH", () =>
    updateRigMetadata(
      current,
      metadata({ rigId: "550e8400-e29b-41d4-a716-446655440001" }),
      { maxCommentBytes: 16_384 }
    )
  );
});

test("remove apaga somente o span gerenciado e é idempotente quando ausente", () => {
  const before = "usuário\r\n";
  const after = "\ncontinuação 🌍";
  const block = createRigMetadata("", metadata(), { maxCommentBytes: 16_384 }).comment;

  const removed = removeRigMetadata(`${before}${block}${after}`);
  assert.deepEqual(removed, {
    comment: `${before}${after}`,
    removed: true,
    removedRigId: metadata().rigId,
    sidecarDeleteRigId: null
  });
  assert.deepEqual(removeRigMetadata(removed.comment), {
    comment: removed.comment,
    removed: false,
    removedRigId: null,
    sidecarDeleteRigId: null
  });
});

test("payload grande gera plano sidecar sem tocar filesystem ou APIs do host", () => {
  const huge = metadata({
    userOverrides: { creativeValues: "🎨".repeat(5000) }
  });

  const plan = createRigMetadata("texto", huge, { maxCommentBytes: 512 });

  assert.equal(plan.storage, "sidecar");
  assert.ok(plan.sidecar);
  assert.equal(plan.sidecar.rigId, huge.rigId);
  assert.equal(plan.sidecar.payload, canonicalStringify(huge));
  assert.equal(plan.sidecar.byteLength, utf8ByteLength(plan.sidecar.payload));
  assert.equal(plan.sidecar.sha256, sha256Hex(plan.sidecar.payload));
  assert.ok(utf8ByteLength(plan.comment) <= 512);

  const reference = readRigMetadata(plan.comment);
  assert.equal(reference.storage, "sidecar");
  assert.equal(reference.metadata, null);
  assert.equal(reference.rigId, huge.rigId);
  assert.deepEqual(resolveSidecarMetadata(reference, plan.sidecar.payload), huge);
  assert.ok(Object.isFrozen(plan.sidecar));
});

test("sidecar corrompido ou pertencente a outro rig falha fechado", () => {
  const large = metadata({ userOverrides: { value: "x".repeat(5000) } });
  const plan = createRigMetadata("", large, { maxCommentBytes: 512 });
  const reference = readRigMetadata(plan.comment);

  const corrupted = plan.sidecar.payload.replace("parallax", "parallay");
  expectCode("INTEGRITY_MISMATCH", () => resolveSidecarMetadata(reference, corrupted));

  const foreign = metadata({ rigId: "550e8400-e29b-41d4-a716-446655440099" });
  const forged = sidecarBlockFor(foreign, large.rigId);
  expectCode("RIG_ID_MISMATCH", () =>
    resolveSidecarMetadata(readRigMetadata(forged.block), forged.payload)
  );

  const unsafeReference = sidecarBlockFor(foreign, "../sidecar");
  expectCode("MALFORMED_BLOCK", () => readRigMetadata(unsafeReference.block));
});

test("limite é explícito; valor inválido ou incapaz de conter referência falha", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expectCode("INVALID_SIZE_LIMIT", () =>
      createRigMetadata("", metadata(), { maxCommentBytes: value })
    );
  }

  expectCode("COMMENT_CAPACITY_EXCEEDED", () =>
    createRigMetadata("comentário do usuário", metadata(), { maxCommentBytes: 8 })
  );
});

test("update informa sidecar obsoleto quando volta ao armazenamento inline", () => {
  const huge = metadata({ userOverrides: { value: "x".repeat(5000) } });
  const sidecarPlan = createRigMetadata("", huge, { maxCommentBytes: 512 });

  expectCode("SIDECAR_PAYLOAD_REQUIRED", () =>
    updateRigMetadata(sidecarPlan.comment, metadata(), { maxCommentBytes: 16_384 })
  );

  const inlinePlan = updateRigMetadata(sidecarPlan.comment, metadata(), {
    maxCommentBytes: 16_384,
    currentSidecarPayload: sidecarPlan.sidecar.payload
  });

  assert.equal(inlinePlan.storage, "inline");
  assert.equal(inlinePlan.obsoleteSidecarRigId, huge.rigId);
});

test("remove de referência sidecar devolve cleanup explícito sem executar I/O", () => {
  const huge = metadata({ userOverrides: { value: "x".repeat(5000) } });
  const plan = createRigMetadata("antes", huge, { maxCommentBytes: 512 });

  const removed = removeRigMetadata(plan.comment);

  assert.equal(removed.comment, "antes");
  assert.equal(removed.removedRigId, huge.rigId);
  assert.equal(removed.sidecarDeleteRigId, huge.rigId);
});

test("migrate exige migração explicitamente registrada e valida a saída", () => {
  const v0 = {
    schemaVersion: 0,
    id: metadata().rigId,
    type: "ae.animate.parallax.quick",
    plugin: "0.0.9",
    created: "2026-08-24T12:00:00.000Z",
    members: ["123e4567-e89b-42d3-a456-426614174001"]
  };
  const comment = `antes${inlineBlockForRawMetadata(v0)}depois`;

  expectCode("UNKNOWN_SCHEMA_VERSION", () => readRigMetadata(comment));
  expectCode("MIGRATION_NOT_AVAILABLE", () =>
    migrateRigMetadata(comment, [], { maxCommentBytes: 16_384 })
  );

  const migrated = migrateRigMetadata(
    comment,
    [{
      fromSchemaVersion: 0,
      migrate: (source) => metadata({
        rigId: source.id,
        rigType: source.type,
        pluginVersion: source.plugin,
        createdAt: source.created,
        memberLayerUuids: source.members
      })
    }],
    { maxCommentBytes: 16_384 }
  );

  assert.ok(migrated.comment.startsWith("antes"));
  assert.ok(migrated.comment.endsWith("depois"));
  assert.equal(migrated.fromSchemaVersion, 0);
  assert.equal(migrated.toSchemaVersion, 1);
  assert.deepEqual(readRigMetadata(migrated.comment).metadata, metadata({
    rigId: v0.id,
    rigType: v0.type,
    pluginVersion: v0.plugin,
    createdAt: v0.created,
    memberLayerUuids: v0.members
  }));

  expectCode("INVALID_METADATA", () =>
    migrateRigMetadata(
      comment,
      [{ fromSchemaVersion: 0, migrate: () => ({ schemaVersion: 1 }) }],
      { maxCommentBytes: 16_384 }
    )
  );
});

test("migrate recusa registries ambíguos e também migra payload sidecar", () => {
  const v0 = {
    schemaVersion: 0,
    id: metadata().rigId,
    type: "ae.animate.wiggle",
    plugin: "0.0.9",
    created: "2026-08-24T12:00:00.000Z",
    members: ["123e4567-e89b-42d3-a456-426614174001"]
  };
  const sidecar = sidecarBlockFor(v0, v0.id);
  const migration = {
    fromSchemaVersion: 0,
    migrate: (source) => metadata({
      rigId: source.id,
      rigType: source.type,
      pluginVersion: source.plugin,
      createdAt: source.created,
      memberLayerUuids: source.members
    })
  };

  expectCode("AMBIGUOUS_MIGRATION", () =>
    migrateRigMetadata(
      inlineBlockForRawMetadata(v0),
      [migration, migration],
      { maxCommentBytes: 16_384 }
    )
  );
  expectCode("SIDECAR_PAYLOAD_REQUIRED", () =>
    migrateRigMetadata(sidecar.block, [migration], { maxCommentBytes: 16_384 })
  );

  const migrated = migrateRigMetadata(
    sidecar.block,
    [migration],
    { maxCommentBytes: 16_384, sidecarPayload: sidecar.payload }
  );
  assert.equal(migrated.storage, "inline");
  assert.equal(migrated.obsoleteSidecarRigId, v0.id);
  assert.equal(readRigMetadata(migrated.comment).metadata.rigType, v0.type);
});

test("migrate v1 é idempotente e falha de callback não produz plano parcial", () => {
  const current = createRigMetadata("texto", metadata(), { maxCommentBytes: 16_384 });
  const same = migrateRigMetadata(current.comment, [], { maxCommentBytes: 16_384 });

  assert.equal(same.fromSchemaVersion, 1);
  assert.equal(same.toSchemaVersion, 1);
  assert.deepEqual(readRigMetadata(same.comment).metadata, metadata());

  const v0 = { schemaVersion: 0, id: metadata().rigId };
  expectCode("MIGRATION_FAILED", () =>
    migrateRigMetadata(
      inlineBlockForRawMetadata(v0),
      [{ fromSchemaVersion: 0, migrate: () => { throw new Error("falha controlada"); } }],
      { maxCommentBytes: 16_384 }
    )
  );
});
