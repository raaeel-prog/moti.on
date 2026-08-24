(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CrossHostProtocol = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function safeText(value, fallback) {
    if (value === null || typeof value === "undefined" || value === "") {
      return typeof fallback === "undefined" ? "—" : String(fallback);
    }
    return String(value);
  }

  function success(data) {
    return { ok: true, data: data || {}, error: null };
  }

  function failure(message, code, details) {
    return {
      ok: false,
      data: null,
      error: {
        code: code || "UNKNOWN_ERROR",
        message: safeText(message, "Erro desconhecido"),
        details: details || null
      }
    };
  }

  function parse(raw) {
    if (raw && typeof raw === "object") {
      return raw.ok === true ? raw : failure(
        raw.error && raw.error.message ? raw.error.message : "Resposta inválida do host",
        raw.error && raw.error.code ? raw.error.code : "INVALID_HOST_RESPONSE",
        raw
      );
    }

    if (typeof raw !== "string" || raw === "" || raw === "EvalScript error.") {
      return failure("O host não retornou uma resposta válida.", "EMPTY_HOST_RESPONSE", raw || null);
    }

    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ok === "boolean") {
        return parsed;
      }
      return failure("A resposta do host não segue o contrato esperado.", "INVALID_HOST_RESPONSE", parsed);
    } catch (error) {
      return failure("Não foi possível interpretar a resposta do host.", "HOST_RESPONSE_PARSE_ERROR", {
        raw: raw,
        parserMessage: error && error.message ? error.message : String(error)
      });
    }
  }

  function formatDimension(width, height) {
    if (!width || !height) {
      return "—";
    }
    return String(width) + " × " + String(height);
  }

  return {
    safeText: safeText,
    success: success,
    failure: failure,
    parse: parse,
    formatDimension: formatDimension
  };
}));
