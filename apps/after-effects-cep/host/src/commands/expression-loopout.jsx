/**
 * `ae.expression.loopout` aplica um template gerenciado em propriedades
 * numericas selecionadas. Toda a selecao e validada antes do primeiro write;
 * conflito em uma propriedade recusa o lote inteiro.
 */
(function () {
  var REQUIRED_ARGS = {
    type: true,
    numKeyframes: true,
    duration: true,
    useDuration: true,
    conflictMode: true
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
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {unknown} value @returns {boolean} */
  function isLoopType(value) {
    return value === "cycle" || value === "pingpong" || value === "offset" || value === "continue";
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento LoopOut desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento LoopOut ausente.", {
          field: key
        });
      }
    }

    if (!isLoopType(args.type)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tipo LoopOut invalido.", { field: "type" });
    }
    if (
      !isFiniteNumber(args.numKeyframes) ||
      Math.floor(/** @type {number} */ (args.numKeyframes)) !== args.numKeyframes ||
      /** @type {number} */ (args.numKeyframes) < 0 ||
      /** @type {number} */ (args.numKeyframes) > 1000
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Quantidade de keyframes invalida.", {
        field: "numKeyframes"
      });
    }
    if (!isFiniteNumber(args.duration) || /** @type {number} */ (args.duration) < 0 || /** @type {number} */ (args.duration) > 3600) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao LoopOut invalida.", {
        field: "duration"
      });
    }
    if (typeof args.useDuration !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "useDuration precisa ser booleano.", {
        field: "useDuration"
      });
    }
    if (args.conflictMode !== "skip") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de conflito nao permitido.", {
        field: "conflictMode"
      });
    }

    if (args.type === "continue") {
      if (args.useDuration !== false || args.numKeyframes !== 0 || args.duration !== 0) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Continue nao aceita intervalo adicional.", null);
      }
    } else if (args.useDuration === true) {
      if (args.numKeyframes !== 0 || /** @type {number} */ (args.duration) <= 0) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "O intervalo por duracao nao e canonico.", null);
      }
    } else if (args.duration !== 0) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao inativa precisa ser zero.", null);
    }

    return null;
  }

  /** @param {unknown} valueType @returns {boolean} */
  function isNumericValueType(valueType) {
    if (typeof PropertyValueType === "undefined") return false;
    return (
      valueType === PropertyValueType.OneD ||
      valueType === PropertyValueType.TwoD ||
      valueType === PropertyValueType.TwoD_SPATIAL ||
      valueType === PropertyValueType.ThreeD ||
      valueType === PropertyValueType.ThreeD_SPATIAL ||
      valueType === PropertyValueType.COLOR
    );
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, items: Array<Record<string, unknown>>, desired: string}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, items: [], desired: "" };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        items: [],
        desired: ""
      };
    }

    var selected = activeItem.selectedProperties;
    if (!selected || typeof selected.length !== "number" || selected.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma propriedade selecionada.", null),
        items: [],
        desired: ""
      };
    }

    var desired = MotionExpressions.renderLoopOut({
      type: args.type,
      numKeyframes: args.numKeyframes,
      duration: args.duration,
      useDuration: args.useDuration
    });
    var items = [];
    var i;
    for (i = 0; i < selected.length; i += 1) {
      var property = selected[i];
      if (
        !property ||
        typeof PropertyType === "undefined" ||
        property.propertyType !== PropertyType.PROPERTY ||
        property.canSetExpression !== true ||
        !isNumericValueType(property.propertyValueType)
      ) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "A selecao contem uma propriedade sem suporte a expressoes numericas.",
            { selectionIndex: i }
          ),
          items: [],
          desired: desired
        };
      }
      if (
        typeof property.numKeys !== "number" ||
        property.numKeys < 2 ||
        Math.floor(property.numKeys) !== property.numKeys
      ) {
        return {
          error: failure(
            MotionContracts.ERROR.KEYFRAME_CONFLICT,
            "LoopOut exige pelo menos dois keyframes em cada propriedade.",
            { selectionIndex: i, minimumKeys: 2 }
          ),
          items: [],
          desired: desired
        };
      }

      var beforeExpression = property.expression;
      var beforeEnabled = property.expressionEnabled === true;
      if (typeof beforeExpression !== "string") {
        return {
          error: failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "O host nao devolveu uma expressao valida.", {
            selectionIndex: i
          }),
          items: [],
          desired: desired
        };
      }
      if (
        beforeExpression !== "" &&
        beforeExpression !== desired &&
        !MotionExpressions.isManagedLoopOut(beforeExpression) &&
        !MotionExpressions.isManagedLoopOutLive(beforeExpression)
      ) {
        return {
          error: failure(
            MotionContracts.ERROR.EXPRESSION_CONFLICT,
            "Uma expressao existente foi preservada.",
            { selectionIndex: i, conflictMode: "skip" }
          ),
          items: [],
          desired: desired
        };
      }

      items.push({
        property: property,
        beforeExpression: beforeExpression,
        beforeEnabled: beforeEnabled,
        desired: desired,
        changed: beforeExpression !== desired || beforeEnabled !== true
      });
    }

    return { error: null, items: items, desired: desired };
  }

  /** @param {Record<string, unknown>} item */
  function restoreItem(item) {
    var property = /** @type {Property} */ (item.property);
    property.expression = /** @type {string} */ (item.beforeExpression);
    property.expressionEnabled = item.beforeEnabled === true;
  }

  /** Espelha LOOPOUT_LIVE_TYPES do template. As duas ordens sao a mesma. */
  var TIPOS_LIVE = ["cycle", "pingpong", "offset", "continue"];

  /** Os controles que o LoopOut expoe no Effect Controls. */
  var LIVE_BINDINGS = /** @type {MotionLiveControlBindingHost[]} */ ([
    {
      paramId: "type",
      label: { "pt-BR": "Tipo", "en-US": "Type" },
      help: {
        "pt-BR": "Ciclo repete, vaivém alterna, deslocamento acumula.",
        "en-US": "Cycle repeats, ping-pong alternates, offset accumulates."
      },
      control: "dropdown",
      target: "layer",
      order: 1,
      options: [
        { value: 1, label: { "pt-BR": "Ciclo", "en-US": "Cycle" } },
        { value: 2, label: { "pt-BR": "Vaivém", "en-US": "Ping-pong" } },
        { value: 3, label: { "pt-BR": "Deslocamento", "en-US": "Offset" } },
        { value: 4, label: { "pt-BR": "Continuar", "en-US": "Continue" } }
      ]
    },
    {
      paramId: "numKeyframes",
      label: { "pt-BR": "Keyframes", "en-US": "Keyframes" },
      help: {
        "pt-BR": "Quantos keyframes entram no laço. Zero usa todos.",
        "en-US": "How many keyframes join the loop. Zero uses all."
      },
      control: "slider",
      target: "layer",
      order: 2,
      min: 0,
      max: 100
    }
  ]);
  MotionRegistry.register("ae.expression.loopout", {
    preflight: function (args, context, options) {
      if (options && options.emitLiveControls === true) return validateArgs(args) || MotionQuickEffects.prepare("loopout", args, options).error;
      return prepare(args).error;
    },

    /**
     * @param {Record<string, unknown>} args
     * @param {Record<string, unknown>} context
     * @param {Record<string, unknown>} [options]
     * @returns {MotionCommandResult}
     */
    run: function (args, context, options) {
      if (options && options.emitLiveControls === true) return MotionQuickEffects.run("loopout", args, context, options);
      var prepared = prepare(args);
      if (prepared.error) throw new Error("LoopOut ficou invalido depois do preflight.");

      // Live Controls: controles na camada em vez de valores cravados.
      var live = !!(options && options.emitLiveControls === true);
      var preset = null;
      var vivo;
      if (live && prepared.items.length > 0) {
        var propriedades = [];
        for (vivo = 0; vivo < prepared.items.length; vivo += 1) {
          var origem = prepared.items[vivo];
          if (origem) propriedades.push(origem.property);
        }
        preset = MotionLivePreset.aplicar(propriedades, {
          tool: "LoopOut",
          rigId: "ae.expression.loopout",
          locale: context ? context.locale : null,
          bindings: LIVE_BINDINGS,
          values: {
            type: TIPOS_LIVE.indexOf(String(args.type)) + 1,
            numKeyframes: args.numKeyframes
          }
        });
        for (vivo = 0; vivo < prepared.items.length; vivo += 1) {
          var alvoVivo = prepared.items[vivo];
          var refs = preset.refsPorPropriedade[vivo];
          if (!alvoVivo || !refs) continue;
          alvoVivo.desired = MotionExpressions.renderLoopOutLive(
            /** @type {{type: string, numKeyframes: string}} */ (refs)
          );
          alvoVivo.changed =
            alvoVivo.beforeExpression !== alvoVivo.desired || alvoVivo.beforeEnabled !== true;
        }
      }

      var touched = [];
      var appliedCount = 0;
      var unchangedCount = 0;
      var i;
      try {
        for (i = 0; i < prepared.items.length; i += 1) {
          var item = prepared.items[i];
          if (!item || item.changed !== true) {
            unchangedCount += 1;
            continue;
          }

          touched.push(item);
          var property = /** @type {Property} */ (item.property);
          property.expression = /** @type {string} */ (item.desired);
          if (typeof property.expressionError === "string" && property.expressionError !== "") {
            throw new Error("After Effects recusou a expressao gerenciada.");
          }
          property.expressionEnabled = true;
          if (property.expressionEnabled !== true) {
            throw new Error("After Effects nao habilitou a expressao gerenciada.");
          }
          appliedCount += 1;
        }
      } catch (applyError) {
        var rollbackFailed = false;
        for (i = touched.length - 1; i >= 0; i -= 1) {
          try {
            var touchedItem = touched[i];
            if (touchedItem) restoreItem(touchedItem);
          } catch (restoreError) {
            rollbackFailed = true;
          }
        }
        // Os controles criados saem junto: sliders orfaos sao pior que nada.
        if (preset && !preset.desfazer()) rollbackFailed = true;
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback LoopOut falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      return {
        changed: appliedCount > 0,
        warnings: preset ? preset.avisos : [],
        data: {
          appliedCount: appliedCount,
          unchangedCount: unchangedCount
        }
      };
    }
  });
}());
