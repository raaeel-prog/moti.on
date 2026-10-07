/** Native text outlines shared by proximity rigs and the word-box morph.
 * Correspondence is prepared once from AE's composer; paths remain exact. */
/** @param {any} global */
(function (global) {
  var host = /** @type {any} */ (global);
  /** @param {any} a @param {any} b @returns {number[]} */
  function matrixMultiply(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
  /** @param {any} group @returns {number[]} */
  function groupMatrix(group) {
    var t = group.property("ADBE Vector Transform Group"); if (!t) return [1, 0, 0, 1, 0, 0];
    var a = t.property("ADBE Vector Anchor").value, p = t.property("ADBE Vector Position").value, s = t.property("ADBE Vector Scale").value;
    var r = t.property("ADBE Vector Rotation").value * Math.PI / 180, c = Math.cos(r), z = Math.sin(r);
    var skew = t.property("ADBE Vector Skew"); if (skew && Math.abs(skew.value) > .000001) throw new Error("Unsupported glyph skew");
    var m = /** @type {any} */ ([c * s[0] / 100, z * s[0] / 100, -z * s[1] / 100, c * s[1] / 100, 0, 0]);
    m[4] = p[0] - m[0] * a[0] - m[2] * a[1]; m[5] = p[1] - m[1] * a[0] - m[3] * a[1];
    if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) throw new Error("Singular glyph transform");
    return m;
  }
  /** @param {any} contents @param {number[]} matrix @param {any[]} output */
  function collectContours(contents, matrix, output) {
    for (var i = 1; i <= contents.numProperties; i += 1) {
      var p = contents.property(i);
      if (p.matchName === "ADBE Vector Shape - Group") {
        var shape = p.property("ADBE Vector Shape").value;
        if (!shape.closed || shape.vertices.length < 2) throw new Error("Unsupported open glyph path");
        output.push(host.MotionMorphGeometry.transform(shape, matrix));
      } else if (p.matchName === "ADBE Vector Group") collectContours(p.property("ADBE Vectors Group"), matrixMultiply(matrix, groupMatrix(p)), output);
      else if (p.matchName !== "ADBE Vector Graphic - Fill" && p.matchName !== "ADBE Vector Graphic - Stroke" && p.matchName !== "ADBE Vector Filter - Merge") throw new Error("Unsupported glyph operator");
    }
  }
  /** @param {any[]} shapes @returns {any} */
  function bounds(shapes) {
    var result = /** @type {any} */ (null);
    for (var i = 0; i < shapes.length; i += 1) {
      var b = host.MotionMorphGeometry.bounds(shapes[i]);
      if (!result) result = {left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height};
      else { result.left = Math.min(result.left, b.left); result.top = Math.min(result.top, b.top); result.right = Math.max(result.right, b.left + b.width); result.bottom = Math.max(result.bottom, b.top + b.height); }
    }
    if (!result) throw new Error("Empty glyph");
    result.width = result.right - result.left; result.height = result.bottom - result.top;
    return result;
  }
  /** @param {any} comp @returns {any[]} */
  function allLayers(comp) { var a = []; for (var i = 1; i <= comp.numLayers; i += 1) a.push(comp.layer(i)); return a; }
  /** @param {any[]} a @param {any} item @returns {boolean} */
  function contains(a, item) { for (var i = 0; i < a.length; i += 1) if (a[i] === item) return true; return false; }
  /** @param {any[]} created @param {any} layer */
  function forget(created, layer) { for (var i = created.length - 1; i >= 0; i -= 1) if (created[i] === layer) created.splice(i, 1); }
  /** @param {string} content @returns {any[]} */
  function characters(content) {
    var chars = [], textIndex = 0;
    for (var i = 0; i < content.length; i += 1) {
      var sourceIndex = i, code = content.charCodeAt(i), character = content.charAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 >= content.length || content.charCodeAt(i + 1) < 0xdc00 || content.charCodeAt(i + 1) > 0xdfff) throw new Error("Invalid text surrogate");
        i += 1; character += content.charAt(i);
      } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("Invalid text surrogate");
      // AE 26.5 native probe: spaces count, line breaks do not, and a valid
      // surrogate pair is one selector character (not two UTF-16 units).
      if (character !== "\r" && character !== "\n") textIndex += 1;
      if (!/\s/.test(character)) chars.push({character: character, sourceIndex: sourceIndex, textIndex: textIndex});
    }
    return chars;
  }
  /** Extracts one exact, layer-local compound glyph per non-whitespace character.
   * The caller owns its Undo boundary. Only conversion temporaries enter created;
   * they are removed here, or retained there if cleanup itself fails.
   * @param {any} comp @param {any} source @param {any[]} [created] @returns {any} */
  function extract(comp, source, created) {
    if (!host.MotionMorphGeometry || !host.MotionMenuCommand) throw new Error("Text outlines capability unavailable");
    var command = host.MotionMenuCommand.resolver(["Create Shapes from Text", "Criar formas a partir do texto", "Criar formas a partir de texto"]);
    if (!command) throw new Error("Text outlines command unavailable");
    var prop = source.property("ADBE Text Properties").property("ADBE Text Document"), chars = characters(String(prop.value.text));
    var selected = [], selection = comp.selectedLayers, time = comp.time, owned = [], temporaries = created || [], result;
    var failure = /** @type {any} */ (null);
    for (var si = 0; si < selection.length; si += 1) selected.push(selection[si]);
    try {
      var temp = source.duplicate(); owned.push(temp); temporaries.push(temp); temp.parent = null; temp.comment = "";
      var animators = temp.property("ADBE Text Properties").property("ADBE Text Animators");
      while (animators.numProperties) animators.property(animators.numProperties).remove();
      var tr = temp.property("ADBE Transform Group"), names = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
      var values = [[0, 0], [0, 0], [100, 100], 0, 100];
      for (var i = 0; i < names.length; i += 1) { var p = tr.property(String(names[i])); if (names[i] === "ADBE Position" && p.dimensionsSeparated) p.dimensionsSeparated = false; p.expression = ""; p.expressionEnabled = false; for (var k = p.numKeys; k >= 1; k -= 1) p.removeKey(k); p.setValue(values[i]); }
      var before = allLayers(comp), added = [];
      try { host.MotionMenuCommand.executarComSelecao(command.id, temp, comp); }
      finally {
        var now = allLayers(comp);
        for (i = 0; i < now.length; i += 1) if (!contains(before, now[i])) { added.push(now[i]); owned.push(now[i]); temporaries.push(now[i]); }
      }
      if (added.length !== 1 || added[0].matchName !== "ADBE Vector Layer") throw new Error("Native outlines did not create one shape layer");
      var vector = added[0], root = vector.property("ADBE Root Vectors Group"), glyphs = /** @type {any[]} */ ([]), vertices = 0;
      vector.enabled = false;
      for (i = 1; i <= root.numProperties; i += 1) {
        var group = root.property(i); if (group.matchName !== "ADBE Vector Group") throw new Error("Unexpected native outline root");
        var contours = /** @type {any[]} */ ([]); collectContours(group.property("ADBE Vectors Group"), groupMatrix(group), contours);
        if (contours.length) {
          var b = bounds(contours);
          glyphs.push({contours: contours, bounds: b, center: [b.left + b.width / 2, b.top + b.height / 2]});
          for (var j = 0; j < contours.length; j += 1) vertices += contours[j].vertices.length;
        }
      }
      if (chars.length !== glyphs.length) throw new Error("Ambiguous native glyph mapping; ligatures or complex text unsupported");
      if (vertices > 12000) throw new Error("Morph geometry exceeds bounded host budget");
      for (i = 0; i < glyphs.length; i += 1) { glyphs[i].character = chars[i].character; glyphs[i].sourceIndex = chars[i].sourceIndex; glyphs[i].textIndex = chars[i].textIndex; }
      result = {glyphs: glyphs, vertexCount: vertices};
    } catch (error) {
      failure = error;
    } finally {
      var cleanupErrors = [];
      for (var oi = owned.length - 1; oi >= 0; oi -= 1) {
        // A deleted native Layer cannot safely participate in later equality
        // checks. Release the live reference before the destructive operation.
        var temporary = owned[oi]; forget(temporaries, temporary);
        try { temporary.remove(); }
        catch (cleanupError) { temporaries.push(temporary); cleanupErrors.push(String(cleanupError)); }
      }
      var surviving = allLayers(comp);
      for (var li = 0; li < surviving.length; li += 1) surviving[li].selected = false;
      for (si = 0; si < selected.length; si += 1) if (contains(surviving, selected[si])) selected[si].selected = true;
      comp.time = time;
      if (cleanupErrors.length) {
        var originalFailure = failure ? String(failure) : "";
        failure = new Error("Text outlines cleanup failed: " + cleanupErrors.join("; ") + (originalFailure ? "; original failure: " + originalFailure : ""));
        failure.motionCode = "ROLLBACK_FAILED";
      }
    }
    if (failure) throw failure;
    return result;
  }
  global.MotionTextGlyphOutlines = {extract: extract, bounds: bounds};
})($.global);
