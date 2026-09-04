/**
 * Expansao de bordas ou grade real de duplicatas (`ae.effect.tile`, CHMS-027).
 *
 * ## Os dois modos
 *
 * `effect` usa o Motion Tile nativo: barato, sem camada nova, e com Mirror Edges
 * que e o que evita costura ao aumentar o tamanho de saida — o criterio de
 * aceite. `grid` cria duplicatas de verdade, que podem ser animadas uma a uma.
 *
 * ## Adjust
 *
 * O criterio pede que "Adjust atualize o rig existente". No modo efeito isso e o
 * mesmo reconhecimento por prefixo que Echo e Wave usam. No modo grade, os
 * membros vem do parentesco com o controller: e estrutural, e sobrevive a
 * renomear e reordenar, ao contrario de guardar indices.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    mode: true,
    outputWidth: true,
    outputHeight: true,
    mirrorEdges: true,
    gridRows: true,
    gridColumns: true,
    spacing: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    tile: "ADBE Tile",
    outputWidth: "ADBE Tile-0004",
    outputHeight: "ADBE Tile-0005",
    mirrorEdges: "ADBE Tile-0006"
  };

  var NOME_EFEITO = MotionContracts.RIG_PREFIX + "TILE";
  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "TILE GRID";
  var PARAMETROS = [MN.outputWidth, MN.outputHeight, MN.mirrorEdges];

  /** Teto de duplicatas: 400 camadas ja e mais do que uma timeline aguenta bem. */
  var MAX_CELULAS = 400;

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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Tile desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Tile ausente.", { field: key });
      }
    }
    if (args.mode !== "effect" && args.mode !== "grid") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de tile invalido.", { field: "mode" });
    }
    if (args.mode === "effect") {
      // Percentual do tamanho da composicao, que e como o Motion Tile mede.
      if (!isInRange(args.outputWidth, 1, 10000)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Largura de saida invalida.", { field: "outputWidth" });
      }
      if (!isInRange(args.outputHeight, 1, 10000)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Altura de saida invalida.", { field: "outputHeight" });
      }
      if (typeof args.mirrorEdges !== "boolean") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "mirrorEdges precisa ser booleano.", {
          field: "mirrorEdges"
        });
      }
      return null;
    }
    if (!isIntegerInRange(args.gridRows, 1, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Numero de linhas invalido.", { field: "gridRows" });
    }
    if (!isIntegerInRange(args.gridColumns, 1, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Numero de colunas invalido.", { field: "gridColumns" });
    }
    if (
      /** @type {number} */ (args.gridRows) * /** @type {number} */ (args.gridColumns) > MAX_CELULAS
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "A grade pedida tem celulas demais.", {
        field: "gridRows",
        max: MAX_CELULAS
      });
    }
    if (!isInRange(args.spacing, 0, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Espacamento invalido.", { field: "spacing" });
    }
    return null;
  }

  /** @param {PropertyGroup} lista @returns {boolean} */
  function suportaMotionTile(lista) {
    try {
      return lista.canAddProperty(MN.tile) === true;
    } catch (probeError) {
      return false;
    }
  }

  /** @param {unknown} layer @returns {Property|null} */
  function positionOf(layer) {
    var grupo = /** @type {any} */ (layer).property(MN.transform);
    if (!grupo) return null;
    var property = grupo.property(MN.position);
    return property instanceof Property ? property : null;
  }

  /** @param {CompItem} comp @returns {Layer|null} */
  function findController(comp) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && camada.name === NOME_CONTROLLER) return camada;
    }
    return null;
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

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      if (args.mode === "effect") {
        var lista = MotionEffects.parade(selecionadas[i]);
        if (!lista) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao aceita efeito.", {
            selectionIndex: i
          });
        }
        if (!suportaMotionTile(lista)) {
          return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Motion Tile nao esta disponivel nesta instalacao.", {
            selectionIndex: i,
            effect: MN.tile
          });
        }
        var qualquer = MotionEffects.findAny(lista, MN.tile);
        if (qualquer && qualquer.name !== NOME_EFEITO) {
          return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Ja existe um Motion Tile do usuario nesta camada.", {
            selectionIndex: i
          });
        }
        continue;
      }

      var camada = /** @type {any} */ (selecionadas[i]);
      if (typeof camada.duplicate !== "function") {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao pode ser duplicada.", {
          selectionIndex: i
        });
      }
      if (!positionOf(camada)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position.", {
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
    // Copia da selecao, e nao a lista viva: no After Effects a duplicata nasce
    // selecionada, e iterar enquanto se duplica e um laco que nao termina.
    var selecionadas = [];
    var s;
    for (s = 0; s < comp.selectedLayers.length; s += 1) selecionadas.push(comp.selectedLayers[s]);
    var modo = /** @type {string} */ (args.mode);

    var criados = [];
    var anteriores = [];
    var camadasCriadas = [];
    var controllerCriado = null;
    var appliedCount = 0;
    var i;

    try {
      if (modo === "effect") {
        for (i = 0; i < selecionadas.length; i += 1) {
          var lista = /** @type {PropertyGroup} */ (MotionEffects.parade(selecionadas[i]));
          var tile = MotionEffects.findManaged(lista, MN.tile, NOME_EFEITO);
          if (tile) {
            anteriores.push(MotionEffects.snapshot(tile, PARAMETROS));
          } else {
            tile = MotionEffects.add(lista, MN.tile, NOME_EFEITO);
            criados.push(tile);
          }
          MotionEffects.setStatic(
            /** @type {Property} */ (tile.property(MN.outputWidth)),
            /** @type {number} */ (args.outputWidth)
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (tile.property(MN.outputHeight)),
            /** @type {number} */ (args.outputHeight)
          );
          // Espelhar a borda e o que faz a emenda desaparecer quando a saida
          // cresce: sem isso, o padrao repete e a costura fica visivel.
          MotionEffects.setStatic(
            /** @type {Property} */ (tile.property(MN.mirrorEdges)),
            args.mirrorEdges === true ? 1 : 0
          );
          appliedCount += 1;
        }

        return {
          changed: appliedCount > 0,
          warnings: [],
          data: { appliedCount: appliedCount, mode: modo }
        };
      }

      var linhas = /** @type {number} */ (args.gridRows);
      var colunas = /** @type {number} */ (args.gridColumns);
      var espaco = /** @type {number} */ (args.spacing);

      var controller = findController(comp);
      if (!controller) {
        controller = comp.layers.addNull();
        controllerCriado = controller;
        controller.name = NOME_CONTROLLER;
      }

      for (i = 0; i < selecionadas.length; i += 1) {
        var original = /** @type {any} */ (selecionadas[i]);
        if (original === controller) continue;

        var posOriginal = /** @type {Property} */ (positionOf(original));
        var base = /** @type {number[]} */ (posOriginal.value);
        original.parent = controller;

        var linha;
        var coluna;
        for (linha = 0; linha < linhas; linha += 1) {
          for (coluna = 0; coluna < colunas; coluna += 1) {
            // A celula (0,0) e a propria camada original: duplicar tambem ela
            // deixaria duas camadas exatamente sobrepostas.
            if (linha === 0 && coluna === 0) continue;
            var copia = original.duplicate();
            camadasCriadas.push(copia);
            copia.name = NOME_CONTROLLER + " " + (linha + 1) + "x" + (coluna + 1);
            copia.parent = controller;
            var posCopia = /** @type {Property} */ (positionOf(copia));
            var novo = [
              /** @type {number} */ (base[0]) + coluna * espaco,
              /** @type {number} */ (base[1]) + linha * espaco
            ];
            if (base.length > 2) novo.push(/** @type {number} */ (base[2]));
            posCopia.setValue(novo);
            appliedCount += 1;
          }
        }
      }
    } catch (tileError) {
      var rollbackFailed = false;
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (anterior) MotionEffects.restore(anterior);
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      for (i = criados.length - 1; i >= 0; i -= 1) {
        try {
          var criado = criados[i];
          if (criado) criado.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      for (i = camadasCriadas.length - 1; i >= 0; i -= 1) {
        try {
          var camada = camadasCriadas[i];
          if (camada) camada.remove();
        } catch (removeLayerError) {
          rollbackFailed = true;
        }
      }
      if (controllerCriado) {
        try {
          controllerCriado.remove();
        } catch (removeControllerError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Tile falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Tile falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: appliedCount > 0,
      warnings: [],
      data: {
        appliedCount: appliedCount,
        mode: modo,
        controllerCreated: controllerCriado !== null
      }
    };
  }

  MotionRegistry.register("ae.effect.tile", { preflight: preflight, run: run });
})();
