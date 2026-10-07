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

  /** @param {Property|null} property @returns {string|null} */
  function propertyConflict(property) {
    if (!property) return null;
    if (property.expression) return MotionContracts.ERROR.EXPRESSION_CONFLICT;
    if (property.numKeys > 0) return MotionContracts.ERROR.KEYFRAME_CONFLICT;
    if (/** @type {any} */ (property).dimensionsSeparated === true) return MotionContracts.ERROR.INVALID_SELECTION_TYPE;
    return null;
  }

  /**
   * Shape/text layers report the composition dimensions in `width`/`height`,
   * while their visible content may occupy only a small rectangle. Use the
   * content bounds for both the anchor check and face-fit scale.
   *
   * @param {any} layer
   * @returns {{left: number, top: number, width: number, height: number}|null}
   */
  function faceBounds(layer) {
    var rect;
    if (typeof layer.sourceRectAtTime === "function") {
      try { rect = layer.sourceRectAtTime(/** @type {CompItem} */ (app.project.activeItem).time, false); }
      catch (error) { return null; }
    } else {
      rect = { left: 0, top: 0, width: layer.width, height: layer.height };
    }
    if (!rect || !isFiniteNumber(rect.left) || !isFiniteNumber(rect.top) ||
        !isFiniteNumber(rect.width) || !isFiniteNumber(rect.height) ||
        rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  /** @param {unknown} layer @returns {number} */
  function faceRole(layer) {
    var texto = /** @type {any} */ (layer).comment;
    if (typeof texto !== "string") return -1;
    var inicio = texto.indexOf(MotionContracts.META_OPEN);
    var fim = texto.indexOf(MotionContracts.META_CLOSE);
    if (inicio < 0 || fim <= inicio) return -1;
    try {
      var meta = /** @type {any} */ (MotionJson.parse(texto.substring(inicio + MotionContracts.META_OPEN.length, fim)));
      return meta && meta.rigType === "cubeFace" && meta.faceIndex >= 0 && meta.faceIndex < FACES.length && Math.floor(meta.faceIndex) === meta.faceIndex ? meta.faceIndex : -1;
    } catch (error) { return -1; }
  }

  /** @param {unknown} layer @param {number} index @param {boolean} adjusting @param {boolean} faceFit @returns {MotionCommandFailure|null} */
  function validateMember(layer, index, adjusting, faceFit) {
    var camada = /** @type {any} */ (layer);
    if (camada.locked || typeof camada.setParentWithJump !== "function") {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A face esta bloqueada ou nao permite parentesco 3D sem compensacao.", { selectionIndex: index });
    }
    if (!adjusting && camada.parent) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desparente a fonte antes de montar o cubo.", { selectionIndex: index });
    }
    var pos = transformProperty(camada, MN.position);
    var ori = transformProperty(camada, MN.orientation);
    var scale = transformProperty(camada, MN.scale);
    if (!pos || (camada.threeDLayer && !ori) || (faceFit && !scale)) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A face nao expoe os transforms necessarios.", { selectionIndex: index });
    }
    var props = [pos, ori, faceFit ? scale : null];
    var i;
    for (i = 0; i < props.length; i += 1) {
      var code = propertyConflict(props[i] || null);
      if (code) return failure(code, "A face tem animacao, expressao ou dimensoes separadas; o rig preservou a camada.", { selectionIndex: index });
    }
    if (typeof AutoOrientType !== "undefined" && camada.autoOrient !== undefined && camada.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Orientacao automatica nao e suportada neste rig.", { selectionIndex: index });
    }
    var rotationNames = ["ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z", "ADBE Rotation"];
    for (i = 0; i < rotationNames.length; i += 1) {
      var rotation = transformProperty(camada, rotationNames[i] || "");
      if (rotation && (propertyConflict(rotation) || rotation.value !== 0)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Zere ou remova a rotacao existente antes de montar o cubo.", { selectionIndex: index });
      }
    }
    var anchor = transformProperty(camada, "ADBE Anchor Point");
    if (anchor && faceFit) {
      var bounds = faceBounds(camada);
      var a = /** @type {number[]} */ (anchor.value);
      if (!bounds || propertyConflict(anchor) ||
          Math.abs(/** @type {number} */ (a[0]) - (bounds.left + bounds.width / 2)) > 0.001 ||
          Math.abs(/** @type {number} */ (a[1]) - (bounds.top + bounds.height / 2)) > 0.001) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Centralize o Anchor Point da fonte para que as faces se encontrem sem gaps.", { selectionIndex: index });
      }
    }
    return null;
  }

  /** @param {CompItem} comp @param {Layer[]} saved @returns {void} */
  function restoreSelection(comp, saved) {
    var current = comp.selectedLayers.slice(0);
    var i;
    for (i = 0; i < current.length; i += 1) /** @type {any} */ (current[i]).selected = false;
    for (i = 0; i < saved.length; i += 1) /** @type {any} */ (saved[i]).selected = true;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    if (controller) {
      var existing = MotionRigMeta.findMembers(comp, controller);
      if (existing.length !== FACES.length || /** @type {any} */ (controller).locked || !/** @type {any} */ (controller).threeDLayer) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O rig de cubo esta incompleto ou bloqueado.", null);
      }
      var controllerOri = transformProperty(controller, MN.orientation);
      if (!controllerOri) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O controller nao expoe Orientation.", null);
      var orientationError = propertyConflict(controllerOri);
      if (orientationError) return failure(orientationError, "A orientacao do controller tem animacao ou expressao.", null);
      var seen = [];
      var j;
      for (j = 0; j < existing.length; j += 1) {
        var role = faceRole(existing[j]);
        if (role < 0 || seen[role]) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O rig antigo nao tem identidade confiavel das faces. Recrie-o para ajustar com seguranca.", null);
        seen[role] = true;
        var existingError = validateMember(existing[j], j, true, args.faceFit === true);
        if (existingError) return existingError;
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
      var memberError = validateMember(camada, i, false, args.faceFit === true);
      if (memberError) return memberError;
      if (args.sourceMode === "duplicateOne" && typeof camada.duplicate !== "function") {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao pode ser duplicada.", {
          selectionIndex: i
        });
      }
      if (args.faceFit === true) {
        if (!faceBounds(camada)) {
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
   * @param {unknown} controller
   * @param {Record<string, unknown>} face
   * @param {number} tamanho
   * @param {boolean} faceFit
   * @param {Array<Record<string, any>>} anteriores
   * @returns {void}
   */
  function montarFace(layer, controller, face, tamanho, faceFit, anteriores) {
    var camada = /** @type {any} */ (layer);
    var posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    var orientacao = transformProperty(layer, MN.orientation);
    var escala = transformProperty(layer, MN.scale);

    var anterior = {
      layer: camada,
      threeD: camada.threeDLayer,
      parent: camada.parent,
      name: camada.name,
      comment: camada.comment,
      position: posicao.value,
      orientation: orientacao ? orientacao.value : null,
      scale: escala ? escala.value : null
    };

    anteriores.push(anterior);
    camada.threeDLayer = true;
    // parent = preserva mundo e compensa Position/Orientation/Scale. Geometria
    // do cubo exige espaco LOCAL do controller, sem essa compensacao.
    camada.setParentWithJump(controller);
    posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    orientacao = transformProperty(layer, MN.orientation);
    escala = transformProperty(layer, MN.scale);
    if (!posicao || !orientacao || (faceFit && !escala)) throw new Error("Transform 3D indisponivel.");
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
      var bounds = faceBounds(camada);
      if (!bounds) throw new Error("A face perdeu os limites visiveis antes de encaixar.");
      var fatorX = (tamanho / bounds.width) * 100;
      var fatorY = (tamanho / bounds.height) * 100;
      var atual = /** @type {number[]} */ (escala.value);
      var novo = [fatorX, fatorY];
      if (atual.length > 2) novo.push(/** @type {number} */ (atual[2]));
      escala.setValue(novo);
    }

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
    /** @type {Array<Record<string, any>>} */
    var anteriores = [];
    var comentarioAnterior = null;
    /** @type {{property: Property, value: any}|null} */
    var controllerAnterior = null;
    var selecionadasOriginais = comp.selectedLayers.slice(0);
    var i;

    try {
      /** @type {Layer[]} */
      var faces;
      if (modoAjuste) {
        var membros = MotionRigMeta.findMembers(comp, /** @type {Layer} */ (controller));
        faces = [];
        for (i = 0; i < membros.length; i += 1) faces[faceRole(membros[i])] = /** @type {Layer} */ (membros[i]);
        var oriExistente = /** @type {Property} */ (transformProperty(controller, MN.orientation));
        controllerAnterior = { property: oriExistente, value: oriExistente.value };
        oriExistente.setValue(args.controllerOrientation);
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
        var selecionadas = selecionadasOriginais;
        if (args.sourceMode === "sixLayers") {
          for (i = 0; i < selecionadas.length; i += 1) {
            var selecionada = selecionadas[i];
            if (selecionada) {
              if (args.keepSources === true) {
                var copiaSelecionada = selecionada.duplicate();
                criadas.push(copiaSelecionada);
                faces.push(copiaSelecionada);
              } else faces.push(selecionada);
            }
          }
        } else {
          var origem = /** @type {any} */ (selecionadas[0]);
          if (!origem) throw new Error("A selecao ficou vazia depois do preflight.");
          if (args.keepSources === true) {
            var primeiraCopia = origem.duplicate();
            criadas.push(primeiraCopia);
            faces.push(primeiraCopia);
          } else faces.push(origem);
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
        montarFace(face, controller, /** @type {Record<string, unknown>} */ (FACES[i]), tamanho, faceFit, anteriores);
        /** @type {any} */ (face).name = NOME_CONTROLLER + " " + /** @type {any} */ (FACES[i]).nome;
        /** @type {any} */ (face).comment = MotionRigMeta.write(
          /** @type {any} */ (face).comment,
          MotionJson.stringify({ schemaVersion: 1, rigType: "cubeFace", faceIndex: i })
        );
      }

      if (!modoAjuste) {
        var alvo = /** @type {any} */ (controller);
        comentarioAnterior = { layer: alvo, comment: alvo.comment };
        alvo.comment = MotionRigMeta.write(
          alvo.comment,
          MotionJson.stringify({ schemaVersion: 1, rigType: RIG_TYPE, size: tamanho })
        );
      }
      restoreSelection(comp, selecionadasOriginais);
    } catch (cubeError) {
      var rollbackFailed = false;
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (!anterior) continue;
          var camada = /** @type {any} */ (anterior.layer);
          camada.setParentWithJump(anterior.parent);
          camada.threeDLayer = anterior.threeD;
          /** @type {Property} */ (transformProperty(camada, MN.position)).setValue(anterior.position);
          if (anterior.orientation !== null) {
            var orientacaoAnterior = transformProperty(camada, MN.orientation);
            if (orientacaoAnterior) orientacaoAnterior.setValue(anterior.orientation);
          }
          if (anterior.scale !== null) {
            var escala = transformProperty(camada, MN.scale);
            if (escala) escala.setValue(anterior.scale);
          }
          camada.name = anterior.name;
          camada.comment = anterior.comment;
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (controllerAnterior) {
        try { controllerAnterior.property.setValue(controllerAnterior.value); }
        catch (controllerRestoreError) { rollbackFailed = true; }
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
      try { restoreSelection(comp, selecionadasOriginais); }
      catch (selectionError) { rollbackFailed = true; }
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
