// Administrator credential ({ url, serviceKey }) in the OS secret store.
//   macOS:   Keychain item com.motion.admin / <account> (`security`)
//   Windows: Credential Manager, through the panel's own motion-account-vault.exe
//            (built by `npm run build`), so no secret ever goes on a command line.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const VAULT_BINARY = path.join(root, "dist", "after-effects-cep", "account", "bin", "win32-x64", "motion-account-vault.exe");
const VAULT_MAX_BYTES = 2560;

/** One request to the vault's versioned stdin protocol (native/account-vault/main.cpp). */
function vault(operation, account, value = "") {
  if (!existsSync(VAULT_BINARY)) throw new Error("Cofre do Windows não encontrado. Rode `npm run build` (precisa do Visual Studio Build Tools).");
  const key = createHash("sha256").update(`com.motion.admin/${account}`).digest("hex");
  const result = spawnSync(VAULT_BINARY, [], { input: `1\t${operation}\t${key}\t${Buffer.from(value, "utf8").toString("hex")}\n`, encoding: "utf8", windowsHide: true });
  const output = result.stdout ?? "";
  if (output === "1\tmissing\n") return null;
  const match = /^1\tok\t([0-9a-f]*)\n$/.exec(output);
  if (result.status !== 0 || !match) throw new Error("O Gerenciador de Credenciais do Windows recusou a operação.");
  return Buffer.from(match[1], "hex").toString("utf8");
}

export function adminCredential({ account = "default" } = {}) {
  if (process.platform === "win32") {
    return {
      read() { const raw = vault("read", account); return raw === null ? null : JSON.parse(raw); },
      write(value) {
        const text = JSON.stringify(value);
        if (Buffer.byteLength(text) > VAULT_MAX_BYTES) throw new Error("Credencial grande demais para o cofre do Windows.");
        vault("write", account, text);
      },
      remove() { vault("remove", account); }
    };
  }
  if (process.platform === "darwin") {
    return {
      read() {
        try { return JSON.parse(execFileSync("security", ["find-generic-password", "-s", "com.motion.admin", "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
        catch { return null; }
      },
      write(value) { execFileSync("security", ["add-generic-password", "-U", "-s", "com.motion.admin", "-a", account, "-w", JSON.stringify(value)]); },
      remove() { try { execFileSync("security", ["delete-generic-password", "-s", "com.motion.admin", "-a", account], { stdio: "ignore" }); } catch { /* already absent */ } }
    };
  }
  throw new Error("A credencial de administração é suportada no macOS e no Windows.");
}

/**
 * How to run `npx <args>`. On Windows npx is a .cmd shim and Node refuses to
 * spawn .cmd files without a shell; running npm's npx-cli.js with this node
 * avoids the shell (and its quoting rules) entirely.
 */
export function npxInvocation(args) {
  if (process.platform === "win32") {
    const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    return { command: process.execPath, args: [cli, ...args] };
  }
  return { command: "npx", args: [...args] };
}
