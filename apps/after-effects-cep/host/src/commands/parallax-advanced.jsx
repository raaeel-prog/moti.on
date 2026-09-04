/**
 * Parallax completo — foco, zoom, wiggle e bake (CHMS-023).
 *
 * As quatro operacoes agem sobre um rig ja montado pelo Quick Rig
 * (`ae.animate.parallax.quick`). Elas nao criam rig: se nao houver um, recusam.
 *
 * ## Como a camera e encontrada
 *
 * Pela estrutura, nunca por nome. `comp.activeCamera` e a camera que de fato
 * renderiza a composicao no tempo corrente — e a resposta certa para "a camera
 * deste rig", e sobrevive a renomear, reordenar e duplicar. Quando nao ha camera
 * ativa, o comando recusa em vez de adivinhar.
 *
 * Isto substitui uma versao anterior que montava o nome da camera a partir do
 * nome do controller e caia num literal `"Camera 1"`. Alem de quebrar ao
 * renomear, o fallback podia pegar uma camera de outro rig na mesma composicao.
 *
 * ## Undo
 *
 * Nenhuma das quatro abre grupo de Undo. O dispatcher ja abre um porque os
 * descriptors declaram `mutates`, e o After Effects nao aninha grupos: um
 * `endUndoGroup` interno fecharia o grupo de fora, e o resto da operacao cairia
 * fora do Undo — o usuario apertaria Ctrl+Z e desfaria so um pedaco.
 */
(function () {
  /* global Property CameraLayer */

  var MN = {
    transform: "ADBE Transform Group",
    position: "ADBE Position",
    scale: "ADBE Scale",
    cameraOptions: "ADBE Camera Options Group",
    depthOfField: "ADBE Camera Depth of Field",
    focusDistance: "ADBE Camera Focus Distance",
    zoom: "ADBE Camera Zoom",
    slider: "ADBE Slider Control"
  };

  var RIG_TYPE = "parallax.quick";

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
   * Recusa argumento desconhecido e argumento faltando.
   *
   * Aceitar o desconhecido em silencio transforma erro de digitacao no cliente
   * em "o comando rodou e nao fez nada".
   *
   * @param {Record<string, unknown>} args
   * @param {Record<string, boolean>} permitidos
   * @returns {MotionCommandFailure|null}
   */
  function validarChaves(args, permitidos) {
    var chave;
    for (chave in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, chave) &&
        !Object.prototype.hasOwnProperty.call(permitidos, chave)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido.", { field: chave });
      }
    }
    for (chave in permitidos) {
      if (
        Object.prototype.hasOwnProperty.call(permitidos, chave) &&
        !Object.prototype.hasOwnProperty.call(args, chave)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento ausente.", { field: chave });
      }
    }
    return null;
  }

  /** @param {unknown} layer @param {string} grupo @param {string} matchName @returns {Property|null} */
  function propriedade(layer, grupo, matchName) {
    var g = /** @type {any} */ (layer).property(grupo);
    if (!g) return null;
    var p = g.property(matchName);
    return p instanceof Property ? p : null;
  }

  /**
   * A camera do rig, pela estrutura.
   *
   * @param {CompItem} comp
   * @returns {CameraLayer|null}
   */
  function cameraDoRig(comp) {
    var ativa = /** @type {any} */ (comp).activeCamera;
    if (ativa && typeof CameraLayer !== "undefined" && ativa instanceof CameraLayer) {
      return /** @type {CameraLayer} */ (ativa);
    }
    return null;
  }

  /** @param {CompItem} comp @returns {Layer|null} */
  function controllerDoRig(comp) {
    return MotionRigMeta.findController(comp, RIG_TYPE);
  }

  /**
   * Indice do keyframe que esta neste tempo, ou 0 se nao houver.
   *
   * Varre em vez de usar `nearestKeyIndex` porque "o mais proximo" devolve
   * sempre alguma chave — inclusive uma longe — e aqui a pergunta e "existe uma
   * chave exatamente aqui". A tolerancia e de meio quadro: o After Effects
   * encaixa `setValueAtTime` na grade, entao o tempo devolvido nao e byte a byte
   * o que pedimos.
   *
   * @param {Property} property
   * @param {number} tempo
   * @param {number} tolerancia
   * @returns {number}
   */
  function indiceNoTempo(property, tempo, tolerancia) {
    var i;
    for (i = 1; i <= property.numKeys; i += 1) {
      if (Math.abs(property.keyTime(i) - tempo) <= tolerancia) return i;
    }
    return 0;
  }

  /**
   * Verifica se o After Effects aceitou a expressao.
   *
   * Ele nao lanca ao rejeitar: reporta em `expressionError` e deixa a
   * propriedade acesa e quebrada. Sem esta checagem o comando responderia
   * sucesso com o projeto num estado que nao anima.
   *
   * @param {Property} property
   * @returns {string}
   */
  function erroDeExpressao(property) {
    var erro = /** @type {any} */ (property).expressionError;
    return typeof erro === "string" ? erro : "";
  }

  /* ------------------------------------------------------- preflight comum */

  /** @returns {MotionCommandFailure|null} */
  function compAtiva() {
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.", null);
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null);
    }
    return null;
  }

  /**
   * O rig precisa existir: estas quatro operacoes ajustam um rig, nao criam um.
   * @returns {MotionCommandFailure|null}
   */
  function exigeRig() {
    var falha = compAtiva();
    if (falha) return falha;
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    if (!controllerDoRig(comp)) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nenhum rig de parallax nesta composicao.", null);
    }
    return null;
  }

  /** @returns {MotionCommandFailure|null} */
  function exigeCamera() {
    var falha = exigeRig();
    if (falha) return falha;
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    if (!cameraDoRig(comp)) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nenhuma camera ativa nesta composicao.", null);
    }
    return null;
  }

  /* --------------------------------------------------------- 1. auto-focus */

  var ALLOWED_FOCUS = { targetLayerName: true, focusOffset: true, enableDepthOfField: true };

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflightAutoFocus(args) {
    var falha = validarChaves(args, ALLOWED_FOCUS);
    if (falha) return falha;
    if (
      typeof args.targetLayerName !== "string" ||
      args.targetLayerName.length < 1 ||
      args.targetLayerName.length > 80
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do alvo invalido.", { field: "targetLayerName" });
    }
    if (!isInRange(args.focusOffset, -100000, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de foco invalido.", { field: "focusOffset" });
    }
    if (typeof args.enableDepthOfField !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "enableDepthOfField precisa ser booleano.", {
        field: "enableDepthOfField"
      });
    }

    falha = exigeCamera();
    if (falha) return falha;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var alvo = null;
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      if (comp.layer(i).name === args.targetLayerName) {
        alvo = comp.layer(i);
        break;
      }
    }
    if (!alvo) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Camada alvo nao encontrada.", {
        field: "targetLayerName"
      });
    }

    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var foco = propriedade(camera, MN.cameraOptions, MN.focusDistance);
    if (!foco || foco.canSetExpression !== true) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera nao expoe Focus Distance.", null);
    }
    if (foco.expression !== "" && !MotionExpressions.isManagedParallaxFocus(foco.expression)) {
      return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "Focus Distance contem expressao de usuario.", null);
    }
    return null;
  }

  /** @param {Record<string, unknown>} args */
  function runAutoFocus(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var foco = /** @type {Property} */ (propriedade(camera, MN.cameraOptions, MN.focusDistance));
    var dof = propriedade(camera, MN.cameraOptions, MN.depthOfField);

    var expressaoAnterior = foco.expression;
    var habilitadoAnterior = foco.expressionEnabled;
    var dofAnterior = dof ? dof.value : null;

    var texto = MotionExpressions.renderParallaxFocus({
      targetLayerName: args.targetLayerName,
      focusOffset: args.focusOffset
    });

    try {
      foco.expression = texto;
      if (erroDeExpressao(foco) !== "") {
        throw new Error("After Effects recusou a expressao de foco.");
      }
      foco.expressionEnabled = true;
      if (dof && args.enableDepthOfField === true && dof.value !== 1) dof.setValue(1);
    } catch (e) {
      // Rollback: sem isto, uma falha no meio deixaria a camera com foco preso
      // a um alvo e a profundidade de campo ligada pela metade.
      foco.expression = expressaoAnterior;
      foco.expressionEnabled = habilitadoAnterior;
      if (dof && dofAnterior !== null && dof.value !== dofAnterior) dof.setValue(dofAnterior);
      throw e;
    }

    return {
      changed: true,
      warnings: [],
      data: { targetLayerName: args.targetLayerName }
    };
  }

  /* --------------------------------------------------------- 2. wiggle */

  var ALLOWED_WIGGLE = { frequency: true, amplitude: true, seed: true };

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflightWiggle(args) {
    var falha = validarChaves(args, ALLOWED_WIGGLE);
    if (falha) return falha;
    if (!isInRange(args.frequency, 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Frequencia invalida.", { field: "frequency" });
    }
    if (!isInRange(args.amplitude, 0, 100000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Amplitude invalida.", { field: "amplitude" });
    }
    if (!isInRange(args.seed, 0, 1000000) || Math.floor(/** @type {number} */ (args.seed)) !== args.seed) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Semente invalida.", { field: "seed" });
    }

    falha = exigeCamera();
    if (falha) return falha;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var pos = propriedade(camera, MN.transform, MN.position);
    if (!pos || pos.canSetExpression !== true) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera nao expoe Position.", null);
    }
    if (pos.expression !== "" && !MotionExpressions.isManagedParallaxWiggle(pos.expression)) {
      return failure(
        MotionContracts.ERROR.EXPRESSION_CONFLICT,
        "A posicao da camera contem expressao de usuario.",
        null
      );
    }
    return null;
  }

  /**
   * Le o slider gerenciado, criando-o se ainda nao existir.
   *
   * `addProperty` devolve um handle que expira; por isso o efeito e relido da
   * lista pelo nome que acabamos de dar, como em `MotionEffects.add`.
   *
   * @param {Layer} controller
   * @param {string} nome
   * @param {number} valor
   * @returns {{criado: boolean, anterior: number|null}}
   */
  function ajustarSlider(controller, nome, valor) {
    var efeitos = /** @type {any} */ (controller).property("ADBE Effect Parade");
    if (!efeitos) throw new Error("O controller nao aceita efeitos.");

    var existente = efeitos.property(nome);
    if (existente) {
      var atual = existente.property(1);
      var anterior = atual.value;
      if (anterior !== valor) atual.setValue(valor);
      return { criado: false, anterior: anterior };
    }

    var adicionado = efeitos.addProperty(MN.slider);
    adicionado.name = nome;
    var relido = efeitos.property(nome);
    if (!relido) throw new Error("O slider nao ficou disponivel apos ser criado.");
    relido.property(1).setValue(valor);
    return { criado: true, anterior: null };
  }

  /** @param {Record<string, unknown>} args */
  function runWiggle(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = /** @type {Layer} */ (controllerDoRig(comp));
    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var pos = /** @type {Property} */ (propriedade(camera, MN.transform, MN.position));

    var nomes = MotionExpressions.parallaxWiggleSliderNames;
    var expressaoAnterior = pos.expression;
    var habilitadoAnterior = pos.expressionEnabled;
    var sliders = [];

    try {
      sliders.push({
        nome: nomes.frequency,
        estado: ajustarSlider(controller, nomes.frequency, /** @type {number} */ (args.frequency))
      });
      sliders.push({
        nome: nomes.amplitude,
        estado: ajustarSlider(controller, nomes.amplitude, /** @type {number} */ (args.amplitude))
      });

      pos.expression = MotionExpressions.renderParallaxWiggle({
        controllerName: controller.name,
        seed: args.seed
      });
      if (erroDeExpressao(pos) !== "") {
        throw new Error("After Effects recusou a expressao de wiggle.");
      }
      pos.expressionEnabled = true;
    } catch (e) {
      desfazerSliders(controller, sliders);
      pos.expression = expressaoAnterior;
      pos.expressionEnabled = habilitadoAnterior;
      throw e;
    }

    return { changed: true, warnings: [], data: { controllerName: controller.name } };
  }

  /**
   * Devolve os sliders ao que eram: remove os que criamos, restaura o valor dos
   * que ja existiam.
   *
   * @param {Layer} controller
   * @param {Array<{nome: string, estado: {criado: boolean, anterior: number|null}}>} sliders
   */
  function desfazerSliders(controller, sliders) {
    var efeitos = /** @type {any} */ (controller).property("ADBE Effect Parade");
    if (!efeitos) return;
    var i;
    for (i = sliders.length - 1; i >= 0; i -= 1) {
      var item = sliders[i];
      if (!item) continue;
      var efeito = efeitos.property(item.nome);
      if (!efeito) continue;
      if (item.estado.criado) efeito.remove();
      else if (item.estado.anterior !== null) efeito.property(1).setValue(item.estado.anterior);
    }
  }

  /* --------------------------------------------------------- 3. zoom */

  var ALLOWED_ZOOM = { zoomLevel: true, durationFrames: true };

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflightZoom(args) {
    var falha = validarChaves(args, ALLOWED_ZOOM);
    if (falha) return falha;
    if (!isInRange(args.zoomLevel, 1, 1000000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Zoom invalido.", { field: "zoomLevel" });
    }
    if (
      !isInRange(args.durationFrames, 1, 100000) ||
      Math.floor(/** @type {number} */ (args.durationFrames)) !== args.durationFrames
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Duracao invalida.", { field: "durationFrames" });
    }

    falha = exigeCamera();
    if (falha) return falha;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var zoom = propriedade(camera, MN.cameraOptions, MN.zoom);
    if (!zoom) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "A camera nao expoe Zoom.", null);
    }
    if (zoom.expression !== "") {
      return failure(
        MotionContracts.ERROR.EXPRESSION_CONFLICT,
        "O Zoom da camera esta sob expressao; keyframes nao teriam efeito.",
        null
      );
    }
    return null;
  }

  /** @param {Record<string, unknown>} args */
  function runZoom(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var camera = /** @type {CameraLayer} */ (cameraDoRig(comp));
    var zoom = /** @type {Property} */ (propriedade(camera, MN.cameraOptions, MN.zoom));

    var t1 = comp.time;
    var t2 = comp.time + /** @type {number} */ (args.durationFrames) * comp.frameDuration;
    var valorInicial = /** @type {number} */ (zoom.value);
    var alvo = /** @type {number} */ (args.zoomLevel);

    // Meio quadro: o After Effects encaixa `setValueAtTime` na grade, entao o
    // tempo de volta nao e byte a byte o pedido.
    var tolerancia = comp.frameDuration / 2;

    /** @type {number[]} */
    var criados = [];
    try {
      zoom.setValueAtTime(t1, valorInicial);
      criados.push(t1);
      zoom.setValueAtTime(t2, alvo);
      criados.push(t2);

      // Os indices sao buscados pelo tempo, e nao assumidos como as duas ultimas
      // chaves: se o Zoom ja tinha keyframes depois de t2, "as duas ultimas"
      // seriam outras, e o ease cairia na chave errada.
      var i1 = indiceNoTempo(zoom, t1, tolerancia);
      var i2 = indiceNoTempo(zoom, t2, tolerancia);
      if (i1 === 0 || i2 === 0) throw new Error("Os keyframes de zoom nao foram encontrados apos a escrita.");

      // A curva vem do mesmo lugar que as outras ferramentas usam, para o
      // resultado ser o mesmo ease que o painel desenha.
      var duracao = t2 - t1;
      var ease = MotionKeyframes.curveToEase({ x1: 0.33, y1: 0, x2: 0.67, y2: 1 }, duracao, alvo - valorInicial);

      zoom.setTemporalEaseAtKey(
        i1,
        [new KeyframeEase(ease.inSpeed, ease.inInfluence)],
        [new KeyframeEase(ease.outSpeed, ease.outInfluence)]
      );
      zoom.setTemporalEaseAtKey(
        i2,
        [new KeyframeEase(ease.inSpeed, ease.inInfluence)],
        [new KeyframeEase(ease.outSpeed, ease.outInfluence)]
      );
    } catch (e) {
      // Rollback: as chaves sao removidas de tras para frente, porque remover
      // uma reindexa as seguintes.
      var j;
      for (j = criados.length - 1; j >= 0; j -= 1) {
        var quando = /** @type {number} */ (criados[j]);
        var idx = indiceNoTempo(zoom, quando, tolerancia);
        if (idx !== 0) zoom.removeKey(idx);
      }
      throw e;
    }

    return { changed: true, warnings: [], data: { from: valorInicial, to: alvo } };
  }

  /* --------------------------------------------------------- 4. bake */

  var ALLOWED_BAKE = { stepFrames: true };

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflightBake(args) {
    var falha = validarChaves(args, ALLOWED_BAKE);
    if (falha) return falha;
    if (
      !isInRange(args.stepFrames, 1, 100) ||
      Math.floor(/** @type {number} */ (args.stepFrames)) !== args.stepFrames
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Passo invalido.", { field: "stepFrames" });
    }

    falha = compAtiva();
    if (falha) return falha;

    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selecionadas = comp.selectedLayers || [];
    if (selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione as camadas a assar.", null);
    }

    // "Nada para assar" e validacao, e por isso vive aqui: o descriptor declara
    // `allowsNoopSuccess: false`, entao devolver `changed: false` no `run` seria
    // erro — e o grupo de Undo ja teria sido aberto para nada.
    var i;
    var p;
    var encontrou = false;
    for (i = 0; i < selecionadas.length && !encontrou; i += 1) {
      var alvos = [
        propriedade(selecionadas[i], MN.transform, MN.position),
        propriedade(selecionadas[i], MN.transform, MN.scale)
      ];
      for (p = 0; p < alvos.length; p += 1) {
        var prop = alvos[p];
        if (prop && prop.expression !== "" && prop.expressionEnabled === true) {
          encontrou = true;
          break;
        }
      }
    }
    if (!encontrou) {
      return failure(
        MotionContracts.ERROR.INVALID_SELECTION_TYPE,
        "Nenhuma propriedade sob expressao na selecao.",
        null
      );
    }
    return null;
  }

  /** @param {Record<string, unknown>} args */
  function runBake(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    // A selecao e copiada antes: escrever keyframes pode mexer na selecao viva.
    var selecionadas = [];
    var vivas = comp.selectedLayers;
    var i;
    for (i = 0; i < vivas.length; i += 1) selecionadas.push(vivas[i]);

    var passo = /** @type {number} */ (args.stepFrames);
    var inicio = comp.workAreaStart;
    // O laco anda por indice de quadro. Somar `frameDuration` repetidamente
    // acumula erro de ponto flutuante e sai da grade de quadros num intervalo
    // longo — a ultima amostra cairia entre dois quadros.
    var quadros = Math.floor(comp.workAreaDuration / comp.frameDuration);

    var assadas = 0;
    var restaurar = [];

    try {
      var l;
      for (l = 0; l < selecionadas.length; l += 1) {
        var camada = selecionadas[l];
        var alvos = [propriedade(camada, MN.transform, MN.position), propriedade(camada, MN.transform, MN.scale)];
        var p;
        for (p = 0; p < alvos.length; p += 1) {
          var prop = alvos[p];
          if (!prop || prop.expression === "" || prop.expressionEnabled !== true) continue;

          var amostras = [];
          var k;
          for (k = 0; k <= quadros; k += passo) {
            var t = inicio + k * comp.frameDuration;
            amostras.push({ t: t, v: prop.valueAtTime(t, false) });
          }

          restaurar.push({ prop: prop, expression: prop.expression, expressionEnabled: prop.expressionEnabled });
          for (k = 0; k < amostras.length; k += 1) {
            var amostra = /** @type {{t: number, v: unknown}} */ (amostras[k]);
            prop.setValueAtTime(amostra.t, amostra.v);
          }
          prop.expression = "";
          assadas += 1;
        }
      }
    } catch (e) {
      var r;
      for (r = restaurar.length - 1; r >= 0; r -= 1) {
        var item2 = /** @type {{prop: Property, expression: string, expressionEnabled: boolean}} */ (restaurar[r]);
        item2.prop.expression = item2.expression;
        item2.prop.expressionEnabled = item2.expressionEnabled;
      }
      throw e;
    }

    return { changed: true, warnings: [], data: { bakedProperties: assadas } };
  }

  MotionRegistry.register("ae.parallax.auto-focus", { preflight: preflightAutoFocus, run: runAutoFocus });
  MotionRegistry.register("ae.parallax.wiggle", { preflight: preflightWiggle, run: runWiggle });
  MotionRegistry.register("ae.parallax.zoom", { preflight: preflightZoom, run: runZoom });
  MotionRegistry.register("ae.parallax.bake", { preflight: preflightBake, run: runBake });
})();
