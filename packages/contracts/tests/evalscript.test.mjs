import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_INLINE_CHARS,
  HOST_BOOTSTRAP_OK,
  buildDispatchCall,
  buildHostBootstrapCall,
  decodeFromHost,
  encodeForEvalScript,
  needsTempFileTransport
} from "../dist/evalscript.js";
import * as evalScriptContracts from "../dist/evalscript.js";

/**
 * Estes testes cobrem o ponto mais perigoso da ponte painel-host. `evalScript`
 * recebe uma string de codigo que o After Effects avalia com acesso total ao
 * projeto e ao sistema de arquivos. Um escape incompleto aqui nao e bug de
 * formatacao: e execucao de codigo arbitrario dentro do host.
 */

test("escapa aspas duplas", () => {
  assert.equal(encodeForEvalScript('a"b'), 'a\\"b');
});

test("escapa barra invertida sem duplicar um escape que ja existia", () => {
  // Entrada: a \ " b  (tres caracteres literais entre a e b)
  // A barra vira \\ e a aspa vira \" — nao \\\" nem \\\\.
  assert.equal(encodeForEvalScript('a\\"b'), 'a\\\\\\"b');
  assert.equal(decodeFromHost(encodeForEvalScript('a\\"b')), 'a\\"b');
});

test("escapa todo caractere de controle de U+0000 a U+001F", () => {
  // O serializador do starter tratava apenas \\n, \\r e \\t. Os outros 29
  // caracteres de controle saiam crus, o que produz JSON invalido.
  for (let code = 0x00; code <= 0x1f; code += 1) {
    const encoded = encodeForEvalScript(String.fromCharCode(code));
    assert.equal(
      encoded,
      "\\u" + code.toString(16).padStart(4, "0"),
      `U+${code.toString(16).padStart(4, "0")} nao foi escapado.`
    );
  }
});

test("escapa U+2028 e U+2029", () => {
  // Separadores de linha Unicode: o JSON os aceita crus, mas eles terminam um
  // literal de string em JavaScript. Causa classica de SyntaxError em codigo
  // gerado.
  assert.equal(encodeForEvalScript(" "), "\\u2028");
  assert.equal(encodeForEvalScript(" "), "\\u2029");
});

test("escapa todo nao-ASCII, inclusive acento comum em portugues", () => {
  // O canal de retorno do evalScript nao tem codificacao garantida e no Windows
  // o ExtendScript decodifica pela codepage do sistema. "Composicao" com cedilha
  // e til atravessaria corrompido em maquinas com codepage diferente — e
  // corrompido de um jeito que so aparece na maquina do usuario.
  const cases = [
    "Composição",
    "日本語",
    "‏", // marca de direcao RTL, invisivel
    "café",
    "Ação"
  ];

  for (const value of cases) {
    const encoded = encodeForEvalScript(value);
    assert.match(encoded, /^[\x20-\x7E]*$/, `"${value}" produziu saida nao-ASCII.`);
    assert.equal(decodeFromHost(encoded), value, `"${value}" nao sobreviveu ao round-trip.`);
  }
});

test("emoji vira par substituto escapado e sobrevive ao round-trip", () => {
  const emoji = "🎬";
  const encoded = encodeForEvalScript(emoji);
  assert.equal(encoded, "\\ud83c\\udfac");
  assert.equal(decodeFromHost(encoded), emoji);
});

test("substituto solitario e escapado, nao rejeitado", () => {
  // Dado malformado deve atravessar como dado. Rejeitar aqui transformaria uma
  // string estranha num erro de sintaxe do lado de la, que e muito pior de
  // diagnosticar.
  const lone = "\ud83c";
  const encoded = encodeForEvalScript(lone);
  assert.equal(encoded, "\\ud83c");
  assert.match(encoded, /^[\x20-\x7E]*$/);
});

test("a saida e sempre ASCII imprimivel", () => {
  // O fonte contém o escape textual, não um byte NUL literal. Isso mantém o
  // arquivo auditável por Git/rg sem mudar o valor exercitado em runtime.
  const mixed = 'a"b\\c\nd\te\u0000f日本 🎬';
  assert.match(encodeForEvalScript(mixed), /^[\x20-\x7E]*$/);
});

test("buildDispatchCall produz a chamada com exatamente duas aspas nao escapadas", () => {
  const call = buildDispatchCall('{"command":"ae.context.read"}');

  assert.ok(call.startsWith('MotionAE.dispatch("'));
  assert.ok(call.endsWith('")'));

  // Conta aspas que nao estao precedidas por barra invertida: so as duas que
  // delimitam o argumento podem existir.
  const unescaped = [...call.matchAll(/(^|[^\\])"/g)].length;
  assert.equal(unescaped, 2, `A chamada tem ${unescaped} aspas não escapadas:\n${call}`);
});

/**
 * Encontra onde um literal de string JavaScript iniciado em `start` termina,
 * respeitando barra invertida — ou seja, como o parser do ExtendScript veria.
 *
 * Procurar a substring crua nao serve: numa carga escapada corretamente, a
 * sequencia `");app...` continua aparecendo no texto, so que precedida por uma
 * barra que a neutraliza. O que importa nao e se os caracteres aparecem, e sim
 * ONDE o literal termina.
 */
function findLiteralEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === '"') return index;
  }
  return -1;
}

test("payload de injecao sobrevive como dado e nao termina o literal", () => {
  const injection = '");app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);//';
  const call = buildDispatchCall(JSON.stringify({ evil: injection }));

  const openQuote = call.indexOf('"');
  const closeQuote = findLiteralEnd(call, openQuote + 1);

  // A propriedade que importa: o literal so termina na ultima aspa da chamada.
  // Se a injecao tivesse conseguido fechar a string antes, tudo depois viraria
  // codigo executavel dentro do After Effects.
  assert.equal(
    closeQuote,
    call.length - 2,
    `O literal terminou em ${closeQuote}, e não no fim da chamada (${call.length - 2}). ` +
      `A injeção fechou a string:\n${call}`
  );

  // Nada sobra fora do literal alem do fecha-parenteses.
  assert.equal(call.slice(closeQuote), '")');

  // E a carga precisa chegar do outro lado exatamente como entrou: escapar nao
  // pode virar sanitizar. Descartar caracteres seria corromper dado do usuario.
  const inner = call.slice(openQuote + 1, closeQuote);
  assert.deepEqual(JSON.parse(decodeFromHost(inner)), { evil: injection });
});

test("fuzz semeado: round-trip preserva 500 strings aleatorias", () => {
  // Gerador deterministico: um teste que falha uma vez em cada cem execucoes e
  // pior que teste nenhum, porque ensina a equipe a reexecutar ate passar.
  let seed = 0x2f6e2b1;
  const nextInt = (bound) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % bound;
  };

  for (let iteration = 0; iteration < 500; iteration += 1) {
    let value = "";
    const length = nextInt(40);
    for (let index = 0; index < length; index += 1) {
      // Cobre controles, ASCII, acentos, CJK, separadores de linha e substitutos.
      value += String.fromCharCode(nextInt(0x11000));
    }

    const encoded = encodeForEvalScript(value);
    assert.match(encoded, /^[\x20-\x7E]*$/, `Iteração ${iteration} produziu não-ASCII.`);
    assert.equal(decodeFromHost(encoded), value, `Iteração ${iteration} não sobreviveu ao round-trip.`);
  }
});

test("needsTempFileTransport mede a string ja codificada", () => {
  // Escapar acento multiplica o tamanho por seis. Medir a string original faria
  // um documento de legenda em portugues passar como "cabe inline" e estourar o
  // canal.
  const accented = "ç".repeat(Math.ceil(MAX_INLINE_CHARS / 6) + 10);

  assert.ok(accented.length < MAX_INLINE_CHARS, "O fixture precisa ser menor que o limite antes de codificar.");
  assert.ok(
    needsTempFileTransport(accented),
    "Uma string abaixo do limite antes de codificar, mas acima depois, precisa ir por arquivo temporário."
  );
});

test("o limite canônico preserva o alias legado", () => {
  assert.equal(evalScriptContracts.MAX_INLINE_EVALSCRIPT_CHARS, MAX_INLINE_CHARS);
});

test("o contrato não expõe sonda que possa pular o bootstrap obrigatório", () => {
  assert.equal("HOST_PRESENCE_PROBE" in evalScriptContracts, false);
});

test("o limite inline é inclusivo e rejeita somente acima do teto", () => {
  assert.equal(needsTempFileTransport("x".repeat(MAX_INLINE_CHARS)), false);
  assert.equal(needsTempFileTransport("x".repeat(MAX_INLINE_CHARS + 1)), true);
});

test("payload pequeno vai inline", () => {
  assert.ok(!needsTempFileTransport(JSON.stringify({ command: "ae.context.read", args: {} })));
});

/**
 * Bootstrap do host.
 *
 * O caminho da extensao vem do CSInterface, e nao do usuario — mas passa pelo
 * mesmo encoder assim mesmo: ele contem o nome da conta do Windows, que pode ter
 * acento, espaco e aspa. Um caminho como C:\Users\jo"ao\ fecharia o literal e
 * transformaria o resto em codigo dentro do After Effects.
 */

test("bootstrap normaliza separador do Windows para barra normal", () => {
  const call = buildHostBootstrapCall("C:\\Users\\rael\\extensions\\com.motion.plugin");

  assert.ok(call.includes("C:/Users/rael/extensions/com.motion.plugin/host/index.jsx"));
  assert.ok(!call.includes("\\\\"), "nenhuma barra invertida deve sobreviver no caminho");
});

test("bootstrap remove barra final antes de concatenar o host", () => {
  const call = buildHostBootstrapCall("/Applications/extensions/com.motion.plugin///");

  assert.ok(call.includes("/Applications/extensions/com.motion.plugin/host/index.jsx"));
  assert.ok(!call.includes("plugin///host"));
});

test("bootstrap escapa acento do caminho em vez de emitir byte nao ASCII", () => {
  const call = buildHostBootstrapCall("C:/Users/joão/extensions/com.motion.plugin");

  assert.ok(!call.includes("ã"), "o caminho nao pode viajar com caractere fora de ASCII");
  assert.ok(call.includes("jo\\u00e3o"), "o acento precisa viajar como escape \\uXXXX");
});

test("aspa no caminho nao fecha o literal do bootstrap", () => {
  // Um caminho hostil nao deve conseguir emendar codigo depois do literal.
  const call = buildHostBootstrapCall('C:/Users/x"); $.writeln("injetado"); //');

  // Localiza onde o literal REALMENTE termina, respeitando escapes: procurar a
  // primeira aspa crua acharia a aspa ja escapada e daria falso negativo.
  const abertura = call.indexOf('new File("') + 'new File("'.length;
  let fechamento = -1;
  for (let i = abertura; i < call.length; i += 1) {
    if (call[i] === "\\") {
      i += 1;
      continue;
    }
    if (call[i] === '"') {
      fechamento = i;
      break;
    }
  }

  assert.equal(
    call.slice(fechamento),
    '"));return (typeof $.global.MotionAE === "object" && $.global.MotionAE !== null && ' +
      'typeof $.global.MotionAE.dispatch === "function")?"function":"undefined";' +
      '}catch(e){return "bootstrap-failed:" + String(e.message || e) + ":L" + String(e.line || "?");}})()',
    "o literal precisa terminar exatamente onde o construtor previu"
  );
});

test("bootstrap só aceita MotionAE com dispatcher chamável", () => {
  const call = buildHostBootstrapCall("/tmp/extensao");

  assert.ok(call.includes("typeof $.global.MotionAE.dispatch"));
  assert.equal(HOST_BOOTSTRAP_OK, "function");
});

test("a chamada de bootstrap inteira e ASCII imprimivel", () => {
  const call = buildHostBootstrapCall("C:/Users/joão/日本語/extensões");

  assert.match(call, /^[\x20-\x7E]*$/);
});
