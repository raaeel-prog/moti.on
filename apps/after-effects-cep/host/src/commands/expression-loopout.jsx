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
        !MotionExpressions.isManagedLoopOut(beforeExpression)
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

  MotionRegistry.register("ae.expression.loopout", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("LoopOut ficou invalido depois do preflight.");

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
        warnings: [],
        data: {
          appliedCount: appliedCount,
          unchangedCount: unchangedCount
        }
      };
    }
  });
}());
