/**
 * Biblioteca de formas vetoriais (`ae.shape.library`, CHMS-021).
 *
 * A §"ae.shape.library" pede "somente shape operators nativos" e "presets JSON
 * versionados e sem assets proprietarios". As oito formas saem daqui, e nenhuma
 * delas importa arquivo: retangulo, elipse e poligono/estrela sao operadores do
 * proprio After Effects; linha, seta e balao sao caminhos declarados ponto a
 * ponto neste modulo.
 *
 * O criterio de aceite — "cada shape e editavel e mantem controles" — e o motivo
 * de tudo ser operador nativo em vez de caminho assado: um retangulo criado como
 * `ADBE Vector Shape - Rect` continua tendo Tamanho e Arredondamento no
 * timeline, e um assado como caminho livre nao teria.
 *
 * ## Handles de propriedade
 *
 * Vale a regra medida em `text-box.jsx`: acrescentar um irmao dentro de um grupo
 * invalida os handles ja obtidos. Toda referencia usada depois de um
 * `addProperty` e relida do grupo.
 */
(function () {
  /* global Shape */
  var ALLOWED = {
    shapeType: true,
    size: true,
    fillColor: true,
    strokeColor: true,
    strokeWidth: true,
    roundness: true,
    points: true,
    position: true
  };

  var MN = {
    rootContents: "ADBE Root Vectors Group",
    group: "ADBE Vector Group",
    groupContents: "ADBE Vectors Group",
    rect: "ADBE Vector Shape - Rect",
    rectSize: "ADBE Vector Rect Size",
    rectRoundness: "ADBE Vector Rect Roundness",
    ellipse: "ADBE Vector Shape - Ellipse",
    ellipseSize: "ADBE Vector Ellipse Size",
    star: "ADBE Vector Shape - Star",
    starType: "ADBE Vector Star Type",
    starPoints: "ADBE Vector Star Points",
    starOuterRadius: "ADBE Vector Star Outer Radius",
    starInnerRadius: "ADBE Vector Star Inner Radius",
    starOuterRoundness: "ADBE Vector Star Outer Roundess",
    path: "ADBE Vector Shape - Group",
    pathShape: "ADBE Vector Shape",
    fill: "ADBE Vector Graphic - Fill",
    fillColor: "ADBE Vector Fill Color",
    stroke: "ADBE Vector Graphic - Stroke",
    strokeColor: "ADBE Vector Stroke Color",
    strokeWidth: "ADBE Vector Stroke Width",
    transform: "ADBE Transform Group",
    position: "ADBE Position"
  };

  /** Tipo de estrela no operador nativo: 1 e estrela, 2 e poligono. */
  var STAR_TYPE_STAR = 1;
  var STAR_TYPE_POLYGON = 2;

  var TIPOS = {
    circle: true,
    rectangle: true,
    roundedRectangle: true,
    polygon: true,
    star: true,
    line: true,
    arrow: true,
    callout: true
  };

  /** Formas desenhadas por caminho, e nao por operador parametrico. */
  var POR_CAMINHO = { line: true, arrow: true, callout: true };

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
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {unknown} value @param {number} minimo @param {number} maximo @returns {boolean} */
  function isInRange(value, minimo, maximo) {
    return (
      isFiniteNumber(value) && /** @type {number} */ (value) >= minimo && /** @type {number} */ (value) <= maximo
    );
  }

  /**
   * Cor do After Effects e RGB normalizado em 0..1, e nao 0..255.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  function isColor(value) {
    var array = /** @type {Array<unknown>} */ (value);
    if (!value || typeof array.length !== "number" || array.length !== 3) return false;
    var i;
    for (i = 0; i < 3; i += 1) {
      if (!isInRange(array[i], 0, 1)) return false;
    }
    return true;
  }

  /** @param {unknown} value @returns {boolean} */
  function isPoint(value) {
    var array = /** @type {Array<unknown>} */ (value);
    if (!value || typeof array.length !== "number" || array.length !== 2) return false;
    return isInRange(array[0], -100000, 100000) && isInRange(array[1], -100000, 100000);
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de forma desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de forma ausente.", { field: key });
      }
    }
    if (typeof args.shapeType !== "string" || !Object.prototype.hasOwnProperty.call(TIPOS, args.shapeType)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tipo de forma invalido.", { field: "shapeType" });
    }
    if (!isInRange(args.size, 1, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tamanho de forma invalido.", { field: "size" });
    }
    if (!isColor(args.fillColor)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Cor de preenchimento invalida.", { field: "fillColor" });
    }
    if (!isColor(args.strokeColor)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Cor de traco invalida.", { field: "strokeColor" });
    }
    if (!isInRange(args.strokeWidth, 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Espessura de traco invalida.", { field: "strokeWidth" });
    }
    if (!isInRange(args.roundness, 0, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Arredondamento invalido.", { field: "roundness" });
    }
    // Tres pontas e o minimo para existir poligono; abaixo disso o operador
    // nativo nao desenha nada.
    if (
      !isFiniteNumber(args.points) ||
      Math.floor(/** @type {number} */ (args.points)) !== args.points ||
      !isInRange(args.points, 3, 1000)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Numero de pontas invalido.", { field: "points" });
    }
    if (!isPoint(args.position)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Posicao de forma invalida.", { field: "position" });
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;
    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }
    return null;
  }

  /**
   * Vertices de cada forma desenhada por caminho, centrados na origem.
   *
   * `closed` acompanha a forma porque uma linha aberta e uma seta fechada usam o
   * mesmo `setValue` e mudam so nesse campo.
   *
   * @param {string} shapeType
   * @param {number} size
   * @returns {{ vertices: number[][], closed: boolean }}
   */
  function caminhoDe(shapeType, size) {
    var metade = size / 2;
    if (shapeType === "line") {
      return { vertices: [[-metade, 0], [metade, 0]], closed: false };
    }
    if (shapeType === "arrow") {
      // Haste com ponta: proporcoes em fracao do tamanho, para a seta crescer
      // inteira quando o tamanho muda.
      var haste = size * 0.12;
      var pontaLargura = size * 0.3;
      var pontaInicio = metade - size * 0.3;
      return {
        vertices: [
          [-metade, -haste],
          [pontaInicio, -haste],
          [pontaInicio, -pontaLargura],
          [metade, 0],
          [pontaInicio, pontaLargura],
          [pontaInicio, haste],
          [-metade, haste]
        ],
        closed: true
      };
    }
    // callout: retangulo com bico embaixo, a esquerda do centro.
    var altura = size * 0.6;
    var meiaAltura = altura / 2;
    var bicoBase = -size * 0.1;
    var bicoPonta = -size * 0.25;
    return {
      vertices: [
        [-metade, -meiaAltura],
        [metade, -meiaAltura],
        [metade, meiaAltura],
        [bicoBase + size * 0.15, meiaAltura],
        [bicoPonta, meiaAltura + size * 0.2],
        [bicoBase, meiaAltura],
        [-metade, meiaAltura]
      ],
      closed: true
    };
  }

  /**
   * Monta o conteudo da forma num grupo JA criado.
   *
   * @param {PropertyGroup} inner
   * @param {Record<string, unknown>} args
   * @returns {void}
   */
  function montarForma(inner, args) {
    var shapeType = /** @type {string} */ (args.shapeType);
    var size = /** @type {number} */ (args.size);
    var strokeWidth = /** @type {number} */ (args.strokeWidth);

    if (Object.prototype.hasOwnProperty.call(POR_CAMINHO, shapeType)) {
      inner.addProperty(MN.path);
    } else if (shapeType === "circle") {
      inner.addProperty(MN.ellipse);
    } else if (shapeType === "polygon" || shapeType === "star") {
      inner.addProperty(MN.star);
    } else {
      inner.addProperty(MN.rect);
    }

    // Preenchimento antes do traco, e ambos depois da forma: dentro de um grupo
    // o operador pinta o que esta acima dele, e e essa a ordem que o proprio
    // After Effects cria.
    inner.addProperty(MN.fill);
    if (strokeWidth > 0) inner.addProperty(MN.stroke);

    // RELER depois de todas as insercoes: os handles devolvidos por addProperty
    // deixam de valer assim que outro irmao entra no grupo.
    if (Object.prototype.hasOwnProperty.call(POR_CAMINHO, shapeType)) {
      var grupoCaminho = inner.property(MN.path);
      if (!grupoCaminho) throw new Error("After Effects nao devolveu o caminho recem-criado.");
      var propCaminho = grupoCaminho.property(MN.pathShape);
      if (!propCaminho) throw new Error("Caminho sem a propriedade de forma.");
      var desenho = caminhoDe(shapeType, size);
      var forma = new Shape();
      forma.vertices = desenho.vertices;
      forma.closed = desenho.closed;
      propCaminho.setValue(forma);
    } else if (shapeType === "circle") {
      var elipse = inner.property(MN.ellipse);
      if (!elipse) throw new Error("After Effects nao devolveu a elipse recem-criada.");
      elipse.property(MN.ellipseSize).setValue([size, size]);
    } else if (shapeType === "polygon" || shapeType === "star") {
      var estrela = inner.property(MN.star);
      if (!estrela) throw new Error("After Effects nao devolveu a estrela recem-criada.");
      estrela.property(MN.starType).setValue(shapeType === "star" ? STAR_TYPE_STAR : STAR_TYPE_POLYGON);
      estrela.property(MN.starPoints).setValue(/** @type {number} */ (args.points));
      estrela.property(MN.starOuterRadius).setValue(size / 2);
      // Raio interno so existe na estrela; no poligono o operador o ignora.
      if (shapeType === "star") estrela.property(MN.starInnerRadius).setValue(size / 4);
      estrela.property(MN.starOuterRoundness).setValue(0);
    } else {
      var retangulo = inner.property(MN.rect);
      if (!retangulo) throw new Error("After Effects nao devolveu o retangulo recem-criado.");
      retangulo.property(MN.rectSize).setValue([size, size]);
      // Arredondamento so no retangulo arredondado: pedir canto redondo no
      // retangulo comum mudaria a forma que o usuario escolheu.
      retangulo.property(MN.rectRoundness).setValue(
        shapeType === "roundedRectangle" ? /** @type {number} */ (args.roundness) : 0
      );
    }

    var preenchimento = inner.property(MN.fill);
    if (!preenchimento) throw new Error("After Effects nao devolveu o preenchimento.");
    preenchimento.property(MN.fillColor).setValue(args.fillColor);

    if (strokeWidth > 0) {
      var traco = inner.property(MN.stroke);
      if (!traco) throw new Error("After Effects nao devolveu o traco.");
      traco.property(MN.strokeColor).setValue(args.strokeColor);
      traco.property(MN.strokeWidth).setValue(strokeWidth);
    }
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var shapeType = /** @type {string} */ (args.shapeType);

    // A camada e criada antes do try de proposito: quem cria precisa registrar a
    // referencia para rollback no instante em que ela passa a existir. Criar
    // dentro do bloco que monta faria uma falha no meio deixar uma camada
    // meio-construida fora do alcance do rollback.
    var layer = comp.layers.addShape();

    try {
      // Nome so para leitura humana no timeline. A identificacao gerenciada e
      // sempre estrutural, nunca por este texto: §11.
      layer.name = MotionContracts.RIG_PREFIX + shapeType.toUpperCase();

      var contents = layer.property(MN.rootContents);
      if (!contents) throw new Error("Camada de forma sem grupo de conteudo.");
      contents.addProperty(MN.group);
      var grupo = contents.property(1);
      if (!grupo) throw new Error("After Effects nao devolveu o grupo recem-criado.");
      var inner = grupo.property(MN.groupContents);
      if (!inner) throw new Error("Grupo de forma sem conteudo.");

      montarForma(inner, args);

      var transform = layer.property(MN.transform);
      if (!transform) throw new Error("Camada de forma sem grupo de transform.");
      var posicao = transform.property(MN.position);
      if (!posicao) throw new Error("Camada de forma sem Position.");
      posicao.setValue(args.position);
    } catch (shapeError) {
      try {
        layer.remove();
      } catch (removeError) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("A forma falhou e a camada criada nao pode ser removida.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("A criacao da forma falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: true,
      warnings: [],
      data: { shapeType: shapeType, layerName: layer.name }
    };
  }

  MotionRegistry.register("ae.shape.library", { preflight: preflight, run: run });
})();
