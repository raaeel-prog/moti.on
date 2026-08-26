/**
 * `ae.layer.flip` espelha camadas em torno da ancora, dos limites da selecao ou
 * do centro da composicao.
 *
 * ## A matematica, derivada e nao chutada
 *
 * Espelhar NAO e apenas negar a escala. Sendo `M` a reflexao, `T` a translacao,
 * `R` a rotacao e `S` a escala, o transform da camada e `T(p) . R(t) . S`, e o
 * espelhado e:
 *
 *   M . T(p) . R(t) . S  =  T(M p) . M . R(t) . S
 *                        =  T(M p) . R(-t) . M . S
 *                        =  T(M p) . R(-t) . S'
 *
 * ou seja: a posicao reflete em torno do pivo, a **rotacao troca de sinal**, e a
 * escala do eixo espelhado troca de sinal. Negar so a escala deixaria qualquer
 * camada rotacionada no lugar errado, e o erro cresceria com o angulo — passando
 * despercebido em teste com camada sem rotacao.
 *
 * Como cada termo troca de sinal, aplicar duas vezes devolve o estado inicial
 * exatamente, que e o criterio de aceite da §7.
 *
 * ## Escopo recusado de proposito
 *
 * Camadas **com pai** e camadas **3D** sao recusadas com erro tipado. Para uma
 * camada parenteada a um pai rotacionado, o eixo de espelhamento deixa de ser
 * alinhado no espaco do pai, e a formula acima nao vale; em 3D ha tres rotacoes
 * e a derivacao e outra. Recusar e melhor que produzir silenciosamente um
 * resultado errado — que e exatamente o modo de falha que este comando tem.
 */
(function () {
  var REQUIRED_ARGS = {
    axis: true,
    pivot: true,
    groupMode: true,
    preserveTextReadability: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    anchorPoint: "ADBE Anchor Point",
    position: "ADBE Position",
    scale: "ADBE Scale",
    rotation: "ADBE Rotate Z"
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de flip desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de flip ausente.", {
          field: key
        });
      }
    }

    if (args.axis !== "horizontal" && args.axis !== "vertical") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Eixo invalido.", { field: "axis" });
    }
    if (args.pivot !== "anchor" && args.pivot !== "selectionBounds" && args.pivot !== "compCenter") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Pivo invalido.", { field: "pivot" });
    }
    if (args.groupMode !== "each" && args.groupMode !== "group") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de agrupamento invalido.", {
        field: "groupMode"
      });
    }
    if (typeof args.preserveTextReadability !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de legibilidade invalido.", {
        field: "preserveTextReadability"
      });
    }

    return null;
  }

  /** @param {Layer} camada @returns {Record<string, unknown>} */
  function leTransform(camada) {
    var tr = camada.property(MN.transform);
    return {
      grupo: tr,
      anchor: /** @type {number[]} */ (tr.property(MN.anchorPoint).value),
      position: /** @type {number[]} */ (tr.property(MN.position).value),
      scale: /** @type {number[]} */ (tr.property(MN.scale).value),
      rotation: /** @type {number} */ (tr.property(MN.rotation).value)
    };
  }

  /**
   * Os quatro cantos da camada em espaco de composicao.
   *
   * Os QUATRO passam pela transformacao, e nao apenas dois: uma camada
   * rotacionada tem bounding box alinhado ao eixo no espaco dela, e projetar so
   * a diagonal daria um retangulo errado depois da rotacao.
   *
   * @param {Layer} camada
   * @param {number} tempo
   * @returns {number[][]}
   */
  function cantosEmComp(camada, tempo) {
    var t = leTransform(camada);
    var r = camada.sourceRectAtTime(tempo, false);
    var rad = /** @type {number} */ (t.rotation) * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var anchor = /** @type {number[]} */ (t.anchor);
    var position = /** @type {number[]} */ (t.position);
    var scale = /** @type {number[]} */ (t.scale);

    var ancoraX = /** @type {number} */ (anchor[0]);
    var ancoraY = /** @type {number} */ (anchor[1]);
    var posX = /** @type {number} */ (position[0]);
    var posY = /** @type {number} */ (position[1]);
    var escalaX = /** @type {number} */ (scale[0]) / 100;
    var escalaY = /** @type {number} */ (scale[1]) / 100;

    var xs = [r.left, r.left + r.width];
    var ys = [r.top, r.top + r.height];
    var cantos = [];
    var m, n;
    for (m = 0; m < 2; m += 1) {
      for (n = 0; n < 2; n += 1) {
        var lx = (/** @type {number} */ (xs[m]) - ancoraX) * escalaX;
        var ly = (/** @type {number} */ (ys[n]) - ancoraY) * escalaY;
        cantos.push([posX + lx * cos - ly * sin, posY + lx * sin + ly * cos]);
      }
    }
    return cantos;
  }

  /**
   * @param {Layer[]} camadas
   * @param {number} tempo
   * @returns {number[]}
   */
  function centroDosLimites(camadas, tempo) {
    var minX = null;
    var minY = null;
    var maxX = null;
    var maxY = null;
    var i, j;
    for (i = 0; i < camadas.length; i += 1) {
      var cantos = cantosEmComp(/** @type {Layer} */ (camadas[i]), tempo);
      for (j = 0; j < cantos.length; j += 1) {
        var ponto = /** @type {number[]} */ (cantos[j]);
        var px = /** @type {number} */ (ponto[0]);
        var py = /** @type {number} */ (ponto[1]);
        if (minX === null || px < minX) minX = px;
        if (maxX === null || px > maxX) maxX = px;
        if (minY === null || py < minY) minY = py;
        if (maxY === null || py > maxY) maxY = py;
      }
    }
    if (minX === null || minY === null || maxX === null || maxY === null) {
      throw new Error("Nao foi possivel medir os limites da selecao.");
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {{error: MotionCommandFailure|null, comp: CompItem|null, camadas: Layer[]}}
   */
  function prepare(args) {
    var argsError = validateArgs(args);
    if (argsError) return { error: argsError, comp: null, camadas: [] };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        comp: null,
        camadas: []
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);

    var selecionadas = comp.selectedLayers;
    if (!selecionadas || typeof selecionadas.length !== "number" || selecionadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        comp: null,
        camadas: []
      };
    }

    var camadas = [];
    var i;
    for (i = 0; i < selecionadas.length; i += 1) {
      var camada = /** @type {Layer} */ (selecionadas[i]);
      if (!camada) continue;

      // Recusas explicitas. A derivacao vale para camada 2D sem pai; fora disso
      // o resultado seria errado sem levantar erro nenhum.
      if (camada.parent) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "Camada com pai: o eixo de espelhamento nao e alinhado no espaco do pai.",
            { layerIndex: camada.index }
          ),
          comp: null,
          camadas: []
        };
      }
      if (camada.threeDLayer === true) {
        return {
          error: failure(
            MotionContracts.ERROR.INVALID_SELECTION_TYPE,
            "Camada 3D: o espelhamento em tres eixos ainda nao esta implementado.",
            { layerIndex: camada.index }
          ),
          comp: null,
          camadas: []
        };
      }

      camadas.push(camada);
    }

    if (camadas.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada selecionada.", null),
        comp: null,
        camadas: []
      };
    }

    return { error: null, comp: comp, camadas: camadas };
  }

  /** @param {Layer} camada @returns {boolean} */
  function ehTexto(camada) {
    return typeof TextLayer !== "undefined" && camada instanceof TextLayer;
  }

  MotionRegistry.register("ae.layer.flip", {
    preflight: function (args) {
      return prepare(args).error;
    },

    run: function (args) {
      var prepared = prepare(args);
      if (prepared.error) throw new Error("Flip ficou invalido depois do preflight.");

      var comp = /** @type {CompItem} */ (prepared.comp);
      var camadas = prepared.camadas;
      var horizontal = args.axis === "horizontal";
      var eixo = horizontal ? 0 : 1;
      var tempo = comp.time;

      // Pivo compartilhado, calculado uma vez, quando o modo pede.
      var pivoComum = null;
      if (args.pivot === "compCenter") {
        pivoComum = [comp.width / 2, comp.height / 2];
      } else if (args.groupMode === "group") {
        if (args.pivot === "selectionBounds") {
          pivoComum = centroDosLimites(camadas, tempo);
        } else {
          var somaX = 0;
          var somaY = 0;
          var k;
          for (k = 0; k < camadas.length; k += 1) {
            var p = /** @type {number[]} */ (leTransform(/** @type {Layer} */ (camadas[k])).position);
            somaX += /** @type {number} */ (p[0]);
            somaY += /** @type {number} */ (p[1]);
          }
          pivoComum = [somaX / camadas.length, somaY / camadas.length];
        }
      }

      var tocadas = [];
      var aplicadas = 0;
      var i;

      try {
        for (i = 0; i < camadas.length; i += 1) {
          var camada = /** @type {Layer} */ (camadas[i]);
          var t = leTransform(camada);
          var position = /** @type {number[]} */ (t.position);
          var scale = /** @type {number[]} */ (t.scale);
          var rotation = /** @type {number} */ (t.rotation);

          var pivo;
          if (pivoComum) {
            pivo = pivoComum;
          } else if (args.pivot === "selectionBounds") {
            pivo = centroDosLimites([camada], tempo);
          } else {
            // Sem pai, a ancora em espaco de composicao E a propria posicao.
            pivo = [position[0], position[1]];
          }

          var posX = /** @type {number} */ (position[0]);
          var posY = /** @type {number} */ (position[1]);
          var escX = /** @type {number} */ (scale[0]);
          var escY = /** @type {number} */ (scale[1]);

          tocadas.push({
            camada: camada,
            position: [posX, posY],
            scale: [escX, escY],
            rotation: rotation
          });

          var novaPosicao = [posX, posY];
          novaPosicao[eixo] = 2 * /** @type {number} */ (pivo[eixo]) - /** @type {number} */ (novaPosicao[eixo]);

          var grupo = /** @type {PropertyGroup} */ (t.grupo);
          grupo.property(MN.position).setValue(novaPosicao);

          // Texto com legibilidade preservada move, mas nao espelha o conteudo:
          // negar a escala inverteria os glifos e o resultado seria ilegivel.
          // A posicao continua refletindo, entao aplicar duas vezes ainda volta
          // ao estado inicial.
          var espelhaConteudo = !(args.preserveTextReadability === true && ehTexto(camada));
          if (espelhaConteudo) {
            var novaEscala = [escX, escY];
            novaEscala[eixo] = -/** @type {number} */ (novaEscala[eixo]);
            grupo.property(MN.scale).setValue(novaEscala);
            // A rotacao troca de sinal: sem isto, qualquer camada rotacionada
            // termina no lugar errado, com o erro crescendo com o angulo.
            grupo.property(MN.rotation).setValue(-rotation);
          }

          aplicadas += 1;
        }
      } catch (applyError) {
        var rollbackFalhou = false;
        for (i = tocadas.length - 1; i >= 0; i -= 1) {
          try {
            var anterior = tocadas[i];
            if (anterior) {
              var g = /** @type {Layer} */ (anterior.camada).property(MN.transform);
              g.property(MN.position).setValue(anterior.position);
              g.property(MN.scale).setValue(anterior.scale);
              g.property(MN.rotation).setValue(anterior.rotation);
            }
          } catch (restoreError) {
            rollbackFalhou = true;
          }
        }
        if (rollbackFalhou) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback do flip falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      return {
        changed: aplicadas > 0,
        warnings: [],
        data: {
          appliedCount: aplicadas,
          unchangedCount: 0
        }
      };
    }
  });
}());
