/**
 * Influencia por distancia a um controller (`ae.rig.effector`, P3).
 *
 * ## O controller tem sliders, e nao valores fixos
 *
 * A §pede "controller com sliders e expressao de distancia". A diferenca importa:
 * com os valores em sliders, o usuario ajusta raio e intensidade arrastando na
 * timeline e ve o resultado ao vivo — e pode **animar** o raio, que e metade da
 * graca de um effector. Com os valores assados na expressao, cada ajuste exigiria
 * rodar o comando de novo.
 *
 * Os sliders sao lidos por `effect(nome)(1)`: o nome e nosso, e o indice 1 e o
 * valor do Slider Control. Ler por nome de parametro seria fragil, porque o nome
 * do parametro e localizado.
 *
 * ## Fora do raio
 *
 * O criterio de aceite pede que fora do raio a propriedade volte **exatamente**
 * ao valor base. Isso e propriedade da expressao, e `rig-effector.test.mjs` a
 * verifica avaliando a formula em varias distancias.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    effectorType: true,
    radius: true,
    falloffCurve: true,
    curve: true,
    positionAmount: true,
    scaleAmount: true,
    rotationAmount: true,
    opacityAmount: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    scale: "ADBE Scale",
    rotation: "ADBE Rotate Z",
    opacity: "ADBE Opacity",
    slider: "ADBE Slider Control",
    sliderValue: "ADBE Slider Control-0001"
  };

  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "EFFECTOR";
  var NOME_RAIO = "Raio";
  var RIG_TYPE = "effector";

  /**
   * Os quatro alvos: qual propriedade recebe a expressao, qual argumento traz a
   * intensidade, e como o slider correspondente se chama.
   */
  var ALVOS = [
    { alvo: "position", propriedade: MN.position, argumento: "positionAmount", slider: "Posicao" },
    { alvo: "scale", propriedade: MN.scale, argumento: "scaleAmount", slider: "Escala" },
    { alvo: "rotation", propriedade: MN.rotation, argumento: "rotationAmount", slider: "Rotacao" },
    { alvo: "opacity", propriedade: MN.opacity, argumento: "opacityAmount", slider: "Opacidade" }
  ];

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

  /** @param {unknown} value @param {number} minimo @param {number} maximo @returns {boolean} */
  function isInRange(value, minimo, maximo) {
    return (
      isFiniteNumber(value) && /** @type {number} */ (value) >= minimo && /** @type {number} */ (value) <= maximo
    );
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Effector desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Effector ausente.", { field: key });
      }
    }
    if (args.effectorType !== "point" && args.effectorType !== "null") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tipo de effector invalido.", { field: "effectorType" });
    }
    if (!isInRange(args.radius, 1, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Raio invalido.", { field: "radius" });
    }
    if (args.falloffCurve !== "linear" && args.falloffCurve !== "smoothstep" && args.falloffCurve !== "bezier") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de queda invalida.", { field: "falloffCurve" });
    }
    var curva = /** @type {Record<string, unknown>} */ (args.curve);
    if (!curva) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva ausente.", { field: "curve" });
    }
    var componentes = ["x1", "y1", "x2", "y2"];
    var i;
    for (i = 0; i < componentes.length; i += 1) {
      var componente = /** @type {string} */ (componentes[i]);
      if (!isInRange(curva[componente], -10, 10)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva invalida.", { field: "curve" });
      }
    }
    for (i = 0; i < ALVOS.length; i += 1) {
      var alvoValidado = /** @type {{argumento: string}} */ (ALVOS[i]);
      if (!isInRange(args[alvoValidado.argumento], -100000, 100000)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Intensidade invalida.", {
          field: alvoValidado.argumento
        });
      }
    }
    // Todas as intensidades em zero nao muda nada, e gastar um grupo de Undo e
    // um controller para nada seria pior do que dizer que o pedido esta vazio.
    var algumaAtiva = false;
    for (i = 0; i < ALVOS.length; i += 1) {
      var alvoAtivo = /** @type {{argumento: string}} */ (ALVOS[i]);
      if (args[alvoAtivo.argumento] !== 0) algumaAtiva = true;
    }
    if (!algumaAtiva) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nenhuma intensidade foi pedida.", {
        field: "positionAmount"
      });
    }
    return null;
  }

  /** @param {unknown} layer @param {string} matchName @returns {Property|null} */
  function transformProperty(layer, matchName) {
    var grupo = /** @type {any} */ (layer).property(MN.transform);
    if (!grupo) return null;
    var property = grupo.property(matchName);
    return property instanceof Property ? property : null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var selecionadas = comp.selectedLayers || [];
    if (selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }

    var i;
    var j;
    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = selecionadas[i];
      if (controller && camada === controller) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O controller nao pode influenciar a si mesmo.", {
          selectionIndex: i
        });
      }
      for (j = 0; j < ALVOS.length; j += 1) {
        var alvo = /** @type {{alvo: string, propriedade: string, argumento: string, slider: string}} */ (ALVOS[j]);
        if (args[alvo.argumento] === 0) continue;
        var property = transformProperty(camada, alvo.propriedade);
        if (!property || property.canSetExpression !== true) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe a propriedade pedida.", {
            selectionIndex: i,
            property: alvo.propriedade
          });
        }
        if (property.expression !== "" && !MotionExpressions.isManagedEffector(property.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A propriedade contem expressao de usuario.", {
            selectionIndex: i,
            property: alvo.propriedade
          });
        }
      }
    }
    return null;
  }

  var GROUP_BINDINGS = [{"paramId": "radius", "label": {"pt-BR": "Raio", "en-US": "Radius"}, "control": "slider", "target": "controller", "order": 1, "min": 0, "max": 1000000, "unit": "px"}, {"paramId": "positionAmount", "label": {"pt-BR": "Posição", "en-US": "Position"}, "control": "slider", "target": "controller", "order": 2, "min": -100000, "max": 100000, "unit": "px"}, {"paramId": "scaleAmount", "label": {"pt-BR": "Escala", "en-US": "Scale"}, "control": "slider", "target": "controller", "order": 3, "min": -100000, "max": 100000, "unit": "%"}, {"paramId": "rotationAmount", "label": {"pt-BR": "Rotação", "en-US": "Rotation"}, "control": "slider", "target": "controller", "order": 4, "min": -100000, "max": 100000, "unit": "°"}, {"paramId": "opacityAmount", "label": {"pt-BR": "Opacidade", "en-US": "Opacity"}, "control": "slider", "target": "controller", "order": 5, "min": -100000, "max": 100000, "unit": "%"}];

  /**
   * @param {Record<string, unknown>} args
   * @param {any} context
   * @returns {MotionCommandResult}
   */
  function run(args, context) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;

    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var controllerCriado = null;
    var tocadas = [];
    var comentarioAnterior = null;
    var controls = /** @type {any} */ (null);
    var appliedCount = 0;
    var i;
    var j;

    try {
      if (!controller) {
        controller = comp.layers.addNull();
        controllerCriado = controller;
        controller.name = NOME_CONTROLLER;
        /** @type {Property} */ (transformProperty(controller, MN.position)).setValue([
          comp.width / 2,
          comp.height / 2
        ]);

        var alvoMeta = /** @type {any} */ (controller);
        comentarioAnterior = { layer: alvoMeta, comment: alvoMeta.comment };
        alvoMeta.comment = MotionRigMeta.write(
          alvoMeta.comment,
          MotionJson.stringify({ schemaVersion: 1, rigType: RIG_TYPE, falloffCurve: args.falloffCurve })
        );
      }

      var oldNames = {radius: NOME_RAIO, positionAmount: "Posicao", scaleAmount: "Escala", rotationAmount: "Rotacao", opacityAmount: "Opacidade"};
      controls = MotionGroupedControls.stage(controller, {tool: "Effector", rigId: "effector", locale: MotionLivePreset.normalizarLocale(context ? context.locale : null), targetKind: "controller", bindings: GROUP_BINDINGS, values: args}, oldNames);
      var groupName = controls.records[0].name;
      // Migrate every existing member in this composition, including unselected members.
      if (controls.legacy.length) {
        for (var n = 1; n <= comp.numLayers; n += 1) {
          var member = comp.layer(n);
          for (var t = 0; t < ALVOS.length; t += 1) {
            var oldTarget = /** @type {any} */ (ALVOS[t]);
            var oldProp = transformProperty(member, oldTarget.propriedade);
            if (!oldProp || !MotionExpressions.isManagedEffector(oldProp.expression)) continue;
            var source = oldProp.expression;
            if (source.indexOf("var nomeCtrl = " + MotionJson.stringify(controller.name) + ";") < 0) continue;
            var replacement = source.replace("var nomeRaio = " + MotionJson.stringify(NOME_RAIO), "var nomeRaio = " + MotionJson.stringify(groupName)).replace("var nomeQuantia = " + MotionJson.stringify(oldTarget.slider), "var nomeQuantia = " + MotionJson.stringify(groupName)).replace("ctrl.effect(nomeQuantia)(1)", "ctrl.effect(nomeQuantia)(" + (t + 2) + ")");
            tocadas.push({property: oldProp, expression: source, expressionEnabled: oldProp.expressionEnabled});
            oldProp.expression = replacement;
            if (oldProp.expressionError) throw new Error("A migração do Effector falhou.");
          }
        }
      }
      var nomeController = /** @type {any} */ (controller).name;

      for (i = 0; i < selecionadas.length; i += 1) {
        var camada = selecionadas[i];
        if (camada === controller) continue;

        for (j = 0; j < ALVOS.length; j += 1) {
          var alvo = /** @type {{alvo: string, propriedade: string, argumento: string, slider: string}} */ (ALVOS[j]);
          if (args[alvo.argumento] === 0) continue;

          var property = /** @type {Property} */ (transformProperty(camada, alvo.propriedade));
          var expr = MotionExpressions.renderEffector({
            controllerName: nomeController,
            radiusEffectName: groupName,
            amountEffectName: groupName,
            amountPropertyIndex: j + 2,
            falloffCurve: args.falloffCurve,
            curve: args.curve,
            target: alvo.alvo
          });

          tocadas.push({
            property: property,
            expression: property.expression,
            expressionEnabled: property.expressionEnabled
          });
          property.expression = expr;
          // O After Effects nao lanca ao recusar uma expressao: reporta em
          // expressionError e deixa a propriedade acesa e quebrada.
          if (typeof property.expressionError === "string" && property.expressionError !== "") {
            throw new Error("After Effects recusou a expressao do effector: " + property.expressionError);
          }
          property.expressionEnabled = true;
          appliedCount += 1;
        }
      }
      controls.commit();
    } catch (effectorError) {
      var rollbackFailed = false;
      if (controls) { try { controls.rollback(); } catch (controlsError) { rollbackFailed = true; } }
      for (i = tocadas.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = tocadas[i];
          if (!anterior) continue;
          anterior.property.expression = anterior.expression;
          anterior.property.expressionEnabled = anterior.expressionEnabled;
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (comentarioAnterior) {
        try {
          /** @type {any} */ (comentarioAnterior.layer).comment = comentarioAnterior.comment;
        } catch (commentError) {
          rollbackFailed = true;
        }
      }
      if (controllerCriado) {
        try {
          controllerCriado.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Effector falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Effector falhou: " + String(effectorError)));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: appliedCount > 0,
      warnings: [],
      data: { appliedCount: appliedCount, controllerCreated: controllerCriado !== null }
    };
  }

  MotionRegistry.register("ae.rig.effector", { preflight: preflight, run: run });
})();
