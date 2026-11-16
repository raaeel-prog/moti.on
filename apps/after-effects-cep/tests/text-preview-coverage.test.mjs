import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Text cards and their direction tiles play After Effects renders, never drawings:
// every offered text recipe, and every side its picker offers, has its own video.
const compiled = await build({stdin: {contents: 'export * from "../../packages/contracts/src/index.ts"; export { TEXT_REFERENCE_MANIFEST } from "./client/src/generated/text-reference-manifest.ts"; export { textReferenceAsset } from "./client/src/text-reference-assets.ts";', resolveDir: fileURLToPath(new URL('..', import.meta.url))}, bundle: true, format: 'esm', platform: 'node', write: false});
const {MOTION_LIBRARY_PRESETS, TEXT_REFERENCE_MANIFEST, textReferenceAsset, libraryUsesDirection, libraryTextSweeps, libraryTextBase} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const assets = new URL('../assets/text-previews/', import.meta.url);
const offered = MOTION_LIBRARY_PRESETS.filter(p => p.category.startsWith('text-') && !p.retired);
const sides = p => p.mode === 'transition' && libraryUsesDirection(p)
  ? (libraryTextSweeps(p).length ? libraryTextSweeps(p) : ['bottom', 'left', 'right', 'top']).filter(side => side !== libraryTextBase(p)) : [];
const exists = async name => { try { await access(new URL(name, assets)); return true; } catch { return false; } };

test('every offered text recipe has an After Effects render on its card', async () => {
  const missing = [];
  for (const p of offered) {
    const asset = textReferenceAsset(TEXT_REFERENCE_MANIFEST, p.id);
    if (!asset || !await exists(asset.video) || !await exists(asset.poster)) missing.push(p.id);
  }
  assert.deepEqual(missing, []);
});

test('every side a text direction picker offers has its own render', async () => {
  const missing = [];
  for (const p of offered) for (const side of sides(p)) {
    const asset = textReferenceAsset(TEXT_REFERENCE_MANIFEST, `${p.id}--${side}`);
    if (!asset || asset.options.direction !== side || !await exists(asset.video)) missing.push(`${p.id}--${side}`);
  }
  assert.deepEqual(missing, []);
});
