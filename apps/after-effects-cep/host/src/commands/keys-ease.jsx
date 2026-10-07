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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        key !== "build" && !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
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
    if (Object.prototype.hasOwnProperty.call(args, "build") && (!args.build || typeof args.build !== "object")) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametros de animacao invalidos.", null);
    }
    if (!isNumber(args.x1) || !isNumber(args.y1) || !isNumber(args.x2) || !isNumber(args.y2)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Curva de Ease invalida (deve ser numero).", null);
    }
    var x1 = /** @type {number} */ (args.x1);
    var x2 = /** @type {number} */ (args.x2);
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Handles X devem estar entre 0 e 1.", null);
    }
    if (!args.build && args.applyIn === false && args.applyOut === false) {
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

  /**
   * Escreve a curva num keyframe.
   *
   * **Precondicao:** `MotionKeyframes.isSupportedProperty(property)` e
   * verdadeiro. Quem chama e o `run`, e e la que a allowlist mora — junto do
   * snapshot, porque as duas decisoes sao a mesma: nao se escreve numa
   * propriedade que nao se sabe desfazer. Repetir a checagem aqui produziria uma
   * guarda que nenhum teste alcanca pelo dispatcher, e guarda inalcancavel e
   * falsa seguranca, nao seguranca dobrada.
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
    var numKeys = property.numKeys;
    applyIn = applyIn && keyIndex > 1;
    applyOut = applyOut && keyIndex < numKeys;
    if (!applyIn && !applyOut) return false;
    var linear = Math.abs(x1 - y1) < 0.000001 && Math.abs(x2 - y2) < 0.000001;
    var interpolation = linear ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER;

    var currentInEase = property.keyInTemporalEase(keyIndex);
    var currentOutEase = property.keyOutTemporalEase(keyIndex);
    var inType = applyIn ? interpolation : property.keyInInterpolationType(keyIndex);
    var outType = applyOut ? interpolation : property.keyOutInterpolationType(keyIndex);

    // Quantos `KeyframeEase` o After Effects espera de volta. Vem do proprio
    // ease atual, que e a unica fonte confiavel: numa propriedade espacial e 1
    // mesmo com valor de tres componentes. O que NAO se deduz daqui e a forma
    // do VALOR — essa pergunta e do `diferencaDeValor`.
    var dimensions = currentInEase.length;
    var newInEase = [];
    var newOutEase = [];
    var d;

    // In Ease (segmento anterior: keyIndex - 1 ate keyIndex)
    if (applyIn && keyIndex > 1) {
      var inDuration = property.keyTime(keyIndex) - property.keyTime(keyIndex - 1);
      var inVal1 = property.keyValue(keyIndex - 1);
      var inVal2 = property.keyValue(keyIndex);

      for (d = 0; d < dimensions; d++) {
        var diffIn = diferencaDeValor(property, inVal1, inVal2, d);
        var easeInResult = MotionKeyframes.curveToEase({ x1: x1, y1: y1, x2: x2, y2: y2 }, inDuration, diffIn);
        newInEase.push(new KeyframeEase(easeInResult.inSpeed, easeInResult.inInfluence));
      }
    } else {
      for (d = 0; d < dimensions; d++) newInEase.push(/** @type {KeyframeEase} */ (currentInEase[d]));
    }

    // Out Ease (segmento proximo: keyIndex ate keyIndex + 1)
    if (applyOut && keyIndex < numKeys) {
      var outDuration = property.keyTime(keyIndex + 1) - property.keyTime(keyIndex);
      var outVal1 = property.keyValue(keyIndex);
      var outVal2 = property.keyValue(keyIndex + 1);

      for (d = 0; d < dimensions; d++) {
        var diffOut = diferencaDeValor(property, outVal1, outVal2, d);
        var easeOutResult = MotionKeyframes.curveToEase({ x1: x1, y1: y1, x2: x2, y2: y2 }, outDuration, diffOut);
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

    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    if (args.build) return runBuild(args);
    var x1 = /** @type {number} */ (args.x1);
    var y1 = /** @type {number} */ (args.y1);
    var x2 = /** @type {number} */ (args.x2);
    var y2 = /** @type {number} */ (args.y2);
    var applyIn = /** @type {boolean} */ (args.applyIn);
    var applyOut = /** @type {boolean} */ (args.applyOut);

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedProps = comp.selectedProperties;
    var appliedCount = 0;
    var ignoradas = 0;
    var semSegmento = 0;
    /** Copias intactas, capturadas antes de escrever: e para onde o rollback volta. */
    var intactos = [];

    try {
    for (var p = 0; p < selectedProps.length; p++) {
      var propRaw = selectedProps[p];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      var selectedKeys = prop.selectedKeys;
      if (!selectedKeys || selectedKeys.length === 0) continue;

      // Snapshot e escrita andam juntos. Uma propriedade que nao pode ser
      // capturada tambem nao pode ser escrita: sem a copia intacta o rollback
      // nao teria para onde voltar, e a falha deixaria metade do trabalho no
      // projeto do usuario. Ate 2026-09-05 so a captura era condicional, e
      // Mask Path caia justamente nessa fresta.
      if (!MotionKeyframes.isSupportedProperty(prop)) {
        ignoradas += 1;
        continue;
      }
      intactos.push(MotionKeyframes.captureProperty(prop));

      var escreveuNesta = false;
      for (var k = 0; k < selectedKeys.length; k++) {
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

    } catch (easeError) {
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

    // Propriedade ignorada vira aviso, e nao silencio.
    //
    // O comando declara `allowsNoopSuccess: true`, entao uma selecao inteira de
    // propriedades sem curva responderia `ok: true` — e o painel diria "curva
    // aplicada" sobre zero keyframes. O aviso e a contagem real sao o que
    // impede essa mentira; o cliente le `appliedCount` e mostra o numero.
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

    return {
      changed: appliedCount > 0,
      warnings: avisos,
      data: { appliedCount: appliedCount, skippedCount: ignoradas + semSegmento }
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
