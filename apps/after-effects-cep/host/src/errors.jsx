/**
 * Falhas com motivo legivel para o painel.
 *
 * ## Por que existe
 *
 * O dispatcher nunca copia `message` de uma excecao para a resposta: o texto
 * pode carregar caminho, nome de projeto ou stack. Isso protege o usuario, mas
 * tinha um custo: toda falha durante a execucao chegava ao painel como
 * "Nao foi possivel concluir", e o motivo real (camada bloqueada, efeito
 * ausente, escrita recusada e restaurada) se perdia.
 *
 * A saida e uma CHAVE, nao uma frase. O comando marca a falha com uma chave de
 * uma lista fechada, o dispatcher repassa so a chave (e parametros curtos e
 * escalares) em `error.details`, e o painel traduz pelo catalogo de idiomas.
 * Nenhum texto livre do host vira texto de interface por este caminho, e o
 * codigo do erro continua normalizado pelo dispatcher como antes.
 *
 * Toda chave daqui precisa existir nos dois catalogos de
 * `packages/ui-core/src/locales.ts`; `tests/host-error-keys.test.mjs` cobra.
 */
(function (global) {
  /** Lista fechada de chaves aceitas. */
  var KEYS = {
    "hostError.openProject": true,
    "hostError.openComposition": true,
    "hostError.selectLayers": true,
    "hostError.selectProperties": true,
    "hostError.layerLocked": true,
    "hostError.propertyLayerLocked": true,
    "hostError.effectUnavailable": true,
    "hostError.noChange": true,
    "hostError.writeRefusedRestored": true,
    "hostError.rollbackIncomplete": true,
    "hostError.removedPartially": true
  };

  /** Parametros aceitos; cada um vira `{nome}` na frase traduzida. */
  var PARAMS = { effect: true, count: true };
  var MAX_PARAM_LENGTH = 80;

  /** @param {unknown} key @returns {boolean} */
  function isKey(key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(KEYS, key);
  }

  /**
   * Copia apenas parametros conhecidos, escalares e curtos.
   *
   * @param {unknown} params
   * @returns {Record<string, string|number>|null}
   */
  function cleanParams(params) {
    if (!params || typeof params !== "object") return null;
    /** @type {Record<string, string|number>} */
    var out = {};
    var count = 0;
    var name;
    var source = /** @type {Record<string, unknown>} */ (params);
    for (name in source) {
      if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
      if (!Object.prototype.hasOwnProperty.call(PARAMS, name)) continue;
      var value = source[name];
      if (typeof value === "number" && isFinite(value)) {
        out[name] = value;
        count += 1;
      } else if (typeof value === "string" && value.length > 0 && value.length <= MAX_PARAM_LENGTH) {
        out[name] = value;
        count += 1;
      }
    }
    return count > 0 ? out : null;
  }

  /**
   * Acrescenta `messageKey`/`messageParams` a um objeto de detalhes.
   *
   * @param {Record<string, unknown>|null|undefined} details
   * @param {string} key
   * @param {unknown} [params]
   * @returns {Record<string, unknown>}
   */
  function withKey(details, key, params) {
    /** @type {Record<string, unknown>} */
    var out = {};
    var name;
    if (details && typeof details === "object") {
      for (name in details) {
        if (Object.prototype.hasOwnProperty.call(details, name)) out[name] = details[name];
      }
    }
    if (isKey(key)) {
      out.messageKey = key;
      var clean = cleanParams(params);
      if (clean) out.messageParams = clean;
    }
    return out;
  }

  /**
   * Falha de preflight com chave traduzivel. O dispatcher completa
   * `recoverable` e `action` a partir do codigo.
   *
   * @param {string} code
   * @param {string} key
   * @param {string} message Frase do host, mantida para registro e compatibilidade.
   * @param {unknown} [params]
   * @param {Record<string, unknown>|null} [details]
   * @returns {MotionCommandFailure}
   */
  function failure(code, key, message, params, details) {
    return /** @type {MotionCommandFailure} */ ({
      code: code,
      message: message,
      recoverable: true,
      action: "",
      details: withKey(details || null, key, params)
    });
  }

  /**
   * Excecao marcada para a fase de execucao. O dispatcher continua decidindo o
   * codigo (somente ROLLBACK_FAILED passa adiante); a chave so explica o motivo.
   *
   * @param {string} key
   * @param {string} message
   * @param {unknown} [params]
   * @param {string} [motionCode]
   * @returns {Error}
   */
  function error(key, message, params, motionCode) {
    var e = /** @type {any} */ (new Error(message));
    if (isKey(key)) {
      e.motionUserKey = key;
      e.motionUserParams = cleanParams(params);
    }
    if (typeof motionCode === "string") e.motionCode = motionCode;
    return e;
  }

  /**
   * Le a chave de uma excecao marcada, recusando qualquer coisa fora da lista.
   *
   * @param {unknown} thrown
   * @returns {{key: string, params: Record<string, string|number>|null}|null}
   */
  function keyOf(thrown) {
    try {
      var tagged = /** @type {{motionUserKey?: unknown, motionUserParams?: unknown}} */ (thrown);
      if (!tagged || !isKey(tagged.motionUserKey)) return null;
      return { key: /** @type {string} */ (tagged.motionUserKey), params: cleanParams(tagged.motionUserParams) };
    } catch (readError) {
      return null;
    }
  }

  global.MotionErrors = {
    isKey: isKey,
    withKey: withKey,
    failure: failure,
    error: error,
    keyOf: keyOf
  };
})($.global);
