/**
 * Registro de comandos do host.
 *
 * Um comando registra **comportamento**: `preflight` (valida) e `run` (executa).
 * Ele nao registra, e nao consegue registrar, os proprios requisitos: se e
 * destrutivo, se muta, qual o rotulo de Undo, qual o timeout. Isso vem do
 * descriptor, gerado a partir de packages/command-registry, e e o dispatcher que
 * consulta.
 *
 * A separacao e deliberada. Se o proprio comando declarasse `destructive: false`
 * na hora de se registrar, a declaracao ficaria a um caractere de distancia do
 * codigo que apaga dado do usuario — e um comando destrutivo que se declara
 * inofensivo passa por toda a protecao do dispatcher.
 *
 * A divisao em preflight/run tambem nao e organizacao: e o que torna possivel
 * validar tudo ANTES de abrir o grupo de Undo. Um comando que valida no meio da
 * execucao ja alterou o projeto quando descobre que nao devia ter comecado.
 */
(function (global) {
  /** @type {Record<string, MotionCommandHandler>} */
  var handlers = {};

  /**
   * @param {string} id Identificador do comando, por exemplo "ae.context.read".
   * @param {MotionCommandHandler} handler
   */
  function register(id, handler) {
    if (typeof id !== "string" || id === "") {
      throw new Error("Comando precisa de um id não vazio.");
    }
    if (Object.prototype.hasOwnProperty.call(handlers, id)) {
      // Registro duplicado significa que dois arquivos disputam o mesmo id. O
      // ultimo venceria em silencio, e o comando que o usuario aciona nao seria
      // o que o desenvolvedor pensa estar acionando.
      throw new Error("Comando já registrado: " + id);
    }
    if (!handler || typeof handler.run !== "function") {
      throw new Error("Comando " + id + " precisa de uma função run.");
    }
    if (typeof handler.preflight !== "function") {
      throw new Error(
        "Comando " + id + " precisa de uma função preflight. Um comando que não " +
          "valida nada declara isso retornando null explicitamente."
      );
    }

    handlers[id] = handler;
  }

  /**
   * @param {string} id
   * @returns {MotionCommandHandler|null}
   */
  function get(id) {
    if (!Object.prototype.hasOwnProperty.call(handlers, id)) return null;
    return handlers[id] || null;
  }

  /**
   * Ids registrados. Usado pelo teste de contrato que garante que o registro do
   * host e a lista de descriptors do painel sao o mesmo conjunto: um comando que
   * existe so de um lado e um botao que nunca funciona, ou um comando que a UI
   * nunca oferece.
   *
   * @returns {string[]}
   */
  function ids() {
    var out = [];
    var key;
    for (key in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, key)) {
        out.push(key);
      }
    }
    return out;
  }

  global.MotionRegistry = {
    register: register,
    get: get,
    ids: ids
  };
}($.global));
