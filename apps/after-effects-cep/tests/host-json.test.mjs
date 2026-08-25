import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { encodeForEvalScript } from "../../../packages/contracts/dist/evalscript.js";

const { MotionJson } = await loadHostModules(["src/json.jsx"]);

test("round-trip preserva os tipos que o protocolo usa", () => {
  const fixtures = [
    {},
    [],
    { ok: true, data: null, error: null },
    { n: 0, negative: -12.5, exponent: 1e21 },
    { empty: "", nested: { deep: [1, [2, [3]]] } },
    { unicode: "Composição 日本語 🎬" },
    { booleans: [true, false], nulls: [null, null] }
  ];

  for (const fixture of fixtures) {
    const roundTripped = MotionJson.parse(MotionJson.stringify(fixture));
    assert.deepEqual(roundTripped, fixture, `Falhou para ${JSON.stringify(fixture)}`);
  }
});

test("stringify concorda byte a byte com JSON.stringify do Node", () => {
  // Os dois lados da ponte precisam produzir o mesmo texto para o mesmo valor.
  // Se divergirem, um checksum calculado de um lado nunca bate do outro.
  const fixtures = [
    { a: 1, b: "x" },
    [1, 2, 3],
    { nested: { deep: true } },
    { n: -0.5 }
  ];

  for (const fixture of fixtures) {
    assert.equal(MotionJson.stringify(fixture), JSON.stringify(fixture));
  }
});

test("stringify escapa todo controle e todo nao-ASCII, igual ao encoder do painel", () => {
  // A tabela precisa ser a mesma dos dois lados. Se o host escapasse menos, um
  // nome de composicao acentuado voltaria corrompido em maquinas com codepage
  // diferente — e so na maquina do usuario.
  for (const value of ["Composição", "日本語", "🎬", "\u0000\u0001\u001f", "\u2028\u2029"]) {
    const hostSide = MotionJson.stringify(value);
    const inner = hostSide.slice(1, -1);
    assert.equal(
      inner,
      encodeForEvalScript(value),
      `Host e painel escapam "${value}" de formas diferentes.`
    );
    assert.match(hostSide, /^[\x20-\x7E]*$/, "A saída do host precisa ser ASCII imprimível.");
  }
});

test("stringify emite null para NaN e Infinity", () => {
  // Nenhum dos dois existe em JSON. Emitir o token cru produziria um documento
  // que o parser do outro lado rejeita.
  assert.equal(MotionJson.stringify({ v: NaN }), '{"v":null}');
  assert.equal(MotionJson.stringify({ v: Infinity }), '{"v":null}');
});

test("stringify omite propriedade undefined em vez de emitir token invalido", () => {
  assert.equal(MotionJson.stringify({ a: 1, b: undefined }), '{"a":1}');
});

test("parse recusa __proto__, constructor e prototype como chave", () => {
  // Num literal de objeto do ExtendScript, __proto__ altera a cadeia de
  // prototipos em vez de virar propriedade. Como este parser monta objetos a
  // partir de dado que atravessou a fronteira, aceitar a chave deixaria o dado
  // alterar o comportamento de objetos nao relacionados.
  for (const key of ["__proto__", "constructor", "prototype"]) {
    assert.throws(
      () => MotionJson.parse(`{"${key}":{"polluted":true}}`),
      /chave proibida/,
      `${key} foi aceita como chave.`
    );
  }
});

test("parse recusa aninhamento acima do limite", () => {
  const depth = MotionJson.MAX_DEPTH + 5;
  const deep = "[".repeat(depth) + "1" + "]".repeat(depth);

  // O ExtendScript nao tem protecao de pilha util: profundo o bastante derruba o
  // After Effects inteiro em vez de lancar um erro reportavel.
  assert.throws(() => MotionJson.parse(deep), /profundidade máxima/);
});

test("parse aceita aninhamento dentro do limite", () => {
  const depth = 30;
  const deep = "[".repeat(depth) + "1" + "]".repeat(depth);
  assert.doesNotThrow(() => MotionJson.parse(deep));
});

test("parse recusa entrada truncada com erro tipado, nao SyntaxError nativo", () => {
  const truncated = ['{"a":', '{"a":1', '["x"', '"sem fechamento', "{", "["];

  for (const input of truncated) {
    assert.throws(
      () => MotionJson.parse(input),
      (error) => error instanceof Error && /JSON inválido|sem fechamento/.test(error.message),
      `"${input}" não produziu erro reconhecível.`
    );
  }
});

test("parse recusa conteudo extra depois do valor", () => {
  // Sem esta checagem, '{"ok":true} app.quit()' seria aceito, e o lixo depois do
  // valor passaria despercebido.
  assert.throws(() => MotionJson.parse('{"ok":true} lixo'), /conteúdo extra/);
});

test("parse recusa literal desconhecido", () => {
  assert.throws(() => MotionJson.parse("undefined"), /JSON inválido/);
  assert.throws(() => MotionJson.parse("tru"), /literal desconhecido/);
});

test("parse recusa escape unicode malformado", () => {
  assert.throws(() => MotionJson.parse('"\\u12"'), /escape unicode malformado/);
  assert.throws(() => MotionJson.parse('"\\uZZZZ"'), /escape unicode malformado/);
});

test("parse recusa controles crus dentro de strings", () => {
  for (const control of ["\u0000", "\u0001", "\n", "\r", "\t"]) {
    assert.throws(
      () => MotionJson.parse(`"antes${control}depois"`),
      /caractere de controle não escapado/,
      `Controle U+${control.charCodeAt(0).toString(16).padStart(4, "0")} foi aceito sem escape.`
    );
  }
});

test("parse aplica a gramática estrita de números JSON", () => {
  for (const malformed of [
    "01",
    "-01",
    "1.",
    "-.1",
    "1e",
    "1e+",
    "1e-",
    "1e9999",
    "--1",
    "+1"
  ]) {
    assert.throws(
      () => MotionJson.parse(malformed),
      /JSON inválido/,
      `Número inválido ${malformed} foi aceito.`
    );
  }

  for (const valid of ["0", "-0", "12", "-12.5", "1e3", "1E-2", "-1.25e+3"]) {
    assert.equal(MotionJson.parse(valid), JSON.parse(valid), `Número válido ${valid} foi recusado.`);
  }
});

test("parse decodifica escape unicode de volta ao caractere", () => {
  assert.equal(MotionJson.parse('"\\u00e7"'), "ç");
  assert.equal(MotionJson.parse('"\\ud83c\\udfac"'), "🎬");
});

test("parse aceita espaco em branco em volta dos tokens", () => {
  assert.deepEqual(MotionJson.parse('  {  "a"  :  [ 1 , 2 ]  }  '), { a: [1, 2] });
});

test("parse recusa entrada acima do limite de tamanho", () => {
  const huge = '"' + "a".repeat(MotionJson.MAX_INPUT_LENGTH + 1) + '"';
  assert.throws(() => MotionJson.parse(huge), /acima do limite/);
});

test("o que o painel codifica, o host decodifica de volta ao valor original", () => {
  // O teste de contrato ponta a ponta da serializacao: painel serializa e
  // escapa, host desescapa e parseia. Se as duas tabelas divergirem, e aqui que
  // aparece.
  const request = {
    protocolVersion: 1,
    requestId: "req-abc",
    command: "ae.context.read",
    args: { nome: "Composição ção", emoji: "🎬" },
    context: { host: "after-effects", hostVersion: "25.0" }
  };

  const json = JSON.stringify(request);
  const encoded = encodeForEvalScript(json);

  // O host recebe a string ja desescapada pelo interpretador do ExtendScript ao
  // avaliar o literal. Aqui isso e reproduzido decodificando os escapes.
  const asHostWouldSee = encoded.replace(/\\u([0-9a-fA-F]{4})|\\(["\\])/g, (_m, hex, lit) =>
    hex !== undefined ? String.fromCharCode(parseInt(hex, 16)) : lit
  );

  assert.deepEqual(MotionJson.parse(asHostWouldSee), request);
});
