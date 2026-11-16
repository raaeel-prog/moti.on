/* eslint-disable no-var -- Serialized verbatim into the ES3 Adobe host and its expressions. */
/**
 * Moti.on camera engine: one pose authority for camera shots.
 *
 * The same functions run in the panel preview, in the ExtendScript host and
 * inside After Effects expressions (`MotionCameraCore.source`). They are
 * therefore written with var/function only, keep no state between frames and
 * are deterministic: scrubbing, out-of-order renders and subframes all return
 * the same pose. The host declares every function in one closure and the
 * expressions receive every declaration at once, so they may call each other.
 *
 * Coordinates are After Effects world space: X right, Y down, Z away from the
 * viewer. The reference camera looks along +Z from `dist` in front of the
 * pivot (the focal point), which is where the Parallax v3 master null sits.
 * The camera basis is pan, then tilt, then roll (`Ry · Rx · Rz`), which keeps
 * the horizon level. `camOrientation` turns pan and tilt into After Effects
 * Orientation angles with the composition order measured in the host
 * (`Rx · Ry · Rz`, docs/research/after-effects-3d-transform.md); the roll goes to
 * Rotate Z, which After Effects applies after Orientation. `lookAt` would only
 * aim the Z axis and leave an implicit roll whenever pan and tilt combine.
 */
import { libraryEase } from "./motion-library-math.js";

/** A world-space vector or point. */
export type CameraVec3 = [number, number, number];

/** Reference frame of a rig, frozen when the rig is created or adjusted. */
export interface CameraRigFrame {
  /** Pivot (focal point) in world space; the reference camera is `dist` before it. */
  cx: number; cy: number; pz: number;
  /** Camera to pivot distance and reference lens zoom, both in px. */
  dist: number; zoom: number;
  /** Composition size, for normalized intensities and background coverage. */
  width: number; height: number;
  /** Distance from the reference camera to the nearest plane (0 = unknown). */
  near: number;
  /** How much the nearest plane may grow when the camera travels toward it. */
  growth: number;
  /** 1 keeps the background plane covering the frame with a gentle lens zoom. */
  cover: number;
  /** Background overscan beyond the comp edges at reference: left, right, top, bottom px. */
  margin: [number, number, number, number];
  /** Background plane depth (world Z); defaults to the pivot plane `pz`. */
  bz?: number;
  /** Composition duration in seconds; loops only ramp at edges inside the comp. */
  duration: number;
  /** Default focus point (the Focus target layer, or the pivot); visits rack away from it and back. */
  fd?: CameraVec3;
}

/** A visit's absolute framing: look at (x, y, z) from `dist` along its orbit
 * direction, focus on (fx, fy, fz); `cut` 1 jumps there at its start. Optional:
 * `free` 1 leaves the focus to "focus" shots; `creep` keeps pushing in after the
 * camera arrives, as a fraction of `dist` per second, so a hold never freezes.
 * A "focus" shot uses only (fx, fy, fz). */
export type CameraVisit = [number, number, number, number, number, number, number, number, number?, number?];

/** One camera shot. Amounts are normalized so a recipe reads the same in any format. */
export interface CameraShotSpec {
  /** "move" holds its end, "pulse" returns to rest, "loop" repeats with its period,
   * "visit" travels to an absolute framing (`vis`) and holds it, "focus" racks the
   * focus to `vis` (fx, fy, fz) over its duration. */
  kind: string;
  start: number; dur: number;
  /** Live intensity multiplier (1 = 100%). */
  amount: number;
  /** Moves only: "to" departs from the design, "from" arrives at it, "through" crosses it. */
  dir: string;
  /** Any `libraryEase` kind, or "impact" for anticipation, attack and settle. */
  curve: string;
  /** Translation: X of the visible width, Y of the visible height, Z of `dist`. +Z pushes in. */
  tr: CameraVec3;
  /** In-place rotation in degrees: pan (+ right), tilt (+ up), roll (After Effects Rotate Z). */
  rot: CameraVec3;
  /** Orbit around the pivot in degrees: pan (+ right), tilt (+ up). */
  orb: [number, number];
  /** Lens zoom multiplier at full weight (1 = none). */
  lens: number;
  /** Dolly zoom: 0..1 of this shot's Z travel compensated by the lens. */
  dolly: number;
  /** Impact: anticipation depth, attack fraction, overshoot, ringing cycles, damping. */
  imp: [number, number, number, number, number];
  /** Loop: period s, seed, tremor Hz, tremor mix 0..1. */
  org: [number, number, number, number];
  /** Visits only. In a visit `orb` orbits the target, `rot` turns the camera on
   * top of that, `lens` is absolute and `tr` is an arc offset at mid-travel. */
  vis?: CameraVisit;
}

/** Camera pose in world space plus the optical result. */
export interface CameraPose {
  /** Camera position, its forward, right and down unit vectors. */
  c: CameraVec3; f: CameraVec3; r: CameraVec3; d: CameraVec3;
  /** Where the controller null goes: `dist` ahead of the camera. */
  m: CameraVec3;
  pan: number; tilt: number; roll: number;
  /** Final lens zoom, the zoom before coverage, and the coverage factor. */
  zoom: number; lens: number; cover: number;
  /** Forward travel after the near-plane limit. */
  dz: number;
  /** Focus point: the default (`rig.fd` or the pivot), racked by the visits. */
  fp: CameraVec3;
}

/** Quintic smootherstep: zero velocity and acceleration at both ends (C2). */
export function camSmooth(x: number): number {
  var t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * t * (10 + t * (-15 + 6 * t));
}

/** x / lim compressed toward lim: slope 1 at rest, never past lim, smooth. */
export function camSoftCap(x: number, lim: number): number {
  if (!(lim > 0)) return x;
  var y = Math.abs(x) / lim, e = Math.exp(-2 * y), v = lim * (1 - e) / (1 + e);
  return x < 0 ? -v : v;
}

/** Damped settle from 1 to 0. Zero slope at both ends, so it joins an attack
 * that arrives at rest and ends without a visible stop. */
export function camSettle(tau: number, ringing: number, damping: number): number {
  if (tau <= 0) return 1;
  if (tau >= 1) return 0;
  var w = 2 * Math.PI * Math.max(0.1, ringing), k = Math.max(0, damping);
  var spring = Math.exp(-k * tau) * (Math.cos(w * tau) + k / w * Math.sin(w * tau));
  return spring * (1 - camSmooth((tau - 0.55) / 0.45));
}

/** A finite impact from 0 to 1: optional anticipation, a fast attack that
 * overshoots, then a damped settle that lands exactly on 1 at rest. C1 at every
 * junction, so the motion never jerks. imp = [anticipation, attack, overshoot,
 * ringing, damping]; anticipation and overshoot are fractions of the move. */
export function camImpact(u: number, imp: CameraShotSpec["imp"]): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  var antic = Math.max(0, Math.min(0.5, imp[0] as number)), attack = Math.max(0.02, Math.min(0.8, imp[1] as number));
  var over = Math.max(0, Math.min(1, imp[2] as number)), lead = antic > 0 ? attack * 0.8 : 0;
  if (lead + attack > 0.9) { var fit = 0.9 / (lead + attack); lead *= fit; attack *= fit; }
  if (lead > 0 && u < lead) { var s = Math.sin(Math.PI * u / lead); return -antic * s * s; }
  var hit = lead + attack;
  if (u < hit) return (1 + over) * camSmooth((u - lead) / attack);
  return 1 + over * camSettle((u - hit) / (1 - hit), imp[3] as number, imp[4] as number);
}

/** An event that rises to 1 and returns to rest with a damped recoil. */
export function camPulse(u: number, imp: CameraShotSpec["imp"]): number {
  if (u <= 0 || u >= 1) return 0;
  var attack = Math.max(0.02, Math.min(0.8, imp[1] as number));
  if (u < attack) return camSmooth(u / attack);
  return camSettle((u - attack) / (1 - attack), imp[3] as number, imp[4] as number);
}

/** Deterministic hash in [0, 1). */
export function camHash(x: number): number {
  var s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Seeded noise built from integer harmonics of the period. Position and every
 * derivative repeat after `period`, so a loop closes by construction, and the
 * same seed always gives the same path. Returns a value in [-1, 1]. */
export function camHarmonic(t: number, period: number, seed: number, channel: number, base: number, count: number): number {
  var p = Math.max(0.05, period), n0 = Math.max(1, Math.round(base)), c = Math.max(1, Math.min(6, Math.round(count)));
  var sum = 0, norm = 0, k, a;
  for (k = 0; k < c; k++) {
    a = 1 / (1 + k);
    sum += a * Math.sin(2 * Math.PI * ((n0 + k) * t / p + camHash(seed * 0.618 + channel * 1.37 + k * 0.29)));
    norm += a;
  }
  return sum / norm;
}

/** Weight of one shot at time t. Moves return their eased offset (with the
 * direction applied), pulses their envelope and loops their edge window. */
export function camShotWeight(t: number, s: CameraShotSpec, duration: number): number {
  var dur = Math.max(0.0001, s.dur), u = (t - s.start) / dur;
  if (s.kind === "pulse") return camPulse(u, s.imp);
  if (s.kind === "visit") {
    if (s.vis && s.vis[7]) return t >= s.start ? 1 : 0;
    return s.curve === "impact" ? camImpact(u, s.imp) : libraryEase(u, s.curve);
  }
  if (s.kind === "loop") {
    if (t < s.start || t > s.start + dur) return 0;
    var ramp = Math.min(0.25, dur / 4), w = 1;
    if (s.start > 0.000001) w *= camSmooth((t - s.start) / ramp);
    if (s.start + dur < duration - 0.000001) w *= camSmooth((s.start + dur - t) / ramp);
    return w;
  }
  var e = s.curve === "impact" ? camImpact(u, s.imp) : libraryEase(u, s.curve);
  return s.dir === "from" ? 1 - e : s.dir === "through" ? e - 0.5 : e;
}

/** Lens factor that keeps the background plane covering the frame. Exactly 1
 * while the plane still covers it, then a quadratic knee (C1) that trails the
 * need by at most 0.05% — a fraction of a pixel — so the zoom never jerks. */
export function camCoverKnee(s: number): number {
  var k = 0.0005;
  if (s <= 1) return 1;
  if (s < 1 + 2 * k) return 1 + (s - 1) * (s - 1) / (4 * k);
  return s - k;
}

/** Visits folded in time order: each one pulls the camera from wherever the
 * earlier visits left it toward its own absolute framing, so a tour chains and
 * a final visit to the pivot returns exactly to the design. Returns camera
 * position, pan, tilt, roll (degrees), lens factor and the focus point. The lens
 * blends linearly, not in log: a lens that widens to hold the background then
 * keeps pace with the camera closing in, and what it flies toward only grows.
 * A visit's own focus racks ahead of the camera and lands at 45% of the move;
 * "focus" shots rack it on their own schedule instead. Past 100% a visit would
 * overshoot its framing (twice as deep is behind the background), so its weight
 * stops at 1. */
export function camVisits(t: number, rig: CameraRigFrame, shots: CameraShotSpec[]): number[] {
  var deg = Math.PI / 180, visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;
  var out = [rig.cx, rig.cy, rig.pz - rig.dist, 0, 0, 0, 1, 0, 0, 0], order: number[] = [], i, j, k, s, v, w, e, a, kind;
  var fd = rig.fd;
  out[7] = fd ? fd[0] : rig.cx; out[8] = fd ? fd[1] : rig.cy; out[9] = fd ? fd[2] : rig.pz;
  for (i = 0; i < shots.length; i++) {
    kind = (shots[i] as CameraShotSpec).kind;
    if ((kind === "visit" || kind === "focus") && (shots[i] as CameraShotSpec).vis) order.push(i);
  }
  for (i = 1; i < order.length; i++) {
    k = order[i] as number;
    for (j = i - 1; j >= 0 && (shots[order[j] as number] as CameraShotSpec).start > (shots[k] as CameraShotSpec).start; j--) order[j + 1] = order[j] as number;
    order[j + 1] = k;
  }
  for (i = 0; i < order.length; i++) {
    s = shots[order[i] as number] as CameraShotSpec;
    v = s.vis as CameraVisit;
    a = Math.max(0, Math.min(1, s.amount));
    if (s.kind === "focus") {
      var wr = camSmooth((t - s.start) / Math.max(0.0001, s.dur)) * a;
      for (j = 0; j < 3; j++) out[7 + j] = (out[7 + j] as number) + wr * ((v[4 + j] as number) - (out[7 + j] as number));
      continue;
    }
    e = camShotWeight(t, s, rig.duration);
    w = e * a;
    if (!(w > 0 || w < 0)) continue;
    var ap = s.orb[0] * deg, at = s.orb[1] * deg, d = Math.max(1, v[3]), creep = v[9] || 0, after = t - s.start - s.dur;
    // After arriving, a slow push that eases in (C1) and never passes 15% of the distance.
    if (creep > 0 && after > 0 && !v[7]) d *= 1 - camSoftCap(creep * (after < 0.35 ? after * after / 0.7 : after - 0.175), 0.15);
    var target = [v[0] - d * Math.sin(ap) * Math.cos(at), v[1] + d * Math.sin(at), v[2] - d * Math.cos(ap) * Math.cos(at),
      s.orb[0] + s.rot[0], s.orb[1] + s.rot[1], s.rot[2], s.lens > 0 ? s.lens : 1];
    for (j = 0; j < 7; j++) out[j] = (out[j] as number) + w * ((target[j] as number) - (out[j] as number));
    // A sideways or vertical arc at mid-travel, zero at both ends of the move.
    var arc = v[7] ? 0 : Math.sin(Math.PI * Math.max(0, Math.min(1, e))) * a;
    out[0] = (out[0] as number) + arc * s.tr[0] * visW;
    out[1] = (out[1] as number) + arc * s.tr[1] * visH;
    out[2] = (out[2] as number) + arc * s.tr[2] * rig.dist;
    if (v[8]) continue;
    var wf = v[7] ? w : camSmooth((t - s.start) / Math.max(0.0001, s.dur * 0.45)) * a;
    for (j = 0; j < 3; j++) out[7 + j] = (out[7 + j] as number) + wf * ((v[4 + j] as number) - (out[7 + j] as number));
  }
  return out;
}

/** Camera pose at time t: the reference pose, then the visits, then every
 * other shot, then the near-plane limit, the lens and the background coverage. */
export function camPose(t: number, rig: CameraRigFrame, shots: CameraShotSpec[]): CameraPose {
  var deg = Math.PI / 180, i, c, s, w, a, dz;
  var tx = 0, ty = 0, tz = 0, pan = 0, tilt = 0, roll = 0, opan = 0, otilt = 0, lensLog = 0, dolly = 0;
  var visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;
  var vt = camVisits(t, rig, shots);
  for (i = 0; i < shots.length; i++) {
    s = shots[i] as CameraShotSpec;
    a = s.amount;
    if (s.kind === "visit" || s.kind === "focus" || !(a > 0 || a < 0)) continue;
    w = camShotWeight(t, s, rig.duration) * a;
    if (w === 0) continue;
    if (s.kind === "loop") {
      var age = t - s.start, per = s.org[0] as number, seed = s.org[1] as number, mix = Math.max(0, Math.min(1, s.org[3] as number));
      var tb = Math.max(4, Math.round((s.org[2] as number) * per)), ch: number[] = [];
      for (c = 0; c < 6; c++) {
        ch.push(w * ((1 - mix) * camHarmonic(age, per, seed, c, 1, 3) + mix * camHarmonic(age, per, seed, c + 6, tb, 3)));
      }
      tx += s.tr[0] * visW * (ch[0] as number);
      ty += s.tr[1] * visH * (ch[1] as number);
      dz = s.tr[2] * rig.dist * (ch[2] as number);
      tz += dz; dolly += dz * s.dolly;
      pan += s.rot[0] * (ch[3] as number); tilt += s.rot[1] * (ch[4] as number); roll += s.rot[2] * (ch[5] as number);
      continue;
    }
    tx += s.tr[0] * visW * w;
    ty += s.tr[1] * visH * w;
    dz = s.tr[2] * rig.dist * w;
    tz += dz; dolly += dz * s.dolly;
    pan += s.rot[0] * w; tilt += s.rot[1] * w; roll += s.rot[2] * w;
    opan += s.orb[0] * w; otilt += s.orb[1] * w;
    if (s.lens > 0 && s.lens !== 1) lensLog += Math.log(s.lens) * w;
  }
  if (rig.near > 0 && tz > 0) {
    var limited = camSoftCap(tz, rig.near * (1 - 1 / Math.max(1.05, rig.growth)));
    dolly *= limited / tz;
    tz = limited;
  }
  otilt = camSoftCap(otilt, 80);
  tilt = camSoftCap(tilt + otilt, 80) - otilt;
  // Visit angles are exact framings, so the soft limit only shapes the other shots.
  pan += vt[3] as number; tilt += vt[4] as number; roll += vt[5] as number; lensLog += Math.log(Math.max(0.01, vt[6] as number));
  var op = opan * deg, ot = otilt * deg;
  var orbit: CameraVec3 = [Math.sin(op) * Math.cos(ot), -Math.sin(ot), Math.cos(op) * Math.cos(ot)];
  // The orbit swings around the pivot, dist ahead; visits move that whole frame.
  var cam: CameraVec3 = [(vt[0] as number) - rig.dist * orbit[0] + tx, (vt[1] as number) - rig.dist * orbit[1] + ty,
    (vt[2] as number) + rig.dist - rig.dist * orbit[2] + tz];
  var p = (pan + opan) * deg, q = (tilt + otilt) * deg, rr = roll * deg;
  var fwd: CameraVec3 = [Math.sin(p) * Math.cos(q), -Math.sin(q), Math.cos(p) * Math.cos(q)];
  var r0: CameraVec3 = [Math.cos(p), 0, -Math.sin(p)], d0: CameraVec3 = [Math.sin(p) * Math.sin(q), Math.cos(q), Math.cos(p) * Math.sin(q)];
  var cr = Math.cos(rr), sr = Math.sin(rr);
  var right: CameraVec3 = [r0[0] * cr + d0[0] * sr, r0[1] * cr + d0[1] * sr, r0[2] * cr + d0[2] * sr];
  var down: CameraVec3 = [d0[0] * cr - r0[0] * sr, d0[1] * cr - r0[1] * sr, d0[2] * cr - r0[2] * sr];
  var lens = rig.zoom * Math.exp(lensLog) * Math.max(0.05, (rig.dist - dolly) / rig.dist);
  var cover = 1;
  if (rig.cover) {
    // The background's four corners on screen, relative to the frame centre. Pan
    // and tilt turn the plane oblique, so its far side shrinks with perspective:
    // measuring only at the centre left a strip of the edge showing.
    var m = rig.margin, hw = rig.width / 2, hh = rig.height / 2, bz = typeof rig.bz === "number" ? rig.bz : rig.pz;
    var kb = (rig.dist + bz - rig.pz) / rig.dist, need = 1, area = 0, j, corner;
    var xs = [rig.cx - (hw + Math.max(0, m[0])) * kb, rig.cx + (hw + Math.max(0, m[1])) * kb];
    var ys = [rig.cy - (hh + Math.max(0, m[2])) * kb, rig.cy + (hh + Math.max(0, m[3])) * kb];
    var qx: number[] = [], qy: number[] = [];
    for (j = 0; j < 4; j++) {
      var vx = (xs[j === 1 || j === 2 ? 1 : 0] as number) - cam[0], vy = (ys[j >= 2 ? 1 : 0] as number) - cam[1], vz = bz - cam[2];
      var depth = vx * fwd[0] + vy * fwd[1] + vz * fwd[2];
      if (!(depth > 1)) { need = 10; break; }
      qx.push(lens * (vx * right[0] + vy * right[1] + vz * right[2]) / depth);
      qy.push(lens * (vx * down[0] + vy * down[1] + vz * down[2]) / depth);
    }
    for (j = 0; need < 10 && j < 4; j++) area += (qx[j] as number) * (qy[(j + 1) % 4] as number) - (qx[(j + 1) % 4] as number) * (qy[j] as number);
    // The lens scales the screen about the centre, so the frame fits the quad
    // once each frame corner divided by the zoom lies on the inner side of every
    // edge: (b / s + g0) keeps the sign of the area, i.e. s >= -b / g0.
    for (j = 0; need < 10 && j < 4; j++) {
      var ax = qx[j] as number, ay = qy[j] as number, ex = (qx[(j + 1) % 4] as number) - ax, ey = (qy[(j + 1) % 4] as number) - ay;
      var g0 = ey * ax - ex * ay;
      if (!(g0 * area > 0)) { need = 10; break; }
      for (corner = 0; corner < 4; corner++) {
        var b = ex * (corner >= 2 ? hh : -hh) - ey * (corner === 1 || corner === 2 ? hw : -hw);
        if (b * area < 0) need = Math.max(need, -b / g0);
      }
    }
    cover = camCoverKnee(Math.min(10, need));
  }
  return {
    c: cam, f: fwd, r: right, d: down,
    m: [cam[0] + rig.dist * fwd[0], cam[1] + rig.dist * fwd[1], cam[2] + rig.dist * fwd[2]],
    pan: pan + opan, tilt: tilt + otilt, roll: roll,
    zoom: lens * cover, lens: lens, cover: cover, dz: tz,
    fp: [vt[7] as number, vt[8] as number, vt[9] as number]
  };
}

/** After Effects Orientation, in degrees, of the roll-free camera basis
 * `Ry(pan) · Rx(tilt)`. After Effects composes Orientation as `Rx(x) · Ry(y) ·
 * Rz(z)`, so the angles come from that matrix's third column and first row. With
 * the controller's Rotate Z set to the roll, the camera axes equal `r`, `d`, `f`. */
export function camOrientation(pose: CameraPose): CameraVec3 {
  var deg = Math.PI / 180, p = pose.pan * deg, q = pose.tilt * deg;
  var sp = Math.sin(p), cp = Math.cos(p), sq = Math.sin(q), cq = Math.cos(q);
  return [Math.atan2(sq, cp * cq) / deg, Math.asin(Math.max(-1, Math.min(1, sp * cq))) / deg, Math.atan2(-sp * sq, cp) / deg];
}

/** Screen position of a world point and its perspective scale, as After Effects
 * projects it through a camera with this pose. [x, y, scale]; scale 0 behind. */
export function camProject(pose: CameraPose, point: CameraVec3, centerX: number, centerY: number): CameraVec3 {
  var v: CameraVec3 = [point[0] - pose.c[0], point[1] - pose.c[1], point[2] - pose.c[2]];
  var z = v[0] * pose.f[0] + v[1] * pose.f[1] + v[2] * pose.f[2];
  if (!(z > 0.000001)) return [centerX, centerY, 0];
  var k = pose.zoom / z;
  return [centerX + (v[0] * pose.r[0] + v[1] * pose.r[1] + v[2] * pose.r[2]) * k,
    centerY + (v[0] * pose.d[0] + v[1] * pose.d[1] + v[2] * pose.d[2]) * k, k];
}

/** Focus distance along the optical axis, not the straight line: a target off
 * to the side still lands on its own plane. Below `minimum` it hands over to the
 * fallback smoothly, so a target behind the camera never produces NaN or a jump. */
export function camFocusDepth(cam: CameraVec3, fwd: CameraVec3, target: CameraVec3, offset: number, minimum: number, fallback: number): number {
  var d = (target[0] - cam[0]) * fwd[0] + (target[1] - cam[1]) * fwd[1] + (target[2] - cam[2]) * fwd[2] + offset;
  var lo = Math.max(1, minimum);
  if (!(d === d)) return fallback;
  if (d >= lo * 2) return d;
  if (d <= lo) return fallback;
  return fallback + (d - fallback) * camSmooth((d - lo) / lo);
}

/** Names serialized into the host and expressions, in declaration order. */
export const CAMERA_KERNEL_FUNCTIONS = ["camSmooth", "camSoftCap", "camSettle", "camImpact", "camPulse", "camHash",
  "camHarmonic", "camShotWeight", "camCoverKnee", "camVisits", "camPose", "camOrientation", "camProject", "camFocusDepth"] as const;
