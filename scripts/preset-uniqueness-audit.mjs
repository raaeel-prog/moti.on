/**
 * Auditoria de presets repetidos: dois presets ativos na mesma pasta com o mesmo
 * movimento (mesmos eixos e sentidos, magnitudes parecidas, mesmo efeito, mesma
 * revelação de texto e mesma família de curva) contam como repetidos.
 * Uso: node scripts/preset-uniqueness-audit.mjs [--json]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOTION_LIBRARY_PRESETS, MOTION_LIBRARY_EMULSION_PRESETS } from "../packages/contracts/dist/index.js";

const CURVE_FAMILY = { smooth: "soft", silk: "soft", velvet: "soft", glide: "soft", drift: "soft", cubic: "soft",
  overshoot: "spring", spring: "spring", "settle-wave": "spring", bounce: "bounce", "settle-hop": "bounce", snap: "snap", flicker: "flicker" };
const curve = easing => CURVE_FAMILY[easing] ?? (String(easing).endsWith("-in") ? "accel" : "soft");
/** Magnitude em faixas largas: 0, pequena, média, grande. */
const band = v => { const a = Math.abs(v); return a === 0 ? 0 : Math.sign(v) * (a < 40 ? 1 : a < 200 ? 2 : 3); };
const sband = v => { const a = Math.abs(v); return a === 0 ? 0 : Math.sign(v) * (a < 30 ? 1 : a < 80 ? 2 : 3); };

export function motionFingerprint(p) {
  const t = p.text;
  return JSON.stringify([p.category, p.mode, p.effect, p.waveform, p.fade, curve(p.easing),
    p.position.map(band), p.rotation.map(sband), p.scale.map(sband),
    t.reveal ?? "", t.decode, t.mask, Math.sign(t.tracking), Math.sign(t.skew), Boolean(t.blur), t.dimension ?? "2d",
    p.choreography?.path ?? "linear", p.choreography?.distribution ?? "uniform", Boolean(t.fill), p.effect === "none" ? 0 : Math.round(p.effectAngle / 45), p.pivot, p.travel ?? "authored", p.cameraSpec?.id ?? "", p.filmSpec?.id ?? ""]);
}

/** Prioridade de quem fica quando há repetição: coleções mais novas e cuidadas primeiro. */
const KEEP_RANK = { signature: 0, premium: 1, momentum: 2, text: 3, reveal: 4, looks: 5, emulsion: 6, studio: 7, gemini: 8, native: 9 };
export function duplicateGroups(presets = [...MOTION_LIBRARY_PRESETS, ...MOTION_LIBRARY_EMULSION_PRESETS]) {
  const groups = new Map();
  for (const p of presets) { if (p.retired) continue; const key = motionFingerprint(p); groups.set(key, [...(groups.get(key) ?? []), p]); }
  return [...groups.values()].filter(list => list.length > 1).map(list => [...list].sort((a, b) => (KEEP_RANK[a.collection ?? ""] ?? 10) - (KEEP_RANK[b.collection ?? ""] ?? 10)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const groups = duplicateGroups();
  if (process.argv.includes("--json")) console.log(JSON.stringify(groups.map(g => g.map(p => p.id)), null, 1));
  else {
    console.log(`${groups.length} grupos repetidos, ${groups.reduce((n, g) => n + g.length - 1, 0)} presets sobrando`);
    for (const g of groups) console.log(`- fica ${g[0].id}  |  repete: ${g.slice(1).map(p => p.id).join(", ")}`);
  }
}
