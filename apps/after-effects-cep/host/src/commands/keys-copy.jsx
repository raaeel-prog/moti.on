/**
 * Copiar e colar keyframes (`ae.keys.copy` e `ae.keys.paste`, P1).
 *
 * O clipboard e interno e vive nesta closure, pelo tempo da sessao do host. A
 * §"ae.keys.copy" e explicita: **nao depender do clipboard do sistema**. Alem de
 * ser o unico jeito de preservar ease, tangentes e roving — que nao sobrevivem a
 * uma serializacao de texto qualquer —, o clipboard do sistema e do usuario, e
 * sobrescreve-lo com JSON do plugin apagaria o que ele copiou.
 *
 * Sao dois comandos porque as duas metades tem naturezas diferentes: copiar le e
 * nao muta, colar muta. Um descriptor so obrigaria a declarar `mutates: true`
 * para os dois, e o dispatcher abriria um grupo de Undo para uma leitura,
 * poluindo o historico do usuario com entradas que nao desfazem nada. E o mesmo
 * motivo pelo qual `ae.keys.cut` e `ae.keys.cut.preview` sao separados.
 */
(function () {
  /* global Property */
  var CLIPBOARD_SCHEMA_VERSION = 1;

  /** @type {Record<string, boolean>} */
  var COPY_ALLOWED = {};
  var PASTE_ALLOWED = {
    pasteTime: true,
    mappingMode: true,
    relativeTiming: true,
    includeExpressions: true,
    includeTangents: true
  };

  /**
   * Estado da sessao, e nao do projeto: recarregar o host esvazia. Colar sem ter
   * copiado devolve erro tipado, e nao um estado antigo de outra sessao.
   *
   * @type {{ schemaVersion: number, entries: Array<Record<string, unknown>>, firstKeyTime: number, sourceLayerInPoint: number }|null}
   */
  var clipboard = null;

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
   * @param {Record<string, unknown>} args
   * @param {Record<string, boolean>} allowed
   * @param {string} rotulo
   * @returns {MotionCommandFailure|null}
   */
  function rejectUnknownArgs(args, allowed, rotulo) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(allowed, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento " + rotulo + " desconhecido.", { field: key });
      }
    }
    return null;
  }

  /**
   * Camada dona da propriedade. Sobe por parentProperty ate o topo, o mesmo
   * caminho que MotionKeyframes.describeProperty percorre.
   *
   * @param {Property} property
   * @returns {unknown}
   */
  function ownerLayer(property) {
    var atual = /** @type {any} */ (property);
    var guarda = 0;
    while (atual && atual.parentProperty && guarda < 64) {
      atual = atual.parentProperty;
      guarda += 1;
    }
    return atual;
  }

  /** @param {Property} property @returns {boolean} */
  function isCopyableProperty(property) {
    if (!(property instanceof Property)) return false;
    if (property.propertyType !== PropertyType.PROPERTY) return false;
    var tipo = property.propertyValueType;
    return (
      tipo === PropertyValueType.OneD ||
      tipo === PropertyValueType.TwoD ||
      tipo === PropertyValueType.TwoD_SPATIAL ||
      tipo === PropertyValueType.ThreeD ||
      tipo === PropertyValueType.ThreeD_SPATIAL ||
      tipo === PropertyValueType.COLOR
    );
  }

  /**
   * Quantas dimensoes o valor tem. Mapear por matchName nao basta: `Position` de
   * uma camada 3D tem tres dimensoes e a de uma 2D tem duas, e colar uma na
   * outra produziria um valor de tamanho errado.
   *
   * @param {unknown} value
   * @returns {number}
   */
  function dimensionsOf(value) {
    if (typeof value === "number") return 1;
    var arrayLike = /** @type {{length?: unknown}} */ (value);
    if (value && typeof arrayLike.length === "number") return /** @type {number} */ (arrayLike.length);
    return 0;
  }

  /** @param {Property} property @returns {number|null} */
  function firstKeyDimensions(property) {
    if (property.numKeys < 1) return null;
    return dimensionsOf(property.keyValue(1));
  }

  /**
   * Indices dos keyframes selecionados, ou todos quando a selecao esta no nivel
   * da propriedade e nenhuma key especifica foi marcada.
   *
   * @param {Property} property
   * @returns {number[]}
   */
  function selectedKeyIndices(property) {
    var selecionados = property.selectedKeys;
    var indices = [];
    var i;
    if (selecionados && selecionados.length > 0) {
      for (i = 0; i < selecionados.length; i += 1) {
        var indice = selecionados[i];
        if (typeof indice === "number") indices.push(indice);
      }
      indices.sort(function (a, b) {
        return a - b;
      });
      return indices;
    }
    for (i = 1; i <= property.numKeys; i += 1) indices.push(i);
    return indices;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function copyPreflight(args) {
    var unknownArg = rejectUnknownArgs(args, COPY_ALLOWED, "Copy Keys");
    if (unknownArg) return unknownArg;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedProperties;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma propriedade com keyframes.", null);
    }
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var property = /** @type {Property} */ (selecionadas[i]);
      if (isCopyableProperty(property) && property.numKeys > 0 && selectedKeyIndices(property).length > 0) {
        return null;
      }
    }
    return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhum keyframe copiavel na selecao.", null);
  }

  /** @returns {MotionCommandResult} */
  function copyRun() {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedProperties;
    var entries = [];
    /** @type {Array<{ code: string, message: string, details: unknown }>} */
    var warnings = [];
    var firstKeyTime = null;
    var sourceLayerInPoint = 0;
    var i;
    var j;

    for (i = 0; i < selecionadas.length; i += 1) {
      var property = /** @type {Property} */ (selecionadas[i]);
      if (!isCopyableProperty(property)) {
        warnings.push({
          code: "copy.propertyTypeUnsupported",
          message: "Propriedade fora do escopo numerico foi ignorada.",
          details: { matchName: property && property.matchName ? property.matchName : null }
        });
        continue;
      }
      var indices = selectedKeyIndices(property);
      if (property.numKeys === 0 || indices.length === 0) continue;

      // O snapshot completo passa por MotionKeyframes, que ja preserva ease,
      // tangentes, roving e label. Reimplementar isso aqui seria uma segunda
      // versao da mesma serializacao, livre para divergir da primeira.
      var snapshot = MotionKeyframes.captureProperty(property);
      var keys = [];
      for (j = 0; j < indices.length; j += 1) {
        var indice = indices[j];
        if (typeof indice !== "number") continue;
        var key = snapshot.keys[indice - 1];
        if (!key) continue;
        keys.push(key);
        if (firstKeyTime === null || key.time < firstKeyTime) firstKeyTime = key.time;
      }
      var primeira = keys[0];
      if (!primeira) continue;

      if (entries.length === 0) {
        var dono = ownerLayer(property);
        var inPoint = /** @type {{ inPoint?: unknown }} */ (dono).inPoint;
        if (typeof inPoint === "number") sourceLayerInPoint = inPoint;
      }

      entries.push({
        matchName: property.matchName,
        propertyName: property.name,
        dimensions: dimensionsOf(primeira.value),
        spatial: snapshot.spatial === true,
        expression: property.canSetExpression === true ? property.expression : "",
        expressionEnabled: property.expressionEnabled === true,
        keys: keys
      });
    }

    if (entries.length === 0) {
      var vazio = /** @type {Error & {motionCode?: string}} */ (new Error("Nenhum keyframe foi copiado."));
      vazio.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw vazio;
    }

    clipboard = {
      schemaVersion: CLIPBOARD_SCHEMA_VERSION,
      entries: entries,
      firstKeyTime: firstKeyTime === null ? 0 : firstKeyTime,
      sourceLayerInPoint: sourceLayerInPoint
    };

    var totalKeys = 0;
    for (i = 0; i < entries.length; i += 1) {
      var contada = entries[i];
      if (contada) totalKeys += /** @type {Array<unknown>} */ (contada.keys).length;
    }

    return {
      changed: false,
      warnings: warnings,
      data: { propertyCount: entries.length, keyCount: totalKeys }
    };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function pastePreflight(args) {
    var unknownArg = rejectUnknownArgs(args, PASTE_ALLOWED, "Paste Keys");
    if (unknownArg) return unknownArg;

    if (args.pasteTime !== "cti" && args.pasteTime !== "layerIn" && args.pasteTime !== "original") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Ancoragem de colagem invalida.", { field: "pasteTime" });
    }
    if (args.mappingMode !== "matchName" && args.mappingMode !== "order") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de mapeamento invalido.", { field: "mappingMode" });
    }
    if (typeof args.relativeTiming !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "relativeTiming precisa ser booleano.", {
        field: "relativeTiming"
      });
    }
    if (typeof args.includeExpressions !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "includeExpressions precisa ser booleano.", {
        field: "includeExpressions"
      });
    }
    if (typeof args.includeTangents !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "includeTangents precisa ser booleano.", {
        field: "includeTangents"
      });
    }

    if (!clipboard) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nada foi copiado nesta sessao.", null);
    }

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    if (!comp.selectedProperties || comp.selectedProperties.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione a propriedade de destino.", null);
    }
    return null;
  }

  /**
   * Casa cada entrada do clipboard com uma propriedade de destino.
   *
   * @param {Array<Record<string, unknown>>} entries
   * @param {ReadonlyArray<unknown>} destinos
   * @param {string} mappingMode
   * @returns {{ pares: Array<{ entry: Record<string, unknown>, property: Property }>, warnings: Array<{ code: string, message: string, details: unknown }> }}
   */
  function mapEntries(entries, destinos, mappingMode) {
    var pares = [];
    /** @type {Array<{ code: string, message: string, details: unknown }>} */
    var warnings = [];
    /** @type {Record<string, boolean>} */
    var usados = {};
    var i;
    var j;

    for (i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry) continue;
      var alvo = null;

      for (j = 0; j < destinos.length; j += 1) {
        if (usados[String(j)] === true) continue;
        var candidata = /** @type {Property} */ (destinos[j]);
        if (!isCopyableProperty(candidata)) continue;
        if (mappingMode === "matchName" && candidata.matchName !== entry.matchName) continue;
        alvo = { property: candidata, indice: j };
        break;
      }

      if (!alvo) {
        warnings.push({
          code: "paste.noTargetProperty",
          message: "Nenhuma propriedade de destino compativel para esta entrada.",
          details: { matchName: entry.matchName, propertyName: entry.propertyName }
        });
        continue;
      }

      // Dimensao diferente nao e detalhe: colar Position 3D numa camada 2D
      // gravaria um valor de tamanho errado, e o After Effects preencheria o
      // resto por conta propria.
      var dimensaoDestino = firstKeyDimensions(alvo.property);
      if (dimensaoDestino !== null && dimensaoDestino !== entry.dimensions) {
        warnings.push({
          code: "paste.dimensionMismatch",
          message: "A propriedade de destino tem outra quantidade de dimensoes.",
          details: {
            matchName: entry.matchName,
            sourceDimensions: entry.dimensions,
            targetDimensions: dimensaoDestino
          }
        });
        continue;
      }

      usados[String(alvo.indice)] = true;
      pares.push({ entry: entry, property: alvo.property });
    }

    return { pares: pares, warnings: warnings };
  }

  /**
   * Tempo em que a primeira key colada deve pousar.
   *
   * @param {CompItem} comp
   * @param {Record<string, unknown>} args
   * @param {{ firstKeyTime: number, sourceLayerInPoint: number }} board
   * @returns {number|null} null quando os tempos originais devem ser mantidos.
   */
  function anchorTime(comp, args, board) {
    if (args.pasteTime === "original") return null;
    if (args.relativeTiming !== true) {
      // Sem timing relativo, o bloco mantem a posicao que tinha em relacao ao
      // inicio da camada de origem, e nao em relacao a ancora.
      return board.firstKeyTime - board.sourceLayerInPoint;
    }
    if (args.pasteTime === "layerIn") return 0;
    return comp.time;
  }

  MotionRegistry.register("ae.keys.copy", { preflight: copyPreflight, run: copyRun });

  MotionRegistry.register("ae.keys.paste", {
    preflight: pastePreflight,

    run: function (args) {
      var board = clipboard;
      if (!board) throw new Error("Clipboard ficou vazio depois do preflight.");

      var comp = /** @type {CompItem} */ (app.project.activeItem);
      var mapeamento = mapEntries(board.entries, comp.selectedProperties, /** @type {string} */ (args.mappingMode));
      var ancora = anchorTime(comp, args, board);

      var snapshotsAnteriores = [];
      var pastedProperties = 0;
      var pastedKeys = 0;
      var i;
      var j;

      try {
        for (i = 0; i < mapeamento.pares.length; i += 1) {
          var par = mapeamento.pares[i];
          if (!par) continue;
          var property = par.property;
          var entry = par.entry;
          var keysOrigem = /** @type {Array<Record<string, unknown>>} */ (entry.keys);

          // O anterior fica guardado inteiro: e o unico jeito de desfazer uma
          // colagem que falhe no meio sem depender do Undo do host.
          var anterior = MotionKeyframes.captureProperty(property);
          snapshotsAnteriores.push(anterior);

          var destino = MotionKeyframes.captureProperty(property);
          var deslocamento = ancora === null ? 0 : ancora - board.firstKeyTime;

          for (j = 0; j < keysOrigem.length; j += 1) {
            var origem = keysOrigem[j];
            if (!origem) continue;
            var nova = /** @type {MotionCapturedKey} */ ({
              time: /** @type {number} */ (origem.time) + deslocamento,
              value: origem.value,
              inInterpolation: origem.inInterpolation,
              outInterpolation: origem.outInterpolation,
              inEase: origem.inEase,
              outEase: origem.outEase,
              temporalContinuous: origem.temporalContinuous,
              temporalAutoBezier: origem.temporalAutoBezier,
              roving: origem.roving,
              selected: true,
              spatial: null,
              label: origem.label
            });
            if (args.includeTangents === true && origem.spatial && destino.spatial === true) {
              nova.spatial = /** @type {MotionCapturedSpatialKey} */ (origem.spatial);
            }

            // Colar por cima de um keyframe existente substitui, e nao duplica:
            // dois keyframes no mesmo tempo nao existem no After Effects, e
            // deixar os dois no array faria restoreProperty falhar na validacao
            // de tempos.
            var conflito = -1;
            for (var k = 0; k < destino.keys.length; k += 1) {
              var existente = destino.keys[k];
              if (existente && Math.abs(/** @type {number} */ (existente.time) - nova.time) < 0.0000001) {
                conflito = k;
                break;
              }
            }
            if (conflito >= 0) destino.keys[conflito] = nova;
            else destino.keys.push(nova);
            pastedKeys += 1;
          }

          destino.keys.sort(function (a, b) {
            return /** @type {number} */ (a.time) - /** @type {number} */ (b.time);
          });

          MotionKeyframes.restoreProperty(destino, null);

          if (args.includeExpressions === true && property.canSetExpression === true) {
            property.expression = /** @type {string} */ (entry.expression);
            if (typeof property.expressionError === "string" && property.expressionError !== "") {
              throw new Error("After Effects recusou a expressao colada.");
            }
            property.expressionEnabled = entry.expressionEnabled === true;
          }

          pastedProperties += 1;
        }
      } catch (pasteError) {
        var rollbackFailed = false;
        for (i = snapshotsAnteriores.length - 1; i >= 0; i -= 1) {
          try {
            var reverter = snapshotsAnteriores[i];
            if (reverter) MotionKeyframes.restoreProperty(reverter, null);
          } catch (restoreError) {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("A colagem falhou e o estado anterior nao pode ser restaurado.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("A colagem de keyframes falhou."));
        failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
        throw failErr;
      }

      return {
        changed: pastedProperties > 0,
        // O criterio de aceite pede que incompatibilidade seja *informada* por
        // propriedade, e nao que derrube a colagem inteira: colar cinco
        // propriedades das quais uma nao casa deve colar as quatro.
        warnings: mapeamento.warnings,
        data: { pastedProperties: pastedProperties, pastedKeys: pastedKeys }
      };
    }
  });
})();
