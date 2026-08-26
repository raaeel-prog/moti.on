/**
 * `ae.expression.wiggle` aplica o template gerenciado de oscilacao nas
 * propriedades numericas selecionadas.
 *
 * DIFERENCA DE CONTRATO em relacao a LoopOut e Smooth: este comando **nao exige
 * keyframes**. `wiggle()` opera sobre valor estatico, e sacudir uma camada
 * parada e o uso principal da expressao — exigir animacao previa bloquearia o
 * caso mais comum.
 *
 * O resto do contrato e o mesmo: a selecao inteira e validada antes do primeiro
 * write, e conflito numa unica propriedade recusa o lote todo.
 */
(function () {
  var REQUIRED_ARGS = {
    frequency: true,
    amplitude: true,
    octaves: true,
    amplitudeMultiplier: true,
    seed: true,
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

  /**
   * @param {unknown} value
   * @param {number} min
   * @param {number} max
   * @returns {boolean}
   */
  function isIntegerInRange(value, min, max) {
    return (
      isFiniteNumber(value) &&
      Math.floor(/** @type {number} */ (value)) === value &&
      /** @type {number} */ (value) >= min &&
      /** @type {number} */ (value) <= max
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Wiggle desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Wiggle ausente.", {
          field: key
        });
      }
    }

    if (
      !isFiniteNumber(args.frequency) ||
      /** @type {number} */ (args.frequency) <= 0 ||
      /** @type {number} */ (args.frequency) > 100
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frequencia Wiggle invalida.", {
        field: "frequency"
      });
    }
    if (
      !isFiniteNumber(args.amplitude) ||
      /** @type {number} */ (args.amplitude) < 0 ||
      /** @type {number} */ (args.amplitude) > 100000
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Amplitude Wiggle invalida.", {
        field: "amplitude"
      });
    }
    if (!isIntegerInRange(args.octaves, 1, 10)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Quantidade de oitavas invalida.", {
        field: "octaves"
      });
    }
    if (
      !isFiniteNumber(args.amplitudeMultiplier) ||
      /** @type {number} */ (args.amplitudeMultiplier) < 0 ||
      /** @type {number} */ (args.amplitudeMultiplier) > 10
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Multiplicador de amplitude invalido.", {
        field: "amplitudeMultiplier"
      });
    }
    if (!isIntegerInRange(args.seed, 0, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente Wiggle invalida.", {
        field: "seed"
      });
    }
    if (args.conflictMode !== "skip") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de conflito nao permitido.", {
        field: "conflictMode"
      });
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

    var desired = MotionExpressions.renderWiggle({
      frequency: args.frequency,
      amplitude: args.amplitude,
      octaves: args.octaves,
      amplitudeMultiplier: args.amplitudeMultiplier,
      seed: args.seed
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

      // Sem checagem de numKeys: wiggle nao precisa de animacao previa.

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
        !MotionExpressions.isManagedWiggle(beforeExpression)
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

  MotionRegistry.register("ae.expression.wiggle", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Wiggle ficou invalido depois do preflight.");

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
            new Error("Rollback Wiggle falhou.")
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
