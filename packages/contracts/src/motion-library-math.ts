/* eslint-disable no-var -- Serialized verbatim into the ES3 Adobe host. */
/** These functions are also serialized into the ES3 host and its expressions.
 * Keep them self-contained, deterministic, and written with var/function. */
export function libraryEase(t: number, kind: string, elasticity?: number): number {
  var x = Math.max(0, Math.min(1, t));
  if (x === 0 || x === 1) return x;
  if (kind === "silk") return x * x * x * (10 + x * (-15 + 6 * x));
  if (kind === "glide" || kind === "spring") {
    // Integral of a beta(2,4) velocity profile: zero velocity at both ends.
    var glide = x * x * (10 + x * (-20 + x * (15 - 4 * x)));
    if (kind === "glide") return glide;
    var elastic = Math.max(0, Math.min(100, typeof elasticity === "number" ? elasticity : 30)) / 100;
    var frequency = 6 + elastic * 6;
    var response = 1 - Math.exp(-6 * x) * (Math.cos(frequency * x) + 6 / frequency * Math.sin(frequency * x));
    // Fade the oscillator residual smoothly before the endpoint; no hard snap.
    var tail = Math.max(0, Math.min(1, (x - .75) / .25));
    var settle = 1 - tail * tail * tail * (10 + tail * (-15 + 6 * tail));
    return glide + (response - glide) * elastic * settle;
  }
  if (kind === "cubic") return x * x * x;
  if (kind === "overshoot") { var q = x - 1; return 1 + 2.70158 * q * q * q + 1.70158 * q * q; }
  if (kind === "bounce") {
    if (x < 1 / 2.75) return 7.5625 * x * x;
    if (x < 2 / 2.75) { x -= 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
    if (x < 2.5 / 2.75) { x -= 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
    x -= 2.625 / 2.75; return 7.5625 * x * x + 0.984375;
  }
  if (kind === "flicker") return Math.max(0, Math.min(1, Math.floor(x * 12) / 12 + Math.sin(Math.floor(x * 24) * 17) * (1 - x) * 0.22));
  if (kind === "velvet" || kind === "drift") {
    // Cubic Bézier ease-out, (.16,1,.3,1) and (.22,1,.36,1): a confident start
    // and a long, monotonic settle that never overshoots. y(t) = 1-(1-t)^3.
    var x1 = kind === "velvet" ? .16 : .22, x2 = kind === "velvet" ? .3 : .36, t = x, i, cx = 1, dx;
    for (i = 0; i < 8 && Math.abs(cx) > 1e-7; i++) {
      cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - x;
      dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      t = Math.max(0, Math.min(1, t - cx / dx));
    }
    if (Math.abs(cx) > 1e-6) {
      var lo = 0, hi = 1;
      for (i = 0; i < 40; i++) { t = (lo + hi) / 2; if (3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t < x) lo = t; else hi = t; }
    }
    return 1 - Math.pow(1 - t, 3);
  }
  if (kind === "snap") {
    // Critically damped arrival: zero start velocity, a decisive attack and a
    // settle without any overshoot, normalized to land exactly on 1.
    var k = 9;
    return (1 - (1 + k * x) * Math.exp(-k * x)) / (1 - (1 + k) * Math.exp(-k));
  }
  return 1 - Math.pow(1 - x, 3);
}

/** Signature effect envelopes, shared verbatim by the preview and AE expressions.
 * progress runs from 0 (hidden) to 1 (at rest) and weight is the eased offset
 * from 1 to 0. Every transition envelope is exactly 0 at rest, so the settled
 * text is unaltered. "peak" flares while a unit is half revealed, wherever the
 * curve places that moment; "arc" rises and falls with progress for a light that
 * travels across the whole reveal; "tail" fades faster than the weight;
 * "velocity" is the normalized speed of the eased curve, for blur proportional
 * to motion. */
export function librarySignatureEnvelope(kind: string, progress: number, weight: number, velocity: number): number {
  var p = Math.max(0, Math.min(1, progress)), w = Math.max(0, Math.min(1, weight));
  if (p >= 1) return 0;
  if (kind === "peak") return 4 * w * (1 - w);
  if (kind === "arc") return Math.sin(Math.PI * p);
  if (kind === "tail") return w * w;
  if (kind === "velocity") return Math.max(0, Math.min(1, velocity));
  return w;
}

/** Normalized speed of an eased transition at progress t; 1 saturates at 2.5×
 * the linear rate. ease is libraryEase, passed in so the function stays
 * self-contained when serialized into an expression. */
export function librarySignatureVelocity(t: number, kind: string, elasticity: number, ease: (t: number, kind: string, elasticity?: number) => number): number {
  var x = Math.max(0, Math.min(1, t)), h = .01;
  if (x >= 1) return 0;
  var a = ease(Math.max(0, x - h), kind, elasticity), b = ease(Math.min(1, x + h), kind, elasticity);
  return Math.max(0, Math.min(1, Math.abs(b - a) / (Math.min(1, x + h) - Math.max(0, x - h)) / 2.5));
}

/** Deterministic Character Offset for Signature reveals; 0 once a unit settles.
 * A resolve cycles fourteen glyphs per unit of progress and locks at 72 %,
 * leaving the last stretch of motion on the true character. A roll counts
 * twelve glyphs down with the eased weight and lands exactly on the source. */
export function librarySignatureGlyph(kind: string, progress: number, weight: number, index: number, seed: number): number {
  var p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return 0;
  if (kind === "roll") return Math.ceil(Math.max(0, Math.min(1, weight)) * 12);
  if (p >= .72) return 0;
  var h = Math.sin((Math.floor(p * 14) + 1) * 12.9898 + (index + 1) * 78.233 + seed * 3.17) * 43758.5453;
  h -= Math.floor(h);
  return 1 + Math.floor(h * 25);
}

export function libraryTiming(time: number, start: number, end: number, duration: number,
  phase: string, index: number, count: number, stagger: number): [number, number] {
  var d = Math.max(0.0001, Math.min(duration, (end - start) / (phase === "both" ? 2 : 1)));
  var delay = Math.min(Math.max(0, stagger) * Math.max(0, count - 1), d * 0.7);
  var offset = count > 1 ? delay * Math.max(0, Math.min(count - 1, index)) / (count - 1) : 0;
  var move = Math.max(0.0001, d - delay);
  return [phase === "out" ? 1 : (time - start - offset) / move,
    phase === "in" ? 1 : (end - time - offset) / move];
}

export function libraryWave(time: number, axis: number, kind: string, seed: number): number {
  var p = axis * 1.618 + seed * 0.37;
  if (kind === "cosine") return Math.cos(time * Math.PI * 2 + p);
  if (kind === "abs-cosine") return axis === 1 ? -Math.abs(Math.cos(time * Math.PI * 2 + p)) : Math.sin(time * Math.PI * 2 + p);
  if (kind === "orbit") return axis === 0 ? Math.sin(time * Math.PI * 2) : Math.cos(time * Math.PI * 2);
  if (kind === "wiggle") return (Math.sin(time * 7.1 + p) + Math.sin(time * 13.7 + p * 2.1) * 0.5 + Math.sin(time * 23.3 + p * 3.7) * 0.25) / 1.75;
  return 0;
}

export function libraryDirection(x: number, y: number, direction: string): [number, number] {
  if (direction === "preset") return [x, y];
  var base = Math.PI / 2;
  if (Math.abs(x) > Math.abs(y)) { base = 0; if (x < 0) base = Math.PI; }
  else if (y < 0) base = -Math.PI / 2;
  var angle = Math.PI / 2;
  if (direction === "left") angle = Math.PI;
  if (direction === "right") angle = 0;
  if (direction === "top") angle = -Math.PI / 2;
  angle -= base;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

/** Deterministic permutation; coprime stride never gives two units one slot. */
export function libraryOrder(index: number, count: number, seed?: number): number {
  if (count < 2) return 0;
  var stride = Math.max(1, Math.floor(count * .618));
  var a: number, b: number, temp: number;
  while (true) {
    a = stride; b = count;
    while (b) { temp = a % b; a = b; b = temp; }
    if (a === 1) break;
    stride++;
  }
  var shift = typeof seed === "number" ? Math.abs(Math.floor(seed)) : 3;
  return (index * stride + shift) % count;
}

/** Original geometric choreography, shared verbatim by preview and AE expressions.
 * Position is in authored nominal pixels; rotation and scale are offset weights.
 * The raw unit index controls distribution independently of its timing order.
 * Direction rotates the entire path around the authored axis, never its tangent. */
export function libraryChoreography(progress: number, weight: number, x: number, y: number, z: number,
  path: string, distribution: string, index: number, seed: number, turns: number,
  direction?: string): [number, number, number, number, number, number] {
  var t = Math.max(0, Math.min(1, progress)), w = weight;
  if (t === 1 && Math.abs(w) < .0000001) return [0, 0, 0, 0, 0, 0];
  var baseX = x, baseY = y, sign = 1, radius = 1, angle = 0;
  var n = Math.max(-3, Math.min(3, turns));
  if (distribution === "alternate") sign = index % 2 ? -1 : 1;
  if (distribution === "scatter") {
    var hash = Math.sin((index + 1) * 127.1 + seed * 31.7) * 43758.5453;
    hash -= Math.floor(hash);
    angle = hash * Math.PI * 2;
    radius = .65 + hash * .7;
    sign = hash < .5 ? -1 : 1;
  }
  var px = (x * Math.cos(angle) - y * Math.sin(angle)) * radius;
  var py = (x * Math.sin(angle) + y * Math.cos(angle)) * radius;
  if (distribution === "alternate") { px *= sign; py *= sign; }
  var rotation = w * sign, sx = w, sy = w;
  if (path === "arc") {
    var bend = Math.sin(Math.PI * t) * Math.abs(w) * .85 * n;
    x = px * w - py * bend; y = py * w + px * bend;
  } else if (path === "spiral") {
    angle = Math.PI * 2 * n * t;
    x = (px * Math.cos(angle) - py * Math.sin(angle)) * w;
    y = (px * Math.sin(angle) + py * Math.cos(angle)) * w;
  } else if (path === "rebound") {
    var pulse = Math.sin(Math.PI * t) * Math.sin(Math.PI * 3 * t) * (1 - t);
    var bounce = w + pulse * .5;
    x = px * bounce; y = py * bounce;
    rotation = bounce * sign; sx = w + pulse * 1.8; sy = w - pulse * 1.8;
  } else if (path === "swing") {
    angle = Math.sin(Math.PI * 2 * t * n) * (1 - t) * .9;
    x = (px * Math.cos(angle) - py * Math.sin(angle)) * w;
    y = (px * Math.sin(angle) + py * Math.cos(angle)) * w;
    rotation = w * Math.cos(Math.PI * t * n) * sign;
  } else { x = px * w; y = py * w; }
  if (direction && direction !== "preset") {
    var base = Math.PI / 2;
    if (Math.abs(baseX) > Math.abs(baseY)) base = baseX < 0 ? Math.PI : 0;
    else if (baseY < 0) base = -Math.PI / 2;
    angle = (direction === "left" ? Math.PI : direction === "right" ? 0 : direction === "top" ? -Math.PI / 2 : Math.PI / 2) - base;
    px = x * Math.cos(angle) - y * Math.sin(angle);
    y = x * Math.sin(angle) + y * Math.cos(angle); x = px;
  }
  return [x, y, z * w * radius, rotation, sx, sy];
}

/** Studio timing preserves >=55% of the interval for each unit's movement. */
export function libraryStudioTiming(time: number, start: number, end: number, duration: number,
  phase: string, index: number, count: number, stagger: number, overlap: number): [number, number] {
  var d = Math.max(.0001, Math.min(duration, (end - start) / (phase === "both" ? 2 : 1)));
  var ratio = 1 - Math.max(0, Math.min(100, overlap)) / 100;
  var delay = Math.min(Math.max(0, stagger) * Math.max(0, count - 1) * ratio, d * .45);
  var offset = count > 1 ? delay * Math.max(0, Math.min(count - 1, index)) / (count - 1) : 0;
  var move = Math.max(.0001, d - delay);
  return [phase === "out" ? 1 : (time - start - offset) / move,
    phase === "in" ? 1 : (end - time - offset) / move];
}

/** Impact camera shake around CUT, shared verbatim by the preview and AE expressions.
 * age is seconds from CUT; weight is the transition window (0 at both edges, 1 at
 * CUT); span is half the window and frame one frame, in seconds; amount is
 * intensity/100. Every term is multiplied by weight, so both edges are an exact
 * identity. The kick rises into CUT, peaks exactly there and settles as a damped
 * spring. Scale carries a smooth overscan from the motion bounds that keeps all
 * four frame corners covered, including the soft edge a Gaussian blur applied
 * before the Transform leaves (Wave Warp pins all edges and needs none); that
 * overscan doubles as the punch, which only adds where it exceeds it. Frequencies near the frame rate's Nyquist limit are faded
 * out so the texture never strobes at 24 fps. Returns [x px, y px, rotation °, scale %, blur px, exposure EV, glow intensity,
 * wave height px, wave phase °]. */
export function cameraImpactSample(age: number, weight: number, span: number, frame: number, amount: number, seed: number,
  width: number, height: number, c: { hit: string; attack: number; angle: number; travel: number; roll: number;
    frequency: number; damping: number; texture: number; punch: number; zoom: number; blur: number;
    exposure: number; glow: number; wave: number }): number[] {
  var tau = Math.PI * 2, w = Math.max(0, Math.min(1, weight)), a = Math.max(0, Math.min(3, amount));
  var half = Math.max(.0001, span), hz = Math.max(.05, c.frequency), damping = Math.max(0, c.damping);
  var attack = Math.max(1.5, c.attack), texture = Math.max(0, Math.min(1, c.texture / 100));
  var beat = .42 * half, sway = c.hit === "sway", twice = c.hit === "double";
  var nyquist = .5 / Math.max(.001, frame), spring = Math.min(hz, nyquist * .6);
  /* Rise into a strike over `rise` seconds, then decay; f > 0 adds the spring. */
  function strike(t: number, rise: number, power: number, decay: number, f: number): number {
    if (t < 0) { var x = 1 + t / rise; return x <= 0 ? 0 : Math.pow(x, power); }
    return Math.exp(-decay * t) * (f > 0 ? Math.cos(tau * f * t) : 1);
  }
  /* The main strike lands on CUT; a double hit adds a softer pre-beat. */
  function pulse(power: number, decay: number, f: number): number {
    var v = strike(age, half, power, decay, f);
    if (twice) v += .8 * strike(age + beat, beat * .9, power, decay, f);
    return v * w;
  }
  /* Harmonic gain: full below half of Nyquist, zero from 90% of it. */
  function band(f: number): number { return Math.max(0, Math.min(1, (nyquist * .9 - f) / (nyquist * .4))); }
  var g1 = band(hz * .71), g2 = .5 * band(hz * 1.37), g3 = .25 * band(hz * 2.53);
  /* Zero-mean seeded texture; |grain| <= 1. */
  function grain(phase: number): number {
    var t = age * hz, p = phase + seed * .37;
    return (g1 * Math.sin(tau * .71 * t + p) + g2 * Math.sin(tau * 1.37 * t + p * 2.1) + g3 * Math.sin(tau * 2.53 * t + p * 3.7)) / 1.75;
  }
  var angle = c.angle * Math.PI / 180, ax = Math.cos(angle), ay = Math.sin(angle);
  var bound = sway ? 0 : pulse(attack, damping, 0);
  var kick = sway ? 0 : pulse(attack, damping, spring), spin = sway ? 0 : pulse(attack, damping, spring * .83);
  var lingering = sway ? w : age < 0 ? w * w : Math.exp(-damping * .5 * age) * w;
  var grainBound = texture * lingering * Math.max(0, 1 - .5 * bound);
  var x = a * c.travel * (ax * kick + grainBound * grain(0));
  var y = a * c.travel * (ay * kick + grainBound * .75 * grain(1.618));
  var rotation = a * c.roll * (spin + grainBound * grain(3.236));
  var waveWeight = age < 0 ? w * w * w : Math.exp(-damping * .35 * age) * w;
  var wave = a * c.wave * waveWeight, blur = a * Math.max(0, c.blur) * pulse(attack, damping, 0);
  /* Conservative corner coverage from motion bounds, never from the jittering value.
   * The gap pushes the blur's translucent edge (about three blur radii) out of frame. */
  var hw = Math.max(1, width / 2), hh = Math.max(1, height / 2), gap = Math.min(3 * blur, Math.min(hw, hh) * .5);
  var dx = a * Math.abs(c.travel) * (Math.abs(ax) * bound + grainBound);
  var dy = a * Math.abs(c.travel) * (Math.abs(ay) * bound + .75 * grainBound);
  var turn = Math.min(Math.PI / 2, a * Math.abs(c.roll) * (bound + grainBound) * Math.PI / 180), sn = Math.sin(turn);
  var cover = Math.max((hw + dx + sn * (hh + dy)) / (hw - gap), (hh + dy + sn * (hw + dx)) / (hh - gap));
  var punch = 1 + a * Math.max(0, c.punch) * pulse(attack + 1, damping * 1.2, 0) / 100;
  var scale = 100 * Math.max(cover, punch) * (1 + a * Math.max(0, c.zoom) * w / 100) * (1 + .002 * w * Math.min(1, a));
  var light = pulse(attack + 2, damping * .9, 0);
  return [x, y, rotation, scale, blur, a * c.exposure * light,
    a * c.glow * light, wave, age * hz * 180];
}

/** Center/edge groups animate symmetric pairs together. O(1) per text unit. */
export function librarySequence(index: number, count: number, kind: string): number {
  if (count <= 1) return 0;
  if (kind === "reverse") return count - 1 - index;
  if (kind === "center-out" || kind === "edges-in") {
    if (count === 2) return 0;
    var center = (count - 1) / 2;
    var minimum = count % 2 ? 0 : .5;
    var rank = (Math.abs(index - center) - minimum) / (center - minimum) * (count - 1);
    return kind === "center-out" ? rank : count - 1 - rank;
  }
  return index;
}
