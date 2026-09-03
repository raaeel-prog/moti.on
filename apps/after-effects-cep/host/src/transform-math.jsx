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

  /**
   * Operacao inversa de `Rx(a) . Ry(b) . Rz(c)`: dada a matriz, devolve os tres
   * angulos em graus.
   *
   * Esta era a peca que faltava, e ela bloqueava tres comandos ao mesmo tempo —
   * `ae.layer.flip` em 3D, os eixos verticais de `ae.3d.look-at` e o recorte por
   * limites de `ae.comp.fast-edit`. Compor rotacoes e facil; voltar de uma
   * composicao para angulos de Euler e o que nao existia.
   *
   * ## A derivacao
   *
   * Com `R = Rx(a) . Ry(b) . Rz(c)` e as matrizes de angulo positivo usadas aqui:
   *
   *     R[0][2] = sin(b)
   *     R[1][2] = -sin(a) cos(b)      R[2][2] = cos(a) cos(b)
   *     R[0][0] = cos(b) cos(c)       R[0][1] = -cos(b) sin(c)
   *
   * entao `b` sai do arco-seno e `a` e `c` saem de dois `atan2`, que preservam o
   * quadrante — `atan2` e nao `atan` justamente por isso.
   *
   * ## Gimbal lock
   *
   * Quando `cos(b)` chega a zero, isto e `b = ±90°`, as quatro entradas que dao
   * `a` e `c` zeram juntas e a decomposicao deixa de ser unica: sobra so a soma
   * (ou a diferenca) dos dois angulos. Ali a convencao e fixar `a = 0` e jogar
   * todo o giro em `c`, que e o que mantem o resultado continuo e reproduzivel.
   * Devolver NaN ou um angulo arbitrario seria pior: a camada saltaria sem
   * motivo visivel exatamente no ponto em que o usuario aponta para cima.
   *
   * @param {number[]} m Matriz de rotacao pura, em ordem de linhas.
   * @returns {number[]} `[rx, ry, rz]` em graus.
   */
  function eulerFromMatrix(m) {
    var m00 = /** @type {number} */ (m[0]);
    var m01 = /** @type {number} */ (m[1]);
    var m02 = /** @type {number} */ (m[2]);
    var m10 = /** @type {number} */ (m[3]);
    var m11 = /** @type {number} */ (m[4]);
    var m12 = /** @type {number} */ (m[5]);
    var m22 = /** @type {number} */ (m[8]);

    // Um seno so pode valer entre -1 e 1; erro de arredondamento em cadeia de
    // multiplicacoes pode passar disso e fazer asin devolver NaN.
    var seno = m02 < -1 ? -1 : (m02 > 1 ? 1 : m02);
    var b = Math.asin(seno);
    var cosB = Math.cos(b);

    var a;
    var c;
    if (Math.abs(cosB) < 0.000001) {
      a = 0;
      c = Math.atan2(m10, m11);
    } else {
      a = Math.atan2(-m12, m22);
      c = Math.atan2(-m01, m00);
    }

    return [graus(a), graus(b), graus(c)];
  }

  /** @param {number} rad @returns {number} */
  function graus(rad) {
    return rad * 180 / Math.PI;
  }

  /**
   * Rotacao pura de uma orientacao em graus. E o caminho de ida que
   * `eulerFromMatrix` desfaz.
   *
   * @param {number[]} euler `[rx, ry, rz]` em graus.
   * @returns {number[]}
   */
  function matrixFromEuler(euler) {
    return multiplica(
      rotX(/** @type {number} */ (euler[0])),
      multiplica(rotY(/** @type {number} */ (euler[1])), rotZ(/** @type {number} */ (euler[2])))
    );
  }

  global.MotionTransform = {
    linearMatrix: linearMatrix,
    multiply: multiplica,
    apply: aplica,
    eulerFromMatrix: eulerFromMatrix,
    matrixFromEuler: matrixFromEuler,
    rotX: rotX,
    rotY: rotY,
    rotZ: rotZ,
    IDENTITY: IDENTIDADE
  };
}($.global));
