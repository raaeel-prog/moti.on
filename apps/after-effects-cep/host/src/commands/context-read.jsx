/**
 * `ae.context.read` — lê o contexto atual do After Effects.
 *
 * Não muta nada. Substitui o antigo `MotionAE.getContext()`, que era exposto
 * direto no global e chamado por concatenação de string no `evalScript`.
 *
 * ## Por que ele lê a seleção
 *
 * O painel precisa decidir sozinho o que dá para aplicar: se há composição, se
 * há propriedade selecionada, se ela aceita expressão, se já tem keyframes. Sem
 * isso, ou o painel pergunta ao usuário o que ele acabou de fazer na timeline,
 * ou tenta aplicar e falha. Os campos de seleção aqui são os mesmos que o
 * `QuickContext` do contrato pede, e alimentam tanto a habilitação dos botões
 * quanto os defaults derivados por contexto.
 *
 * ## Custo
 *
 * Este comando roda em laço, por polling. Ele varre no máximo `MAX_CAMADAS`
 * camadas e `MAX_PROPRIEDADES` propriedades selecionadas: uma seleção de
 * quinhentas camadas nao pode transformar a leitura de contexto num travamento
 * a cada tique. Quando o teto é atingido, `selectionTruncated` avisa, em vez de
 * a contagem mentir.
 */
(function () {
  var MAX_CAMADAS = 60;
  var MAX_PROPRIEDADES = 60;

  /**
   * Descreve a seleção da composição ativa.
   *
   * @param {CompItem} comp
   * @returns {Record<string, unknown>}
   */
  function lerSelecao(comp) {
    var camadas = comp.selectedLayers || [];
    var propriedades = comp.selectedProperties || [];
    var totalCamadas = camadas.length;
    var totalPropriedades = propriedades.length;

    var camadasLidas = totalCamadas < MAX_CAMADAS ? totalCamadas : MAX_CAMADAS;
    var propriedadesLidas =
      totalPropriedades < MAX_PROPRIEDADES ? totalPropriedades : MAX_PROPRIEDADES;

    var alguma3D = false;
    // Tipo e bloqueio por camada: o painel usa para avisar, antes do clique,
    // que um preset de texto precisa de texto e que uma camada esta bloqueada.
    var textos = 0;
    var bloqueadas = 0;
    var identity = [String(/** @type {any} */ (comp).id)];
    var somaDeDuracoes = 0;
    var i;

    for (i = 0; i < camadasLidas; i += 1) {
      var camada = /** @type {any} */ (camadas[i]);
      if (!camada) continue;
      identity.push("L" + (typeof camada.id === "number" ? camada.id : camada.index));
      if (camada.threeDLayer === true) alguma3D = true;
      if (typeof TextLayer !== "undefined" && camada instanceof TextLayer) textos += 1;
      if (camada.locked === true) bloqueadas += 1;
      if (typeof camada.outPoint === "number" && typeof camada.inPoint === "number") {
        somaDeDuracoes += camada.outPoint - camada.inPoint;
      }
    }

    // Propriedade "aplicável" é a que aceita expressão e varia no tempo: é a
    // pergunta que decide se um preset rápido pode rodar sem abrir formulário.
    var aplicaveis = 0;
    var comKeyframes = 0;
    var comExpressao = 0;
    var keyframesSelecionados = 0;

    for (i = 0; i < propriedadesLidas; i += 1) {
      var propriedade = /** @type {any} */ (propriedades[i]);
      if (!propriedade) continue;
      var cursor = propriedade, path = [], depth = 0;
      while (cursor && cursor.parentProperty && depth < 32) {
        path.unshift(String(cursor.propertyIndex)); cursor = cursor.parentProperty; depth += 1;
      }
      identity.push("P" + (cursor ? (typeof cursor.id === "number" ? cursor.id : cursor.index) : "") + ":" + path.join("."));
      if (propriedade.propertyType !== PropertyType.PROPERTY) continue;
      if (propriedade.canSetExpression === true) aplicaveis += 1;
      if (typeof propriedade.numKeys === "number" && propriedade.numKeys > 0) comKeyframes += 1;
      if (typeof propriedade.expression === "string" && propriedade.expression !== "") {
        comExpressao += 1;
      }
      // Keyframe SELECIONADO e propriedade COM keyframe sao perguntas
      // diferentes, e as ferramentas de keyframe dependem da primeira:
      // Suavizar, Espelhar keys e Enviar para a borda operam sobre
      // `selectedKeys`, e recusam com NO_SELECTION quando ela esta vazia — mesmo
      // numa propriedade cheia de keyframes. Sem esta contagem o ladrilho
      // pareceria disponivel e so o clique revelaria que nao estava.
      var selecionados = propriedade.selectedKeys;
      if (selecionados && typeof selecionados.length === "number") {
        keyframesSelecionados += selecionados.length;
      }
    }

    return {
      selectionSignature: identity.join("|"),
      selectionLayerCount: totalCamadas,
      selectionPropertyCount: totalPropriedades,
      selectionExpressibleCount: aplicaveis,
      selectionSelectedKeyCount: keyframesSelecionados,
      selectionHasKeyframes: comKeyframes > 0,
      selectionHasExpressions: comExpressao > 0,
      selectionIs3D: alguma3D,
      selectionTextLayerCount: textos,
      selectionLockedLayerCount: bloqueadas,
      averageLayerDurationSeconds:
        camadasLidas > 0 ? Math.round((somaDeDuracoes / camadasLidas) * 1000) / 1000 : null,
      selectionTruncated: totalCamadas > MAX_CAMADAS || totalPropriedades > MAX_PROPRIEDADES
    };
  }

  MotionRegistry.register("ae.context.read", {
    /**
     * Não há nada a validar: ler o contexto funciona mesmo sem projeto salvo,
     * sem composição ativa e sem seleção. `null` explícito é a forma de declarar
     * isso — o registry recusa um comando sem `preflight`, justamente para que
     * "não valida nada" seja uma decisão escrita e não um esquecimento.
     */
    preflight: function () {
      return null;
    },

    run: function () {
      var project = app.project;
      var activeItem = project ? project.activeItem : null;
      var comp = activeItem && activeItem instanceof CompItem ? activeItem : null;

      var dados = /** @type {Record<string, unknown>} */ ({
        host: "After Effects",
        hostVersion: app.version,
        projectName: project && project.file ? project.file.name : null,
        projectPath: project && project.file ? project.file.fsName : null,
        activeItemName: activeItem ? activeItem.name : null,
        isComposition: Boolean(comp),
        compWidth: comp ? comp.width : null,
        compHeight: comp ? comp.height : null,
        compDuration: comp ? Math.round(comp.duration * 1000) / 1000 : null,
        compFrameRate: comp ? Math.round(comp.frameRate * 1000) / 1000 : null,
        currentTime: comp ? Math.round(comp.time * 1000) / 1000 : null,
        workAreaStart: comp ? Math.round(comp.workAreaStart * 1000) / 1000 : null,
        workAreaDuration: comp ? Math.round(comp.workAreaDuration * 1000) / 1000 : null,
        selectionLayerCount: 0,
        selectionPropertyCount: 0,
        selectionExpressibleCount: 0,
        selectionSelectedKeyCount: 0,
        selectionHasKeyframes: false,
        selectionHasExpressions: false,
        selectionIs3D: false,
        selectionTextLayerCount: 0,
        selectionLockedLayerCount: 0,
        averageLayerDurationSeconds: null,
        selectionTruncated: false
      });

      if (comp) {
        var selecao = lerSelecao(comp);
        var chave;
        for (chave in selecao) {
          if (Object.prototype.hasOwnProperty.call(selecao, chave)) {
            dados[chave] = selecao[chave];
          }
        }
      }

      return { changed: false, warnings: [], data: dados };
    }
  });
}());
