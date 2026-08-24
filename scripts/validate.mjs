import { access, mkdtemp, readFile, stat, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripCommentsAndStrings } from "./check-extendscript.mjs";

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
const premiereManifestRaw = await readFile(premiereManifestPath, "utf8");
const premiereManifest = JSON.parse(premiereManifestRaw);
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

// O ExtendScript nao e parseavel pelo Node por causa da diretiva #target, entao
// ela e removida numa copia descartavel. A copia vive em os.tmpdir(): escrever
// na raiz do repositorio deixava .tmp-index-jsx-check.js para tras sempre que o
// processo morresse entre o writeFile e o finally.
const jsxPath = await mustExist("after-effects-cep/host/index.jsx");
const jsxSource = await readFile(jsxPath, "utf8");
const jsxCheckDir = await mkdtemp(path.join(os.tmpdir(), "motion-jsx-check-"));
const jsxCheckPath = path.join(jsxCheckDir, "index-jsx-check.js");
await writeFile(jsxCheckPath, jsxSource.replace(/^#target[^\n]*\n/, ""), "utf8");
try {
  nodeCheck(jsxCheckPath);
} finally {
  await rm(jsxCheckDir, { recursive: true, force: true });
}

// O arquivo de porta de depuracao do CEP nao pode chegar ao output de build.
// scripts/build.mjs o exclui; esta assercao garante que a exclusao nao seja
// removida por acidente numa refatoracao futura do copiador.
let debugFileLeaked = true;
try {
  await access(path.join(dist, "after-effects-cep", ".debug"));
} catch {
  debugFileLeaked = false;
}
assert(
  !debugFileLeaked,
  "O arquivo .debug do CEP vazou para dist/. Ele declara a porta de depuração remota e não pode ser distribuído."
);

// Identificadores definitivos. Ate o CHMS-001b o repositorio usava os
// placeholders com.example.crosshosttoolkit.*, que o README mandava trocar antes
// de publicar. Agora que a troca foi feita, o retorno dos placeholders passa a
// ser um erro de build, nao um lembrete em documentacao.
assert(
  premiereManifest.id === "com.motion.plugin.premiere",
  `ID do plugin UXP inesperado: ${premiereManifest.id}`
);
assert(
  aeManifest.includes('ExtensionBundleId="com.motion.plugin"'),
  "ExtensionBundleId do CEP inesperado."
);
assert(
  !aeManifest.includes("com.example") && !premiereManifestRaw.includes("com.example"),
  "Identificador placeholder com.example encontrado num manifest."
);


// ---------------------------------------------------------------------------
// Fronteira de seguranca da ponte painel-host.
//
// Estas assercoes rodam sobre o BUNDLE CONSTRUIDO, nao sobre o fonte. E o
// construido que roda dentro do After Effects, e um import esquecido ou uma
// refatoracao mal feita so aparecem depois de empacotar.
// ---------------------------------------------------------------------------

const aeClientBundle = await readFile(await mustExist("after-effects-cep/client/main.js"), "utf8");
const aeHostBundle = await readFile(await mustExist("after-effects-cep/host/index.jsx"), "utf8");

// As checagens estruturais rodam sobre o texto SEM comentarios e sem conteudo de
// string. Os proprios arquivos documentam as regras que estao sendo verificadas
// — o cabecalho de dispatch.jsx explica que existe um unico `global.MotionAE =`
// — e uma busca crua acusaria a documentacao. O que importa e o codigo.
const aeClientCode = stripCommentsAndStrings(aeClientBundle);
const aeHostCode = stripCommentsAndStrings(aeHostBundle);

// Um unico ponto de contato com o evalScript. Ele recebe uma string de codigo
// que o After Effects avalia com acesso total ao projeto e ao sistema de
// arquivos; espalhar chamadas tornaria impossivel auditar o que atravessa.
const evalScriptCalls = (aeClientCode.match(/\.evalScript\s*\(/g) || []).length;
assert(
  evalScriptCalls === 1,
  `O bundle do cliente chama evalScript ${evalScriptCalls} vezes. Somente o host adapter pode chamá-lo.`
);

// Um unico simbolo publico no host. Qualquer outro global seria um caminho
// alternativo para dentro do After Effects, fora do dispatcher e portanto fora
// de toda a validacao que ele faz.
const publicHostGlobals = (aeHostCode.match(/global\.MotionAE\s*=/g) || []).length;
assert(
  publicHostGlobals === 1,
  `O host expõe MotionAE ${publicHostGlobals} vezes. Deve ser exatamente uma.`
);
assert(
  /global\.MotionAE\s*=\s*\{\s*dispatch:/.test(aeHostCode),
  "MotionAE precisa expor apenas dispatch. Comandos individuais não podem ser globais."
);

// Geracao de codigo em runtime. A secao 24 do master spec proibe
// allowCodeGenerationFromStrings; um eval sobrevivente no bundle contradiz isso.
for (const [pattern, label] of [
  [/(^|[^.\w])eval\s*\(/, "eval("],
  [/new\s+Function\s*\(/, "new Function("]
]) {
  assert(!pattern.test(aeClientCode), `Geração de código em runtime no bundle do cliente: ${label}`);
  assert(!pattern.test(aeHostCode), `Geração de código em runtime no host: ${label}`);
}

// Marcadores de trabalho inacabado. A secao 0.5 proibe TODO e mock silencioso;
// se um chegou ao build, chegou ao usuario.
for (const marker of ["TODO", "FIXME", "XXX"]) {
  assert(!aeClientBundle.includes(marker), `Marcador ${marker} no bundle do cliente.`);
  assert(!aeHostBundle.includes(marker), `Marcador ${marker} no host construído.`);
}

// console no bundle. Ate o logger estruturado do CHMS-007, nenhum console pode
// sair no build: a secao 34 o proibe em release, e log nao estruturado vaza
// caminho e nome de projeto, que a secao 25 proibe registrar.
assert(
  !/console\.(log|warn|error|info|debug)\s*\(/.test(aeClientCode),
  "console no bundle do cliente. Use o logger."
);
assert(
  !/console\.(log|warn|error|info|debug)\s*\(/.test(aeHostCode),
  "console no host construído."
);

// URLs literais. Endpoint espalhado pelo codigo e o que torna impossivel saber
// para onde o plugin fala. A secao 34 exige que provedores venham de config.
const urlInBundle = aeClientBundle.match(/https?:\/\/[^"'\s)]+/g) || [];
assert(
  urlInBundle.length === 0,
  `URL literal no bundle do cliente: ${urlInBundle.slice(0, 3).join(", ")}`
);

console.log("Validação estrutural e sintática concluída.");
