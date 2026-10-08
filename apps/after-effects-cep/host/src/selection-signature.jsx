/**
 * Assinatura da selecao da composicao ativa.
 *
 * `ae.context.read` sempre devolveu `selectionSignature`, uma string que muda
 * quando a selecao de camadas ou de propriedades muda. O painel a guarda e a
 * manda de volta em `ae.keys.ease.apply` (`expectedSelection` e
 * `session.signature`) para o host recusar com STALE_SELECTION quando a selecao
 * ja nao e a mesma que o painel esta vendo.
 *
 * Os dois lados precisam calcular exatamente a mesma string, entao o calculo
 * vive aqui e so aqui. O formato e o historico do context-read:
 *
 *   "<comp.id>|L<indice>|...|P<indice da camada>:<caminho de propertyIndex>|..."
 *
 * Tempos de keyframe, valores e selecao de keyframes NAO entram: a assinatura
 * responde "a mesma selecao?", e nao "o mesmo conteudo?". Os tetos sao os do
 * context-read, que roda por polling.
 */
(function (global) {
  var MAX_LAYERS = 60;
  var MAX_PROPERTIES = 60;

  /**
   * Token de uma propriedade: indice da camada dona e caminho de
   * `propertyIndex` da raiz ate a propriedade.
   *
   * @param {unknown} property
   * @returns {string}
   */
  function propertyToken(property) {
    var cursor = /** @type {any} */ (property);
    var path = [];
    var depth = 0;
    while (cursor && cursor.parentProperty && depth < 32) {
      path.unshift(String(cursor.propertyIndex));
      cursor = cursor.parentProperty;
      depth += 1;
    }
    return "P" + (cursor ? cursor.index : "") + ":" + path.join(".");
  }

  /**
   * @param {CompItem} comp
   * @returns {string}
   */
  function signature(comp) {
    var camadas = comp.selectedLayers || [];
    var propriedades = comp.selectedProperties || [];
    var camadasLidas = camadas.length < MAX_LAYERS ? camadas.length : MAX_LAYERS;
    var propriedadesLidas = propriedades.length < MAX_PROPERTIES ? propriedades.length : MAX_PROPERTIES;
    var identity = [String(/** @type {any} */ (comp).id)];
    var i;
    for (i = 0; i < camadasLidas; i += 1) {
      var camada = /** @type {any} */ (camadas[i]);
      if (!camada) continue;
      identity.push("L" + camada.index);
    }
    for (i = 0; i < propriedadesLidas; i += 1) {
      var propriedade = propriedades[i];
      if (!propriedade) continue;
      identity.push(propertyToken(propriedade));
    }
    return identity.join("|");
  }

  global.MotionSelection = {
    signature: signature,
    propertyToken: propertyToken,
    MAX_LAYERS: MAX_LAYERS,
    MAX_PROPERTIES: MAX_PROPERTIES
  };
}($.global));
