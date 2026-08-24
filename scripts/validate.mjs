import { access, readFile, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const dist = path.join(root, "dist");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function mustExist(relativePath) {
  const absolutePath = path.join(dist, relativePath);
  await access(absolutePath);
  return absolutePath;
}

function nodeCheck(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8"
  });
  assert(result.status === 0, `Falha de sintaxe em ${filePath}:\n${result.stderr || result.stdout}`);
}

const premiereManifestPath = await mustExist("premiere-uxp/manifest.json");
const premiereManifest = JSON.parse(await readFile(premiereManifestPath, "utf8"));
assert(premiereManifest.manifestVersion === 5, "O manifest UXP precisa usar a versão 5.");
assert(premiereManifest.host.app === "premierepro", "Host UXP inválido.");
assert(premiereManifest.host.minVersion === "25.6.0", "Versão mínima do Premiere inesperada.");
assert(premiereManifest.entrypoints.some((entry) => entry.type === "panel" && entry.id === "mainPanel"), "Painel UXP mainPanel ausente.");

const aeManifestPath = await mustExist("after-effects-cep/CSXS/manifest.xml");
const aeManifest = await readFile(aeManifestPath, "utf8");
assert(aeManifest.includes('Host Name="AEFT"'), "Host AEFT ausente no manifest CEP.");
assert(aeManifest.includes('Version="[25.0,99.9]"'), "Faixa de versão do After Effects inesperada.");
assert(aeManifest.includes('<RequiredRuntime Name="CSXS" Version="12.0"'), "Runtime CEP 12 ausente.");
assert(aeManifest.includes('<ScriptPath>./host/index.jsx</ScriptPath>'), "ScriptPath do ExtendScript ausente.");

const csInterfacePath = await mustExist("after-effects-cep/client/lib/CSInterface.js");
const csInterfaceStats = await stat(csInterfacePath);
assert(csInterfaceStats.size > 40000, "CSInterface.js parece incompleto.");

const filesToCheck = [
  "premiere-uxp/main.js",
  "premiere-uxp/host/premiere-adapter.js",
  "premiere-uxp/shared/protocol.js",
  "after-effects-cep/client/main.js",
  "after-effects-cep/shared/protocol.js"
];

for (const relativePath of filesToCheck) {
  nodeCheck(await mustExist(relativePath));
}

const jsxPath = await mustExist("after-effects-cep/host/index.jsx");
const jsxSource = await readFile(jsxPath, "utf8");
const jsxCheckPath = path.join(root, ".tmp-index-jsx-check.js");
await writeFile(jsxCheckPath, jsxSource.replace(/^#target[^\n]*\n/, ""), "utf8");
try {
  nodeCheck(jsxCheckPath);
} finally {
  await rm(jsxCheckPath, { force: true });
}

console.log("Validação estrutural e sintática concluída.");
