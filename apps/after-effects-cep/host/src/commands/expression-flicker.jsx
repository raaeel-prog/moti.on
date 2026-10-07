/**
 * `ae.expression.flicker` aplica o template gerenciado de piscada nas
 * propriedades numericas selecionadas.
 *
 * Como o Wiggle, **nao exige keyframes**: piscar um valor estatico e o uso
 * principal. Diferente de todos os outros, o template MULTIPLICA o valor da
 * propriedade em vez de substitui-lo — `random(min, max)` com dois numeros
 * devolve escalar, e um escalar numa propriedade 2D ou 3D quebraria a expressao
 * dentro do After Effects. Registro em
 * docs/research/after-effects-wiggle-and-seed.md.
 */
(function () {
  var REQUIRED_ARGS = {
    rate: true,
    minFactor: true,
    maxFactor: true,
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

  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function isInRange(value, min, max) {
    return (
      isFiniteNumber(value) &&
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Flicker desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Flicker ausente.", {
          field: key
        });
      }
    }

    if (!isFiniteNumber(args.rate) || /** @type {number} */ (args.rate) <= 0 || /** @type {number} */ (args.rate) > 120) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Taxa Flicker invalida.", { field: "rate" });
    }
    if (!isInRange(args.minFactor, 0, 10)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fator minimo invalido.", {
        field: "minFactor"
      });
    }
    if (!isInRange(args.maxFactor, 0, 10)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fator maximo invalido.", {
        field: "maxFactor"
      });
    }
    // Invariante entre campos: random(1, 0) nao e erro no After Effects, mas faz
    // o contrario do que a interface declarou.
    if (/** @type {number} */ (args.minFactor) > /** @type {number} */ (args.maxFactor)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "O fator minimo nao pode passar do maximo.", {
        field: "minFactor"
      });
    }
    if (
      !isFiniteNumber(args.seed) ||
      Math.floor(/** @type {number} */ (args.seed)) !== args.seed ||
      /** @type {number} */ (args.seed) < 0 ||
      /** @type {number} */ (args.seed) > 100000
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente Flicker invalida.", {
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

    var desired = MotionExpressions.renderFlicker({
      rate: args.rate,
      minFactor: args.minFactor,
      maxFactor: args.maxFactor,
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

      // Sem checagem de numKeys: piscar valor estatico e o uso principal.

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
        !MotionExpressions.isManagedFlicker(beforeExpression) &&
        !MotionExpressions.isManagedFlickerLive(beforeExpression)
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

  /** Os quatro controles que o Flicker expoe no Effect Controls. */
  var LIVE_BINDINGS = /** @type {MotionLiveControlBindingHost[]} */ ([
    {
      paramId: "rate",
      label: { "pt-BR": "Taxa", "en-US": "Rate" },
      help: { "pt-BR": "Trocas por segundo.", "en-US": "Changes per second." },
      control: "slider",
      target: "layer",
      order: 1,
      min: 0,
      max: 120
    },
    {
      paramId: "minFactor",
      label: { "pt-BR": "Mínimo", "en-US": "Minimum" },
      help: { "pt-BR": "Fator mais baixo do sorteio.", "en-US": "Lowest drawn factor." },
      control: "slider",
      target: "layer",
      order: 2,
      min: 0,
      max: 10
    },
    {
      paramId: "maxFactor",
      label: { "pt-BR": "Máximo", "en-US": "Maximum" },
      help: { "pt-BR": "Fator mais alto do sorteio.", "en-US": "Highest drawn factor." },
      control: "slider",
      target: "layer",
      order: 3,
      min: 0,
      max: 10
    },
    {
      paramId: "seed",
      label: { "pt-BR": "Seed", "en-US": "Seed" },
      help: { "pt-BR": "Muda o sorteio sem mudar a intensidade.", "en-US": "Changes the draw, not the intensity." },
      control: "slider",
      target: "layer",
      order: 4,
      min: 0,
      max: 100000
    }
  ]);

  MotionRegistry.register("ae.expression.flicker", {
    preflight: function (args, context, options) {
      if (options && options.emitLiveControls === true) return validateArgs(args) || MotionQuickEffects.prepare("flicker", args, options).error;
      return prepare(args).error;
    },

    /**
     * @param {Record<string, unknown>} args
     * @param {Record<string, unknown>} context
     * @param {Record<string, unknown>} [options]
     * @returns {MotionCommandResult}
     */
    run: function (args, context, options) {
      if (options && options.emitLiveControls === true) return MotionQuickEffects.run("flicker", args, context, options);
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Flicker ficou invalido depois do preflight.");

      var touched = [];
      var appliedCount = 0;
      var unchangedCount = 0;
      var i;

      // Live Controls: sliders na camada em vez de numeros cravados, para o
      // usuario ajustar a taxa e a faixa dentro do After Effects.
      var live = !!(options && options.emitLiveControls === true);
      var preset = null;
      if (live && prepared.items.length > 0) {
        var propriedades = [];
        for (i = 0; i < prepared.items.length; i += 1) {
          var origem = prepared.items[i];
          if (origem) propriedades.push(origem.property);
        }
        preset = MotionLivePreset.aplicar(propriedades, {
          tool: "Flicker",
          rigId: "ae.expression.flicker",
          locale: context ? context.locale : null,
          bindings: LIVE_BINDINGS,
          values: {
            rate: args.rate,
            minFactor: args.minFactor,
            maxFactor: args.maxFactor,
            seed: args.seed
          }
        });
        for (i = 0; i < prepared.items.length; i += 1) {
          var alvo = prepared.items[i];
          var refs = preset.refsPorPropriedade[i];
          if (!alvo || !refs) continue;
          alvo.desired = MotionExpressions.renderFlickerLive(
            /** @type {{rate: string, minFactor: string, maxFactor: string, seed: string}} */ (refs)
          );
          alvo.changed = alvo.beforeExpression !== alvo.desired || alvo.beforeEnabled !== true;
        }
      }
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
            new Error("Rollback Flicker falhou.")
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
