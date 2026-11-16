#!/usr/bin/env node
// One-time provisioning of the Moti.on account service on an existing Supabase project.
//   node services/supabase/scripts/setup.mjs <project-ref>
// Requires `npx supabase login` first. Idempotent: rerunning keeps the existing lease key.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, createPublicKey, createPrivateKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminCredential, npxInvocation } from "./admin-credential.mjs";

const ref = process.argv[2];
if (!/^[a-z0-9]{20}$/.test(ref ?? "")) {
  console.error("Uso: node services/supabase/scripts/setup.mjs <project-ref>\nO project-ref é o código de 20 letras na URL do painel Supabase (https://supabase.com/dashboard/project/<ref>).");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const servicesDir = path.join(root, "services");
const CLI = ["--yes", "supabase@2.120.0"];
const supabase = (args, options = {}) => {
  const npx = npxInvocation([...CLI, ...args, "--workdir", servicesDir]);
  return execFileSync(npx.command, npx.args, { stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit", encoding: "utf8" });
};
// Fail before touching the project when the OS secret store is not usable (Windows needs the built vault).
const admin = adminCredential();
admin.read();

// The private lease key never leaves this computer except into the function secret store.
// On Windows the user profile folder is private by default ACLs (mode bits are ignored there).
const keyDir = path.join(homedir(), ".motion-admin");
const privatePath = path.join(keyDir, `lease-${ref}.pem`);
mkdirSync(keyDir, { recursive: true, mode: 0o700 });
if (!existsSync(privatePath)) {
  const { privateKey } = generateKeyPairSync("ed25519");
  writeFileSync(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
}
chmodSync(privatePath, 0o600);
const privatePem = readFileSync(privatePath, "utf8");
const publicPem = createPublicKey(createPrivateKey(privatePem)).export({ type: "spki", format: "pem" });

console.log("\n1/5 Vinculando o projeto…");
supabase(["link", "--project-ref", ref]);
console.log("\n2/5 Aplicando tabelas e regras de licença…");
supabase(["db", "push", "--linked", "--include-all"]);
console.log("\n3/5 Gravando o segredo de assinatura…");
// Single-line DER in a private env file: no key material on the command line.
const envFile = path.join(keyDir, `secrets-${ref}.env`);
const der = createPrivateKey(privatePem).export({ type: "pkcs8", format: "der" }).toString("base64");
writeFileSync(envFile, `MOTION_LEASE_PRIVATE_KEY=${der}\n`, { mode: 0o600 });
supabase(["secrets", "set", "--project-ref", ref, "--env-file", envFile]);
console.log("\n4/5 Publicando as funções motion-account e motion-assets…");
supabase(["functions", "deploy", "motion-account", "--project-ref", ref, "--no-verify-jwt"]);
// The stock library stays off until assets-setup.mjs stores at least one provider key.
supabase(["functions", "deploy", "motion-assets", "--project-ref", ref, "--no-verify-jwt"]);

console.log("\n5/5 Gerando configuração do painel e credencial de administração…");
const keys = JSON.parse(supabase(["projects", "api-keys", "--project-ref", ref, "--reveal", "-o", "json"], { capture: true }));
const pick = (...names) => keys.find(key => names.includes(key.name) || names.includes(key.type))?.api_key;
const publishableKey = pick("publishable", "anon"), serviceKey = pick("service_role", "secret");
if (!publishableKey || !serviceKey) { console.error("Não foi possível ler as chaves do projeto."); process.exit(1); }
const url = `https://${ref}.supabase.co`;
// Public values only: URL, publishable key and the lease verification key.
writeFileSync(path.join(root, "apps/after-effects-cep/account/config.json"), JSON.stringify({ url, publishableKey, leasePublicKey: publicPem }, null, 2) + "\n");
// The service key is administrator-only and stays in the OS secret store (Keychain / Credential Manager).
admin.write({ url, serviceKey });

console.log(`
Serviço pronto. Falta só a parte do Google (feita uma vez, no navegador):
  • Google Cloud → Credenciais → ID do cliente OAuth (Aplicativo da Web)
      URI de redirecionamento autorizado: ${url}/auth/v1/callback
  • Supabase → Authentication → Sign In / Providers → Google: ative e cole Client ID e Client Secret
  • Supabase → Authentication → URL Configuration → Redirect URLs: adicione
      http://127.0.0.1:*/motion/**
Depois rode "Atualizar Moti.on.command" (macOS) ou "Atualizar Moti.on.cmd -RealLicense" (Windows) e libere a sua conta com:
  node services/supabase/admin/motion-admin.mjs grant <seu-email>`);
