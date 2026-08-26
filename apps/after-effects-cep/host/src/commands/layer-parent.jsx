/**
 * `ae.layer.parent` parenta e desparenta camadas em lote.
 *
 * A escolha central esta medida em docs/research/after-effects-parenting.md:
 *
 *   layer.parent = alvo          PRESERVA o world transform
 *   layer.setParentWithJump(x)   NAO preserva — a camada pula
 *
 * O nome da API engana, e um palpite invertido produziria camadas visualmente
 * erradas sem levantar nenhuma excecao. As duas chamadas existem aqui porque o
 * usuario escolhe entre elas com `preserveWorldTransform`.
 */
(function () {
  var REQUIRED_ARGS = {
    targetLayerIndex: true,
    targetLayerName: true,
    preserveWorldTransform: true,
    unparent: true,
    chainMode: true
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
  function isIndex(value) {
    return (
      typeof value === "number" &&
      isFinite(value) &&
      Math.floor(value) === value &&
      value >= 0 &&
      value <= 100000
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
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de parentesco desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de parentesco ausente.", {
          field: key
        });
      }
    }

    if (typeof args.preserveWorldTransform !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Preservacao de transform invalida.", {
        field: "preserveWorldTransform"
      });
    }
    if (typeof args.unparent !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de desparentar invalido.", {
        field: "unparent"
      });
    }
    if (args.chainMode !== "target" && args.chainMode !== "chain") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de encadeamento invalido.", {
        field: "chainMode"
      });
    }
    if (!isIndex(args.targetLayerIndex)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Indice de camada alvo invalido.", {
        field: "targetLayerIndex"
      });
    }
    if (typeof args.targetLayerName !== "string" || args.targetLayerName.length > 1024) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome de camada alvo invalido.", {
        field: "targetLayerName"
      });
    }

    // Desparentar e parentear sao excludentes, e o alvo precisa estar ausente de
    // forma explicita (`0` e `""`) num deles. Aceitar um alvo ignorado deixaria
    // a interface prometer algo que o comando nao faz.
    if (args.unparent === true) {
      if (args.targetLayerIndex !== 0 || args.targetLayerName !== "") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Desparentar nao aceita camada alvo.", {
          field: "targetLayerIndex"
        });
      }
      if (args.chainMode !== "target") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Desparentar nao aceita encadeamento.", {
          field: "chainMode"
        });
      }
    } else if (args.targetLayerIndex === 0) {
      // No modo `chain` a ultima camada pode ficar sem alvo: o encadeamento
      // entre as selecionadas ja e o resultado pedido.
      if (args.chainMode !== "chain") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Parentear exige uma camada alvo.", {
          field: "targetLayerIndex"
        });
      }
      if (args.targetLayerName !== "") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome de alvo sem indice de alvo.", {
          field: "targetLayerName"
        });
      }
    }

    return null;
  }

  /**
   * `alvo` seria descendente de `camada`?
   *
   * O After Effects recusa o ciclo sozinho, com mensagem propria — medido. Mas
   * a regra do projeto e validar a selecao inteira antes do primeiro write:
   * confiar na excecao faria o lote falhar no meio e devolveria uma mensagem de
   * host nao traduzida em vez de erro tipado.
   *
   * @param {Layer} camada
   * @param {Layer} alvo
   * @returns {boolean}
   */
  function criaCiclo(camada, alvo) {
    var atual = /** @type {Layer|null} */ (alvo);
    var guarda = 0;
    while (atual && guarda < 10000) {
      if (atual === camada) return true;
      atual = atual.parent;
      guarda += 1;
    }
    return false;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, items: Array<Record<string, unknown>>}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, items: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        items: []
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || typeof selecionadas.length !== "number" || selecionadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        items: []
      };
    }

    var alvo = null;
    if (args.unparent !== true && args.targetLayerIndex !== 0) {
      var indice = /** @type {number} */ (args.targetLayerIndex);
      if (indice < 1 || indice > comp.numLayers) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada alvo nao existe mais.", {
            field: "targetLayerIndex"
          }),
          items: []
        };
      }
      alvo = comp.layer(indice);
      // O nome viaja como soma de verificacao, nao como identidade: se o
      // timeline mudou entre a leitura do painel e o clique, parentear no indice
      // antigo acertaria a camada errada em silencio.
      if (!alvo || alvo.name !== args.targetLayerName) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "A camada alvo mudou desde a leitura da lista.",
            { field: "targetLayerIndex" }
          ),
          items: []
        };
      }
    }

    // Ordem de timeline, do topo para baixo. `selectedLayers` nao garante ordem,
    // e o encadeamento precisa de uma ordem estavel e previsivel para o usuario.
    var ordenadas = [];
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      var j;
      for (j = 0; j < selecionadas.length; j += 1) {
        if (selecionadas[j] === camada) {
          ordenadas.push(camada);
          break;
        }
      }
    }

    var items = [];
    for (i = 0; i < ordenadas.length; i += 1) {
      var filha = /** @type {Layer} */ (ordenadas[i]);
      if (!filha) continue;
      /** @type {Layer|null} */
      var desejado;
      if (args.unparent === true) {
        desejado = null;
      } else if (args.chainMode === "chain") {
        desejado = i + 1 < ordenadas.length ? /** @type {Layer} */ (ordenadas[i + 1]) : alvo;
      } else {
        desejado = alvo;
      }

      if (desejado === filha) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "Uma camada nao pode ser pai de si mesma.",
            { layerIndex: filha.index }
          ),
          items: []
        };
      }
      if (desejado && criaCiclo(filha, desejado)) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "O parentesco pedido criaria um ciclo.",
            { layerIndex: filha.index }
          ),
          items: []
        };
      }

      items.push({
        layer: filha,
        anterior: filha.parent || null,
        desejado: desejado || null,
        changed: (filha.parent || null) !== (desejado || null)
      });
    }

    return { error: null, items: items };
  }

  /**
   * @param {Layer} camada
   * @param {Layer|null} novoPai
   * @param {boolean} preservar
   * @returns {void}
   */
  function aplicaPai(camada, novoPai, preservar) {
    if (novoPai === null) {
      camada.parent = null;
      return;
    }
    if (preservar) {
      camada.parent = novoPai;
      return;
    }
    camada.setParentWithJump(novoPai);
  }

  MotionRegistry.register("ae.layer.parent", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Parentesco ficou invalido depois do preflight.");

      var preservar = args.preserveWorldTransform === true;
      var tocadas = [];
      var aplicadas = 0;
      var inalteradas = 0;
      var i;

      try {
        for (i = 0; i < prepared.items.length; i += 1) {
          var item = prepared.items[i];
          if (!item || item.changed !== true) {
            inalteradas += 1;
            continue;
          }
          tocadas.push(item);
          aplicaPai(
            /** @type {Layer} */ (item.layer),
            /** @type {Layer|null} */ (item.desejado),
            preservar
          );
          aplicadas += 1;
        }
      } catch (applyError) {
        // Rollback pelo MESMO metodo usado na ida. Com `parent =` o mundo foi
        // preservado nos dois sentidos, entao os valores voltam sozinhos; com
        // `setParentWithJump` os valores crus foram mantidos, e restaurar pelo
        // outro metodo deixaria a camada num terceiro lugar.
        var rollbackFalhou = false;
        for (i = tocadas.length - 1; i >= 0; i -= 1) {
          try {
            var desfazer = tocadas[i];
            if (desfazer) {
              aplicaPai(
                /** @type {Layer} */ (desfazer.layer),
                /** @type {Layer|null} */ (desfazer.anterior),
                preservar
              );
            }
          } catch (restoreError) {
            rollbackFalhou = true;
          }
        }
        if (rollbackFalhou) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de parentesco falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      return {
        changed: aplicadas > 0,
        warnings: [],
        data: {
          appliedCount: aplicadas,
          unchangedCount: inalteradas
        }
      };
    }
  });
}());
