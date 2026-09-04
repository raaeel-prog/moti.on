/**
 * Trim Paths em camadas ou grupos de forma (`ae.shape.trim-path`, CHMS-021).
 *
 * ## Como o comando reconhece o que e dele
 *
 * A §"ae.shape.trim-path" pede para "evitar duplicacao se operador CHMS ja
 * existir". Um operador de shape nao tem onde guardar identidade: nao ha
 * comentario, nao ha expressao com cabecalho, e a §11 e explicita que nome nao
 * e identificador.
 *
 * O que existe e o `RIG_PREFIX` do contrato, criado justamente para o usuario
 * reconhecer o que e do plugin. Aqui ele e usado como **heuristica**, e a
 * heuristica falha fechada:
 *
 *  - operador com o prefixo: o comando ajusta, que e o modo Adjust do criterio
 *    de aceite;
 *  - operador sem o prefixo: e do usuario, e o comando **recusa** em vez de
 *    sobrescrever ou de empilhar um segundo Trim Paths — dois operadores no
 *    mesmo grupo compoem, e o resultado nao seria o que nenhum dos dois pediu.
 *
 * Se o usuario renomear o operador, o comando passa a recusar em vez de
 * ajustar. E o lado seguro do erro: pior seria continuar mexendo em algo que
 * deixou de ser reconhecivel.
 *
 * ## Handles de propriedade
 *
 * Vale aqui a mesma regra medida em `text-box.jsx`: acrescentar um irmao dentro
 * de um grupo invalida os handles ja obtidos. Toda referencia usada depois de
 * um `addProperty` e relida do grupo.
 */
(function () {
  var ALLOWED = {
    scope: true,
    start: true,
    end: true,
    offset: true,
    animate: true,
    durationFrames: true,
    reverse: true
  };

  var MN = {
    rootContents: "ADBE Root Vectors Group",
    group: "ADBE Vector Group",
    groupContents: "ADBE Vectors Group",
    trim: "ADBE Vector Filter - Trim",
    trimStart: "ADBE Vector Trim Start",
    trimEnd: "ADBE Vector Trim End",
    trimOffset: "ADBE Vector Trim Offset"
  };

  var NOME_GERENCIADO = MotionContracts.RIG_PREFIX + "TRIM";

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

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Trim Path desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Trim Path ausente.", { field: key });
      }
    }
    if (args.scope !== "layer" && args.scope !== "group") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Escopo de Trim Path invalido.", { field: "scope" });
    }
    // Start e End sao percentuais do caminho. Passar de 100 nao e erro no After
    // Effects, mas aqui o intervalo fechado mantem o preset legivel.
    if (!isInRange(args.start, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Start de Trim Path invalido.", { field: "start" });
    }
    if (!isInRange(args.end, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "End de Trim Path invalido.", { field: "end" });
    }
    if (/** @type {number} */ (args.start) >= /** @type {number} */ (args.end)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Start precisa ser menor que End.", { field: "start" });
    }
    if (!isInRange(args.offset, -3600, 3600)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de Trim Path invalido.", { field: "offset" });
    }
    if (typeof args.animate !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "animate precisa ser booleano.", { field: "animate" });
    }
    if (typeof args.reverse !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "reverse precisa ser booleano.", { field: "reverse" });
    }
    if (
      !isFiniteNumber(args.durationFrames) ||
      Math.floor(/** @type {number} */ (args.durationFrames)) !== args.durationFrames ||
      !isInRange(args.durationFrames, 1, 10000)
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao de Trim Path invalida.", {
        field: "durationFrames"
      });
    }
    return null;
  }

  /** @param {unknown} candidata @returns {boolean} */
  function isShapeLayer(candidata) {
    return typeof ShapeLayer !== "undefined" && candidata instanceof ShapeLayer;
  }

  /**
   * Grupos onde o Trim Paths deve entrar, para uma camada.
   *
   * Escopo `layer` devolve a raiz de contents: um unico operador ali corta todos
   * os grupos da camada de uma vez. Escopo `group` devolve o conteudo de cada
   * grupo de primeiro nivel, que e o que faz o comando "funcionar com multiplos
   * grupos" do criterio de aceite.
   *
   * @param {unknown} layer
   * @param {string} scope
   * @returns {Array<PropertyGroup>}
   */
  function targetContainers(layer, scope) {
    var root = /** @type {any} */ (layer).property(MN.rootContents);
    if (!root) return [];
    if (scope === "layer") return [root];

    var containers = [];
    var i;
    for (i = 1; i <= root.numProperties; i += 1) {
      var item = root.property(i);
      if (item && item.matchName === MN.group) {
        var inner = item.property(MN.groupContents);
        if (inner) containers.push(inner);
      }
    }
    return containers;
  }

  /**
   * Operador Trim Paths ja presente num container, se houver.
   *
   * @param {PropertyGroup} container
   * @returns {PropertyGroup|null}
   */
  function existingTrim(container) {
    var i;
    for (i = 1; i <= container.numProperties; i += 1) {
      var item = container.property(i);
      if (item && item.matchName === MN.trim) return item;
    }
    return null;
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

    var alvos = 0;
    var i;
    var j;
    for (i = 0; i < selecionadas.length; i += 1) {
      var layer = selecionadas[i];
      if (!isShapeLayer(layer)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A selecao contem camada que nao e de forma.", {
          selectionIndex: i
        });
      }
      var containers = targetContainers(layer, /** @type {string} */ (args.scope));
      if (containers.length === 0) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camada de forma nao tem grupo para cortar.", {
          selectionIndex: i
        });
      }
      for (j = 0; j < containers.length; j += 1) {
        var container = containers[j];
        if (!container) continue;
        var trim = existingTrim(container);
        if (trim && trim.name !== NOME_GERENCIADO) {
          return failure(
            MotionContracts.ERROR.TRACK_CONFLICT,
            "Ja existe um Trim Paths do usuario neste grupo.",
            { selectionIndex: i, groupIndex: j }
          );
        }
        alvos += 1;
      }
    }

    if (alvos === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Nenhum grupo elegivel na selecao.", null);
    }
    return null;
  }

  /**
   * Estado de um Trim Paths, para poder devolve-lo ao que era.
   *
   * @param {PropertyGroup} trim
   * @returns {{ trim: PropertyGroup, startSnapshot: MotionPropertySnapshot, endSnapshot: MotionPropertySnapshot, offsetValue: unknown, name: string }}
   */
  function snapshotTrim(trim) {
    var start = /** @type {Property} */ (trim.property(MN.trimStart));
    var end = /** @type {Property} */ (trim.property(MN.trimEnd));
    var offset = /** @type {Property} */ (trim.property(MN.trimOffset));
    return {
      trim: trim,
      startSnapshot: MotionKeyframes.captureProperty(start),
      endSnapshot: MotionKeyframes.captureProperty(end),
      offsetValue: offset.value,
      name: trim.name
    };
  }

  /**
   * @param {Property} property
   * @param {number} valor
   * @returns {void}
   */
  function setStatic(property, valor) {
    // `setValue` levanta erro numa propriedade animada; remover as keys antes e
    // o unico caminho para voltar a um valor fixo.
    var i;
    for (i = property.numKeys; i >= 1; i -= 1) property.removeKey(i);
    property.setValue(valor);
  }

  /**
   * @param {Property} property
   * @param {number} de
   * @param {number} para
   * @param {number} inicio
   * @param {number} fim
   * @returns {void}
   */
  function animateBetween(property, de, para, inicio, fim) {
    var i;
    for (i = property.numKeys; i >= 1; i -= 1) property.removeKey(i);
    property.setValueAtTime(inicio, de);
    property.setValueAtTime(fim, para);
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers;
    var scope = /** @type {string} */ (args.scope);
    var start = /** @type {number} */ (args.start);
    var end = /** @type {number} */ (args.end);
    var offset = /** @type {number} */ (args.offset);
    var animate = args.animate === true;
    var reverse = args.reverse === true;
    var durationFrames = /** @type {number} */ (args.durationFrames);

    var criados = [];
    var ajustados = [];
    var addedCount = 0;
    var adjustedCount = 0;
    var i;
    var j;

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var containers = targetContainers(selecionadas[i], scope);
        for (j = 0; j < containers.length; j += 1) {
          var container = containers[j];
          if (!container) continue;

          var trim = existingTrim(container);
          if (trim) {
            ajustados.push(snapshotTrim(trim));
            adjustedCount += 1;
          } else {
            container.addProperty(MN.trim);
            // Reler: o handle devolvido por addProperty deixa de valer assim que
            // outro irmao entrar no grupo, e este laco continua inserindo.
            trim = existingTrim(container);
            if (!trim) throw new Error("After Effects nao devolveu o Trim Paths recem-criado.");
            trim.name = NOME_GERENCIADO;
            criados.push({ container: container, trim: trim });
            addedCount += 1;
          }

          var propStart = /** @type {Property} */ (trim.property(MN.trimStart));
          var propEnd = /** @type {Property} */ (trim.property(MN.trimEnd));
          var propOffset = /** @type {Property} */ (trim.property(MN.trimOffset));
          if (!propStart || !propEnd || !propOffset) {
            throw new Error("Trim Paths sem as propriedades esperadas.");
          }

          setStatic(propOffset, offset);

          if (!animate) {
            setStatic(propStart, start);
            setStatic(propEnd, end);
            continue;
          }

          // Reveal animado no CTI: a ponta que anda vai de onde a outra esta ate
          // o valor pedido. Reverse troca qual das duas anda, que e a diferenca
          // entre desenhar do comeco e apagar do fim.
          var inicio = comp.time;
          var fim = comp.time + durationFrames * comp.frameDuration;
          if (reverse) {
            setStatic(propEnd, end);
            animateBetween(propStart, end, start, inicio, fim);
          } else {
            setStatic(propStart, start);
            animateBetween(propEnd, start, end, inicio, fim);
          }
        }
      }
    } catch (trimError) {
      var rollbackFailed = false;
      for (i = ajustados.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = ajustados[i];
          if (!anterior) continue;
          MotionKeyframes.restoreProperty(anterior.startSnapshot, null);
          MotionKeyframes.restoreProperty(anterior.endSnapshot, null);
          var trimAnterior = anterior.trim;
          setStatic(trimAnterior.property(MN.trimOffset), /** @type {number} */ (anterior.offsetValue));
          trimAnterior.name = anterior.name;
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      for (i = criados.length - 1; i >= 0; i -= 1) {
        try {
          var criado = criados[i];
          if (criado) criado.trim.remove();
        } catch (removeError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("Trim Paths falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Trim Paths falhou."));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }

    return {
      changed: addedCount + adjustedCount > 0,
      warnings: [],
      data: { addedCount: addedCount, adjustedCount: adjustedCount }
    };
  }

  MotionRegistry.register("ae.shape.trim-path", { preflight: preflight, run: run });
})();
