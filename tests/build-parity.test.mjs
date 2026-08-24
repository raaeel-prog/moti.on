import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/**
 * Gate de aceite do CHMS-002: "Dois shells gerados em dist/".
 *
 * A migracao para npm workspaces moveu src/ para apps/ e packages/, trocou a
 * copia do ExtendScript por um passo de montagem, e reescreveu scripts/build.mjs.
 * Nada disso pode alterar o que o After Effects e o Premiere carregam.
 *
 * A referencia e tests/fixtures/dist-baseline.json, capturado no CHMS-001b logo
 * apos o rebranding e antes de qualquer mudanca estrutural.
 *
 * Este teste depende de dist/ existir, ou seja, de `npm run build` ter rodado.
 * O script `check` garante a ordem.
 */

/**
 * Arquivos cujo conteudo mudou de proposito na migracao.
 *
 * Toda entrada precisa de um motivo escrito e nao vazio. Um arquivo nao pode
 * aparecer aqui sem justificativa: a lista existe para tornar a divergencia
 * visivel e revisavel, nao para silencia-la.
 */
const ALLOWED_DIVERGENCE = {
  "after-effects-cep/host/index.jsx":
    "O fonte passou a viver em apps/after-effects-cep/host/src/index.jsx sem a diretiva #target, que agora e emitida por scripts/build-extendscript.mjs. Com o arquivo parseavel, ele ganhou anotacoes JSDoc para ser verificado por tsc --checkJs, e duas correcoes apontadas pelo ESLint: escape desnecessario numa regex e hasOwnProperty acessado direto do objeto. Tambem foi removido o ramo `if (!app.project) app.newProject()`, que chamava uma operacao destrutiva e nao-desfazivel de dentro de um grupo de Undo."
};

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

async function sha256(relativePath) {
  const contents = await readFile(path.join(dist, relativePath));
  return createHash("sha256").update(contents).digest("hex");
}

const baseline = JSON.parse(
  await readFile(path.join(root, "tests/fixtures/dist-baseline.json"), "utf8")
);

test("dist/ contem exatamente o mesmo conjunto de arquivos do baseline", async () => {
  const actual = (await collectDistFiles(dist))
    .filter((file) => !baseline.excluded.includes(file))
    .sort();
  const expected = Object.keys(baseline.files).sort();

  assert.deepEqual(
    actual,
    expected,
    "A migração adicionou ou removeu arquivos de dist/. Os hosts carregam por caminho fixo; " +
      "qualquer mudança aqui muda o que o After Effects e o Premiere veem."
  );
});

test("todo arquivo de copia pura permaneceu byte a byte identico", async () => {
  /** @type {string[]} */
  const changed = [];

  for (const [relativePath, expected] of Object.entries(baseline.files)) {
    if (relativePath in ALLOWED_DIVERGENCE) continue;
    const actual = await sha256(relativePath);
    if (actual !== expected.sha256) {
      changed.push(`${relativePath}\n    esperado ${expected.sha256}\n    obtido   ${actual}`);
    }
  }

  assert.deepEqual(
    changed,
    [],
    "Arquivos mudaram sem estar declarados em ALLOWED_DIVERGENCE:\n" + changed.join("\n")
  );
});

test("toda divergencia declarada e real e tem motivo escrito", async () => {
  for (const [relativePath, reason] of Object.entries(ALLOWED_DIVERGENCE)) {
    assert.ok(
      typeof reason === "string" && reason.trim().length >= 40,
      `A divergência de ${relativePath} precisa de um motivo escrito, não de um marcador.`
    );

    assert.ok(
      relativePath in baseline.files,
      `${relativePath} está em ALLOWED_DIVERGENCE mas não existe no baseline.`
    );

    // Uma divergencia declarada para um arquivo que voltou a ser identico e
    // permissao morta: ela continuaria escondendo a proxima mudanca de verdade.
    const actual = await sha256(relativePath);
    assert.notEqual(
      actual,
      baseline.files[relativePath].sha256,
      `${relativePath} voltou a ser idêntico ao baseline. Remova a entrada de ALLOWED_DIVERGENCE ` +
        "para que o arquivo volte a ser protegido pela comparação de bytes."
    );
  }
});

test("o ExtendScript montado comeca com a diretiva #target, exatamente uma vez", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  assert.ok(
    source.startsWith("#target aftereffects\n"),
    "O After Effects exige a diretiva #target na primeira linha do script."
  );

  // Conta apenas ocorrencias em posicao de codigo. O cabecalho de documentacao do
  // fonte menciona a diretiva em prosa, e uma busca por substring acusaria isso.
  const occurrences = (source.match(/^#target\b/gm) || []).length;
  assert.equal(occurrences, 1, "A diretiva #target aparece mais de uma vez em posição de código.");
});

test("o host montado ainda expoe os dois comandos que o painel chama", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");
  const client = await readFile(path.join(dist, "after-effects-cep/client/main.js"), "utf8");

  // O contrato entre cliente e host neste ponto ainda e a chamada literal por
  // nome. Se a montagem quebrar o global ou renomear um comando, o painel para de
  // funcionar sem nenhum erro de build.
  for (const command of ["getContext", "createDemoComposition"]) {
    assert.match(source, new RegExp(`${command}:\\s*${command}`), `Host não expõe ${command}.`);
    assert.match(client, new RegExp(`MotionAE\\.${command}\\(\\)`), `Cliente não chama ${command}.`);
  }

  assert.match(source, /global\.MotionAE\s*=/, "O host não pendura MotionAE no global.");
});

test("nenhum arquivo de workspace vazou para dist/", async () => {
  const files = await collectDistFiles(dist);
  const leaked = files.filter((file) => {
    const base = path.basename(file);
    return (
      base === "package.json" ||
      base === ".debug" ||
      base.startsWith("tsconfig") ||
      file.includes("/tests/") ||
      file.includes("/types/") ||
      file.endsWith(".ts")
    );
  });

  assert.deepEqual(
    leaked,
    [],
    "Arquivos de desenvolvimento vazaram para o output de build:\n" + leaked.join("\n")
  );
});
