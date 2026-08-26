import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainUrl = new URL("../client/src/main.ts", import.meta.url);

test("painel envia somente tokens tipados para o comando LoopOut allowlisted", async () => {
  const source = await readFile(mainUrl, "utf8");
  const apply = source.slice(source.indexOf("async function applyLoopOut("), source.indexOf("async function createDemo("));

  assert.match(apply, /"ae\.expression\.loopout"/);
  assert.match(apply, /conflictMode:\s*"skip"/);
  assert.match(apply, /\{\s*preserveSelection:\s*true\s*\}/);
  assert.doesNotMatch(apply, /allowDestructive/);
  assert.doesNotMatch(apply, /source\s*:/);
});

test("painel valida composicao, inteiros e limites antes de atravessar a ponte", async () => {
  const source = await readFile(mainUrl, "utf8");
  const validation = source.slice(source.indexOf("function isLoopOutDraftValid("), source.indexOf("function renderLoopOut("));
  const apply = source.slice(source.indexOf("async function applyLoopOut("), source.indexOf("async function createDemo("));

  assert.match(validation, /Number\.isInteger\(draft\.numKeyframes\)/);
  assert.match(validation, /draft\.numKeyframes >= 1 && draft\.numKeyframes <= 1000/);
  assert.match(validation, /draft\.duration > 0 && draft\.duration <= 3600/);
  assert.match(apply, /!state\.context\?\.isComposition/);
  assert.match(apply, /!isLoopOutDraftValid\(draft\)/);
});

test("modo continue zera todos os controles que a API oficial nao aceita", async () => {
  const source = await readFile(mainUrl, "utf8");
  const apply = source.slice(source.indexOf("async function applyLoopOut("), source.indexOf("async function createDemo("));

  assert.match(apply, /draft\.type !== "continue" && draft\.range === "duration"/);
  assert.match(apply, /draft\.type !== "continue" && draft\.range === "keys"/);
  assert.match(apply, /const duration = useDuration \? draft\.duration : 0/);
});
