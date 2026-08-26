/**
 * `ae.anchor.align` move o anchor point para um dos nove pontos do bounds.
 *
 * ## A compensacao, por matriz e nao por expressao
 *
 * A §14.5 e explicita: nao usar expressao temporaria quando a operacao pode ser
 * resolvida por matriz. Aqui pode, e a derivacao cabe em tres linhas.
 *
 * O transform leva o espaco da camada ao espaco do PAI por
 *
 *   p = posicao + R(t) . S . (v - ancora)
 *
 * Para a aparencia nao mudar quando a ancora vai de A para A':
 *
 *   posicao' + R.S.(v - A')  =  posicao + R.S.(v - A)
 *   posicao'                 =  posicao + R.S.(A' - A)
 *
 * O transform do pai **cancela**: `posicao` ja esta em espaco do pai, e os dois
 * lados passam pela mesma matriz de pai. A compensacao e inteiramente local, e
 * vale para qualquer profundidade de parentesco.
 *
 * ## Escopo recusado de proposito
 *
 * Camadas **3D** sao recusadas: a ancora tem tres componentes, a rotacao tem
 * tres eixos mais orientation, e a derivacao acima precisa de uma matriz 4x4
 * que ainda nao foi verificada em host. Os modos **Convex** e **Concave**
 * dependem de analise de path — convex hull e sinal de cross product — e sao
 * corpo de trabalho proprio.
 */
(function () {
  var REQUIRED_ARGS = {
    gridPoint: true,
    mode: true,
    boundsSource: true,
    timeMode: true,
    fixedTime: true,
    includeExtents: true,
    preserveVisualPosition: true,
    randomSeed: true,
    preview: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    anchorPoint: "ADBE Anchor Point",
    position: "ADBE Position",
    scale: "ADBE Scale",
    rotation: "ADBE Rotate Z"
  };

  /** Os nove pontos, em fracoes do bounds.
   * @type {Record<string, number[]>} */
  var GRADE = {
    topLeft: [0, 0],
    topCenter: [0.5, 0],
    topRight: [1, 0],
    midLeft: [0, 0.5],
    center: [0.5, 0.5],
    midRight: [1, 0.5],
    bottomLeft: [0, 1],
    bottomCenter: [0.5, 1],
    bottomRight: [1, 1]
  };

  /** Ponto oposto em relacao ao centro, para o modo Reverse.
   * @type {Record<string, string>} */
  var OPOSTO = {
    topLeft: "bottomRight",
    topCenter: "bottomCenter",
    topRight: "bottomLeft",
    midLeft: "midRight",
    center: "center",
    midRight: "midLeft",
    bottomLeft: "topRight",
    bottomCenter: "topCenter",
    bottomRight: "topLeft"
  };

  var ORDEM_GRADE = [
    "topLeft", "topCenter", "topRight",
    "midLeft", "center", "midRight",
    "bottomLeft", "bottomCenter", "bottomRight"
  ];

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /**
   * Escolha reproduzivel entre os nove pontos.
   *
   * Mistura semente e indice da camada num inteiro de 32 bits: a mesma semente
   * com a mesma selecao devolve sempre a mesma grade, e camadas diferentes
   * recebem pontos diferentes. Sem misturar o indice, "aleatorio" moveria todas
   * as camadas para o mesmo canto.
   *
   * @param {number} seed @param {number} layerIndex @returns {string}
   */
  function pontoAleatorio(seed, layerIndex) {
    var x = (seed * 73856093) ^ (layerIndex * 19349663);
    // `>>> 0` mantem o valor sem sinal; sem isso o modulo devolveria negativo.
    x = (x ^ (x >>> 13)) >>> 0;
    x = (x * 1274126177) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return /** @type {string} */ (ORDEM_GRADE[x % ORDEM_GRADE.length]);
  }

  /** @param {Record<string, unknown>} args @param {boolean} esperaPreview @returns {MotionCommandFailure|null} */
  function validateArgs(args, esperaPreview) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de anchor desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de anchor ausente.", {
          field: key
        });
      }
    }

    if (!Object.prototype.hasOwnProperty.call(GRADE, /** @type {string} */ (args.gridPoint))) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Ponto da grade invalido.", {
        field: "gridPoint"
      });
    }
    if (args.mode !== "normal" && args.mode !== "reverse" && args.mode !== "random") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de anchor invalido.", {
        field: "mode"
      });
    }
    // `visual` e a unica fonte implementada. Recusar as outras e melhor que
    // aceitar e calcular sobre o bounds errado sem avisar.
    if (args.boundsSource !== "visual") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fonte de bounds nao implementada.", {
        field: "boundsSource"
      });
    }
    if (args.timeMode !== "currentTime" && args.timeMode !== "fixed") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de tempo invalido.", {
        field: "timeMode"
      });
    }
    if (
      typeof args.fixedTime !== "number" ||
      !isFinite(/** @type {number} */ (args.fixedTime)) ||
      /** @type {number} */ (args.fixedTime) < 0 ||
      /** @type {number} */ (args.fixedTime) > 10800
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo fixo invalido.", {
        field: "fixedTime"
      });
    }
    if (args.timeMode === "currentTime" && args.fixedTime !== 0) {
      // Campo inativo e canonico, e nao um valor silenciosamente ignorado.
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo fixo inativo precisa ser zero.", {
        field: "fixedTime"
      });
    }
    if (typeof args.includeExtents !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de extents invalido.", {
        field: "includeExtents"
      });
    }
    if (typeof args.preserveVisualPosition !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de preservacao invalido.", {
        field: "preserveVisualPosition"
      });
    }
    if (
      typeof args.randomSeed !== "number" ||
      !isFinite(/** @type {number} */ (args.randomSeed)) ||
      Math.floor(/** @type {number} */ (args.randomSeed)) !== args.randomSeed ||
      /** @type {number} */ (args.randomSeed) < 0 ||
      /** @type {number} */ (args.randomSeed) > 2147483647
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente invalida.", {
        field: "randomSeed"
      });
    }
    if (typeof args.preview !== "boolean" || args.preview !== esperaPreview) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo preview nao corresponde ao comando.", {
        field: "preview",
        expected: esperaPreview
      });
    }

    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @param {boolean} esperaPreview
   * @returns {{error: MotionCommandFailure|null, itens: Array<Record<string, unknown>>}}
   */
  function prepare(args, esperaPreview) {
    var argsError = validateArgs(args, esperaPreview);
    if (argsError) return { error: argsError, itens: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        itens: []
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || typeof selecionadas.length !== "number" || selecionadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        itens: []
      };
    }

    var tempo = args.timeMode === "fixed" ? /** @type {number} */ (args.fixedTime) : comp.time;
    var itens = [];
    var i;

    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = /** @type {Layer} */ (selecionadas[i]);
      if (!camada) continue;

      if (camada.threeDLayer === true) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "Camada 3D: a compensacao em tres eixos ainda nao esta implementada.",
            { layerIndex: camada.index }
          ),
          itens: []
        };
      }

      var retangulo;
      try {
        retangulo = camada.sourceRectAtTime(tempo, /** @type {boolean} */ (args.includeExtents));
      } catch (rectError) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "Esta camada nao expoe um retangulo de origem.",
            { layerIndex: camada.index }
          ),
          itens: []
        };
      }

      var ponto = /** @type {string} */ (args.gridPoint);
      if (args.mode === "reverse") {
        ponto = /** @type {string} */ (OPOSTO[ponto]);
      } else if (args.mode === "random") {
        ponto = pontoAleatorio(/** @type {number} */ (args.randomSeed), camada.index);
      }

      var fracao = /** @type {number[]} */ (GRADE[ponto]);
      var novaAncora = [
        retangulo.left + retangulo.width * /** @type {number} */ (fracao[0]),
        retangulo.top + retangulo.height * /** @type {number} */ (fracao[1])
      ];

      var grupo = camada.property(MN.transform);
      var propAncora = grupo.property(MN.anchorPoint);
      var propPosicao = grupo.property(MN.position);
      var propEscala = grupo.property(MN.scale);
      var propRotacao = grupo.property(MN.rotation);

      // Ancora animada nao tem um valor unico para mover: qual keyframe
      // deveria ir para o canto? Recusar e melhor que escolher um por conta.
      if (propAncora.numKeys > 0) {
        return {
          error: failure(
            MotionContracts.ERROR.KEYFRAME_CONFLICT,
            "A ancora desta camada e animada.",
            { layerIndex: camada.index }
          ),
          itens: []
        };
      }

      // A compensacao e `R.S.(A' - A)`. Com escala ou rotacao animadas esse
      // vetor muda a cada quadro, e um deslocamento constante da posicao
      // acertaria um instante e erraria todos os outros — em silencio.
      if (
        args.preserveVisualPosition === true &&
        (propEscala.numKeys > 0 || propRotacao.numKeys > 0)
      ) {
        return {
          error: failure(
            MotionContracts.ERROR.KEYFRAME_CONFLICT,
            "Escala ou rotacao animada: a compensacao nao seria constante.",
            { layerIndex: camada.index }
          ),
          itens: []
        };
      }

      var ancoraAtual = /** @type {number[]} */ (propAncora.value);
      var posicaoAtual = /** @type {number[]} */ (propPosicao.value);
      var escala = /** @type {number[]} */ (propEscala.value);
      var rotacao = /** @type {number} */ (propRotacao.value);

      itens.push({
        camada: camada,
        grupo: grupo,
        posicaoAnimada: propPosicao.numKeys > 0,
        ponto: ponto,
        ancoraAntes: [
          /** @type {number} */ (ancoraAtual[0]),
          /** @type {number} */ (ancoraAtual[1])
        ],
        ancoraDepois: novaAncora,
        posicaoAntes: [
          /** @type {number} */ (posicaoAtual[0]),
          /** @type {number} */ (posicaoAtual[1])
        ],
        escala: [/** @type {number} */ (escala[0]), /** @type {number} */ (escala[1])],
        rotacao: rotacao
      });
    }

    if (itens.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        itens: []
      };
    }

    return { error: null, itens: itens };
  }

  /**
   * O vetor `R(t) . S . (A' - A)`, em espaco do pai.
   *
   * E o mesmo para a propriedade estatica e para cada keyframe: escala e
   * rotacao sao estaticas quando a compensacao esta ligada, garantido no
   * preflight.
   *
   * @param {Record<string, unknown>} item
   * @returns {number[]}
   */
  function deslocamento(item) {
    var antes = /** @type {number[]} */ (item.ancoraAntes);
    var depois = /** @type {number[]} */ (item.ancoraDepois);
    var escala = /** @type {number[]} */ (item.escala);

    var dx = (/** @type {number} */ (depois[0]) - /** @type {number} */ (antes[0])) *
      /** @type {number} */ (escala[0]) / 100;
    var dy = (/** @type {number} */ (depois[1]) - /** @type {number} */ (antes[1])) *
      /** @type {number} */ (escala[1]) / 100;

    var rad = /** @type {number} */ (item.rotacao) * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);

    return [dx * cos - dy * sin, dx * sin + dy * cos];
  }

  /**
   * Soma `sinal * delta` a cada keyframe da propriedade.
   *
   * Usado na ida com `sinal = 1` e no rollback com `-1`. Nenhum keyframe e
   * criado, removido ou reordenado: so os valores andam em bloco, e por isso
   * a volta e exata sem precisar de snapshot.
   *
   * @param {Property} propriedade @param {number[]} delta @param {number} sinal
   * @returns {void}
   */
  function deslocaKeyframes(propriedade, delta, sinal) {
    var k;
    for (k = 1; k <= propriedade.numKeys; k += 1) {
      var valor = /** @type {number[]} */ (propriedade.keyValue(k));
      propriedade.setValueAtKey(k, [
        /** @type {number} */ (valor[0]) + /** @type {number} */ (delta[0]) * sinal,
        /** @type {number} */ (valor[1]) + /** @type {number} */ (delta[1]) * sinal
      ]);
    }
  }

  /**
   * Posicao compensada: `posicao + R(t) . S . (A' - A)`.
   *
   * @param {Record<string, unknown>} item
   * @returns {number[]}
   */
  function posicaoCompensada(item) {
    var posicao = /** @type {number[]} */ (item.posicaoAntes);
    var delta = deslocamento(item);
    return [
      /** @type {number} */ (posicao[0]) + /** @type {number} */ (delta[0]),
      /** @type {number} */ (posicao[1]) + /** @type {number} */ (delta[1])
    ];
  }

  /** @param {Array<Record<string, unknown>>} itens @returns {Record<string, unknown>} */
  function planoPublico(itens) {
    var alvos = [];
    var mudam = 0;
    var i;
    for (i = 0; i < itens.length; i += 1) {
      var item = /** @type {Record<string, unknown>} */ (itens[i]);
      var antes = /** @type {number[]} */ (item.ancoraAntes);
      var depois = /** @type {number[]} */ (item.ancoraDepois);
      var mudou =
        /** @type {number} */ (antes[0]) !== /** @type {number} */ (depois[0]) ||
        /** @type {number} */ (antes[1]) !== /** @type {number} */ (depois[1]);
      if (mudou) mudam += 1;

      alvos.push({
        layerIndex: /** @type {Layer} */ (item.camada).index,
        layerName: /** @type {Layer} */ (item.camada).name,
        gridPoint: item.ponto,
        anchorBefore: antes,
        anchorAfter: depois,
        changed: mudou
      });
    }
    return { targetCount: itens.length, changedCount: mudam, targets: alvos };
  }

  MotionRegistry.register("ae.anchor.align.preview", {
    preflight: function (args) {
      return prepare(args, true).error;
    },
    run: function (args) {
      var prepared = prepare(args, true);
      if (prepared.error) throw new Error("Preview de anchor ficou invalido.");
      return { changed: false, warnings: [], data: planoPublico(prepared.itens) };
    }
  });

  MotionRegistry.register("ae.anchor.align", {
    preflight: function (args) {
      return prepare(args, false).error;
    },

    run: function (args) {
      var prepared = prepare(args, false);
      if (prepared.error) throw new Error("Anchor ficou invalido depois do preflight.");

      var preservar = args.preserveVisualPosition === true;
      var tocadas = [];
      var aplicadas = 0;
      var i;

      try {
        for (i = 0; i < prepared.itens.length; i += 1) {
          var item = /** @type {Record<string, unknown>} */ (prepared.itens[i]);
          var antes = /** @type {number[]} */ (item.ancoraAntes);
          var depois = /** @type {number[]} */ (item.ancoraDepois);
          if (antes[0] === depois[0] && antes[1] === depois[1]) continue;

          var grupo = /** @type {PropertyGroup} */ (item.grupo);
          var propPosicao = grupo.property(MN.position);

          tocadas.push(item);

          // Compensa ANTES de mover a ancora: a conta usa a ancora antiga.
          if (preservar) {
            if (item.posicaoAnimada === true) {
              // `setValue` levanta erro com keyframes. O deslocamento e
              // constante — escala e rotacao sao estaticas aqui, garantido no
              // preflight —, entao somar o mesmo vetor em cada keyframe
              // preserva a animacao inteira.
              deslocaKeyframes(propPosicao, deslocamento(item), 1);
            } else {
              propPosicao.setValue(posicaoCompensada(item));
            }
          }
          grupo.property(MN.anchorPoint).setValue(depois);
          aplicadas += 1;
        }
      } catch (applyError) {
        var rollbackFalhou = false;
        for (i = tocadas.length - 1; i >= 0; i -= 1) {
          try {
            var desfazer = /** @type {Record<string, unknown>} */ (tocadas[i]);
            var g = /** @type {PropertyGroup} */ (desfazer.grupo);
            g.property(MN.anchorPoint).setValue(desfazer.ancoraAntes);
            // Desfazer um deslocamento constante e subtrair o mesmo vetor.
            // Nao precisa de snapshot: nenhum keyframe foi criado, removido
            // ou reordenado — so os valores andaram em bloco.
            if (desfazer.posicaoAnimada === true) {
              if (preservar) {
                deslocaKeyframes(g.property(MN.position), deslocamento(desfazer), -1);
              }
            } else {
              g.property(MN.position).setValue(desfazer.posicaoAntes);
            }
          } catch (restoreError) {
            rollbackFalhou = true;
          }
        }
        if (rollbackFalhou) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de anchor falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      var plano = planoPublico(prepared.itens);
      plano.appliedCount = aplicadas;
      return { changed: aplicadas > 0, warnings: [], data: plano };
    }
  });
}());
