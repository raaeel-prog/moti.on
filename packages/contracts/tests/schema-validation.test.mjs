import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import {
  CONTRACT_SCHEMA_VERSION,
  ERROR_CODES,
  ERROR_META,
  PRESET_SCHEMA_VERSION,
  PROTOCOL_VERSION,
  isCommandRequest,
  isCommandResponse,
  isHostCapabilities,
  isRigMetadata,
  validateCommandRequest,
  validateCommandResponse,
  validateHostCapabilities,
  validateRigMetadata
} from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaFiles = [
  "command-request.v1.schema.json",
  "command-response.v1.schema.json",
  "host-capabilities.v1.schema.json",
  "rig-metadata.v1.schema.json",
  "preset-definition.v1.schema.json",
  "preset-definition.v2.schema.json"
];

async function readSchemas() {
  return Promise.all(
    schemaFiles.map(async (filename) =>
      JSON.parse(await readFile(path.join(packageRoot, "schemas", filename), "utf8"))
    )
  );
}

function validRequest() {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    command: "ae.context.read",
    args: { nested: ["á", 1, true, null] },
    context: {
      host: "after-effects",
      hostVersion: "26.3",
      locale: "pt-BR"
    },
    options: { dryRun: false, preserveSelection: true }
  };
}

function validSuccess() {
  return {
    protocolVersion: 1,
    requestId: "req-1",
    ok: true,
    data: { project: null },
    warnings: [],
    error: null,
    timing: { startedAt: "2026-08-25T12:00:00.000Z", durationMs: 3 }
  };
}

function validFailure() {
  return {
    protocolVersion: 1,
    requestId: "req-2",
    ok: false,
    data: null,
    warnings: [{ code: "FALLBACK", message: "Fallback aplicado." }],
    error: {
      code: "NO_ACTIVE_PROJECT",
      message: "Não foi possível concluir.",
      recoverable: true,
      action: "error.action.openProject",
      details: { command: "ae.context.read" }
    }
  };
}

function validCapabilities(host = "after-effects") {
  const common = {
    host,
    hostVersion: "26.3",
    supportTier: "full",
    hasProject: true,
    canWriteFiles: true,
    canAccessNetwork: false,
    canUseNativeAddon: false,
    canReachCompanion: false,
    canInsertMogrt: false,
    canReadTranscript: false,
    canImportTranscript: false,
    canQueryTranscriptLanguages: false,
    canReadCaptionTracks: false,
    findings: {
      hasProject: { state: "available" },
      canAccessNetwork: {
        state: "unavailable",
        reasonKey: "capability.reason.notAvailable"
      }
    }
  };

  return host === "after-effects"
    ? { ...common, hasActiveComp: true, expressionEngine: "javascript" }
    : { ...common, hasActiveSequence: true };
}

function validRigMetadata() {
  return {
    schemaVersion: 1,
    rigId: "31e88ea5-701f-4596-8a5f-680a87f05db8",
    rigType: "parallax",
    pluginVersion: "0.1.0",
    createdAt: "2026-08-25T12:00:00.000Z",
    memberLayerUuids: ["92eef8ff-f83d-473c-a43f-76f65b4b7d85"],
    userOverrides: { title: "São João", strength: 0.5 }
  };
}

test("todos os schemas são válidos, versionados e compilam no Ajv 2020", async () => {
  const schemas = await readSchemas();
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  const ids = new Set();

  for (const schema of schemas) {
    assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /\.v[12]\.schema\.json$/);
    assert.ok(!ids.has(schema.$id), `Schema id duplicado: ${schema.$id}`);
    ids.add(schema.$id);
    ajv.compile(schema);
  }

  assert.equal(CONTRACT_SCHEMA_VERSION, PROTOCOL_VERSION);
  assert.equal(PRESET_SCHEMA_VERSION, 2);
});

test("o enum JSON de erros permanece sincronizado com a união TypeScript", async () => {
  const [, responseSchema] = await readSchemas();
  assert.deepEqual(responseSchema.$defs.errorCode.enum, [...ERROR_CODES]);
  assert.deepEqual(
    [...responseSchema.$defs.failure.properties.action.enum].sort(),
    [...new Set(Object.values(ERROR_META).map(({ actionKey }) => actionKey))].sort()
  );
});

test("request válido atravessa schema e guarda profundo", () => {
  const request = validRequest();
  assert.equal(isCommandRequest(request), true);
  const result = validateCommandRequest(request);
  assert.deepEqual(result, { valid: true, value: request, issues: [] });
  assert.notStrictEqual(result.value, request, "O gate precisa devolver snapshot, não o objeto vivo.");
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.args));
  assert.ok(Object.isFrozen(result.value.args.nested));
});

test("request recusa versão, campos extras e valores que JSON não representa", () => {
  assert.equal(isCommandRequest({ ...validRequest(), protocolVersion: 2 }), false);
  assert.equal(isCommandRequest({ ...validRequest(), extra: true }), false);
  assert.equal(
    isCommandRequest({
      ...validRequest(),
      context: { ...validRequest().context, nativePath: "C:\\segredo\\projeto.aep" }
    }),
    false
  );
  assert.equal(isCommandRequest({ ...validRequest(), args: { value: Number.NaN } }), false);
  assert.equal(isCommandRequest({ ...validRequest(), args: { value: undefined } }), false);
  assert.equal(isCommandRequest({ ...validRequest(), args: new Date() }), false);
  for (const args of [null, "texto", 1, true, []]) {
    assert.equal(isCommandRequest({ ...validRequest(), args }), false);
  }

  const cycle = {};
  cycle.self = cycle;
  const result = validateCommandRequest({ ...validRequest(), args: cycle });
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "cycle");
});

test("request recusa hooks de serialização e accessors antes de JSON.stringify", () => {
  const hooked = { safe: true };
  Object.defineProperty(hooked, "toJSON", {
    value: () => ({ injected: true }),
    enumerable: false
  });
  const hookedResult = validateCommandRequest({ ...validRequest(), args: hooked });
  assert.equal(hookedResult.valid, false);
  assert.equal(hookedResult.issues[0].code, "toJSON");

  const accessor = {};
  Object.defineProperty(accessor, "value", {
    get: () => "muda a cada leitura",
    enumerable: true
  });
  const accessorResult = validateCommandRequest({ ...validRequest(), args: accessor });
  assert.equal(accessorResult.valid, false);
  assert.equal(accessorResult.issues[0].code, "accessor");
});

test("response válida aceita sucesso e falha tipada", () => {
  assert.equal(isCommandResponse(validSuccess()), true);
  assert.equal(isCommandResponse(validFailure()), true);
});

test("response recusa envelope superficial, código inventado e invariantes quebradas", () => {
  const malformed = [
    { ...validFailure(), error: {} },
    { ...validFailure(), error: { ...validFailure().error, code: "AE_CONTEXT_ERROR" } },
    { ...validSuccess(), error: validFailure().error },
    { ...validFailure(), data: { partial: true } },
    { ...validFailure(), error: { ...validFailure().error, action: undefined } },
    { ...validFailure(), error: { ...validFailure().error, action: "error.action.invented" } },
    { ...validSuccess(), warnings: [{ code: "X" }] },
    { ...validSuccess(), timing: { startedAt: "now", durationMs: -1 } },
    { ...validSuccess(), unknown: true }
  ];

  for (const response of malformed) {
    assert.equal(isCommandResponse(response), false, JSON.stringify(response));
  }
});

test("issues apontam o campo sem ecoar o dado recusado", () => {
  const secret = "C:\\Users\\alguem\\projeto-secreto.aep";
  const result = validateCommandResponse({
    ...validFailure(),
    error: { ...validFailure().error, code: secret }
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "/error/code"));
  assert.ok(result.issues.every((issue) => !issue.message.includes(secret)));
});

test("capabilities validam os dois hosts e recusam campos cruzados", () => {
  assert.equal(isHostCapabilities(validCapabilities("after-effects")), true);
  assert.equal(isHostCapabilities(validCapabilities("premiere-pro")), true);
  assert.equal(
    isHostCapabilities({ ...validCapabilities("premiere-pro"), hasActiveComp: true }),
    false
  );
  assert.equal(
    validateHostCapabilities({
      ...validCapabilities(),
      findings: { canWriteFiles: { state: "unknown" } }
    }).valid,
    false
  );
});

test("rig metadata valida JSON Unicode e falha fechado em schema ou membros inválidos", () => {
  assert.equal(isRigMetadata(validRigMetadata()), true);
  assert.equal(validateRigMetadata({ ...validRigMetadata(), schemaVersion: 2 }).valid, false);
  assert.equal(validateRigMetadata({ ...validRigMetadata(), memberLayerUuids: [] }).valid, false);
  assert.equal(
    validateRigMetadata({ ...validRigMetadata(), userOverrides: { callback: () => true } }).valid,
    false
  );
});
