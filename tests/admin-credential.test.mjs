import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import process from "node:process";
import { adminCredential, npxInvocation, VAULT_BINARY } from "../services/supabase/scripts/admin-credential.mjs";

/**
 * Credencial de administração (URL + service key do Supabase). No Windows vai
 * para o Gerenciador de Credenciais pelo mesmo motion-account-vault.exe do
 * painel; no macOS continua no Keychain (`security`). A conta de teste é
 * aleatória e removida no fim: nunca toca a credencial real ("default").
 */
test("admin credential round-trips through the Windows Credential Manager", {
  skip: process.platform !== "win32" || !existsSync(VAULT_BINARY) ? "cofre do Windows não compilado nesta máquina" : false
}, () => {
  const store = adminCredential({ account: `test-${randomUUID()}` });
  const value = { url: "https://abcdefghijklmnopqrst.supabase.co", serviceKey: "sb_secret_teste_çã" };
  try {
    assert.equal(store.read(), null);
    store.write(value);
    assert.deepEqual(store.read(), value);
    store.remove();
    assert.equal(store.read(), null);
  } finally {
    store.remove();
  }
});

test("admin credential refuses values the vault cannot hold instead of truncating them", {
  skip: process.platform !== "win32" ? "limite do cofre do Windows" : false
}, () => {
  const store = adminCredential({ account: `test-${randomUUID()}` });
  assert.throws(() => store.write({ url: "https://x.supabase.co", serviceKey: "k".repeat(3000) }), /grande/);
});

test("npx runs through node itself on Windows (Node refuses to spawn .cmd without a shell)", () => {
  const { command, args } = npxInvocation(["--yes", "supabase@2.120.0", "link"]);
  if (process.platform === "win32") {
    assert.equal(command, process.execPath);
    assert.match(args[0], /npx-cli\.js$/);
    assert.deepEqual(args.slice(1), ["--yes", "supabase@2.120.0", "link"]);
  } else {
    assert.equal(command, "npx");
    assert.deepEqual(args, ["--yes", "supabase@2.120.0", "link"]);
  }
});
