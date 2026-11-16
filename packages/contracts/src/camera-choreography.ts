/* eslint-disable no-var -- The planner functions are serialized verbatim into the ES3 Adobe host. */
/**
 * Scene-aware camera choreographies (ADR 0007, phase 2).
 *
 * A choreography reads the 3D layers of the scene (the Parallax planes, or the
 * 3D layers of a standalone rig) and plans a chain of visits: the camera starts
 * deep inside the stack with the front layers behind it, pulls back through
 * them so they appear one by one, frames one layer after another with the
 * focus racking to each, and returns to the design. Every beat becomes an
 * ordinary "visit" shot with its own marker, so the result stays live,
 * editable, bakeable and removable like any other shot.
 *
 * The planner runs once, in the host, when the choreography is applied. It is
 * pure and deterministic and uses only var/function, like the kernel.
 */
import { camPose, camProject, type CameraRigFrame, type CameraShotSpec, type CameraVec3, type CameraVisit } from "./camera-kernel.js";

export const CAMERA_CHOREOGRAPHY_SCHEMA_VERSION = 1;

/** One layer of the scene as the planner sees it: world centre, half extents in its own plane. */
export interface CameraSceneLayer {
  id: number;
  name: string;
  /** "text", "image", "shape" or "other". */
  kind: string;
  c: CameraVec3;
  hw: number; hh: number;
  /** 1 for the background plane. */
  bg: number;
  /** Most magnification the source holds sharp (footage pixels over reference screen pixels); 0 = vector. */
  mx?: number;
}

/** Where a step sends the camera. "through" flies past the main subject to the background. */
export type CameraStepTarget = "home" | "deep" | "deep-left" | "deep-right" | "through" | "subjects" | "main";

export interface CameraChoreographyStep {
  to: CameraStepTarget;
  /** Relative time of the move and of the hold after it; scaled to the total duration. */
  move: number; hold: number;
  curve: string;
  /** 1 jumps to the pose at the step start (only the first step). */
  cut?: number;
  /** Fraction of the frame the target should fill. */
  fill?: number;
  /** Orbit around the target in degrees; with `alt` the pan flips on every other subject. */
  orb?: [number, number];
  alt?: number;
  /** Arc at mid-travel: X of the visible width, Y of the visible height, Z of the distance. */
  arc?: CameraVec3;
  /** Extra roll in degrees while framing; with `alt` it flips like the orbit. */
  roll?: number;
  /** With the "impact" curve: anticipation, attack, overshoot, ringing, damping (a zoom that punches and settles). */
  imp?: [number, number, number, number, number];
  /** After arriving, keep pushing in by this fraction of the distance per second, so a hold never freezes. */
  creep?: number;
  /** "target" focuses the visited layer, "main" the main subject. */
  focus: "target" | "main";
}

export interface CameraChoreography {
  schemaVersion: 1;
  id: string;
  version: number;
  name: { "pt-BR": string; "en-US": string };
  description: { "pt-BR": string; "en-US": string };
  durationSeconds: number;
  /** Most subjects a "subjects" step visits. */
  maxSubjects: number;
  /** Visiting order when the user leaves it to the choreography; "back-to-front" otherwise. */
  order?: string;
  steps: CameraChoreographyStep[];
}

/** A focus rack: from `start`, over `dur`, onto the scene layer `layer` (index). */
export interface CameraFocusKey {
  start: number; dur: number; layer: number;
}

/** One planned beat: a visit shot plus what it is for. */
export interface CameraBeat {
  start: number; dur: number;
  curve: string;
  tr: CameraVec3; rot: CameraVec3; orb: [number, number];
  lens: number;
  imp: [number, number, number, number, number];
  vis: CameraVisit;
  /** "home", "deep", "subject" or "main". */
  role: string;
  /** Layer id the beat frames, or -1. */
  layer: number;
}

export interface CameraPlan {
  beats: CameraBeat[];
  /** Scene indices of the visited subjects, in visiting order. */
  subjects: number[];
  main: number;
  background: number;
  /** Layers hidden behind the camera at the deep start. */
  hidden: number;
  /** How far into the scene the deep start went, px of Z from the reference camera (0 = none). */
  depth: number;
  /** Where the focus goes over time: each rack lands on the layer that matters on screen then. */
  focus: CameraFocusKey[];
  warnings: string[];
}

export interface CameraPlanOptions {
  start: number;
  duration: number;
  /** Composition frame duration, for the cut beat. */
  frame: number;
  /** "back-to-front", "front-to-back", "reading", "spread" (corner to corner), or "auto" for the recipe's own. */
  order: string;
  /** 0 keeps the recipe's limit. */
  maxSubjects: number;
  /** Deep start: px the camera travels into the scene along Z from its reference position (default 2500). */
  depth?: number;
  /** false leaves the focus to each visit; otherwise the planner racks it to whatever matters on screen. */
  focus?: boolean;
  /** Most focus racks to write (default 10). */
  maxFocus?: number;
}

/** Default deep start: the camera goes "Z +2500" into the scene, the motion designer's habit. */
export const CAMERA_DEEP_START_PX = 2500;

/* --------------------------------------------------------------- planner */

/** Distance from the reference camera to the layer's plane. */
export function camRefDistance(layer: CameraSceneLayer, rig: CameraRigFrame): number {
  return Math.max(1, layer.c[2] - (rig.pz - rig.dist));
}

/** How much of the frame a layer occupies at reference, text weighted up. */
export function camImportance(layer: CameraSceneLayer, rig: CameraRigFrame): number {
  var d = camRefDistance(layer, rig), w = rig.zoom * layer.hw / d, h = rig.zoom * layer.hh / d;
  var frame = rig.width * rig.height / 4;
  return Math.min(1, w * h / frame) * (layer.kind === "text" ? 1.6 : 1);
}

/** The background: a flagged plane, else the farthest layer that covers most of the frame, else -1. */
export function camBackground(scene: CameraSceneLayer[], rig: CameraRigFrame): number {
  var i, best = -1, far = -Infinity;
  for (i = 0; i < scene.length; i++) if ((scene[i] as CameraSceneLayer).bg) return i;
  for (i = 0; i < scene.length; i++) {
    var l = scene[i] as CameraSceneLayer;
    if (camImportance(l, rig) >= 0.6 && l.kind !== "text" && l.c[2] > far) { far = l.c[2]; best = i; }
  }
  return best;
}

/** Subjects to visit: the most important non-background layers, then put in the requested order. */
export function camPickSubjects(scene: CameraSceneLayer[], rig: CameraRigFrame, background: number, order: string, max: number): number[] {
  var picked: number[] = [], i, j, k;
  for (i = 0; i < scene.length; i++) if (i !== background) picked.push(i);
  for (i = 1; i < picked.length; i++) {
    k = picked[i] as number;
    for (j = i - 1; j >= 0 && camImportance(scene[picked[j] as number] as CameraSceneLayer, rig) < camImportance(scene[k] as CameraSceneLayer, rig); j--) picked[j + 1] = picked[j] as number;
    picked[j + 1] = k;
  }
  picked = picked.slice(0, Math.max(1, max));
  if (order === "spread") {
    // Corner to corner: the most important first, then always the one farthest on screen from the last.
    var seq: number[] = [picked[0] as number], rest = picked.slice(1);
    while (rest.length) {
      var last = scene[seq[seq.length - 1] as number] as CameraSceneLayer, at = camScreenAtRest(last, rig), far = -1, pick = 0;
      for (k = 0; k < rest.length; k++) {
        var p = camScreenAtRest(scene[rest[k] as number] as CameraSceneLayer, rig), dx = (p[0] as number) - (at[0] as number), dy = (p[1] as number) - (at[1] as number);
        var gap = dx * dx + dy * dy;
        if (gap > far) { far = gap; pick = k; }
      }
      seq.push(rest.splice(pick, 1)[0] as number);
    }
    return seq;
  }
  for (i = 1; i < picked.length; i++) {
    k = picked[i] as number;
    for (j = i - 1; j >= 0 && camOrderKey(scene[picked[j] as number] as CameraSceneLayer, order) > camOrderKey(scene[k] as CameraSceneLayer, order); j--) picked[j + 1] = picked[j] as number;
    picked[j + 1] = k;
  }
  return picked;
}

/** Where a layer's centre sits on screen in the design (reference camera). */
export function camScreenAtRest(layer: CameraSceneLayer, rig: CameraRigFrame): number[] {
  var k = rig.zoom / camRefDistance(layer, rig);
  return [rig.cx + (layer.c[0] - rig.cx) * k, rig.cy + (layer.c[1] - rig.cy) * k];
}

/** Sort key for the visiting order: farthest first, nearest first, or top to bottom then left to right. */
export function camOrderKey(layer: CameraSceneLayer, order: string): number {
  if (order === "front-to-back") return layer.c[2];
  if (order === "reading") return Math.round(layer.c[1] / 40) * 100000 + layer.c[0];
  return -layer.c[2];
}

/** Pose of the camera looking at `target` from `dist` along the orbit `orb`, with an optional lens factor. */
export function camVisitPose(rig: CameraRigFrame, target: CameraVec3, dist: number, orb: [number, number], lens?: number): ReturnType<typeof camPose> {
  var shot = { kind: "visit", start: 0, dur: 1, amount: 1, dir: "to", curve: "silk", tr: [0, 0, 0], rot: [0, 0, 0], orb: orb, lens: lens || 1,
    dolly: 0, imp: [0, 0.2, 0, 1.2, 4], org: [6, 1, 6, 0], vis: [target[0], target[1], target[2], dist, target[0], target[1], target[2], 1] };
  return camPose(0, rig, [shot as CameraShotSpec]);
}

/** Screen box of a layer and the depths of its nearest and farthest corners: [x0, y0, x1, y1, near, far]. */
export function camScreenBox(pose: ReturnType<typeof camPose>, layer: CameraSceneLayer, rig: CameraRigFrame): number[] {
  var box = [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity], i;
  for (i = 0; i < 4; i++) {
    var p: CameraVec3 = [layer.c[0] + (i === 1 || i === 2 ? layer.hw : -layer.hw), layer.c[1] + (i >= 2 ? layer.hh : -layer.hh), layer.c[2]];
    var depth = (p[0] - pose.c[0]) * pose.f[0] + (p[1] - pose.c[1]) * pose.f[1] + (p[2] - pose.c[2]) * pose.f[2];
    box[4] = Math.min(box[4] as number, depth);
    box[5] = Math.max(box[5] as number, depth);
    var s = camProject(pose, p, rig.cx, rig.cy);
    box[0] = Math.min(box[0] as number, s[0]); box[1] = Math.min(box[1] as number, s[1]);
    box[2] = Math.max(box[2] as number, s[0]); box[3] = Math.max(box[3] as number, s[1]);
  }
  return box;
}

/** Fraction of box `a` covered by box `b`, both clipped to the frame. */
export function camOverlap(a: number[], b: number[], rig: CameraRigFrame): number {
  var x0 = Math.max(0, a[0] as number), y0 = Math.max(0, a[1] as number), x1 = Math.min(rig.width, a[2] as number), y1 = Math.min(rig.height, a[3] as number);
  var area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (area <= 0) return 0;
  var w = Math.min(x1, b[2] as number) - Math.max(x0, b[0] as number), h = Math.min(y1, b[3] as number) - Math.max(y0, b[1] as number);
  return w > 0 && h > 0 ? w * h / area : 0;
}

/** How badly other layers spoil a framing: covering the target, or sitting huge right in front of the lens. */
export function camBlockScore(scene: CameraSceneLayer[], rig: CameraRigFrame, target: number, background: number, pose: ReturnType<typeof camPose>, dist: number): number {
  var score = 0, i, all = [0, 0, rig.width, rig.height];
  var own = target >= 0 ? camScreenBox(pose, scene[target] as CameraSceneLayer, rig) : all;
  for (i = 0; i < scene.length; i++) {
    if (i === target || i === background) continue;
    var box = camScreenBox(pose, scene[i] as CameraSceneLayer, rig), depth = box[4] as number;
    if (depth <= 1 || depth >= dist - 1) continue;
    score += camOverlap(own, box, rig);
    if (depth < 0.3 * dist && camOverlap(all, box, rig) > 0.25) score += 1;
  }
  return score;
}

/** Framing distance for a subject: text fits whole inside `fill` of the frame,
 * images fill it by their limiting side; always a real push in (at least 1.15x,
 * 1.08x for text, which is usually wide already: a wide title goes up to 90% of
 * the frame rather than backing off) and never past what the source holds
 * sharp. Then moved past layers that would block the view. */
export function camFrameDistance(scene: CameraSceneLayer[], rig: CameraRigFrame, index: number, background: number, fill: number, orb: [number, number]): number {
  var layer = scene[index] as CameraSceneLayer, ref = camRefDistance(layer, rig), text = layer.kind === "text";
  var maxMag = text ? 1.8 : Math.max(1.2, Math.min(2.4, layer.mx && layer.mx > 0 ? layer.mx : 2.2)), minMag = text ? 1.08 : 1.15;
  var sx = layer.hw / (fill * rig.width / 2), sy = layer.hh / (fill * rig.height / 2);
  var want = rig.zoom * (text ? Math.max(sx, sy) : Math.min(sx, sy));
  var d = Math.max(Math.min(want, ref / minMag), ref / maxMag, 0.08 * rig.zoom), clear = 0.06 * rig.zoom;
  // Text stays whole: never closer than 90% of the frame, and no flying past layers to reach it.
  if (text) return Math.max(Math.min(want, ref / minMag), rig.zoom * Math.max(layer.hw / (0.45 * rig.width), layer.hh / (0.45 * rig.height)), ref / maxMag);
  var best = d, bestScore = camBlockScore(scene, rig, index, background, camVisitPose(rig, layer.c, d, orb), d), i;
  if (bestScore < 0.15) return best;
  // Fly past the blocking layers: put each one behind the camera in turn.
  for (i = 0; i < scene.length; i++) {
    var other = scene[i] as CameraSceneLayer;
    if (i === index || i === background || other.c[2] >= layer.c[2]) continue;
    var past = layer.c[2] - other.c[2] - clear;
    if (past < 0.08 * rig.zoom || ref / past > maxMag * 1.25) continue;
    var score = camBlockScore(scene, rig, index, background, camVisitPose(rig, layer.c, past, orb), past);
    if (score < bestScore - 0.05 || (score <= bestScore && past > best)) { best = past; bestScore = score; }
  }
  return best;
}

/** Fraction of a screen box that lies inside the frame. */
export function camVisibleFraction(box: number[], rig: CameraRigFrame): number {
  var w = (box[2] as number) - (box[0] as number), h = (box[3] as number) - (box[1] as number);
  if (!(w > 0 && h > 0)) return 0;
  var iw = Math.min(rig.width, box[2] as number) - Math.max(0, box[0] as number), ih = Math.min(rig.height, box[3] as number) - Math.max(0, box[1] as number);
  return iw > 0 && ih > 0 ? iw * ih / (w * h) : 0;
}

/** Frames a subject the way a camera operator would. Centring a layer that sits
 * near the edge of the design shows past the background, and the kernel then
 * zooms the lens to cover it, so text sized to fit clipped in After Effects.
 * Instead the look-at point slides toward the layout's centre until the
 * background covers on its own, and the subject sits off-centre, whole (text
 * inside the title-safe frame; an image at least 85% in the picture, with at
 * most the 1.25x coverage zoom a deep pose may take). When it cannot, the orbit
 * eases off (close to a small layer, an orbit swings the view across the far
 * background, which needs the zoom wherever the camera looks), and last the
 * camera backs off. Returns [x, y, z of the look-at point, distance, orbit scale]. */
export function camReframe(scene: CameraSceneLayer[], rig: CameraRigFrame, index: number, dist: number, orb: [number, number]): number[] {
  var layer = scene[index] as CameraSceneLayer, c = layer.c, ref = camRefDistance(layer, rig), d = dist, look: CameraVec3 = c;
  var scales = [1, 0.5, 0], scale = 1, tries, n, k, lo, hi, mid, o: [number, number], floor;
  function at(s: number): CameraVec3 { return [c[0] + s * (rig.cx - c[0]), c[1] + s * (rig.cy - c[1]), c[2]]; }
  for (tries = 0; tries < 12; tries++) {
    for (n = 0; n < scales.length; n++) {
      scale = scales[n] as number; o = [orb[0] * scale, orb[1] * scale];
      // Slide as far as needed to reach the least zoom the layout's centre needs.
      floor = Math.max(1.0005, camVisitPose(rig, at(1), d, o).cover + 0.0005); lo = 0; hi = 0;
      if (camVisitPose(rig, c, d, o).cover > floor) {
        hi = 1;
        for (k = 0; k < 14; k++) {
          mid = (lo + hi) / 2;
          if (camVisitPose(rig, at(mid), d, o).cover > floor) lo = mid; else hi = mid;
        }
      }
      look = at(hi);
      var pose = camVisitPose(rig, look, d, o), box = camScreenBox(pose, layer, rig);
      var whole = layer.kind === "text" ? (box[0] as number) >= 0.04 * rig.width && (box[2] as number) <= 0.96 * rig.width &&
        (box[1] as number) >= 0.03 * rig.height && (box[3] as number) <= 0.97 * rig.height : camVisibleFraction(box, rig) >= 0.85 && pose.cover <= 1.25;
      if (whole) return [look[0], look[1], look[2], d, scale];
    }
    if (d >= ref) break;
    d = Math.min(ref, d * 1.1);
  }
  return [look[0], look[1], look[2], d, scale];
}

/** Is a deep pose clean? The background still fills the frame, no layer slices
 * through the lens, none covers more than 40% of the frame and none sits huge
 * against the lens in the middle. The protagonist (`hero`) may take more of the
 * frame (55%): it is the subject, not a wall, but a frame that is all protagonist
 * reads as a wall too. Returns the layers hidden behind the camera, or -1. */
export function camPoseClear(scene: CameraSceneLayer[], rig: CameraRigFrame, background: number, pose: ReturnType<typeof camPose>, dist: number, hero?: number): number {
  var frame = [0, 0, rig.width, rig.height], middle = [rig.width * 0.2, rig.height * 0.2, rig.width * 0.8, rig.height * 0.8], hidden = 0, i;
  // A pose that needs a big coverage zoom only magnifies the background.
  if (pose.cover > 1.25) return -1;
  if (background >= 0 && camOverlap(frame, camScreenBox(pose, scene[background] as CameraSceneLayer, rig), rig) < 0.995) return -1;
  for (i = 0; i < scene.length; i++) {
    if (i === background) continue;
    var box = camScreenBox(pose, scene[i] as CameraSceneLayer, rig), near = box[4] as number, far = box[5] as number;
    if (far <= 1) { hidden++; continue; }
    if (near <= 1) return -1;
    if (i === hero) { if (camOverlap(frame, box, rig) > 0.55) return -1; continue; }
    if (camOverlap(frame, box, rig) > 0.4) return -1;
    if (near < 0.25 * dist && camOverlap(middle, box, rig) > 0.1) return -1;
  }
  return hidden;
}

/** The camera deep inside the stack, looking at the background: as many front
 * layers behind it as possible, slid sideways when the main subject would fill
 * the frame, never magnifying the background past 2.2x (the focus sits on the
 * subject there, so the background is soft). With `track` (-1 or 1) it is one end
 * of an arc around the background's centre instead — the background stays framed
 * while the layers in front slide across — and the result's sixth value is the
 * arc's half angle: both ends and the middle must be clean at the same depth.
 * The main subject stays in the picture: at least 15% of it at a deep start, 35%
 * at the ends of an arc and 60% in its middle, so no frame is empty background.
 * [x, y, z of the look-at point, distance, hidden layers, arc angle], or null. */
export function camDeepPose(scene: CameraSceneLayer[], rig: CameraRigFrame, background: number, main: number, track: number, orb: [number, number]): number[] | null {
  var look: CameraVec3 = background >= 0 ? (scene[background] as CameraSceneLayer).c : [rig.cx, rig.cy, rig.pz];
  var camRef = rig.pz - rig.dist, refBg = Math.max(1, look[2] - camRef), depths: number[] = [], i, j, k;
  for (i = 1; i <= 24; i++) depths.push(camRef + i / 24 * 0.9 * refBg);
  for (i = 0; i < scene.length; i++) if (i !== background) depths.push((scene[i] as CameraSceneLayer).c[2] + 0.06 * rig.zoom);
  var options = track ? [16, 13, 10, 7] : [0, 0.3, -0.3, 0.5, -0.5, 0.7, -0.7], best: number[] | null = null, bestScore = -Infinity;
  for (i = 0; i < depths.length; i++) {
    var zc = depths[i] as number, d = look[2] - zc;
    if (d < refBg / 2.2 || zc <= camRef + 1) continue;
    var visW = rig.width * d / rig.zoom;
    for (j = 0; j < options.length; j++) {
      var s = options[j] as number, hidden = 0, score;
      if (track) {
        for (k = -1; k <= 1 && hidden >= 0; k++) {
          // The left end (k = -1) sits left of the centre and looks right at it.
          var pose = camVisitPose(rig, look, d, [-k * s, orb[1]]);
          var h = camPoseClear(scene, rig, background, pose, d, main);
          if (main >= 0 && camVisibleFraction(camScreenBox(pose, scene[main] as CameraSceneLayer, rig), rig) < (k ? 0.35 : 0.6)) h = -1;
          // Mid-arc, something besides the protagonist must be in the picture, sliding across.
          if (h >= 0 && !k) {
            var others = 0;
            for (var o = 0; o < scene.length; o++) {
              if (o === background || o === main) continue;
              var ob = camScreenBox(pose, scene[o] as CameraSceneLayer, rig);
              if ((ob[4] as number) > 1 && camVisibleFraction(ob, rig) > 0.2) others++;
            }
            if (!others) h = -1;
          }
          hidden = h < 0 ? -1 : Math.max(hidden, h);
        }
        if (hidden < 0) continue;
        score = (zc - camRef) / refBg * 4 + s / 8;
        if (score > bestScore) { bestScore = score; best = [look[0], look[1], look[2], d, hidden, s]; }
      } else {
        var start = camVisitPose(rig, [look[0] + s * visW, look[1], look[2]], d, orb);
        hidden = camPoseClear(scene, rig, background, start, d);
        if (hidden < 1 || (main >= 0 && camVisibleFraction(camScreenBox(start, scene[main] as CameraSceneLayer, rig), rig) < 0.15)) continue;
        score = hidden * 10 + (zc - camRef) / refBg * 4 - Math.abs(s) * 1.5;
        if (score > bestScore) { bestScore = score; best = [look[0] + s * visW, look[1], look[2], d, hidden, 0]; }
      }
    }
  }
  return best;
}

/** The deep start, "lá de trás": the camera travels `depth` px straight into the
 * scene from its reference position (the motion designer's "Z +2500"), toward
 * the background, never closer to it than 4% of the zoom. A layer that would sit
 * against the lens there and fill the frame like a wall is flown past or, when
 * that is nearer the requested depth, stopped short of (a wall slices the lens,
 * or fills most of the frame magnified past 2.5x). The lens widens so the
 * background is never magnified past what it holds (2.2x, more for a large
 * source), and the reveal brings it back to normal as the camera pulls out.
 * [x, y, z of the look-at point, distance, hidden layers, lens], or null. */
export function camDeepStart(scene: CameraSceneLayer[], rig: CameraRigFrame, background: number, depth: number): number[] | null {
  var camRef = rig.pz - rig.dist, back = background >= 0 ? scene[background] as CameraSceneLayer : null, bz = -Infinity, i, k, j;
  if (back) bz = back.c[2];
  else for (i = 0; i < scene.length; i++) bz = Math.max(bz, (scene[i] as CameraSceneLayer).c[2]);
  var clear = Math.max(60, 0.04 * rig.zoom), limit = bz - clear, refBg = bz - camRef;
  var want = Math.min(limit, camRef + Math.max(0, depth)), cap = Math.max(2.2, Math.min(4, back && back.mx ? back.mx : 0));
  if (!(want > camRef + 1)) return null;
  var options = [want], frame = [0, 0, rig.width, rig.height];
  for (i = 0; i < scene.length; i++) if (i !== background) options.push((scene[i] as CameraSceneLayer).c[2] + clear, (scene[i] as CameraSceneLayer).c[2] - 0.2 * rig.dist);
  for (i = 1; i < options.length; i++) {
    var z = options[i] as number;
    for (j = i - 1; j >= 0 && Math.abs((options[j] as number) - want) > Math.abs(z - want); j--) options[j + 1] = options[j] as number;
    options[j + 1] = z;
  }
  for (k = 0; k < options.length; k++) {
    var zc = options[k] as number;
    if (!(zc > camRef + 1 && zc <= limit)) continue;
    var d = bz - zc, lens = Math.min(1, cap * d / refBg), pose = camVisitPose(rig, [rig.cx, rig.cy, bz], d, [0, 0], lens), hidden = 0, clean = true;
    for (i = 0; i < scene.length && clean; i++) {
      if (i === background) continue;
      var box = camScreenBox(pose, scene[i] as CameraSceneLayer, rig);
      if ((box[5] as number) <= 1) { hidden++; continue; }
      // A wall: slicing the lens, or filling most of the frame blown up past 2.5x. A large subject farther off is just in frame.
      if ((box[4] as number) <= 1 || (camOverlap(frame, box, rig) > 0.55 && pose.zoom / (box[4] as number) > 2.5)) clean = false;
    }
    if (clean) return [rig.cx, rig.cy, bz, d, hidden, lens];
  }
  return null;
}

/** How much a layer deserves the focus in a pose: its share of the frame (up to
 * 60%), more in the middle, mostly inside the frame, text and the protagonist
 * weighted up. A layer brushing past the lens is foreground, not subject; the
 * background only wins when nothing else is on screen. */
export function camFocusScore(scene: CameraSceneLayer[], rig: CameraRigFrame, index: number, background: number, main: number, pose: ReturnType<typeof camPose>): number {
  var layer = scene[index] as CameraSceneLayer, box = camScreenBox(pose, layer, rig), w = rig.width, h = rig.height;
  if ((box[5] as number) <= 1) return 0;
  if (index === background) return (box[4] as number) > 1 ? 0.04 : 0;
  if ((box[4] as number) < 0.08 * rig.dist) return 0;
  var seen = camVisibleFraction(box, rig);
  if (seen < 0.3) return 0;
  var x0 = Math.max(0, box[0] as number), y0 = Math.max(0, box[1] as number), x1 = Math.min(w, box[2] as number), y1 = Math.min(h, box[3] as number);
  var share = Math.min(0.6, (x1 - x0) * (y1 - y0) / (w * h)), cx = (x0 + x1) / (2 * w) - 0.5, cy = (y0 + y1) / (2 * h) - 0.5;
  var middle = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 1.4);
  return share * (0.4 + 0.6 * middle) * (0.5 + 0.5 * seen) * (layer.kind === "text" ? 1.5 : 1) * (index === main ? 1.3 : 1);
}

/** Smart focus. While the camera goes to a layer and holds on it, the focus is
 * that layer, racked from the moment the move starts, so it lands before the
 * camera does. Everywhere else (the deep start, the reveal, the travelling, the
 * way back to the layout) it walks the planned move and takes the layer that
 * matters on screen: the background while nothing else shows, then each layer
 * as it appears. A switch there needs a clear win (30%) held for 0.2 s, or the
 * current layer leaving the picture. Every switch is a fast rack (0.3 s) that
 * starts a beat before the layer takes over. At most `maxFocus` racks: the
 * shortest holds go first. */
export function camPlanFocus(scene: CameraSceneLayer[], rig: CameraRigFrame, plan: CameraPlan, opts: CameraPlanOptions): CameraFocusKey[] {
  var shots: CameraShotSpec[] = [], i, j, t, keys: number[][] = [], cur = -1, cand = -1, since = 0, end = opts.start + opts.duration;
  var step = Math.max(opts.frame, 1 / 12), rack = 0.3, max = opts.maxFocus && opts.maxFocus > 0 ? opts.maxFocus : 10;
  for (i = 0; i < plan.beats.length; i++) {
    var b = plan.beats[i] as CameraBeat;
    shots.push({ kind: "visit", start: b.start, dur: b.dur, amount: 1, dir: "to", curve: b.curve, tr: b.tr, rot: b.rot, orb: b.orb, lens: b.lens,
      dolly: 0, imp: b.imp, org: [6, 1, 6, 0], vis: b.vis } as CameraShotSpec);
  }
  for (t = opts.start; t <= end + 1e-9; t += step) {
    // The beat in charge: the last one that has started.
    var active: CameraBeat | null = null, forced = -1;
    for (j = 0; j < plan.beats.length; j++) if ((plan.beats[j] as CameraBeat).start <= t + 1e-9) active = plan.beats[j] as CameraBeat;
    if (active && active.layer >= 0) for (j = 0; j < scene.length; j++) if ((scene[j] as CameraSceneLayer).id === active.layer) forced = j;
    if (forced >= 0) {
      if (forced !== cur) { keys.push([Math.max(t - step, active ? active.start : t), forced]); cur = forced; }
      cand = -1;
      continue;
    }
    var pose = camPose(t, rig, shots), best = -1, top = 0, now = 0;
    for (i = 0; i < scene.length; i++) {
      var score = camFocusScore(scene, rig, i, plan.background, plan.main, pose);
      if (score > top) { top = score; best = i; }
      if (i === cur) now = score;
    }
    if (best < 0) continue;
    if (cur < 0) { cur = best; keys.push([t, best]); continue; }
    if (best === cur || (now > 0 && top < now * 1.3)) { cand = -1; continue; }
    if (cand !== best) { cand = best; since = t; }
    if (now <= 0 || t - since >= 0.2) { keys.push([now <= 0 ? t : since, best]); cur = best; cand = -1; }
  }
  // Too many racks read as hunting: drop the shortest holds, then repeats.
  while (keys.length > max) {
    var shortest = 1, gap = Infinity;
    for (i = 1; i < keys.length; i++) {
      var hold = (i + 1 < keys.length ? (keys[i + 1] as number[])[0] as number : end) - ((keys[i] as number[])[0] as number);
      if (hold < gap) { gap = hold; shortest = i; }
    }
    keys.splice(shortest, 1);
    for (i = keys.length - 1; i > 0; i--) if ((keys[i] as number[])[1] === (keys[i - 1] as number[])[1]) keys.splice(i, 1);
  }
  var out: CameraFocusKey[] = [], cut = plan.beats.length && (plan.beats[0] as CameraBeat).vis[7] ? 1 : 0, free = opts.start;
  for (i = 0; i < keys.length; i++) {
    var at = (keys[i] as number[])[0] as number, dur = i === 0 && cut ? opts.frame : rack, start = i === 0 ? opts.start : Math.max(free, at - 0.1);
    out.push({ start: start, dur: dur, layer: (keys[i] as number[])[1] as number });
    free = start + dur;
  }
  return out;
}

/** Plans a choreography over the scene. Beats come in time order and end where the recipe ends. */
export function camPlanChoreography(scene: CameraSceneLayer[], rig: CameraRigFrame, recipe: CameraChoreography, opts: CameraPlanOptions): CameraPlan {
  var plan: CameraPlan = { beats: [], subjects: [], main: -1, background: -1, hidden: 0, depth: 0, focus: [], warnings: [] };
  var background = camBackground(scene, rig), max = opts.maxSubjects > 0 ? Math.min(opts.maxSubjects, 6) : recipe.maxSubjects;
  var order = !opts.order || opts.order === "auto" ? recipe.order || "back-to-front" : opts.order;
  var subjects = camPickSubjects(scene, rig, background, order, max), main = camPickSubjects(scene, rig, background, "back-to-front", 1)[0];
  plan.background = background; plan.subjects = subjects; plan.main = typeof main === "number" ? main : -1;
  if (plan.main < 0) { plan.warnings.push("no-subject"); return plan; }
  var units = 0, i, k, steps = recipe.steps, home: CameraVec3 = [rig.cx, rig.cy, rig.pz];
  // 2500 = CAMERA_DEEP_START_PX, spelled out: this function is serialized into the host on its own.
  var depth = typeof opts.depth === "number" && opts.depth >= 0 ? opts.depth : 2500;
  for (i = 0; i < steps.length; i++) {
    var st = steps[i] as CameraChoreographyStep, n = st.to === "subjects" ? subjects.length : 1;
    units += n * (st.move + st.hold);
  }
  var scale = opts.duration / Math.max(0.001, units), t = opts.start, flip = 1;
  var mainLayer = scene[plan.main] as CameraSceneLayer;
  for (i = 0; i < steps.length; i++) {
    var step = steps[i] as CameraChoreographyStep, list = step.to === "subjects" ? subjects : [plan.main];
    for (k = 0; k < list.length; k++) {
      var beat = camPlanBeat(scene, rig, step, list[k] as number, background, mainLayer, home, flip, plan, depth);
      if (!beat) { t += (step.move + step.hold) * scale; continue; }
      beat.start = t;
      beat.dur = step.cut ? opts.frame : Math.max(opts.frame, step.move * scale);
      plan.beats.push(beat);
      t += (step.move + step.hold) * scale;
      if (step.alt) flip = -flip;
    }
  }
  if (opts.focus !== false && plan.beats.length) {
    plan.focus = camPlanFocus(scene, rig, plan, opts);
    // The racks own the focus now: the visits only move the camera.
    if (plan.focus.length) for (i = 0; i < plan.beats.length; i++) (plan.beats[i] as CameraBeat).vis[8] = 1;
  }
  return plan;
}

/** One beat of a step: its target, distance, orbit, arc, lens, impact, creep and focus. */
export function camPlanBeat(scene: CameraSceneLayer[], rig: CameraRigFrame, step: CameraChoreographyStep, index: number, background: number,
  mainLayer: CameraSceneLayer, home: CameraVec3, flip: number, plan: CameraPlan, depth: number): CameraBeat | null {
  var orb: [number, number] = step.orb ? [step.orb[0] * flip, step.orb[1]] : [0, 0], arc: CameraVec3 = step.arc ? [step.arc[0] * flip, step.arc[1], step.arc[2]] : [0, 0, 0];
  var target: CameraVec3 = home, dist = rig.dist, role = "home", layerId = -1, focus: CameraVec3 = mainLayer.c, lens = 1, creep = 0;
  if (step.to === "deep") {
    var start = camDeepStart(scene, rig, background, depth);
    if (!start) { plan.warnings.push("no-deep-start"); return null; }
    target = [start[0] as number, start[1] as number, start[2] as number]; dist = start[3] as number; lens = start[5] as number; role = "deep";
    plan.hidden = Math.max(plan.hidden, start[4] as number);
    plan.depth = Math.round(target[2] - dist - (rig.pz - rig.dist));
    if (Math.abs(plan.depth - depth) > Math.max(50, 0.05 * depth)) plan.warnings.push("depth-adjusted");
    orb = [0, 0];
    focus = target;
  } else if (step.to === "through") {
    // Past the main subject: it sweeps across the lens like a wipe and the frame
    // lands on the background, the lens widened so it is never magnified past 2.2x.
    var back: CameraVec3 = background >= 0 ? (scene[background] as CameraSceneLayer).c : home;
    var refBack = Math.max(1, back[2] - (rig.pz - rig.dist));
    target = back; dist = Math.max(0.04 * rig.zoom, back[2] - (mainLayer.c[2] + 0.06 * rig.zoom)); role = "deep";
    lens = Math.min(1, 2.2 * dist / refBack);
    focus = target;
  } else if (step.to === "deep-left" || step.to === "deep-right") {
    var side = step.to === "deep-left" ? -1 : 1;
    var deep = camDeepPose(scene, rig, background, plan.main, side, orb);
    if (!deep) { plan.warnings.push("no-deep-start"); return null; }
    target = [deep[0] as number, deep[1] as number, deep[2] as number]; dist = deep[3] as number; role = "deep";
    if (side) orb = [-side * (deep[5] as number), orb[1]];
    plan.hidden = Math.max(plan.hidden, deep[4] as number);
    focus = step.focus === "target" ? target : mainLayer.c;
  } else if (step.to === "subjects" || step.to === "main") {
    var layer = scene[index] as CameraSceneLayer;
    role = step.to === "main" ? "main" : "subject"; layerId = layer.id;
    // Text is read flat: a light orbit and some margin, so the line never clips.
    if (layer.kind === "text") orb = [orb[0] * 0.35, orb[1] * 0.35];
    var framed = camReframe(scene, rig, index, camFrameDistance(scene, rig, index, background, step.fill || (layer.kind === "text" ? 0.82 : 0.72), orb), orb);
    target = [framed[0] as number, framed[1] as number, framed[2] as number]; dist = framed[3] as number;
    orb = [orb[0] * (framed[4] as number), orb[1] * (framed[4] as number)];
    focus = step.focus === "main" ? mainLayer.c : layer.c;
    creep = step.creep || 0;
  } else {
    orb = [0, 0];
  }
  var imp: [number, number, number, number, number] = step.imp ? [step.imp[0], step.imp[1], step.imp[2], step.imp[3], step.imp[4]] : [0, 0.2, 0, 1.2, 4];
  // Text is read level: a roll would also tilt the background away from the frame edges.
  var roll = layerId >= 0 && (scene[index] as CameraSceneLayer).kind === "text" ? 0 : (step.roll || 0) * flip;
  return { start: 0, dur: 0, curve: step.curve, tr: arc, rot: [0, 0, roll], orb: orb, lens: lens, imp: imp,
    vis: [target[0], target[1], target[2], dist, focus[0], focus[1], focus[2], step.cut ? 1 : 0, 0, creep], role: role, layer: layerId };
}

/** Planner functions serialized into the host, in declaration order (not into expressions). */
export const CAMERA_PLANNER_FUNCTIONS = ["camRefDistance", "camImportance", "camBackground", "camPickSubjects", "camScreenAtRest", "camOrderKey",
  "camVisitPose", "camScreenBox", "camOverlap", "camBlockScore", "camFrameDistance", "camVisibleFraction", "camReframe", "camPoseClear", "camDeepPose",
  "camDeepStart", "camFocusScore", "camPlanFocus", "camPlanChoreography", "camPlanBeat"] as const;

/* ------------------------------------------------------------- catalog */

function choreography(id: string, pt: string, en: string, ptDescription: string, enDescription: string, durationSeconds: number,
  maxSubjects: number, steps: CameraChoreographyStep[], order?: string): CameraChoreography {
  const recipe: CameraChoreography = { schemaVersion: 1, id, version: 2, name: { "pt-BR": pt, "en-US": en },
    description: { "pt-BR": ptDescription, "en-US": enDescription }, durationSeconds, maxSubjects, steps };
  if (order) recipe.order = order;
  return recipe;
}

/** A zoom that lands with a small push past the framing and settles (5%). */
const PUNCH: [number, number, number, number, number] = [0, 0.5, 0.05, 1.2, 5];
/** A snappier one for quick hops (7%). */
const SNAP: [number, number, number, number, number] = [0, 0.55, 0.07, 1.5, 6];

/** Original Moti.on choreographies, built from the user's camera study (§0.8). */
export const CAMERA_CHOREOGRAPHIES: readonly CameraChoreography[] = [
  choreography("deep-reveal", "Revelação em profundidade", "Deep Reveal",
    "A câmera começa 2500 px para dentro, junto do fundo, e volta à posição original atravessando as camadas, que aparecem uma a uma. Depois dá um zoom com impacto no protagonista e fecha no layout.",
    "The camera starts 2500 px into the scene, by the background, and pulls back to where it was through the layers as they appear one by one. Then it punches in on the hero and closes on the layout.",
    10, 1, [
      { to: "deep", move: 0, hold: 0.7, curve: "silk", cut: 1, focus: "main" },
      { to: "home", move: 3.6, hold: 0.3, curve: "glide", arc: [0, 0.03, 0], focus: "main" },
      { to: "main", move: 1.0, hold: 1.5, curve: "impact", imp: PUNCH, fill: 0.78, orb: [6, -2], creep: 0.035, focus: "target" },
      { to: "home", move: 1.3, hold: 0.4, curve: "silk", focus: "main" }
    ]),
  choreography("layer-tour", "Tour pelas camadas", "Layer Tour",
    "Pula de camada em camada com zoom de impacto, órbita alternada e o foco chegando antes da câmera. Nunca para: em cada camada a câmera continua avançando devagar.",
    "Hops from layer to layer with punchy zooms, alternating orbits and the focus landing before the camera. It never stops: on each layer the camera keeps creeping in.",
    10, 3, [
      { to: "home", move: 0, hold: 0.3, curve: "silk", focus: "main" },
      { to: "subjects", move: 0.7, hold: 0.9, curve: "impact", imp: PUNCH, orb: [8, -3], alt: 1, roll: 1.5, arc: [0.06, 0, 0], creep: 0.035, focus: "target" },
      { to: "home", move: 1.2, hold: 0.5, curve: "silk", focus: "main" }
    ]),
  choreography("full-sequence", "Sequência completa", "Full Sequence",
    "Abertura lá de trás (2500 px para dentro), revelação atravessando as camadas, zooms rápidos nos destaques e fechamento no layout: a coreografia inteira.",
    "Opens deep (2500 px into the scene), reveals through the layers, quick zooms on the highlights and closes on the layout: the whole choreography.",
    16, 3, [
      { to: "deep", move: 0, hold: 0.5, curve: "silk", cut: 1, focus: "main" },
      { to: "home", move: 3.2, hold: 0.2, curve: "glide", arc: [0, 0.03, 0], focus: "main" },
      { to: "subjects", move: 0.7, hold: 0.9, curve: "impact", imp: PUNCH, orb: [9, -3], alt: 1, roll: 1.5, arc: [0.05, 0, 0], creep: 0.035, focus: "target" },
      { to: "home", move: 1.1, hold: 0.5, curve: "silk", focus: "main" }
    ]),
  choreography("quick-zooms", "Zooms rápidos", "Quick Zooms",
    "Dinâmico: de um canto ao outro, um zoom rápido em cada destaque com estalo na chegada e roll alternado, e o foco acompanhando. Termina no layout.",
    "Dynamic: corner to corner, a quick zoom on each highlight that snaps on arrival with an alternating roll, the focus following. Ends on the layout.",
    8, 4, [
      { to: "home", move: 0, hold: 0.25, curve: "silk", focus: "main" },
      { to: "subjects", move: 0.5, hold: 0.75, curve: "impact", imp: SNAP, fill: 0.84, orb: [7, -2], alt: 1, roll: 2.5, arc: [0.04, 0.02, 0], creep: 0.05, focus: "target" },
      { to: "home", move: 0.7, hold: 0.45, curve: "expo-in-out", focus: "main" }
    ], "spread"),
  choreography("between-layers", "Travelling entre camadas", "Between the Layers",
    "A câmera atravessa a cena de lado por dentro das camadas, com a frente passando rente à lente, e sai para o layout.",
    "The camera tracks sideways inside the layer stack, with the front planes sweeping past the lens, then pulls out to the layout.",
    10, 1, [
      { to: "deep-left", move: 0, hold: 0.4, curve: "silk", cut: 1, orb: [12, 0], focus: "main" },
      { to: "deep-right", move: 4.4, hold: 0.4, curve: "sine-in-out", orb: [-12, 0], arc: [0, -0.03, 0], focus: "main" },
      { to: "home", move: 2.2, hold: 1.0, curve: "silk", focus: "main" }
    ]),
  choreography("hero-orbit", "Órbita do protagonista", "Hero Orbit",
    "Aproxima do protagonista, contorna em arco lento com o foco nele e o fundo desfocado, e volta ao layout.",
    "Moves in on the hero, circles it in a slow arc with the focus on it and the background soft, then returns to the layout.",
    9, 1, [
      { to: "home", move: 0, hold: 0.5, curve: "silk", focus: "main" },
      { to: "main", move: 1.8, hold: 0.3, curve: "silk", fill: 0.72, orb: [-14, 3], focus: "target" },
      { to: "main", move: 3.0, hold: 0.2, curve: "sine-in-out", fill: 0.72, orb: [14, -2], focus: "target" },
      { to: "home", move: 1.8, hold: 0.6, curve: "silk", focus: "main" }
    ]),
  choreography("dive-in", "Mergulho na cena", "Dive In",
    "Avança no protagonista, atravessa a camada dele como uma cortina e termina limpo no fundo: ótima saída ou transição para a próxima cena.",
    "Pushes in on the hero, flies through its layer like a wipe and lands clean on the background: a strong exit or a transition to the next scene.",
    6, 1, [
      // A short hold on the background after the wipe: it is a way out, not a frame to look at.
      { to: "home", move: 0, hold: 0.4, curve: "silk", focus: "main" },
      { to: "main", move: 1.2, hold: 0.5, curve: "impact", imp: PUNCH, fill: 0.7, creep: 0.04, focus: "target" },
      { to: "through", move: 2.2, hold: 0.3, curve: "expo-in-out", focus: "target" }
    ])
];

const STEP_TARGETS: readonly string[] = ["home", "deep", "deep-left", "deep-right", "through", "subjects", "main"];
/** Visiting orders the planner knows; "auto" takes the recipe's own. */
export const CAMERA_ORDERS: readonly string[] = ["auto", "back-to-front", "front-to-back", "reading", "spread"];
const finiteIn = (v: unknown, min: number, max: number): boolean => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const validImp = (v: unknown): boolean => Array.isArray(v) && v.length === 5 && finiteIn(v[0], 0, 0.5) && finiteIn(v[1], 0.02, 0.8) &&
  finiteIn(v[2], 0, 0.3) && finiteIn(v[3], 0, 20) && finiteIn(v[4], 0, 20);

/** Same limits the host checks before trusting a choreography. */
export function isCameraChoreography(value: unknown): value is CameraChoreography {
  const c = value as CameraChoreography;
  if (!c || c.schemaVersion !== 1 || typeof c.id !== "string" || !/^[a-z][a-z-]{2,40}$/.test(c.id) || c.id.startsWith("camera-")) return false;
  if (!finiteIn(c.durationSeconds, 2, 60) || !finiteIn(c.maxSubjects, 1, 6) || !Array.isArray(c.steps) || !c.steps.length || c.steps.length > 12) return false;
  if (c.order !== undefined && (c.order === "auto" || !CAMERA_ORDERS.includes(c.order))) return false;
  return c.steps.every((s, i) => STEP_TARGETS.includes(s.to) && finiteIn(s.move, 0, 20) && finiteIn(s.hold, 0, 20) && typeof s.curve === "string" &&
    (s.cut === undefined || (i === 0 && s.cut === 1)) && (s.fill === undefined || finiteIn(s.fill, 0.15, 1.2)) &&
    (s.roll === undefined || finiteIn(s.roll, -15, 15)) && (s.creep === undefined || finiteIn(s.creep, 0, 0.2)) &&
    (s.imp === undefined || validImp(s.imp)) && (s.focus === "target" || s.focus === "main"));
}

export function cameraChoreography(id: string): CameraChoreography | undefined {
  return CAMERA_CHOREOGRAPHIES.find((c) => c.id === id);
}
