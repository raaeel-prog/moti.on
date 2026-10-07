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
        !MotionExpressions.isManagedWiggle(beforeExpression) &&
        !MotionExpressions.isManagedWiggleLive(beforeExpression)
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

  /**
   * Os tres controles que o Wiggle expoe no Effect Controls.
   *
   * Sem `unit`: `live-controls.jsx` acrescenta " (unidade)" ao nome do efeito
   * quando ela existe, e aqui o nome curto le melhor no painel do After
   * Effects, que ja e estreito.
   */
  var LIVE_BINDINGS = /** @type {MotionLiveControlBindingHost[]} */ ([
    {
      paramId: "frequency",
      label: { "pt-BR": "Frequência", "en-US": "Frequency" },
      help: { "pt-BR": "Oscilações por segundo.", "en-US": "Wiggles per second." },
      control: "slider",
      target: "layer",
      order: 1,
      min: 0,
      max: 100
    },
    {
      paramId: "amplitude",
      label: { "pt-BR": "Amplitude", "en-US": "Amplitude" },
      help: { "pt-BR": "Quanto a propriedade se afasta do valor.", "en-US": "How far the property strays." },
      control: "slider",
      target: "layer",
      order: 2,
      min: 0,
      max: 100000
    },
    {
      paramId: "seed",
      label: { "pt-BR": "Seed", "en-US": "Seed" },
      help: { "pt-BR": "Muda o sorteio sem mudar a intensidade.", "en-US": "Changes the draw, not the intensity." },
      control: "slider",
      target: "layer",
      order: 3,
      min: 0,
      max: 100000
    }
  ]);

  MotionRegistry.register("ae.expression.wiggle", {
    preflight: function (args, context, options) {
      if (options && options.emitLiveControls === true) return validateArgs(args) || MotionQuickEffects.prepare("wiggle", args, options).error;
      return prepare(args).error;
    },

    /**
     * @param {Record<string, unknown>} args
     * @param {Record<string, unknown>} context
     * @param {Record<string, unknown>} [options]
     * @returns {MotionCommandResult}
     */
    run: function (args, context, options) {
      if (options && options.emitLiveControls === true) return MotionQuickEffects.run("wiggle", args, context, options);
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Wiggle ficou invalido depois do preflight.");

      // Live Controls: em vez de cravar os numeros na expressao, cria sliders
      // na camada e aponta a expressao para eles. E o que permite ajustar
      // frequencia e amplitude dentro do After Effects, sem voltar ao painel.
      var live = !!(options && options.emitLiveControls === true);
      var preset = null;
      var i;

      if (live && prepared.items.length > 0) {
        var propriedades = [];
        for (i = 0; i < prepared.items.length; i += 1) {
          var origem = prepared.items[i];
          if (origem) propriedades.push(origem.property);
        }
        preset = MotionLivePreset.aplicar(propriedades, {
          tool: "Wiggle",
          rigId: "ae.expression.wiggle",
          locale: context ? context.locale : null,
          bindings: LIVE_BINDINGS,
          values: {
            frequency: args.frequency,
            amplitude: args.amplitude,
            seed: args.seed
          }
        });

        // Os controles ja existem: agora cada propriedade recebe a expressao
        // que aponta para os DELA. `changed` e recalculado porque o texto
        // desejado so ficou conhecido agora.
        for (i = 0; i < prepared.items.length; i += 1) {
          var alvo = prepared.items[i];
          var refs = preset.refsPorPropriedade[i];
          if (!alvo || !refs) continue;
          alvo.desired = MotionExpressions.renderWiggleLive(
            /** @type {{frequency: string, amplitude: string, seed: string}} */ (refs)
          );
          alvo.changed = alvo.beforeExpression !== alvo.desired || alvo.beforeEnabled !== true;
        }
      }

      var touched = [];
      var appliedCount = 0;
      var unchangedCount = 0;
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
        // Os controles criados saem junto: deixa-los para tras encheria o
        // Effect Controls de sliders orfaos que nenhuma expressao le.
        if (preset && !preset.desfazer()) rollbackFailed = true;
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
        warnings: preset ? preset.avisos : [],
        data: {
          appliedCount: appliedCount,
          unchangedCount: unchangedCount,
          liveControls: live
        }
      };
    }
  });
}());
