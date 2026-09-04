/**
 * Inercia/overshoot apos mudanca de velocidade (`ae.animate.inertial`, P1).
 *
 * O comando nao escreve keyframe nenhum: ele aplica uma expressao gerenciada por
 * cima dos keyframes que ja existem. Isso e o que permite ajustar amplitude e
 * decaimento depois sem reconstruir a animacao, e remover o efeito devolvendo
 * exatamente a curva original.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    amplitude: true,
    frequency: true,
    decay: true,
    maxDurationFrames: true,
    startMode: true
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
   * @param {number} minimo
   * @param {number} maximo
   * @returns {boolean}
   */
  function isInRange(value, minimo, maximo) {
    return isFiniteNumber(value) && /** @type {number} */ (value) >= minimo && /** @type {number} */ (value) <= maximo;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Inertial desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Inertial ausente.", { field: key });
      }
    }
    if (!isInRange(args.amplitude, 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Amplitude Inertial invalida.", { field: "amplitude" });
    }
    if (!isInRange(args.frequency, 0, 60)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frequencia Inertial invalida.", { field: "frequency" });
    }
    if (!isInRange(args.decay, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Decaimento Inertial invalido.", { field: "decay" });
    }
    if (
      !isInRange(args.maxDurationFrames, 1, 10000) ||
      Math.floor(/** @type {number} */ (args.maxDurationFrames)) !== args.maxDurationFrames
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao maxima Inertial invalida.", {
        field: "maxDurationFrames"
      });
    }
    if (args.startMode !== "everyKey" && args.startMode !== "lastKey") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de inicio Inertial invalido.", { field: "startMode" });
    }
    return null;
  }

  /**
   * A inercia deriva da velocidade da propria propriedade, entao ela so faz
   * sentido em propriedade temporal numerica ou vetorial. Texto, marker e valor
   * customizado nao tem velocidade.
   *
   * @param {Property} property
   * @returns {boolean}
   */
  function isSupportedProperty(property) {
    if (!(property instanceof Property)) return false;
    if (property.propertyType !== PropertyType.PROPERTY) return false;
    if (property.canSetExpression !== true) return false;
    var tipo = property.propertyValueType;
    return (
      tipo !== PropertyValueType.NO_VALUE &&
      tipo !== PropertyValueType.CUSTOM_VALUE &&
      tipo !== PropertyValueType.MARKER &&
      tipo !== PropertyValueType.TEXT_DOCUMENT
    );
  }

  /**
   * Preflight e run compartilham esta funcao para que a decisao seja tomada uma
   * vez so. A §8 exige que toda validacao aconteca antes do grupo de Undo abrir:
   * um comando que valida no meio ja mudou o projeto quando descobre que nao
   * devia ter comecado.
   *
   * @param {Record<string, unknown>} args
   * @returns {{ error: MotionCommandFailure|null, items: Array<Record<string, unknown>>, desired: string }}
   */
  function prepare(args) {
    var validation = validateArgs(args);
    if (validation) return { error: validation, items: [], desired: "" };

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedProperties;
    if (!selecionadas || selecionadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma propriedade animada.", null),
        items: [],
        desired: ""
      };
    }

    var desired = MotionExpressions.renderInertial({
      amplitude: args.amplitude,
      frequency: args.frequency,
      decay: args.decay,
      maxDurationFrames: args.maxDurationFrames,
      startMode: args.startMode
    });

    var items = [];
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var property = /** @type {Property} */ (selecionadas[i]);
      if (!isSupportedProperty(property)) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "A selecao contem propriedade sem velocidade para herdar.",
            { selectionIndex: i }
          ),
          items: [],
          desired: desired
        };
      }
      // Sem dois keyframes nao existe mudanca de velocidade da qual herdar
      // inercia. Recusar aqui e mais util do que aplicar uma expressao que
      // devolve `value` para sempre e parece quebrada.
      if (property.numKeys < 2) {
        return {
          error: failure(
            MotionContracts.ERROR.NO_SELECTION,
            "Inertial precisa de ao menos dois keyframes na propriedade.",
            { selectionIndex: i }
          ),
          items: [],
          desired: desired
        };
      }

      var antes = property.expression;
      if (antes !== "" && antes !== desired && !MotionExpressions.isManagedInertial(antes)) {
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
        beforeExpression: antes,
        beforeEnabled: property.expressionEnabled,
        changed: antes !== desired || property.expressionEnabled !== true
      });
    }

    return { error: null, items: items, desired: desired };
  }

  /** @param {Record<string, unknown>} item @returns {void} */
  function restoreItem(item) {
    var property = /** @type {Property} */ (item.property);
    property.expression = /** @type {string} */ (item.beforeExpression);
    property.expressionEnabled = item.beforeEnabled === true;
  }

  MotionRegistry.register("ae.animate.inertial", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Inertial ficou invalido depois do preflight.");

      var tocadas = [];
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

          tocadas.push(item);
          var property = /** @type {Property} */ (item.property);
          property.expression = prepared.desired;
          // O After Effects nao lanca ao recusar uma expressao: reporta em
          // expressionError e deixa a propriedade acesa e quebrada.
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
        for (i = tocadas.length - 1; i >= 0; i -= 1) {
          try {
            var tocada = tocadas[i];
            if (tocada) restoreItem(tocada);
          } catch (restoreError) {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Inertial falhou e o estado anterior nao pode ser restaurado.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Inertial falhou."));
        failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
        throw failErr;
      }

      return {
        changed: appliedCount > 0,
        warnings: [],
        data: { appliedCount: appliedCount, unchangedCount: unchangedCount }
      };
    }
  });
})();
