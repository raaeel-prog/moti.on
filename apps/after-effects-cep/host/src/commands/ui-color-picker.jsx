/**
 * `ae.ui.color-picker` — abre o seletor de cor do sistema e devolve a escolha.
 *
 * O seletor do painel resolve o caso comum dentro do próprio painel. Este
 * comando é a saída que não depende do tamanho do painel e traz o conta-gotas
 * do sistema: `$.colorPicker` (JavaScript Tools Guide, objeto `$`) recebe a cor
 * pré-selecionada como 0xRRGGBB e devolve 0xRRGGBB, ou -1 quando o usuário
 * cancela.
 *
 * Não muta o projeto nem abre grupo de Undo: quem aplica a cor é o comando da
 * ferramenta, depois, com a cor que voltou daqui.
 */
(function () {
  var HEX = /^#[0-9a-fA-F]{6}$/;

  MotionRegistry.register("ae.ui.color-picker", {
    preflight: function (args) {
      if (typeof args.hex !== "string" || !HEX.test(args.hex)) {
        return {
          code: MotionContracts.ERROR.INTERNAL_ERROR,
          message: "O seletor de cor exige args.hex no formato #rrggbb.",
          recoverable: false,
          details: { received: typeof args.hex }
        };
      }
      if (typeof $.colorPicker !== "function") {
        return {
          code: MotionContracts.ERROR.CAPABILITY_UNAVAILABLE,
          message: "Este After Effects não expõe o seletor de cor do sistema ao script.",
          recoverable: true,
          details: {}
        };
      }
      return null;
    },

    run: function (args) {
      var atual = parseInt(/** @type {string} */ (args.hex).substring(1), 16);
      var escolhida = $.colorPicker(atual);
      if (typeof escolhida !== "number" || escolhida < 0) {
        return { changed: false, warnings: [], data: { cancelled: true, hex: null } };
      }
      var texto = (escolhida & 0xFFFFFF).toString(16);
      while (texto.length < 6) texto = "0" + texto;
      return { changed: false, warnings: [], data: { cancelled: false, hex: "#" + texto.toLowerCase() } };
    }
  });
}());
