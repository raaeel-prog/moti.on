/** Exercises the compiled CEP panel against a controlled After Effects adapter. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startPreviewServer } from "../../../scripts/panel-preview.mjs";

const playwright = process.argv[2] ?? "C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwright).href);
const browser = await chromium.launch();
const server = await startPreviewServer();
const captures = process.env.MOTION_PALETTE_CAPTURES;
const before = process.env.MOTION_PALETTE_BASELINE;
if (captures) await mkdir(captures, { recursive: true });

async function openPanel(page, { language = "pt-BR", theme = "host", baseline = false } = {}) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(7000);
  if (baseline) {
    await page.route("**/client/main.js", route => route.fulfill({ path: join(before, "client/main.js"), contentType: "text/javascript" }));
    await page.route("**/styles/theme.css", route => route.fulfill({ path: join(before, "styles/theme.css"), contentType: "text/css" }));
  }
  await page.route("**/preview-fixture.js", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const prefs = JSON.stringify({ version: 1, aeTheme: theme, locale: language, presetAutoplay: false });
    const body = source.replace("var storage = new Map();", `var storage = new Map([["motion.panel.preferences.v1", ${JSON.stringify(prefs)}]]);`)
      .replace("function answer(command) {", `window.paletteFixture = { context, calls: [], fail: false, delay: 20 };
function answer(command) {`)
      .replace("  setTimeout(function () {\n    callback(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: true, data: answer(request.command), warnings: [], error: null }));\n  }, 0);", `
  var phase = request.command === "ae.presets.phase-apply";
  window.paletteFixture.calls.push(request);
  var fail = phase && window.paletteFixture.fail;
  if (phase) window.paletteFixture.fail = false;
  setTimeout(function () {
    callback(JSON.stringify({ protocolVersion: 1, requestId: request.requestId, ok: !fail,
      data: fail ? null : answer(request.command), warnings: [],
      error: fail ? { code: "INTERNAL_ERROR", message: "Falha de teste", recoverable: false, action: "error.action.exportLogBundle" } : null }));
  }, phase || request.command === "ae.context.read" ? window.paletteFixture.delay : 0);`);
    assert.ok(body.includes("window.paletteFixture.calls.push(request)"));
    await route.fulfill({ response, body });
  });
  await page.goto(server.url);
  await page.locator("#library-tool-wiggle").waitFor();
  return errors;
}

const search = page => page.locator("#command-palette-input");
const palette = page => page.locator("#command-palette");
const phaseView = page => page.locator(".ch-palette__phase");
const browseSearch = page => page.locator('.ch-preset-search input');
const calls = (page, command) => page.evaluate(id => window.paletteFixture.calls.filter(call => call.command === id), command);
async function capture(page, name) { if (captures) await page.screenshot({ path: join(captures, `${name}.png`) }); }

async function paletteSearch(page, query) {
  await page.locator("#nav-command-palette").click();
  await search(page).fill(query);
}
async function selectPreset(page, query = "Arco coreografado") {
  await paletteSearch(page, query);
  await search(page).press("Enter");
  await phaseView(page).waitFor();
  await phaseView(page).locator('[data-phase="in"]:not([aria-disabled="true"])').waitFor();
}

try {
  if (captures) {
    for (const baseline of before ? [true, false] : [false]) {
      const page = await browser.newPage({ viewport: { width: 480, height: 420 }, reducedMotion: "reduce" });
      await openPanel(page, { baseline });
      await page.locator('[data-view="presets"]').click();
      await browseSearch(page).fill("Arco coreografado");
      await page.waitForFunction(() => document.querySelectorAll('.ch-preset-card').length === 1);
      await page.locator('.ch-preset-card .ch-preset-apply').click();
      const stage = baseline ? "antes" : "depois";
      await capture(page, `${stage}-presets-480x420`);
      await paletteSearch(page, "Arco coreografado");
      await capture(page, `${stage}-paleta-480x420`);
      await page.close();
    }
  }

  for (const [width, height, language, theme] of [[210, 250, "pt-BR", "host"], [280, 280, "en-US", "light"], [360, 335, "pt-BR", "dark"], [480, 420, "pt-BR", "host"], [720, 580, "pt-BR", "light"]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    const errors = await openPanel(page, { language, theme });
    await selectPreset(page, language === "en-US" ? "Choreographed arc" : undefined);
    assert.equal((await calls(page, "ae.presets.phase-apply")).length, 0, "opening the chooser only reads context");
    assert.equal(await phaseView(page).evaluate(node => document.activeElement === node.querySelector('.ch-palette__back')), true);
    const fit = await phaseView(page).locator('[data-phase]').evaluateAll(buttons => buttons.every(button => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth
        && rect.height >= 24 && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }));
    assert.ok(fit, `${width}×${height}: all phases can be activated`);
    await capture(page, `depois-fases-${width}x${height}`);
    if (width === 210) {
      await page.evaluate(() => { window.paletteFixture.context.selectionSignature = "other-layer"; });
      await phaseView(page).locator('[data-phase="in"]').click();
      await palette(page).getByText("A seleção mudou.", { exact: false }).waitFor();
      assert.equal((await calls(page, "ae.presets.phase-apply")).length, 0);
      await page.evaluate(() => {
        window.paletteFixture.context.activeItemName = "Outra composição";
        window.paletteFixture.context.selectionSignature = "other-comp";
      });
      await phaseView(page).locator('[data-phase="in"]').click();
      await phaseView(page).getByText("Outra composição", { exact: false }).waitFor();
      assert.equal((await calls(page, "ae.presets.phase-apply")).length, 0);
      await page.evaluate(() => { window.paletteFixture.fail = true; });
      await phaseView(page).locator('[data-phase="in"]').evaluate(button => { button.click(); button.click(); });
      await palette(page).getByText("Falha de teste").waitFor();
      assert.equal((await calls(page, "ae.presets.phase-apply")).length, 1);
      await page.keyboard.press("Escape");
      assert.equal(await search(page).inputValue(), "Arco coreografado");
      assert.equal(await search(page).evaluate(node => document.getElementById(node.getAttribute("aria-activedescendant")).textContent.includes("Arco coreografado")), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#nav-command-palette").evaluate(node => document.activeElement === node), true);
      await selectPreset(page);
    }
    const phase = width === 280 ? "out" : width === 360 ? "both" : "in";
    await phaseView(page).locator(`[data-phase="${phase}"]`).click();
    await palette(page).waitFor({ state: "hidden" });
    const apply = await calls(page, "ae.presets.phase-apply");
    assert.equal(apply.at(-1).args.phase, phase);
    assert.equal(apply.at(-1).args.presetId, "premium-arc-arrival");
    assert.equal(apply.length, width === 210 ? 2 : 1);
    await page.getByRole("tab", { name: language === "en-US" ? "Edit" : "Editar" }).waitFor();
    assert.equal(await page.getByRole("tab", { name: language === "en-US" ? "Edit" : "Editar" }).getAttribute("aria-selected"), "true");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}×${height} ${language} ${theme}`);
  }

  const page = await browser.newPage({ viewport: { width: 480, height: 420 }, reducedMotion: "reduce" });
  const errors = await openPanel(page);
  await page.evaluate(() => { window.paletteFixture.context.selectionLayerCount = 0; });
  await paletteSearch(page, "Criar objeto nulo");
  await search(page).press("Enter");
  await palette(page).waitFor({ state: "hidden" });
  assert.equal((await calls(page, "ae.quick-tools.apply")).at(-1).args.action, "create-null");
  await paletteSearch(page, "Desfoque");
  await search(page).press("Enter");
  await page.waitForFunction(() => document.querySelector('.ch-palette__status').textContent === "Selecione uma camada.");
  assert.equal((await calls(page, "ae.quick-tools.apply")).length, 1);
  await page.evaluate(() => { window.paletteFixture.context.selectionLayerCount = 1; });
  await search(page).press("Enter");
  await palette(page).waitFor({ state: "hidden" });
  assert.equal((await calls(page, "ae.quick-tools.apply")).at(-1).args.action, "effect-blur");
  await paletteSearch(page, "Neon");
  await search(page).press("Shift+Enter");
  await page.locator('#neon-intensity').waitFor({ state: "attached" });
  assert.equal((await calls(page, "ae.quick-tools.apply")).length, 2);
  await paletteSearch(page, "Arco coreografado");
  await search(page).press("Shift+Enter");
  await page.locator('.ch-preset-card[data-selected="true"]').filter({ hasText: "Arco coreografado" }).waitFor();
  await browseSearch(page).fill("");
  await page.locator('.ch-preset-discovery').getByRole("button", { name: "Tipografia" }).waitFor();
  await page.setViewportSize({ width: 210, height: 250 });
  await page.locator('.ch-preset-discovery').waitFor({ state: "hidden" });
  await page.locator('.ch-label-filter__button').click();
  await page.getByRole("menuitem", { name: "Tipografia" }).click();
  assert.equal(await page.locator('.ch-preset-folder-picker').getAttribute("aria-label"), "Pasta: Tipografia");
  await page.setViewportSize({ width: 720, height: 580 });
  await browseSearch(page).fill("Corte inclinado");
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('.ch-preset-card .ch-preset-apply')];
    return titles.length > 0 && titles.every(title => title.textContent === "Corte inclinado");
  });
  const textPreview = page.locator('[data-preview-id="builtin.motion.text-v3-lines-mask-slant-window"]');
  await textPreview.scrollIntoViewIfNeeded();
  assert.equal(await textPreview.getAttribute("data-preview-style"), "two-line-type");
  await page.waitForFunction(() => {
    const poster = document.querySelector('[data-preview-style="two-line-type"] img');
    return poster?.complete && poster.naturalWidth > 0;
  });
  await capture(page, "depois-previa-tipografia-720x580");
  await browseSearch(page).fill("");
  await page.locator('.ch-preset-discovery').getByRole("button", { name: "Motion", exact: true }).click();
  await capture(page, "depois-descoberta-720x580");
  await browseSearch(page).fill("Separação RGB premium");
  const rgb = page.locator('[data-preview-id="builtin.motion.premium-rgb-split"]');
  await rgb.locator('path[d^="M-52-30"]').first().waitFor();
  await capture(page, "depois-previa-rgb-720x580");
  assert.deepEqual(errors, []);
  await page.close();
  console.log("PASS context actions, tool editor, reveal and preset discovery");
} finally {
  await browser.close();
  server.close();
}
