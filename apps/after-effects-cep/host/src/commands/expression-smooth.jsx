/**
 * `ae.expression.smooth` aplica o template gerenciado de suavizacao nas
 * propriedades numericas selecionadas.
 *
 * Mesmo contrato do LoopOut: a selecao inteira e validada antes do primeiro
 * write, e um conflito numa unica propriedade recusa o lote todo. Aplicar
 * metade de uma selecao seria pior que nao aplicar nada, porque o usuario nao
 * tem como saber onde parou.
 */
(function () {
  var REQUIRED_ARGS = {
    widthSeconds: true,
    samples: true,
    referenceTime: true,
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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Smooth desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Smooth ausente.", {
          field: key
        });
      }
    }

    if (
      !isFiniteNumber(args.widthSeconds) ||
      /** @type {number} */ (args.widthSeconds) <= 0 ||
      /** @type {number} */ (args.widthSeconds) > 3600
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Largura Smooth invalida.", {
        field: "widthSeconds"
      });
    }
    if (
      !isFiniteNumber(args.samples) ||
      Math.floor(/** @type {number} */ (args.samples)) !== args.samples ||
      /** @type {number} */ (args.samples) < 1 ||
      /** @type {number} */ (args.samples) > 101
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Quantidade de amostras invalida.", {
        field: "samples"
      });
    }
    if (
      args.referenceTime !== "current" &&
      (!isFiniteNumber(args.referenceTime) || /** @type {number} */ (args.referenceTime) < 0)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo de referencia invalido.", {
        field: "referenceTime"
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

    var desired = MotionExpressions.renderSmooth({
      widthSeconds: args.widthSeconds,
      samples: args.samples,
      referenceTime: args.referenceTime
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
      // `smooth()` calcula a media do valor ao longo do tempo. Numa propriedade
      // sem animacao o resultado e a propria constante, ou seja, um no-op que o
      // usuario leria como "o comando nao fez nada". Como o modo de conflito
      // recusa propriedades que ja tem expressao, keyframe e a unica fonte de
      // variacao possivel aqui — por isso o minimo de dois.
      if (
        typeof property.numKeys !== "number" ||
        property.numKeys < 2 ||
        Math.floor(property.numKeys) !== property.numKeys
      ) {
        return {
          error: failure(
            MotionContracts.ERROR.KEYFRAME_CONFLICT,
            "Smooth exige pelo menos dois keyframes em cada propriedade.",
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
        !MotionExpressions.isManagedSmooth(beforeExpression) &&
        !MotionExpressions.isManagedSmoothLive(beforeExpression)
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


  /** Os controles que o Smooth expoe no Effect Controls. */
  var LIVE_BINDINGS = /** @type {MotionLiveControlBindingHost[]} */ ([
    {
      paramId: "widthSeconds",
      label: { "pt-BR": "Largura", "en-US": "Width" },
      help: {
        "pt-BR": "Janela de suavização, em segundos.",
        "en-US": "Smoothing window, in seconds."
      },
      control: "slider",
      target: "layer",
      order: 1,
      min: 0,
      max: 10
    },
    {
      paramId: "samples",
      label: { "pt-BR": "Amostras", "en-US": "Samples" },
      help: {
        "pt-BR": "Quantas leituras entram na média. Mais custa mais.",
        "en-US": "How many readings feed the average. More costs more."
      },
      control: "slider",
      target: "layer",
      order: 2,
      min: 1,
      max: 100
    }
  ]);
  MotionRegistry.register("ae.expression.smooth", {
    preflight: function (args, context, options) {
      if (options && options.emitLiveControls === true) return validateArgs(args) || MotionQuickEffects.prepare("smooth", args, options).error;
      return prepare(args).error;
    },

    /**
     * @param {Record<string, unknown>} args
     * @param {Record<string, unknown>} context
     * @param {Record<string, unknown>} [options]
     * @returns {MotionCommandResult}
     */
    run: function (args, context, options) {
      if (options && options.emitLiveControls === true) return MotionQuickEffects.run("smooth", args, context, options);
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Smooth ficou invalido depois do preflight.");

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
          tool: "Smooth",
          rigId: "ae.expression.smooth",
          locale: context ? context.locale : null,
          bindings: LIVE_BINDINGS,
          values: {
            widthSeconds: args.widthSeconds,
            samples: args.samples
          }
        });
        for (vivo = 0; vivo < prepared.items.length; vivo += 1) {
          var alvoVivo = prepared.items[vivo];
          var refs = preset.refsPorPropriedade[vivo];
          if (!alvoVivo || !refs) continue;
          alvoVivo.desired = MotionExpressions.renderSmoothLive(
            /** @type {{widthSeconds: string, samples: string}} */ (refs)
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
            new Error("Rollback Smooth falhou.")
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
