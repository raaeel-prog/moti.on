"use strict";
// Local Node boundary: fixed executable, bounded private pipes, fixed HTTPS origin.
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
exports.createRuntime = function createRuntime(openBrowser) {
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8")); } catch { /* Setup remains explicitly unavailable. */ }
  const origin = config && typeof config.url === "string" ? config.url : "";
  const binary = path.join(__dirname, "bin", process.platform + "-" + process.arch, "motion-account-vault" + (process.platform === "win32" ? ".exe" : ""));
  function vault(operation, key, value = "") {
    return new Promise((resolve, reject) => {
      if (!/^motion\.account\.(session|device)\.v1:https:\/\//.test(key) || Buffer.byteLength(value) > 2560) { reject(new Error("VAULT_UNAVAILABLE")); return; }
      const child = spawn(binary, [], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true, shell: false });
      let output = "", settled = false;
      const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(new Error("VAULT_UNAVAILABLE")); else resolve(result); };
      const timer = setTimeout(() => { child.kill(); finish(true); }, 30000);
      child.on("error", () => finish(true)); child.stdin.on("error", () => finish(true));
      child.stdout.on("data", chunk => { output += chunk.toString("utf8"); if (output.length > 6000) { child.kill(); finish(true); } });
      child.on("close", code => {
        if (code !== 0) return finish(true);
        if (output === "1\tmissing\n") return finish(false, null);
        const match = /^1\tok\t([0-9a-f]*)\n$/.exec(output);
        if (!match || match[1].length % 2) return finish(true);
        finish(false, Buffer.from(match[1], "hex").toString("utf8"));
      });
      child.stdin.end(`1\t${operation}\t${crypto.createHash("sha256").update(key).digest("hex")}\t${Buffer.from(value, "utf8").toString("hex")}\n`);
    });
  }
  const transport = { request(request) {
    return new Promise((resolve, reject) => {
      let url; try { url = new URL(request.url); } catch { reject(new Error("INVALID_URL")); return; }
      if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password || !/^\/(auth\/v1\/|functions\/v1\/motion-account)/.test(url.pathname)) { reject(new Error("INVALID_URL")); return; }
      const body = request.body === undefined ? "" : JSON.stringify(request.body);
      if (Buffer.byteLength(body) > 1048576) { reject(new Error("REQUEST_TOO_LARGE")); return; }
      const call = https.request(url, { method: request.method, headers: request.headers, timeout: 15000 }, response => {
        let data = "";
        response.on("data", chunk => { data += chunk.toString("utf8"); if (data.length > 2097152) call.destroy(new Error("RESPONSE_TOO_LARGE")); });
        response.on("error", reject);
        response.on("end", () => { try { resolve({ status: response.statusCode, body: data ? JSON.parse(data) : null }); } catch { reject(new Error("RESPONSE_INVALID")); } });
      });
      call.on("timeout", () => call.destroy(new Error("NETWORK_TIMEOUT"))); call.on("error", reject); call.end(body);
    });
  } };
  return {
    config,
    transport,
    vault: { read: key => vault("read", key), write: (key, value) => vault("write", key, value).then(() => {}), remove: key => vault("remove", key).then(() => {}) },
    crypto: {
      randomId: () => crypto.randomUUID(), randomVerifier: () => crypto.randomBytes(48).toString("base64url"),
      sha256Base64Url: async value => crypto.createHash("sha256").update(value).digest("base64url"),
      verifyEd25519: async (value, signature, publicKey) => { try { const key = crypto.createPublicKey(publicKey); return key.asymmetricKeyType === "ed25519" && crypto.verify(null, Buffer.from(value), key, Buffer.from(signature, "base64url")); } catch { return false; } }
    },
    login: { async begin() {
      const route = "/motion/" + crypto.randomBytes(24).toString("hex");
      let resolveCallback, rejectCallback, consumed = false, timer, expectedState = "";
      const callback = new Promise((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
      callback.catch(() => {});
      const server = http.createServer((request, response) => {
        const address = server.address();
        response.setHeader("Cache-Control", "no-store"); response.setHeader("Content-Security-Policy", "default-src 'none'"); response.setHeader("Referrer-Policy", "no-referrer");
        if (consumed || request.method !== "GET" || request.headers.host !== `127.0.0.1:${address.port}` || (request.url || "").length > 5000) { response.writeHead(404).end(); return; }
        const url = new URL(request.url, `http://127.0.0.1:${address.port}`);
        const state = url.searchParams.get("motion_state"), code = url.searchParams.get("code");
        if (url.pathname !== route || !expectedState || state !== expectedState || url.searchParams.getAll("motion_state").length !== 1) { response.writeHead(404).end(); return; }
        consumed = true; clearTimeout(timer);
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (!code || url.searchParams.getAll("code").length !== 1 || url.searchParams.has("error")) { response.writeHead(400).end("Login não concluído. Volte ao Moti.on."); rejectCallback(new Error("OAUTH_CANCELLED")); }
        else { response.end("Você pode voltar ao Moti.on."); resolveCallback({ code, state }); }
        server.close();
      });
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const redirectUri = `http://127.0.0.1:${server.address().port}${route}`;
      timer = setTimeout(() => { consumed = true; server.close(); rejectCallback(new Error("OAUTH_EXPIRED")); }, 300000);
      return { redirectUri,
        async open(raw) { const url = new URL(raw); if (url.origin !== origin || url.pathname !== "/auth/v1/authorize") throw new Error("INVALID_URL"); const redirect = new URL(url.searchParams.get("redirect_to")); if (redirect.origin + redirect.pathname !== redirectUri) throw new Error("INVALID_CALLBACK"); expectedState = redirect.searchParams.get("motion_state"); await openBrowser(raw); },
        waitForCallback: () => callback,
        async close() { clearTimeout(timer); server.close(); if (!consumed) { consumed = true; rejectCallback(new Error("OAUTH_CANCELLED")); } }
      };
    } }
  };
};
