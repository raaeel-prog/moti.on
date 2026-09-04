/**
 * Aparencia de neon editavel (`ae.style.neon`, MASTER_BUILD_SPEC secao 13).
 *
 * ## Nucleo, stroke e glow
 *
 * Neon e tres camadas visuais sobre a mesma forma: um nucleo claro, um contorno
 * saturado e um brilho ao redor. Este comando produz as tres sem rasterizar
 * nada:
 *
 *  - **nucleo e stroke** saem do proprio `TextDocument` da camada de texto
 *    (`fillColor`, `strokeColor`, `strokeWidth`). O texto continua editavel, que
 *    e o criterio de aceite da secao 13: trocar o texto atualiza o neon;
 *  - **glow** e o efeito nativo `ADBE Glo2`, adicionado como efeito gerenciado.
 *
 * `strokeOverFill` fica `false` de proposito: no neon o nucleo precisa aparecer
 * por cima do contorno, senao o stroke engole a forma quando a espessura sobe.
 *
 * ## Por que o glow nao escreve em parametro adivinhado
 *
 * `docs/research/after-effects-neon-glow-and-text-stroke.md` registra a medida:
 * a referencia da Adobe documenta o matchName do EFEITO (`ADBE Glo2`) e nao
 * documenta nenhum parametro dele. A convencao `ADBE Glo2-000N` e folclore de
 * comunidade, e a secao 11 desta spec proibe cair para nome de exibicao, que
 * muda com o idioma do aplicativo.
 *
 * Entao o comando **procura** cada parametro varrendo os filhos do efeito e
 * comparando `matchName`, e recusa com `CAPABILITY_UNAVAILABLE` nomeando o que
 * faltou. O modo de falha vira "esta instalacao nao expoe o parametro X", que da
 * para diagnosticar, em vez de "o neon saiu sem brilho e ninguem sabe por que".
 *
 * ## Camada sem texto
 *
 * Shape e footage com alpha nao tem `TextDocument`, entao nao ha onde pintar
 * nucleo e stroke. Essas camadas recebem o glow e um aviso dizendo o que nao foi
 * aplicado. Recusar a operacao inteira puniria uma selecao mista, e aplicar em
 * silencio esconderia que metade do efeito nao aconteceu.
 */
(function () {
  var ALLOWED = {
    mode: true,
    coreColor: true,
    glowColor: true,
    strokeWidth: true,
    glowRadius: true,
    intensity: true
  };

  var MN = {
    glow: "ADBE Glo2",
    // Palpites da convencao de comunidade. Nao ha fonte primaria para nenhum
    // deles — por isso `parametro()` confere antes de escrever.
    glowRadius: "ADBE Glo2-0003",
    glowIntensity: "ADBE Glo2-0004",
    glowColors: "ADBE Glo2-0007",
    colorA: "ADBE Glo2-0012"
  };

  var NOME_GERENCIADO = MotionContracts.RIG_PREFIX + "NEON";

  // A referencia documenta strokeWidth como 0 a 1000; a validacao usa o limite
  // documentado em vez de um teto inventado.
  var STROKE_MAXIMO = 1000;

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
      typeof valor === "number" &&
      isFinite(valor) &&
      valor >= minimo &&
      valor <= maximo
    );
  }

  /** Cor do After Effects: tres canais de 0 a 1. @param {unknown} valor @returns {boolean} */
  function corValida(valor) {
    if (!valor || !(valor instanceof Array) || valor.length !== 3) return false;
    var i;
    for (i = 0; i < 3; i += 1) {
      if (!numeroEntre(valor[i], 0, 1)) return false;
    }
    return true;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validarArgumentos(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(ALLOWED, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Neon desconhecido.", {
          field: key
        });
      }
    }
    for (key in ALLOWED) {
      if (
        Object.prototype.hasOwnProperty.call(ALLOWED, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de Neon ausente.", {
          field: key
        });
      }
    }
    if (args.mode !== "editable" && args.mode !== "glowOnly") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de Neon invalido.", {
        field: "mode"
      });
    }
    if (!corValida(args.coreColor)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "coreColor precisa ser [r,g,b] de 0 a 1.", {
        field: "coreColor"
      });
    }
    if (!corValida(args.glowColor)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "glowColor precisa ser [r,g,b] de 0 a 1.", {
        field: "glowColor"
      });
    }
    if (!numeroEntre(args.strokeWidth, 0, STROKE_MAXIMO)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Espessura de stroke invalida.", {
        field: "strokeWidth"
      });
    }
    if (!numeroEntre(args.glowRadius, 0, 1000)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Raio de glow invalido.", {
        field: "glowRadius"
      });
    }
    if (!numeroEntre(args.intensity, 0, 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Intensidade invalida.", {
        field: "intensity"
      });
    }
    return null;
  }

  /**
   * Parametro de efeito resolvido por varredura, e nunca por escrita cega.
   *
   * @param {PropertyGroup} efeito
   * @param {string} matchName
   * @returns {Property|null}
   */
  function parametro(efeito, matchName) {
    var i;
    for (i = 1; i <= efeito.numProperties; i += 1) {
      var filho = efeito.property(i);
      if (filho && filho.matchName === matchName) return /** @type {Property} */ (filho);
    }
    return null;
  }

  /** @param {unknown} camada @returns {Property|null} */
  function sourceTextDe(camada) {
    var qualquer = /** @type {any} */ (camada);
    if (!qualquer || !qualquer.property) return null;
    var grupo = qualquer.property("ADBE Text Properties");
    if (!grupo) return null;
    var fonte = grupo.property("ADBE Text Document");
    return fonte || null;
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
    var selecionadas = /** @type {CompItem} */ (comp).selectedLayers;
    if (!selecionadas || selecionadas.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada.");
    }

    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var lista = MotionEffects.parade(selecionadas[i]);
      if (!lista) {
        return failure(
          MotionContracts.ERROR.INVALID_SELECTION_TYPE,
          "A selecao contem camada que nao aceita efeito.",
          { selectionIndex: i }
        );
      }
      if (lista.canAddProperty(MN.glow) !== true) {
        return failure(
          MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
          "O efeito Glow nao esta disponivel nesta instalacao.",
          { selectionIndex: i, effect: MN.glow }
        );
      }
      var qualquer = MotionEffects.findAny(lista, MN.glow);
      if (qualquer && qualquer.name !== NOME_GERENCIADO) {
        return failure(
          MotionContracts.ERROR.TRACK_CONFLICT,
          "Ja existe um Glow do usuario nesta camada.",
          { selectionIndex: i }
        );
      }
    }
    return null;
  }

  /**
   * Pinta nucleo e stroke reatribuindo `sourceText`.
   *
   * A referencia nao promete que mutar o TextDocument devolvido propague de
   * volta, e os exemplos dela reatribuem — entao ler, alterar e escrever.
   *
   * @param {Property} fonte
   * @param {Record<string, unknown>} args
   * @returns {void}
   */
  function pintarTexto(fonte, args) {
    var documento = /** @type {TextDocument} */ (fonte.value);
    documento.fillColor = /** @type {[number, number, number]} */ (args.coreColor);
    documento.applyFill = true;
    documento.strokeColor = /** @type {[number, number, number]} */ (args.glowColor);
    documento.strokeWidth = /** @type {number} */ (args.strokeWidth);
    documento.applyStroke = /** @type {number} */ (args.strokeWidth) > 0;
    // No neon o nucleo aparece por cima: com o stroke por cima, engrossar o
    // contorno engoliria a forma.
    documento.strokeOverFill = false;
    fonte.setValue(documento);
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
    var selecionadas = comp.selectedLayers;
    var semTexto = 0;
    var aplicadas = 0;
    var i;

    /** @type {ReturnType<typeof MotionEffects.snapshot>[]} */
    var anteriores = [];
    /** @type {PropertyGroup[]} */
    var criados = [];
    /** @type {{fonte: Property, valor: unknown}[]} */
    var textosTocados = [];

    try {
      for (i = 0; i < selecionadas.length; i += 1) {
        var camada = selecionadas[i];

        if (args.mode === "editable") {
          var fonte = sourceTextDe(camada);
          if (fonte) {
            // Guardado ANTES de escrever: o rollback devolve o documento
            // inteiro, e nao campo a campo.
            textosTocados.push({ fonte: fonte, valor: fonte.value });
            pintarTexto(fonte, args);
          } else {
            semTexto += 1;
          }
        }

        var lista = /** @type {PropertyGroup} */ (MotionEffects.parade(camada));
        var glow = MotionEffects.findManaged(lista, MN.glow, NOME_GERENCIADO);
        if (glow) {
          anteriores.push(
            MotionEffects.snapshot(glow, [MN.glowRadius, MN.glowIntensity, MN.glowColors, MN.colorA])
          );
        } else {
          glow = MotionEffects.add(lista, MN.glow, NOME_GERENCIADO);
          criados.push(glow);
        }

        var raio = parametro(glow, MN.glowRadius);
        var intensidade = parametro(glow, MN.glowIntensity);
        if (!raio || !intensidade) {
          // Nao lancar com codigo proprio: o dispatcher descarta a mensagem da
          // excecao e colapsa todo motionCode que nao seja ROLLBACK_FAILED em
          // HOST_OPERATION_FAILED. O que ele PRESERVA numa falha sao os
          // `warnings` do proprio comando — entao o nome do parametro que
          // faltou viaja por ali, e o rollback normal acontece antes.
          var faltando = raio ? MN.glowIntensity : MN.glowRadius;
          var erroComAviso = /** @type {Error & {neonAviso?: unknown}} */ (
            new Error("Parametro de Glow ausente: " + faltando)
          );
          erroComAviso.neonAviso = {
            code: "NEON_GLOW_PARAM_MISSING",
            message:
              "O Glow desta instalacao nao expoe o parametro " +
              faltando +
              "; ver docs/research/after-effects-neon-glow-and-text-stroke.md.",
            details: { parameter: faltando, effect: MN.glow }
          };
          throw erroComAviso;
        }
        MotionEffects.setStatic(raio, /** @type {number} */ (args.glowRadius));
        MotionEffects.setStatic(intensidade, /** @type {number} */ (args.intensity));

        // Cor do glow e opcional de proposito: sem ela o Glow usa as cores
        // originais da camada, que ja e um neon valido. Recusar a operacao
        // inteira por causa dela seria desproporcional.
        var modoDeCor = parametro(glow, MN.glowColors);
        var corA = parametro(glow, MN.colorA);
        if (modoDeCor && corA) {
          // 2 e "A & B Colors" na ordem do menu; sem ele o Color A e ignorado.
          MotionEffects.setStatic(modoDeCor, 2);
          MotionEffects.setStatic(corA, /** @type {[number, number, number]} */ (args.glowColor));
        }

        aplicadas += 1;
      }
    } catch (erroDeNeon) {
      var rollbackFalhou = false;
      for (i = textosTocados.length - 1; i >= 0; i -= 1) {
        try {
          var texto = textosTocados[i];
          if (texto) texto.fonte.setValue(texto.valor);
        } catch (erroDeTexto) {
          rollbackFalhou = true;
        }
      }
      for (i = anteriores.length - 1; i >= 0; i -= 1) {
        try {
          var anterior = anteriores[i];
          if (anterior) MotionEffects.restore(anterior);
        } catch (erroDeRestauro) {
          rollbackFalhou = true;
        }
      }
      for (i = criados.length - 1; i >= 0; i -= 1) {
        try {
          var criado = criados[i];
          if (criado) criado.remove();
        } catch (erroDeRemocao) {
          rollbackFalhou = true;
        }
      }
      if (rollbackFalhou) {
        throw erroDeHost(
          MotionContracts.ERROR.ROLLBACK_FAILED,
          "Neon falhou e o estado anterior nao pode ser restaurado."
        );
      }
      var aviso = /** @type {{neonAviso?: {code: string, message: string, details: unknown}}} */ (
        erroDeNeon
      ).neonAviso;
      if (aviso) {
        // O projeto voltou ao estado anterior. `changed: false` num comando que
        // muta e sem allowsNoopSuccess vira ok: false no dispatcher, com este
        // aviso preservado ao lado do erro.
        return { changed: false, warnings: [aviso], data: { applied: 0, withoutText: semTexto } };
      }
      throw erroDeNeon;
    }

    var avisos = [];
    if (semTexto > 0) {
      avisos.push({
        code: "NEON_CORE_SKIPPED",
        message:
          "Nucleo e stroke nao foram aplicados em " +
          semTexto +
          " camada(s) sem texto; elas receberam apenas o glow.",
        details: { layers: semTexto }
      });
    }

    return {
      changed: aplicadas > 0,
      warnings: avisos,
      data: { applied: aplicadas, withoutText: semTexto }
    };
  }

  MotionRegistry.register("ae.style.neon", {
    preflight: preflight,
    run: run
  });
}());
