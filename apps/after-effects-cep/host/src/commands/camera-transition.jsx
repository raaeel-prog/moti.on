/**
 * Transicoes de camera (`ae.camera.transition`, CHMS-024).
 *
 * ## Onze presets, nenhuma dependencia externa
 *
 * O criterio de aceite e "11 presets sem dependencia externa". Cada preset e uma
 * linha da tabela abaixo: qual propriedade da camera anda, e quanto. Tudo sai de
 * keyframes na camera nativa — nenhum plug-in de terceiro, nenhum efeito que
 * possa nao existir na instalacao do usuario.
 *
 * ## A curva
 *
 * O CHMS-024 depende do CHMS-018 justamente aqui: a curva que o usuario desenha
 * no editor Bezier vira o ease dos dois keyframes, pela mesma conversao que o
 * `ae.keys.ease.apply` usa. Ela mora em `MotionKeyframes.curveToEase` para as
 * duas ferramentas nao poderem divergir.
 *
 * ## Espaco
 *
 * Os deslocamentos de posicao sao aplicados no espaco onde `Position` da camera
 * vive. Uma camera com pai teria esse espaco girado, entao o comando **recusa**
 * camera parenteada em vez de mover para o lado errado.
 */
(function () {
  /* global Property CameraLayer KeyframeInterpolationType */
  var ALLOWED = {
    preset: true,
    durationFrames: true,
    amount: true,
    curve: true,
    cameraName: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    orientation: "ADBE Orientation",
    rotationZ: "ADBE Rotate Z",
    zoom: "ADBE Camera Zoom"
  };

  /**
   * Os onze presets.
   *
   * `eixo` diz qual componente do vetor anda, ou `null` quando a propriedade e
   * escalar. `sentido` multiplica `amount`, entao um mesmo par de presets — push
   * e pull, crane up e down — e a mesma linha com sinal trocado, e nao duas
   * contas diferentes que poderiam divergir.
   */
  /** @type {Record<string, {propriedade: string, eixo: number|null, sentido: number}>} */
  var PRESETS = {
    pushIn: { propriedade: MN.position, eixo: 2, sentido: 1 },
    pullOut: { propriedade: MN.position, eixo: 2, sentido: -1 },
    truckLeft: { propriedade: MN.position, eixo: 0, sentido: -1 },
    truckRight: { propriedade: MN.position, eixo: 0, sentido: 1 },
    craneUp: { propriedade: MN.position, eixo: 1, sentido: -1 },
    craneDown: { propriedade: MN.position, eixo: 1, sentido: 1 },
    panLeft: { propriedade: MN.orientation, eixo: 1, sentido: -1 },
    panRight: { propriedade: MN.orientation, eixo: 1, sentido: 1 },
    tiltUp: { propriedade: MN.orientation, eixo: 0, sentido: -1 },
    tiltDown: { propriedade: MN.orientation, eixo: 0, sentido: 1 },
    zoomIn: { propriedade: MN.zoom, eixo: null, sentido: 1 }
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

  /** @returns {string[]} */
  function presetNames() {
    var nomes = [];
    var chave;
    for (chave in PRESETS) {
      if (Object.prototype.hasOwnProperty.call(PRESETS, chave)) nomes.push(chave);
    }
    return nomes;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de transicao desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de transicao ausente.", { field: key });
      }
    }
    if (typeof args.preset !== "string" || !Object.prototype.hasOwnProperty.call(PRESETS, args.preset)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Preset de transicao invalido.", {
        field: "preset",
        supported: presetNames()
      });
    }
    if (
      !isFiniteNumber(args.durationFrames) ||
      Math.floor(/** @type {number} */ (args.durationFrames)) !== args.durationFrames ||
      !isInRange(args.durationFrames, 1, 10000)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao invalida.", { field: "durationFrames" });
    }
    // Amplitude zero deixaria dois keyframes identicos: o movimento nao
    // aconteceria e o usuario teria uma animacao inerte sem entender por que.
    if (!isFiniteNumber(args.amount) || args.amount === 0 || !isInRange(args.amount, -1000000, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Amplitude invalida.", { field: "amount" });
    }
    if (typeof args.cameraName !== "string" || args.cameraName.length > 200) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome de camera invalido.", { field: "cameraName" });
    }

    var curva = /** @type {Record<string, unknown>} */ (args.curve);
    if (!curva) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva ausente.", { field: "curve" });
    }
    var componentes = ["x1", "y1", "x2", "y2"];
    var i;
    for (i = 0; i < componentes.length; i += 1) {
      var nome = /** @type {string} */ (componentes[i]);
      if (!isInRange(curva[nome], -10, 10)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva invalida.", { field: "curve." + nome });
      }
    }
    // O X das alcas e fracao do segmento: fora de 0..1 nao descreve um ponto
    // dentro dele, e o After Effects nao teria como representar.
    if (!isInRange(curva.x1, 0, 1) || !isInRange(curva.x2, 0, 1)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Os X da curva ficam entre 0 e 1.", { field: "curve" });
    }
    return null;
  }

  /**
   * Camera pedida pelo nome, ou a primeira da composicao quando o nome vem
   * vazio.
   *
   * @param {CompItem} comp
   * @param {string} nome
   * @returns {Layer|null}
   */
  function findCamera(comp, nome) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (!camada) continue;
      if (typeof CameraLayer === "undefined" || !(camada instanceof CameraLayer)) continue;
      if (nome.length === 0 || camada.name === nome) return camada;
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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = findCamera(comp, /** @type {string} */ (args.cameraName));
    if (!camera) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camera encontrada na composicao.", {
        field: "cameraName"
      });
    }
    if (/** @type {any} */ (camera).parent) {
      // Position da camera vive no espaco do pai: com o pai girado, "para a
      // direita" deixa de ser para a direita na composicao.
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera tem pai; a transicao sairia torta.", null);
    }

    var preset = /** @type {Record<string, unknown>} */ (PRESETS[/** @type {string} */ (args.preset)]);
    var property = transformProperty(camera, /** @type {string} */ (preset.propriedade));
    if (!property) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera nao expoe a propriedade do preset.", {
        property: preset.propriedade
      });
    }
    if (property.expression !== "" && property.expressionEnabled === true) {
      return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A propriedade da camera tem expressao ativa.", null);
    }
    if (property.numKeys > 0) {
      return failure(
        MotionContracts.ERROR.KEYFRAME_CONFLICT,
        "A propriedade da camera ja tem keyframes; a transicao os sobrescreveria.",
        null
      );
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = /** @type {Layer} */ (findCamera(comp, /** @type {string} */ (args.cameraName)));
    var preset = /** @type {Record<string, unknown>} */ (PRESETS[/** @type {string} */ (args.preset)]);
    var property = /** @type {Property} */ (transformProperty(camera, /** @type {string} */ (preset.propriedade)));
    var curva = /** @type {{x1: number, y1: number, x2: number, y2: number}} */ (args.curve);

    var inicio = comp.time;
    var duracaoSegundos = /** @type {number} */ (args.durationFrames) * comp.frameDuration;
    var fim = inicio + duracaoSegundos;
    var delta = /** @type {number} */ (args.amount) * /** @type {number} */ (preset.sentido);

    var valorInicial = property.value;
    var eixo = preset.eixo;

    try {
      /** @type {unknown} */
      var valorFinal;
      /** @type {number[]} */
      var diferencas;

      if (eixo === null) {
        valorFinal = /** @type {number} */ (valorInicial) + delta;
        diferencas = [delta];
      } else {
        var vetor = /** @type {number[]} */ (valorInicial);
        var destino = [];
        diferencas = [];
        var i;
        for (i = 0; i < vetor.length; i += 1) {
          var componente = /** @type {number} */ (vetor[i]);
          var avanco = i === eixo ? delta : 0;
          destino.push(componente + avanco);
          diferencas.push(avanco);
        }
        valorFinal = destino;
      }

      property.setValueAtTime(inicio, valorInicial);
      property.setValueAtTime(fim, valorFinal);
      if (property.numKeys !== 2) {
        throw new Error("After Effects nao criou os dois keyframes da transicao.");
      }

      // A curva do editor vira o ease dos dois keyframes, dimensao a dimensao.
      var easeSaida = [];
      var easeEntrada = [];
      var d;
      for (d = 0; d < diferencas.length; d += 1) {
        var convertido = MotionKeyframes.curveToEase(curva, duracaoSegundos, /** @type {number} */ (diferencas[d]));
        easeSaida.push(new KeyframeEase(convertido.outSpeed, convertido.outInfluence));
        easeEntrada.push(new KeyframeEase(convertido.inSpeed, convertido.inInfluence));
      }

      property.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      property.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      property.setTemporalEaseAtKey(1, easeSaida, easeSaida);
      property.setTemporalEaseAtKey(2, easeEntrada, easeEntrada);
    } catch (transitionError) {
      var rollbackFailed = false;
      try {
        var k;
        for (k = property.numKeys; k >= 1; k -= 1) property.removeKey(k);
        property.setValue(valorInicial);
      } catch (restoreError) {
        rollbackFailed = true;
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("A transicao falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("A transicao de camera falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: true,
      warnings: [],
      data: {
        preset: args.preset,
        cameraName: /** @type {any} */ (camera).name,
        startTime: inicio,
        endTime: fim
      }
    };
  }

  MotionRegistry.register("ae.camera.transition", { preflight: preflight, run: run });
})();
