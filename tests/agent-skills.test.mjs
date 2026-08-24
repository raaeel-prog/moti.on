import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSkillPack } from '../scripts/skills-lib.mjs';

test('skill pack is valid, mirrored, and fully covered by routing evals', async () => {
  const result = await validateSkillPack(process.cwd());
  assert.deepEqual(result.errors, []);
  assert.equal(result.skills.length, 14);
  assert.equal(result.evalCases, 42);
  assert.ok(result.files >= 30);
});

test('visual foundation preserves the approved minimal workstation contract', async () => {
  const [foundation, designSkill, profile] = await Promise.all([
    readFile('docs/UI_FOUNDATION.md', 'utf8'),
    readFile('.agents/skills/designing-adobe-workstation-ui/SKILL.md', 'utf8'),
    readFile('shared/product-ui-profile.json', 'utf8'),
  ]);

  for (const text of [foundation, designSkill, profile]) assert.match(text, /#1D1D1D/i);
  assert.match(designSkill, /one active task at a time/i);
  assert.match(designSkill, /dashboard/i);
  assert.match(foundation, /glassmorphism/i);
});
