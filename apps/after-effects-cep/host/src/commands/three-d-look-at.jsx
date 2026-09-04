/**
 * Orientar camada ou camera para um alvo (`ae.3d.look-at`, CHMS-026).
 *
 * ## Eixos suportados
 *
 * Os seis eixos. Os quatro do plano XZ saem de somar na componente Y da
 * orientacao que `lookAt` devolve, porque ali a correcao e um giro em Y e a
 * composicao se reduz a uma soma. Os dois verticais precisam de um giro em X, e
 * ai nao ha atalho: a expressao compoe `R_lookAt . Rx(±90)` e decompoe o
 * resultado de volta em angulos.
 *
 * Os verticais eram recusados enquanto `MotionTransform` nao sabia decompor uma
 * matriz em Euler. Sabe agora, e `euler-decomposition.test.mjs` mede o
 * round-trip; `euler-paridade.test.mjs` garante que a versao em linguagem de
 * expressao nao divirja da versao do host.
 */
(function () {
  /* global Property CameraLayer */
  var ALLOWED = {
    targetLayerName: true,
    forwardAxis: true,
    upAxis: true,
    offsetOrientation: true,
    constrainAxes: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    orientation: "ADBE Orientation"
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
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Look At desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Look At ausente.", { field: key });
      }
    }
    if (typeof args.targetLayerName !== "string" || args.targetLayerName.length < 1 || args.targetLayerName.length > 200) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do alvo invalido.", { field: "targetLayerName" });
    }

    var suportados = MotionExpressions.lookAtSupportedAxes();
    var encontrado = false;
    var i;
    for (i = 0; i < suportados.length; i += 1) {
      if (suportados[i] === args.forwardAxis) encontrado = true;
    }
    if (!encontrado) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Eixo frontal fora dos suportados.", {
        field: "forwardAxis",
        supported: suportados
      });
    }
    // `lookAt` do After Effects nao aplica roll, entao a vertical do resultado e
    // sempre o +Y do mundo. Aceitar outro valor aqui prometeria uma correcao que
    // este comando nao faz.
    if (args.upAxis !== "+y") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Somente +y e suportado como eixo vertical.", {
        field: "upAxis"
      });
    }

    var offset = /** @type {Array<unknown>} */ (args.offsetOrientation);
    if (!offset || typeof offset.length !== "number" || offset.length !== 3) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de orientacao invalido.", {
        field: "offsetOrientation"
      });
    }
    for (i = 0; i < 3; i += 1) {
      if (!isFiniteNumber(offset[i]) || /** @type {number} */ (offset[i]) < -3600 || /** @type {number} */ (offset[i]) > 3600) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de orientacao invalido.", {
          field: "offsetOrientation"
        });
      }
    }

    var travas = /** @type {Record<string, unknown>} */ (args.constrainAxes);
    if (!travas || typeof travas.x !== "boolean" || typeof travas.y !== "boolean" || typeof travas.z !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Travas de eixo invalidas.", { field: "constrainAxes" });
    }
    if (travas.x === true && travas.y === true && travas.z === true) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Travar os tres eixos deixaria o comando sem efeito.", {
        field: "constrainAxes"
      });
    }
    return null;
  }

  /**
   * O alvo e resolvido por nome no preflight so para provar que ele existe agora;
   * a expressao guarda o nome porque o After Effects reescreve
   * `thisComp.layer("...")` sozinho quando a camada e renomeada. Guardar indice
   * seria pior: reordenar a timeline apontaria para outra camada em silencio.
   *
   * @param {CompItem} comp
   * @param {string} nome
   * @returns {Layer|null}
   */
  function findLayerByName(comp, nome) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && camada.name === nome) return camada;
    }
    return null;
  }

  /** @param {unknown} layer @returns {Property|null} */
  function orientationOf(layer) {
    var grupo = /** @type {any} */ (layer).property(MN.transform);
    if (!grupo) return null;
    var property = grupo.property(MN.orientation);
    return property instanceof Property ? property : null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var alvo = findLayerByName(comp, /** @type {string} */ (args.targetLayerName));
    if (!alvo) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "A camada alvo nao existe nesta composicao.", {
        field: "targetLayerName"
      });
    }

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var layer = /** @type {any} */ (selecionadas[i]);
      if (layer === alvo) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Uma camada nao pode encarar a si mesma.", {
          selectionIndex: i
        });
      }
      // Camera ja e 3D por natureza; qualquer outra precisa estar em 3D para ter
      // orientacao com significado.
      var ehCamera = typeof CameraLayer !== "undefined" && layer instanceof CameraLayer;
      if (!ehCamera && layer.threeDLayer !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada 2D.", {
          selectionIndex: i
        });
      }
      var orientacao = orientationOf(layer);
      if (!orientacao || orientacao.canSetExpression !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Orientation scriptavel.", {
          selectionIndex: i
        });
      }
      if (orientacao.expression !== "" && !MotionExpressions.isManagedLookAt(orientacao.expression)) {
        return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Orientation contem expressao de usuario.", {
          selectionIndex: i
        });
      }
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    var expr = MotionExpressions.renderLookAt({
      targetLayerName: args.targetLayerName,
      forwardAxis: args.forwardAxis,
      offsetOrientation: args.offsetOrientation,
      constrainAxes: args.constrainAxes
    });

    var tocadas = [];
    var appliedCount = 0;
    var unchangedCount = 0;
    var i;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var orientacao = /** @type {Property} */ (orientationOf(selecionadas[i]));
        if (orientacao.expression === expr && orientacao.expressionEnabled === true) {
          unchangedCount += 1;
          continue;
        }
        tocadas.push({
          property: orientacao,
          expression: orientacao.expression,
          expressionEnabled: orientacao.expressionEnabled
        });
        orientacao.expression = expr;
        // O After Effects nao lanca ao recusar uma expressao: reporta em
        // expressionError e deixa a propriedade acesa e quebrada.
        if (typeof orientacao.expressionError === "string" && orientacao.expressionError !== "") {
          throw new Error("After Effects recusou a expressao gerenciada.");
        }
        orientacao.expressionEnabled = true;
        appliedCount += 1;
      }
    } catch (lookError) {
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
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Look At falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Look At falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: appliedCount > 0,
      warnings: [],
      data: { appliedCount: appliedCount, unchangedCount: unchangedCount }
    };
  }

  MotionRegistry.register("ae.3d.look-at", { preflight: preflight, run: run });
})();
