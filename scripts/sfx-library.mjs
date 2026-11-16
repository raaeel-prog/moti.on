/**
 * Biblioteca de sons do Moti.on: receitas proprias, uma ou mais por familia de
 * efeito sonoro (aproximacao, grave, bipe, explosao, estrondo, metal, clique,
 * vidro, rangido, ambiencia, estalo, deslize, passagem, batida, transicao).
 * Cada receita devolve amostras cruas; `generate-sfx.mjs` normaliza e grava.
 * Sementes fixas: o mesmo WAV em todo build.
 */
import { hit, noise, osc, render, smooth, svf } from "./sfx-dsp.mjs";

const TAU = 2 * Math.PI;

/** Varredura de ruido filtrado: base das passagens e deslizes. */
function sweep(seed, seconds, from, to, q, shape) {
  const random = noise(seed), filter = svf();
  return render(seconds, (t, u) => {
    const cutoff = from * Math.pow(to / from, u);
    return filter(random(), cutoff, q).band * shape(u);
  });
}

/** Estrondo: queda de frequencia senoidal com estalo de ruido grave. */
function boom(seed, seconds, base, drop, decay, crackDecay) {
  const random = noise(seed), filter = svf(), body = osc();
  return render(seconds, t => {
    const tone = body(base + drop * Math.exp(-t * 14)) * hit(t, .004, decay);
    const crack = filter(random(), 900, .8).low * Math.exp(-t * crackDecay);
    return Math.tanh(1.8 * (tone + .9 * crack));
  });
}

/** Parciais inarmonicas com decaimentos proprios: sinos, vidro e metal. */
function partials(seconds, fundamental, list, attack) {
  return render(seconds, t => {
    let sum = 0;
    for (const [ratio, gain, decay] of list) sum += gain * Math.sin(TAU * fundamental * ratio * t) * Math.exp(-t * decay);
    return sum * smooth(t / attack);
  });
}

export const SFX_LIBRARY_RECIPES = {
  // Aproximacao
  approach: () => {
    const random = noise(101), filter = svf(), tone = osc();
    return render(1.6, (t, u) => {
      const envelope = Math.pow(u, 2.4) * smooth((1 - u) / .03);
      return (filter(random(), 200 + 7000 * u * u, .5).band + .5 * tone(90 + 260 * u * u)) * envelope;
    });
  },
  "riser-pulse": () => {
    const tone = osc(), random = noise(103), filter = svf();
    return render(2, (t, u) => {
      const rate = 4 + 22 * u * u, gate = .5 + .5 * Math.sin(TAU * rate * t);
      const body = tone(160 * Math.pow(4, u)) + .4 * filter(random(), 2000 + 6000 * u, .6).band;
      return body * gate * Math.pow(u, 1.5) * smooth((1 - u) / .02);
    });
  },
  // Grave
  "sub-drop": () => {
    const tone = osc();
    return render(1.8, t => tone(30 + 70 * Math.exp(-t * 2.2)) * hit(t, .01, 1.6));
  },
  "bass-hit": () => {
    const tone = osc(), over = osc();
    return render(.9, t => Math.tanh(2.2 * (tone(55) + .35 * over(110 + 40 * Math.exp(-t * 30)))) * hit(t, .003, 4.5));
  },
  // Bipe
  beep: () => render(.22, t => Math.sin(TAU * 1000 * t) * smooth(t / .004) * smooth((.2 - t) / .01)),
  "beep-double": () => render(.36, t => {
    const one = t < .12 ? smooth(t / .004) * smooth((.11 - t) / .008) : 0;
    const two = t >= .18 && t < .3 ? smooth((t - .18) / .004) * smooth((.29 - t) / .008) : 0;
    return Math.sin(TAU * 1250 * t) * (one + two);
  }),
  blip: () => {
    const tone = osc();
    return render(.12, t => tone(600 + 1800 * (t / .12)) * hit(t, .002, 26));
  },
  // Explosao
  blast: () => {
    const random = noise(131), filter = svf(), tone = osc();
    return render(1.8, t => {
      const rumble = filter(random(), 120 + 2400 * Math.exp(-t * 6), .9).low;
      return Math.tanh(2.4 * (rumble * hit(t, .002, 2.2) + .6 * tone(40 + 60 * Math.exp(-t * 9)) * hit(t, .004, 3)));
    });
  },
  "noise-burst": () => {
    const random = noise(137), filter = svf();
    return render(.6, t => filter(random(), 3500 * Math.exp(-t * 4) + 400, .4).band * hit(t, .001, 9));
  },
  // Estrondo
  "boom-deep": () => boom(141, 2.2, 38, 70, 1.8, 30),
  "boom-cinema": () => boom(149, 2.6, 46, 110, 1.4, 18),
  thud: () => boom(151, .5, 70, 90, 12, 80),
  // Metal
  clang: () => partials(1.6, 420, [[1, 1, 3.4], [2.32, .7, 4.8], [3.17, .55, 6], [4.6, .4, 8], [6.83, .25, 11]], .0015),
  // Clique
  tick: () => {
    const random = noise(163), filter = svf();
    return render(.06, t => filter(random(), 6500, .4).band * Math.exp(-t * 520) + .4 * Math.sin(TAU * 3400 * t) * Math.exp(-t * 300));
  },
  // Vidro
  "glass-clink": () => partials(1.1, 2350, [[1, 1, 5], [1.48, .6, 7], [2.73, .35, 10], [4.1, .2, 14]], .0008),
  // Rangido
  creak: () => {
    const random = noise(181), filter = svf();
    return render(1.3, (t, u) => {
      const rate = 38 + 30 * Math.sin(TAU * .7 * t) + 20 * u;
      const grain = Math.pow(Math.max(0, Math.sin(TAU * rate * t)), 18);
      return filter(grain + .1 * random(), 900 + 500 * Math.sin(TAU * 1.3 * t), .2).band * smooth(u / .08) * smooth((1 - u) / .1);
    });
  },
  "creak-slow": () => {
    const random = noise(191), filter = svf();
    return render(2, (t, u) => {
      const rate = 14 + 10 * Math.sin(TAU * .4 * t);
      const grain = Math.pow(Math.max(0, Math.sin(TAU * rate * t)), 30);
      return filter(grain + .06 * random(), 600 + 300 * u, .15).band * smooth(u / .1) * smooth((1 - u) / .15);
    });
  },
  // Ambiencia
  "drone-dark": () => {
    const a = osc(), b = osc(), c = osc(), random = noise(201), filter = svf();
    return render(4, (t, u) => {
      const swell = smooth(u / .2) * smooth((1 - u) / .25);
      return swell * (a(55) + .7 * b(55.6) + .4 * c(82.4) + .5 * filter(random(), 300 + 80 * Math.sin(TAU * .25 * t), .7).band);
    });
  },
  "drone-air": () => {
    const random = noise(211), filter = svf(), tone = osc();
    return render(4, (t, u) => {
      const swell = smooth(u / .25) * smooth((1 - u) / .25);
      return swell * (filter(random(), 1800 + 900 * Math.sin(TAU * .18 * t), .3).band + .25 * tone(440 + 3 * Math.sin(TAU * .3 * t)));
    });
  },
  // Estalo
  bubble: () => {
    const tone = osc();
    return render(.16, t => tone(500 + 1400 * (t / .16) * (t / .16)) * hit(t, .002, 30));
  },
  // Deslize
  "slide-up": () => sweep(221, .5, 300, 5200, .45, u => Math.sin(Math.PI * Math.pow(u, .7))),
  "slide-down": () => sweep(223, .5, 5200, 300, .45, u => Math.sin(Math.PI * Math.pow(u, 1.3))),
  // Passagem
  swish: () => sweep(231, .28, 900, 6000, .5, u => Math.pow(Math.sin(Math.PI * u), 3)),
  "swoosh-deep": () => {
    const random = noise(233), filter = svf(), tone = osc();
    return render(1, (t, u) => {
      const envelope = Math.pow(Math.sin(Math.PI * u), 2);
      return envelope * (filter(random(), 220 + 1400 * Math.sin(Math.PI * u), .6).band + .4 * tone(70 + 50 * Math.sin(Math.PI * u)));
    });
  },
  // Batida
  tap: () => {
    const random = noise(241), filter = svf(), tone = osc();
    return render(.18, t => filter(random(), 2200, .6).band * Math.exp(-t * 160) + .7 * tone(320) * hit(t, .001, 45));
  },
  knock: () => render(.62, t => {
    const one = t < .25 ? Math.sin(TAU * 180 * t) * hit(t, .001, 38) : 0;
    const t2 = t - .2;
    const two = t2 > 0 ? Math.sin(TAU * 170 * t2) * hit(t2, .001, 36) : 0;
    return Math.tanh(1.8 * (one + two));
  }),
  // Transicao
  glitch: () => {
    const random = noise(251), filter = svf(), tone = osc();
    return render(.7, (t, u) => {
      const slot = Math.floor(t * 40), gate = (slot * 2654435761 >>> 0) % 3 === 0 ? 0 : 1;
      const pitch = 200 + ((slot * 40503) % 9) * 180;
      return gate * (.6 * Math.sign(tone(pitch)) + .5 * filter(random(), 4000, .3).band) * smooth((1 - u) / .05) * .6;
    });
  },
  "reverse-swell": () => {
    const random = noise(257), filter = svf(), tone = osc();
    return render(1.4, (t, u) => {
      const rise = Math.pow(u, 3) * smooth((1 - u) / .015);
      return rise * (filter(random(), 600 + 5000 * u, .5).band + .5 * tone(220));
    });
  },
  "sweep-whoosh": () => sweep(263, 1.1, 150, 9000, .35, u => Math.pow(Math.sin(Math.PI * u), 1.6))
};

