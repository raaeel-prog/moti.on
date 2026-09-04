/**
 * Reverte o tempo dos keyframes selecionados.
 */
(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  /** @returns {MotionCommandFailure|null} */
  function preflight() {
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    return null;
  }

  function run() {
    var comp = /** @type {CompItem} */ (app.project.activeItem);

    var props = comp.selectedProperties;
    var toProcess = [];
    var i, j;

    for (i = 0; i < props.length; i += 1) {
      var propRaw = props[i];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      if (prop.propertyType === PropertyType.PROPERTY && prop.canVaryOverTime && prop.numKeys > 1) {
        var sel = prop.selectedKeys;
        if (sel && sel.length > 1) {
          toProcess.push({ property: prop, sel: sel });
        }
      }
    }

    if (toProcess.length === 0) {
      return { changed: false, warnings: [], data: {} };
    }

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    /** @type {MotionPropertySnapshot[]} */
    var intactos = [];

    try {
      for (i = 0; i < toProcess.length; i += 1) {
        var processItem = toProcess[i];
        if (!processItem) continue;
        prop = processItem.property;
        sel = processItem.sel;

        var propObj = /** @type {Property} */ (prop);
        var selArr = /** @type {number[]} */ (sel);

        // Duas capturas: uma para reescrever e outra guardada intacta, que e
        // para onde o rollback volta.
        intactos.push(MotionKeyframes.captureProperty(propObj));
        var snapshot = MotionKeyframes.captureProperty(propObj);
        var keys = snapshot.keys;

        // Extrai os keyframes selecionados
        var selectedKeys = [];
        var selectedIndices = [];
        var firstSel = selArr[0];
        if (typeof firstSel !== "number") continue;
        var startT = propObj.keyTime(firstSel);
        
        var lastSel = selArr[selArr.length - 1];
        if (typeof lastSel !== "number") continue;
        var endT = propObj.keyTime(lastSel);

        for (j = 0; j < selArr.length; j += 1) {
          var selVal = selArr[j];
          if (typeof selVal !== "number") continue;
          var index = selVal - 1; // zero-based
          selectedIndices.push(index);
          selectedKeys.push(keys[index]);
        }

        // Calcula os novos tempos e inverte as propriedades direcionais
        var reversedKeys = [];
        for (j = 0; j < selectedKeys.length; j += 1) {
          var orig = /** @type {MotionCapturedKey} */ (selectedKeys[j]);

          var reversed = /** @type {MotionCapturedKey} */ ({
            time: endT - (orig.time - startT),
            value: orig.value,
            inInterpolation: orig.outInterpolation,
            outInterpolation: orig.inInterpolation,
            inEase: orig.outEase,
            outEase: orig.inEase,
            temporalContinuous: orig.temporalContinuous,
            temporalAutoBezier: orig.temporalAutoBezier,
            roving: orig.roving,
            selected: orig.selected,
            spatial: orig.spatial ? {
              inTangent: null,
              outTangent: null,
              continuous: orig.spatial.continuous,
              autoBezier: orig.spatial.autoBezier
            } : null,
            label: orig.label
          });
          
          if (orig.spatial && reversed.spatial) {
            // Invert vector direction for spatial tangents
            /** @param {unknown} v */
            var flipSpatial = function(v) {
              if (!v) return v;
              if (typeof v === "number") return -v;
              if (v instanceof Array) {
                var res = [];
                for (var k = 0; k < v.length; k += 1) {
                  res.push(-v[k]);
                }
                return res;
              }
              return v;
            };

            reversed.spatial.inTangent = flipSpatial(orig.spatial.outTangent);
            reversed.spatial.outTangent = flipSpatial(orig.spatial.inTangent);
          }
          reversedKeys.push(reversed);
        }

        // Apply back to keys array in their new positions
        // Wait, if we just swap them in place, the times will match the order, but we must ensure keys are sorted by time!
        // The selection might be reversed in time, but the array indices MUST be strictly ascending in time.
        // Actually, if we just reverse the selectedKeys array, the times will be ascending because we map (endT - orig.time).
        // Since orig.time is ascending, -orig.time is descending, so (endT - orig.time) is descending.
        // Thus, we MUST reverse the array to make times ascending again so they fit back into the same indices perfectly!
        reversedKeys.reverse();

        for (j = 0; j < selectedIndices.length; j += 1) {
          var selIndex = selectedIndices[j];
          if (typeof selIndex !== "number") continue;
          var rKey = reversedKeys[j];
          if (rKey) keys[selIndex] = rKey;
        }

        MotionKeyframes.restoreProperty(snapshot, null);
      }
    } catch (e) {
      var rollbackFailed = false;
      // Restaura na ordem inversa: a ultima propriedade tocada e a que pode
      // estar meio-escrita.
      for (i = intactos.length - 1; i >= 0; i -= 1) {
        try {
          var intacto = intactos[i];
          if (intacto) MotionKeyframes.restoreProperty(intacto, null);
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("ReverseKeys falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var applyError = /** @type {Error & {motionCode?: string}} */ (new Error("ReverseKeys falhou."));
      applyError.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw applyError;
    }

    return { changed: true, warnings: [], data: {} };
  }

  MotionRegistry.register("ae.keys.reverse", { preflight: preflight, run: run });
})();
