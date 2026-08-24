import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/**
 * Contrato do output de build.
 *
 * Substitui tests/build-parity.test.mjs, que comparava dist/ contra o snapshot
 * capturado no CHMS-001b. Aquele gate cumpriu o papel dele: provou que a
 * migracao para workspaces do CHMS-002 nao alterou nenhum artefato. Depois disso
 * o CHMS-004 e o CHMS-005 substituiram deliberadamente as duas camadas de host e
 * os dois paineis, e continuar comparando com o snapshot antigo so produziria uma
 * lista de divergencias declaradas que cresce a cada commit sem carregar sinal —
 * a forma mais comum de um gate morrer sem que ninguem perceba.
 *
 * O snapshot continua em tests/fixtures/ como registro historico do starter, e
 * docs/BASELINE_STARTER_0.1.0.md explica o que ele significa.
 *
 * O que este arquivo mede agora e o contrato do build em si: exatamente quais
 * arquivos os hosts carregam, e que o codigo de terceiros nao foi modificado.
 */

/**
 * Inventario exato do que o build produz.
 *
 * Lista literal, e nao um padrao: acrescentar ou remover um arquivo do que os
 * hosts carregam e uma decisao, e precisa aparecer no diff. Um arquivo a mais em
 * dist/ pode ser um vazamento de fonte; um a menos e um painel que nao carrega.
 */
const EXPECTED_DIST_FILES = [
  "BUILD_INFO.json",

  // After Effects: painel CEP + camada de host montada.
  "after-effects-cep/CSXS/manifest.xml",
  "after-effects-cep/client/index.html",
  "after-effects-cep/client/lib/CSInterface.js",
  "after-effects-cep/client/main.js",
  "after-effects-cep/host/index.jsx",
  "after-effects-cep/styles/theme.css",

  // Premiere Pro: painel UXP. Nao ha camada de host separada — o UXP roda painel
  // e codigo de host no mesmo runtime, entao o adapter entra no proprio bundle.
  "premiere-uxp/index.html",
  "premiere-uxp/main.js",
  "premiere-uxp/manifest.json",
  "premiere-uxp/styles/theme.css"
];

async function collectDistFiles(directory, base = directory, accumulated = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDistFiles(full, base, accumulated);
    } else if (entry.isFile()) {
      accumulated.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return accumulated;
}

test("dist/ contem exatamente os arquivos declarados", async () => {
  const actual = (await collectDistFiles(dist)).sort();
  assert.deepEqual(
    actual,
    [...EXPECTED_DIST_FILES].sort(),
    "O conjunto de arquivos do build mudou. Os hosts carregam por caminho fixo: " +
      "um arquivo a mais pode ser vazamento de fonte, e um a menos é um painel que não carrega."
  );
});

test("CSInterface.js chega ao build byte a byte igual ao arquivo da Adobe", async () => {
  // Codigo de terceiros distribuido pela Adobe. Modifica-lo — mesmo so
  // reformatando — tornaria impossivel comparar com a versao oficial quando
  // houver suspeita de bug, e e o unico arquivo do build que nao e nosso.
  const vendored = await readFile(
    path.join(root, "apps/after-effects-cep/client/lib/CSInterface.js")
  );
  const shipped = await readFile(path.join(dist, "after-effects-cep/client/lib/CSInterface.js"));

  assert.equal(
    createHash("sha256").update(shipped).digest("hex"),
    createHash("sha256").update(vendored).digest("hex")
  );
});

test("nenhum arquivo de desenvolvimento vazou para dist/", async () => {
  const files = await collectDistFiles(dist);
  const leaked = files.filter((file) => {
    const base = path.basename(file);
    return (
      base === "package.json" ||
      base === ".debug" ||
      base.startsWith("tsconfig") ||
      base.endsWith(".tsbuildinfo") ||
      base.endsWith(".ts") ||
      base.endsWith(".map") ||
      file.includes("/tests/") ||
      file.includes("/types/") ||
      file.includes("/src/") ||
      file.includes("/generated/")
    );
  });

  assert.deepEqual(leaked, [], "Arquivos de desenvolvimento no output:\n" + leaked.join("\n"));
});

test("o ExtendScript montado comeca com a diretiva #target, exatamente uma vez", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  assert.ok(
    source.startsWith("#target aftereffects\n"),
    "O After Effects exige a diretiva #target na primeira linha do script."
  );

  // Conta so ocorrencias em posicao de codigo: o cabecalho de documentacao do
  // fonte menciona a diretiva em prosa.
  const occurrences = (source.match(/^#target\b/gm) || []).length;
  assert.equal(occurrences, 1);
});

test("o host montado registra todo comando que o descriptor declara", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  // Um descriptor sem implementacao vira um botao que responde "não implementado
  // neste build". Compila, passa no lint, e so aparece quando alguem clica.
  const declared = [...source.matchAll(/^\s{4}"(ae\.[a-zA-Z.]+)":\s*\{/gm)].map((m) => m[1]);
  const registered = [...source.matchAll(/MotionRegistry\.register\("(ae\.[a-zA-Z.]+)"/g)].map(
    (m) => m[1]
  );

  assert.ok(declared.length > 0, "Nenhum descriptor foi encontrado no host montado.");
  assert.deepEqual(registered.sort(), declared.sort());
});

test("o host montado expoe apenas MotionAE.dispatch", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  assert.match(source, /global\.MotionAE\s*=\s*\{\s*dispatch:\s*dispatch\s*\}/);

  const publicGlobals = [...source.matchAll(/^\s*global\.(Motion\w+)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(publicGlobals)].sort(),
    ["MotionAE", "MotionContracts", "MotionDescriptors", "MotionJson", "MotionRegistry", "MotionUndo"],
    "O conjunto de globais do host mudou. Só MotionAE é superfície pública; " +
      "qualquer global novo contorna o dispatcher e precisa de justificativa."
  );
});

test("o bundle do After Effects chama o dispatcher e nenhum comando por nome", async () => {
  const client = await readFile(path.join(dist, "after-effects-cep/client/main.js"), "utf8");

  assert.match(client, /MotionAE\.dispatch\(/);

  for (const legacy of ["MotionAE.getContext", "MotionAE.createDemoComposition"]) {
    assert.ok(!client.includes(legacy), `Chamada legada sobrevivente: ${legacy}`);
  }
});

test("o bundle do Premiere registra os comandos e nao contem evalScript", async () => {
  const client = await readFile(path.join(dist, "premiere-uxp/main.js"), "utf8");

  for (const command of ["pr.context.read", "pr.diagnostics.selfTest"]) {
    assert.ok(client.includes(command), `O bundle do Premiere não registra ${command}.`);
  }

  // evalScript e do CEP. Se aparecer aqui, alguem copiou codigo do lado errado.
  assert.ok(!client.includes("evalScript"), "evalScript não existe no UXP.");
});

test("BUILD_INFO declara nome e versao do package.json", async () => {
  const buildInfo = JSON.parse(await readFile(path.join(dist, "BUILD_INFO.json"), "utf8"));
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

  assert.equal(buildInfo.name, pkg.name);
  assert.equal(buildInfo.version, pkg.version);
  assert.deepEqual(buildInfo.outputs.sort(), ["after-effects-cep", "premiere-uxp"]);
});
