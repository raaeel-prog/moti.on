/**
 * `ae.layer.create-null` cria um null posicionado e, opcionalmente, parenteia a
 * selecao a ele.
 *
 * A decisao estrutural deste comando: **o posicionamento nao e calculado no
 * ExtendScript.** Compor matrizes de transform a mao daria uma matematica que
 * ninguem consegue verificar contra 3D, parents aninhados e camadas animadas —
 * e que erraria em silencio. Em vez disso o comando escreve uma expressao
 * temporaria na posicao do null, le o valor que o After Effects avaliou, apaga a
 * expressao e assa o numero. A matematica passa a ser a nativa da Adobe.
 *
 * A semantica de parentesco vem medida de
 * docs/research/after-effects-parenting.md: `parent =` preserva o world
 * transform, `setParentWithJump` nao.
 */
(function () {
  var REQUIRED_ARGS = {
    placement: true,
    dimension: true,
    parentSelected: true,
    preserveWorldTransform: true,
    size: true,
    label: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position"
  };

  /** Placements que precisam de pelo menos uma camada selecionada. */
  var PRECISA_SELECAO = { averageAnchor: true, selectionBounds: true };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function isInteiroEntre(value, min, max) {
    return (
      typeof value === "number" &&
      isFinite(value) &&
      Math.floor(value) === value &&
      value >= min &&
      value <= max
    );
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de null desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de null ausente.", {
          field: key
        });
      }
    }

    if (
      args.placement !== "compCenter" &&
      args.placement !== "averageAnchor" &&
      args.placement !== "selectionBounds"
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Posicionamento invalido.", {
        field: "placement"
      });
    }
    if (args.dimension !== "2d" && args.dimension !== "3d") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Dimensao invalida.", {
        field: "dimension"
      });
    }
    if (typeof args.parentSelected !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de parentear invalido.", {
        field: "parentSelected"
      });
    }
    if (typeof args.preserveWorldTransform !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Preservacao de transform invalida.", {
        field: "preserveWorldTransform"
      });
    }
    if (!isInteiroEntre(args.size, 1, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tamanho de null invalido.", {
        field: "size"
      });
    }
    // `label` e o indice de cor de rotulo do After Effects, 0 a 16 — nao o nome
    // da camada. 0 significa sem rotulo.
    if (!isInteiroEntre(args.label, 0, 16)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Cor de rotulo invalida.", {
        field: "label"
      });
    }

    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, comp: CompItem|null, selecionadas: Layer[]}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, comp: null, selecionadas: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        comp: null,
        selecionadas: []
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);

    var brutas = comp.selectedLayers;
    var selecionadas = [];
    var i;
    if (brutas && typeof brutas.length === "number") {
      for (i = 0; i < brutas.length; i += 1) {
        var camada = brutas[i];
        if (camada) selecionadas.push(camada);
      }
    }

    // `compCenter` funciona com zero camadas, como a §7 pede. Os outros dois
    // medem a selecao, entao sem selecao nao ha o que medir.
    if (
      Object.prototype.hasOwnProperty.call(PRECISA_SELECAO, /** @type {string} */ (args.placement)) &&
      selecionadas.length === 0
    ) {
      return {
        error: failure(
          MotionContracts.ERROR.NO_SELECTION,
          "Este posicionamento mede as camadas selecionadas.",
          { field: "placement" }
        ),
        comp: null,
        selecionadas: []
      };
    }
    if (selecionadas.length > 500) {
      return {
        error: failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Selecao grande demais para este comando.",
          { selectionCount: selecionadas.length }
        ),
        comp: null,
        selecionadas: []
      };
    }
    if (args.parentSelected === true && selecionadas.length === 0) {
      return {
        error: failure(
          MotionContracts.ERROR.NO_SELECTION,
          "Nenhuma camada selecionada para parentear.",
          { field: "parentSelected" }
        ),
        comp: null,
        selecionadas: []
      };
    }

    return { error: null, comp: comp, selecionadas: selecionadas };
  }

  /**
   * Usa o motor de expressoes como calculadora e assa o resultado.
   *
   * Os indices sao lidos DEPOIS de o null existir: criar uma camada empurra
   * todas as outras uma posicao para baixo, e uma lista capturada antes
   * apontaria para as camadas erradas.
   *
   * @param {Property} posicao
   * @param {string} fonte
   * @returns {number[]}
   */
  function avalia(posicao, fonte) {
    try {
      posicao.expression = fonte;
      if (typeof posicao.expressionError === "string" && posicao.expressionError !== "") {
        throw new Error("After Effects recusou a sonda de posicionamento.");
      }
      var valor = posicao.valueAtTime(0, false);
      if (
        Object.prototype.toString.call(valor) !== "[object Array]" ||
        /** @type {number[]} */ (valor).length < 2
      ) {
        throw new Error("A sonda de posicionamento nao devolveu coordenadas.");
      }
      return /** @type {number[]} */ (valor);
    } finally {
      // Sempre limpa, inclusive no caminho de erro: um null com expressao
      // temporaria sobrevivente seria pior que um null mal posicionado.
      try {
        posicao.expression = "";
      } catch (limpaError) {
        // Nada a fazer; o rollback remove a camada inteira.
      }
    }
  }

  MotionRegistry.register("ae.layer.create-null", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Create Null ficou invalido depois do preflight.");

      var comp = /** @type {CompItem} */ (prepared.comp);
      var selecionadas = prepared.selecionadas;
      var nulo = comp.layers.addNull();
      var parenteadas = 0;
      var i;

      try {
        nulo.source.width = /** @type {number} */ (args.size);
        nulo.source.height = /** @type {number} */ (args.size);
        if (/** @type {number} */ (args.label) > 0) {
          nulo.label = /** @type {number} */ (args.label);
        }
        if (args.dimension === "3d") {
          nulo.threeDLayer = true;
        }

        var transform = nulo.property(MN.transform);
        var posicao = transform.property(MN.position);

        if (args.placement === "compCenter") {
          posicao.setValue(
            args.dimension === "3d"
              ? [comp.width / 2, comp.height / 2, 0]
              : [comp.width / 2, comp.height / 2]
          );
        } else {
          // Indices lidos agora, com o null ja no topo da pilha.
          var indices = [];
          for (i = 0; i < selecionadas.length; i += 1) {
            indices.push(/** @type {Layer} */ (selecionadas[i]).index);
          }

          var fonte = args.placement === "selectionBounds"
            ? MotionExpressions.renderBoundsCenterProbe(indices)
            : MotionExpressions.renderAnchorAverageProbe(indices);

          var medido = avalia(posicao, fonte);
          posicao.setValue(
            args.dimension === "3d"
              ? [medido[0], medido[1], medido.length > 2 ? medido[2] : 0]
              : [medido[0], medido[1]]
          );
        }

        if (args.parentSelected === true) {
          var preservar = args.preserveWorldTransform === true;
          for (i = 0; i < selecionadas.length; i += 1) {
            var filha = /** @type {Layer} */ (selecionadas[i]);
            // O null e novo: nao pode ser descendente de ninguem, entao nao ha
            // ciclo possivel. So a propria camada precisa ser evitada.
            if (filha === nulo) continue;
            if (preservar) {
              filha.parent = nulo;
            } else {
              filha.setParentWithJump(nulo);
            }
            parenteadas += 1;
          }
        }
      } catch (applyError) {
        // Rollback e remover o null. As camadas parenteadas a ele voltam a nao
        // ter pai quando ele some, e o Undo do host cobre o resto.
        try {
          nulo.remove();
        } catch (removeError) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback do Create Null falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      // O null nasce selecionado, e continua: e o objeto que a pessoa vai mover
      // em seguida. Diferente da caixa de texto, aqui nao existe contrato de
      // no-op para proteger — cada aplicacao cria um null novo de proposito.
      return {
        changed: true,
        warnings: [],
        data: {
          nullIndex: nulo.index,
          nullName: nulo.name,
          parentedCount: parenteadas
        }
      };
    }
  });
}());
