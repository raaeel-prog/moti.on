import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { AE_THEME_SOURCES } from '../../../scripts/theme-sources.mjs';

/**
 * Every AE-only CSS layer must render in CEP 12 (Chromium 99), and the AE motion layer
 * must stay neutral and token-driven. Headless Playwright runs a modern Chromium, so
 * browser checks alone would not catch these.
 */
const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('AE layers use only what Chromium 99 renders', async () => {
  for (const file of AE_THEME_SOURCES) {
    const code = stripComments(await read(`../../../${file}`));
    const name = file.split('/').pop();
    assert.doesNotMatch(code, /color-mix\(/, `${name}: color-mix() needs Chromium 111`);
    assert.doesNotMatch(code, /:has\(/, `${name}: :has() needs Chromium 105`);
    assert.doesNotMatch(code, /@container/, `${name}: container queries need Chromium 105`);
    assert.doesNotMatch(code, /@starting-style/, `${name}: @starting-style needs Chromium 117`);
    assert.doesNotMatch(code, /(^|[^-\w])linear\(/, `${name}: linear() easing needs Chromium 113`);
    assert.doesNotMatch(code, /\b\d+(\.\d+)?dvh\b/, `${name}: dynamic viewport units need Chromium 108`);
    assert.doesNotMatch(code, /(^|[;{\s])(scale|translate|rotate)\s*:/m, `${name}: individual transform properties need Chromium 104`);
    assert.doesNotMatch(code, /(^|[;{\s])mask-composite\s*:/m, `${name}: unprefixed mask-composite needs Chromium 120`);
  }
});

test('the AE motion layer is scoped, token-driven and neutral', async () => {
  const source = await read('../../../packages/ui-core/src/ae-motion.css');
  const root = postcss.parse(source);
  const layout = /^(width|height|top|left|right|bottom|margin|padding|inset)/;
  root.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) {
      rule.walkDecls(decl => assert.doesNotMatch(decl.prop, layout, `keyframes animate layout: ${decl.prop}`));
      return;
    }
    for (const selector of rule.selectors) assert.ok(selector.startsWith('[data-host="after-effects"]'), `Unscoped rule: ${selector}`);
    rule.walkDecls(decl => {
      const value = decl.value;
      if (/^(transition|animation)/.test(decl.prop)) {
        assert.doesNotMatch(value, /(^|[\s,(])\d+(\.\d+)?m?s\b/, `literal timing in ${rule.selector}`);
        assert.doesNotMatch(value, /\ball\b/, `transition: all in ${rule.selector}`);
        assert.doesNotMatch(value, /infinite/, `loops belong to progress only: ${rule.selector}`);
        if (/\bheight\b/.test(value)) assert.match(rule.selector, /height-glide/, `height only animates in height-glide: ${rule.selector}`);
        if (/\bwidth\b/.test(value)) assert.match(rule.selector, /selection-glide/, `width only animates in selection-glide: ${rule.selector}`);
      }
      assert.doesNotMatch(value, /gradient\(/, `no decorative gradients: ${rule.selector}`);
      assert.doesNotMatch(value, /#[0-9a-f]{3,8}\b/i, `colours come from tokens: ${rule.selector}`);
      if (decl.prop === 'filter') assert.doesNotMatch(value, /drop-shadow|brightness|blur/, `no glow: ${rule.selector}`);
      if (decl.prop === 'box-shadow') assert.doesNotMatch(value.replace(/rgba\(0,\s*0,\s*0,[^)]*\)/g, ''), /rgba?\(|#/, `shadows are neutral black: ${rule.selector}`);
      if (decl.prop === 'will-change') assert.match(rule.selector, /data-motion-active/, `will-change only while active: ${rule.selector}`);
    });
  });
});
