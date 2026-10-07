/**
 * `ae.audio.beat` — sincroniza a propriedade selecionada com a batida da musica.
 *
 * ## Como ele acha a batida
 *
 * O After Effects ja sabe extrair amplitude: Keyframe Assistant > Convert Audio
 * to Keyframes gera uma camada com sliders keyframados quadro a quadro. Este
 * comando **le** essa camada e liga a propriedade nela.
 *
 * Quando necessário, o assistente nativo é resolvido pelo menu localizado,
 * conforme a exceção aprovada no MD. Só sliders animados de 1 ou 3 canais
 * qualificam como fonte; múltiplas fontes exigem seleção explícita.
 * Os nomes observados são usados nas expressões, sem fallback para outro
 * índice de camada. Controles existentes são atualizados com rollback.
 */
(function () {
  var MN_PARADE = "ADBE Effect Parade";
  var MN_SLIDER = "ADBE Slider Control";

  var ALLOWED = {
    beatMin: true,
    beatMax: true,
    mode: true,
    bumpMin: true,
    bumpMax: true,
    shakeFreq: true,
    shakeAmp: true,
    restValue: true,
    peakOffset: true,
    intensity: true,
    scale: true
  };

  /** Os sete controles que o Beat expoe no Effect Controls (modelo de precisao Brazu). */
  var LIVE_BINDINGS = /** @type {MotionLiveControlBindingHost[]} */ ([
    {
      paramId: "beatMin",
      label: { "pt-BR": "Beat Min", "en-US": "Beat Min" },
      help: {
        "pt-BR": "Sensibilidade minima da batida (limiar de corte de silencio/base).",
        "en-US": "Minimum beat threshold (noise/baseline floor cutoff)."
      },
      control: "slider",
      target: "layer",
      order: 1,
      min: 0,
      max: 500
    },
    {
      paramId: "beatMax",
      label: { "pt-BR": "Beat Max", "en-US": "Beat Max" },
      help: {
        "pt-BR": "Sensibilidade maxima da batida (teto onde atinge o pico).",
        "en-US": "Maximum beat threshold (ceiling where peak is reached)."
      },
      control: "slider",
      target: "layer",
      order: 2,
      min: 0.1,
      max: 500
    },
    {
      paramId: "mode",
      label: { "pt-BR": "Modo", "en-US": "Mode" },
      help: {
        "pt-BR": "Modo de animacao: Bump (pulsar) ou Shake (tremer).",
        "en-US": "Animation mode: Bump or Shake."
      },
      control: "dropdown",
      target: "layer",
      order: 3,
      options: [
        { value: 1, label: { "pt-BR": "Bump", "en-US": "Bump" } },
        { value: 2, label: { "pt-BR": "Shake", "en-US": "Shake" } }
      ]
    },
    {
      paramId: "bumpMin",
      label: { "pt-BR": "Bump Min", "en-US": "Bump Min" },
      help: {
        "pt-BR": "Multiplicador minimo no repouso (quando nao ha batida).",
        "en-US": "Minimum multiplier at rest (no beat)."
      },
      control: "slider",
      target: "layer",
      order: 4,
      unit: "%",
      min: -1000,
      max: 1000
    },
    {
      paramId: "bumpMax",
      label: { "pt-BR": "Bump Max", "en-US": "Bump Max" },
      help: {
        "pt-BR": "Multiplicador maximo no pico da batida.",
        "en-US": "Maximum multiplier at peak beat."
      },
      control: "slider",
      target: "layer",
      order: 5,
      unit: "%",
      min: -1000,
      max: 1000
    },
    {
      paramId: "shakeFreq",
      label: { "pt-BR": "Shake Freq", "en-US": "Shake Freq" },
      help: {
        "pt-BR": "Frequencia de oscilacao do Shake na batida.",
        "en-US": "Shake oscillation frequency on beat."
      },
      control: "slider",
      target: "layer",
      order: 6,
      unit: "fps",
      min: 0,
      max: 100
    },
    {
      paramId: "shakeAmp",
      label: { "pt-BR": "Shake Amp", "en-US": "Shake Amp" },
      help: {
        "pt-BR": "Amplitude maxima do Shake no pico da batida.",
        "en-US": "Maximum Shake amplitude at peak beat."
      },
      control: "slider",
      target: "layer",
      order: 7,
      min: 0,
      max: 10000
    }
  ]);

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} valor @param {number} minimo @param {number} maximo @returns {boolean} */
  function numeroEntre(valor, minimo, maximo) {
    return (
      typeof valor === "number" && isFinite(valor) && valor >= minimo && valor <= maximo
    );
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validarArgumentos(args) {
    if (!args) return null;
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(ALLOWED, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Beat desconhecido.", {
          field: key
        });
      }
    }
    if (typeof args.beatMin !== "undefined" && !numeroEntre(args.beatMin, 0, 500)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Beat Min invalido.", {
        field: "beatMin"
      });
    }
    if (typeof args.beatMax !== "undefined" && !numeroEntre(args.beatMax, 0.001, 500)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Beat Max invalido.", {
        field: "beatMax"
      });
    }
    if (typeof args.mode !== "undefined" && args.mode !== 1 && args.mode !== 2) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo invalido (1 Bump, 2 Shake).", {
        field: "mode"
      });
    }
    if (typeof args.bumpMin !== "undefined" && !numeroEntre(args.bumpMin, -1000, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Bump Min invalido.", {
        field: "bumpMin"
      });
    }
    if (typeof args.bumpMax !== "undefined" && !numeroEntre(args.bumpMax, -1000, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Bump Max invalido.", {
        field: "bumpMax"
      });
    }
    if (typeof args.shakeFreq !== "undefined" && !numeroEntre(args.shakeFreq, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Shake Freq invalido.", {
        field: "shakeFreq"
      });
    }
    if (typeof args.shakeAmp !== "undefined" && !numeroEntre(args.shakeAmp, 0, 10000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Shake Amp invalido.", {
        field: "shakeAmp"
      });
    }
    return null;
  }

  /**
   * Calcula os limiares de batida diretamente a partir dos keyframes da camada de amplitude:
   * - beatMin: media de amplitude da musica (piso de corte de ruido/base)
   * - beatMax: pico maximo da musica (teto de 100% de intensidade)
   *
   * @param {{layer: Layer, canal: string, canalIndex?: number}} amplitude
   * @returns {{beatMin: number, beatMax: number}}
   */
  function calcularLimiaresAudio(amplitude) {
    try {
      var camada = amplitude.layer;
      if (!camada || typeof camada.property !== "function") {
        return { beatMin: 30, beatMax: 90 };
      }
      var parade = camada.property(MN_PARADE);
      if (!parade) return { beatMin: 30, beatMax: 90 };
      var efeito = amplitude.canalIndex
        ? parade.property(amplitude.canalIndex)
        : parade.property(amplitude.canal);
      if (!efeito && typeof amplitude.canal === "string") {
        efeito = parade.property(amplitude.canal);
      }
      if (!efeito || typeof efeito.property !== "function") {
        return { beatMin: 30, beatMax: 90 };
      }
      var slider = efeito.property(1);
      if (!slider || typeof slider.numKeys !== "number" || slider.numKeys === 0) {
        return { beatMin: 30, beatMax: 90 };
      }

      var numKeys = slider.numKeys;
      var soma = 0;
      var maximo = 0;
      for (var k = 1; k <= numKeys; k += 1) {
        var v = /** @type {number} */ (slider.keyValue(k));
        if (typeof v === "number" && isFinite(v)) {
          soma += v;
          if (v > maximo) maximo = v;
        }
      }
      var media = soma / numKeys;
      var beatMin = Math.round(media * 100) / 100;
      var beatMax = Math.round(maximo * 100) / 100;
      if (beatMax <= beatMin) beatMax = beatMin + 20;
      return {
        beatMin: beatMin,
        beatMax: beatMax
      };
    } catch (limiaresErro) {
      return { beatMin: 30, beatMax: 90 };
    }
  }

  /** Stage existing groups so a failed expression never deletes user controls.
   * Legacy controls remain untouched; only exact shipped effect types are reused.
   * @param {Property[]} targets @param {any} config @returns {any} */
  function stageControls(targets, config) {
    var groups=MotionLivePreset.agruparPorCamada(targets), stages=/** @type {any[]} */ ([]), refsByProperty=/** @type {any[]} */ ([]);
    function rollback(){var ok=true;for(var n=stages.length-1;n>=0;n--){try{stages[n].rollback();}catch(e){ok=false;}}return ok;}
    try {
      for(var i=0;i<groups.length;i++){
        var group=groups[i];if(!group)continue;var staged=MotionGroupedControls.stage(group.layer,config,{}),refs=/** @type {any} */ ({});stages.push(staged);
        for(var j=0;j<staged.records.length;j++){var record=staged.records[j];if(!record)continue;refs[record.paramId]=MotionLiveControls.expressionReference(record);}
        for(j=0;j<group.indices.length;j++){var index=group.indices[j];if(typeof index==="number")refsByProperty[index]=refs;}
      }
    } catch(e){if(!rollback())throw erroDeHost(MotionContracts.ERROR.ROLLBACK_FAILED,"Falha ao restaurar controles do Beat.");throw e;}
    return {refsPorPropriedade:refsByProperty,avisos:[],desfazer:rollback};
  }

  /**
   * Determina valores padrao inteligentes com base nas propriedades selecionadas:
   * - Opacidade: repouso 0% e pico 110% (piscar no beat)
   * - Escala: repouso 100% e pico 120% (pulsar no beat)
   * - Posicao/outras: repouso 100% e pico 110%
   *
   * @param {Property[]} alvos
   * @returns {{bumpMin: number, bumpMax: number}}
   */
  function determinarValoresPadrao(alvos) {
    if (!alvos || alvos.length === 0) return { bumpMin: 0, bumpMax: 110 };
    var temOpacidade = false;
    var temEscala = false;
    for (var i = 0; i < alvos.length; i += 1) {
      var alvo = alvos[i];
      if (!alvo) continue;
      var nome = typeof alvo.name === "string" ? alvo.name.toLowerCase() : "";
      var match = typeof alvo.matchName === "string" ? alvo.matchName : "";
      if (nome.indexOf("opacidade") >= 0 || nome.indexOf("opacity") >= 0 || match === "ADBE Opacity") {
        temOpacidade = true;
      }
      if (nome.indexOf("escala") >= 0 || nome.indexOf("scale") >= 0 || match === "ADBE Scale") {
        temEscala = true;
      }
    }
    if (temOpacidade) return { bumpMin: 0, bumpMax: 110 };
    if (temEscala) return { bumpMin: 100, bumpMax: 120 };
    return { bumpMin: 100, bumpMax: 110 };
  }

  /** Only keyed scalar channels can be amplitude candidates. A selected source
   * resolves ambiguity; multiple unselected sources are never guessed.
   * @param {CompItem} comp @returns {any} */
  function acharAmplitude(comp) {
    var candidates=[],selected=[],targets=alvosDe(comp),i,j;
    for(i=1;i<=comp.numLayers;i++){
      var layer=/** @type {any} */ (comp.layer(i)),isTarget=false;
      for(j=0;j<targets.length;j++)if(MotionLivePreset.camadaDe(targets[j])===layer)isTarget=true;
      if(!layer||isTarget||typeof layer.property!=="function")continue;
      var parade=layer.property(MN_PARADE);
      if(!parade||(parade.numProperties!==1&&parade.numProperties!==3))continue;
      var valid=true,names=[];
      for(j=1;j<=parade.numProperties;j++){
        var effect=parade.property(j),param=effect&&effect.property(1);
        if(!effect||effect.matchName!==MN_SLIDER||!param||!(param.numKeys>0)||param.expression||typeof param.keyValue(1)!=="number"||!isFinite(param.keyValue(1))||param.keyValue(1)<0){valid=false;break;}
        names.push(effect.name);
      }
      if(!valid)continue;
      var channel=names.length===3?3:1;
      var candidate={layer:layer,canal:names[channel-1],canalIndex:channel};
      candidates.push(candidate);if(layer.selected)selected.push(candidate);
    }
    var result=selected.length===1?selected[0]:candidates.length===1?candidates[0]:null;
    if(!result)return candidates.length>1?{ambiguous:true}:null;
    // Expression references use the observed name. Duplicate layer names cannot
    // identify this source safely even when the correct layer was selected.
    for(i=1;i<=comp.numLayers;i++)if(comp.layer(i)!==result.layer&&comp.layer(i).name===result.layer.name)return {ambiguous:true};
    return result;
  }

  /**
   * Nomes do item de menu, na ordem em que sao tentados.
   *
   * `findMenuCommandId` casa pelo texto TRADUZIDO do menu, entao a lista precisa
   * cobrir os idiomas que o produto atende. Nenhum id numerico entra aqui: os
   * ids mudam entre versoes do After Effects, e um id que mudou nao falha —
   * executa outro comando de menu qualquer. Ver `menu-command.jsx`.
   *
   * Portugues primeiro porque e o idioma do usuario do produto; num After
   * Effects em ingles o primeiro nome simplesmente devolve zero e o segundo
   * resolve.
   */
  var MENU_CONVERTER_AUDIO = [
    "Converter Áudio em Quadros-chave",
    "Converter áudio em quadros-chave",
    "Convert Audio to Keyframes"
  ];

  /**
   * Camadas de audio da composicao, na ordem da timeline.
   *
   * `hasAudio` e a pergunta certa: ela e verdadeira para qualquer camada cuja
   * fonte tenha trilha sonora, inclusive um video com audio, e falsa para
   * solidos, nulos e a propria camada de amplitude.
   *
   * @param {CompItem} comp
   * @returns {{todas: Layer[], selecionadas: Layer[]}}
   */
  function camadasDeAudio(comp) {
    var todas = [];
    var selecionadas = [];
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = /** @type {any} */ (comp.layer(i));
      if (!camada || camada.hasAudio !== true) continue;
      todas.push(/** @type {Layer} */ (camada));
      if (camada.selected === true) selecionadas.push(/** @type {Layer} */ (camada));
    }
    return { todas: todas, selecionadas: selecionadas };
  }

  /**
   * Qual camada de audio converter.
   *
   * Tres casos, e o terceiro e uma recusa de proposito:
   *
   * 1. **Audio selecionado** — o usuario ja disse qual.
   * 2. **Exatamente um na comp** — nao ha ambiguidade a resolver.
   * 3. **Varios, nenhum selecionado** — recusa. Escolher sozinho aqui seria
   *    adivinhar qual musica e a certa, e a resposta errada custa uma camada
   *    nova na composicao e uma animacao ligada no som errado.
   *
   * @param {CompItem} comp
   * @returns {{camada: Layer|null, erro: MotionCommandFailure|null}}
   */
  function escolherAudio(comp) {
    var audio = camadasDeAudio(comp);

    if (audio.selecionadas.length === 1) {
      return { camada: audio.selecionadas[0] || null, erro: null };
    }
    if (audio.selecionadas.length > 1) {
      return {
        camada: null,
        erro: failure(
          MotionContracts.ERROR.NO_SELECTION,
          "Ha " + audio.selecionadas.length + " camadas de audio selecionadas." +
            " Deixe apenas uma selecionada para sincronizar com ela.",
          { audioLayers: audio.selecionadas.length }
        )
      };
    }
    if (audio.todas.length === 1) {
      return { camada: audio.todas[0] || null, erro: null };
    }
    if (audio.todas.length > 1) {
      return {
        camada: null,
        erro: failure(
          MotionContracts.ERROR.NO_SELECTION,
          "A composicao tem " + audio.todas.length + " camadas de audio." +
            " Selecione a que deve marcar a batida.",
          { audioLayers: audio.todas.length }
        )
      };
    }
    return {
      camada: null,
      erro: failure(
        MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
        "Nenhuma camada de audio na composicao. Traga a musica para a timeline" +
          " antes de sincronizar com a batida.",
        { audioLayers: 0 }
      )
    };
  }

  /**
   * Propriedades selecionadas que aceitam expressao.
   *
   * @param {CompItem} comp
   * @returns {Property[]}
   */
  function alvosDe(comp) {
    var selecionadas = comp.selectedProperties || [];
    var alvos = [];
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var propriedade = /** @type {any} */ (selecionadas[i]);
      if (!propriedade) continue;
      if (propriedade.propertyType !== PropertyType.PROPERTY) continue;
      if (propriedade.canSetExpression !== true) continue;
      alvos.push(/** @type {Property} */ (propriedade));
    }
    return alvos;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var erroDeArgumento = validarArgumentos(args);
    if (erroDeArgumento) return erroDeArgumento;

    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    if (alvosDe(/** @type {CompItem} */ (comp)).length === 0) {
      return failure(
        MotionContracts.ERROR.NO_SELECTION,
        "Selecione uma propriedade que aceite expressao."
      );
    }
    var targets=alvosDe(/** @type {CompItem} */ (comp));
    for(var ti=0;ti<targets.length;ti++){
      var target=targets[ti];if(!target)continue;
      var expression=target.expression,owner=/** @type {any} */ (MotionLivePreset.camadaDe(targets[ti]));
      if(owner&&owner.locked)return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Desbloqueie as camadas alvo do Beat.");
      if(expression&&!MotionExpressions.isManagedBeat(expression)&&!MotionExpressions.isManagedBeatAmplitude(expression))return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT,"Uma expressão existente foi preservada.");
    }
    var source=acharAmplitude(/** @type {CompItem} */ (comp));
    if(source&&source.ambiguous)return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Selecione uma única camada de amplitude junto ao alvo e use um nome de camada exclusivo.");
    // A camada de amplitude deixou de ser pre-requisito: quando ela nao existe,
    // o comando a PRODUZ, rodando o assistente nativo. O que o preflight checa
    // agora e se ha como produzi-la — camada de audio e comando de menu
    // resolvivel —, para recusar antes de tocar no projeto e nao no meio.
    if (!source) {
      var escolha = escolherAudio(/** @type {CompItem} */ (comp));
      if (escolha.erro) return escolha.erro;

      if (!MotionMenuCommand.resolver(MENU_CONVERTER_AUDIO)) {
        // Nenhum dos nomes resolveu: este After Effects esta num idioma que a
        // lista nao cobre. Recusar aqui e o que a secao 872 chama de "bloquear
        // antes de alterar o projeto" — e a frase ensina o caminho manual, que
        // continua a dois cliques de distancia.
        return failure(
          MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
          "Nao foi possivel acionar o assistente neste idioma do After Effects." +
            " Selecione a camada de audio e use Keyframe Assistant >" +
            " Convert Audio to Keyframes; depois clique em Beat de novo."
        );
      }
    }
    return null;
  }

  /** @param {string} code @param {string} message @returns {Error} */
  function erroDeHost(code, message) {
    var erro = /** @type {Error & {motionCode?: string}} */ (new Error(message));
    erro.motionCode = code;
    return erro;
  }

  /**
   * @param {Record<string, unknown>} args
   * @param {Record<string, unknown>} context
   * @returns {MotionCommandResult}
   */
  function run(args, context) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var alvos = alvosDe(comp);
    var amplitude = acharAmplitude(comp);
    if(amplitude&&amplitude.ambiguous)throw erroDeHost(MotionContracts.ERROR.INVALID_SELECTION_TYPE,"Fonte de amplitude ambígua.");

    // Camada criada por ESTE comando, e nao uma que ja estava la. So a primeira
    // pode ser removida no rollback: apagar a amplitude que o usuario ja tinha
    // seria destruir trabalho dele por causa de uma falha nossa.
    var amplitudeCriadaAqui = null;

    if (!amplitude) {
      var escolha = escolherAudio(comp);
      if (escolha.erro || !escolha.camada) {
        throw erroDeHost(
          escolha.erro ? escolha.erro.code : MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
          escolha.erro ? escolha.erro.message : "Nenhuma camada de audio na composicao."
        );
      }

      var comando = MotionMenuCommand.resolver(MENU_CONVERTER_AUDIO);
      if (!comando) {
        throw erroDeHost(
          MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
          "Nao foi possivel acionar o assistente neste idioma do After Effects."
        );
      }

      MotionMenuCommand.executarComSelecao(comando.id, escolha.camada, comp);

      // Verificacao por OBSERVACAO, e nao por confianca. `executeCommand` nao
      // devolve nada: nao ha como perguntar se funcionou. A unica prova e a
      // mesma deteccao estrutural de antes, rodada de novo — se a camada de
      // amplitude nao apareceu, o comando nao rodou, e dizer o contrario seria
      // reportar sucesso sobre uma composicao inalterada.
      amplitude = acharAmplitude(comp);
      if (!amplitude || amplitude.ambiguous) {
        // Devolve em vez de lancar, e a diferenca importa: `exceptionCode` do
        // dispatcher achata todo `motionCode` lancado — menos ROLLBACK_FAILED —
        // em HOST_OPERATION_FAILED, e descarta a mensagem. O usuario veria um
        // codigo opaco no lugar da frase que ensina o caminho manual.
        //
        // `changed: false` num comando que muta e sem `allowsNoopSuccess` vira
        // `ok: false` no dispatcher, com o aviso preservado ao lado do erro. E o
        // mesmo caminho que `ae.style.neon` usa. Nada nosso foi escrito ainda,
        // entao nao ha o que desfazer.
        return {
          changed: false,
          warnings: [
            {
              code: "BEAT_ASSISTANT_NO_OUTPUT",
              message:
                "O assistente de audio foi acionado mas nao produziu a camada de" +
                " amplitude. Selecione a camada de audio e use Keyframe Assistant >" +
                " Convert Audio to Keyframes; depois clique em Beat de novo.",
              details: { audioLayer: escolha.camada.name }
            }
          ],
          data: { appliedCount: 0, sourceLayer: null, channel: null, createdAmplitudeLayer: false }
        };
      }
      amplitudeCriadaAqui = amplitude.layer;
    }

    var preset = null;
    var tocadas = /** @type {{propriedade: Property, antes: string, habilitada: boolean}[]} */ ([]);
    var aplicadas = 0;
    try {
    var limiares = calcularLimiaresAudio(amplitude);
    var padroes = determinarValoresPadrao(alvos);

    var valorBeatMin = typeof args.beatMin === "number" ? args.beatMin : limiares.beatMin;
    var valorBeatMax = typeof args.beatMax === "number"
      ? args.beatMax
      : (typeof args.scale === "number" ? args.scale : limiares.beatMax);
    var valorMode = typeof args.mode === "number" ? args.mode : 1;
    var valorBumpMin = typeof args.bumpMin === "number"
      ? args.bumpMin
      : (typeof args.restValue === "number" && padroes.bumpMin !== 0 ? args.restValue : padroes.bumpMin);
    var valorBumpMax = typeof args.bumpMax === "number"
      ? args.bumpMax
      : (typeof args.peakOffset === "number" && padroes.bumpMin !== 0
          ? valorBumpMin + args.peakOffset
          : padroes.bumpMax);
    var valorShakeFreq = typeof args.shakeFreq === "number" ? args.shakeFreq : 10;
    var valorShakeAmp = typeof args.shakeAmp === "number" ? args.shakeAmp : 30;

    var i;

    // 1. Checa conflito de expressao ANTES de criar os Live Controls.
    // Expressoes Moti.on Beat anteriores sao atualizadas sem conflito;
    // expressoes de terceiros sao preservadas.
    for (i = 0; i < alvos.length; i += 1) {
      var alvoProp = alvos[i];
      if (!alvoProp) continue;
      var exprAntes = alvoProp.expression;
      if (typeof exprAntes !== "string") {
        throw erroDeHost(
          MotionContracts.ERROR.HOST_OPERATION_FAILED,
          "O host nao devolveu uma expressao valida."
        );
      }
      if (
        exprAntes !== "" &&
        !MotionExpressions.isManagedBeat(exprAntes) &&
        !MotionExpressions.isManagedBeatAmplitude(exprAntes)
      ) {
        throw erroDeHost(
          MotionContracts.ERROR.EXPRESSION_CONFLICT,
          "Uma expressao existente foi preservada."
        );
      }
    }

    preset = stageControls(alvos, {
      targetKind: "layer",
      tool: "Beat",
      rigId: "ae.audio.beat",
      locale: MotionLivePreset.normalizarLocale(context ? context.locale : null),
      bindings: LIVE_BINDINGS,
      values: {
        beatMin: valorBeatMin,
        beatMax: valorBeatMax,
        mode: valorMode,
        bumpMin: valorBumpMin,
        bumpMax: valorBumpMax,
        shakeFreq: valorShakeFreq,
        shakeAmp: valorShakeAmp
      }
    });

      for (i = 0; i < alvos.length; i += 1) {
        var propriedade = alvos[i];
        var refs = preset.refsPorPropriedade[i];
        if (!propriedade || !refs) continue;

        var antes = propriedade.expression;
        var desejada = MotionExpressions.renderBeatAmplitude(
          {
            layerName: /** @type {any} */ (amplitude.layer).name,
            layerIndex: /** @type {any} */ (amplitude.layer).index,
            channelEffect: amplitude.canal,
            channelIndex: amplitude.canalIndex || 3
          },
          /** @type {any} */ (refs)
        );

        tocadas.push({
          propriedade: propriedade,
          antes: antes,
          habilitada: propriedade.expressionEnabled === true
        });
        propriedade.expression = desejada;
        if (typeof propriedade.expressionError === "string" && propriedade.expressionError !== "") {
          throw erroDeHost(
            MotionContracts.ERROR.HOST_OPERATION_FAILED,
            "After Effects recusou a expressao gerenciada: " + propriedade.expressionError
          );
        }
        propriedade.expressionEnabled = true;
        aplicadas += 1;
      }
    } catch (erroDeAplicacao) {
      var rollbackFalhou = false;
      for (i = tocadas.length - 1; i >= 0; i -= 1) {
        try {
          var tocada = tocadas[i];
          if (!tocada) continue;
          tocada.propriedade.expression = tocada.antes;
          tocada.propriedade.expressionEnabled = tocada.habilitada;
        } catch (erroDeRestauro) {
          rollbackFalhou = true;
        }
      }
      if (preset && !preset.desfazer()) rollbackFalhou = true;

      // A camada de amplitude sai junto — mas SO se este comando a criou. Uma
      // amplitude que ja estava na composicao pertence ao usuario, e apaga-la
      // por causa de uma falha nossa seria destruir trabalho dele.
      if (amplitudeCriadaAqui) {
        try {
          amplitudeCriadaAqui.remove();
        } catch (erroDeRemocao) {
          rollbackFalhou = true;
        }
      }

      if (rollbackFalhou) {
        throw erroDeHost(
          MotionContracts.ERROR.ROLLBACK_FAILED,
          "Beat falhou e o estado anterior nao pode ser restaurado."
        );
      }
      throw erroDeAplicacao;
    }

    return {
      changed: aplicadas > 0,
      warnings: preset.avisos,
      data: {
        appliedCount: aplicadas,
        sourceLayer: /** @type {any} */ (amplitude.layer).name,
        channel: amplitude.canal,
        /** O painel usa isto para dizer que criou a camada, em vez de so "pronto". */
        createdAmplitudeLayer: amplitudeCriadaAqui !== null,
        beatMin: valorBeatMin,
        beatMax: valorBeatMax,
        bumpMin: valorBumpMin,
        bumpMax: valorBumpMax
      }
    };
  }

  MotionRegistry.register("ae.audio.beat", { preflight: preflight, run: run });
}());
