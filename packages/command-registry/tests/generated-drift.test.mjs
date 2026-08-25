import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GENERATED_PATH, renderModule } from "../scripts/gen-extendscript.mjs";

test("descriptors ExtendScript correspondem exatamente ao catálogo TypeScript", async () => {
  const expected = await renderModule();
  const actual = await readFile(GENERATED_PATH, "utf8");

  assert.equal(
    actual,
    expected,
    "motion-descriptors.jsx está fora de sincronia; regenere pelo build, nunca à mão."
  );
});

test("requirements atravessam a geração para o gate do host", async () => {
  const rendered = await renderModule();

  assert.match(rendered, /"ae\.demo\.createComposition": \{[\s\S]*?requirements: \["hasProject"\]/);
  assert.match(rendered, /"ae\.context\.read": \{[\s\S]*?requirements: \[\]/);
});
