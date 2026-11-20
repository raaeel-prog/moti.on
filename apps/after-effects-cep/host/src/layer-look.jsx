/**
 * Aparencia herdada entre camadas.
 *
 * Ferramentas que trocam um texto por camadas geradas (morph, revelacao) antes
 * recusavam texto com efeitos — um Gradiente aplicado antes bloqueava o morph.
 * Agora a camada gerada recebe uma copia dos efeitos da origem, com valores,
 * keyframes e expressoes, e o texto original continua intacto (so oculto).
 *
 * A copia e propriedade a propriedade: o ExtendScript nao tem "copiar efeito".
 * Propriedades sem valor (grupos, botoes) e de dado customizado sao puladas;
 * uma propriedade que o host recusa escrever nao derruba a copia inteira.
 */
(function (/** @type {any} */ global) {
  var MN_PARADE = "ADBE Effect Parade";

  /** @param {any} p @returns {boolean} */
  function writable(p) {
    var types = global.PropertyValueType;
    if (!p || p.propertyType !== undefined && global.PropertyType && p.propertyType !== global.PropertyType.PROPERTY) return false;
    if (types && (p.propertyValueType === types.NO_VALUE || p.propertyValueType === types.CUSTOM_VALUE)) return false;
    return true;
  }

  /** @param {any} from @param {any} to */
  function copyKeys(from, to) {
    var times = [], values = [], k;
    for (k = 1; k <= from.numKeys; k += 1) { times.push(from.keyTime(k)); values.push(from.keyValue(k)); }
    if (typeof to.setValuesAtTimes === "function") to.setValuesAtTimes(times, values);
    else for (k = 0; k < times.length; k += 1) to.setValueAtTime(times[k], values[k]);
    for (k = 1; k <= from.numKeys; k += 1) {
      try { to.setInterpolationTypeAtKey(k, from.keyInInterpolationType(k), from.keyOutInterpolationType(k)); } catch (noInterpolation) { /* host sem interpolacao por key: mantem a padrao */ }
      try { to.setTemporalEaseAtKey(k, from.keyInTemporalEase(k), from.keyOutTemporalEase(k)); } catch (noEase) { /* idem para ease */ }
    }
  }

  /** @param {any} from @param {any} to @returns {number} propriedades que o host recusou */
  function copyValues(from, to) {
    var skipped = 0;
    if (from.numProperties) {
      for (var i = 1; i <= from.numProperties; i += 1) {
        var a = from.property(i), b = to.property(i);
        if (!a || !b) continue;
        skipped += copyValues(a, b);
      }
      return skipped;
    }
    if (!writable(from)) return 0;
    try {
      if (from.numKeys > 0) copyKeys(from, to);
      else if (typeof from.value !== "undefined") to.setValue(from.value);
      if (from.canSetExpression && from.expression) { to.expression = from.expression; to.expressionEnabled = from.expressionEnabled; }
    } catch (refused) { skipped += 1; }
    return skipped;
  }

  /**
   * Copia os efeitos de `source` para o fim da lista de `target`.
   * @param {any} source @param {any} target
   * @param {((effect:any) => boolean)=} accept filtro opcional (ex.: pular controles de um rig)
   * @returns {{copied:number, skipped:number}}
   */
  function copyEffects(source, target, accept) {
    var from = source.property(MN_PARADE), copied = 0, skipped = 0;
    if (!from || !from.numProperties) return {copied: 0, skipped: 0};
    for (var i = 1; i <= from.numProperties; i += 1) {
      var effect = from.property(i), parade = target.property(MN_PARADE);
      if (accept && !accept(effect)) continue;
      if (!parade.canAddProperty(effect.matchName)) { skipped += 1; continue; }
      parade.addProperty(effect.matchName);
      // Acrescentar um irmao invalida handles: rele pela posicao final.
      parade = target.property(MN_PARADE);
      var copy = parade.property(parade.numProperties);
      copy.name = effect.name;
      skipped += copyValues(effect, copy);
      if (typeof effect.enabled === "boolean") copy.enabled = effect.enabled;
      copied += 1;
    }
    return {copied: copied, skipped: skipped};
  }

  /**
   * Esvazia efeitos e animadores de texto de uma camada gerada por duplicata,
   * para que o rig monte a propria estrutura a partir de uma base conhecida.
   * @param {any} layer
   */
  function clearCopiedLook(layer) {
    var parade = layer.property(MN_PARADE);
    while (parade && parade.numProperties) { parade.property(parade.numProperties).remove(); parade = layer.property(MN_PARADE); }
    var text = layer.property("ADBE Text Properties"), animators = text ? text.property("ADBE Text Animators") : null;
    while (animators && animators.numProperties) { animators.property(animators.numProperties).remove(); animators = layer.property("ADBE Text Properties").property("ADBE Text Animators"); }
  }

  /** @param {any} layer @returns {boolean} */
  function hasEffects(layer) {
    var parade = layer.property(MN_PARADE);
    return !!parade && parade.numProperties > 0;
  }

  global.MotionLayerLook = {copyEffects: copyEffects, clearCopiedLook: clearCopiedLook, hasEffects: hasEffects};
}($.global));
