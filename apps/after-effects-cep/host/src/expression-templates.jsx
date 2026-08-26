/**
 * Templates de expressao revisados para o host ES5.
 *
 * Nenhuma fonte arbitraria cruza a ponte. O comando fornece somente tokens
 * allowlisted e este modulo produz a fonte canonica, marcada e versionada.
 */
(function (global) {
  var LOOP_OUT_ID = "ae.expression.loopout";
  var SMOOTH_ID = "ae.expression.smooth";
  var HEADER = MotionContracts.EXPRESSION_HEADER + LOOP_OUT_ID + "\n";
  var SMOOTH_HEADER = MotionContracts.EXPRESSION_HEADER + SMOOTH_ID + "\n";
  var WIGGLE_ID = "ae.expression.wiggle";
  var WIGGLE_HEADER = MotionContracts.EXPRESSION_HEADER + WIGGLE_ID + "\n";
  var FLICKER_ID = "ae.expression.flicker";
  var FLICKER_HEADER = MotionContracts.EXPRESSION_HEADER + FLICKER_ID + "\n";
  var TEXTBOX_SIZE_HEADER = MotionContracts.EXPRESSION_HEADER + "ae.textbox.size\n";
  var TEXTBOX_POSITION_HEADER = MotionContracts.EXPRESSION_HEADER + "ae.textbox.position\n";

  /**
   * A caixa aponta para o texto por `thisLayer.parent`, e nao por
   * `thisComp.layer("nome")`: o vinculo de parentesco ja e criado pelo proprio
   * rig, sobrevive a rename e a reordenacao, e nao existe um segundo
   * acoplamento para manter em sincronia.
   */
  var TEXTBOX_PREFIXO =
    "var alvo = thisLayer.parent;\n" +
    "var r = alvo.sourceRectAtTime(time, false);\n";

  var TEXTBOX_POSITION_BODY = "[r.left + r.width / 2, r.top + r.height / 2];";

  /** @param {unknown} value @returns {boolean} */
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {unknown} value @returns {boolean} */
  function isLoopType(value) {
    return value === "cycle" || value === "pingpong" || value === "offset" || value === "continue";
  }

  /** @param {number} value @returns {string} */
  function canonicalNumber(value) {
    if (!isFiniteNumber(value)) throw new Error("Numero de expressao invalido.");
    return value === 0 ? "0" : String(value);
  }

  /**
   * @param {{type: unknown, numKeyframes: unknown, duration: unknown, useDuration: unknown}} tokens
   * @returns {string}
   */
  function renderLoopOut(tokens) {
    if (!tokens || !isLoopType(tokens.type)) throw new Error("Tipo LoopOut invalido.");
    if (
      !isFiniteNumber(tokens.numKeyframes) ||
      Math.floor(/** @type {number} */ (tokens.numKeyframes)) !== tokens.numKeyframes ||
      /** @type {number} */ (tokens.numKeyframes) < 0 ||
      /** @type {number} */ (tokens.numKeyframes) > 1000
    ) {
      throw new Error("Quantidade de keyframes invalida.");
    }
    if (!isFiniteNumber(tokens.duration) || /** @type {number} */ (tokens.duration) < 0) {
      throw new Error("Duracao LoopOut invalida.");
    }
    if (typeof tokens.useDuration !== "boolean") throw new Error("Modo de duracao invalido.");

    if (tokens.type === "continue") {
      return HEADER + 'loopOut("continue");';
    }
    if (tokens.useDuration === true) {
      return (
        HEADER + 'loopOutDuration("' + tokens.type + '", ' +
        canonicalNumber(/** @type {number} */ (tokens.duration)) + ");"
      );
    }
    return (
      HEADER + 'loopOut("' + tokens.type + '", ' +
      canonicalNumber(/** @type {number} */ (tokens.numKeyframes)) + ");"
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedLoopOut(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(HEADER) !== 0) return false;
    var body = normalized.substring(HEADER.length);
    if (body === 'loopOut("continue");') return true;

    var keyMatch = /^loopOut\("(cycle|pingpong|offset)", (0|[1-9][0-9]*)\);$/.exec(body);
    if (keyMatch) {
      var keyCount = Number(keyMatch[2]);
      return isFiniteNumber(keyCount) && keyCount <= 1000 && String(keyCount) === keyMatch[2];
    }

    var durationMatch = /^loopOutDuration\("(cycle|pingpong|offset)", ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (durationMatch) {
      var duration = Number(durationMatch[2]);
      return (
        isFiniteNumber(duration) &&
        duration >= 0 &&
        duration <= 3600 &&
        canonicalNumber(duration) === durationMatch[2]
      );
    }
    return false;
  }

  /**
   * `smooth(width, samples, t)` calcula a media do valor da propriedade numa
   * janela temporal. As faixas abaixo repetem as de `@motion/expression-library`
   * de proposito: o painel ja validou, e o host valida de novo porque nada que
   * atravessa a ponte pode ser considerado confiavel.
   *
   * @param {{widthSeconds: unknown, samples: unknown, referenceTime: unknown}} tokens
   * @returns {string}
   */
  function renderSmooth(tokens) {
    if (!tokens) throw new Error("Tokens Smooth ausentes.");
    if (
      !isFiniteNumber(tokens.widthSeconds) ||
      /** @type {number} */ (tokens.widthSeconds) <= 0 ||
      /** @type {number} */ (tokens.widthSeconds) > 3600
    ) {
      throw new Error("Largura Smooth invalida.");
    }
    if (
      !isFiniteNumber(tokens.samples) ||
      Math.floor(/** @type {number} */ (tokens.samples)) !== tokens.samples ||
      /** @type {number} */ (tokens.samples) < 1 ||
      /** @type {number} */ (tokens.samples) > 101
    ) {
      throw new Error("Quantidade de amostras Smooth invalida.");
    }

    var reference;
    if (tokens.referenceTime === "current") {
      reference = "time";
    } else if (isFiniteNumber(tokens.referenceTime) && /** @type {number} */ (tokens.referenceTime) >= 0) {
      reference = canonicalNumber(/** @type {number} */ (tokens.referenceTime));
    } else {
      throw new Error("Tempo de referencia Smooth invalido.");
    }

    return (
      SMOOTH_HEADER + "smooth(" +
      canonicalNumber(/** @type {number} */ (tokens.widthSeconds)) + ", " +
      canonicalNumber(/** @type {number} */ (tokens.samples)) + ", " +
      reference + ");"
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedSmooth(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(SMOOTH_HEADER) !== 0) return false;
    var body = normalized.substring(SMOOTH_HEADER.length);

    var match = /^smooth\(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?), (0|[1-9][0-9]*), (time|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (!match) return false;

    var width = Number(match[1]);
    var samples = Number(match[2]);
    if (!isFiniteNumber(width) || width <= 0 || width > 3600) return false;
    if (canonicalNumber(width) !== match[1]) return false;
    if (!isFiniteNumber(samples) || samples < 1 || samples > 101) return false;
    if (canonicalNumber(samples) !== match[2]) return false;
    if (match[3] === "time") return true;

    var reference = Number(match[3]);
    return isFiniteNumber(reference) && reference >= 0 && canonicalNumber(reference) === match[3];
  }

  /**
   * `seedRandom` acompanha o wiggle porque o offset dele controla o valor
   * inicial do wiggle — e sem isso a semente deriva do identificador da camada,
   * fazendo duas camadas iguais se moverem diferente. O argumento `timeless`
   * NAO e emitido: a documentacao diz que ele nao governa o wiggle.
   * Registro em docs/research/after-effects-wiggle-and-seed.md.
   *
   * @param {{frequency: unknown, amplitude: unknown, octaves: unknown, amplitudeMultiplier: unknown, seed: unknown}} tokens
   * @returns {string}
   */
  function renderWiggle(tokens) {
    if (!tokens) throw new Error("Tokens Wiggle ausentes.");
    if (
      !isFiniteNumber(tokens.frequency) ||
      /** @type {number} */ (tokens.frequency) <= 0 ||
      /** @type {number} */ (tokens.frequency) > 100
    ) {
      throw new Error("Frequencia Wiggle invalida.");
    }
    if (
      !isFiniteNumber(tokens.amplitude) ||
      /** @type {number} */ (tokens.amplitude) < 0 ||
      /** @type {number} */ (tokens.amplitude) > 100000
    ) {
      throw new Error("Amplitude Wiggle invalida.");
    }
    if (
      !isFiniteNumber(tokens.octaves) ||
      Math.floor(/** @type {number} */ (tokens.octaves)) !== tokens.octaves ||
      /** @type {number} */ (tokens.octaves) < 1 ||
      /** @type {number} */ (tokens.octaves) > 10
    ) {
      throw new Error("Quantidade de oitavas invalida.");
    }
    if (
      !isFiniteNumber(tokens.amplitudeMultiplier) ||
      /** @type {number} */ (tokens.amplitudeMultiplier) < 0 ||
      /** @type {number} */ (tokens.amplitudeMultiplier) > 10
    ) {
      throw new Error("Multiplicador de amplitude invalido.");
    }
    if (
      !isFiniteNumber(tokens.seed) ||
      Math.floor(/** @type {number} */ (tokens.seed)) !== tokens.seed ||
      /** @type {number} */ (tokens.seed) < 0 ||
      /** @type {number} */ (tokens.seed) > 100000
    ) {
      throw new Error("Semente Wiggle invalida.");
    }

    return (
      WIGGLE_HEADER +
      "seedRandom(" + canonicalNumber(/** @type {number} */ (tokens.seed)) + ");\n" +
      "wiggle(" +
      canonicalNumber(/** @type {number} */ (tokens.frequency)) + ", " +
      canonicalNumber(/** @type {number} */ (tokens.amplitude)) + ", " +
      canonicalNumber(/** @type {number} */ (tokens.octaves)) + ", " +
      canonicalNumber(/** @type {number} */ (tokens.amplitudeMultiplier)) + ");"
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedWiggle(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(WIGGLE_HEADER) !== 0) return false;
    var body = normalized.substring(WIGGLE_HEADER.length);

    var match = /^seedRandom\((0|[1-9][0-9]*)\);\nwiggle\(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?), ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?), (0|[1-9][0-9]*), ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (!match) return false;

    var seed = Number(match[1]);
    var frequency = Number(match[2]);
    var amplitude = Number(match[3]);
    var octaves = Number(match[4]);
    var multiplier = Number(match[5]);

    if (!isFiniteNumber(seed) || seed > 100000 || canonicalNumber(seed) !== match[1]) return false;
    if (!isFiniteNumber(frequency) || frequency <= 0 || frequency > 100) return false;
    if (canonicalNumber(frequency) !== match[2]) return false;
    if (!isFiniteNumber(amplitude) || amplitude > 100000 || canonicalNumber(amplitude) !== match[3]) return false;
    if (!isFiniteNumber(octaves) || octaves < 1 || octaves > 10 || canonicalNumber(octaves) !== match[4]) return false;
    if (!isFiniteNumber(multiplier) || multiplier > 10 || canonicalNumber(multiplier) !== match[5]) return false;

    return true;
  }

  /**
   * `random(min, max)` com dois numeros devolve um ESCALAR. Emiti-lo cru
   * quebraria qualquer propriedade que nao seja 1D. Multiplicar `value` carrega
   * a dimensionalidade da propria propriedade e ainda preserva a animacao
   * existente. Registro em docs/research/after-effects-wiggle-and-seed.md.
   *
   * @param {{rate: unknown, minFactor: unknown, maxFactor: unknown, seed: unknown}} tokens
   * @returns {string}
   */
  function renderFlicker(tokens) {
    if (!tokens) throw new Error("Tokens Flicker ausentes.");
    if (
      !isFiniteNumber(tokens.rate) ||
      /** @type {number} */ (tokens.rate) <= 0 ||
      /** @type {number} */ (tokens.rate) > 120
    ) {
      throw new Error("Taxa Flicker invalida.");
    }
    if (
      !isFiniteNumber(tokens.minFactor) ||
      /** @type {number} */ (tokens.minFactor) < 0 ||
      /** @type {number} */ (tokens.minFactor) > 10
    ) {
      throw new Error("Fator minimo invalido.");
    }
    if (
      !isFiniteNumber(tokens.maxFactor) ||
      /** @type {number} */ (tokens.maxFactor) < 0 ||
      /** @type {number} */ (tokens.maxFactor) > 10
    ) {
      throw new Error("Fator maximo invalido.");
    }
    if (/** @type {number} */ (tokens.minFactor) > /** @type {number} */ (tokens.maxFactor)) {
      throw new Error("Fator minimo maior que o maximo.");
    }
    if (
      !isFiniteNumber(tokens.seed) ||
      Math.floor(/** @type {number} */ (tokens.seed)) !== tokens.seed ||
      /** @type {number} */ (tokens.seed) < 0 ||
      /** @type {number} */ (tokens.seed) > 100000
    ) {
      throw new Error("Semente Flicker invalida.");
    }

    return (
      FLICKER_HEADER +
      "seedRandom(" + canonicalNumber(/** @type {number} */ (tokens.seed)) + ");\n" +
      "posterizeTime(" + canonicalNumber(/** @type {number} */ (tokens.rate)) + ");\n" +
      "value * random(" +
      canonicalNumber(/** @type {number} */ (tokens.minFactor)) + ", " +
      canonicalNumber(/** @type {number} */ (tokens.maxFactor)) + ");"
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedFlicker(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(FLICKER_HEADER) !== 0) return false;
    var body = normalized.substring(FLICKER_HEADER.length);

    var match = /^seedRandom\((0|[1-9][0-9]*)\);\nposterizeTime\(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);\nvalue \* random\(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?), ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (!match) return false;

    var seed = Number(match[1]);
    var rate = Number(match[2]);
    var minFactor = Number(match[3]);
    var maxFactor = Number(match[4]);

    if (!isFiniteNumber(seed) || seed > 100000 || canonicalNumber(seed) !== match[1]) return false;
    if (!isFiniteNumber(rate) || rate <= 0 || rate > 120 || canonicalNumber(rate) !== match[2]) return false;
    if (!isFiniteNumber(minFactor) || minFactor > 10 || canonicalNumber(minFactor) !== match[3]) return false;
    if (!isFiniteNumber(maxFactor) || maxFactor > 10 || canonicalNumber(maxFactor) !== match[4]) return false;
    return minFactor <= maxFactor;
  }

  /** @param {unknown} value @returns {void} */
  function assertPadding(value) {
    // Padding negativo encolheria a caixa para dentro do texto, cortando-o.
    if (!isFiniteNumber(value) || /** @type {number} */ (value) < 0 || /** @type {number} */ (value) > 10000) {
      throw new Error("Padding de caixa invalido.");
    }
  }

  /**
   * Texto vazio e texto so com espaco devolvem o retangulo zerado — medido no
   * host, em docs/research/after-effects-text-box-rig.md. Sem o colapso para
   * `[0, 0]`, apagar o texto deixaria um bloco de cor orfao, do tamanho do
   * padding, pousado na origem da camada.
   *
   * @param {{paddingX: unknown, paddingY: unknown}} tokens
   * @returns {string}
   */
  function renderTextBoxSize(tokens) {
    if (!tokens) throw new Error("Tokens de caixa ausentes.");
    assertPadding(tokens.paddingX);
    assertPadding(tokens.paddingY);
    return (
      TEXTBOX_SIZE_HEADER + TEXTBOX_PREFIXO +
      "r.width === 0 && r.height === 0 ? [0, 0] : [r.width + " +
      canonicalNumber(/** @type {number} */ (tokens.paddingX)) + " * 2, r.height + " +
      canonicalNumber(/** @type {number} */ (tokens.paddingY)) + " * 2];"
    );
  }

  /**
   * O centro e o do bounding box do texto, nao a origem da camada: e isso que
   * faz a caixa acompanhar alinhamento a esquerda, ao centro e a direita sem
   * nenhum input adicional. Nao depende de padding, entao nao recebe tokens.
   *
   * @returns {string}
   */
  function renderTextBoxPosition() {
    return TEXTBOX_POSITION_HEADER + TEXTBOX_PREFIXO + TEXTBOX_POSITION_BODY;
  }

  var NUMERO = "(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?";
  var TEXTBOX_SIZE_RE = new RegExp(
    "^var alvo = thisLayer\\.parent;\\nvar r = alvo\\.sourceRectAtTime\\(time, false\\);\\n" +
      "r\\.width === 0 && r\\.height === 0 \\? \\[0, 0\\] : " +
      "\\[r\\.width \\+ (" + NUMERO + ") \\* 2, r\\.height \\+ (" + NUMERO + ") \\* 2\\];$"
  );

  /** @param {string} source @returns {boolean} */
  function isManagedTextBoxSize(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(TEXTBOX_SIZE_HEADER) !== 0) return false;

    var match = TEXTBOX_SIZE_RE.exec(normalized.substring(TEXTBOX_SIZE_HEADER.length));
    if (!match) return false;

    var paddingX = Number(match[1]);
    var paddingY = Number(match[2]);
    if (!isFiniteNumber(paddingX) || paddingX > 10000 || canonicalNumber(paddingX) !== match[1]) return false;
    return isFiniteNumber(paddingY) && paddingY <= 10000 && canonicalNumber(paddingY) === match[2];
  }

  /** @param {string} source @returns {boolean} */
  function isManagedTextBoxPosition(source) {
    if (typeof source !== "string") return false;
    return source.replace(/\r\n?/g, "\n") === renderTextBoxPosition();
  }

  global.MotionExpressions = {
    renderLoopOut: renderLoopOut,
    isManagedLoopOut: isManagedLoopOut,
    renderSmooth: renderSmooth,
    isManagedSmooth: isManagedSmooth,
    renderWiggle: renderWiggle,
    isManagedWiggle: isManagedWiggle,
    renderFlicker: renderFlicker,
    isManagedFlicker: isManagedFlicker,
    renderTextBoxSize: renderTextBoxSize,
    isManagedTextBoxSize: isManagedTextBoxSize,
    renderTextBoxPosition: renderTextBoxPosition,
    isManagedTextBoxPosition: isManagedTextBoxPosition
  };
}($.global));
