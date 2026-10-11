#!/usr/bin/env node
// Moti.on license administration. Runs only on the administrator's Mac: the service key
// is read from the Keychain item written by scripts/setup.mjs (or MOTION_ADMIN_URL/MOTION_ADMIN_KEY).
import { execFileSync } from "node:child_process";

const HELP = `Moti.on — administração de licenças

  usuarios                      Lista todas as contas, licença e computador ativo
  pendentes                     Contas que entraram com Google e aguardam aprovação
  aprovar <email> [dias]        Libera a licença beta (sem prazo, ou por N dias)
  revogar <email>               Revoga a licença e desativa todos os computadores
  liberar <email> [deviceId]    Libera o computador ativo (para trocar de máquina)
  bloquear <email>              Bloqueia o login Google da conta e encerra as sessões
  desbloquear <email>           Remove o bloqueio de login
  historico [email]             Últimos eventos de licença (aprovação, ativação…)

Atalhos em inglês: users, pending, grant, revoke, release, block, unblock, audit.`;

function credentials() {
  if (process.env.MOTION_ADMIN_URL && process.env.MOTION_ADMIN_KEY) return { url: process.env.MOTION_ADMIN_URL, serviceKey: process.env.MOTION_ADMIN_KEY };
  try { return JSON.parse(execFileSync("security", ["find-generic-password", "-s", "com.motion.admin", "-a", "default", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { console.error("Credencial de administração não encontrada. Rode services/supabase/scripts/setup.mjs primeiro."); process.exit(1); }
}
const COMMANDS = new Set(["usuarios", "users", "pendentes", "pending", "aprovar", "grant", "revogar", "revoke", "liberar", "release", "bloquear", "block", "desbloquear", "unblock", "historico", "audit"]);
if (!COMMANDS.has(process.argv[2])) { console.log(HELP); process.exit(0); }
const { url, serviceKey } = credentials();
const headers = { apikey: serviceKey, "Content-Type": "application/json", ...(serviceKey.startsWith("eyJ") ? { Authorization: `Bearer ${serviceKey}` } : {}) };

async function call(method, route, body) {
  const response = await fetch(url + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function users() {
  const all = [];
  for (let page = 1; ; page++) {
    const result = await call("GET", `/auth/v1/admin/users?page=${page}&per_page=1000`);
    all.push(...result.users);
    if (result.users.length < 1000) return all;
  }
}
async function find(email) {
  if (!email) { console.error("Informe o e-mail."); process.exit(1); }
  const user = (await users()).find(item => item.email?.toLowerCase() === email.toLowerCase());
  if (!user) { console.error(`Nenhuma conta com ${email}. A pessoa precisa entrar com Google no painel uma vez.`); process.exit(1); }
  return user;
}
const date = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
const banned = user => user.banned_until && new Date(user.banned_until) > new Date();

async function overview(onlyPending) {
  const [list, licenses, devices] = await Promise.all([users(), call("GET", "/rest/v1/motion_licenses?select=*"), call("GET", "/rest/v1/motion_devices?select=*&deactivated_at=is.null")]);
  const rows = list.map(user => {
    const license = licenses.find(item => item.user_id === user.id), device = devices.find(item => item.user_id === user.id);
    const state = banned(user) ? "bloqueada" : !license ? "pendente" : license.status === "revoked" ? "revogada" : license.expires_at && new Date(license.expires_at) <= new Date() ? "expirada" : "ativa";
    return { email: user.email, nome: user.user_metadata?.full_name ?? "", licença: state, validade: license?.expires_at ? date(license.expires_at) : license ? "sem prazo" : "—", computador: device ? `${device.name} (${device.device_id.slice(0, 8)}…)` : "—", "último login": date(user.last_sign_in_at) };
  }).filter(row => !onlyPending || row.licença === "pendente");
  if (rows.length) console.table(rows); else console.log(onlyPending ? "Nenhuma conta pendente." : "Nenhuma conta ainda.");
}

const [command, arg, extra] = process.argv.slice(2);
try {
  switch (command) {
    case "usuarios": case "users": await overview(false); break;
    case "pendentes": case "pending": await overview(true); break;
    case "aprovar": case "grant": {
      const user = await find(arg), days = extra === undefined ? null : Number(extra);
      if (days !== null && !(Number.isInteger(days) && days > 0)) throw new Error("Dias deve ser um número inteiro positivo.");
      await call("POST", "/rest/v1/rpc/motion_admin_license", { p_user: user.id, p_action: "grant", p_expires: days ? new Date(Date.now() + days * 86400000).toISOString() : null });
      console.log(`Licença ativa para ${user.email}${days ? ` por ${days} dias` : " sem prazo"}. No painel: Configurações → Conta → Atualizar sessão e licença.`);
      break;
    }
    case "revogar": case "revoke": {
      const user = await find(arg);
      await call("POST", "/rest/v1/rpc/motion_admin_license", { p_user: user.id, p_action: "revoke" });
      console.log(`Licença de ${user.email} revogada. O painel perde acesso na próxima verificação (no máximo 7 dias se ficar offline). Para corte imediato da conta use também: bloquear ${user.email}`);
      break;
    }
    case "liberar": case "release": {
      const user = await find(arg);
      const count = await call("POST", "/rest/v1/rpc/motion_admin_device", { p_user: user.id, p_device: extra ?? null });
      console.log(`${count} computador(es) liberado(s) para ${user.email}. A pessoa pode ativar outro computador.`);
      break;
    }
    case "bloquear": case "block": case "desbloquear": case "unblock": {
      const user = await find(arg), block = command === "bloquear" || command === "block";
      await call("PUT", `/auth/v1/admin/users/${user.id}`, { ban_duration: block ? "876000h" : "none" });
      console.log(block ? `Login de ${user.email} bloqueado; as sessões existentes não renovam mais.` : `Bloqueio de ${user.email} removido.`);
      break;
    }
    case "historico": case "audit": {
      const list = await users(), user = arg ? await find(arg) : null;
      const events = await call("GET", `/rest/v1/motion_license_audit?select=*&order=created_at.desc&limit=50${user ? `&user_id=eq.${user.id}` : ""}`);
      console.table(events.map(event => ({ quando: date(event.created_at), conta: list.find(item => item.id === event.user_id)?.email ?? event.user_id, evento: { grant: "aprovação", revoke: "revogação", activate: "ativou computador", deactivate: "desativou computador" }[event.action], computador: event.device_id ?? "—" })));
      break;
    }
    default: console.log(HELP);
  }
} catch (error) { console.error("Falhou:", error.message); process.exit(1); }
