/**
 * Matriz linear de transform de uma camada.
 *
 * A composicao esta medida no host, em docs/research/after-effects-3d-transform.md:
 *
 *   M  = Ro . Rx(rx) . Ry(ry) . Rz(rz) . S
 *   Ro = Rx(ox) . Ry(oy) . Rz(oz)
 *   S  = diag(escalaX/100, escalaY/100, escalaZ/100)
 *
 * Todas as rotacoes usam a matriz de angulo POSITIVO, na convencao padrao —
 * nao ha inversao de sinal apesar do eixo Y apontar para baixo. Erro maximo
 * contra o host: 5,684e-14, que e precisao de maquina.
 *
 * 2D e 3D pelo mesmo caminho: uma camada 2D e o caso em que orientation e as
 * rotacoes X e Y sao zero e a escala Z e 1. Manter dois caminhos separados
 * significaria manter duas contas em sincronia sem motivo.
 */
(function (global) {
  var MN = {
    transform: "ADBE Transform Group",
    scale: "ADBE Scale",
    orientation: "ADBE Orientation",
    rotateX: "ADBE Rotate X",
    rotateY: "ADBE Rotate Y",
    rotateZ: "ADBE Rotate Z"
  };

  var IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /** @param {number[]} a @param {number[]} b @returns {number[]} */
  function multiplica(a, b) {
    var r = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    var i, j, k;
    for (i = 0; i < 3; i += 1) {
      for (j = 0; j < 3; j += 1) {
        var soma = 0;
        for (k = 0; k < 3; k += 1) {
          soma += /** @type {number} */ (a[i * 3 + k]) * /** @type {number} */ (b[k * 3 + j]);
        }
        r[i * 3 + j] = soma;
      }
    }
    return r;
  }

  /** @param {number[]} m @param {number[]} v @returns {number[]} */
  function aplica(m, v) {
    var z = v.length > 2 ? /** @type {number} */ (v[2]) : 0;
    var x = /** @type {number} */ (v[0]);
    var y = /** @type {number} */ (v[1]);
    return [
      /** @type {number} */ (m[0]) * x + /** @type {number} */ (m[1]) * y + /** @type {number} */ (m[2]) * z,
      /** @type {number} */ (m[3]) * x + /** @type {number} */ (m[4]) * y + /** @type {number} */ (m[5]) * z,
      /** @type {number} */ (m[6]) * x + /** @type {number} */ (m[7]) * y + /** @type {number} */ (m[8]) * z
    ];
  }

  /** @param {number} graus @returns {number} */
  function radianos(graus) {
    return graus * Math.PI / 180;
  }

  /** @param {number} graus @returns {number[]} */
  function rotX(graus) {
    var c = Math.cos(radianos(graus));
    var s = Math.sin(radianos(graus));
    return [1, 0, 0, 0, c, -s, 0, s, c];
  }

  /** @param {number} graus @returns {number[]} */
  function rotY(graus) {
    var c = Math.cos(radianos(graus));
    var s = Math.sin(radianos(graus));
    return [c, 0, s, 0, 1, 0, -s, 0, c];
  }

  /** @param {number} graus @returns {number[]} */
  function rotZ(graus) {
    var c = Math.cos(radianos(graus));
    var s = Math.sin(radianos(graus));
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  /**
   * Le uma propriedade que pode nao existir na camada.
   *
   * Numa camada 2D nao ha `ADBE Orientation` nem rotacao em X e Y. Tratar a
   * ausencia como zero e o que faz 2D e 3D compartilharem um caminho so.
   *
   * @param {PropertyGroup} grupo @param {string} matchName @param {number} padrao
   * @returns {number}
   */
  function escalar(grupo, matchName, padrao) {
    try {
      var propriedade = grupo.property(matchName);
      if (!propriedade) return padrao;
      var valor = propriedade.value;
      return typeof valor === "number" && isFinite(valor) ? valor : padrao;
    } catch (leituraError) {
      return padrao;
    }
  }

  /**
   * @param {PropertyGroup} grupo @param {string} matchName @param {number[]} padrao
   * @returns {number[]}
   */
  function vetor(grupo, matchName, padrao) {
    try {
      var propriedade = grupo.property(matchName);
      if (!propriedade) return padrao;
      var valor = /** @type {number[]} */ (propriedade.value);
      if (!valor || typeof valor.length !== "number") return padrao;
      /** @type {number[]} */
      var saida = [];
      var i;
      for (i = 0; i < padrao.length; i += 1) {
        var reserva = /** @type {number} */ (padrao[i]);
        var componente = valor.length > i ? valor[i] : reserva;
        saida.push(typeof componente === "number" && isFinite(componente) ? componente : reserva);
      }
      return saida;
    } catch (leituraError) {
      return padrao;
    }
  }

  /**
   * Matriz linear da camada: leva um vetor do espaco da camada ao espaco do PAI.
   *
   * Nao inclui a translacao: quem chama some `posicao` quando precisa de ponto,
   * e usa a matriz crua quando precisa de vetor — que e o caso da compensacao
   * de ancora.
   *
   * @param {Layer} camada
   * @returns {number[]}
   */
  function linearMatrix(camada) {
    var grupo = camada.property(MN.transform);
    if (!grupo) return IDENTIDADE;

    var escala = vetor(grupo, MN.scale, [100, 100, 100]);
    var S = [
      /** @type {number} */ (escala[0]) / 100, 0, 0,
      0, /** @type {number} */ (escala[1]) / 100, 0,
      0, 0, /** @type {number} */ (escala[2]) / 100
    ];

    var orientacao = vetor(grupo, MN.orientation, [0, 0, 0]);
    var Ro = multiplica(
      rotX(/** @type {number} */ (orientacao[0])),
      multiplica(rotY(/** @type {number} */ (orientacao[1])), rotZ(/** @type {number} */ (orientacao[2])))
    );

    var R = multiplica(
      rotX(escalar(grupo, MN.rotateX, 0)),
      multiplica(rotY(escalar(grupo, MN.rotateY, 0)), rotZ(escalar(grupo, MN.rotateZ, 0)))
    );

    return multiplica(Ro, multiplica(R, S));
  }

  global.MotionTransform = {
    linearMatrix: linearMatrix,
    multiply: multiplica,
    apply: aplica,
    IDENTITY: IDENTIDADE
  };
}($.global));
