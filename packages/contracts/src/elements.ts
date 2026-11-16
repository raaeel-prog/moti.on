/**
 * Elementos animados (`ae.elements.insert`).
 *
 * Cada elemento e uma receita propria do Moti.on: camadas de shape com
 * operadores nativos (Trim Paths, Repetidor) e camadas de texto, desenhadas por
 * codigo numa pre-composicao nova. Nada vem de arquivo de terceiros. Textos e
 * cores ficam nas Propriedades essenciais da pre-composicao, e a animacao de
 * Entrada e Saida acompanha a duracao dela: mudar a duracao da pre-comp move a
 * Saida junto.
 *
 * Coordenadas em px numa composicao de referencia 1920x1080, com y para baixo
 * como no After Effects. O host multiplica pela escala da composicao ativa.
 */
import { SOUND_IDS, type SoundId } from "./sounds.js";
import { ELEMENT_TITLE_LAYER_NAMES, ELEMENT_TITLE_RECIPES } from "./elements-titles.js";
import { ELEMENT_GRAPHIC_LAYER_NAMES, ELEMENT_GRAPHIC_RECIPES } from "./elements-graphics.js";
import { ELEMENT_TRANSITION_LAYER_NAMES, ELEMENT_TRANSITION_RECIPES } from "./elements-transitions.js";
import { ELEMENT_EXTRA_RECIPES } from "./elements-extra.js";
import { ELEMENT_COUNTER_LAYER_NAMES, ELEMENT_COUNTER_RECIPES } from "./elements-counters.js";
import { elementTrack as trackAt } from "./elements-math.js";

export const ELEMENT_KINDS = ["shape", "drawn", "lower-third", "text-box", "title", "social", "transition", "background", "counter"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Sons gerados pelo proprio Moti.on (`scripts/generate-sfx.mjs`); catalogo em `sounds.ts`. */
export const ELEMENT_SOUNDS: readonly SoundId[] = SOUND_IDS;
export type ElementSoundId = SoundId;
export type ElementSoundChoice = "preset" | "none" | ElementSoundId;

export const ELEMENT_COLOR_ROLES = ["primary", "accent", "text"] as const;
export type ElementColorRole = (typeof ELEMENT_COLOR_ROLES)[number];
export const ELEMENT_TEXT_ROLES = ["title", "subtitle"] as const;
export type ElementTextRole = (typeof ELEMENT_TEXT_ROLES)[number];
export type ElementRgb = readonly [number, number, number];

export type ElementChannel = "trimStart" | "trimEnd" | "trimOffset" | "scale" | "scaleX" | "scaleY" | "opacity" | "rotation" | "x" | "y" | "strokeWidth";
/** Janela de cada trecho: a Entrada, a Saida (ancorada no fim) ou a duracao toda. */
export type ElementWindow = "in" | "out" | "all";
export type ElementEase = "linear" | "out" | "in" | "in-out" | "back";
export interface ElementSegment {
  readonly window: ElementWindow;
  /** Fracoes da janela, 0 a 1. */
  readonly start: number;
  readonly end: number;
  readonly from: number;
  readonly to: number;
  readonly ease: ElementEase;
}
export interface ElementTrack { readonly channel: ElementChannel; readonly segments: readonly ElementSegment[] }

/** Retangulo que acompanha o texto: margens esquerda, topo, direita e base. */
export interface ElementFit {
  readonly layer: ElementTextRole;
  readonly pad: readonly [number, number, number, number];
  /** `x`: so a largura segue o texto; a altura e a de `size`. */
  readonly axis: "x" | "both";
}
export type ElementGeometry =
  | { readonly shape: "ellipse"; readonly size: readonly [number, number] }
  | { readonly shape: "rect"; readonly size: readonly [number, number]; readonly offset?: readonly [number, number]; readonly roundness?: number; readonly fit?: ElementFit }
  | { readonly shape: "path"; readonly points: ReadonlyArray<readonly [number, number]>; readonly closed: boolean }
  | { readonly shape: "star"; readonly points: number; readonly outer: number; readonly inner: number };

export interface ElementShapeLayer {
  readonly type: "shape";
  readonly id: string;
  readonly color: ElementColorRole;
  readonly position: readonly [number, number];
  readonly rotation?: number;
  readonly geometry: ElementGeometry;
  /** Largura do traco em px; sem traco, a forma e preenchida. */
  readonly stroke?: number;
  readonly repeater?: { readonly copies: number; readonly rotation: number };
  readonly tracks: readonly ElementTrack[];
}
/** Texto calculado (timers e contadores): vai de `from` a `to`, editaveis nos sliders
 * Inicio e Fim das Propriedades essenciais. `clock` anda um segundo por segundo e
 * mostra h:mm:ss ou mm:ss; `number` segue o tempo do elemento com `ease`. */
export interface ElementCounter {
  readonly format: "clock" | "number";
  readonly from: number;
  readonly to: number;
  /** Casas decimais de `number`, 0 a 3. */
  readonly decimals: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly ease: ElementEase;
  /** Trecho da duracao em que `number` conta, em fracoes; [0, 1] quando ausente. */
  readonly span?: readonly [number, number];
}
export interface ElementTextLayer {
  readonly type: "text";
  readonly id: ElementTextRole;
  readonly color: ElementColorRole;
  /** Centro visual do texto (`center`) ou meio da borda esquerda (`left`). */
  readonly position: readonly [number, number];
  readonly align: "left" | "center";
  readonly size: number;
  readonly bold: boolean;
  readonly tracks: readonly ElementTrack[];
  /** Presente so nos contadores: o texto vem da expressao, nao do usuario. */
  readonly counter?: ElementCounter;
}
export type ElementLayer = ElementShapeLayer | ElementTextLayer;

export interface ElementLocalizedText { readonly "pt-BR": string; readonly "en-US": string }
export interface MotionElement {
  readonly id: string;
  readonly kind: ElementKind;
  readonly name: ElementLocalizedText;
  readonly description: ElementLocalizedText;
  /** Onde a origem do elemento fica na composicao, em fracao da largura e da altura. */
  readonly origin: readonly [number, number];
  /** `oneshot`: a animacao ocupa a duracao toda e nao ha Entrada nem Saida separadas. */
  readonly timing: "in-out" | "oneshot";
  readonly sound: ElementSoundId;
  /** Quadro, contado do inicio, em que o som comeca. */
  readonly soundFrame: number;
  readonly defaults: {
    readonly durationFrames: number;
    readonly animationFrames: number;
    readonly colors: Readonly<Record<ElementColorRole, ElementRgb>>;
    readonly texts: Readonly<Partial<Record<ElementTextRole, ElementLocalizedText>>>;
  };
  /** Ordem de pintura: a primeira camada fica embaixo. */
  readonly layers: readonly ElementLayer[];
}

const seg = (window: ElementWindow, start: number, end: number, from: number, to: number, ease: ElementEase): ElementSegment => ({ window, start, end, from, to, ease });
const track = (channel: ElementChannel, ...segments: ElementSegment[]): ElementTrack => ({ channel, segments });
const text = (pt: string, en: string): ElementLocalizedText => ({ "pt-BR": pt, "en-US": en });
const WHITE: ElementRgb = [1, 1, 1];

const ELEMENT_CORE_RECIPES: readonly MotionElement[] = [
  {
    id: "burst", kind: "shape", name: text("Explosão de linhas", "Line burst"),
    description: text("Raios que saem do centro e somem na borda.", "Rays that shoot from the center and vanish at the edge."),
    origin: [.5, .5], timing: "oneshot", sound: "pop", soundFrame: 0,
    defaults: { durationFrames: 24, animationFrames: 12, colors: { primary: [1, .78, .2], accent: WHITE, text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "rays", color: "primary", position: [0, 0], stroke: 10, geometry: { shape: "path", points: [[0, -70], [0, -150]], closed: false },
        repeater: { copies: 8, rotation: 45 },
        tracks: [track("trimEnd", seg("all", 0, .5, 0, 100, "out")), track("trimStart", seg("all", .2, .85, 0, 100, "in-out"))] },
      { type: "shape", id: "sparks", color: "accent", position: [0, 0], rotation: 22.5, stroke: 6, geometry: { shape: "path", points: [[0, -44], [0, -78]], closed: false },
        repeater: { copies: 8, rotation: 45 },
        tracks: [track("trimEnd", seg("all", .1, .55, 0, 100, "out")), track("trimStart", seg("all", .3, .8, 0, 100, "in-out"))] }
    ]
  },
  {
    id: "ring", kind: "shape", name: text("Anel expansivo", "Expanding ring"),
    description: text("Dois anéis que crescem e se dissolvem.", "Two rings that grow and dissolve."),
    origin: [.5, .5], timing: "oneshot", sound: "impact", soundFrame: 0,
    defaults: { durationFrames: 24, animationFrames: 12, colors: { primary: WHITE, accent: [.35, .7, 1], text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "ring", color: "primary", position: [0, 0], stroke: 14, geometry: { shape: "ellipse", size: [220, 220] },
        tracks: [track("scale", seg("all", 0, 1, 15, 150, "out")), track("opacity", seg("all", .45, 1, 100, 0, "linear")), track("strokeWidth", seg("all", 0, 1, 28, 2, "out"))] },
      { type: "shape", id: "echo", color: "accent", position: [0, 0], stroke: 6, geometry: { shape: "ellipse", size: [220, 220] },
        tracks: [track("scale", seg("all", .15, 1, 10, 110, "out")), track("opacity", seg("all", .5, 1, 100, 0, "linear"))] }
    ]
  },
  {
    id: "sparkle", kind: "shape", name: text("Brilho", "Sparkle"),
    description: text("Estrela de quatro pontas que pisca girando.", "Four-point star that twinkles as it turns."),
    origin: [.5, .5], timing: "oneshot", sound: "chime", soundFrame: 0,
    defaults: { durationFrames: 22, animationFrames: 11, colors: { primary: WHITE, accent: [1, .85, .35], text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "star", color: "primary", position: [0, 0], geometry: { shape: "star", points: 4, outer: 90, inner: 16 },
        tracks: [track("scale", seg("all", 0, .45, 0, 100, "back"), seg("all", .55, 1, 100, 0, "in")), track("rotation", seg("all", 0, 1, -30, 30, "in-out"))] },
      { type: "shape", id: "glint", color: "accent", position: [70, -60], geometry: { shape: "star", points: 4, outer: 30, inner: 6 },
        tracks: [track("scale", seg("all", .2, .6, 0, 100, "back"), seg("all", .6, .95, 100, 0, "in"))] }
    ]
  },
  {
    id: "check", kind: "shape", name: text("Confirmação", "Check mark"),
    description: text("Círculo com o sinal de certo desenhado.", "A circle with a drawn check mark."),
    origin: [.5, .5], timing: "in-out", sound: "pop", soundFrame: 0,
    defaults: { durationFrames: 60, animationFrames: 18, colors: { primary: [.16, .74, .4], accent: WHITE, text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "disc", color: "primary", position: [0, 0], geometry: { shape: "ellipse", size: [180, 180] },
        tracks: [track("scale", seg("in", 0, .6, 0, 100, "back"), seg("out", .3, 1, 100, 0, "in"))] },
      { type: "shape", id: "tick", color: "accent", position: [0, 0], stroke: 18, geometry: { shape: "path", points: [[-44, 4], [-12, 36], [48, -30]], closed: false },
        tracks: [track("trimEnd", seg("in", .4, 1, 0, 100, "out")), track("trimStart", seg("out", 0, .5, 0, 100, "in"))] }
    ]
  },
  {
    id: "arrow", kind: "shape", name: text("Seta desenhada", "Drawn arrow"),
    description: text("Seta que se desenha da cauda à ponta.", "An arrow that draws from tail to tip."),
    origin: [.5, .5], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 60, animationFrames: 16, colors: { primary: WHITE, accent: WHITE, text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "shaft", color: "primary", position: [0, 0], stroke: 16, geometry: { shape: "path", points: [[-120, 0], [80, 0]], closed: false },
        tracks: [track("trimEnd", seg("in", 0, .65, 0, 100, "out")), track("trimStart", seg("out", 0, .6, 0, 100, "in")),
          track("x", seg("in", 0, 1, -40, 0, "out"), seg("out", 0, 1, 0, 40, "in"))] },
      { type: "shape", id: "head", color: "primary", position: [0, 0], stroke: 16, geometry: { shape: "path", points: [[40, -42], [84, 0], [40, 42]], closed: false },
        tracks: [track("trimEnd", seg("in", .45, 1, 0, 100, "out")), track("trimStart", seg("out", .3, .8, 0, 100, "in")),
          track("x", seg("in", 0, 1, -40, 0, "out"), seg("out", 0, 1, 0, 40, "in"))] }
    ]
  },
  {
    id: "underline", kind: "shape", name: text("Sublinhado à mão", "Hand underline"),
    description: text("Traço irregular que corre sob um destaque.", "An uneven stroke that runs under a highlight."),
    origin: [.5, .5], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 60, animationFrames: 14, colors: { primary: WHITE, accent: [1, .82, .2], text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "stroke", color: "accent", position: [0, 0], stroke: 14, geometry: { shape: "path", points: [[-220, 8], [-80, -2], [80, 4], [220, -6]], closed: false },
        tracks: [track("trimEnd", seg("in", 0, 1, 0, 100, "out")), track("trimStart", seg("out", 0, 1, 0, 100, "in-out"))] }
    ]
  },
  {
    id: "circle-draw", kind: "shape", name: text("Círculo de marcação", "Marker circle"),
    description: text("Elipse desenhada em volta de algo para destacar.", "An ellipse drawn around something to point it out."),
    origin: [.5, .5], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 60, animationFrames: 22, colors: { primary: WHITE, accent: [1, .3, .3], text: WHITE }, texts: {} },
    layers: [
      { type: "shape", id: "loop", color: "accent", position: [0, 0], stroke: 10, geometry: { shape: "ellipse", size: [380, 210] },
        tracks: [track("trimEnd", seg("in", 0, 1, 0, 100, "out")), track("rotation", seg("in", 0, 1, -40, 0, "out")), track("trimStart", seg("out", 0, 1, 0, 100, "in"))] }
    ]
  },
  {
    id: "lt-bar", kind: "lower-third", name: text("Barra clássica", "Classic bar"),
    description: text("Faixa com caixa que abre a partir de uma barra.", "A lower third whose box opens from a bar."),
    origin: [.07, .8], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 120, animationFrames: 18, colors: { primary: [.07, .09, .16], accent: [1, .42, .13], text: WHITE },
      texts: { title: text("Nome Sobrenome", "First Last"), subtitle: text("Cargo ou assunto", "Role or topic") } },
    layers: [
      { type: "shape", id: "bar", color: "accent", position: [0, 0], geometry: { shape: "rect", size: [10, 120], offset: [5, 0] },
        tracks: [track("scaleY", seg("in", 0, .45, 0, 100, "out"), seg("out", .55, 1, 100, 0, "in"))] },
      { type: "shape", id: "box", color: "primary", position: [22, -24], geometry: { shape: "rect", size: [120, 64], fit: { layer: "title", pad: [26, 12, 26, 12], axis: "both" } },
        tracks: [track("scaleX", seg("in", .15, .7, 0, 100, "out"), seg("out", .3, .85, 100, 0, "in"))] },
      { type: "text", id: "title", color: "text", position: [48, -24], align: "left", size: 46, bold: true,
        tracks: [track("opacity", seg("in", .45, .85, 0, 100, "out"), seg("out", 0, .35, 100, 0, "in-out")), track("x", seg("in", .45, .95, -24, 0, "out"))] },
      { type: "text", id: "subtitle", color: "text", position: [24, 40], align: "left", size: 28, bold: false,
        tracks: [track("opacity", seg("in", .6, 1, 0, 100, "out"), seg("out", 0, .4, 100, 0, "in-out")), track("y", seg("in", .6, 1, 18, 0, "out"))] }
    ]
  },
  {
    id: "lt-line", kind: "lower-third", name: text("Linha minimalista", "Minimal line"),
    description: text("Texto que sobe sobre uma linha fina.", "Text that rises over a thin line."),
    origin: [.07, .8], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 120, animationFrames: 20, colors: { primary: WHITE, accent: [.25, .85, .95], text: WHITE },
      texts: { title: text("Nome Sobrenome", "First Last"), subtitle: text("Cargo ou assunto", "Role or topic") } },
    layers: [
      { type: "text", id: "title", color: "text", position: [0, -22], align: "left", size: 52, bold: true,
        tracks: [track("y", seg("in", .25, .8, 34, 0, "out"), seg("out", 0, .6, 0, -20, "in")), track("opacity", seg("in", .25, .7, 0, 100, "out"), seg("out", 0, .6, 100, 0, "in"))] },
      { type: "shape", id: "line", color: "accent", position: [0, 16], geometry: { shape: "rect", size: [120, 4], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } },
        tracks: [track("scaleX", seg("in", 0, .55, 0, 100, "out"), seg("out", .4, 1, 100, 0, "in"))] },
      { type: "text", id: "subtitle", color: "primary", position: [0, 52], align: "left", size: 30, bold: false,
        tracks: [track("y", seg("in", .45, 1, 24, 0, "out")), track("opacity", seg("in", .45, .9, 0, 100, "out"), seg("out", 0, .5, 100, 0, "in"))] }
    ]
  },
  {
    id: "lt-tag", kind: "lower-third", name: text("Etiqueta", "Tag"),
    description: text("Pílula com ponto de destaque que estica com o texto.", "A pill with an accent dot that stretches with the text."),
    origin: [.07, .8], timing: "in-out", sound: "pop", soundFrame: 0,
    defaults: { durationFrames: 120, animationFrames: 18, colors: { primary: WHITE, accent: [.13, .77, .45], text: [.08, .08, .1] },
      texts: { title: text("Nome Sobrenome", "First Last"), subtitle: text("Cargo ou assunto", "Role or topic") } },
    layers: [
      { type: "shape", id: "pill", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [140, 64], roundness: 999, fit: { layer: "title", pad: [50, 14, 26, 14], axis: "both" } },
        tracks: [track("scaleX", seg("in", 0, .55, 0, 100, "back"), seg("out", .3, 1, 100, 0, "in")), track("scaleY", seg("in", 0, .4, 60, 100, "out"))] },
      { type: "shape", id: "dot", color: "accent", position: [26, 0], geometry: { shape: "ellipse", size: [16, 16] },
        tracks: [track("scale", seg("in", .35, .75, 0, 100, "back"), seg("out", 0, .4, 100, 0, "in"))] },
      { type: "text", id: "title", color: "text", position: [50, 0], align: "left", size: 40, bold: true,
        tracks: [track("opacity", seg("in", .35, .75, 0, 100, "out"), seg("out", 0, .35, 100, 0, "in")), track("x", seg("in", .35, .85, -16, 0, "out"))] },
      { type: "text", id: "subtitle", color: "primary", position: [0, 62], align: "left", size: 28, bold: false,
        tracks: [track("opacity", seg("in", .55, 1, 0, 100, "out"), seg("out", 0, .4, 100, 0, "in")), track("y", seg("in", .55, 1, 16, 0, "out"))] }
    ]
  },
  {
    id: "title-pop", kind: "title", name: text("Título pop", "Pop title"),
    description: text("Título que salta para o centro com um traço embaixo.", "A title that springs to the center over a stroke."),
    origin: [.5, .5], timing: "in-out", sound: "pop", soundFrame: 0,
    defaults: { durationFrames: 90, animationFrames: 18, colors: { primary: WHITE, accent: [1, .82, .2], text: WHITE },
      texts: { title: text("SEU TÍTULO", "YOUR TITLE") } },
    layers: [
      { type: "text", id: "title", color: "text", position: [0, -10], align: "center", size: 120, bold: true,
        tracks: [track("scale", seg("in", 0, .7, 40, 100, "back"), seg("out", 0, 1, 100, 70, "in")), track("opacity", seg("in", 0, .35, 0, 100, "linear"), seg("out", .2, 1, 100, 0, "in"))] },
      { type: "shape", id: "line", color: "accent", position: [0, 74], geometry: { shape: "rect", size: [120, 12], roundness: 6, fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } },
        tracks: [track("scaleX", seg("in", .35, .9, 0, 100, "out"), seg("out", 0, .6, 100, 0, "in"))] }
    ]
  },
  {
    id: "title-rise", kind: "title", name: text("Título em ascensão", "Rising title"),
    description: text("Título e legenda que sobem separados por um traço.", "A title and caption that rise apart from a dash."),
    origin: [.5, .5], timing: "in-out", sound: "rise", soundFrame: 0,
    defaults: { durationFrames: 100, animationFrames: 22, colors: { primary: WHITE, accent: [.6, .75, 1], text: WHITE },
      texts: { title: text("Grande ideia", "Big idea"), subtitle: text("Uma linha de apoio", "A supporting line") } },
    layers: [
      { type: "text", id: "title", color: "text", position: [0, -24], align: "center", size: 104, bold: true,
        tracks: [track("y", seg("in", 0, .8, 90, 0, "out"), seg("out", 0, 1, 0, -60, "in")), track("opacity", seg("in", 0, .5, 0, 100, "out"), seg("out", 0, .8, 100, 0, "in"))] },
      { type: "shape", id: "dash", color: "primary", position: [0, 36], geometry: { shape: "rect", size: [80, 4] },
        tracks: [track("scaleX", seg("in", .45, 1, 0, 100, "out"), seg("out", 0, .5, 100, 0, "in"))] },
      { type: "text", id: "subtitle", color: "accent", position: [0, 80], align: "center", size: 36, bold: false,
        tracks: [track("y", seg("in", .3, 1, 50, 0, "out")), track("opacity", seg("in", .3, .8, 0, 100, "out"), seg("out", 0, .6, 100, 0, "in"))] }
    ]
  },
  {
    id: "title-frame", kind: "title", name: text("Título com moldura", "Framed title"),
    description: text("Moldura que se desenha em volta do título.", "A frame that draws itself around the title."),
    origin: [.5, .5], timing: "in-out", sound: "whoosh", soundFrame: 0,
    defaults: { durationFrames: 90, animationFrames: 24, colors: { primary: WHITE, accent: WHITE, text: WHITE },
      texts: { title: text("CAPÍTULO UM", "CHAPTER ONE") } },
    layers: [
      { type: "shape", id: "frame", color: "primary", position: [0, 0], stroke: 6, geometry: { shape: "rect", size: [240, 120], fit: { layer: "title", pad: [48, 30, 48, 30], axis: "both" } },
        tracks: [track("trimEnd", seg("in", 0, .75, 0, 100, "out")), track("trimStart", seg("out", 0, .7, 0, 100, "in"))] },
      { type: "text", id: "title", color: "text", position: [0, 0], align: "center", size: 96, bold: true,
        tracks: [track("opacity", seg("in", .35, .85, 0, 100, "out"), seg("out", 0, .5, 100, 0, "in")), track("scale", seg("in", .35, .95, 85, 100, "out"), seg("out", 0, .6, 100, 92, "in"))] }
    ]
  }
];

export const MOTION_ELEMENTS: readonly MotionElement[] = [...ELEMENT_CORE_RECIPES, ...ELEMENT_GRAPHIC_RECIPES, ...ELEMENT_TITLE_RECIPES, ...ELEMENT_TRANSITION_RECIPES, ...ELEMENT_EXTRA_RECIPES, ...ELEMENT_COUNTER_RECIPES];

/** Nomes das camadas dentro da pre-comp. As expressoes os referenciam. */
export const ELEMENT_LAYER_NAMES: Readonly<Record<string, ElementLocalizedText>> = {
  ...ELEMENT_GRAPHIC_LAYER_NAMES, ...ELEMENT_TITLE_LAYER_NAMES, ...ELEMENT_TRANSITION_LAYER_NAMES, ...ELEMENT_COUNTER_LAYER_NAMES,
  rays: text("Raios", "Rays"), sparks: text("Faíscas", "Sparks"), ring: text("Anel", "Ring"), echo: text("Eco", "Echo"),
  star: text("Estrela", "Star"), glint: text("Reflexo", "Glint"), disc: text("Disco", "Disc"), tick: text("Certo", "Tick"),
  shaft: text("Haste", "Shaft"), head: text("Ponta", "Head"), stroke: text("Traço", "Stroke"), loop: text("Laço", "Loop"),
  bar: text("Barra", "Bar"), box: text("Caixa", "Box"), line: text("Linha", "Line"), pill: text("Pílula", "Pill"),
  dot: text("Ponto", "Dot"), dash: text("Traço", "Dash"), frame: text("Moldura", "Frame"),
  title: text("Título", "Title"), subtitle: text("Subtítulo", "Subtitle"), controls: text("Moti.on Cores", "Moti.on Colors")
};
/** Nomes dos controles nas Propriedades essenciais. */
export const ELEMENT_COLOR_NAMES: Readonly<Record<ElementColorRole, ElementLocalizedText>> = {
  primary: text("Cor principal", "Main color"), accent: text("Cor de destaque", "Accent color"), text: text("Cor do texto", "Text color")
};
export const ELEMENT_LIMITS = {
  textLength: 120, durationFrames: [6, 1800], animationFrames: [2, 120], size: [25, 400], soundFrame: [0, 1800]
} as const;

export interface ElementInsertArgs {
  readonly elementId: string;
  readonly durationFrames?: number;
  readonly animationFrames?: number;
  /** Tamanho em % sobre a escala da composicao. */
  readonly size?: number;
  readonly sound?: ElementSoundChoice;
  readonly colors?: Readonly<Partial<Record<ElementColorRole, ElementRgb>>>;
  readonly texts?: Readonly<Partial<Record<ElementTextRole, string>>>;
}

export function findElement(id: string): MotionElement | undefined {
  return MOTION_ELEMENTS.find(element => element.id === id);
}
export function elementTextRoles(element: MotionElement): ElementTextRole[] {
  // A counter text is driven by its sliders, so it is not a typed role.
  return ELEMENT_TEXT_ROLES.filter(role => element.layers.some(layer => layer.type === "text" && !layer.counter && layer.id === role));
}

/** O texto de um contador no instante `time` (segundos), igual a expressao do host. */
export function elementCounterText(counter: ElementCounter, time: number, duration: number, locale: "pt-BR" | "en-US"): string {
  const { from, to } = counter;
  let out: string;
  if (counter.format === "clock") {
    const v = from + (to < from ? -1 : 1) * Math.min(Math.abs(to - from), Math.max(0, time));
    const s = Math.max(0, to < from ? Math.ceil(v - 1e-6) : Math.floor(v + 1e-6));
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60, pad = (n: number): string => (n < 10 ? "0" : "") + n;
    out = (h > 0 ? `${h}:${pad(m)}` : pad(m)) + ":" + pad(r);
  } else {
    const [start, end] = counter.span ?? [0, 1];
    const progress = trackAt(time, duration, 0, [ELEMENT_WINDOW_CODE.all, start, end, 0, 1, ELEMENT_EASE_CODE[counter.ease]]);
    const v = from + (to - from) * progress, en = locale === "en-US";
    const parts = Math.abs(v).toFixed(counter.decimals).split(".");
    const negative = v < 0 && Math.abs(v) >= Math.pow(10, -counter.decimals) / 2;
    out = (negative ? "-" : "") + parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, en ? "," : ".") + (parts.length > 1 ? (en ? "." : ",") + parts[1] : "");
  }
  return (counter.prefix ?? "") + out + (counter.suffix ?? "");
}
export function elementColorRoles(element: MotionElement): ElementColorRole[] {
  return ELEMENT_COLOR_ROLES.filter(role => element.layers.some(layer => layer.color === role));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const integerIn = (value: unknown, [min, max]: readonly [number, number]): boolean => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
/** Texto de uma linha ou duas: sem caracteres de controle alem da quebra de linha. */
export function isElementText(value: unknown): value is string {
  if (typeof value !== "string" || value.length > ELEMENT_LIMITS.textLength) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 32 && code !== 10 && code !== 13) || code === 127) return false;
  }
  return true;
}
export function isElementRgb(value: unknown): value is ElementRgb {
  return Array.isArray(value) && value.length === 3 && value.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);
}

/** Mesma regra do host (`elements-insert.jsx`): o painel recusa antes de enviar. */
export function elementInsertError(args: unknown): string | null {
  if (!isRecord(args)) return "args";
  for (const key of Object.keys(args)) if (!["elementId", "durationFrames", "animationFrames", "size", "sound", "colors", "texts"].includes(key)) return key;
  const element = typeof args["elementId"] === "string" ? findElement(args["elementId"]) : undefined;
  if (!element) return "elementId";
  const duration = args["durationFrames"] ?? element.defaults.durationFrames, animation = args["animationFrames"] ?? element.defaults.animationFrames;
  if (!integerIn(duration, ELEMENT_LIMITS.durationFrames)) return "durationFrames";
  if (!integerIn(animation, ELEMENT_LIMITS.animationFrames)) return "animationFrames";
  if (element.timing === "in-out" && (animation as number) * 2 > (duration as number)) return "animationFrames";
  if (args["size"] !== undefined && !(typeof args["size"] === "number" && Number.isFinite(args["size"]) && args["size"] >= ELEMENT_LIMITS.size[0] && args["size"] <= ELEMENT_LIMITS.size[1])) return "size";
  if (args["sound"] !== undefined && !(args["sound"] === "preset" || args["sound"] === "none" || (ELEMENT_SOUNDS as readonly unknown[]).includes(args["sound"]))) return "sound";
  const colors = args["colors"], texts = args["texts"];
  if (colors !== undefined) {
    if (!isRecord(colors)) return "colors";
    for (const [role, value] of Object.entries(colors)) if (!(ELEMENT_COLOR_ROLES as readonly string[]).includes(role) || !isElementRgb(value)) return `colors.${role}`;
  }
  if (texts !== undefined) {
    if (!isRecord(texts)) return "texts";
    for (const [role, value] of Object.entries(texts)) if (!elementTextRoles(element).includes(role as ElementTextRole) || !isElementText(value)) return `texts.${role}`;
  }
  return null;
}

/** Fecha os argumentos com os padroes do elemento, no idioma pedido. */
export function resolveElementArgs(args: ElementInsertArgs, locale: "pt-BR" | "en-US"): Required<Omit<ElementInsertArgs, "colors" | "texts">> & {
  colors: Record<ElementColorRole, ElementRgb>; texts: Partial<Record<ElementTextRole, string>>; soundId: ElementSoundId | null;
} {
  const element = findElement(args.elementId);
  if (!element) throw new Error(`Elemento desconhecido: ${args.elementId}`);
  const sound = args.sound ?? "preset";
  const texts: Partial<Record<ElementTextRole, string>> = {};
  for (const role of elementTextRoles(element)) texts[role] = args.texts?.[role] ?? element.defaults.texts[role]?.[locale] ?? "";
  return {
    elementId: element.id, durationFrames: args.durationFrames ?? element.defaults.durationFrames,
    animationFrames: args.animationFrames ?? element.defaults.animationFrames, size: args.size ?? 100, sound,
    colors: { ...element.defaults.colors, ...args.colors }, texts,
    soundId: sound === "none" ? null : sound === "preset" ? element.sound : sound
  };
}

export { elementTrack } from "./elements-math.js";

export const ELEMENT_WINDOW_CODE: Readonly<Record<ElementWindow, number>> = { in: 0, out: 1, all: 2 };
export const ELEMENT_EASE_CODE: Readonly<Record<ElementEase, number>> = { linear: 0, out: 1, in: 2, "in-out": 3, back: 4 };
/** Trechos achatados em grupos de seis numeros, como a expressao os recebe. */
export function elementTrackData(segments: readonly ElementSegment[]): number[] {
  const data: number[] = [];
  for (const s of segments) data.push(ELEMENT_WINDOW_CODE[s.window], s.start, s.end, s.from, s.to, ELEMENT_EASE_CODE[s.ease]);
  return data;
}

/** Valor de repouso de um canal sem trilha. */
export function elementChannelRest(channel: ElementChannel): number {
  return channel === "opacity" || channel === "scale" || channel === "scaleX" || channel === "scaleY" || channel === "trimEnd" ? 100 : 0;
}
