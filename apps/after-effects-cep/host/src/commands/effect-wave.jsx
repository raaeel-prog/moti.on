/**
 * Wave: C++ deforma pixels; transform anima Position de forma editavel.
 * Os modos sao escolhas visuais distintas. O modo efeito exige CHMS Wave Core;
 * nao ha substituicao silenciosa do renderizador de um rig legado.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    mode: true,
    amplitude: true,
    frequency: true,
    speed: true,
    direction: true,
    phase: true,
    falloff: true,
    bake: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    waveWarp: "CHMS Wave Core",
    waveHeight: "CHMS Wave Core-1001", // Amplitude
    waveWidth: "CHMS Wave Core-1002",  // Wavelength
    direction: "CHMS Wave Core-1003",  // Direction (Angle)
    waveSpeed: "CHMS Wave Core-1004",  // Speed
    phase: "CHMS Wave Core-1005"
  };

  var NOME_GERENCIADO = MotionContracts.RIG_PREFIX + "WAVE";
  var PARAMETROS = [MN.waveHeight, MN.waveWidth, MN.direction, MN.waveSpeed, MN.phase];

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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Wave desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Wave ausente.", { field: key });
      }
    }
    if (args.mode !== "effect" && args.mode !== "transform") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de onda invalido.", { field: "mode" });
    }
    if (!isInRange(args.amplitude, -100000, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Amplitude invalida.", { field: "amplitude" });
    }
    if (!isInRange(args.frequency, args.mode === "effect" ? 1 : 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Comprimento de onda invalido (1 a 1000 pixels no modo efeito).", { field: "frequency" });
    }
    if (!isInRange(args.speed, -1000, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Velocidade invalida.", { field: "speed" });
    }
    if (args.direction !== "horizontal" && args.direction !== "vertical") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Direcao invalida.", { field: "direction" });
    }
    if (!isInRange(args.phase, -36000, 36000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fase invalida.", { field: "phase" });
    }
    // Falloff atenua a amplitude a cada camada seguinte: 0 mantem todas iguais,
    // 1 zera a segunda em diante.
    if (!isInRange(args.falloff, 0, 1)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Falloff invalido.", { field: "falloff" });
    }
    if (typeof args.bake !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "bake precisa ser booleano.", { field: "bake" });
    }
    if (args.bake === true && args.mode !== "transform") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Assar so faz sentido no modo transform.", {
        field: "bake"
      });
    }
    return null;
  }

  /** @param {unknown} layer @returns {Property|null} */
  function positionOf(layer) {
    var grupo = /** @type {any} */ (layer).property(MN.transform);
    if (!grupo) return null;
    var property = grupo.property(MN.position);
    return property instanceof Property ? property : null;
  }

  /** @param {PropertyGroup} lista @returns {boolean} */
  function suportaWaveWarp(lista) {
    try {
      return lista.canAddProperty(MN.waveWarp) === true;
    } catch (probeError) {
      return false;
    }
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

    if (args.bake === true) {
      var quadros = Math.round(comp.duration / comp.frameDuration);
      if (quadros > MAX_FRAMES_BAKE) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "A composicao tem quadros demais para assar.", {
          field: "bake",
          frames: quadros
        });
      }
    }

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var layer = /** @type {any} */ (selecionadas[i]);
      if (layer && layer.locked) return MotionErrors.failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "hostError.layerLocked", "Desbloqueie a camada antes de aplicar Wave.", null, { selectionIndex: i });
      if (args.mode === "effect") {
        var lista = MotionEffects.parade(selecionadas[i]);
        if (!lista) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao aceita efeito.", {
            selectionIndex: i
          });
        }
        if (!suportaWaveWarp(lista)) {
          return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Instale ou atualize o Moti.on Core para usar Wave.", {
            selectionIndex: i,
            effect: MN.waveWarp
          });
        }
        var qualquer = MotionEffects.findAny(lista, MN.waveWarp);
        if (qualquer && qualquer.name !== NOME_GERENCIADO) {
          return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Ja existe um Wave do usuario nesta camada.", {
            selectionIndex: i
          });
        }
        var legado = MotionEffects.findManaged(lista, "ADBE Wave Warp", NOME_GERENCIADO);
        if (legado) return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Esta camada usa o Wave antigo. Preserve-o ou remova-o manualmente antes de aplicar o motor novo.", { selectionIndex: i });
        if (qualquer) {
          for (var p = 0; p < PARAMETROS.length; p += 1) {
            var parametroName = /** @type {string} */ (PARAMETROS[p]);
            var parametro = qualquer.property(parametroName);
            if (!parametro) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Atualize o Moti.on Core para incluir todos os controles Wave.", { parameter: PARAMETROS[p] });
            if (parametro.numKeys > 0 || parametro.expression) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Wave contem animacao manual. Ajuste pelos controles do efeito para preserva-la.", { parameter: PARAMETROS[p] });
          }
        }
        continue;
      }

      var posicao = positionOf(selecionadas[i]);
      if (!posicao || posicao.canSetExpression !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao expoe Position scriptavel.", {
          selectionIndex: i
        });
      }
      if (posicao.expression !== "" && !MotionExpressions.isManagedWave(posicao.expression)) {
        return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Position contem expressao de usuario.", {
          selectionIndex: i
        });
      }
    }
    return null;
  }

  /**
   * Amplitude da camada de indice `i`, ja atenuada pelo falloff.
   *
   * @param {number} amplitude
   * @param {number} falloff
   * @param {number} indice
   * @returns {number}
   */
  function amplitudeDe(amplitude, falloff, indice) {
    return amplitude * Math.pow(1 - falloff, indice);
  }

  /**
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
    var modo = /** @type {string} */ (args.mode);
    var amplitude = /** @type {number} */ (args.amplitude);
    var falloff = /** @type {number} */ (args.falloff);
    var bake = args.bake === true;

    var criados = [];
    var anteriores = [];
    var tocadas = [];
    var appliedCount = 0;
    var i;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var amp = amplitudeDe(amplitude, falloff, i);

        if (modo === "effect") {
          var lista = /** @type {PropertyGroup} */ (MotionEffects.parade(selecionadas[i]));
          var wave = MotionEffects.findManaged(lista, MN.waveWarp, NOME_GERENCIADO);
          if (wave) {
            anteriores.push(MotionEffects.snapshot(wave, PARAMETROS));
          } else {
            wave = MotionEffects.add(lista, MN.waveWarp, NOME_GERENCIADO);
            criados.push(wave);
          }
          // Padrao organico do motor C++; a fase e independente da velocidade.
          MotionEffects.setStatic(/** @type {Property} */ (wave.property(MN.waveHeight)), amp);
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.waveWidth)),
            /** @type {number} */ (args.frequency)
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.direction)),
            args.direction === "horizontal" ? 0 : 90
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.waveSpeed)),
            /** @type {number} */ (args.speed)
          );
          MotionEffects.setStatic(/** @type {Property} */ (wave.property(MN.phase)), /** @type {number} */ (args.phase));
          appliedCount += 1;
          continue;
        }

        var posicao = /** @type {Property} */ (positionOf(selecionadas[i]));
        var expr = MotionExpressions.renderWave({
          amplitude: amp,
          // A velocidade do modo transform e a frequencia em Hz: quantas voltas
          // por segundo. `frequency` no modo efeito e comprimento de onda, que e
          // outra grandeza — por isso os dois modos nao compartilham o token.
          frequency: /** @type {number} */ (args.speed),
          phase: /** @type {number} */ (args.phase),
          direction: args.direction
        });
        tocadas.push({
          property: posicao,
          expression: posicao.expression,
          expressionEnabled: posicao.expressionEnabled
        });
        posicao.expression = expr;
        if (typeof posicao.expressionError === "string" && posicao.expressionError !== "") {
          throw new Error("After Effects recusou a expressao de onda.");
        }
        posicao.expressionEnabled = true;
        if (bake) bakeProperty(posicao, comp);
        appliedCount += 1;
      }
    } catch (waveError) {
      var rollbackFailed = false;
      for (i = tocadas.length - 1; i >= 0; i -= 1) {
        try {
          var anteriorExpr = tocadas[i];
          if (!anteriorExpr) continue;
          anteriorExpr.property.expression = anteriorExpr.expression;
          anteriorExpr.property.expressionEnabled = anteriorExpr.expressionEnabled;
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (anterior) MotionEffects.restore(anterior);
        } catch (restoreEffectError) {
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
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Wave falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Wave falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: appliedCount > 0,
      warnings: [],
      data: { appliedCount: appliedCount, mode: modo, baked: bake }
    };
  }

  MotionRegistry.register("ae.effect.wave", { preflight: preflight, run: run });
})();
