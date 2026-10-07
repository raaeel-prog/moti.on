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
    // Validate every target before adding any animator or writing expressions.
    for (var layerIndex = 0; layerIndex < comp.selectedLayers.length; layerIndex += 1) {
      var layer = /** @type {any} */ (comp.selectedLayers[layerIndex]);
      if (layer.locked === true) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie as camadas antes de aplicar Kinetic.", null);
      if (layer instanceof TextLayer && args.splitMode !== "none") {
        if (args.rotation === 0 && args.scale === 0 && args.opacity === 0) return failure(MotionContracts.ERROR.INVALID_PRESET, "Escolha opacidade, escala ou rotacao para animar o texto.", null);
        var textGroup = textAnimators(layer);
        if (!textGroup) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe animadores de texto.", null);
        var animator = existingTextAnimator(layer);
        if (animator) {
          var properties = animator.property("ADBE Text Animator Properties");
          var selector = timingSelector(animator);
          // AE exposes inactive Text Animator properties too; numProperties
          // is not the count of controls we added. Check our three below.
          if (animator.property("ADBE Text Selectors").numProperties !== 1) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "O animador Kinetic foi personalizado. Preserve-o antes de reaplicar.", null);
          for (var p = 0; p < TEXT_PROPS.length; p += 1) {
            var target = properties.property(/** @type {string} */ (TEXT_PROPS[p]));
            if (!target || target.numKeys > 0 || target.expression !== "") return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "O animador Kinetic contem ajustes manuais animados.", null);
          }
          if (selector.property("ADBE Text Range Type2").numKeys > 0 || selector.property("ADBE Text Expressible Amount").numKeys > 0) return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "O seletor Kinetic contem keyframes manuais.", null);
        }
      } else if (targetsForLayer(layer, comp.selectedProperties || []).length === 0) {
        return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Kinetic exige dois keyframes na propriedade, ou texto com divisao por caracteres, palavras ou linhas.", null);
      }
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

  var TEXT_HEADER = "// MOTION_KINETIC_TEXT v1\n";
  var TEXT_BODY =
    "var d = settings.durationFrames * thisComp.frameDuration;\n" +
    "var delay = (textIndex - 1) * settings.staggerFrames * thisComp.frameDuration;\n" +
    "function back(u) { u = Math.max(0, Math.min(1, u)) - 1; return 1 + (settings.overshoot + 1) * u * u * u + settings.overshoot * u * u; }\n" +
    "var incoming = 1 - back((time - inPoint - delay) / d);\n" +
    "var outgoing = back((time - (outPoint - d - (textTotal - textIndex) * settings.staggerFrames * thisComp.frameDuration)) / d);\n" +
    "100 * (settings.direction === \"in\" ? incoming : settings.direction === \"out\" ? outgoing : Math.max(incoming, outgoing));";
  var TEXT_PROPS = ["ADBE Text Opacity", "ADBE Text Rotation", "ADBE Text Scale 3D"];

  /** @param {Record<string, unknown>} args @returns {string} */
  function textExpression(args) {
    var settings = {direction: args.direction, durationFrames: args.durationFrames, overshoot: args.overshoot, staggerFrames: args.staggerFrames};
    return TEXT_HEADER + "var settings = " + MotionJson.stringify(settings) + ";\n" + TEXT_BODY;
  }

  /** @param {string} expression @returns {boolean} */
  function managedText(expression) {
    if (typeof expression !== "string" || expression.indexOf(TEXT_HEADER + "var settings = ") !== 0) return false;
    var end = expression.indexOf(";\n", TEXT_HEADER.length);
    if (end < 0) return false;
    try {
      var settings = /** @type {Record<string, unknown>} */ (MotionJson.parse(expression.substring(TEXT_HEADER.length + 15, end)));
      return textExpression(settings) === expression;
    } catch (e) { return false; }
  }

  /** @param {any} layer @returns {any} */
  function textAnimators(layer) {
    var text = layer.property("ADBE Text Properties");
    return text ? text.property("ADBE Text Animators") : null;
  }

  /** @param {any} animator @returns {any} */
  function timingSelector(animator) {
    var selectors = animator.property("ADBE Text Selectors");
    for (var i = 1; selectors && i <= selectors.numProperties; i += 1) {
      var sel = selectors.property(i);
      var amount = sel.property("ADBE Text Expressible Amount");
      if (amount && managedText(amount.expression)) return sel;
    }
    return null;
  }

  /** @param {any} layer @returns {any} */
  function existingTextAnimator(layer) {
    var animators = textAnimators(layer);
    for (var i = 1; animators && i <= animators.numProperties; i += 1) {
      var animator = animators.property(i);
      if (timingSelector(animator)) return animator;
    }
    return null;
  }

  /** @param {any} layer @param {Record<string, unknown>} args @param {any[]} journal @returns {void} */
  function applyTextAnimator(layer, args, journal) {
    var animator = existingTextAnimator(layer);
    var created = !animator;
    var group = textAnimators(layer);
    if (created) { animator = group.addProperty("ADBE Text Animator"); animator.name = "Moti.on Kinetic"; }
    var record = /** @type {any} */ ({layer: layer, index: animator.propertyIndex, created: created, properties: [], selector: null});
    journal.push(record);
    var props = animator.property("ADBE Text Animator Properties");
    var values = [100 - Number(args.opacity), args.rotation, [100 + Number(args.scale), 100 + Number(args.scale), 100]];
    for (var j = 0; j < TEXT_PROPS.length; j += 1) {
      var name = /** @type {string} */ (TEXT_PROPS[j]);
      if (created) props.addProperty(name);
      // Indexed groups invalidate earlier child handles after addProperty.
      animator = group.property(record.index);
      props = animator.property("ADBE Text Animator Properties");
      var prop = props.property(name);
      if (!created) record.properties.push({name: name, value: prop.value});
      prop.setValue(values[j]);
    }
    animator = group.property(record.index);
    var selectors = animator.property("ADBE Text Selectors");
    var selector = created ? selectors.addProperty("ADBE Text Expressible Selector") : timingSelector(animator);
    if (created) selector.name = "Moti.on Kinetic Timing";
    var unit = selector.property("ADBE Text Range Type2");
    var amount = selector.property("ADBE Text Expressible Amount");
    if (!created) record.selector = {unit: unit.value, expression: amount.expression, enabled: amount.expressionEnabled};
    unit.setValue(args.splitMode === "words" ? 3 : args.splitMode === "lines" ? 4 : 1);
    applyExpression(amount, textExpression(args));
  }

  /** @param {any[]} journal @returns {void} */
  function restoreText(journal) {
    for (var i = journal.length - 1; i >= 0; i -= 1) {
      var record = journal[i];
      var animator = textAnimators(record.layer).property(record.index);
      if (record.created) { animator.remove(); continue; }
      var props = animator.property("ADBE Text Animator Properties");
      for (var j = 0; j < record.properties.length; j += 1) {
        props.property(record.properties[j].name).setValue(record.properties[j].value);
      }
      if (record.selector) {
        var selector = animator.property("ADBE Text Selectors").property(1);
        selector.property("ADBE Text Range Type2").setValue(record.selector.unit);
        var amount = selector.property("ADBE Text Expressible Amount");
        amount.expression = record.selector.expression;
        amount.expressionEnabled = record.selector.enabled;
      }
    }
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
    /** @type {any[]} */
    var animatorsCriados = [];
    var appliedCount = 0;
    var i;
    var t;

    try {
      for (i = 0; i < selectedLayers.length; i += 1) {
        var layer = /** @type {any} */ (selectedLayers[i]);

        if (layer instanceof TextLayer && splitMode !== "none") {
          applyTextAnimator(layer, args, animatorsCriados);
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
        restoreText(animatorsCriados);
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
