/**
 * Bloco de metadata de rig dentro do comentario de uma camada (CHMS-009).
 *
 * O comentario e **campo do usuario**. O plugin escreve apenas entre os
 * marcadores do contrato e preserva integralmente o que estiver antes ou depois:
 * a §11 e explicita que o plugin e hospede ali.
 *
 * Existe como modulo porque Parallax e Cylinder ja precisam do mesmo bloco, e a
 * proxima ferramenta de rig vai precisar tambem. Duas copias de "onde comeca e
 * onde termina o bloco" divergiriam no primeiro caso de borda — comentario sem
 * marcador de fechamento, por exemplo.
 */
(function (global) {
  /**
   * Grava o bloco, substituindo o anterior quando ja existe.
   *
   * @param {unknown} comentario Texto atual da camada.
   * @param {string} bloco Conteudo a guardar entre os marcadores.
   * @returns {string}
   */
  function write(comentario, bloco) {
    var abertura = MotionContracts.META_OPEN;
    var fechamento = MotionContracts.META_CLOSE;
    var texto = typeof comentario === "string" ? comentario : "";
    var inicio = texto.indexOf(abertura);
    var fim = texto.indexOf(fechamento);
    var novo = abertura + bloco + fechamento;

    // Sem par completo de marcadores nao ha bloco valido para substituir: o
    // texto inteiro e do usuario e o bloco novo entra depois dele.
    if (inicio >= 0 && fim > inicio) {
      return texto.substring(0, inicio) + novo + texto.substring(fim + fechamento.length);
    }
    return texto.length > 0 ? texto + "\n" + novo : novo;
  }

  /**
   * O comentario carrega um bloco deste tipo de rig?
   *
   * A comparacao e pelo `rigType` dentro do bloco, e nao pelo nome da camada: o
   * nome e editavel e a §11 proibe usa-lo como identificador.
   *
   * @param {unknown} comentario
   * @param {string} rigType
   * @returns {boolean}
   */
  function has(comentario, rigType) {
    if (typeof comentario !== "string") return false;
    var inicio = comentario.indexOf(MotionContracts.META_OPEN);
    var fim = comentario.indexOf(MotionContracts.META_CLOSE);
    if (inicio < 0 || fim <= inicio) return false;
    return comentario.substring(inicio, fim).indexOf('"rigType":"' + rigType + '"') >= 0;
  }

  /**
   * Camada da composicao que carrega o rig do tipo pedido.
   *
   * @param {CompItem} comp
   * @param {string} rigType
   * @returns {Layer|null}
   */
  function findController(comp, rigType) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && has(camada.comment, rigType)) return camada;
    }
    return null;
  }

  /**
   * Membros do rig: quem esta parenteado ao controller, na ordem da timeline.
   *
   * Estrutural de proposito. O After Effects nao tem uuid de camada, e guardar
   * indices quebraria assim que alguem reordenasse a timeline.
   *
   * @param {CompItem} comp
   * @param {Layer} controller
   * @returns {Layer[]}
   */
  function findMembers(comp, controller) {
    var membros = [];
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && camada !== controller && camada.parent === controller) membros.push(camada);
    }
    return membros;
  }

  global.MotionRigMeta = {
    write: write,
    has: has,
    findController: findController,
    findMembers: findMembers
  };
}($.global));
