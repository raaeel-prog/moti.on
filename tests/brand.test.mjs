import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Diretorios que o scanner nunca percorre.
 */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "artifacts", "coverage"]);

/**
 * Arquivos onde os identificadores antigos podem aparecer legitimamente, cada um
 * com o motivo. A lista e deliberadamente pequena e explicita: qualquer arquivo
 * novo que precise entrar aqui exige justificar por que o nome antigo sobrevive.
 */
const ALLOWED = new Map([
  [
    "docs/MASTER_BUILD_SPEC.md",
    "Especificacao normativa. Usa o codigo temporario CHMS e o prefixo de rig CHMS | como parte do texto que define a propria convencao."
  ],
  [
    "docs/BASELINE_STARTER_0.1.0.md",
    "Registro historico do starter antes do rebranding. Citar os identificadores antigos e o proposito do documento."
  ],
  [
    "docs/adr/0001-marca-e-namespace.md",
    "O ADR que registra a troca precisa nomear o que foi trocado."
  ],
  [
    "CHANGELOG.md",
    "A entrada de changelog descreve a renomeacao e portanto cita os nomes antigos."
  ],
  [
    "README.md",
    "Documenta a origem do projeto e a renomeacao dos identificadores."
  ],
  [
    "tests/brand.test.mjs",
    "Este proprio arquivo. Os padroes proibidos precisam aparecer literalmente aqui para poderem ser procurados; escondê-los em fragmentos concatenados tornaria a lista ilegivel sem tornar a protecao mais forte."
  ],
  [
    "scripts/validate.mjs",
    "A assercao que rejeita o namespace placeholder nos manifests construidos precisa citar o namespace que rejeita."
  ],
  [
    "scripts/uninstall-ae-dev.ps1",
    "O desinstalador remove explicitamente uma instalacao legada do starter para ela nao permanecer na pasta CEP compartilhada."
  ],
  [
    "scripts/uninstall-ae-dev.sh",
    "O desinstalador remove explicitamente uma instalacao legada do starter para ela nao permanecer na pasta CEP compartilhada."
  ]
]);

/**
 * Padroes proibidos fora da allowlist.
 */
const FORBIDDEN = [
  { label: "namespace placeholder com.example", pattern: /com\.example/ },
  { label: "nome de produto CrossHost Toolkit", pattern: /CrossHost Toolkit/ },
  { label: "global ExtendScript CrossHostAE", pattern: /CrossHostAE/ },
  { label: "global UMD CrossHostProtocol", pattern: /CrossHostProtocol/ },
  { label: "marcador de metadata CHMS_META_V1", pattern: /CHMS_META_V1/ },
  { label: "cabecalho de expressao CHMS_EXPRESSION", pattern: /CHMS_EXPRESSION/ },
  { label: "prefixo de rig 'CHMS |'", pattern: /CHMS \|/ }
];

/**
 * Extensoes textuais que valem a pena escanear. Binarios sao ignorados.
 */
const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".json", ".xml", ".html", ".css", ".md",
  ".yaml", ".yml", ".ps1", ".sh", ".debug", ""
]);

async function collectTextFiles(directory, accumulated = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      await collectTextFiles(path.join(directory, entry.name), accumulated);
      continue;
    }
    if (!entry.isFile()) continue;
    // Arquivos como ".debug" e ".gitignore" tem extension() vazio; sao texto.
    const extension = entry.name.startsWith(".") && !entry.name.slice(1).includes(".")
      ? ""
      : path.extname(entry.name);
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    accumulated.push(path.join(directory, entry.name));
  }
  return accumulated;
}

test("nenhum identificador do starter sobreviveu ao rebranding para Moti.on", async () => {
  const files = await collectTextFiles(root);
  assert.ok(files.length > 50, `O scanner encontrou apenas ${files.length} arquivos; a varredura falhou.`);

  const violations = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (ALLOWED.has(relativePath)) continue;

    const contents = await readFile(absolutePath, "utf8");
    for (const { label, pattern } of FORBIDDEN) {
      if (!pattern.test(contents)) continue;
      const line = contents.split("\n").findIndex((text) => pattern.test(text)) + 1;
      violations.push(`${relativePath}:${line} — ${label}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Identificadores do starter reapareceram:\n${violations.join("\n")}\n\n` +
      "Se a ocorrencia for legitima, adicione o arquivo a ALLOWED em tests/brand.test.mjs com o motivo."
  );
});

test("toda entrada da allowlist de branding aponta para um arquivo que existe e tem motivo", async () => {
  for (const [relativePath, reason] of ALLOWED) {
    assert.ok(
      typeof reason === "string" && reason.trim().length >= 20,
      `A allowlist de branding exige um motivo real para ${relativePath}.`
    );
    // Um caminho que deixou de existir e allowlist morta: some silenciosamente
    // com a protecao sem que ninguem perceba.
    await readFile(path.join(root, relativePath), "utf8");
  }
});
