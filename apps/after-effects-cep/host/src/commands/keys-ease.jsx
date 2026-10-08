/* global KeyframeInterpolationType */
/**
 * Aplica curva Bézier cúbica a keyframes selecionados.
 *
 * CHMS-018: Suavizador de keyframes com curva editável.
 */
(function () {
  var REQUIRED_ARGS = {
    x1: true,
    y1: true,
    x2: true,
    y2: true,
    applyIn: true,
    applyOut: true
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
  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** Argumentos opcionais. Apenas os de MODE_ARGS sao mutuamente exclusivos. */
  var EXTRA_ARGS = { build: true, points: true, bake: true, expectedSelection: true, session: true };
  var MODE_ARGS = { build: true, points: true, bake: true };
  var SESSION_FIELDS = ["signature", "segments"];
  var SEGMENT_FIELDS = ["propertyId", "layerIndex", "t0", "t1", "generated"];
  var GENERATED_FIELDS = ["time", "value"];
  var MAX_SESSION_SEGMENTS = 200;
  var MAX_SESSION_GENERATED = 10000;
  var MAX_VALUE_COMPONENTS = 4;
  var VALUE_ABS_TOLERANCE = 0.0001;
  var VALUE_REL_TOLERANCE = 0.000001;
  var POINT_FIELDS = ["x", "y", "inX", "inY", "outX", "outY"];
  var OSCILLATION_FIELDS = ["amp", "freq", "decay", "start"];
  var CURVE_FIELDS = ["x1", "y1", "x2", "y2"];
  var MAX_POINTS = 16;
  var MIN_POINT_GAP = 0.01;
  var MAX_BAKE_FRAMES_PER_SEGMENT = 3600;
  var MAX_BAKE_KEYS_TOTAL = 10000;

  /** @param {string[]} allowed @param {Record<string, unknown>} obj @returns {string|null} primeira chave desconhecida */
  function unknownKey(allowed, obj) {
    var key;
    var i;
    var known;
    for (key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      known = false;
      for (i = 0; i < allowed.length; i += 1) if (allowed[i] === key) known = true;
      if (!known) return key;
    }
    return null;
  }

  /** @param {unknown} value @returns {boolean} */
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !(value instanceof Array);
  }

  /**
   * Pontos interiores da curva: x estritamente crescente dentro de (0,1) com
   * folga minima, y e alcas dentro da faixa do editor, alcas presas ao proprio
   * no (`inX <= x <= outX`).
   *
   * @param {unknown} points
   * @returns {MotionCommandFailure|null}
   */
  function validatePoints(points) {
    var i;
    var f;
    var p;
    var previous = 0;
    var ultimo;
    var value;
    if (!(points instanceof Array) || points.length < 1 || points.length > MAX_POINTS) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Pontos da curva invalidos (1 a 16).", { field: "points", index: -1 });
    }
    for (i = 0; i < points.length; i += 1) {
      p = /** @type {Record<string, unknown>} */ (points[i]);
      if (!isPlainObject(p) || unknownKey(POINT_FIELDS, p) !== null) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Ponto da curva com formato desconhecido.", { field: "points", index: i });
      }
      for (f = 0; f < POINT_FIELDS.length; f += 1) {
        value = p[String(POINT_FIELDS[f])];
        if (!isNumber(value)) {
          return failure(MotionContracts.ERROR.INVALID_PRESET, "Ponto da curva precisa de numeros finitos.", { field: "points", index: i });
        }
      }
      ultimo = i === points.length - 1;
      if (!(Number(p.x) > 0 && Number(p.x) < 1) || Number(p.x) - previous < MIN_POINT_GAP || (ultimo && 1 - Number(p.x) < MIN_POINT_GAP)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Pontos da curva precisam crescer em x, dentro de 0 e 1.", { field: "points", index: i });
      }
      if (Number(p.y) < -1 || Number(p.y) > 2 || Number(p.inY) < -1 || Number(p.inY) > 2 || Number(p.outY) < -1 || Number(p.outY) > 2) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor do ponto fora da faixa -1..2.", { field: "points", index: i });
      }
      if (Number(p.inX) < 0 || Number(p.inX) > 1 || Number(p.outX) < 0 || Number(p.outX) > 1 || Number(p.inX) > Number(p.x) || Number(p.outX) < Number(p.x)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Alcas do ponto fora do segmento.", { field: "points", index: i });
      }
      previous = Number(p.x);
    }
    return null;
  }

  /** @param {unknown} curve @param {string} field @returns {MotionCommandFailure|null} */
  function validateHalfCurve(curve, field) {
    var c = /** @type {Record<string, unknown>} */ (curve);
    var i;
    if (!isPlainObject(c) || unknownKey(CURVE_FIELDS, c) !== null) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de metade invalida.", { field: field });
    }
    for (i = 0; i < CURVE_FIELDS.length; i += 1) {
      if (!isNumber(c[String(CURVE_FIELDS[i])])) return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de metade precisa de numeros finitos.", { field: field });
    }
    if (Number(c.x1) < 0 || Number(c.x1) > 1 || Number(c.x2) < 0 || Number(c.x2) > 1 || Number(c.y1) < -1 || Number(c.y1) > 2 || Number(c.y2) < -1 || Number(c.y2) > 2) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de metade fora da faixa.", { field: field });
    }
    return null;
  }

  /** @param {unknown} osc @param {string} field @returns {MotionCommandFailure|null} */
  function validateOscillation(osc, field) {
    var o = /** @type {Record<string, unknown>} */ (osc);
    var i;
    if (!isPlainObject(o) || unknownKey(OSCILLATION_FIELDS, o) !== null) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametros de oscilacao invalidos.", { field: field });
    }
    for (i = 0; i < OSCILLATION_FIELDS.length; i += 1) {
      if (!isNumber(o[String(OSCILLATION_FIELDS[i])])) return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametros de oscilacao precisam de numeros finitos.", { field: field });
    }
    if (Number(o.amp) < 0 || Number(o.amp) > 4 || Number(o.freq) < 0.1 || Number(o.freq) > 20 || Number(o.decay) < 0 || Number(o.decay) > 30 || Number(o.start) < 0 || Number(o.start) > 0.99) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de oscilacao fora da faixa.", { field: field });
    }
    return null;
  }

  /** @param {unknown} bake @returns {MotionCommandFailure|null} */
  function validateBake(bake) {
    var b = /** @type {Record<string, unknown>} */ (bake);
    var error;
    if (!isPlainObject(b) || unknownKey(["mode", "direction", "in", "out", "inCurve", "outCurve"], b) !== null) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametros de easing assado invalidos.", { field: "bake" });
    }
    if (b.mode !== "elastic" && b.mode !== "bounce") return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de easing desconhecido.", { field: "bake.mode" });
    if (b.direction !== "in" && b.direction !== "out" && b.direction !== "inOut") return failure(MotionContracts.ERROR.INVALID_PRESET, "Direcao de easing desconhecida.", { field: "bake.direction" });
    error = validateOscillation(b["in"], "bake.in");
    if (error) return error;
    error = validateOscillation(b.out, "bake.out");
    if (error) return error;
    if (Object.prototype.hasOwnProperty.call(b, "inCurve") && b.inCurve !== null) {
      error = validateHalfCurve(b.inCurve, "bake.inCurve");
      if (error) return error;
    }
    if (Object.prototype.hasOwnProperty.call(b, "outCurve") && b.outCurve !== null) {
      error = validateHalfCurve(b.outCurve, "bake.outCurve");
      if (error) return error;
    }
    return null;
  }

  /**
   * Sessao devolvida por um pedido anterior deste comando e mandada de volta
   * pelo painel: assinatura da selecao e, por segmento, os keyframes gerados
   * que o host pode descartar antes de reaplicar. So a FORMA e validada aqui;
   * a comparacao com a timeline e do preflight, com a composicao em maos.
   *
   * @param {unknown} session
   * @returns {MotionCommandFailure|null}
   */
  function validateSession(session) {
    var s = /** @type {Record<string, unknown>} */ (session);
    var segments;
    var totalGenerated = 0;
    var i;
    var g;
    var c;
    if (!isPlainObject(s) || unknownKey(SESSION_FIELDS, s) !== null) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Sessao de Ease invalida.", { field: "session" });
    }
    if (typeof s.signature !== "string") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Sessao de Ease sem assinatura.", { field: "session.signature" });
    }
    segments = s.segments;
    if (!(segments instanceof Array) || segments.length > MAX_SESSION_SEGMENTS) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Segmentos da sessao invalidos (ate 200).", { field: "session.segments" });
    }
    for (i = 0; i < segments.length; i += 1) {
      var seg = /** @type {Record<string, unknown>} */ (segments[i]);
      if (!isPlainObject(seg) || unknownKey(SEGMENT_FIELDS, seg) !== null) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Segmento da sessao com formato desconhecido.", { field: "session.segments", index: i });
      }
      if (typeof seg.propertyId !== "string" || !isNumber(seg.layerIndex) || !isNumber(seg.t0) || !isNumber(seg.t1)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Segmento da sessao precisa de id e tempos finitos.", { field: "session.segments", index: i });
      }
      if (!(Number(seg.t1) > Number(seg.t0))) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Segmento da sessao precisa de t1 maior que t0.", { field: "session.segments", index: i });
      }
      var generated = seg.generated;
      if (!(generated instanceof Array)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Segmento da sessao sem lista de keyframes gerados.", { field: "session.segments", index: i });
      }
      totalGenerated += generated.length;
      if (totalGenerated > MAX_SESSION_GENERATED) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "A sessao descreve mais de 10.000 keyframes.", { field: "session.segments", index: i });
      }
      for (g = 0; g < generated.length; g += 1) {
        var entry = /** @type {Record<string, unknown>} */ (generated[g]);
        if (!isPlainObject(entry) || unknownKey(GENERATED_FIELDS, entry) !== null || !isNumber(entry.time)) {
          return failure(MotionContracts.ERROR.INVALID_PRESET, "Keyframe gerado da sessao com formato desconhecido.", { field: "session.segments", index: i });
        }
        var value = entry.value;
        if (value instanceof Array) {
          if (value.length < 1 || value.length > MAX_VALUE_COMPONENTS) {
            return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor gerado da sessao com dimensao invalida.", { field: "session.segments", index: i });
          }
          for (c = 0; c < value.length; c += 1) {
            if (!isNumber(value[c])) return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor gerado da sessao precisa de numeros finitos.", { field: "session.segments", index: i });
          }
        } else if (!isNumber(value)) {
          return failure(MotionContracts.ERROR.INVALID_PRESET, "Valor gerado da sessao precisa ser numero ou vetor.", { field: "session.segments", index: i });
        }
      }
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    var modes = 0;
    var error;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(EXTRA_ARGS, key) && !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Ease desconhecido.", { field: key });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Ease ausente.", { field: key });
      }
    }
    for (key in MODE_ARGS) {
      if (Object.prototype.hasOwnProperty.call(MODE_ARGS, key) && Object.prototype.hasOwnProperty.call(args, key)) modes += 1;
    }
    if (modes > 1) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Use apenas um de build, points ou bake.", null);
    }
    if (Object.prototype.hasOwnProperty.call(args, "expectedSelection") && typeof args.expectedSelection !== "string") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "expectedSelection precisa ser texto.", { field: "expectedSelection" });
    }
    if (Object.prototype.hasOwnProperty.call(args, "session")) {
      error = validateSession(args.session);
      if (error) return error;
    }
    if (Object.prototype.hasOwnProperty.call(args, "build") && (!args.build || typeof args.build !== "object")) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametros de animacao invalidos.", null);
    }
    if (Object.prototype.hasOwnProperty.call(args, "points")) {
      error = validatePoints(args.points);
      if (error) return error;
    }
    if (Object.prototype.hasOwnProperty.call(args, "bake")) {
      error = validateBake(args.bake);
      if (error) return error;
    }
    if (!isNumber(args.x1) || !isNumber(args.y1) || !isNumber(args.x2) || !isNumber(args.y2)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de Ease invalida (deve ser numero).", null);
    }
    var x1 = /** @type {number} */ (args.x1);
    var x2 = /** @type {number} */ (args.x2);
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Handles X devem estar entre 0 e 1.", null);
    }
    if (!args.build && !args.bake && args.applyIn === false && args.applyOut === false) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Ative Entrada ou Saida.", null);
    }
    if (typeof args.applyIn !== "boolean" || typeof args.applyOut !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Flags applyIn/applyOut invalidas.", null);
    }
    return null;
  }

  /**
   * Propriedade espacial: Position, Anchor Point, Point of Interest.
   *
   * @param {Property} property
   * @returns {boolean}
   */
  function ehEspacial(property) {
    if (typeof PropertyValueType === "undefined") return false;
    return (
      property.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
      property.propertyValueType === PropertyValueType.ThreeD_SPATIAL
    );
  }

  /**
   * Diferenca escalar entre dois valores de keyframe, para alimentar a curva.
   *
   * Tres casos, e eles NAO sao intercambiaveis:
   *
   * - **Espacial** (Position): o After Effects guarda UM unico ease temporal,
   *   porque a velocidade ao longo do caminho e unidimensional por definicao —
   *   mas `keyValue()` devolve `[x, y]` ou `[x, y, z]`. A diferenca que importa
   *   e o comprimento da corda entre os dois pontos, que e a distancia
   *   percorrida no segmento. Foi aqui o defeito: o codigo antigo deduzia a
   *   dimensionalidade de `keyInTemporalEase().length`, via 1, e caia no ramo
   *   escalar fazendo `Number([100, 200, 0])` — que e NaN. O NaN virava
   *   `new KeyframeEase(NaN, ...)` e o After Effects lancava, com a mensagem
   *   descartada pelo dispatcher.
   * - **Vetorial nao espacial** (Scale, Color): um ease por dimensao, e cada um
   *   descreve a propria componente. Diferenca por dimensao.
   * - **Escalar** (Opacity, Rotation): diferenca direta.
   *
   * `camera-transition.jsx` ja fazia a conta por dimensao a partir do array;
   * este arquivo era o unico que nao fazia.
   *
   * @param {Property} property
   * @param {unknown} valorA valor do keyframe inicial do segmento
   * @param {unknown} valorB valor do keyframe final do segmento
   * @param {number} dimensao indice da componente, ignorado no caso espacial
   * @returns {number}
   */
  function diferencaDeValor(property, valorA, valorB, dimensao) {
    if (ehEspacial(property)) {
      var a = /** @type {number[]} */ (valorA);
      var b = /** @type {number[]} */ (valorB);
      if (!a || !b || typeof a.length !== "number") return 0;
      var soma = 0;
      var k;
      for (k = 0; k < a.length; k += 1) {
        var delta = Number(b[k]) - Number(a[k]);
        if (isNaN(delta)) return 0;
        soma += delta * delta;
      }
      return Math.sqrt(soma);
    }

    var arrA = /** @type {number[]} */ (valorA);
    var arrB = /** @type {number[]} */ (valorB);
    if (arrA && arrB && typeof arrA.length === "number" && typeof arrA[dimensao] === "number") {
      var diff = Number(arrB[dimensao]) - Number(arrA[dimensao]);
      return isNaN(diff) ? 0 : diff;
    }

    var escalar = Number(valorB) - Number(valorA);
    return isNaN(escalar) ? 0 : escalar;
  }

  /** @typedef {{x1: number, y1: number, x2: number, y2: number}} EaseCurve */

  /** @param {EaseCurve} curva @returns {boolean} */
  function curvaLinear(curva) {
    return Math.abs(curva.x1 - curva.y1) < 0.000001 && Math.abs(curva.x2 - curva.y2) < 0.000001;
  }

  /**
   * Escreve uma curva por lado num keyframe. `null` deixa o lado como esta.
   *
   * **Precondicao:** `MotionKeyframes.isSupportedProperty(property)` e
   * verdadeiro. Quem chama e o `run`, e e la que a allowlist mora — junto do
   * snapshot, porque as duas decisoes sao a mesma: nao se escreve numa
   * propriedade que nao se sabe desfazer. Repetir a checagem aqui produziria uma
   * guarda que nenhum teste alcanca pelo dispatcher, e guarda inalcancavel e
   * falsa seguranca, nao seguranca dobrada.
   *
   * Cada lado decide sozinho se e linear (`x1 == y1 && x2 == y2` da PROPRIA
   * curva): um no interior da curva multiponto pode ter entrada curva e saida
   * reta.
   *
   * @param {Property} property
   * @param {number} keyIndex
   * @param {EaseCurve|null} inCurve
   * @param {EaseCurve|null} outCurve
   * @returns {boolean} true quando o keyframe recebeu curva.
   */
  function applyEaseSides(property, keyIndex, inCurve, outCurve) {
    var numKeys = property.numKeys;
    var applyIn = !!inCurve && keyIndex > 1;
    var applyOut = !!outCurve && keyIndex < numKeys;
    if (!applyIn && !applyOut) return false;
    var linearIn = applyIn ? curvaLinear(/** @type {EaseCurve} */ (inCurve)) : true;
    var linearOut = applyOut ? curvaLinear(/** @type {EaseCurve} */ (outCurve)) : true;
    var linear = linearIn && linearOut;

    var currentInEase = property.keyInTemporalEase(keyIndex);
    var currentOutEase = property.keyOutTemporalEase(keyIndex);
    var inType = applyIn ? (linearIn ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER) : property.keyInInterpolationType(keyIndex);
    var outType = applyOut ? (linearOut ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER) : property.keyOutInterpolationType(keyIndex);

    // Quantos `KeyframeEase` o After Effects espera de volta. Vem do proprio
    // ease atual, que e a unica fonte confiavel: numa propriedade espacial e 1
    // mesmo com valor de tres componentes. O que NAO se deduz daqui e a forma
    // do VALOR — essa pergunta e do `diferencaDeValor`.
    var dimensions = currentInEase.length;
    var newInEase = [];
    var newOutEase = [];
    var d;

    // In Ease (segmento anterior: keyIndex - 1 ate keyIndex)
    if (applyIn) {
      var inDuration = property.keyTime(keyIndex) - property.keyTime(keyIndex - 1);
      var inVal1 = property.keyValue(keyIndex - 1);
      var inVal2 = property.keyValue(keyIndex);

      for (d = 0; d < dimensions; d++) {
        var diffIn = diferencaDeValor(property, inVal1, inVal2, d);
        var easeInResult = MotionKeyframes.curveToEase(/** @type {EaseCurve} */ (inCurve), inDuration, diffIn);
        newInEase.push(new KeyframeEase(easeInResult.inSpeed, easeInResult.inInfluence));
      }
    } else {
      for (d = 0; d < dimensions; d++) newInEase.push(/** @type {KeyframeEase} */ (currentInEase[d]));
    }

    // Out Ease (segmento proximo: keyIndex ate keyIndex + 1)
    if (applyOut) {
      var outDuration = property.keyTime(keyIndex + 1) - property.keyTime(keyIndex);
      var outVal1 = property.keyValue(keyIndex);
      var outVal2 = property.keyValue(keyIndex + 1);

      for (d = 0; d < dimensions; d++) {
        var diffOut = diferencaDeValor(property, outVal1, outVal2, d);
        var easeOutResult = MotionKeyframes.curveToEase(/** @type {EaseCurve} */ (outCurve), outDuration, diffOut);
        newOutEase.push(new KeyframeEase(easeOutResult.outSpeed, easeOutResult.outInfluence));
      }
    } else {
      for (d = 0; d < dimensions; d++) newOutEase.push(/** @type {KeyframeEase} */ (currentOutEase[d]));
    }

    // Interpolacao ANTES do ease, e nao depois.
    //
    // Um keyframe Hold nao tem velocidade; escrever ease temporal nele enquanto
    // ainda esta marcado como Hold e justamente a chamada que o After Effects
    // recusa. Trocar para Bezier primeiro deixa o keyframe pronto para receber
    // a curva. A ordem inversa estava aqui desde o inicio, e o comentario
    // antigo afirmava que o Hold "perde o estado ao receber Ease" — o codigo
    // fazia o contrario, preservando o Hold do lado nao aplicado.
    property.setInterpolationTypeAtKey(
      keyIndex,
      inType,
      outType
    );
    if (!linear) {
      property.setTemporalContinuousAtKey(keyIndex, false);
      property.setTemporalAutoBezierAtKey(keyIndex, false);
      property.setTemporalEaseAtKey(keyIndex, newInEase, newOutEase);
      property.setInterpolationTypeAtKey(keyIndex, inType, outType);
    }
    return true;
  }

  /**
   * Mesma curva nos dois lados, ligados por flag. Casca fina sobre
   * `applyEaseSides` que preserva a assinatura historica do comando.
   *
   * @param {Property} property
   * @param {number} keyIndex
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {boolean} applyIn
   * @param {boolean} applyOut
   * @returns {boolean} true quando o keyframe recebeu a curva.
   */
  function applyEaseToKeyframe(property, keyIndex, x1, y1, x2, y2, applyIn, applyOut) {
    var curva = { x1: x1, y1: y1, x2: x2, y2: y2 };
    return applyEaseSides(property, keyIndex, applyIn ? curva : null, applyOut ? curva : null);
  }

  /**
   * Desfaz o que ja foi escrito e lanca o erro que o dispatcher traduz.
   * HOST_OPERATION_FAILED quando tudo voltou; ROLLBACK_FAILED quando ao menos
   * uma propriedade nao pode ser restaurada (o painel pede Desfazer).
   *
   * @param {MotionPropertySnapshot[]} intactos
   * @returns {never}
   */
  function rollback(intactos) {
    var rollbackFailed = false;
    var r;
    for (r = intactos.length - 1; r >= 0; r -= 1) {
      try {
        var intacto = intactos[r];
        if (intacto) MotionKeyframes.restoreProperty(intacto, null);
      } catch (restoreError) {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      var rollbackError = /** @type {Error & {motionCode?: string}} */ (
        new Error("Ease falhou e o estado anterior nao pode ser restaurado.")
      );
      rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
      throw rollbackError;
    }
    var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Ease falhou."));
    failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
    throw failErr;
  }

  /**
   * Propriedade ignorada vira aviso, e nao silencio.
   *
   * O comando declara `allowsNoopSuccess: true`, entao uma selecao inteira de
   * propriedades sem curva responderia `ok: true` — e o painel diria "curva
   * aplicada" sobre zero keyframes. O aviso e a contagem real sao o que
   * impede essa mentira; o cliente le `appliedCount` e mostra o numero.
   *
   * @param {number} ignoradas
   * @param {number} semSegmento
   * @returns {Array<{code: string, message: string, details: unknown}>}
   */
  function avisosDeSelecao(ignoradas, semSegmento) {
    var avisos = [];
    if (ignoradas > 0) {
      avisos.push({
        code: "EASE_PROPERTY_SKIPPED",
        message:
          ignoradas +
          " propriedade(s) selecionada(s) nao aceitam curva de velocidade e ficaram como estavam.",
        details: { properties: ignoradas }
      });
    }
    if (semSegmento > 0) {
      avisos.push({
        code: "EASE_NO_SELECTED_SEGMENT",
        message:
          semSegmento +
          " propriedade(s) sem segmento para suavizar. Selecione keyframes consecutivos ou um keyframe com vizinho no lado Entrada/Saida ativado.",
        details: { properties: semSegmento }
      });
    }
    return avisos;
  }

  /** @param {number} time @param {number} frameDuration @returns {number} */
  function snapToFrame(time, frameDuration) {
    return Math.round(time / frameDuration) * frameDuration;
  }

  /**
   * Indice do keyframe no tempo `time`, com tolerancia de meio quadro; 0 quando
   * nao ha keyframe nesse quadro. E a unica forma de reencontrar um keyframe
   * entre dois pedidos: indices mudam a cada insercao, tempos nao.
   *
   * @param {Property} property
   * @param {number} time
   * @param {number} frameDuration
   * @returns {number}
   */
  function indexAt(property, time, frameDuration) {
    var tolerance = frameDuration / 2;
    var idx;
    var i;
    if (!property.numKeys) return 0;
    if (typeof /** @type {any} */ (property).nearestKeyIndex === "function") {
      idx = indiceNoTempo(property, time);
      if (idx < 1 || idx > property.numKeys) return 0;
      return Math.abs(property.keyTime(idx) - time) <= tolerance ? idx : 0;
    }
    for (i = 1; i <= property.numKeys; i += 1) {
      if (Math.abs(property.keyTime(i) - time) <= tolerance) return i;
    }
    return 0;
  }

  /** @param {number} a @param {number} b @returns {boolean} */
  function numbersMatch(a, b) {
    var scale = Math.abs(a) > Math.abs(b) ? Math.abs(a) : Math.abs(b);
    return Math.abs(a - b) <= VALUE_ABS_TOLERANCE + VALUE_REL_TOLERANCE * scale;
  }

  /**
   * Valor atual do keyframe contra o valor gravado na sessao, componente a
   * componente. Diferenca acima da tolerancia significa que o usuario editou o
   * keyframe gerado, e ele deixa de ser descartavel.
   *
   * @param {unknown} current
   * @param {unknown} recorded
   * @returns {boolean}
   */
  function valuesMatch(current, recorded) {
    var a = /** @type {number[]} */ (current);
    var b = /** @type {number[]} */ (recorded);
    var c;
    if (typeof recorded === "number") {
      return typeof current === "number" && numbersMatch(current, recorded);
    }
    if (!a || !b || typeof a.length !== "number" || typeof b.length !== "number" || a.length !== b.length) return false;
    for (c = 0; c < a.length; c += 1) {
      if (typeof a[c] !== "number" || typeof b[c] !== "number" || !numbersMatch(Number(a[c]), Number(b[c]))) return false;
    }
    return true;
  }

  /**
   * Propriedades selecionadas, suportadas e com keyframes selecionados, por id
   * estavel de `describeProperty`. E o universo que uma sessao pode referenciar.
   *
   * @param {CompItem} comp
   * @returns {Record<string, Property>}
   */
  function selectedById(comp) {
    /** @type {Record<string, Property>} */
    var byId = {};
    var selectedProps = comp.selectedProperties;
    var p;
    for (p = 0; p < selectedProps.length; p += 1) {
      var propRaw = selectedProps[p];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      if (!prop.selectedKeys || prop.selectedKeys.length === 0) continue;
      if (!MotionKeyframes.isSupportedProperty(prop)) continue;
      byId[String(MotionKeyframes.describeProperty(comp, prop).id)] = prop;
    }
    return byId;
  }

  /** @typedef {{ propertyId: string, layerIndex: number, t0: number, t1: number, generated: Array<{time: number, value: unknown}> }} EaseSessionSegment */
  /** @typedef {{ signature: string, segments: EaseSessionSegment[] }} EaseSession */

  /**
   * Segmentos da sessao agrupados pela propriedade selecionada que os possui.
   *
   * @param {CompItem} comp
   * @param {EaseSession} session
   * @returns {Record<string, EaseSessionSegment[]>}
   */
  function segmentsByProperty(comp, session) {
    /** @type {Record<string, EaseSessionSegment[]>} */
    var out = {};
    var i;
    for (i = 0; i < session.segments.length; i += 1) {
      var seg = /** @type {EaseSessionSegment} */ (session.segments[i]);
      var id = String(seg.propertyId);
      if (!Object.prototype.hasOwnProperty.call(out, id)) out[id] = [];
      /** @type {EaseSessionSegment[]} */ (out[id]).push(seg);
    }
    return out;
  }

  /** @param {EaseSessionSegment} seg @param {number} time @param {number} tolerance @returns {boolean} */
  function isGeneratedTime(seg, time, tolerance) {
    var g;
    for (g = 0; g < seg.generated.length; g += 1) {
      var entry = /** @type {{time: number}} */ (seg.generated[g]);
      if (Math.abs(Number(entry.time) - time) <= tolerance) return true;
    }
    return false;
  }

  /**
   * A sessao descreve keyframes que ESTE comando gerou num pedido anterior.
   * Antes de os descartar, cada um precisa continuar exatamente como foi
   * deixado: no mesmo quadro, com o mesmo valor, e sem keyframe do usuario no
   * meio do segmento. Qualquer divergencia recusa antes de qualquer escrita —
   * o comando nunca apaga um keyframe que nao criou.
   *
   * @param {CompItem} comp
   * @param {EaseSession} session
   * @returns {MotionCommandFailure|null}
   */
  function validateSessionAgainstComp(comp, session) {
    var fd = comp.frameDuration;
    var tolerance = fd / 2;
    var byId;
    var i;
    var g;
    var j;
    if (session.signature !== MotionSelection.signature(comp)) {
      return failure(MotionContracts.ERROR.STALE_SELECTION, "A selecao mudou.", { messageKey: "hostError.staleSelection" });
    }
    byId = selectedById(comp);
    for (i = 0; i < session.segments.length; i += 1) {
      var seg = /** @type {EaseSessionSegment} */ (session.segments[i]);
      var id = String(seg.propertyId);
      if (!Object.prototype.hasOwnProperty.call(byId, id)) {
        return failure(MotionContracts.ERROR.STALE_SELECTION, "A selecao mudou.", { messageKey: "hostError.staleSelection", propertyId: id });
      }
      var prop = /** @type {Property} */ (byId[id]);
      var nome = prop.name || prop.matchName || "Property";
      var k0 = indexAt(prop, Number(seg.t0), fd);
      var k1 = indexAt(prop, Number(seg.t1), fd);
      if (!k0 || !k1 || k1 <= k0) {
        return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Os keyframes do segmento foram editados ou removidos.", { messageKey: "hostError.easeGeneratedEdited", propertyName: nome });
      }
      for (g = 0; g < seg.generated.length; g += 1) {
        var entry = /** @type {{time: number, value: unknown}} */ (seg.generated[g]);
        var idx = indexAt(prop, Number(entry.time), fd);
        if (!idx || !valuesMatch(prop.keyValue(idx), entry.value)) {
          return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Os keyframes gerados pela curva foram editados.", { messageKey: "hostError.easeGeneratedEdited", propertyName: nome, time: Number(entry.time) });
        }
      }
      for (j = k0 + 1; j < k1; j += 1) {
        var t = prop.keyTime(j);
        if (!isGeneratedTime(seg, t, tolerance)) {
          return failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Ja existe um keyframe no quadro de um ponto da curva. Afaste o ponto ou use um segmento mais longo.", {
            propertyName: nome,
            time: t,
            point: -1
          });
        }
      }
    }
    return null;
  }

  /**
   * @typedef {{ k: number, t0: number, t1: number, times: number[], ignore: EaseSessionSegment|null }} SegmentPair
   * @typedef {{ property: Property, id: string, layerIndex: number, pairs: SegmentPair[] }} SegmentPlanItem
   * @typedef {{ error: MotionCommandFailure|null, items: SegmentPlanItem[], ignoradas: number, semSegmento: number }} SegmentPlan
   */

  /** @param {Record<string, unknown>} args @returns {string} "points" | "bake" | "plain" */
  function modeOf(args) {
    if (args.points instanceof Array) return "points";
    if (args.bake) return "bake";
    return "plain";
  }

  /**
   * Planeja sem escrever nada. Para cada propriedade suportada com keys
   * selecionadas, os pares (t0, t1) a tratar: com sessao, os segmentos que ela
   * gravou para a propriedade; sem sessao, keys selecionadas vizinhas por
   * indice. `times` sao os tempos dos novos keyframes de cada par, ja ajustados
   * ao quadro da composicao (vazio na curva simples). `preflight` e `run`
   * chamam os dois; nada sobrevive entre as chamadas.
   *
   * @param {CompItem} comp
   * @param {Record<string, unknown>} args
   * @param {EaseSession|null} session
   * @returns {SegmentPlan}
   */
  function planSegments(comp, args, session) {
    var fd = comp.frameDuration;
    var tolerance = fd / 2;
    var mode = modeOf(args);
    var points = /** @type {Array<Record<string, number>>|null} */ (mode === "points" ? args.points : null);
    var bySession = session ? segmentsByProperty(comp, session) : null;
    var selectedProps = comp.selectedProperties;
    /** @type {SegmentPlanItem[]} */
    var items = [];
    var ignoradas = 0;
    var semSegmento = 0;
    var totalNovos = 0;
    var p;
    var k;
    var c;
    var i;
    var j;
    var n;
    /** @param {string} code @param {string} message @param {unknown} details @returns {SegmentPlan} */
    function rejected(code, message, details) {
      return { error: failure(code, message, details), items: [], ignoradas: 0, semSegmento: 0 };
    }
    for (p = 0; p < selectedProps.length; p += 1) {
      var propRaw = selectedProps[p];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      var selectedKeys = prop.selectedKeys;
      if (!selectedKeys || selectedKeys.length === 0) continue;
      if (!MotionKeyframes.isSupportedProperty(prop)) {
        ignoradas += 1;
        continue;
      }
      var described = MotionKeyframes.describeProperty(comp, prop);
      var id = String(described.id);
      var nome = prop.name || prop.matchName || "Property";
      /** @type {SegmentPair[]} */
      var candidates = [];
      var segs = bySession && Object.prototype.hasOwnProperty.call(bySession, id) ? bySession[id] : null;
      if (segs && segs.length > 0) {
        for (c = 0; c < segs.length; c += 1) {
          var seg = /** @type {EaseSessionSegment} */ (segs[c]);
          var k0 = indexAt(prop, Number(seg.t0), fd);
          var kEnd = indexAt(prop, Number(seg.t1), fd);
          if (!k0 || !kEnd) {
            return rejected(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Os keyframes do segmento foram editados ou removidos.", { messageKey: "hostError.easeGeneratedEdited", propertyName: nome });
          }
          candidates.push({ k: k0, t0: prop.keyTime(k0), t1: prop.keyTime(kEnd), times: [], ignore: seg });
        }
        candidates.sort(function (a, b) { return a.t0 - b.t0; });
      } else {
        for (k = 0; k < selectedKeys.length; k += 1) {
          var keyIndex = selectedKeys[k];
          if (typeof keyIndex !== "number" || !containsKey(selectedKeys, keyIndex + 1)) continue;
          if (keyIndex < 1 || keyIndex + 1 > prop.numKeys) continue;
          candidates.push({ k: keyIndex, t0: prop.keyTime(keyIndex), t1: prop.keyTime(keyIndex + 1), times: [], ignore: null });
        }
      }
      /** @type {SegmentPair[]} */
      var pairs = [];
      for (c = 0; c < candidates.length; c += 1) {
        var pair = /** @type {SegmentPair} */ (candidates[c]);
        var t0 = pair.t0;
        var t1 = pair.t1;
        if (!(t1 - t0 > 0)) {
          if (mode !== "plain") semSegmento += 1;
          continue;
        }
        /** @type {number[]} */
        var times = [];
        if (points) {
          for (i = 0; i < points.length; i += 1) {
            var ponto = /** @type {Record<string, number>} */ (points[i]);
            var t = snapToFrame(t0 + Number(ponto.x) * (t1 - t0), fd);
            var colide = Math.abs(t - t0) <= tolerance || Math.abs(t - t1) <= tolerance;
            for (j = 0; j < times.length && !colide; j += 1) if (Math.abs(Number(times[j]) - t) <= tolerance) colide = true;
            for (j = 1; j <= prop.numKeys && !colide; j += 1) {
              var existing = prop.keyTime(j);
              if (Math.abs(existing - t) <= tolerance && !(pair.ignore && isGeneratedTime(pair.ignore, existing, tolerance))) colide = true;
            }
            if (colide) {
              return rejected(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Ja existe um keyframe no quadro de um ponto da curva. Afaste o ponto ou use um segmento mais longo.", {
                propertyName: nome,
                time: t,
                point: i
              });
            }
            times.push(t);
          }
        } else if (mode === "bake") {
          for (n = 1; t0 + n * fd < t1 - tolerance; n += 1) {
            if (n > MAX_BAKE_FRAMES_PER_SEGMENT) {
              return rejected(MotionContracts.ERROR.INVALID_PRESET, "Segmento longo demais para assar (maximo de 3600 quadros).", { propertyName: nome });
            }
            times.push(t0 + n * fd);
          }
        }
        totalNovos += times.length;
        if (totalNovos > MAX_BAKE_KEYS_TOTAL) {
          return rejected(MotionContracts.ERROR.INVALID_PRESET, "A operacao criaria mais de 10.000 keyframes. Reduza a selecao.", null);
        }
        pairs.push({ k: pair.k, t0: t0, t1: t1, times: times, ignore: pair.ignore });
      }
      if (candidates.length === 0 && mode !== "plain") {
        return rejected(MotionContracts.ERROR.NO_SELECTION, "Selecione dois keyframes vizinhos por propriedade.", { propertyName: nome });
      }
      if (pairs.length > 0 || mode === "plain") {
        items.push({ property: prop, id: id, layerIndex: Number(described.layerIndex), pairs: pairs });
      }
    }
    return { error: null, items: items, ignoradas: ignoradas, semSegmento: semSegmento };
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandFailure|null}
   */
  function preflight(args) {
    var argsError = validateArgs(args);
    if (argsError) return argsError;

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }

    if (args.build) {
      try { prepareBuild(args); } catch (error) { return failure(MotionContracts.ERROR.INVALID_PRESET, String(/** @type {Error} */ (error).message), null); }
      return null;
    }
    var comp = /** @type {CompItem} */ (activeItem);
    var selectedProps = comp.selectedProperties;
    var hasValidProp = false;
    for (var i = 0; i < selectedProps.length; i++) {
      var propRaw = selectedProps[i];
      if (propRaw && "canVaryOverTime" in propRaw) {
        var prop = /** @type {Property} */ (propRaw);
        if (prop.canVaryOverTime && prop.selectedKeys && prop.selectedKeys.length > 0) {
          var owner = /** @type {{parentProperty?: unknown, locked?: boolean}} */ (prop);
          for (var depth = 0; owner && depth < 64; depth++) {
            if (owner.locked === true) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie a camada antes de suavizar.", null);
            owner = /** @type {{parentProperty?: unknown, locked?: boolean}} */ (owner.parentProperty);
          }
          hasValidProp = true;
        }
      }
    }

    if (!hasValidProp) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhum keyframe selecionado.", null);
    }

    // A selecao que o painel viu precisa ser a que esta na timeline agora: entre
    // o clique e a chegada do pedido o usuario pode ter clicado em outra coisa.
    if (typeof args.expectedSelection === "string" && args.expectedSelection !== MotionSelection.signature(comp)) {
      return failure(MotionContracts.ERROR.STALE_SELECTION, "A selecao mudou.", { messageKey: "hostError.staleSelection" });
    }
    var session = /** @type {EaseSession|null} */ (args.session ? args.session : null);
    if (session) {
      var sessionError = validateSessionAgainstComp(comp, session);
      if (sessionError) return sessionError;
    }

    return planSegments(comp, args, session).error;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    if (args.build) return runBuild(args);
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var session = /** @type {EaseSession|null} */ (args.session ? args.session : null);
    var plan = planSegments(comp, args, session);
    throwPlanError(plan);
    return runWithPlan(comp, args, plan, session);
  }

  /** @param {SegmentPlan} plan @returns {void} lanca o erro do plano com motionCode. */
  function throwPlanError(plan) {
    if (!plan.error) return;
    var invalid = /** @type {Error & {motionCode?: string}} */ (new Error(plan.error.message));
    invalid.motionCode = plan.error.code;
    throw invalid;
  }

  /**
   * Valor interpolado `v0 + fracao * (v1 - v0)`, componente a componente para
   * vetores (inclusive espaciais) e direto para escalares.
   *
   * @param {unknown} v0
   * @param {unknown} v1
   * @param {number} fracao
   * @returns {unknown}
   */
  function valorNaCorda(v0, v1, fracao) {
    var a = /** @type {number[]} */ (v0);
    var b = /** @type {number[]} */ (v1);
    var out;
    var c;
    if (a && b && typeof a.length === "number" && typeof b.length === "number") {
      out = [];
      for (c = 0; c < a.length; c += 1) out.push(Number(a[c]) + fracao * (Number(b[c]) - Number(a[c])));
      return out;
    }
    return Number(v0) + fracao * (Number(v1) - Number(v0));
  }

  /**
   * Keyframe recem-criado numa propriedade espacial nasce com tangente
   * automatica; zera-la mantem a trajetoria na corda, e roving desligado
   * mantem o tempo onde foi escrito. Cada chamada e opcional no host.
   *
   * @param {Property} property
   * @param {number} idx
   * @returns {void}
   */
  function fixarEspacial(property, idx) {
    var value = /** @type {number[]} */ (property.keyValue(idx));
    var zeros = [];
    var c;
    if (!ehEspacial(property) || !value || typeof value.length !== "number") return;
    for (c = 0; c < value.length; c += 1) zeros.push(0);
    try { property.setSpatialTangentsAtKey(idx, zeros, zeros); } catch (tangentError) { /* host sem suporte */ }
    try { property.setSpatialAutoBezierAtKey(idx, false); } catch (autoBezierError) { /* host sem suporte */ }
    try { if (typeof property.setRovingAtKey === "function") property.setRovingAtKey(idx, false); } catch (rovingError) { /* host sem suporte */ }
  }

  /** @param {Property} property @param {number} time @returns {number} */
  function indiceNoTempo(property, time) {
    return /** @type {Property & {nearestKeyIndex(time: number): number}} */ (property).nearestKeyIndex(time);
  }

  /**
   * Descarta os keyframes que a sessao gravou para esta propriedade, do ultimo
   * indice para o primeiro. O preflight ja provou que cada um esta no quadro e
   * com o valor gravados; aqui so se reencontra o indice.
   *
   * @param {Property} property
   * @param {EaseSessionSegment[]} segs
   * @param {number} fd
   * @returns {number} quantos foram removidos
   */
  function removeGenerated(property, segs, fd) {
    /** @type {number[]} */
    var indices = [];
    var s;
    var g;
    for (s = 0; s < segs.length; s += 1) {
      var seg = /** @type {EaseSessionSegment} */ (segs[s]);
      for (g = 0; g < seg.generated.length; g += 1) {
        var entry = /** @type {{time: number}} */ (seg.generated[g]);
        var idx = indexAt(property, Number(entry.time), fd);
        if (!idx) throw new Error("Keyframe gerado nao encontrado.");
        indices.push(idx);
      }
    }
    indices.sort(function (a, b) { return b - a; });
    MotionKeyframes.removeIndicesDescending(property, indices);
    return indices.length;
  }

  /** @param {Property} property @param {number} idx @param {boolean} selected @returns {void} */
  function trySelect(property, idx, selected) {
    try { property.setSelectedAtKey(idx, selected); } catch (selectError) { /* host sem suporte */ }
  }

  /**
   * Executa o plano: curva multiponto, easing assado ou curva simples. Por
   * propriedade: snapshot PRIMEIRO, descarte dos keyframes da sessao, e so
   * entao a escrita, do ultimo par para o primeiro (inserir keys num par nao
   * desloca os indices dos pares ainda nao processados). Qualquer excecao
   * devolve tudo ao snapshot.
   *
   * @param {CompItem} comp
   * @param {Record<string, unknown>} args
   * @param {SegmentPlan} plan
   * @param {EaseSession|null} session
   * @returns {MotionCommandResult}
   */
  function runWithPlan(comp, args, plan, session) {
    var fd = comp.frameDuration;
    var mode = modeOf(args);
    var x1 = Number(args.x1);
    var y1 = Number(args.y1);
    var x2 = Number(args.x2);
    var y2 = Number(args.y2);
    var applyIn = /** @type {boolean} */ (args.applyIn);
    var applyOut = /** @type {boolean} */ (args.applyOut);
    var curva = { x1: x1, y1: y1, x2: x2, y2: y2 };
    var points = /** @type {Array<{x: number, y: number, inX: number, inY: number, outX: number, outY: number}>|null} */ (mode === "points" ? args.points : null);
    var segments = points ? MotionKeyframes.normalizeCurveSegments(curva, points).segments : null;
    var bake = /** @type {Record<string, unknown>|null} */ (mode === "bake" ? args.bake : null);
    var bakeParams = bake ? {
      "in": bake["in"],
      out: bake.out,
      inCurve: bake.inCurve ? bake.inCurve : null,
      outCurve: bake.outCurve ? bake.outCurve : null
    } : null;
    var LINEAR = typeof KeyframeInterpolationType !== "undefined" ? KeyframeInterpolationType.LINEAR : 0;
    var bySession = session ? segmentsByProperty(comp, session) : null;
    var appliedCount = 0;
    var removedCount = 0;
    var semSegmento = mode === "plain" ? 0 : plan.semSegmento;
    /** @type {EaseSessionSegment[]} */
    var outSegments = [];
    /** @type {MotionPropertySnapshot[]} */
    var intactos = [];
    var i;
    var q;
    var n;
    var k;
    try {
      for (i = 0; i < plan.items.length; i += 1) {
        var item = plan.items[i];
        if (!item) throw new Error("Plano incompleto.");
        var prop = item.property;
        intactos.push(MotionKeyframes.captureProperty(prop));
        if (bySession && Object.prototype.hasOwnProperty.call(bySession, item.id)) {
          removedCount += removeGenerated(prop, /** @type {EaseSessionSegment[]} */ (bySession[item.id]), fd);
        }
        /** @type {EaseSessionSegment[]} */
        var produced = [];
        for (q = item.pairs.length - 1; q >= 0; q -= 1) {
          var pair = item.pairs[q];
          if (!pair) throw new Error("Plano incompleto.");
          var k0 = indexAt(prop, pair.t0, fd);
          var k1 = indexAt(prop, pair.t1, fd);
          if (!k0 || k1 !== k0 + 1) throw new Error("Keyframes do segmento deixaram de ser vizinhos.");
          /** @type {Array<{time: number, value: unknown}>} */
          var generated = [];
          if (mode === "points" && points && segments) {
            var v0 = prop.keyValue(k0);
            var v1 = prop.keyValue(k1);
            for (n = 0; n < pair.times.length; n += 1) {
              var pontoN = /** @type {{y: number}} */ (points[n]);
              prop.setValueAtTime(Number(pair.times[n]), valorNaCorda(v0, v1, Number(pontoN.y)));
            }
            /** @type {number[]} */
            var indices = [indiceNoTempo(prop, pair.t0)];
            for (n = 0; n < pair.times.length; n += 1) {
              var idx = indiceNoTempo(prop, Number(pair.times[n]));
              fixarEspacial(prop, idx);
              indices.push(idx);
            }
            indices.push(indiceNoTempo(prop, pair.t1));
            for (n = 0; n < indices.length; n += 1) {
              var inCurve = n === 0 ? null : /** @type {EaseCurve} */ (segments[n - 1]);
              var outCurve = n === indices.length - 1 ? null : /** @type {EaseCurve} */ (segments[n]);
              if (n === 0 && !applyOut) outCurve = null;
              if (n === indices.length - 1 && !applyIn) inCurve = null;
              if (applyEaseSides(prop, Number(indices[n]), inCurve, outCurve)) appliedCount += 1;
            }
          } else if (mode === "bake" && bake && bakeParams) {
            var b0 = prop.keyValue(k0);
            var b1 = prop.keyValue(k1);
            for (n = 0; n < pair.times.length; n += 1) {
              var tempo = Number(pair.times[n]);
              var u = (tempo - pair.t0) / (pair.t1 - pair.t0);
              prop.setValueAtTime(tempo, valorNaCorda(b0, b1, MotionKeyframes.easingValue(String(bake.mode), /** @type {any} */ (bakeParams), String(bake.direction), u)));
            }
            for (n = 0; n < pair.times.length; n += 1) {
              var bidx = indiceNoTempo(prop, Number(pair.times[n]));
              prop.setInterpolationTypeAtKey(bidx, LINEAR, LINEAR);
              fixarEspacial(prop, bidx);
              appliedCount += 1;
            }
            var idx0 = indiceNoTempo(prop, pair.t0);
            var idx1 = indiceNoTempo(prop, pair.t1);
            prop.setInterpolationTypeAtKey(idx0, prop.keyInInterpolationType(idx0), LINEAR);
            prop.setInterpolationTypeAtKey(idx1, LINEAR, prop.keyOutInterpolationType(idx1));
          }
          for (n = 0; n < pair.times.length; n += 1) {
            var gidx = indexAt(prop, Number(pair.times[n]), fd);
            if (!gidx) throw new Error("Keyframe gerado nao encontrado apos a escrita.");
            generated.push({ time: prop.keyTime(gidx), value: prop.keyValue(gidx) });
            trySelect(prop, gidx, false);
          }
          produced.unshift({ propertyId: item.id, layerIndex: item.layerIndex, t0: pair.t0, t1: pair.t1, generated: generated });
        }
        if (mode === "plain") {
          // Caminho historico da curva simples, intacto: cada key selecionada
          // recebe a curva nos lados cujo vizinho tambem esta selecionado (ou
          // nos dois, quando e a unica).
          var selectedKeys = prop.selectedKeys;
          var escreveuNesta = false;
          for (k = 0; k < selectedKeys.length; k++) {
            var keyIndex = selectedKeys[k];
            if (typeof keyIndex === "number") {
              if (applyEaseToKeyframe(prop, keyIndex, x1, y1, x2, y2,
                applyIn && (selectedKeys.length === 1 || containsKey(selectedKeys, keyIndex - 1)),
                applyOut && (selectedKeys.length === 1 || containsKey(selectedKeys, keyIndex + 1)))) {
                appliedCount += 1;
                escreveuNesta = true;
              }
            }
          }
          if (!escreveuNesta) semSegmento += 1;
        }
        for (q = 0; q < produced.length; q += 1) {
          var seg = /** @type {EaseSessionSegment} */ (produced[q]);
          var s0 = indexAt(prop, seg.t0, fd);
          var s1 = indexAt(prop, seg.t1, fd);
          if (s0) trySelect(prop, s0, true);
          if (s1) trySelect(prop, s1, true);
          outSegments.push(seg);
        }
      }
    } catch (easeError) {
      rollback(intactos);
    }
    return {
      changed: appliedCount > 0 || removedCount > 0,
      warnings: avisosDeSelecao(plan.ignoradas, semSegmento),
      data: {
        appliedCount: appliedCount,
        skippedCount: plan.ignoradas + semSegmento,
        removedCount: removedCount,
        session: { signature: MotionSelection.signature(comp), segments: outSegments }
      }
    };
  }

  /** @typedef {{ property: Property, t0: number, t1: number, from: unknown, to: unknown }} BuildItem */
  /** @param {Record<string, unknown>} args @returns {BuildItem[]} */
  function prepareBuild(args) {
    var b = /** @type {Record<string, unknown>} */ (args.build);
    if (!b || typeof b !== "object") throw new Error("Parametros de animacao invalidos.");
    var numeric = ["durationFrames", "opacityFrom", "opacityTo", "scaleFrom", "scaleTo", "rotationFrom", "rotationTo", "posFromX", "posFromY", "posToX", "posToY"];
    var flags = ["useOpacity", "useScale", "useRotation", "usePosition"];
    var i, key, enabled = false;
    for (key in b) {
      var known = false;
      for (i = 0; i < numeric.length; i++) if (numeric[i] === key) known = true;
      for (i = 0; i < flags.length; i++) if (flags[i] === key) known = true;
      if (!known) throw new Error("Parametro de animacao desconhecido.");
    }
    for (i = 0; i < numeric.length; i++) {
      var value = b[String(numeric[i])];
      if (!isNumber(value) || Math.abs(Number(value)) > 100000) throw new Error("Valor de animacao invalido.");
    }
    for (i = 0; i < flags.length; i++) {
      if (typeof b[String(flags[i])] !== "boolean") throw new Error("Propriedade de animacao invalida.");
      if (b[String(flags[i])] === true) enabled = true;
    }
    var frames = Number(b.durationFrames);
    if (!enabled || frames < 1 || frames > 600 || frames !== Math.floor(frames)) throw new Error("Escolha uma propriedade e duracao de 1 a 600 quadros.");
    if (Number(b.opacityFrom) < 0 || Number(b.opacityFrom) > 100 || Number(b.opacityTo) < 0 || Number(b.opacityTo) > 100 || Number(b.scaleFrom) < 0 || Number(b.scaleTo) < 0) throw new Error("Opacidade ou escala fora do intervalo.");
    var c = /** @type {CompItem} */ (app.project.activeItem);
    var layers = c.selectedLayers;
    if (!layers.length) throw new Error("Selecione uma camada para criar a animacao.");
    var t0 = Math.round(c.time / c.frameDuration) * c.frameDuration;
    var t1 = t0 + frames * c.frameDuration;
    /** @type {BuildItem[]} */
    var items = [];
    /** @param {Property} prop @param {unknown} from @param {unknown} to @returns {void} */
    function add(prop, from, to) {
      if (!prop || !MotionKeyframes.isSupportedProperty(prop) || !prop.canVaryOverTime || prop.expressionEnabled) throw new Error("Propriedade indisponivel ou com expressao ativa.");
      for (var k = 1; k <= prop.numKeys; k++) {
        if (prop.keyTime(k) >= t0 - 0.0000001 && prop.keyTime(k) <= t1 + 0.0000001) throw new Error("O intervalo ja tem keyframes. Use um intervalo livre ou aplique a curva a selecao.");
      }
      items.push({ property: prop, t0: t0, t1: t1, from: from, to: to });
    }
    for (i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer || /** @type {Layer & {locked: boolean}} */ (layer).locked || t0 < layer.inPoint || t1 > layer.outPoint || t1 > c.duration) throw new Error("Camada bloqueada ou duracao fora dos limites da camada.");
      var transform = layer.property("ADBE Transform Group");
      if (!transform) throw new Error("Camada sem transformacoes compativeis.");
      if (b.useOpacity) add(/** @type {Property} */ (transform.property("ADBE Opacity")), Number(b.opacityFrom), Number(b.opacityTo));
      if (b.useRotation) add(/** @type {Property} */ (transform.property("ADBE Rotate Z")), Number(b.rotationFrom), Number(b.rotationTo));
      var prop, base, from, to, d;
      if (b.useScale) {
        prop = /** @type {Property} */ (transform.property("ADBE Scale"));
        base = /** @type {number[]} */ (prop.valueAtTime(t0, false)); from = []; to = [];
        for (d = 0; d < base.length; d++) { from.push(Number(b.scaleFrom)); to.push(Number(b.scaleTo)); }
        add(prop, from, to);
      }
      if (b.usePosition) {
        prop = /** @type {Property} */ (transform.property("ADBE Position"));
        if (/** @type {Property & {dimensionsSeparated: boolean}} */ (prop).dimensionsSeparated) {
          var px = /** @type {Property} */ (transform.property("ADBE Position_0"));
          var py = /** @type {Property} */ (transform.property("ADBE Position_1"));
          add(px, Number(px.valueAtTime(t0, false)) + Number(b.posFromX), Number(px.valueAtTime(t0, false)) + Number(b.posToX));
          add(py, Number(py.valueAtTime(t0, false)) + Number(b.posFromY), Number(py.valueAtTime(t0, false)) + Number(b.posToY));
        } else {
          base = /** @type {number[]} */ (prop.valueAtTime(t0, false)); from = base.slice(0); to = base.slice(0);
          from[0] = Number(from[0]) + Number(b.posFromX); from[1] = Number(from[1]) + Number(b.posFromY);
          to[0] = Number(to[0]) + Number(b.posToX); to[1] = Number(to[1]) + Number(b.posToY);
          add(prop, from, to);
        }
      }
    }
    return items;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function runBuild(args) {
    var items = prepareBuild(args), snapshots = [], values = [], i;
    // Capture every property before the first mutation, including empty ones.
    for (i = 0; i < items.length; i++) {
      var target = items[i];
      if (!target) throw new Error("Plano incompleto.");
      snapshots.push(MotionKeyframes.captureProperty(target.property));
      values.push(target.property.valueAtTime(target.t0, true));
    }
    try {
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) throw new Error("Plano incompleto.");
        var prop = item.property;
        prop.setValueAtTime(item.t0, item.from); prop.setValueAtTime(item.t1, item.to);
        var first = /** @type {Property & {nearestKeyIndex(time: number): number}} */ (prop).nearestKeyIndex(item.t0), last = /** @type {Property & {nearestKeyIndex(time: number): number}} */ (prop).nearestKeyIndex(item.t1);
        applyEaseToKeyframe(prop, first, Number(args.x1), Number(args.y1), Number(args.x2), Number(args.y2), false, true);
        applyEaseToKeyframe(prop, last, Number(args.x1), Number(args.y1), Number(args.x2), Number(args.y2), true, false);
      }
    } catch (error) {
      var failed = false;
      for (i = snapshots.length - 1; i >= 0; i--) {
        try { var snapshot = snapshots[i]; if (snapshot) { MotionKeyframes.restoreProperty(snapshot, null); if (snapshot.keys.length === 0) snapshot.property.setValue(values[i]); } } catch (restoreError) { failed = true; }
      }
      var result = /** @type {Error & {motionCode?: string}} */ (new Error(failed ? "Animacao: restauracao incompleta." : "Nao foi possivel criar a animacao; estado restaurado."));
      result.motionCode = failed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw result;
    }
    return { changed: items.length > 0, warnings: [], data: { appliedCount: items.length * 2, skippedCount: 0 } };
  }

  /** @param {number[]} keys @param {number} key @returns {boolean} */
  function containsKey(keys, key) {
    for (var i = 0; i < keys.length; i++) if (keys[i] === key) return true;
    return false;
  }

  MotionRegistry.register("ae.keys.ease.apply", { preflight: preflight, run: run });
})();
