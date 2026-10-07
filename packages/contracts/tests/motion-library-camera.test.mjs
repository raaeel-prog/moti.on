import test from "node:test";
import assert from "node:assert/strict";
import {
  MOTION_LIBRARY_DEFAULTS,
  MOTION_LIBRARY_PRESETS,
  isMotionLibraryOptions
} from "../dist/motion-library.js";
import { MOTION_LIBRARY_CAMERA_PRESETS } from "../dist/motion-library-camera.js";

test("camera recipes register once and preserve the existing category contract", () => {
  const camera = MOTION_LIBRARY_CAMERA_PRESETS;
  assert.equal(camera.length, 35);
  assert.deepEqual(MOTION_LIBRARY_PRESETS.filter((preset) => preset.id.startsWith("camera-")), camera);
  assert.equal(new Set(MOTION_LIBRARY_PRESETS.map((preset) => preset.id)).size, MOTION_LIBRARY_PRESETS.length);
  assert.deepEqual([...new Set(camera.map((preset) => preset.effect))].sort(), [
    "camera-dark", "camera-distort", "camera-light", "camera-shake", "camera-spin", "camera-zoom"
  ]);
  for (const preset of camera) {
    assert.equal(preset.category, "motion-effects");
    assert.equal(preset.collection, preset.cameraSpec?.native || preset.cameraSpec?.impact ? "premium" : "studio");
    assert.equal(preset.referenceIndex, null);
    assert.ok(preset.name["pt-BR"] && preset.name["en-US"]);
  }
});

test("six native camera recipes preserve a stable distinct style mapping", () => {
  const native = MOTION_LIBRARY_CAMERA_PRESETS.filter(p => p.cameraSpec?.native);
  assert.deepEqual(native.map(p=>p.id),["camera-native-whip","camera-native-punch","camera-native-vortex","camera-native-lens","camera-native-smear","camera-native-prism"]);
  assert.deepEqual(native.map(p=>p.cameraSpec.native.style),[1,2,3,4,5,6]);
  assert.deepEqual(native.map(p=>p.cameraSpec.native.angle),[0,0,25,0,-28,15]);
  for(const preset of native){assert.equal(preset.cameraSpec.blur,"none");assert.equal(preset.effectAmount,0);assert.equal(preset.scale[0],0);}
});

test("camera defaults preserve full opacity, settle smoothly and validate as editable controls", () => {
  for (const preset of MOTION_LIBRARY_CAMERA_PRESETS) {
    assert.ok(isMotionLibraryOptions({ ...MOTION_LIBRARY_DEFAULTS, ...preset.defaults }), preset.id);
    assert.equal(preset.defaults.phase, "both");
    assert.ok(preset.defaults.durationFrames >= 16 && preset.defaults.durationFrames <= (preset.cameraSpec?.impact ? 30 : 24));
    assert.equal(preset.defaults.intensity, 100);
    assert.equal(preset.defaults.staggerFrames, 0);
    assert.equal(preset.defaults.unit, "all");
    assert.equal(preset.defaults.elasticity, 0);
    assert.equal(preset.mode, "transition");
    assert.ok(["silk", "glide"].includes(preset.easing));
    assert.equal(preset.waveform, preset.effect === "camera-shake" ? "wiggle" : "none");
    assert.equal(preset.fade, false, `${preset.id}: image remains opaque while tint or blur resolves`);
    if (!preset.cameraSpec?.impact) assert.deepEqual(preset.position, preset.effect === "camera-shake" ? [28, 18, 0] : [0, 0, 0]);
    assert.deepEqual(preset.rotation.slice(0, 2), [0, 0]);
    assert.equal(preset.scale[0], preset.scale[1]);
    assert.ok(preset.scale.every((value) => value >= 0));
    if (preset.cameraSpec?.blur === "none") assert.equal(preset.effectAmount, 0);
    else assert.ok(preset.effectAmount > 0 && preset.effectAmount <= 32);
    assert.deepEqual(preset.text, { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false });
  }
});

test("camera spin pairs mirror and zoom variants have distinct bounded travel", () => {
  const byId = Object.fromEntries(MOTION_LIBRARY_CAMERA_PRESETS.map((preset) => [preset.id, preset]));
  const left = byId["camera-spin-left"];
  const right = byId["camera-spin-right"];
  assert.equal(left.rotation[2], -right.rotation[2]);
  assert.ok(left.rotation[2] < 0);
  assert.deepEqual(left.scale, right.scale);
  assert.ok(left.scale[0] >= 40, "rotation uses overscan for typical landscape and portrait frames");
  const soft = byId["camera-zoom-soft"];
  const deep = byId["camera-zoom-deep"];
  assert.ok(soft.scale[0] > 0 && deep.scale[0] > soft.scale[0]);
  assert.ok(deep.effectAmount > soft.effectAmount);
});

test("ten impact shakes are premium precomp recipes with bounded, distinct personalities", () => {
  const impact = MOTION_LIBRARY_CAMERA_PRESETS.filter((preset) => preset.cameraSpec?.impact);
  assert.deepEqual(impact.map((preset) => preset.id), ["punch", "flash", "shockwave", "zoom-through", "rumble", "handheld", "whip", "twist", "double", "cinematic"].map((id) => `camera-impact-${id}`));
  assert.deepEqual([...new Set(impact.map((preset) => preset.cameraSpec.impact.hit))].sort(), ["double", "single", "sway"]);
  for (const preset of impact) {
    const s = preset.cameraSpec.impact, radians = s.angle * Math.PI / 180;
    assert.equal(preset.cameraSpec.id, `camera.impact.${preset.id.slice("camera-impact-".length)}`);
    assert.equal(preset.effect, "camera-shake");
    assert.equal(preset.effectAngle, s.angle);
    assert.ok(Math.abs(preset.position[0] - s.travel * Math.cos(radians)) < .01 && Math.abs(preset.position[1] - s.travel * Math.sin(radians)) < .01);
    assert.deepEqual(preset.rotation, [0, 0, s.roll]);
    assert.deepEqual(preset.scale, [s.zoom + s.punch, s.zoom + s.punch, 0]);
    assert.equal(preset.cameraSpec.blur, preset.effectAmount ? "gaussian" : "none");
    assert.ok(s.attack >= 1.5 && s.attack <= 8, preset.id);
    assert.ok(s.travel > 0 && s.travel <= 80 && s.roll >= 0 && s.roll <= 6, preset.id);
    assert.ok(s.frequency >= 2 && s.frequency <= 10 && s.damping >= 2 && s.damping <= 16, preset.id);
    assert.ok(s.texture >= 0 && s.texture <= 100 && s.punch >= 0 && s.punch <= 12 && s.zoom >= 0 && s.zoom <= 30, preset.id);
    assert.ok(s.shutter >= 0 && s.shutter <= 270 && s.glow >= 0 && s.glow <= 1.5 && s.wave >= 0 && s.wave <= 40, preset.id);
    assert.ok((preset.cameraSpec.exposure ?? 0) >= 0 && (preset.cameraSpec.exposure ?? 0) <= 2.5, preset.id);
  }
  const signature = (preset) => JSON.stringify([preset.cameraSpec.impact, preset.effectAmount, preset.cameraSpec.exposure ?? 0]);
  assert.equal(new Set(impact.map(signature)).size, impact.length);
  // Complements requested for the family: light, wave, punch, zoom in/out and real motion blur.
  assert.ok(impact.some((p) => p.cameraSpec.exposure && p.cameraSpec.impact.glow));
  assert.ok(impact.some((p) => p.cameraSpec.impact.wave));
  assert.ok(impact.some((p) => p.cameraSpec.impact.zoom >= 20));
  assert.ok(impact.every((p) => p.cameraSpec.impact.shutter > 0));
});
