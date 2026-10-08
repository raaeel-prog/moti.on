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
        roving: spatial ? property.keyRoving(i) : false,
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
      // Recreating keys can make After Effects drop the PropertyBase selection
      // state. Keep it with the snapshot so multi-property edits restore the
      // same selection before restoring individual key selection.
      propertySelected: property.selected === true,
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

  /** @param {MotionPropertySnapshot[]} snapshots @returns {void} */
  function restoreSelections(snapshots) {
    // Recreating one property can clear selected keys on its siblings in AE.
    // Restore all parent selections only after every property has been written,
    // then restore the per-key selection in a second pass (also for rollback).
    for (var p = 0; p < snapshots.length; p += 1) {
      var selectedTarget = /** @type {MotionPropertySnapshot} */ (snapshots[p]);
      var selectProperty = selectedTarget.propertySelected === true;
      for (var pk = 0; pk < selectedTarget.keys.length; pk += 1) {
        var selectedTargetKey = selectedTarget.keys[pk];
        if (selectedTargetKey && selectedTargetKey.selected === true) {
          selectProperty = true;
          break;
        }
      }
      if (typeof selectedTarget.propertySelected === "boolean") selectedTarget.property.selected = selectProperty;
    }
    for (var q = 0; q < snapshots.length; q += 1) {
      var keyedTarget = /** @type {MotionPropertySnapshot} */ (snapshots[q]);
      for (var qk = 0; qk < keyedTarget.keys.length; qk += 1) {
        var keyedTargetKey = keyedTarget.keys[qk];
        if (!keyedTargetKey) throw new Error("Snapshot de selecao incompleto.");
        keyedTarget.property.setSelectedAtKey(qk + 1, keyedTargetKey.selected === true);
      }
    }
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
      // AE can promote LINEAR to BEZIER when ease is written. Restore the
      // requested interpolation last so rollback also preserves Linear/Hold.
      property.setInterpolationTypeAtKey(index, key.inInterpolation, key.outInterpolation);
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
      if (snapshot.spatial === true && i > 0 && i < keys.length - 1) {
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
    restoreSelections([snapshot]);
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
    // Guarda de finitude, espelhando `packages/keyframe-core/src/bezier.ts`.
    //
    // Sem ela um NaN atravessa a funcao inteira: o teste `!== 0` da linha de
    // baixo e VERDADEIRO para NaN, entao `unitSpeed` sai NaN, os dois speeds
    // saem NaN, e quem chama entrega `new KeyframeEase(NaN, ...)` ao After
    // Effects. O AE lanca la dentro, com uma mensagem que o dispatcher
    // descarta — e o usuario ve so HOST_OPERATION_FAILED, sem nada que aponte
    // para a causa. Foi exatamente esse o caminho do defeito de 2026-09-05 em
    // `keys-ease.jsx`, que passava `Number([x, y, z])` como diferenca.
    //
    // Falhar aqui e barato e diz o que houve, ANTES de qualquer escrita.
    /** @type {string[]} */
    var nomes = ["x1", "y1", "x2", "y2", "duracaoSegundos", "diferencaDeValor"];
    /** @type {number[]} */
    var valores = [curva.x1, curva.y1, curva.x2, curva.y2, duracaoSegundos, diferencaDeValor];
    var e;
    for (e = 0; e < valores.length; e += 1) {
      var valor = valores[e];
      if (typeof valor !== "number" || isNaN(valor) || !isFinite(valor)) {
        throw new Error(
          "Curva de ease invalida: " + nomes[e] + " precisa ser numero finito (recebido: " + valor + ")"
        );
      }
    }

    var outInfluence = Math.max(0.1, Math.min(curva.x1 * 100, 100));
    var inInfluence = Math.max(0.1, Math.min((1 - curva.x2) * 100, 100));

    var outSpeed = 0;
    var inSpeed = 0;

    // Divergencia deliberada da referencia: ela LANCA quando a duracao e <= 0;
    // aqui o segmento degenerado (dois keyframes no mesmo tempo) devolve
    // velocidade zero. E o comportamento que camera-transition e o effector ja
    // dependem, e nao produz valor invalido — so um segmento sem movimento.
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

  // --- Espelho ES3 de packages/keyframe-core/src/easing.ts -------------------
  //
  // A mesma aritmetica, na mesma ordem. `easing-paridade.test.mjs` compara as
  // duas implementacoes numa tabela com tolerancia 1e-12; qualquer divergencia
  // aparece la antes de chegar ao After Effects.

  /** @param {number} value @param {number} min @param {number} max @returns {number} */
  function clampNumber(value, min, max) {
    if (typeof value !== "number" || !isFinite(value)) return min;
    return value < min ? min : value > max ? max : value;
  }

  /** @param {number} t @param {number} p1 @param {number} p2 @returns {number} */
  function bezierPoint(t, p1, p2) {
    var u = 1 - t;
    return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  }

  /**
   * Parametro t cujo x(t) e igual a `x`, por bissecao.
   * @param {{x1: number, y1: number, x2: number, y2: number}} curva
   * @param {number} x
   * @returns {number}
   */
  function bezierTForX(curva, x) {
    var lo = 0;
    var hi = 1;
    var i;
    var mid;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    for (i = 0; i < 30; i += 1) {
      mid = (lo + hi) / 2;
      if (bezierPoint(mid, curva.x1, curva.x2) < x) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Valor y da curva em x absoluto (0..1).
   * @param {{x1: number, y1: number, x2: number, y2: number}} curva
   * @param {number} x
   * @returns {number}
   */
  function bezierValueAt(curva, x) {
    return bezierPoint(bezierTForX(curva, x), curva.y1, curva.y2);
  }

  /** @param {number} t @param {{amp: number, freq: number, decay: number, start: number}} p @returns {number} */
  function elasticRaw(t, p) {
    var e = Math.exp(-p.decay * t);
    var phase = 2 * Math.PI * p.freq * t;
    return 1 - (1 - p.start) * e * Math.cos(phase) + (p.amp - 1) * e * Math.sin(phase);
  }

  /** @param {number} t @param {{amp: number, freq: number, decay: number, start: number}} p @returns {number} */
  function elasticOut(t, p) {
    var u = clampNumber(t, 0, 1);
    return elasticRaw(u, p) - (elasticRaw(1, p) - 1) * u;
  }

  /** @param {number} t @param {{amp: number, freq: number, decay: number, start: number}} p @returns {number} */
  function bounceOut(t, p) {
    var u = clampNumber(t, 0, 1);
    var n = clampNumber(Math.round(p.freq), 0, 8);
    var heights = [];
    var durations = [1];
    var total = 1;
    var elapsed = 0;
    var i;
    var h;
    var d;
    var local;
    for (i = 1; i <= n; i += 1) {
      h = clampNumber(p.amp * Math.exp(-p.decay * (i - 1)), 0, 1);
      heights.push(h);
      d = Math.sqrt(h);
      durations.push(d);
      total += d;
    }
    for (i = 0; i < durations.length; i += 1) {
      d = Number(durations[i]) / total;
      if (u <= elapsed + d || i === durations.length - 1) {
        local = d <= 0 ? 1 : clampNumber((u - elapsed) / d, 0, 1);
        if (i === 0) return p.start + (1 - p.start) * local * local;
        return 1 - Number(heights[i - 1]) * 4 * local * (1 - local);
      }
      elapsed += d;
    }
    return 1;
  }

  /** @param {string} mode @param {number} t @param {{amp: number, freq: number, decay: number, start: number}} p @returns {number} */
  function halfOut(mode, t, p) {
    return mode === "bounce" ? bounceOut(t, p) : elasticOut(t, p);
  }

  /**
   * Valor (escala 0..1) de um easing assado em tempo normalizado `t`.
   *
   * @param {string} mode "elastic" | "bounce"
   * @param {{in: {amp: number, freq: number, decay: number, start: number}, out: {amp: number, freq: number, decay: number, start: number}, inCurve?: {x1: number, y1: number, x2: number, y2: number}|null, outCurve?: {x1: number, y1: number, x2: number, y2: number}|null}} params
   * @param {string} direction "in" | "out" | "inOut"
   * @param {number} t
   * @returns {number}
   */
  function easingValue(mode, params, direction, t) {
    var u = clampNumber(t, 0, 1);
    var local;
    var value;
    if (direction === "out") return halfOut(mode, u, params.out);
    if (direction === "in") return 1 - halfOut(mode, 1 - u, params["in"]);
    if (u < 0.5) {
      local = u * 2;
      value = params.inCurve ? bezierValueAt(params.inCurve, local) : 1 - halfOut(mode, 1 - local, params["in"]);
      return 0.5 * value;
    }
    local = u * 2 - 1;
    value = params.outCurve ? bezierValueAt(params.outCurve, local) : halfOut(mode, local, params.out);
    return 0.5 + 0.5 * value;
  }

  /**
   * Divide a curva absoluta (extremos (0,0) e (1,1) com alcas x1..y2 mais pontos
   * interiores) em curvas cubicas locais, cada uma normalizada na propria caixa
   * 0..1, para `curveToEase` valer por segmento.
   *
   * @param {{x1: number, y1: number, x2: number, y2: number}} curva
   * @param {Array<{x: number, y: number, inX: number, inY: number, outX: number, outY: number}>} points
   * @returns {{knots: Array<{x: number, y: number}>, segments: Array<{x1: number, y1: number, x2: number, y2: number}>}}
   */
  function normalizeCurveSegments(curva, points) {
    /** @type {Array<{x: number, y: number}>} */
    var knots = [{ x: 0, y: 0 }];
    var segments = [];
    var i;
    /** @type {{x: number, y: number}} */
    var a;
    /** @type {{x: number, y: number}} */
    var b;
    /** @type {{x: number, y: number}} */
    var p1;
    /** @type {{x: number, y: number}} */
    var p2;
    /** @type {{x: number, y: number, inX: number, inY: number, outX: number, outY: number}} */
    var ponto;
    var dx;
    var dy;
    var flat;
    for (i = 0; i < points.length; i += 1) {
      ponto = /** @type {{x: number, y: number, inX: number, inY: number, outX: number, outY: number}} */ (points[i]);
      knots.push({ x: ponto.x, y: ponto.y });
    }
    knots.push({ x: 1, y: 1 });
    for (i = 0; i < knots.length - 1; i += 1) {
      a = /** @type {{x: number, y: number}} */ (knots[i]);
      b = /** @type {{x: number, y: number}} */ (knots[i + 1]);
      if (i === 0) {
        p1 = { x: curva.x1, y: curva.y1 };
      } else {
        ponto = /** @type {{x: number, y: number, inX: number, inY: number, outX: number, outY: number}} */ (points[i - 1]);
        p1 = { x: ponto.outX, y: ponto.outY };
      }
      if (i === knots.length - 2) {
        p2 = { x: curva.x2, y: curva.y2 };
      } else {
        ponto = /** @type {{x: number, y: number, inX: number, inY: number, outX: number, outY: number}} */ (points[i]);
        p2 = { x: ponto.inX, y: ponto.inY };
      }
      dx = b.x - a.x;
      dy = b.y - a.y;
      flat = Math.abs(dy) < 1e-9;
      segments.push({
        x1: dx <= 0 ? 0 : clampNumber((p1.x - a.x) / dx, 0, 1),
        y1: flat ? 0 : (p1.y - a.y) / dy,
        x2: dx <= 0 ? 1 : clampNumber((p2.x - a.x) / dx, 0, 1),
        y2: flat ? 1 : (p2.y - a.y) / dy
      });
    }
    return { knots: knots, segments: segments };
  }

  /** A reverse retraces the same Bezier geometry: swap handles, do not negate
   * their offsets. Non-spatial temporal speed is signed; spatial speed is not.
   * @param {MotionCapturedKey} key @param {number} time @param {boolean} reverse
   * @returns {MotionCapturedKey} */
  function copyKey(key, time, reverse) {
    /** @param {MotionCapturedEase[]} source @returns {MotionCapturedEase[]} */
    function eases(source) {
      var result = [];
      for (var e = 0; e < source.length; e += 1) {
        var ease = source[e];
        if (ease) result.push({ speed: ease.speed * (reverse && !key.spatial ? -1 : 1), influence: ease.influence });
      }
      return result;
    }
    return {
      time: time, value: cloneValue(key.value),
      inInterpolation: reverse ? key.outInterpolation : key.inInterpolation,
      outInterpolation: reverse ? key.inInterpolation : key.outInterpolation,
      inEase: eases(reverse ? key.outEase : key.inEase),
      outEase: eases(reverse ? key.inEase : key.outEase),
      temporalContinuous: key.temporalContinuous, temporalAutoBezier: key.temporalAutoBezier,
      roving: key.roving, selected: key.selected, label: key.label,
      spatial: key.spatial ? {
        inTangent: cloneValue(reverse ? key.spatial.outTangent : key.spatial.inTangent),
        outTangent: cloneValue(reverse ? key.spatial.inTangent : key.spatial.outTangent),
        continuous: key.spatial.continuous, autoBezier: key.spatial.autoBezier
      } : null
    };
  }

  /** @param {Property} property @returns {Layer|null} */
  function ownerLayer(property) {
    var current = /** @type {any} */ (property);
    for (var depth = 0; current && current.parentProperty && depth < 64; depth += 1) current = current.parentProperty;
    return current && typeof current.inPoint === "number" ? current : null;
  }

  /** Builds every target before writing. No state survives a command.
   * @param {CompItem} comp @param {string} operation @param {string} destination
   * @returns {MotionKeyEditPlan} */
  function planEdit(comp, operation, destination) {
    /** @type {MotionPropertySnapshot[]} */
    var originals = [];
    var start = Infinity, end = -Infinity, count = 0, total = 0, i, j;
    /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionKeyEditPlan} */
    function rejected(code, message, details) {
      return { originals: [], targets: [], error: { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details } };
    }
    try {
      var properties = comp.selectedProperties;
      for (i = 0; i < properties.length; i += 1) {
        var property = /** @type {Property} */ (properties[i]);
        if (!property || property.propertyType !== PropertyType.PROPERTY || !property.selectedKeys || !property.selectedKeys.length) continue;
        if (!isSupportedProperty(property)) return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione propriedades numericas, vetoriais ou cores.");
        var layer = ownerLayer(property);
        if (layer && /** @type {any} */ (layer).locked) return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie as camadas selecionadas.");
        total += property.numKeys;
        if (total > MAX_KEYS_PER_BATCH) return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione um lote de ate 10.000 keyframes.");
        var snapshot = captureProperty(property);
        for (j = 0; j < snapshot.keys.length; j += 1) {
          var key = /** @type {MotionCapturedKey} */ (snapshot.keys[j]);
          key.selected = false;
          for (var s = 0; s < property.selectedKeys.length; s += 1) if (property.selectedKeys[s] === j + 1) key.selected = true;
          if (key.selected) { start = Math.min(start, key.time); end = Math.max(end, key.time); count += 1; }
        }
        originals.push(snapshot);
      }
      if (!count || (operation === "reverse" && count < 2)) return rejected(MotionContracts.ERROR.NO_SELECTION, "Selecione keyframes na timeline; para inverter, selecione ao menos dois.");
      if (operation !== "reverse" && total + count > MAX_KEYS_PER_BATCH) return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A duplicacao excede 10.000 keyframes. Reduza a selecao.");
      /** @type {MotionPropertySnapshot[]} */
      var targets = [];
      for (i = 0; i < originals.length; i += 1) {
        var original = /** @type {MotionPropertySnapshot} */ (originals[i]);
        var reverse = operation !== "repeat";
        // The smoothing toolbar duplicates every selected key, including the
        // turning point. Keep legacy mirror/after joins for existing callers;
        // after-gap creates a separate copy one frame after the selection.
        var anchor = end + (operation === "repeat" || destination === "after-gap" ? comp.frameDuration : 0);
        if (destination === "cti") anchor = comp.time;
        var layerDestination = destination === "layer-start" || destination === "layer-end";
        var edgeDestination = layerDestination || destination === "comp-start" || destination === "comp-end" || destination === "work-area-end";
        var boundaryStart = 0, boundaryEnd = comp.duration;
        var localStart = start, localEnd = end;
        if (layerDestination) {
          var owner = ownerLayer(original.property);
          if (!owner) return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nao foi possivel identificar a camada de destino.");
          // Each layer keeps the relative timing of all of its selected properties.
          localStart = Infinity; localEnd = -Infinity;
          for (var p = 0; p < originals.length; p += 1) {
            var sibling = originals[p];
            if (!sibling || ownerLayer(sibling.property) !== owner) continue;
            for (var q = 0; q < sibling.keys.length; q += 1) {
              var siblingKey = sibling.keys[q];
              if (siblingKey && siblingKey.selected) { localStart = Math.min(localStart, siblingKey.time); localEnd = Math.max(localEnd, siblingKey.time); }
            }
          }
          boundaryStart = Math.max(0, owner.inPoint);
          boundaryEnd = Math.min(comp.duration, owner.outPoint);
        } else if (destination === "work-area-end") {
          boundaryStart = Math.max(0, comp.workAreaStart);
          boundaryEnd = Math.min(comp.duration, comp.workAreaStart + comp.workAreaDuration);
        }
        var rangeStart = layerDestination ? localStart : start;
        var rangeEnd = layerDestination ? localEnd : end;
        if (edgeDestination) {
          if (!isFinite(boundaryStart) || !isFinite(boundaryEnd) || boundaryEnd < boundaryStart || rangeEnd - rangeStart > boundaryEnd - boundaryStart + TIME_TOLERANCE) {
            return rejected(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O grupo selecionado nao cabe no intervalo visivel de destino.");
          }
          anchor = destination === "layer-start" || destination === "comp-start" ? boundaryStart : boundaryEnd - (rangeEnd - rangeStart);
        }
        var keys = [];
        for (j = 0; j < original.keys.length; j += 1) {
          var source = /** @type {MotionCapturedKey} */ (original.keys[j]);
          if (operation !== "reverse" || !source.selected) {
            var retained = copyKey(source, source.time, false);
            if (operation !== "reverse") retained.selected = false;
            keys.push(retained);
          }
        }
        for (j = 0; j < original.keys.length; j += 1) {
          var selected = /** @type {MotionCapturedKey} */ (original.keys[j]);
          if (!selected.selected) continue;
          var time = operation === "reverse" ? start + end - selected.time : anchor + (reverse ? rangeEnd - selected.time : selected.time - rangeStart);
          if (!isFinite(time)) return rejected(MotionContracts.ERROR.INVALID_PRESET, "O tempo de destino nao e valido.");
          var added = copyKey(selected, time, reverse);
          added.selected = true;
          var merged = false;
          for (var k = 0; k < keys.length; k += 1) {
            var existing = /** @type {MotionCapturedKey} */ (keys[k]);
            if (Math.abs(existing.time - time) > TIME_TOLERANCE) continue;
            // Reuse the turning point, avoiding a duplicate frame/hold at the join.
            if (operation === "mirror" && destination === "after" && Math.abs(selected.time - end) <= TIME_TOLERANCE && Math.abs(time - end) <= TIME_TOLERANCE) {
              existing.outInterpolation = added.outInterpolation; existing.outEase = added.outEase;
              if (existing.spatial && added.spatial) existing.spatial.outTangent = added.spatial.outTangent;
              existing.temporalContinuous = false; existing.temporalAutoBezier = false;
              if (existing.spatial) { existing.spatial.continuous = false; existing.spatial.autoBezier = false; }
              existing.selected = true; merged = true;
            } else {
              var occupiedBySource = false;
              for (var c = 0; c < original.keys.length; c += 1) {
                var conflictSource = original.keys[c];
                if (conflictSource && conflictSource.selected && Math.abs(conflictSource.time - time) <= TIME_TOLERANCE) occupiedBySource = true;
              }
              var conflictOwner = ownerLayer(original.property);
              var recovery = destination === "cti" ? "Mova o indicador para um trecho livre ou use Duplicar depois." : edgeDestination ? "O inicio ou fim escolhido ja esta ocupado. Use Duplicar depois ou escolha outro trecho." : operation === "reverse" ? "Inclua o keyframe desse instante na selecao ou selecione outro trecho." : "Escolha um trecho livre depois da selecao.";
              return rejected(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Ja existe um keyframe no tempo de destino. " + recovery, {
                destination: destination,
                operation: operation,
                time: time,
                propertyName: original.property.name,
                layerName: conflictOwner ? conflictOwner.name : "",
                conflictWith: occupiedBySource ? "source" : "unselected"
              });
            }
          }
          if (!merged) keys.push(added);
        }
        keys.sort(function (a, b) { return a.time - b.time; });
        var times = [];
        for (j = 0; j < keys.length; j += 1) times.push(/** @type {MotionCapturedKey} */ (keys[j]).time);
        validateTimes(times, keys.length);
        targets.push({ property: original.property, propertySelected: original.propertySelected, spatial: original.spatial, supportsLabels: original.supportsLabels, keys: keys });
      }
      return { originals: originals, targets: targets, error: null };
    } catch (error) {
      return rejected(MotionContracts.ERROR.HOST_OPERATION_FAILED, "Nao foi possivel ler os keyframes selecionados.");
    }
  }

  /** @param {MotionKeyEditPlan} plan @returns {MotionCommandResult} */
  function applyEdit(plan) {
    if (plan.error) {
      var invalid = /** @type {Error & {motionCode?: string}} */ (new Error(plan.error.message));
      invalid.motionCode = plan.error.code; throw invalid;
    }
    var touched = -1;
    try {
      for (var i = 0; i < plan.targets.length; i += 1) {
        touched = i;
        restoreProperty(/** @type {MotionPropertySnapshot} */ (plan.targets[i]), null);
      }
      restoreSelections(plan.targets);
    } catch (error) {
      var failed = false;
      for (var r = touched; r >= 0; r -= 1) {
        try { restoreProperty(/** @type {MotionPropertySnapshot} */ (plan.originals[r]), null); } catch (rollback) { failed = true; }
      }
      try { restoreSelections(plan.originals); } catch (selectionRollback) { failed = true; }
      throw MotionErrors.error(
        failed ? "hostError.rollbackIncomplete" : "hostError.writeRefusedRestored",
        failed ? "Falha ao restaurar keyframes. Use Desfazer." : "O host recusou a escrita; os keyframes foram restaurados.",
        null,
        failed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED
      );
    }
    return { changed: plan.targets.length > 0, warnings: [], data: { propertyCount: plan.targets.length } };
  }

  global.MotionKeyframes = {
    planEdit: planEdit,
    applyEdit: applyEdit,
    MAX_KEYS_PER_BATCH: MAX_KEYS_PER_BATCH,
    isSupportedProperty: isSupportedProperty,
    captureProperty: captureProperty,
    restoreProperty: restoreProperty,
    removeIndicesDescending: removeIndicesDescending,
    describeProperty: describeProperty,
    curveToEase: curveToEase,
    bezierValueAt: bezierValueAt,
    easingValue: easingValue,
    normalizeCurveSegments: normalizeCurveSegments
  };
}($.global));
