import test from "node:test";
import assert from "node:assert/strict";
import {
  BANNED_CONSTRUCTS,
  findBannedConstructs,
  scanRepository,
  stripCommentsAndStrings
} from "../scripts/check-extendscript.mjs";

/**
 * O scanner e a unica coisa que impede sintaxe ES6 de chegar ao After Effects,
 * porque nenhuma ferramenta de compilacao consegue mais fazer esse trabalho.
 * Um scanner errado e pior que scanner nenhum: ele passa a sensacao de estar
 * protegendo. Entao ele tem teste positivo (detecta o que deve detectar) e teste
 * negativo (nao acusa o que e legitimo).
 */

test("cada construto banido e detectado em codigo real", () => {
  const cases = {
    "arrow-function": "var f = function (a) { return a; };\nvar g = (a) => a;",
    let: "let x = 1;",
    const: "const x = 1;",
    class: "class Foo {}",
    "template-literal": "var s = `abc`;",
    "spread-or-rest": "var a = fn.apply(null, [1, 2]);\nvar b = [...c];",
    "optional-chaining": "var v = obj?.prop;",
    "nullish-coalescing": "var v = a ?? b;",
    promise: "var p = new Promise(fn);",
    "async-await": "async function f() {}",
    "json-global": "var s = JSON.stringify(x);",
    "es5-object-statics": "var k = Object.keys(obj);",
    "array-statics": "var ok = Array.isArray(x);",
    "array-iteration-methods": "items.forEach(fn);",
    "string-trim": "var t = s.trim();",
    "function-bind": "var f = g.bind(this);",
    "target-directive": "#target aftereffects"
  };

  // Toda entrada de BANNED_CONSTRUCTS precisa ter um caso aqui: um construto sem
  // caso e uma regra que ninguem verificou.
  const covered = Object.keys(cases).sort();
  const declared = BANNED_CONSTRUCTS.map((entry) => entry.id).sort();
  assert.deepEqual(covered, declared, "Todo construto banido precisa de um caso de teste.");

  for (const [id, source] of Object.entries(cases)) {
    const findings = findBannedConstructs(source);
    assert.ok(
      findings.some((finding) => finding.construct === id),
      `O scanner não detectou "${id}" em:\n${source}`
    );
  }
});

test("codigo ES5 legitimo nao produz falso positivo", () => {
  const source = [
    "(function (global) {",
    "  var total = 0;",
    "  var i;",
    "  for (i = 0; i < 10; i += 1) {",
    "    total = total + i;",
    "  }",
    "  var ratio = total / 2;",
    "  var name = String(total);",
    "  function build(value) {",
    "    return { ok: true, value: value };",
    "  }",
    "  global.Demo = { build: build, ratio: ratio, name: name };",
    "}($.global));"
  ].join("\n");

  assert.deepEqual(findBannedConstructs(source), []);
});

test("ocorrencia dentro de string nao e acusada", () => {
  // O texto de erro do proprio host precisa poder falar sobre os construtos.
  const source = 'var message = "use let ou const e voce quebra o host";';
  assert.deepEqual(findBannedConstructs(source), []);
});

test("ocorrencia dentro de comentario nao e acusada", () => {
  const source = [
    "// nao use arrow function: a => a",
    "/* nem template literal: `x` */",
    "/** @param {unknown} value */",
    "function f(value) { return value; }"
  ].join("\n");

  assert.deepEqual(findBannedConstructs(source), []);
});

test("divisao nao e confundida com literal de expressao regular", () => {
  const source = "var half = total / 2;\nvar other = (a + b) / (c + d);";
  assert.deepEqual(findBannedConstructs(source), []);
});

test("literal de expressao regular nao vaza seu conteudo para a varredura", () => {
  // A regex contem barras e caracteres que poderiam parecer construtos.
  const source = 'var cleaned = value.replace(/^\\s+|\\s+$/g, "");';
  assert.deepEqual(findBannedConstructs(source), []);
});

test("stripCommentsAndStrings preserva a contagem de linhas", () => {
  const source = ["linha1();", "/* bloco", "   com", "   linhas */", "linha5();"].join("\n");
  const stripped = stripCommentsAndStrings(source);
  assert.equal(stripped.split("\n").length, source.split("\n").length);
});

test("o numero da linha reportado aponta para a linha certa", () => {
  const source = ["var a = 1;", "var b = 2;", "let c = 3;"].join("\n");
  const findings = findBannedConstructs(source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("o host do After Effects respeita o subconjunto ExtendScript", async () => {
  const { scannedFiles, problems } = await scanRepository();
  assert.ok(scannedFiles > 0, "O scanner não encontrou nenhum arquivo .jsx para verificar.");
  assert.deepEqual(problems, []);
});
