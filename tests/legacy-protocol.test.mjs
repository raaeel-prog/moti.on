import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Protocol = require(path.join(root, "packages/contracts/legacy/protocol.js"));

test("parse aceita envelope válido", () => {
  const envelope = Protocol.parse('{"ok":true,"data":{"name":"demo"},"error":null}');
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.name, "demo");
});

test("parse transforma resposta inválida em erro tipado", () => {
  const envelope = Protocol.parse("não é JSON");
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, "HOST_RESPONSE_PARSE_ERROR");
});

test("formatDimension normaliza dimensões", () => {
  assert.equal(Protocol.formatDimension(1920, 1080), "1920 × 1080");
  assert.equal(Protocol.formatDimension(null, 1080), "—");
});
