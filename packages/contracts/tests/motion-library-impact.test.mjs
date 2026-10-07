import test from "node:test";
import assert from "node:assert/strict";
import { cameraImpactSample } from "../dist/motion-library-math.js";
import { MOTION_LIBRARY_CAMERA_PRESETS } from "../dist/motion-library-camera.js";

const impact = MOTION_LIBRARY_CAMERA_PRESETS.filter((preset) => preset.cameraSpec?.impact);
const RATES = [24, 25, 29.97, 30, 50, 60];
const SEEDS = [0, 17, 245, 399, 999];
const smooth = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const IDENTITY = [0, 0, 0, 100, 0, 0, 0, 0];
const neutral = (r, where) => IDENTITY.forEach((v, i) => assert.ok(Math.abs(r[i] - v) < 1e-9, `${where} channel ${i}: ${r[i]}`));

/** Control values exactly as the host creates them for a comp of this height. */
function controls(preset, height = 1080) {
  const s = preset.cameraSpec.impact, k = height / 1080;
  return { ...s, travel: s.travel * k, wave: s.wave * k, blur: preset.effectAmount * k, exposure: preset.cameraSpec.exposure ?? 0 };
}

/** Mirrors the host envelope: a window centered on CUT with smootherstep weight. */
function sample(preset, age, { fps = 30, frames = preset.defaults.durationFrames, intensity = 100, seed = 17, width = 1920, height = 1080 } = {}) {
  const fd = 1 / fps, span = Math.max(2, frames) * fd / 2;
  const u = Math.abs(age) < fd * .00001 ? 1 : Math.max(0, Math.min(1, 1 - Math.abs(age) / span));
  return cameraImpactSample(age, smooth(u), span, fd, intensity / 100, seed, width, height, controls(preset, height));
}

function frames(preset, fps) {
  const fd = 1 / fps, span = preset.defaults.durationFrames * fd / 2, count = Math.floor(span / fd + 1e-9), out = [];
  for (let f = -count; f <= count; f++) out.push(f * fd);
  return out;
}

test("both window edges and intensity zero are an exact identity", () => {
  for (const preset of impact) for (const fps of RATES) {
    const span = preset.defaults.durationFrames / fps / 2;
    for (const age of [-span, span]) {
      neutral(sample(preset, age, { fps }), `${preset.id} @${fps} edge ${age}`);
    }
    for (const age of frames(preset, fps)) {
      assert.deepEqual(sample(preset, age, { fps, intensity: 0 }).slice(0, 8).map((v) => v + 0), IDENTITY, `${preset.id} @${fps} intensity 0`);
    }
  }
});

test("the strike lands exactly on CUT at every frame rate and variation", () => {
  for (const preset of impact) for (const fps of RATES) for (const seed of SEEDS) {
    let displacement = 0, scale = 0, exposure = 0, glow = 0, cut = null;
    for (const age of frames(preset, fps)) {
      const r = sample(preset, age, { fps, seed });
      if (age === 0) { cut = r; continue; }
      displacement = Math.max(displacement, Math.hypot(r[0], r[1]));
      scale = Math.max(scale, r[3]); exposure = Math.max(exposure, r[5]); glow = Math.max(glow, r[6]);
    }
    const where = `${preset.id} @${fps} seed ${seed}`;
    // Scale (overscan + punch + zoom) and the light flash peak on CUT for every recipe.
    assert.ok(cut[3] > 100 && cut[3] >= scale - 1e-9, where);
    assert.ok(cut[5] >= exposure - 1e-9 && cut[6] >= glow - 1e-9, `${where}: light`);
    if (preset.cameraSpec.impact.hit !== "sway") assert.ok(Math.hypot(cut[0], cut[1]) >= displacement - 1e-9, `${where}: translation`);
  }
});

test("a double hit carries a softer pre-beat before the CUT strike", () => {
  const preset = impact.find((p) => p.cameraSpec.impact.hit === "double");
  const span = preset.defaults.durationFrames / 30 / 2, beat = -.42 * span;
  const y = (age) => sample(preset, age)[1];
  assert.ok(y(beat) > .3 * y(0) && y(beat) < .7 * y(0));
  assert.ok(y(beat) > y(beat - 2 / 30) && y(beat) > y(beat + 2 / 30));
});

test("motion is continuous: halving the step halves every jump, with no snap anywhere", () => {
  for (const preset of impact) for (const fps of [24, 60]) {
    const span = preset.defaults.durationFrames / fps / 2;
    const jump = (step) => {
      const worst = new Array(8).fill(0);
      let previous = sample(preset, -span, { fps });
      for (let age = -span + step; age <= span + 1e-12; age += step) {
        const r = sample(preset, Math.min(span, age), { fps });
        for (let i = 0; i < 8; i++) worst[i] = Math.max(worst[i], Math.abs(r[i] - previous[i]));
        previous = r;
      }
      return worst;
    };
    const coarse = jump(1 / fps / 64), fine = jump(1 / fps / 128);
    for (let i = 0; i < 8; i++) if (coarse[i] > 1e-9) assert.ok(fine[i] <= coarse[i] * .6, `${preset.id} @${fps} channel ${i}: ${fine[i]} vs ${coarse[i]}`);
  }
});

test("the overscan keeps all four frame corners and the blur edge covered in landscape, portrait, square and 4:3", () => {
  for (const preset of impact) for (const [width, height] of [[1920, 1080], [1080, 1920], [1080, 1080], [1440, 1080]]) {
    for (const intensity of [100, 300]) for (const seed of [0, 399]) {
      const fps = 30, span = preset.defaults.durationFrames / fps / 2;
      for (let age = -span; age <= span + 1e-12; age += 1 / fps / 4) {
        const [x, y, rotation, scale, blur] = sample(preset, age, { fps, intensity, seed, width, height });
        // Gaussian Blur runs before Transform; its translucent edge spans about three radii.
        const theta = rotation * Math.PI / 180, s = scale / 100, gap = 3 * blur;
        for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          // Inverse Transform: output corner -> source point around the frame center.
          const ox = cx * width / 2 - x, oy = cy * height / 2 - y;
          const sx = (Math.cos(theta) * ox + Math.sin(theta) * oy) / s, sy = (-Math.sin(theta) * ox + Math.cos(theta) * oy) / s;
          assert.ok(Math.abs(sx) <= width / 2 - gap + 1e-6 && Math.abs(sy) <= height / 2 - gap + 1e-6,
            `${preset.id} ${width}x${height} @${intensity}% seed ${seed} t=${age.toFixed(4)}`);
        }
      }
    }
  }
});

test("variation reseeds only the organic texture and intensity scales linearly up to 300%", () => {
  for (const preset of impact) {
    const a = sample(preset, .05, { seed: 3 }), b = sample(preset, .05, { seed: 640 });
    assert.deepEqual(sample(preset, .05, { seed: 3 }), a);
    assert.equal(a[3], b[3]); assert.equal(a[5], b[5]); assert.equal(a[7], b[7]);
    if (preset.cameraSpec.impact.texture) assert.notEqual(a[0], b[0]);
    const one = sample(preset, -.02), two = sample(preset, -.02, { intensity: 200 });
    for (const i of [0, 1, 2, 4, 5, 6, 7]) assert.ok(Math.abs(two[i] - 2 * one[i]) < 1e-9, `${preset.id} channel ${i}`);
    assert.deepEqual(sample(preset, -.02, { intensity: 400 }), sample(preset, -.02, { intensity: 300 }));
  }
});

test("spring and texture stay below Nyquist so 24 fps never strobes", () => {
  const punch = impact.find((p) => p.id === "camera-impact-punch"), rumble = impact.find((p) => p.id === "camera-impact-rumble");
  const at = (preset, fps, overrides) => cameraImpactSample(.07, .8, .5, 1 / fps, 1, 17, 1920, 1080, { ...controls(preset), ...overrides });
  // The kick spring is clamped to 60% of Nyquist: 30 Hz at 24 fps behaves as 7.2 Hz.
  assert.deepEqual(at(punch, 24, { texture: 0, frequency: 30 }), at(punch, 24, { texture: 0, frequency: 7.2 }).map((v, i) => i === 8 ? 30 * .07 * 180 : v));
  // Texture harmonics fade out from half of Nyquist and vanish at 90% of it.
  const texture = (fps) => at(rumble, fps, { hit: "sway", frequency: 30 })[0];
  assert.equal(texture(24) + 0, 0, "every harmonic of a 30 Hz texture exceeds 24 fps Nyquist");
  assert.notEqual(texture(120), 0);
});
