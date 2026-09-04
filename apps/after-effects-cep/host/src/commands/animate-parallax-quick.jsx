/**
 * Parallax — Quick Rig (`ae.animate.parallax.quick`, CHMS-022).
 *
 * ## Como o enquadramento e preservado
 *
 * Empurrar uma camada para `z` afastando-a de uma camera que esta a `D` do plano
 * zero a faz aparecer menor por um fator `D / (D + z)`. Multiplicar a escala por
 * `(D + z) / D` desfaz isso exatamente — nao por aproximacao — e e o que sustenta
 * o criterio de aceite de "o primeiro frame permanece visualmente equivalente"
 * com camadas de tamanhos diferentes.
 *
 * `D` sai do `zoom` da camera, que no After Effects e justamente a distancia da
 * camera ao plano `z = 0`.
 *
 * ## Identidade do rig
 *
 * A §11 proibe usar nome como identificador, e o After Effects nao tem uuid de
 * camada. Entao a **participacao** no rig nao e guardada em lugar nenhum: ela e
 * lida da estrutura, pelo vinculo de parentesco com o controller. Renomear,
 * reordenar e duplicar nao quebram isso.
 *
 * O bloco de metadata do CHMS-009 vai no comentario do controller entre os
 * marcadores do contrato, e serve para reconhecer que aquele null e um rig deste
 * plugin — e para o modo Adjust, que a §pede em vez de duplicar o rig.
 */
(function () {
  /* global Property CameraLayer */
  var ALLOWED = {
    depthStep: true,
    strength: true,
    orderMode: true,
    createCamera: true,
    preserveFraming: true,
    controllerName: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    scale: "ADBE Scale",
    zoom: "ADBE Camera Zoom"
  };

  var RIG_TYPE = "parallax.quick";

  /** Distancia padrao quando nao ha camera: o plano de projecao do After Effects. */
  var DISTANCIA_PADRAO = 1000;

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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Parallax desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Parallax ausente.", { field: key });
      }
    }
    if (!isInRange(args.depthStep, 1, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Passo de profundidade invalido.", { field: "depthStep" });
    }
    if (!isInRange(args.strength, 0, 10)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Intensidade invalida.", { field: "strength" });
    }
    if (args.orderMode !== "selection" && args.orderMode !== "timeline") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de ordem invalido.", { field: "orderMode" });
    }
    if (typeof args.createCamera !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "createCamera precisa ser booleano.", {
        field: "createCamera"
      });
    }
    if (typeof args.preserveFraming !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "preserveFraming precisa ser booleano.", {
        field: "preserveFraming"
      });
    }
    if (
      typeof args.controllerName !== "string" ||
      args.controllerName.length < 1 ||
      args.controllerName.length > 120
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do controller invalido.", {
        field: "controllerName"
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

  /**
   * Distancia da camera ao plano z = 0. Sem camera, o plano de projecao padrao.
   *
   * @param {CompItem} comp
   * @returns {number}
   */
  function cameraDistance(comp) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (typeof CameraLayer !== "undefined" && camada instanceof CameraLayer) {
        var zoom = transformProperty(camada, MN.zoom);
        if (zoom && isFiniteNumber(zoom.value) && /** @type {number} */ (zoom.value) > 0) {
          return /** @type {number} */ (zoom.value);
        }
      }
    }
    return DISTANCIA_PADRAO;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var selecionadas = comp.selectedLayers || [];

    // Modo Adjust: com o rig ja existente, a selecao pode estar vazia — o
    // comando reajusta os membros que o parentesco identifica.
    if (controller) {
      if (MotionRigMeta.findMembers(comp, controller).length === 0) {
        return failure(MotionContracts.ERROR.NO_SELECTION, "O rig de parallax nao tem camadas.", null);
      }
      return null;
    }

    // A §pede duas ou mais camadas: com uma so nao existe paralaxe.
    if (selecionadas.length < 2) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione duas ou mais camadas.", null);
    }
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var layer = /** @type {any} */ (selecionadas[i]);
      if (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem uma camera.", {
          selectionIndex: i
        });
      }
      var posicao = transformProperty(layer, MN.position);
      var escala = transformProperty(layer, MN.scale);
      if (!posicao || !escala) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position e Scale.", {
          selectionIndex: i
        });
      }
      if (posicao.numKeys > 0 || escala.numKeys > 0) {
        return failure(
          MotionContracts.ERROR.KEYFRAME_CONFLICT,
          "Position ou Scale ja tem keyframes; o rig sobrescreveria a animacao.",
          { selectionIndex: i }
        );
      }
    }
    return null;
  }

  /**
   * Coloca uma camada na profundidade pedida e compensa a escala.
   *
   * @param {unknown} layer
   * @param {number} z
   * @param {number} distancia
   * @param {boolean} preserveFraming
   * @returns {Record<string, unknown>} estado anterior, para rollback
   */
  function aplicarProfundidade(layer, z, distancia, preserveFraming) {
    var camada = /** @type {any} */ (layer);
    var posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    var escala = /** @type {Property} */ (transformProperty(layer, MN.scale));

    var anterior = {
      layer: camada,
      threeD: camada.threeDLayer,
      parent: camada.parent,
      position: posicao.value,
      scale: escala.value
    };

    camada.threeDLayer = true;

    var p = /** @type {number[]} */ (posicao.value);
    posicao.setValue([p[0], p[1], z]);

    if (preserveFraming) {
      // (D + z) / D desfaz exatamente o encolhimento da perspectiva.
      var fator = (distancia + z) / distancia;
      var s = /** @type {number[]} */ (escala.value);
      var novo = [/** @type {number} */ (s[0]) * fator, /** @type {number} */ (s[1]) * fator];
      novo.push(s.length > 2 ? /** @type {number} */ (s[2]) * fator : 100);
      escala.setValue(novo);
    }

    return anterior;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var depthStep = /** @type {number} */ (args.depthStep);
    var strength = /** @type {number} */ (args.strength);
    var preserveFraming = args.preserveFraming === true;
    var distancia = cameraDistance(comp);

    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var modoAjuste = controller !== null;

    var criadas = [];
    var anteriores = [];
    var comentarioAnterior = null;
    var i;

    try {
      /** @type {Layer[]} */
      var membros;
      if (modoAjuste) {
        membros = MotionRigMeta.findMembers(comp, /** @type {Layer} */ (controller));
      } else {
        controller = comp.layers.addNull();
        criadas.push(controller);
        controller.name = /** @type {string} */ (args.controllerName);
        controller.threeDLayer = true;
        var posController = /** @type {Property} */ (transformProperty(controller, MN.position));
        posController.setValue([comp.width / 2, comp.height / 2, 0]);

        if (args.createCamera === true) {
          var camera = comp.layers.addCamera(MotionContracts.RIG_PREFIX + "CAMERA", [
            comp.width / 2,
            comp.height / 2
          ]);
          criadas.push(camera);
          distancia = cameraDistance(comp);
        }

        membros = [];
        var selecionadas = comp.selectedLayers;
        for (i = 0; i < selecionadas.length; i += 1) {
          var candidata = selecionadas[i];
          if (candidata && candidata !== controller) membros.push(candidata);
        }
        // Ordem por timeline usa o indice, que e a profundidade visual que o
        // usuario ja enxerga; por selecao, a ordem em que ele clicou.
        if (args.orderMode === "timeline") {
          membros.sort(function (a, b) {
            return /** @type {any} */ (a).index - /** @type {any} */ (b).index;
          });
        }
      }

      for (i = 0; i < membros.length; i += 1) {
        var membro = membros[i];
        if (!membro) continue;
        var z = i * depthStep * strength;
        anteriores.push(aplicarProfundidade(membro, z, distancia, preserveFraming));
        /** @type {any} */ (membro).parent = controller;
      }

      if (!modoAjuste) {
        var alvo = /** @type {any} */ (controller);
        comentarioAnterior = { layer: alvo, comment: alvo.comment };
        alvo.comment = MotionRigMeta.write(
          alvo.comment,
          MotionJson.stringify({
            schemaVersion: 1,
            rigType: RIG_TYPE,
            pluginVersion: MotionContracts.PLUGIN_VERSION || "0.1.0",
            depthStep: depthStep,
            strength: strength
          })
        );
      }
    } catch (parallaxError) {
      var rollbackFailed = false;
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (!anterior) continue;
          var camada = /** @type {any} */ (anterior.layer);
          camada.parent = anterior.parent;
          /** @type {Property} */ (transformProperty(camada, MN.position)).setValue(anterior.position);
          /** @type {Property} */ (transformProperty(camada, MN.scale)).setValue(anterior.scale);
          camada.threeDLayer = anterior.threeD;
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
      for (i = criadas.length - 1; i >= 0; i -= 1) {
        try {
          var criada = criadas[i];
          if (criada) criada.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Parallax falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Parallax falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: anteriores.length > 0,
      warnings: [],
      data: {
        // O modo Adjust e o que a §pede no lugar de duplicar um rig existente.
        mode: modoAjuste ? "adjust" : "create",
        layerCount: anteriores.length,
        cameraDistance: distancia
      }
    };
  }

  MotionRegistry.register("ae.animate.parallax.quick", { preflight: preflight, run: run });
})();
