/**
 * Preview e aplicacao de Reverse Layer Order.
 *
 * Para uma selecao nao contigua, as posicoes das camadas nao selecionadas ficam
 * fixas: os slots do escopo recebem as mesmas camadas em ordem inversa. A ordem
 * final inteira e preparada antes de qualquer chamada ao DOM.
 */
(function () {
  var REQUIRED_ARGS = {
    scope: true,
    preserveTrackMattes: true,
    preserveParents: true,
    reverseTimingToo: true
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de reverse-order desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de reverse-order ausente.", {
          field: key
        });
      }
    }

    if (args.scope !== "selected" && args.scope !== "composition") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Escopo de reverse-order invalido.", {
        field: "scope"
      });
    }
    var booleanFields = ["preserveTrackMattes", "preserveParents", "reverseTimingToo"];
    var i;
    for (i = 0; i < booleanFields.length; i += 1) {
      var field = booleanFields[i] || "";
      if (typeof args[field] !== "boolean") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Opcao de reverse-order invalida.", {
          field: field
        });
      }
    }
    return null;
  }

  /** @param {Layer[]} layers @param {Layer} wanted @returns {boolean} */
  function containsLayer(layers, wanted) {
    var i;
    for (i = 0; i < layers.length; i += 1) {
      if (layers[i] === wanted) return true;
    }
    return false;
  }

  /** @param {CompItem} comp @returns {Layer[]} */
  function readOrder(comp) {
    var order = [];
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) order.push(comp.layer(i));
    return order;
  }

  /** @param {CompItem} comp @param {string} scope @param {Layer[]} original @returns {Layer[]} */
  function collectTargets(comp, scope, original) {
    if (scope === "composition") {
      var all = [];
      var a;
      for (a = 0; a < original.length; a += 1) all.push(/** @type {Layer} */ (original[a]));
      return all;
    }

    var selected = comp.selectedLayers || [];
    var targets = [];
    var i;
    for (i = 0; i < original.length; i += 1) {
      var candidata = /** @type {Layer} */ (original[i]);
      if (containsLayer(selected, candidata)) {
        targets.push(candidata);
      }
    }
    return targets;
  }

  /** @param {Layer} layer @returns {boolean} */
  function hasTrackMatte(layer) {
    try {
      return /** @type {{hasTrackMatte?: boolean}} */ (layer).hasTrackMatte === true;
    } catch (matteReadError) {
      return false;
    }
  }

  /** @param {Layer} layer @returns {boolean} */
  function hasModernTrackMatteApi(layer) {
    try {
      var api = /** @type {{trackMatteLayer?: unknown, trackMatteType?: unknown, setTrackMatte?: unknown}} */ (
        layer
      );
      return (
        typeof api.trackMatteLayer !== "undefined" &&
        typeof api.trackMatteType !== "undefined" &&
        typeof api.setTrackMatte === "function"
      );
    } catch (probeError) {
      return false;
    }
  }

  /** @param {Layer[]} original @param {Layer} layer @returns {number} */
  function originalIndexOf(original, layer) {
    var i;
    for (i = 0; i < original.length; i += 1) {
      if (original[i] === layer) return i + 1;
    }
    return 0;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, plan: Record<string, unknown>|null}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, plan: null };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        plan: null
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);
    var original = readOrder(comp);
    var targets = collectTargets(comp, /** @type {string} */ (args.scope), original);
    if (targets.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada no escopo pedido.", {
          scope: args.scope
        }),
        plan: null
      };
    }
    if (targets.length < 2) {
      return {
        error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione ao menos duas camadas.", {
          count: targets.length,
          minimum: 2
        }),
        plan: null
      };
    }

    var targetSlots = [];
    var finalOrder = [];
    var i;
    for (i = 0; i < original.length; i += 1) {
      finalOrder.push(original[i]);
      if (containsLayer(targets, /** @type {Layer} */ (original[i]))) targetSlots.push(i);
    }
    for (i = 0; i < targetSlots.length; i += 1) {
      finalOrder[/** @type {number} */ (targetSlots[i])] = targets[targets.length - 1 - i];
    }

    for (i = 0; i < targets.length; i += 1) {
      var target = /** @type {Layer} */ (targets[i]);
      if (/** @type {{locked?: boolean}} */ (target).locked === true) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Camada bloqueada no escopo.", {
            layerIndex: originalIndexOf(original, target)
          }),
          plan: null
        };
      }
    }

    if (
      !finalOrder[0] ||
      typeof /** @type {{moveToBeginning?: unknown}} */ (finalOrder[0]).moveToBeginning !== "function"
    ) {
      return {
        error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "moveToBeginning nao esta disponivel.", {
          capability: "Layer.moveToBeginning"
        }),
        plan: null
      };
    }
    for (i = 1; i < finalOrder.length; i += 1) {
      if (
        !finalOrder[i] ||
        typeof /** @type {{moveAfter?: unknown}} */ (finalOrder[i]).moveAfter !== "function"
      ) {
        return {
          error: failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "moveAfter nao esta disponivel.", {
            capability: "Layer.moveAfter",
            layerIndex: i + 1
          }),
          plan: null
        };
      }
    }

    var relationSnapshots = [];
    var parentCount = 0;
    var trackMatteCount = 0;
    for (i = 0; i < original.length; i += 1) {
      var layer = /** @type {Layer} */ (original[i]);
      var parent = layer.parent || null;
      if (parent) {
        parentCount += 1;
        if (args.preserveParents === true && !containsLayer(original, parent)) {
          return {
            error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Parent fora da composicao ativa.", {
              layerIndex: i + 1
            }),
            plan: null
          };
        }
      }

      var matte = hasTrackMatte(layer);
      var matteLayer = null;
      var matteType = null;
      if (matte) {
        trackMatteCount += 1;
        if (args.preserveTrackMattes === true && !hasModernTrackMatteApi(layer)) {
          return {
            error: failure(
              MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
              "Preservar track mattes exige a API moderna do After Effects.",
              { capability: "AVLayer.trackMatteLayer", layerIndex: i + 1 }
            ),
            plan: null
          };
        }
        if (hasModernTrackMatteApi(layer)) {
          matteLayer = /** @type {{trackMatteLayer: Layer|null}} */ (layer).trackMatteLayer;
          matteType = /** @type {{trackMatteType: unknown}} */ (layer).trackMatteType;
          if (args.preserveTrackMattes === true && !matteLayer) {
            return {
              error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Track matte sem layer fonte.", {
                layerIndex: i + 1
              }),
              plan: null
            };
          }
        }
      }

      var startTime = layer.startTime;
      if (typeof startTime !== "number" || !isFinite(startTime)) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "startTime de camada invalido.", {
            layerIndex: i + 1
          }),
          plan: null
        };
      }
      relationSnapshots.push({
        layer: layer,
        parent: parent,
        hasTrackMatte: matte,
        trackMatteLayer: matteLayer,
        trackMatteType: matteType,
        startTime: startTime
      });
    }

    var before = [];
    var after = [];
    var timing = [];
    var timingChangedCount = 0;
    for (i = 0; i < targets.length; i += 1) {
      var beforeLayer = /** @type {Layer} */ (targets[i]);
      var afterLayer = /** @type {Layer} */ (targets[targets.length - 1 - i]);
      var slotIndex = /** @type {number} */ (targetSlots[i]) + 1;
      var desiredStartTime = args.reverseTimingToo === true ? beforeLayer.startTime : afterLayer.startTime;
      before.push({
        index: slotIndex,
        originalIndex: originalIndexOf(original, beforeLayer),
        name: beforeLayer.name,
        startTime: beforeLayer.startTime
      });
      after.push({
        index: slotIndex,
        originalIndex: originalIndexOf(original, afterLayer),
        name: afterLayer.name,
        startTime: desiredStartTime
      });
      timing.push({
        layer: afterLayer,
        before: afterLayer.startTime,
        after: desiredStartTime
      });
      if (afterLayer.startTime !== desiredStartTime) timingChangedCount += 1;
    }

    return {
      error: null,
      plan: {
        comp: comp,
        scope: args.scope,
        originalOrder: original,
        finalOrder: finalOrder,
        targets: targets,
        before: before,
        after: after,
        timing: timing,
        timingChangedCount: timingChangedCount,
        relationSnapshots: relationSnapshots,
        preserveParents: args.preserveParents,
        preserveTrackMattes: args.preserveTrackMattes,
        reverseTimingToo: args.reverseTimingToo,
        parentCount: parentCount,
        trackMatteCount: trackMatteCount
      }
    };
  }

  /** @param {CompItem} comp @param {Layer[]} order @returns {void} */
  function applyExactOrder(comp, order) {
    if (order.length === 0) return;
    var primeira = /** @type {Layer} */ (order[0]);
    if (comp.layer(1) !== primeira) primeira.moveToBeginning();
    var i;
    for (i = 1; i < order.length; i += 1) {
      var atual = /** @type {Layer} */ (order[i]);
      if (comp.layer(i + 1) !== atual) atual.moveAfter(/** @type {Layer} */ (order[i - 1]));
    }
  }

  /** @param {CompItem} comp @param {Layer[]} order @returns {boolean} */
  function orderMatches(comp, order) {
    if (comp.numLayers !== order.length) return false;
    var i;
    for (i = 0; i < order.length; i += 1) {
      if (comp.layer(i + 1) !== order[i]) return false;
    }
    return true;
  }

  /** @param {Record<string, unknown>} plan @returns {boolean} */
  function relationsMatch(plan) {
    var snapshots = /** @type {Array<Record<string, unknown>>} */ (plan.relationSnapshots);
    var i;
    for (i = 0; i < snapshots.length; i += 1) {
      var snapshot = snapshots[i];
      if (!snapshot) continue;
      var layer = /** @type {Layer} */ (snapshot.layer);
      if (plan.preserveParents === true && (layer.parent || null) !== snapshot.parent) return false;
      if (plan.preserveTrackMattes === true) {
        var matte = hasTrackMatte(layer);
        if (matte !== snapshot.hasTrackMatte) return false;
        if (matte) {
          try {
            if (
              /** @type {{trackMatteLayer: Layer|null}} */ (layer).trackMatteLayer !==
                snapshot.trackMatteLayer ||
              /** @type {{trackMatteType: unknown}} */ (layer).trackMatteType !==
                snapshot.trackMatteType
            ) {
              return false;
            }
          } catch (matteReadError) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /** @param {Record<string, unknown>} plan @returns {boolean} */
  function startTimesMatchOriginal(plan) {
    var snapshots = /** @type {Array<Record<string, unknown>>} */ (plan.relationSnapshots);
    var i;
    for (i = 0; i < snapshots.length; i += 1) {
      var snapshot = snapshots[i];
      if (!snapshot) continue;
      var camada = /** @type {Layer} */ (snapshot.layer);
      if (camada.startTime !== snapshot.startTime) return false;
    }
    return true;
  }

  /** @param {Record<string, unknown>} plan @returns {boolean} */
  function rollback(plan) {
    var failed = false;
    var snapshots = /** @type {Array<Record<string, unknown>>} */ (plan.relationSnapshots);
    var i;

    // Timing foi escrito depois da ordem, portanto volta primeiro.
    if (plan.reverseTimingToo === true) {
      for (i = snapshots.length - 1; i >= 0; i -= 1) {
        try {
          var snapshot = snapshots[i];
          if (snapshot) {
            var camadaDoSnapshot = /** @type {Layer} */ (snapshot.layer);
            if (camadaDoSnapshot.startTime !== snapshot.startTime) {
              camadaDoSnapshot.startTime = /** @type {number} */ (snapshot.startTime);
            }
          }
        } catch (timeRestoreError) {
          failed = true;
        }
      }
    }

    try {
      applyExactOrder(
        /** @type {CompItem} */ (plan.comp),
        /** @type {Layer[]} */ (plan.originalOrder)
      );
    } catch (orderRestoreError) {
      failed = true;
    }

    if (!orderMatches(/** @type {CompItem} */ (plan.comp), /** @type {Layer[]} */ (plan.originalOrder))) {
      failed = true;
    }
    if (!startTimesMatchOriginal(plan)) failed = true;
    if (!relationsMatch(plan)) failed = true;
    return !failed;
  }

  /** @param {Record<string, unknown>} plan @returns {Record<string, unknown>} */
  function publicPlan(plan) {
    return {
      scope: plan.scope,
      targetCount: /** @type {Layer[]} */ (plan.targets).length,
      reverseTimingToo: plan.reverseTimingToo,
      parentCount: plan.parentCount,
      trackMatteCount: plan.trackMatteCount,
      timingChangedCount: plan.timingChangedCount,
      before: plan.before,
      after: plan.after
    };
  }

  MotionRegistry.register("ae.layer.reverse-order.preview", {
    preflight: function (args) {
      return prepare(args).error;
    },
    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error || !prepared.plan) throw new Error("Preview de reverse-order ficou invalido.");
      return {
        changed: false,
        warnings: [],
        data: publicPlan(prepared.plan)
      };
    }
  });

  MotionRegistry.register("ae.layer.reverse-order", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error || !prepared.plan) {
        throw new Error("Reverse-order ficou invalido depois do preflight.");
      }
      var plan = prepared.plan;
      var timing = /** @type {Array<Record<string, unknown>>} */ (plan.timing);
      var i;

      try {
        applyExactOrder(
          /** @type {CompItem} */ (plan.comp),
          /** @type {Layer[]} */ (plan.finalOrder)
        );
        if (plan.reverseTimingToo === true) {
          for (i = 0; i < timing.length; i += 1) {
            var change = timing[i];
            if (change && change.before !== change.after) {
              /** @type {Layer} */ (change.layer).startTime = /** @type {number} */ (change.after);
            }
          }
        }

        if (!orderMatches(/** @type {CompItem} */ (plan.comp), /** @type {Layer[]} */ (plan.finalOrder))) {
          throw new Error("O host nao manteve a ordem final calculada.");
        }
        if (!relationsMatch(plan)) {
          throw new Error("Parent ou track matte mudou durante a reordenacao.");
        }
      } catch (applyError) {
        if (!rollback(plan)) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de reverse-order falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      var data = publicPlan(plan);
      data.appliedCount = /** @type {Layer[]} */ (plan.targets).length;
      return {
        changed: true,
        warnings: [],
        data: data
      };
    }
  });
}());
