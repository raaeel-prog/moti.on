/**
 * Salto com arco, antecipacao e squash/stretch (`ae.animate.jump`, P1).
 *
 * Diferente de Wiggle, Inertial e Kinetic, este comando **grava keyframes de
 * verdade** em Position e Scale. Isso e escolha do §"ae.animate.jump", que pede
 * "gerar keyframes de Position e Scale", e nao acidente: o usuario precisa poder
 * pegar o apice e arrasta-lo.
 *
 * ## Espaco de coordenadas
 *
 * `Position` de uma camada com pai e expressa no sistema do pai. Somar `height`
 * pixels no eixo Y so significa "para cima na composicao" quando a cadeia de
 * pais nao gira nem escala. Quando gira, este comando **recusa** em vez de
 * gravar um salto torto: a §"ae.layer.flip" ja estabeleceu esse precedente ao
 * recusar 3D em vez de aproximar. Cadeia de pais sem rotacao e sem escala e o
 * caso comum, e esse funciona exatamente.
 */
(function () {
  /* global Property KeyframeInterpolationType */
  var ALLOWED = {
    height: true,
    durationFrames: true,
    direction: true,
    squashStretch: true,
    anticipationFrames: true,
    staggerFrames: true
  };

  var MN_TRANSFORM = "ADBE Transform Group";
  var MN_POSITION = "ADBE Position";
  var MN_SCALE = "ADBE Scale";

  /**
   * Influencia baixa no chao e alta no apice: a curva sai reta da decolagem e
   * achata no topo, que e a forma da gravidade. Velocidade fica em zero porque
   * a forma vem da influencia, e velocidade arbitrada em unidade/segundo nao
   * teria como acompanhar altura e duracao variaveis.
   */
  var INFLUENCIA_CHAO = 0.1;
  var INFLUENCIA_APICE = 75;

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

  /**
   * @param {unknown} value
   * @param {number} minimo
   * @param {number} maximo
   * @returns {boolean}
   */
  function isIntegerInRange(value, minimo, maximo) {
    return (
      isFiniteNumber(value) &&
      Math.floor(/** @type {number} */ (value)) === value &&
      /** @type {number} */ (value) >= minimo &&
      /** @type {number} */ (value) <= maximo
    );
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Jump desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Jump ausente.", { field: key });
      }
    }
    if (!isFiniteNumber(args.height) || /** @type {number} */ (args.height) <= 0 || /** @type {number} */ (args.height) > 100000) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Altura de salto invalida.", { field: "height" });
    }
    // Quatro frames e o minimo para existir chao, apice e chao com um frame de
    // folga; abaixo disso o "salto" seria um degrau.
    if (!isIntegerInRange(args.durationFrames, 4, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao de salto invalida.", { field: "durationFrames" });
    }
    if (
      args.direction !== "up" &&
      args.direction !== "down" &&
      args.direction !== "left" &&
      args.direction !== "right"
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Direcao de salto invalida.", { field: "direction" });
    }
    if (!isFiniteNumber(args.squashStretch) || /** @type {number} */ (args.squashStretch) < 0 || /** @type {number} */ (args.squashStretch) > 90) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Squash/stretch invalido.", { field: "squashStretch" });
    }
    if (!isIntegerInRange(args.anticipationFrames, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Antecipacao invalida.", { field: "anticipationFrames" });
    }
    // A antecipacao consome parte da janela; se ela nao deixar ao menos dois
    // frames para subir e descer, o arco nao existe.
    if (/** @type {number} */ (args.anticipationFrames) > /** @type {number} */ (args.durationFrames) - 4) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Antecipacao maior que a janela do salto.", {
        field: "anticipationFrames"
      });
    }
    if (!isIntegerInRange(args.staggerFrames, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Stagger invalido.", { field: "staggerFrames" });
    }
    return null;
  }

  /**
   * A cadeia de pais nao pode girar nem escalar, senao o deslocamento em
   * pixels da composicao nao corresponde ao deslocamento no espaco onde
   * Position vive.
   *
   * @param {unknown} layer
   * @returns {boolean}
   */
  function parentChainIsAxisAligned(layer) {
    var atual = /** @type {any} */ (layer).parent;
    var guarda = 0;
    while (atual && guarda < 64) {
      var matriz = MotionTransform.linearMatrix(atual);
      var i;
      for (i = 0; i < 9; i += 1) {
        var esperado = i === 0 || i === 4 || i === 8 ? 1 : 0;
        if (Math.abs(/** @type {number} */ (matriz[i]) - esperado) > 0.000001) return false;
      }
      atual = atual.parent;
      guarda += 1;
    }
    return true;
  }

  /**
   * @param {unknown} layer
   * @param {string} matchName
   * @returns {Property|null}
   */
  function transformProperty(layer, matchName) {
    var grupo = /** @type {any} */ (layer).property(MN_TRANSFORM);
    if (!grupo) return null;
    var property = grupo.property(matchName);
    return property instanceof Property ? property : null;
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
      var layer = selecionadas[i];
      var position = transformProperty(layer, MN_POSITION);
      if (!position || position.canVaryOverTime !== true) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada sem Position animavel.", {
          selectionIndex: i
        });
      }
      // Position com dimensoes separadas nao e uma propriedade so, e gravar nela
      // como se fosse produziria valor de tamanho errado.
      if (
        position.propertyValueType !== PropertyValueType.TwoD_SPATIAL &&
        position.propertyValueType !== PropertyValueType.ThreeD_SPATIAL
      ) {
        return failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Position com dimensoes separadas nao e suportada pelo Jump.",
          { selectionIndex: i }
        );
      }
      if (position.expression !== "" && position.expressionEnabled === true) {
        return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Position contem expressao ativa.", {
          selectionIndex: i
        });
      }
      if (!parentChainIsAxisAligned(layer)) {
        return failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Camada com pai girado ou escalado esta fora do escopo do Jump.",
          { selectionIndex: i }
        );
      }
      if (/** @type {number} */ (args.squashStretch) > 0) {
        var scale = transformProperty(layer, MN_SCALE);
        if (!scale || scale.canVaryOverTime !== true) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Squash/stretch precisa de Scale animavel.", {
            selectionIndex: i
          });
        }
        if (scale.expression !== "" && scale.expressionEnabled === true) {
          return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Scale contem expressao ativa.", {
            selectionIndex: i
          });
        }
      }
    }
    return null;
  }

  /**
   * Deslocamento do apice, em pixels da composicao. Y cresce para baixo no After
   * Effects, entao "para cima" e Y negativo.
   *
   * @param {string} direction
   * @param {number} height
   * @param {number} dimensoes
   * @returns {number[]}
   */
  function apexOffset(direction, height, dimensoes) {
    var d = [];
    var i;
    for (i = 0; i < dimensoes; i += 1) d.push(0);
    if (direction === "up") d[1] = -height;
    else if (direction === "down") d[1] = height;
    else if (direction === "left") d[0] = -height;
    else d[0] = height;
    return d;
  }

  /** @param {unknown} base @param {number[]} offset @returns {number[]} */
  function somar(base, offset) {
    var origem = /** @type {number[]} */ (base);
    var resultado = [];
    var i;
    for (i = 0; i < offset.length; i += 1) {
      resultado.push(/** @type {number} */ (origem[i] || 0) + /** @type {number} */ (offset[i]));
    }
    return resultado;
  }

  /** @param {number} quantidade @returns {number[]} */
  function zeros(quantidade) {
    var valores = [];
    var i;
    for (i = 0; i < quantidade; i += 1) valores.push(0);
    return valores;
  }

  /**
   * @param {number} tempo
   * @param {unknown} valor
   * @param {number} influenciaEntrada
   * @param {number} influenciaSaida
   * @param {number} dimensoes
   * @param {boolean} espacial
   * @returns {MotionCapturedKey}
   */
  function makeKey(tempo, valor, influenciaEntrada, influenciaSaida, dimensoes, espacial) {
    var inEase = [];
    var outEase = [];
    var i;
    for (i = 0; i < dimensoes; i += 1) {
      inEase.push({ speed: 0, influence: influenciaEntrada });
      outEase.push({ speed: 0, influence: influenciaSaida });
    }
    return /** @type {MotionCapturedKey} */ ({
      time: tempo,
      value: valor,
      inInterpolation: KeyframeInterpolationType.BEZIER,
      outInterpolation: KeyframeInterpolationType.BEZIER,
      inEase: inEase,
      outEase: outEase,
      temporalContinuous: false,
      temporalAutoBezier: false,
      roving: false,
      selected: false,
      // Tangente espacial zerada deixa o arco por conta do ease temporal, que e
      // quem descreve a gravidade aqui. Nao pode ser null: restoreProperty
      // recusa snapshot de propriedade espacial sem o bloco.
      spatial: espacial
        ? { inTangent: zeros(dimensoes), outTangent: zeros(dimensoes), continuous: false, autoBezier: false }
        : null,
      label: 0
    });
  }

  /**
   * Funde as keys novas no snapshot, substituindo quem cair no mesmo tempo.
   * Dois keyframes no mesmo instante nao existem no After Effects, e deixar os
   * dois no array faria `restoreProperty` falhar na validacao de tempos.
   *
   * @param {MotionPropertySnapshot} snapshot
   * @param {MotionCapturedKey[]} novas
   * @returns {void}
   */
  function mergeKeys(snapshot, novas) {
    var i;
    var j;
    for (i = 0; i < novas.length; i += 1) {
      var nova = novas[i];
      if (!nova) continue;
      var conflito = -1;
      for (j = 0; j < snapshot.keys.length; j += 1) {
        var existente = snapshot.keys[j];
        if (existente && Math.abs(existente.time - nova.time) < 0.0000001) {
          conflito = j;
          break;
        }
      }
      if (conflito >= 0) snapshot.keys[conflito] = nova;
      else snapshot.keys.push(nova);
    }
    snapshot.keys.sort(function (a, b) {
      return a.time - b.time;
    });
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    var height = /** @type {number} */ (args.height);
    var durationFrames = /** @type {number} */ (args.durationFrames);
    var direction = /** @type {string} */ (args.direction);
    var squashStretch = /** @type {number} */ (args.squashStretch);
    var anticipationFrames = /** @type {number} */ (args.anticipationFrames);
    var staggerFrames = /** @type {number} */ (args.staggerFrames);

    var frame = comp.frameDuration;
    var anteriores = [];
    var jumpedLayers = 0;
    var i;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var layer = selecionadas[i];
        var position = /** @type {Property} */ (transformProperty(layer, MN_POSITION));

        var inicio = comp.time + i * staggerFrames * frame;
        var decolagem = inicio + anticipationFrames * frame;
        var pouso = inicio + durationFrames * frame;
        var apice = decolagem + (pouso - decolagem) / 2;

        var baseValor = position.numKeys > 0 ? position.valueAtTime(inicio, true) : position.value;
        var dimensoes = /** @type {number[]} */ (baseValor).length;
        var offset = apexOffset(direction, height, dimensoes);

        var snapshotPosition = MotionKeyframes.captureProperty(position);
        anteriores.push(MotionKeyframes.captureProperty(position));

        var keysPosition = [makeKey(inicio, baseValor, INFLUENCIA_CHAO, INFLUENCIA_CHAO, dimensoes, true)];
        if (anticipationFrames > 0) {
          // Durante a antecipacao a camada continua no chao: quem agacha e o
          // Scale. Assim o primeiro e o ultimo valor de Position sao o mesmo,
          // que e o criterio de aceite.
          keysPosition.push(makeKey(decolagem, baseValor, INFLUENCIA_CHAO, INFLUENCIA_CHAO, dimensoes, true));
        }
        keysPosition.push(makeKey(apice, somar(baseValor, offset), INFLUENCIA_APICE, INFLUENCIA_APICE, dimensoes, true));
        keysPosition.push(makeKey(pouso, baseValor, INFLUENCIA_CHAO, INFLUENCIA_CHAO, dimensoes, true));

        mergeKeys(snapshotPosition, keysPosition);
        MotionKeyframes.restoreProperty(snapshotPosition, null);

        if (squashStretch > 0) {
          var scale = /** @type {Property} */ (transformProperty(layer, MN_SCALE));
          var escalaBase = /** @type {number[]} */ (scale.numKeys > 0 ? scale.valueAtTime(inicio, true) : scale.value);
          var dimEscala = escalaBase.length;

          var snapshotScale = MotionKeyframes.captureProperty(scale);
          anteriores.push(MotionKeyframes.captureProperty(scale));

          /** @param {number} horizontal @param {number} vertical @returns {number[]} */
          function escalar(horizontal, vertical) {
            var valor = [];
            var k;
            for (k = 0; k < dimEscala; k += 1) valor.push(escalaBase[k]);
            valor[0] = /** @type {number} */ (escalaBase[0]) * (1 + horizontal / 100);
            valor[1] = /** @type {number} */ (escalaBase[1]) * (1 + vertical / 100);
            return /** @type {number[]} */ (valor);
          }

          var keysScale = [makeKey(inicio, escalar(0, 0), INFLUENCIA_CHAO, INFLUENCIA_CHAO, dimEscala, false)];
          if (anticipationFrames > 0) {
            // Agachar: mais largo e mais baixo.
            keysScale.push(
              makeKey(decolagem, escalar(squashStretch, -squashStretch), INFLUENCIA_APICE, INFLUENCIA_CHAO, dimEscala, false)
            );
          }
          // Esticar logo depois de sair do chao, voltar ao normal no apice,
          // esticar de novo na queda e recuperar exatamente no pouso: toda a
          // deformacao cabe dentro da janela declarada.
          keysScale.push(
            makeKey(
              decolagem + frame,
              escalar(-squashStretch, squashStretch),
              INFLUENCIA_CHAO,
              INFLUENCIA_APICE,
              dimEscala,
              false
            )
          );
          keysScale.push(makeKey(apice, escalar(0, 0), INFLUENCIA_APICE, INFLUENCIA_APICE, dimEscala, false));
          keysScale.push(
            makeKey(pouso - frame, escalar(-squashStretch, squashStretch), INFLUENCIA_APICE, INFLUENCIA_CHAO, dimEscala, false)
          );
          keysScale.push(makeKey(pouso, escalar(0, 0), INFLUENCIA_CHAO, INFLUENCIA_CHAO, dimEscala, false));

          mergeKeys(snapshotScale, keysScale);
          MotionKeyframes.restoreProperty(snapshotScale, null);
        }

        jumpedLayers += 1;
      }
    } catch (jumpError) {
      var rollbackFailed = false;
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (anterior) MotionKeyframes.restoreProperty(anterior, null);
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("O salto falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("O salto falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: jumpedLayers > 0,
      warnings: [],
      data: { jumpedLayers: jumpedLayers }
    };
  }

  MotionRegistry.register("ae.animate.jump", { preflight: preflight, run: run });
})();
