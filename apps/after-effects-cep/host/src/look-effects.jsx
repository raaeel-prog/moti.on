/** Reveals and looks of the preset library, on native After Effects and Cycore
 * effects only (inventory: scripts/inspect-native-effects.jsx). A reveal drives
 * its effect's transition completion with the eased weight, so the layer is
 * hidden at the edges and untouched at rest. A look fixes each effect's
 * character and blends the stack in through Effect Opacity, driven by
 * Intensity: it fades in and out with the stacked effect window too.
 * Parameters are resolved by match name; a missing one refuses with
 * CAPABILITY_UNAVAILABLE instead of writing to a guessed index. */
(function (global) {
  var MN_EFFECTS = "ADBE Effect Parade";
  // Same table as packages/contracts/src/motion-library-requirements.ts.
  var STACKS = /** @type {Record<string,string[]>} */ ({
    "reveal-linear": ["ADBE Linear Wipe"], "reveal-radial": ["ADBE Radial Wipe"], "reveal-blinds": ["ADBE Venetian Blinds"],
    "reveal-blocks": ["ADBE Block Dissolve"], "reveal-grid": ["CC Grid Wipe"], "reveal-sweep": ["CS LineSweep"],
    "look-vhs": ["ADBE Noise", "ADBE Box Blur2", "ADBE Turbulent Displace", "ADBE HUE SATURATION", "ADBE Venetian Blinds"],
    "look-crt": ["ADBE Venetian Blinds", "ADBE Bulge", "ADBE Glo2", "CS Vignette"],
    "look-film": ["VISINF Grain Implant", "ADBE Exposure2", "CS Vignette", "ADBE Photo Filter"],
    "look-halftone": ["CC Ball Action"],
    "look-dither": ["ADBE Noise", "ADBE Posterize"],
    "look-sketch": ["ADBE Find Edges", "ADBE Black&White", "ADBE Easy Levels2"],
    "look-stopmotion": ["ADBE Posterize Time", "ADBE Turbulent Displace"],
    "look-vintage": ["CC Toner", "VISINF Grain Implant", "CS Vignette", "ADBE Easy Levels2"]
  });
  var LABELS = /** @type {Record<string,string[]>} */ ({
    "ADBE Linear Wipe": ["Cortina", "Curtain"], "ADBE Radial Wipe": ["Relógio", "Clock"], "ADBE Block Dissolve": ["Blocos", "Blocks"],
    "CC Grid Wipe": ["Grade", "Grid"], "CS LineSweep": ["Varredura", "Sweep"], "ADBE Noise": ["Ruído", "Noise"],
    "ADBE Box Blur2": ["Borrão horizontal", "Horizontal smear"], "ADBE Turbulent Displace": ["Distorção", "Distortion"],
    "ADBE HUE SATURATION": ["Cor", "Color"], "ADBE Bulge": ["Curvatura", "Curvature"], "ADBE Glo2": ["Brilho", "Glow"],
    "CS Vignette": ["Vinheta", "Vignette"], "VISINF Grain Implant": ["Grão", "Grain"], "ADBE Exposure2": ["Oscilação de luz", "Flicker"],
    "ADBE Photo Filter": ["Filtro quente", "Warm filter"], "CC Ball Action": ["Retícula", "Dot screen"], "ADBE Posterize": ["Posterizar", "Posterize"],
    "ADBE Find Edges": ["Traço", "Lines"], "ADBE Black&White": ["Preto e branco", "Black & white"], "ADBE Easy Levels2": ["Níveis", "Levels"],
    "ADBE Posterize Time": ["Quadros", "Frames"], "CC Toner": ["Tons", "Toner"]
  });
  /** @param {any} p @returns {boolean} */
  function handles(p) { return !!(p && Object.prototype.hasOwnProperty.call(STACKS, p.effect)); }
  /** @param {any} p @returns {string[]} */
  function required(p) { var stack = handles(p) ? /** @type {any} */ (STACKS[p.effect]) : null; return stack ? stack.slice(0) : []; }
  /** @param {string} message @returns {any} */
  function unavailable(message) { var e = /** @type {any} */ (new Error(message)); e.motionCode = MotionContracts.ERROR.CAPABILITY_UNAVAILABLE; return e; }
  /** @param {any} effect @param {string} matchName @returns {any} */
  function param(effect, matchName) {
    for (var i = 1; i <= effect.numProperties; i++) { var child = effect.property(i); if (child && child.matchName === matchName) return child; }
    throw unavailable("Parâmetro nativo indisponível: " + matchName);
  }
  /** One owned effect per match name; scanlines and blinds name themselves.
   * @param {any} plan @param {any} api @param {string} matchName @returns {any} */
  function owned(plan, api, matchName) {
    var pt = plan.locale.indexOf("pt") === 0, labels = matchName === "ADBE Venetian Blinds" ? (plan.p.effect === "reveal-blinds" ? ["Persiana", "Blinds"] : ["Linhas", "Scanlines"]) : LABELS[matchName] || [matchName, matchName];
    var key = pt ? labels[0] : labels[1];
    for (var i = 0; i < plan.meta.effects.length; i++) if (plan.meta.effects[i].matchName === matchName) key = plan.meta.effects[i].name.split(" · ").slice(1).join(" · ");
    return api.effect(plan, key, matchName);
  }
  /** @param {any} plan @param {any} api @param {any} e @param {string} mn @param {any} value */
  function fixed(plan, api, e, mn, value) { api.set(plan, param(e, mn), value); }
  /** @param {any} plan @param {any} api @param {any} e @param {string} mn @param {string} body */
  function drive(plan, api, e, mn, body) { param(e, mn); api.effectExpression(plan, e, mn.substring(e.matchName.length), body); }
  /** Intensity blends a look in through Effect Opacity, which also follows the
   * stacked effect window's ramps.
   * @param {any} plan @param {any} api @param {any} e */
  function blend(plan, api, e) {
    var group = param(e, "ADBE Effect Built In Params");
    for (var i = 1; i <= group.numProperties; i++) if (group.property(i).matchName === "ADBE Effect Mask Opacity") {
      api.express(plan, [MN_EFFECTS, e.name, "ADBE Effect Built In Params", "ADBE Effect Mask Opacity"], api.header(plan.p, plan.args, plan.meta, false) + "Math.max(0,Math.min(100,100*amp));");
      return;
    }
    throw unavailable("Parâmetro nativo indisponível: ADBE Effect Mask Opacity");
  }
  /** Hidden fraction of a reveal: the eased weight times Intensity, clamped.
   * @param {number} scale @returns {string} */
  function completion(scale) { return "var k=Math.max(0,Math.min(1,fadeWeight*amp));" + scale + "*k;"; }
  /** The side a reveal uncovers first, as each effect's travel angle.
   * Measured in AE 26.5 (scripts/verify-reveals-looks.jsx samples the alpha):
   * 270 uncovers from the left, 90 from the right, 0 from the top, 180 from the bottom.
   * @param {any} plan @returns {string} */
  function side(plan) { var d = plan.args.direction; return d === "preset" ? (plan.p.defaults && plan.p.defaults.direction) || "left" : d; }
  /** @param {string} from @returns {number} */
  function wipeAngle(from) { return from === "right" ? 90 : from === "top" ? 0 : from === "bottom" ? 180 : 270; }
  /** Layer-space center and size of the content, for centered effects.
   * @param {any} plan @returns {any} */
  function box(plan) { var r = plan.rect; return {cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: Math.max(1, r.width), h: Math.max(1, r.height)}; }
  /** @param {any} plan @param {any} api */
  function apply(plan, api) {
    var p = plan.p, kind = p.effect, s = plan.comp.height / 1080, b = box(plan), e, from;
    if (!handles(p)) return;
    if (kind === "reveal-linear") {
      e = owned(plan, api, "ADBE Linear Wipe"); from = side(plan);
      fixed(plan, api, e, "ADBE Linear Wipe-0002", wipeAngle(from));
      fixed(plan, api, e, "ADBE Linear Wipe-0003", Math.round((from === "left" || from === "right" ? b.w : b.h) * .12));
      drive(plan, api, e, "ADBE Linear Wipe-0001", completion(100));
    }
    if (kind === "reveal-radial") {
      e = owned(plan, api, "ADBE Radial Wipe");
      fixed(plan, api, e, "ADBE Radial Wipe-0002", 0); fixed(plan, api, e, "ADBE Radial Wipe-0003", [b.cx, b.cy]);
      fixed(plan, api, e, "ADBE Radial Wipe-0004", 1); fixed(plan, api, e, "ADBE Radial Wipe-0005", Math.round(Math.min(b.w, b.h) * .04));
      drive(plan, api, e, "ADBE Radial Wipe-0001", completion(100));
    }
    if (kind === "reveal-blinds") {
      e = owned(plan, api, "ADBE Venetian Blinds"); from = side(plan);
      fixed(plan, api, e, "ADBE Venetian Blinds-0002", wipeAngle(from));
      fixed(plan, api, e, "ADBE Venetian Blinds-0003", Math.max(4, Math.round((from === "left" || from === "right" ? b.w : b.h) / 10)));
      fixed(plan, api, e, "ADBE Venetian Blinds-0004", Math.max(1, Math.round(2 * s)));
      drive(plan, api, e, "ADBE Venetian Blinds-0001", completion(100));
    }
    if (kind === "reveal-blocks") {
      e = owned(plan, api, "ADBE Block Dissolve");
      var block = Math.max(4, Math.round(Math.min(b.w, b.h) / 14));
      fixed(plan, api, e, "ADBE Block Dissolve-0002", block); fixed(plan, api, e, "ADBE Block Dissolve-0003", block);
      fixed(plan, api, e, "ADBE Block Dissolve-0004", 0); fixed(plan, api, e, "ADBE Block Dissolve-0005", 1);
      drive(plan, api, e, "ADBE Block Dissolve-0001", completion(100));
    }
    if (kind === "reveal-grid") {
      e = owned(plan, api, "CC Grid Wipe");
      fixed(plan, api, e, "CC Grid Wipe-0002", [b.cx, b.cy]); fixed(plan, api, e, "CC Grid Wipe-0003", 45);
      fixed(plan, api, e, "CC Grid Wipe-0004", 75); fixed(plan, api, e, "CC Grid Wipe-0005", 8); fixed(plan, api, e, "CC Grid Wipe-0007", 0);
      // Reported as 0..1, but AE 26.5 completes the wipe only at 100.
      drive(plan, api, e, "CC Grid Wipe-0001", completion(100));
    }
    if (kind === "reveal-sweep") {
      e = owned(plan, api, "CS LineSweep"); from = side(plan);
      fixed(plan, api, e, "CS LineSweep-0002", wipeAngle(from));
      fixed(plan, api, e, "CS LineSweep-0003", Math.max(4, Math.round(Math.min(b.w, b.h) / 12)));
      fixed(plan, api, e, "CS LineSweep-0004", 50); fixed(plan, api, e, "CS LineSweep-0005", 0);
      drive(plan, api, e, "CS LineSweep-0001", completion(100));
    }
    if (kind === "look-vhs") {
      e = owned(plan, api, "ADBE Noise"); fixed(plan, api, e, "ADBE Noise-0001", 16); fixed(plan, api, e, "ADBE Noise-0002", 1); fixed(plan, api, e, "ADBE Noise-0003", 1); blend(plan, api, e);
      e = owned(plan, api, "ADBE Box Blur2"); fixed(plan, api, e, "ADBE Box Blur2-0001", Math.max(1, 2 * s)); fixed(plan, api, e, "ADBE Box Blur2-0002", 1); fixed(plan, api, e, "ADBE Box Blur2-0003", 2); blend(plan, api, e);
      e = owned(plan, api, "ADBE Turbulent Displace"); fixed(plan, api, e, "ADBE Turbulent Displace-0001", 8); fixed(plan, api, e, "ADBE Turbulent Displace-0002", 8);
      fixed(plan, api, e, "ADBE Turbulent Displace-0003", Math.max(2, 40 * s)); fixed(plan, api, e, "ADBE Turbulent Displace-0005", 2);
      drive(plan, api, e, "ADBE Turbulent Displace-0006", "age*240;"); blend(plan, api, e);
      e = owned(plan, api, "ADBE HUE SATURATION"); fixed(plan, api, e, "ADBE HUE SATURATION-0005", -12); blend(plan, api, e);
      scanlines(plan, api, s, 20);
    }
    if (kind === "look-crt") {
      scanlines(plan, api, s, 35);
      e = owned(plan, api, "ADBE Bulge"); fixed(plan, api, e, "ADBE Bulge-0001", Math.round(b.w * .75)); fixed(plan, api, e, "ADBE Bulge-0002", Math.round(b.h * .75));
      fixed(plan, api, e, "ADBE Bulge-0003", [b.cx, b.cy]); fixed(plan, api, e, "ADBE Bulge-0004", .35); fixed(plan, api, e, "ADBE Bulge-0006", 2); fixed(plan, api, e, "ADBE Bulge-0007", 1); blend(plan, api, e);
      e = owned(plan, api, "ADBE Glo2"); fixed(plan, api, e, "ADBE Glo2-0002", 160); fixed(plan, api, e, "ADBE Glo2-0003", Math.max(1, 14 * s)); fixed(plan, api, e, "ADBE Glo2-0004", .6); blend(plan, api, e);
      vignette(plan, api, b, 90);
    }
    if (kind === "look-film") {
      grain(plan, api, .8, 1.3);
      e = owned(plan, api, "ADBE Exposure2"); drive(plan, api, e, "ADBE Exposure2-0003", "(Math.sin(age*37.7)*.6+Math.sin(age*23.1+1.3)*.4)*0.12;"); blend(plan, api, e);
      vignette(plan, api, b, 60);
      e = owned(plan, api, "ADBE Photo Filter"); fixed(plan, api, e, "ADBE Photo Filter-0001", 1); fixed(plan, api, e, "ADBE Photo Filter-0003", 20); blend(plan, api, e);
    }
    if (kind === "look-halftone") {
      e = owned(plan, api, "CC Ball Action"); fixed(plan, api, e, "CC Ball Action-0006", Math.max(2, Math.round(6 * s))); fixed(plan, api, e, "CC Ball Action-0007", 110); blend(plan, api, e);
    }
    if (kind === "look-dither") {
      e = owned(plan, api, "ADBE Noise"); fixed(plan, api, e, "ADBE Noise-0001", 18); fixed(plan, api, e, "ADBE Noise-0002", 0); fixed(plan, api, e, "ADBE Noise-0003", 1); blend(plan, api, e);
      e = owned(plan, api, "ADBE Posterize"); fixed(plan, api, e, "ADBE Posterize-0001", 5); blend(plan, api, e);
    }
    if (kind === "look-sketch") {
      e = owned(plan, api, "ADBE Find Edges"); fixed(plan, api, e, "ADBE Find Edges-0001", 0); fixed(plan, api, e, "ADBE Find Edges-0002", 0); blend(plan, api, e);
      e = owned(plan, api, "ADBE Black&White"); blend(plan, api, e);
      e = owned(plan, api, "ADBE Easy Levels2"); fixed(plan, api, e, "ADBE Easy Levels2-0004", .85); fixed(plan, api, e, "ADBE Easy Levels2-0005", .7); blend(plan, api, e);
    }
    if (kind === "look-stopmotion") {
      // Frame rate eases from the composition's to 8 fps with Intensity: time cannot blend.
      e = owned(plan, api, "ADBE Posterize Time"); drive(plan, api, e, "ADBE Posterize Time-0001", "var k=Math.max(0,Math.min(1,amp));(1/thisComp.frameDuration)*(1-k)+8*k;");
      e = owned(plan, api, "ADBE Turbulent Displace"); fixed(plan, api, e, "ADBE Turbulent Displace-0001", 1); fixed(plan, api, e, "ADBE Turbulent Displace-0002", 6);
      fixed(plan, api, e, "ADBE Turbulent Displace-0003", Math.max(2, 30 * s)); fixed(plan, api, e, "ADBE Turbulent Displace-0005", 2);
      drive(plan, api, e, "ADBE Turbulent Displace-0006", "Math.floor(age*8)*90;"); blend(plan, api, e);
    }
    if (kind === "look-vintage") {
      e = owned(plan, api, "CC Toner"); blend(plan, api, e);
      grain(plan, api, .5, 1);
      vignette(plan, api, b, 70);
      e = owned(plan, api, "ADBE Easy Levels2"); fixed(plan, api, e, "ADBE Easy Levels2-0006", .08); fixed(plan, api, e, "ADBE Easy Levels2-0007", .95); blend(plan, api, e);
    }
  }
  /** Horizontal scanlines from Venetian Blinds held at a partial completion.
   * @param {any} plan @param {any} api @param {number} s @param {number} amount */
  function scanlines(plan, api, s, amount) {
    var e = owned(plan, api, "ADBE Venetian Blinds");
    fixed(plan, api, e, "ADBE Venetian Blinds-0001", amount); fixed(plan, api, e, "ADBE Venetian Blinds-0002", 0);
    fixed(plan, api, e, "ADBE Venetian Blinds-0003", Math.max(2, Math.round(3 * s))); fixed(plan, api, e, "ADBE Venetian Blinds-0004", Math.max(.5, s)); blend(plan, api, e);
  }
  /** @param {any} plan @param {any} api @param {any} b @param {number} amount */
  function vignette(plan, api, b, amount) {
    var e = owned(plan, api, "CS Vignette");
    fixed(plan, api, e, "CS Vignette-0001", amount); fixed(plan, api, e, "CS Vignette-0002", 50); fixed(plan, api, e, "CS Vignette-0003", [b.cx, b.cy]); blend(plan, api, e);
  }
  /** Add Grain starts in Preview mode with a preview box: Final Output is mode 3.
   * @param {any} plan @param {any} api @param {number} intensity @param {number} size */
  function grain(plan, api, intensity, size) {
    var e = owned(plan, api, "VISINF Grain Implant");
    fixed(plan, api, e, "VISINF Grain Implant-0021", 3); fixed(plan, api, e, "VISINF Grain Implant-0008", intensity); fixed(plan, api, e, "VISINF Grain Implant-0007", size);
    blend(plan, api, e);
  }
  global.MotionLookEffects = {handles: handles, required: required, apply: apply};
}($.global));
