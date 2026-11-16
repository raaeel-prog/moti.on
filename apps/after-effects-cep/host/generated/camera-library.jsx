(function(global) {
function libraryEase(t, kind, elasticity, settleAmount, settleCount, settleDamping, exit) {
  var x = Math.max(0, Math.min(1, t));
  if (x === 0 || x === 1) return x;
  if (kind === "settle-wave" || kind === "settle-hop") {
    var wave = kind === "settle-wave";
    var amount = Math.max(0, Math.min(100, typeof settleAmount === "number" ? settleAmount : wave ? 35 : 40)) / 100;
    var count = Math.max(0.5, Math.min(8, typeof settleCount === "number" ? settleCount : wave ? 2.5 : 3));
    var damping = Math.max(0, Math.min(100, typeof settleDamping === "number" ? settleDamping : wave ? 55 : 60)) / 100;
    if (exit) {
      var pull = 0.4 + amount * 3.2, back = x - 1;
      return 1 + (pull + 1) * back * back * back + pull * back * back;
    }
    var arrive = wave ? 0.3 : 0.34, span = 1 - arrive;
    if (wave) {
      var turn = 2 * Math.PI * count;
      var height = Math.min(amount * 0.6, 3 * span / (arrive * turn));
      if (x < arrive) {
        var a = x / arrive, m = height * turn / span * arrive;
        return -2 * a * a * a + 3 * a * a + (a * a * a - a * a) * m;
      }
      var tau = (x - arrive) / span, tail = Math.max(0, Math.min(1, (tau - 0.75) / 0.25));
      return 1 + height * Math.exp(-(1 + damping * 7) * tau) * Math.sin(turn * tau) * (1 - tail * tail * tail * (10 + tail * (-15 + 6 * tail)));
    }
    if (x < arrive) {
      var fall = x / arrive;
      return fall * fall;
    }
    var first = amount * 0.5, keep = Math.max(0.05, 1 - damping), hops = Math.max(1, Math.min(8, Math.round(count)));
    if (first <= 0) return 1;
    var total = 0, h = 1, hop;
    for (hop = 0; hop < hops; hop++) {
      total += Math.sqrt(h);
      h *= keep;
    }
    var clock = (x - arrive) / span * total, lift = first, length;
    for (hop = 0; hop < hops; hop++) {
      length = Math.sqrt(Math.pow(keep, hop));
      if (clock <= length) {
        var p = clock / length;
        return 1 - lift * 4 * p * (1 - p);
      }
      clock -= length;
      lift *= keep;
    }
    return 1;
  }
  var dash = typeof kind === "string" ? kind.indexOf("-") : -1, family = dash > 0 ? kind.substring(0, dash) : "", shape = dash > 0 ? kind.substring(dash + 1) : "";
  if ((family === "sine" || family === "quad" || family === "quart" || family === "quint" || family === "expo" || family === "circ") && (shape === "in" || shape === "out" || shape === "in-out")) {
    var y = shape === "in" ? x : shape === "out" ? 1 - x : x < 0.5 ? 2 * x : 2 - 2 * x, f;
    if (family === "sine") f = 1 - Math.cos(y * Math.PI / 2);
    else if (family === "expo") f = (Math.pow(2, 10 * y) - 1) / 1023;
    else if (family === "circ") f = 1 - Math.sqrt(Math.max(0, 1 - y * y));
    else f = Math.pow(y, family === "quad" ? 2 : family === "quart" ? 4 : 5);
    return shape === "in" ? f : shape === "out" ? 1 - f : x < 0.5 ? f / 2 : 1 - f / 2;
  }
  if (kind === "silk") return x * x * x * (10 + x * (-15 + 6 * x));
  if (kind === "glide" || kind === "spring") {
    var glide = x * x * (10 + x * (-20 + x * (15 - 4 * x)));
    if (kind === "glide") return glide;
    var elastic = Math.max(0, Math.min(100, typeof elasticity === "number" ? elasticity : 30)) / 100;
    var frequency = 6 + elastic * 6;
    var response = 1 - Math.exp(-6 * x) * (Math.cos(frequency * x) + 6 / frequency * Math.sin(frequency * x));
    var tail = Math.max(0, Math.min(1, (x - 0.75) / 0.25));
    var settle = 1 - tail * tail * tail * (10 + tail * (-15 + 6 * tail));
    return glide + (response - glide) * elastic * settle;
  }
  if (kind === "cubic") return x * x * x;
  if (kind === "overshoot") {
    var q = x - 1;
    return 1 + 2.70158 * q * q * q + 1.70158 * q * q;
  }
  if (kind === "bounce") {
    if (x < 1 / 2.75) return 7.5625 * x * x;
    if (x < 2 / 2.75) {
      x -= 1.5 / 2.75;
      return 7.5625 * x * x + 0.75;
    }
    if (x < 2.5 / 2.75) {
      x -= 2.25 / 2.75;
      return 7.5625 * x * x + 0.9375;
    }
    x -= 2.625 / 2.75;
    return 7.5625 * x * x + 0.984375;
  }
  if (kind === "flicker") return Math.max(0, Math.min(1, Math.floor(x * 12) / 12 + Math.sin(Math.floor(x * 24) * 17) * (1 - x) * 0.22));
  if (kind === "velvet" || kind === "drift") {
    var x1 = kind === "velvet" ? 0.16 : 0.22, x2 = kind === "velvet" ? 0.3 : 0.36, t = x, i, cx = 1, dx;
    for (i = 0; i < 8 && Math.abs(cx) > 1e-7; i++) {
      cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - x;
      dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      t = Math.max(0, Math.min(1, t - cx / dx));
    }
    if (Math.abs(cx) > 1e-6) {
      var lo = 0, hi = 1;
      for (i = 0; i < 40; i++) {
        t = (lo + hi) / 2;
        if (3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t < x) lo = t;
        else hi = t;
      }
    }
    return 1 - Math.pow(1 - t, 3);
  }
  if (kind === "snap") {
    var snapRate = 9;
    return (1 - (1 + snapRate * x) * Math.exp(-snapRate * x)) / (1 - (1 + snapRate) * Math.exp(-snapRate));
  }
  return 1 - Math.pow(1 - x, 3);
}
function camSmooth(x) {
  var t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * t * (10 + t * (-15 + 6 * t));
}
function camSoftCap(x, lim) {
  if (!(lim > 0)) return x;
  var y = Math.abs(x) / lim, e = Math.exp(-2 * y), v = lim * (1 - e) / (1 + e);
  return x < 0 ? -v : v;
}
function camSettle(tau, ringing, damping) {
  if (tau <= 0) return 1;
  if (tau >= 1) return 0;
  var w = 2 * Math.PI * Math.max(0.1, ringing), k = Math.max(0, damping);
  var spring = Math.exp(-k * tau) * (Math.cos(w * tau) + k / w * Math.sin(w * tau));
  return spring * (1 - camSmooth((tau - 0.55) / 0.45));
}
function camImpact(u, imp) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  var antic = Math.max(0, Math.min(0.5, imp[0])), attack = Math.max(0.02, Math.min(0.8, imp[1]));
  var over = Math.max(0, Math.min(1, imp[2])), lead = antic > 0 ? attack * 0.8 : 0;
  if (lead + attack > 0.9) {
    var fit = 0.9 / (lead + attack);
    lead *= fit;
    attack *= fit;
  }
  if (lead > 0 && u < lead) {
    var s = Math.sin(Math.PI * u / lead);
    return -antic * s * s;
  }
  var hit = lead + attack;
  if (u < hit) return (1 + over) * camSmooth((u - lead) / attack);
  return 1 + over * camSettle((u - hit) / (1 - hit), imp[3], imp[4]);
}
function camPulse(u, imp) {
  if (u <= 0 || u >= 1) return 0;
  var attack = Math.max(0.02, Math.min(0.8, imp[1]));
  if (u < attack) return camSmooth(u / attack);
  return camSettle((u - attack) / (1 - attack), imp[3], imp[4]);
}
function camHash(x) {
  var s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function camHarmonic(t, period, seed, channel, base, count) {
  var p = Math.max(0.05, period), n0 = Math.max(1, Math.round(base)), c = Math.max(1, Math.min(6, Math.round(count)));
  var sum = 0, norm = 0, k, a;
  for (k = 0; k < c; k++) {
    a = 1 / (1 + k);
    sum += a * Math.sin(2 * Math.PI * ((n0 + k) * t / p + camHash(seed * 0.618 + channel * 1.37 + k * 0.29)));
    norm += a;
  }
  return sum / norm;
}
function camShotWeight(t, s, duration) {
  var dur = Math.max(1e-4, s.dur), u = (t - s.start) / dur;
  if (s.kind === "pulse") return camPulse(u, s.imp);
  if (s.kind === "visit") {
    if (s.vis && s.vis[7]) return t >= s.start ? 1 : 0;
    return s.curve === "impact" ? camImpact(u, s.imp) : libraryEase(u, s.curve);
  }
  if (s.kind === "loop") {
    if (t < s.start || t > s.start + dur) return 0;
    var ramp = Math.min(0.25, dur / 4), w = 1;
    if (s.start > 1e-6) w *= camSmooth((t - s.start) / ramp);
    if (s.start + dur < duration - 1e-6) w *= camSmooth((s.start + dur - t) / ramp);
    return w;
  }
  var e = s.curve === "impact" ? camImpact(u, s.imp) : libraryEase(u, s.curve);
  return s.dir === "from" ? 1 - e : s.dir === "through" ? e - 0.5 : e;
}
function camCoverKnee(s) {
  var k = 5e-4;
  if (s <= 1) return 1;
  if (s < 1 + 2 * k) return 1 + (s - 1) * (s - 1) / (4 * k);
  return s - k;
}
function camVisits(t, rig, shots) {
  var deg = Math.PI / 180, visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;
  var out = [rig.cx, rig.cy, rig.pz - rig.dist, 0, 0, 0, 1, 0, 0, 0], order = [], i, j, k, s, v, w, e, a, kind;
  var fd = rig.fd;
  out[7] = fd ? fd[0] : rig.cx;
  out[8] = fd ? fd[1] : rig.cy;
  out[9] = fd ? fd[2] : rig.pz;
  for (i = 0; i < shots.length; i++) {
    kind = shots[i].kind;
    if ((kind === "visit" || kind === "focus") && shots[i].vis) order.push(i);
  }
  for (i = 1; i < order.length; i++) {
    k = order[i];
    for (j = i - 1; j >= 0 && shots[order[j]].start > shots[k].start; j--) order[j + 1] = order[j];
    order[j + 1] = k;
  }
  for (i = 0; i < order.length; i++) {
    s = shots[order[i]];
    v = s.vis;
    a = Math.max(0, Math.min(1, s.amount));
    if (s.kind === "focus") {
      var wr = camSmooth((t - s.start) / Math.max(1e-4, s.dur)) * a;
      for (j = 0; j < 3; j++) out[7 + j] = out[7 + j] + wr * (v[4 + j] - out[7 + j]);
      continue;
    }
    e = camShotWeight(t, s, rig.duration);
    w = e * a;
    if (!(w > 0 || w < 0)) continue;
    var ap = s.orb[0] * deg, at = s.orb[1] * deg, d = Math.max(1, v[3]), creep = v[9] || 0, after = t - s.start - s.dur;
    if (creep > 0 && after > 0 && !v[7]) d *= 1 - camSoftCap(creep * (after < 0.35 ? after * after / 0.7 : after - 0.175), 0.15);
    var target = [
      v[0] - d * Math.sin(ap) * Math.cos(at),
      v[1] + d * Math.sin(at),
      v[2] - d * Math.cos(ap) * Math.cos(at),
      s.orb[0] + s.rot[0],
      s.orb[1] + s.rot[1],
      s.rot[2],
      s.lens > 0 ? s.lens : 1
    ];
    for (j = 0; j < 7; j++) out[j] = out[j] + w * (target[j] - out[j]);
    var arc = v[7] ? 0 : Math.sin(Math.PI * Math.max(0, Math.min(1, e))) * a;
    out[0] = out[0] + arc * s.tr[0] * visW;
    out[1] = out[1] + arc * s.tr[1] * visH;
    out[2] = out[2] + arc * s.tr[2] * rig.dist;
    if (v[8]) continue;
    var wf = v[7] ? w : camSmooth((t - s.start) / Math.max(1e-4, s.dur * 0.45)) * a;
    for (j = 0; j < 3; j++) out[7 + j] = out[7 + j] + wf * (v[4 + j] - out[7 + j]);
  }
  return out;
}
function camPose(t, rig, shots) {
  var deg = Math.PI / 180, i, c, s, w, a, dz;
  var tx = 0, ty = 0, tz = 0, pan = 0, tilt = 0, roll = 0, opan = 0, otilt = 0, lensLog = 0, dolly = 0;
  var visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;
  var vt = camVisits(t, rig, shots);
  for (i = 0; i < shots.length; i++) {
    s = shots[i];
    a = s.amount;
    if (s.kind === "visit" || s.kind === "focus" || !(a > 0 || a < 0)) continue;
    w = camShotWeight(t, s, rig.duration) * a;
    if (w === 0) continue;
    if (s.kind === "loop") {
      var age = t - s.start, per = s.org[0], seed = s.org[1], mix = Math.max(0, Math.min(1, s.org[3]));
      var tb = Math.max(4, Math.round(s.org[2] * per)), ch = [];
      for (c = 0; c < 6; c++) {
        ch.push(w * ((1 - mix) * camHarmonic(age, per, seed, c, 1, 3) + mix * camHarmonic(age, per, seed, c + 6, tb, 3)));
      }
      tx += s.tr[0] * visW * ch[0];
      ty += s.tr[1] * visH * ch[1];
      dz = s.tr[2] * rig.dist * ch[2];
      tz += dz;
      dolly += dz * s.dolly;
      pan += s.rot[0] * ch[3];
      tilt += s.rot[1] * ch[4];
      roll += s.rot[2] * ch[5];
      continue;
    }
    tx += s.tr[0] * visW * w;
    ty += s.tr[1] * visH * w;
    dz = s.tr[2] * rig.dist * w;
    tz += dz;
    dolly += dz * s.dolly;
    pan += s.rot[0] * w;
    tilt += s.rot[1] * w;
    roll += s.rot[2] * w;
    opan += s.orb[0] * w;
    otilt += s.orb[1] * w;
    if (s.lens > 0 && s.lens !== 1) lensLog += Math.log(s.lens) * w;
  }
  if (rig.near > 0 && tz > 0) {
    var limited = camSoftCap(tz, rig.near * (1 - 1 / Math.max(1.05, rig.growth)));
    dolly *= limited / tz;
    tz = limited;
  }
  otilt = camSoftCap(otilt, 80);
  tilt = camSoftCap(tilt + otilt, 80) - otilt;
  pan += vt[3];
  tilt += vt[4];
  roll += vt[5];
  lensLog += Math.log(Math.max(0.01, vt[6]));
  var op = opan * deg, ot = otilt * deg;
  var orbit = [Math.sin(op) * Math.cos(ot), -Math.sin(ot), Math.cos(op) * Math.cos(ot)];
  var cam = [
    vt[0] - rig.dist * orbit[0] + tx,
    vt[1] - rig.dist * orbit[1] + ty,
    vt[2] + rig.dist - rig.dist * orbit[2] + tz
  ];
  var p = (pan + opan) * deg, q = (tilt + otilt) * deg, rr = roll * deg;
  var fwd = [Math.sin(p) * Math.cos(q), -Math.sin(q), Math.cos(p) * Math.cos(q)];
  var r0 = [Math.cos(p), 0, -Math.sin(p)], d0 = [Math.sin(p) * Math.sin(q), Math.cos(q), Math.cos(p) * Math.sin(q)];
  var cr = Math.cos(rr), sr = Math.sin(rr);
  var right = [r0[0] * cr + d0[0] * sr, r0[1] * cr + d0[1] * sr, r0[2] * cr + d0[2] * sr];
  var down = [d0[0] * cr - r0[0] * sr, d0[1] * cr - r0[1] * sr, d0[2] * cr - r0[2] * sr];
  var lens = rig.zoom * Math.exp(lensLog) * Math.max(0.05, (rig.dist - dolly) / rig.dist);
  var cover = 1;
  if (rig.cover) {
    var m = rig.margin, hw = rig.width / 2, hh = rig.height / 2, bz = typeof rig.bz === "number" ? rig.bz : rig.pz;
    var kb = (rig.dist + bz - rig.pz) / rig.dist, need = 1, area = 0, j, corner;
    var xs = [rig.cx - (hw + Math.max(0, m[0])) * kb, rig.cx + (hw + Math.max(0, m[1])) * kb];
    var ys = [rig.cy - (hh + Math.max(0, m[2])) * kb, rig.cy + (hh + Math.max(0, m[3])) * kb];
    var qx = [], qy = [];
    for (j = 0; j < 4; j++) {
      var vx = xs[j === 1 || j === 2 ? 1 : 0] - cam[0], vy = ys[j >= 2 ? 1 : 0] - cam[1], vz = bz - cam[2];
      var depth = vx * fwd[0] + vy * fwd[1] + vz * fwd[2];
      if (!(depth > 1)) {
        need = 10;
        break;
      }
      qx.push(lens * (vx * right[0] + vy * right[1] + vz * right[2]) / depth);
      qy.push(lens * (vx * down[0] + vy * down[1] + vz * down[2]) / depth);
    }
    for (j = 0; need < 10 && j < 4; j++) area += qx[j] * qy[(j + 1) % 4] - qx[(j + 1) % 4] * qy[j];
    for (j = 0; need < 10 && j < 4; j++) {
      var ax = qx[j], ay = qy[j], ex = qx[(j + 1) % 4] - ax, ey = qy[(j + 1) % 4] - ay;
      var g0 = ey * ax - ex * ay;
      if (!(g0 * area > 0)) {
        need = 10;
        break;
      }
      for (corner = 0; corner < 4; corner++) {
        var b = ex * (corner >= 2 ? hh : -hh) - ey * (corner === 1 || corner === 2 ? hw : -hw);
        if (b * area < 0) need = Math.max(need, -b / g0);
      }
    }
    cover = camCoverKnee(Math.min(10, need));
  }
  return {
    c: cam,
    f: fwd,
    r: right,
    d: down,
    m: [cam[0] + rig.dist * fwd[0], cam[1] + rig.dist * fwd[1], cam[2] + rig.dist * fwd[2]],
    pan: pan + opan,
    tilt: tilt + otilt,
    roll: roll,
    zoom: lens * cover,
    lens: lens,
    cover: cover,
    dz: tz,
    fp: [vt[7], vt[8], vt[9]]
  };
}
function camOrientation(pose) {
  var deg = Math.PI / 180, p = pose.pan * deg, q = pose.tilt * deg;
  var sp = Math.sin(p), cp = Math.cos(p), sq = Math.sin(q), cq = Math.cos(q);
  return [Math.atan2(sq, cp * cq) / deg, Math.asin(Math.max(-1, Math.min(1, sp * cq))) / deg, Math.atan2(-sp * sq, cp) / deg];
}
function camProject(pose, point, centerX, centerY) {
  var v = [point[0] - pose.c[0], point[1] - pose.c[1], point[2] - pose.c[2]];
  var z = v[0] * pose.f[0] + v[1] * pose.f[1] + v[2] * pose.f[2];
  if (!(z > 1e-6)) return [centerX, centerY, 0];
  var k = pose.zoom / z;
  return [
    centerX + (v[0] * pose.r[0] + v[1] * pose.r[1] + v[2] * pose.r[2]) * k,
    centerY + (v[0] * pose.d[0] + v[1] * pose.d[1] + v[2] * pose.d[2]) * k,
    k
  ];
}
function camFocusDepth(cam, fwd, target, offset, minimum, fallback) {
  var d = (target[0] - cam[0]) * fwd[0] + (target[1] - cam[1]) * fwd[1] + (target[2] - cam[2]) * fwd[2] + offset;
  var lo = Math.max(1, minimum);
  if (!(d === d)) return fallback;
  if (d >= lo * 2) return d;
  if (d <= lo) return fallback;
  return fallback + (d - fallback) * camSmooth((d - lo) / lo);
}
function camRefDistance(layer, rig) {
  return Math.max(1, layer.c[2] - (rig.pz - rig.dist));
}
function camImportance(layer, rig) {
  var d = camRefDistance(layer, rig), w = rig.zoom * layer.hw / d, h = rig.zoom * layer.hh / d;
  var frame = rig.width * rig.height / 4;
  return Math.min(1, w * h / frame) * (layer.kind === "text" ? 1.6 : 1);
}
function camBackground(scene, rig) {
  var i, best = -1, far = -Infinity;
  for (i = 0; i < scene.length; i++) if (scene[i].bg) return i;
  for (i = 0; i < scene.length; i++) {
    var l = scene[i];
    if (camImportance(l, rig) >= 0.6 && l.kind !== "text" && l.c[2] > far) {
      far = l.c[2];
      best = i;
    }
  }
  return best;
}
function camPickSubjects(scene, rig, background, order, max) {
  var picked = [], i, j, k;
  for (i = 0; i < scene.length; i++) if (i !== background) picked.push(i);
  for (i = 1; i < picked.length; i++) {
    k = picked[i];
    for (j = i - 1; j >= 0 && camImportance(scene[picked[j]], rig) < camImportance(scene[k], rig); j--) picked[j + 1] = picked[j];
    picked[j + 1] = k;
  }
  picked = picked.slice(0, Math.max(1, max));
  if (order === "spread") {
    var seq = [picked[0]], rest = picked.slice(1);
    while (rest.length) {
      var last = scene[seq[seq.length - 1]], at = camScreenAtRest(last, rig), far = -1, pick = 0;
      for (k = 0; k < rest.length; k++) {
        var p = camScreenAtRest(scene[rest[k]], rig), dx = p[0] - at[0], dy = p[1] - at[1];
        var gap = dx * dx + dy * dy;
        if (gap > far) {
          far = gap;
          pick = k;
        }
      }
      seq.push(rest.splice(pick, 1)[0]);
    }
    return seq;
  }
  for (i = 1; i < picked.length; i++) {
    k = picked[i];
    for (j = i - 1; j >= 0 && camOrderKey(scene[picked[j]], order) > camOrderKey(scene[k], order); j--) picked[j + 1] = picked[j];
    picked[j + 1] = k;
  }
  return picked;
}
function camScreenAtRest(layer, rig) {
  var k = rig.zoom / camRefDistance(layer, rig);
  return [rig.cx + (layer.c[0] - rig.cx) * k, rig.cy + (layer.c[1] - rig.cy) * k];
}
function camOrderKey(layer, order) {
  if (order === "front-to-back") return layer.c[2];
  if (order === "reading") return Math.round(layer.c[1] / 40) * 1e5 + layer.c[0];
  return -layer.c[2];
}
function camVisitPose(rig, target, dist, orb, lens) {
  var shot = {
    kind: "visit",
    start: 0,
    dur: 1,
    amount: 1,
    dir: "to",
    curve: "silk",
    tr: [0, 0, 0],
    rot: [0, 0, 0],
    orb: orb,
    lens: lens || 1,
    dolly: 0,
    imp: [0, 0.2, 0, 1.2, 4],
    org: [6, 1, 6, 0],
    vis: [target[0], target[1], target[2], dist, target[0], target[1], target[2], 1]
  };
  return camPose(0, rig, [shot]);
}
function camScreenBox(pose, layer, rig) {
  var box = [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity], i;
  for (i = 0; i < 4; i++) {
    var p = [layer.c[0] + (i === 1 || i === 2 ? layer.hw : -layer.hw), layer.c[1] + (i >= 2 ? layer.hh : -layer.hh), layer.c[2]];
    var depth = (p[0] - pose.c[0]) * pose.f[0] + (p[1] - pose.c[1]) * pose.f[1] + (p[2] - pose.c[2]) * pose.f[2];
    box[4] = Math.min(box[4], depth);
    box[5] = Math.max(box[5], depth);
    var s = camProject(pose, p, rig.cx, rig.cy);
    box[0] = Math.min(box[0], s[0]);
    box[1] = Math.min(box[1], s[1]);
    box[2] = Math.max(box[2], s[0]);
    box[3] = Math.max(box[3], s[1]);
  }
  return box;
}
function camOverlap(a, b, rig) {
  var x0 = Math.max(0, a[0]), y0 = Math.max(0, a[1]), x1 = Math.min(rig.width, a[2]), y1 = Math.min(rig.height, a[3]);
  var area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (area <= 0) return 0;
  var w = Math.min(x1, b[2]) - Math.max(x0, b[0]), h = Math.min(y1, b[3]) - Math.max(y0, b[1]);
  return w > 0 && h > 0 ? w * h / area : 0;
}
function camBlockScore(scene, rig, target, background, pose, dist) {
  var score = 0, i, all = [0, 0, rig.width, rig.height];
  var own = target >= 0 ? camScreenBox(pose, scene[target], rig) : all;
  for (i = 0; i < scene.length; i++) {
    if (i === target || i === background) continue;
    var box = camScreenBox(pose, scene[i], rig), depth = box[4];
    if (depth <= 1 || depth >= dist - 1) continue;
    score += camOverlap(own, box, rig);
    if (depth < 0.3 * dist && camOverlap(all, box, rig) > 0.25) score += 1;
  }
  return score;
}
function camFrameDistance(scene, rig, index, background, fill, orb) {
  var layer = scene[index], ref = camRefDistance(layer, rig), text = layer.kind === "text";
  var maxMag = text ? 1.8 : Math.max(1.2, Math.min(2.4, layer.mx && layer.mx > 0 ? layer.mx : 2.2)), minMag = text ? 1.08 : 1.15;
  var sx = layer.hw / (fill * rig.width / 2), sy = layer.hh / (fill * rig.height / 2);
  var want = rig.zoom * (text ? Math.max(sx, sy) : Math.min(sx, sy));
  var d = Math.max(Math.min(want, ref / minMag), ref / maxMag, 0.08 * rig.zoom), clear = 0.06 * rig.zoom;
  if (text) return Math.max(Math.min(want, ref / minMag), rig.zoom * Math.max(layer.hw / (0.45 * rig.width), layer.hh / (0.45 * rig.height)), ref / maxMag);
  var best = d, bestScore = camBlockScore(scene, rig, index, background, camVisitPose(rig, layer.c, d, orb), d), i;
  if (bestScore < 0.15) return best;
  for (i = 0; i < scene.length; i++) {
    var other = scene[i];
    if (i === index || i === background || other.c[2] >= layer.c[2]) continue;
    var past = layer.c[2] - other.c[2] - clear;
    if (past < 0.08 * rig.zoom || ref / past > maxMag * 1.25) continue;
    var score = camBlockScore(scene, rig, index, background, camVisitPose(rig, layer.c, past, orb), past);
    if (score < bestScore - 0.05 || score <= bestScore && past > best) {
      best = past;
      bestScore = score;
    }
  }
  return best;
}
function camVisibleFraction(box, rig) {
  var w = box[2] - box[0], h = box[3] - box[1];
  if (!(w > 0 && h > 0)) return 0;
  var iw = Math.min(rig.width, box[2]) - Math.max(0, box[0]), ih = Math.min(rig.height, box[3]) - Math.max(0, box[1]);
  return iw > 0 && ih > 0 ? iw * ih / (w * h) : 0;
}
function camReframe(scene, rig, index, dist, orb) {
  var layer = scene[index], c = layer.c, ref = camRefDistance(layer, rig), d = dist, look = c;
  var scales = [1, 0.5, 0], scale = 1, tries, n, k, lo, hi, mid, o, floor;
  function at(s) {
    return [c[0] + s * (rig.cx - c[0]), c[1] + s * (rig.cy - c[1]), c[2]];
  }
  for (tries = 0; tries < 12; tries++) {
    for (n = 0; n < scales.length; n++) {
      scale = scales[n];
      o = [orb[0] * scale, orb[1] * scale];
      floor = Math.max(1.0005, camVisitPose(rig, at(1), d, o).cover + 5e-4);
      lo = 0;
      hi = 0;
      if (camVisitPose(rig, c, d, o).cover > floor) {
        hi = 1;
        for (k = 0; k < 14; k++) {
          mid = (lo + hi) / 2;
          if (camVisitPose(rig, at(mid), d, o).cover > floor) lo = mid;
          else hi = mid;
        }
      }
      look = at(hi);
      var pose = camVisitPose(rig, look, d, o), box = camScreenBox(pose, layer, rig);
      var whole = layer.kind === "text" ? box[0] >= 0.04 * rig.width && box[2] <= 0.96 * rig.width && box[1] >= 0.03 * rig.height && box[3] <= 0.97 * rig.height : camVisibleFraction(box, rig) >= 0.85 && pose.cover <= 1.25;
      if (whole) return [look[0], look[1], look[2], d, scale];
    }
    if (d >= ref) break;
    d = Math.min(ref, d * 1.1);
  }
  return [look[0], look[1], look[2], d, scale];
}
function camPoseClear(scene, rig, background, pose, dist, hero) {
  var frame = [0, 0, rig.width, rig.height], middle = [rig.width * 0.2, rig.height * 0.2, rig.width * 0.8, rig.height * 0.8], hidden = 0, i;
  if (pose.cover > 1.25) return -1;
  if (background >= 0 && camOverlap(frame, camScreenBox(pose, scene[background], rig), rig) < 0.995) return -1;
  for (i = 0; i < scene.length; i++) {
    if (i === background) continue;
    var box = camScreenBox(pose, scene[i], rig), near = box[4], far = box[5];
    if (far <= 1) {
      hidden++;
      continue;
    }
    if (near <= 1) return -1;
    if (i === hero) {
      if (camOverlap(frame, box, rig) > 0.55) return -1;
      continue;
    }
    if (camOverlap(frame, box, rig) > 0.4) return -1;
    if (near < 0.25 * dist && camOverlap(middle, box, rig) > 0.1) return -1;
  }
  return hidden;
}
function camDeepPose(scene, rig, background, main, track, orb) {
  var look = background >= 0 ? scene[background].c : [rig.cx, rig.cy, rig.pz];
  var camRef = rig.pz - rig.dist, refBg = Math.max(1, look[2] - camRef), depths = [], i, j, k;
  for (i = 1; i <= 24; i++) depths.push(camRef + i / 24 * 0.9 * refBg);
  for (i = 0; i < scene.length; i++) if (i !== background) depths.push(scene[i].c[2] + 0.06 * rig.zoom);
  var options = track ? [16, 13, 10, 7] : [0, 0.3, -0.3, 0.5, -0.5, 0.7, -0.7], best = null, bestScore = -Infinity;
  for (i = 0; i < depths.length; i++) {
    var zc = depths[i], d = look[2] - zc;
    if (d < refBg / 2.2 || zc <= camRef + 1) continue;
    var visW = rig.width * d / rig.zoom;
    for (j = 0; j < options.length; j++) {
      var s = options[j], hidden = 0, score;
      if (track) {
        for (k = -1; k <= 1 && hidden >= 0; k++) {
          var pose = camVisitPose(rig, look, d, [-k * s, orb[1]]);
          var h = camPoseClear(scene, rig, background, pose, d, main);
          if (main >= 0 && camVisibleFraction(camScreenBox(pose, scene[main], rig), rig) < (k ? 0.35 : 0.6)) h = -1;
          if (h >= 0 && !k) {
            var others = 0;
            for (var o = 0; o < scene.length; o++) {
              if (o === background || o === main) continue;
              var ob = camScreenBox(pose, scene[o], rig);
              if (ob[4] > 1 && camVisibleFraction(ob, rig) > 0.2) others++;
            }
            if (!others) h = -1;
          }
          hidden = h < 0 ? -1 : Math.max(hidden, h);
        }
        if (hidden < 0) continue;
        score = (zc - camRef) / refBg * 4 + s / 8;
        if (score > bestScore) {
          bestScore = score;
          best = [look[0], look[1], look[2], d, hidden, s];
        }
      } else {
        var start = camVisitPose(rig, [look[0] + s * visW, look[1], look[2]], d, orb);
        hidden = camPoseClear(scene, rig, background, start, d);
        if (hidden < 1 || main >= 0 && camVisibleFraction(camScreenBox(start, scene[main], rig), rig) < 0.15) continue;
        score = hidden * 10 + (zc - camRef) / refBg * 4 - Math.abs(s) * 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = [look[0] + s * visW, look[1], look[2], d, hidden, 0];
        }
      }
    }
  }
  return best;
}
function camDeepStart(scene, rig, background, depth) {
  var camRef = rig.pz - rig.dist, back = background >= 0 ? scene[background] : null, bz = -Infinity, i, k, j;
  if (back) bz = back.c[2];
  else for (i = 0; i < scene.length; i++) bz = Math.max(bz, scene[i].c[2]);
  var clear = Math.max(60, 0.04 * rig.zoom), limit = bz - clear, refBg = bz - camRef;
  var want = Math.min(limit, camRef + Math.max(0, depth)), cap = Math.max(2.2, Math.min(4, back && back.mx ? back.mx : 0));
  if (!(want > camRef + 1)) return null;
  var options = [want], frame = [0, 0, rig.width, rig.height];
  for (i = 0; i < scene.length; i++) if (i !== background) options.push(scene[i].c[2] + clear, scene[i].c[2] - 0.2 * rig.dist);
  for (i = 1; i < options.length; i++) {
    var z = options[i];
    for (j = i - 1; j >= 0 && Math.abs(options[j] - want) > Math.abs(z - want); j--) options[j + 1] = options[j];
    options[j + 1] = z;
  }
  for (k = 0; k < options.length; k++) {
    var zc = options[k];
    if (!(zc > camRef + 1 && zc <= limit)) continue;
    var d = bz - zc, lens = Math.min(1, cap * d / refBg), pose = camVisitPose(rig, [rig.cx, rig.cy, bz], d, [0, 0], lens), hidden = 0, clean = true;
    for (i = 0; i < scene.length && clean; i++) {
      if (i === background) continue;
      var box = camScreenBox(pose, scene[i], rig);
      if (box[5] <= 1) {
        hidden++;
        continue;
      }
      if (box[4] <= 1 || camOverlap(frame, box, rig) > 0.55 && pose.zoom / box[4] > 2.5) clean = false;
    }
    if (clean) return [rig.cx, rig.cy, bz, d, hidden, lens];
  }
  return null;
}
function camFocusScore(scene, rig, index, background, main, pose) {
  var layer = scene[index], box = camScreenBox(pose, layer, rig), w = rig.width, h = rig.height;
  if (box[5] <= 1) return 0;
  if (index === background) return box[4] > 1 ? 0.04 : 0;
  if (box[4] < 0.08 * rig.dist) return 0;
  var seen = camVisibleFraction(box, rig);
  if (seen < 0.3) return 0;
  var x0 = Math.max(0, box[0]), y0 = Math.max(0, box[1]), x1 = Math.min(w, box[2]), y1 = Math.min(h, box[3]);
  var share = Math.min(0.6, (x1 - x0) * (y1 - y0) / (w * h)), cx = (x0 + x1) / (2 * w) - 0.5, cy = (y0 + y1) / (2 * h) - 0.5;
  var middle = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 1.4);
  return share * (0.4 + 0.6 * middle) * (0.5 + 0.5 * seen) * (layer.kind === "text" ? 1.5 : 1) * (index === main ? 1.3 : 1);
}
function camPlanFocus(scene, rig, plan, opts) {
  var shots = [], i, j, t, keys = [], cur = -1, cand = -1, since = 0, end = opts.start + opts.duration;
  var step = Math.max(opts.frame, 1 / 12), rack = 0.3, max = opts.maxFocus && opts.maxFocus > 0 ? opts.maxFocus : 10;
  for (i = 0; i < plan.beats.length; i++) {
    var b = plan.beats[i];
    shots.push({
      kind: "visit",
      start: b.start,
      dur: b.dur,
      amount: 1,
      dir: "to",
      curve: b.curve,
      tr: b.tr,
      rot: b.rot,
      orb: b.orb,
      lens: b.lens,
      dolly: 0,
      imp: b.imp,
      org: [6, 1, 6, 0],
      vis: b.vis
    });
  }
  for (t = opts.start; t <= end + 1e-9; t += step) {
    var active = null, forced = -1;
    for (j = 0; j < plan.beats.length; j++) if (plan.beats[j].start <= t + 1e-9) active = plan.beats[j];
    if (active && active.layer >= 0) {
      for (j = 0; j < scene.length; j++) if (scene[j].id === active.layer) forced = j;
    }
    if (forced >= 0) {
      if (forced !== cur) {
        keys.push([Math.max(t - step, active ? active.start : t), forced]);
        cur = forced;
      }
      cand = -1;
      continue;
    }
    var pose = camPose(t, rig, shots), best = -1, top = 0, now = 0;
    for (i = 0; i < scene.length; i++) {
      var score = camFocusScore(scene, rig, i, plan.background, plan.main, pose);
      if (score > top) {
        top = score;
        best = i;
      }
      if (i === cur) now = score;
    }
    if (best < 0) continue;
    if (cur < 0) {
      cur = best;
      keys.push([t, best]);
      continue;
    }
    if (best === cur || now > 0 && top < now * 1.3) {
      cand = -1;
      continue;
    }
    if (cand !== best) {
      cand = best;
      since = t;
    }
    if (now <= 0 || t - since >= 0.2) {
      keys.push([now <= 0 ? t : since, best]);
      cur = best;
      cand = -1;
    }
  }
  while (keys.length > max) {
    var shortest = 1, gap = Infinity;
    for (i = 1; i < keys.length; i++) {
      var hold = (i + 1 < keys.length ? keys[i + 1][0] : end) - keys[i][0];
      if (hold < gap) {
        gap = hold;
        shortest = i;
      }
    }
    keys.splice(shortest, 1);
    for (i = keys.length - 1; i > 0; i--) if (keys[i][1] === keys[i - 1][1]) keys.splice(i, 1);
  }
  var out = [], cut = plan.beats.length && plan.beats[0].vis[7] ? 1 : 0, free = opts.start;
  for (i = 0; i < keys.length; i++) {
    var at = keys[i][0], dur = i === 0 && cut ? opts.frame : rack, start = i === 0 ? opts.start : Math.max(free, at - 0.1);
    out.push({ start: start, dur: dur, layer: keys[i][1] });
    free = start + dur;
  }
  return out;
}
function camPlanChoreography(scene, rig, recipe2, opts) {
  var plan = { beats: [], subjects: [], main: -1, background: -1, hidden: 0, depth: 0, focus: [], warnings: [] };
  var background = camBackground(scene, rig), max = opts.maxSubjects > 0 ? Math.min(opts.maxSubjects, 6) : recipe2.maxSubjects;
  var order = !opts.order || opts.order === "auto" ? recipe2.order || "back-to-front" : opts.order;
  var subjects = camPickSubjects(scene, rig, background, order, max), main = camPickSubjects(scene, rig, background, "back-to-front", 1)[0];
  plan.background = background;
  plan.subjects = subjects;
  plan.main = typeof main === "number" ? main : -1;
  if (plan.main < 0) {
    plan.warnings.push("no-subject");
    return plan;
  }
  var units = 0, i, k, steps = recipe2.steps, home = [rig.cx, rig.cy, rig.pz];
  var depth = typeof opts.depth === "number" && opts.depth >= 0 ? opts.depth : 2500;
  for (i = 0; i < steps.length; i++) {
    var st = steps[i], n = st.to === "subjects" ? subjects.length : 1;
    units += n * (st.move + st.hold);
  }
  var scale = opts.duration / Math.max(1e-3, units), t = opts.start, flip = 1;
  var mainLayer = scene[plan.main];
  for (i = 0; i < steps.length; i++) {
    var step = steps[i], list = step.to === "subjects" ? subjects : [plan.main];
    for (k = 0; k < list.length; k++) {
      var beat = camPlanBeat(scene, rig, step, list[k], background, mainLayer, home, flip, plan, depth);
      if (!beat) {
        t += (step.move + step.hold) * scale;
        continue;
      }
      beat.start = t;
      beat.dur = step.cut ? opts.frame : Math.max(opts.frame, step.move * scale);
      plan.beats.push(beat);
      t += (step.move + step.hold) * scale;
      if (step.alt) flip = -flip;
    }
  }
  if (opts.focus !== false && plan.beats.length) {
    plan.focus = camPlanFocus(scene, rig, plan, opts);
    if (plan.focus.length) for (i = 0; i < plan.beats.length; i++) plan.beats[i].vis[8] = 1;
  }
  return plan;
}
function camPlanBeat(scene, rig, step, index, background, mainLayer, home, flip, plan, depth) {
  var orb = step.orb ? [step.orb[0] * flip, step.orb[1]] : [0, 0], arc = step.arc ? [step.arc[0] * flip, step.arc[1], step.arc[2]] : [0, 0, 0];
  var target = home, dist = rig.dist, role = "home", layerId = -1, focus = mainLayer.c, lens = 1, creep = 0;
  if (step.to === "deep") {
    var start = camDeepStart(scene, rig, background, depth);
    if (!start) {
      plan.warnings.push("no-deep-start");
      return null;
    }
    target = [start[0], start[1], start[2]];
    dist = start[3];
    lens = start[5];
    role = "deep";
    plan.hidden = Math.max(plan.hidden, start[4]);
    plan.depth = Math.round(target[2] - dist - (rig.pz - rig.dist));
    if (Math.abs(plan.depth - depth) > Math.max(50, 0.05 * depth)) plan.warnings.push("depth-adjusted");
    orb = [0, 0];
    focus = target;
  } else if (step.to === "through") {
    var back = background >= 0 ? scene[background].c : home;
    var refBack = Math.max(1, back[2] - (rig.pz - rig.dist));
    target = back;
    dist = Math.max(0.04 * rig.zoom, back[2] - (mainLayer.c[2] + 0.06 * rig.zoom));
    role = "deep";
    lens = Math.min(1, 2.2 * dist / refBack);
    focus = target;
  } else if (step.to === "deep-left" || step.to === "deep-right") {
    var side = step.to === "deep-left" ? -1 : 1;
    var deep = camDeepPose(scene, rig, background, plan.main, side, orb);
    if (!deep) {
      plan.warnings.push("no-deep-start");
      return null;
    }
    target = [deep[0], deep[1], deep[2]];
    dist = deep[3];
    role = "deep";
    if (side) orb = [-side * deep[5], orb[1]];
    plan.hidden = Math.max(plan.hidden, deep[4]);
    focus = step.focus === "target" ? target : mainLayer.c;
  } else if (step.to === "subjects" || step.to === "main") {
    var layer = scene[index];
    role = step.to === "main" ? "main" : "subject";
    layerId = layer.id;
    if (layer.kind === "text") orb = [orb[0] * 0.35, orb[1] * 0.35];
    var framed = camReframe(scene, rig, index, camFrameDistance(scene, rig, index, background, step.fill || (layer.kind === "text" ? 0.82 : 0.72), orb), orb);
    target = [framed[0], framed[1], framed[2]];
    dist = framed[3];
    orb = [orb[0] * framed[4], orb[1] * framed[4]];
    focus = step.focus === "main" ? mainLayer.c : layer.c;
    creep = step.creep || 0;
  } else {
    orb = [0, 0];
  }
  var imp = step.imp ? [step.imp[0], step.imp[1], step.imp[2], step.imp[3], step.imp[4]] : [0, 0.2, 0, 1.2, 4];
  var roll = layerId >= 0 && scene[index].kind === "text" ? 0 : (step.roll || 0) * flip;
  return {
    start: 0,
    dur: 0,
    curve: step.curve,
    tr: arc,
    rot: [0, 0, roll],
    orb: orb,
    lens: lens,
    imp: imp,
    vis: [target[0], target[1], target[2], dist, focus[0], focus[1], focus[2], step.cut ? 1 : 0, 0, creep],
    role: role,
    layer: layerId
  };
}
global.MotionCameraCatalog = [{"schemaVersion":1,"id":"hero-push","version":1,"intent":"highlight","milestone":1,"name":{"pt-BR":"Hero Push","en-US":"Hero Push"},"description":{"pt-BR":"Avanço suave em profundidade que valoriza o protagonista.","en-US":"A gentle push in depth that sells the hero."},"durationSeconds":4,"motionBlur":false,"shot":{"kind":"move","dir":"to","curve":"silk","tr":[0,0,0.08],"rot":[0,0,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"depth-slide","version":1,"intent":"traverse","milestone":1,"name":{"pt-BR":"Depth Slide","en-US":"Depth Slide"},"description":{"pt-BR":"Travelling lateral que atravessa os planos, com leve contra-pan.","en-US":"A lateral track across the planes with a slight counter-pan."},"durationSeconds":3,"motionBlur":false,"shot":{"kind":"move","dir":"through","curve":"sine-in-out","tr":[0.07,0,0.02],"rot":[-1,0,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"float-loop","version":1,"intent":"breathe","milestone":1,"name":{"pt-BR":"Float Loop","en-US":"Float Loop"},"description":{"pt-BR":"Respiração contínua que fecha o loop sem emenda.","en-US":"A continuous breath that closes its loop seamlessly."},"durationSeconds":6,"motionBlur":false,"shot":{"kind":"loop","dir":"to","curve":"silk","tr":[0.01,0.006,0],"rot":[0,0,0.25],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"reveal-pull","version":1,"intent":"reveal","milestone":2,"name":{"pt-BR":"Reveal Pull","en-US":"Reveal Pull"},"description":{"pt-BR":"Começa perto e recua até revelar o layout completo.","en-US":"Starts close and pulls back to reveal the full layout."},"durationSeconds":3,"motionBlur":false,"shot":{"kind":"move","dir":"from","curve":"drift","tr":[0,0.02,0.1],"rot":[0,0,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"pedestal-reveal","version":1,"intent":"reveal","milestone":2,"name":{"pt-BR":"Pedestal Reveal","en-US":"Pedestal Reveal"},"description":{"pt-BR":"Sobe até o enquadramento final com o tilt compensado.","en-US":"Rises into the final frame with a compensated tilt."},"durationSeconds":2.5,"motionBlur":false,"shot":{"kind":"move","dir":"from","curve":"glide","tr":[0,0.06,0],"rot":[0,1.5,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"arc-hero","version":1,"intent":"highlight","milestone":2,"name":{"pt-BR":"Arc Hero","en-US":"Arc Hero"},"description":{"pt-BR":"Arco curto em volta do protagonista, sem sair do foco.","en-US":"A short arc around the hero that keeps it centered."},"durationSeconds":4,"motionBlur":false,"shot":{"kind":"move","dir":"through","curve":"sine-in-out","tr":[0,0,0.02],"rot":[0,0,0],"orb":[6,2],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"punch-in","version":1,"intent":"impact","milestone":2,"name":{"pt-BR":"Punch In","en-US":"Punch In"},"description":{"pt-BR":"Avanço rápido com ultrapassagem e acomodação.","en-US":"A fast push with overshoot and settle."},"durationSeconds":0.55,"motionBlur":true,"shot":{"kind":"move","dir":"to","curve":"impact","tr":[0,0,0.05],"rot":[0,0,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.16,0.06,1.5,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"whip-reframe","version":1,"intent":"traverse","milestone":2,"name":{"pt-BR":"Whip Reframe","en-US":"Whip Reframe"},"description":{"pt-BR":"Chicote de pan para reenquadrar; pede motion blur.","en-US":"A whip pan that reframes; asks for motion blur."},"durationSeconds":0.35,"motionBlur":true,"shot":{"kind":"move","dir":"to","curve":"expo-in-out","tr":[0,0,0],"rot":[5,0,0],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"dolly-zoom","version":1,"intent":"highlight","milestone":2,"name":{"pt-BR":"Dolly Zoom","en-US":"Dolly Zoom"},"description":{"pt-BR":"Avança e compensa a lente: o plano de foco fica, o fundo muda.","en-US":"Pushes in and compensates the lens: the focal plane stays, the depth shifts."},"durationSeconds":3,"motionBlur":false,"shot":{"kind":"move","dir":"to","curve":"sine-in-out","tr":[0,0,0.12],"rot":[0,0,0],"orb":[0,0],"lens":1,"dolly":1,"imp":[0,0.2,0,1.2,4],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"beat-hit","version":1,"intent":"impact","milestone":2,"name":{"pt-BR":"Beat Hit","en-US":"Beat Hit"},"description":{"pt-BR":"Batida curta que volta ao lugar, para marcar o ritmo.","en-US":"A short hit that returns to rest to mark the beat."},"durationSeconds":0.35,"motionBlur":true,"shot":{"kind":"pulse","dir":"to","curve":"silk","tr":[0,0,0.02],"rot":[0,0,0.4],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,5],"org":[6,1847,6,0]}},{"schemaVersion":1,"id":"controlled-handheld","version":1,"intent":"breathe","milestone":2,"name":{"pt-BR":"Controlled Handheld","en-US":"Controlled Handheld"},"description":{"pt-BR":"Câmera na mão contida: drift lento e tremor fino, com semente.","en-US":"Restrained handheld: slow drift and fine tremor, seeded."},"durationSeconds":6,"motionBlur":false,"shot":{"kind":"loop","dir":"to","curve":"silk","tr":[0.003,0.003,0.001],"rot":[0.15,0.15,0.2],"orb":[0,0],"lens":1,"dolly":0,"imp":[0,0.2,0,1.2,4],"org":[6,4242,7,0.35]}}];
global.MotionCameraChoreographies = [{"schemaVersion":1,"id":"deep-reveal","version":2,"name":{"pt-BR":"Revelação em profundidade","en-US":"Deep Reveal"},"description":{"pt-BR":"A câmera começa 2500 px para dentro, junto do fundo, e volta à posição original atravessando as camadas, que aparecem uma a uma. Depois dá um zoom com impacto no protagonista e fecha no layout.","en-US":"The camera starts 2500 px into the scene, by the background, and pulls back to where it was through the layers as they appear one by one. Then it punches in on the hero and closes on the layout."},"durationSeconds":10,"maxSubjects":1,"steps":[{"to":"deep","move":0,"hold":0.7,"curve":"silk","cut":1,"focus":"main"},{"to":"home","move":3.6,"hold":0.3,"curve":"glide","arc":[0,0.03,0],"focus":"main"},{"to":"main","move":1,"hold":1.5,"curve":"impact","imp":[0,0.5,0.05,1.2,5],"fill":0.78,"orb":[6,-2],"creep":0.035,"focus":"target"},{"to":"home","move":1.3,"hold":0.4,"curve":"silk","focus":"main"}]},{"schemaVersion":1,"id":"layer-tour","version":2,"name":{"pt-BR":"Tour pelas camadas","en-US":"Layer Tour"},"description":{"pt-BR":"Pula de camada em camada com zoom de impacto, órbita alternada e o foco chegando antes da câmera. Nunca para: em cada camada a câmera continua avançando devagar.","en-US":"Hops from layer to layer with punchy zooms, alternating orbits and the focus landing before the camera. It never stops: on each layer the camera keeps creeping in."},"durationSeconds":10,"maxSubjects":3,"steps":[{"to":"home","move":0,"hold":0.3,"curve":"silk","focus":"main"},{"to":"subjects","move":0.7,"hold":0.9,"curve":"impact","imp":[0,0.5,0.05,1.2,5],"orb":[8,-3],"alt":1,"roll":1.5,"arc":[0.06,0,0],"creep":0.035,"focus":"target"},{"to":"home","move":1.2,"hold":0.5,"curve":"silk","focus":"main"}]},{"schemaVersion":1,"id":"full-sequence","version":2,"name":{"pt-BR":"Sequência completa","en-US":"Full Sequence"},"description":{"pt-BR":"Abertura lá de trás (2500 px para dentro), revelação atravessando as camadas, zooms rápidos nos destaques e fechamento no layout: a coreografia inteira.","en-US":"Opens deep (2500 px into the scene), reveals through the layers, quick zooms on the highlights and closes on the layout: the whole choreography."},"durationSeconds":16,"maxSubjects":3,"steps":[{"to":"deep","move":0,"hold":0.5,"curve":"silk","cut":1,"focus":"main"},{"to":"home","move":3.2,"hold":0.2,"curve":"glide","arc":[0,0.03,0],"focus":"main"},{"to":"subjects","move":0.7,"hold":0.9,"curve":"impact","imp":[0,0.5,0.05,1.2,5],"orb":[9,-3],"alt":1,"roll":1.5,"arc":[0.05,0,0],"creep":0.035,"focus":"target"},{"to":"home","move":1.1,"hold":0.5,"curve":"silk","focus":"main"}]},{"schemaVersion":1,"id":"quick-zooms","version":2,"name":{"pt-BR":"Zooms rápidos","en-US":"Quick Zooms"},"description":{"pt-BR":"Dinâmico: de um canto ao outro, um zoom rápido em cada destaque com estalo na chegada e roll alternado, e o foco acompanhando. Termina no layout.","en-US":"Dynamic: corner to corner, a quick zoom on each highlight that snaps on arrival with an alternating roll, the focus following. Ends on the layout."},"durationSeconds":8,"maxSubjects":4,"steps":[{"to":"home","move":0,"hold":0.25,"curve":"silk","focus":"main"},{"to":"subjects","move":0.5,"hold":0.75,"curve":"impact","imp":[0,0.55,0.07,1.5,6],"fill":0.84,"orb":[7,-2],"alt":1,"roll":2.5,"arc":[0.04,0.02,0],"creep":0.05,"focus":"target"},{"to":"home","move":0.7,"hold":0.45,"curve":"expo-in-out","focus":"main"}],"order":"spread"},{"schemaVersion":1,"id":"between-layers","version":2,"name":{"pt-BR":"Travelling entre camadas","en-US":"Between the Layers"},"description":{"pt-BR":"A câmera atravessa a cena de lado por dentro das camadas, com a frente passando rente à lente, e sai para o layout.","en-US":"The camera tracks sideways inside the layer stack, with the front planes sweeping past the lens, then pulls out to the layout."},"durationSeconds":10,"maxSubjects":1,"steps":[{"to":"deep-left","move":0,"hold":0.4,"curve":"silk","cut":1,"orb":[12,0],"focus":"main"},{"to":"deep-right","move":4.4,"hold":0.4,"curve":"sine-in-out","orb":[-12,0],"arc":[0,-0.03,0],"focus":"main"},{"to":"home","move":2.2,"hold":1,"curve":"silk","focus":"main"}]},{"schemaVersion":1,"id":"hero-orbit","version":2,"name":{"pt-BR":"Órbita do protagonista","en-US":"Hero Orbit"},"description":{"pt-BR":"Aproxima do protagonista, contorna em arco lento com o foco nele e o fundo desfocado, e volta ao layout.","en-US":"Moves in on the hero, circles it in a slow arc with the focus on it and the background soft, then returns to the layout."},"durationSeconds":9,"maxSubjects":1,"steps":[{"to":"home","move":0,"hold":0.5,"curve":"silk","focus":"main"},{"to":"main","move":1.8,"hold":0.3,"curve":"silk","fill":0.72,"orb":[-14,3],"focus":"target"},{"to":"main","move":3,"hold":0.2,"curve":"sine-in-out","fill":0.72,"orb":[14,-2],"focus":"target"},{"to":"home","move":1.8,"hold":0.6,"curve":"silk","focus":"main"}]},{"schemaVersion":1,"id":"dive-in","version":2,"name":{"pt-BR":"Mergulho na cena","en-US":"Dive In"},"description":{"pt-BR":"Avança no protagonista, atravessa a camada dele como uma cortina e termina limpo no fundo: ótima saída ou transição para a próxima cena.","en-US":"Pushes in on the hero, flies through its layer like a wipe and lands clean on the background: a strong exit or a transition to the next scene."},"durationSeconds":6,"maxSubjects":1,"steps":[{"to":"home","move":0,"hold":0.4,"curve":"silk","focus":"main"},{"to":"main","move":1.2,"hold":0.5,"curve":"impact","imp":[0,0.5,0.05,1.2,5],"fill":0.7,"creep":0.04,"focus":"target"},{"to":"through","move":2.2,"hold":0.3,"curve":"expo-in-out","focus":"target"}]}];
global.MotionCameraCore = {
libraryEase: libraryEase,
camSmooth: camSmooth,
camSoftCap: camSoftCap,
camSettle: camSettle,
camImpact: camImpact,
camPulse: camPulse,
camHash: camHash,
camHarmonic: camHarmonic,
camShotWeight: camShotWeight,
camCoverKnee: camCoverKnee,
camVisits: camVisits,
camPose: camPose,
camOrientation: camOrientation,
camProject: camProject,
camFocusDepth: camFocusDepth,
camRefDistance: camRefDistance,
camImportance: camImportance,
camBackground: camBackground,
camPickSubjects: camPickSubjects,
camScreenAtRest: camScreenAtRest,
camOrderKey: camOrderKey,
camVisitPose: camVisitPose,
camScreenBox: camScreenBox,
camOverlap: camOverlap,
camBlockScore: camBlockScore,
camFrameDistance: camFrameDistance,
camVisibleFraction: camVisibleFraction,
camReframe: camReframe,
camPoseClear: camPoseClear,
camDeepPose: camDeepPose,
camDeepStart: camDeepStart,
camFocusScore: camFocusScore,
camPlanFocus: camPlanFocus,
camPlanChoreography: camPlanChoreography,
camPlanBeat: camPlanBeat,
source: "function libraryEase(t, kind, elasticity, settleAmount, settleCount, settleDamping, exit) {\n  var x = Math.max(0, Math.min(1, t));\n  if (x === 0 || x === 1) return x;\n  if (kind === \"settle-wave\" || kind === \"settle-hop\") {\n    var wave = kind === \"settle-wave\";\n    var amount = Math.max(0, Math.min(100, typeof settleAmount === \"number\" ? settleAmount : wave ? 35 : 40)) / 100;\n    var count = Math.max(0.5, Math.min(8, typeof settleCount === \"number\" ? settleCount : wave ? 2.5 : 3));\n    var damping = Math.max(0, Math.min(100, typeof settleDamping === \"number\" ? settleDamping : wave ? 55 : 60)) / 100;\n    if (exit) {\n      var pull = 0.4 + amount * 3.2, back = x - 1;\n      return 1 + (pull + 1) * back * back * back + pull * back * back;\n    }\n    var arrive = wave ? 0.3 : 0.34, span = 1 - arrive;\n    if (wave) {\n      var turn = 2 * Math.PI * count;\n      var height = Math.min(amount * 0.6, 3 * span / (arrive * turn));\n      if (x < arrive) {\n        var a = x / arrive, m = height * turn / span * arrive;\n        return -2 * a * a * a + 3 * a * a + (a * a * a - a * a) * m;\n      }\n      var tau = (x - arrive) / span, tail = Math.max(0, Math.min(1, (tau - 0.75) / 0.25));\n      return 1 + height * Math.exp(-(1 + damping * 7) * tau) * Math.sin(turn * tau) * (1 - tail * tail * tail * (10 + tail * (-15 + 6 * tail)));\n    }\n    if (x < arrive) {\n      var fall = x / arrive;\n      return fall * fall;\n    }\n    var first = amount * 0.5, keep = Math.max(0.05, 1 - damping), hops = Math.max(1, Math.min(8, Math.round(count)));\n    if (first <= 0) return 1;\n    var total = 0, h = 1, hop;\n    for (hop = 0; hop < hops; hop++) {\n      total += Math.sqrt(h);\n      h *= keep;\n    }\n    var clock = (x - arrive) / span * total, lift = first, length;\n    for (hop = 0; hop < hops; hop++) {\n      length = Math.sqrt(Math.pow(keep, hop));\n      if (clock <= length) {\n        var p = clock / length;\n        return 1 - lift * 4 * p * (1 - p);\n      }\n      clock -= length;\n      lift *= keep;\n    }\n    return 1;\n  }\n  var dash = typeof kind === \"string\" ? kind.indexOf(\"-\") : -1, family = dash > 0 ? kind.substring(0, dash) : \"\", shape = dash > 0 ? kind.substring(dash + 1) : \"\";\n  if ((family === \"sine\" || family === \"quad\" || family === \"quart\" || family === \"quint\" || family === \"expo\" || family === \"circ\") && (shape === \"in\" || shape === \"out\" || shape === \"in-out\")) {\n    var y = shape === \"in\" ? x : shape === \"out\" ? 1 - x : x < 0.5 ? 2 * x : 2 - 2 * x, f;\n    if (family === \"sine\") f = 1 - Math.cos(y * Math.PI / 2);\n    else if (family === \"expo\") f = (Math.pow(2, 10 * y) - 1) / 1023;\n    else if (family === \"circ\") f = 1 - Math.sqrt(Math.max(0, 1 - y * y));\n    else f = Math.pow(y, family === \"quad\" ? 2 : family === \"quart\" ? 4 : 5);\n    return shape === \"in\" ? f : shape === \"out\" ? 1 - f : x < 0.5 ? f / 2 : 1 - f / 2;\n  }\n  if (kind === \"silk\") return x * x * x * (10 + x * (-15 + 6 * x));\n  if (kind === \"glide\" || kind === \"spring\") {\n    var glide = x * x * (10 + x * (-20 + x * (15 - 4 * x)));\n    if (kind === \"glide\") return glide;\n    var elastic = Math.max(0, Math.min(100, typeof elasticity === \"number\" ? elasticity : 30)) / 100;\n    var frequency = 6 + elastic * 6;\n    var response = 1 - Math.exp(-6 * x) * (Math.cos(frequency * x) + 6 / frequency * Math.sin(frequency * x));\n    var tail = Math.max(0, Math.min(1, (x - 0.75) / 0.25));\n    var settle = 1 - tail * tail * tail * (10 + tail * (-15 + 6 * tail));\n    return glide + (response - glide) * elastic * settle;\n  }\n  if (kind === \"cubic\") return x * x * x;\n  if (kind === \"overshoot\") {\n    var q = x - 1;\n    return 1 + 2.70158 * q * q * q + 1.70158 * q * q;\n  }\n  if (kind === \"bounce\") {\n    if (x < 1 / 2.75) return 7.5625 * x * x;\n    if (x < 2 / 2.75) {\n      x -= 1.5 / 2.75;\n      return 7.5625 * x * x + 0.75;\n    }\n    if (x < 2.5 / 2.75) {\n      x -= 2.25 / 2.75;\n      return 7.5625 * x * x + 0.9375;\n    }\n    x -= 2.625 / 2.75;\n    return 7.5625 * x * x + 0.984375;\n  }\n  if (kind === \"flicker\") return Math.max(0, Math.min(1, Math.floor(x * 12) / 12 + Math.sin(Math.floor(x * 24) * 17) * (1 - x) * 0.22));\n  if (kind === \"velvet\" || kind === \"drift\") {\n    var x1 = kind === \"velvet\" ? 0.16 : 0.22, x2 = kind === \"velvet\" ? 0.3 : 0.36, t = x, i, cx = 1, dx;\n    for (i = 0; i < 8 && Math.abs(cx) > 1e-7; i++) {\n      cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t - x;\n      dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);\n      if (Math.abs(dx) < 1e-6) break;\n      t = Math.max(0, Math.min(1, t - cx / dx));\n    }\n    if (Math.abs(cx) > 1e-6) {\n      var lo = 0, hi = 1;\n      for (i = 0; i < 40; i++) {\n        t = (lo + hi) / 2;\n        if (3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t < x) lo = t;\n        else hi = t;\n      }\n    }\n    return 1 - Math.pow(1 - t, 3);\n  }\n  if (kind === \"snap\") {\n    var snapRate = 9;\n    return (1 - (1 + snapRate * x) * Math.exp(-snapRate * x)) / (1 - (1 + snapRate) * Math.exp(-snapRate));\n  }\n  return 1 - Math.pow(1 - x, 3);\n}\nfunction camSmooth(x) {\n  var t = x <= 0 ? 0 : x >= 1 ? 1 : x;\n  return t * t * t * (10 + t * (-15 + 6 * t));\n}\nfunction camSoftCap(x, lim) {\n  if (!(lim > 0)) return x;\n  var y = Math.abs(x) / lim, e = Math.exp(-2 * y), v = lim * (1 - e) / (1 + e);\n  return x < 0 ? -v : v;\n}\nfunction camSettle(tau, ringing, damping) {\n  if (tau <= 0) return 1;\n  if (tau >= 1) return 0;\n  var w = 2 * Math.PI * Math.max(0.1, ringing), k = Math.max(0, damping);\n  var spring = Math.exp(-k * tau) * (Math.cos(w * tau) + k / w * Math.sin(w * tau));\n  return spring * (1 - camSmooth((tau - 0.55) / 0.45));\n}\nfunction camImpact(u, imp) {\n  if (u <= 0) return 0;\n  if (u >= 1) return 1;\n  var antic = Math.max(0, Math.min(0.5, imp[0])), attack = Math.max(0.02, Math.min(0.8, imp[1]));\n  var over = Math.max(0, Math.min(1, imp[2])), lead = antic > 0 ? attack * 0.8 : 0;\n  if (lead + attack > 0.9) {\n    var fit = 0.9 / (lead + attack);\n    lead *= fit;\n    attack *= fit;\n  }\n  if (lead > 0 && u < lead) {\n    var s = Math.sin(Math.PI * u / lead);\n    return -antic * s * s;\n  }\n  var hit = lead + attack;\n  if (u < hit) return (1 + over) * camSmooth((u - lead) / attack);\n  return 1 + over * camSettle((u - hit) / (1 - hit), imp[3], imp[4]);\n}\nfunction camPulse(u, imp) {\n  if (u <= 0 || u >= 1) return 0;\n  var attack = Math.max(0.02, Math.min(0.8, imp[1]));\n  if (u < attack) return camSmooth(u / attack);\n  return camSettle((u - attack) / (1 - attack), imp[3], imp[4]);\n}\nfunction camHash(x) {\n  var s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;\n  return s - Math.floor(s);\n}\nfunction camHarmonic(t, period, seed, channel, base, count) {\n  var p = Math.max(0.05, period), n0 = Math.max(1, Math.round(base)), c = Math.max(1, Math.min(6, Math.round(count)));\n  var sum = 0, norm = 0, k, a;\n  for (k = 0; k < c; k++) {\n    a = 1 / (1 + k);\n    sum += a * Math.sin(2 * Math.PI * ((n0 + k) * t / p + camHash(seed * 0.618 + channel * 1.37 + k * 0.29)));\n    norm += a;\n  }\n  return sum / norm;\n}\nfunction camShotWeight(t, s, duration) {\n  var dur = Math.max(1e-4, s.dur), u = (t - s.start) / dur;\n  if (s.kind === \"pulse\") return camPulse(u, s.imp);\n  if (s.kind === \"visit\") {\n    if (s.vis && s.vis[7]) return t >= s.start ? 1 : 0;\n    return s.curve === \"impact\" ? camImpact(u, s.imp) : libraryEase(u, s.curve);\n  }\n  if (s.kind === \"loop\") {\n    if (t < s.start || t > s.start + dur) return 0;\n    var ramp = Math.min(0.25, dur / 4), w = 1;\n    if (s.start > 1e-6) w *= camSmooth((t - s.start) / ramp);\n    if (s.start + dur < duration - 1e-6) w *= camSmooth((s.start + dur - t) / ramp);\n    return w;\n  }\n  var e = s.curve === \"impact\" ? camImpact(u, s.imp) : libraryEase(u, s.curve);\n  return s.dir === \"from\" ? 1 - e : s.dir === \"through\" ? e - 0.5 : e;\n}\nfunction camCoverKnee(s) {\n  var k = 5e-4;\n  if (s <= 1) return 1;\n  if (s < 1 + 2 * k) return 1 + (s - 1) * (s - 1) / (4 * k);\n  return s - k;\n}\nfunction camVisits(t, rig, shots) {\n  var deg = Math.PI / 180, visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;\n  var out = [rig.cx, rig.cy, rig.pz - rig.dist, 0, 0, 0, 1, 0, 0, 0], order = [], i, j, k, s, v, w, e, a, kind;\n  var fd = rig.fd;\n  out[7] = fd ? fd[0] : rig.cx;\n  out[8] = fd ? fd[1] : rig.cy;\n  out[9] = fd ? fd[2] : rig.pz;\n  for (i = 0; i < shots.length; i++) {\n    kind = shots[i].kind;\n    if ((kind === \"visit\" || kind === \"focus\") && shots[i].vis) order.push(i);\n  }\n  for (i = 1; i < order.length; i++) {\n    k = order[i];\n    for (j = i - 1; j >= 0 && shots[order[j]].start > shots[k].start; j--) order[j + 1] = order[j];\n    order[j + 1] = k;\n  }\n  for (i = 0; i < order.length; i++) {\n    s = shots[order[i]];\n    v = s.vis;\n    a = Math.max(0, Math.min(1, s.amount));\n    if (s.kind === \"focus\") {\n      var wr = camSmooth((t - s.start) / Math.max(1e-4, s.dur)) * a;\n      for (j = 0; j < 3; j++) out[7 + j] = out[7 + j] + wr * (v[4 + j] - out[7 + j]);\n      continue;\n    }\n    e = camShotWeight(t, s, rig.duration);\n    w = e * a;\n    if (!(w > 0 || w < 0)) continue;\n    var ap = s.orb[0] * deg, at = s.orb[1] * deg, d = Math.max(1, v[3]), creep = v[9] || 0, after = t - s.start - s.dur;\n    if (creep > 0 && after > 0 && !v[7]) d *= 1 - camSoftCap(creep * (after < 0.35 ? after * after / 0.7 : after - 0.175), 0.15);\n    var target = [\n      v[0] - d * Math.sin(ap) * Math.cos(at),\n      v[1] + d * Math.sin(at),\n      v[2] - d * Math.cos(ap) * Math.cos(at),\n      s.orb[0] + s.rot[0],\n      s.orb[1] + s.rot[1],\n      s.rot[2],\n      s.lens > 0 ? s.lens : 1\n    ];\n    for (j = 0; j < 7; j++) out[j] = out[j] + w * (target[j] - out[j]);\n    var arc = v[7] ? 0 : Math.sin(Math.PI * Math.max(0, Math.min(1, e))) * a;\n    out[0] = out[0] + arc * s.tr[0] * visW;\n    out[1] = out[1] + arc * s.tr[1] * visH;\n    out[2] = out[2] + arc * s.tr[2] * rig.dist;\n    if (v[8]) continue;\n    var wf = v[7] ? w : camSmooth((t - s.start) / Math.max(1e-4, s.dur * 0.45)) * a;\n    for (j = 0; j < 3; j++) out[7 + j] = out[7 + j] + wf * (v[4 + j] - out[7 + j]);\n  }\n  return out;\n}\nfunction camPose(t, rig, shots) {\n  var deg = Math.PI / 180, i, c, s, w, a, dz;\n  var tx = 0, ty = 0, tz = 0, pan = 0, tilt = 0, roll = 0, opan = 0, otilt = 0, lensLog = 0, dolly = 0;\n  var visW = rig.width * rig.dist / rig.zoom, visH = rig.height * rig.dist / rig.zoom;\n  var vt = camVisits(t, rig, shots);\n  for (i = 0; i < shots.length; i++) {\n    s = shots[i];\n    a = s.amount;\n    if (s.kind === \"visit\" || s.kind === \"focus\" || !(a > 0 || a < 0)) continue;\n    w = camShotWeight(t, s, rig.duration) * a;\n    if (w === 0) continue;\n    if (s.kind === \"loop\") {\n      var age = t - s.start, per = s.org[0], seed = s.org[1], mix = Math.max(0, Math.min(1, s.org[3]));\n      var tb = Math.max(4, Math.round(s.org[2] * per)), ch = [];\n      for (c = 0; c < 6; c++) {\n        ch.push(w * ((1 - mix) * camHarmonic(age, per, seed, c, 1, 3) + mix * camHarmonic(age, per, seed, c + 6, tb, 3)));\n      }\n      tx += s.tr[0] * visW * ch[0];\n      ty += s.tr[1] * visH * ch[1];\n      dz = s.tr[2] * rig.dist * ch[2];\n      tz += dz;\n      dolly += dz * s.dolly;\n      pan += s.rot[0] * ch[3];\n      tilt += s.rot[1] * ch[4];\n      roll += s.rot[2] * ch[5];\n      continue;\n    }\n    tx += s.tr[0] * visW * w;\n    ty += s.tr[1] * visH * w;\n    dz = s.tr[2] * rig.dist * w;\n    tz += dz;\n    dolly += dz * s.dolly;\n    pan += s.rot[0] * w;\n    tilt += s.rot[1] * w;\n    roll += s.rot[2] * w;\n    opan += s.orb[0] * w;\n    otilt += s.orb[1] * w;\n    if (s.lens > 0 && s.lens !== 1) lensLog += Math.log(s.lens) * w;\n  }\n  if (rig.near > 0 && tz > 0) {\n    var limited = camSoftCap(tz, rig.near * (1 - 1 / Math.max(1.05, rig.growth)));\n    dolly *= limited / tz;\n    tz = limited;\n  }\n  otilt = camSoftCap(otilt, 80);\n  tilt = camSoftCap(tilt + otilt, 80) - otilt;\n  pan += vt[3];\n  tilt += vt[4];\n  roll += vt[5];\n  lensLog += Math.log(Math.max(0.01, vt[6]));\n  var op = opan * deg, ot = otilt * deg;\n  var orbit = [Math.sin(op) * Math.cos(ot), -Math.sin(ot), Math.cos(op) * Math.cos(ot)];\n  var cam = [\n    vt[0] - rig.dist * orbit[0] + tx,\n    vt[1] - rig.dist * orbit[1] + ty,\n    vt[2] + rig.dist - rig.dist * orbit[2] + tz\n  ];\n  var p = (pan + opan) * deg, q = (tilt + otilt) * deg, rr = roll * deg;\n  var fwd = [Math.sin(p) * Math.cos(q), -Math.sin(q), Math.cos(p) * Math.cos(q)];\n  var r0 = [Math.cos(p), 0, -Math.sin(p)], d0 = [Math.sin(p) * Math.sin(q), Math.cos(q), Math.cos(p) * Math.sin(q)];\n  var cr = Math.cos(rr), sr = Math.sin(rr);\n  var right = [r0[0] * cr + d0[0] * sr, r0[1] * cr + d0[1] * sr, r0[2] * cr + d0[2] * sr];\n  var down = [d0[0] * cr - r0[0] * sr, d0[1] * cr - r0[1] * sr, d0[2] * cr - r0[2] * sr];\n  var lens = rig.zoom * Math.exp(lensLog) * Math.max(0.05, (rig.dist - dolly) / rig.dist);\n  var cover = 1;\n  if (rig.cover) {\n    var m = rig.margin, hw = rig.width / 2, hh = rig.height / 2, bz = typeof rig.bz === \"number\" ? rig.bz : rig.pz;\n    var kb = (rig.dist + bz - rig.pz) / rig.dist, need = 1, area = 0, j, corner;\n    var xs = [rig.cx - (hw + Math.max(0, m[0])) * kb, rig.cx + (hw + Math.max(0, m[1])) * kb];\n    var ys = [rig.cy - (hh + Math.max(0, m[2])) * kb, rig.cy + (hh + Math.max(0, m[3])) * kb];\n    var qx = [], qy = [];\n    for (j = 0; j < 4; j++) {\n      var vx = xs[j === 1 || j === 2 ? 1 : 0] - cam[0], vy = ys[j >= 2 ? 1 : 0] - cam[1], vz = bz - cam[2];\n      var depth = vx * fwd[0] + vy * fwd[1] + vz * fwd[2];\n      if (!(depth > 1)) {\n        need = 10;\n        break;\n      }\n      qx.push(lens * (vx * right[0] + vy * right[1] + vz * right[2]) / depth);\n      qy.push(lens * (vx * down[0] + vy * down[1] + vz * down[2]) / depth);\n    }\n    for (j = 0; need < 10 && j < 4; j++) area += qx[j] * qy[(j + 1) % 4] - qx[(j + 1) % 4] * qy[j];\n    for (j = 0; need < 10 && j < 4; j++) {\n      var ax = qx[j], ay = qy[j], ex = qx[(j + 1) % 4] - ax, ey = qy[(j + 1) % 4] - ay;\n      var g0 = ey * ax - ex * ay;\n      if (!(g0 * area > 0)) {\n        need = 10;\n        break;\n      }\n      for (corner = 0; corner < 4; corner++) {\n        var b = ex * (corner >= 2 ? hh : -hh) - ey * (corner === 1 || corner === 2 ? hw : -hw);\n        if (b * area < 0) need = Math.max(need, -b / g0);\n      }\n    }\n    cover = camCoverKnee(Math.min(10, need));\n  }\n  return {\n    c: cam,\n    f: fwd,\n    r: right,\n    d: down,\n    m: [cam[0] + rig.dist * fwd[0], cam[1] + rig.dist * fwd[1], cam[2] + rig.dist * fwd[2]],\n    pan: pan + opan,\n    tilt: tilt + otilt,\n    roll: roll,\n    zoom: lens * cover,\n    lens: lens,\n    cover: cover,\n    dz: tz,\n    fp: [vt[7], vt[8], vt[9]]\n  };\n}\nfunction camOrientation(pose) {\n  var deg = Math.PI / 180, p = pose.pan * deg, q = pose.tilt * deg;\n  var sp = Math.sin(p), cp = Math.cos(p), sq = Math.sin(q), cq = Math.cos(q);\n  return [Math.atan2(sq, cp * cq) / deg, Math.asin(Math.max(-1, Math.min(1, sp * cq))) / deg, Math.atan2(-sp * sq, cp) / deg];\n}\nfunction camProject(pose, point, centerX, centerY) {\n  var v = [point[0] - pose.c[0], point[1] - pose.c[1], point[2] - pose.c[2]];\n  var z = v[0] * pose.f[0] + v[1] * pose.f[1] + v[2] * pose.f[2];\n  if (!(z > 1e-6)) return [centerX, centerY, 0];\n  var k = pose.zoom / z;\n  return [\n    centerX + (v[0] * pose.r[0] + v[1] * pose.r[1] + v[2] * pose.r[2]) * k,\n    centerY + (v[0] * pose.d[0] + v[1] * pose.d[1] + v[2] * pose.d[2]) * k,\n    k\n  ];\n}\nfunction camFocusDepth(cam, fwd, target, offset, minimum, fallback) {\n  var d = (target[0] - cam[0]) * fwd[0] + (target[1] - cam[1]) * fwd[1] + (target[2] - cam[2]) * fwd[2] + offset;\n  var lo = Math.max(1, minimum);\n  if (!(d === d)) return fallback;\n  if (d >= lo * 2) return d;\n  if (d <= lo) return fallback;\n  return fallback + (d - fallback) * camSmooth((d - lo) / lo);\n}"
};
}($.global));
