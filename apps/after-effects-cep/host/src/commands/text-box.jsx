/**
 * `ae.text.box` cria uma caixa de forma atras de cada camada de texto
 * selecionada, dimensionada por expressao gerenciada.
 *
 * Diferente dos quatro comandos de expressao, este **cria camadas** em vez de
 * anotar propriedades ja existentes. Isso muda o rollback: nao ha estado
 * anterior para restaurar numa propriedade, ha uma camada para remover.
 *
 * Toda estrutura e enderecada por `matchName` — os nomes de exibicao voltam
 * localizados no host, entao "Tamanho" num After Effects em portugues e "Size"
 * num em ingles. Os identificadores foram sondados no host real e estao em
 * docs/research/after-effects-text-box-rig.md.
 */
(function () {
  var REQUIRED_ARGS = {
    paddingX: true,
    paddingY: true,
    roundness: true,
    fillColor: true,
    fillOpacity: true,
    createPerLayer: true,
    conflictMode: true
  };

  var MN = {
    contents: "ADBE Root Vectors Group",
    group: "ADBE Vector Group",
    groupContents: "ADBE Vectors Group",
    rect: "ADBE Vector Shape - Rect",
    rectSize: "ADBE Vector Rect Size",
    rectPosition: "ADBE Vector Rect Position",
    rectRoundness: "ADBE Vector Rect Roundness",
    fill: "ADBE Vector Graphic - Fill",
    fillColor: "ADBE Vector Fill Color",
    fillOpacity: "ADBE Vector Fill Opacity",
    transform: "ADBE Transform Group",
    anchorPoint: "ADBE Anchor Point",
    position: "ADBE Position"
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

  /** @param {unknown} value @param {number} min @param {number} max @returns {boolean} */
  function isInRange(value, min, max) {
    return (
      isFiniteNumber(value) &&
      /** @type {number} */ (value) >= min &&
      /** @type {number} */ (value) <= max
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de caixa desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de caixa ausente.", {
          field: key
        });
      }
    }

    // Padding negativo encolheria a caixa para dentro do texto, cortando-o.
    if (!isInRange(args.paddingX, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Padding horizontal invalido.", {
        field: "paddingX"
      });
    }
    if (!isInRange(args.paddingY, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Padding vertical invalido.", {
        field: "paddingY"
      });
    }
    if (!isInRange(args.roundness, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Arredondamento invalido.", {
        field: "roundness"
      });
    }
    if (!isInRange(args.fillOpacity, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Opacidade de preenchimento invalida.", {
        field: "fillOpacity"
      });
    }

    var color = args.fillColor;
    if (
      Object.prototype.toString.call(color) !== "[object Array]" ||
      /** @type {unknown[]} */ (color).length !== 3
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Cor de preenchimento invalida.", {
        field: "fillColor"
      });
    }
    var channel;
    for (channel = 0; channel < 3; channel += 1) {
      if (!isInRange(/** @type {unknown[]} */ (color)[channel], 0, 1)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Canal de cor fora da faixa.", {
          field: "fillColor",
          channel: channel
        });
      }
    }

    // Uma caixa por camada e a unica forma implementada. Uma caixa unica em
    // volta de varias camadas nao consegue usar `thisLayer.parent` — ha um so
    // parent — e precisaria referenciar cada texto por nome ou indice, que e
    // exatamente a fragilidade que o rig evita. Recusar e mais honesto do que
    // ignorar o valor e criar por camada assim mesmo.
    if (args.createPerLayer !== true) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Somente uma caixa por camada e suportado.", {
        field: "createPerLayer"
      });
    }
    if (args.conflictMode !== "skip") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de conflito nao permitido.", {
        field: "conflictMode"
      });
    }

    return null;
  }

  /**
   * Uma caixa e reconhecida como gerenciada por ESTRUTURA e pelo cabecalho
   * versionado da expressao — nunca pelo nome da camada, que o usuario renomeia
   * e o host localiza. O par exigido e: ser forma, ter o texto como parent, e
   * carregar a expressao gerenciada no `ADBE Vector Rect Size`.
   *
   * @param {Layer} shape
   * @param {Layer} textLayer
   * @returns {boolean}
   */
  function isManagedBoxFor(shape, textLayer) {
    if (!shape || shape === textLayer || shape.parent !== textLayer) return false;
    if (typeof ShapeLayer === "undefined" || !(shape instanceof ShapeLayer)) return false;

    try {
      var contents = shape.property(MN.contents);
      if (!contents || contents.numProperties < 1) return false;

      var index;
      for (index = 1; index <= contents.numProperties; index += 1) {
        var group = contents.property(index);
        if (!group || group.matchName !== MN.group) continue;

        var inner = group.property(MN.groupContents);
        if (!inner) continue;

        var innerIndex;
        for (innerIndex = 1; innerIndex <= inner.numProperties; innerIndex += 1) {
          var shapeItem = inner.property(innerIndex);
          if (!shapeItem || shapeItem.matchName !== MN.rect) continue;

          var size = shapeItem.property(MN.rectSize);
          if (size && MotionExpressions.isManagedTextBoxSize(size.expression)) return true;
        }
      }
    } catch (inspectError) {
      // Uma arvore de conteudo inesperada nao e uma caixa gerenciada.
      return false;
    }
    return false;
  }

  /**
   * @param {CompItem} comp
   * @param {Layer} textLayer
   * @returns {Layer|null}
   */
  function findManagedBox(comp, textLayer) {
    var index;
    for (index = 1; index <= comp.numLayers; index += 1) {
      var candidate = comp.layer(index);
      if (isManagedBoxFor(candidate, textLayer)) return candidate;
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, comp: CompItem|null, items: Array<Record<string, unknown>>}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, comp: null, items: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        comp: null,
        items: []
      };
    }

    var selected = activeItem.selectedLayers;
    if (!selected || typeof selected.length !== "number" || selected.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        comp: null,
        items: []
      };
    }

    var items = [];
    var i;
    for (i = 0; i < selected.length; i += 1) {
      var layer = selected[i];
      if (!layer || typeof TextLayer === "undefined" || !(layer instanceof TextLayer)) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "A selecao contem uma camada que nao e de texto.",
            { selectionIndex: i }
          ),
          comp: null,
          items: []
        };
      }

      items.push({
        textLayer: layer,
        existing: findManagedBox(activeItem, layer)
      });
    }

    return { error: null, comp: activeItem, items: items };
  }

  /**
   * Monta a caixa numa camada de forma JA CRIADA.
   *
   * A criacao fica de fora de proposito: quem chama precisa registrar a camada
   * para rollback no instante em que ela passa a existir. Se `addShape` e a
   * montagem ficassem juntos aqui, uma falha no meio deixaria a camada
   * meio-construida no projeto, fora do alcance do rollback.
   *
   * @param {Layer} shape
   * @param {Layer} textLayer
   * @param {Record<string, unknown>} args
   * @returns {void}
   */
  function configureBox(shape, textLayer, args) {
    // Nome so para leitura humana no timeline; a identificacao gerenciada e
    // sempre estrutural, nunca por este texto.
    shape.name = textLayer.name + " — Caixa";

    var contents = shape.property(MN.contents);
    var group = contents.addProperty(MN.group);
    var inner = group.property(MN.groupContents);
    // Retangulo antes do preenchimento: dentro de um grupo o fill pinta as
    // formas acima dele, que e a ordem que o proprio After Effects cria.
    var rect = inner.addProperty(MN.rect);
    var fill = inner.addProperty(MN.fill);

    var size = rect.property(MN.rectSize);
    size.expression = MotionExpressions.renderTextBoxSize({
      paddingX: args.paddingX,
      paddingY: args.paddingY
    });
    if (typeof size.expressionError === "string" && size.expressionError !== "") {
      throw new Error("After Effects recusou a expressao de tamanho da caixa.");
    }

    var position = rect.property(MN.rectPosition);
    position.expression = MotionExpressions.renderTextBoxPosition();
    if (typeof position.expressionError === "string" && position.expressionError !== "") {
      throw new Error("After Effects recusou a expressao de posicao da caixa.");
    }

    rect.property(MN.rectRoundness).setValue(args.roundness);

    var color = /** @type {number[]} */ (args.fillColor);
    fill.property(MN.fillColor).setValue([color[0], color[1], color[2], 1]);
    fill.property(MN.fillOpacity).setValue(args.fillOpacity);

    // Parent primeiro, transform depois. A ordem importa: a expressao le
    // `sourceRectAtTime` no espaco da camada de texto, entao a forma so cai no
    // lugar certo se a origem dela coincidir com a origem do texto. Zerar
    // ancora e posicao DEPOIS de parentear torna irrelevante se a atribuicao de
    // parent preserva ou nao o transform — o resultado e escrito explicitamente.
    shape.parent = textLayer;
    var transform = shape.property(MN.transform);
    transform.property(MN.anchorPoint).setValue([0, 0]);
    transform.property(MN.position).setValue([0, 0]);

    // Logo abaixo do texto, como manda a §7.
    shape.moveAfter(textLayer);
  }

  MotionRegistry.register("ae.text.box", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Caixa de texto ficou invalida depois do preflight.");

      var created = [];
      var unchangedCount = 0;
      var i;
      try {
        for (i = 0; i < prepared.items.length; i += 1) {
          var item = prepared.items[i];
          if (!item) continue;
          if (item.existing) {
            unchangedCount += 1;
            continue;
          }
          // Registrar ANTES de montar: a partir daqui a camada existe no
          // projeto, e uma falha na montagem precisa alcanca-la.
          var shape = /** @type {CompItem} */ (prepared.comp).layers.addShape();
          created.push(shape);
          configureBox(shape, /** @type {Layer} */ (item.textLayer), args);
        }
      } catch (applyError) {
        // Rollback aqui e remover o que foi criado, nao restaurar valores: antes
        // do comando essas camadas nao existiam.
        var rollbackFailed = false;
        for (i = created.length - 1; i >= 0; i -= 1) {
          try {
            var madeLayer = created[i];
            if (madeLayer) madeLayer.remove();
          } catch (removeError) {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback da caixa de texto falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      return {
        changed: created.length > 0,
        warnings: [],
        data: {
          createdCount: created.length,
          unchangedCount: unchangedCount
        }
      };
    }
  });
}());
