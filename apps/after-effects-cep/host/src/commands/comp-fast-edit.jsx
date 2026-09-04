/**
 * Operacoes rapidas de composicao (`ae.comp.fast-edit`, P2).
 *
 * ## Prévia e aplicação
 *
 * A §pede "cada operacao e um subcomando com dry-run" e "nao combinar mudancas
 * sem resumo". Aqui isso e o par `ae.comp.fast-edit.preview` / `ae.comp.fast-edit`,
 * e nao a opcao `dryRun` do envelope: o dispatcher **recusa** `dryRun` em comando
 * que muta, justamente para nao existirem dois caminhos de escrita. E o mesmo
 * arranjo de `ae.keys.cut` e `ae.keys.cut.preview`.
 *
 * As duas metades chamam `planejar()`, entao o resumo que a previa mostra e o
 * mesmo plano que a aplicacao executa — nao uma segunda conta que pode divergir.
 *
 * ## `cropToSelectedBounds`
 *
 * Recortar preserva a aparencia porque a composicao encolhe **e** as camadas
 * andam junto pelo mesmo deslocamento: o canto superior esquerdo do novo
 * enquadramento vira a origem, entao tudo que estava visivel continua na mesma
 * posicao relativa. E o criterio de aceite de "crop e shift preservam a
 * aparencia no frame inicial".
 */
(function () {
  /* global Property */
  var ALLOWED = {
    operation: true,
    duration: true,
    frameRate: true,
    width: true,
    height: true,
    precomposeName: true,
    moveAllAttributes: true
  };

  var OPERACOES = {
    trimToWorkArea: true,
    setDuration: true,
    setFrameRate: true,
    setResolution: true,
    fitLayers: true,
    shiftLayersToZero: true,
    precompose: true,
    cropToSelectedBounds: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    scale: "ADBE Scale",
    position: "ADBE Position"
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

  /** @param {unknown} value @param {number} minimo @param {number} maximo @returns {boolean} */
  function isInRange(value, minimo, maximo) {
    return (
      isFiniteNumber(value) && /** @type {number} */ (value) >= minimo && /** @type {number} */ (value) <= maximo
    );
  }

  /** @param {unknown} value @param {number} minimo @param {number} maximo @returns {boolean} */
  function isIntegerInRange(value, minimo, maximo) {
    return isInRange(value, minimo, maximo) && Math.floor(/** @type {number} */ (value)) === value;
  }

  /**
   * Valida so o que a operacao pedida usa.
   *
   * Exigir `width` para um `setFrameRate` obrigaria o painel a inventar um valor
   * para um campo que aquela tela nem mostra, e um valor inventado que chega ao
   * host e um valor que pode ser aplicado por engano.
   *
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandFailure|null}
   */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Fast Edit desconhecido.", { field: key });
      }
    }
    if (typeof args.operation !== "string" || !Object.prototype.hasOwnProperty.call(OPERACOES, args.operation)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Operacao Fast Edit invalida.", { field: "operation" });
    }
    if (args.operation === "setDuration" && !isInRange(args.duration, 0.001, 10800)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao invalida.", { field: "duration" });
    }
    if (args.operation === "setFrameRate" && !isInRange(args.frameRate, 1, 999)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frame rate invalido.", { field: "frameRate" });
    }
    if (args.operation === "setResolution") {
      if (!isIntegerInRange(args.width, 4, 30000)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Largura invalida.", { field: "width" });
      }
      if (!isIntegerInRange(args.height, 4, 30000)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Altura invalida.", { field: "height" });
      }
    }
    if (args.operation === "precompose") {
      if (
        typeof args.precomposeName !== "string" ||
        args.precomposeName.length < 1 ||
        args.precomposeName.length > 200
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome da precomposicao invalido.", {
          field: "precomposeName"
        });
      }
      if (typeof args.moveAllAttributes !== "boolean") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "moveAllAttributes precisa ser booleano.", {
          field: "moveAllAttributes"
        });
      }
    }
    return null;
  }

  /**
   * Uniao dos limites de todas as camadas, no espaco da composicao.
   *
   * Cada canto do retangulo da camada passa pela matriz linear dela e e somado a
   * posicao. Sao os quatro cantos porque uma camada girada troca qual deles fica
   * mais a esquerda.
   *
   * @param {CompItem} comp
   * @param {ReadonlyArray<unknown>} camadas
   * @returns {{ esquerda: number, direita: number, cima: number, baixo: number }|null}
   */
  function unionBounds(comp, camadas) {
    var esquerda = null;
    var direita = null;
    var cima = null;
    var baixo = null;
    var i;
    var c;

    for (i = 0; i < camadas.length; i += 1) {
      var camada = /** @type {any} */ (camadas[i]);
      if (!camada || typeof camada.sourceRectAtTime !== "function") continue;

      var retangulo;
      try {
        retangulo = camada.sourceRectAtTime(comp.time, false);
      } catch (rectError) {
        continue;
      }
      if (!retangulo || !isFiniteNumber(retangulo.width) || !isFiniteNumber(retangulo.height)) continue;

      var grupo = camada.property(MN.transform);
      if (!grupo) continue;
      var posicao = grupo.property(MN.position);
      if (!(posicao instanceof Property)) continue;
      var origem = /** @type {number[]} */ (posicao.value);
      var matriz = MotionTransform.linearMatrix(camada);

      var cantos = [
        [retangulo.left, retangulo.top],
        [retangulo.left + retangulo.width, retangulo.top],
        [retangulo.left, retangulo.top + retangulo.height],
        [retangulo.left + retangulo.width, retangulo.top + retangulo.height]
      ];

      for (c = 0; c < cantos.length; c += 1) {
        var girado = MotionTransform.apply(matriz, /** @type {number[]} */ (cantos[c]));
        var x = /** @type {number} */ (girado[0]) + /** @type {number} */ (origem[0]);
        var y = /** @type {number} */ (girado[1]) + /** @type {number} */ (origem[1]);
        if (esquerda === null || x < esquerda) esquerda = x;
        if (direita === null || x > direita) direita = x;
        if (cima === null || y < cima) cima = y;
        if (baixo === null || y > baixo) baixo = y;
      }
    }

    if (esquerda === null || direita === null || cima === null || baixo === null) return null;
    return { esquerda: esquerda, direita: direita, cima: cima, baixo: baixo };
  }

  /**
   * Descreve o que a operacao faria, sem tocar no projeto.
   *
   * @param {CompItem} comp
   * @param {Record<string, unknown>} args
   * @returns {{ error: MotionCommandFailure|null, summary: Record<string, unknown> }}
   */
  function planejar(comp, args) {
    var operation = /** @type {string} */ (args.operation);
    var selecionadas = comp.selectedLayers || [];
    var i;

    if (operation === "cropToSelectedBounds") {
      if (selecionadas.length === 0) {
        return { error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null), summary: {} };
      }
      var limites = unionBounds(comp, selecionadas);
      if (!limites) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nenhuma camada da selecao tem limites mensuraveis.", null),
          summary: {}
        };
      }
      var larguraNova = Math.round(limites.direita - limites.esquerda);
      var alturaNova = Math.round(limites.baixo - limites.cima);
      if (larguraNova < 4 || alturaNova < 4) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_PRESET, "Os limites da selecao sao menores que a composicao minima.", {
            width: larguraNova,
            height: alturaNova
          }),
          summary: {}
        };
      }
      return {
        error: null,
        summary: {
          operation: operation,
          widthBefore: comp.width,
          heightBefore: comp.height,
          widthAfter: larguraNova,
          heightAfter: alturaNova,
          // As camadas andam o mesmo tanto que o enquadramento: e isso que faz a
          // aparencia ser preservada em vez de reenquadrada.
          offsetX: -limites.esquerda,
          offsetY: -limites.cima,
          layerCount: comp.numLayers
        }
      };
    }

    if (operation === "trimToWorkArea") {
      if (!(comp.workAreaDuration > 0)) {
        return { error: failure(MotionContracts.ERROR.INVALID_PRESET, "A area de trabalho esta vazia.", null), summary: {} };
      }
      return {
        error: null,
        summary: {
          operation: operation,
          durationBefore: comp.duration,
          durationAfter: comp.workAreaDuration,
          // Aparar move o inicio da area de trabalho para zero; toda camada anda
          // junto, senao o conteudo sairia de sincronia com o novo inicio.
          layerShift: -comp.workAreaStart,
          layerCount: comp.numLayers
        }
      };
    }

    if (operation === "setDuration") {
      return {
        error: null,
        summary: { operation: operation, durationBefore: comp.duration, durationAfter: args.duration }
      };
    }

    if (operation === "setFrameRate") {
      return {
        error: null,
        summary: { operation: operation, frameRateBefore: comp.frameRate, frameRateAfter: args.frameRate }
      };
    }

    if (operation === "setResolution") {
      return {
        error: null,
        summary: {
          operation: operation,
          widthBefore: comp.width,
          heightBefore: comp.height,
          widthAfter: args.width,
          heightAfter: args.height
        }
      };
    }

    if (operation === "shiftLayersToZero") {
      if (comp.numLayers === 0) {
        return { error: failure(MotionContracts.ERROR.NO_SELECTION, "A composicao nao tem camadas.", null), summary: {} };
      }
      var menor = null;
      for (i = 1; i <= comp.numLayers; i += 1) {
        var camada = comp.layer(i);
        if (!camada) continue;
        if (menor === null || camada.startTime < menor) menor = camada.startTime;
      }
      if (menor === null) {
        return { error: failure(MotionContracts.ERROR.NO_SELECTION, "A composicao nao tem camadas.", null), summary: {} };
      }
      return {
        error: null,
        summary: { operation: operation, layerShift: -menor, layerCount: comp.numLayers }
      };
    }

    if (operation === "fitLayers") {
      if (selecionadas.length === 0) {
        return { error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null), summary: {} };
      }
      var ajustaveis = 0;
      for (i = 0; i < selecionadas.length; i += 1) {
        var alvo = /** @type {any} */ (selecionadas[i]);
        if (isFiniteNumber(alvo.width) && isFiniteNumber(alvo.height) && alvo.width > 0 && alvo.height > 0) {
          ajustaveis += 1;
        }
      }
      if (ajustaveis === 0) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nenhuma camada da selecao tem tamanho de origem.", null),
          summary: {}
        };
      }
      return { error: null, summary: { operation: operation, layerCount: ajustaveis } };
    }

    // precompose
    if (selecionadas.length === 0) {
      return { error: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.", null), summary: {} };
    }
    return {
      error: null,
      summary: { operation: operation, layerCount: selecionadas.length, name: args.precomposeName }
    };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    return planejar(comp, args).error;
  }

  /**
   * Desloca todas as camadas no tempo.
   *
   * @param {CompItem} comp
   * @param {number} deslocamento
   * @returns {void}
   */
  function shiftAll(comp, deslocamento) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada) camada.startTime = camada.startTime + deslocamento;
    }
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var plano = planejar(comp, args);
    if (plano.error) throw new Error("Fast Edit ficou invalido depois do preflight.");

    var operation = /** @type {string} */ (args.operation);
    var summary = plano.summary;
    var i;

    if (operation === "trimToWorkArea") {
      // Deslocar antes de encurtar: se a duracao cair primeiro, o After Effects
      // pode empurrar camadas que ainda estao no fim da linha do tempo.
      shiftAll(comp, /** @type {number} */ (summary.layerShift));
      comp.duration = /** @type {number} */ (summary.durationAfter);
    } else if (operation === "setDuration") {
      comp.duration = /** @type {number} */ (args.duration);
    } else if (operation === "setFrameRate") {
      comp.frameRate = /** @type {number} */ (args.frameRate);
    } else if (operation === "setResolution") {
      comp.width = /** @type {number} */ (args.width);
      comp.height = /** @type {number} */ (args.height);
    } else if (operation === "cropToSelectedBounds") {
      // Deslocar antes de encolher: as camadas precisam ja estar no novo
      // enquadramento quando a composicao muda de tamanho.
      var deslocaX = /** @type {number} */ (summary.offsetX);
      var deslocaY = /** @type {number} */ (summary.offsetY);
      for (i = 1; i <= comp.numLayers; i += 1) {
        var alvo = comp.layer(i);
        if (!alvo) continue;
        var grupoAlvo = /** @type {any} */ (alvo).property(MN.transform);
        if (!grupoAlvo) continue;
        var posAlvo = grupoAlvo.property(MN.position);
        if (!(posAlvo instanceof Property) || posAlvo.numKeys > 0) continue;
        var atualPos = /** @type {number[]} */ (posAlvo.value);
        var novoPos = [
          /** @type {number} */ (atualPos[0]) + deslocaX,
          /** @type {number} */ (atualPos[1]) + deslocaY
        ];
        if (atualPos.length > 2) novoPos.push(/** @type {number} */ (atualPos[2]));
        posAlvo.setValue(novoPos);
      }
      comp.width = /** @type {number} */ (summary.widthAfter);
      comp.height = /** @type {number} */ (summary.heightAfter);
    } else if (operation === "shiftLayersToZero") {
      shiftAll(comp, /** @type {number} */ (summary.layerShift));
    } else if (operation === "fitLayers") {
      var selecionadas = comp.selectedLayers;
      for (i = 0; i < selecionadas.length; i += 1) {
        var camada = /** @type {any} */ (selecionadas[i]);
        if (!isFiniteNumber(camada.width) || !isFiniteNumber(camada.height)) continue;
        if (camada.width <= 0 || camada.height <= 0) continue;
        var grupo = camada.property(MN.transform);
        if (!grupo) continue;
        var escala = grupo.property(MN.scale);
        if (!(escala instanceof Property)) continue;
        // Menor dos dois fatores: caber inteiro, sem cortar nem distorcer.
        var fator = Math.min(comp.width / camada.width, comp.height / camada.height) * 100;
        var atual = /** @type {number[]} */ (escala.value);
        var novo = [fator, fator];
        if (atual.length > 2) novo.push(/** @type {number} */ (atual[2]));
        escala.setValue(novo);
      }
    } else {
      var indices = [];
      var paraPrecompor = comp.selectedLayers;
      for (i = 0; i < paraPrecompor.length; i += 1) {
        indices.push(/** @type {any} */ (paraPrecompor[i]).index);
      }
      comp.layers.precompose(
        indices,
        /** @type {string} */ (args.precomposeName),
        args.moveAllAttributes === true
      );
    }

    return { changed: true, warnings: [], data: summary };
  }

  MotionRegistry.register("ae.comp.fast-edit.preview", {
    preflight: preflight,
    run: function (args) {
      var comp = /** @type {CompItem} */ (app.project.activeItem);
      var plano = planejar(comp, args);
      if (plano.error) throw new Error("Fast Edit ficou invalido depois do preflight.");
      // Uma previa nao muda nada; `changed: false` e a verdade, e o descriptor
      // declara `mutates: false` para o dispatcher nao abrir grupo de Undo.
      return { changed: false, warnings: [], data: plano.summary };
    }
  });

  MotionRegistry.register("ae.comp.fast-edit", { preflight: preflight, run: run });
})();
