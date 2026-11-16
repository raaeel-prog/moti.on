/**
 * Transicoes de formas e fundos do Moti.on. As transicoes cobrem a tela ate o
 * meio da duracao e a descobrem ate o fim: corte o video por baixo no meio da
 * pre-comp. Os fundos entram, ficam e saem com a duracao. Receitas proprias,
 * so com shapes nativas.
 */
import type { ElementColorRole, ElementLocalizedText, ElementRgb, ElementShapeLayer, ElementTrack, MotionElement } from "./elements.js";
import { WHITE, inOut, polygon, sampled, seg, text, track } from "./elements-kit.js";

const W = 1920, H = 1080, COVER = Math.ceil(Math.hypot(W, H)) + 40;
const NAVY: ElementRgb = [.07, .09, .16], ORANGE: ElementRgb = [1, .42, .13], TEAL: ElementRgb = [.1, .72, .7], PLUM: ElementRgb = [.38, .16, .55];

/** Cobre de 0 a `at` e descobre de `1 - at` ao fim; `delay` defasa as camadas. */
function coverScale(channel: "scale" | "scaleX" | "scaleY", delay = 0, at = .45): ElementTrack {
  return track(channel, seg("all", delay * .5, at, 0, 100, "in-out"), seg("all", 1 - at, Math.min(1, 1 - delay * .5), 100, 0, "in-out"));
}
const shape = (id: string, color: ElementColorRole, position: readonly [number, number], geometry: ElementShapeLayer["geometry"], tracks: readonly ElementTrack[], rotation?: number): ElementShapeLayer =>
  ({ type: "shape", id, color, position, geometry, tracks, ...(rotation !== undefined ? { rotation } : {}) });

interface Spec { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly sound: MotionElement["sound"]; readonly primary: ElementRgb; readonly accent?: ElementRgb; readonly layers: readonly ElementShapeLayer[] }
const transition = (s: Spec): MotionElement => ({
  id: s.id, kind: "transition", name: s.name, description: s.description, origin: [.5, .5], timing: "oneshot", sound: s.sound, soundFrame: 0,
  defaults: { durationFrames: 30, animationFrames: 15, colors: { primary: s.primary, accent: s.accent ?? WHITE, text: WHITE }, texts: {} }, layers: s.layers
});
const strips = (count: number, vertical: boolean, alternate: boolean): ElementShapeLayer[] => Array.from({ length: count }, (_, i) => {
  const size = (vertical ? W : H) / count, offset = -((vertical ? W : H) / 2) + size * (i + .5);
  return shape(`strip${i + 1}`, alternate && i % 2 ? "accent" : "primary", vertical ? [offset, 0] : [0, offset],
    { shape: "rect", size: vertical ? [size + 2, H + 4] : [W + 4, size + 2] }, [coverScale(vertical ? "scaleX" : "scaleY", i / count)]);
});

const TRANSITIONS: readonly MotionElement[] = [
  transition({ id: "tr-iris", name: text("Íris", "Iris"), description: text("Um círculo cresce do centro e fecha de volta.", "A circle grows from the center and closes back."), sound: "sweep-whoosh", primary: NAVY,
    layers: [shape("disc", "primary", [0, 0], { shape: "ellipse", size: [COVER, COVER] }, [coverScale("scale")])] }),
  transition({ id: "tr-iris-double", name: text("Íris dupla", "Double iris"), description: text("Dois círculos de cor, um atrás do outro.", "Two colored circles, one chasing the other."), sound: "swoosh-deep", primary: ORANGE, accent: NAVY,
    layers: [shape("disc", "primary", [0, 0], { shape: "ellipse", size: [COVER, COVER] }, [coverScale("scale")]), shape("echo", "accent", [0, 0], { shape: "ellipse", size: [COVER, COVER] }, [coverScale("scale", .25, .48)])] }),
  transition({ id: "tr-curtain-left", name: text("Cortina lateral", "Side curtain"), description: text("Uma cortina corre da esquerda e recolhe.", "A curtain runs in from the left and pulls back."), sound: "slide-up", primary: TEAL,
    layers: [shape("box", "primary", [-W / 2, 0], { shape: "rect", size: [W + 4, H + 4], offset: [W / 2, 0] }, [coverScale("scaleX")])] }),
  transition({ id: "tr-curtain-up", name: text("Cortina vertical", "Rising curtain"), description: text("Uma cortina sobe da base e desce.", "A curtain rises from the bottom and drops back."), sound: "slide-up", primary: PLUM,
    layers: [shape("box", "primary", [0, H / 2], { shape: "rect", size: [W + 4, H + 4], offset: [0, -H / 2] }, [coverScale("scaleY")])] }),
  transition({ id: "tr-doors", name: text("Portas", "Doors"), description: text("Duas metades fecham no meio e abrem.", "Two halves close in the middle and open."), sound: "thud", primary: NAVY, accent: NAVY,
    layers: [shape("box", "primary", [-W / 2, 0], { shape: "rect", size: [W / 2 + 4, H + 4], offset: [W / 4, 0] }, [coverScale("scaleX")]),
      shape("box2", "accent", [W / 2, 0], { shape: "rect", size: [W / 2 + 4, H + 4], offset: [-W / 4, 0] }, [coverScale("scaleX")])] }),
  transition({ id: "tr-blinds", name: text("Persianas", "Blinds"), description: text("Faixas verticais que abrem em cascata.", "Vertical slats that open in a cascade."), sound: "swish", primary: ORANGE,
    layers: strips(6, true, false) }),
  transition({ id: "tr-stripes", name: text("Listras alternadas", "Alternating stripes"), description: text("Faixas horizontais de duas cores em sequência.", "Two-color horizontal bands in sequence."), sound: "sweep-whoosh", primary: TEAL, accent: NAVY,
    layers: strips(5, false, true) }),
  transition({ id: "tr-diagonal", name: text("Diagonal", "Diagonal sweep"), description: text("Faixas inclinadas cruzam a tela.", "Slanted bands cross the screen."), sound: "swish", primary: PLUM, accent: ORANGE,
    layers: [0, 1, 2, 3].map(i => shape(`strip${i + 1}`, i % 2 ? "accent" : "primary", [-900 + i * 600, 0], { shape: "rect", size: [700, COVER + 400] }, [coverScale("scaleX", i / 4)], 30)) }),
  transition({ id: "tr-diamond", name: text("Losango", "Diamond"), description: text("Um quadrado girado cresce do centro.", "A turned square grows from the center."), sound: "whoosh", primary: NAVY,
    layers: [shape("box", "primary", [0, 0], { shape: "rect", size: [COVER, COVER] }, [coverScale("scale"), track("rotation", seg("all", 0, 1, 0, 90, "in-out"))], 45)] }),
  transition({ id: "tr-triangle", name: text("Triângulo", "Triangle"), description: text("Um triângulo gira e engole a tela.", "A triangle spins and swallows the screen."), sound: "swoosh-deep", primary: ORANGE,
    layers: [shape("shape", "primary", [0, 0], { shape: "path", points: polygon(3, COVER * 1.1), closed: true }, [coverScale("scale"), track("rotation", seg("all", 0, 1, -90, 90, "in-out"))])] }),
  transition({ id: "tr-hexagon", name: text("Abertura hexagonal", "Hexagon wipe"), description: text("Um hexágono e seu contorno se abrem.", "A hexagon and its echo open up."), sound: "sweep-whoosh", primary: TEAL, accent: WHITE,
    layers: [shape("echo", "accent", [0, 0], { shape: "path", points: polygon(6, COVER * .62), closed: true }, [coverScale("scale", .0, .4)]),
      shape("shape", "primary", [0, 0], { shape: "path", points: polygon(6, COVER * .6), closed: true }, [coverScale("scale", .2, .45)])] }),
  transition({ id: "tr-star", name: text("Estrela", "Star wipe"), description: text("Uma estrela gira e cobre tudo.", "A spinning star covers everything."), sound: "glass-clink", primary: [1, .78, .2],
    layers: [shape("star", "primary", [0, 0], { shape: "star", points: 5, outer: COVER * 1.3, inner: COVER * .6 }, [coverScale("scale"), track("rotation", seg("all", 0, 1, -72, 72, "in-out"))])] }),
  transition({ id: "tr-liquid", name: text("Gota líquida", "Liquid drop"), description: text("Uma mancha ondulada se espalha e recolhe.", "A wobbly blob spreads out and pulls back."), sound: "bubble", primary: [.1, .46, .95], accent: [.4, .9, 1],
    layers: [shape("echo", "accent", [0, 0], { shape: "path", points: sampled(48, u => { const a = u * 2 * Math.PI, r = COVER * .56 * (1 + .08 * Math.sin(a * 5)); return [Math.cos(a) * r, Math.sin(a) * r]; }).slice(0, -1), closed: true }, [coverScale("scale", 0, .42), track("rotation", seg("all", 0, 1, 0, 40, "in-out"))]),
      shape("shape", "primary", [0, 0], { shape: "path", points: sampled(48, u => { const a = u * 2 * Math.PI, r = COVER * .54 * (1 + .1 * Math.sin(a * 4 + 1)); return [Math.cos(a) * r, Math.sin(a) * r]; }).slice(0, -1), closed: true }, [coverScale("scale", .2, .45), track("rotation", seg("all", 0, 1, 0, -40, "in-out"))])] }),
  transition({ id: "tr-tunnel", name: text("Túnel", "Tunnel"), description: text("Anéis alternados que mergulham no centro.", "Alternating rings that dive into the center."), sound: "drone-dark", primary: NAVY, accent: ORANGE,
    layers: [0, 1, 2, 3].map(i => shape(["disc", "echo", "halo", "ring"][i]!, i % 2 ? "accent" : "primary", [0, 0], { shape: "ellipse", size: [COVER * (1 - i * .2), COVER * (1 - i * .2)] }, [coverScale("scale", i / 4)])) })
];

// ---- Fundos -------------------------------------------------------------------

interface BackgroundSpec { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly primary: ElementRgb; readonly accent: ElementRgb; readonly pattern: readonly ElementShapeLayer[] }
const base = (): ElementShapeLayer => shape("box", "primary", [0, 0], { shape: "rect", size: [W + 8, H + 8] }, [inOut("opacity", 0, 100, 0, [0, .8], [.2, 1], ["linear", "linear"])]);
const fadeTracks = (extra: readonly ElementTrack[] = []): ElementTrack[] => [inOut("opacity", 0, 100, 0, [.2, 1], [0, .8], ["linear", "linear"]), ...extra];
const background = (s: BackgroundSpec): MotionElement => ({
  id: s.id, kind: "background", name: s.name, description: s.description, origin: [.5, .5], timing: "in-out", sound: "drone-air", soundFrame: 0,
  defaults: { durationFrames: 300, animationFrames: 24, colors: { primary: s.primary, accent: s.accent, text: WHITE }, texts: {} }, layers: [base(), ...s.pattern]
});

const BACKGROUNDS: readonly MotionElement[] = [
  background({ id: "bg-sunburst", name: text("Raios de sol", "Sunburst"), description: text("Raios largos que giram devagar atrás de tudo.", "Wide rays slowly turning behind everything."), primary: ORANGE, accent: [1, .62, .25],
    pattern: [{ ...shape("rays", "accent", [0, 0], { shape: "path", points: [[0, 0], [-170, -COVER], [170, -COVER]], closed: true }, fadeTracks([inOut("rotation", -20, 0, 20, [0, 1], [0, 1], ["linear", "linear"])])), repeater: { copies: 12, rotation: 30 } }] }),
  background({ id: "bg-rings", name: text("Círculos concêntricos", "Concentric rings"), description: text("Anéis finos que pulsam a partir do centro.", "Thin rings pulsing out from the center."), primary: NAVY, accent: [.2, .3, .5],
    pattern: [0, 1, 2, 3, 4].map(i => ({ ...shape(["ring", "echo", "halo", "loop", "frame"][i]!, "accent", [0, 0], { shape: "ellipse", size: [300 + i * 360, 300 + i * 360] }, fadeTracks([inOut("scale", 80, 100, 120, [0, 1], [0, 1], ["out", "in"])])), stroke: 24 })) }),
  background({ id: "bg-diagonal-stripes", name: text("Listras diagonais", "Diagonal stripes"), description: text("Faixas inclinadas que deslizam sem parar.", "Slanted stripes that keep sliding."), primary: TEAL, accent: [.15, .82, .8],
    pattern: [-3, -2, -1, 0, 1, 2, 3].map(i => shape(`strip${i + 4}`, "accent", [i * 340, 0], { shape: "rect", size: [120, COVER + 300] }, fadeTracks([inOut("x", -170, 0, 170, [0, 1], [0, 1], ["linear", "linear"])]), 35)) }),
  background({ id: "bg-orbits", name: text("Órbitas", "Orbits"), description: text("Pontos que giram em volta do centro.", "Dots circling around the center."), primary: PLUM, accent: [.85, .6, 1],
    pattern: [{ ...shape("dots", "accent", [0, 0], { shape: "rect", size: [40, 40], roundness: 20, offset: [0, -420] }, fadeTracks([inOut("rotation", -60, 0, 60, [0, 1], [0, 1], ["linear", "linear"])])), repeater: { copies: 12, rotation: 30 } },
      { ...shape("flakes", "accent", [0, 0], { shape: "rect", size: [24, 24], roundness: 12, offset: [0, -240] }, fadeTracks([inOut("rotation", 60, 0, -60, [0, 1], [0, 1], ["linear", "linear"])])), repeater: { copies: 8, rotation: 45 } }] }),
  background({ id: "bg-starfield", name: text("Constelação", "Constellation"), description: text("Estrelinhas de quatro pontas espalhadas que piscam.", "Scattered four-point stars that twinkle."), primary: [.03, .04, .1], accent: WHITE,
    pattern: [[-700, -300], [-300, 200], [100, -380], [520, 120], [820, -200], [-820, 330], [300, 380]].map(([x, y], i) =>
      shape(["star", "glint", "twinkle", "dot", "disc", "shape", "halo"][i]!, "accent", [x!, y!], { shape: "star", points: 4, outer: 22 + (i % 3) * 10, inner: 4 + (i % 3) }, fadeTracks([inOut("scale", 0, 100, 0, [i / 14, .5 + i / 14], [.5 - i / 14, 1 - i / 14], ["back", "in"])]))) }),
  background({ id: "bg-waves", name: text("Ondas", "Waves"), description: text("Linhas onduladas que correm na horizontal.", "Wavy lines drifting horizontally."), primary: [.06, .3, .75], accent: [.4, .7, 1],
    pattern: [-2, -1, 0, 1, 2].map(i => ({ ...shape(`strip${i + 3}`, "accent", [0, i * 200], { shape: "path", points: sampled(40, u => [-W * .7 + W * 1.4 * u, 40 * Math.sin(u * 8 * Math.PI)]), closed: false }, fadeTracks([inOut("x", -120, 0, 120, [0, 1], [0, 1], ["linear", "linear"])])), stroke: 10 })) }),
  background({ id: "bg-grid", name: text("Grade técnica", "Tech grid"), description: text("Grade fina que avança em perspectiva plana.", "A fine grid that drifts forward."), primary: [.05, .06, .08], accent: [.2, .5, .6],
    pattern: [...[-3, -2, -1, 0, 1, 2, 3].map(i => ({ ...shape(`strip${i + 4}`, "accent", [i * 300, 0], { shape: "path", points: [[0, -H], [0, H]], closed: false }, fadeTracks()), stroke: 3 })),
      ...[-1, 0, 1].map(i => ({ ...shape(["line", "line2", "rule"][i + 1]!, "accent", [0, i * 300], { shape: "path", points: [[-W, 0], [W, 0]], closed: false }, fadeTracks([inOut("y", -150, 0, 150, [0, 1], [0, 1], ["linear", "linear"])])), stroke: 3 }))] }),
  background({ id: "bg-confetti", name: text("Confete de fundo", "Confetti backdrop"), description: text("Pedacinhos coloridos que caem devagar.", "Little colored pieces that slowly fall."), primary: [.98, .96, .92], accent: [1, .38, .32],
    pattern: [[-760, -200, 20], [-420, 120, -30], [-120, -320, 45], [180, 260, 10], [480, -120, -60], [760, 200, 30], [0, 0, 70]].map(([x, y, r], i) =>
      shape(["flakes", "dots", "card", "tail", "block", "marker", "slash"][i]!, i % 2 ? "accent" : "primary", [x!, y!], { shape: "rect", size: [26, 44], roundness: 4 }, [inOut("opacity", 0, 100, 0, [.2, 1], [0, .8], ["linear", "linear"]), inOut("y", -200, 0, 200, [0, 1], [0, 1], ["linear", "linear"]), inOut("rotation", -90, 0, 90, [0, 1], [0, 1], ["linear", "linear"])], r)).map((layer, i) => i % 2 ? layer : { ...layer, color: "accent" as const })
  })
];

export const ELEMENT_TRANSITION_RECIPES: readonly MotionElement[] = [...TRANSITIONS, ...BACKGROUNDS];
export const ELEMENT_TRANSITION_LAYER_NAMES: Readonly<Record<string, ElementLocalizedText>> = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => [`strip${i + 1}`, text(`Faixa ${i + 1}`, `Strip ${i + 1}`)])
);
