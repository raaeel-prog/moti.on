import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("IDs dos hosts são distintos e consistentes", async () => {
  const premiere = JSON.parse(await readFile(path.join(root, "src/premiere-uxp/manifest.json"), "utf8"));
  const ae = await readFile(path.join(root, "src/after-effects-cep/CSXS/manifest.xml"), "utf8");

  assert.equal(premiere.id, "com.motion.plugin.premiere");
  assert.match(ae, /Extension Id="com\.motion\.plugin\.ae\.panel"/);
  assert.notEqual(premiere.id, "com.motion.plugin.ae.panel");
});

test("o bundle CEP e o painel CEP têm identificadores próprios", async () => {
  const ae = await readFile(path.join(root, "src/after-effects-cep/CSXS/manifest.xml"), "utf8");

  // O bundle e o painel sao entidades distintas para o CEP: o bundle e a unidade
  // de instalacao, o painel e a extensao dentro dela. Usar o mesmo id nos dois
  // carrega em alguns ambientes e falha em outros, o que produz um bug que so
  // aparece na maquina do usuario.
  assert.match(ae, /ExtensionBundleId="com\.motion\.plugin"/);
  assert.doesNotMatch(ae, /ExtensionBundleId="com\.motion\.plugin\.ae\.panel"/);
});
