/** Browser regression for the AE dock. Run after building with node apps/after-effects-cep/tests/compact-actions.browser.mjs. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startPreviewServer } from "../../../scripts/panel-preview.mjs";

const playwright = process.argv[2] ?? "C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwright).href);
const browser = await chromium.launch({ headless: true });
const server = await startPreviewServer();
const viewports = [[196, 260], [210, 280], [280, 280], [360, 320], [480, 320], [720, 320]];
const captureDirectory = process.env.MOTION_COMPACT_CAPTURES;
if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
const editablePreset = {
  state: "ready", message: "", layerName: "Camada de teste", presetId: "studio-letter-silk-rise",
  target: { compId: 1, layerId: 2, instance: "browser", fingerprint: "one" },
  options: { phase: "in", direction: "bottom", durationFrames: 40, intensity: 100, staggerFrames: 2, unit: "preset", elasticity: 35, overlap: 70, speed: 100 }
};

function nav(page, view) {
  return page.locator(`.ch-nav__item[data-view="${view}"]`);
}

async function checkTargets(page, label, selectors) {
  const diagnostics = await page.evaluate(list => {
    const overflow = document.documentElement.scrollWidth - innerWidth;
    const targets = list.map(selector => {
      const node = document.querySelector(selector);
      if (!node) return { selector, issue: "missing" };
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      const owner = document.elementFromPoint(left + width / 2, top + height / 2);
      if (width >= 24 && height >= 24 && left >= -1 && right <= innerWidth + 1 && top >= -1 && bottom <= innerHeight + 1 && node.contains(owner)) return null;
      return { selector, width, height, left, right, top, bottom, hit: owner?.closest("button")?.id ?? owner?.className ?? null };
    }).filter(Boolean);
    return { overflow, targets };
  }, selectors);
  assert.ok(diagnostics.overflow <= 1 && diagnostics.targets.length === 0, `${label}: ${JSON.stringify(diagnostics)}`);
}

async function checkFooter(page, label, primary, others = []) {
  await page.locator(primary).waitFor({ state: "visible" });
  await checkTargets(page, label, [primary, ...others]);
  const footer = await page.locator(primary).evaluate(element => {
    const bar = element.closest(".ch-actions, .ch-context-actions, .ch-applied-actions");
    const label = element.querySelector(".ch-action-button__label");
    if (!bar || !label) return null;
    const bounds = bar.getBoundingClientRect(), button = element.getBoundingClientRect();
    return { rightGap: bounds.right - button.right, labelOverflow: label.scrollWidth - label.clientWidth };
  });
  assert.ok(footer && footer.rightGap >= -1 && footer.rightGap <= 20 && footer.labelOverflow <= 1, `${label}: ${JSON.stringify(footer)}`);
}

const checks = [];
const failures = [];
try {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      // Reuse the real panel preview and substitute just the selected preset response.
      await page.route("**/preview-fixture.js", async route => {
        const response = await route.fetch();
        const source = await response.text();
        const original = 'if (command === "ae.presets.inspect") return { state: "unmanaged", message: "", phases: [] };';
        const body = source.replace(original, `if (command === "ae.presets.inspect") return noComp ? { state: "no-comp", phases: [] } : ${JSON.stringify(editablePreset)};
if (command === "ae.camera.inspect" && noComp) return { rig: null, mode: "", problem: "Abra ou ative uma composição na Timeline." };`)
          .replace("var storage = new Map();", `var storage = new Map([["motion.panel.preferences.v1", '{"version":1,"quickFavorites":["precompose","center","fit","save-frame"]}']]);`);
        if (body === source) throw new Error("The browser preview no longer exposes the expected preset fixture.");
        await route.fulfill({ response, body });
      });
      await page.goto(server.url);
      await page.locator("#library-tool-wiggle").waitFor();

      const check = async (name, run) => {
        const label = `${width}×${height} ${name}`;
        try {
          await run(label);
          checks.push(label);
        } catch (error) {
          failures.push(error.message.startsWith(label) ? error.message : `${label}: ${error.message}`);
        }
      };
      const capture = async name => {
        if (captureDirectory && width === 210) {
          await page.screenshot({ path: join(captureDirectory, `etapa4-${name}-210x280.png`), animations: "disabled" });
        }
      };

      await check("navegação", async label => {
        await checkTargets(page, label, [
          '.ch-nav__item[data-view="home"]', '.ch-nav__item[data-view="ease"]',
          '.ch-nav__item[data-view="parallax"]', '.ch-nav__item[data-view="presets"]',
          '.ch-nav__item[data-view="stock"]', '#nav-command-palette', '.ch-nav__item[data-view="settings"]'
        ]);
        const palette = page.locator("#nav-command-palette");
        await palette.focus();
        await page.keyboard.press("Control+k");
        const search = page.locator(".ch-palette__input");
        await search.waitFor();
        assert.equal(await search.evaluate(input => input === document.activeElement), true);
        await page.keyboard.press("Escape");
        await search.waitFor({ state: "hidden" });
        assert.equal(await palette.evaluate(button => button === document.activeElement), true);
      });

      await check("Ferramentas", async label => {
        const dock = page.locator("#quick-dock-toggle");
        await checkTargets(page, label, ["#quick-dock-toggle", "#quick-dock-pin", "#quick-rail-precompose", "#quick-rail-center", "#quick-rail-fit", "#quick-rail-save-frame"]);
        const category = page.locator("#library-category-select");
        await category.click();
        const menu = page.locator("#library-menu[data-open=true]");
        await menu.waitFor();
        const popup = await menu.boundingBox(), dockTop = (await page.locator(".ch-quick-dock").boundingBox()).y;
        assert.ok(popup.y + popup.height <= dockTop - 3, `${label}: menu ends at ${popup.y + popup.height}, dock starts at ${dockTop}`);
        await capture("ferramentas");
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        assert.equal(await category.evaluate(button => button === document.activeElement), true);
        await dock.focus();
        await page.keyboard.press("Enter");
        assert.equal(await dock.getAttribute("aria-expanded"), "true");
        await dock.click();
        assert.equal(await dock.getAttribute("aria-expanded"), "false");
        await page.locator("#library-tool-wiggle").click();
        await checkFooter(page, label, "#tool-wiggle-apply", ["#tool-wiggle-reset", "#tool-inspector-close"]);
      });

      await check("Suavização", async label => {
        await nav(page, "ease").click();
        await checkFooter(page, label, "#tool-ease-apply");
        const curve = page.locator(".ch-curve").first();
        await curve.scrollIntoViewIfNeeded();
        assert.ok((await curve.boundingBox()).width > 0);
        const keyframes = page.locator("#ease-keyframe-actions-toggle");
        const copy = page.locator("#ease-action-copy-ease");
        await keyframes.click();
        await copy.waitFor({ state: "visible" });
        await copy.focus();
        await page.keyboard.press("Escape");
        await copy.waitFor({ state: "hidden" });
        assert.equal(await keyframes.evaluate(button => button === document.activeElement), true);
        await checkFooter(page, label, "#tool-ease-apply");
        await capture("suavizacao");
      });

      await check("Parallax", async label => {
        await nav(page, "parallax").click();
        await checkFooter(page, label, "#camera-choreo-apply");
        const adjustments = page.locator(".ch-camera-settings-toggle");
        if (width < 720) {
          await adjustments.click();
          assert.equal(await adjustments.getAttribute("aria-expanded"), "true");
        }
        if (width <= 279) {
          const cards = page.locator(".ch-camera-card");
          const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox();
          assert.ok(first && second && first.x === second.x && second.y >= first.y + first.height);
        }
        await checkFooter(page, label, "#camera-choreo-apply");
      });

      await check("Presets · Editar", async label => {
        await nav(page, "presets").click();
        await page.locator(".ch-preset-tabs").getByRole("tab", { name: "Editar", exact: true }).click();
        await checkFooter(page, label, "#preset-edit-apply", ["#preset-edit-discard"]);
        const duration = page.locator('input[id$="-durationFrames-number"]');
        await duration.scrollIntoViewIfNeeded();
        await duration.fill("48");
        await duration.press("Tab");
        assert.equal(await duration.inputValue(), "48");
        await checkFooter(page, label, "#preset-edit-apply");
        await capture("editar");
      });

      await check("Configurações", async label => {
        await nav(page, "settings").click();
        const theme = page.locator("#settings-theme-trigger");
        await theme.scrollIntoViewIfNeeded();
        await checkTargets(page, label, ["#settings-theme-trigger"]);
        await capture("configuracoes");
        await theme.click();
        const menu = page.locator(".ch-select-menu:visible");
        await menu.waitFor();
        assert.ok(await menu.getByRole("option").count() >= 2);
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "hidden" });
        assert.equal(await theme.evaluate(button => button === document.activeElement), true);
        await theme.click();
        await menu.getByRole("option", { name: "Claro", exact: true }).click();
        await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
        await theme.scrollIntoViewIfNeeded();
        await checkTargets(page, label, ["#settings-theme-trigger"]);
      });
      if (width === 210) {
        await check("Ferramentas sem composição", async label => {
          await page.goto(`${server.url}?comp=0`);
          await page.locator("#library-tool-wiggle").click();
          await checkFooter(page, label, "#tool-wiggle-apply");
          const action = page.locator("#tool-wiggle-apply");
          const status = page.locator(".ch-tool-action-status");
          assert.equal(await action.getAttribute("aria-disabled"), "true");
          assert.match(await status.innerText(), /composição/i);
          const box = await status.boundingBox();
          assert.ok(box && box.y + box.height <= height);
        });
        await check("Parallax sem composição", async label => {
          await nav(page, "parallax").click();
          const action = page.locator("#camera-choreo-apply");
          const status = page.locator(".ch-camera-action-reason");
          await status.waitFor();
          assert.match(await status.innerText(), /composição/i);
          assert.equal(await action.getAttribute("aria-disabled"), "true");
          await checkFooter(page, label, "#camera-choreo-apply");
          const reasonBox = await status.boundingBox(), actionBox = await action.boundingBox();
          assert.ok(reasonBox && actionBox && reasonBox.y + reasonBox.height <= actionBox.y);
          await capture("parallax");
        });
      }
      if (width === 280) {
        await check("Presets · Editar sem composição", async label => {
          await page.goto(`${server.url}?comp=0`);
          await nav(page, "presets").click();
          await page.locator(".ch-preset-tabs").getByRole("tab", { name: "Editar", exact: true }).click();
          const context = page.locator(".ch-preset-edit-context");
          await context.waitFor();
          assert.equal(await page.locator(".ch-layer-sections, .ch-preset-timing").count(), 0);
          await checkTargets(page, label, ["#preset-edit-browse"]);
          await page.locator("#preset-edit-browse").click();
          const browse = page.locator(".ch-preset-tabs").getByRole("tab", { name: "Navegar", exact: true });
          assert.equal(await browse.evaluate(tab => tab === document.activeElement), true);
        });
      }
      failures.push(...errors.map(error => `${width}×${height} pageerror: ${error}`));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

for (const check of checks) console.log(`PASS ${check}`);
assert.deepEqual(failures, []);
