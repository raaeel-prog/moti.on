(function() {
  /* global Property MarkerValue */
  var ALLOWED = {
    inMarkerName: true,
    outMarkerName: true,
    loopType: true,
    autoCreateMarkers: true,
    clampToLayer: true
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: details || null };
  }

  /** @param {unknown} value @returns {boolean} */
  function isMarkerName(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 80 && !/^\s|\s$/.test(value);
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Marker Loop desconhecido.", { field: key });
      }
    }
    if (!isMarkerName(args.inMarkerName)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do marker inicial invalido.", { field: "inMarkerName" });
    }
    if (!isMarkerName(args.outMarkerName)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do marker final invalido.", { field: "outMarkerName" });
    }
    if (args.inMarkerName === args.outMarkerName) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Markers inicial e final precisam ser distintos.", { field: "outMarkerName" });
    }
    if (args.loopType !== "cycle" && args.loopType !== "pingpong") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tipo de Marker Loop invalido.", { field: "loopType" });
    }
    if (typeof args.autoCreateMarkers !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "autoCreateMarkers precisa ser booleano.", { field: "autoCreateMarkers" });
    }
    if (typeof args.clampToLayer !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "clampToLayer precisa ser booleano.", { field: "clampToLayer" });
    }
    return null;
  }

  /** @param {Property} markerProp @param {string} name @returns {number} */
  function findMarkerTime(markerProp, name) {
    var i;
    var marker;
    for (i = 1; i <= markerProp.numKeys; i += 1) {
      marker = /** @type {MarkerValue} */ (markerProp.keyValue(i));
      if (marker && marker.comment === name) return markerProp.keyTime(i);
    }
    return NaN;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedLayers = comp.selectedLayers;
    var i;
    var layer;
    var markerProp;
    var inTime;
    var outTime;
    if (!selectedLayers || selectedLayers.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }
    for (i = 0; i < selectedLayers.length; i += 1) {
      layer = /** @type {any} */ (selectedLayers[i]);
      if (!layer || layer.canSetTimeRemapEnabled !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada sem Time Remap scriptavel.", null);
      }
      markerProp = /** @type {Property} */ (layer.property("ADBE Marker"));
      if (!(markerProp instanceof Property)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe markers scriptaveis.", null);
      }
      if (args.autoCreateMarkers !== true) {
        inTime = findMarkerTime(markerProp, /** @type {string} */ (args.inMarkerName));
        outTime = findMarkerTime(markerProp, /** @type {string} */ (args.outMarkerName));
        if (!isFinite(inTime) || !isFinite(outTime) || outTime <= inTime) {
          return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Markers de loop ausentes ou fora de ordem.", null);
        }
      }
      if (layer.timeRemapEnabled === true) {
        var tr = /** @type {Property} */ (layer.property("ADBE Time Remapping"));
        if (
          tr instanceof Property &&
          tr.expression !== "" &&
          !MotionExpressions.isManagedMarkerLoop(tr.expression) &&
          !MotionExpressions.isManagedTimeController(tr.expression)
        ) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Time Remap contem expressao de usuario.", null);
        }
      }
    }
    return null;
  }

  /**
   * O After Effects nao lanca quando recusa uma expressao: guarda o motivo em
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
    return { property: property, expression: property.expression, expressionEnabled: property.expressionEnabled };
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

  /** @param {Property} markerProp @param {string} name @param {number} time @returns {void} */
  function removeMarkerByNameAndTime(markerProp, name, time) {
    var i;
    var marker;
    for (i = markerProp.numKeys; i >= 1; i -= 1) {
      marker = /** @type {MarkerValue} */ (markerProp.keyValue(i));
      if (marker && marker.comment === name && Math.abs(markerProp.keyTime(i) - time) < 0.000001) {
        markerProp.removeKey(i);
        return;
      }
    }
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedLayers = comp.selectedLayers;
    var inName = /** @type {string} */ (args.inMarkerName);
    var outName = /** @type {string} */ (args.outMarkerName);
    var expr = MotionExpressions.renderMarkerLoop({
      inMarkerName: inName,
      outMarkerName: outName,
      loopType: /** @type {string} */ (args.loopType),
      clampToLayer: /** @type {boolean} */ (args.clampToLayer)
    });
    var changed = false;
    var unchanged = 0;
    var layerSnapshots = [];
    var propSnapshots = [];
    var markerCreations = [];
    var i;

    try {
      for (i = 0; i < selectedLayers.length; i += 1) {
        var layer = /** @type {any} */ (selectedLayers[i]);
        layerSnapshots.push({ layer: layer, timeRemapEnabled: layer.timeRemapEnabled });
        if (layer.timeRemapEnabled !== true) layer.timeRemapEnabled = true;

        var markerProp = /** @type {Property} */ (layer.property("ADBE Marker"));
        var inTime = findMarkerTime(markerProp, inName);
        var outTime = findMarkerTime(markerProp, outName);
        if (args.autoCreateMarkers === true) {
          if (!isFinite(inTime)) {
            var markerIn = new MarkerValue(inName);
            markerProp.setValueAtTime(layer.inPoint, markerIn);
            markerCreations.push({ property: markerProp, name: inName, time: layer.inPoint });
            inTime = layer.inPoint;
          }
          if (!isFinite(outTime)) {
            var outMarkerTime = layer.outPoint - comp.frameDuration;
            if (outMarkerTime <= inTime) outMarkerTime = layer.outPoint;
            var markerOut = new MarkerValue(outName);
            markerProp.setValueAtTime(outMarkerTime, markerOut);
            markerCreations.push({ property: markerProp, name: outName, time: outMarkerTime });
            outTime = outMarkerTime;
          }
        }
        if (!isFinite(inTime) || !isFinite(outTime) || outTime <= inTime) {
          throw new Error("Markers de loop ausentes ou fora de ordem.");
        }

        var tr = /** @type {Property} */ (layer.property("ADBE Time Remapping"));
        if (!(tr instanceof Property)) throw new Error("Time Remap indisponivel apos habilitar.");
        if (tr.expression === expr && tr.expressionEnabled === true) {
          unchanged += 1;
          continue;
        }
        propSnapshots.push(snapshotProperty(tr));
        applyExpression(tr, expr);
        changed = true;
      }
    } catch (e) {
      try {
        restoreProperties(propSnapshots);
        for (i = markerCreations.length - 1; i >= 0; i -= 1) {
          var creation = markerCreations[i];
          if (creation) removeMarkerByNameAndTime(creation.property, creation.name, creation.time);
        }
        for (i = layerSnapshots.length - 1; i >= 0; i -= 1) {
          var layerSnapshot = layerSnapshots[i];
          if (layerSnapshot) layerSnapshot.layer.timeRemapEnabled = layerSnapshot.timeRemapEnabled;
        }
      } catch (rollbackError) {
        var tagged = /** @type {Error & {motionCode?: string}} */ (rollbackError);
        tagged.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw tagged;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Marker Loop falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: changed,
      warnings: [],
      data: { appliedCount: propSnapshots.length, unchangedCount: unchanged, markerCount: markerCreations.length }
    };
  }

  MotionRegistry.register("ae.time.marker-loop", {
    preflight: preflight,
    run: run
  });
})();
