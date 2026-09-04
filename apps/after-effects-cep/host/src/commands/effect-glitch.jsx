/**
 * Glitch por adjustment layer (`ae.effect.glitch`, CHMS-027).
 *
 * ## Por que uma adjustment layer, e nao efeitos na camada
 *
 * O criterio de aceite pede que **desativar o controller zere o efeito** e que
 * **remover o rig nao toque outras adjustment layers**. As duas coisas saem da
 * mesma decisao: o glitch inteiro mora numa adjustment layer propria, marcada
 * com o prefixo do plugin. Desligar o olho dela zera o efeito sem desfazer nada;
 * remover o rig e remover aquela camada, e nenhuma outra.
 *
 * Se os efeitos fossem aplicados direto nas camadas selecionadas, "desativar"
 * exigiria mexer em cada efeito de cada camada, e "remover" teria que adivinhar
 * quais efeitos eram do plugin no meio dos do usuario.
 *
 * ## Composicao do glitch
 *
 * Tres efeitos nativos empilhados, cada um resolvido por matchName e cada um com
 * fallback proprio: se um nao existir, ele e pulado e o comando avisa em vez de
 * falhar — um glitch com dois dos tres ainda e um glitch.
 */
(function () {
  var ALLOWED = {
    mode: true,
    intensity: true,
    frequency: true,
    rgbSplit: true,
    displacement: true,
    frameHold: true,
    seed: true,
    durationFrames: true
  };

  var MN = {
    // Deslocamento horizontal em blocos.
    transformEffect: "ADBE Geometry2",
    transformPosition: "ADBE Geometry2-0004",
    // Separacao de canais.
    channelBlur: "ADBE Channel Blur",
    redBlur: "ADBE Channel Blur-0001",
    blueBlur: "ADBE Channel Blur-0003",
    // Ruido, que da a textura.
    noise: "ADBE Noise",
    noiseAmount: "ADBE Noise-0001"
  };

  var NOME_CONTROLLER = MotionContracts.RIG_PREFIX + "GLITCH";

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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Glitch desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Glitch ausente.", { field: key });
      }
    }
    if (args.mode !== "continuous" && args.mode !== "oneShot") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de glitch invalido.", { field: "mode" });
    }
    if (!isInRange(args.intensity, 0, 1)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Intensidade invalida.", { field: "intensity" });
    }
    if (!isInRange(args.frequency, 0, 120)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frequencia invalida.", { field: "frequency" });
    }
    if (!isInRange(args.rgbSplit, 0, 200)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Separacao RGB invalida.", { field: "rgbSplit" });
    }
    if (!isInRange(args.displacement, 0, 2000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Deslocamento invalido.", { field: "displacement" });
    }
    if (typeof args.frameHold !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "frameHold precisa ser booleano.", { field: "frameHold" });
    }
    if (
      !isFiniteNumber(args.seed) ||
      Math.floor(/** @type {number} */ (args.seed)) !== args.seed ||
      !isInRange(args.seed, 0, 1000000)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente invalida.", { field: "seed" });
    }
    if (
      !isFiniteNumber(args.durationFrames) ||
      Math.floor(/** @type {number} */ (args.durationFrames)) !== args.durationFrames ||
      !isInRange(args.durationFrames, 1, 10000)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao invalida.", { field: "durationFrames" });
    }
    return null;
  }

  /**
   * Adjustment layer do glitch, se ja existir.
   *
   * @param {CompItem} comp
   * @returns {Layer|null}
   */
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
    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }
    return null;
  }

  /**
   * Aplica um efeito quando ele existe naquela instalacao.
   *
   * Devolve `null` quando o efeito nao esta disponivel, e quem chama transforma
   * isso em warning. A §pede "fornecer fallback": um glitch com dois dos tres
   * efeitos continua sendo um glitch, e recusar o comando inteiro por causa de
   * um plug-in ausente seria pior do que entregar o que da.
   *
   * @param {PropertyGroup} lista
   * @param {string} matchName
   * @returns {PropertyGroup|null}
   */
  function tentarEfeito(lista, matchName) {
    try {
      if (lista.canAddProperty(matchName) !== true) return null;
    } catch (probeError) {
      return null;
    }
    return MotionEffects.add(lista, matchName, MotionContracts.RIG_PREFIX + matchName);
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var intensidade = /** @type {number} */ (args.intensity);
    var duracao = /** @type {number} */ (args.durationFrames);

    var warnings = [];
    var controllerAnterior = findController(comp);
    var controllerCriado = null;
    var efeitosAplicados = 0;

    try {
      var controller = controllerAnterior;
      if (!controller) {
        controller = comp.layers.addNull();
        controllerCriado = controller;
        controller.name = NOME_CONTROLLER;
        // Adjustment layer: o efeito atinge tudo que estiver abaixo dela, que e o
        // que permite desligar o glitch inteiro pelo olho de uma camada so.
        controller.adjustmentLayer = true;
      }

      var lista = /** @type {PropertyGroup} */ (MotionEffects.parade(controller));

      // Reaplicar limpa os efeitos gerenciados antes de recriar: assim o preset
      // novo substitui o antigo em vez de empilhar. Nenhum efeito sem o prefixo
      // e tocado, que e a metade "sem apagar efeitos preexistentes".
      var i;
      for (i = lista.numProperties; i >= 1; i -= 1) {
        var existente = lista.property(i);
        if (
          existente &&
          typeof existente.name === "string" &&
          existente.name.indexOf(MotionContracts.RIG_PREFIX) === 0
        ) {
          existente.remove();
        }
      }

      if (/** @type {number} */ (args.displacement) > 0) {
        var deslocador = tentarEfeito(lista, MN.transformEffect);
        if (deslocador) {
          var posicao = /** @type {Property} */ (deslocador.property(MN.transformPosition));
          if (posicao) {
            // O deslocamento pisca no ritmo pedido: `posterizeTime` trava o
            // sorteio por segundo, e `seedRandom` o torna reproduzivel.
            posicao.expression = MotionExpressions.renderGlitchDisplacement({
              amount: /** @type {number} */ (args.displacement) * intensidade,
              frequency: /** @type {number} */ (args.frequency),
              seed: /** @type {number} */ (args.seed)
            });
            if (typeof posicao.expressionError === "string" && posicao.expressionError !== "") {
              throw new Error("After Effects recusou a expressao de deslocamento.");
            }
            posicao.expressionEnabled = true;
          }
          efeitosAplicados += 1;
        } else {
          warnings.push({
            code: "glitch.effectUnavailable",
            message: "O efeito de deslocamento nao esta disponivel nesta instalacao.",
            details: { effect: MN.transformEffect }
          });
        }
      }

      if (/** @type {number} */ (args.rgbSplit) > 0) {
        var canais = tentarEfeito(lista, MN.channelBlur);
        if (canais) {
          // Desfocar vermelho e azul em quantidades diferentes e o que separa os
          // canais visualmente, sem precisar de tres cópias da camada.
          MotionEffects.setStatic(
            /** @type {Property} */ (canais.property(MN.redBlur)),
            /** @type {number} */ (args.rgbSplit) * intensidade
          );
          MotionEffects.setStatic(
            /** @type {Property} */ (canais.property(MN.blueBlur)),
            /** @type {number} */ (args.rgbSplit) * intensidade * 0.6
          );
          efeitosAplicados += 1;
        } else {
          warnings.push({
            code: "glitch.effectUnavailable",
            message: "A separacao de canais nao esta disponivel nesta instalacao.",
            details: { effect: MN.channelBlur }
          });
        }
      }

      if (intensidade > 0) {
        var ruido = tentarEfeito(lista, MN.noise);
        if (ruido) {
          MotionEffects.setStatic(
            /** @type {Property} */ (ruido.property(MN.noiseAmount)),
            intensidade * 20
          );
          efeitosAplicados += 1;
        } else {
          warnings.push({
            code: "glitch.effectUnavailable",
            message: "O ruido nao esta disponivel nesta instalacao.",
            details: { effect: MN.noise }
          });
        }
      }

      if (efeitosAplicados === 0) {
        throw new Error("Nenhum dos efeitos do glitch esta disponivel.");
      }

      if (args.mode === "oneShot") {
        // Um estalo dura o que o usuario pediu: fora dessa janela a camada some
        // da linha do tempo em vez de ficar glitchando para sempre.
        controller.inPoint = comp.time;
        controller.outPoint = comp.time + duracao * comp.frameDuration;
      }
    } catch (glitchError) {
      var rollbackFailed = false;
      if (controllerCriado) {
        try {
          controllerCriado.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Glitch falhou e a camada criada nao pode ser removida.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Glitch falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: true,
      warnings: warnings,
      data: {
        effectCount: efeitosAplicados,
        controllerCreated: controllerCriado !== null,
        mode: args.mode
      }
    };
  }

  MotionRegistry.register("ae.effect.glitch", { preflight: preflight, run: run });
})();
