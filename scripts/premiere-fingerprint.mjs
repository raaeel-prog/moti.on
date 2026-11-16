/**
 * Guards the Premiere build while AE-only motion work lands.
 *
 *   node scripts/premiere-fingerprint.mjs --record   # store the current dist/premiere-uxp hashes
 *   node scripts/premiere-fingerprint.mjs --check    # fail if any Premiere file changed
 *
 * The manifest lives in artifacts/ (local evidence, not shipped). Run --record only
 * when a Premiere change is intended and approved.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "dist", "premiere-uxp");
const manifestPath = path.join(root, "artifacts", "premiere-fingerprint.json");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }));
  return files.flat();
}

async function fingerprint() {
  const files = (await walk(target)).sort();
  const hashes = {};
  for (const file of files) {
    hashes[path.relative(target, file).split(path.sep).join("/")] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return hashes;
}

const mode = process.argv[2];
if (mode !== "--record" && mode !== "--check") {
  console.error("Uso: node scripts/premiere-fingerprint.mjs --record | --check");
  process.exit(2);
}
const current = await fingerprint();
if (mode === "--record") {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({ recordedAt: new Date().toISOString(), files: current }, null, 2)}\n`, "utf8");
  console.log(`Premiere fingerprint gravado: ${Object.keys(current).length} arquivos.`);
} else {
  let saved;
  try { saved = JSON.parse(await readFile(manifestPath, "utf8")).files; }
  catch { console.error("Sem fingerprint gravado. Rode --record antes da primeira mudança."); process.exit(2); }
  const names = new Set([...Object.keys(saved), ...Object.keys(current)]);
  const changed = [...names].filter(name => saved[name] !== current[name]).sort();
  if (changed.length) {
    console.error(`Premiere mudou em ${changed.length} arquivo(s):\n${changed.map(name => `  ${name}${!(name in current) ? " (removido)" : !(name in saved) ? " (novo)" : ""}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Premiere inalterado: ${names.size} arquivos conferidos.`);
}
