/**
 * Forma de onda dos sons do Moti.on para a barra de áudio da galeria.
 *
 * Os sons são sintetizados no build (`generate-sfx.mjs`), então os picos saem da
 * mesma síntese: nada é decodificado no painel. Cada som vira SOUND_PEAK_BARS
 * barras (pico absoluto por faixa, 0–100) e a duração em milissegundos.
 * Rodar `node scripts/generate-sound-peaks.mjs` depois de mudar uma receita.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SFX_IDS, SFX_RATE, synthesize } from "./generate-sfx.mjs";

export const SOUND_PEAK_BARS = 48;
export const SOUND_PEAKS_PATH = fileURLToPath(new URL("../apps/after-effects-cep/client/src/generated/sound-peaks.ts", import.meta.url));

/** Pico de cada faixa; a raiz quadrada abre os sons baixos como num medidor. */
export function soundPeaks(samples, bars = SOUND_PEAK_BARS) {
  const out = [];
  for (let bar = 0; bar < bars; bar++) {
    const from = Math.floor(bar * samples.length / bars), to = Math.max(from + 1, Math.floor((bar + 1) * samples.length / bars));
    let peak = 0;
    for (let i = from; i < to && i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out.push(Math.round(Math.sqrt(Math.min(1, peak / .89)) * 100));
  }
  return out;
}

export function renderSoundPeaksModule() {
  const rows = SFX_IDS.map(id => {
    const samples = synthesize(id);
    return `  ${JSON.stringify(id)}: { durationMs: ${Math.round(samples.length / SFX_RATE * 1000)}, peaks: [${soundPeaks(samples).join(",")}] }`;
  });
  return `/* Gerado por scripts/generate-sound-peaks.mjs a partir da síntese dos sons. Não editar. */\n`
    + `export interface SoundPeaks { readonly durationMs: number; readonly peaks: readonly number[] }\n`
    + `export const SOUND_PEAK_BARS = ${SOUND_PEAK_BARS};\n`
    + `export const SOUND_PEAKS: Readonly<Record<string, SoundPeaks>> = {\n${rows.join(",\n")}\n};\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeFile(SOUND_PEAKS_PATH, renderSoundPeaksModule(), "utf8");
  console.log(`Picos de ${SFX_IDS.length} sons em ${path.relative(process.cwd(), SOUND_PEAKS_PATH)}`);
}
