/**
 * Clona (duplica) os keyframes selecionados.
 *
 * Argumentos esperados:
 * {
 *   mode: "repeat" | "mirror"
 * }
 * - "repeat": Copia as chaves selecionadas e as anexa logo apos o ultimo keyframe selecionado, na mesma ordem.
 * - "mirror": Copia as chaves selecionadas e as anexa logo apos o ultimo keyframe selecionado, na ordem reversa.
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

  /**
   * @param {Record<string, unknown>} args
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);

    var mode = args && args.mode === "mirror" ? "mirror" : "repeat";

    var props = comp.selectedProperties;
    var toProcess = [];
    var i, j, orig;

    for (i = 0; i < props.length; i += 1) {
      var propRaw = props[i];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      if (prop.propertyType === PropertyType.PROPERTY && prop.canVaryOverTime && prop.numKeys > 1) {
        var sel = prop.selectedKeys;
        if (sel && sel.length > 0) {
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
        var propObj = /** @type {Property} */ (processItem.property);
        var selArr = /** @type {number[]} */ (processItem.sel);

        // Duas capturas: uma para reescrever e outra guardada intacta, que e
        // para onde o rollback volta.
        intactos.push(MotionKeyframes.captureProperty(propObj));
        var snapshot = MotionKeyframes.captureProperty(propObj);
        var keys = snapshot.keys;

        // Extrai os keyframes selecionados
        var selectedKeys = [];
        for (j = 0; j < selArr.length; j += 1) {
          var selVal = selArr[j];
          if (typeof selVal !== "number") continue;
          var index = selVal - 1; // zero-based
          selectedKeys.push(/** @type {MotionCapturedKey} */ (keys[index]));
        }
        
        var firstKey = selectedKeys[0];
        if (!firstKey) continue;
        var firstTime = firstKey.time;
        
        var lastKey = selectedKeys[selectedKeys.length - 1];
        if (!lastKey) continue;
        var lastTime = lastKey.time;
        
        var secondKey = selectedKeys[1];
        var gap = secondKey ? (secondKey.time - firstKey.time) : (comp.frameDuration);
        var appendOffset = lastTime + gap; 

        var clonedKeys = [];

        if (mode === "mirror") {
          // Mirror inverte as chaves
          var endT = lastTime;
          
          var reversedKeys = [];
          for (j = 0; j < selectedKeys.length; j += 1) {
            orig = /** @type {MotionCapturedKey} */ (selectedKeys[j]);
            var reversed = /** @type {MotionCapturedKey} */ ({
              // Os tempos relativos para mirror:
              time: appendOffset + (endT - orig.time),
              value: orig.value,
              inInterpolation: orig.outInterpolation,
              outInterpolation: orig.inInterpolation,
              inEase: orig.outEase,
              outEase: orig.inEase,
              temporalContinuous: orig.temporalContinuous,
              temporalAutoBezier: orig.temporalAutoBezier,
              roving: orig.roving,
              selected: true, // selecionar os novos
              spatial: orig.spatial ? {
                inTangent: null,
                outTangent: null,
                continuous: orig.spatial.continuous,
                autoBezier: orig.spatial.autoBezier
              } : null,
              label: orig.label
            });

            if (orig.spatial && reversed.spatial) {
              /** @param {unknown} v @returns {any} */
              var flipSpatial = function(v) {
                if (!v) return v;
                if (typeof v === "number") return -v;
                if (v instanceof Array) {
                  var res = [];
                  for(var k=0; k<v.length; k++) res.push(-v[k]);
                  return res;
                }
                return v;
              };
              reversed.spatial.inTangent = flipSpatial(orig.spatial.outTangent);
              reversed.spatial.outTangent = flipSpatial(orig.spatial.inTangent);
            }
            reversedKeys.push(reversed);
          }
          reversedKeys.reverse(); // Para colocar em ordem cronologica
          clonedKeys = reversedKeys;
        } else {
          // Repeat (copia direta)
          for (j = 0; j < selectedKeys.length; j += 1) {
            orig = /** @type {MotionCapturedKey} */ (selectedKeys[j]);
            var copied = /** @type {MotionCapturedKey} */ ({
              time: appendOffset + (orig.time - firstTime),
              value: orig.value,
              inInterpolation: orig.inInterpolation,
              outInterpolation: orig.outInterpolation,
              inEase: orig.inEase,
              outEase: orig.outEase,
              temporalContinuous: orig.temporalContinuous,
              temporalAutoBezier: orig.temporalAutoBezier,
              roving: orig.roving,
              selected: true,
              spatial: orig.spatial ? {
                inTangent: orig.spatial.inTangent,
                outTangent: orig.spatial.outTangent,
                continuous: orig.spatial.continuous,
                autoBezier: orig.spatial.autoBezier
              } : null,
              label: orig.label
            });
            clonedKeys.push(copied);
          }
        }

        // Deselecionar keys originais do snapshot
        for (j = 0; j < keys.length; j += 1) {
          var k = keys[j];
          if (k) k.selected = false;
        }

        // Injetar clonedKeys ordenadamente em keys
        for (j = 0; j < clonedKeys.length; j += 1) {
          var c = clonedKeys[j];
          if (c) keys.push(c);
        }
        
        keys.sort(function(a, b) { return a.time - b.time; });

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
          new Error("CloneKeys falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var applyError = /** @type {Error & {motionCode?: string}} */ (new Error("CloneKeys falhou."));
      applyError.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw applyError;
    }

    return { changed: true, warnings: [], data: {} };
  }

  MotionRegistry.register("ae.keys.clone", { preflight: preflight, run: run });
})();
