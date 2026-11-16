/**
 * Sons dos Elementos, sintetizados pelo Moti.on (ADR 0006).
 *
 * Nenhum sample de terceiros: cada som e ruido com semente fixa, senoides e
 * filtros simples calculados aqui. O resultado e o mesmo a cada build, em WAV
 * PCM 16 bits mono a 48 kHz, que o After Effects importa como footage de audio.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SFX_RATE, noise, render, smooth, svf } from "./sfx-dsp.mjs";
import { SFX_LIBRARY_RECIPES } from "./sfx-library.mjs";

export { SFX_RATE };
const PEAK = 0.89; // -1 dBFS

const RECIPES = {
  whoosh: () => {
    const random = noise(11), filter = svf();
    return render(.62, (t, u) => {
      const envelope = Math.pow(Math.sin(Math.PI * Math.pow(u, .8)), 2.2);
      const cutoff = 350 + 2600 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      return filter(random(), cutoff, .55).band * envelope;
    });
  },
  impact: () => {
    const random = noise(23), filter = svf();
    let phase = 0;
    return render(.9, t => {
      const frequency = 42 + 90 * Math.exp(-t * 18);
      phase += 2 * Math.PI * frequency / SFX_RATE;
      const body = Math.sin(phase) * Math.exp(-t * 5.5);
      const crack = filter(random(), 1800, .7).low * Math.exp(-t * 60);
      return Math.tanh(1.6 * (body + .8 * crack));
    });
  },
  pop: () => {
    const random = noise(37);
    let phase = 0;
    return render(.24, t => {
      const frequency = 280 + 760 * Math.exp(-t * 55);
      phase += 2 * Math.PI * frequency / SFX_RATE;
      return Math.sin(phase) * Math.exp(-t * 24) + .25 * random() * Math.exp(-t * 400);
    });
  },
  rise: () => {
    const random = noise(41), filter = svf();
    let phase = 0;
    return render(1.2, (t, u) => {
      const frequency = 180 * Math.pow(7, u);
      phase += 2 * Math.PI * frequency / SFX_RATE;
      const envelope = Math.pow(u, 1.6) * smooth((1 - u) / .04);
      const air = filter(random(), 300 + 6000 * u * u, .6).band;
      return (.55 * Math.sin(phase) + .35 * Math.sin(phase * 2.01) + .8 * air) * envelope;
    });
  },
  click: () => {
    const random = noise(53), filter = svf();
    return render(.1, t => {
      const tick = filter(random(), 4200, .5).band * Math.exp(-t * 320);
      return tick + .6 * Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 180);
    });
  },
  chime: () => render(1.4, t => {
    // Parciais inarmonicas de sino, cada uma com o proprio decaimento.
    const partials = [[1, 1, 2.6], [2.76, .5, 4.2], [5.4, .28, 7], [8.93, .14, 11]];
    let sum = 0;
    for (const [ratio, gain, decay] of partials) sum += gain * Math.sin(2 * Math.PI * 1320 * ratio * t) * Math.exp(-t * decay);
    return sum * smooth(t / .003);
  })
};
Object.assign(RECIPES, SFX_LIBRARY_RECIPES);
export const SFX_IDS = Object.freeze(Object.keys(RECIPES));

/** Normaliza o pico e apara as bordas para nao estalar no corte. */
function finish(samples) {
  const fadeIn = Math.round(.002 * SFX_RATE), fadeOut = Math.round(.012 * SFX_RATE);
  const faded = samples.map((v, i) => v * smooth(i / fadeIn) * smooth((samples.length - 1 - i) / fadeOut));
  let peak = 0;
  for (const v of faded) peak = Math.max(peak, Math.abs(v));
  if (!(peak > 0) || !Number.isFinite(peak)) throw new Error("Som sintetizado sem sinal.");
  return faded.map(v => v / peak * PEAK);
}

export function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii"); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SFX_RATE, 24); header.writeUInt32LE(SFX_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii"); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function synthesize(id) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`Som desconhecido: ${id}`);
  return finish(recipe());
}

export async function generateSfx(directory) {
  await mkdir(directory, { recursive: true });
  for (const id of SFX_IDS) await writeFile(path.join(directory, `${id}.wav`), encodeWav(synthesize(id)));
  return SFX_IDS.map(id => `${id}.wav`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] ?? fileURLToPath(new URL("../dist/after-effects-cep/assets/sounds", import.meta.url));
  const files = await generateSfx(target);
  console.log(`${files.length} sons em ${target}`);
}
