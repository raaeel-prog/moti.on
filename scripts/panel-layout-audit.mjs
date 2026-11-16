/* global document, getComputedStyle, innerHeight, innerWidth -- read inside page.evaluate() */
/**
 * Layout audit for the layout sprints: opens the browser preview (scripts/panel-preview.mjs) at the four
 * dock widths and records, per view, how much the panel scrolls and whether the primary action is visible
 * without scrolling. Screenshots land in artifacts/layout-sprints/<label>/. Not host proof.
 *
 *   node scripts/build.mjs && node scripts/panel-layout-audit.mjs <label> [playwright index.mjs]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startPreviewServer } from "./panel-preview.mjs";

const label = process.argv[2] ?? "current";
const playwrightPath = process.argv[3] ?? "C:/Users/raaee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const WIDTHS = [280, 360, 480, 720];
const HEIGHT = Number(process.env.AUDIT_HEIGHT ?? 720);
const VIEWS = [
  { id: "tools", nav: null, primary: null },
  { id: "ease", nav: "ease", primary: ".ch-panel-action-bar__primary button, .ch-panel-action-bar__primary" },
  { id: "parallax", nav: "parallax", primary: ".ch-panel-action-bar__primary button, .ch-panel-action-bar__primary" },
  { id: "presets", nav: "presets", primary: ".ch-panel-action-bar__primary button, .ch-panel-action-bar__primary" },
  { id: "stock", nav: "stock", primary: "#stock-import" }
];

const server = await startPreviewServer();
const base = server.url;

const output = path.resolve("artifacts/layout-sprints", label);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: HEIGHT } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(base);
    await page.locator(".ch-shell").waitFor();
    await page.waitForTimeout(500);
    for (const view of VIEWS) {
      if (view.nav) {
        await page.locator(`.ch-nav__item[data-view="${view.nav}"]`).click();
        await page.waitForTimeout(600);
      }
      const metrics = await page.evaluate((primarySelector) => {
        // The tallest scrollable region in the active view is the one the user fights with.
        let worst = { overflow: 0, scrollHeight: 0, clientHeight: 0, selector: "" };
        for (const node of document.querySelectorAll(".ch-shell *")) {
          const style = getComputedStyle(node);
          if (!/(auto|scroll)/.test(style.overflowY) || node.clientHeight === 0) continue;
          const overflow = node.scrollHeight - node.clientHeight;
          if (overflow > worst.overflow) worst = { overflow, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, selector: node.className.toString().slice(0, 60) };
        }
        let primary = null;
        if (primarySelector) {
          const node = [...document.querySelectorAll(primarySelector)].find((n) => n.getClientRects().length);
          if (node) {
            const box = node.getBoundingClientRect();
            primary = { width: Math.round(box.width), height: Math.round(box.height), visible: box.top >= 0 && box.bottom <= innerHeight, text: node.textContent.trim().slice(0, 30) };
          }
        }
        return { widthClass: document.querySelector(".ch-shell")?.getAttribute("data-width-class"), hOverflow: document.body.scrollWidth - innerWidth, worst, primary };
      }, view.primary);
      rows.push({ width, view: view.id, ...metrics });
      await page.screenshot({ path: path.join(output, `${view.id}-${width}.png`) });
    }
    if (errors.length) rows.push({ width, errors });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(path.join(output, "metrics.json"), JSON.stringify(rows, null, 2));
for (const row of rows) {
  if (row.errors) { console.log(`${row.width}px errors: ${row.errors.join(" | ")}`); continue; }
  const primary = row.primary ? `${row.primary.width}x${row.primary.height} ${row.primary.visible ? "visível" : "FORA"}` : "-";
  console.log(`${String(row.width).padEnd(4)} ${row.view.padEnd(9)} ${String(row.widthClass).padEnd(8)} rolagem ${String(row.worst.overflow).padStart(5)}px (${row.worst.selector})  primário ${primary}${row.hOverflow > 1 ? `  H-OVERFLOW ${row.hOverflow}` : ""}`);
}
