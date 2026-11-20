// Inventário dos bloqueios do host: toda recusa com código de conflito/seleção,
// classificada para saber quais impedem ferramentas de conviverem.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../apps/after-effects-cep/host/src/", import.meta.url);
const CODES = ["INVALID_SELECTION_TYPE", "TRACK_CONFLICT", "EXPRESSION_CONFLICT", "KEYFRAME_CONFLICT"];
const PATTERN = new RegExp(String.raw`(${CODES.join("|")})\s*,\s*(?:"[^"]*"\s*,\s*)?"((?:[^"\\]|\\.){3,240})"`, "g");

/** Categoria = por que a ferramenta recusa. "coexist" é o que o usuário não quer ver. */
const RULES = [
  ["coexist", /outro preset|outros? (animadores|efeitos)|sem (animadores|efeitos|m[aá]scaras)|animadores externos|efeitos adicionais|conte[uú]do externo|n[aã]o gerenciado|externas/i],
  ["animated-target", /keyframe|express[aã]o|anima[cç][aã]o|animad[oa]|j[aá] possui/i],
  ["edited-rig", /personaliz|editad|alterad|renomead|removid|Preserve/i],
  ["layout", /linhas horizontais|quebras manuais|horizontal|uniforme|ponto 2D|caixa|preenchimento|contorno/i],
  ["structure", /.*/],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith(".jsx")) yield path;
  }
}

const root = fileURLToPath(ROOT);
const rows = [];
for (const file of files(root)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(PATTERN)) {
      const message = match[2];
      const category = RULES.find(([, re]) => re.test(message))[0];
      rows.push({ file: relative(root, file).split(sep).join("/"), line: index + 1, code: match[1], category, message });
    }
  });
}

const json = process.argv.includes("--json");
if (json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
const by = Object.groupBy(rows, (r) => r.category);
for (const [category, list] of Object.entries(by)) {
  console.log(`\n## ${category} (${list.length})`);
  for (const r of list) console.log(`- ${r.file}:${r.line} [${r.code}] ${r.message}`);
}
