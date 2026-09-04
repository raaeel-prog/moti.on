/**
 * Efeito Echo com presets (`ae.effect.echo`, CHMS-027 parcial / P2).
 *
 * O criterio de aceite e "preset pode ser ajustado e removido **sem apagar
 * efeitos preexistentes**". Duas consequencias no codigo:
 *
 *  - o comando nunca varre a lista de efeitos apagando nada: ele acha o Echo
 *    gerenciado pelo prefixo no nome e mexe so nele;
 *  - um Echo que o usuario mesmo aplicou nao e tocado. Se existir um sem o
 *    prefixo, o comando **recusa** em vez de ajustar o que nao e dele.
 *
 * Os valores anteriores do efeito gerenciado sao guardados antes de escrever,
 * que e o "registrar valores anteriores" da §.
 */
(function () {
  var ALLOWED = {
    echoTime: true,
    numberOfEchoes: true,
    startingIntensity: true,
    decay: true,
    operator: true,
    animate: true
  };

  var MN = {
    echo: "ADBE Echo",
    echoTime: "ADBE Echo-0001",
    numberOfEchoes: "ADBE Echo-0002",
    startingIntensity: "ADBE Echo-0003",
    decay: "ADBE Echo-0004",
    operator: "ADBE Echo-0005"
  };

  var NOME_GERENCIADO = MotionContracts.RIG_PREFIX + "ECHO";

  /**
   * Operadores do Echo nativo, na ordem em que o After Effects os lista.
   * Sao indices, e nao texto: o menu do efeito e localizado.
   */
  /** @type {Record<string, number>} */
  var OPERADORES = {
    add: 1,
    maximum: 2,
    minimum: 3,
    screen: 4,
    compositeInBack: 5,
    compositeInFront: 6,
    blend: 7
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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Echo desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Echo ausente.", { field: key });
      }
    }
    // Echo Time e em segundos e negativo significa eco do passado, que e o uso
    // comum: rastro atras do movimento.
    if (!isInRange(args.echoTime, -10, 10)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo de eco invalido.", { field: "echoTime" });
    }
    if (
      !isFiniteNumber(args.numberOfEchoes) ||
      Math.floor(/** @type {number} */ (args.numberOfEchoes)) !== args.numberOfEchoes ||
      !isInRange(args.numberOfEchoes, 1, 100)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Numero de ecos invalido.", { field: "numberOfEchoes" });
    }
    if (!isInRange(args.startingIntensity, 0, 1)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Intensidade inicial invalida.", {
        field: "startingIntensity"
      });
    }
    if (!isInRange(args.decay, 0, 1)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Decaimento invalido.", { field: "decay" });
    }
    if (typeof args.operator !== "string" || !Object.prototype.hasOwnProperty.call(OPERADORES, args.operator)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Operador de eco invalido.", { field: "operator" });
    }
    if (typeof args.animate !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "animate precisa ser booleano.", { field: "animate" });
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
      var efeitos = MotionEffects.parade(selecionadas[i]);
      if (!efeitos) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao aceita efeito.", {
          selectionIndex: i
        });
      }
      var qualquer = MotionEffects.findAny(efeitos, MN.echo);
      if (qualquer && qualquer.name !== NOME_GERENCIADO) {
        return failure(MotionContracts.ERROR.TRACK_CONFLICT, "Ja existe um Echo do usuario nesta camada.", {
          selectionIndex: i
        });
      }
    }
    return null;
  }

  /** Parametros que o preset escreve, e portanto os que precisam voltar. */
  var PARAMETROS = [MN.echoTime, MN.numberOfEchoes, MN.startingIntensity, MN.decay, MN.operator];

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    var intensidade = /** @type {number} */ (args.startingIntensity);
    var ecos = /** @type {number} */ (args.numberOfEchoes);
    var animate = args.animate === true;

    var criados = [];
    var anteriores = [];
    var addedCount = 0;
    var adjustedCount = 0;
    var i;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var efeitos = /** @type {PropertyGroup} */ (MotionEffects.parade(selecionadas[i]));
        var echo = MotionEffects.findManaged(efeitos, MN.echo, NOME_GERENCIADO);

        if (echo) {
          anteriores.push(MotionEffects.snapshot(echo, PARAMETROS));
          adjustedCount += 1;
        } else {
          echo = MotionEffects.add(efeitos, MN.echo, NOME_GERENCIADO);
          criados.push(echo);
          addedCount += 1;
        }

        MotionEffects.setStatic(/** @type {Property} */ (echo.property(MN.echoTime)), /** @type {number} */ (args.echoTime));
        MotionEffects.setStatic(/** @type {Property} */ (echo.property(MN.numberOfEchoes)), ecos);
        MotionEffects.setStatic(/** @type {Property} */ (echo.property(MN.decay)), /** @type {number} */ (args.decay));
        MotionEffects.setStatic(
          /** @type {Property} */ (echo.property(MN.operator)),
          /** @type {number} */ (OPERADORES[/** @type {string} */ (args.operator)])
        );

        var propIntensidade = /** @type {Property} */ (echo.property(MN.startingIntensity));
        if (!animate) {
          MotionEffects.setStatic(propIntensidade, intensidade);
          continue;
        }

        // A janela da animacao sai do proprio numero de ecos, e nao de um numero
        // magico: quanto mais ecos, mais tempo o rastro leva para se formar.
        var inicio = comp.time;
        var fim = comp.time + ecos * comp.frameDuration;
        var k;
        for (k = propIntensidade.numKeys; k >= 1; k -= 1) propIntensidade.removeKey(k);
        propIntensidade.setValueAtTime(inicio, 0);
        propIntensidade.setValueAtTime(fim, intensidade);
      }
    } catch (echoError) {
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
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Echo falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Echo falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: addedCount + adjustedCount > 0,
      warnings: [],
      data: { addedCount: addedCount, adjustedCount: adjustedCount }
    };
  }

  MotionRegistry.register("ae.effect.echo", { preflight: preflight, run: run });
})();
