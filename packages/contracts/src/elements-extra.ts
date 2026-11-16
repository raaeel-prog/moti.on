/**
 * Segunda leva de Elementos do Moti.on: formas, titulos e transicoes de
 * formas que completam as categorias da biblioteca. Receitas proprias,
 * desenhadas por codigo com shapes nativas, Trim Paths e Repetidor; nenhuma
 * vem de arquivo de terceiros.
 */
import type { ElementColorRole, ElementLocalizedText, ElementRgb, ElementShapeLayer, ElementTrack, MotionElement } from "./elements.js";
import { WHITE, drawInOut, drawOnce, inOut, polygon, sampled, seg, text, textLayer, track } from "./elements-kit.js";

const W = 1920, H = 1080, COVER = Math.ceil(Math.hypot(W, H)) + 40;
const GOLD: ElementRgb = [1, .78, .2], CYAN: ElementRgb = [.3, .85, 1], CORAL: ElementRgb = [1, .38, .32], MINT: ElementRgb = [.35, .95, .7];
const VIOLET: ElementRgb = [.62, .45, 1], NAVY: ElementRgb = [.07, .09, .16], ORANGE: ElementRgb = [1, .42, .13], TEAL: ElementRgb = [.1, .72, .7];
const palette = (primary: ElementRgb, accent: ElementRgb = WHITE, ink: ElementRgb = WHITE) => ({ primary, accent, text: ink });

const shape = (id: string, color: ElementColorRole, position: readonly [number, number], geometry: ElementShapeLayer["geometry"], tracks: readonly ElementTrack[], extra: Partial<Pick<ElementShapeLayer, "stroke" | "rotation" | "repeater">> = {}): ElementShapeLayer =>
  ({ type: "shape", id, color, position, geometry, tracks, ...extra });

interface Shot { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly sound: MotionElement["sound"]; readonly frames?: number; readonly colors: MotionElement["defaults"]["colors"]; readonly layers: MotionElement["layers"] }
const oneshot = (s: Shot): MotionElement => ({
  id: s.id, kind: "shape", name: s.name, description: s.description, origin: [.5, .5], timing: "oneshot", sound: s.sound, soundFrame: 0,
  defaults: { durationFrames: s.frames ?? 24, animationFrames: Math.max(2, Math.round((s.frames ?? 24) / 2)), colors: s.colors, texts: {} }, layers: s.layers
});

// ---- Formas -----------------------------------------------------------------

const spiral = sampled(48, u => { const a = u * 3 * 2 * Math.PI, r = 12 + u * 150; return [Math.cos(a) * r, Math.sin(a) * r]; });
const wave = sampled(40, u => [-260 + u * 520, 46 * Math.sin(u * 4 * Math.PI)]);
const drop = sampled(30, u => { const a = u * 2 * Math.PI, k = Math.pow(Math.sin(a / 2), 3); return [44 * Math.sin(a) * k * 1.3, -70 * Math.cos(a) + 10]; }).slice(0, -1);

const SHAPES: readonly MotionElement[] = [
  oneshot({ id: "orbit-dots", name: text("Órbita de pontos", "Orbiting dots"), description: text("Seis pontos giram em roda e se recolhem.", "Six dots spin around and fold away."), sound: "chime", frames: 30, colors: palette(CYAN),
    layers: [shape("dots", "primary", [0, 0], { shape: "rect", size: [26, 26], roundness: 13, offset: [0, -110] }, [track("scale", seg("all", 0, .25, 0, 100, "back"), seg("all", .7, 1, 100, 0, "in")), track("rotation", seg("all", 0, 1, 0, 240, "in-out"))], { repeater: { copies: 6, rotation: 60 } })] }),
  oneshot({ id: "square-scatter", name: text("Quadrados em fuga", "Scattering squares"), description: text("Quadradinhos saem do centro girando.", "Little squares fly out of the center, spinning."), sound: "pop", colors: palette(CORAL, GOLD),
    layers: [shape("flakes", "primary", [0, 0], { shape: "rect", size: [26, 26], roundness: 3, offset: [0, -170] }, [track("rotation", seg("all", 0, 1, 0, 120, "out")), track("scale", seg("all", 0, .6, 0, 100, "out")), track("opacity", seg("all", .6, 1, 100, 0, "linear"))], { repeater: { copies: 8, rotation: 45 } })] }),
  oneshot({ id: "polygon-trace", name: text("Polígono traçado", "Traced polygon"), description: text("Um dodecágono se desenha girando e some pela ponta.", "A twelve-sided outline draws as it turns and fades from its tip."), sound: "sweep-whoosh", frames: 30, colors: palette(WHITE),
    layers: [shape("shape", "primary", [0, 0], { shape: "path", points: polygon(12, 140), closed: true }, [...drawOnce([0, .55], [.4, 1]), track("rotation", seg("all", 0, 1, -45, 45, "in-out"))], { stroke: 8 })] }),
  oneshot({ id: "plus-spin", name: text("Cruz giratória", "Spinning plus"), description: text("Um sinal de mais salta e dá um quarto de volta.", "A plus sign pops in and makes a quarter turn."), sound: "blip", frames: 22, colors: palette(MINT),
    layers: [
      shape("bar", "primary", [0, 0], { shape: "rect", size: [180, 40], roundness: 20 }, [track("scale", seg("all", 0, .35, 0, 100, "back"), seg("all", .65, 1, 100, 0, "in")), track("rotation", seg("all", 0, .6, -90, 0, "out"))]),
      shape("line", "primary", [0, 0], { shape: "rect", size: [40, 180], roundness: 20 }, [track("scale", seg("all", 0, .35, 0, 100, "back"), seg("all", .65, 1, 100, 0, "in")), track("rotation", seg("all", 0, .6, -90, 0, "out"))])] }),
  oneshot({ id: "wave-stroke", name: text("Onda desenhada", "Drawn wave"), description: text("Uma onda corre da esquerda e se apaga atrás.", "A wave runs from the left and erases behind itself."), sound: "swish", colors: palette(VIOLET),
    layers: [shape("stroke", "primary", [0, 0], { shape: "path", points: wave, closed: false }, drawOnce([0, .55], [.3, .95]), { stroke: 14 })] }),
  oneshot({ id: "spiral-draw", name: text("Espiral geométrica", "Geometric spiral"), description: text("Uma espiral regular se desenrola do centro para fora.", "A spiral unwinds from the center outward."), sound: "rise", frames: 30, colors: palette(GOLD),
    layers: [shape("loop", "primary", [0, 0], { shape: "path", points: spiral, closed: false }, [...drawOnce([0, .6], [.45, 1]), track("rotation", seg("all", 0, 1, 0, 90, "linear"))], { stroke: 8 })] }),
  oneshot({ id: "triangle-orbit", name: text("Triângulos em giro", "Orbiting triangles"), description: text("Três triângulos se afastam girando em volta.", "Three triangles drift apart as they circle."), sound: "whoosh", frames: 28, colors: palette(CORAL),
    layers: [shape("shape", "primary", [0, 0], { shape: "path", points: polygon(3, 34).map(([x, y]) => [x, y - 130] as const), closed: true }, [track("rotation", seg("all", 0, 1, 0, 200, "in-out")), track("scale", seg("all", 0, .5, 0, 100, "out")), track("opacity", seg("all", .65, 1, 100, 0, "linear"))], { repeater: { copies: 3, rotation: 120 } })] }),
  oneshot({ id: "bubble-pop", name: text("Bolha que estoura", "Bubble pop"), description: text("Uma bolha incha, estoura em anel e respinga.", "A bubble swells, bursts into a ring and splashes."), sound: "bubble", frames: 26, colors: palette(CYAN, WHITE),
    layers: [
      shape("disc", "primary", [0, 0], { shape: "ellipse", size: [150, 150] }, [track("scale", seg("all", 0, .4, 0, 115, "out"), seg("all", .4, .5, 115, 0, "in"))]),
      shape("ring", "accent", [0, 0], { shape: "ellipse", size: [170, 170] }, [track("scale", seg("all", .4, 1, 70, 150, "out")), track("opacity", seg("all", .38, .42, 0, 100, "linear"), seg("all", .6, 1, 100, 0, "linear"))], { stroke: 6 }),
      shape("dots", "accent", [0, 0], { shape: "rect", size: [14, 14], roundness: 7, offset: [0, -110] }, [track("scale", seg("all", .42, 1, 70, 140, "out")), track("opacity", seg("all", .42, .5, 0, 100, "linear"), seg("all", .7, 1, 100, 0, "linear"))], { repeater: { copies: 8, rotation: 45 } })] }),
  oneshot({ id: "flash-star", name: text("Clarão", "Flash"), description: text("Estrela de quatro pontas acende e raios finos saem dela.", "A four-point star flares and thin rays leave it."), sound: "impact", frames: 20, colors: palette(WHITE, GOLD),
    layers: [
      shape("rays", "accent", [0, 0], { shape: "path", points: [[0, -90], [0, -200]], closed: false }, drawOnce([.1, .5], [.3, .9]), { stroke: 4, rotation: 22.5, repeater: { copies: 8, rotation: 45 } }),
      shape("star", "primary", [0, 0], { shape: "star", points: 4, outer: 120, inner: 14 }, [track("scale", seg("all", 0, .25, 0, 120, "out"), seg("all", .25, 1, 120, 0, "in")), track("rotation", seg("all", 0, 1, 0, 45, "out"))])] }),
  oneshot({ id: "square-pulse", name: text("Quadro pulsante", "Pulsing frame"), description: text("Dois quadrados arredondados pulsam para fora.", "Two rounded squares pulse outward."), sound: "beep-double", frames: 30, colors: palette(WHITE, VIOLET),
    layers: [
      shape("frame", "primary", [0, 0], { shape: "rect", size: [200, 200], roundness: 36 }, [track("scale", seg("all", 0, .7, 20, 150, "out")), track("opacity", seg("all", 0, .06, 0, 100, "linear"), seg("all", .35, .75, 100, 0, "linear")), track("strokeWidth", seg("all", 0, .7, 22, 2, "out"))], { stroke: 10 }),
      shape("frame2", "accent", [0, 0], { shape: "rect", size: [200, 200], roundness: 36 }, [track("scale", seg("all", .25, 1, 20, 150, "out")), track("opacity", seg("all", .25, .31, 0, 100, "linear"), seg("all", .6, 1, 100, 0, "linear")), track("strokeWidth", seg("all", .25, 1, 22, 2, "out"))], { stroke: 10 })] }),
  oneshot({ id: "drop-splash", name: text("Gota", "Droplet"), description: text("Uma gota cai, toca o chão e abre um anel.", "A drop falls, lands and opens a ring."), sound: "tap", frames: 28, colors: palette(CYAN, WHITE),
    layers: [
      shape("shape", "primary", [0, 0], { shape: "path", points: drop, closed: true }, [track("y", seg("all", 0, .4, -260, 0, "in")), track("scale", seg("all", 0, .1, 0, 100, "out"), seg("all", .4, .5, 100, 0, "out"))]),
      shape("ring", "accent", [0, 60], { shape: "ellipse", size: [220, 60] }, [track("scale", seg("all", .42, 1, 10, 130, "out")), track("opacity", seg("all", .4, .45, 0, 100, "linear"), seg("all", .6, 1, 100, 0, "linear"))], { stroke: 6 })] })
];

// ---- Titulos ----------------------------------------------------------------

const TITLE_TEXT = { title: text("SEU TÍTULO", "YOUR TITLE"), subtitle: text("Uma linha de apoio", "A supporting line") };
interface Mold { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly sound: MotionElement["sound"]; readonly frames: number; readonly accent?: ElementRgb; readonly subtitle?: boolean; readonly layers: MotionElement["layers"] }
const title = (m: Mold): MotionElement => ({
  id: m.id, kind: "title", name: m.name, description: m.description, origin: [.5, .5], timing: "in-out", sound: m.sound, soundFrame: 0,
  defaults: { durationFrames: 100, animationFrames: m.frames, colors: { primary: WHITE, accent: m.accent ?? GOLD, text: WHITE }, texts: m.subtitle ? TITLE_TEXT : { title: TITLE_TEXT.title } },
  layers: m.layers
});

const TITLES: readonly MotionElement[] = [
  title({ id: "title-light-sweep", name: text("Varredura de luz", "Light sweep"), description: text("Um feixe claro atravessa o título enquanto ele aparece.", "A bright beam crosses the title as it appears."), sound: "sweep-whoosh", frames: 26,
    layers: [
      textLayer({ position: [0, 0], align: "center", size: 110, tracks: [inOut("opacity", 0, 100, 0, [.2, .7], [.3, .8]), inOut("scale", 104, 100, 104, [.2, 1], [0, .8])] }),
      // The beam only crosses during the Entrada and is gone at rest.
      shape("streak", "primary", [0, 0], { shape: "rect", size: [60, 260] }, [track("x", seg("in", 0, .9, -900, 900, "in-out")),
        track("opacity", seg("in", 0, .15, 0, 70, "linear"), seg("in", .75, .9, 70, 0, "linear"))], { rotation: 18 })] }),
  title({ id: "title-scale-drama", name: text("Escala dramática", "Dramatic scale"), description: text("O título encolhe de bem perto até o lugar, sob uma linha.", "The title shrinks in from close up onto a drawn line."), sound: "boom-cinema", frames: 30,
    layers: [
      shape("line", "accent", [0, 90], { shape: "path", points: [[-320, 0], [320, 0]], closed: false }, drawInOut([.35, 1], [0, .6]), { stroke: 4 }),
      textLayer({ position: [0, 0], align: "center", size: 110, tracks: [inOut("scale", 180, 100, 60, [0, 1], [0, 1], ["out", "in"]), inOut("opacity", 0, 100, 0, [0, .5], [.5, 1])] })] }),
  title({ id: "title-push-up", name: text("Empurrão vertical", "Vertical push"), description: text("Uma barra sobe e empurra o título para cima no lugar.", "A bar rises and pushes the title up into place."), sound: "slide-up", frames: 22, subtitle: true,
    layers: [
      shape("bar", "accent", [0, 70], { shape: "rect", size: [520, 8], roundness: 4 }, [inOut("scaleX", 0, 100, 0, [0, .5], [.5, 1]), inOut("y", 60, 0, -40, [0, .8], [.2, 1], ["out", "in"])]),
      textLayer({ position: [0, 0], align: "center", size: 100, tracks: [inOut("y", 120, 0, -120, [.1, 1], [0, .9], ["out", "in"]), inOut("opacity", 0, 100, 0, [.1, .6], [.4, .9])] }),
      textLayer({ id: "subtitle", position: [0, 130], align: "center", size: 40, bold: false, tracks: [inOut("y", 60, 0, -60, [.3, 1], [0, .7], ["out", "in"]), inOut("opacity", 0, 100, 0, [.3, .8], [0, .5])] })] }),
  title({ id: "title-split-rules", name: text("Linhas que se abrem", "Parting rules"), description: text("Duas linhas saem do meio e o título surge entre elas.", "Two rules leave the middle and the title appears between them."), sound: "swish", frames: 24, accent: CYAN,
    layers: [
      shape("line", "accent", [0, -80], { shape: "rect", size: [600, 4] }, [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])]),
      shape("line2", "accent", [0, 80], { shape: "rect", size: [600, 4] }, [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])]),
      textLayer({ position: [0, 0], align: "center", size: 90, tracks: [inOut("opacity", 0, 100, 0, [.3, .8], [0, .5]), inOut("scaleY", 0, 100, 0, [.3, .9], [0, .6], ["back", "in"])] })] }),
  title({ id: "title-glow-frame", name: text("Moldura viva", "Living frame"), description: text("Uma moldura arredondada se desenha e marca os cantos.", "A rounded frame draws itself and marks its corners."), sound: "chime", frames: 28, accent: VIOLET,
    layers: [
      shape("frame", "accent", [0, 0], { shape: "rect", size: [400, 140], roundness: 24, fit: { layer: "title", pad: [60, 34, 60, 34], axis: "both" } }, drawInOut([0, .8], [0, .8]), { stroke: 5 }),
      shape("dot", "primary", [0, 0], { shape: "ellipse", size: [14, 14] }, [inOut("scale", 0, 100, 0, [.6, 1], [0, .3], ["back", "in"])]),
      textLayer({ position: [0, 0], align: "center", size: 84, tracks: [inOut("opacity", 0, 100, 0, [.3, .8], [0, .5])] })] })
];

// ---- Transicoes de formas ---------------------------------------------------

function coverScale(channel: "scale" | "scaleX" | "scaleY", delay = 0, at = .45): ElementTrack {
  return track(channel, seg("all", delay * .5, at, 0, 100, "in-out"), seg("all", 1 - at, Math.min(1, 1 - delay * .5), 100, 0, "in-out"));
}
interface Cover { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly sound: MotionElement["sound"]; readonly primary: ElementRgb; readonly accent?: ElementRgb; readonly layers: readonly ElementShapeLayer[] }
const transition = (s: Cover): MotionElement => ({
  id: s.id, kind: "transition", name: s.name, description: s.description, origin: [.5, .5], timing: "oneshot", sound: s.sound, soundFrame: 0,
  defaults: { durationFrames: 30, animationFrames: 15, colors: { primary: s.primary, accent: s.accent ?? WHITE, text: WHITE }, texts: {} }, layers: s.layers
});
const BUBBLE = 900;

const TRANSITIONS: readonly MotionElement[] = [
  transition({ id: "tr-bubbles", name: text("Bolhas", "Bubbles"), description: text("Cinco círculos crescem em cascata até fechar a tela.", "Five circles grow in a cascade until they fill the screen."), sound: "bubble", primary: TEAL, accent: NAVY,
    layers: ([[-640, -260], [520, -300], [-120, 120], [660, 300], [-620, 340]] as const).map(([x, y], i) =>
      shape(`strip${i + 1}`, i % 2 ? "accent" : "primary", [x, y], { shape: "ellipse", size: [BUBBLE * 1.6, BUBBLE * 1.6] }, [coverScale("scale", i / 5)])) }),
  transition({ id: "tr-pill-wipe", name: text("Pílula", "Pill wipe"), description: text("Uma faixa de pontas redondas corre e recolhe.", "A round-ended band sweeps across and pulls back."), sound: "swoosh-deep", primary: ORANGE, accent: NAVY,
    layers: [
      shape("pill", "accent", [-W / 2 - 200, 0], { shape: "rect", size: [W + 800, H + 400], offset: [W / 2 + 400, 0], roundness: 700 }, [coverScale("scaleX", .3, .48)]),
      shape("box", "primary", [-W / 2 - 200, 0], { shape: "rect", size: [W + 800, H + 400], offset: [W / 2 + 400, 0], roundness: 700 }, [coverScale("scaleX")])] }),
  transition({ id: "tr-corners", name: text("Quatro cantos", "Four corners"), description: text("Quatro blocos saem dos cantos e se encontram no meio.", "Four blocks leave the corners and meet in the middle."), sound: "thud", primary: NAVY, accent: VIOLET,
    layers: ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy], i) =>
      shape(`strip${i + 1}`, i === 0 || i === 3 ? "primary" : "accent", [sx * W / 2, sy * H / 2], { shape: "rect", size: [W + 4, H + 4], offset: [-sx * W / 2, -sy * H / 2] }, [coverScale("scale", i / 8)])) }),
  transition({ id: "tr-chevron", name: text("Divisas", "Chevrons"), description: text("Setas largas atravessam a tela em sequência.", "Wide arrowheads cross the screen in sequence."), sound: "sweep-whoosh", primary: CORAL, accent: GOLD,
    layers: [0, 1, 2].map(i => shape(`strip${i + 1}`, i === 1 ? "accent" : "primary", [0, 0],
      { shape: "path", points: [[-COVER, -COVER], [COVER * .3, 0], [-COVER, COVER], [-COVER * 1.9, COVER], [-COVER * .6, 0], [-COVER * 1.9, -COVER]], closed: true },
      [track("x", seg("all", i * .08, .5 + i * .04, -COVER * .9, COVER * 1.2, "in-out"), seg("all", .5 + i * .04, 1, COVER * 1.2, COVER * 2.6, "in-out")),
        // Already off screen by then: the fade only marks the layer as done.
        track("opacity", seg("all", .95, 1, 100, 0, "linear"))])) })
];

export const ELEMENT_EXTRA_RECIPES: readonly MotionElement[] = [...SHAPES, ...TITLES, ...TRANSITIONS];
export const ELEMENT_EXTRA_LAYER_NAMES: Readonly<Record<string, ElementLocalizedText>> = {};
