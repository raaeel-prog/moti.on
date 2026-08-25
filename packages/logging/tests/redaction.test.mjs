import test from "node:test";
import assert from "node:assert/strict";

import { PLACEHOLDER, isSensitiveKey, redactText, redactValue } from "../dist/redaction.js";

/**
 * A §25 proibe registrar nome de projeto, caminho de midia e credencial, e a
 * §26 manda o log ser exportavel pelo usuario. Um vazamento aqui nao fica na
 * maquina dele: sai no bundle de suporte.
 */

test("caminho absoluto do Windows sobrevive so como extensao", () => {
  // Arrange
  const message = "Projeto aberto em C:\\Users\\rael\\Documentos\\cliente.aep";

  // Act
  const result = redactText(message);

  // Assert
  assert.ok(!result.includes("rael"), "o nome da conta do Windows nao pode sobreviver");
  assert.ok(!result.includes("cliente"), "o nome do arquivo costuma ser o nome do cliente");
  assert.equal(result, `Projeto aberto em «caminho»/${PLACEHOLDER}.aep`);
});

test("caminho UNC de servidor tambem e reduzido", () => {
  const result = redactText("Importado de \\\\studio-nas\\projetos\\take01.mov");

  assert.ok(!result.includes("studio-nas"));
  assert.match(result, /«caminho»\/«redigido»\.mov/);
});

test("caminho POSIX de diretorio pessoal e reduzido", () => {
  const result = redactText("/Users/rael/Movies/take01.mov");

  assert.ok(!result.includes("rael"));
  assert.match(result, /«caminho»\/«redigido»\.mov/);
});

test("caminho Windows com espacos e redigido por inteiro", () => {
  const result = redactText(
    "Falhou em C:\\Users\\Ana Silva\\Cliente Confidencial\\cena final.aep ao abrir."
  );

  assert.equal(result, `Falhou em «caminho»/${PLACEHOLDER}.aep ao abrir.`);
  assert.ok(!result.includes("Ana Silva"));
  assert.ok(!result.includes("Cliente Confidencial"));
  assert.ok(!result.includes("cena final"));
});

test("caminho POSIX com espacos e redigido por inteiro", () => {
  const result = redactText("/Users/Ana Silva/Cliente X/take final.mov nao abriu");

  assert.equal(result, `«caminho»/${PLACEHOLDER}.mov nao abriu`);
  assert.ok(!result.includes("Ana Silva"));
  assert.ok(!result.includes("Cliente X"));
});

test("diretorio com espacos entre aspas tambem e redigido", () => {
  const result = redactText('cache em "C:\\Users\\Ana Silva\\Projeto Secreto"');

  assert.equal(result, `cache em "«caminho»/${PLACEHOLDER}"`);
  assert.ok(!result.includes("Ana Silva"));
});

test("diretorio sem aspas nem extensao falha fechado e nao deixa sufixo privado", () => {
  const windows = redactText("cache em C:\\Users\\Ana Silva\\Projeto Ultra Secreto");
  const posix = redactText("cache em /Users/Ana Silva/Projeto Ultra Secreto");

  assert.equal(windows, `cache em «caminho»/${PLACEHOLDER}`);
  assert.equal(posix, `cache em «caminho»/${PLACEHOLDER}`);
  assert.ok(!windows.includes("Ana Silva"));
  assert.ok(!posix.includes("Ultra Secreto"));
});

test("e-mail e atribuicao de segredo saem do texto", () => {
  const result = redactText("login=rael@estudio.com api_key: abc123def456ghi");

  assert.ok(!result.includes("rael@estudio.com"));
  assert.ok(!result.includes("abc123def456ghi"));
  assert.match(result, /api_key=«redigido»/);
});

test("Authorization redige esquema e credencial, inclusive token curto", () => {
  const bearer = redactText("Authorization: Bearer short-secret");
  const basic = redactText("Proxy-Authorization: Basic dXNlcjpwYXNz");

  assert.equal(bearer, `Authorization=${PLACEHOLDER}`);
  assert.equal(basic, `Proxy-Authorization=${PLACEHOLDER}`);
  assert.ok(!bearer.includes("short-secret"));
  assert.ok(!basic.includes("dXNlcjpwYXNz"));
});

test("Bearer solto nao deixa a credencial sobreviver", () => {
  const result = redactText("falha autenticando Bearer ey.short-token");

  assert.equal(result, `falha autenticando Bearer ${PLACEHOLDER}`);
  assert.ok(!result.includes("short-token"));
});

test("Cookie e Set-Cookie redigem a linha inteira", () => {
  const request = redactText("Cookie: session=abc123; theme=dark");
  const response = redactText("Set-Cookie: refresh=segredo; HttpOnly; Secure");

  assert.equal(request, `Cookie=${PLACEHOLDER}`);
  assert.equal(response, `Set-Cookie=${PLACEHOLDER}`);
  assert.ok(!request.includes("abc123"));
  assert.ok(!response.includes("segredo"));
});

test("URL preserva somente origem, nunca caminho, query, fragmento ou credencial", () => {
  // A origem é diagnóstico real — diz com qual provedor o painel falou. O
  // restante pode carregar nomes criativos e tokens assinados.
  const comQuery = redactText("GET https://api.exemplo.com/v1/assets?token=segredo123");
  const comCredencial = redactText("https://rael:senha@api.exemplo.com:8443/v1#cliente");

  assert.equal(comQuery, `GET https://api.exemplo.com/${PLACEHOLDER}`);
  assert.equal(comCredencial, `https://api.exemplo.com:8443/${PLACEHOLDER}`);
  assert.ok(!comCredencial.includes("senha"));
});

test("URL assinada de mídia não preserva projeto nem nome do ativo no caminho", () => {
  const result = redactText(
    "GET https://cdn.exemplo.com/Cliente-Ultra-Secreto/Projeto-X/cena-final.mov?X-Signature=abc"
  );

  assert.equal(result, `GET https://cdn.exemplo.com/${PLACEHOLDER}`);
  assert.ok(!result.includes("Cliente-Ultra-Secreto"));
  assert.ok(!result.includes("cena-final.mov"));
  assert.ok(!result.includes("X-Signature"));
});

test("https nao e confundido com caminho do Windows", () => {
  // Regressao: sem o lookbehind, o "s:/" de "https://" casa como letra de
  // unidade e toda URL do log vira «caminho».
  const result = redactText("https://api.exemplo.com/v1/assets");

  assert.equal(result, `https://api.exemplo.com/${PLACEHOLDER}`);
});

test("token opaco longo e substituido", () => {
  assert.equal(redactText("a".repeat(40)), PLACEHOLDER);
});

test("campo sensivel vira descricao de tamanho, nao o valor", () => {
  // Arrange: "não salvo" e "Campanha Verão 2026" sao diagnosticos diferentes.
  // O tamanho distingue os dois sem revelar nada.
  const payload = { projectName: "Campanha Verão", compWidth: 1920, isComposition: true };

  // Act
  const result = redactValue(payload);

  // Assert
  assert.equal(result.projectName, `${PLACEHOLDER} (14 caracteres)`);
  assert.equal(result.compWidth, 1920, "dimensao nao identifica ninguem e fica");
  assert.equal(result.isComposition, true);
});

test("reconhece as grafias que o mesmo campo assume entre camadas", () => {
  assert.equal(isSensitiveKey("project_name"), true);
  assert.equal(isSensitiveKey("projectName"), true);
  assert.equal(isSensitiveKey("access-token"), true);
  assert.equal(isSensitiveKey("projectFingerprint"), true);
  assert.equal(isSensitiveKey("set-cookie"), true);
  assert.equal(isSensitiveKey("session_id"), true);
  assert.equal(isSensitiveKey("client-secret"), true);
  assert.equal(isSensitiveKey("compWidth"), false);
  assert.equal(isSensitiveKey("durationMs"), false);
});

test("estrutura profunda demais e cortada em vez de travar o painel", () => {
  // Arrange
  let deep = { value: "fim" };
  for (let i = 0; i < 10; i += 1) {
    deep = { nested: deep };
  }

  // Act
  const result = redactValue(deep);

  // Assert
  assert.match(JSON.stringify(result), /profundidade excedida/);
});

test("array longo e truncado com contagem do que sobrou", () => {
  const result = redactValue(new Array(80).fill(1));

  assert.equal(result.length, 51);
  assert.equal(result[50], "«+30 itens»");
});

test("objeto aninhado recebe as regras de texto em cada nivel", () => {
  const result = redactValue({
    error: { code: "AE_UNKNOWN", details: { raw: "falhou em D:\\midia\\take.mov" } }
  });

  assert.equal(result.error.code, "AE_UNKNOWN");
  assert.ok(!result.error.details.raw.includes("midia"));
});

test("funcao nao vaza corpo para o log", () => {
  const result = redactValue({ callback: () => "segredo no corpo" });

  assert.equal(result.callback, PLACEHOLDER);
});
