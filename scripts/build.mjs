import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildExtendScript } from "./build-extendscript.mjs";

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
  "tsconfig.json",
  "tsconfig.host.json",
  "node_modules",
  "tests",
  "types",
  "src"
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
    from: path.join(packages, "contracts", "legacy", "protocol.js"),
    to: path.join("shared", "protocol.js")
  },
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

await copyAppShell("premiere-uxp", "premiere-uxp");
await copyAppShell("after-effects-cep", "after-effects-cep");

// O host do After Effects e montado, nao copiado: a diretiva #target e emitida
// aqui para que os fontes permanecam JavaScript verificavel por ferramenta.
const extendScript = await buildExtendScript(
  path.join(dist, "after-effects-cep", "host", "index.jsx")
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
  `Build concluído em dist/. ExtendScript montado a partir de ${extendScript.files} fonte(s), ${extendScript.bytes} bytes.`
);
