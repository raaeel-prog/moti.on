/**
 * `ae.anchor.align` move o anchor point para um dos nove pontos do bounds.
 *
 * ## A compensacao, por matriz e nao por expressao
 *
 * A §14.5 e explicita: nao usar expressao temporaria quando a operacao pode ser
 * resolvida por matriz. Aqui pode, e a derivacao cabe em tres linhas.
 *
 * O transform leva o espaco da camada ao espaco do PAI por
 *
 *   p = posicao + R(t) . S . (v - ancora)
 *
 * Para a aparencia nao mudar quando a ancora vai de A para A':
 *
 *   posicao' + R.S.(v - A')  =  posicao + R.S.(v - A)
 *   posicao'                 =  posicao + R.S.(A' - A)
 *
 * O transform do pai **cancela**: `posicao` ja esta em espaco do pai, e os dois
 * lados passam pela mesma matriz de pai. A compensacao e inteiramente local, e
 * vale para qualquer profundidade de parentesco.
 *
 * `R . S` vem de `MotionTransform.linearMatrix`, que serve 2D e 3D pelo mesmo
 * caminho: a composicao esta medida em docs/research/after-effects-3d-transform.md,
 * com erro de 5,684e-14 contra o host. Uma camada 2D e o caso em que
 * orientation e as rotacoes X e Y sao zero.
 *
 * ## Escopo recusado de proposito
 *
 * Os modos **Convex** e **Concave** dependem de analise de path — convex hull
 * e sinal de cross product — e sao corpo de trabalho proprio.
 */
(function () {
  var REQUIRED_ARGS = {
    gridPoint: true,
    mode: true,
    boundsSource: true,
    timeMode: true,
    fixedTime: true,
    includeExtents: true,
    preserveVisualPosition: true,
    randomSeed: true,
    preview: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    anchorPoint: "ADBE Anchor Point",
    position: "ADBE Position",
    scale: "ADBE Scale",
    rotation: "ADBE Rotate Z"
  };

  /** Os nove pontos, em fracoes do bounds.
   * @type {Record<string, number[]>} */
  var GRADE = {
    topLeft: [0, 0],
    topCenter: [0.5, 0],
    topRight: [1, 0],
    midLeft: [0, 0.5],
    center: [0.5, 0.5],
    midRight: [1, 0.5],
    bottomLeft: [0, 1],
    bottomCenter: [0.5, 1],
    bottomRight: [1, 1]
  };

  /** Ponto oposto em relacao ao centro, para o modo Reverse.
   * @type {Record<string, string>} */
  var OPOSTO = {
    topLeft: "bottomRight",
    topCenter: "bottomCenter",
    topRight: "bottomLeft",
    midLeft: "midRight",
    center: "center",
    midRight: "midLeft",
    bottomLeft: "topRight",
    bottomCenter: "topCenter",
    bottomRight: "topLeft"
  };

  var ORDEM_GRADE = [
    "topLeft", "topCenter", "topRight",
    "midLeft", "center", "midRight",
    "bottomLeft", "bottomCenter", "bottomRight"
  ];

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /**
   * Escolha reproduzivel entre os nove pontos.
   *
   * Mistura semente e indice da camada num inteiro de 32 bits: a mesma semente
   * com a mesma selecao devolve sempre a mesma grade, e camadas diferentes
   * recebem pontos diferentes. Sem misturar o indice, "aleatorio" moveria todas
   * as camadas para o mesmo canto.
   *
   * @param {number} seed @param {number} layerIndex @returns {string}
   */
  function pontoAleatorio(seed, layerIndex) {
    var x = (seed * 73856093) ^ (layerIndex * 19349663);
    // `>>> 0` mantem o valor sem sinal; sem isso o modulo devolveria negativo.
    x = (x ^ (x >>> 13)) >>> 0;
    x = (x * 1274126177) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return /** @type {string} */ (ORDEM_GRADE[x % ORDEM_GRADE.length]);
  }

  /** @param {Record<string, unknown>} args @param {boolean} esperaPreview @returns {MotionCommandFailure|null} */
  function validateArgs(args, esperaPreview) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de anchor desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de anchor ausente.", {
          field: key
        });
      }
    }

    if (!Object.prototype.hasOwnProperty.call(GRADE, /** @type {string} */ (args.gridPoint))) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Ponto da grade invalido.", {
        field: "gridPoint"
      });
    }
    if (args.mode !== "normal" && args.mode !== "reverse" && args.mode !== "random") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de anchor invalido.", {
        field: "mode"
      });
    }
    // `visual` e a unica fonte implementada. Recusar as outras e melhor que
    // aceitar e calcular sobre o bounds errado sem avisar.
    if (args.boundsSource !== "visual") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Fonte de bounds nao implementada.", {
        field: "boundsSource"
      });
    }
    if (args.timeMode !== "currentTime" && args.timeMode !== "fixed") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de tempo invalido.", {
        field: "timeMode"
      });
    }
    if (
      typeof args.fixedTime !== "number" ||
      !isFinite(/** @type {number} */ (args.fixedTime)) ||
      /** @type {number} */ (args.fixedTime) < 0 ||
      /** @type {number} */ (args.fixedTime) > 10800
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo fixo invalido.", {
        field: "fixedTime"
      });
    }
    if (args.timeMode === "currentTime" && args.fixedTime !== 0) {
      // Campo inativo e canonico, e nao um valor silenciosamente ignorado.
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Tempo fixo inativo precisa ser zero.", {
        field: "fixedTime"
      });
    }
    if (typeof args.includeExtents !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de extents invalido.", {
        field: "includeExtents"
      });
    }
    if (typeof args.preserveVisualPosition !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de preservacao invalido.", {
        field: "preserveVisualPosition"
      });
    }
    if (
      typeof args.randomSeed !== "number" ||
      !isFinite(/** @type {number} */ (args.randomSeed)) ||
      Math.floor(/** @type {number} */ (args.randomSeed)) !== args.randomSeed ||
      /** @type {number} */ (args.randomSeed) < 0 ||
      /** @type {number} */ (args.randomSeed) > 2147483647
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente invalida.", {
        field: "randomSeed"
      });
    }
    if (typeof args.preview !== "boolean" || args.preview !== esperaPreview) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo preview nao corresponde ao comando.", {
        field: "preview",
        expected: esperaPreview
      });
    }

    return null;
  }

  /** @param {any} prop @param {number} time @param {any} fallback @returns {any} */
  function atTime(prop, time, fallback) {
    return prop ? (typeof prop.valueAtTime === "function" ? prop.valueAtTime(time, false) : prop.value) : fallback;
  }

  /** @param {any} a @param {any} b @returns {any} */
  function unionRect(a, b) {
    if (!a) return b;
    if (!b) return a;
    var left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
    return { left: left, top: top, width: Math.max(a.left + a.width, b.left + b.width) - left,
      height: Math.max(a.top + a.height, b.top + b.height) - top };
  }

  /** Limites exatos de uma Bezier cubica: extremos da derivada por eixo.
   * @param {[number, number, number, number]} p @returns {[number, number]} */
  function curveRange(p) {
    var a = -p[0] + 3 * p[1] - 3 * p[2] + p[3];
    var b = 2 * (p[0] - 2 * p[1] + p[2]), c = p[1] - p[0];
    var roots = [], values = [p[0], p[3]], d = b * b - 4 * a * c, i;
    if (Math.abs(a) < 1e-10) { if (Math.abs(b) > 1e-10) roots.push(-c / b); }
    else if (d >= 0) { roots.push((-b + Math.sqrt(d)) / (2 * a)); roots.push((-b - Math.sqrt(d)) / (2 * a)); }
    for (i = 0; i < roots.length; i += 1) {
      var t = Number(roots[i]), u = 1 - t;
      if (t > 0 && t < 1) values.push(u*u*u*p[0] + 3*u*u*t*p[1] + 3*u*t*t*p[2] + t*t*t*p[3]);
    }
    return [Math.min.apply(null, values), Math.max.apply(null, values)];
  }

  /** @param {any} shape @returns {any} */
  function pathRect(shape) {
    var v = shape.vertices, rect = null, i, axis;
    if (!shape.closed || !v || !v.length) throw new Error("Mascara aberta sem limites fechados.");
    for (i = 0; i < v.length; i += 1) {
      var j = (i + 1) % v.length, ranges = /** @type {any[]} */ ([]);
      for (axis = 0; axis < 2; axis += 1) ranges.push(curveRange([v[i][axis],
        v[i][axis] + shape.outTangents[i][axis], v[j][axis] + shape.inTangents[j][axis], v[j][axis]]));
      rect = unionRect(rect, {left:ranges[0][0], top:ranges[1][0],
        width:ranges[0][1]-ranges[0][0], height:ranges[1][1]-ranges[1][0]});
    }
    return rect;
  }

  /** Bounds geometricos de mascaras aditivas. Nenhuma propriedade e alterada.
   * @param {any} layer @param {any} rect @param {number} time @returns {any} */
  function maskedRect(layer, rect, time) {
    var masks = layer.property("ADBE Mask Parade"), bounds = null, i;
    if (!masks || !masks.numProperties) return rect;
    var modes = /** @type {any} */ ($.global).MaskMode;
    if (!modes) throw new Error("Modos de mascara indisponiveis.");
    for (i = 1; i <= masks.numProperties; i += 1) {
      var mask = masks.property(i);
      if (mask.maskMode === modes.NONE) continue;
      if (mask.maskMode !== modes.ADD || mask.inverted || mask.rotoBezier) throw new Error("Limites visuais requerem mascaras aditivas Bezier sem inversao.");
      var feather = atTime(mask.property("ADBE Mask Feather"), time, [0,0]);
      var expansion = atTime(mask.property("ADBE Mask Offset"), time, 0);
      if (feather[0] !== 0 || feather[1] !== 0 || expansion !== 0) throw new Error("Mascara com feather ou expansao requer analise de pixels.");
      if (atTime(mask.property("ADBE Mask Opacity"), time, 100) <= 0) continue;
      bounds = unionRect(bounds, pathRect(atTime(mask.property("ADBE Mask Shape"), time, null)));
    }
    if (!bounds) return rect;
    var left = Math.max(rect.left, bounds.left), top = Math.max(rect.top, bounds.top);
    return {left:left, top:top, width:Math.max(0, Math.min(rect.left+rect.width, bounds.left+bounds.width)-left),
      height:Math.max(0, Math.min(rect.top+rect.height, bounds.top+bounds.height)-top)};
  }

  /** Le transforms internos no tempo correto, incluindo a cadeia de pais 2D.
   * @param {any} layer @param {number[]} point @param {number} time @returns {number[]} */
  function contentPoint(layer, point, time) {
    var depth = 0;
    while (layer) {
      if (depth++ > 64 || layer.threeDLayer) throw new Error("Conteudo interno 3D requer limites projetados pela camera.");
      if (typeof AutoOrientType !== "undefined" && layer.autoOrient !== undefined && layer.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) throw new Error("Conteudo com orientacao automatica nao possui limites geometricos estaticos.");
      var tr = layer.property(MN.transform);
      var anchor = atTime(tr.property(MN.anchorPoint), time, [0,0]);
      var posProp = tr.property(MN.position), pos = atTime(posProp, time, [0,0]);
      if (posProp.dimensionsSeparated) pos = [atTime(posProp.getSeparationFollower(0),time,0), atTime(posProp.getSeparationFollower(1),time,0)];
      var scale = atTime(tr.property(MN.scale), time, [100,100]);
      var angle = atTime(tr.property(MN.rotation), time, 0) * Math.PI / 180;
      var x = (Number(point[0])-anchor[0])*scale[0]/100, y = (Number(point[1])-anchor[1])*scale[1]/100;
      point = [pos[0] + x*Math.cos(angle)-y*Math.sin(angle), pos[1] + x*Math.sin(angle)+y*Math.cos(angle)];
      layer = layer.parent;
    }
    return point;
  }

  /** @param {any} layer @param {number} time @param {boolean} extents @param {number} depth @param {any} budget @returns {any} */
  function visualRect(layer, time, extents, depth, budget) {
    if (depth > 16 || ++budget.count > 2000) throw new Error("Pre-comp excede o limite de analise de conteudo.");
    var source = layer.source, rect;
    if (source instanceof CompItem) {
      var sourceTime = layer.timeRemapEnabled ? atTime(layer.property("ADBE Time Remapping"), time, 0) :
        (time - (layer.startTime || 0)) * 100 / (layer.stretch || 100);
      var bounds = null, i, j, hasSolo = false;
      for (i=1; i<=source.numLayers; i+=1) if (/** @type {any} */ (source.layer(i)).solo) hasSolo = true;
      for (i=1; i<=source.numLayers; i+=1) {
        var child = /** @type {any} */ (source.layer(i));
        if (child.enabled === false || child.hasVideo === false || child.nullLayer || child.guideLayer ||
            child.isTrackMatte || (hasSolo && !child.solo) || sourceTime < child.inPoint || sourceTime >= child.outPoint) continue;
        if (child.adjustmentLayer || child.hasTrackMatte) throw new Error("Pre-comp com adjustment ou track matte requer analise de pixels.");
        var tr = child.property(MN.transform);
        if (!tr || !tr.property(MN.anchorPoint)) continue;
        if (atTime(tr.property("ADBE Opacity"),sourceTime,100) <= 0) continue;
        var r = visualRect(child, sourceTime, extents, depth+1, budget);
        if (r.width <= 0 || r.height <= 0) continue;
        var corners = [[r.left,r.top],[r.left+r.width,r.top],[r.left,r.top+r.height],[r.left+r.width,r.top+r.height]];
        for (j=0;j<corners.length;j+=1) {
          var p = contentPoint(child,/** @type {number[]} */ (corners[j]),sourceTime);
          bounds = unionRect(bounds,{left:p[0],top:p[1],width:0,height:0});
        }
      }
      rect = bounds || {left:0,top:0,width:source.width,height:source.height};
      // Sem collapse, o quadro da pre-comp recorta o conteudo externo.
      if (!layer.collapseTransformation) {
        var x = Math.max(0,rect.left), y = Math.max(0,rect.top);
        rect = {left:x,top:y,width:Math.max(0,Math.min(source.width,rect.left+rect.width)-x),height:Math.max(0,Math.min(source.height,rect.top+rect.height)-y)};
      }
    } else rect = layer.sourceRectAtTime(time, extents);
    if (!rect || !isFinite(rect.left) || !isFinite(rect.top) || !isFinite(rect.width) || !isFinite(rect.height)) throw new Error("Limites invalidos.");
    return maskedRect(layer, rect, time);
  }

  /**
   * @param {Record<string, unknown>} args
   * @param {boolean} esperaPreview
   * @returns {{error: MotionCommandFailure|null, itens: Array<Record<string, unknown>>}}
   */
  function prepare(args, esperaPreview) {
    var argsError = validateArgs(args, esperaPreview);
    if (argsError) return { error: argsError, itens: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        itens: []
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || typeof selecionadas.length !== "number" || selecionadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        itens: []
      };
    }

    var tempo = args.timeMode === "fixed" ? /** @type {number} */ (args.fixedTime) : comp.time;
    var itens = [];
    var i;

    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = /** @type {Layer} */ (selecionadas[i]);
      if (!camada) continue;
      var flags = /** @type {any} */ (camada);
      // Recolher transformacoes/rasterizar continuamente nao invalida R.S:
      // conservar o transform local conserva tambem sua composicao com o
      // conteudo da pre-comp. Cada camada usa seu proprio retangulo.
      if (flags.locked === true) {
        return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Desbloqueie a camada para alinhar a ancora.", { layerIndex: camada.index, layerName: camada.name }), itens: [] };
      }
      if (args.preserveVisualPosition === true && typeof AutoOrientType !== "undefined" &&
          typeof flags.autoOrient !== "undefined" && flags.autoOrient !== AutoOrientType.NO_AUTO_ORIENT) {
        return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Desative a orientacao automatica para preservar a aparencia ao mover a ancora.", { layerIndex: camada.index, layerName: camada.name }), itens: [] };
      }

      var retangulo;
      try {
        retangulo = visualRect(flags, tempo, /** @type {boolean} */ (args.includeExtents), 0, {count:0});
      } catch (rectError) {
        return {error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "Nao foi possivel medir o conteudo: " + String(rectError),
          {layerIndex:camada.index, layerName:camada.name}), itens:[]};
      }

      if (!retangulo || !isFinite(retangulo.left) || !isFinite(retangulo.top) ||
          !isFinite(retangulo.width) || !isFinite(retangulo.height) || retangulo.width < 0 || retangulo.height < 0) {
        return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Limites da camada invalidos.", { layerIndex: camada.index }), itens: [] };
      }
      var ponto = /** @type {string} */ (args.gridPoint);
      if (args.mode === "reverse") {
        ponto = /** @type {string} */ (OPOSTO[ponto]);
      } else if (args.mode === "random") {
        ponto = pontoAleatorio(/** @type {number} */ (args.randomSeed), camada.index);
      }

      var fracao = /** @type {number[]} */ (GRADE[ponto]);
      // `sourceRectAtTime` e plano; o Z da ancora fica como esta. Mover a
      // ancora em profundidade nao e o que a grade 3x3 pede.
      var novaAncora = [
        retangulo.left + retangulo.width * /** @type {number} */ (fracao[0]),
        retangulo.top + retangulo.height * /** @type {number} */ (fracao[1])
      ];

      var grupo = camada.property(MN.transform);
      if (!grupo || !grupo.property(MN.anchorPoint) || !grupo.property(MN.position)) {
        return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione uma camada com ancora e posicao.", { layerIndex: camada.index }), itens: [] };
      }
      var propAncora = grupo.property(MN.anchorPoint);
      var propPosicao = grupo.property(MN.position);
      var propEscala = grupo.property(MN.scale);
      var propRotacao = grupo.property(MN.rotation);

      var positionProperties = /** @type {any[]} */ ([propPosicao]);
      var positionLeader = /** @type {any} */ (propPosicao);
      if (positionLeader.dimensionsSeparated === true) {
        positionProperties = [];
        var dimension;
        for (dimension = 0; dimension < (camada.threeDLayer ? 3 : 2); dimension += 1) {
          if (typeof positionLeader.getSeparationFollower !== "function") {
            return { error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Dimensoes separadas indisponiveis.", null), itens: [] };
          }
          positionProperties.push(positionLeader.getSeparationFollower(dimension));
        }
      }
      var guarded = /** @type {any[]} */ ([propAncora]);
      if (args.preserveVisualPosition === true) guarded = guarded.concat(positionProperties, [propEscala, propRotacao, grupo.property("ADBE Orientation"), grupo.property("ADBE Rotate X"), grupo.property("ADBE Rotate Y")]);
      var guardedIndex;
      for (guardedIndex = 0; guardedIndex < guarded.length; guardedIndex += 1) {
        var guardedProperty = guarded[guardedIndex];
        if (guardedProperty && typeof guardedProperty.expression === "string" && guardedProperty.expression !== "") {
          return { error: failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A transformacao possui expressao; o conteudo foi preservado.", { layerIndex: camada.index }), itens: [] };
        }
      }
      var linearProperties = [propEscala, propRotacao, grupo.property("ADBE Orientation"), grupo.property("ADBE Rotate X"), grupo.property("ADBE Rotate Y")];
      for (guardedIndex = 0; guardedIndex < linearProperties.length; guardedIndex += 1) {
        var linearProperty = linearProperties[guardedIndex];
        if (args.preserveVisualPosition === true && linearProperty && linearProperty.numKeys > 0) {
          return { error: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT, "Escala, orientacao ou rotacao animada: a compensacao mudaria ao longo do tempo.", { layerIndex: camada.index }), itens: [] };
        }
      }

      // Ancora animada nao tem um valor unico para mover: qual keyframe
      // deveria ir para o canto? Recusar e melhor que escolher um por conta.
      if (propAncora.numKeys > 0) {
        return {
          error: failure(
            MotionContracts.ERROR.KEYFRAME_CONFLICT,
            "A ancora desta camada e animada.",
            { layerIndex: camada.index }
          ),
          itens: []
        };
      }

      var ancoraAtual = /** @type {number[]} */ (propAncora.value);
      var posicaoAtual = /** @type {number[]} */ (propPosicao.value);
      if (positionLeader.dimensionsSeparated === true) {
        posicaoAtual = [];
        for (guardedIndex = 0; guardedIndex < positionProperties.length; guardedIndex += 1) posicaoAtual.push(Number(positionProperties[guardedIndex].value));
      }
      var tresD = camada.threeDLayer === true;
      if (tresD) {
        // A ancora de uma camada 3D tem tres componentes, e escrever duas
        // zeraria a profundidade em silencio.
        novaAncora.push(
          ancoraAtual.length > 2 ? /** @type {number} */ (ancoraAtual[2]) : 0
        );
      }

      itens.push({
        camada: camada,
        grupo: grupo,
        posicaoAnimada: propPosicao.numKeys > 0,
        positionSnapshots: snapshotPositions(positionProperties),
        separated: positionLeader.dimensionsSeparated === true,
        ponto: ponto,
        tresD: tresD,
        // `linearMatrix` le as propriedades da camada, e nao os valores
        // capturados aqui: e a unica fonte da composicao medida.
        matriz: MotionTransform.linearMatrix(camada),
        ancoraAntes: recorta(ancoraAtual, tresD),
        ancoraDepois: novaAncora,
        posicaoAntes: recorta(posicaoAtual, tresD)
      });
    }

    if (itens.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        itens: []
      };
    }

    return { error: null, itens: itens };
  }

  /**
   * O vetor `R(t) . S . (A' - A)`, em espaco do pai.
   *
   * E o mesmo para a propriedade estatica e para cada keyframe: escala e
   * rotacao sao estaticas quando a compensacao esta ligada, garantido no
   * preflight.
   *
   * @param {Record<string, unknown>} item
   * @returns {number[]}
   */
  function deslocamento(item) {
    var antes = /** @type {number[]} */ (item.ancoraAntes);
    var depois = /** @type {number[]} */ (item.ancoraDepois);
    var d = [
      /** @type {number} */ (depois[0]) - /** @type {number} */ (antes[0]),
      /** @type {number} */ (depois[1]) - /** @type {number} */ (antes[1]),
      (depois.length > 2 ? /** @type {number} */ (depois[2]) : 0) -
        (antes.length > 2 ? /** @type {number} */ (antes[2]) : 0)
    ];
    var girado = MotionTransform.apply(/** @type {number[]} */ (item.matriz), d);
    return recorta(girado, item.tresD === true);
  }

  /**
   * Duas ou tres componentes, conforme a camada.
   *
   * Gravar tres numa camada 2D ou duas numa 3D e erro de arity que o After
   * Effects aceita de formas diferentes conforme a propriedade — recortar
   * aqui evita descobrir isso caso a caso.
   *
   * @param {number[]} v @param {boolean} tresD @returns {number[]}
   */
  function recorta(v, tresD) {
    var saida = [
      /** @type {number} */ (v[0]),
      /** @type {number} */ (v[1])
    ];
    if (tresD) saida.push(v.length > 2 ? /** @type {number} */ (v[2]) : 0);
    return saida;
  }

  /** @param {any[]} properties @returns {any[]} */
  function snapshotPositions(properties) {
    var snapshots = [], i, k;
    for (i = 0; i < properties.length; i += 1) {
      var property = properties[i], keys = [];
      for (k = 1; k <= property.numKeys; k += 1) keys.push(property.keyValue(k));
      snapshots.push({ property: property, value: property.value, keys: keys });
    }
    return snapshots;
  }
  /** @param {any} value @param {number[]} delta @param {number} component @param {boolean} separated @returns {any} */
  function offset(value, delta, component, separated) {
    if (separated) return Number(value) + Number(delta[component] || 0);
    var result = [], i;
    for (i = 0; i < value.length; i += 1) result.push(value[i] + (delta[i] || 0));
    return result;
  }
  /** @param {any} item @param {boolean} restore */
  function writePositions(item, restore) {
    var snapshots = item.positionSnapshots, delta = deslocamento(item), i, k;
    for (i = 0; i < snapshots.length; i += 1) {
      var snapshot = snapshots[i];
      if (snapshot.keys.length) {
        for (k = 0; k < snapshot.keys.length; k += 1) snapshot.property.setValueAtKey(k + 1,
          restore ? snapshot.keys[k] : offset(snapshot.keys[k], delta, i, item.separated));
      } else snapshot.property.setValue(restore ? snapshot.value : offset(snapshot.value, delta, i, item.separated));
    }
  }

  /** O host arredonda componentes ao gravar. Nao repetir deslocamentos abaixo
   * dessa precisao, nem acumular erro ao clicar novamente no mesmo ponto.
   * @param {number[]} a @param {number[]} b @returns {boolean} */
  function sameAnchor(a, b) {
    var i;
    for (i = 0; i < 2; i += 1) {
      var x = Number(a[i]), y = Number(b[i]);
      if (Math.abs(x-y) > Math.max(0.0001, Math.abs(x)*0.0000001, Math.abs(y)*0.0000001)) return false;
    }
    return true;
  }

  /** @param {Array<Record<string, unknown>>} itens @returns {Record<string, unknown>} */
  function planoPublico(itens) {
    var alvos = [];
    var mudam = 0;
    var i;
    for (i = 0; i < itens.length; i += 1) {
      var item = /** @type {Record<string, unknown>} */ (itens[i]);
      var antes = /** @type {number[]} */ (item.ancoraAntes);
      var depois = /** @type {number[]} */ (item.ancoraDepois);
      var mudou = !sameAnchor(antes, depois);
      if (mudou) mudam += 1;

      alvos.push({
        layerIndex: /** @type {Layer} */ (item.camada).index,
        layerName: /** @type {Layer} */ (item.camada).name,
        gridPoint: item.ponto,
        anchorBefore: antes,
        anchorAfter: depois,
        changed: mudou
      });
    }
    return { targetCount: itens.length, changedCount: mudam, targets: alvos };
  }

  MotionRegistry.register("ae.anchor.align.preview", {
    preflight: function (args) {
      return prepare(args, true).error;
    },
    run: function (args) {
      var prepared = prepare(args, true);
      if (prepared.error) throw new Error("Preview de anchor ficou invalido.");
      return { changed: false, warnings: [], data: planoPublico(prepared.itens) };
    }
  });

  MotionRegistry.register("ae.anchor.align", {
    preflight: function (args) {
      return prepare(args, false).error;
    },

    run: function (args) {
      var prepared = prepare(args, false);
      if (prepared.error) throw new Error("Anchor ficou invalido depois do preflight.");

      var preservar = args.preserveVisualPosition === true;
      var tocadas = [];
      var aplicadas = 0;
      var i;

      try {
        for (i = 0; i < prepared.itens.length; i += 1) {
          var item = /** @type {Record<string, unknown>} */ (prepared.itens[i]);
          var antes = /** @type {number[]} */ (item.ancoraAntes);
          var depois = /** @type {number[]} */ (item.ancoraDepois);
          if (sameAnchor(antes, depois)) continue;

          var grupo = /** @type {PropertyGroup} */ (item.grupo);
          tocadas.push(item);
          if (preservar) writePositions(item, false);
          grupo.property(MN.anchorPoint).setValue(depois);
          aplicadas += 1;
        }
      } catch (applyError) {
        var rollbackFalhou = false;
        for (i = tocadas.length - 1; i >= 0; i -= 1) {
          try {
            var desfazer = /** @type {Record<string, unknown>} */ (tocadas[i]);
            var g = /** @type {PropertyGroup} */ (desfazer.grupo);
            g.property(MN.anchorPoint).setValue(desfazer.ancoraAntes);
            if (preservar) writePositions(desfazer, true);
          } catch (restoreError) {
            rollbackFalhou = true;
          }
        }
        if (rollbackFalhou) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback de anchor falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      var plano = planoPublico(prepared.itens);
      plano.appliedCount = aplicadas;
      return { changed: aplicadas > 0, warnings: [], data: plano };
    }
  });
}());
