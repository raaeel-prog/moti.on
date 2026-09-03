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
  var TIME_CONTROLLER_ID = "ae.time.controller";
  var TIME_CONTROLLER_HEADER = MotionContracts.EXPRESSION_HEADER + TIME_CONTROLLER_ID + "\n";

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

  /** @param {unknown} value @returns {boolean} */
  function isBoundedMarkerName(value) {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= 80 &&
      !/^\s|\s$/.test(value)
    );
  }

  /** @param {string} value @returns {string} */
  function expressionStringLiteral(value) {
    if (!isBoundedMarkerName(value)) throw new Error("Nome de marker invalido.");
    var escaped = '"';
    var i;
    var code;
    var hex;
    var ch;
    for (i = 0; i < value.length; i += 1) {
      ch = value.charAt(i);
      code = value.charCodeAt(i);
      if (code === 34) escaped += '\\"';
      else if (code === 92) escaped += "\\\\";
      else if (code === 8) escaped += "\\b";
      else if (code === 9) escaped += "\\t";
      else if (code === 10) escaped += "\\n";
      else if (code === 12) escaped += "\\f";
      else if (code === 13) escaped += "\\r";
      else if (code < 32 || code > 126) {
        hex = code.toString(16);
        while (hex.length < 4) hex = "0" + hex;
        escaped += "\\u" + hex;
      } else {
        escaped += ch;
      }
    }
    return escaped + '"';
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

  /**
   * Sondas TEMPORARIAS de posicionamento.
   *
   * Diferente de todo o resto deste modulo, estas expressoes nunca sao
   * persistidas: o comando as escreve na posicao do null, le o valor avaliado,
   * apaga a expressao e assa o numero. Por isso nao levam cabecalho gerenciado
   * — nada precisa reconhece-las depois, porque nada sobrevive.
   *
   * A razao de existirem: compor matrizes de transform a mao no ExtendScript
   * daria uma matematica que eu nao teria como verificar contra 3D, parents
   * aninhados e camadas animadas. O motor de expressoes ja tem a matematica
   * nativa e exata da Adobe; usa-lo como calculadora troca codigo inventado por
   * codigo da propria ferramenta.
   *
   * @param {unknown} indices
   * @returns {string}
   */
  function renderIndexList(indices) {
    if (Object.prototype.toString.call(indices) !== "[object Array]") {
      throw new Error("Lista de indices invalida.");
    }
    var lista = /** @type {unknown[]} */ (indices);
    if (lista.length < 1 || lista.length > 500) throw new Error("Quantidade de indices invalida.");

    var partes = [];
    var i;
    for (i = 0; i < lista.length; i += 1) {
      var indice = lista[i];
      if (
        !isFiniteNumber(indice) ||
        Math.floor(/** @type {number} */ (indice)) !== indice ||
        /** @type {number} */ (indice) < 1 ||
        /** @type {number} */ (indice) > 100000
      ) {
        throw new Error("Indice de camada invalido.");
      }
      partes.push(String(indice));
    }
    return "[" + partes.join(", ") + "]";
  }

  /**
   * `toComp` ou `toWorld`, conforme o destino do valor.
   *
   * Numa camada 3D `toComp` devolve a posicao PROJETADA pela camera. Medido:
   * com camadas em z=-400 e z=+600 as duas leituras divergem 787 px, e o z
   * da projecao nao tem significado no espaco do transform.
   *
   * A regra segue o destino: um null 2D vive no plano da composicao e quer a
   * posicao PROJETADA, que e onde as camadas aparecem; um null 3D vive no
   * mundo e quer `toWorld`.
   *
   * @param {unknown} paraMundo @returns {string}
   */
  function metodoDeEspaco(paraMundo) {
    if (typeof paraMundo !== "boolean") throw new Error("Espaco de sonda invalido.");
    return paraMundo ? "toWorld" : "toComp";
  }

  /** Media das ancoras das camadas.
   *
   * @param {unknown} indices
   * @param {unknown} paraMundo
   * @returns {string}
   */
  function renderAnchorAverageProbe(indices, paraMundo) {
    // `toComp` devolve DOIS componentes numa camada 2D e tres numa 3D — medido
    // em AE 26.3x87. Ler `p[2]` sem guarda numa camada 2D produz "Valor
    // indefinido usado na expressao" e o After Effects desabilita a expressao.
    // Uma selecao mista de camadas 2D e 3D e o caso comum, nao o excepcional.
    // `toComp` recebe um ponto no espaco da CAMADA, e a origem desse espaco e o
    // canto superior esquerdo da fonte — nao a ancora. Num solido a ancora
    // nasce no centro, entao `toComp([0,0,0])` daria a media dos cantos, com
    // aparencia de resultado plausivel. Passar `anchorPoint` e o que faz este
    // posicionamento significar o que o nome diz.
    //
    // `toComp` devolve DOIS componentes numa camada 2D e tres numa 3D — medido
    // em AE 26.3x87. Ler `p[2]` sem guarda numa camada 2D produz "Valor
    // indefinido usado na expressao" e o After Effects desabilita a expressao.
    // Uma selecao mista de camadas 2D e 3D e o caso comum, nao o excepcional.
    return (
      "var idx = " + renderIndexList(indices) + ";\n" +
      "var soma = [0, 0, 0];\n" +
      "for (var i = 0; i < idx.length; i++) {\n" +
      "  var l = thisComp.layer(idx[i]);\n" +
      "  var p = l." + metodoDeEspaco(paraMundo) + "(l.anchorPoint);\n" +
      "  var z = p.length > 2 ? p[2] : 0;\n" +
      "  soma = [soma[0] + p[0], soma[1] + p[1], soma[2] + z];\n" +
      "}\n" +
      "[soma[0] / idx.length, soma[1] / idx.length, soma[2] / idx.length];"
    );
  }

  /**
   * Centro da uniao dos bounding boxes, em espaco de composicao.
   *
   * Os quatro cantos passam por `toComp` um a um de proposito: uma camada
   * rotacionada tem bounding box alinhado ao eixo no espaco DELA, e projetar so
   * dois cantos daria um retangulo errado depois da rotacao.
   *
   * @param {unknown} indices
   * @param {unknown} paraMundo
   * @returns {string}
   */
  function renderBoundsCenterProbe(indices, paraMundo) {
    return (
      "var idx = " + renderIndexList(indices) + ";\n" +
      "var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;\n" +
      "for (var i = 0; i < idx.length; i++) {\n" +
      "  var l = thisComp.layer(idx[i]);\n" +
      "  var r = l.sourceRectAtTime(time, false);\n" +
      "  var xs = [r.left, r.left + r.width];\n" +
      "  var ys = [r.top, r.top + r.height];\n" +
      "  for (var m = 0; m < 2; m++) {\n" +
      "    for (var n = 0; n < 2; n++) {\n" +
      "      var p = l." + metodoDeEspaco(paraMundo) + "([xs[m], ys[n], 0]);\n" +
      "      if (p[0] < minX) minX = p[0];\n" +
      "      if (p[0] > maxX) maxX = p[0];\n" +
      "      if (p[1] < minY) minY = p[1];\n" +
      "      if (p[1] > maxY) maxY = p[1];\n" +
      "    }\n" +
      "  }\n" +
      "}\n" +
      "[(minX + maxX) / 2, (minY + maxY) / 2, 0];"
    );
  }

  /**
   * @param {{offsetFrames: unknown, speedPercent: unknown, reverse: unknown, freeze: unknown, freezeFrame: unknown}} tokens
   * @returns {string}
   */
  function renderTimeController(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (!isFiniteNumber(tokens.offsetFrames) || Math.floor(/** @type {number} */ (tokens.offsetFrames)) !== tokens.offsetFrames) {
      throw new Error("Offset de tempo invalido.");
    }
    if (!isFiniteNumber(tokens.speedPercent) || /** @type {number} */ (tokens.speedPercent) <= 0 || /** @type {number} */ (tokens.speedPercent) > 10000) {
      throw new Error("Velocidade de tempo invalida.");
    }
    if (typeof tokens.reverse !== "boolean") throw new Error("Reverse de tempo invalido.");
    if (typeof tokens.freeze !== "boolean") throw new Error("Freeze de tempo invalido.");
    if (!isFiniteNumber(tokens.freezeFrame) || Math.floor(/** @type {number} */ (tokens.freezeFrame)) !== tokens.freezeFrame || /** @type {number} */ (tokens.freezeFrame) < 0) {
      throw new Error("Frame de congelamento invalido.");
    }
    var offsetF = canonicalNumber(/** @type {number} */ (tokens.offsetFrames));
    var speedP = canonicalNumber(/** @type {number} */ (tokens.speedPercent));
    var rev = tokens.reverse ? "-1" : "1";
    var freeze = tokens.freeze ? "true" : "false";
    var freezeF = canonicalNumber(/** @type {number} */ (tokens.freezeFrame));

    return TIME_CONTROLLER_HEADER +
      "var fps = 1.0 / thisComp.frameDuration;\n" +
      "var offset = (" + offsetF + ") / fps;\n" +
      "var spd = (" + speedP + ") / 100.0;\n" +
      "var rev = " + rev + ";\n" +
      "var frozen = " + freeze + ";\n" +
      "var fFrame = (" + freezeF + ") / fps;\n" +
      "var t = time;\n" +
      "if (frozen) {\n" +
      "  t = fFrame;\n" +
      "} else {\n" +
      "  t = ((t - thisLayer.inPoint) * spd * rev) + thisLayer.inPoint + offset;\n" +
      "}\n" +
      "valueAtTime(t);";
  }

  /** @param {string} source @returns {boolean} */
  function isManagedTimeController(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(TIME_CONTROLLER_HEADER) !== 0) return false;
    return /^var fps = 1\.0 \/ thisComp\.frameDuration;\nvar offset = \((-?(?:0|[1-9][0-9]*))\) \/ fps;\nvar spd = \(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\) \/ 100\.0;\nvar rev = (-1|1);\nvar frozen = (true|false);\nvar fFrame = \((0|[1-9][0-9]*)\) \/ fps;\nvar t = time;\nif \(frozen\) \{\n {2}t = fFrame;\n\} else \{\n {2}t = \(\(t - thisLayer\.inPoint\) \* spd \* rev\) \+ thisLayer\.inPoint \+ offset;\n\}\nvalueAtTime\(t\);$/.test(normalized.substring(TIME_CONTROLLER_HEADER.length));
  }

  var MARKER_LOOP_ID = "ae.time.marker-loop";
  var MARKER_LOOP_HEADER = MotionContracts.EXPRESSION_HEADER + MARKER_LOOP_ID + "\n";

  /**
   * Parte invariante do Marker Loop: so as quatro declaracoes iniciais mudam com
   * os tokens. Manter o resto numa constante permite que `isManagedMarkerLoop`
   * compare o corpo com o formato canonico em vez de adivinhar por regex, e
   * garante que reconhecedor e gerador nao possam divergir.
   *
   * O valor final sai de `resultado;`, uma ultima expressao explicita, e nao do
   * valor de conclusao de um bloco `if`. Marker ausente deixa `resultado` como
   * `value`: preserva o valor original em vez de inventar um loop errado.
   */
  var MARKER_LOOP_BODY_TAIL =
    "var inT = null;\n" +
    "var outT = null;\n" +
    "try { inT = thisLayer.marker.key(mIn).time; } catch (semIn) { inT = null; }\n" +
    "try { outT = thisLayer.marker.key(mOut).time; } catch (semOut) { outT = null; }\n" +
    "var resultado = value;\n" +
    "if (inT !== null && outT !== null && outT > inT) {\n" +
    "  var dur = outT - inT;\n" +
    "  var t = time - inT;\n" +
    "  if (pingpong) {\n" +
    "    var seg = Math.floor(t / dur);\n" +
    "    var frac = t / dur - seg;\n" +
    "    t = (seg % 2 === 0) ? frac * dur : (1 - frac) * dur;\n" +
    "  } else {\n" +
    "    t = t % dur;\n" +
    "    if (t < 0) t = t + dur;\n" +
    "  }\n" +
    "  resultado = inT + t;\n" +
    "  if (clamp) {\n" +
    "    resultado = Math.max(thisLayer.inPoint, Math.min(thisLayer.outPoint, resultado));\n" +
    "  }\n" +
    "}\n" +
    "resultado;";

  var MARKER_LOOP_DECLARATIONS =
    /^var mIn = ("(?:[^"\\\n]|\\.)*");\nvar mOut = ("(?:[^"\\\n]|\\.)*");\nvar pingpong = (?:true|false);\nvar clamp = (?:true|false);\n/;

  /**
   * Time Remap que percorre em loop o trecho entre dois markers nomeados.
   *
   * @param {{inMarkerName: string, outMarkerName: string, loopType: string, clampToLayer: boolean}} tokens
   * @returns {string}
   */
  function renderMarkerLoop(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (!isBoundedMarkerName(tokens.inMarkerName) || !isBoundedMarkerName(tokens.outMarkerName)) {
      throw new Error("Nome de marker invalido.");
    }
    if (tokens.inMarkerName === tokens.outMarkerName) throw new Error("Markers de loop precisam ser distintos.");
    if (tokens.loopType !== "cycle" && tokens.loopType !== "pingpong") throw new Error("Tipo de loop por marker invalido.");
    if (typeof tokens.clampToLayer !== "boolean") throw new Error("Clamp de marker loop invalido.");

    var inName = expressionStringLiteral(/** @type {string} */ (tokens.inMarkerName));
    var outName = expressionStringLiteral(/** @type {string} */ (tokens.outMarkerName));
    var pingpong = tokens.loopType === "pingpong" ? "true" : "false";
    var clamp = tokens.clampToLayer ? "true" : "false";

    return (
      MARKER_LOOP_HEADER +
      "var mIn = " + inName + ";\n" +
      "var mOut = " + outName + ";\n" +
      "var pingpong = " + pingpong + ";\n" +
      "var clamp = " + clamp + ";\n" +
      MARKER_LOOP_BODY_TAIL
    );
  }

  /**
   * Reconhece o corpo exato que `renderMarkerLoop` produz, para qualquer par de
   * nomes de marker.
   *
   * A versao anterior aceitava qualquer corpo sem "alert(" e sem "eval(". Isso e
   * blocklist, e blocklist falha aberta: bastaria o usuario colar o cabecalho
   * para o plugin sobrescrever a expressao dele achando que era sua.
   *
   * @param {string} source
   * @returns {boolean}
   */
  function isManagedMarkerLoop(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(MARKER_LOOP_HEADER) !== 0) return false;
    var body = normalized.substring(MARKER_LOOP_HEADER.length);
    var declarations = MARKER_LOOP_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === MARKER_LOOP_BODY_TAIL;
  }


  var KINETIC_ID = "ae.animate.kinetic";
  var KINETIC_HEADER = MotionContracts.EXPRESSION_HEADER + KINETIC_ID + "\n";

  /**
   * Parte invariante do overshoot Kinetic.
   *
   * Usa `add`/`sub`/`mul` em vez de `+`/`-`/`*`. Nao e preferencia de estilo:
   * o motor JavaScript do After Effects nao aplica operador aritmetico a array,
   * entao `k2.value - k1.value` em Position (2D/3D) resulta em NaN e a camada
   * desaparece. As funcoes valem para escalar e para array, nos dois motores.
   *
   * O atraso do stagger entra aqui como token e nao como deslocamento de
   * `startTime`: mexer no startTime move a camada inteira, acumula a cada
   * reaplicacao e nao volta ao remover a expressao.
   */
  var KINETIC_BODY_TAIL =
    "var fps = 1.0 / thisComp.frameDuration;\n" +
    "var dur = durF / fps;\n" +
    "var atraso = delayF / fps;\n" +
    "var nk = thisProperty.numKeys;\n" +
    "var resultado = value;\n" +
    "if (nk >= 2 && dur > 0) {\n" +
    "  var t0 = time - atraso;\n" +
    "  if (modoIn) {\n" +
    "    var k1 = thisProperty.key(1);\n" +
    "    var k2 = thisProperty.key(2);\n" +
    "    if (t0 >= k1.time && t0 < k1.time + dur) {\n" +
    "      var tIn = (t0 - k1.time) / dur;\n" +
    "      var decaiIn = Math.exp(-6 * tIn) * Math.cos(tIn * Math.PI * 3);\n" +
    "      resultado = add(resultado, mul(sub(k2.value, k1.value), decaiIn * (ov - 1)));\n" +
    "    }\n" +
    "  }\n" +
    "  if (modoOut) {\n" +
    "    var kUlt = thisProperty.key(nk);\n" +
    "    var kPen = thisProperty.key(nk - 1);\n" +
    "    if (t0 > kUlt.time && t0 < kUlt.time + dur) {\n" +
    "      var tOut = (t0 - kUlt.time) / dur;\n" +
    "      var decaiOut = Math.exp(-6 * tOut) * Math.cos(tOut * Math.PI * 3);\n" +
    "      resultado = add(resultado, mul(sub(kUlt.value, kPen.value), decaiOut * (ov - 1)));\n" +
    "    }\n" +
    "  }\n" +
    "}\n" +
    "resultado;";

  var KINETIC_DECLARATIONS =
    /^var durF = (?:[1-9][0-9]*);\nvar ov = (?:0|[1-9][0-9]*)(?:\.[0-9]+)?;\nvar delayF = (?:0|[1-9][0-9]*);\nvar modoIn = (?:true|false);\nvar modoOut = (?:true|false);\n/;

  /**
   * @param {{durationFrames: unknown, overshoot: unknown, direction: unknown, delayFrames: unknown}} tokens
   * @returns {string}
   */
  function renderKinetic(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.durationFrames) ||
      Math.floor(/** @type {number} */ (tokens.durationFrames)) !== tokens.durationFrames ||
      /** @type {number} */ (tokens.durationFrames) < 1 ||
      /** @type {number} */ (tokens.durationFrames) > 1000
    ) {
      throw new Error("Duracao Kinetic invalida.");
    }
    if (
      !isFiniteNumber(tokens.overshoot) ||
      /** @type {number} */ (tokens.overshoot) < 0 ||
      /** @type {number} */ (tokens.overshoot) > 10
    ) {
      throw new Error("Overshoot Kinetic invalido.");
    }
    if (
      !isFiniteNumber(tokens.delayFrames) ||
      Math.floor(/** @type {number} */ (tokens.delayFrames)) !== tokens.delayFrames ||
      /** @type {number} */ (tokens.delayFrames) < 0 ||
      /** @type {number} */ (tokens.delayFrames) > 100000
    ) {
      throw new Error("Atraso Kinetic invalido.");
    }
    if (tokens.direction !== "in" && tokens.direction !== "out" && tokens.direction !== "both") {
      throw new Error("Direcao Kinetic invalida.");
    }

    return (
      KINETIC_HEADER +
      "var durF = " + canonicalNumber(/** @type {number} */ (tokens.durationFrames)) + ";\n" +
      "var ov = " + canonicalNumber(/** @type {number} */ (tokens.overshoot)) + ";\n" +
      "var delayF = " + canonicalNumber(/** @type {number} */ (tokens.delayFrames)) + ";\n" +
      "var modoIn = " + (tokens.direction === "in" || tokens.direction === "both" ? "true" : "false") + ";\n" +
      "var modoOut = " + (tokens.direction === "out" || tokens.direction === "both" ? "true" : "false") + ";\n" +
      KINETIC_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedKinetic(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(KINETIC_HEADER) !== 0) return false;
    var body = normalized.substring(KINETIC_HEADER.length);
    var declarations = KINETIC_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === KINETIC_BODY_TAIL;
  }

  var INERTIAL_ID = "ae.animate.inertial";
  var INERTIAL_HEADER = MotionContracts.EXPRESSION_HEADER + INERTIAL_ID + "\n";

  /**
   * Parte invariante da inercia.
   *
   * Tres protecoes que o criterio de aceite do §"ae.animate.inertial" exige e
   * que uma expressao ingenua nao tem:
   *
   *  - **Antes do primeiro keyframe nao ha velocidade a herdar.** `nearestKey`
   *    devolve o keyframe 1 mesmo quando `time` esta antes dele; sem o ajuste de
   *    indice, `key(0)` lanca e a propriedade vira NaN. Aqui `n` cai para 0 e a
   *    expressao devolve `value` intacto.
   *  - **Converge no limite configurado.** So o decaimento exponencial nunca
   *    chega a zero: sempre sobra um residuo, e no frame seguinte a `maxDur` a
   *    propriedade saltaria de volta. A janela linear `1 - t / maxDur` zera
   *    exatamente em `maxDur`, entao a oscilacao encosta no valor final sem
   *    degrau. Em `t = 0` o seno ja e zero, entao tambem nao ha degrau na
   *    partida.
   *  - **Escalar e vetor pelo mesmo caminho.** `add`/`mul` valem para os dois, e
   *    o motor JavaScript do After Effects nao aplica `+` nem `*` a array.
   *
   * Keyframe Hold cai naturalmente: a velocidade antes dele e zero, entao a
   * oscilacao e zero e a propriedade nao se mexe.
   */
  var INERTIAL_BODY_TAIL =
    "var fps = 1.0 / thisComp.frameDuration;\n" +
    "var maxDur = maxDurF / fps;\n" +
    "var resultado = value;\n" +
    "var n = 0;\n" +
    "if (thisProperty.numKeys > 0) {\n" +
    "  n = thisProperty.nearestKey(time).index;\n" +
    "  if (thisProperty.key(n).time > time) n = n - 1;\n" +
    "}\n" +
    "var elegivel = n > 0 && (!somenteUltima || n === thisProperty.numKeys);\n" +
    "if (elegivel && maxDur > 0) {\n" +
    "  var t = time - thisProperty.key(n).time;\n" +
    "  if (t >= 0 && t <= maxDur) {\n" +
    "    var v = thisProperty.velocityAtTime(thisProperty.key(n).time - thisComp.frameDuration / 10);\n" +
    "    var janela = 1 - t / maxDur;\n" +
    "    var oscilacao = (amp / 100) * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t) * janela;\n" +
    "    resultado = add(value, mul(v, oscilacao));\n" +
    "  }\n" +
    "}\n" +
    "resultado;";

  var INERTIAL_DECLARATIONS =
    /^var amp = (?:0|[1-9][0-9]*)(?:\.[0-9]+)?;\nvar freq = (?:0|[1-9][0-9]*)(?:\.[0-9]+)?;\nvar decay = (?:0|[1-9][0-9]*)(?:\.[0-9]+)?;\nvar maxDurF = (?:[1-9][0-9]*);\nvar somenteUltima = (?:true|false);\n/;

  /**
   * @param {{amplitude: unknown, frequency: unknown, decay: unknown, maxDurationFrames: unknown, startMode: unknown}} tokens
   * @returns {string}
   */
  function renderInertial(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.amplitude) ||
      /** @type {number} */ (tokens.amplitude) < 0 ||
      /** @type {number} */ (tokens.amplitude) > 1000
    ) {
      throw new Error("Amplitude inercial invalida.");
    }
    if (
      !isFiniteNumber(tokens.frequency) ||
      /** @type {number} */ (tokens.frequency) < 0 ||
      /** @type {number} */ (tokens.frequency) > 60
    ) {
      throw new Error("Frequencia inercial invalida.");
    }
    if (
      !isFiniteNumber(tokens.decay) ||
      /** @type {number} */ (tokens.decay) < 0 ||
      /** @type {number} */ (tokens.decay) > 100
    ) {
      throw new Error("Decaimento inercial invalido.");
    }
    if (
      !isFiniteNumber(tokens.maxDurationFrames) ||
      Math.floor(/** @type {number} */ (tokens.maxDurationFrames)) !== tokens.maxDurationFrames ||
      /** @type {number} */ (tokens.maxDurationFrames) < 1 ||
      /** @type {number} */ (tokens.maxDurationFrames) > 10000
    ) {
      throw new Error("Duracao maxima inercial invalida.");
    }
    if (tokens.startMode !== "everyKey" && tokens.startMode !== "lastKey") {
      throw new Error("Modo de inicio inercial invalido.");
    }

    return (
      INERTIAL_HEADER +
      "var amp = " + canonicalNumber(/** @type {number} */ (tokens.amplitude)) + ";\n" +
      "var freq = " + canonicalNumber(/** @type {number} */ (tokens.frequency)) + ";\n" +
      "var decay = " + canonicalNumber(/** @type {number} */ (tokens.decay)) + ";\n" +
      "var maxDurF = " + canonicalNumber(/** @type {number} */ (tokens.maxDurationFrames)) + ";\n" +
      "var somenteUltima = " + (tokens.startMode === "lastKey" ? "true" : "false") + ";\n" +
      INERTIAL_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedInertial(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(INERTIAL_HEADER) !== 0) return false;
    var body = normalized.substring(INERTIAL_HEADER.length);
    var declarations = INERTIAL_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === INERTIAL_BODY_TAIL;
  }

  var LOOK_AT_ID = "ae.3d.look-at";
  var LOOK_AT_HEADER = MotionContracts.EXPRESSION_HEADER + LOOK_AT_ID + "\n";
  var ORBIT_ID = "ae.3d.orbit";
  var ORBIT_HEADER = MotionContracts.EXPRESSION_HEADER + ORBIT_ID + "\n";

  /**
   * Correcao de eixo frontal, em graus somados a orientacao devolvida por
   * `lookAt`.
   *
   * `lookAt` devolve `[rx, ry, 0]` — nunca aplica roll — e o After Effects monta
   * a orientacao como `Rx . Ry . Rz`. Entao, para os eixos deste mapa, somar na
   * componente Y equivale exatamente a multiplicar `Ry` a direita:
   *
   *     Rx(a) . Ry(b) . Ry(c) = Rx(a) . Ry(b + c)
   *
   * Por isso **so** os quatro eixos do plano XZ estao aqui. Apontar +Y ou -Y
   * exigiria `Rx(a) . Ry(b) . Rx(90)`, que nao e expressavel somando componentes
   * de Euler nessa ordem: precisaria decompor a matriz de volta em rotacoes, e a
   * decomposicao e justamente o que `MotionTransform` nao faz — o mesmo motivo
   * pelo qual `ae.layer.flip` recusa 3D. Os dois eixos verticais sao recusados
   * no preflight em vez de aproximados.
   */
  /** @type {Record<string, number>} */
  var LOOK_AT_EIXOS = { "+z": 0, "-z": 180, "+x": -90, "-x": 90, "+y": 0, "-y": 0 };

  /**
   * Rotacao de correcao por eixo, em graus, aplicada **a direita** da orientacao
   * que `lookAt` devolve: `R' = R_lookAt . P`, com `P` levando o eixo escolhido
   * ate +Z.
   *
   * Para os quatro eixos do plano XZ, `P` e um giro em Y, e ai a composicao se
   * reduz a somar na componente Y — e o que `LOOK_AT_EIXOS` faz, sem matriz
   * nenhuma. Para os verticais, `P` e um giro em X e nao ha atalho: a expressao
   * compoe e decompoe de verdade.
   */
  /** @type {Record<string, number>} */
  var LOOK_AT_CORRECAO_X = { "+y": 90, "-y": -90 };

  /**
   * Decomposicao de `Rx(a) . Ry(b) . Rz(c)` em linguagem de expressao.
   *
   * Espelha `MotionTransform.eulerFromMatrix`, inclusive na convencao de gimbal
   * lock — fixar X em zero — e no clamp do seno, que impede `Math.asin` de
   * devolver NaN quando o arredondamento passa de 1.
   */
  var LOOK_AT_DECOMPOSE =
    "function motionEuler(m) {\n" +
    "  var seno = m[2] < -1 ? -1 : (m[2] > 1 ? 1 : m[2]);\n" +
    "  var b = Math.asin(seno);\n" +
    "  var cosB = Math.cos(b);\n" +
    "  var a; var c;\n" +
    "  if (Math.abs(cosB) < 0.000001) { a = 0; c = Math.atan2(m[3], m[4]); }\n" +
    "  else { a = Math.atan2(-m[5], m[8]); c = Math.atan2(-m[1], m[0]); }\n" +
    "  return [radiansToDegrees(a), radiansToDegrees(b), radiansToDegrees(c)];\n" +
    "}\n" +
    "function motionMul(x, y) {\n" +
    "  var r = [0,0,0,0,0,0,0,0,0];\n" +
    "  for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {\n" +
    "    var soma = 0;\n" +
    "    for (var k = 0; k < 3; k++) soma += x[i * 3 + k] * y[k * 3 + j];\n" +
    "    r[i * 3 + j] = soma;\n" +
    "  }\n" +
    "  return r;\n" +
    "}\n" +
    "function motionRotX(g) {\n" +
    "  var c = Math.cos(degreesToRadians(g)); var s = Math.sin(degreesToRadians(g));\n" +
    "  return [1, 0, 0, 0, c, -s, 0, s, c];\n" +
    "}\n" +
    "function motionRotY(g) {\n" +
    "  var c = Math.cos(degreesToRadians(g)); var s = Math.sin(degreesToRadians(g));\n" +
    "  return [c, 0, s, 0, 1, 0, -s, 0, c];\n" +
    "}\n" +
    "function motionRotZ(g) {\n" +
    "  var c = Math.cos(degreesToRadians(g)); var s = Math.sin(degreesToRadians(g));\n" +
    "  return [c, -s, 0, s, c, 0, 0, 0, 1];\n" +
    "}\n" +
    "function motionFromEuler(e) {\n" +
    "  return motionMul(motionRotX(e[0]), motionMul(motionRotY(e[1]), motionRotZ(e[2])));\n" +
    "}\n";

  var LOOK_AT_BODY_TAIL =
    LOOK_AT_DECOMPOSE +
    "var origem = thisLayer.toWorld([0, 0, 0]);\n" +
    "var alvoMundo = alvo.toWorld([0, 0, 0]);\n" +
    "var d = sub(alvoMundo, origem);\n" +
    "var dist = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);\n" +
    "var resultado = value;\n" +
    "if (dist > 0.0001) {\n" +
    "  var base = lookAt(origem, alvoMundo);\n" +
    "  var giro;\n" +
    "  if (correcaoX === 0) {\n" +
    "    giro = [base[0], base[1] + correcaoY, 0];\n" +
    "  } else {\n" +
    "    giro = motionEuler(motionMul(motionFromEuler([base[0], base[1], 0]), motionRotX(correcaoX)));\n" +
    "  }\n" +
    "  var rx = giro[0] + offX;\n" +
    "  var ry = giro[1] + offY;\n" +
    "  var rz = giro[2] + offZ;\n" +
    "  if (travaX) rx = value[0];\n" +
    "  if (travaY) ry = value[1];\n" +
    "  if (travaZ) rz = value[2];\n" +
    "  resultado = [rx, ry, rz];\n" +
    "}\n" +
    "resultado;";

  var LOOK_AT_DECLARATIONS =
    /^var alvo = thisComp\.layer\("(?:[^"\\\n]|\\.)*"\);\nvar correcaoY = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar correcaoX = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar offX = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar offY = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar offZ = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar travaX = (?:true|false);\nvar travaY = (?:true|false);\nvar travaZ = (?:true|false);\n/;

  /**
   * @param {{targetLayerName: unknown, forwardAxis: unknown, offsetOrientation: unknown, constrainAxes: unknown}} tokens
   * @returns {string}
   */
  function renderLookAt(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (typeof tokens.forwardAxis !== "string" || !Object.prototype.hasOwnProperty.call(LOOK_AT_EIXOS, tokens.forwardAxis)) {
      throw new Error("Eixo frontal fora dos suportados.");
    }
    var offset = /** @type {Array<unknown>} */ (tokens.offsetOrientation);
    if (!offset || typeof offset.length !== "number" || offset.length !== 3) {
      throw new Error("Offset de orientacao invalido.");
    }
    var i;
    for (i = 0; i < 3; i += 1) {
      if (!isFiniteNumber(offset[i]) || /** @type {number} */ (offset[i]) < -3600 || /** @type {number} */ (offset[i]) > 3600) {
        throw new Error("Offset de orientacao invalido.");
      }
    }
    var travas = /** @type {Record<string, unknown>} */ (tokens.constrainAxes);
    if (!travas || typeof travas.x !== "boolean" || typeof travas.y !== "boolean" || typeof travas.z !== "boolean") {
      throw new Error("Travas de eixo invalidas.");
    }

    return (
      LOOK_AT_HEADER +
      "var alvo = thisComp.layer(" + expressionStringLiteral(/** @type {string} */ (tokens.targetLayerName)) + ");\n" +
      "var correcaoY = " + canonicalNumber(/** @type {number} */ (LOOK_AT_EIXOS[tokens.forwardAxis])) + ";\n" +
      "var correcaoX = " +
        canonicalNumber(
          Object.prototype.hasOwnProperty.call(LOOK_AT_CORRECAO_X, tokens.forwardAxis)
            ? /** @type {number} */ (LOOK_AT_CORRECAO_X[tokens.forwardAxis])
            : 0
        ) + ";\n" +
      "var offX = " + canonicalNumber(/** @type {number} */ (offset[0])) + ";\n" +
      "var offY = " + canonicalNumber(/** @type {number} */ (offset[1])) + ";\n" +
      "var offZ = " + canonicalNumber(/** @type {number} */ (offset[2])) + ";\n" +
      "var travaX = " + (travas.x ? "true" : "false") + ";\n" +
      "var travaY = " + (travas.y ? "true" : "false") + ";\n" +
      "var travaZ = " + (travas.z ? "true" : "false") + ";\n" +
      LOOK_AT_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedLookAt(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(LOOK_AT_HEADER) !== 0) return false;
    var body = normalized.substring(LOOK_AT_HEADER.length);
    var declarations = LOOK_AT_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === LOOK_AT_BODY_TAIL;
  }

  /** @returns {ReadonlyArray<string>} */
  function lookAtSupportedAxes() {
    var eixos = [];
    var chave;
    for (chave in LOOK_AT_EIXOS) {
      if (Object.prototype.hasOwnProperty.call(LOOK_AT_EIXOS, chave)) eixos.push(chave);
    }
    return eixos;
  }

  /**
   * Orbita no espaco do **pai**, e nao da composicao.
   *
   * A camada e parenteada ao null controlador, entao o centro da orbita e sempre
   * `[0, 0, 0]` aqui dentro. Isso troca uma referencia por nome ou por indice —
   * as duas instaveis, e a §11 e explicita sobre nome — por uma relacao
   * estrutural que sobrevive a renomear e a reordenar, e faz mover o null mover
   * a orbita inteira.
   *
   * O raio sai constante por construcao:
   *
   *     |p|^2 = r^2 cos^2(a) + r^2 sin^2(a) sin^2(i) + r^2 sin^2(a) cos^2(i)
   *           = r^2 cos^2(a) + r^2 sin^2(a) = r^2
   *
   * que e o criterio de aceite de "raio permanece constante".
   */
  var ORBIT_BODY_TAIL =
    "var giro = degreesToRadians(time * vel + fase);\n" +
    "var incl = degreesToRadians(inclinacao);\n" +
    "var px = raio * Math.cos(giro);\n" +
    "var plano = raio * Math.sin(giro);\n" +
    "[px, plano * Math.sin(incl), plano * Math.cos(incl)];";

  var ORBIT_DECLARATIONS =
    /^var raio = (?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar vel = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar inclinacao = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar fase = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\n/;

  /**
   * @param {{radius: unknown, speed: unknown, inclination: unknown, phase: unknown}} tokens
   * @returns {string}
   */
  function renderOrbit(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (!isFiniteNumber(tokens.radius) || /** @type {number} */ (tokens.radius) < 0 || /** @type {number} */ (tokens.radius) > 1000000) {
      throw new Error("Raio de orbita invalido.");
    }
    if (!isFiniteNumber(tokens.speed) || /** @type {number} */ (tokens.speed) < -36000 || /** @type {number} */ (tokens.speed) > 36000) {
      throw new Error("Velocidade de orbita invalida.");
    }
    if (!isFiniteNumber(tokens.inclination) || /** @type {number} */ (tokens.inclination) < -360 || /** @type {number} */ (tokens.inclination) > 360) {
      throw new Error("Inclinacao de orbita invalida.");
    }
    if (!isFiniteNumber(tokens.phase) || /** @type {number} */ (tokens.phase) < -36000 || /** @type {number} */ (tokens.phase) > 36000) {
      throw new Error("Fase de orbita invalida.");
    }

    return (
      ORBIT_HEADER +
      "var raio = " + canonicalNumber(/** @type {number} */ (tokens.radius)) + ";\n" +
      "var vel = " + canonicalNumber(/** @type {number} */ (tokens.speed)) + ";\n" +
      "var inclinacao = " + canonicalNumber(/** @type {number} */ (tokens.inclination)) + ";\n" +
      "var fase = " + canonicalNumber(/** @type {number} */ (tokens.phase)) + ";\n" +
      ORBIT_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedOrbit(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(ORBIT_HEADER) !== 0) return false;
    var body = normalized.substring(ORBIT_HEADER.length);
    var declarations = ORBIT_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === ORBIT_BODY_TAIL;
  }

  /**
   * Orientacao que encara o centro da orbita, que no espaco do pai e a origem.
   * Sem tokens: a expressao inteira e constante.
   */
  var ORBIT_FACE_BODY =
    "var origem = thisLayer.toWorld([0, 0, 0]);\n" +
    "var centro = thisLayer.parent.toWorld([0, 0, 0]);\n" +
    "var d = sub(centro, origem);\n" +
    "var dist = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);\n" +
    "dist > 0.0001 ? lookAt(origem, centro) : value;";

  /** @returns {string} */
  function renderOrbitFacing() {
    return ORBIT_HEADER + ORBIT_FACE_BODY;
  }

  /** @param {string} source @returns {boolean} */
  function isManagedOrbitFacing(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    return normalized === ORBIT_HEADER + ORBIT_FACE_BODY;
  }

  var WAVE_ID = "ae.effect.wave";
  var WAVE_HEADER = MotionContracts.EXPRESSION_HEADER + WAVE_ID + "\n";

  /**
   * Ondulacao por transform.
   *
   * O criterio de aceite pede que **amplitude zero volte exatamente a aparencia
   * original**. Sai de graca aqui: com `amp = 0` o deslocamento e zero e
   * `add(value, [0, 0])` devolve `value` sem arredondar nada. Uma formulacao que
   * multiplicasse `value` por um fator perto de 1 nao teria essa garantia.
   *
   * `add` em vez de `+`: o motor JavaScript do After Effects nao soma arrays com
   * operador, e Position e array.
   */
  var WAVE_BODY_TAIL =
    "var ang = degreesToRadians(fase) + time * freq * 2 * Math.PI;\n" +
    "var deslocamento = amp * Math.sin(ang);\n" +
    "add(value, horizontal ? [deslocamento, 0] : [0, deslocamento]);";

  var WAVE_DECLARATIONS =
    /^var amp = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar freq = (?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar fase = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar horizontal = (?:true|false);\n/;

  /**
   * @param {{amplitude: unknown, frequency: unknown, phase: unknown, direction: unknown}} tokens
   * @returns {string}
   */
  function renderWave(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.amplitude) ||
      /** @type {number} */ (tokens.amplitude) < -100000 ||
      /** @type {number} */ (tokens.amplitude) > 100000
    ) {
      throw new Error("Amplitude de onda invalida.");
    }
    if (
      !isFiniteNumber(tokens.frequency) ||
      /** @type {number} */ (tokens.frequency) < 0 ||
      /** @type {number} */ (tokens.frequency) > 1000
    ) {
      throw new Error("Frequencia de onda invalida.");
    }
    if (
      !isFiniteNumber(tokens.phase) ||
      /** @type {number} */ (tokens.phase) < -36000 ||
      /** @type {number} */ (tokens.phase) > 36000
    ) {
      throw new Error("Fase de onda invalida.");
    }
    if (tokens.direction !== "horizontal" && tokens.direction !== "vertical") {
      throw new Error("Direcao de onda invalida.");
    }

    return (
      WAVE_HEADER +
      "var amp = " + canonicalNumber(/** @type {number} */ (tokens.amplitude)) + ";\n" +
      "var freq = " + canonicalNumber(/** @type {number} */ (tokens.frequency)) + ";\n" +
      "var fase = " + canonicalNumber(/** @type {number} */ (tokens.phase)) + ";\n" +
      "var horizontal = " + (tokens.direction === "horizontal" ? "true" : "false") + ";\n" +
      WAVE_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedWave(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(WAVE_HEADER) !== 0) return false;
    var body = normalized.substring(WAVE_HEADER.length);
    var declarations = WAVE_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === WAVE_BODY_TAIL;
  }

  var GLITCH_ID = "ae.effect.glitch";
  var GLITCH_HEADER = MotionContracts.EXPRESSION_HEADER + GLITCH_ID + "\n";

  /**
   * Deslocamento que pisca em blocos.
   *
   * `posterizeTime` trava o sorteio na frequencia pedida: sem ele o valor mudaria
   * a cada frame e viraria tremor continuo, e nao glitch. `seedRandom` com o
   * segundo argumento em `true` torna a sequencia **reproduzivel** — o mesmo
   * preset da o mesmo glitch em outra maquina, que e o que separa um preset de
   * um sorteio.
   *
   * O intervalo de `random` e centrado em zero para o deslocamento ir para os
   * dois lados; `[d, 0]` mantem o pulo so na horizontal, que e a leitura visual
   * de fita quebrada.
   */
  var GLITCH_BODY_TAIL =
    "posterizeTime(freq);\n" +
    "seedRandom(semente, true);\n" +
    "var d = random(-amount, amount);\n" +
    "add(value, [d, 0]);";

  var GLITCH_DECLARATIONS =
    /^var amount = (?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar freq = (?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar semente = (?:0|[1-9][0-9]*);\n/;

  /**
   * @param {{amount: unknown, frequency: unknown, seed: unknown}} tokens
   * @returns {string}
   */
  function renderGlitchDisplacement(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.amount) ||
      /** @type {number} */ (tokens.amount) < 0 ||
      /** @type {number} */ (tokens.amount) > 100000
    ) {
      throw new Error("Deslocamento de glitch invalido.");
    }
    if (
      !isFiniteNumber(tokens.frequency) ||
      /** @type {number} */ (tokens.frequency) < 0 ||
      /** @type {number} */ (tokens.frequency) > 1000
    ) {
      throw new Error("Frequencia de glitch invalida.");
    }
    if (
      !isFiniteNumber(tokens.seed) ||
      Math.floor(/** @type {number} */ (tokens.seed)) !== tokens.seed ||
      /** @type {number} */ (tokens.seed) < 0 ||
      /** @type {number} */ (tokens.seed) > 1000000
    ) {
      throw new Error("Semente de glitch invalida.");
    }

    return (
      GLITCH_HEADER +
      "var amount = " + canonicalNumber(/** @type {number} */ (tokens.amount)) + ";\n" +
      "var freq = " + canonicalNumber(/** @type {number} */ (tokens.frequency)) + ";\n" +
      "var semente = " + canonicalNumber(/** @type {number} */ (tokens.seed)) + ";\n" +
      GLITCH_BODY_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedGlitchDisplacement(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(GLITCH_HEADER) !== 0) return false;
    var body = normalized.substring(GLITCH_HEADER.length);
    var declarations = GLITCH_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === GLITCH_BODY_TAIL;
  }

  var EFFECTOR_ID = "ae.rig.effector";
  var EFFECTOR_HEADER = MotionContracts.EXPRESSION_HEADER + EFFECTOR_ID + "\n";

  /**
   * Parte comum do Effector: ler o controller, medir a distancia e converter em
   * influencia.
   *
   * ## Fora do raio, valor base exato
   *
   * O criterio de aceite pede que fora do raio a propriedade volte **exatamente**
   * ao valor base. `t` e zero ali por construcao — `clamp(1 - d/raio, 0, 1)` —, as
   * tres curvas valem zero em zero, e o resultado final soma zero ao valor. Nao
   * ha arredondamento no caminho.
   *
   * ## A curva Bezier customizada
   *
   * A Bezier de easing e dada por x(u) e y(u); o que se quer e y para um x. Nao
   * ha forma fechada, entao a expressao faz **bisseccao**: vinte passos reduzem o
   * intervalo por 2^20, o que da precisao melhor que 1e-6 em x. Iterativo de
   * proposito — Newton convergiria mais rapido mas diverge quando a derivada
   * chega perto de zero, que e justamente o caso de alca vertical.
   */
  var EFFECTOR_PREFIXO =
    "var ctrl = thisComp.layer(nomeCtrl);\n" +
    "var raio = ctrl.effect(nomeRaio)(1);\n" +
    "var quantia = ctrl.effect(nomeQuantia)(1);\n" +
    "var centro = ctrl.toWorld([0, 0, 0]);\n" +
    "var aqui = thisLayer.toWorld([0, 0, 0]);\n" +
    "var delta = sub(aqui, centro);\n" +
    "var d = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]);\n" +
    "var t = raio > 0 ? Math.max(0, Math.min(1, 1 - d / raio)) : 0;\n" +
    "var f;\n" +
    "if (curva === 1) {\n" +
    "  f = t;\n" +
    "} else if (curva === 2) {\n" +
    "  f = t * t * (3 - 2 * t);\n" +
    "} else {\n" +
    "  var lo = 0; var hi = 1; var u = t;\n" +
    "  for (var i = 0; i < 20; i++) {\n" +
    "    u = (lo + hi) / 2;\n" +
    "    var v = 1 - u;\n" +
    "    var x = 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u * u * u;\n" +
    "    if (x < t) { lo = u; } else { hi = u; }\n" +
    "  }\n" +
    "  var w = 1 - u;\n" +
    "  f = 3 * w * w * u * cy1 + 3 * w * u * u * cy2 + u * u * u;\n" +
    "}\n";

  /**
   * Cada propriedade alvo tem um final proprio.
   *
   * Position empurra na direcao radial, que so existe quando ha distancia: no
   * centro exato a direcao seria 0/0, entao o vetor vira zero e nao NaN. As
   * outras tres sao escalares e nao precisam de direcao.
   */
  /** @type {Record<string, string>} */
  var EFFECTOR_TAILS = {
    position:
      "var dir = d > 0.0001 ? [delta[0] / d, delta[1] / d, delta[2] / d] : [0, 0, 0];\n" +
      "add(value, mul(dir, quantia * f));",
    scale: "mul(value, 1 + (quantia / 100) * f);",
    rotation: "value + quantia * f;",
    opacity: "Math.max(0, Math.min(100, value + quantia * f));"
  };

  var EFFECTOR_DECLARATIONS =
    /^var nomeCtrl = ("(?:[^"\\\n]|\\.)*");\nvar nomeRaio = ("(?:[^"\\\n]|\\.)*");\nvar nomeQuantia = ("(?:[^"\\\n]|\\.)*");\nvar curva = (?:1|2|3);\nvar cx1 = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar cy1 = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar cx2 = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\nvar cy2 = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\n/;

  /** @type {Record<string, number>} */
  var EFFECTOR_CURVAS = { linear: 1, smoothstep: 2, bezier: 3 };

  /**
   * @param {{controllerName: unknown, radiusEffectName: unknown, amountEffectName: unknown, falloffCurve: unknown, curve: unknown, target: unknown}} tokens
   * @returns {string}
   */
  function renderEffector(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (typeof tokens.target !== "string" || !Object.prototype.hasOwnProperty.call(EFFECTOR_TAILS, tokens.target)) {
      throw new Error("Alvo de effector invalido.");
    }
    if (
      typeof tokens.falloffCurve !== "string" ||
      !Object.prototype.hasOwnProperty.call(EFFECTOR_CURVAS, tokens.falloffCurve)
    ) {
      throw new Error("Curva de queda invalida.");
    }
    var curva = /** @type {Record<string, number>} */ (tokens.curve);
    if (!curva) throw new Error("Curva ausente.");
    var componentes = ["x1", "y1", "x2", "y2"];
    var i;
    for (i = 0; i < componentes.length; i += 1) {
      var nome = /** @type {string} */ (componentes[i]);
      if (!isFiniteNumber(curva[nome])) throw new Error("Curva invalida.");
    }

    return (
      EFFECTOR_HEADER +
      "var nomeCtrl = " + expressionStringLiteral(/** @type {string} */ (tokens.controllerName)) + ";\n" +
      "var nomeRaio = " + expressionStringLiteral(/** @type {string} */ (tokens.radiusEffectName)) + ";\n" +
      "var nomeQuantia = " + expressionStringLiteral(/** @type {string} */ (tokens.amountEffectName)) + ";\n" +
      "var curva = " +
        canonicalNumber(
          /** @type {number} */ (EFFECTOR_CURVAS[/** @type {string} */ (tokens.falloffCurve)])
        ) + ";\n" +
      "var cx1 = " + canonicalNumber(/** @type {number} */ (curva.x1)) + ";\n" +
      "var cy1 = " + canonicalNumber(/** @type {number} */ (curva.y1)) + ";\n" +
      "var cx2 = " + canonicalNumber(/** @type {number} */ (curva.x2)) + ";\n" +
      "var cy2 = " + canonicalNumber(/** @type {number} */ (curva.y2)) + ";\n" +
      EFFECTOR_PREFIXO +
      /** @type {string} */ (EFFECTOR_TAILS[/** @type {string} */ (tokens.target)])
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedEffector(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(EFFECTOR_HEADER) !== 0) return false;
    var body = normalized.substring(EFFECTOR_HEADER.length);
    var declarations = EFFECTOR_DECLARATIONS.exec(body);
    if (!declarations) return false;
    var resto = body.substring(declarations[0].length);
    if (resto.indexOf(EFFECTOR_PREFIXO) !== 0) return false;
    var cauda = resto.substring(EFFECTOR_PREFIXO.length);
    var alvo;
    for (alvo in EFFECTOR_TAILS) {
      if (Object.prototype.hasOwnProperty.call(EFFECTOR_TAILS, alvo) && cauda === EFFECTOR_TAILS[alvo]) return true;
    }
    return false;
  }

  /* ------------------------------------------- Parallax completo (CHMS-023) */

  var PARALLAX_FOCUS_ID = "ae.parallax.auto-focus";
  var PARALLAX_FOCUS_HEADER = MotionContracts.EXPRESSION_HEADER + PARALLAX_FOCUS_ID + "\n";

  /**
   * Distancia da camera ao alvo, que e exatamente o que o Focus Distance quer.
   *
   * `toWorld([0, 0, 0])` na camera devolve a posicao dela no mundo, e o mesmo
   * no alvo devolve a ancora do alvo no mundo. A distancia entre os dois pontos
   * mantem o foco grudado no alvo mesmo com os dois animados — que e o motivo de
   * isto ser expressao e nao um valor assado.
   */
  var PARALLAX_FOCUS_TAIL = "length(toWorld([0, 0, 0]), alvo.toWorld(alvo.anchorPoint)) + offset;";

  var PARALLAX_FOCUS_DECLARATIONS =
    /^var alvo = thisComp\.layer\("(?:[^"\\\n]|\\.)*"\);\nvar offset = (?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?);\n/;

  /**
   * @param {{targetLayerName: unknown, focusOffset: unknown}} tokens
   * @returns {string}
   */
  function renderParallaxFocus(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.focusOffset) ||
      /** @type {number} */ (tokens.focusOffset) < -100000 ||
      /** @type {number} */ (tokens.focusOffset) > 100000
    ) {
      throw new Error("Offset de foco invalido.");
    }

    return (
      PARALLAX_FOCUS_HEADER +
      "var alvo = thisComp.layer(" +
      expressionStringLiteral(/** @type {string} */ (tokens.targetLayerName)) +
      ");\n" +
      "var offset = " + canonicalNumber(/** @type {number} */ (tokens.focusOffset)) + ";\n" +
      PARALLAX_FOCUS_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedParallaxFocus(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(PARALLAX_FOCUS_HEADER) !== 0) return false;
    var body = normalized.substring(PARALLAX_FOCUS_HEADER.length);
    var declarations = PARALLAX_FOCUS_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === PARALLAX_FOCUS_TAIL;
  }

  var PARALLAX_WIGGLE_ID = "ae.parallax.wiggle";
  var PARALLAX_WIGGLE_HEADER = MotionContracts.EXPRESSION_HEADER + PARALLAX_WIGGLE_ID + "\n";

  /** Nomes dos sliders no controller. ASCII: o bundle final e ASCII-only. */
  var PARALLAX_WIGGLE_FREQ = "Parallax Frequencia";
  var PARALLAX_WIGGLE_AMP = "Parallax Amplitude";

  /**
   * Frequencia e amplitude vem de sliders, e nao assadas na expressao, pelo
   * mesmo motivo do Effector: assim o usuario ajusta arrastando na timeline e
   * pode anima-las, em vez de rodar o comando de novo a cada tentativa.
   *
   * `seedRandom(semente, false)` fixa a sequencia — duas camaras com a mesma
   * semente balancam igual, e com sementes diferentes, diferente. O `false` diz
   * que o ruido continua variando no tempo; `true` congelaria o wiggle.
   */
  var PARALLAX_WIGGLE_TAIL =
    'var freq = ctrl.effect("' + PARALLAX_WIGGLE_FREQ + '")(1);\n' +
    'var amp = ctrl.effect("' + PARALLAX_WIGGLE_AMP + '")(1);\n' +
    "seedRandom(semente, false);\n" +
    "wiggle(freq, amp);";

  var PARALLAX_WIGGLE_DECLARATIONS =
    /^var ctrl = thisComp\.layer\("(?:[^"\\\n]|\\.)*"\);\nvar semente = (?:0|[1-9][0-9]*);\n/;

  /**
   * @param {{controllerName: unknown, seed: unknown}} tokens
   * @returns {string}
   */
  function renderParallaxWiggle(tokens) {
    if (!tokens) throw new Error("Tokens ausentes.");
    if (
      !isFiniteNumber(tokens.seed) ||
      /** @type {number} */ (tokens.seed) < 0 ||
      /** @type {number} */ (tokens.seed) > 1000000 ||
      Math.floor(/** @type {number} */ (tokens.seed)) !== tokens.seed
    ) {
      throw new Error("Semente de wiggle invalida.");
    }

    return (
      PARALLAX_WIGGLE_HEADER +
      "var ctrl = thisComp.layer(" +
      expressionStringLiteral(/** @type {string} */ (tokens.controllerName)) +
      ");\n" +
      "var semente = " + canonicalNumber(/** @type {number} */ (tokens.seed)) + ";\n" +
      PARALLAX_WIGGLE_TAIL
    );
  }

  /** @param {string} source @returns {boolean} */
  function isManagedParallaxWiggle(source) {
    if (typeof source !== "string") return false;
    var normalized = source.replace(/\r\n?/g, "\n");
    if (normalized.indexOf(PARALLAX_WIGGLE_HEADER) !== 0) return false;
    var body = normalized.substring(PARALLAX_WIGGLE_HEADER.length);
    var declarations = PARALLAX_WIGGLE_DECLARATIONS.exec(body);
    if (!declarations) return false;
    return body.substring(declarations[0].length) === PARALLAX_WIGGLE_TAIL;
  }

  global.MotionExpressions = {
    renderParallaxFocus: renderParallaxFocus,
    isManagedParallaxFocus: isManagedParallaxFocus,
    renderParallaxWiggle: renderParallaxWiggle,
    isManagedParallaxWiggle: isManagedParallaxWiggle,
    parallaxWiggleSliderNames: { frequency: PARALLAX_WIGGLE_FREQ, amplitude: PARALLAX_WIGGLE_AMP },
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
    isManagedTextBoxPosition: isManagedTextBoxPosition,
    renderAnchorAverageProbe: renderAnchorAverageProbe,
    renderBoundsCenterProbe: renderBoundsCenterProbe,
    renderTimeController: renderTimeController,
    isManagedTimeController: isManagedTimeController,
    renderMarkerLoop: renderMarkerLoop,
    isManagedMarkerLoop: isManagedMarkerLoop,
    renderKinetic: renderKinetic,
    isManagedKinetic: isManagedKinetic,
    renderInertial: renderInertial,
    isManagedInertial: isManagedInertial,
    renderLookAt: renderLookAt,
    isManagedLookAt: isManagedLookAt,
    lookAtSupportedAxes: lookAtSupportedAxes,
    renderOrbit: renderOrbit,
    isManagedOrbit: isManagedOrbit,
    renderOrbitFacing: renderOrbitFacing,
    isManagedOrbitFacing: isManagedOrbitFacing,
    renderWave: renderWave,
    isManagedWave: isManagedWave,
    renderGlitchDisplacement: renderGlitchDisplacement,
    isManagedGlitchDisplacement: isManagedGlitchDisplacement,
    renderEffector: renderEffector,
    isManagedEffector: isManagedEffector
  };
}($.global));
