/** The panel's Content-Security-Policy must let the preview decoder start its
 * blob workers (preview-decoder.ts). Without `worker-src blob:` CEP falls back
 * to script-src 'self', the worker is refused, and every preview decodes on the
 * panel thread through a seeking <video>: about 21 fps and stalls in After
 * Effects (measured in the host, 2026-11-13). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
const directive = name => policy.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `)) ?? '';

test('the panel CSP allows the preview decode workers and nothing more', () => {
  assert.equal(directive('worker-src'), 'worker-src blob:');
  assert.equal(directive('script-src'), "script-src 'self'", 'page scripts stay limited to the panel files');
  assert.equal(directive('default-src'), "default-src 'none'");
});
