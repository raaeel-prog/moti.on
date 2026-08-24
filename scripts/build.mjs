import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtendScript } from "./build-extendscript.mjs";
import { buildAeClient, buildPremiereClient } from "./build-client.mjs";
import { renderModule as renderContractsModule, GENERATED_PATH as CONTRACTS_ES5_PATH } from "../packages/contracts/scripts/gen-extendscript.mjs";
import { renderModule as renderDescriptorsModule, GENERATED_PATH as DESCRIPTORS_ES5_PATH } from "../packages/command-registry/scripts/gen-extendscript.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const apps = path.join(root, "apps");
const packages = path.join(root, "packages");
const dist = path.join(root, "dist");

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

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(dist, { recursive: true, force: true });

if (process.argv.includes("--clean-only")) {
  console.log("dist removido.");
  process.exit(0);
}

/**
 * O protocolo legado e o tema ainda sao arquivos unicos copiados para dentro de
 * cada host, e nao um bundle. Os caminhos de destino sao os que o HTML e o
 * `require` de cada app esperam, e nao podem mudar sem mudar os apps junto.
 */
const SHARED_ASSETS = [
  {
    from: path.join(packages, "ui-core", "src", "theme.css"),
    to: path.join("styles", "theme.css")
  }
];

async function copyAppShell(appName, outputName) {
  const output = path.join(dist, outputName);
  await mkdir(output, { recursive: true });
  await cp(path.join(apps, appName), output, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      if (EXCLUDED_BASENAMES.has(base)) return false;
      // Artefatos do compilador: tsc -b grava .tsbuildinfo ao lado do tsconfig.
      // Prefixo, e nao lista de nomes: tsconfig.client.json vazou para dist/
      // exatamente porque a lista nao previa um terceiro tsconfig.
      if (base.startsWith("tsconfig") && base.endsWith(".json")) return false;
      if (base.endsWith(".tsbuildinfo") || base.endsWith(".ts") || base.endsWith(".map")) return false;
      return true;
    }
  });

  for (const asset of SHARED_ASSETS) {
    const destination = path.join(output, asset.to);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(asset.from, destination);
  }
}

// Geracao antes da copia: o modulo ES5 do contrato faz parte do host montado, e
// gera-lo depois deixaria o build de uma arvore limpa emitindo a versao anterior.
await mkdir(path.dirname(CONTRACTS_ES5_PATH), { recursive: true });
await writeFile(CONTRACTS_ES5_PATH, await renderContractsModule(), "utf8");
await writeFile(DESCRIPTORS_ES5_PATH, await renderDescriptorsModule(), "utf8");

await copyAppShell("premiere-uxp", "premiere-uxp");
await copyAppShell("after-effects-cep", "after-effects-cep");

// O host do After Effects e montado, nao copiado: a diretiva #target e emitida
// aqui para que os fontes permanecam JavaScript verificavel por ferramenta.
const extendScript = await buildExtendScript(
  path.join(dist, "after-effects-cep", "host", "index.jsx")
);

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
