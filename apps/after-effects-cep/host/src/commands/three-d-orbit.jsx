/**
 * Orbita 3D com controller comum (`ae.3d.orbit`, CHMS-026).
 *
 * ## Por que parentear em vez de referenciar o centro
 *
 * A expressao de posicao orbita a **origem do proprio espaco do pai**, e as
 * camadas sao parenteadas ao null controlador. Assim nao existe referencia por
 * nome nem por indice dentro da expressao: nome e editavel e a §11 proibe usa-lo
 * como identificador, e indice muda quando alguem reordena a timeline — os dois
 * quebrariam a orbita em silencio. Parentesco e estrutural e sobrevive aos dois.
 *
 * Como efeito colateral util, mover o null move a orbita inteira, que e o
 * "controller comum" que a §pede.
 *
 * ## Bake
 *
 * `bake` avalia a expressao quadro a quadro e grava keyframes com o valor
 * avaliado, depois remove a expressao. A trajetoria assada e a mesma que a
 * expressao produzia porque os valores vieram dela — a tolerancia subpixel do
 * criterio de aceite sai por construcao, e nao por aproximacao.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    radius: true,
    speed: true,
    inclination: true,
    phase: true,
    targetMode: true,
    faceTarget: true,
    bake: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    orientation: "ADBE Orientation"
  };

  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "ORBIT";

  /** Teto de quadros assados, para um pedido distraido nao travar o host. */
  var MAX_FRAMES_BAKE = 18000;

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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Orbit desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Orbit ausente.", { field: key });
      }
    }
    if (!isInRange(args.radius, 1, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Raio de orbita invalido.", { field: "radius" });
    }
    if (!isInRange(args.speed, -36000, 36000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Velocidade de orbita invalida.", { field: "speed" });
    }
    if (!isInRange(args.inclination, -360, 360)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Inclinacao de orbita invalida.", { field: "inclination" });
    }
    if (!isInRange(args.phase, -36000, 36000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fase de orbita invalida.", { field: "phase" });
    }
    if (args.targetMode !== "newController" && args.targetMode !== "reuseController") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de alvo invalido.", { field: "targetMode" });
    }
    if (typeof args.faceTarget !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "faceTarget precisa ser booleano.", { field: "faceTarget" });
    }
    if (typeof args.bake !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "bake precisa ser booleano.", { field: "bake" });
    }
    return null;
  }

  /**
   * Controller gerenciado ja existente na composicao.
   *
   * Como no Trim Paths, o reconhecimento e por prefixo no nome: e heuristica
   * declarada, nao identidade. Nao achar simplesmente cria outro, que e o pior
   * caso aceitavel — nunca sobrescrever um null do usuario.
   *
   * @param {CompItem} comp
   * @returns {Layer|null}
   */
  function findController(comp) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && camada.name === NOME_CONTROLLER) return camada;
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
    var selecionadas = comp.selectedLayers;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }

    if (args.targetMode === "reuseController" && !findController(comp)) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhum controller de orbita existe nesta composicao.", {
        field: "targetMode"
      });
    }

    if (args.bake === true) {
      var quadros = Math.round(comp.duration / comp.frameDuration);
      if (quadros > MAX_FRAMES_BAKE) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "A composicao tem quadros demais para assar.", {
          field: "bake",
          frames: quadros
        });
      }
    }

    var controller = findController(comp);
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var layer = /** @type {any} */ (selecionadas[i]);
      if (controller && layer === controller) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O controller nao pode orbitar a si mesmo.", {
          selectionIndex: i
        });
      }
      var posicao = transformProperty(layer, MN.position);
      if (!posicao || posicao.canSetExpression !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position scriptavel.", {
          selectionIndex: i
        });
      }
      if (posicao.expression !== "" && !MotionExpressions.isManagedOrbit(posicao.expression)) {
        return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Position contem expressao de usuario.", {
          selectionIndex: i
        });
      }
      if (args.faceTarget === true) {
        var orientacao = transformProperty(layer, MN.orientation);
        if (!orientacao || orientacao.canSetExpression !== true) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Orientation scriptavel.", {
            selectionIndex: i
          });
        }
        if (orientacao.expression !== "" && !MotionExpressions.isManagedOrbitFacing(orientacao.expression)) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Orientation contem expressao de usuario.", {
            selectionIndex: i
          });
        }
      }
    }
    return null;
  }

  /**
   * Troca a expressao por keyframes com os valores que ela produzia.
   *
   * @param {Property} property
   * @param {CompItem} comp
   * @returns {void}
   */
  function bakeProperty(property, comp) {
    var quadros = Math.round(comp.duration / comp.frameDuration);
    var tempos = [];
    var valores = [];
    var i;
    for (i = 0; i <= quadros; i += 1) {
      var t = i * comp.frameDuration;
      tempos.push(t);
      // `preExpression: false` e o ponto: le o valor **com** a expressao
      // aplicada, que e o que se quer assar.
      valores.push(property.valueAtTime(t, false));
    }

    property.expression = "";
    property.expressionEnabled = false;
    for (i = 0; i < tempos.length; i += 1) {
      property.setValueAtTime(/** @type {number} */ (tempos[i]), valores[i]);
    }
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    var faceTarget = args.faceTarget === true;
    var bake = args.bake === true;

    var controllerCriado = null;
    var tocadas = [];
    var parentesAnteriores = [];
    var orbitedLayers = 0;
    var i;

    var controller = findController(comp);

    try {
      if (!controller) {
        controller = comp.layers.addNull();
        controllerCriado = controller;
        controller.name = NOME_CONTROLLER;
        // Null 2D nao tem Z, e a orbita inteira acontece em tres eixos.
        controller.threeDLayer = true;
        var posicaoController = /** @type {Property} */ (transformProperty(controller, MN.position));
        posicaoController.setValue([comp.width / 2, comp.height / 2, 0]);
      }

      for (i = 0; i < selecionadas.length; i += 1) {
        var layer = /** @type {any} */ (selecionadas[i]);
        if (layer === controller) continue;

        // A orbita distribui a fase por indice de selecao: e o "opcional por
        // indice" da §, e sai de graca porque a fase ja e token da expressao.
        var expr = MotionExpressions.renderOrbit({
          radius: args.radius,
          speed: args.speed,
          inclination: args.inclination,
          phase: /** @type {number} */ (args.phase) * i
        });

        parentesAnteriores.push({ layer: layer, parent: layer.parent, threeD: layer.threeDLayer });
        layer.threeDLayer = true;
        layer.parent = controller;

        var posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
        tocadas.push({
          property: posicao,
          expression: posicao.expression,
          expressionEnabled: posicao.expressionEnabled
        });
        posicao.expression = expr;
        if (typeof posicao.expressionError === "string" && posicao.expressionError !== "") {
          throw new Error("After Effects recusou a expressao de orbita.");
        }
        posicao.expressionEnabled = true;

        if (faceTarget) {
          var orientacao = /** @type {Property} */ (transformProperty(layer, MN.orientation));
          tocadas.push({
            property: orientacao,
            expression: orientacao.expression,
            expressionEnabled: orientacao.expressionEnabled
          });
          orientacao.expression = MotionExpressions.renderOrbitFacing();
          if (typeof orientacao.expressionError === "string" && orientacao.expressionError !== "") {
            throw new Error("After Effects recusou a expressao de orientacao.");
          }
          orientacao.expressionEnabled = true;
        }

        if (bake) bakeProperty(posicao, comp);

        orbitedLayers += 1;
      }
    } catch (orbitError) {
      var rollbackFailed = false;
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
      for (i = parentesAnteriores.length - 1; i >= 0; i -= 1) {
        try {
          var vinculo = parentesAnteriores[i];
          if (!vinculo) continue;
          vinculo.layer.parent = vinculo.parent;
          vinculo.layer.threeDLayer = vinculo.threeD;
        } catch (parentError) {
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
          new Error("Orbit falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Orbit falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: orbitedLayers > 0,
      warnings: [],
      data: {
        orbitedLayers: orbitedLayers,
        controllerCreated: controllerCriado !== null,
        baked: bake
      }
    };
  }

  MotionRegistry.register("ae.3d.orbit", { preflight: preflight, run: run });
})();
