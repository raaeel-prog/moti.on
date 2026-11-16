import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMERA_KERNEL_FUNCTIONS, camCoverKnee, camFocusDepth, camHarmonic, camImpact, camPose, camProject, camPulse,
  camSettle, camShotWeight
} from "../dist/camera-kernel.js";
import * as kernel from "../dist/camera-kernel.js";
import { CAMERA_RECIPES, cameraRecipe, isCameraRecipe } from "../dist/camera-presets.js";

/** Parallax v3 reference: 1080×1920 flyer, camera 3000 px before the pivot. */
function rig(extra = {}) {
  return { cx: 540, cy: 960, pz: 0, dist: 3000, zoom: 3000, width: 1080, height: 1920, near: 0, growth: 2,
    cover: 0, margin: [0, 0, 0, 0], duration: 10, ...extra };
}

function shot(recipeId, extra = {}) {
  const r = cameraRecipe(recipeId);
  assert.ok(r, recipeId);
  return { ...r.shot, start: 0, dur: r.durationSeconds, amount: 1, ...extra };
}

const close = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message ?? ""} ${a} vs ${b}`);

test("intensity zero and rest reproduce the reference frame exactly", () => {
  const frame = rig({ cover: 1 });
  for (const id of ["hero-push", "depth-slide", "float-loop", "punch-in", "arc-hero", "beat-hit"]) {
    for (const t of [0, 1.3, 5, 9.99]) {
      const pose = camPose(t, frame, [shot(id, { amount: 0 })]);
      assert.deepEqual(pose.c, [540, 960, -3000]);
      assert.deepEqual(pose.m, [540, 960, 0]);
      assert.equal(pose.zoom, 3000);
    }
  }
  // A "to" move before its start and a "from" move after its end sit on the design.
  const before = camPose(0.5, frame, [shot("hero-push", { start: 1 })]);
  const after = camPose(9, frame, [shot("reveal-pull", { start: 1 })]);
  for (const pose of [before, after]) {
    const p = camProject(pose, [100, 1700, -1200], 540, 960);
    const reference = camProject(camPose(0, frame, []), [100, 1700, -1200], 540, 960);
    close(p[0], reference[0], 1e-9); close(p[1], reference[1], 1e-9);
  }
});

test("the reference projection matches the Parallax v3 compensation", () => {
  // A member at z keeps its authored XY through x' = cx + (x - cx)·k, k = 1 + z/f.
  const frame = rig();
  const pose = camPose(0, frame, []);
  for (const [x, y, z] of [[100, 200, -2500], [900, 1700, -1250], [10, 1910, 0], [540, 960, 600]]) {
    const k = 1 + z / 3000;
    const world = [540 + (x - 540) * k, 960 + (y - 960) * k, z];
    const p = camProject(pose, world, 540, 960);
    close(p[0], x, 1e-9); close(p[1], y, 1e-9); close(p[2], 1 / k, 1e-12);
  }
});

test("Orientation plus Rotate Z rebuild the camera axes with the host's measured matrix", () => {
  // After Effects: M = Rx(ox)·Ry(oy)·Rz(oz) · Rz(rotate Z), positive angles
  // (docs/research/after-effects-3d-transform.md, measured to 1e-13).
  const rad = Math.PI / 180;
  const mul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
  const rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  const ry = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
  const rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const frame = rig();
  for (const [rot, orb] of [[[0, 0, 0], [0, 0]], [[25, -12, 7], [10, 8]], [[-40, 30, -15], [0, 0]], [[5, 0, 0], [0, -20]], [[0, 0, 12], [0, 0]]]) {
    const pose = camPose(4, frame, [shot("arc-hero", { rot, orb, tr: [0, 0, 0], lens: 1, dur: 4 })]);
    const [ox, oy, oz] = kernel.camOrientation(pose);
    const m = mul(mul(mul(rx(ox * rad), ry(oy * rad)), rz(oz * rad)), rz(pose.roll * rad));
    for (const [column, axis] of [[0, pose.r], [1, pose.d], [2, pose.f]]) {
      for (let i = 0; i < 3; i++) close(m[i][column], axis[i], 1e-12, `${rot}/${orb} column ${column}`);
    }
    // Aiming Z alone (what lookAt does) leaves this roll out whenever pan and tilt combine.
    if (pose.pan && pose.tilt) assert.ok(Math.abs(oz) > 0.1, `implicit roll ${oz}`);
  }
});

/** A visit shot: look at `target` from `dist`; focus on `focus` (defaults to the target). */
function visit(target, dist, { focus = target, cut = 0, ...shot } = {}) {
  return { kind: "visit", dir: "to", curve: "silk", tr: [0, 0, 0], rot: [0, 0, 0], orb: [0, 0], lens: 1, dolly: 0,
    imp: [0, 0.2, 0, 1.2, 4], org: [6, 1847, 6, 0], start: 0, dur: 2, amount: 1, vis: [...target, dist, ...focus, cut], ...shot };
}
const near3 = (a, b, eps, message) => a.forEach((x, i) => close(x, b[i], eps, `${message} [${i}]`));

test("a visit frames its target and a visit to the pivot returns exactly to the design", () => {
  const frame = rig(), subject = [300, 500, -1200], home = [540, 960, 0];
  const shots = [visit(subject, 900, { start: 1, orb: [10, -5] }), visit(home, 3000, { start: 4 })];
  const before = camPose(0.5, frame, shots);
  near3(before.c, [540, 960, -3000], 1e-9, "rest");
  near3(before.fp, home, 1e-9, "default focus is the pivot");
  const there = camPose(3, frame, shots);
  const onScreen = camProject(there, subject, 540, 960);
  close(onScreen[0], 540, 1e-6, "centred x"); close(onScreen[1], 960, 1e-6, "centred y");
  close(Math.hypot(...there.c.map((x, i) => x - subject[i])), 900, 1e-6, "framing distance");
  close(there.pan, 10, 1e-9); close(there.tilt, -5, 1e-9);
  near3(there.fp, subject, 1e-9, "focus on the subject");
  const back = camPose(7, frame, shots);
  near3(back.c, [540, 960, -3000], 1e-9, "back home");
  close(back.pan, 0, 1e-12); close(back.zoom, 3000, 1e-9);
  // Array order does not matter: visits fold by their start time.
  near3(camPose(2.2, frame, [...shots].reverse()).c, camPose(2.2, frame, shots).c, 1e-12, "order");
});

test("visits cut, arc at mid-travel and rack the focus ahead of the camera", () => {
  const frame = rig(), subject = [700, 700, -800];
  const cut = [visit(subject, 1000, { start: 2, cut: 1 })];
  near3(camPose(1.999, frame, cut).c, [540, 960, -3000], 1e-9, "before the cut");
  close(camProject(camPose(2, frame, cut), subject, 540, 960)[0], 540, 1e-6, "cut lands at its start");
  const arc = [visit(subject, 1000, { start: 0, dur: 2, tr: [0.1, 0, 0] })], plain = [visit(subject, 1000, { start: 0, dur: 2 })];
  close(camPose(1, frame, arc).c[0] - camPose(1, frame, plain).c[0], 0.1 * 1080, 1e-6, "full arc at mid-travel");
  near3(camPose(2, frame, arc).c, camPose(2, frame, plain).c, 1e-9, "no arc at the end");
  const mid = camPose(0.9, frame, plain);
  near3(mid.fp, subject, 1e-9, "focus landed at 45%");
  assert.ok(Math.hypot(...mid.c.map((x, i) => x - camPose(2, frame, plain).c[i])) > 1, "camera still travelling");
  // A Focus target layer is the default the visits rack from and back to.
  const fd = [100, 200, -500];
  near3(camPose(0, { ...frame, fd }, plain).fp, fd, 1e-9, "default focus");
});

test("focus shots rack only the focus, visits that hand it off keep still, and 200% never overshoots a framing", () => {
  const frame = rig(), subject = [700, 700, -800], other = [300, 1300, -400];
  const free = visit(subject, 1000, { start: 0, dur: 2 }), rack = { ...visit(subject, 1, { start: 1, dur: 0.3 }), kind: "focus", vis: [0, 0, 0, 1, ...other, 0] };
  free.vis = [...free.vis, 1];
  const both = [free, rack];
  near3(camPose(3, frame, both).c, camPose(3, frame, [free]).c, 1e-12, "a focus shot never moves the camera");
  near3(camPose(0.95, frame, both).fp, [540, 960, 0], 1e-9, "the handed-off visit leaves the focus alone");
  near3(camPose(1.3, frame, both).fp, other, 1e-9, "the rack lands in its 0.3 s");
  const halfway = camPose(1.15, frame, both).fp;
  assert.ok(halfway[0] < 540 && halfway[0] > 300, "and travels smoothly");
  // A choreography's shared control above 100% only strengthens the breath: a visit at 200% still lands on its framing.
  near3(camPose(3, frame, [visit(subject, 1000, { amount: 2 })]).c, camPose(3, frame, [visit(subject, 1000)]).c, 1e-9, "no overshoot at 200%");
});

test("a hold keeps creeping in, easing in without a jolt and never past 15% of the distance", () => {
  const frame = rig(), subject = [540, 960, -800], s = visit(subject, 1000, { start: 0, dur: 1 });
  s.vis = [...s.vis, 0, 0.05];
  const gap = (t) => Math.hypot(...camPose(t, frame, [s]).c.map((x, i) => x - subject[i]));
  close(gap(1), 1000, 1e-9, "arrives on its framing");
  assert.ok(gap(1.5) < 1000 && gap(3) < gap(1.5), "then keeps pushing in");
  // C1 at arrival: the speed right after landing is ~0 and builds up.
  const v0 = (gap(1) - gap(1.01)) / 0.01, v1 = (gap(1.5) - gap(1.51)) / 0.01;
  assert.ok(v0 < 0.1 * v1, `eases in: ${v0} vs ${v1}`);
  assert.ok(gap(60) > 850 - 1e-6, "never past 15%");
  const cut = { ...visit(subject, 1000, { start: 0, cut: 1 }) };
  cut.vis = [...cut.vis, 0, 0.05];
  close(Math.hypot(...camPose(5, frame, [cut]).c.map((x, i) => x - subject[i])), 1000, 1e-9, "a cut beat holds still");
});

test("poses are identical in any evaluation order (no hidden frame state)", () => {
  const frame = rig({ cover: 1, near: 500 });
  const shots = [shot("hero-push", { start: 0.5 }), shot("float-loop", { dur: 10 }), shot("beat-hit", { start: 3 })];
  const times = Array.from({ length: 241 }, (_, i) => i / 24);
  const ascending = times.map((t) => JSON.stringify(camPose(t, frame, shots)));
  const descending = [...times].reverse().map((t) => JSON.stringify(camPose(t, frame, shots))).reverse();
  const order = times.map((_, i) => (i * 97) % times.length);
  const shuffled = [];
  for (const i of order) shuffled[i] = JSON.stringify(camPose(times[i], frame, shots));
  assert.deepEqual(descending, ascending);
  assert.deepEqual(shuffled, ascending);
});

test("loops close position and velocity over their period", () => {
  for (const id of ["float-loop", "controlled-handheld"]) {
    const frame = rig({ duration: 12 });
    const s = shot(id, { dur: 12, org: [6, 99, 7, 0.35] });
    const h = 1 / 960;
    const at = (t) => camPose(t, frame, [s]);
    for (const t of [0.2, 1.7, 3.1]) {
      const a = at(t), b = at(t + 6);
      for (const key of ["c", "m"]) for (let i = 0; i < 3; i++) close(a[key][i], b[key][i], 1e-6, `${id} ${key}`);
      close(a.roll, b.roll, 1e-9, id);
      const va = (at(t + h).c[0] - at(t - h).c[0]) / (2 * h), vb = (at(t + 6 + h).c[0] - at(t + 6 - h).c[0]) / (2 * h);
      close(va, vb, 1e-3, `${id} velocity`);
    }
    // The seam: end of the comp continues into its start.
    const end = at(12 - 1e-9), start = at(0);
    for (let i = 0; i < 3; i++) close(end.c[i], start.c[i], 1e-5, `${id} seam`);
  }
});

test("harmonic noise is bounded, seeded and periodic", () => {
  let max = 0;
  for (let i = 0; i < 2000; i++) {
    const t = i * 0.013;
    const v = camHarmonic(t, 6, 1847, 2, 1, 3);
    max = Math.max(max, Math.abs(v));
    close(v, camHarmonic(t + 6, 6, 1847, 2, 1, 3), 1e-9);
  }
  assert.ok(max <= 1 && max > 0.3, `max ${max}`);
  assert.notEqual(camHarmonic(1.1, 6, 1, 0, 1, 3), camHarmonic(1.1, 6, 2, 0, 1, 3));
});

test("impact attacks, overshoots and settles on 1 without jerks", () => {
  const imp = [0.05, 0.16, 0.06, 1.5, 4];
  const h = 1e-5;
  let peak = 0, low = 0, last = camImpact(0, imp), maxJump = 0;
  for (let i = 1; i <= 4000; i++) {
    const u = i / 4000, v = camImpact(u, imp);
    peak = Math.max(peak, v); low = Math.min(low, v);
    maxJump = Math.max(maxJump, Math.abs(v - last));
    last = v;
  }
  close(peak, 1.06, 1e-3, "peak = 1 + overshoot");
  assert.ok(low < -0.04 && low >= -0.05, `anticipation ${low}`);
  assert.ok(maxJump < 0.01, `continuous ${maxJump}`);
  assert.equal(camImpact(0, imp), 0);
  assert.equal(camImpact(1, imp), 1);
  // Velocity is (near) zero at rest on both sides, and continuous at the junctions.
  close((camImpact(1, imp) - camImpact(1 - h, imp)) / h, 0, 1e-3, "lands at rest");
  for (const u of [0.128, 0.288]) {
    const left = (camImpact(u, imp) - camImpact(u - h, imp)) / h, right = (camImpact(u + h, imp) - camImpact(u, imp)) / h;
    close(left, right, 0.05, `C1 at ${u}`);
  }
  close(camSettle(0, 1.5, 4), 1, 0); close(camSettle(1, 1.5, 4), 0, 0);
});

test("pulses rise to 1 and return to rest", () => {
  const imp = [0, 0.2, 0, 1.2, 5];
  assert.equal(camPulse(0, imp), 0);
  assert.equal(camPulse(1, imp), 0);
  close(camPulse(0.2, imp), 1, 1e-9);
  assert.ok(Math.min(...Array.from({ length: 200 }, (_, i) => camPulse(0.2 + i * 0.004, imp))) < 0, "recoil");
});

test("directions: to departs, from arrives, through crosses the design", () => {
  const base = { kind: "move", curve: "silk", imp: [0, 0.2, 0, 1, 4], org: [6, 1, 6, 0], start: 0, dur: 2 };
  assert.equal(camShotWeight(0, { ...base, dir: "to" }, 10), 0);
  assert.equal(camShotWeight(2, { ...base, dir: "to" }, 10), 1);
  assert.equal(camShotWeight(0, { ...base, dir: "from" }, 10), 1);
  assert.equal(camShotWeight(2, { ...base, dir: "from" }, 10), 0);
  assert.equal(camShotWeight(0, { ...base, dir: "through" }, 10), -0.5);
  assert.equal(camShotWeight(2, { ...base, dir: "through" }, 10), 0.5);
});

test("normalized intensity reads the same in vertical, horizontal and square formats", () => {
  const ratios = [];
  for (const [w, h] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    const frame = rig({ cx: w / 2, cy: h / 2, width: w, height: h });
    const s = shot("depth-slide", { dir: "to", rot: [0, 0, 0], tr: [0.07, 0, 0] });
    const pose = camPose(5, frame, [s]);
    const pivot = camProject(pose, [w / 2, h / 2, 0], w / 2, h / 2);
    ratios.push((w / 2 - pivot[0]) / w);
  }
  for (const r of ratios) close(r, 0.07, 1e-9);
});

test("dolly zoom keeps the focal plane within 1% while the depth shifts", () => {
  const frame = rig();
  const s = shot("dolly-zoom", { start: 0, dur: 3 });
  const reference = camProject(camPose(0, frame, [s]), [940, 960, 0], 540, 960);
  let foreground = 0;
  for (let i = 0; i <= 30; i++) {
    const pose = camPose(i / 10, frame, [s]);
    const edge = camProject(pose, [940, 960, 0], 540, 960);
    close(edge[0] - 540, reference[0] - 540, 4, `focal plane at ${i / 10}s`);
    foreground = Math.max(foreground, camProject(pose, [540 + 400 * (1 - 2500 / 3000), 960, -2500], 540, 960)[0] - 540);
  }
  assert.ok(foreground > 400 * 1.2, `the near plane grows (${foreground})`);
});

test("pushing toward the nearest plane is limited smoothly", () => {
  const frame = rig({ near: 500, growth: 2 });
  const strong = shot("hero-push", { tr: [0, 0, 0.5] });
  const pose = camPose(10, frame, [strong]);
  assert.ok(pose.dz < 250 && pose.dz > 200, `capped ${pose.dz}`);
  const gentle = camPose(10, frame, [shot("hero-push", { tr: [0, 0, 0.01] })]);
  close(gentle.dz, 30, 1, "small pushes stay nearly linear");
});

test("background coverage zooms only as much as the move needs", () => {
  close(camCoverKnee(0.9), 1, 0); close(camCoverKnee(1), 1, 0);
  const frame = rig({ cover: 1 });
  const s = shot("depth-slide", { dir: "to", rot: [0, 0, 0], tr: [0.07, 0, 0] });
  for (let i = 0; i <= 30; i++) {
    const pose = camPose(i / 10, frame, [s]);
    // The comp-sized background plane must still cover all four frame corners
    // (the knee may trail by a fraction of a pixel).
    const left = camProject(pose, [0, 960, 0], 540, 960)[0], right = camProject(pose, [1080, 960, 0], 540, 960)[0];
    const top = camProject(pose, [540, 0, 0], 540, 960)[1], bottom = camProject(pose, [540, 1920, 0], 540, 960)[1];
    assert.ok(left <= 0.5 && right >= 1080 - 0.5 && top <= 0.5 && bottom >= 1920 - 0.5, `covered at ${i / 10}s: ${[left, right, top, bottom]}`);
  }
  // With 10% of overscan, a 7% truck needs no lens change at all.
  const roomy = camPose(3, rig({ cover: 1, margin: [108, 108, 192, 192] }), [s]);
  assert.equal(roomy.cover, 1);
});

/** Worst distance (px) a frame corner falls outside the projected background quad. */
function uncovered(pose, frame) {
  const k = (frame.dist + (frame.bz ?? frame.pz) - frame.pz) / frame.dist, m = frame.margin, hw = frame.width / 2, hh = frame.height / 2;
  const xs = [frame.cx - (hw + m[0]) * k, frame.cx + (hw + m[1]) * k], ys = [frame.cy - (hh + m[2]) * k, frame.cy + (hh + m[3]) * k];
  const quad = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => camProject(pose, [xs[i], ys[j], frame.bz ?? frame.pz], frame.cx, frame.cy));
  let area = 0, worst = 0;
  for (let i = 0; i < 4; i++) area += quad[i][0] * quad[(i + 1) % 4][1] - quad[(i + 1) % 4][0] * quad[i][1];
  for (const [px, py] of [[0, 0], [frame.width, 0], [frame.width, frame.height], [0, frame.height]]) {
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1];
      const inside = Math.sign(area) * (ex * (py - a[1]) - ey * (px - a[0])) / Math.hypot(ex, ey);
      worst = Math.max(worst, -inside);
    }
  }
  return worst;
}

test("background coverage holds with pan, tilt and roll, where the plane turns oblique", () => {
  // A whip pan plus the end of a depth slide left a ~12 px strip in After Effects:
  // under pan the far side of the background shrinks with perspective.
  const shots = [shot("whip-reframe", { start: 0 }), shot("depth-slide", { start: 0 }),
    { ...shot("arc-hero", { start: 0, dur: 2 }), rot: [3, -2, 1.5], orb: [4, 3] }];
  for (const extra of [{}, { bz: 600 }]) {
    const frame = rig({ cover: 1, margin: [54, 54, 96, 96], ...extra });
    let maxCover = 1;
    for (let i = 0; i <= 40; i++) {
      const pose = camPose(i / 10, frame, shots);
      maxCover = Math.max(maxCover, pose.cover);
      assert.ok(uncovered(pose, frame) <= 0.5, `${JSON.stringify(extra)} uncovered ${uncovered(pose, frame)} px at ${i / 10}s`);
    }
    assert.ok(maxCover > 1, "the move needed some lens");
  }
});

test("focus follows the optical axis and never returns NaN", () => {
  const cam = [540, 960, -3000], fwd = [0, 0, 1];
  close(camFocusDepth(cam, fwd, [940, 300, -1250], 0, 50, 3000), 1750, 1e-9, "off-axis target uses its own plane");
  close(camFocusDepth(cam, fwd, [540, 960, -1250], 25, 50, 3000), 1775, 1e-9);
  assert.equal(camFocusDepth(cam, fwd, [540, 960, -3200], 0, 50, 3000), 3000, "behind the camera falls back");
  assert.equal(camFocusDepth(cam, fwd, [NaN, 0, 0], 0, 50, 3000), 3000);
  const mid = camFocusDepth(cam, fwd, [540, 960, -2925], 0, 50, 3000);
  assert.ok(mid > 75 && mid < 3000, "hand-over is smooth");
});

test("every recipe is valid, unique and original", () => {
  const ids = new Set(), pt = new Set(), en = new Set();
  for (const r of CAMERA_RECIPES) {
    assert.ok(isCameraRecipe(r), r.id);
    assert.ok(!ids.has(r.id)); ids.add(r.id);
    assert.ok(!pt.has(r.name["pt-BR"])); pt.add(r.name["pt-BR"]);
    assert.ok(!en.has(r.name["en-US"])); en.add(r.name["en-US"]);
  }
  assert.deepEqual(CAMERA_RECIPES.filter((r) => r.milestone === 1).map((r) => r.id), ["hero-push", "depth-slide", "float-loop"]);
  assert.equal(isCameraRecipe({ ...CAMERA_RECIPES[0], id: "camera-push" }), false, "camera- is the precomp route");
  assert.equal(isCameraRecipe({ ...CAMERA_RECIPES[0], extra: 1 }), false);
  assert.equal(isCameraRecipe({ ...CAMERA_RECIPES[0], shot: { ...CAMERA_RECIPES[0].shot, tr: [0, 0, Infinity] } }), false);
  // Every recipe moves the camera and stays finite through its whole shot.
  for (const r of CAMERA_RECIPES) {
    const s = { ...r.shot, start: 0, dur: r.durationSeconds, amount: 1 };
    let moved = false;
    for (let i = 0; i <= 48; i++) {
      const pose = camPose(i * r.durationSeconds / 48, rig({ cover: 1, near: 500 }), [s]);
      for (const v of [...pose.c, ...pose.m, pose.zoom, pose.roll]) assert.ok(Number.isFinite(v), r.id);
      if (Math.abs(pose.c[0] - 540) + Math.abs(pose.c[1] - 960) + Math.abs(pose.c[2] + 3000) + Math.abs(pose.roll) + Math.abs(pose.pan) > 1e-6) moved = true;
    }
    assert.ok(moved, `${r.id} moves`);
  }
});

test("kernel functions stay ES3 so the host and expressions can embed them", () => {
  for (const name of CAMERA_KERNEL_FUNCTIONS) {
    const source = kernel[name].toString();
    assert.ok(source.startsWith(`function ${name}(`), name);
    for (const banned of ["=>", "let ", "const ", "`", "...", "?.", "??", "**", "class "]) {
      assert.ok(!source.includes(banned), `${name} uses ${banned}`);
    }
  }
});
