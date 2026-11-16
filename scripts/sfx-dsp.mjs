/**
 * Primitivas de sintese dos sons do Moti.on (ADR 0006): ruido com semente fixa,
 * filtro de estado variavel, envelopes e osciladores. Sem samples de terceiros.
 */
export const SFX_RATE = 48000;

/** Gerador pseudoaleatorio mulberry32: o mesmo ruido em toda maquina. */
export function noise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

/** Filtro de estado variavel (Chamberlin) com corte que pode variar por amostra. */
export function svf() {
  let low = 0, band = 0;
  return (input, cutoff, q) => {
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff, SFX_RATE / 6) / SFX_RATE);
    low += f * band;
    const high = input - low - q * band;
    band += f * high;
    return { low, band, high };
  };
}

/** Oscilador senoidal de frequencia variavel (fase acumulada, sem cliques). */
export function osc() {
  let phase = 0;
  return frequency => { phase += 2 * Math.PI * frequency / SFX_RATE; return Math.sin(phase); };
}

export const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
/** Ataque curto e decaimento exponencial. */
export const hit = (t, attack, decay) => smooth(t / attack) * Math.exp(-t * decay);

export function render(seconds, sample) {
  const out = new Float64Array(Math.round(seconds * SFX_RATE));
  for (let i = 0; i < out.length; i++) out[i] = sample(i / SFX_RATE, i / out.length);
  return out;
}
