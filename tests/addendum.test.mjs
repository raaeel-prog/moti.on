import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ADDENDUM_URL = new URL("../docs/ADDENDUM_A_QUICK_UX_SPEC.md", import.meta.url);
const EXPECTED_SHA256 = "7BE27FB642B5346A797AD28F8C90371311A90F50B1A138CF00C68B1463D01A1D";

test("o Addendum A anexado permanece byte a byte igual ao documento fornecido", async () => {
  const contents = await readFile(ADDENDUM_URL);
  const actualSha256 = createHash("sha256").update(contents).digest("hex").toUpperCase();

  assert.equal(
    actualSha256,
    EXPECTED_SHA256,
    "o Addendum A foi alterado ou truncado; compare-o novamente com o arquivo-fonte antes de atualizar este hash"
  );
});
