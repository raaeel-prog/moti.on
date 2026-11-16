/**
 * Titulos do Moti.on: tarjas (lower thirds), caixas de texto (preenchidas,
 * contornadas, texto com linha) e titulos de abertura. Receitas proprias,
 * montadas de poucos moldes com paletas; nenhuma vem de outro produto.
 */
import type { ElementLocalizedText, ElementRgb, MotionElement } from "./elements.js";
import { INK, WHITE, drawInOut, fadeInOut, inOut, seg, text, textLayer, track } from "./elements-kit.js";

interface Palette { readonly key: string; readonly name: ElementLocalizedText; readonly primary: ElementRgb; readonly accent: ElementRgb; readonly text: ElementRgb }
const PALETTES: readonly Palette[] = [
  { key: "graphite", name: text("Grafite", "Graphite"), primary: [.07, .09, .16], accent: [1, .42, .13], text: WHITE },
  { key: "sky", name: text("Céu", "Sky"), primary: [.06, .3, .75], accent: [.4, .9, 1], text: WHITE },
  { key: "mint", name: text("Menta", "Mint"), primary: WHITE, accent: [.13, .77, .55], text: INK },
  { key: "ruby", name: text("Rubi", "Ruby"), primary: [.78, .12, .3], accent: [1, .8, .3], text: WHITE }
];
const named = (base: ElementLocalizedText, palette: Palette): ElementLocalizedText =>
  text(`${base["pt-BR"]} ${palette.name["pt-BR"]}`, `${base["en-US"]} ${palette.name["en-US"]}`);
const colors = (p: Palette) => ({ primary: p.primary, accent: p.accent, text: p.text });

const LT_TEXTS = { title: text("Nome Sobrenome", "First Last"), subtitle: text("Cargo ou assunto", "Role or topic") };
const BOX_TEXTS = { title: text("Seu texto aqui", "Your text here") };

interface Mold {
  readonly id: string;
  readonly name: ElementLocalizedText;
  readonly description: ElementLocalizedText;
  readonly sound: MotionElement["sound"];
  readonly animationFrames: number;
  readonly layers: (p: Palette) => MotionElement["layers"];
}

// ---- Tarjas ---------------------------------------------------------------

const subtitleIn = (y: number, x = 0, color: "text" | "primary" | "accent" = "text") => textLayer({
  id: "subtitle", color, position: [x, y], size: 28, bold: false,
  tracks: [inOut("opacity", 0, 100, 0, [.5, .95], [0, .4]), track("y", seg("in", .5, 1, 16, 0, "out"))]
});

const LOWER_THIRDS: readonly Mold[] = [
  { id: "lt-double", name: text("Caixa dupla", "Double box"), description: text("Duas caixas que abrem em degrau, uma por linha.", "Two boxes that open in steps, one per line."),
    sound: "slide-up", animationFrames: 20, layers: () => [
      { type: "shape", id: "box", color: "primary", position: [0, -24], geometry: { shape: "rect", size: [120, 62], fit: { layer: "title", pad: [22, 10, 22, 10], axis: "both" } },
        tracks: [inOut("scaleX", 0, 100, 0, [0, .55], [.35, .9])] },
      { type: "shape", id: "box2", color: "accent", position: [0, 36], geometry: { shape: "rect", size: [100, 44], fit: { layer: "subtitle", pad: [22, 8, 22, 8], axis: "both" } },
        tracks: [inOut("scaleX", 0, 100, 0, [.2, .75], [.1, .7])] },
      textLayer({ position: [22, -24], size: 44, tracks: [inOut("opacity", 0, 100, 0, [.4, .8], [0, .35]), track("x", seg("in", .4, .9, -20, 0, "out"))] }),
      textLayer({ id: "subtitle", position: [22, 36], size: 26, bold: false, tracks: [inOut("opacity", 0, 100, 0, [.55, .95], [0, .3])] })
    ] },
  { id: "lt-slash", name: text("Faixa inclinada", "Slanted stripe"), description: text("Um corte inclinado de cor antes do nome.", "A slanted cut of color before the name."),
    sound: "swish", animationFrames: 18, layers: () => [
      { type: "shape", id: "slash", color: "accent", position: [0, 0], rotation: 18, geometry: { shape: "rect", size: [12, 130] },
        tracks: [inOut("scaleY", 0, 100, 0, [0, .45], [.55, 1])] },
      textLayer({ position: [34, -22], size: 48, tracks: [inOut("opacity", 0, 100, 0, [.3, .75], [0, .4]), inOut("x", -30, 0, -30, [.3, .9], [0, .6])] }),
      subtitleIn(34, 34, "primary")
    ] },
  { id: "lt-dot-line", name: text("Ponto e linha", "Dot and line"), description: text("Um ponto acende e puxa a linha sob o nome.", "A dot lights up and pulls the line under the name."),
    sound: "blip", animationFrames: 20, layers: () => [
      { type: "shape", id: "dot", color: "accent", position: [0, 14], geometry: { shape: "ellipse", size: [14, 14] },
        tracks: [inOut("scale", 0, 100, 0, [0, .35], [.6, 1], ["out", "in"])] },
      { type: "shape", id: "line", color: "primary", position: [16, 14], geometry: { shape: "rect", size: [120, 3], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } },
        tracks: [inOut("scaleX", 0, 100, 0, [.2, .7], [.3, .85])] },
      textLayer({ color: "text", position: [16, -16], size: 46, tracks: [inOut("opacity", 0, 100, 0, [.4, .8], [0, .4]), track("y", seg("in", .4, .9, 24, 0, "out"))] }),
      subtitleIn(44, 16, "primary")
    ] },
  { id: "lt-bracket", name: text("Colchete", "Bracket"), description: text("Um colchete se desenha e libera o texto.", "A bracket draws itself and releases the text."),
    sound: "tick", animationFrames: 20, layers: () => [
      { type: "shape", id: "bracket", color: "accent", position: [0, 0], stroke: 6, geometry: { shape: "path", points: [[22, -58], [0, -58], [0, 58], [22, 58]], closed: false },
        tracks: drawInOut([0, .5], [.4, 1]) },
      textLayer({ position: [26, -20], size: 46, tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .4]), inOut("x", -18, 0, -18, [.35, .9], [0, .5])] }),
      subtitleIn(30, 26, "primary")
    ] },
  { id: "lt-block", name: text("Bloco lateral", "Side block"), description: text("Um bloco quadrado de cor ao lado do nome.", "A square color block beside the name."),
    sound: "pop", animationFrames: 18, layers: () => [
      { type: "shape", id: "block", color: "accent", position: [40, 0], geometry: { shape: "rect", size: [80, 80], roundness: 8 },
        tracks: [inOut("scale", 0, 100, 0, [0, .5], [.5, 1], ["back", "in"]), inOut("rotation", -45, 0, 45, [0, .5], [.5, 1])] },
      textLayer({ position: [100, -18], size: 44, tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .4]), track("x", seg("in", .35, .9, -24, 0, "out"))] }),
      subtitleIn(26, 100, "primary")
    ] },
  { id: "lt-outline", name: text("Contorno de nome", "Name outline"), description: text("Um contorno fino se fecha em volta do nome.", "A thin outline closes around the name."),
    sound: "whoosh", animationFrames: 22, layers: () => [
      { type: "shape", id: "outline", color: "accent", position: [0, -22], stroke: 4, geometry: { shape: "rect", size: [140, 64], fit: { layer: "title", pad: [20, 12, 20, 12], axis: "both" } },
        tracks: drawInOut([0, .7], [0, .7]) },
      textLayer({ position: [20, -22], size: 44, tracks: [inOut("opacity", 0, 100, 0, [.3, .8], [0, .4])] }),
      subtitleIn(38, 20, "primary")
    ] },
  { id: "lt-twin-rule", name: text("Régua dupla", "Twin rule"), description: text("Duas linhas que correm em sentidos opostos.", "Two lines that run in opposite directions."),
    sound: "slide-down", animationFrames: 20, layers: () => [
      { type: "shape", id: "line", color: "accent", position: [0, -62], geometry: { shape: "rect", size: [120, 3], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } },
        tracks: [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])] },
      { type: "shape", id: "line2", color: "accent", position: [0, 16], geometry: { shape: "rect", size: [120, 3], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } },
        tracks: [inOut("scaleX", 0, 100, 0, [.15, .75], [.25, .85])] },
      textLayer({ position: [0, -24], size: 46, tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .4])] }),
      subtitleIn(48, 0, "primary")
    ] },
  { id: "lt-card", name: text("Cartão arredondado", "Rounded card"), description: text("Cartão de cantos suaves que cresce com o nome.", "A soft-cornered card that grows with the name."),
    sound: "bubble", animationFrames: 18, layers: () => [
      { type: "shape", id: "card", color: "primary", position: [0, -20], geometry: { shape: "rect", size: [150, 70], roundness: 20, fit: { layer: "title", pad: [26, 14, 26, 14], axis: "both" } },
        tracks: [inOut("scale", 60, 100, 60, [0, .5], [.4, 1], ["back", "in"]), fadeInOut([0, .3], [.6, 1])] },
      textLayer({ position: [26, -20], size: 42, tracks: [inOut("opacity", 0, 100, 0, [.3, .75], [0, .4])] }),
      subtitleIn(46, 26, "accent")
    ] },
  { id: "lt-pillar", name: text("Pilar vertical", "Vertical pillar"), description: text("Uma barra vertical cresce e o texto sai dela.", "A vertical bar grows and the text slides out of it."),
    sound: "rise", animationFrames: 20, layers: () => [
      { type: "shape", id: "rule", color: "accent", position: [0, 6], geometry: { shape: "rect", size: [6, 130] },
        tracks: [inOut("scaleY", 0, 100, 0, [0, .45], [.55, 1])] },
      textLayer({ position: [24, -20], size: 46, tracks: [inOut("opacity", 0, 100, 0, [.3, .75], [0, .4]), inOut("x", -40, 0, -40, [.3, .95], [0, .6])] }),
      subtitleIn(32, 24, "primary")
    ] },
  { id: "lt-marker", name: text("Marca-texto", "Highlighter"), description: text("Um marca-texto passa por trás do nome.", "A highlighter sweeps behind the name."),
    sound: "slide-up", animationFrames: 18, layers: () => [
      { type: "shape", id: "marker", color: "accent", position: [0, -20], geometry: { shape: "rect", size: [120, 50], roundness: 4, fit: { layer: "title", pad: [12, 4, 12, 4], axis: "both" } },
        tracks: [inOut("scaleX", 0, 100, 0, [0, .55], [.4, .95])] },
      textLayer({ position: [12, -20], size: 44, tracks: [inOut("opacity", 0, 100, 0, [.25, .7], [0, .4])] }),
      subtitleIn(34, 12, "primary")
    ] }
];

// ---- Caixas de texto -------------------------------------------------------

const center = (tracks: MotionElement["layers"][number]["tracks"]) => textLayer({ position: [0, 0], align: "center", size: 84, tracks });
const centeredBox = (id: string, pad: number, round: number, tracks: MotionElement["layers"][number]["tracks"], stroke?: number, color: "primary" | "accent" = "primary"): MotionElement["layers"][number] => ({
  type: "shape", id, color, position: [0, 0], ...(stroke ? { stroke } : {}),
  geometry: { shape: "rect", size: [200, 110], roundness: round, fit: { layer: "title", pad: [pad, pad * .6, pad, pad * .6], axis: "both" } }, tracks
});

const TEXT_BOXES: readonly Mold[] = [
  { id: "box-center", name: text("Caixa central", "Center box"), description: text("Caixa que abre do meio para os lados.", "A box that opens from the middle outwards."),
    sound: "whoosh", animationFrames: 16, layers: () => [centeredBox("box", 40, 0, [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])]), center([inOut("opacity", 0, 100, 0, [.4, .9], [0, .4])])] },
  { id: "box-vertical", name: text("Caixa vertical", "Vertical box"), description: text("Caixa que abre de cima para baixo.", "A box that opens top to bottom."),
    sound: "slide-down", animationFrames: 16, layers: () => [centeredBox("box", 40, 0, [inOut("scaleY", 0, 100, 0, [0, .55], [.45, 1])]), center([inOut("opacity", 0, 100, 0, [.35, .85], [0, .4]), track("y", seg("in", .35, .9, 20, 0, "out"))])] },
  { id: "box-bounce", name: text("Caixa saltitante", "Bouncy box"), description: text("Caixa arredondada que salta e assenta.", "A rounded box that springs and settles."),
    sound: "bubble", animationFrames: 18, layers: () => [centeredBox("box", 44, 24, [inOut("scale", 0, 100, 0, [0, .65], [.4, 1], ["back", "in"])]), center([inOut("scale", 60, 100, 60, [.15, .75], [.3, .9], ["back", "in"]), inOut("opacity", 0, 100, 0, [.15, .5], [.5, .9])])] },
  { id: "box-glide", name: text("Caixa deslizante", "Gliding box"), description: text("Caixa e texto entram de lado, defasados.", "Box and text glide in from the side, offset."),
    sound: "swish", animationFrames: 18, layers: () => [centeredBox("box", 40, 6, [inOut("x", -260, 0, 260, [0, .65], [.35, 1]), fadeInOut([0, .35], [.65, 1])]), center([inOut("x", -160, 0, 160, [.2, .85], [.15, .8]), inOut("opacity", 0, 100, 0, [.2, .6], [.4, .8])])] },
  { id: "box-draw", name: text("Contorno desenhado", "Drawn outline"), description: text("Um contorno se desenha em volta do texto.", "An outline draws itself around the text."),
    sound: "whoosh", animationFrames: 22, layers: () => [centeredBox("outline", 44, 0, drawInOut([0, .75], [0, .75]), 5, "accent"), center([inOut("opacity", 0, 100, 0, [.35, .85], [0, .45])])] },
  { id: "box-capsule", name: text("Contorno cápsula", "Capsule outline"), description: text("Contorno de cápsula que fecha o texto.", "A capsule outline that encloses the text."),
    sound: "tick", animationFrames: 22, layers: () => [centeredBox("outline", 54, 999, drawInOut([0, .75], [0, .75]), 5, "accent"), center([inOut("opacity", 0, 100, 0, [.35, .85], [0, .45]), inOut("scale", 90, 100, 90, [.35, .9], [0, .6])])] },
  { id: "box-echo", name: text("Contorno duplo", "Double outline"), description: text("Dois contornos desencontrados se perseguem.", "Two offset outlines chase each other."),
    sound: "sweep-whoosh", animationFrames: 24, layers: () => [
      centeredBox("outline", 36, 0, drawInOut([0, .7], [.2, .9]), 4, "accent"), centeredBox("frame2", 56, 0, drawInOut([.2, .9], [0, .7]), 2, "primary"),
      center([inOut("opacity", 0, 100, 0, [.4, .9], [0, .4])])] }
];

const LINE_TEXTS: readonly Mold[] = [
  { id: "text-line-above", name: text("Linha acima", "Line above"), description: text("Uma linha corre acima e o texto desce até ela.", "A line runs above and the text drops to it."),
    sound: "slide-down", animationFrames: 18, layers: () => [
      { type: "shape", id: "line", color: "accent", position: [0, -62], geometry: { shape: "rect", size: [120, 5], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } }, tracks: [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])] },
      center([inOut("opacity", 0, 100, 0, [.3, .8], [0, .4]), track("y", seg("in", .3, .9, -30, 0, "out"))])] },
  { id: "text-line-below", name: text("Linha abaixo", "Line below"), description: text("O texto sobe sobre uma linha que se estica.", "The text rises over a stretching line."),
    sound: "slide-up", animationFrames: 18, layers: () => [
      { type: "shape", id: "line", color: "accent", position: [0, 62], geometry: { shape: "rect", size: [120, 5], fit: { layer: "title", pad: [0, 0, 0, 0], axis: "x" } }, tracks: [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])] },
      center([inOut("opacity", 0, 100, 0, [.3, .8], [0, .4]), track("y", seg("in", .3, .9, 30, 0, "out"))])] },
  { id: "text-line-both", name: text("Entre linhas", "Between lines"), description: text("Duas linhas abrem e enquadram o texto.", "Two lines open and frame the text."),
    sound: "whoosh", animationFrames: 20, layers: () => [
      { type: "shape", id: "line", color: "accent", position: [0, -62], geometry: { shape: "rect", size: [120, 4], fit: { layer: "title", pad: [30, 0, 30, 0], axis: "x" } }, tracks: [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])] },
      { type: "shape", id: "line2", color: "accent", position: [0, 62], geometry: { shape: "rect", size: [120, 4], fit: { layer: "title", pad: [30, 0, 30, 0], axis: "x" } }, tracks: [inOut("scaleX", 0, 100, 0, [.1, .7], [.3, .9])] },
      center([inOut("opacity", 0, 100, 0, [.35, .85], [0, .4]), inOut("scale", 85, 100, 85, [.35, .95], [0, .6])])] },
  { id: "text-line-side", name: text("Barra ao lado", "Side bar"), description: text("Uma barra vertical à esquerda empurra o texto.", "A vertical bar on the left pushes the text out."),
    sound: "swish", animationFrames: 18, layers: () => [
      { type: "shape", id: "rule", color: "accent", position: [-30, 0], geometry: { shape: "rect", size: [8, 110] }, tracks: [inOut("scaleY", 0, 100, 0, [0, .45], [.55, 1])] },
      textLayer({ position: [0, 0], size: 76, tracks: [inOut("opacity", 0, 100, 0, [.3, .8], [0, .4]), inOut("x", -50, 0, -50, [.3, .95], [0, .6])] })] }
];

// ---- Titulos de abertura ---------------------------------------------------

const TITLE_TEXTS = { title: text("GRANDE TÍTULO", "BIG TITLE"), subtitle: text("Uma linha de apoio", "A supporting line") };
const bigTitle = (tracks: MotionElement["layers"][number]["tracks"], y = -20) => textLayer({ position: [0, y], align: "center", size: 112, tracks });
const caption = (tracks: MotionElement["layers"][number]["tracks"], y = 70) => textLayer({ id: "subtitle", color: "accent", position: [0, y], align: "center", size: 34, bold: false, tracks });

interface TitleMold { readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText; readonly sound: MotionElement["sound"]; readonly frames: number; readonly layers: MotionElement["layers"] }
const TITLES: readonly TitleMold[] = [
  { id: "title-push-in", name: text("Empurrão para dentro", "Push in"), description: text("Título que encolhe até o lugar, como uma câmera que recua.", "A title that shrinks into place like a camera pulling back."), sound: "boom-cinema", frames: 24,
    layers: [bigTitle([inOut("scale", 160, 100, 70, [0, .9], [0, 1]), inOut("opacity", 0, 100, 0, [0, .4], [.4, 1])]), caption([inOut("opacity", 0, 100, 0, [.5, 1], [0, .5])])] },
  { id: "title-push-out", name: text("Empurrão para fora", "Push out"), description: text("Título que cresce devagar do centro.", "A title that slowly grows from the center."), sound: "reverse-swell", frames: 24,
    layers: [bigTitle([inOut("scale", 70, 100, 140, [0, .9], [0, 1]), inOut("opacity", 0, 100, 0, [0, .5], [.4, 1])]), caption([inOut("opacity", 0, 100, 0, [.5, 1], [0, .5])])] },
  { id: "title-drop", name: text("Queda", "Drop"), description: text("O título cai de cima e quica ao parar.", "The title drops from above and bounces to a stop."), sound: "thud", frames: 20,
    layers: [bigTitle([inOut("y", -300, 0, 300, [0, .8], [0, 1], ["back", "in"]), inOut("opacity", 0, 100, 0, [0, .3], [.6, 1])]), caption([inOut("opacity", 0, 100, 0, [.6, 1], [0, .4])])] },
  { id: "title-slide-left", name: text("Entrada pela esquerda", "From the left"), description: text("Título e legenda chegam da esquerda em tempos diferentes.", "Title and caption arrive from the left at different times."), sound: "swish", frames: 20,
    layers: [bigTitle([inOut("x", -500, 0, 500, [0, .8], [0, .9]), inOut("opacity", 0, 100, 0, [0, .4], [.5, .9])]), caption([inOut("x", -400, 0, 400, [.2, 1], [.1, 1]), inOut("opacity", 0, 100, 0, [.2, .6], [.6, 1])])] },
  { id: "title-slide-right", name: text("Entrada pela direita", "From the right"), description: text("Título e legenda chegam da direita.", "Title and caption arrive from the right."), sound: "swish", frames: 20,
    layers: [bigTitle([inOut("x", 500, 0, -500, [0, .8], [0, .9]), inOut("opacity", 0, 100, 0, [0, .4], [.5, .9])]), caption([inOut("x", 400, 0, -400, [.2, 1], [.1, 1]), inOut("opacity", 0, 100, 0, [.2, .6], [.6, 1])])] },
  { id: "title-split", name: text("Separação", "Split"), description: text("Título sobe e legenda desce a partir de um traço.", "The title rises and the caption drops away from a dash."), sound: "slide-up", frames: 22,
    layers: [
      { type: "shape", id: "dash", color: "primary", position: [0, 28], geometry: { shape: "rect", size: [300, 4] }, tracks: [inOut("scaleX", 0, 100, 0, [0, .5], [.5, 1])] },
      bigTitle([inOut("y", 60, 0, 60, [.3, 1], [0, .7]), inOut("opacity", 0, 100, 0, [.3, .8], [0, .6])]), caption([inOut("y", -40, 0, -40, [.3, 1], [0, .7]), inOut("opacity", 0, 100, 0, [.3, .8], [0, .6])])] },
  { id: "title-stamp", name: text("Carimbo", "Stamp"), description: text("Título que bate na tela girando de leve.", "A title that slams onto the screen with a slight turn."), sound: "bass-hit", frames: 14,
    layers: [bigTitle([inOut("scale", 220, 100, 0, [0, .7], [.3, 1], ["back", "in"]), inOut("rotation", -12, 0, 8, [0, .7], [.3, 1]), inOut("opacity", 0, 100, 0, [0, .2], [.6, 1])])] },
  { id: "title-tilt", name: text("Inclinação", "Tilt"), description: text("Título que se endireita ao entrar.", "A title that straightens as it enters."), sound: "creak", frames: 20,
    layers: [bigTitle([inOut("rotation", -14, 0, 14, [0, .85], [0, 1]), inOut("y", 40, 0, -40, [0, .85], [0, 1]), inOut("opacity", 0, 100, 0, [0, .4], [.5, 1])]), caption([inOut("opacity", 0, 100, 0, [.5, 1], [0, .5])])] },
  { id: "title-spotlight", name: text("Holofote", "Spotlight"), description: text("Um anel se desenha em volta e o título acende.", "A ring draws around the title and it lights up."), sound: "drone-air", frames: 26,
    layers: [
      { type: "shape", id: "ring", color: "accent", position: [0, 0], stroke: 4, geometry: { shape: "ellipse", size: [760, 300] }, tracks: [...drawInOut([0, .8], [0, .8]), inOut("rotation", -30, 0, 30, [0, .8], [0, .8])] },
      bigTitle([inOut("opacity", 0, 100, 0, [.4, 1], [0, .5])], 0)] },
  { id: "title-cinema-bars", name: text("Faixas de cinema", "Cinema bars"), description: text("Duas faixas largas abrem e revelam o título.", "Two wide bars part and reveal the title."), sound: "boom-deep", frames: 28,
    layers: [
      { type: "shape", id: "bar", color: "primary", position: [0, -130], geometry: { shape: "rect", size: [1100, 6] }, tracks: [inOut("y", 130, 0, 130, [0, .8], [.2, 1], ["in-out", "in-out"]), inOut("scaleX", 0, 100, 0, [0, .4], [.6, 1])] },
      { type: "shape", id: "line2", color: "primary", position: [0, 130], geometry: { shape: "rect", size: [1100, 6] }, tracks: [inOut("y", -130, 0, -130, [0, .8], [.2, 1], ["in-out", "in-out"]), inOut("scaleX", 0, 100, 0, [0, .4], [.6, 1])] },
      bigTitle([inOut("opacity", 0, 100, 0, [.45, 1], [0, .4]), inOut("scale", 92, 100, 92, [.45, 1], [0, .5])], 0)] },
  { id: "title-badge", name: text("Selo", "Badge"), description: text("Um selo estrelado gira por trás do título.", "A starred seal spins behind the title."), sound: "glass-clink", frames: 22,
    layers: [
      { type: "shape", id: "star", color: "accent", position: [0, 0], geometry: { shape: "star", points: 12, outer: 300, inner: 262 }, tracks: [inOut("scale", 0, 100, 0, [0, .7], [.3, 1], ["back", "in"]), inOut("rotation", -90, 0, 90, [0, .9], [0, 1])] },
      textLayer({ position: [0, 0], align: "center", size: 72, color: "text", tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .4]), inOut("scale", 70, 100, 70, [.35, .9], [0, .6], ["back", "in"])] })] }
];

function fromMold(kind: MotionElement["kind"], mold: Mold, palette: Palette, origin: readonly [number, number], texts: MotionElement["defaults"]["texts"], durationFrames: number): MotionElement {
  return {
    id: `${mold.id}-${palette.key}`, kind, name: named(mold.name, palette), description: mold.description,
    origin, timing: "in-out", sound: mold.sound, soundFrame: 0,
    defaults: { durationFrames, animationFrames: mold.animationFrames, colors: colors(palette), texts },
    layers: mold.layers(palette)
  };
}

export const ELEMENT_TITLE_RECIPES: readonly MotionElement[] = [
  ...LOWER_THIRDS.flatMap(mold => PALETTES.map(p => fromMold("lower-third", mold, p, [.07, .8], LT_TEXTS, 120))),
  ...TEXT_BOXES.flatMap(mold => PALETTES.map(p => fromMold("text-box", mold, p, [.5, .5], BOX_TEXTS, 90))),
  ...LINE_TEXTS.map((mold, i) => fromMold("text-box", mold, PALETTES[i % PALETTES.length]!, [.5, .5], BOX_TEXTS, 90)),
  ...TITLES.map(mold => ({
    id: mold.id, kind: "title" as const, name: mold.name, description: mold.description, origin: [.5, .5] as const, timing: "in-out" as const,
    sound: mold.sound, soundFrame: 0,
    defaults: { durationFrames: 100, animationFrames: mold.frames, colors: { primary: WHITE, accent: [1, .78, .25] as ElementRgb, text: WHITE },
      texts: mold.layers.some(l => l.type === "text" && l.id === "subtitle") ? TITLE_TEXTS : { title: TITLE_TEXTS.title } },
    layers: mold.layers
  }))
];

export const ELEMENT_TITLE_LAYER_NAMES: Readonly<Record<string, ElementLocalizedText>> = {
  box2: text("Caixa 2", "Box 2"), slash: text("Corte", "Slash"), bracket: text("Colchete", "Bracket"), block: text("Bloco", "Block"),
  outline: text("Contorno", "Outline"), line2: text("Linha 2", "Line 2"), card: text("Cartão", "Card"), rule: text("Barra vertical", "Rule"),
  marker: text("Marca-texto", "Highlighter"), frame2: text("Moldura 2", "Frame 2")
};
