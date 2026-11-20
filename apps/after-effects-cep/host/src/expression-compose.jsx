/**
 * Expressoes empilhadas: o resultado da expressao do usuario vira o `value`
 * da expressao do Moti.on, em vez de a ferramenta recusar a propriedade.
 *
 *   var motionUserValue = (function () { <usuario>; return <ultima>; })();
 *   (function (value) { <ferramenta>; return <ultima>; })(motionUserValue);
 *
 * Sem `eval` (proibido pela spec §531): a ultima instrucao de cada corpo e
 * achada por um leitor que respeita strings, comentarios e agrupamentos. Se a
 * ultima instrucao nao for uma expressao (if/for/var...), `compose` devolve
 * null e quem chamou decide — o After Effects tambem valida o resultado.
 */
(function (/** @type {any} */ global) {
  var CONTINUES_NEXT = /^[.+\-*\x2F%?:,)\]}&|^=<>]/;
  var CONTINUES_PREV = /[+\-*\x2F%?:,([{&|^=<>!]$/;
  var NOT_EXPRESSION = /^(if|for|while|do|switch|try|var|let|const|function|class|throw|break|continue|else|catch|finally)\b/;

  /**
   * Divide um corpo de expressao em instrucoes de nivel zero.
   * @param {string} source @returns {string[]|null}
   */
  function statements(source) {
    var out = /** @type {string[]} */ ([]), start = 0, depth = 0, i = 0, n = source.length, quote = "", ch;
    /** @param {number} end */
    function push(end) { var s = source.substring(start, end).replace(/^\s+|\s+$/g, ""); if (s.length) out.push(s); start = end + 1; }
    while (i < n) {
      ch = source.charAt(i);
      if (quote) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === quote) quote = "";
        i += 1; continue;
      }
      if (ch === "/" && source.charAt(i + 1) === "/") { var nl = source.indexOf("\n", i); if (nl < 0) nl = n; i = nl; continue; }
      if (ch === "/" && source.charAt(i + 1) === "*") { var close = source.indexOf("*/", i + 2); if (close < 0) return null; i = close + 2; continue; }
      if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; i += 1; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") { depth -= 1; if (depth < 0) return null; if (depth === 0 && ch === "}" && !/^\s*(else|catch|finally|\.|\)|,|;)/.test(source.substring(i + 1))) { push(i + 1); start = i + 1; } }
      else if (depth === 0 && ch === ";") push(i);
      else if (depth === 0 && ch === "\n") {
        var before = stripComment(source.substring(start, i)).replace(/\s+$/, ""), after = source.substring(i + 1).replace(/^\s+/, "");
        if (before.length && !CONTINUES_PREV.test(before) && !CONTINUES_NEXT.test(after)) push(i);
      }
      i += 1;
    }
    if (quote || depth !== 0) return null;
    push(n);
    return out;
  }

  /** @param {string} line @returns {string} */
  function stripComment(line) { var at = line.lastIndexOf("//"); return at >= 0 && line.indexOf("\"", at) < 0 && line.indexOf("'", at) < 0 ? line.substring(0, at) : line; }

  /**
   * Corpo de funcao que devolve o valor da ultima instrucao.
   * @param {string} source @returns {string|null}
   */
  function asFunctionBody(source) {
    var list = statements(String(source || ""));
    if (!list || !list.length) return null;
    var last = String(list[list.length - 1]);
    if (/^return\b/.test(last)) return list.join(";\n") + ";";
    if (NOT_EXPRESSION.test(last) || /^\{/.test(last)) return null;
    var head = list.slice(0, list.length - 1);
    return (head.length ? head.join(";\n") + ";\n" : "") + "return (\n" + last + "\n);";
  }

  /**
   * @param {string} userExpression expressao existente do usuario
   * @param {string} toolBody expressao da ferramenta, sem o cabecalho
   * @returns {string|null}
   */
  function compose(userExpression, toolBody) {
    var user = asFunctionBody(userExpression), tool = asFunctionBody(toolBody);
    if (!user || !tool) return null;
    return "var motionUserValue = (function () {\n" + user + "\n})();\n(function (value) {\n" + tool + "\n})(motionUserValue);";
  }

  /** @param {string} userExpression @returns {boolean} */
  function composable(userExpression) { return asFunctionBody(userExpression) !== null; }

  // Ferramentas com cabecalho na 1a linha guardam as duas origens na 2a linha,
  // para reconhecer a propria expressao e devolver a do usuario intacta.
  var STACK = "// motion-stack:";

  /** @param {string} expression @returns {{header:string, body:string}} */
  function splitHeader(expression) {
    var nl = expression.indexOf("\n");
    return nl < 0 ? {header: "", body: expression} : {header: expression.substring(0, nl + 1), body: expression.substring(nl + 1)};
  }

  /**
   * @param {string} toolExpression expressao completa da ferramenta (cabecalho + corpo)
   * @param {string} userExpression
   * @param {boolean=} inactive a do usuario estava desativada: e guardada, nao executada
   * @returns {string|null}
   */
  function stack(toolExpression, userExpression, inactive) {
    if (!userExpression) return toolExpression;
    var parts = splitHeader(toolExpression), composed = inactive ? parts.body : compose(userExpression, parts.body);
    if (!composed) return null;
    return parts.header + STACK + encodeURIComponent(userExpression) + ":" + encodeURIComponent(toolExpression) + (inactive ? ":off" : "") + "\n" + composed;
  }

  /** @param {string} expression @returns {{user:string, tool:string, inactive:boolean}|null} */
  function unstack(expression) {
    var source = String(expression || "").replace(/\r\n?/g, "\n"), parts = splitHeader(source);
    if (parts.body.indexOf(STACK) !== 0) return null;
    var end = parts.body.indexOf("\n"), fields = parts.body.substring(STACK.length, end < 0 ? parts.body.length : end).split(":");
    var user = fields[0], tool = fields[1];
    if (user === undefined || tool === undefined) return null;
    try { return {user: decodeURIComponent(user), tool: decodeURIComponent(tool), inactive: fields[2] === "off"}; } catch (bad) { return null; }
  }

  /** Expressao da ferramenta, com ou sem a do usuario por baixo. @param {string} expression @returns {string} */
  function toolOf(expression) { var s = unstack(expression); return s ? s.tool : String(expression || ""); }
  /** Expressao do usuario guardada, ou "". @param {string} expression @returns {string} */
  function userOf(expression) { var s = unstack(expression); return s ? s.user : ""; }

  /**
   * Expressao do usuario na propriedade (fora a gerenciada).
   * @param {any} property @param {(source:string) => boolean} isManaged @returns {{text:string, inactive:boolean}}
   */
  function userExpression(property, isManaged) {
    var current = String(property.expression || "");
    if (!current) return {text: "", inactive: false};
    var stacked = unstack(current);
    if (stacked) return {text: stacked.user, inactive: stacked.inactive};
    if (isManaged(current)) return {text: "", inactive: false};
    return {text: current, inactive: property.expressionEnabled === false};
  }

  /** A propriedade aceita a ferramenta (vazia, gerenciada ou combinavel)?
   * @param {any} property @param {(source:string) => boolean} isManaged @returns {boolean} */
  function accepts(property, isManaged) { var user = userExpression(property, isManaged); return !user.text || user.inactive || composable(user.text); }

  /**
   * Texto a gravar: a da ferramenta, empilhada sobre a do usuario se houver.
   * @param {any} property @param {string} toolExpression @param {(source:string) => boolean} isManaged
   * @returns {string}
   */
  function stackFor(property, toolExpression, isManaged) {
    var user = userExpression(property, isManaged), out = stack(toolExpression, user.text, user.inactive);
    if (out === null) throw new Error("A expressao existente nao pode ser combinada com a ferramenta.");
    return out;
  }

  global.MotionExpressionCompose = {
    compose: compose, composable: composable, stack: stack, unstack: unstack,
    toolOf: toolOf, userOf: userOf, accepts: accepts, stackFor: stackFor
  };
}($.global));
