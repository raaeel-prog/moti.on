import test from "node:test";
import assert from "node:assert/strict";
import { camPose, camProject } from "../dist/camera-kernel.js";
import {
  CAMERA_CHOREOGRAPHIES, CAMERA_PLANNER_FUNCTIONS, cameraChoreography, camBlockScore, camPlanChoreography, camPoseClear, camScreenBox,
  camVisibleFraction, camVisitPose, isCameraChoreography
} from "../dist/camera-choreography.js";
import * as planner from "../dist/camera-choreography.js";

/** Parallax v3 flyer, 1080×1920, `area` depth: the members keep their 2D layout through k = 1 + z/3000. */
function member(id, name, kind, x, y, w, h, z, bg = 0) {
  const k = 1 + z / 3000;
  return { id, name, kind, c: [540 + (x - 540) * k, 960 + (y - 960) * k, z], hw: w / 2 * k, hh: h / 2 * k, bg };
}
const SCENE = [
  member(1, "Fundo", "image", 540, 960, 1188, 2112, 0, 1),
  member(2, "Artista", "image", 540, 1080, 620, 980, -833.3),
  member(3, "Título", "text", 540, 420, 900, 260, -1666.7),
  member(4, "Logo", "image", 150, 150, 180, 180, -2500)
];
const RIG = { cx: 540, cy: 960, pz: 0, dist: 3000, zoom: 3000, width: 1080, height: 1920, near: 500, growth: 2, cover: 1,
  margin: [54, 54, 96, 96], bz: 0, duration: 30 };
const OPTS = { start: 1, duration: 12, frame: 1 / 30, order: "back-to-front", maxSubjects: 0 };

/** Beats and focus racks as the shots the host writes. */
const shots = (plan, scene = SCENE) => [
  ...plan.beats.map((b) => ({ kind: "visit", start: b.start, dur: b.dur, amount: 1, dir: "to", curve: b.curve, tr: b.tr,
    rot: b.rot, orb: b.orb, lens: b.lens, dolly: 0, imp: b.imp, org: [6, 1, 6, 0], vis: b.vis })),
  ...plan.focus.map((f) => ({ kind: "focus", start: f.start, dur: f.dur, amount: 1, dir: "to", curve: "silk", tr: [0, 0, 0], rot: [0, 0, 0],
    orb: [0, 0], lens: 1, dolly: 0, imp: [0, 0.2, 0, 1.2, 4], org: [6, 1, 6, 0], vis: [0, 0, 0, 1, ...scene[f.layer].c, 0] }))
];
/** Total relative time of a recipe's steps, with the subjects step repeated. */
const units = (recipe, subjects) => recipe.steps.reduce((sum, s) => sum + (s.to === "subjects" ? subjects : 1) * (s.move + s.hold), 0);
/** The same flyer as After Effects measured it with the Parallax `area` depth: the artist only 357 px in front of the background. */
const AREA = [
  { id: 1, name: "Fundo", kind: "image", c: [540, 960, 0], hw: 594, hh: 1056, bg: 1, mx: 1 },
  { id: 2, name: "Artista", kind: "image", c: [540, 1101, -357.1], hw: 273.1, hh: 431.7, bg: 0, mx: 1 },
  { id: 3, name: "NOITE NEON", kind: "text", c: [541.9, 546.4, -714.3], hw: 351.2, hh: 43.3, bg: 0, mx: 0 },
  { id: 4, name: "Logo", kind: "image", c: [289.3, 439.3, -1071.4], hw: 57.9, hh: 57.9, bg: 0, mx: 1 },
  { id: 5, name: "SÁBADO · 22H", kind: "text", c: [539.8, 1344.8, -1428.6], hw: 130.7, hh: 14.3, bg: 0, mx: 0 }
];
const depthOf = (pose, layer) => (layer.c[0] - pose.c[0]) * pose.f[0] + (layer.c[1] - pose.c[1]) * pose.f[1] + (layer.c[2] - pose.c[2]) * pose.f[2];
const close = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message ?? ""} ${a} vs ${b}`);
const byId = (id) => SCENE.find((l) => l.id === id);

test("every choreography is valid, unique and original", () => {
  const ids = new Set();
  for (const c of CAMERA_CHOREOGRAPHIES) {
    assert.ok(isCameraChoreography(c), c.id);
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(c.name["pt-BR"] && c.name["en-US"] && c.description["pt-BR"] && c.description["en-US"]);
  }
  assert.ok(ids.size >= 7);
  assert.equal(isCameraChoreography({ ...cameraChoreography("layer-tour"), steps: [{ to: "elsewhere", move: 1, hold: 1, curve: "silk", focus: "main" }] }), false);
  const step = { to: "subjects", move: 1, hold: 1, curve: "impact", focus: "target" };
  assert.equal(isCameraChoreography({ ...cameraChoreography("layer-tour"), steps: [{ ...step, imp: [0, 0.5, 0.9, 1, 1] }] }), false, "overshoot past 30%");
  assert.equal(isCameraChoreography({ ...cameraChoreography("layer-tour"), steps: [{ ...step, creep: 0.5 }] }), false, "creep past 20%/s");
  assert.equal(isCameraChoreography({ ...cameraChoreography("layer-tour"), order: "random" }), false);
  assert.equal(isCameraChoreography({ ...cameraChoreography("layer-tour"), steps: [{ ...step, imp: [0, 0.5, 0.05, 1.2, 5], creep: 0.04 }] }), true);
});

test("the layer tour visits every layer from the back, frames each one clear and whole, racks focus and lands on the design", () => {
  const plan = camPlanChoreography(SCENE, RIG, cameraChoreography("layer-tour"), OPTS);
  assert.deepEqual(plan.subjects.map((i) => SCENE[i].name), ["Artista", "Título", "Logo"], "back to front, background excluded");
  assert.equal(SCENE[plan.main].name, "Artista");
  assert.deepEqual(plan.beats.map((b) => b.role), ["home", "subject", "subject", "subject", "home"]);
  const s = shots(plan), design = camPose(0, RIG, []);
  for (const beat of plan.beats.filter((b) => b.role === "subject")) {
    const t = beat.start + beat.dur + 0.2, pose = camPose(t, RIG, s), layer = byId(beat.layer), index = SCENE.indexOf(layer);
    const box = camScreenBox(pose, layer, RIG), before = camScreenBox(design, layer, RIG);
    assert.ok(box[2] - box[0] >= 1.05 * (before[2] - before[0]), `${layer.name} pushed in`);
    if (layer.kind === "text") {
      // The title near the top clipped in After Effects: centring it needed a coverage zoom on top of the fit.
      assert.ok(pose.cover <= 1.001, `${layer.name} cover ${pose.cover}`);
      assert.ok(box[0] >= 0.04 * 1080 && box[2] <= 0.96 * 1080 && box[1] >= 0.03 * 1920 && box[3] <= 0.97 * 1920, `${layer.name} whole: ${box}`);
    } else {
      // Close to the small logo an orbit swung the view across the far background: a 1.68x zoom on top of the 2x push.
      assert.ok(pose.cover <= 1.25, `${layer.name} cover ${pose.cover}`);
      assert.ok(camVisibleFraction(box, RIG) >= 0.85, `${layer.name} in the picture: ${box}`);
    }
    assert.deepEqual(pose.fp.map(Math.round), layer.c.map(Math.round), `${layer.name} in focus`);
    const look = beat.vis.slice(0, 3);
    assert.ok(camBlockScore(SCENE, RIG, index, 0, camVisitPose(RIG, look, beat.vis[3], beat.orb), beat.vis[3]) < 0.15, `${layer.name} not blocked`);
  }
  // The artist sits in the middle of the design: it stays centred.
  const artist = plan.beats.find((b) => b.layer === 2), held = camPose(artist.start + artist.dur + 0.2, RIG, s);
  const p = camProject(held, byId(2).c, 540, 960);
  close(p[0], 540, 1, "artist centred x"); close(p[1], 960, 1, "artist centred y");
  const last = plan.beats[plan.beats.length - 1], recipe = cameraChoreography("layer-tour");
  close(last.start + last.dur + recipe.steps[recipe.steps.length - 1].hold * 12 / units(recipe, 3), 13, 0.05, "the tour fills the requested time");
  const end = camPose(13, RIG, s);
  end.c.forEach((x, i) => close(x, [540, 960, -3000][i], 1e-6, "home"));
  close(end.zoom, 3000, 1e-6, "home lens");
});

test("the deep reveal starts Z +2500 in, by the background, and pulls straight back to where the camera was", () => {
  const plan = camPlanChoreography(SCENE, RIG, cameraChoreography("deep-reveal"), OPTS);
  assert.equal(plan.beats[0].role, "deep");
  assert.equal(plan.beats[0].vis[7], 1, "the opening is a cut");
  assert.equal(plan.depth, 2500, "the motion designer's Z +2500");
  const s = shots(plan), start = camPose(OPTS.start, RIG, s);
  start.c.forEach((x, i) => close(x, [540, 960, -3000 + 2500][i], 1e-6, "straight along Z"));
  const behind = SCENE.filter((l) => depthOf(start, l) < 0);
  assert.equal(behind.length, 3, `every layer but the background starts behind the camera: ${behind.map((l) => l.name)}`);
  assert.equal(plan.hidden, 3);
  assert.ok(start.zoom / depthOf(start, SCENE[0]) <= 2.21, "the lens holds the background at 2.2x at most");
  // On the way back each layer comes into view from behind the camera, and the background only shrinks.
  let seen = 0, mag = Infinity;
  for (let t = OPTS.start; t <= plan.beats[1].start + plan.beats[1].dur; t += 0.05) {
    const pose = camPose(t, RIG, s), now = SCENE.filter((l) => depthOf(pose, l) > 0).length, m = pose.zoom / depthOf(pose, SCENE[0]);
    assert.ok(now >= seen, "layers appear, never disappear, on the pull-out");
    assert.ok(m <= mag + 1e-6, `background magnification only shrinks (${m} > ${mag})`);
    seen = now; mag = m;
  }
  assert.equal(seen, 4, "all four layers in view once the camera is back");
  const end = camPose(OPTS.start + OPTS.duration, RIG, s);
  end.c.forEach((x, i) => close(x, [540, 960, -3000][i], 1e-6, "home"));
  // Before the choreography the design is untouched.
  camPose(0.5, RIG, s).c.forEach((x, i) => close(x, [540, 960, -3000][i], 1e-9, "before"));
});

test("the dive goes through the hero and ends clean on the background", () => {
  const plan = camPlanChoreography(SCENE, RIG, cameraChoreography("dive-in"), OPTS);
  const last = plan.beats[plan.beats.length - 1], hero = SCENE[plan.main], back = SCENE[0];
  assert.equal(last.role, "deep");
  const s = shots(plan), end = camPose(OPTS.start + OPTS.duration, RIG, s);
  const depth = (l) => (l.c[0] - end.c[0]) * end.f[0] + (l.c[1] - end.c[1]) * end.f[1] + (l.c[2] - end.c[2]) * end.f[2];
  assert.ok(depth(hero) < 0, "the hero went past the lens");
  assert.ok(end.cover <= 1.001, `cover ${end.cover}`);
  assert.ok(end.zoom / depth(back) <= 2.21, `background magnified ${end.zoom / depth(back)}x`);
  assert.ok(camPoseClear(SCENE, RIG, 0, end, depth(back)) >= 0, "nothing slices the lens or fills the frame at the end");
  assert.deepEqual(end.fp.map(Math.round), back.c.map(Math.round), "focus on the background");
  // On the way the hero fills the frame: the pass-through wipe.
  const mid = camPose(last.start + last.dur * 0.6, RIG, s), box = camScreenBox(mid, hero, RIG);
  assert.ok(box[0] <= 0 && box[2] >= 1080 || box[4] <= 1, "the hero sweeps across the lens");
});

test("the dive keeps rushing in when the hero sits close to the background", () => {
  // The flyer as After Effects measured it with the Parallax `area` depth: the artist only 357 px in front of the background.
  const area = [
    { id: 1, name: "Fundo", kind: "image", c: [540, 960, 0], hw: 594, hh: 1056, bg: 1, mx: 1 },
    { id: 2, name: "Artista", kind: "image", c: [540, 1101, -357.1], hw: 273.1, hh: 431.7, bg: 0, mx: 1 },
    { id: 3, name: "NOITE NEON", kind: "text", c: [541.9, 546.4, -714.3], hw: 351.2, hh: 43.3, bg: 0, mx: 0 },
    { id: 4, name: "Logo", kind: "image", c: [289.3, 439.3, -1071.4], hw: 57.9, hh: 57.9, bg: 0, mx: 1 },
    { id: 5, name: "SÁBADO · 22H", kind: "text", c: [539.8, 1344.8, -1428.6], hw: 130.7, hh: 14.3, bg: 0, mx: 0 }
  ];
  const plan = camPlanChoreography(area, RIG, cameraChoreography("dive-in"), OPTS), last = plan.beats[plan.beats.length - 1], s = shots(plan);
  let before = 0, worstBg = 0;
  for (let k = 0; k <= 200; k++) {
    const pose = camPose(last.start + last.dur * k / 200, RIG, s), box = camScreenBox(pose, area[1], RIG);
    if (box[4] <= 1) break;
    // The lens widens to hold the background, but never faster than the camera closes in: the hero only grows.
    const height = box[3] - box[1];
    assert.ok(height >= before - 1e-6, `hero shrank at ${k / 200}: ${height} < ${before}`);
    before = height;
    const depth = (540 - pose.c[0]) * pose.f[0] + (960 - pose.c[1]) * pose.f[1] + (0 - pose.c[2]) * pose.f[2];
    worstBg = Math.max(worstBg, pose.zoom / depth);
  }
  assert.ok(before > 1920, "the hero filled the frame before passing the lens");
  assert.ok(worstBg <= 2.21, `background magnified ${worstBg}x on the way`);
});

test("the deep start flies past a layer that would sit against the lens like a wall", () => {
  // In the `area` depth the artist sits 357 px in front of the background: at Z +2500 it would be 143 px from the lens.
  const plan = camPlanChoreography(AREA, RIG, cameraChoreography("deep-reveal"), OPTS), s = shots(plan, AREA), start = camPose(OPTS.start, RIG, s);
  assert.ok(plan.depth > 2500 && plan.depth < 3000, `went past the artist: ${plan.depth}`);
  assert.deepEqual(plan.warnings, ["depth-adjusted"]);
  assert.ok(depthOf(start, AREA[1]) < 0, "the artist starts behind the camera");
  assert.ok(start.zoom / depthOf(start, AREA[0]) <= 2.21, "the background held at 2.2x");
  const deeper = camPlanChoreography(AREA, RIG, cameraChoreography("deep-reveal"), { ...OPTS, depth: 900 });
  assert.equal(deeper.depth, 900, "a shallower start the user asks for is kept when nothing blocks it");
  assert.deepEqual(deeper.warnings, []);
});

test("the focus is on what shows at the deep start, then lands on each layer before the camera does", () => {
  const plan = camPlanChoreography(SCENE, RIG, cameraChoreography("full-sequence"), OPTS), s = shots(plan);
  assert.ok(plan.focus.length >= 4 && plan.beats.every((b) => b.vis[8] === 1), "the racks own the focus");
  assert.deepEqual(camPose(OPTS.start, RIG, s).fp.map(Math.round), SCENE[0].c.map(Math.round), "only the background shows at the deep start");
  for (const beat of plan.beats.filter((b) => b.role === "subject")) {
    const layer = SCENE.findIndex((l) => l.id === beat.layer);
    const rack = plan.focus.find((f) => f.layer === layer && f.start >= beat.start - 0.2 && f.start <= beat.start + beat.dur);
    if (rack) assert.ok(rack.start + rack.dur <= beat.start + beat.dur, `${SCENE[layer].name}: focus lands before the camera`);
    assert.deepEqual(camPose(beat.start + beat.dur, RIG, s).fp.map(Math.round), SCENE[layer].c.map(Math.round), `${SCENE[layer].name} in focus on arrival`);
  }
  assert.ok(plan.focus.every((f) => f.dur <= 0.3 + 1e-9), "fast racks");
  for (let i = 1; i < plan.focus.length; i++) assert.ok(plan.focus[i].start >= plan.focus[i - 1].start + plan.focus[i - 1].dur - 1e-9, "racks never overlap");
  const off = camPlanChoreography(SCENE, RIG, cameraChoreography("full-sequence"), { ...OPTS, focus: false });
  assert.equal(off.focus.length, 0);
  assert.ok(off.beats.every((b) => !b.vis[8]), "without the racks each visit focuses its own target");
});

test("quick zooms hop corner to corner, punch on arrival and never freeze on a hold", () => {
  const recipe = cameraChoreography("quick-zooms"), s0 = { ...OPTS, order: "auto", duration: recipe.durationSeconds };
  const plan = camPlanChoreography(AREA, RIG, recipe, s0), s = shots(plan, AREA);
  assert.equal(recipe.order, "spread");
  assert.equal(plan.subjects.length, 4);
  const at = plan.subjects.map((i) => planner.camScreenAtRest(AREA[i], RIG));
  for (let i = 1; i < at.length; i++) {
    const hop = Math.hypot(at[i][0] - at[i - 1][0], at[i][1] - at[i - 1][1]);
    for (let j = i + 1; j < at.length; j++) assert.ok(hop >= Math.hypot(at[j][0] - at[i - 1][0], at[j][1] - at[i - 1][1]) - 1e-6, "always the farthest next");
  }
  for (const beat of plan.beats.filter((b) => b.role === "subject")) {
    assert.ok(beat.dur <= 0.8, `fast move: ${beat.dur}`);
    const layer = AREA.find((l) => l.id === beat.layer), sample = (t) => depthOf(camPose(t, RIG, s), layer);
    const arrived = sample(beat.start + beat.dur);
    let closest = Infinity;
    for (let t = beat.start; t <= beat.start + beat.dur; t += beat.dur / 60) closest = Math.min(closest, sample(t));
    assert.ok(closest < arrived * 0.995, `${layer.name}: the zoom punches past its framing and settles`);
    assert.ok(sample(beat.start + beat.dur + 0.6) < arrived * 0.985, `${layer.name}: the hold keeps creeping in`);
  }
});

test("orders, limits and timing follow the options", () => {
  const front = camPlanChoreography(SCENE, RIG, cameraChoreography("layer-tour"), { ...OPTS, order: "front-to-back" });
  assert.deepEqual(front.subjects.map((i) => SCENE[i].name), ["Logo", "Título", "Artista"]);
  const two = camPlanChoreography(SCENE, RIG, cameraChoreography("layer-tour"), { ...OPTS, maxSubjects: 2 });
  assert.deepEqual(two.subjects.map((i) => SCENE[i].name), ["Artista", "Título"], "the two most important, still back to front");
  const later = camPlanChoreography(SCENE, RIG, cameraChoreography("layer-tour"), { ...OPTS, start: 3 });
  const base = camPlanChoreography(SCENE, RIG, cameraChoreography("layer-tour"), OPTS);
  later.beats.forEach((b, i) => close(b.start, base.beats[i].start + 2, 1e-9, "shifted"));
  for (const c of CAMERA_CHOREOGRAPHIES) {
    const plan = camPlanChoreography(SCENE, RIG, c, OPTS);
    assert.ok(plan.beats.length >= 2, c.id);
    plan.beats.forEach((b, i) => {
      assert.ok(b.vis.every(Number.isFinite) && b.vis[3] > 0, `${c.id} beat ${i}`);
      if (i) assert.ok(b.start >= plan.beats[i - 1].start, `${c.id} in time order`);
      assert.ok(b.start + b.dur <= OPTS.start + OPTS.duration + 1e-9, `${c.id} inside the window`);
    });
  }
  assert.deepEqual(camPlanChoreography([SCENE[0]], RIG, cameraChoreography("layer-tour"), OPTS).warnings, ["no-subject"]);
});

test("planner functions stay ES3 so the host can embed them", () => {
  for (const name of CAMERA_PLANNER_FUNCTIONS) {
    const source = planner[name].toString();
    assert.ok(source.startsWith(`function ${name}(`), name);
    for (const banned of ["=>", "let ", "const ", "`", "...", "?.", "??", "**", "class "]) assert.ok(!source.includes(banned), `${name} uses ${banned}`);
  }
});
