import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  ERROR_META,
  LEGACY_CODE_MAP,
  PROTOCOL_VERSION,
  fromLegacy,
  isCommandResponse,
  isErrorCode,
  mapLegacyCode,
  toLegacy
} from "../dist/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("PROTOCOL_VERSION é 1", () => {
  assert.equal(PROTOCOL_VERSION, 1);
});

test("os 22 códigos da especificação estão presentes, sem duplicata", () => {
  // A lista vem da §8 do master spec. O número não é decorativo: se um código
  // sumir numa refatoração, os comandos que dependiam dele passam a cair em
  // INTERNAL_ERROR e o usuário perde a ação corretiva específica.
  assert.equal(ERROR_CODES.length, 22);
  assert.equal(new Set(ERROR_CODES).size, 22, "Há código duplicado em ERROR_CODES.");

  for (const required of [
    "NO_ACTIVE_PROJECT",
    "NO_ACTIVE_COMP",
    "NO_ACTIVE_SEQUENCE",
    "NO_SELECTION",
    "INVALID_SELECTION_TYPE",
    "UNSUPPORTED_HOST_VERSION",
    "CAPABILITY_UNAVAILABLE",
    "PERMISSION_DENIED",
    "NETWORK_UNAVAILABLE",
    "PROVIDER_ERROR",
    "LICENSE_REQUIRED",
    "MODEL_NOT_INSTALLED",
    "NATIVE_SERVICE_UNAVAILABLE",
    "INVALID_PRESET",
    "EXPRESSION_CONFLICT",
    "KEYFRAME_CONFLICT",
    "TRACK_CONFLICT",
    "ASSET_LICENSE_BLOCKED",
    "USER_CANCELLED",
    "HOST_OPERATION_FAILED",
    "ROLLBACK_FAILED",
    "INTERNAL_ERROR"
  ]) {
    assert.ok(ERROR_CODES.includes(required), `Falta o código ${required}.`);
  }
});

test("ERROR_META cobre todo código e toda entrada tem chave de ação", () => {
  assert.deepEqual(Object.keys(ERROR_META).sort(), [...ERROR_CODES].sort());

  for (const code of ERROR_CODES) {
    const meta = ERROR_META[code];
    assert.equal(typeof meta.recoverable, "boolean", `${code}: recoverable ausente.`);
    assert.match(
      meta.actionKey,
      /^error\.action\.[a-zA-Z]+$/,
      `${code}: actionKey deve ser chave i18n, não frase. Recebido: ${meta.actionKey}`
    );
  }
});

test("isErrorCode rejeita string que não pertence à lista fechada", () => {
  assert.ok(isErrorCode("NO_SELECTION"));
  assert.ok(!isErrorCode("AE_CONTEXT_ERROR"));
  assert.ok(!isErrorCode(""));
  assert.ok(!isErrorCode(undefined));
  assert.ok(!isErrorCode(42));
});

test("todo destino de LEGACY_CODE_MAP é um código válido", () => {
  // Um destino escrito errado transformaria a tradução num código inexistente,
  // que passaria pelo TypeScript se alguém usasse `as` e explodiria só na UI.
  for (const [legacy, mapped] of Object.entries(LEGACY_CODE_MAP)) {
    assert.ok(isErrorCode(mapped), `${legacy} aponta para ${mapped}, que não existe.`);
  }
});

test("mapLegacyCode traduz, preserva o que já é válido e tem padrão seguro", () => {
  assert.equal(mapLegacyCode("AE_CONTEXT_ERROR"), "HOST_OPERATION_FAILED");
  assert.equal(mapLegacyCode("NO_ACTIVE_PROJECT"), "NO_ACTIVE_PROJECT");
  assert.equal(mapLegacyCode("USER_CANCELLED"), "USER_CANCELLED");
  assert.equal(mapLegacyCode("ALGO_QUE_NUNCA_EXISTIU"), "INTERNAL_ERROR");
  assert.equal(mapLegacyCode(undefined), "INTERNAL_ERROR");
});

test("fromLegacy monta um CommandResponse completo a partir de sucesso", () => {
  const response = fromLegacy(
    { ok: true, data: { projectName: "demo" }, error: null },
    "req-1",
    "2026-08-24T15:00:00.000Z",
    12
  );

  assert.equal(response.protocolVersion, 1);
  assert.equal(response.requestId, "req-1");
  assert.equal(response.ok, true);
  assert.deepEqual(response.data, { projectName: "demo" });
  assert.deepEqual(response.warnings, []);
  assert.equal(response.error, null);
  assert.deepEqual(response.timing, { startedAt: "2026-08-24T15:00:00.000Z", durationMs: 12 });
  assert.ok(isCommandResponse(response));
});

test("fromLegacy traz recoverable e ação corretiva para a falha", () => {
  const response = fromLegacy(
    { ok: false, data: null, error: { code: "NO_ACTIVE_PROJECT", message: "Sem projeto." } },
    "req-2",
    "2026-08-24T15:00:00.000Z",
    3
  );

  assert.equal(response.ok, false);
  assert.equal(response.data, null);
  assert.equal(response.error.code, "NO_ACTIVE_PROJECT");
  assert.equal(response.error.recoverable, true);
  assert.equal(response.error.action, "error.action.openProject");
});

test("fromLegacy preserva o código original quando a tradução perde informação", () => {
  // AE_CREATE_COMP_ERROR e AE_CONTEXT_ERROR viram ambos HOST_OPERATION_FAILED.
  // Sem preservar o original, os dois ficariam indistinguíveis no diagnóstico, e
  // pedem investigação diferente.
  const response = fromLegacy(
    { ok: false, data: null, error: { code: "AE_CREATE_COMP_ERROR", message: "falhou", line: 97 } },
    "req-3",
    "2026-08-24T15:00:00.000Z",
    5
  );

  assert.equal(response.error.code, "HOST_OPERATION_FAILED");
  assert.equal(response.error.details.legacyCode, "AE_CREATE_COMP_ERROR");
  assert.equal(response.error.details.legacyDetails, 97);
});

test("fromLegacy não inventa mensagem quando o host não mandou nenhuma", () => {
  const response = fromLegacy(
    { ok: false, data: null, error: { code: "INTERNAL_ERROR" } },
    "req-4",
    "2026-08-24T15:00:00.000Z",
    1
  );
  assert.equal(typeof response.error.message, "string");
  assert.ok(response.error.message.length > 0);
});

test("toLegacy preserva ok, data e código através do ida e volta", () => {
  const fixtures = [
    { ok: true, data: { a: 1 }, error: null },
    { ok: false, data: null, error: { code: "NO_ACTIVE_PROJECT", message: "x", details: null } },
    { ok: false, data: null, error: { code: "USER_CANCELLED", message: "y", details: null } }
  ];

  for (const original of fixtures) {
    const roundTripped = toLegacy(fromLegacy(original, "req", "2026-08-24T15:00:00.000Z", 0));
    assert.equal(roundTripped.ok, original.ok);
    assert.deepEqual(roundTripped.data, original.ok ? original.data : null);
    assert.equal(roundTripped.error?.code ?? null, original.error?.code ?? null);
  }
});

test("isCommandResponse recusa envelope de outra versão de protocolo", () => {
  assert.ok(
    !isCommandResponse({
      protocolVersion: 2,
      requestId: "x",
      ok: true,
      data: null,
      warnings: [],
      error: null
    }),
    "Um envelope de protocolo 2 não pode ser aceito como se fosse v1."
  );
});

test("isCommandResponse recusa o envelope legado", () => {
  assert.ok(!isCommandResponse({ ok: true, data: {}, error: null }));
  assert.ok(!isCommandResponse(null));
  assert.ok(!isCommandResponse("{}"));
});

test("o módulo ES5 gerado expõe exatamente os mesmos códigos do TypeScript", async () => {
  const generated = await readFile(
    path.join(packageRoot, "../../apps/after-effects-cep/host/generated/motion-contracts.jsx"),
    "utf8"
  );

  // O host não importa TypeScript, então as constantes existem duas vezes. Este
  // teste é o que impede as duas cópias de divergirem.
  for (const code of ERROR_CODES) {
    assert.match(
      generated,
      new RegExp(`${code}:\\s*"${code}"`),
      `O módulo ES5 gerado não expõe ${code}.`
    );
  }

  const emitted = [...generated.matchAll(/^\s{6}([A-Z_]+): "/gm)].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(emitted)].sort(),
    [...ERROR_CODES].sort(),
    "O módulo ES5 gerado tem códigos a mais ou a menos que ERROR_CODES."
  );
});
