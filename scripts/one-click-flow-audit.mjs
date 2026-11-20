/**
 * Ferramentas de um clique (2026-11-19): percorre o fluxo no preview do navegador
 * (scripts/panel-preview.mjs, host falso) e salva capturas em artifacts/one-click/<label>/.
 * Evidência de layout apenas, nunca prova de host.
 *
 *   node scripts/build.mjs && node scripts/one-click-flow-audit.mjs <label> [playwright index.mjs]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startPreviewServer } from "./panel-preview.mjs";

const label = process.argv[2] ?? "current";
const playwrightPath = process.argv[3] ?? "C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const output = path.resolve("artifacts/one-click", label);
await mkdir(output, { recursive: true });
const { url, close } = await startPreviewServer(0);
const browser = await chromium.launch();
const report = [];
try {
  for (const width of [280, 360, 480, 720]) {
    const page = await browser.newPage({ viewport: { width, height: 760 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("#library-tool-wiggle", { timeout: 15000 });
    const shot = name => page.screenshot({ path: path.join(output, `${width}-${name}.png`) });
    await shot("1-grade");
    await page.click("#library-tool-wiggle");
    await page.waitForSelector("#library-edit-applied", { state: "visible", timeout: 5000 });
    await page.waitForTimeout(500);
    await shot("2-aplicado");
    const opensPage = await page.locator("#library-tool-gradient").getAttribute("data-interaction");
    await page.click("#library-tool-flicker");
    await page.waitForTimeout(700);
    const label2 = await page.locator("#library-edit-applied").innerText();
    await page.click("#library-edit-applied");
    await page.waitForTimeout(300);
    await shot("3-menu-editar");
    await page.click("#library-edit-wiggle");
    await page.waitForSelector("#tool-inspector-title", { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot("4-pagina-wiggle");
    const hasPresets = await page.locator(".ch-tool-preset").count();
    await page.click("#tool-inspector-close");
    await page.waitForSelector("#library-tool-gradient", { timeout: 5000 });
    await page.click("#library-tool-gradient");
    await page.waitForSelector("#tool-inspector-title", { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot("5-pagina-gradiente");
    report.push({ width, gradientInteraction: opensPage, editLabelAfterTwo: label2, wigglePresets: hasPresets, errors });
    await page.close();
  }
} finally {
  await browser.close();
  close();
}
console.log(JSON.stringify(report, null, 2));
