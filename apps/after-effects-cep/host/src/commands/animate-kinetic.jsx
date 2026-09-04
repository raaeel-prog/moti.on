(function() {
  /* global Property */
  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: details || null };
  }

  /** @param {unknown} value @returns {boolean} */
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {unknown} value @returns {boolean} */
  function isInteger(value) {
    return isFiniteNumber(value) && Math.floor(/** @type {number} */ (value)) === value;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var allowed = {
      direction: true,
      durationFrames: true,
      overshoot: true,
      rotation: true,
      scale: true,
      opacity: true,
      staggerFrames: true,
      splitMode: true
    };
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(allowed, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Kinetic desconhecido.", { field: key });
      }
    }
    if (args.direction !== "in" && args.direction !== "out" && args.direction !== "both") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Direcao Kinetic invalida.", { field: "direction" });
    }
    if (!isInteger(args.durationFrames) || /** @type {number} */ (args.durationFrames) < 1 || /** @type {number} */ (args.durationFrames) > 1000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao Kinetic invalida.", { field: "durationFrames" });
    }
    if (!isFiniteNumber(args.overshoot) || /** @type {number} */ (args.overshoot) < 0 || /** @type {number} */ (args.overshoot) > 10) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Overshoot Kinetic invalido.", { field: "overshoot" });
    }
    if (!isFiniteNumber(args.rotation) || !isFiniteNumber(args.scale) || !isFiniteNumber(args.opacity)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor Kinetic invalido.", null);
    }
    if (!isInteger(args.staggerFrames) || /** @type {number} */ (args.staggerFrames) < 0 || /** @type {number} */ (args.staggerFrames) > 1000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Stagger Kinetic invalido.", { field: "staggerFrames" });
    }
    if (args.splitMode !== "none" && args.splitMode !== "chars" && args.splitMode !== "words" && args.splitMode !== "lines") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Split Kinetic invalido.", { field: "splitMode" });
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.", null);
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }
    if (comp.selectedLayers.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos um layer.", null);
    }
    var i;
    var prop;
    if (comp.selectedProperties && comp.selectedProperties.length > 0) {
      for (i = 0; i < comp.selectedProperties.length; i += 1) {
        prop = /** @type {Property} */ (comp.selectedProperties[i]);
        if (prop instanceof Property && prop.canSetExpression && prop.numKeys >= 2 && prop.expression !== "" && !MotionExpressions.isManagedKinetic(prop.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A selecao contem expressao de usuario.", null);
        }
      }
    } else {
      for (i = 0; i < comp.selectedLayers.length; i += 1) {
        var selectedLayer = comp.selectedLayers[i];
        if (!selectedLayer) continue;
        var transform = selectedLayer.property("ADBE Transform Group");
        prop = transform ? /** @type {Property} */ (transform.property("ADBE Position")) : null;
        if (prop instanceof Property && prop.numKeys >= 2 && prop.expression !== "" && !MotionExpressions.isManagedKinetic(prop.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Position contem expressao de usuario.", null);
        }
      }
    }
    return null;
  }

  /**
   * Camada dona de uma propriedade. Sobe por `parentProperty` ate o topo, que e
   * a propria Layer.
   *
   * `comp.selectedProperties` e da composicao inteira, nao da camada. A versao
   * anterior lia essa lista dentro do laco de camadas, entao com tres camadas
   * selecionadas as mesmas propriedades da primeira recebiam a expressao tres
   * vezes e as outras duas camadas nao recebiam nada.
   *
   * @param {Property} property
   * @returns {unknown}
   */
  function ownerLayer(property) {
    var current = /** @type {any} */ (property);
    var guard = 0;
    while (current && current.parentProperty && guard < 64) {
      current = current.parentProperty;
      guard += 1;
    }
    return current;
  }

  /**
   * Propriedades desta camada que recebem overshoot: as selecionadas pelo
   * usuario e, se ele nao selecionou nenhuma, a Position da camada.
   *
   * @param {unknown} layer
   * @param {ReadonlyArray<unknown>} selectedProps
   * @returns {Property[]}
   */
  function targetsForLayer(layer, selectedProps) {
    var targets = [];
    var i;
    for (i = 0; i < selectedProps.length; i += 1) {
      var candidate = /** @type {any} */ (selectedProps[i]);
      if (
        candidate instanceof Property &&
        candidate.canSetExpression &&
        candidate.numKeys >= 2 &&
        ownerLayer(candidate) === layer
      ) {
        targets.push(candidate);
      }
    }
    if (targets.length > 0) return targets;

    var group = /** @type {any} */ (layer).property("ADBE Transform Group");
    var position = group ? group.property("ADBE Position") : null;
    if (position instanceof Property && position.canSetExpression && position.numKeys >= 2) {
      targets.push(position);
    }
    return targets;
  }

  /**
   * O After Effects nao lanca ao recusar uma expressao: guarda o motivo em
   * expressionError e deixa a propriedade acesa e quebrada.
   *
   * @param {Property} property
   * @param {string} expression
   * @returns {void}
   */
  function applyExpression(property, expression) {
    property.expression = expression;
    if (typeof property.expressionError === "string" && property.expressionError !== "") {
      throw new Error("After Effects recusou a expressao gerenciada.");
    }
    property.expressionEnabled = true;
    if (property.expressionEnabled !== true) {
      throw new Error("After Effects nao habilitou a expressao gerenciada.");
    }
  }

  /**
   * @param {unknown} layer
   * @param {string} splitMode
   * @param {Record<string, unknown>} args
   * @returns {PropertyGroup}
   */
  function addTextAnimator(layer, splitMode, args) {
    var textProp = /** @type {any} */ (layer).property("ADBE Text Properties");
    if (!textProp) throw new Error("Camada de texto sem grupo de texto.");
    var animators = textProp.property("ADBE Text Animators");
    if (!animators) throw new Error("Camada de texto sem grupo de animadores.");

    var animator = animators.addProperty("ADBE Text Animator");

    var selectors = animator.property("ADBE Text Selectors");
    if (selectors && selectors.numProperties > 0) {
      var rangeSel = selectors.property(1);
      var advanced = rangeSel ? rangeSel.property("ADBE Text Selector Advance") : null;
      if (advanced) {
        // 1 = caracteres, 3 = palavras, 4 = linhas.
        var basedOn = 1;
        if (splitMode === "words") basedOn = 3;
        else if (splitMode === "lines") basedOn = 4;
        var basedOnProp = advanced.property("ADBE Text Animator Based On");
        if (basedOnProp) basedOnProp.setValue(basedOn);
      }
    }

    var animProps = animator.property("ADBE Text Animator Properties");
    if (animProps) {
      if (/** @type {number} */ (args.opacity) !== 0) {
        var opacityProp = animProps.addProperty("ADBE Text Opacity");
        if (opacityProp instanceof Property) opacityProp.setValue(0);
      }
      if (/** @type {number} */ (args.rotation) !== 0) {
        var rotProp = animProps.addProperty("ADBE Text Rotation");
        if (rotProp instanceof Property) rotProp.setValue(/** @type {number} */ (args.rotation));
      }
      if (/** @type {number} */ (args.scale) !== 0) {
        var escala = 100 + /** @type {number} */ (args.scale);
        var scaleProp = animProps.addProperty("ADBE Text Scale 3D");
        if (scaleProp instanceof Property) scaleProp.setValue([escala, escala, 100]);
      }
    }

    return animator;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedLayers = comp.selectedLayers;
    var selectedProps = comp.selectedProperties || [];

    // Sem `|| padrao`: o preflight ja recusou o que nao fosse valido, e um
    // fallback aqui converteria zero — que e escolha legitima do usuario — em
    // outro numero. Era assim que staggerFrames: 0 acabava virando 2 e
    // deslocando o startTime das camadas.
    var direction = /** @type {string} */ (args.direction);
    var durationFrames = /** @type {number} */ (args.durationFrames);
    var overshoot = /** @type {number} */ (args.overshoot);
    var staggerFrames = /** @type {number} */ (args.staggerFrames);
    var splitMode = /** @type {string} */ (args.splitMode);

    /** @type {Array<{ property: Property, expression: string, expressionEnabled: boolean }>} */
    var touched = [];
    /** @type {PropertyGroup[]} */
    var animatorsCriados = [];
    var appliedCount = 0;
    var i;
    var t;

    try {
      for (i = 0; i < selectedLayers.length; i += 1) {
        var layer = /** @type {any} */ (selectedLayers[i]);

        if (layer instanceof TextLayer && splitMode !== "none") {
          animatorsCriados.push(addTextAnimator(layer, splitMode, args));
          appliedCount += 1;
          continue;
        }

        var targets = targetsForLayer(layer, selectedProps);
        if (targets.length === 0) continue;

        // O stagger vira token da expressao. Deslocar `startTime`, como antes,
        // movia a camada inteira, somava a cada reaplicacao e nao voltava quando
        // a expressao era removida.
        var expr = MotionExpressions.renderKinetic({
          durationFrames: durationFrames,
          overshoot: overshoot,
          direction: direction,
          delayFrames: staggerFrames * i
        });

        for (t = 0; t < targets.length; t += 1) {
          var target = /** @type {Property} */ (targets[t]);
          if (target.expression !== "" && !MotionExpressions.isManagedKinetic(target.expression)) {
            var conflict = /** @type {Error & {motionCode?: string}} */ (
              new Error("Expressao de usuario em propriedade Kinetic.")
            );
            conflict.motionCode = MotionContracts.ERROR.EXPRESSION_CONFLICT;
            throw conflict;
          }
          touched.push({
            property: target,
            expression: target.expression,
            expressionEnabled: target.expressionEnabled
          });
          applyExpression(target, expr);
          appliedCount += 1;
        }
      }
    } catch (e) {
      try {
        for (i = touched.length - 1; i >= 0; i -= 1) {
          var snapshot = touched[i];
          if (!snapshot) continue;
          snapshot.property.expression = snapshot.expression;
          snapshot.property.expressionEnabled = snapshot.expressionEnabled;
        }
        for (i = animatorsCriados.length - 1; i >= 0; i -= 1) {
          var animator = animatorsCriados[i];
          if (animator) animator.remove();
        }
      } catch (rollbackError) {
        var tagged = /** @type {Error & {motionCode?: string}} */ (rollbackError);
        tagged.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw tagged;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Kinetic falhou."));
      var causa = /** @type {{motionCode?: string}} */ (e);
      failErr.motionCode =
        causa && causa.motionCode === MotionContracts.ERROR.EXPRESSION_CONFLICT
          ? MotionContracts.ERROR.EXPRESSION_CONFLICT
          : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    // `changed` mede o que realmente aconteceu. Devolver `true` fixo, como antes,
    // fazia o dispatcher confirmar mudanca mesmo quando nenhuma camada tinha alvo.
    return { changed: appliedCount > 0, warnings: [], data: { appliedCount: appliedCount } };
  }

  MotionRegistry.register("ae.animate.kinetic", {
    preflight: preflight,
    run: run
  });
})();
