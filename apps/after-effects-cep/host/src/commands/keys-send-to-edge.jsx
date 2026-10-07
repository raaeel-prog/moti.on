/**
 * Envia o grupo de keyframes selecionado para o comeco ou para o fim da
 * timeline (MASTER_BUILD_SPEC secao 15.5, "Enviar ao comeco" e "Enviar ao
 * final").
 *
 * As duas operacoes da spec sao a mesma conta com o sinal trocado, e por isso
 * vivem num comando so, escolhido por `edge`. Separa-las em dois ids
 * duplicaria captura, plano, rollback e validacao para render uma diferenca de
 * uma linha.
 *
 * ## O que "o grupo" significa aqui
 *
 * O grupo e o conjunto de keyframes SELECIONADOS, e ele se move rigido: todos
 * recebem o mesmo deslocamento. E isso que preserva o "relative timing" exigido
 * pela secao 15.6 — o espacamento interno da animacao nao muda, so a posicao
 * dela na timeline.
 *
 * Keyframes NAO selecionados da mesma propriedade ficam onde estao, e dai vem a
 * unica condicao de erro propria do comando: se o grupo, ao deslocar, coincidir
 * com um keyframe que ficou parado, haveria perda silenciosa de keyframe. O
 * plano inteiro e conferido antes de qualquer escrita e recusado com
 * `KEYFRAME_CONFLICT`, em vez de escrever e deixar o host resolver o empate.
 *
 * ## Referencia de destino
 *
 * `reference` escolhe contra o que a borda e medida, como a spec pede:
 *
 * | reference  | edge "start"        | edge "end"             |
 * |------------|---------------------|------------------------|
 * | "comp"     | 0                   | duracao da composicao  |
 * | "layer"    | inPoint da camada   | outPoint da camada     |
 * | "workArea" | inicio da work area | fim da work area       |
 *
 * `layer` mede contra a camada dona de cada propriedade, entao uma selecao que
 * atravessa varias camadas alinha cada uma na propria borda. Isso e deliberado:
 * e o comportamento util para escalonar entradas e saidas, e nao um alinhamento
 * comum a todas.
 */
(function () {
  var ARGUMENTOS = { edge: true, reference: true };
  var BORDAS = { start: true, end: true };
  var REFERENCIAS = { comp: true, layer: true, workArea: true };

  // O mesmo piso que keyframe-operations.jsx usa para considerar dois tempos
  // distintos. Repetido aqui porque aquele modulo nao o exporta, e um valor
  // divergente faria este comando aprovar um plano que o restore recusa.
  var TOLERANCIA_DE_TEMPO = 1e-6;

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /**
   * Propriedades selecionadas que tem keyframe selecionado.
   *
   * @param {CompItem} comp
   * @returns {{property: Property, sel: number[]}[]}
   */
  function alvosDe(comp) {
    var props = comp.selectedProperties;
    var alvos = [];
    var i;
    for (i = 0; i < props.length; i += 1) {
      var propRaw = props[i];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      if (prop.propertyType !== PropertyType.PROPERTY || !prop.canVaryOverTime) continue;
      if (prop.numKeys < 1) continue;
      var sel = prop.selectedKeys;
      if (!sel || sel.length < 1) continue;
      alvos.push({ property: prop, sel: sel });
    }
    return alvos;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(ARGUMENTOS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido.", { field: key });
      }
    }
    if (typeof args.edge !== "string" || !Object.prototype.hasOwnProperty.call(BORDAS, args.edge)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "edge precisa ser 'start' ou 'end'.", {
        field: "edge"
      });
    }
    if (
      typeof args.reference !== "string" ||
      !Object.prototype.hasOwnProperty.call(REFERENCIAS, args.reference)
    ) {
      return failure(
        MotionContracts.ERROR.INVALID_PRESET,
        "reference precisa ser 'comp', 'layer' ou 'workArea'.",
        { field: "reference" }
      );
    }
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    return planejar(/** @type {CompItem} */ (comp), args.edge, args.reference).erro;
  }

  /**
   * Sobe a cadeia de `parentProperty` ate a camada dona da propriedade.
   *
   * @param {Property} property
   * @returns {Layer|null}
   */
  function camadaDe(property) {
    var atual = /** @type {any} */ (property);
    var guarda = 0;
    while (atual && atual.parentProperty && guarda < 64) {
      atual = atual.parentProperty;
      guarda += 1;
    }
    return atual && typeof atual.inPoint === "number" ? /** @type {Layer} */ (atual) : null;
  }

  /**
   * @param {CompItem} comp
   * @param {Property} property
   * @param {string} edge
   * @param {string} reference
   * @returns {number|null} instante de destino, ou null quando a camada dona
   *   nao pode ser identificada.
   */
  function instanteDeDestino(comp, property, edge, reference) {
    if (reference === "comp") return edge === "start" ? 0 : comp.duration;
    if (reference === "workArea") {
      return edge === "start" ? comp.workAreaStart : comp.workAreaStart + comp.workAreaDuration;
    }
    var camada = camadaDe(property);
    if (!camada) return null;
    return edge === "start" ? camada.inPoint : camada.outPoint;
  }

  /**
   * Tempos finais do conjunto completo de keyframes da propriedade, deslocando apenas os
   * indices selecionados.
   *
   * @param {MotionCapturedKey[]} keys
   * @param {number[]} indicesSelecionados zero-based
   * @param {number} deslocamento
   * @returns {number[]}
   */
  function temposDeslocados(keys, indicesSelecionados, deslocamento) {
    var selecionado = /** @type {Record<string, boolean>} */ ({});
    var i;
    for (i = 0; i < indicesSelecionados.length; i += 1) {
      selecionado["k" + indicesSelecionados[i]] = true;
    }
    var tempos = [];
    for (i = 0; i < keys.length; i += 1) {
      var chave = /** @type {MotionCapturedKey} */ (keys[i]);
      var move = Object.prototype.hasOwnProperty.call(selecionado, "k" + i);
      tempos.push(move ? chave.time + deslocamento : chave.time);
    }
    return tempos;
  }

  /**
   * Monta o plano de deslocamento e, com ele, decide se a operacao e legal.
   *
   * Vive fora do `run` porque a secao 8 exige TODA a validacao no preflight, e
   * porque o dispatcher colapsa qualquer excecao que nao seja ROLLBACK_FAILED
   * em HOST_OPERATION_FAILED: um KEYFRAME_CONFLICT lancado do `run` chegaria ao
   * painel como erro generico. Preflight e `run` chamam esta mesma funcao — o
   * custo e capturar as propriedades duas vezes, e o ganho e o painel receber o
   * motivo real da recusa.
   *
   * @param {CompItem} comp
   * @param {string} edge
   * @param {string} reference
   * @returns {{planos: {original: MotionPropertySnapshot, target: MotionPropertySnapshot, deslocamento: number}[], erro: MotionCommandFailure|null}}
   */
  function planejar(comp, edge, reference) {
    var alvos = alvosDe(comp);
    if (alvos.length === 0) {
      // O descriptor declara allowsNoopSuccess, porque pedir a borda onde o
      // grupo ja esta e um pedido satisfeito de antemao. Selecao vazia nao e
      // isso: e erro do usuario, e viraria um "ok" mudo se passasse daqui.
      return {
        planos: [],
        erro: failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos um keyframe.")
      };
    }

    var planos = [];
    var i;
    var j;
    var total = 0;
    for (i = 0; i < alvos.length; i += 1) {
      var alvo = alvos[i];
      if (!alvo) continue;
      var propriedade = /** @type {Property} */ (alvo.property);
      if (!MotionKeyframes.isSupportedProperty(propriedade)) {
        return { planos: [], erro: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione propriedades numericas, vetoriais ou cores.") };
      }
      total += propriedade.numKeys;
      if (total > MotionKeyframes.MAX_KEYS_PER_BATCH) {
        return { planos: [], erro: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione um lote de ate 10.000 keyframes.") };
      }
      var destino = instanteDeDestino(comp, propriedade, edge, reference);
      if (destino === null || !isFinite(destino)) {
        return {
          planos: [],
          erro: failure(
            MotionContracts.ERROR.HOST_OPERATION_FAILED,
            "Nao foi possivel identificar a camada da propriedade selecionada."
          )
        };
      }

      var original = MotionKeyframes.captureProperty(propriedade);
      var target = MotionKeyframes.captureProperty(propriedade);
      var chaves = original.keys;
      var indices = [];
      var selArr = /** @type {number[]} */ (alvo.sel);
      for (j = 0; j < selArr.length; j += 1) {
        var selVal = selArr[j];
        if (typeof selVal === "number") indices.push(selVal - 1);
      }

      var indicePrimeiro = indices[0];
      var indiceUltimo = indices[indices.length - 1];
      var primeiro =
        typeof indicePrimeiro === "number"
          ? /** @type {MotionCapturedKey|undefined} */ (chaves[indicePrimeiro])
          : null;
      var ultimo =
        typeof indiceUltimo === "number"
          ? /** @type {MotionCapturedKey|undefined} */ (chaves[indiceUltimo])
          : null;
      if (!primeiro || !ultimo) {
        return {
          planos: [],
          erro: failure(
            MotionContracts.ERROR.HOST_OPERATION_FAILED,
            "A selecao de keyframes caiu fora do intervalo capturado."
          )
        };
      }

      // A borda do proprio grupo: o primeiro key selecionado quando o destino e
      // o comeco, o ultimo quando e o fim.
      var ancora = edge === "start" ? Infinity : -Infinity;
      var owner = camadaDe(propriedade);
      if (owner && /** @type {any} */ (owner).locked) return { planos: [], erro: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie as camadas selecionadas.") };
      // One common shift across properties; layer reference groups by owner.
      for (var a = 0; a < alvos.length; a += 1) {
        var related = alvos[a];
        if (!related || (reference === "layer" && camadaDe(related.property) !== owner)) continue;
        for (var b = 0; b < related.sel.length; b += 1) {
          var selectedIndex = related.sel[b];
          if (typeof selectedIndex !== "number") continue;
          var selectedTime = related.property.keyTime(selectedIndex);
          ancora = edge === "start" ? Math.min(ancora, selectedTime) : Math.max(ancora, selectedTime);
        }
      }
      var deslocamento = destino - ancora;
      var tempos = temposDeslocados(chaves, indices, deslocamento);
      for (j = 0; j < target.keys.length; j += 1) {
        var originalKey = /** @type {MotionCapturedKey} */ (chaves[j]);
        var targetKey = /** @type {MotionCapturedKey} */ (target.keys[j]);
        originalKey.selected = false;
        for (var s = 0; s < indices.length; s += 1) if (indices[s] === j) originalKey.selected = true;
        targetKey.selected = originalKey.selected;
        targetKey.time = /** @type {number} */ (tempos[j]);
      }
      // Crossing an unselected key changes index order but does not overwrite
      // it. Sort complete records, then reject only actual time collisions.
      target.keys.sort(function (a, b) { return a.time - b.time; });
      for (j = 1; j < target.keys.length; j += 1) {
        var previous = /** @type {MotionCapturedKey} */ (target.keys[j - 1]);
        var current = /** @type {MotionCapturedKey} */ (target.keys[j]);
        if (current.time - previous.time <= TOLERANCIA_DE_TEMPO) {
          return {
            planos: [],
            erro: failure(MotionContracts.ERROR.KEYFRAME_CONFLICT,
              "Ja existe um keyframe no tempo de destino. Inclua esse keyframe na selecao ou escolha outro trecho.",
              { destination: reference + "-" + edge, operation: "move", time: current.time,
                propertyName: propriedade.name, layerName: owner ? owner.name : "", conflictWith: "unselected" })
          };
        }
      }

      planos.push({ original: original, target: target, deslocamento: deslocamento });
    }

    return { planos: planos, erro: null };
  }

  /** @param {string} code @param {string} message @returns {Error} */
  function erroDeHost(code, message) {
    var erro = /** @type {Error & {motionCode?: string}} */ (new Error(message));
    erro.motionCode = code;
    return erro;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var edge = /** @type {string} */ (args.edge);
    var reference = /** @type {string} */ (args.reference);

    var plano = planejar(comp, edge, reference);
    if (plano.erro) {
      // O preflight ja rodou este mesmo planejamento e recusou; chegar aqui
      // significa que o projeto mudou entre as duas chamadas.
      throw erroDeHost(plano.erro.code, plano.erro.message);
    }
    var planos = plano.planos;
    var i;

    var deslocados = 0;
    for (i = 0; i < planos.length; i += 1) {
      var contagem = planos[i];
      if (contagem && Math.abs(contagem.deslocamento) > TOLERANCIA_DE_TEMPO) deslocados += 1;
    }
    if (deslocados === 0) {
      // Ja esta na borda pedida. O descriptor declara allowsNoopSuccess, entao
      // o dispatcher responde ok sem inventar uma alteracao.
      return { changed: false, warnings: [], data: { shifted: 0 } };
    }

    // The shared writer owns complete rollback and restores selection only
    // after all siblings have been recreated. Undo stays with the dispatcher.
    /** @type {MotionKeyEditPlan} */
    var edit = { originals: [], targets: [], error: null };
    for (i = 0; i < planos.length; i += 1) {
      var aplicar = planos[i];
      if (!aplicar) continue;
      edit.originals.push(aplicar.original);
      edit.targets.push(aplicar.target);
    }
    MotionKeyframes.applyEdit(edit);

    return {
      changed: true,
      warnings: [],
      data: { shifted: deslocados, edge: edge, reference: reference }
    };
  }

  MotionRegistry.register("ae.keys.send-to-edge", {
    preflight: preflight,
    run: run
  });
}());
