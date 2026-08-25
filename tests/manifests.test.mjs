import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("IDs dos hosts são distintos e consistentes", async () => {
  const premiere = JSON.parse(await readFile(path.join(root, "apps/premiere-uxp/manifest.json"), "utf8"));
  const ae = await readFile(path.join(root, "apps/after-effects-cep/CSXS/manifest.xml"), "utf8");

  assert.equal(premiere.id, "com.motion.plugin.premiere");
  assert.match(ae, /Extension Id="com\.motion\.plugin\.ae\.panel"/);
  assert.notEqual(premiere.id, "com.motion.plugin.ae.panel");
});

test("o bundle CEP e o painel CEP têm identificadores próprios", async () => {
  const ae = await readFile(path.join(root, "apps/after-effects-cep/CSXS/manifest.xml"), "utf8");

  // O bundle e o painel sao entidades distintas para o CEP: o bundle e a unidade
  // de instalacao, o painel e a extensao dentro dela. Usar o mesmo id nos dois
  // carrega em alguns ambientes e falha em outros, o que produz um bug que so
  // aparece na maquina do usuario.
  assert.match(ae, /ExtensionBundleId="com\.motion\.plugin"/);
  assert.doesNotMatch(ae, /ExtensionBundleId="com\.motion\.plugin\.ae\.panel"/);
});

test("o manifest CEP delega o bootstrap ExtendScript ao adapter", async () => {
  const ae = await readFile(path.join(root, "apps/after-effects-cep/CSXS/manifest.xml"), "utf8");

  assert.match(ae, /<MainPath>\.\/client\/index\.html<\/MainPath>/);
  assert.doesNotMatch(
    ae,
    /<ScriptPath(?:\s|>)/,
    "ScriptPath reintroduz o carregamento automático que falhou no AE 26.3."
  );
});

test("os dois hosts recusam painel abaixo da largura mínima suportada de 280 px", async () => {
  const premiere = JSON.parse(
    await readFile(path.join(root, "apps/premiere-uxp/manifest.json"), "utf8")
  );
  const ae = await readFile(
    path.join(root, "apps/after-effects-cep/CSXS/manifest.xml"),
    "utf8"
  );

  const premiereMainPanel = premiere.entrypoints.find(
    (entry) => entry.type === "panel" && entry.id === "mainPanel"
  );
  assert.ok(premiereMainPanel, "Painel UXP mainPanel ausente.");
  assert.equal(premiereMainPanel.minimumSize?.width, 280);

  const aeMinimumSize = ae.match(/<MinSize>([\s\S]*?)<\/MinSize>/)?.[1] ?? "";
  assert.match(aeMinimumSize, /<Width>\s*280\s*<\/Width>/);
});
