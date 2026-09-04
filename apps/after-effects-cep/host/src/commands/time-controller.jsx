(function() {
  /* global Property */
  var ALLOWED = {
    applyTo: true,
    speedPercent: true,
    offsetFrames: true,
    reverse: true,
    freeze: true,
    freezeFrame: true
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: details || null };
  }

  /** @param {unknown} value @returns {boolean} */
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {unknown} value @returns {boolean} */
  function isInteger(value) {
    return isFiniteNumber(value) && Math.floor(/** @type {number} */ (value)) === value;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Time Controller desconhecido.", { field: key });
      }
    }
    if (args.applyTo !== "layer" && args.applyTo !== "properties") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Destino do Time Controller invalido.", { field: "applyTo" });
    }
    if (!isFiniteNumber(args.speedPercent) || /** @type {number} */ (args.speedPercent) <= 0 || /** @type {number} */ (args.speedPercent) > 10000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Velocidade do Time Controller invalida.", { field: "speedPercent" });
    }
    if (!isInteger(args.offsetFrames) || /** @type {number} */ (args.offsetFrames) < -100000 || /** @type {number} */ (args.offsetFrames) > 100000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset do Time Controller invalido.", { field: "offsetFrames" });
    }
    if (typeof args.reverse !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Reverse do Time Controller precisa ser booleano.", { field: "reverse" });
    }
    if (typeof args.freeze !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Freeze do Time Controller precisa ser booleano.", { field: "freeze" });
    }
    if (!isInteger(args.freezeFrame) || /** @type {number} */ (args.freezeFrame) < 0 || /** @type {number} */ (args.freezeFrame) > 100000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frame de congelamento invalido.", { field: "freezeFrame" });
    }
    return null;
  }

  /** @param {Property} property @returns {boolean} */
  function isSupportedExpressionProperty(property) {
    if (!property || !(property instanceof Property)) return false;
    if (property.propertyType !== PropertyType.PROPERTY || property.canSetExpression !== true) return false;
    if (typeof PropertyValueType !== "undefined") {
      return (
        property.propertyValueType !== PropertyValueType.NO_VALUE &&
        property.propertyValueType !== PropertyValueType.CUSTOM_VALUE &&
        property.propertyValueType !== PropertyValueType.MARKER &&
        property.propertyValueType !== PropertyValueType.TEXT_DOCUMENT
      );
    }
    return true;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var i;
    var prop;
    var layer;
    if (args.applyTo === "properties") {
      if (!comp.selectedProperties || comp.selectedProperties.length === 0) {
        return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma propriedade.", null);
      }
      for (i = 0; i < comp.selectedProperties.length; i += 1) {
        prop = /** @type {Property} */ (comp.selectedProperties[i]);
        if (!isSupportedExpressionProperty(prop)) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem propriedade sem suporte a expressao de tempo.", null);
        }
        if (prop.expression !== "" && !MotionExpressions.isManagedTimeController(prop.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A selecao contem expressao de usuario.", null);
        }
      }
      return null;
    }

    if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }
    for (i = 0; i < comp.selectedLayers.length; i += 1) {
      layer = /** @type {any} */ (comp.selectedLayers[i]);
      if (!layer || layer.canSetTimeRemapEnabled !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada sem Time Remap scriptavel.", null);
      }
      if (layer.timeRemapEnabled === true) {
        prop = /** @type {Property} */ (layer.property("ADBE Time Remapping"));
        if (prop instanceof Property && prop.expression !== "" && !MotionExpressions.isManagedTimeController(prop.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Time Remap contem expressao de usuario.", null);
        }
      }
    }
    return null;
  }

  /**
   * O After Effects nao lanca quando recusa uma expressao: ele guarda o motivo em
   * expressionError e deixa a propriedade acesa e quebrada. Sem ler esse campo o
   * comando responderia ok com a propriedade em erro na timeline do usuario.
   *
   * @param {Property} property
   * @param {string} expression
   * @returns {void}
   */
  function applyExpression(property, expression) {
    property.expression = expression;
    if (typeof property.expressionError === "string" && property.expressionError !== "") {
      throw new Error("After Effects recusou a expressao gerenciada.");
    }
    property.expressionEnabled = true;
    if (property.expressionEnabled !== true) {
      throw new Error("After Effects nao habilitou a expressao gerenciada.");
    }
  }

  /** @param {Property} property @returns {{ property: Property, expression: string, expressionEnabled: boolean }} */
  function snapshotProperty(property) {
    return {
      property: property,
      expression: property.expression,
      expressionEnabled: property.expressionEnabled
    };
  }

  /** @param {Array<{ property: Property, expression: string, expressionEnabled: boolean }>} snapshots @returns {void} */
  function restoreProperties(snapshots) {
    var i;
    var snapshot;
    for (i = snapshots.length - 1; i >= 0; i -= 1) {
      snapshot = snapshots[i];
      if (!snapshot) continue;
      snapshot.property.expression = snapshot.expression;
      snapshot.property.expressionEnabled = snapshot.expressionEnabled;
    }
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var expr = MotionExpressions.renderTimeController({
      offsetFrames: args.offsetFrames,
      speedPercent: args.speedPercent,
      reverse: args.reverse,
      freeze: args.freeze,
      freezeFrame: args.freezeFrame
    });
    var snapshots = [];
    var layerSnapshots = [];
    var changed = false;
    var unchanged = 0;
    var i;
    var prop;
    var layer;

    try {
      if (args.applyTo === "properties") {
        for (i = 0; i < comp.selectedProperties.length; i += 1) {
          prop = /** @type {Property} */ (comp.selectedProperties[i]);
          if (prop.expression === expr && prop.expressionEnabled === true) {
            unchanged += 1;
            continue;
          }
          snapshots.push(snapshotProperty(prop));
          applyExpression(prop, expr);
          changed = true;
        }
      } else {
        for (i = 0; i < comp.selectedLayers.length; i += 1) {
          layer = /** @type {any} */ (comp.selectedLayers[i]);
          layerSnapshots.push({ layer: layer, timeRemapEnabled: layer.timeRemapEnabled });
          if (layer.timeRemapEnabled !== true) layer.timeRemapEnabled = true;
          prop = /** @type {Property} */ (layer.property("ADBE Time Remapping"));
          if (!(prop instanceof Property)) {
            throw new Error("Time Remap indisponivel apos habilitar.");
          }
          if (prop.expression === expr && prop.expressionEnabled === true) {
            unchanged += 1;
            continue;
          }
          snapshots.push(snapshotProperty(prop));
          applyExpression(prop, expr);
          changed = true;
        }
      }
    } catch (e) {
      try {
        restoreProperties(snapshots);
        for (i = layerSnapshots.length - 1; i >= 0; i -= 1) {
          var layerSnapshot = layerSnapshots[i];
          if (!layerSnapshot) continue;
          layerSnapshot.layer.timeRemapEnabled = layerSnapshot.timeRemapEnabled;
        }
      } catch (rollbackError) {
        var tagged = /** @type {Error & {motionCode?: string}} */ (rollbackError);
        tagged.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw tagged;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Time Controller falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return { changed: changed, warnings: [], data: { appliedCount: snapshots.length, unchangedCount: unchanged } };
  }

  MotionRegistry.register("ae.time.controller", {
    preflight: preflight,
    run: run
  });
})();
