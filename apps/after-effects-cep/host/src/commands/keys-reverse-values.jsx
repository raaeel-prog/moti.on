/**
 * Inverte a ORDEM DOS VALORES dos keyframes selecionados, mantendo os tempos
 * originais intactos (CROSSHOST_STUDIO_MASTER_IMPLEMENTATION_SPEC_v2.md §15.2.3).
 *
 * ## Por que isto e diferente de `ae.keys.reverse`
 *
 * `ae.keys.reverse` (registrado em keys-reverse.jsx) espelha os keyframes no
 * tempo: `novoTempo = 2*pivo - tempo(k)`, com o pivo no ponto medio da selecao.
 * O valor fica ligado ao MESMO keyframe, que apenas muda de lugar na timeline.
 * Isso e Mirror (§15.2.2) — o nome do comando no host e mais antigo que a
 * distincao que o addendum trouxe, e permanece como esta porque o id e um
 * contrato estavel.
 *
 * Este comando faz o oposto: os TEMPOS ficam onde estao, e o que troca de
 * lugar sao os VALORES. `[v0,v1,v2,v3]` nos tempos `[t0,t1,t2,t3]` vira
 * `[v3,v2,v1,v0]` nos MESMOS `[t0,t1,t2,t3]`. O ritmo da animacao — o
 * espacamento entre keyframes — nao muda; so o que acontece em cada instante
 * muda.
 *
 * ## O algoritmo — "tocar a animacao de tras para frente sem mover os tempos"
 *
 * A pergunta que decide a formula: qual movimento este comando deve produzir?
 * A resposta certa e "o mesmo movimento tocado ao contrario", amostrado nos
 * mesmos instantes. Para uma curva `P(t)` entre o primeiro e o ultimo
 * keyframe selecionados, a versao tocada ao contrario e `P'(t) = P(t0+t1-t)`.
 * Isso tem duas consequencias que a formula abaixo captura:
 *
 * 1. no tempo do keyframe `i` (contado da esquerda), o valor de `P'` e o
 *    valor que `P` tinha no keyframe espelhado `n-1-i` — dai emparelhar `i`
 *    com `n-1-i` e transplantar o VALOR do parceiro;
 * 2. a forma da curva ao redor desse ponto tambem inverte: o lado de entrada
 *    vira saida e vice-versa. Por isso o keyframe novo herda o ease do
 *    PARCEIRO com entrada e saida trocadas — nao o proprio ease do keyframe
 *    que ali estava. O mesmo raciocinio vale para os tangentes espaciais, que
 *    trocam de sinal ao inverter a direcao do percurso.
 *
 * Manter o pacote inteiro (valor, ease, tangentes, roving, label) vindo do
 * parceiro — e nao misturar valor de um com ease de outro — e o que faz o
 * resultado ser matematicamente "a mesma curva, tocada ao contrario", em vez
 * de uma aproximacao visual.
 *
 * No keyframe central de uma selecao com quantidade impar, o parceiro e o
 * proprio keyframe: o valor fica igual (n-1-i == i), mas o ease ainda troca
 * de lado — o que e o comportamento correto, porque a curva inverte direcao
 * ali tambem.
 */
(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  /** @returns {MotionCommandFailure|null} */
  function preflight() {
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    return null;
  }

  /** @param {unknown} v @returns {unknown} */
  function flipSpatial(v) {
    if (!v) return v;
    if (typeof v === "number") return -v;
    if (v instanceof Array) {
      var res = [];
      var k;
      for (k = 0; k < v.length; k += 1) res.push(-v[k]);
      return res;
    }
    return v;
  }

  function run() {
    var comp = /** @type {CompItem} */ (app.project.activeItem);

    var props = comp.selectedProperties;
    var toProcess = [];
    var i, j;

    for (i = 0; i < props.length; i += 1) {
      var propRaw = props[i];
      if (!propRaw || !("canVaryOverTime" in propRaw)) continue;
      var prop = /** @type {Property} */ (propRaw);
      if (prop.propertyType === PropertyType.PROPERTY && prop.canVaryOverTime && prop.numKeys > 1) {
        var sel = prop.selectedKeys;
        // Uma so key selecionada nao tem o que inverter: nao ha segundo valor
        // para trocar de lugar, e a UI desabilita o botao pelo mesmo motivo.
        if (sel && sel.length > 1) {
          toProcess.push({ property: prop, sel: sel });
        }
      }
    }

    if (toProcess.length === 0) {
      return { changed: false, warnings: [], data: {} };
    }

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    /** @type {MotionPropertySnapshot[]} */
    var intactos = [];

    try {
      for (i = 0; i < toProcess.length; i += 1) {
        var processItem = toProcess[i];
        if (!processItem) continue;
        var propObj = /** @type {Property} */ (processItem.property);
        var selArr = /** @type {number[]} */ (processItem.sel);

        // Duas capturas: uma para reescrever e outra guardada intacta, que e
        // para onde o rollback volta.
        intactos.push(MotionKeyframes.captureProperty(propObj));
        var snapshot = MotionKeyframes.captureProperty(propObj);
        var keys = snapshot.keys;

        var selectedIndices = [];
        var selectedKeys = [];
        for (j = 0; j < selArr.length; j += 1) {
          var selVal = selArr[j];
          if (typeof selVal !== "number") continue;
          var index = selVal - 1; // zero-based
          selectedIndices.push(index);
          selectedKeys.push(/** @type {MotionCapturedKey} */ (keys[index]));
        }

        var n = selectedKeys.length;
        var reversedKeys = [];
        for (j = 0; j < n; j += 1) {
          var own = /** @type {MotionCapturedKey} */ (selectedKeys[j]);
          var partner = /** @type {MotionCapturedKey} */ (selectedKeys[n - 1 - j]);

          var built = /** @type {MotionCapturedKey} */ ({
            // O tempo e o unico campo que NAO vem do parceiro: e o que
            // distingue esta operacao de ae.keys.reverse (Mirror).
            time: own.time,
            value: partner.value,
            inInterpolation: partner.outInterpolation,
            outInterpolation: partner.inInterpolation,
            inEase: partner.outEase,
            outEase: partner.inEase,
            temporalContinuous: partner.temporalContinuous,
            temporalAutoBezier: partner.temporalAutoBezier,
            roving: partner.roving,
            selected: true,
            spatial: partner.spatial
              ? {
                  inTangent: flipSpatial(partner.spatial.outTangent),
                  outTangent: flipSpatial(partner.spatial.inTangent),
                  continuous: partner.spatial.continuous,
                  autoBezier: partner.spatial.autoBezier
                }
              : null,
            label: partner.label
          });
          reversedKeys.push(built);
        }

        // Os tempos de `reversedKeys` ja saem na mesma ordem crescente da
        // selecao original (cada `built.time` e o `own.time` do proprio
        // indice `j`), entao a escrita de volta e posicional direta — sem
        // precisar reordenar como o Mirror precisa.
        for (j = 0; j < selectedIndices.length; j += 1) {
          var selIndex = selectedIndices[j];
          if (typeof selIndex !== "number") continue;
          var rKey = reversedKeys[j];
          if (rKey) keys[selIndex] = rKey;
        }

        MotionKeyframes.restoreProperty(snapshot, null);
      }
    } catch (e) {
      var rollbackFailed = false;
      // Restaura na ordem inversa: a ultima propriedade tocada e a que pode
      // estar meio-escrita.
      for (i = intactos.length - 1; i >= 0; i -= 1) {
        try {
          var intacto = intactos[i];
          if (intacto) MotionKeyframes.restoreProperty(intacto, null);
        } catch (restoreError) {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (
          new Error("ReverseValues falhou e o estado anterior nao pode ser restaurado.")
        );
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      var applyError = /** @type {Error & {motionCode?: string}} */ (new Error("ReverseValues falhou."));
      applyError.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw applyError;
    }

    return { changed: true, warnings: [], data: {} };
  }

  MotionRegistry.register("ae.keys.reverse-values", { preflight: preflight, run: run });
})();
