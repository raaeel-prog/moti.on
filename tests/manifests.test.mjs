import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("IDs dos hosts são distintos e consistentes", async () => {
  const premiere = JSON.parse(await readFile(path.join(root, "src/premiere-uxp/manifest.json"), "utf8"));
  const ae = await readFile(path.join(root, "src/after-effects-cep/CSXS/manifest.xml"), "utf8");

  assert.equal(premiere.id, "com.example.crosshosttoolkit.premiere");
  assert.match(ae, /com\.example\.crosshosttoolkit\.ae\.panel/);
  assert.notEqual(premiere.id, "com.example.crosshosttoolkit.ae.panel");
});
