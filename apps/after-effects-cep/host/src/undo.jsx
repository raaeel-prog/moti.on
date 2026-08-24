/**
 * Fronteira de Undo do After Effects.
 *
 * A regra da secao 10 do master spec: um comando e uma entrada no historico de
 * Undo. Nao duas, nao dezenove. Se o usuario aplicar um rig de parallax em vinte
 * camadas e precisar desfazer, um Ctrl+Z tem que devolver o projeto ao estado
 * anterior — e nao desfazer a vigesima camada.
 *
 * O `finally` nao e detalhe de estilo. Se `endUndoGroup` nao for chamado depois
 * de uma excecao, o After Effects fica com um grupo aberto e as proximas
 * operacoes do usuario — feitas a mao, sem relacao com o plugin — entram nele.
 * O historico de Undo dele fica corrompido ate reiniciar o aplicativo.
 */
(function (global) {
  /**
   * @param {string} label Rotulo que aparece no menu Edit > Undo.
   * @param {function(): *} callback
   * @returns {*}
   */
  function withUndoGroup(label, callback) {
    app.beginUndoGroup(label);
    try {
      return callback();
    } finally {
      app.endUndoGroup();
    }
  }

  global.MotionUndo = {
    withUndoGroup: withUndoGroup
  };
}($.global));
