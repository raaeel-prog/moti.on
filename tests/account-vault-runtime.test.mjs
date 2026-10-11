import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accountDir = path.join(root, "dist", "after-effects-cep", "account");
const binary = path.join(accountDir, "bin", "win32-x64", "motion-account-vault.exe");

/**
 * Ida e volta real pelo Gerenciador de Credenciais, pelo mesmo runtime.cjs que o
 * painel usa. So no Windows: no macOS o Keychain pode pedir confirmacao ao
 * usuario. Pega a regressao de 2026-10-11 (stdout em modo texto devolvia "\r\n"
 * e o runtime recusava toda resposta com VAULT_UNAVAILABLE).
 */
test("account vault round-trips through runtime.cjs on Windows", {
  skip: process.platform !== "win32" || !existsSync(binary) ? "cofre do Windows não compilado nesta máquina" : false
}, async () => {
  const require = createRequire(import.meta.url);
  const { createRuntime } = require(path.join(accountDir, "runtime.cjs"));
  const { vault } = createRuntime(async () => {});
  const key = `motion.account.session.v1:https://vault-test.invalid/${randomUUID()}`;
  try {
    await vault.write(key, "sessão-teste");
    assert.equal(await vault.read(key), "sessão-teste");
    await vault.remove(key);
    assert.equal(await vault.read(key), null);
  } finally {
    await vault.remove(key).catch(() => {});
  }
});
