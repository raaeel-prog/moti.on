/**
 * Ondulacao por efeito ou por transform (`ae.effect.wave`, CHMS-027).
 *
 * ## Os dois modos
 *
 * `effect` usa o Wave Warp nativo, que deforma os pixels. `transform` aplica uma
 * expressao em Position, que move a camada inteira sem deformar. Sao resultados
 * visuais diferentes, e nao duas implementacoes da mesma coisa — por isso o modo
 * e escolha do usuario e nao um fallback automatico.
 *
 * O que **e** fallback: quando o Wave Warp nao existe naquela instalacao, o modo
 * `effect` e recusado com `CAPABILITY_UNAVAILABLE` em vez de cair calado para
 * transform. Trocar o resultado visual sem avisar seria pior do que recusar.
 *
 * ## Amplitude zero
 *
 * O criterio de aceite pede que amplitude zero devolva **exatamente** a
 * aparencia original. No modo transform isso sai da propria expressao:
 * `add(value, [0, 0])` e `value`. No modo efeito, amplitude zero e o valor
 * neutro do Wave Warp.
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
    waveWarp: "ADBE Wave Warp",
    waveType: "ADBE Wave Warp-0001",
    waveHeight: "ADBE Wave Warp-0002",
    waveWidth: "ADBE Wave Warp-0003",
    direction: "ADBE Wave Warp-0004",
    waveSpeed: "ADBE Wave Warp-0005"
  };

  var NOME_GERENCIADO = MotionContracts.RIG_PREFIX + "WAVE";
  var PARAMETROS = [MN.waveType, MN.waveHeight, MN.waveWidth, MN.direction, MN.waveSpeed];

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
    if (!isInRange(args.frequency, 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frequencia invalida.", { field: "frequency" });
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

  /**
   * O Wave Warp existe nesta instalacao?
   *
   * Tentar acrescentar e capturar a excecao e o unico jeito honesto de saber: o
   * After Effects nao expoe um catalogo de efeitos consultavel, e supor que um
   * efeito de terceiro esta instalado e como um comando quebra em outra maquina.
   *
   * @param {PropertyGroup} lista
   * @returns {boolean}
   */
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
      if (args.mode === "effect") {
        var lista = MotionEffects.parade(selecionadas[i]);
        if (!lista) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao aceita efeito.", {
            selectionIndex: i
          });
        }
        if (!suportaWaveWarp(lista)) {
          return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Wave Warp nao esta disponivel nesta instalacao.", {
            selectionIndex: i,
            effect: MN.waveWarp
          });
        }
        var qualquer = MotionEffects.findAny(lista, MN.waveWarp);
        if (qualquer && qualquer.name !== NOME_GERENCIADO) {
          return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Ja existe um Wave Warp do usuario nesta camada.", {
            selectionIndex: i
          });
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
          // Tipo 1 e a onda senoidal, que e a unica que os inputs descrevem.
          MotionEffects.setStatic(/** @type {Property} */ (wave.property(MN.waveType)), 1);
          MotionEffects.setStatic(/** @type {Property} */ (wave.property(MN.waveHeight)), amp);
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.waveWidth)),
            /** @type {number} */ (args.frequency)
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.direction)),
            args.direction === "horizontal" ? 90 : 0
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (wave.property(MN.waveSpeed)),
            /** @type {number} */ (args.speed)
          );
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
