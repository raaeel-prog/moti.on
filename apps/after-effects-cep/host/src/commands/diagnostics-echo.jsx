/**
 * `ae.diagnostics.echo` — devolve o payload recebido junto com o tamanho e uma
 * soma de verificação.
 *
 * Não é comando de brinquedo, e não existe "para testar". Ele resolve um
 * problema real: a ponte painel↔host tem escapes em duas direções, e o único
 * jeito de saber se ela está íntegra *nesta máquina, com esta codepage, nesta
 * versão do After Effects* é mandar um valor conhecido e conferir o que volta.
 * Sem isso, um usuário com o painel quebrado só teria "não funciona" para
 * relatar.
 *
 * Fica exposto em Settings → System Check como "Verificar integridade da ponte
 * com o host": botão que faz trabalho de verdade e devolve resultado de verdade.
 *
 * Também é o que dá exercício ao caminho de payload grande por arquivo
 * temporário. Um mecanismo de transporte sem nenhum consumidor é um mecanismo
 * que ninguém sabe se funciona.
 */
(function () {
  /**
   * Soma de verificação simples sobre os códigos de unidade UTF-16.
   *
   * Não é criptográfica e não precisa ser: o objetivo é detectar corrupção de
   * transporte — truncamento, troca de codepage, byte perdido —, não resistir a
   * adversário. Corrupção de canal muda o valor com folga; a integridade de
   * download de modelo, essa sim, usa SHA-256 e chega no CHMS-038.
   *
   * @param {string} text
   * @returns {string}
   */
  function checksum(text) {
    var hash = 5381;
    var i;
    for (i = 0; i < text.length; i += 1) {
      hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  }

  MotionRegistry.register("ae.diagnostics.echo", {
    preflight: function (args) {
      if (typeof args.payload !== "string") {
        return {
          code: MotionContracts.ERROR.INTERNAL_ERROR,
          message: "O comando echo exige args.payload como string.",
          recoverable: false,
          details: { received: typeof args.payload }
        };
      }
      return null;
    },

    run: function (args) {
      // O preflight ja garantiu que payload e string; o cast torna isso explicito
      // para a checagem de tipos, que nao acompanha a garantia entre as duas
      // funcoes.
      var payload = /** @type {string} */ (args.payload);

      return {
        changed: false,
        warnings: [],
        data: {
          payload: payload,
          length: payload.length,
          checksum: checksum(payload),
          hostVersion: app.version
        }
      };
    }
  });
}());
