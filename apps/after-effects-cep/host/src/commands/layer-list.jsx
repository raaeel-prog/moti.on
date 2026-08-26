/**
 * `ae.layer.list` devolve as camadas da composicao ativa, para o painel poder
 * oferecer um seletor de alvo.
 *
 * Existe como comando proprio, e nao como campo de `ae.context.read`, porque o
 * contexto e lido a cada troca de foco e uma composicao com centenas de camadas
 * transformaria isso num payload grande e constante.
 *
 * Somente leitura: nao abre grupo de Undo e nao toca no projeto.
 */
(function () {
  // Teto de payload. Uma composicao maior que isto devolve `truncated: true` em
  // vez de estourar o limite de transporte do evalScript silenciosamente.
  var LIMITE = 500;

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  /** @param {Layer} camada @returns {string} */
  function tipoDe(camada) {
    try {
      if (typeof TextLayer !== "undefined" && camada instanceof TextLayer) return "text";
      if (typeof ShapeLayer !== "undefined" && camada instanceof ShapeLayer) return "shape";
      if (camada.nullLayer === true) return "null";
    } catch (tipoError) {
      // Uma camada que nao responde a essas checagens ainda pode ser alvo.
    }
    return "other";
  }

  /** @returns {MotionCommandFailure|null} */
  function preflight() {
    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    return null;
  }

  MotionRegistry.register("ae.layer.list", {
    preflight: function () {
      return preflight();
    },

    run: function () {
      var comp = /** @type {CompItem} */ (app.project.activeItem);
      var camadas = [];
      var total = comp.numLayers;
      var quantas = total > LIMITE ? LIMITE : total;

      var i;
      for (i = 1; i <= quantas; i += 1) {
        var camada = comp.layer(i);
        var pai;
        try {
          pai = camada.parent ? camada.parent.index : null;
        } catch (paiError) {
          // Uma camada cujo pai nao pode ser lido entra na lista sem pai, em vez
          // de derrubar a leitura inteira.
          pai = null;
        }

        camadas.push({
          index: camada.index,
          name: camada.name,
          type: tipoDe(camada),
          parentIndex: pai,
          selected: camada.selected === true
        });
      }

      return {
        changed: false,
        warnings: [],
        data: {
          layers: camadas,
          totalCount: total,
          truncated: total > LIMITE
        }
      };
    }
  });
}());
