import test from "node:test";
import assert from "node:assert/strict";
import { auditContrastTokens, contrastRatio, resolveColorToken, themeDeclarations } from "../scripts/check-contrast.mjs";

test("todos os pares normativos de contraste passam nos dois temas", async () => {
  const report = await auditContrastTokens();
  assert.deepEqual(
    report.violations,
    [],
    report.violations
      .map((item) => `${item.name}: ${item.foreground}/${item.background} ${item.ratio.toFixed(2)}:1`)
      .join("\n")
  );
  for (const name of ["dark", "light"]) {
    assert.ok(report.checks.some((check) => check.name === name && check.foreground === "txt-1"));
    assert.ok(report.checks.some((check) => check.name === name && check.foreground === "text-muted" && check.background === "bg-elevated"));
  }
});

test("aliases de cor respeitam overrides do tema antes de calcular contraste", () => {
  const css = ':root { --white: #FFFFFF; --ink: #000000; --foreground: var(--white); --background: var(--ink); }\n[data-theme="light"] { --foreground: var(--ink); --background: var(--white); }';
  for (const name of ["dark", "light"]) {
    const tokens = themeDeclarations(css, name);
    const foreground = resolveColorToken(tokens, "foreground");
    const background = resolveColorToken(tokens, "background");
    assert.equal(foreground, name === "dark" ? "#FFFFFF" : "#000000");
    assert.equal(contrastRatio(foreground, background), 21);
  }
});

test("aliases incompletos, circulares ou formatos nao suportados falham explicitamente", () => {
  assert.throws(() => resolveColorToken(new Map([["text", "var(--missing)"]]), "text"), /--missing ausente/);
  assert.throws(() => resolveColorToken(new Map([["a", "var(--b)"], ["b", "var(--a)"]]), "a"), /circular/);
  assert.throws(() => resolveColorToken(new Map([["text", "rgba(255,255,255,.5)"]]), "text"), /nao suportado/);
});
