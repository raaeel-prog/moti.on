/**
 * Timers e contadores do Moti.on: uma camada de texto cujo Source Text vem de
 * uma expressao (`counter`), entre os sliders Inicio e Fim publicados nas
 * Propriedades essenciais. Relogios andam um segundo por segundo; numeros
 * seguem o tempo do elemento com easing. Receitas proprias, desenhadas por
 * codigo; nenhuma vem de arquivo de terceiros.
 */
import type { ElementRgb, ElementShapeLayer, ElementTextLayer, MotionElement } from "./elements.js";
import { WHITE, seg, text, track } from "./elements-kit.js";

const CORAL: ElementRgb = [1, .38, .32], MINT: ElementRgb = [.35, .95, .7], GOLD: ElementRgb = [1, .78, .2];
const CYAN: ElementRgb = [.3, .85, 1], VIOLET: ElementRgb = [.62, .45, 1];

/** Opacidade de toda camada: aparece em `[start, end]` ate `peak` e some nos ultimos 6% da pre-comp. */
const life = (peak = 100, end = .05, start = 0) => track("opacity", seg("all", start, end, 0, peak, "linear"), seg("all", .94, 1, peak, 0, "linear"));
/** Numeros contam dentro deste trecho, antes da saida. */
const COUNT_SPAN = [.05, .8] as const;
/** O texto do contador entra com escala e fica parado no valor final ate sair. */
const popIn = [track("scale", seg("all", 0, .08, 60, 100, "back")), life()];

const counterText = (counter: NonNullable<ElementTextLayer["counter"]>, size: number, position: readonly [number, number] = [0, 0]): ElementTextLayer =>
  ({ type: "text", id: "title", color: "text", position, align: "center", size, bold: true, tracks: popIn, counter });

const ring = (id: string, color: "primary" | "accent", diameter: number, stroke: number, tracks: ElementShapeLayer["tracks"]): ElementShapeLayer =>
  ({ type: "shape", id, color, position: [0, 0], geometry: { shape: "ellipse", size: [diameter, diameter] }, stroke, tracks });

const counter = (id: string, name: MotionElement["name"], description: MotionElement["description"], frames: number, colors: MotionElement["defaults"]["colors"],
  layers: MotionElement["layers"], texts: MotionElement["defaults"]["texts"] = {}, sound: MotionElement["sound"] = "tick"): MotionElement => ({
  id, kind: "counter", name, description, origin: [.5, .5], timing: "oneshot", sound, soundFrame: 0,
  defaults: { durationFrames: frames, animationFrames: Math.min(120, Math.max(2, Math.round(frames / 10))), colors, texts }, layers
});

/** Only names not already in the other tables (track, bar and star are shared). */
export const ELEMENT_COUNTER_LAYER_NAMES = {
  progress: text("Progresso", "Progress"),
  hand: text("Ponteiro", "Hand"),
  plate: text("Placa", "Plate")
} as const;

export const ELEMENT_COUNTER_RECIPES: readonly MotionElement[] = [
  // 10 s at 30 fps. The clock runs in real seconds, so a longer pre-comp just holds at End.
  counter("countdown-ring", text("Contagem regressiva em anel", "Countdown ring"),
    text("Um relógio desce de 00:10 a 00:00 enquanto o anel se esvazia.", "A clock counts down from 00:10 to 00:00 while the ring empties."),
    300, { primary: CORAL, accent: WHITE, text: WHITE }, [
      ring("track", "accent", 360, 10, [life(30)]),
      ring("progress", "primary", 360, 16, [track("trimEnd", seg("all", 0, 1, 100, 0, "linear")), life()]),
      counterText({ format: "clock", from: 10, to: 0, decimals: 0, ease: "linear" }, 120)
    ]),
  counter("stopwatch", text("Cronômetro", "Stopwatch"),
    text("Conta de 00:00 a 00:30 com um ponteiro girando em volta.", "Counts from 00:00 to 00:30 with a hand sweeping around."),
    900, { primary: CYAN, accent: WHITE, text: WHITE }, [
      ring("track", "accent", 340, 6, [life(40, .02)]),
      { type: "shape", id: "hand", color: "primary", position: [0, 0], geometry: { shape: "path", points: [[0, 0], [0, -150]], closed: false }, stroke: 8,
        tracks: [track("rotation", seg("all", 0, 1, 0, 360 * 30, "linear")), life(100, .02)] },
      counterText({ format: "clock", from: 0, to: 30, decimals: 0, ease: "linear" }, 96, [0, 230])
    ]),
  counter("stat-count", text("Número em destaque", "Headline number"),
    text("Um número sobe até 1.000+ e para com uma legenda embaixo.", "A number climbs to 1,000+ and settles above a caption."),
    75, { primary: GOLD, accent: WHITE, text: WHITE }, [
      { type: "shape", id: "bar", color: "primary", position: [0, 70], geometry: { shape: "rect", size: [220, 8], roundness: 4 },
        tracks: [track("scaleX", seg("all", .1, .5, 0, 100, "out")), life()] },
      counterText({ format: "number", from: 0, to: 1000, decimals: 0, suffix: "+", ease: "out", span: COUNT_SPAN }, 150, [0, -40]),
      { type: "text", id: "subtitle", color: "accent", position: [0, 130], align: "center", size: 44, bold: false,
        tracks: [life(100, .5, .3), track("y", seg("all", .3, .5, 20, 0, "out"))] }
    ], { subtitle: text("clientes atendidos", "happy clients") }, "rise"),
  counter("percent-bar", text("Barra de porcentagem", "Percentage bar"),
    text("A barra enche até 100% e o número acompanha.", "The bar fills to 100% and the number follows."),
    90, { primary: MINT, accent: WHITE, text: WHITE }, [
      { type: "shape", id: "track", color: "accent", position: [0, 60], geometry: { shape: "rect", size: [640, 24], roundness: 12 },
        tracks: [life(25, .08)] },
      { type: "shape", id: "progress", color: "primary", position: [-320, 60], geometry: { shape: "rect", size: [640, 24], roundness: 12, offset: [320, 0] },
        tracks: [track("scaleX", seg("all", COUNT_SPAN[0], COUNT_SPAN[1], 0, 100, "in-out")), life()] },
      counterText({ format: "number", from: 0, to: 100, decimals: 0, suffix: "%", ease: "in-out", span: COUNT_SPAN }, 110, [0, -50])
    ], {}, "slide-up"),
  counter("rating", text("Nota com estrela", "Star rating"),
    text("Uma estrela salta e a nota sobe até 4,9.", "A star pops in and the score climbs to 4.9."),
    60, { primary: GOLD, accent: WHITE, text: WHITE }, [
      { type: "shape", id: "star", color: "primary", position: [-150, 0], geometry: { shape: "star", points: 5, outer: 70, inner: 30 },
        tracks: [track("scale", seg("all", 0, .2, 0, 115, "back"), seg("all", .2, .3, 115, 100, "out")), track("rotation", seg("all", 0, .3, -72, 0, "out")), life(100, .02)] },
      counterText({ format: "number", from: 0, to: 4.9, decimals: 1, ease: "out", span: COUNT_SPAN }, 140, [70, 0])
    ], {}, "chime"),
  counter("follower-ticker", text("Contador de seguidores", "Follower ticker"),
    text("O total gira de 9.800 a 10.000 numa placa com o rótulo embaixo.", "The total ticks from 9,800 to 10,000 on a plate with a label below."),
    90, { primary: VIOLET, accent: WHITE, text: WHITE }, [
      { type: "shape", id: "plate", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [560, 260], roundness: 40 },
        tracks: [track("scale", seg("all", 0, .12, 80, 100, "back")), life(100, .06)] },
      counterText({ format: "number", from: 9800, to: 10000, decimals: 0, ease: "out", span: COUNT_SPAN }, 120, [0, -20]),
      { type: "text", id: "subtitle", color: "accent", position: [0, 80], align: "center", size: 40, bold: false,
        tracks: [life(100, .3, .15)] }
    ], { subtitle: text("seguidores", "followers") }, "pop")
];
