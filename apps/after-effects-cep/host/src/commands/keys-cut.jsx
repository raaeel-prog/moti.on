/**
 * Preview e aplicacao destrutiva de CutKeys.
 *
 * Os dois ids compartilham o mesmo planner: a unica diferenca e que o preview
 * nunca escreve, enquanto `ae.keys.cut` so chega aqui depois de o dispatcher
 * validar `allowDestructive`. Indices sao removidos do maior para o menor, como
 * exige a API de Property do After Effects.
 */
(function () {
  var REQUIRED_ARGS = {
    rangeMode: true,
    startTime: true,
    endTime: true,
    includeBoundary: true,
    previewOnly: true
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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de CutKeys desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de CutKeys ausente.", {
          field: key
        });
      }
    }
    if (
      args.rangeMode !== "beforeCti" &&
      args.rangeMode !== "afterCti" &&
      args.rangeMode !== "insideWorkArea" &&
      args.rangeMode !== "outsideWorkArea" &&
      args.rangeMode !== "betweenMarkers"
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Faixa de CutKeys invalida.", {
        field: "rangeMode"
      });
    }
    if (typeof args.includeBoundary !== "boolean" || typeof args.previewOnly !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Flags de CutKeys invalidas.", null);
    }
    if (
      typeof args.startTime !== "number" ||
      !isFinite(args.startTime) ||
      typeof args.endTime !== "number" ||
      !isFinite(args.endTime)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempos de CutKeys invalidos.", null);
    }
    if (args.rangeMode === "betweenMarkers") {
      if (args.startTime < -10800 || args.endTime > 10800 || args.endTime <= args.startTime) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Intervalo entre markers invalido.", null);
      }
    } else if (args.startTime !== 0 || args.endTime !== 0) {
      // Campos inativos sao canonicos, nao valores silenciosamente ignorados.
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempos inativos precisam ser zero.", null);
    }
    return null;
  }

  /**
   * @param {string} mode @param {number} time @param {number} start
   * @param {number} end @param {boolean} includeBoundary @returns {boolean}
   */
  function shouldRemove(mode, time, start, end, includeBoundary) {
    if (mode === "beforeCti") return includeBoundary ? time <= start : time < start;
    if (mode === "afterCti") return includeBoundary ? time >= end : time > end;
    if (mode === "insideWorkArea" || mode === "betweenMarkers") {
      return includeBoundary ? time >= start && time <= end : time > start && time < end;
    }
    return includeBoundary ? time <= start || time >= end : time < start || time > end;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, comp: CompItem|null, items: Array<Record<string, unknown>>, data: Record<string, unknown>}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, comp: null, items: [], data: {} };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        comp: null,
        items: [],
        data: {}
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);
    var selected = comp.selectedProperties;
    if (!selected || typeof selected.length !== "number" || selected.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma propriedade selecionada.", null),
        comp: null,
        items: [],
        data: {}
      };
    }

    var start;
    var end;
    if (args.rangeMode === "beforeCti" || args.rangeMode === "afterCti") {
      start = comp.time;
      end = comp.time;
    } else if (args.rangeMode === "insideWorkArea" || args.rangeMode === "outsideWorkArea") {
      start = comp.workAreaStart;
      end = comp.workAreaStart + comp.workAreaDuration;
    } else {
      start = /** @type {number} */ (args.startTime);
      end = /** @type {number} */ (args.endTime);
    }

    var items = [];
    var previews = [];
    var totalKeys = 0;
    var totalRemove = 0;
    var i;
    for (i = 0; i < selected.length; i += 1) {
      var property = /** @type {Property} */ (selected[i]);
      if (!MotionKeyframes.isSupportedProperty(property)) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "CutKeys aceita apenas propriedades numericas com keyframes.",
            { selectionIndex: i }
          ),
          comp: null,
          items: [],
          data: {}
        };
      }
      var duplicate = false;
      var j;
      for (j = 0; j < items.length; j += 1) {
        var previousItem = items[j];
        if (previousItem && previousItem.property === property) duplicate = true;
      }
      if (duplicate) continue;
      if (property.numKeys < 1) {
        return {
          error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "A propriedade nao tem keyframes.", {
            selectionIndex: i
          }),
          comp: null,
          items: [],
          data: {}
        };
      }
      totalKeys += property.numKeys;
      if (totalKeys > MotionKeyframes.MAX_KEYS_PER_BATCH) {
        return {
          error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "O lote excede o limite de keyframes.", {
            maxKeys: MotionKeyframes.MAX_KEYS_PER_BATCH
          }),
          comp: null,
          items: [],
          data: {}
        };
      }

      var indices = [];
      var times = [];
      for (j = property.numKeys; j >= 1; j -= 1) {
        var time = property.keyTime(j);
        if (
          shouldRemove(
            /** @type {string} */ (args.rangeMode),
            time,
            start,
            end,
            args.includeBoundary === true
          )
        ) {
          indices.push(j);
          times.unshift(time);
        }
      }
      var description = MotionKeyframes.describeProperty(comp, property);
      items.push({ property: property, indices: indices, description: description });
      totalRemove += indices.length;
      previews.push({
        id: description.id,
        layerIndex: description.layerIndex,
        layerName: description.layerName,
        propertyName: description.propertyName,
        keyCount: indices.length,
        times: times
      });
    }

    return {
      error: null,
      comp: comp,
      items: items,
      data: {
        totalCount: totalRemove,
        propertyCount: items.length,
        rangeStart: start,
        rangeEnd: end,
        properties: previews
      }
    };
  }

  MotionRegistry.register("ae.keys.cut.preview", {
    preflight: function (args) {
      if (args.previewOnly !== true) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Preview exige previewOnly=true.", {
          field: "previewOnly"
        });
      }
      return prepare(args).error;
    },
    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Preview de CutKeys ficou invalido.");
      return { changed: false, warnings: [], data: prepared.data };
    }
  });

  MotionRegistry.register("ae.keys.cut", {
    preflight: function (args) {
      if (args.previewOnly !== false) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Aplicacao exige previewOnly=false.", {
          field: "previewOnly"
        });
      }
      return prepare(args).error;
    },
    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("CutKeys ficou invalido depois do preflight.");

      var snapshots = /** @type {MotionPropertySnapshot[]} */ ([]);
      var i;
      try {
        for (i = 0; i < prepared.items.length; i += 1) {
          var item = /** @type {{property: Property, indices: number[]}|undefined} */ (prepared.items[i]);
          if (!item || item.indices.length === 0) continue;
          snapshots.push(MotionKeyframes.captureProperty(item.property));
          MotionKeyframes.removeIndicesDescending(item.property, item.indices);
        }
      } catch (applyError) {
        var rollbackFailed = false;
        for (i = snapshots.length - 1; i >= 0; i -= 1) {
          var snapshot = snapshots[i];
          if (!snapshot) {
          // Snapshot ausente e falha de rollback, e nao excecao: lancar aqui
          // apenas para cair no catch ao lado esconderia a condicao real.
            rollbackFailed = true;
            continue;
          }
          try {
            MotionKeyframes.restoreProperty(snapshot, null);
          } catch (restoreError) {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de CutKeys falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      return {
        changed: /** @type {number} */ (prepared.data.totalCount) > 0,
        warnings: [],
        data: prepared.data
      };
    }
  });
}());
