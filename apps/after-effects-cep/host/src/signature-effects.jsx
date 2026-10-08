/** Signature text looks: bundled layer effects synchronized with the per-unit
 * reveal of the preset library. Every value is an expression on the shared
 * header (progress sp, eased weight fadeWeight, velocity sv, envelope()), so a
 * look keeps its character at any duration and settles on its neutral value.
 * Cycore effects also fade their Effect Opacity with the transition, making the
 * resting frame independent of each effect's own neutral behavior. Parameters
 * are resolved by match name; a missing one refuses with CAPABILITY_UNAVAILABLE.
 * See docs/research/after-effects-signature-text-effects.md. */
(function (global) {
  var MN_EFFECTS = "ADBE Effect Parade";
  var LOOKS = /** @type {Record<string,string[]>} */ ({
    "film-burn": ["ADBE Turbulent Displace", "CC Burn Film", "ADBE Glo2"],
    "light-sweep": ["ADBE Exposure2", "CC Light Sweep"],
    "light-rays": ["CC Light Rays"],
    "bloom": ["ADBE Glo2"],
    "anamorphic": ["ADBE Motion Blur", "ADBE Glo2"],
    "gate-slip": ["ADBE Motion Blur"],
    "ink-bleed": ["ADBE Gaussian Blur 2", "ADBE Simple Choker"],
    "dust": ["CC Scatterize"],
    "smoke": ["ADBE Turbulent Displace", "ADBE Gaussian Blur 2"],
    "projector": ["ADBE Exposure2"],
    "halo": ["ADBE Glo2"]
  });
  var LABELS = /** @type {Record<string,string[]>} */ ({
    "ADBE Turbulent Displace": ["Distorção", "Distortion"], "CC Burn Film": ["Queima de filme", "Film burn"],
    "ADBE Glo2": ["Brilho", "Glow"], "CC Light Sweep": ["Feixe de luz", "Light sweep"], "CC Light Rays": ["Raios de luz", "Light rays"],
    "ADBE Motion Blur": ["Rastro", "Streak"], "ADBE Gaussian Blur 2": ["Desfoque", "Blur"], "ADBE Simple Choker": ["Contração", "Choke"],
    "CC Scatterize": ["Dispersão", "Scatter"], "ADBE Exposure2": ["Exposição", "Exposure"]
  });
  /** @param {any} p @returns {string[]} */
  function required(p) { var look = p && p.collection === "signature" ? LOOKS[p.effect] : null; return look ? look.slice(0) : []; }
  /** @param {string} message @returns {any} */
  function unavailable(message) { var e = /** @type {any} */ (new Error(message)); e.motionCode = MotionContracts.ERROR.CAPABILITY_UNAVAILABLE; return e; }
  /** Sweep the effect's children by match name; never write to a guessed index.
   * @param {any} effect @param {string} matchName @returns {any} */
  function param(effect, matchName) {
    for (var i = 1; i <= effect.numProperties; i++) { var child = effect.property(i); if (child && child.matchName === matchName) return child; }
    throw unavailable("Parâmetro nativo indisponível: " + matchName);
  }
  /** Reuse an owned effect of the same type so a locale change never duplicates it.
   * @param {any} plan @param {any} api @param {string} matchName @returns {any} */
  function owned(plan, api, matchName) {
    var labels = LABELS[matchName] || [matchName, matchName], key = plan.locale.indexOf("pt") === 0 ? labels[0] : labels[1];
    for (var i = 0; i < plan.meta.effects.length; i++) if (plan.meta.effects[i].matchName === matchName) key = plan.meta.effects[i].name.split(" · ").slice(1).join(" · ");
    return api.effect(plan, key, matchName);
  }
  /** @param {any} plan @param {any} api @param {any} e @param {string} mn @param {string} body */
  function drive(plan, api, e, mn, body) { param(e, mn); api.effectExpression(plan, e, mn.substring(e.matchName.length), body); }
  /** @param {any} plan @param {any} api @param {any} e @param {string} mn @param {any} value */
  function fixed(plan, api, e, mn, value) { api.set(plan, param(e, mn), value); }
  /** Blend the whole effect out at rest: Effect Opacity follows the transition.
   * The default steps to 0 once the transition ends, when the effect's own
   * amount is already neutral. A look whose neutral value is not an identity
   * passes a continuous body instead, so nothing pops on the last frame.
   * @param {any} plan @param {any} api @param {any} e @param {string=} body */
  function guard(plan, api, e, body) {
    var group = param(e, "ADBE Effect Built In Params");
    for (var i = 1; i <= group.numProperties; i++) if (group.property(i).matchName === "ADBE Effect Mask Opacity") {
      api.express(plan, [MN_EFFECTS, e.name, "ADBE Effect Built In Params", "ADBE Effect Mask Opacity"], api.header(plan.p, plan.args, plan.meta, false) + (body || "sp<1?100:0;"));
      return;
    }
    throw unavailable("Parâmetro nativo indisponível: ADBE Effect Mask Opacity");
  }
  /** @param {any} c @returns {number[]} */
  function rgba(c) { return [c[0], c[1], c[2], 1]; }
  /** Order-aware anchor along the text: where a front ends, in rect fractions.
   * @param {any} plan @returns {number} */
  function finish(plan) {
    var order = plan.args.order && plan.args.order !== "preset" ? plan.args.order : plan.p.text.order || "forward";
    return order === "reverse" ? 0 : order === "edges-in" ? .5 : 1;
  }
  /** Authored duration in seconds at the 30 fps reference.
   * @param {any} p @returns {number} */
  function reference(p) { return (p.defaults && p.defaults.durationFrames ? p.defaults.durationFrames : 30) / 30; }
  var RECT = "var r=thisLayer.sourceRectAtTime((inPoint+outPoint)/2,false);";
  /** @param {any} plan @param {any} api */
  function apply(plan, api) {
    var p = plan.p, a = p.effectAmount, s = plan.comp.height / 1080, e, color = p.effectColor || [1, 1, 1], end = finish(plan);
    if (!LOOKS[p.effect]) return;
    if (p.effect === "film-burn") {
      e = owned(plan, api, "ADBE Turbulent Displace");
      drive(plan, api, e, "ADBE Turbulent Displace-0002", String(9 * s) + "*envelope(\"peak\",sp,fadeWeight,sv)*amp;");
      fixed(plan, api, e, "ADBE Turbulent Displace-0003", Math.max(2, 46 * s));
      fixed(plan, api, e, "ADBE Turbulent Displace-0005", 2);
      drive(plan, api, e, "ADBE Turbulent Displace-0006", "sp*300;");
      e = owned(plan, api, "CC Burn Film");
      drive(plan, api, e, "CC Burn Film-0001", "Math.min(100," + a + "*envelope(\"weight\",sp,fadeWeight,sv)*Math.min(1,amp));");
      drive(plan, api, e, "CC Burn Film-0002", RECT + "[r.left+r.width*" + end + ",r.top+r.height/2];");
      drive(plan, api, e, "CC Burn Film-0003", "Math.max(0,Math.min(5000,seed));");
      guard(plan, api, e);
      e = owned(plan, api, "ADBE Glo2");
      fixed(plan, api, e, "ADBE Glo2-0002", 110); fixed(plan, api, e, "ADBE Glo2-0003", 26 * s);
      fixed(plan, api, e, "ADBE Glo2-0007", 2); fixed(plan, api, e, "ADBE Glo2-0012", rgba(color)); fixed(plan, api, e, "ADBE Glo2-0013", [.78, .2, .04, 1]);
      drive(plan, api, e, "ADBE Glo2-0004", "1.8*envelope(\"peak\",sp,fadeWeight,sv)*amp;");
      // Glow at intensity 0 still adds a soft alpha halo on text; fade it with the light.
      guard(plan, api, e, "100*Math.min(1,3*envelope(\"peak\",sp,fadeWeight,sv));");
    }
    if (p.effect === "light-sweep") {
      // Added light is invisible on a white title: the title dims while the
      // beam crosses it and returns to its exact exposure at rest.
      e = owned(plan, api, "ADBE Exposure2");
      drive(plan, api, e, "ADBE Exposure2-0003", "0-1.1*envelope(\"arc\",sp,fadeWeight,sv)*Math.min(1,amp);");
      e = owned(plan, api, "CC Light Sweep");
      drive(plan, api, e, "CC Light Sweep-0001", RECT + "var pad=r.height,front=" + (end === 0 ? "1-sp" : end === .5 ? "Math.abs(1-2*sp)" : "sp") + ";[r.left-pad+(r.width+2*pad)*front,r.top+r.height/2];");
      fixed(plan, api, e, "CC Light Sweep-0002", p.effectAngle);
      fixed(plan, api, e, "CC Light Sweep-0003", 2);
      drive(plan, api, e, "CC Light Sweep-0004", RECT + "Math.max(4,r.height*.45);");
      drive(plan, api, e, "CC Light Sweep-0005", String(a * .6) + "*envelope(\"arc\",sp,fadeWeight,sv)*amp;");
      drive(plan, api, e, "CC Light Sweep-0006", String(a * 1.4) + "*envelope(\"arc\",sp,fadeWeight,sv)*amp;");
      fixed(plan, api, e, "CC Light Sweep-0007", 3);
      fixed(plan, api, e, "CC Light Sweep-0008", rgba(color));
      guard(plan, api, e);
    }
    if (p.effect === "light-rays") {
      e = owned(plan, api, "CC Light Rays");
      drive(plan, api, e, "CC Light Rays-0001", String(a) + "*envelope(\"arc\",sp,fadeWeight,sv)*amp;");
      drive(plan, api, e, "CC Light Rays-0002", RECT + "[r.left+r.width/2,r.top+r.height/2];");
      drive(plan, api, e, "CC Light Rays-0003", RECT + "Math.max(20,r.width*.35);");
      fixed(plan, api, e, "CC Light Rays-0008", rgba(color));
      guard(plan, api, e);
    }
    if (p.effect === "bloom" || p.effect === "halo") {
      e = owned(plan, api, "ADBE Glo2");
      fixed(plan, api, e, "ADBE Glo2-0002", p.effect === "halo" ? 90 : 120);
      if (p.effect === "halo") {
        drive(plan, api, e, "ADBE Glo2-0003", String(a * s) + "*(1+.35*w);");
        drive(plan, api, e, "ADBE Glo2-0004", "Math.max(0,(.55+.2*w)*amp);");
      } else {
        fixed(plan, api, e, "ADBE Glo2-0003", a * s);
        drive(plan, api, e, "ADBE Glo2-0004", "2.4*envelope(\"peak\",sp,fadeWeight,sv)*amp;");
        guard(plan, api, e, "100*Math.min(1,3*envelope(\"peak\",sp,fadeWeight,sv));");
      }
    }
    if (p.effect === "anamorphic" || p.effect === "gate-slip") {
      e = owned(plan, api, "ADBE Motion Blur");
      fixed(plan, api, e, "ADBE Motion Blur-0001", p.effect === "anamorphic" ? 90 : 0);
      // Kinetic: the streak follows real speed. A shorter duration than the
      // authored one at the 30 fps reference moves faster and streaks longer.
      drive(plan, api, e, "ADBE Motion Blur-0002", "Math.min(1000," + String(a * s) + "*envelope(\"velocity\",sp,fadeWeight,sv)*Math.min(2," + String(reference(p)) + "/Math.max(.0001,dur))*amp);");
      if (p.effect === "anamorphic") {
        e = owned(plan, api, "ADBE Glo2");
        fixed(plan, api, e, "ADBE Glo2-0002", 90); fixed(plan, api, e, "ADBE Glo2-0003", 60 * s); fixed(plan, api, e, "ADBE Glo2-0014", 2);
        fixed(plan, api, e, "ADBE Glo2-0007", 2); fixed(plan, api, e, "ADBE Glo2-0012", rgba(color)); fixed(plan, api, e, "ADBE Glo2-0013", [.08, .2, .75, 1]);
        drive(plan, api, e, "ADBE Glo2-0004", "1.6*envelope(\"peak\",sp,fadeWeight,sv)*amp;");
        guard(plan, api, e, "100*Math.min(1,3*envelope(\"peak\",sp,fadeWeight,sv));");
      }
    }
    if (p.effect === "ink-bleed") {
      e = owned(plan, api, "ADBE Gaussian Blur 2");
      drive(plan, api, e, "ADBE Gaussian Blur 2-0001", String(a * s) + "*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
      e = owned(plan, api, "ADBE Simple Choker");
      drive(plan, api, e, "ADBE Simple Choker-0002", "Math.min(100," + String(a * s * .9) + "*envelope(\"weight\",sp,fadeWeight,sv)*amp);");
      guard(plan, api, e);
    }
    if (p.effect === "dust") {
      e = owned(plan, api, "CC Scatterize");
      drive(plan, api, e, "CC Scatterize-0001", String(a * s) + "*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
      drive(plan, api, e, "CC Scatterize-0002", "30*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
      drive(plan, api, e, "CC Scatterize-0003", "-30*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
      guard(plan, api, e);
    }
    if (p.effect === "smoke") {
      e = owned(plan, api, "ADBE Turbulent Displace");
      drive(plan, api, e, "ADBE Turbulent Displace-0002", String(a * s) + "*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
      fixed(plan, api, e, "ADBE Turbulent Displace-0003", Math.max(2, 80 * s));
      fixed(plan, api, e, "ADBE Turbulent Displace-0005", 3);
      drive(plan, api, e, "ADBE Turbulent Displace-0006", "sp*220;");
      e = owned(plan, api, "ADBE Gaussian Blur 2");
      drive(plan, api, e, "ADBE Gaussian Blur 2-0001", String(12 * s) + "*envelope(\"tail\",sp,fadeWeight,sv)*amp;");
    }
    if (p.effect === "projector") {
      // A shutter-rate flicker in real time: a projector's speed is physical.
      e = owned(plan, api, "ADBE Exposure2");
      drive(plan, api, e, "ADBE Exposure2-0003", "var f=Math.sin((Math.floor(age*14)+1)*91.7+seed*1.3)*43758.5453;f-=Math.floor(f);" + String(a / 100) + "*(f-.4)*envelope(\"weight\",sp,fadeWeight,sv)*amp;");
    }
  }
  global.MotionSignatureEffects = { required: required, apply: apply, param: param };
}($.global));
