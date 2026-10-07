/**
 * Distribuicao em superficie cilindrica (`ae.3d.cylinder`, CHMS-026).
 *
 * ## Como o arco e dividido
 *
 * Um arco fechado (360° ou mais) tem `count` divisoes: o passo e `arco / count`,
 * porque a posicao 0° e a 360° sao a mesma e colocar camada nas duas empilharia
 * duas no mesmo lugar.
 *
 * Um arco aberto tem `count - 1` divisoes: o passo e `arco / (count - 1)`, para
 * a primeira e a ultima camada caírem nas **pontas** do arco. Dividir por
 * `count` num arco de 90° com tres camadas daria 0°, 30° e 60° — o arco pedido
 * nao seria preenchido.
 *
 * Nos dois casos a distribuicao e uniforme, que e o criterio de aceite.
 *
 * ## Orientacao
 *
 * Uma camada tem a face visivel voltada para `-Z`. Girar em Y por `θ` leva `-Z`
 * para `[-sin θ, 0, -cos θ]`. Para a camada em `α` encarar para **fora** do eixo,
 * a normal precisa ser o radial `[cos α, 0, sin α]`, o que da `θ = -(90 + α)`;
 * encarar para **dentro** e a mesma coisa mais meia volta.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    radius: true,
    height: true,
    count: true,
    faceMode: true,
    startAngle: true,
    arcDegrees: true,
    createCamera: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    orientation: "ADBE Orientation"
  };

  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "CYLINDER";
  var RIG_TYPE = "cylinder";

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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Cylinder desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Cylinder ausente.", { field: key });
      }
    }
    if (!isInRange(args.radius, 1, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Raio invalido.", { field: "radius" });
    }
    if (!isInRange(args.height, 0, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Altura invalida.", { field: "height" });
    }
    if (
      !isFiniteNumber(args.count) ||
      Math.floor(/** @type {number} */ (args.count)) !== args.count ||
      !isInRange(args.count, 1, 500)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Contagem invalida.", { field: "count" });
    }
    if (args.faceMode !== "inward" && args.faceMode !== "outward" && args.faceMode !== "none") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de orientacao invalido.", { field: "faceMode" });
    }
    if (!isInRange(args.startAngle, -3600, 3600)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Angulo inicial invalido.", { field: "startAngle" });
    }
    if (!isInRange(args.arcDegrees, 1, 3600)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Arco invalido.", { field: "arcDegrees" });
    }
    if (typeof args.createCamera !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "createCamera precisa ser booleano.", {
        field: "createCamera"
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

  /** Nao substituir animacao do usuario por um valor estatico. */
  /** @param {Property|null} property @returns {string|null} */
  function propertyConflict(property) {
    if (!property) return null;
    if (property.expression) return MotionContracts.ERROR.EXPRESSION_CONFLICT;
    if (property.numKeys > 0) return MotionContracts.ERROR.KEYFRAME_CONFLICT;
    if (/** @type {any} */ (property).dimensionsSeparated === true) return MotionContracts.ERROR.INVALID_SELECTION_TYPE;
    return null;
  }

  /** @param {unknown} layer @param {number} index @param {boolean} adjusting @returns {MotionCommandFailure|null} */
  function validateMember(layer, index, adjusting) {
    var camada = /** @type {any} */ (layer);
    if (camada.locked || typeof camada.setParentWithJump !== "function") {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada esta bloqueada ou nao permite parentesco 3D sem compensacao.", { selectionIndex: index });
    }
    if (!adjusting && camada.parent) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desparente a camada de origem antes de montar o cilindro.", { selectionIndex: index });
    }
    var pos = transformProperty(camada, MN.position);
    if (!pos) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position.", { selectionIndex: index });
    var properties = [pos, transformProperty(camada, MN.orientation)];
    var i;
    for (i = 0; i < properties.length; i += 1) {
      var code = propertyConflict(properties[i] || null);
      if (code) return failure(code, "Position ou Orientation tem animacao, expressao ou dimensoes separadas; o rig preservou a camada.", { selectionIndex: index });
    }
    if (typeof AutoOrientType !== "undefined" && camada.autoOrient !== undefined && camada.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Orientacao automatica nao e suportada neste rig.", { selectionIndex: index });
    }
    var rotationNames = ["ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z", "ADBE Rotation"];
    for (i = 0; i < rotationNames.length; i += 1) {
      var rotation = transformProperty(camada, rotationNames[i] || "");
      if (rotation && (propertyConflict(rotation) || rotation.value !== 0)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Zere ou remova a rotacao existente antes de montar o cilindro.", { selectionIndex: index });
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

  /**
   * Passo angular entre camadas.
   *
   * @param {number} arco
   * @param {number} quantidade
   * @returns {number}
   */
  function passoAngular(arco, quantidade) {
    if (quantidade <= 1) return 0;
    // Arco fechado: 0° e 360° sao o mesmo ponto, entao sao `count` divisoes.
    if (arco >= 360) return arco / quantidade;
    // Arco aberto: as pontas recebem camada, entao sao `count - 1` divisoes.
    return arco / (quantidade - 1);
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    if (controller) {
      var existing = MotionRigMeta.findMembers(comp, controller);
      if (existing.length === 0) {
        return failure(MotionContracts.ERROR.NO_SELECTION, "O rig de cilindro nao tem camadas.", null);
      }
      if (existing.length !== args.count) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Alterar count de um rig existente exigiria criar ou remover fontes. Crie outro rig para essa contagem.", { field: "count", existing: existing.length });
      }
      if (/** @type {any} */ (controller).locked || !/** @type {any} */ (controller).threeDLayer) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O controller do cilindro esta bloqueado ou deixou de ser 3D.", null);
      }
      var j;
      for (j = 0; j < existing.length; j += 1) {
        var existingError = validateMember(existing[j], j, true);
        if (existingError) return existingError;
      }
      return null;
    }

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null);
    }
    if (selecionadas.length > /** @type {number} */ (args.count)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "count nao pode ser menor que a selecao; nenhuma fonte sera ignorada.", { field: "count", selected: selecionadas.length });
    }
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = /** @type {any} */ (selecionadas[i]);
      var memberError = validateMember(camada, i, false);
      if (memberError) return memberError;
      if (/** @type {number} */ (args.count) > selecionadas.length && typeof camada.duplicate !== "function") {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao pode ser duplicada.", {
          selectionIndex: i
        });
      }
    }
    return null;
  }

  /**
   * Coloca uma camada no angulo pedido.
   *
   * @param {unknown} layer
   * @param {unknown} controller
   * @param {number} anguloGraus
   * @param {number} y
   * @param {number} raio
   * @param {string} faceMode
   * @param {Array<Record<string, any>>} anteriores
   * @returns {void}
   */
  function posicionar(layer, controller, anguloGraus, y, raio, faceMode, anteriores) {
    var camada = /** @type {any} */ (layer);
    var posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    var orientacao = transformProperty(layer, MN.orientation);

    var anterior = {
      layer: camada,
      threeD: camada.threeDLayer,
      parent: camada.parent,
      position: posicao.value,
      orientation: orientacao ? orientacao.value : null
    };

    // Registrar ANTES do primeiro write: um erro na conversao, no parent ou
    // no setValue ainda precisa restaurar a camada original.
    anteriores.push(anterior);
    camada.threeDLayer = true;
    // parent = preserva mundo e reescreve Position/Orientation. O rig precisa
    // dos valores LOCAIS; setParentWithJump mantem os transforms crus.
    camada.setParentWithJump(controller);
    posicao = /** @type {Property} */ (transformProperty(layer, MN.position));
    orientacao = transformProperty(layer, MN.orientation);
    if (!posicao || (faceMode !== "none" && !orientacao)) throw new Error("Transform 3D indisponivel.");
    var radianos = anguloGraus * Math.PI / 180;
    posicao.setValue([raio * Math.cos(radianos), y, raio * Math.sin(radianos)]);

    if (orientacao && faceMode !== "none") {
      var giroY = -(90 + anguloGraus);
      if (faceMode === "inward") giroY += 180;
      orientacao.setValue([0, giroY, 0]);
    }

  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var raio = /** @type {number} */ (args.radius);
    var altura = /** @type {number} */ (args.height);
    var quantidade = /** @type {number} */ (args.count);
    var faceMode = /** @type {string} */ (args.faceMode);
    var inicio = /** @type {number} */ (args.startAngle);
    var arco = /** @type {number} */ (args.arcDegrees);

    var controller = MotionRigMeta.findController(comp, RIG_TYPE);
    var modoAjuste = controller !== null;

    var criadas = [];
    /** @type {Array<Record<string, any>>} */
    var anteriores = [];
    var comentarioAnterior = null;
    var selecionadasOriginais = comp.selectedLayers.slice(0);
    var i;

    try {
      /** @type {Layer[]} */
      var membros;
      if (modoAjuste) {
        membros = MotionRigMeta.findMembers(comp, /** @type {Layer} */ (controller));
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

        if (args.createCamera === true) {
          criadas.push(
            comp.layers.addCamera(MotionContracts.RIG_PREFIX + "CAMERA", [comp.width / 2, comp.height / 2])
          );
        }

        membros = [];
        var selecionadas = selecionadasOriginais;
        for (i = 0; i < selecionadas.length && membros.length < quantidade; i += 1) {
          var candidata = selecionadas[i];
          if (candidata && candidata !== controller) membros.push(candidata);
        }
        // Uma camada pode virar N: a §permite duplicar para preencher o arco.
        var origem = membros.length > 0 ? /** @type {any} */ (membros[0]) : null;
        while (membros.length < quantidade && origem) {
          var copia = origem.duplicate();
          criadas.push(copia);
          membros.push(copia);
        }
      }

      var passo = passoAngular(arco, membros.length);
      for (i = 0; i < membros.length; i += 1) {
        var membro = membros[i];
        if (!membro) continue;
        // Com uma camada so nao ha o que distribuir na altura; a divisao por
        // zero viraria NaN e a camada sumiria.
        var y = membros.length > 1 ? -altura / 2 + (altura * i) / (membros.length - 1) : 0;
        posicionar(membro, controller, inicio + passo * i, y, raio, faceMode, anteriores);
      }

      if (!modoAjuste) {
        var alvo = /** @type {any} */ (controller);
        comentarioAnterior = { layer: alvo, comment: alvo.comment };
        alvo.comment = MotionRigMeta.write(
          alvo.comment,
          MotionJson.stringify({
            schemaVersion: 1,
            rigType: RIG_TYPE,
            radius: raio,
            count: membros.length,
            arcDegrees: arco
          })
        );
      }
      restoreSelection(comp, selecionadasOriginais);
    } catch (cylinderError) {
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
            var orientacao = transformProperty(camada, MN.orientation);
            if (orientacao) orientacao.setValue(anterior.orientation);
          }
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
      try { restoreSelection(comp, selecionadasOriginais); }
      catch (selectionError) { rollbackFailed = true; }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Cylinder falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Cylinder falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: anteriores.length > 0,
      warnings: [],
      data: {
        mode: modoAjuste ? "adjust" : "create",
        layerCount: anteriores.length,
        stepDegrees: passoAngular(arco, anteriores.length)
      }
    };
  }

  MotionRegistry.register("ae.3d.cylinder", { preflight: preflight, run: run });
})();
