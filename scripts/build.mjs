import { syncThemeTokens } from "./sync-theme.mjs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateMotionLibrary } from "./build-motion-library.mjs";
import { buildExtendScript } from "./build-extendscript.mjs";
import { buildAeClient, buildPremiereClient } from "./build-client.mjs";
import { generateSfx } from "./generate-sfx.mjs";
import { renderModule as renderContractsModule, GENERATED_PATH as CONTRACTS_ES5_PATH } from "../packages/contracts/scripts/gen-extendscript.mjs";
import { renderModule as renderDescriptorsModule, GENERATED_PATH as DESCRIPTORS_ES5_PATH } from "../packages/command-registry/scripts/gen-extendscript.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const apps = path.join(root, "apps");
const packages = path.join(root, "packages");
const dist = path.join(root, "dist");
const controlPresetRoot = path.join(apps, "after-effects-cep", "assets", "control-presets");
const controlCatalog = JSON.parse(await readFile(path.join(controlPresetRoot, "catalog.json"), "utf8"));
const controlPresetFiles = new Set(["catalog.json"]);
for (const entry of Object.values(controlCatalog)) {
  if (!/^[a-f0-9]{16}\.ffx$/.test(entry.file)) throw new Error("Invalid bundled control preset filename");
  await readFile(path.join(controlPresetRoot, entry.file));
  controlPresetFiles.add(entry.file);
}
// Card renders ship only while their manifest declares them: a render the
// current engine no longer matches (dropped by text-presets-render --prune)
// stays in source until the next render, and the card draws its preview.
const textPreviewRoot = path.join(apps, "after-effects-cep", "assets", "text-previews");
const textPreviewManifest = JSON.parse(await readFile(path.join(textPreviewRoot, "manifest.json"), "utf8"));
const textPreviewFiles = new Set(["manifest.json", ...Object.values(textPreviewManifest.presets).flatMap(entry => [entry.video, entry.poster])]);

/**
 * Nomes de arquivo e diretorio que existem na arvore fonte por razoes de
 * desenvolvimento e nao podem entrar no output de build.
 *
 * `.debug` declara a porta de depuracao remota do CEP (8091). Ele e instalado na
 * pasta da extensao pelos scripts install-ae-dev sob flag explicita; enviar essa
 * porta num pacote distribuivel abriria um canal de depuracao na maquina do
 * usuario final.
 *
 * `package.json` aqui e o manifesto npm do workspace, nao o manifesto que o
 * Premiere le. Os dois lado a lado dentro de dist/ seriam uma armadilha.
 *
 * `host/src` e o fonte do ExtendScript; o que vai para dist/ e o arquivo montado
 * por scripts/build-extendscript.mjs, nao os pedacos.
 */
const EXCLUDED_BASENAMES = new Set([
  ".debug",
  // Liberacao de licenca do desenvolvedor: gravada so pelo instalador local.
  "developer-unlock",
  // `tsc -b` emite `apps/*/dist/` antes deste copiador rodar. Sem excluir o
  // diretorio inteiro, `fs.cp` replica essa arvore compilada dentro do pacote
  // do host (`dist/premiere-uxp/dist/...`). Mesmo quando todos os arquivos
  // internos acabam filtrados por extensao, os diretorios vazios ainda vazam
  // para o artefato e tornam o inventario dependente do estado da maquina.
  "dist",
  "package.json",
  "node_modules",
  "tests",
  "types",
  "src",
  // Codigo gerado do contrato e dos descriptors. NAO e copiado solto para
  // dist/: o ExtendScript nao tem sistema de modulos, entao um .jsx avulso ao
  // lado do host nunca seria carregado e existiria no pacote so para confundir.
  // Ele entra no bundle por concatenacao, declarada em HOST_SOURCE_ORDER.
  "generated"
]);

await generateMotionLibrary();

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(dist, { recursive: true, force: true });

if (process.argv.includes("--clean-only")) {
  console.log("dist removido.");
  process.exit(0);
}

/**
 * O tema distribuido continua sendo um arquivo unico porque CEP e UXP carregam
 * o mesmo caminho. Ele e composto no build a partir da base visual e do catalogo
 * de movimento; isso evita `@import`, que nao e uma dependencia segura nos dois
 * runtimes, sem duplicar o catalogo nos fontes.
 */
await syncThemeTokens();

const SHARED_THEME_SOURCES = [
  path.join(packages, "ui-core", "src", "theme.css"),
  path.join(packages, "ui-core", "src", "components.css"),
  path.join(packages, "ui-core", "src", "control-refinement.css"),
  path.join(packages, "ui-core", "src", "library-refinement.css"),
  path.join(packages, "ui-core", "src", "design-system.css"),
  path.join(packages, "ui-core", "src", "preset-approved.css"),
  path.join(packages, "ui-core", "src", "scrubbable-number.css"),
  path.join(packages, "ui-core", "src", "overlay-controls.css"),
  path.join(packages, "ui-motion", "src", "motion.css")
];

async function copyAppShell(appName, outputName) {
  const output = path.join(dist, outputName);
  await mkdir(output, { recursive: true });
  await cp(path.join(apps, appName), output, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      // Ship only the current catalog; obsolete authoring variants stay in source.
      if (path.dirname(source) === controlPresetRoot && !controlPresetFiles.has(base)) return false;
      if (path.dirname(source) === textPreviewRoot && !textPreviewFiles.has(base)) return false;
      if (EXCLUDED_BASENAMES.has(base)) return false;
      // Artefatos do compilador: tsc -b grava .tsbuildinfo ao lado do tsconfig.
      // Prefixo, e nao lista de nomes: tsconfig.client.json vazou para dist/
      // exatamente porque a lista nao previa um terceiro tsconfig.
      if (base.startsWith("tsconfig") && base.endsWith(".json")) return false;
      if (base.endsWith(".tsbuildinfo") || base.endsWith(".ts") || base.endsWith(".map")) return false;
      return true;
    }
  });

  const themeDestination = path.join(output, "styles", "theme.css");
  const themeParts = await Promise.all(
    SHARED_THEME_SOURCES.map((source) => readFile(source, "utf8"))
  );
  // Host-specific polish must never alter Premiere or the shared Onyx palette.
  if (appName === "after-effects-cep") {
    themeParts.push(await readFile(path.join(packages, "ui-tokens", "src", "after-effects.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-refinement.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-settings.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-camera.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-workstation.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-motion.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-quick-actions.css"), "utf8"));
    themeParts.push(await readFile(path.join(apps, "after-effects-cep", "client", "src", "gradient-preview.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "particles-editor.css"), "utf8"));
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-layout.css"), "utf8"));
    // Árvore e menu de etiquetas no estilo Composer: por último, para vencer as camadas acima.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-composer-browse.css"), "utf8"));
    // Micro-interações de botões, ícones e sliders (motion/micro.ts liga o JS).
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-micro.css"), "utf8"));
    // Menu "Ações de presets" (Action Deck): depois das micro-interações para vencer o press genérico.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-preset-actions.css"), "utf8"));
    // Polimento da aba Presets: divisor aceso, menu de contexto, filtro por etiqueta e busca compacta.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-browse-polish.css"), "utf8"));
    // Ajustes do preset como gaveta na grade: por último, para vencer o popover fixo.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-preset-drawer.css"), "utf8"));
    // Design system do painel (2026-11-12): escala única de cor, texto, raio e layout por largura. Última camada.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-design-system.css"), "utf8"));
    // Ícones vivos (2026-11-16): resposta ao ponteiro em ladrilhos, abas, estrelas e setas. Depois do design system.
    themeParts.push(await readFile(path.join(packages, "ui-core", "src", "ae-icon-life.css"), "utf8"));
  }
  await mkdir(path.dirname(themeDestination), { recursive: true });
  await writeFile(themeDestination, `${themeParts.join("\n\n").trimEnd()}\n`, "utf8");
}

// Geracao antes da copia: o modulo ES5 do contrato faz parte do host montado, e
// gera-lo depois deixaria o build de uma arvore limpa emitindo a versao anterior.
await mkdir(path.dirname(CONTRACTS_ES5_PATH), { recursive: true });
await writeFile(CONTRACTS_ES5_PATH, await renderContractsModule(), "utf8");
await writeFile(DESCRIPTORS_ES5_PATH, await renderDescriptorsModule(), "utf8");

await copyAppShell("premiere-uxp", "premiere-uxp");
await copyAppShell("after-effects-cep", "after-effects-cep");
// Sons dos Elementos: sintetizados a cada build, sem binario no repositorio (ADR 0006).
await generateSfx(path.join(dist, "after-effects-cep", "assets", "sounds"));

// Cofre da conta (Keychain no macOS, Gerenciador de Credenciais no Windows). O
// Node do CEP procura bin/<plataforma>-<arquitetura>; no macOS o binario e
// universal porque o After Effects pode rodar nativo ou sob Rosetta. Sem
// compilador o build segue sem o cofre; a Conta mostra "armazenamento indisponivel".
if (process.platform === "darwin") {
  const vaultDir = path.join(dist, "after-effects-cep", "account", "bin");
  const vaultBinary = path.join(vaultDir, "darwin-arm64", "motion-account-vault");
  await mkdir(path.dirname(vaultBinary), { recursive: true });
  execFileSync("clang++", ["-std=c++17", "-O2", "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=11.0",
    path.join(root, "native", "account-vault", "main.cpp"), "-framework", "Security", "-framework", "CoreFoundation", "-o", vaultBinary], { stdio: "inherit" });
  execFileSync("codesign", ["--force", "--sign", "-", "--identifier", "com.motion.account.vault", vaultBinary], { stdio: "ignore" });
  await mkdir(path.join(vaultDir, "darwin-x64"), { recursive: true });
  await cp(vaultBinary, path.join(vaultDir, "darwin-x64", "motion-account-vault"));
} else if (process.platform === "win32") {
  // Windows: mesmo main.cpp, Gerenciador de Credenciais (wincred). Compilado com
  // MSVC localizado pelo vswhere; CRT estatico para nao depender do redistribuivel.
  // Sem Visual Studio o build segue sem o cofre, como antes.
  const vaultBinary = path.join(dist, "after-effects-cep", "account", "bin", "win32-x64", "motion-account-vault.exe");
  if (!buildWindowsVault(vaultBinary)) {
    console.warn("Aviso: Visual Studio (C++) não encontrado; cofre da conta não compilado. Login Google ficará indisponível; use o modo desenvolvedor.");
  }
}

function buildWindowsVault(output) {
  const vswhere = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio", "Installer", "vswhere.exe");
  let vcvars;
  try {
    vcvars = execFileSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-find", "VC\\Auxiliary\\Build\\vcvars64.bat"], { encoding: "utf8" }).trim().split(/\r?\n/)[0] ?? "";
  } catch { return false; }
  if (!vcvars) return false;
  const work = path.join(dist, ".vault-obj");
  mkdirSync(work, { recursive: true });
  mkdirSync(path.dirname(output), { recursive: true });
  // Um .cmd temporario evita as regras de aspas do `cmd /c` com caminhos com espaco.
  const script = path.join(work, "build-vault.cmd");
  const source = path.join(root, "native", "account-vault", "main.cpp");
  writeFileSync(script, [
    "@echo off",
    // vcvars64.bat chama o vswhere pelo PATH; sem isso imprime um erro inofensivo.
    `set "PATH=${path.dirname(vswhere)};%PATH%"`,
    `call "${vcvars}" >nul || exit /b 1`,
    `cl /nologo /std:c++17 /O2 /EHsc /MT /utf-8 "${source}" /Fo"${work}\\\\" /Fe"${output}" Advapi32.lib || exit /b 1`
  ].join("\r\n") + "\r\n", "utf8");
  try {
    execFileSync("cmd.exe", ["/d", "/c", script], { stdio: "inherit" });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return true;
}

// O host do After Effects e montado, nao copiado: a diretiva #target e emitida
// aqui para que os fontes permanecam JavaScript verificavel por ferramenta.
const extendScript = await buildExtendScript(
  path.join(dist, "after-effects-cep", "host", "index.jsx")
);

// Keep the independently runnable pack intact beside the test integration.
await cp(path.join(root, "packs", "emulsion-v2"), path.join(dist, "after-effects-cep", "packs", "emulsion-v2"), {
  recursive: true,
  filter: source => !["scripts", "tests", "demo", "__pycache__"].includes(path.basename(source))
});

// O cliente do painel e empacotado, nao copiado: ele importa o encoder de
// evalScript e os descriptors de packages/, e nem o CEP nem o UXP resolvem
// modulos de node_modules por conta propria.
const aeClient = await buildAeClient(
  path.join(dist, "after-effects-cep", "client", "main.js")
);

const premiereClient = await buildPremiereClient(
  path.join(dist, "premiere-uxp", "main.js")
);

const buildInfo = {
  name: pkg.name,
  version: pkg.version,
  builtAt: new Date().toISOString(),
  outputs: ["premiere-uxp", "after-effects-cep"]
};

await writeFile(
  path.join(dist, "BUILD_INFO.json"),
  JSON.stringify(buildInfo, null, 2) + "\n",
  "utf8"
);

console.log(
  `Build concluído em dist/.
  ExtendScript: ${extendScript.files} fonte(s), ${extendScript.bytes} bytes.
  Cliente AE:   ${aeClient.bytes} bytes.
  Cliente PPro: ${premiereClient.bytes} bytes.`
);
