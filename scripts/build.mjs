import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });

if (process.argv.includes("--clean-only")) {
  console.log("dist removido.");
  process.exit(0);
}

async function buildHost(sourceName, outputName) {
  const output = path.join(dist, outputName);
  await mkdir(output, { recursive: true });
  await cp(path.join(src, sourceName), output, { recursive: true });
  await mkdir(path.join(output, "shared"), { recursive: true });
  await mkdir(path.join(output, "styles"), { recursive: true });
  await cp(path.join(src, "shared", "protocol.js"), path.join(output, "shared", "protocol.js"));
  await cp(path.join(src, "shared", "theme.css"), path.join(output, "styles", "theme.css"));
}

await buildHost("premiere-uxp", "premiere-uxp");
await buildHost("after-effects-cep", "after-effects-cep");

const buildInfo = {
  name: "adobe-crosshost-plugin-starter",
  version: "0.1.0",
  builtAt: new Date().toISOString(),
  outputs: ["premiere-uxp", "after-effects-cep"]
};

await writeFile(
  path.join(dist, "BUILD_INFO.json"),
  JSON.stringify(buildInfo, null, 2) + "\n",
  "utf8"
);

console.log("Build concluído em dist/.");
