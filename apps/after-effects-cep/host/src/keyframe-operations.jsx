/**
 * Operacoes comuns de keyframes para CHMS-016.
 *
 * O After Effects nao oferece `setKeyTime`: deslocar uma key exige capturar o
 * registro inteiro, remover e recriar. Este modulo concentra essa sequencia para
 * CutKeys e Delay compartilharem exatamente a mesma preservacao de metadata.
 * Ele aceita apenas propriedades numericas/vetoriais cobertas pelo CHMS-012.
 */
(function (global) {
  var MAX_KEYS_PER_BATCH = 10000;
  var TIME_TOLERANCE = 0.0000001;

  /** @param {unknown} value @returns {unknown} */
  function cloneValue(value) {
    if (typeof value === "number") return value;
    var arrayLike = /** @type {{length?: unknown}} */ (value);
    if (value && typeof arrayLike.length === "number") {
      var source = /** @type {Array<unknown>} */ (value);
      var result = [];
      var i;
      for (i = 0; i < source.length; i += 1) result.push(source[i]);
      return result;
    }
    throw new Error("Valor de keyframe fora do escopo numerico do CHMS-012.");
  }

  /** @param {Property} property @returns {boolean} */
  function isSupportedProperty(property) {
    if (!property || typeof PropertyType === "undefined") return false;
    if (property.propertyType !== PropertyType.PROPERTY) return false;
    if (typeof PropertyValueType === "undefined") return false;
    var type = property.propertyValueType;
    return (
      type === PropertyValueType.OneD ||
      type === PropertyValueType.TwoD ||
      type === PropertyValueType.TwoD_SPATIAL ||
      type === PropertyValueType.ThreeD ||
      type === PropertyValueType.ThreeD_SPATIAL ||
      type === PropertyValueType.COLOR
    );
  }

  /** @param {Property} property @returns {boolean} */
  function isSpatial(property) {
    return (
      property.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
      property.propertyValueType === PropertyValueType.ThreeD_SPATIAL
    );
  }

  /** @param {Array<KeyframeEase>} eases @returns {MotionCapturedEase[]} */
  function captureEase(eases) {
    var result = [];
    var i;
    for (i = 0; i < eases.length; i += 1) {
      var ease = eases[i];
      if (!ease) throw new Error("Ease temporal ausente.");
      result.push({ speed: ease.speed, influence: ease.influence });
    }
    return result;
  }

  /** @param {MotionCapturedEase[]} eases @returns {Array<KeyframeEase>} */
  function restoreEase(eases) {
    var result = [];
    var i;
    for (i = 0; i < eases.length; i += 1) {
      var ease = eases[i];
      if (!ease) throw new Error("Ease temporal ausente.");
      result.push(new KeyframeEase(ease.speed, ease.influence));
    }
    return result;
  }

  /**
   * @param {Property} property
   * @returns {MotionPropertySnapshot}
   */
  function captureProperty(property) {
    if (!isSupportedProperty(property)) {
      throw new Error("Propriedade de keyframe nao suportada.");
    }
    if (property.numKeys > MAX_KEYS_PER_BATCH) {
      throw new Error("Propriedade excede o limite de keyframes por lote.");
    }

    var spatial = isSpatial(property);
    var supportsLabels =
      typeof property.keyLabel === "function" && typeof property.setLabelAtKey === "function";
    var keys = [];
    var i;
    for (i = 1; i <= property.numKeys; i += 1) {
      var key = /** @type {MotionCapturedKey} */ ({
        time: property.keyTime(i),
        value: cloneValue(property.keyValue(i)),
        inInterpolation: property.keyInInterpolationType(i),
        outInterpolation: property.keyOutInterpolationType(i),
        inEase: captureEase(property.keyInTemporalEase(i)),
        outEase: captureEase(property.keyOutTemporalEase(i)),
        temporalContinuous: property.keyTemporalContinuous(i),
        temporalAutoBezier: property.keyTemporalAutoBezier(i),
        roving: property.keyRoving(i),
        selected: property.keySelected(i),
        spatial: null
      });
      if (supportsLabels) key.label = property.keyLabel(i);
      if (spatial) {
        key.spatial = {
          inTangent: cloneValue(property.keyInSpatialTangent(i)),
          outTangent: cloneValue(property.keyOutSpatialTangent(i)),
          continuous: property.keySpatialContinuous(i),
          autoBezier: property.keySpatialAutoBezier(i)
        };
      }
      keys.push(key);
    }

    return /** @type {MotionPropertySnapshot} */ ({
      property: property,
      spatial: spatial,
      supportsLabels: supportsLabels,
      keys: keys
    });
  }

  /** @param {number[]} times @param {number} expected @returns {void} */
  function validateTimes(times, expected) {
    if (!times || typeof times.length !== "number" || times.length !== expected) {
      throw new Error("Quantidade de tempos de keyframe invalida.");
    }
    var i;
    for (i = 0; i < times.length; i += 1) {
      var current = times[i];
      if (typeof current !== "number" || !isFinite(current)) {
        throw new Error("Tempo de keyframe nao finito.");
      }
      var previous = i > 0 ? times[i - 1] : null;
      if (i > 0 && typeof previous === "number" && current - previous <= TIME_TOLERANCE) {
        throw new Error("Tempos de keyframe colidem ou estao fora de ordem.");
      }
    }
  }

  /** @param {Property} property @returns {void} */
  function removeAll(property) {
    var i;
    for (i = property.numKeys; i >= 1; i -= 1) property.removeKey(i);
  }

  /**
   * Restaura um snapshot inteiro, opcionalmente em novos tempos.
   *
   * Fases: cria valores; restaura temporal; espacial; roving; labels; selecao.
   * Indices so sao resolvidos depois de todas as keys existirem.
   *
   * @param {MotionPropertySnapshot} snapshot
   * @param {number[]|null} overrideTimes
   * @returns {void}
   */
  function restoreProperty(snapshot, overrideTimes) {
    var property = snapshot.property;
    var keys = snapshot.keys;
    var times = [];
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var sourceKey = keys[i];
      if (!sourceKey) throw new Error("Snapshot de keyframe incompleto.");
      var overrideTime = overrideTimes ? overrideTimes[i] : null;
      times.push(typeof overrideTime === "number" ? overrideTime : sourceKey.time);
    }
    validateTimes(times, keys.length);

    removeAll(property);
    for (i = 0; i < keys.length; i += 1) {
      var createKey = keys[i];
      var createTime = times[i];
      if (!createKey || typeof createTime !== "number") {
        throw new Error("Snapshot de keyframe incompleto.");
      }
      property.setValueAtTime(createTime, cloneValue(createKey.value));
    }
    if (property.numKeys !== keys.length) {
      throw new Error("O host nao recriou a quantidade esperada de keyframes.");
    }

    for (i = 0; i < keys.length; i += 1) {
      var index = i + 1;
      var key = keys[i];
      var expectedTime = times[i];
      if (!key || typeof expectedTime !== "number") throw new Error("Snapshot de keyframe incompleto.");
      if (Math.abs(property.keyTime(index) - expectedTime) > TIME_TOLERANCE) {
        throw new Error("O host recriou um keyframe em tempo inesperado.");
      }
      property.setInterpolationTypeAtKey(index, key.inInterpolation, key.outInterpolation);
      property.setTemporalEaseAtKey(index, restoreEase(key.inEase), restoreEase(key.outEase));
      property.setTemporalContinuousAtKey(index, key.temporalContinuous === true);
      property.setTemporalAutoBezierAtKey(index, key.temporalAutoBezier === true);
    }

    if (snapshot.spatial === true) {
      for (i = 0; i < keys.length; i += 1) {
        var spatialKey = keys[i];
        if (!spatialKey) throw new Error("Snapshot espacial incompleto.");
        var spatial = spatialKey.spatial;
        if (!spatial) throw new Error("Snapshot espacial incompleto.");
        property.setSpatialTangentsAtKey(
          i + 1,
          cloneValue(spatial.inTangent),
          cloneValue(spatial.outTangent)
        );
        property.setSpatialContinuousAtKey(i + 1, spatial.continuous === true);
        property.setSpatialAutoBezierAtKey(i + 1, spatial.autoBezier === true);
      }
    }

    for (i = 0; i < keys.length; i += 1) {
      // Roving so e valido em keys intermediarias. Um snapshot valido nunca o
      // traz nas bordas, mas a guarda impede o host de receber uma chamada
      // invalida se uma versao antiga tiver normalizado isso de modo diferente.
      if (i > 0 && i < keys.length - 1) {
        var rovingKey = keys[i];
        if (!rovingKey) throw new Error("Snapshot de roving incompleto.");
        property.setRovingAtKey(i + 1, rovingKey.roving === true);
      }
    }
    if (snapshot.supportsLabels === true) {
      for (i = 0; i < keys.length; i += 1) {
        var labelKey = keys[i];
        if (!labelKey || typeof labelKey.label !== "number") {
          throw new Error("Label de keyframe ausente.");
        }
        property.setLabelAtKey(i + 1, labelKey.label);
      }
    }
    for (i = 0; i < keys.length; i += 1) {
      var selectedKey = keys[i];
      if (!selectedKey) throw new Error("Snapshot de selecao incompleto.");
      property.setSelectedAtKey(i + 1, selectedKey.selected === true);
    }
  }

  /** @param {Property} property @param {number[]} indices @returns {void} */
  function removeIndicesDescending(property, indices) {
    var last = property.numKeys + 1;
    var i;
    for (i = 0; i < indices.length; i += 1) {
      var index = indices[i];
      if (
        typeof index !== "number" ||
        !isFinite(index) ||
        Math.floor(index) !== index ||
        index < 1 ||
        index >= last
      ) {
        throw new Error("Plano de remocao nao esta em ordem decrescente.");
      }
      property.removeKey(index);
      last = index;
    }
  }

  /**
   * Identificador humano/estavel enquanto o timeline nao muda.
   * @param {CompItem} comp @param {Property} property
   * @returns {Record<string, unknown>}
   */
  function describeProperty(comp, property) {
    var segments = [];
    var current = /** @type {Property|PropertyGroup|Layer|null} */ (property);
    var guard = 0;
    while (current && current.parentProperty && guard < 64) {
      segments.unshift((current.matchName || current.name || "property") + "#" + (current.propertyIndex || 0));
      current = current.parentProperty;
      guard += 1;
    }
    var layerIndex = 0;
    var layerName = "";
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i) === current) {
        layerIndex = i;
        layerName = current.name;
        break;
      }
    }
    return {
      id: String(layerIndex) + ":" + segments.join("/"),
      layerIndex: layerIndex,
      layerName: layerName,
      propertyName: property.name || property.matchName || "Property"
    };
  }

  /**
   * Converte uma curva Bezier cubica em velocidade e influencia do After Effects,
   * para uma dimensao.
   *
   * A influencia e o X da alca em percentual do segmento, limitada ao piso de
   * 0,1% do host. A **velocidade** usa essa mesma influencia limitada como
   * denominador da inclinacao, e nao o X cru: com alca vertical (`x1 = 0`) a
   * conta crua seria divisao por zero, e devolver zero ali transformaria a
   * arrancada numa pausa em silencio.
   *
   * `packages/keyframe-core/src/bezier.ts` e a implementacao de referencia da
   * mesma formula, e `ease-paridade.test.mjs` compara as duas numa tabela de
   * curvas para elas nao poderem divergir.
   *
   * @param {{x1: number, y1: number, x2: number, y2: number}} curva
   * @param {number} duracaoSegundos
   * @param {number} diferencaDeValor
   * @returns {{outSpeed: number, outInfluence: number, inSpeed: number, inInfluence: number}}
   */
  function curveToEase(curva, duracaoSegundos, diferencaDeValor) {
    var outInfluence = Math.max(0.1, Math.min(curva.x1 * 100, 100));
    var inInfluence = Math.max(0.1, Math.min((1 - curva.x2) * 100, 100));

    var outSpeed = 0;
    var inSpeed = 0;

    if (diferencaDeValor !== 0 && duracaoSegundos > 0) {
      var outSlope = curva.y1 / (outInfluence / 100);
      var inSlope = (1 - curva.y2) / (inInfluence / 100);

      var unitSpeed = diferencaDeValor / duracaoSegundos;
      outSpeed = outSlope * unitSpeed;
      inSpeed = inSlope * unitSpeed;
    }

    return {
      outSpeed: outSpeed,
      outInfluence: outInfluence,
      inSpeed: inSpeed,
      inInfluence: inInfluence
    };
  }

  global.MotionKeyframes = {
    MAX_KEYS_PER_BATCH: MAX_KEYS_PER_BATCH,
    isSupportedProperty: isSupportedProperty,
    captureProperty: captureProperty,
    restoreProperty: restoreProperty,
    removeIndicesDescending: removeIndicesDescending,
    describeProperty: describeProperty,
    curveToEase: curveToEase
  };
}($.global));
