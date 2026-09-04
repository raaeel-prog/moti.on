/* global KeyframeInterpolationType */
/**
 * Aplica curva Bézier cúbica a keyframes selecionados.
 *
 * CHMS-018: Suavizador de keyframes com curva editável.
 */
(function () {
  var REQUIRED_ARGS = {
    x1: true,
    y1: true,
    x2: true,
    y2: true,
    applyIn: true,
    applyOut: true
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} value @returns {boolean} */
  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Ease desconhecido.", { field: key });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Ease ausente.", { field: key });
      }
    }
    if (!isNumber(args.x1) || !isNumber(args.y1) || !isNumber(args.x2) || !isNumber(args.y2)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de Ease invalida (deve ser numero).", null);
    }
    var x1 = /** @type {number} */ (args.x1);
    var x2 = /** @type {number} */ (args.x2);
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Handles X devem estar entre 0 e 1.", null);
    }
    if (typeof args.applyIn !== "boolean" || typeof args.applyOut !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Flags applyIn/applyOut invalidas.", null);
    }
    return null;
  }

  /**
   * @param {Property} property
   * @param {number} keyIndex
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {boolean} applyIn
   * @param {boolean} applyOut
   * @returns {boolean} true quando o keyframe recebeu a curva.
   */
  function applyEaseToKeyframe(property, keyIndex, x1, y1, x2, y2, applyIn, applyOut) {
    var propertyValueType = property.propertyValueType;

    // Recusar propriedades discretas que nao suportam Ease
    if (
      propertyValueType === PropertyValueType.NO_VALUE ||
      propertyValueType === PropertyValueType.CUSTOM_VALUE ||
      propertyValueType === PropertyValueType.MARKER ||
      propertyValueType === PropertyValueType.TEXT_DOCUMENT
    ) {
      return false;
    }

    var numKeys = property.numKeys;

    var currentInEase = property.keyInTemporalEase(keyIndex);
    var currentOutEase = property.keyOutTemporalEase(keyIndex);

    var dimensions = currentInEase.length; // 1 para propriedades escalares, 2/3 para vetores multidimensionais
    var newInEase = [];
    var newOutEase = [];
    var d;

    // In Ease (segmento anterior: keyIndex - 1 ate keyIndex)
    if (applyIn && keyIndex > 1) {
      var inDuration = property.keyTime(keyIndex) - property.keyTime(keyIndex - 1);
      var inVal1 = property.keyValue(keyIndex - 1);
      var inVal2 = property.keyValue(keyIndex);
      var inVal1Arr = /** @type {number[]} */ (inVal1);
      var inVal2Arr = /** @type {number[]} */ (inVal2);
      
      for (d = 0; d < dimensions; d++) {
        var diffIn = 0;
        if (dimensions === 1) {
          diffIn = Number(inVal2) - Number(inVal1);
        } else if (inVal1 && inVal2 && typeof inVal1Arr[d] === "number") {
          diffIn = Number(inVal2Arr[d]) - Number(inVal1Arr[d]);
        }
        var easeInResult = MotionKeyframes.curveToEase({ x1: x1, y1: y1, x2: x2, y2: y2 }, inDuration, diffIn);
        newInEase.push(new KeyframeEase(easeInResult.inSpeed, easeInResult.inInfluence));
      }
    } else {
      for (d = 0; d < dimensions; d++) newInEase.push(/** @type {KeyframeEase} */ (currentInEase[d]));
    }

    // Out Ease (segmento proximo: keyIndex ate keyIndex + 1)
    if (applyOut && keyIndex < numKeys) {
      var outDuration = property.keyTime(keyIndex + 1) - property.keyTime(keyIndex);
      var outVal1 = property.keyValue(keyIndex);
      var outVal2 = property.keyValue(keyIndex + 1);
      var outVal1Arr = /** @type {number[]} */ (outVal1);
      var outVal2Arr = /** @type {number[]} */ (outVal2);
      
      for (d = 0; d < dimensions; d++) {
        var diffOut = 0;
        if (dimensions === 1) {
          diffOut = Number(outVal2) - Number(outVal1);
        } else if (outVal1 && outVal2 && typeof outVal1Arr[d] === "number") {
          diffOut = Number(outVal2Arr[d]) - Number(outVal1Arr[d]);
        }
        var easeOutResult = MotionKeyframes.curveToEase({ x1: x1, y1: y1, x2: x2, y2: y2 }, outDuration, diffOut);
        newOutEase.push(new KeyframeEase(easeOutResult.outSpeed, easeOutResult.outInfluence));
      }
    } else {
      for (d = 0; d < dimensions; d++) newOutEase.push(/** @type {KeyframeEase} */ (currentOutEase[d]));
    }

    // Keyframes Hold perdem o estado Hold ao receber Ease (regra de After Effects),
    // o usuario esta editando e confirmando que quer bezier.
    property.setTemporalEaseAtKey(keyIndex, newInEase, newOutEase);
    property.setInterpolationTypeAtKey(
      keyIndex,
      applyIn && keyIndex > 1 ? KeyframeInterpolationType.BEZIER : property.keyInInterpolationType(keyIndex),
      applyOut && keyIndex < numKeys ? KeyframeInterpolationType.BEZIER : property.keyOutInterpolationType(keyIndex)
    );
    return true;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandFailure|null}
   */
  function preflight(args) {
    var argsError = validateArgs(args);
    if (argsError) return argsError;

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }

    var comp = /** @type {CompItem} */ (activeItem);
    var selectedProps = comp.selectedProperties;
    var hasValidProp = false;
    for (var i = 0; i < selectedProps.length; i++) {
      var propRaw = selectedProps[i];
      if (propRaw && "canVaryOverTime" in propRaw) {
        var prop = /** @type {Property} */ (propRaw);
        if (prop.canVaryOverTime && prop.selectedKeys && prop.selectedKeys.length > 0) {
          hasValidProp = true;
          break;
        }
      }
    }

    if (!hasValidProp) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhum keyframe selecionado.", null);
    }

    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var x1 = /** @type {number} */ (args.x1);
    var y1 = /** @type {number} */ (args.y1);
    var x2 = /** @type {number} */ (args.x2);
    var y2 = /** @type {number} */ (args.y2);
    var applyIn = /** @type {boolean} */ (args.applyIn);
    var applyOut = /** @type {boolean} */ (args.applyOut);

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedProps = comp.selectedProperties;
    var appliedCount = 0;
    /** Copias intactas, capturadas antes de escrever: e para onde o rollback volta. */
    var intactos = [];

    try {
    for (var p = 0; p < selectedProps.length; p++) {
      var propRaw = selectedProps[p];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      var selectedKeys = prop.selectedKeys;
      if (!selectedKeys) continue;
      if (MotionKeyframes.isSupportedProperty(prop)) intactos.push(MotionKeyframes.captureProperty(prop));
      for (var k = 0; k < selectedKeys.length; k++) {
        var keyIndex = selectedKeys[k];
        if (typeof keyIndex === "number") {
          if (applyEaseToKeyframe(prop, keyIndex, x1, y1, x2, y2, applyIn, applyOut)) appliedCount += 1;
        }
      }
    }

    } catch (easeError) {
      var rollbackFailed = false;
      var r;
      for (r = intactos.length - 1; r >= 0; r -= 1) {
        try {
          var intacto = intactos[r];
          if (intacto) MotionKeyframes.restoreProperty(intacto, null);
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Ease falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Ease falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return { changed: appliedCount > 0, warnings: [], data: { appliedCount: appliedCount } };
  }

  MotionRegistry.register("ae.keys.ease.apply", { preflight: preflight, run: run });
})();
