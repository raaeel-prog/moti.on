/* global FootageItem */
(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  var ALLOWED = { removeConfirmed: true };

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandFailure|null}
   */
  function preflight(args) {
    // Este comando remove itens do projeto. Aceitar chave desconhecida em
    // silencio transformaria um erro de digitacao no cliente em "removeu
    // quando eu nao pedi" — `removeConfirmed` escrito errado cairia no ramo
    // de varredura, mas o contrario tambem vale para o proximo argumento.
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(ALLOWED, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido.");
      }
    }
    if (typeof args.removeConfirmed !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "removeConfirmed precisa ser booleano.");
    }
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var removeConfirmed = args.removeConfirmed === true;
    var proj = app.project;

    // Varredura do material nao usado.
    var unusedItems = [];
    for (var i = 1; i <= /** @type {any} */ (proj).numItems; i++) {
      var item = /** @type {any} */ (proj).item(i);
      // usedIn vazio significa que nenhuma composicao referencia o item.
      if (item instanceof FootageItem && item.usedIn.length === 0) {
        unusedItems.push(item);
      }
    }

    if (!removeConfirmed) {
      // Sem confirmacao o comando so relata: quem decide remover e o painel.
      return {
        changed: false,
        warnings: [],
        data: {
          scanned: true,
          unusedCount: unusedItems.length
        }
      };
    }

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    var removedCount = 0;
    try {
      // De tras para frente: remover reindexa a colecao do projeto, e um
      // laco crescente pularia o item seguinte a cada remocao.
      for (var j = unusedItems.length - 1; j >= 0; j--) {
        var alvo = unusedItems[j];
        if (!alvo) continue;
        alvo.remove();
        removedCount += 1;
      }

      return { changed: true, warnings: [], data: { removedCount: removedCount } };
    } catch (e) {
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Clean falhou: " + (/** @type {any} */ (e)).toString()));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }
  }

  MotionRegistry.register("ae.project.clean", {
    preflight: preflight,
    run: run
  });
})();
