/**
 * Verificacoes de camada compartilhadas pelos comandos.
 *
 * ## Por que existe
 *
 * Cada comando validava a propria selecao, e a checagem de camada bloqueada
 * ficou de fora em parte deles. Nesses, o After Effects recusava a escrita no
 * meio do lote, depois de outras camadas ja terem mudado, e o usuario recebia
 * uma falha generica. O mesmo problema (camada bloqueada) tambem chegava com
 * tres codigos diferentes, conforme o comando.
 *
 * Aqui fica a regra unica: o preflight recusa ANTES do grupo de Undo abrir,
 * sempre com o mesmo codigo (`INVALID_SELECTION_TYPE`) e a mesma chave de
 * mensagem, apontando qual item da selecao bloqueou.
 *
 * Depende de `MotionErrors` (errors.jsx) e `MotionContracts`, lidos na hora da
 * chamada.
 */
(function (global) {
  /** @param {unknown} layer @returns {boolean} */
  function isLocked(layer) {
    try {
      return Boolean(layer && /** @type {any} */ (layer).locked === true);
    } catch (readError) {
      return false;
    }
  }

  /**
   * Camada dona de uma propriedade selecionada. `propertyGroup(propertyDepth)`
   * e o caminho documentado; doubles de teste sem essa API devolvem `null`.
   *
   * @param {unknown} property
   * @returns {unknown}
   */
  function ownerLayer(property) {
    try {
      var p = /** @type {any} */ (property);
      if (!p || typeof p.propertyGroup !== "function" || typeof p.propertyDepth !== "number") return null;
      return p.propertyGroup(p.propertyDepth);
    } catch (readError) {
      return null;
    }
  }

  /**
   * Recusa a selecao quando alguma camada esta bloqueada.
   *
   * @param {ArrayLike<unknown>|null|undefined} layers
   * @returns {MotionCommandFailure|null}
   */
  function unlockedLayers(layers) {
    if (!layers) return null;
    var i;
    for (i = 0; i < layers.length; i += 1) {
      if (isLocked(layers[i])) {
        return MotionErrors.failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "hostError.layerLocked",
          "Desbloqueie as camadas selecionadas antes de aplicar.",
          null,
          { selectionIndex: i }
        );
      }
    }
    return null;
  }

  /**
   * Recusa propriedades selecionadas cuja camada esta bloqueada.
   *
   * @param {ArrayLike<unknown>|null|undefined} properties
   * @returns {MotionCommandFailure|null}
   */
  function unlockedPropertyOwners(properties) {
    if (!properties) return null;
    var i;
    for (i = 0; i < properties.length; i += 1) {
      if (isLocked(ownerLayer(properties[i]))) {
        return MotionErrors.failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "hostError.propertyLayerLocked",
          "Desbloqueie a camada da propriedade selecionada antes de aplicar.",
          null,
          { selectionIndex: i }
        );
      }
    }
    return null;
  }

  /**
   * Efeito ausente nesta instalacao. `canAddProperty` e a sonda que o host ja
   * usa; ela nao altera a camada.
   *
   * @param {unknown} layer
   * @param {string} matchName
   * @param {string} displayName Nome curto para a frase, ex.: "CC Light Sweep".
   * @returns {MotionCommandFailure|null}
   */
  function effectAvailable(layer, matchName, displayName) {
    var available;
    try {
      var effects = /** @type {any} */ (layer).property("ADBE Effect Parade");
      available = Boolean(effects && effects.canAddProperty(matchName));
    } catch (probeError) {
      available = false;
    }
    if (available) return null;
    return MotionErrors.failure(
      MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
      "hostError.effectUnavailable",
      "O efeito " + displayName + " nao esta disponivel neste After Effects.",
      { effect: displayName },
      { matchName: matchName }
    );
  }

  global.MotionPreflight = {
    isLocked: isLocked,
    ownerLayer: ownerLayer,
    unlockedLayers: unlockedLayers,
    unlockedPropertyOwners: unlockedPropertyOwners,
    effectAvailable: effectAvailable
  };
})($.global);
