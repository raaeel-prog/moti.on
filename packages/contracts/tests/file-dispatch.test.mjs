import test from "node:test";
import assert from "node:assert/strict";

import { buildFileDispatchCall } from "../dist/index.js";

/**
 * Pedido grande por arquivo temporário. A chamada é avaliada aqui com um `File`
 * falso, como o ExtendScript a avaliaria: o que importa é que toda falha de
 * leitura devolve a resposta completa montada pelo cliente, com o requestId,
 * em vez de um JSON que o cliente descartaria.
 */
const failure = JSON.stringify({ protocolVersion: 1, requestId: "req-42", ok: false, data: null, warnings: [], error: { code: "INTERNAL_ERROR", message: "não leu", recoverable: true, action: "error.action.exportLogBundle", details: null } });

function run(call, { content = "", opens = true, throws = false, motion } = {}) {
  const removed = [];
  class File {
    constructor(path) { this.path = path; }
    open() { if (throws) throw new Error("io"); return opens; }
    read() { return content; }
    close() {}
    remove() { removed.push(this.path); }
  }
  const result = new Function("File", "MotionAE", `return ${call};`)(File, motion);
  return { result, removed };
}

test("a chamada é ASCII e aponta para o arquivo com barras normais", () => {
  const call = buildFileDispatchCall("C:\\Users\\é\\motion_req.json", failure);
  assert.match(call, /^[\x20-\x7e]+$/);
  assert.match(call, /C:\/Users\/\\u00e9\/motion_req\.json/);
});

test("arquivo lido vai ao dispatcher e é removido", () => {
  const call = buildFileDispatchCall("/tmp/a.json", failure);
  const { result, removed } = run(call, { content: "{\"x\":1}", motion: { dispatch: (c) => `ok:${c}` } });
  assert.equal(result, "ok:{\"x\":1}");
  assert.deepEqual(removed, ["/tmp/a.json"]);
});

test("arquivo vazio, ilegível ou host ausente devolvem a falha com requestId", () => {
  const call = buildFileDispatchCall("/tmp/a.json", failure);
  for (const scenario of [{ content: "" , motion: { dispatch: () => "nunca" } }, { opens: false, motion: { dispatch: () => "nunca" } }, { throws: true }, { content: "{}", motion: undefined }]) {
    const { result } = run(call, scenario);
    const parsed = JSON.parse(result);
    assert.equal(parsed.requestId, "req-42");
    assert.equal(parsed.ok, false);
  }
});
