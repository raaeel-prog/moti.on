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
   * Numero de linha seguro, quando o ExtendScript o fornece.
   *
   * @param {unknown} error
   * @returns {number|null}
   */
  function errorLine(error) {
    try {
      var detail = /** @type {{ line?: number }} */ (error);
      var line = detail && typeof detail.line === "number" ? detail.line : null;
      return (
        line !== null &&
        isFinite(line) &&
        line >= 0 &&
        line <= 1000000 &&
        Math.floor(line) === line
      ) ? line : null;
    } catch (lineReadError) {
      return null;
    }
  }

  /**
   * Allowlist de detalhes de excecao. Nunca copia message, stack, path ou o
   * objeto lancado: todos podem conter texto criativo, caminhos e dados do
   * projeto. O painel localiza a falha a partir do ErrorCode.
   *
   * @param {string|null} command
   * @param {unknown} error
   * @returns {Record<string, unknown>}
   */
  function exceptionDetails(command, error) {
    /** @type {Record<string, unknown>} */
    var details = {};
    var line = errorLine(error);
    if (typeof command === "string" && command !== "") details.command = command;
    if (line !== null) details.line = line;
    return details;
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
    var action = MotionContracts.ERROR_ACTION[code];
    return {
      code: code,
      message: message,
      recoverable: recoverable === true,
      action: typeof action === "string" ? action : "error.action.exportLogBundle",
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} value @returns {boolean} */
  function isRecord(value) {
    return value !== null && typeof value === "object" && !(value instanceof Array);
  }

  /** @param {unknown} value @returns {boolean} */
  function isNonEmptyString(value) {
    return typeof value === "string" && !/^\s*$/.test(value);
  }

  /** @param {unknown} code @returns {boolean} */
  function isKnownErrorCode(code) {
    return (
      typeof code === "string" &&
      Object.prototype.hasOwnProperty.call(MotionContracts.ERROR, code)
    );
  }

  /**
   * Completa erros devolvidos por preflight com os metadados canonicos. O host
   * nunca confia que cada handler lembrou de repetir action/recoverable.
   *
   * @param {MotionCommandFailure} error
   * @returns {MotionCommandFailure}
   */
  function normalizeError(error) {
    if (!error || typeof error !== "object" || typeof error.code !== "string") {
      return makeError(ERROR.INTERNAL_ERROR, "O preflight devolveu um erro inválido.", null);
    }
    if (!isKnownErrorCode(error.code)) {
      return makeError(
        ERROR.INTERNAL_ERROR,
        "O preflight devolveu um código de erro desconhecido.",
        { receivedCode: error.code }
      );
    }
    return makeError(
      error.code,
      typeof error.message === "string" ? error.message : "O comando foi recusado sem mensagem.",
      typeof error.details === "undefined" ? null : error.details
    );
  }

  /**
   * Valida a parte estrutural do envelope antes de consultar descriptor,
   * preflight ou Undo. Campos opcionais novos no envelope continuam permitidos;
   * os campos criticos existentes, porem, nunca sao inferidos.
   *
   * @param {any} request
   * @returns {MotionCommandFailure|null}
   */
  function validateEnvelope(request) {
    var options;
    var optionNames = ["dryRun", "allowDestructive", "preserveSelection"];
    var allowedOptions = {
      dryRun: true,
      allowDestructive: true,
      preserveSelection: true
    };
    var i;
    var key;

    if (!isRecord(request)) {
      return makeError(ERROR.INTERNAL_ERROR, "Pedido não é um objeto.", null);
    }
    if (!isNonEmptyString(request.requestId)) {
      return makeError(ERROR.INTERNAL_ERROR, "requestId precisa ser uma string não vazia.", null);
    }
    if (!isNonEmptyString(request.command)) {
      return makeError(ERROR.INTERNAL_ERROR, "command precisa ser uma string não vazia.", null);
    }
    if (!isRecord(request.args)) {
      return makeError(ERROR.INTERNAL_ERROR, "args precisa ser um objeto.", null);
    }
    if (!isRecord(request.context)) {
      return makeError(ERROR.INTERNAL_ERROR, "context precisa ser um objeto.", null);
    }
    if (request.context.host !== "after-effects") {
      return makeError(
        ERROR.INTERNAL_ERROR,
        "O envelope foi destinado a outro host.",
        { expected: "after-effects", received: request.context.host }
      );
    }
    if (!isNonEmptyString(request.context.hostVersion)) {
      return makeError(ERROR.INTERNAL_ERROR, "context.hostVersion precisa ser uma string não vazia.", null);
    }
    if (typeof request.options !== "undefined") {
      if (!isRecord(request.options)) {
        return makeError(ERROR.INTERNAL_ERROR, "options precisa ser um objeto.", null);
      }
      options = request.options;
      for (i = 0; i < optionNames.length; i += 1) {
        key = optionNames[i] || "";
        if (
          Object.prototype.hasOwnProperty.call(options, key) &&
          typeof options[key] !== "boolean"
        ) {
          return makeError(
            ERROR.INTERNAL_ERROR,
            "A opção " + key + " precisa ser booleana.",
            { option: key }
          );
        }
      }
      for (key in options) {
        if (
          Object.prototype.hasOwnProperty.call(options, key) &&
          !Object.prototype.hasOwnProperty.call(allowedOptions, key)
        ) {
          return makeError(
            ERROR.INTERNAL_ERROR,
            "Opção desconhecida no envelope.",
            { option: key }
          );
        }
      }
    }

    return null;
  }

  /** @param {string} requirement @returns {boolean} */
  function requirementIsAvailable(requirement) {
    var project;
    var activeItem;

    try {
      project = typeof app !== "undefined" ? app.project : null;
      if (requirement === "hasProject") return Boolean(project);
      if (requirement === "hasActiveComp") {
        activeItem = project ? project.activeItem : null;
        return Boolean(
          activeItem && typeof CompItem !== "undefined" && activeItem instanceof CompItem
        );
      }
      if (requirement === "expressionEngine") {
        return Boolean(project && typeof project.expressionEngine === "string");
      }
    } catch (probeError) {
      return false;
    }

    // Requisitos sem uma sonda host-side documentada falham fechados. Liberar
    // por versao ou por suposicao seria exatamente o bypass que este gate evita.
    return false;
  }

  /**
   * @param {MotionHostDescriptor} descriptor
   * @returns {string|null}
   */
  function firstMissingRequirement(descriptor) {
    var requirements = descriptor.requirements || [];
    var i;
    var requirement;
    for (i = 0; i < requirements.length; i += 1) {
      requirement = requirements[i];
      if (typeof requirement === "string" && !requirementIsAvailable(requirement)) {
        return requirement;
      }
    }
    return null;
  }

  /** @param {string} requirement @param {string} command @returns {MotionCommandFailure} */
  function requirementError(requirement, command) {
    if (requirement === "hasProject") {
      return makeError(ERROR.NO_ACTIVE_PROJECT, "Abra um projeto antes de executar este comando.", {
        command: command,
        requirement: requirement
      });
    }
    if (requirement === "hasActiveComp") {
      return makeError(ERROR.NO_ACTIVE_COMP, "Abra uma composição antes de executar este comando.", {
        command: command,
        requirement: requirement
      });
    }
    return makeError(ERROR.CAPABILITY_UNAVAILABLE, "Uma capacidade obrigatória não está disponível.", {
      command: command,
      requirement: requirement
    });
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
        makeError(ERROR.INTERNAL_ERROR, ERROR.INTERNAL_ERROR, exceptionDetails(null, parseError)),
        startedAt, startedMs
      );
    }

    requestId = isNonEmptyString(request && request.requestId) ? request.requestId : "unknown";

    if (!isRecord(request)) {
      return respond(
        requestId, false, null, [],
        makeError(ERROR.INTERNAL_ERROR, "Pedido não é um objeto.", null),
        startedAt, startedMs
      );
    }

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

    var envelopeError = validateEnvelope(request);
    if (envelopeError) {
      return respond(requestId, false, null, [], envelopeError, startedAt, startedMs);
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

      if (options.dryRun === true && descriptor.supportsDryRun !== true) {
        return respond(
          requestId, false, null, [],
          makeError(
            ERROR.CAPABILITY_UNAVAILABLE,
            "Este comando não oferece execução sem mutação.",
            { command: request.command, option: "dryRun" }
          ),
          startedAt, startedMs
        );
      }

      // Um comando read-only que declara dry-run pode executar normalmente: ele
      // já não muta. Para um comando mutante seria necessário um handler de
      // preview separado; até ele existir, falhar fechado evita uma falsa prévia.
      if (options.dryRun === true && descriptor.mutates === true) {
        return respond(
          requestId, false, null, [],
          makeError(
            ERROR.CAPABILITY_UNAVAILABLE,
            "A pré-visualização sem mutação não está implementada neste build.",
            { command: request.command, option: "dryRun" }
          ),
          startedAt, startedMs
        );
      }

      var missingRequirement = firstMissingRequirement(descriptor);
      if (missingRequirement) {
        return respond(
          requestId, false, null, [],
          requirementError(missingRequirement, request.command),
          startedAt, startedMs
        );
      }

      // 5. Preflight: TODA a validacao, com o projeto ainda intacto.
      preflightError = command.preflight(request.args || {}, request.context || {});
      if (preflightError) {
        return respond(requestId, false, null, [], normalizeError(preflightError), startedAt, startedMs);
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
          ERROR.HOST_OPERATION_FAILED,
          exceptionDetails(request.command, error)
        ),
        startedAt, startedMs
      );
    }
  }

  global.MotionAE = {
    dispatch: dispatch
  };
}($.global));
