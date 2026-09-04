/**
 * Cubo 3D de seis faces (`ae.3d.cube`, CHMS-026).
 *
 * ## Por que as faces se encontram sem gaps
 *
 * Cada face fica a `size / 2` do centro, com a normal apontando para fora. Com
 * `faceFit` ligado, a escala de cada camada e ajustada para ela cobrir
 * exatamente `size x size`. Duas condicoes juntas: o centro a meia aresta e o
 * lado igual a aresta. E o criterio de aceite de "as faces se encontram sem gaps
 * em fixture quadrada".
 *
 * ## As orientacoes
 *
 * Uma camada tem a face visivel voltada para `-Z`. Girar em Y por `θ` leva `-Z`
 * para `[-sin θ, 0, -cos θ]`; girar em X por `φ` leva `-Z` para
 * `[0, sin φ, -cos φ]`. Resolver cada uma para a normal que a face precisa da a
 * tabela abaixo, e `three-d-cube.test.mjs` a verifica reconstruindo a normal por
 * `MotionTransform` em vez de confiar nos numeros.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    size: true,
    sourceMode: true,
    faceFit: true,
    createCamera: true,
    controllerOrientation: true,
    keepSources: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    orientation: "ADBE Orientation",
    scale: "ADBE Scale"
  };

  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "CUBE";
  var RIG_TYPE = "cube";

  /**
   * As seis faces, em ordem fixa: frente, tras, esquerda, direita, cima, baixo.
   *
   * `normal` acompanha a orientacao de proposito — e o que o teste usa para
   * conferir que a orientacao aponta mesmo para onde a face deveria olhar.
   */
  var FACES = [
    { nome: "front", eixo: [0, 0, -1], orientacao: [0, 0, 0] },
    { nome: "back", eixo: [0, 0, 1], orientacao: [0, 180, 0] },
    { nome: "left", eixo: [-1, 0, 0], orientacao: [0, 90, 0] },
    { nome: "right", eixo: [1, 0, 0], orientacao: [0, -90, 0] },
    { nome: "top", eixo: [0, -1, 0], orientacao: [-90, 0, 0] },
    { nome: "bottom", eixo: [0, 1, 0], orientacao: [90, 0, 0] }
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Cube desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Cube ausente.", { field: key });
      }
    }
    if (!isInRange(args.size, 1, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tamanho invalido.", { field: "size" });
    }
    if (args.sourceMode !== "sixLayers" && args.sourceMode !== "duplicateOne") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de origem invalido.", { field: "sourceMode" });
    }
    if (typeof args.faceFit !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "faceFit precisa ser booleano.", { field: "faceFit" });
    }
    if (typeof args.createCamera !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "createCamera precisa ser booleano.", {
        field: "createCamera"
      });
    }
    if (typeof args.keepSources !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "keepSources precisa ser booleano.", {
        field: "keepSources"
      });
    }
    var orientacao = /** @type {Array<unknown>} */ (args.controllerOrientation);
    if (!orientacao || typeof orientacao.length !== "number" || orientacao.length !== 3) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Orientacao do controller invalida.", {
        field: "controllerOrientation"
      });
    }
    var i;
    for (i = 0; i < 3; i += 1) {
      if (!isInRange(orientacao[i], -3600, 3600)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Orientacao do controller invalida.", {
          field: "controllerOrientation"
        });
      }
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
    if (controller) {
      if (MotionRigMeta.findMembers(comp, controller).length === 0) {
        return failure(MotionContracts.ERROR.NO_SELECTION, "O rig de cubo nao tem camadas.", null);
      }
      return null;
    }

    var selecionadas = comp.selectedLayers || [];
    if (args.sourceMode === "sixLayers") {
      if (selecionadas.length !== FACES.length) {
        return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione exatamente seis camadas.", {
          selected: selecionadas.length,
          required: FACES.length
        });
      }
    } else if (selecionadas.length !== 1) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione exatamente uma camada para duplicar.", {
        selected: selecionadas.length
      });
    }

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = /** @type {any} */ (selecionadas[i]);
      if (!transformProperty(camada, MN.position) || !transformProperty(camada, MN.orientation)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position e Orientation.", {
          selectionIndex: i
        });
      }
      if (args.sourceMode === "duplicateOne" && typeof camada.duplicate !== "function") {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao pode ser duplicada.", {
          selectionIndex: i
        });
      }
      if (args.faceFit === true) {
        var largura = camada.width;
        var alturaCamada = camada.height;
        if (!isFiniteNumber(largura) || !isFiniteNumber(alturaCamada) || largura <= 0 || alturaCamada <= 0) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao tem tamanho de origem para encaixar.", {
            selectionIndex: i
          });
        }
      }
    }
    return null;
  }

  /**
   * Monta uma face.
   *
   * @param {unknown} layer
   * @param {Record<string, unknown>} face
   * @param {number} tamanho
   * @param {boolean} faceFit
   * @returns {Record<string, unknown>} estado anterior, para rollback
   */
  function montarFace(layer, face, tamanho, faceFit) {
    var camada = /** @type {any} */ (layer);
    var posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    var orientacao = /** @type {Property} */ (transformProperty(layer, MN.orientation));
    var escala = transformProperty(layer, MN.scale);

    var anterior = {
      layer: camada,
      threeD: camada.threeDLayer,
      parent: camada.parent,
      position: posicao.value,
      orientation: orientacao.value,
      scale: escala ? escala.value : null
    };

    camada.threeDLayer = true;
    var eixo = /** @type {number[]} */ (face.eixo);
    var meia = tamanho / 2;
    posicao.setValue([
      /** @type {number} */ (eixo[0]) * meia,
      /** @type {number} */ (eixo[1]) * meia,
      /** @type {number} */ (eixo[2]) * meia
    ]);
    orientacao.setValue(face.orientacao);

    if (faceFit && escala) {
      // Encaixar e o que fecha as emendas: a face precisa ter exatamente a
      // aresta do cubo, senao sobra ou falta nas bordas.
      var fatorX = (tamanho / camada.width) * 100;
      var fatorY = (tamanho / camada.height) * 100;
      var atual = /** @type {number[]} */ (escala.value);
      var novo = [fatorX, fatorY];
      if (atual.length > 2) novo.push(/** @type {number} */ (atual[2]));
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
    var tamanho = /** @type {number} */ (args.size);
    var faceFit = args.faceFit === true;

    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var modoAjuste = controller !== null;

    var criadas = [];
    var anteriores = [];
    var comentarioAnterior = null;
    var i;

    try {
      /** @type {Layer[]} */
      var faces;
      if (modoAjuste) {
        faces = MotionRigMeta.findMembers(comp, /** @type {Layer} */ (controller));
      } else {
        controller = comp.layers.addNull();
        criadas.push(controller);
        controller.name = NOME_CONTROLLER;
        controller.threeDLayer = true;
        /** @type {Property} */ (transformProperty(controller, MN.position)).setValue([
          comp.width / 2,
          comp.height / 2,
          0
        ]);
        // O controller gira o conjunto como unidade porque todas as faces sao
        // filhas dele: girar o pai gira as seis juntas, mantendo o cubo.
        var orientacaoController = transformProperty(controller, MN.orientation);
        if (orientacaoController) orientacaoController.setValue(args.controllerOrientation);

        if (args.createCamera === true) {
          criadas.push(
            comp.layers.addCamera(MotionContracts.RIG_PREFIX + "CAMERA", [comp.width / 2, comp.height / 2])
          );
        }

        faces = [];
        var selecionadas = comp.selectedLayers;
        if (args.sourceMode === "sixLayers") {
          for (i = 0; i < selecionadas.length; i += 1) {
            var selecionada = selecionadas[i];
            if (selecionada) faces.push(selecionada);
          }
        } else {
          var origem = /** @type {any} */ (selecionadas[0]);
          if (!origem) throw new Error("A selecao ficou vazia depois do preflight.");
          faces.push(origem);
          while (faces.length < FACES.length) {
            var copia = origem.duplicate();
            criadas.push(copia);
            faces.push(copia);
          }
        }
      }

      for (i = 0; i < faces.length && i < FACES.length; i += 1) {
        var face = faces[i];
        if (!face) continue;
        anteriores.push(montarFace(face, /** @type {Record<string, unknown>} */ (FACES[i]), tamanho, faceFit));
        /** @type {any} */ (face).parent = controller;
        /** @type {any} */ (face).name = NOME_CONTROLLER + " " + /** @type {any} */ (FACES[i]).nome;
      }

      if (!modoAjuste) {
        var alvo = /** @type {any} */ (controller);
        comentarioAnterior = { layer: alvo, comment: alvo.comment };
        alvo.comment = MotionRigMeta.write(
          alvo.comment,
          MotionJson.stringify({ schemaVersion: 1, rigType: RIG_TYPE, size: tamanho })
        );
      }
    } catch (cubeError) {
      var rollbackFailed = false;
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (!anterior) continue;
          var camada = /** @type {any} */ (anterior.layer);
          camada.parent = anterior.parent;
          /** @type {Property} */ (transformProperty(camada, MN.position)).setValue(anterior.position);
          /** @type {Property} */ (transformProperty(camada, MN.orientation)).setValue(anterior.orientation);
          if (anterior.scale !== null) {
            var escala = transformProperty(camada, MN.scale);
            if (escala) escala.setValue(anterior.scale);
          }
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
          new Error("Cube falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Cube falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: anteriores.length > 0,
      warnings: [],
      data: { mode: modoAjuste ? "adjust" : "create", faceCount: anteriores.length }
    };
  }

  MotionRegistry.register("ae.3d.cube", { preflight: preflight, run: run });
})();
