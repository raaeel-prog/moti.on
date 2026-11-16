import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
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
  const settings=await readFile(new URL("../src/ae-settings.css",import.meta.url),"utf8");
  const camera=await readFile(new URL("../src/ae-camera.css",import.meta.url),"utf8");
  const suffix=ae.slice(premiere.trimEnd().length).trim();
  const palette=await readFile(new URL("../../ui-tokens/src/after-effects.css",import.meta.url),"utf8");
  const workstation=await readFile(new URL("../src/ae-workstation.css",import.meta.url),"utf8");
  const motion=await readFile(new URL("../src/ae-motion.css",import.meta.url),"utf8");
  const quick=await readFile(new URL("../src/ae-quick-actions.css",import.meta.url),"utf8");
  assert.ok(suffix.startsWith(palette.trim()));
  const refinement=suffix.slice(palette.trim().length).trim();
  assert.ok(refinement.startsWith(source.trim()));
  const layers=refinement.slice(source.trim().length).trim();
  assert.ok(layers.startsWith(settings.trim()),"AE settings follow the refinement layer");
  const rest=layers.slice(settings.trim().length).trim();
  assert.ok(rest.startsWith(camera.trim()));
  const tail=rest.slice(camera.trim().length).trim();
  assert.ok(tail.startsWith(workstation.trim()));
  const afterWorkstation=tail.slice(workstation.trim().length).trim();
  assert.ok(afterWorkstation.startsWith(motion.trim()),"The AE motion layer follows the workstation layer");
  const gradient=await readFile(new URL("../../../apps/after-effects-cep/client/src/gradient-preview.css",import.meta.url),"utf8");
  const particles=await readFile(new URL("../src/particles-editor.css",import.meta.url),"utf8");
  const layout=await readFile(new URL("../src/ae-layout.css",import.meta.url),"utf8");
  // Árvore/menu no padrão Composer e micro-interações: as duas últimas camadas do AE.
  const composerBrowse=await readFile(new URL("../src/ae-composer-browse.css",import.meta.url),"utf8");
  const micro=await readFile(new URL("../src/ae-micro.css",import.meta.url),"utf8");
  // Menu Ações de presets e polimento da aba Presets/busca vêm depois, nessa ordem.
  const presetActions=await readFile(new URL("../src/ae-preset-actions.css",import.meta.url),"utf8");
  const browsePolish=await readFile(new URL("../src/ae-browse-polish.css",import.meta.url),"utf8");
  // Gaveta de ajustes do preset na grade: a última camada, para vencer o popover fixo.
  const presetDrawer=await readFile(new URL("../src/ae-preset-drawer.css",import.meta.url),"utf8");
  // Design system do painel (2026-11-12): fecha o tema do AE.
  const designSystem=await readFile(new URL("../src/ae-design-system.css",import.meta.url),"utf8");
  // Ícones vivos (2026-11-16): resposta ao ponteiro, depois do design system.
  const iconLife=await readFile(new URL("../src/ae-icon-life.css",import.meta.url),"utf8");
  for(const [name,layer] of [["ae-composer-browse.css",composerBrowse],["ae-micro.css",micro],["ae-preset-actions.css",presetActions],["ae-browse-polish.css",browsePolish],["ae-preset-drawer.css",presetDrawer],["ae-design-system.css",designSystem],["ae-icon-life.css",iconLife]]){
    // Sem comentários e sem o corpo dos @keyframes, todo seletor de regra precisa começar no escopo do AE.
    const css=layer.replace(/\/\*[\s\S]*?\*\//g,"").replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g,"");
    for(const match of css.matchAll(/([^{};]+)\{/g)){
      const selector=match[1].trim();
      if(!selector||selector.startsWith("@"))continue;
      for(const part of selector.split(/,(?![^(]*\))/))assert.ok(part.trim().startsWith('[data-host="after-effects"]'),`${name}: unscoped selector "${part.trim()}"`);
    }
  }
  let previewTail=afterWorkstation.slice(motion.trim().length).trim();
  for(const layer of [quick,gradient,particles,layout,composerBrowse,micro,presetActions,browsePolish,presetDrawer,designSystem,iconLife]){assert.ok(previewTail.startsWith(layer.trim()),'Scoped AE layer matches its source');previewTail=previewTail.slice(layer.trim().length).trim();}
  assert.equal(previewTail,'',"Only scoped AE layers are appended");
  assert.ok(!premiere.includes('[data-host="after-effects"]'), "AE rules are absent from Premiere output");
  const html = await readFile(new URL("../../../dist/after-effects-cep/client/index.html", import.meta.url), "utf8");
  assert.match(html, /<body data-host="after-effects">/);
});
