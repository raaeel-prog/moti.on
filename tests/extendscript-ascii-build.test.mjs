import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

import * as extendScriptBuilder from "../scripts/build-extendscript.mjs";

function assertAsciiOnly(source, label) {
  const offendingIndex = [...source].findIndex((character) => character.codePointAt(0) > 0x7f);
  assert.equal(offendingIndex, -1, `${label} contém code point acima de U+007F.`);
}

test("transformação preserva strings e regex ASCII sem reescrever identificadores", () => {
  assert.equal(
    typeof extendScriptBuilder.toAsciiExtendScript,
    "function",
    "O builder precisa expor a transformação para teste direto."
  );

  const source = [
    "// comentário em português",
    'var title = "Composição 🎬";',
    "var matcher = /[\"']+/;",
    "var result = title + ':' + matcher.test(\"'\");"
  ].join("\n");
  const transformed = extendScriptBuilder.toAsciiExtendScript(source, "fixture.jsx");

  assertAsciiOnly(transformed, "fixture transformado");
  assert.ok(transformed.includes(`/["']+/`), "regex ASCII deve permanecer byte a byte igual");

  const execute = new Function(`${transformed}\nreturn result;`);
  assert.equal(execute(), "Composição 🎬:true");

  assert.throws(
    () => extendScriptBuilder.toAsciiExtendScript("var ação = 1;", "identifier.jsx"),
    /fora de string ou comentário.*identifier\.jsx/i
  );
  assert.throws(
    () => extendScriptBuilder.toAsciiExtendScript("var matcher = /ação/;", "regex.jsx"),
    /expressão regular.*escape.*regex\.jsx/i
  );
});

test("bundle final é ASCII-only e continua executando o dispatcher", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "motion-ae-ascii-"));
  t.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  const outputPath = path.join(temporaryRoot, "host", "index.jsx");
  const result = await extendScriptBuilder.buildExtendScript(outputPath);
  const bundle = await readFile(outputPath, "utf8");

  assertAsciiOnly(bundle, "host/index.jsx");
  assert.equal(result.bytes, bundle.length, "em ASCII, bytes UTF-8 e code units devem coincidir");
  assert.ok(bundle.startsWith("#target aftereffects\n"));

  const runtimeSource = bundle.replace(/^#target aftereffects\r?\n/, "");
  const sandbox = {
    app: { version: "26.3", project: null }
  };
  sandbox.$ = { global: sandbox };
  vm.createContext(sandbox);

  new vm.Script(runtimeSource, { filename: "host/index.jsx" }).runInContext(sandbox);
  assert.equal(typeof sandbox.MotionAE?.dispatch, "function");

  const raw = sandbox.MotionAE.dispatch(
    JSON.stringify({
      protocolVersion: 1,
      requestId: "ascii-build-smoke",
      command: "ae.context.read",
      args: {},
      context: { host: "after-effects", hostVersion: "26.3" }
    })
  );
  const response = JSON.parse(raw);

  assert.equal(response.ok, true);
  assert.equal(response.requestId, "ascii-build-smoke");
  assert.equal(response.data.hostVersion, "26.3");
});
