#!/usr/bin/env node
// Moti.on stock media library: provider keys, table and function (docs/BANCO_DE_MIDIA.md).
//   node services/supabase/scripts/assets-setup.mjs <project-ref>           asks for each key
//   node services/supabase/scripts/assets-setup.mjs <project-ref> status    shows which keys are set
//   node services/supabase/scripts/assets-setup.mjs <project-ref> remover pexels
// Keys are typed without echo, written to a private temporary env file, sent with
// `supabase secrets set --env-file` and the file is deleted. They never reach the plugin.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { npxInvocation } from "./admin-credential.mjs";

export const PROVIDERS = [
  { id: "pexels", secret: "PEXELS_API_KEY", name: "Pexels (vídeos e fotos)", where: "https://www.pexels.com/api/new/" },
  { id: "pixabay", secret: "PIXABAY_API_KEY", name: "Pixabay (vídeos e imagens)", where: "https://pixabay.com/api/docs/ (entre na conta: a chave aparece na página)" },
  { id: "unsplash", secret: "UNSPLASH_ACCESS_KEY", name: "Unsplash (fotos) — use a Access Key", where: "https://unsplash.com/oauth/applications" },
  { id: "freesound", secret: "FREESOUND_API_KEY", name: "Freesound (efeitos sonoros) — uso comercial exige acordo, veja a ADR 0008", where: "https://freesound.org/apiv2/apply/" }
];
/** Keys are opaque provider tokens: printable ASCII, no spaces, no quotes or `=` that could break an env file. */
export function validKey(value) { return /^[A-Za-z0-9._~+/-]{8,200}$/.test(value); }
export function envFile(entries) { return entries.map(([name, value]) => `${name}=${value}\n`).join(""); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const servicesDir = path.join(root, "services");
const CLI = ["--yes", "supabase@2.120.0"];
function supabase(args, capture = false) {
  const npx = npxInvocation([...CLI, ...args, "--workdir", servicesDir]);
  return execFileSync(npx.command, npx.args, { stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit", encoding: "utf8" });
}

/** Reads one line without echoing it (the terminal shows nothing while typing). */
function ask(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) { reject(new Error("Rode este script num terminal interativo.")); return; }
    process.stdout.write(question);
    input.setRawMode(true); input.resume(); input.setEncoding("utf8");
    let value = "";
    const done = result => { input.setRawMode(false); input.pause(); input.removeListener("data", onData); process.stdout.write("\n"); resolve(result); };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === "\u0003") { input.setRawMode(false); process.exit(130); }
        if (char === "\r" || char === "\n") { done(value.trim()); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1); else value += char;
      }
    }
    input.on("data", onData);
  });
}

function configured(ref) {
  const rows = JSON.parse(supabase(["secrets", "list", "--project-ref", ref, "-o", "json"], true));
  return new Set(rows.map(row => row.name));
}
function status(ref) {
  const names = configured(ref);
  console.table(PROVIDERS.map(p => ({ banco: p.name, chave: names.has(p.secret) ? "configurada" : "—" })));
}
function setSecrets(ref, entries) {
  const dir = path.join(homedir(), ".motion-admin"), file = path.join(dir, `assets-${ref}-${process.pid}.env`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { writeFileSync(file, envFile(entries), { mode: 0o600 }); supabase(["secrets", "set", "--project-ref", ref, "--env-file", file]); }
  finally { rmSync(file, { force: true }); }
}

async function main() {
  const [ref, command, target] = process.argv.slice(2);
  if (!/^[a-z0-9]{20}$/.test(ref ?? "")) { console.error("Uso: node services/supabase/scripts/assets-setup.mjs <project-ref> [status | remover <banco>]"); process.exit(1); }
  if (command === "status") { status(ref); return; }
  if (command === "remover" || command === "remove") {
    const provider = PROVIDERS.find(p => p.id === target);
    if (!provider) { console.error(`Banco desconhecido. Use: ${PROVIDERS.map(p => p.id).join(", ")}`); process.exit(1); }
    supabase(["secrets", "unset", "--project-ref", ref, provider.secret, "--yes"]);
    console.log(`${provider.name} desligado. O painel deixa de oferecê-lo na próxima busca, sem atualizar o plugin.`);
    return;
  }
  console.log("1/3 Aplicando a tabela de cache e o limite por conta…");
  supabase(["link", "--project-ref", ref]);
  supabase(["db", "push", "--linked", "--include-all"]);
  console.log("\n2/3 Chaves dos bancos. Enter em branco mantém a chave atual (ou deixa o banco desligado).");
  const entries = [];
  for (const provider of PROVIDERS) {
    console.log(`\n${provider.name}\n  Onde pegar: ${provider.where}`);
    const value = await ask("  Cole a chave (não aparece na tela): ");
    if (!value) continue;
    if (!validKey(value)) { console.error("  Chave com formato inesperado; ignorada."); continue; }
    entries.push([provider.secret, value]);
  }
  if (entries.length) setSecrets(ref, entries);
  console.log("\n3/3 Publicando a função motion-assets…");
  supabase(["functions", "deploy", "motion-assets", "--project-ref", ref, "--no-verify-jwt"]);
  status(ref);
  console.log("\nPronto. Contas aprovadas veem a aba Banco de mídia no painel, ao lado de Presets.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("Falhou:", error.message); process.exit(1); });
}
