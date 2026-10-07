import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

const root = new URL('../../../', import.meta.url);
const filenames = ['packages/ui-tokens/src/tokens.css', 'packages/ui-core/src/theme.css', 'packages/ui-core/src/components.css', 'packages/ui-core/src/control-refinement.css', 'packages/ui-core/src/library-refinement.css', 'packages/ui-core/src/design-system.css', 'packages/ui-core/src/preset-approved.css', 'packages/ui-core/src/scrubbable-number.css', 'packages/ui-motion/src/motion.css'];
const sources = await Promise.all(filenames.map(filename => readFile(new URL(filename, root), 'utf8')));
const parsed = sources.map((source, index) => postcss.parse(source, { from: filenames[index] }));

function declarationsFor(selector) {
  const result = new Map();
  for (const sheet of parsed) sheet.walkRules(rule => {
    if (rule.parent.type === 'atrule' || !rule.selectors.includes(selector)) return;
    rule.walkDecls(declaration => result.set(declaration.prop, declaration.value));
  });
  return result;
}

test('all presentation tokens are defined, so a typo cannot silently disable motion', () => {
  const defined = new Set();
  for (const sheet of parsed) sheet.walkDecls(declaration => { if (declaration.prop.startsWith('--')) defined.add(declaration.prop); });
  for (const [index, source] of sources.entries()) {
    for (const match of source.matchAll(/var\((--(?:ch-motion|motion|dur|ease|icon)-[a-z0-9-]+)\s*\)/g)) {
      // Geometry values come from the runtime, with their own fallbacks.
      assert.ok(defined.has(match[1]), `${filenames[index]} consumes undefined ${match[1]}`);
    }
  }
});

test('smoothing keeps six native controls in a stable three-column grid and preserves diagram dimensions', () => {
  const grid = declarationsFor('.ch-ease-actions__primary');
  assert.equal(grid.get('display'), 'grid');
  assert.match(grid.get('grid-template-columns'), /repeat\(3,/);
  const diagrams = declarationsFor('.ch-ease-actions .ch-ease-action svg');
  assert.equal(diagrams.get('width'), '76px');
  assert.equal(diagrams.get('height'), '28px');
  assert.equal(declarationsFor('.ch-ease-action-control').get('min-width'), '0');
});

test('tooltips remain external and readable and icon tiles retain their geometry', () => {
  const tooltip = declarationsFor('.ch-quick-tooltip');
  assert.equal(tooltip.get('position'), 'fixed');
  assert.equal(tooltip.get('font-size'), 'var(--font-caption)');
  assert.equal(declarationsFor('.ch-tool-tile').get('width'), '56px');
  assert.equal(declarationsFor('.ch-tool-tile').get('height'), '56px');
  assert.doesNotMatch(sources.join('\n'), /font-size:\s*8px/);
  assert.doesNotMatch(sources[2], /PREMIUM BUSINESS OVERRIDES|color-mix\(|drop-shadow\(/);
});

test('icon rendering and hover match the real segmented SVG contract', () => {
  assert.ok(declarationsFor('.ch-icon__detail').get('color'));
  const motion = sources.at(-1);
  assert.match(motion, /button:hover[^}]+\[data-motion~="icon-gesture"\] \.ch-icon__detail/);
  assert.match(motion, /button:focus-visible[^}]+\[data-motion~="icon-gesture"\] \.ch-icon__detail/);
  assert.doesNotMatch(motion, /\binfinite\b/);
  assert.doesNotMatch(sources.join('\n'), /svg\.ch-icon-path path/);
});
