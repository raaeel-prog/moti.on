import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { themeDeclarations, resolveColorToken } from '../packages/ui-tokens/scripts/check-contrast.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const start = '/* @generated tokens:start */';
const end = '/* @generated tokens:end */';

export function renderTokenMirror(css) {
  const themes = {};
  for (const theme of ['dark', 'light']) {
    const values = themeDeclarations(css, theme);
    themes[theme] = Object.fromEntries([...values].map(([name, raw]) => {
      let value = raw;
      try { value = resolveColorToken(values, name); } catch { /* Dimension, easing or composite token. */ }
      return [name, { $value: value, $type: /^#[0-9A-F]{6}$/i.test(value) ? 'color' : 'string' }];
    }));
  }
  return JSON.stringify({ $description: 'Generated from the canonical CSS. Do not edit this mirror.', meta: { schemaVersion: 2, canonicalSource: 'packages/ui-tokens/src/tokens.css', hostBase: resolveColorToken(themeDeclarations(css), 'bg-host') }, themes }, null, 2) + '\n';
}

export async function syncThemeTokens() {
  const css = await readFile(path.join(root, 'packages/ui-tokens/src/tokens.css'), 'utf8');
  const themePath = path.join(root, 'packages/ui-core/src/theme.css');
  const current = await readFile(themePath, 'utf8');
  if (!current.startsWith(start) || !current.includes(end)) throw new Error('Theme token markers are missing; refusing to replace component CSS.');
  const theme = `${start}\n${css.trimEnd()}\n${end}${current.slice(current.indexOf(end) + end.length)}`;
  const outputs = [[themePath, theme], [path.join(root, 'shared/crosshost.tokens.css'), css], [path.join(root, 'shared/crosshost.tokens.json'), renderTokenMirror(css)]];
  for (const [filename, next] of outputs) {
    const previous = await readFile(filename, 'utf8').catch(() => '');
    if (previous !== next) await writeFile(filename, next, 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await syncThemeTokens();
