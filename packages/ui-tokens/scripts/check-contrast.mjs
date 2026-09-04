import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CSS_URL = new URL("../src/tokens.css", import.meta.url);

function selectorBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Seletor ${selector} ausente.`);
  const bodyStart = css.indexOf("{", start) + 1;
  const end = css.indexOf("}", bodyStart);
  if (end < 0) throw new Error(`Seletor ${selector} nao fecha.`);
  return css.slice(bodyStart, end);
}

function declarations(block) {
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6});/gi)].map((match) => [
      match[1],
      match[2].toUpperCase()
    ])
  );
}

function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function token(tokens, name) {
  const value = tokens.get(name);
  if (!value) throw new Error(`Token de cor --${name} ausente.`);
  return value;
}

const TEXT_SURFACES = ["bg-host", "bg-2", "bg-3", "bg-4"];
const TEXT_COLORS = ["txt-1", "txt-2", "txt-3", "ok", "warn", "danger", "info"];

function auditTheme(name, tokens) {
  const checks = [];

  for (const foreground of TEXT_COLORS) {
    for (const background of TEXT_SURFACES) {
      checks.push({ name, foreground, background, target: 4.5 });
    }
  }
  checks.push({ name, foreground: "line-strong", background: "bg-2", target: 3 });
  checks.push({ name, foreground: "txt-1", background: "bg-2", target: 3, label: "focus-ring" });
  checks.push({ name, foreground: "accent", background: "bg-2", target: 3 });
  for (const background of ["accent", "accent-hover", "accent-press"]) {
    checks.push({ name, foreground: "accent-on", background, target: 4.5 });
  }

  return checks.map((check) => {
    const ratio = contrastRatio(token(tokens, check.foreground), token(tokens, check.background));
    return { ...check, ratio, ok: ratio >= check.target };
  });
}

export async function auditContrastTokens() {
  const css = await readFile(CSS_URL, "utf8");
  const dark = declarations(selectorBlock(css, ":root"));
  const light = new Map(dark);
  for (const [key, value] of declarations(selectorBlock(css, '[data-theme="light"]'))) {
    light.set(key, value);
  }
  const checks = [...auditTheme("dark", dark), ...auditTheme("light", light)];
  return { checks, violations: checks.filter((check) => !check.ok) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await auditContrastTokens();
  if (report.violations.length > 0) {
    for (const violation of report.violations) {
      console.error(
        `${violation.name}: --${violation.foreground} / --${violation.background} = ${violation.ratio.toFixed(2)}:1 (min ${violation.target}:1)`
      );
    }
    process.exitCode = 1;
  } else {
    console.log(`A11y contrast: PASS (${report.checks.length} pares).`);
  }
}
