/**
 * Copy the ease of selected keyframes and paste it, or their values, onto other
 * keyframes (`ae.keys.ease-copy`, `ae.keys.ease-paste`) — Animation Composer's
 * Keyframe Actions "Copy" / "Paste Easing" / "Paste Value".
 *
 * ## Why the ease is normalized
 *
 * A raw ease speed only means something for the segment it came from: 150/s on
 * an Opacity going 0→100 in 1 s is "1.5 × the average speed", but pasted as 150
 * on a Position moving 900 px it would be almost linear. Each copied speed is
 * stored as a multiple of its segment's average speed (speed × Δt / Δvalue,
 * per dimension, or over the vector length for a single ease), and pasting
 * multiplies back by the target segment's Δvalue / Δt. A segment that does not
 * change value has no average speed, so its ease is kept scaled by time only.
 * Influence is copied as is.
 *
 * The clipboard lives in this closure for the host session; copying writes
 * nothing. Pasting maps each selected property to the next copied property
 * (cycling) and each selected key to the next copied key, and refuses a
 * property with fewer selected keys than were copied, as Animation Composer does.
 */
(function () {
  /** @type {{type: number, keys: any[]}[] | null} */
  var clipboard = null;
  var ARGS = { target: true };

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return { code: code, message: message, recoverable: true, details: null }; }

  /** @param {CompItem} comp @returns {{property: Property, selected: number[]}[]} */
  function targets(comp) {
    var list = [], props = comp.selectedProperties, i;
    for (i = 0; i < props.length; i += 1) {
      var candidate = props[i];
      if (!candidate || !("canVaryOverTime" in candidate)) continue;
      var property = /** @type {Property} */ (candidate);
      if (property.propertyType !== PropertyType.PROPERTY || !property.canVaryOverTime || property.numKeys < 1) continue;
      var selected = property.selectedKeys;
      if (selected && selected.length > 0) list.push({ property: property, selected: selected.slice(0) });
    }
    return list;
  }

  /** Per-dimension change from `a` to `b`, or null when it cannot be measured.
   * @param {unknown} a @param {unknown} b @returns {number[]|null} */
  function difference(a, b) {
    if (typeof a === "number" && typeof b === "number") return [b - a];
    if (a instanceof Array && b instanceof Array && a.length === b.length) {
      var result = [], i;
      for (i = 0; i < a.length; i += 1) {
        if (typeof a[i] !== "number" || typeof b[i] !== "number") return null;
        result.push(/** @type {number} */ (b[i]) - /** @type {number} */ (a[i]));
      }
      return result;
    }
    return null;
  }
  /** @param {number[]} v @returns {number} */
  function length(v) { var sum = 0, i; for (i = 0; i < v.length; i += 1) { var x = v[i] || 0; sum += x * x; } return Math.sqrt(sum); }
  /** @param {number[]|null} d @returns {boolean} */
  function moves(d) { return d !== null && length(d) > 0; }

  /** Divisor for dimension `n` of an ease of `count` entries over change `d`.
   * @param {number[]} d @param {number} count @param {number} n @returns {number} */
  function change(d, count, n) { return count > 1 ? (d[n] || 0) : (d.length > 1 ? length(d) : (d[0] || 0)); }

  /** speed → multiple of the segment's average speed (or speed × Δt when d is null).
   * @param {MotionCapturedEase[]} eases @param {number} dt @param {number[]|null} d @returns {MotionCapturedEase[]} */
  function normalize(eases, dt, d) {
    var result = [], i;
    for (i = 0; i < eases.length; i += 1) {
      var e = /** @type {MotionCapturedEase} */ (eases[i]), c = d ? change(d, eases.length, i) : 1;
      result.push({ speed: c !== 0 ? dt * e.speed / c : 0, influence: e.influence });
    }
    return result;
  }
  /** The inverse of normalize for a target segment.
   * @param {MotionCapturedEase[]} eases @param {number} dt @param {number[]|null} d @returns {MotionCapturedEase[]} */
  function denormalize(eases, dt, d) {
    var result = [], i;
    for (i = 0; i < eases.length; i += 1) {
      var e = /** @type {MotionCapturedEase} */ (eases[i]), c = d ? change(d, eases.length, i) : 1;
      result.push({ speed: dt > 0 ? e.speed * c / dt : 0, influence: e.influence });
    }
    return result;
  }
  /** Same number of entries as the target ease: extra dimensions repeat the last.
   * @param {MotionCapturedEase[]} eases @param {number} count @returns {MotionCapturedEase[]} */
  function resize(eases, count) {
    var result = [], i;
    for (i = 0; i < count; i += 1) {
      var e = /** @type {MotionCapturedEase} */ (eases[Math.min(i, eases.length - 1)]);
      result.push({ speed: e.speed, influence: e.influence });
    }
    return result;
  }

  /** @param {MotionPropertySnapshot} snapshot @param {number} index zero-based @returns {any} */
  function captureKey(snapshot, index) {
    var keys = /** @type {any[]} */ (snapshot.keys), key = keys[index], before = keys[index - 1], after = keys[index + 1];
    var copied = /** @type {any} */ ({ value: key.value, inType: key.inInterpolation, outType: key.outInterpolation, scaledIn: null, scaledOut: null, normIn: null, normOut: null });
    if (before) {
      var dIn = difference(before.value, key.value), dtIn = key.time - before.time;
      copied.scaledIn = normalize(key.inEase, dtIn, null);
      if (moves(dIn)) copied.normIn = normalize(key.inEase, dtIn, dIn);
    }
    if (after) {
      var dOut = difference(key.value, after.value), dtOut = after.time - key.time;
      copied.scaledOut = normalize(key.outEase, dtOut, null);
      if (moves(dOut)) copied.normOut = normalize(key.outEase, dtOut, dOut);
    }
    return copied;
  }

  /** The ease a key gets on the target segment from a copied side.
   * @param {MotionCapturedEase[]|null} norm @param {MotionCapturedEase[]|null} scaled @param {number} dt @param {number[]|null} d @param {number} count @returns {MotionCapturedEase[]|null} */
  function easeFor(norm, scaled, dt, d, count) {
    if (!scaled) return null;
    var source = norm && moves(d) ? denormalize(resize(norm, count), dt, d) : denormalize(resize(scaled, count), dt, null);
    return source;
  }

  /** @param {Record<string, unknown>} args @param {boolean} pasting @returns {MotionCommandFailure|null} */
  function validate(args, pasting) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !(pasting && Object.prototype.hasOwnProperty.call(ARGS, key))) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de suavizacao desconhecido.");
      }
    }
    if (pasting && args.target !== "ease" && args.target !== "value") return failure(MotionContracts.ERROR.INVALID_PRESET, "Escolha colar a suavizacao ou o valor.");
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    var list = targets(/** @type {CompItem} */ (comp));
    if (!list.length) return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione keyframes.");
    if (!pasting) return null;
    if (!clipboard || !clipboard.length) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Copie a suavizacao de algum keyframe primeiro.");
    var owners = MotionPreflight.unlockedPropertyOwners(comp.selectedProperties);
    if (owners) return owners;
    for (var i = 0; i < list.length; i += 1) {
      var source = /** @type {any} */ (clipboard[i % clipboard.length]), target = /** @type {any} */ (list[i]);
      if (target.selected.length < source.keys.length) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione pelo menos " + source.keys.length + " keyframe(s) em cada propriedade, tantos quantos foram copiados.");
      if (args.target === "value" && target.property.propertyValueType !== source.type) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Os valores copiados so podem ser colados em propriedades do mesmo tipo.");
    }
    return null;
  }

  /** @returns {MotionCommandResult} */
  function copy() {
    var comp = /** @type {CompItem} */ (app.project.activeItem), list = /** @type {any[]} */ (targets(comp)), copied = [], i, j;
    for (i = 0; i < list.length; i += 1) {
      var snapshot = MotionKeyframes.captureProperty(list[i].property), keys = [];
      for (j = 0; j < list[i].selected.length; j += 1) keys.push(captureKey(snapshot, list[i].selected[j] - 1));
      copied.push({ type: list[i].property.propertyValueType, keys: keys });
    }
    clipboard = copied;
    return { changed: false, warnings: [], data: { properties: copied.length } };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function paste(args) {
    if (!clipboard) throw new Error("Nada copiado.");
    var comp = /** @type {CompItem} */ (app.project.activeItem), list = /** @type {any[]} */ (targets(comp)), originals = /** @type {any[]} */ ([]), edits = /** @type {any[]} */ ([]), i, j;
    // Every target is captured before the first write: AE can clear sibling selections while a property is rebuilt.
    for (i = 0; i < list.length; i += 1) { originals.push(MotionKeyframes.captureProperty(list[i].property)); edits.push(MotionKeyframes.captureProperty(list[i].property)); }
    var pasted = 0;
    try {
      for (i = 0; i < list.length; i += 1) {
        var source = /** @type {any} */ (clipboard[i % clipboard.length]), snapshot = edits[i], keys = /** @type {any[]} */ (snapshot.keys), original = /** @type {any[]} */ (originals[i].keys);
        for (j = 0; j < list[i].selected.length; j += 1) {
          var index = list[i].selected[j] - 1, key = keys[index], copied = source.keys[j % source.keys.length];
          if (args.target === "value") { key.value = copied.value; pasted += 1; continue; }
          var count = key.inEase.length, before = original[index - 1], after = original[index + 1], here = original[index];
          var easeIn = before ? easeFor(copied.normIn, copied.scaledIn, here.time - before.time, difference(before.value, here.value), count) : null;
          var easeOut = after ? easeFor(copied.normOut, copied.scaledOut, after.time - here.time, difference(here.value, after.value), count) : null;
          if (easeIn) key.inEase = easeIn;
          if (easeOut) key.outEase = easeOut;
          key.inInterpolation = copied.inType; key.outInterpolation = copied.outType;
          // An auto-Bezier key would have its pasted ease recomputed by After Effects.
          key.temporalAutoBezier = false;
          pasted += 1;
        }
        MotionKeyframes.restoreProperty(snapshot, null);
      }
      MotionKeyframes.restoreSelections(edits);
    } catch (error) {
      var rollbackFailed = false;
      for (i = originals.length - 1; i >= 0; i -= 1) { try { MotionKeyframes.restoreProperty(originals[i], null); } catch (restoreError) { rollbackFailed = true; } }
      try { MotionKeyframes.restoreSelections(originals); } catch (selectionError) { rollbackFailed = true; }
      var failed = /** @type {Error & {motionCode?: string}} */ (new Error(rollbackFailed ? "Colar falhou e o estado anterior nao pode ser restaurado." : "Colar falhou."));
      failed.motionCode = rollbackFailed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failed;
    }
    return { changed: pasted > 0, warnings: [], data: { appliedCount: pasted, target: args.target } };
  }

  MotionRegistry.register("ae.keys.ease-copy", { preflight: function (args) { return validate(args, false); }, run: copy });
  MotionRegistry.register("ae.keys.ease-paste", { preflight: function (args) { return validate(args, true); }, run: paste });
})();
