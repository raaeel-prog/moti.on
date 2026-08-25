import { access, mkdtemp, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
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

async function collectDirectories(directory, base = directory, accumulated = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(directory, entry.name);
    accumulated.push(path.relative(base, full));
    await collectDirectories(full, base, accumulated);
  }
  return accumulated;
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
const premiereMainPanel = premiereManifest.entrypoints.find(
  (entry) => entry.type === "panel" && entry.id === "mainPanel"
);
assert(premiereMainPanel, "Painel UXP mainPanel ausente.");
assert(
  premiereMainPanel.minimumSize?.width === 280,
  `A largura mínima do painel Premiere precisa ser 280 px; encontrada ${premiereMainPanel.minimumSize?.width}.`
);

const aeManifestPath = await mustExist("after-effects-cep/CSXS/manifest.xml");
const aeManifest = await readFile(aeManifestPath, "utf8");
assert(aeManifest.includes('Host Name="AEFT"'), "Host AEFT ausente no manifest CEP.");
assert(aeManifest.includes('Version="[25.0,99.9]"'), "Faixa de versão do After Effects inesperada.");
assert(aeManifest.includes('<RequiredRuntime Name="CSXS" Version="12.0"'), "Runtime CEP 12 ausente.");
assert(
  !/<ScriptPath(?:\s|>)/.test(aeManifest),
  "ScriptPath não deve carregar o ExtendScript automaticamente; o adapter faz bootstrap explícito por $.evalFile."
);
const aeMinimumSize = aeManifest.match(/<MinSize>([\s\S]*?)<\/MinSize>/)?.[1] ?? "";
assert(
  /<Width>\s*280\s*<\/Width>/.test(aeMinimumSize),
  "A largura mínima do painel After Effects precisa ser 280 px."
);

const csInterfacePath = await mustExist("after-effects-cep/client/lib/CSInterface.js");
const csInterfaceStats = await stat(csInterfacePath);
assert(csInterfaceStats.size > 40000, "CSInterface.js parece incompleto.");

// Checagem de sintaxe sobre os artefatos que os hosts carregam. Os dois clientes
// sao bundles do esbuild; o protocolo legado deixou de ser copiado para dentro
// dos apps quando o CHMS-004 e o CHMS-005 substituiram os dois lados da ponte.
const filesToCheck = [
  "premiere-uxp/main.js",
  "after-effects-cep/client/main.js"
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

const nestedBuildOutputs = (await collectDirectories(dist)).filter((directory) =>
  directory.split(path.sep).includes("dist")
);
assert(
  nestedBuildOutputs.length === 0,
  `Saída de compilador aninhada em dist/: ${nestedBuildOutputs.join(", ")}. ` +
    "scripts/build.mjs deve excluir qualquer apps/*/dist antes de copiar o shell."
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
assert(
  aeClientBundle.includes("$.evalFile"),
  "O bundle do cliente perdeu o bootstrap explícito do host por $.evalFile."
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
//
// A unica excecao e o namespace XML do SVG. Ele nao e endereco de rede: e o
// identificador que document.createElementNS exige para produzir um elemento
// SVG, nunca e dereferenciado, e nao existe forma de criar SVG inline sem ele.
// A excecao e exata, e nao um padrao amplo de w3.org, para que um endpoint real
// nesse dominio continue sendo reprovado.
const ALLOWED_LITERAL_URLS = new Set(["http://www.w3.org/2000/svg"]);

function assertLiteralUrlsAreAllowed(source, bundleLabel) {
  const rejected = (source.match(/https?:\/\/[^"'\s)]+/g) || []).filter(
    (url) => !ALLOWED_LITERAL_URLS.has(url)
  );
  assert(
    rejected.length === 0,
    `URL literal fora da allowlist no ${bundleLabel}: ${rejected.slice(0, 3).join(", ")}`
  );
}

assertLiteralUrlsAreAllowed(aeClientBundle, "bundle do After Effects");


// ---------------------------------------------------------------------------
// Permissoes e CSP.
//
// Verificado contra a referencia oficial do manifest v5 em 2026-08-24; o
// registro esta em docs/research/premiere-uxp-transactions.md. As chaves validas
// sao clipboard, localFileSystem, network, webview, launchProcess,
// allowCodeGenerationFromStrings, enableUserInfo, ipc e enableAddon.
// ---------------------------------------------------------------------------

const permissions = premiereManifest.requiredPermissions || {};

// Permissao minima. Declarar permissao "para depois" e o tipo de coisa que passa
// despercebida numa revisao ate virar rejeicao de marketplace.
const ALLOWED_PERMISSIONS_P0 = new Set(["localFileSystem"]);
const declared = Object.keys(permissions);
const unexpected = declared.filter((key) => !ALLOWED_PERMISSIONS_P0.has(key));
assert(
  unexpected.length === 0,
  `Permissão declarada sem necessidade no P0: ${unexpected.join(", ")}. ` +
    "network chega no CHMS-029, enableAddon no CHMS-040, e cada uma com a issue que a justifica."
);

assert(
  permissions.localFileSystem === "request",
  `localFileSystem deve ser "request", e não "${permissions.localFileSystem}". ` +
    '"fullAccess" daria acesso a todo o disco para um recurso que precisa de um arquivo por vez.'
);

// A secao 24 proibe geracao de codigo em runtime. E tambem o que torna o Ajv em
// runtime inviavel: o compilador padrao dele usa new Function.
assert(
  permissions.allowCodeGenerationFromStrings !== true,
  "allowCodeGenerationFromStrings é proibido pela §24 do master spec."
);

// network com "all" seria pedir acesso irrestrito a rede. Quando o CHMS-029
// trouxer o provider Pexels, os dominios serao explicitos.
assert(
  permissions.network?.domains !== "all",
  'network.domains: "all" nunca é aceitável. Liste os domínios explicitamente.'
);

// CSP nos dois paineis.
for (const htmlPath of ["premiere-uxp/index.html", "after-effects-cep/client/index.html"]) {
  const html = await readFile(await mustExist(htmlPath), "utf8");
  assert(
    /http-equiv="Content-Security-Policy"/.test(html),
    `Falta a meta Content-Security-Policy em ${htmlPath}.`
  );
  assert(
    /default-src 'none'/.test(html),
    `A CSP de ${htmlPath} precisa partir de default-src 'none'.`
  );
  assert(
    !/unsafe-inline|unsafe-eval/.test(html),
    `A CSP de ${htmlPath} não pode permitir unsafe-inline nem unsafe-eval.`
  );
}

// O painel do Premiere passou pelas mesmas regras do bundle do After Effects.
const premiereBundle = await readFile(await mustExist("premiere-uxp/main.js"), "utf8");
const premiereCode = stripCommentsAndStrings(premiereBundle);

assertLiteralUrlsAreAllowed(premiereBundle, "bundle do Premiere");

for (const [pattern, label] of [
  [/(^|[^.\w])eval\s*\(/, "eval("],
  [/new\s+Function\s*\(/, "new Function("],
  [/console\.(log|warn|error|info|debug)\s*\(/, "console"]
]) {
  assert(!pattern.test(premiereCode), `${label} no bundle do Premiere.`);
}

for (const marker of ["TODO", "FIXME", "XXX"]) {
  assert(!premiereBundle.includes(marker), `Marcador ${marker} no bundle do Premiere.`);
}

// Dependencias externas do bundle. A contagem anterior aceitava qualquer
// `require()` novo enquanto o total permanecesse abaixo de quatro; isso deixava
// passar filesystem, processo ou um modulo injetado por engano. Nesta fase o
// painel so pode falar com os dois modulos fornecidos pelo proprio runtime UXP.
const ALLOWED_PREMIERE_REQUIRES = new Set(["premierepro", "uxp"]);
const premiereRequireArguments = [...premiereCode.matchAll(/\brequire\s*\(([^)]*)\)/g)].map(
  (match) => match[1].trim()
);
assert(
  premiereRequireArguments.every((argument) => argument === '""'),
  "O bundle do Premiere contém require dinâmico. Todo módulo externo precisa ser literal e allowlisted."
);

const premiereLiteralRequires = [
  ...premiereBundle.matchAll(/\brequire\s*\(\s*(["'])([^"']+)\1\s*\)/g)
].map((match) => match[2]);
const actualPremiereRequires = [...new Set(premiereLiteralRequires)].sort();
const expectedPremiereRequires = [...ALLOWED_PREMIERE_REQUIRES].sort();
assert(
  JSON.stringify(actualPremiereRequires) === JSON.stringify(expectedPremiereRequires),
  `Módulos externos inesperados no bundle do Premiere: ${actualPremiereRequires.join(", ")}. ` +
    `Allowlist exata: ${expectedPremiereRequires.join(", ")}.`
);

console.log("Validação estrutural e sintática concluída.");
