/**
 * Transicoes de camera (`ae.camera.transition`, CHMS-024).
 *
 * ## ATENCAO: isto NAO e o catalogo do §17
 *
 * Este comando implementa onze **movimentos de camera** — push, truck, crane,
 * pan, tilt, zoom — como keyframes na camera nativa. O §17.1 da spec cataloga
 * outros onze itens, que sao **transicoes** visuais entre planos:
 * `camera.blur-lens`, `camera.blur-gaussian`, `camera.fade-dark`,
 * `camera.fade-light`, `camera.fade-dark-blur-lens`,
 * `camera.fade-light-blur-lens`, `camera.exposure-light`, `camera.distort`,
 * `camera.distort-rotation`, `camera.distort-shake` e
 * `camera.distort-rotation-shake`.
 *
 * Os dois conjuntos tem onze itens por coincidencia, e o comentario anterior
 * deste arquivo dizia que o criterio de aceite do CHMS-024 ("11 presets sem
 * dependencia externa") estava cumprido. Nao esta: nenhuma das onze transicoes
 * do §17.1 existe. O §17.3 pede solid/adjustment layer, camada com a duracao
 * exata da transicao, efeitos resolvidos por matchName e fallback de Lens Blur
 * para Gaussian com aviso visivel — nada disso acontece aqui.
 *
 * A divergencia esta registrada no §17 da spec e presa por
 * `tests/catalogo-de-comandos.test.mjs`. O painel ja e honesto sobre o que
 * entrega: a descricao dele diz "onze movimentos de camera".
 *
 * ## O que este comando faz bem
 *
 * Cada preset e uma linha da tabela abaixo: qual propriedade da camera anda, e
 * quanto. Tudo sai de keyframes na camera nativa — nenhum plug-in de terceiro,
 * nenhum efeito que possa nao existir na instalacao do usuario.
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
    cameraOptions: "ADBE Camera Options Group",
    position: "ADBE Position",
    orientation: "ADBE Orientation",
    rotationZ: "ADBE Rotate Z",
    zoom: "ADBE Camera Zoom",
    focusDistance: "ADBE Camera Focus Distance",
    depthOfField: "ADBE Camera Depth of Field"
  };

  /**
   * Os onze presets classicos. Shots profissionais (Hero Push, Depth Slide,
   * Float Loop...) vivem no motor de camera (ae.camera.shot.*, ADR 0007), com
   * controles vivos e uma unica pose; esta tabela continua sendo keyframe simples.
   *
   * `eixo` diz qual componente do vetor anda, ou `null` quando a propriedade e
   * escalar. `sentido` multiplica `amount`, entao um mesmo par de presets — push
   * e pull, crane up e down — e a mesma linha com sinal trocado.
   */
  /** @type {Record<string, any>} */
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

  /** @param {string} matchName @returns {boolean} */
  function isOpticalProperty(matchName) {
    return matchName === MN.zoom || matchName === MN.focusDistance || matchName === MN.depthOfField;
  }

  /**
   * Detecta se a camera faz parte de um rig Parallax v3 gerenciado pelo Moti.on.
   * No Parallax v3, a camera fica parenteada ao null 3D `rig.master`, que e a
   * unica autoridade de movimento espacial/rotacional, enquanto canais opticos
   * (Zoom, Focus Distance, Depth of Field) continuam na propria camera.
   *
   * @param {CompItem} comp
   * @param {Layer} camera
   * @returns {{master: any, data: any}|null}
   */
  function parallaxRigForCamera(comp, camera) {
    var parent = /** @type {any} */ (camera).parent;
    if (!parent || typeof MotionRigMeta === "undefined" || typeof MotionJson === "undefined") return null;
    var comment = /** @type {any} */ (parent).comment;
    if (typeof comment !== "string" || !MotionRigMeta.has(comment, "parallax.quick")) return null;
    try {
      var start = comment.indexOf(MotionContracts.META_OPEN);
      var end = comment.indexOf(MotionContracts.META_CLOSE);
      if (start < 0 || end <= start) return null;
      var data = /** @type {any} */ (MotionJson.parse(comment.substring(start + MotionContracts.META_OPEN.length, end)));
      if (!data || data.rigType !== "parallax.quick" || data.schemaVersion !== 3) return null;
      if (typeof /** @type {any} */ (camera).id === "number" && typeof data.cameraId === "number" && data.cameraId !== /** @type {any} */ (camera).id) {
        return null;
      }
      if (typeof /** @type {any} */ (comp).id === "number" && typeof data.compId === "number" && data.compId !== /** @type {any} */ (comp).id) {
        return null;
      }
      return { master: parent, data: data };
    } catch (e) {
      return null;
    }
  }

  /**
   * O canal do preset ja escalado por `amount`: delta escalar ou vetor com um eixo.
   *
   * @param {any} preset
   * @param {number} amount
   * @returns {any[]}
   */
  function resolvePresetChannels(preset, amount) {
    var d = amount * /** @type {number} */ (preset.sentido);
    if (preset.eixo === null) return [{ propriedade: preset.propriedade, delta: d, obrigatorio: true }];
    var vec = [0, 0, 0];
    vec[preset.eixo] = d;
    return [{ propriedade: preset.propriedade, delta: vec, obrigatorio: true }];
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
    if (!layer || typeof /** @type {any} */ (layer).property !== "function") return null;
    var grupo = /** @type {any} */ (layer).property(isOpticalProperty(matchName) ? MN.cameraOptions : MN.transform);
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
    var rig = parallaxRigForCamera(comp, camera);
    if (/** @type {any} */ (camera).parent && !rig) {
      // Position da camera vive no espaco do pai: com um pai externo nao
      // gerenciado, "para a direita" deixa de ser para a direita na composicao.
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera tem pai; a transicao sairia torta.", null);
    }
    if (/** @type {any} */ (camera).locked || (rig && rig.master.locked)) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie a camera antes de aplicar.", null);
    }

    var preset = PRESETS[/** @type {string} */ (args.preset)];
    // No Parallax o null master fica no plano focal: girar o master seria uma
    // orbita em volta do fundo, nao um pan. O motor de camera compensa isso.
    if (rig && preset.propriedade === MN.orientation) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Pan e tilt no Parallax usam os shots de camera da aba Parallax.", null);
    }
    var canais = resolvePresetChannels(preset, /** @type {number} */ (args.amount));
    var c;
    for (c = 0; c < canais.length; c += 1) {
      var canal = /** @type {any} */ (canais[c]);
      var alvoCamada = (rig && !isOpticalProperty(canal.propriedade)) ? rig.master : camera;
      var property = transformProperty(alvoCamada, canal.propriedade);
      if (!property) {
        if (canal.obrigatorio) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera nao expoe a propriedade do preset.", {
            property: canal.propriedade
          });
        }
        continue;
      }
      if (property.expression !== "") {
        return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A propriedade da camera tem expressao ativa.", null);
      }
      if (/** @type {any} */ (property).dimensionsSeparated === true) {
        return failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "A camera usa dimensoes separadas. Reuna a posicao antes de aplicar.",
          null
        );
      }
      if (property.numKeys > 0) {
        return failure(
          MotionContracts.ERROR.KEYFRAME_CONFLICT,
          "A propriedade da camera ja tem keyframes; a transicao os sobrescreveria.",
          null
        );
      }
      if (rig && canal.propriedade === MN.position && typeof canal.delta !== "number") {
        var zoomRef = (rig.data.frame && typeof rig.data.frame.zoom === "number") ? rig.data.frame.zoom : 3000;
        var totalDepth = typeof rig.data.totalDepth === "number" ? rig.data.totalDepth : 0;
        var posAtual = /** @type {number[]} */ (property.value);
        var zFinal = (posAtual && typeof posAtual[2] === "number" ? posAtual[2] : 0) + Number(canal.delta[2]);
        if (-totalDepth - zFinal + zoomRef <= zoomRef * 0.1) {
          return failure(
            MotionContracts.ERROR.INVALID_PRESET,
            "O avanco de dolly ultrapassa a camada mais proxima.",
            { field: "amount" }
          );
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
    var camera = /** @type {Layer} */ (findCamera(comp, /** @type {string} */ (args.cameraName)));
    var rig = parallaxRigForCamera(comp, camera);
    var preset = PRESETS[/** @type {string} */ (args.preset)];
    var canais = resolvePresetChannels(preset, /** @type {number} */ (args.amount));
    var curva = /** @type {{x1: number, y1: number, x2: number, y2: number}} */ (args.curve);

    var inicio = comp.time;
    var duracaoSegundos = /** @type {number} */ (args.durationFrames) * comp.frameDuration;
    var fim = inicio + duracaoSegundos;

    /** @type {any[]} */
    var historico = [];
    var comentarioAnterior = rig ? rig.master.comment : null;
    var posInicioRig = null;
    var posFimRig = null;

    try {
      var c;
      for (c = 0; c < canais.length; c += 1) {
        var canal = /** @type {any} */ (canais[c]);
        var alvoCamada = (rig && !isOpticalProperty(canal.propriedade)) ? rig.master : camera;
        var property = transformProperty(alvoCamada, canal.propriedade);
        if (!property) continue;

        var valorInicial = property.value;
        historico.push({
          property: property,
          valorInicial: valorInicial,
          expressaoInicial: property.expression || "",
          expressaoAtiva: Boolean(property.expressionEnabled),
          hadKeys: true
        });

        /** @type {unknown} */
        var valorFinal;
        /** @type {number[]} */
        var diferencas;

        if (typeof canal.delta === "number") {
          var bruto = /** @type {number} */ (valorInicial) + canal.delta;
          if (canal.propriedade === MN.zoom || canal.propriedade === MN.focusDistance) {
            bruto = Math.max(1, bruto);
          }
          valorFinal = bruto;
          diferencas = [/** @type {number} */ (valorFinal) - /** @type {number} */ (valorInicial)];
        } else {
          var vetor = /** @type {number[]} */ (valorInicial);
          var destino = [];
          diferencas = [];
          var i;
          for (i = 0; i < vetor.length; i += 1) {
            var componente = /** @type {number} */ (vetor[i]);
            var avanco = i < canal.delta.length ? /** @type {number} */ (canal.delta[i]) : 0;
            destino.push(componente + avanco);
            diferencas.push(avanco);
          }
          valorFinal = destino;
          if (rig && canal.propriedade === MN.position) {
            posInicioRig = vetor.slice(0);
            posFimRig = destino.slice(0);
          }
        }

        property.setValueAtTime(inicio, valorInicial);
        property.setValueAtTime(fim, valorFinal);
        if (property.numKeys !== 2) {
          throw new Error("After Effects nao criou os dois keyframes da transicao.");
        }

        var easeSaida = [];
        var easeEntrada = [];
        if (/** @type {any} */ (property).isSpatial === true) {
          var distanceSquared = 0;
          for (var axis = 0; axis < diferencas.length; axis += 1) {
            distanceSquared += Number(diferencas[axis]) * Number(diferencas[axis]);
          }
          diferencas = [Math.sqrt(distanceSquared)];
        }
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
      }

      if (rig && posInicioRig && posFimRig) {
        rig.data.motion = {
          preset: args.preset,
          start: posInicioRig,
          end: posFimRig,
          t1: inicio,
          t2: fim
        };
        rig.master.comment = MotionRigMeta.write(rig.master.comment, MotionJson.stringify(rig.data));
      }
    } catch (transitionError) {
      var rollbackFailed = false;
      var h;
      for (h = historico.length - 1; h >= 0; h -= 1) {
        var reg = /** @type {any} */ (historico[h]);
        try {
          if (reg.hadKeys) {
            var k;
            for (k = reg.property.numKeys; k >= 1; k -= 1) reg.property.removeKey(k);
          }
          reg.property.setValue(reg.valorInicial);
          if (typeof reg.property.expression === "string") {
            reg.property.expression = reg.expressaoInicial;
            reg.property.expressionEnabled = reg.expressaoAtiva;
          }
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (rig && comentarioAnterior !== null) {
        try {
          rig.master.comment = comentarioAnterior;
        } catch (commentError) {
          rollbackFailed = true;
        }
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
        targetLayerName: rig ? /** @type {any} */ (rig.master).name : /** @type {any} */ (camera).name,
        startTime: inicio,
        endTime: fim
      }
    };
  }

  MotionRegistry.register("ae.camera.transition", { preflight: preflight, run: run });
})();
