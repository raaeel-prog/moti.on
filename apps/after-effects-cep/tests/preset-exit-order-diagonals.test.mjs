import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './preset-phases-harness.mjs';

// GAP-10 (exit order) and GAP-11 (diagonal directions) at the host boundary.
function expressions(group, out = []) {
  for (const child of group.children ?? []) {
    if (typeof child.expression === 'string' && child.expression) out.push(child.expression);
    expressions(child, out);
  }
  return out;
}

test('diagonals are refused where the recipe has no travel to turn', async () => {
  const f = await fixture();
  for (const id of ['reveal-curtain', 'hinged-reveal']) {
    const error = f.handler('phase-apply').preflight(f.args(id, {direction: 'top-left'}));
    assert.match(error?.message ?? '', /diagonal/, id);
    assert.equal(f.handler('phase-apply').preflight(f.args(id, {direction: 'left'})), null, `${id} keeps its four sides`);
  }
  assert.equal(f.handler('phase-apply').preflight(f.args('momentum-push', {direction: 'bottom-right'})), null);
});

test('exit order accepts mirror and repeat only', async () => {
  const f = await fixture({text: true});
  for (const exitOrder of ['mirror', 'repeat']) assert.equal(f.handler('phase-apply').preflight(f.args('letter-dissolve', {phase: 'both', exitOrder})), null, exitOrder);
  assert.match(f.handler('phase-apply').preflight(f.args('letter-dissolve', {phase: 'both', exitOrder: 'reverse'}))?.message ?? '', /saída/i);
});

test('mirror is the legacy behaviour: its expressions equal those written without the option', async () => {
  const written = async extra => { const f = await fixture({text: true}); f.run('phase-apply', f.args('letter-dissolve', {phase: 'both', ...extra})); return [f.layer.text, f.layer.transform, f.layer.effects].flatMap(group => group ? expressions(group) : [])
    // Instance ids carry the apply time; the rest of each expression is compared.
    .map(expression => expression.replace(/\d{10,}(-\d+)*/g, 'ID')); };
  const legacy = await written({});
  assert.ok(legacy.length > 0);
  assert.deepEqual(await written({exitOrder: 'mirror'}), legacy);
  const repeat = await written({exitOrder: 'repeat'});
  assert.notDeepEqual(repeat, legacy);
  assert.ok(repeat.some(expression => expression.includes('(total-1-idx)')), 'the exit reads the reversed index');
});
