import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import { AE_THEME_SOURCES, renderTheme } from "../../../scripts/theme-sources.mjs";
import { auditContrastTokens } from "../../ui-tokens/scripts/check-contrast.mjs";

const source = await readFile(new URL("../src/ae-refinement.css", import.meta.url), "utf8");
const sheet = postcss.parse(source);
const settingsSource=await readFile(new URL("../src/ae-settings.css",import.meta.url),"utf8");

test("AE settings refinements target only settings controls",()=>{
  postcss.parse(settingsSource).walkRules(rule=>{for(const selector of rule.selectors)assert.ok(selector==='[data-host="after-effects"] .ch-settings'||selector.startsWith('[data-host="after-effects"] .ch-settings '),selector);});
});

test("AE refinement cannot leak rules or inherited palette changes into Premiere and tool tiles", () => {
  sheet.walkRules(rule => {
    for (const selector of rule.selectors) {
      assert.ok(selector.startsWith('[data-host="after-effects"] '), `Unscoped rule: ${selector}`);
      const target = selector.slice(selector.lastIndexOf(" ") + 1);
      assert.doesNotMatch(target, /^(?:\.ch-shell(?:\[.*?\])?|\.ch-tool-tile|\.ch-quick-tile|\.ch-tool__primary|\.ch-icon|\*|button)$/,
        `Refinement must target explicit controls, never protected containers: ${selector}`);
    }
    rule.walkDecls(/^--/, declaration => {
      for (const selector of rule.selectors) {
        assert.match(selector, /(?:--primary|ch-applied-unit|(?:number|input).*)$/, `Palette changes must remain local to action/value controls: ${selector}`);
      }
      assert.doesNotMatch(declaration.prop, /^(?:--bg-|--surface-|--icon-|--text-|--focus-)/,
        `Protected theme token changed: ${declaration.prop}`);
    });
  });
});

test("functional text and button labels retain AA contrast in dark and light including hover/press", async () => {
  const report = await auditContrastTokens();
  const checks = report.checks.filter(check => check.foreground.startsWith("action-"));
  assert.equal(checks.length, 54, "All text surfaces and button states must be audited in both themes and the AE palette");
  assert.deepEqual(checks.filter(check => !check.ok), []);
});

test("distributed AE theme extends the shared Premiere theme without altering it", async () => {
  const ae = await readFile(new URL("../../../dist/after-effects-cep/styles/theme.css", import.meta.url), "utf8");
  const premiere = await readFile(new URL("../../../dist/premiere-uxp/styles/theme.css", import.meta.url), "utf8");
  assert.ok(ae.startsWith(premiere.trimEnd()), "The shared theme is an unchanged prefix");
  const suffix = ae.slice(premiere.trimEnd().length).trim();
  const aeRules = postcss.parse(suffix);
  const palette = aeRules.nodes.find(node => node.type === "rule");
  assert.match(palette.selector, /:root\[data-host=["']?after-effects["']?\]/);
  const scopedSheets = new Set([
    "ae-composer-browse.css", "ae-micro.css", "ae-preset-actions.css",
    "ae-preset-gallery.css", "ae-design-system.css", "ae-icon-life.css", "ae-action-button.css", "ae-slider.css"
  ]);
  for (const relative of AE_THEME_SOURCES) {
    const source = await readFile(new URL(`../../../${relative}`, import.meta.url), "utf8");
    const sheet = postcss.parse(source, { from: relative });
    if (!scopedSheets.has(relative.split("/").at(-1))) continue;
    sheet.walkRules(rule => {
      if (rule.parent.type === "atrule" && rule.parent.name.endsWith("keyframes")) return;
      for (const selector of rule.selectors) {
        assert.match(selector, /^(?::root)?\[data-host="after-effects"\]/, relative);
      }
    });
  }
  assert.equal(ae, await renderTheme({ afterEffects: true }), "The installed stylesheet includes the complete AE extension");
  assert.equal(premiere, await renderTheme({ afterEffects: false }));
  assert.ok(!premiere.includes('[data-host="after-effects"]'), "AE rules are absent from Premiere output");
  const html = await readFile(new URL("../../../dist/after-effects-cep/client/index.html", import.meta.url), "utf8");
  assert.match(html, /<body data-host="after-effects">/);
});
