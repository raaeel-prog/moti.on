/** Near-duplicate audit of the text library: two transitions of the same unit
 * are near-duplicates when one, seen from some side, paints almost the frames
 * of the other on the card. Prints the closest pairs with their distance in
 * card pixels per sample. Usage: node scripts/text-presets-similarity.mjs [--limit=40] */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createFakeDocument } from "../packages/ui-core/tests/fake-dom.mjs";

const root = fileURLToPath(new URL("../apps/after-effects-cep/", import.meta.url));
const compiled = await build({ stdin: { contents: 'export * from "./client/src/motion-library-preview.ts"; export { GALLERY_PRESETS, defaultLibraryOptions } from "./client/src/preset-gallery.ts";', resolveDir: root }, bundle: true, format: "esm", platform: "node", write: false });
const { paintLibraryPreview, libraryPreviewPlayback, GALLERY_PRESETS, defaultLibraryOptions } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const limit = Number(process.argv.find(arg => arg.startsWith("--limit="))?.slice(8) ?? 40);
const numbers = value => String(value).match(/-?\d+(\.\d+)?(e-?\d+)?/g)?.map(Number) ?? [];

/** Card frames of the entrance at 16 moments of the card's playback. */
export function signature(p, direction) {
  const doc = createFakeDocument(), out = [], options = { ...defaultLibraryOptions(p), phase: "in", direction };
  for (let k = 1; k <= 16; k++) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    paintLibraryPreview(svg, p, options, libraryPreviewPlayback(p, options, .22 + k / 16 * 1.4).time);
    const walk = node => {
      for (const [name, value] of Object.entries(node.attributes ?? {})) {
        if (name === "transform" && String(value).startsWith("matrix(")) {
          const [a, b, c, d, e, f] = numbers(value);
          for (const [x, y] of [[-15, -25], [15, -25], [-15, 0], [15, 0]]) out.push(a * x + c * y + e, b * x + d * y + f);
        } else if (name === "opacity") out.push(Number(value) * 30);
        else if (name === "stdDeviation") out.push(...numbers(value).map(v => v * 2));
      }
      for (const child of node.childNodes ?? node.children ?? []) walk(child);
    };
    walk(svg);
  }
  return out;
}
const distance = (a, b) => a.length !== b.length ? Infinity : a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;

const text = GALLERY_PRESETS.map(p => p.motion).filter(p => p?.category.startsWith("text-") && p.mode === "transition" && !p.retired);
const sides = ["preset", "bottom", "left", "right", "top"];
const views = new Map(text.map(p => [p.id, sides.map(side => signature(p, side))]));
const pairs = [];
for (let i = 0; i < text.length; i++) for (let j = i + 1; j < text.length; j++) {
  const a = text[i], b = text[j];
  if (a.text.unit !== b.text.unit) continue;
  const mine = views.get(a.id)[0], theirs = views.get(b.id);
  let best = Infinity, side = "";
  theirs.forEach((view, k) => { const d = distance(mine, view); if (d < best) { best = d; side = sides[k]; } });
  pairs.push({ a: a.id, b: b.id, side, d: best });
}
pairs.sort((x, y) => x.d - y.d);
for (const pair of pairs.slice(0, limit)) console.log(pair.d.toFixed(2).padStart(7), pair.a.padEnd(46), pair.b.padEnd(46), pair.side);
