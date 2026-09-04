import test from "node:test";
import assert from "node:assert/strict";
import { auditContrastTokens } from "../scripts/check-contrast.mjs";

test("todos os pares normativos de contraste passam nos dois temas", async () => {
  const report = await auditContrastTokens();
  assert.deepEqual(
    report.violations,
    [],
    report.violations
      .map((item) => `${item.name}: ${item.foreground}/${item.background} ${item.ratio.toFixed(2)}:1`)
      .join("\n")
  );
});
