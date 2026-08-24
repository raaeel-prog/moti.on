import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");

/**
 * Arquivos e diretorios que existem em src/ para desenvolvimento mas nao podem
 * entrar no output de build.
 *
 * `.debug` declara a porta de depuracao remota do CEP (8091). Ele e instalado
 * na pasta da extensao pelos scripts install-ae-dev quando a flag de debug e
 * passada; enviar essa porta num pacote distribuivel abriria um canal de
 * depuracao na maquina do usuario final.
 */
const EXCLUDED_FROM_DIST = new Set([".debug"]);

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

await rm(dist, { recursive: true, force: true });

if (process.argv.includes("--clean-only")) {
  console.log("dist removido.");
  process.exit(0);
}

async function buildHost(sourceName, outputName) {
  const output = path.join(dist, outputName);
  await mkdir(output, { recursive: true });
  await cp(path.join(src, sourceName), output, {
    recursive: true,
    filter: (source) => !EXCLUDED_FROM_DIST.has(path.basename(source))
  });
  await mkdir(path.join(output, "shared"), { recursive: true });
  await mkdir(path.join(output, "styles"), { recursive: true });
  await cp(path.join(src, "shared", "protocol.js"), path.join(output, "shared", "protocol.js"));
  await cp(path.join(src, "shared", "theme.css"), path.join(output, "styles", "theme.css"));
}

await buildHost("premiere-uxp", "premiere-uxp");
await buildHost("after-effects-cep", "after-effects-cep");

// name e version vem de package.json. Mante-los hardcoded aqui fazia o
// BUILD_INFO declarar uma versao que podia divergir da real sem que nada
// falhasse.
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

console.log("Build concluído em dist/.");
