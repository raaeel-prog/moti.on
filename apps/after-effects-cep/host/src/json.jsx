/**
 * JSON para o ExtendScript.
 *
 * O ExtendScript nao possui o objeto `JSON`. As duas saidas comuns para isso sao
 * ruins:
 *
 *   - `eval("(" + texto + ")")` transforma todo dado recebido em codigo
 *     executavel. E a mesma vulnerabilidade que o encoder do lado do painel
 *     existe para evitar, so que na direcao oposta.
 *   - copiar um json2.js de terceiros traz codigo nao auditado para dentro do
 *     host, com licenca propria e sem os limites que este projeto precisa.
 *
 * Entao o parser e escrito aqui, e escrito com limites explicitos.
 *
 * `MotionJson.stringify` aplica a MESMA tabela de escape do
 * `encodeForEvalScript` do painel: saida sempre ASCII imprimivel. O canal de
 * retorno do `evalScript` tambem nao tem codificacao garantida, e no Windows o
 * ExtendScript decodifica pela codepage do sistema — um nome de composicao
 * acentuado voltaria corrompido sem isso.
 *
 * Substitui o `escapeJsonString` do starter, que tratava apenas cinco
 * caracteres e emitia JSON invalido para os demais controles.
 */
(function (global) {
  /**
   * Profundidade maxima de aninhamento.
   *
   * Nao e paranoia: o ExtendScript nao tem protecao de pilha util, e um
   * documento profundo o bastante derruba o After Effects inteiro em vez de
   * lancar um erro que o dispatcher poderia reportar. 64 e mais fundo do que
   * qualquer estrutura legitima deste protocolo.
   */
  var MAX_DEPTH = 64;

  /** Teto de entrada, em caracteres. */
  var MAX_INPUT_LENGTH = 4 * 1024 * 1024;

  /**
   * Chaves recusadas na desserializacao.
   *
   * `__proto__` num literal de objeto do ExtendScript altera a cadeia de
   * prototipos em vez de virar uma propriedade comum. Como este parser monta
   * objetos a partir de dado que atravessou a fronteira, aceitar essas chaves
   * seria deixar o dado alterar o comportamento de objetos nao relacionados.
   */
  var FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

  /** @param {string} key @returns {boolean} */
  function isForbiddenKey(key) {
    var i;
    for (i = 0; i < FORBIDDEN_KEYS.length; i += 1) {
      if (FORBIDDEN_KEYS[i] === key) return true;
    }
    return false;
  }

  /** @param {string} hex @returns {string} */
  function pad4(hex) {
    while (hex.length < 4) {
      hex = "0" + hex;
    }
    return hex;
  }

  /**
   * Escapa uma string para literal JSON, com saida ASCII imprimivel.
   * Tabela identica a de packages/contracts/src/evalscript.ts.
   */
  /**
   * @param {unknown} value
   * @returns {string}
   */
  function escapeString(value) {
    var out = "";
    var text = String(value);
    var i;
    var code;
    var ch;

    for (i = 0; i < text.length; i += 1) {
      ch = text.charAt(i);
      code = text.charCodeAt(i);

      if (ch === "\\") {
        out += "\\\\";
      } else if (ch === "\"") {
        out += "\\\"";
      } else if (code < 0x20 || code > 0x7e) {
        out += "\\u" + pad4(code.toString(16));
      } else {
        out += ch;
      }
    }

    return out;
  }

  /**
   * @param {*} value
   * @param {number} depth
   * @returns {string}
   */
  function stringifyValue(value, depth) {
    var type = typeof value;
    var parts;
    var key;
    var i;
    var record;

    if (depth > MAX_DEPTH) {
      throw new Error("Profundidade máxima excedida ao serializar.");
    }

    if (value === null || type === "undefined") {
      return "null";
    }
    if (type === "string") {
      return "\"" + escapeString(value) + "\"";
    }
    if (type === "number") {
      // NaN e Infinity nao existem em JSON. Emitir "null" e o que o JSON.stringify
      // padrao faz, e e melhor que emitir um token invalido que quebraria o
      // parser do outro lado.
      return isFinite(value) ? String(value) : "null";
    }
    if (type === "boolean") {
      return value ? "true" : "false";
    }
    if (value instanceof Array) {
      parts = [];
      for (i = 0; i < value.length; i += 1) {
        parts.push(stringifyValue(value[i], depth + 1));
      }
      return "[" + parts.join(",") + "]";
    }

    parts = [];
    record = value;
    for (key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        if (typeof record[key] === "undefined") continue;
        parts.push("\"" + escapeString(key) + "\":" + stringifyValue(record[key], depth + 1));
      }
    }
    return "{" + parts.join(",") + "}";
  }

  /**
   * @param {*} value
   * @returns {string}
   */
  function stringify(value) {
    return stringifyValue(value, 0);
  }

  /**
   * Parser de descida recursiva. Sem `eval`.
   *
   * @param {string} text
   * @returns {*}
   */
  function parse(text) {
    var source = String(text);
    var at = 0;

    if (source.length > MAX_INPUT_LENGTH) {
      throw new Error("Entrada acima do limite de " + MAX_INPUT_LENGTH + " caracteres.");
    }

    /** @param {string} message @returns {never} */
    function fail(message) {
      throw new Error("JSON inválido na posição " + at + ": " + message);
    }

    function peek() {
      return at < source.length ? source.charAt(at) : "";
    }

    function skipWhitespace() {
      while (at < source.length) {
        var ch = source.charAt(at);
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
          at += 1;
        } else {
          break;
        }
      }
    }

    /** @param {string} character */
    function expect(character) {
      if (peek() !== character) {
        fail("esperado '" + character + "', encontrado '" + peek() + "'");
      }
      at += 1;
    }

    function parseString() {
      var out = "";
      var ch;
      var hex;

      expect("\"");

      while (at < source.length) {
        ch = source.charAt(at);

        if (ch === "\"") {
          at += 1;
          return out;
        }

        if (ch === "\\") {
          at += 1;
          ch = source.charAt(at);
          if (ch === "u") {
            hex = source.substr(at + 1, 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              fail("escape unicode malformado");
            }
            out += String.fromCharCode(parseInt(hex, 16));
            at += 5;
            continue;
          }
          if (ch === "n") out += "\n";
          else if (ch === "t") out += "\t";
          else if (ch === "r") out += "\r";
          else if (ch === "b") out += "\b";
          else if (ch === "f") out += "\f";
          else if (ch === "\"" || ch === "\\" || ch === "/") out += ch;
          else fail("escape desconhecido '\\" + ch + "'");
          at += 1;
          continue;
        }

        out += ch;
        at += 1;
      }

      fail("string sem fechamento");
      return "";
    }

    function parseNumber() {
      var start = at;
      if (peek() === "-") at += 1;
      while (at < source.length && /[0-9]/.test(source.charAt(at))) at += 1;
      if (peek() === ".") {
        at += 1;
        while (at < source.length && /[0-9]/.test(source.charAt(at))) at += 1;
      }
      if (peek() === "e" || peek() === "E") {
        at += 1;
        if (peek() === "+" || peek() === "-") at += 1;
        while (at < source.length && /[0-9]/.test(source.charAt(at))) at += 1;
      }
      var raw = source.substring(start, at);
      var parsed = Number(raw);
      if (raw === "" || isNaN(parsed)) {
        fail("número malformado '" + raw + "'");
      }
      return parsed;
    }

    /**
     * @param {string} word
     * @param {*} value
     * @returns {*}
     */
    function parseLiteral(word, value) {
      if (source.substr(at, word.length) !== word) {
        fail("literal desconhecido");
      }
      at += word.length;
      return value;
    }

    /**
     * @param {number} depth
     * @returns {*}
     */
    function parseValue(depth) {
      if (depth > MAX_DEPTH) {
        fail("profundidade máxima de " + MAX_DEPTH + " excedida");
      }

      skipWhitespace();
      var ch = peek();

      if (ch === "{") {
        /** @type {Record<string, *>} */
        var object = {};
        at += 1;
        skipWhitespace();
        if (peek() === "}") {
          at += 1;
          return object;
        }
        for (;;) {
          skipWhitespace();
          var key = parseString();
          if (isForbiddenKey(key)) {
            fail("chave proibida '" + key + "'");
          }
          skipWhitespace();
          expect(":");
          object[key] = parseValue(depth + 1);
          skipWhitespace();
          if (peek() === ",") {
            at += 1;
            continue;
          }
          expect("}");
          return object;
        }
      }

      if (ch === "[") {
        /** @type {*[]} */
        var array = [];
        at += 1;
        skipWhitespace();
        if (peek() === "]") {
          at += 1;
          return array;
        }
        for (;;) {
          array.push(parseValue(depth + 1));
          skipWhitespace();
          if (peek() === ",") {
            at += 1;
            continue;
          }
          expect("]");
          return array;
        }
      }

      if (ch === "\"") return parseString();
      if (ch === "t") return parseLiteral("true", true);
      if (ch === "f") return parseLiteral("false", false);
      if (ch === "n") return parseLiteral("null", null);
      if (ch === "-" || /[0-9]/.test(ch)) return parseNumber();

      fail("valor inesperado '" + ch + "'");
      return null;
    }

    var result = parseValue(0);
    skipWhitespace();
    if (at < source.length) {
      fail("conteúdo extra após o valor");
    }
    return result;
  }

  global.MotionJson = {
    parse: parse,
    stringify: stringify,
    MAX_DEPTH: MAX_DEPTH,
    MAX_INPUT_LENGTH: MAX_INPUT_LENGTH
  };
}($.global));
