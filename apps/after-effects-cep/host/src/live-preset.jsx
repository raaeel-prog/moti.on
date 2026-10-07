/**
 * Cola entre um comando de expressao e os Live Controls.
 *
 * Sete ferramentas de expressao — Wiggle, Flicker, Smooth, LoopOut, Inertial,
 * Jump e Beat — precisam da mesma sequencia: descobrir a camada dona de cada
 * propriedade selecionada, criar os controles uma vez por camada, e devolver as
 * referencias prontas para a expressao. Escrever isso sete vezes garantiria sete
 * variacoes sutis da mesma coisa.
 *
 * ## Por que as referencias, e nao os nomes
 *
 * `MotionLiveControls` compoe o nome do efeito a partir do rotulo resolvido pelo
 * locale, entao o mesmo controle nasce "Frequência" em portugues e "Frequency"
 * em ingles. Uma expressao que cravasse o nome quebraria fora do idioma em que
 * foi escrita. `expressionReference` devolve a referencia com o nome que o efeito
 * REALMENTE recebeu, ja com os clamps de min/max — e e isso que sai daqui.
 *
 * ## Undo
 *
 * Este modulo nao abre grupo de Undo: o dispatcher continua sendo o unico dono
 * da transacao. O que ele oferece e `desfazer()`, para o comando remover os
 * controles que criou quando a escrita da expressao falha depois.
 */
(function (global) {
  var MN_PARADE = "ADBE Effect Parade";

  /**
   * Sobe a cadeia de `parentProperty` ate a camada dona da propriedade.
   *
   * @param {unknown} property
   * @returns {Layer|null}
   */
  function camadaDe(property) {
    var atual = /** @type {any} */ (property);
    var guarda = 0;
    while (atual && atual.parentProperty && guarda < 64) {
      atual = atual.parentProperty;
      guarda += 1;
    }
    return atual && typeof atual.property === "function" ? /** @type {Layer} */ (atual) : null;
  }

  /**
   * O contexto do envelope traz `pt_BR`; os rotulos dos bindings sao indexados
   * por `pt-BR`. Sem esta troca o rotulo cai sempre no fallback en-US, e o
   * usuario brasileiro ve os controles em ingles.
   *
   * @param {unknown} locale
   * @returns {string}
   */
  function normalizarLocale(locale) {
    if (typeof locale !== "string" || locale === "") return "en-US";
    return locale.replace("_", "-");
  }

  /**
   * Agrupa propriedades pela camada dona, preservando a ordem de aparicao.
   *
   * Duas propriedades da mesma camada — Position e Rotation, por exemplo —
   * precisam compartilhar UM conjunto de controles, e nao ganhar um conjunto
   * cada. E por isso que o agrupamento acontece antes de qualquer escrita.
   *
   * @param {unknown[]} propriedades
   * @returns {{layer: Layer, indices: number[]}[]}
   */
  function agruparPorCamada(propriedades) {
    var grupos = /** @type {{layer: Layer, indices: number[]}[]} */ ([]);
    var i;
    var j;
    for (i = 0; i < propriedades.length; i += 1) {
      var camada = camadaDe(propriedades[i]);
      if (!camada) return [];
      var achado = /** @type {{layer: Layer, indices: number[]}|null} */ (null);
      for (j = 0; j < grupos.length; j += 1) {
        var candidato = grupos[j];
        if (candidato && candidato.layer === camada) {
          achado = candidato;
          break;
        }
      }
      if (!achado) {
        achado = { layer: camada, indices: [] };
        grupos.push(achado);
      }
      achado.indices.push(i);
    }
    return grupos;
  }

  /**
   * Remove os efeitos criados, do maior indice para o menor.
   *
   * A ordem importa: remover um efeito renumera os seguintes, entao apagar de
   * baixo para cima faria os indices guardados apontarem para o efeito errado.
   *
   * @param {Layer} camada
   * @param {MotionLiveControlRecord[]} records
   * @returns {boolean} true quando tudo saiu
   */
  function removerControles(camada, records) {
    var parade = /** @type {any} */ (camada).property(MN_PARADE);
    if (!parade) return false;

    var indices = /** @type {number[]} */ ([]);
    var i;
    for (i = 0; i < records.length; i += 1) {
      var registro = records[i];
      if (registro && typeof registro.index === "number") {
        var found = false;
        for (var j = 0; j < indices.length; j += 1) if (indices[j] === registro.index) found = true;
        if (!found) indices.push(registro.index);
      }
    }
    indices.sort(function (a, b) {
      return b - a;
    });

    var completo = true;
    for (i = 0; i < indices.length; i += 1) {
      var indice = indices[i];
      if (typeof indice !== "number") {
        completo = false;
        continue;
      }
      try {
        var efeito = parade.property(indice);
        if (efeito && typeof efeito.remove === "function") efeito.remove();
        else completo = false;
      } catch (erroDeRemocao) {
        completo = false;
      }
    }
    return completo;
  }

  /**
   * Cria os Live Controls de um preset nas camadas das propriedades dadas.
   *
   * @param {unknown[]} propriedades propriedades selecionadas, na ordem
   * @param {{
   *   tool: string,
   *   rigId: string,
   *   locale: unknown,
   *   bindings: MotionLiveControlBindingHost[],
   *   values: Record<string, unknown>
   * }} config
   * @returns {{
   *   refsPorPropriedade: Record<string, string>[],
   *   avisos: {code: string, message: string, details: unknown}[],
   *   desfazer: function(): boolean
   * }}
   */
  function aplicar(propriedades, config) {
    var grupos = agruparPorCamada(propriedades);
    if (grupos.length === 0) {
      throw new Error("Nao foi possivel identificar a camada de uma propriedade selecionada.");
    }

    var locale = normalizarLocale(config.locale);
    /** @type {Record<string, string>[]} */
    var refsPorPropriedade = [];
    /** @type {{code: string, message: string, details: unknown}[]} */
    var avisos = [];
    /** @type {{layer: Layer, records: MotionLiveControlRecord[]}[]} */
    var criados = [];
    var i;
    var j;

    function desfazer() {
      var completo = true;
      for (var k = criados.length - 1; k >= 0; k -= 1) {
        var criado = criados[k];
        if (!criado) continue;
        if (!removerControles(criado.layer, criado.records)) completo = false;
      }
      criados = [];
      return completo;
    }

    try {
      for (i = 0; i < grupos.length; i += 1) {
        var grupo = grupos[i];
        if (!grupo) continue;
        var resultado = MotionLiveControls.create(grupo.layer, {
          grouped: true,
          bindings: config.bindings,
          values: config.values,
          rigId: config.rigId,
          tool: config.tool,
          locale: locale,
          targetKind: "layer"
        });
        criados.push({ layer: grupo.layer, records: resultado.records });

        // O aviso do Live Controls nao carrega `details`, e o envelope de
        // resposta exige o campo. Normalizar aqui poupa as sete ferramentas
        // de repetir a mesma conversao.
        for (j = 0; j < resultado.warnings.length; j += 1) {
          var bruto = resultado.warnings[j];
          if (!bruto) continue;
          avisos.push({
            code: bruto.code,
            message: bruto.message,
            details: typeof bruto.details === "undefined" ? null : bruto.details
          });
        }

        /** @type {Record<string, string>} */
        var refs = {};
        for (j = 0; j < resultado.records.length; j += 1) {
          var record = resultado.records[j];
          if (!record) continue;
          refs[record.paramId] = MotionLiveControls.expressionReference(record);
        }
        // Toda propriedade da mesma camada aponta para o mesmo conjunto.
        for (j = 0; j < grupo.indices.length; j += 1) {
          var alvo = grupo.indices[j];
          if (typeof alvo === "number") refsPorPropriedade[alvo] = refs;
        }
      }
    } catch (erroDeCriacao) {
      desfazer();
      throw erroDeCriacao;
    }

    return { refsPorPropriedade: refsPorPropriedade, avisos: avisos, desfazer: desfazer };
  }

  global.MotionLivePreset = {
    camadaDe: camadaDe,
    normalizarLocale: normalizarLocale,
    agruparPorCamada: agruparPorCamada,
    aplicar: aplicar
  };
}($.global));
