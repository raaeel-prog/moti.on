/**
 * Delay escalona `startTime` de camadas ou grupos inteiros de keyframes.
 *
 * A ordem e planejada antes do Undo e Random usa xorshift32 + Fisher-Yates com
 * seed explicita. Keyframes sao reconstruidos pelo adapter compartilhado para
 * preservar o espacamento interno e toda metadata coberta pelo CHMS-012.
 */
(function () {
  /**
   * @typedef {{
   *   id: string,
   *   name: string,
   *   timelineIndex: number,
   *   selectionOrder: number,
   *   distance: number,
   *   layer?: Layer,
   *   property?: Property,
   *   beforeStart?: number,
   *   afterStart?: number,
   *   keyCount?: number,
   *   firstTime?: number,
   *   lastTime?: number,
   *   afterFirstTime?: number,
   *   afterLastTime?: number,
   *   ordinal?: number,
   *   offsetFrames?: number,
   *   offsetSeconds?: number
   * }} DelayTarget
   */
  var REQUIRED_ARGS = {
    delayFrames: true,
    order: true,
    reverse: true,
    randomSeed: true,
    spatialOrigin: true,
    shiftMode: true
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

  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function isInteger(value, min, max) {
    return (
      typeof value === "number" &&
      isFinite(value) &&
      Math.floor(value) === value &&
      value >= min &&
      value <= max
    );
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Delay desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Delay ausente.", {
          field: key
        });
      }
    }
    if (!isInteger(args.delayFrames, -100000, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Delay em frames invalido.", {
        field: "delayFrames"
      });
    }
    if (
      args.order !== "timeline" &&
      args.order !== "selection" &&
      args.order !== "name" &&
      args.order !== "distance" &&
      args.order !== "random"
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Ordem de Delay invalida.", {
        field: "order"
      });
    }
    if (args.shiftMode !== "layerStart" && args.shiftMode !== "keyframes") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Alvo de Delay invalido.", {
        field: "shiftMode"
      });
    }
    if (typeof args.reverse !== "boolean" || !isInteger(args.randomSeed, 0, 2147483647)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Flags de Delay invalidas.", null);
    }
    var origin = /** @type {unknown[]|null} */ (args.spatialOrigin);
    if (!origin || typeof origin.length !== "number" || origin.length !== 2) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Origem espacial invalida.", {
        field: "spatialOrigin"
      });
    }
    var originX = origin[0];
    var originY = origin[1];
    if (typeof originX !== "number" || !isFinite(originX) || typeof originY !== "number" || !isFinite(originY)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Origem espacial nao finita.", {
        field: "spatialOrigin"
      });
    }
    return null;
  }

  /** @param {Layer} layer @param {number[]} origin @returns {number} */
  function distanceFrom(layer, origin) {
    if (typeof layer.sourcePointToComp !== "function") {
      throw new Error("Camada nao expoe sourcePointToComp para ordenar por distancia.");
    }
    var transform = layer.property("ADBE Transform Group");
    var anchor = transform.property("ADBE Anchor Point").value;
    var point = layer.sourcePointToComp(/** @type {number[]} */ (anchor));
    var pointX = point ? point[0] : null;
    var pointY = point ? point[1] : null;
    if (!point || point.length < 2 || typeof pointX !== "number" || !isFinite(pointX) || typeof pointY !== "number" || !isFinite(pointY)) {
      throw new Error("O host nao conseguiu projetar a camada no espaco da composicao.");
    }
    var originX = origin[0];
    var originY = origin[1];
    if (typeof originX !== "number" || typeof originY !== "number") throw new Error("Origem espacial invalida.");
    var dx = pointX - originX;
    var dy = pointY - originY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** @param {DelayTarget[]} targets @param {number} seed @returns {void} */
  function seededShuffle(targets, seed) {
    var state = seed === 0 ? 1831565813 : seed;
    var i;
    for (i = targets.length - 1; i > 0; i -= 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state = state >>> 0;
      var random = state / 4294967296;
      var j = Math.floor(random * (i + 1));
      var temporary = targets[i];
      var replacement = targets[j];
      if (!temporary || !replacement) throw new Error("Shuffle produziu indice invalido.");
      targets[i] = replacement;
      targets[j] = temporary;
    }
  }

  /**
   * @param {DelayTarget[]} targets
   * @param {Record<string, unknown>} args
   * @returns {void}
   */
  function orderTargets(targets, args) {
    if (args.order === "random") {
      // Random sempre parte de uma base timeline/id estavel, nao da ordem
      // incidental devolvida por `selectedProperties`.
      targets.sort(function (a, b) {
        if (a.timelineIndex !== b.timelineIndex) return a.timelineIndex - b.timelineIndex;
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return a.selectionOrder - b.selectionOrder;
      });
      seededShuffle(targets, /** @type {number} */ (args.randomSeed));
    } else if (args.order !== "selection") {
      targets.sort(function (a, b) {
        var comparison;
        if (args.order === "timeline") comparison = a.timelineIndex - b.timelineIndex;
        else if (args.order === "name") {
          var an = String(a.name).toLowerCase();
          var bn = String(b.name).toLowerCase();
          comparison = an < bn ? -1 : an > bn ? 1 : 0;
        } else comparison = a.distance - b.distance;
        return comparison !== 0 ? comparison : a.selectionOrder - b.selectionOrder;
      });
    }
    if (args.reverse === true) targets.reverse();
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, comp: CompItem|null, targets: DelayTarget[], data: Record<string, unknown>}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, comp: null, targets: [], data: {} };
    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        comp: null,
        targets: [],
        data: {}
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);
    if (typeof comp.frameDuration !== "number" || !isFinite(comp.frameDuration) || comp.frameDuration <= 0) {
      return {
        error: failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "Frame duration indisponivel.", null),
        comp: null,
        targets: [],
        data: {}
      };
    }
    var origin = /** @type {number[]} */ (args.spatialOrigin);
    var targets = /** @type {DelayTarget[]} */ ([]);
    var i;

    if (args.shiftMode === "layerStart") {
      var layers = comp.selectedLayers;
      if (!layers || typeof layers.length !== "number" || layers.length < 2) {
        return {
          error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos duas camadas.", null),
          comp: null,
          targets: [],
          data: {}
        };
      }
      if (layers.length > 500) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecao excede 500 camadas.", null),
          comp: null,
          targets: [],
          data: {}
        };
      }
      for (i = 0; i < layers.length; i += 1) {
        var layer = /** @type {Layer} */ (layers[i]);
        var distance = 0;
        if (args.order === "distance") {
          try {
            distance = distanceFrom(layer, origin);
          } catch (distanceError) {
            return {
              error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Camada incompativel com ordem por distancia.", {
                layerIndex: layer.index
              }),
              comp: null,
              targets: [],
              data: {}
            };
          }
        }
        targets.push({
          id: "layer:" + layer.index,
          name: layer.name,
          timelineIndex: layer.index,
          selectionOrder: i,
          distance: distance,
          layer: layer,
          beforeStart: layer.startTime
        });
      }
    } else {
      var properties = comp.selectedProperties;
      if (!properties || typeof properties.length !== "number" || properties.length < 2) {
        return {
          error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos duas propriedades com keys.", null),
          comp: null,
          targets: [],
          data: {}
        };
      }
      var totalKeys = 0;
      for (i = 0; i < properties.length; i += 1) {
        var property = /** @type {Property} */ (properties[i]);
        if (!MotionKeyframes.isSupportedProperty(property) || property.numKeys < 1) {
          return {
            error: failure(
              MotionContracts.ERROR.INVALID_SELECTION_TYPE,
              "Delay aceita propriedades numericas com keyframes.",
              { selectionIndex: i }
            ),
            comp: null,
            targets: [],
            data: {}
          };
        }
        var duplicate = false;
        var d;
        for (d = 0; d < targets.length; d += 1) {
          var existingTarget = targets[d];
          if (existingTarget && existingTarget.property === property) duplicate = true;
        }
        if (duplicate) continue;
        totalKeys += property.numKeys;
        if (totalKeys > MotionKeyframes.MAX_KEYS_PER_BATCH) {
          return {
            error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "O lote excede o limite de keyframes.", null),
            comp: null,
            targets: [],
            data: {}
          };
        }
        var description = MotionKeyframes.describeProperty(comp, property);
        if (!description.layerIndex) {
          return {
            error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Propriedade sem camada proprietaria.", {
              selectionIndex: i
            }),
            comp: null,
            targets: [],
            data: {}
          };
        }
        var owner = comp.layer(description.layerIndex);
        var propertyDistance = 0;
        if (args.order === "distance") {
          try {
            propertyDistance = distanceFrom(owner, origin);
          } catch (propertyDistanceError) {
            return {
              error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Propriedade incompativel com ordem por distancia.", {
                layerIndex: description.layerIndex
              }),
              comp: null,
              targets: [],
              data: {}
            };
          }
        }
        targets.push({
          id: description.id,
          name: description.layerName + " / " + description.propertyName,
          timelineIndex: description.layerIndex,
          selectionOrder: i,
          distance: propertyDistance,
          property: property,
          keyCount: property.numKeys,
          firstTime: property.keyTime(1),
          lastTime: property.keyTime(property.numKeys)
        });
      }
      if (targets.length < 2) {
        return {
          error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione duas propriedades distintas.", null),
          comp: null,
          targets: [],
          data: {}
        };
      }
    }

    orderTargets(targets, args);
    var previews = [];
    var delayFrames = /** @type {number} */ (args.delayFrames);
    for (i = 0; i < targets.length; i += 1) {
      var target = targets[i];
      if (!target) throw new Error("Plano de Delay incompleto.");
      var offsetFrames = delayFrames * i;
      var offsetSeconds = offsetFrames * comp.frameDuration;
      target.ordinal = i;
      target.offsetFrames = offsetFrames;
      target.offsetSeconds = offsetSeconds;
      if (args.shiftMode === "layerStart") {
        if (typeof target.beforeStart !== "number") throw new Error("startTime ausente no plano de Delay.");
        target.afterStart = target.beforeStart + offsetSeconds;
        if (target.afterStart < -10800 || target.afterStart > 10800 || !isFinite(target.afterStart)) {
          return {
            error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Delay leva a camada para fora do limite do host.", {
              id: target.id
            }),
            comp: null,
            targets: [],
            data: {}
          };
        }
      } else {
        if (typeof target.firstTime !== "number" || typeof target.lastTime !== "number") {
          throw new Error("Faixa de keys ausente no plano de Delay.");
        }
        target.afterFirstTime = target.firstTime + offsetSeconds;
        target.afterLastTime = target.lastTime + offsetSeconds;
        if (
          target.afterFirstTime < -10800 ||
          target.afterLastTime > 10800 ||
          !isFinite(target.afterFirstTime) ||
          !isFinite(target.afterLastTime)
        ) {
          return {
            error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Delay leva keys para fora do limite do host.", {
              id: target.id
            }),
            comp: null,
            targets: [],
            data: {}
          };
        }
      }
      previews.push({
        id: target.id,
        name: target.name,
        ordinal: i,
        offsetFrames: offsetFrames,
        beforeStart: typeof target.beforeStart === "number" ? target.beforeStart : null,
        afterStart: typeof target.afterStart === "number" ? target.afterStart : null,
        keyCount: typeof target.keyCount === "number" ? target.keyCount : 0,
        firstTime: typeof target.firstTime === "number" ? target.firstTime : null,
        afterFirstTime: typeof target.afterFirstTime === "number" ? target.afterFirstTime : null,
        lastTime: typeof target.lastTime === "number" ? target.lastTime : null,
        afterLastTime: typeof target.afterLastTime === "number" ? target.afterLastTime : null
      });
    }

    return {
      error: null,
      comp: comp,
      targets: targets,
      data: {
        targetCount: targets.length,
        shiftMode: args.shiftMode,
        delayFrames: delayFrames,
        targets: previews
      }
    };
  }

  MotionRegistry.register("ae.keys.delay.preview", {
    preflight: function (args) {
      return prepare(args).error;
    },
    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Preview de Delay ficou invalido.");
      return { changed: false, warnings: [], data: prepared.data };
    }
  });

  MotionRegistry.register("ae.keys.delay", {
    preflight: function (args) {
      return prepare(args).error;
    },
    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Delay ficou invalido depois do preflight.");
      var touchedLayers = /** @type {Array<{layer: Layer, beforeStart: number}>} */ ([]);
      var touchedProperties = /** @type {MotionPropertySnapshot[]} */ ([]);
      var changed = 0;
      var i;
      try {
        for (i = 0; i < prepared.targets.length; i += 1) {
          var target = prepared.targets[i];
          if (!target || typeof target.offsetSeconds !== "number") {
            throw new Error("Offset ausente no plano de Delay.");
          }
          if (target.offsetSeconds === 0) continue;
          if (args.shiftMode === "layerStart") {
            if (!target.layer || typeof target.beforeStart !== "number" || typeof target.afterStart !== "number") {
              throw new Error("Alvo de camada incompleto no plano de Delay.");
            }
            touchedLayers.push({ layer: target.layer, beforeStart: target.beforeStart });
            target.layer.startTime = target.afterStart;
          } else {
            if (!target.property) throw new Error("Propriedade ausente no plano de Delay.");
            var snapshot = MotionKeyframes.captureProperty(target.property);
            var keys = snapshot.keys;
            var times = [];
            var j;
            for (j = 0; j < keys.length; j += 1) {
              var key = keys[j];
              if (!key) throw new Error("Snapshot de Delay incompleto.");
              times.push(key.time + target.offsetSeconds);
            }
            touchedProperties.push(snapshot);
            MotionKeyframes.restoreProperty(snapshot, times);
          }
          changed += 1;
        }
      } catch (applyError) {
        var rollbackFailed = false;
        if (args.shiftMode === "layerStart") {
          for (i = touchedLayers.length - 1; i >= 0; i -= 1) {
            var layerSnapshot = touchedLayers[i];
            if (!layerSnapshot) {
          // Snapshot ausente e falha de rollback, e nao excecao: lancar aqui
          // apenas para cair no catch ao lado esconderia a condicao real.
              rollbackFailed = true;
              continue;
            }
            try {
              layerSnapshot.layer.startTime = layerSnapshot.beforeStart;
            } catch (restoreLayerError) {
              rollbackFailed = true;
            }
          }
        } else {
          for (i = touchedProperties.length - 1; i >= 0; i -= 1) {
            var propertySnapshot = touchedProperties[i];
            if (!propertySnapshot) {
          // Snapshot ausente e falha de rollback, e nao excecao: lancar aqui
          // apenas para cair no catch ao lado esconderia a condicao real.
              rollbackFailed = true;
              continue;
            }
            try {
              MotionKeyframes.restoreProperty(propertySnapshot, null);
            } catch (restorePropertyError) {
              rollbackFailed = true;
            }
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de Delay falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }
      return { changed: changed > 0, warnings: [], data: prepared.data };
    }
  });
}());
