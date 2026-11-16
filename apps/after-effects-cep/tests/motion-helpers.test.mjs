import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createManualEnv, motionNode } from './motion-env.mjs';

const built = await build({ entryPoints: [fileURLToPath(new URL('../client/src/motion/index.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const motion = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

test('tween follows the token curve, overshoots on the spring and lands exactly on the target', () => {
  const clock = createManualEnv();
  const values = [];
  let done = false;
  motion.tween(clock.env, { from: 0, to: 100, durationMs: 420, curve: motion.aeMotionCurve('spring-move'), onUpdate: v => values.push(v), onDone: () => { done = true; } });
  clock.advance(500);
  assert.equal(done, true);
  assert.equal(values.at(-1), 100);
  const peak = Math.max(...values);
  assert.ok(peak > 100 && peak < 112, `spring overshoot stays small (peak ${peak.toFixed(1)})`);
});

test('tween and spring jump to the end with reduced motion or without frames', () => {
  for (const options of [{ reduced: true }, { frames: false }]) {
    const clock = createManualEnv(options);
    const values = [];
    motion.tween(clock.env, { from: 0, to: 40, durationMs: 300, curve: motion.aeMotionCurve('height-glide'), onUpdate: v => values.push(v) });
    assert.deepEqual(values, [40]);
    const spring = motion.createSpring(clock.env, { value: 0, onUpdate: v => values.push(v) });
    spring.set(10);
    assert.equal(spring.value, 10);
    assert.equal(clock.pendingFrames, 0);
  }
});

test('spring settles on the target within --dur-spring-max and keeps velocity when retargeted', () => {
  const clock = createManualEnv();
  let rested = null;
  const spring = motion.createSpring(clock.env, { value: 0, onUpdate: () => {}, onRest: v => { rested = v; } });
  spring.set(100);
  clock.advance(120);
  const moving = spring.velocity;
  assert.ok(moving > 0);
  spring.set(50);
  assert.equal(spring.velocity, moving, 'retargeting keeps the current velocity');
  clock.advance(600);
  assert.equal(rested, 50);
  assert.equal(spring.value, 50);
  assert.equal(clock.pendingFrames, 0);
});

test('height glide pins, reverses from the rendered height and settles open to auto, closed to hidden', () => {
  const clock = createManualEnv();
  const body = motionNode('div', { height: 0, scrollHeight: 140 });
  body.hidden = true;
  const glide = motion.createHeightGlide(clock.env, body, { open: false });
  assert.equal(body.style.values.height, '0px');
  glide.set(true);
  assert.equal(body.hidden, false);
  assert.equal(body.getAttribute('data-open'), 'true');
  assert.equal(body.style.values.height, '140px');
  clock.advance(200);
  body.rect.height = 90;
  glide.set(false);
  assert.equal(body.style.values.height, '0px');
  clock.advance(449);
  assert.equal(body.hidden, false, 'still gliding');
  clock.advance(2);
  assert.equal(body.hidden, true);
  glide.set(true);
  clock.advance(451);
  assert.equal(body.style.values.height, undefined, 'open settles to auto height');
});

test('height glide is instant with reduced motion', () => {
  const clock = createManualEnv({ reduced: true });
  const body = motionNode('div', { height: 120, scrollHeight: 120 });
  const settled = [];
  const glide = motion.createHeightGlide(clock.env, body, { open: true, onSettled: open => settled.push(open) });
  glide.set(false);
  assert.equal(body.hidden, true);
  assert.deepEqual(settled, [false]);
  assert.equal(clock.pendingTimers, 0);
});

test('stagger indexes items, caps the cascade and releases it so re-showing does not replay', () => {
  const clock = createManualEnv();
  const list = motionNode();
  const items = Array.from({ length: 20 }, () => motionNode());
  motion.playStagger(clock.env, list, items, { cap: 12 });
  assert.equal(list.getAttribute('data-stagger'), 'true');
  assert.equal(items[3].style.values['--motion-index'], '3');
  assert.equal(items[19].style.values['--motion-index'], '12');
  clock.advance(420 + 12 * 22 + 40);
  assert.equal(list.getAttribute('data-stagger'), 'false');
  const reduced = createManualEnv({ reduced: true });
  motion.playStagger(reduced.env, list, items);
  assert.equal(list.getAttribute('data-stagger'), 'false');
});

test('smooth scroll eases to a clamped target, flags itself and stops on user input', () => {
  const clock = createManualEnv();
  const scroller = motionNode('div', { scrollHeight: 1000, clientHeight: 200 });
  motion.smoothScrollTo(clock.env, scroller, 5000);
  assert.equal(scroller.getAttribute('data-programmatic-scroll'), 'true');
  clock.advance(motion.scrollDuration(800) + 32);
  assert.equal(scroller.scrollTop, 800);
  assert.equal(scroller.getAttribute('data-programmatic-scroll'), null);
  motion.smoothScrollTo(clock.env, scroller, 0);
  clock.advance(48);
  scroller.dispatch('wheel', { deltaY: 10 });
  const stoppedAt = scroller.scrollTop;
  clock.advance(400);
  assert.equal(scroller.scrollTop, stoppedAt, 'user input wins');
  assert.equal(scroller.getAttribute('data-programmatic-scroll'), null);
  assert.ok(motion.scrollDuration(4000) <= 420 && motion.scrollDuration(1) >= 180);
});

test('wheel smoothing handles mouse notches only and leaves owned areas, trackpads and modifiers alone', () => {
  const clock = createManualEnv();
  const scroller = motionNode('div', { scrollHeight: 1000, clientHeight: 200 });
  const scrub = motionNode('div');
  scrub.setAttribute('data-wheel-owner', 'scrub');
  scroller.appendChild(scrub);
  motion.attachWheelSmoothing(clock.env, scroller);
  assert.equal(scroller.dispatch('wheel', { deltaY: 3.5, deltaMode: 0 }).defaultPrevented, false, 'trackpad');
  assert.equal(scroller.dispatch('wheel', { deltaY: 100, deltaMode: 0, ctrlKey: true }).defaultPrevented, false, 'zoom');
  assert.equal(scroller.dispatch('wheel', { deltaY: 100, deltaMode: 0, target: scrub }).defaultPrevented, false, 'owned');
  assert.equal(scroller.dispatch('wheel', { deltaY: 100, deltaMode: 0 }).defaultPrevented, true, 'notch');
  clock.advance(500);
  assert.equal(scroller.scrollTop, 100);
});

test('text swap replaces the node only when the text changes', () => {
  const doc = { createElement: tag => motionNode(tag) };
  const holder = motionNode('span');
  const first = motion.swapText(doc, holder, '1 camada');
  assert.equal(motion.swapText(doc, holder, '1 camada'), first, 'polling with the same text keeps the node');
  const second = motion.swapText(doc, holder, '2 camadas');
  assert.notEqual(second, first);
  assert.equal(holder.children.length, 1);
  assert.equal(second.getAttribute('data-motion'), 'text-swap');
});

test('flip starts moved nodes at their old offset, then hands over to the CSS transition', () => {
  const clock = createManualEnv();
  const list = motionNode();
  const a = list.appendChild(motionNode('div', { top: 0, height: 20 }));
  const b = list.appendChild(motionNode('div', { top: 30, height: 20 }));
  const seen = [];
  const style = b.style;
  const original = style.setProperty.bind(style);
  style.setProperty = (name, value) => { seen.push([name, value]); original(name, value); };
  motion.flip(clock.env, [a, b], () => { b.rect.top = 0; a.rect.top = 30; });
  assert.deepEqual(seen, [['transition', 'none'], ['transform', 'translate(0px, 30px)']]);
  assert.equal(b.style.values.transform, undefined, 'released to animate home');
});

test('suspended tab stops are restored exactly', () => {
  const root = motionNode();
  const plain = root.appendChild(motionNode('button'));
  const skipped = root.appendChild(motionNode('input'));
  skipped.setAttribute('tabindex', '2');
  const restore = motion.suspendTabStops(root);
  assert.equal(plain.getAttribute('tabindex'), '-1');
  assert.equal(skipped.getAttribute('tabindex'), '-1');
  restore();
  assert.equal(plain.getAttribute('tabindex'), null);
  assert.equal(skipped.getAttribute('tabindex'), '2');
});

test('browser env reads reduced motion live from the root attribute', () => {
  const root = motionNode();
  const env = motion.browserMotionEnv({}, root);
  assert.equal(env.reduced(), false);
  assert.equal(env.frame(() => {}), null, 'no rAF means instant');
  root.setAttribute('data-reduced-motion', 'true');
  assert.equal(env.reduced(), true);
});

test('camera frame driver honours the internal reduce-motion toggle, not only the system query', () => {
  const root = motionNode();
  const win = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, matchMedia: () => ({ matches: false }) };
  assert.equal(typeof motion.frameDriver(win, root).frame, 'function');
  root.setAttribute('data-reduced-motion', 'true');
  assert.deepEqual(motion.frameDriver(win, root), {}, 'system says no, the panel toggle says reduce: no frame loop');
  assert.deepEqual(motion.frameDriver({}, motionNode()), {}, 'no rAF in the host');
});

test('motion probe reports engine, keys and wheel kind without touching the host', async () => {
  const probeBuild = await build({ entryPoints: [fileURLToPath(new URL('../client/src/views/motion-probe.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  const probe = await import(`data:text/javascript;base64,${Buffer.from(probeBuild.outputFiles[0].text).toString('base64')}`);
  assert.equal(probe.chromiumVersion('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36'), '99.0.4844.84');
  assert.equal(probe.chromiumVersion(undefined), '?');
  assert.equal(probe.describeKey({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: 'k', code: 'KeyK' }), 'Ctrl+K');
  assert.equal(probe.describeKey({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '1', code: 'Digit1' }), '1 (Digit1)');
  assert.equal(probe.describeKey({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '1', code: 'Numpad1' }), '1 (Numpad1)');
  assert.equal(probe.isModifierOnly({ key: 'Meta' }), true, 'the screenshot shortcut does not wipe the test');
  assert.equal(probe.isModifierOnly({ key: 'k' }), false);
  assert.equal(probe.wheelKind({ deltaMode: 0, deltaY: 100 }), 'notch');
  assert.equal(probe.wheelKind({ deltaMode: 1, deltaY: 3 }), 'notch');
  assert.equal(probe.wheelKind({ deltaMode: 0, deltaY: 4.25 }), 'smooth');
});
