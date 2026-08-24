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
    "CHMS-004 substituiu a camada de host inteira. Ela deixou de ser um arquivo unico com dois comandos globais e passou a ser montada a partir de nove fontes: contrato e descriptors gerados, MotionJson, MotionUndo, MotionRegistry, tres comandos e o dispatcher. O unico simbolo publico agora e MotionAE.dispatch.",
  "after-effects-cep/client/main.js":
    "CHMS-004 passou o cliente a ser empacotado pelo esbuild a partir de apps/after-effects-cep/client/src/main.ts, em vez de copiado. Ele precisa do encoder de evalScript e dos descriptors de packages/, e reimplementar o escape dentro do painel criaria uma segunda copia da unica funcao que impede injecao de codigo no host.",
  "after-effects-cep/client/index.html":
    "O script tag de shared/protocol.js saiu, porque o protocolo legado deixou de ser carregado pelo painel do After Effects, e entrou o botao echoButton, que aciona ae.diagnostics.echo para verificar a integridade da ponte com o host."
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

test("o host montado registra todo comando que o descriptor declara", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  // Um descriptor sem implementacao vira um botao que responde
  // "não implementado neste build" ao usuario. Compila, passa no lint, e so
  // aparece quando alguem clica. Este teste transforma isso em falha de build.
  const declared = [...source.matchAll(/^\s{4}"(ae\.[a-zA-Z.]+)":\s*\{/gm)].map((m) => m[1]);
  const registered = [...source.matchAll(/MotionRegistry\.register\("(ae\.[a-zA-Z.]+)"/g)].map((m) => m[1]);

  assert.ok(declared.length > 0, "Nenhum descriptor foi encontrado no host montado.");
  assert.deepEqual(
    registered.sort(),
    declared.sort(),
    "Os comandos declarados nos descriptors e os registrados no host não são o mesmo conjunto."
  );
});

test("o host montado expoe apenas MotionAE.dispatch", async () => {
  const source = await readFile(path.join(dist, "after-effects-cep/host/index.jsx"), "utf8");

  // Qualquer outro global do plugin seria um caminho para dentro do After
  // Effects que contorna o dispatcher — ou seja, contorna a checagem de versao
  // de protocolo, o preflight, o consentimento para operacao destrutiva e a
  // fronteira de Undo.
  assert.match(source, /global\.MotionAE\s*=\s*\{\s*dispatch:\s*dispatch\s*\}/);

  const publicGlobals = [...source.matchAll(/^\s*global\.(Motion\w+)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(publicGlobals)].sort(),
    ["MotionAE", "MotionContracts", "MotionDescriptors", "MotionJson", "MotionRegistry", "MotionUndo"],
    "O conjunto de globais do host mudou. Somente MotionAE é superfície pública; " +
      "os demais são módulos internos, e um global novo precisa de justificativa."
  );
});

test("o bundle do cliente chama o dispatcher e nenhum comando por nome", async () => {
  const client = await readFile(path.join(dist, "after-effects-cep/client/main.js"), "utf8");

  assert.match(client, /MotionAE\.dispatch\(/, "O cliente não monta a chamada ao dispatcher.");

  // Os comandos antigos eram invocados por nome literal dentro do evalScript.
  // Se um sobreviver, existe um caminho paralelo que nao passa pelo escape.
  for (const legacy of ["MotionAE.getContext", "MotionAE.createDemoComposition"]) {
    assert.ok(!client.includes(legacy), `Chamada legada sobrevivente no cliente: ${legacy}`);
  }
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
