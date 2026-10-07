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

  var GRID_TAG = "[MOTION_TILE_GRID_V1]";
  var CELL_TAG = "[MOTION_TILE_CELL_V1]";

  /** @param {any} layer @returns {boolean} */
  function isController(layer) {
    return !!layer && typeof layer.comment === "string" && layer.comment.indexOf(GRID_TAG) >= 0;
  }

  /** @param {any} layer @returns {number[]|null} */
  function cellOf(layer) {
    var text = String(layer.comment || "");
    var at = text.indexOf(CELL_TAG);
    if (at < 0) return null;
    var match = /^(\d+),(\d+)/.exec(text.substring(at + CELL_TAG.length));
    return match ? [Number(match[1]), Number(match[2])] : null;
  }

  /** @param {any} layer @param {number} row @param {number} column @returns {void} */
  function tagCell(layer, row, column) {
    var text = String(layer.comment || "").replace(/\n?\[MOTION_TILE_CELL_V1\]\d+,\d+/g, "");
    layer.comment = text + (text ? "\n" : "") + CELL_TAG + row + "," + column;
  }

  /** @param {CompItem} comp @param {any[]} selected @returns {any[]} */
  function gridPlans(comp, selected) {
    var plans = [];
    var i;
    for (i = 0; i < selected.length; i += 1) {
      var layer = selected[i];
      var controller = isController(layer) ? layer : isController(layer.parent) ? layer.parent : null;
      var duplicate = false;
      var p;
      for (p = 0; p < plans.length; p += 1) {
        if (controller && (/** @type {any} */ (plans[p])).controller === controller) duplicate = true;
      }
      if (duplicate) continue;
      var members = [];
      var source = controller ? null : layer;
      if (controller) {
        var n;
        for (n = 1; n <= comp.numLayers; n += 1) {
          var member = comp.layer(n);
          var cell = member && member.parent === controller ? cellOf(member) : null;
          if (!cell) continue;
          members.push({ layer: member, row: cell[0], column: cell[1] });
          if (cell[0] === 0 && cell[1] === 0) {
            if (source) throw new Error("A grade possui mais de uma origem.");
            source = member;
          }
        }
      }
      if (!source) throw new Error("A origem da grade nao esta mais disponivel.");
      plans.push({ controller: controller, source: source, members: members });
    }
    return plans;
  }

  /** @param {any} layer @returns {MotionCommandFailure|null} */
  function gridTargetError(layer) {
    if (layer.locked || layer.threeDLayer || !MotionEffects.parade(layer) || typeof layer.duplicate !== "function") return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A grade requer camadas visuais 2D desbloqueadas.", null);
    var pos = positionOf(layer);
    if (!pos || (/** @type {any} */ (pos)).dimensionsSeparated) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A grade requer Position com dimensoes unidas.", null);
    if (pos.expressionEnabled || pos.expression) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A grade preserva a expressao existente; use uma camada sem expressao em Position.", null);
    if (pos.numKeys > 0) return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "A grade requer Position sem keyframes; anime o controller depois de criar.", null);
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
    if (args.mode === "grid") {
      var plans;
      try { plans = gridPlans(comp, selecionadas); }
      catch (gridError) { return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A grade esta incompleta; restaure sua camada original.", null); }
      if (plans.length * Number(args.gridRows) * Number(args.gridColumns) > MAX_CELULAS) return failure(MotionContracts.ERROR.INVALID_PRESET, "O total de celulas selecionadas excede o limite da grade.", { max: MAX_CELULAS });
      for (i = 0; i < plans.length; i += 1) {
        var plan = plans[i];
        if (plan.controller && plan.controller.locked) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie o controller da grade.", null);
        if (!plan.controller && (plan.source.parent || cellOf(plan.source))) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "A camada ja possui parentesco ou pertence a outra grade.", null);
        var targetError = gridTargetError(plan.source);
        if (targetError) return targetError;
        var m;
        for (m = 0; m < plan.members.length; m += 1) {
          targetError = gridTargetError(plan.members[m].layer);
          if (targetError) return targetError;
        }
      }
      return null;
    }
    for (i = 0; i < selecionadas.length; i += 1) {
      if ((/** @type {any} */ (selecionadas[i])).locked) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie as camadas selecionadas.", { selectionIndex: i });
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
        var managed = MotionEffects.findManaged(lista, MN.tile, NOME_EFEITO);
        if (managed) {
          var p;
          for (p = 0; p < PARAMETROS.length; p += 1) {
            var prop = managed.property(/** @type {string} */ (PARAMETROS[p]));
            if (!prop) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Parametro de Motion Tile ausente.", { parameter: PARAMETROS[p] });
            if (prop.expressionEnabled || prop.expression) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Motion Tile possui expressao; ajuste o efeito diretamente.", { parameter: PARAMETROS[p] });
            if (prop.numKeys > 0) return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Motion Tile possui keyframes; ajuste o efeito diretamente.", { parameter: PARAMETROS[p] });
          }
        }
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
    var controllersCriados = [];
    var layersAnteriores = [];
    var removidas = 0;
    var tempo = comp.time;
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

      var plans = gridPlans(comp, selecionadas);
      var obsolete = [];
      for (i = 0; i < plans.length; i += 1) {
        var plan = plans[i];
        var original = plan.source;
        var controller = plan.controller;
        layersAnteriores.push({ layer: original, parent: original.parent, position: (/** @type {Property} */ (positionOf(original))).value, comment: original.comment });
        if (!controller) {
          controller = comp.layers.addNull();
          controllersCriados.push(controller);
          controller.name = NOME_CONTROLLER;
          controller.comment = GRID_TAG;
          // A neutral controller avoids the old half-comp offset after parenting.
          (/** @type {Property} */ (positionOf(controller))).setValue([0, 0]);
          original.parent = controller;
          tagCell(original, 0, 0);
        }
        var base = /** @type {number[]} */ ((/** @type {Property} */ (positionOf(original))).value);
        var m;
        for (m = 0; m < plan.members.length; m += 1) {
          var member = plan.members[m];
          if (member.row >= linhas || member.column >= colunas) obsolete.push(member.layer);
        }
        var linha;
        var coluna;
        for (linha = 0; linha < linhas; linha += 1) {
          for (coluna = 0; coluna < colunas; coluna += 1) {
            if (linha === 0 && coluna === 0) continue;
            var copia = null;
            for (m = 0; m < plan.members.length; m += 1) {
              if (plan.members[m].row === linha && plan.members[m].column === coluna) copia = plan.members[m].layer;
            }
            if (copia) {
              layersAnteriores.push({ layer: copia, parent: copia.parent, position: (/** @type {Property} */ (positionOf(copia))).value, comment: copia.comment });
            } else {
              copia = original.duplicate();
              camadasCriadas.push(copia);
              copia.name = NOME_CONTROLLER + " " + (linha + 1) + "x" + (coluna + 1);
              copia.parent = controller;
              tagCell(copia, linha, coluna);
            }
            (/** @type {Property} */ (positionOf(copia))).setValue([Number(base[0]) + coluna * espaco, Number(base[1]) + linha * espaco]);
            appliedCount += 1;
          }
        }
      }
      // Only remove owned cells after every potentially failing write succeeded.
      for (i = obsolete.length - 1; i >= 0; i -= 1) {
        obsolete[i].remove();
        removidas += 1;
      }
    } catch (tileError) {
      var rollbackFailed = removidas > 0;
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
      for (i = layersAnteriores.length - 1; i >= 0; i -= 1) {
        try {
          var saved = /** @type {any} */ (layersAnteriores[i]);
          saved.layer.parent = saved.parent;
          (/** @type {Property} */ (positionOf(saved.layer))).setValue(saved.position);
          saved.layer.comment = saved.comment;
        } catch (restoreLayerError) { rollbackFailed = true; }
      }
      for (i = controllersCriados.length - 1; i >= 0; i -= 1) {
        try { controllersCriados[i].remove(); }
        catch (removeControllerError) { rollbackFailed = true; }
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
    } finally {
      for (i = 1; i <= comp.numLayers; i += 1) comp.layer(i).selected = false;
      for (i = 0; i < selecionadas.length; i += 1) {
        try { (/** @type {Layer} */ (selecionadas[i])).selected = true; } catch (selectionError) { /* Removed grid cells cannot remain selected. */ }
      }
      comp.time = tempo;
    }

    return {
      changed: appliedCount > 0 || controllersCriados.length > 0 || removidas > 0,
      warnings: [],
      data: {
        appliedCount: appliedCount,
        mode: modo,
        controllerCreated: controllersCriados.length > 0,
        removedCount: removidas
      }
    };
  }

  MotionRegistry.register("ae.effect.tile", { preflight: preflight, run: run });
})();
