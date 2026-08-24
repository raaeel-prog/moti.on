/**
 * Ponto de entrada ÚNICO do host do After Effects.
 *
 * O painel nunca monta código para o `evalScript`. Ele serializa um
 * `CommandRequest`, escapa com `encodeForEvalScript` e chama
 * `MotionAE.dispatch("...")`. Nenhum outro símbolo do plugin é exposto em
 * `$.global` a partir daqui, e `scripts/validate.mjs` verifica que existe
 * exatamente um `global.MotionAE =` no arquivo montado e exatamente um
 * `evalScript(` no bundle do cliente.
 *
 * A ordem das etapas abaixo é a parte que importa, e é a §8 do master spec.
 * Toda validação acontece ANTES do grupo de Undo abrir. Um comando que valida no
 * meio da execução já alterou o projeto quando descobre que não devia ter
 * começado — e aí a única saída é um rollback que também pode falhar.
 */
(function (global) {
  var PROTOCOL_VERSION = MotionContracts.PROTOCOL_VERSION;
  var ERROR = MotionContracts.ERROR;

  /**
   * Extrai a mensagem de um valor lancado.
   *
   * O ExtendScript lanca objetos que nem sempre sao Error, e um `catch` recebe
   * `unknown`. Ler `.message` direto compila em JavaScript e produz "undefined"
   * na mensagem de erro que o usuario vai ler.
   *
   * @param {unknown} error
   * @returns {string}
   */
  function describeError(error) {
    var detail = /** @type {{ message?: string }} */ (error);
    return detail && typeof detail.message === "string" ? detail.message : String(error);
  }

  /**
   * Numero da linha, quando o ExtendScript o fornece.
   *
   * @param {unknown} error
   * @returns {number|null}
   */
  function errorLine(error) {
    var detail = /** @type {{ line?: number }} */ (error);
    return detail && typeof detail.line === "number" ? detail.line : null;
  }

  /** @returns {string} */
  function nowIso() {
    // O ExtendScript nao tem toISOString em todas as versoes. Montar a mao evita
    // depender de um metodo que pode nao existir.
    var d = new Date();
    /** @param {number} n @param {number} size @returns {string} */
    function pad(n, size) {
      var s = String(n);
      while (s.length < size) s = "0" + s;
      return s;
    }
    return (
      d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1, 2) + "-" + pad(d.getUTCDate(), 2) +
      "T" + pad(d.getUTCHours(), 2) + ":" + pad(d.getUTCMinutes(), 2) + ":" + pad(d.getUTCSeconds(), 2) +
      "." + pad(d.getUTCMilliseconds(), 3) + "Z"
    );
  }

  /**
   * @param {string} requestId
   * @param {boolean} ok
   * @param {Record<string, unknown>|null} data
   * @param {Array<{code: string, message: string, details: unknown}>} warnings
   * @param {MotionCommandFailure|null} error
   * @param {string} startedAt
   * @param {number} startedMs
   * @returns {string}
   */
  function respond(requestId, ok, data, warnings, error, startedAt, startedMs) {
    return MotionJson.stringify({
      protocolVersion: PROTOCOL_VERSION,
      requestId: requestId,
      ok: ok,
      data: ok ? (data || {}) : null,
      warnings: warnings || [],
      error: error,
      timing: { startedAt: startedAt, durationMs: new Date().getTime() - startedMs }
    });
  }

  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   * @returns {MotionCommandFailure}
   */
  function makeError(code, message, details) {
    var recoverable = MotionContracts.ERROR_RECOVERABLE[code];
    return {
      code: code,
      message: message,
      recoverable: recoverable === true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /**
   * @param {string} serializedRequest CommandRequest em JSON.
   * @returns {string} CommandResponse em JSON.
   */
  function dispatch(serializedRequest) {
    var startedMs = new Date().getTime();
    var startedAt = nowIso();
    var requestId = "unknown";
    /** @type {any} */
    var request;
    /** @type {MotionHostDescriptor|undefined} */
    var descriptor;
    /** @type {MotionCommandHandler|null} */
    var handler;
    /** @type {MotionCommandFailure|null} */
    var preflightError;
    /** @type {any} */
    var result;

    // 1. Parse. Antes disto nao ha requestId, entao um pedido ilegivel responde
    //    com o marcador "unknown" — o cliente descarta por id desconhecido e o
    //    timeout fecha o caso, que e o comportamento correto: nao ha a quem
    //    entregar uma resposta cujo pedido nao foi compreendido.
    try {
      request = MotionJson.parse(serializedRequest);
    } catch (parseError) {
      return respond(
        requestId, false, null, [],
        makeError(ERROR.INTERNAL_ERROR, "Pedido ilegível: " + describeError(parseError), null),
        startedAt, startedMs
      );
    }

    if (!request || typeof request !== "object") {
      return respond(
        requestId, false, null, [],
        makeError(ERROR.INTERNAL_ERROR, "Pedido não é um objeto.", null),
        startedAt, startedMs
      );
    }

    requestId = typeof request.requestId === "string" ? request.requestId : "unknown";

    // 2. Versao de protocolo. Recusa, nunca tentativa de adivinhacao: um
    //    envelope de outra versao que "quase" encaixa produz corrupcao
    //    silenciosa de projeto. Ver docs/adr/0002.
    if (request.protocolVersion !== PROTOCOL_VERSION) {
      return respond(
        requestId, false, null, [],
        makeError(
          ERROR.INTERNAL_ERROR,
          "Versão de protocolo incompatível.",
          { expected: PROTOCOL_VERSION, received: request.protocolVersion }
        ),
        startedAt, startedMs
      );
    }

    // 3. Descriptor. Sem ele nao se sabe se o comando muta, se e destrutivo nem
    //    qual rotulo de Undo usar, entao nao ha como executa-lo com seguranca.
    descriptor = MotionDescriptors[request.command];
    if (!descriptor) {
      return respond(
        requestId, false, null, [],
        makeError(ERROR.INTERNAL_ERROR, "Comando desconhecido.", { command: request.command }),
        startedAt, startedMs
      );
    }

    handler = MotionRegistry.get(request.command);
    if (!handler) {
      // Descriptor sem implementacao. E defeito de build, nao do usuario, e
      // precisa aparecer como tal em vez de virar um botao que nao faz nada.
      return respond(
        requestId, false, null, [],
        makeError(
          ERROR.INTERNAL_ERROR,
          "Comando declarado mas não implementado neste build.",
          { command: request.command }
        ),
        startedAt, startedMs
      );
    }

    // Copia local para que a analise de tipos saiba que handler nao e null
    // dentro do callback passado a withUndoGroup.
    var command = handler;

    try {
      // 4. Consentimento para operacao destrutiva. Antes do preflight de
      //    proposito: nao faz sentido validar argumentos de uma operacao que o
      //    usuario nao autorizou.
      var options = request.options || {};
      if (descriptor.destructive && options.allowDestructive !== true) {
        return respond(
          requestId, false, null, [],
          makeError(
            ERROR.PERMISSION_DENIED,
            "Esta operação apaga ou substitui dados e exige confirmação explícita.",
            { command: request.command }
          ),
          startedAt, startedMs
        );
      }

      // 5. Preflight: TODA a validacao, com o projeto ainda intacto.
      preflightError = command.preflight(request.args || {}, request.context || {});
      if (preflightError) {
        return respond(requestId, false, null, [], preflightError, startedAt, startedMs);
      }

      // 6. Execucao. Grupo de Undo apenas quando o comando muta: abrir um grupo
      //    para uma leitura poluiria o historico do usuario com entradas que nao
      //    desfazem nada.
      if (descriptor.mutates) {
        var undoLabel = MotionDescriptors.__undoLabelFor(
          descriptor,
          request.context ? request.context.locale : null
        );
        result = MotionUndo.withUndoGroup(undoLabel, function () {
          return command.run(request.args || {}, request.context || {});
        });
      } else {
        result = command.run(request.args || {}, request.context || {});
      }

      if (!result || typeof result !== "object") {
        return respond(
          requestId, false, null, [],
          makeError(ERROR.INTERNAL_ERROR, "O comando não devolveu um resultado.", null),
          startedAt, startedMs
        );
      }

      // 7. A regra do `ok`, imposta pela estrutura e nao por convencao.
      //
      //    A secao 8 diz: "O resultado nunca retorna ok: true quando nenhuma
      //    alteracao esperada ocorreu." Aqui isso e verificado pelo dispatcher, e
      //    nao confiado a cada comando: um comando que muta e reporta
      //    changed: false responde ok: false, sempre, independentemente do que
      //    ele ache que fez.
      if (descriptor.mutates && result.changed !== true) {
        return respond(
          requestId, false, null,
          (result.warnings || []).concat([
            {
              code: "NO_CHANGE_APPLIED",
              message: "O comando terminou sem aplicar a alteração esperada.",
              details: null
            }
          ]),
          makeError(
            ERROR.HOST_OPERATION_FAILED,
            "Nenhuma alteração foi aplicada ao projeto.",
            { command: request.command }
          ),
          startedAt, startedMs
        );
      }

      return respond(
        requestId, true, result.data, result.warnings || [], null, startedAt, startedMs
      );
    } catch (error) {
      // Uma excecao que escapa do handler nao pode virar sucesso, e nao pode
      // virar uma mensagem generica sem codigo. O `finally` do withUndoGroup ja
      // fechou o grupo antes de chegar aqui.
      return respond(
        requestId, false, null, [],
        makeError(
          ERROR.HOST_OPERATION_FAILED,
          describeError(error),
          { command: request.command, line: errorLine(error) }
        ),
        startedAt, startedMs
      );
    }
  }

  global.MotionAE = {
    dispatch: dispatch
  };
}($.global));
