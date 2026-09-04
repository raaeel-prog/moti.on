/**
 * Separar grupos de shape em camadas independentes (`ae.shape.break`, CHMS-025).
 *
 * ## Por que duplicar em vez de copiar conteudo
 *
 * O ExtendScript nao tem copia profunda de grupo de propriedades. Duplicar a
 * camada e apagar os outros grupos chega no mesmo lugar e preserva a aparencia
 * **exatamente** — nao dentro de 1 px, que e o criterio de aceite, mas identica,
 * porque o conteudo nunca foi reconstruido. Fills e strokes que vivem na raiz do
 * contents, fora dos grupos, seguem em cada copia, que e o que mantem a
 * aparencia quando eles sao compartilhados.
 *
 * ## A composicao de transforms
 *
 * Depois de separar, o transform do grupo continua aninhado dentro da camada
 * nova. Achatar ele no transform da camada e o que torna a camada nova
 * diretamente manipulavel — mover a Position dela passa a mover a forma a partir
 * de uma ancora que faz sentido.
 *
 * A conta e exata. Um ponto `p` no espaco do grupo chega na composicao por
 *
 *     p'' = (R1 S1 R2 S2) (p - ancora2) + R1 S1 (pos2 - ancora1) + pos1
 *
 * entao a camada nova recebe ancora `ancora2`, parte linear `R1 S1 R2 S2` e
 * posicao `R1 S1 (pos2 - ancora1) + pos1`.
 *
 * ## Quando achatar nao e possivel
 *
 * `R1 S1 R2 S2` so cabe num transform de camada quando ele **e** da forma
 * `rotacao . escala` — ou seja, quando as duas colunas da parte linear sao
 * ortogonais. Com escala nao uniforme e rotacao no meio isso deixa de valer, e
 * a matriz combinada tem cisalhamento que o transform de camada nao representa.
 *
 * Nesses casos o comando **nao achata**: deixa o transform do grupo aninhado,
 * onde ele funciona, e avisa. A aparencia continua exata; o que se perde e a
 * manipulacao direta. Achatar mesmo assim mudaria o desenho, que e o oposto do
 * criterio de aceite.
 */
(function () {
  /* global Property */
  var ALLOWED = {
    recursive: true,
    keepOriginal: true,
    preserveAppearance: true,
    namingMode: true
  };

  var MN = {
    rootContents: "ADBE Root Vectors Group",
    group: "ADBE Vector Group",
    groupTransform: "ADBE Vector Transform Group",
    groupAnchor: "ADBE Vector Anchor",
    groupPosition: "ADBE Vector Position",
    groupScale: "ADBE Vector Scale",
    groupRotation: "ADBE Vector Rotation",
    groupSkew: "ADBE Vector Skew",
    transform: "ADBE Transform Group",
    anchor: "ADBE Anchor Point",
    position: "ADBE Position",
    scale: "ADBE Scale",
    rotation: "ADBE Rotate Z"
  };

  /** Tolerancia de ortogonalidade das colunas, em unidades da matriz. */
  var TOLERANCIA_ORTOGONAL = 0.000001;

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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Break Shape desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Break Shape ausente.", { field: key });
      }
    }
    if (typeof args.recursive !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "recursive precisa ser booleano.", { field: "recursive" });
    }
    if (typeof args.keepOriginal !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "keepOriginal precisa ser booleano.", {
        field: "keepOriginal"
      });
    }
    if (typeof args.preserveAppearance !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "preserveAppearance precisa ser booleano.", {
        field: "preserveAppearance"
      });
    }
    if (args.namingMode !== "groupName" && args.namingMode !== "indexed") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de nome invalido.", { field: "namingMode" });
    }
    return null;
  }

  /** @param {unknown} candidata @returns {boolean} */
  function isShapeLayer(candidata) {
    return typeof ShapeLayer !== "undefined" && candidata instanceof ShapeLayer;
  }

  /**
   * Indices dos grupos de primeiro nivel dentro do contents.
   *
   * Indices, e nao referencias: o laco que separa vai apagando grupos, e uma
   * referencia guardada deixa de valer assim que um irmao sai.
   *
   * @param {unknown} layer
   * @returns {number[]}
   */
  function groupIndices(layer) {
    var contents = /** @type {any} */ (layer).property(MN.rootContents);
    if (!contents) return [];
    var indices = [];
    var i;
    for (i = 1; i <= contents.numProperties; i += 1) {
      var item = contents.property(i);
      if (item && item.matchName === MN.group) indices.push(i);
    }
    return indices;
  }

  /** @param {PropertyGroup} grupo @param {string} matchName @param {number[]} padrao @returns {number[]} */
  function vetorDe(grupo, matchName, padrao) {
    var property = grupo.property(matchName);
    if (!(property instanceof Property)) return padrao;
    var valor = /** @type {number[]} */ (property.value);
    if (!valor || typeof valor.length !== "number") return padrao;
    var saida = [];
    var i;
    for (i = 0; i < padrao.length; i += 1) {
      var componente = valor.length > i ? valor[i] : padrao[i];
      saida.push(isFiniteNumber(componente) ? /** @type {number} */ (componente) : /** @type {number} */ (padrao[i]));
    }
    return saida;
  }

  /** @param {PropertyGroup} grupo @param {string} matchName @param {number} padrao @returns {number} */
  function escalarDe(grupo, matchName, padrao) {
    var property = grupo.property(matchName);
    if (!(property instanceof Property)) return padrao;
    var valor = property.value;
    return isFiniteNumber(valor) ? /** @type {number} */ (valor) : padrao;
  }

  /**
   * Parte linear de um transform de grupo: `rotacao . escala`.
   *
   * @param {PropertyGroup} transformDoGrupo
   * @returns {number[]}
   */
  function linearDoGrupo(transformDoGrupo) {
    var escala = vetorDe(transformDoGrupo, MN.groupScale, [100, 100]);
    var rotacao = escalarDe(transformDoGrupo, MN.groupRotation, 0);
    var S = [
      /** @type {number} */ (escala[0]) / 100, 0, 0,
      0, /** @type {number} */ (escala[1]) / 100, 0,
      0, 0, 1
    ];
    return MotionTransform.multiply(MotionTransform.rotZ(rotacao), S);
  }

  /**
   * A matriz combinada cabe num transform de camada?
   *
   * Cabe quando as duas colunas da parte 2x2 sao ortogonais: ai ela e
   * exatamente `rotacao . escala`, que e tudo que o transform de camada
   * representa. Colunas nao ortogonais significam cisalhamento, e achatar
   * mesmo assim mudaria o desenho.
   *
   * @param {number[]} m
   * @returns {boolean}
   */
  function cabeEmTransformDeCamada(m) {
    var c0x = /** @type {number} */ (m[0]);
    var c0y = /** @type {number} */ (m[3]);
    var c1x = /** @type {number} */ (m[1]);
    var c1y = /** @type {number} */ (m[4]);
    var produto = c0x * c1x + c0y * c1y;
    var norma0 = Math.sqrt(c0x * c0x + c0y * c0y);
    var norma1 = Math.sqrt(c1x * c1x + c1y * c1y);
    if (norma0 < TOLERANCIA_ORTOGONAL || norma1 < TOLERANCIA_ORTOGONAL) return false;
    // Normalizado: a tolerancia passa a ser sobre o cosseno do angulo, e nao
    // sobre a escala das colunas.
    return Math.abs(produto / (norma0 * norma1)) < TOLERANCIA_ORTOGONAL;
  }

  /**
   * Decompoe `rotacao . escala` 2D de volta em graus e percentuais.
   *
   * @param {number[]} m
   * @returns {{rotacao: number, escala: number[]}}
   */
  function decompoe2D(m) {
    var c0x = /** @type {number} */ (m[0]);
    var c0y = /** @type {number} */ (m[3]);
    var c1x = /** @type {number} */ (m[1]);
    var c1y = /** @type {number} */ (m[4]);
    var sx = Math.sqrt(c0x * c0x + c0y * c0y);
    var sy = Math.sqrt(c1x * c1x + c1y * c1y);
    // Determinante negativo significa que uma das escalas e negativa: o After
    // Effects representa isso com escala negativa, e nao com meia volta.
    if (c0x * c1y - c0y * c1x < 0) sy = -sy;
    var rotacao = Math.atan2(c0y, c0x) * 180 / Math.PI;
    return { rotacao: rotacao, escala: [sx * 100, sy * 100] };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada de forma.", null);
    }

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = selecionadas[i];
      if (!isShapeLayer(camada)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao e de forma.", {
          selectionIndex: i
        });
      }
      if (typeof /** @type {any} */ (camada).duplicate !== "function") {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada nao pode ser duplicada.", {
          selectionIndex: i
        });
      }
      var grupos = groupIndices(camada);
      if (grupos.length < 2) {
        // Com um grupo so nao ha o que separar: a camada ja e a forma.
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada precisa de dois ou mais grupos.", {
          selectionIndex: i,
          groups: grupos.length
        });
      }
    }
    return null;
  }

  /**
   * @param {unknown} layer
   * @param {string} matchName
   * @returns {Property|null}
   */
  function transformProperty(layer, matchName) {
    var grupo = /** @type {any} */ (layer).property(MN.transform);
    if (!grupo) return null;
    var property = grupo.property(matchName);
    return property instanceof Property ? property : null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    // Copia da selecao: as duplicatas nascem selecionadas no After Effects, e
    // iterar a lista viva enquanto se duplica e um laco que nao termina.
    var selecionadas = [];
    var s;
    for (s = 0; s < comp.selectedLayers.length; s += 1) selecionadas.push(comp.selectedLayers[s]);

    var criadas = [];
    var warnings = [];
    var brokenLayers = 0;
    var flattened = 0;
    var i;
    var g;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var original = /** @type {any} */ (selecionadas[i]);
        var grupos = groupIndices(original);

        var ancoraCamada = vetorDe(
          /** @type {PropertyGroup} */ (original.property(MN.transform)),
          MN.anchor,
          [0, 0]
        );
        var posicaoCamada = vetorDe(
          /** @type {PropertyGroup} */ (original.property(MN.transform)),
          MN.position,
          [0, 0]
        );
        var linearCamada = MotionTransform.linearMatrix(original);

        for (g = 0; g < grupos.length; g += 1) {
          var copia = original.duplicate();
          criadas.push(copia);

          var contentsCopia = copia.property(MN.rootContents);
          // Apagar de tras para a frente: remover reindexa os irmaos, e um laco
          // crescente pularia grupos.
          var indicesCopia = groupIndices(copia);
          var k;
          for (k = indicesCopia.length - 1; k >= 0; k -= 1) {
            if (k === g) continue;
            var alvo = contentsCopia.property(/** @type {number} */ (indicesCopia[k]));
            if (alvo) alvo.remove();
          }

          var grupoRestante = contentsCopia.property(groupIndices(copia)[0]);
          if (!grupoRestante) throw new Error("O grupo separado desapareceu da copia.");

          copia.name =
            args.namingMode === "groupName"
              ? MotionContracts.RIG_PREFIX + grupoRestante.name
              : MotionContracts.RIG_PREFIX + original.name + " " + (g + 1);

          if (args.preserveAppearance !== true) {
            brokenLayers += 1;
            continue;
          }

          var transformGrupo = grupoRestante.property(MN.groupTransform);
          if (!transformGrupo) {
            brokenLayers += 1;
            continue;
          }

          // Cisalhamento nao existe no transform de camada: achatar mudaria o
          // desenho, entao o grupo fica aninhado e o comando avisa.
          if (escalarDe(transformGrupo, MN.groupSkew, 0) !== 0) {
            warnings.push({
              code: "break.skewNotFlattened",
              message: "O grupo tem cisalhamento e ficou aninhado na camada nova.",
              details: { layer: copia.name }
            });
            brokenLayers += 1;
            continue;
          }

          var linearGrupo = linearDoGrupo(transformGrupo);
          var combinada = MotionTransform.multiply(linearCamada, linearGrupo);

          if (!cabeEmTransformDeCamada(combinada)) {
            warnings.push({
              code: "break.transformNotFlattened",
              message: "A combinacao de escala e rotacao nao cabe num transform de camada; o grupo ficou aninhado.",
              details: { layer: copia.name }
            });
            brokenLayers += 1;
            continue;
          }

          var ancoraGrupo = vetorDe(transformGrupo, MN.groupAnchor, [0, 0]);
          var posicaoGrupo = vetorDe(transformGrupo, MN.groupPosition, [0, 0]);

          // p'' = combinada . (p - ancoraGrupo) + linearCamada . (posGrupo - ancoraCamada) + posCamada
          var deslocado = MotionTransform.apply(linearCamada, [
            /** @type {number} */ (posicaoGrupo[0]) - /** @type {number} */ (ancoraCamada[0]),
            /** @type {number} */ (posicaoGrupo[1]) - /** @type {number} */ (ancoraCamada[1])
          ]);
          var novaPosicao = [
            /** @type {number} */ (deslocado[0]) + /** @type {number} */ (posicaoCamada[0]),
            /** @type {number} */ (deslocado[1]) + /** @type {number} */ (posicaoCamada[1])
          ];

          var decomposta = decompoe2D(combinada);
          /** @type {Property} */ (transformProperty(copia, MN.anchor)).setValue(ancoraGrupo);
          /** @type {Property} */ (transformProperty(copia, MN.position)).setValue(novaPosicao);
          /** @type {Property} */ (transformProperty(copia, MN.scale)).setValue(decomposta.escala);
          /** @type {Property} */ (transformProperty(copia, MN.rotation)).setValue(decomposta.rotacao);

          // O transform do grupo foi absorvido pela camada: deixa-lo como estava
          // aplicaria a transformacao duas vezes.
          var propAncora = transformGrupo.property(MN.groupAnchor);
          var propPosicao = transformGrupo.property(MN.groupPosition);
          var propEscala = transformGrupo.property(MN.groupScale);
          var propRotacao = transformGrupo.property(MN.groupRotation);
          if (propAncora instanceof Property) propAncora.setValue([0, 0]);
          if (propPosicao instanceof Property) propPosicao.setValue([0, 0]);
          if (propEscala instanceof Property) propEscala.setValue([100, 100]);
          if (propRotacao instanceof Property) propRotacao.setValue(0);

          flattened += 1;
          brokenLayers += 1;
        }

        if (args.keepOriginal !== true) original.remove();
      }
    } catch (breakError) {
      var rollbackFailed = false;
      for (i = criadas.length - 1; i >= 0; i -= 1) {
        try {
          var criada = criadas[i];
          if (criada) criada.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Break Shape falhou e as camadas criadas nao puderam ser removidas.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Break Shape falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: brokenLayers > 0,
      warnings: warnings,
      data: { brokenLayers: brokenLayers, flattened: flattened }
    };
  }

  MotionRegistry.register("ae.shape.break", { preflight: preflight, run: run });
})();
