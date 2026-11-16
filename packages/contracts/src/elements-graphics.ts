/**
 * Formas, tracos a mao e elementos de redes sociais do Moti.on. Receitas
 * proprias desenhadas por codigo (shapes nativas, Trim Paths e Repetidor).
 * Os elementos sociais sao genericos: nenhum logotipo ou marca de plataforma.
 */
import type { ElementLocalizedText, ElementRgb, MotionElement } from "./elements.js";
import { INK, WHITE, drawInOut, drawOnce, heart, inOut, polygon, sampled, seg, text, textLayer, track, wobblyLoop } from "./elements-kit.js";

const GOLD: ElementRgb = [1, .78, .2], CYAN: ElementRgb = [.3, .85, 1], CORAL: ElementRgb = [1, .38, .32], LIME: ElementRgb = [.55, .95, .35], VIOLET: ElementRgb = [.62, .45, 1];
const palette = (primary: ElementRgb, accent: ElementRgb = WHITE, ink: ElementRgb = WHITE) => ({ primary, accent, text: ink });

interface Shot {
  readonly id: string; readonly name: ElementLocalizedText; readonly description: ElementLocalizedText;
  readonly sound: MotionElement["sound"]; readonly frames?: number; readonly colors: MotionElement["defaults"]["colors"];
  readonly layers: MotionElement["layers"];
}
/** Disparo unico: a animacao ocupa a duracao toda. */
const oneshot = (kind: MotionElement["kind"], s: Shot): MotionElement => ({
  id: s.id, kind, name: s.name, description: s.description, origin: [.5, .5], timing: "oneshot", sound: s.sound, soundFrame: 0,
  defaults: { durationFrames: s.frames ?? 24, animationFrames: Math.max(2, Math.round((s.frames ?? 24) / 2)), colors: s.colors, texts: {} }, layers: s.layers
});
/** Entrada e Saida com permanencia no meio. */
const lasting = (kind: MotionElement["kind"], s: Shot & { readonly texts?: MotionElement["defaults"]["texts"]; readonly origin?: readonly [number, number] }): MotionElement => ({
  id: s.id, kind, name: s.name, description: s.description, origin: s.origin ?? [.5, .5], timing: "in-out", sound: s.sound, soundFrame: 0,
  defaults: { durationFrames: 72, animationFrames: s.frames ?? 16, colors: s.colors, texts: s.texts ?? {} }, layers: s.layers
});

const ray = (id: string, color: "primary" | "accent", inner: number, outer: number, copies: number, stroke: number, rotation = 0, draw: readonly [number, number] = [0, .5], erase: readonly [number, number] = [.25, .9]) => ({
  type: "shape" as const, id, color, position: [0, 0] as const, rotation, stroke, geometry: { shape: "path" as const, points: [[0, -inner], [0, -outer]] as const, closed: false },
  repeater: { copies, rotation: 360 / copies }, tracks: drawOnce(draw, erase)
});
const ringPulse = (id: string, color: "primary" | "accent", size: number, from: number, to: number, start: number, stroke: number) => ({
  type: "shape" as const, id, color, position: [0, 0] as const, stroke, geometry: { shape: "ellipse" as const, size: [size, size] as const },
  tracks: [track("scale", seg("all", start, 1, from, to, "out")), track("opacity", seg("all", Math.min(.9, start + .35), 1, 100, 0, "linear")), track("strokeWidth", seg("all", start, 1, stroke * 2, 1, "out"))]
});
const popIn = (start = 0, end = .45, hold = .6) => [track("scale", seg("all", start, end, 0, 100, "back"), seg("all", hold, 1, 100, 0, "in"))];

// ---- Formas -----------------------------------------------------------------

const SHAPES: readonly MotionElement[] = [
  oneshot("shape", { id: "burst-wide", name: text("Raios largos", "Wide rays"), description: text("Doze raios grossos que saltam do centro.", "Twelve thick rays that leap from the center."), sound: "pop", colors: palette(GOLD),
    layers: [ray("rays", "primary", 90, 200, 12, 16)] }),
  oneshot("shape", { id: "burst-double", name: text("Raios em camadas", "Layered rays"), description: text("Duas coroas de raios defasadas.", "Two offset crowns of rays."), sound: "glass-clink", colors: palette(CYAN, WHITE),
    layers: [ray("rays", "primary", 60, 150, 10, 10), ray("sparks", "accent", 110, 190, 10, 6, 18, [.15, .6], [.4, 1])] }),
  oneshot("shape", { id: "burst-dash", name: text("Tracejado radial", "Radial dashes"), description: text("Tracinhos curtos que se espalham em roda.", "Short dashes that scatter in a circle."), sound: "tick", frames: 18, colors: palette(WHITE),
    layers: [ray("rays", "primary", 120, 150, 16, 8, 0, [0, .4], [.3, .8])] }),
  oneshot("shape", { id: "ring-triple", name: text("Ondas em sequência", "Ripple trio"), description: text("Três anéis que se propagam um após o outro.", "Three rings ripple out one after another."), sound: "drone-air", frames: 30, colors: palette(CYAN, WHITE),
    layers: [ringPulse("ring", "primary", 200, 10, 160, 0, 10), ringPulse("echo", "accent", 200, 10, 130, .15, 6), ringPulse("halo", "primary", 200, 10, 100, .3, 4)] }),
  oneshot("shape", { id: "ring-solid", name: text("Disco de impacto", "Impact disc"), description: text("Um disco cheio estoura e vira anel.", "A solid disc bursts and turns into a ring."), sound: "bass-hit", colors: palette(CORAL, WHITE),
    layers: [{ type: "shape", id: "disc", color: "primary", position: [0, 0], geometry: { shape: "ellipse", size: [180, 180] }, tracks: [track("scale", seg("all", 0, .35, 0, 110, "out"), seg("all", .35, .6, 110, 0, "in"))] },
      ringPulse("ring", "accent", 200, 40, 170, .25, 10)] }),
  oneshot("shape", { id: "sparkle-trio", name: text("Trio de brilhos", "Sparkle trio"), description: text("Três estrelas que piscam em tempos diferentes.", "Three stars that twinkle at different times."), sound: "glass-clink", frames: 30, colors: palette(WHITE, GOLD),
    layers: [
      { type: "shape", id: "star", color: "primary", position: [0, 0], geometry: { shape: "star", points: 4, outer: 70, inner: 12 }, tracks: popIn(0, .35, .5) },
      { type: "shape", id: "glint", color: "accent", position: [-110, 50], geometry: { shape: "star", points: 4, outer: 36, inner: 7 }, tracks: popIn(.15, .5, .6) },
      { type: "shape", id: "twinkle", color: "accent", position: [100, -70], geometry: { shape: "star", points: 4, outer: 28, inner: 5 }, tracks: popIn(.3, .62, .72) }] }),
  oneshot("shape", { id: "confetti-ring", name: text("Confete em roda", "Confetti ring"), description: text("Pontinhos coloridos que se abrem em círculo.", "Little colored dots that open in a circle."), sound: "pop", colors: palette(GOLD, CORAL),
    layers: [
      { type: "shape", id: "dots", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [18, 18], roundness: 9, offset: [0, -130] }, repeater: { copies: 10, rotation: 36 },
        tracks: [track("scale", seg("all", 0, .5, 0, 100, "out")), track("opacity", seg("all", .55, 1, 100, 0, "linear"))] },
      { type: "shape", id: "flakes", color: "accent", position: [0, 0], rotation: 18, geometry: { shape: "rect", size: [14, 22], roundness: 3, offset: [0, -100] }, repeater: { copies: 10, rotation: 36 },
        tracks: [track("scale", seg("all", .05, .55, 0, 100, "out")), track("opacity", seg("all", .6, 1, 100, 0, "linear")), track("rotation", seg("all", .05, 1, 18, 60, "out"))] }] }),
  oneshot("shape", { id: "spin-square", name: text("Quadrado giratório", "Spinning square"), description: text("Um quadrado vazado gira e some.", "An outlined square spins and fades away."), sound: "swish", colors: palette(WHITE),
    layers: [{ type: "shape", id: "frame", color: "primary", position: [0, 0], stroke: 8, geometry: { shape: "rect", size: [160, 160] },
      tracks: [track("rotation", seg("all", 0, 1, -45, 135, "in-out")), track("scale", seg("all", 0, .4, 0, 100, "out"), seg("all", .6, 1, 100, 140, "in")), track("opacity", seg("all", .6, 1, 100, 0, "linear"))] }] }),
  oneshot("shape", { id: "triangle-pop", name: text("Triângulo saltitante", "Popping triangle"), description: text("Triângulo que salta e gira.", "A triangle that pops and turns."), sound: "bubble", frames: 20, colors: palette(VIOLET),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: polygon(3, 90), closed: true },
      tracks: [...popIn(0, .45, .6), track("rotation", seg("all", 0, 1, -60, 60, "in-out"))] }] }),
  oneshot("shape", { id: "hexagon-outline", name: text("Hexágono", "Hexagon"), description: text("Hexágono que se desenha e se apaga.", "A hexagon that draws and erases itself."), sound: "tick", colors: palette(LIME),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], stroke: 8, geometry: { shape: "path", points: [...polygon(6, 100, -90), polygon(6, 100, -90)[0]!], closed: false },
      tracks: [...drawOnce([0, .5], [.45, 1]), track("rotation", seg("all", 0, 1, -30, 30, "in-out"))] }] }),
  oneshot("shape", { id: "speed-lines", name: text("Linhas de velocidade", "Speed lines"), description: text("Traços horizontais que cortam a tela.", "Horizontal streaks that cut across the screen."), sound: "swish", frames: 18, colors: palette(WHITE, CYAN),
    layers: [
      { type: "shape", id: "streak", color: "primary", position: [0, -40], stroke: 8, geometry: { shape: "path", points: [[-320, 0], [320, 0]], closed: false }, tracks: drawOnce([0, .5], [.25, .8]) },
      { type: "shape", id: "streak2", color: "accent", position: [60, 10], stroke: 5, geometry: { shape: "path", points: [[-260, 0], [260, 0]], closed: false }, tracks: drawOnce([.1, .6], [.35, .9]) },
      { type: "shape", id: "streak3", color: "primary", position: [-40, 55], stroke: 4, geometry: { shape: "path", points: [[-200, 0], [200, 0]], closed: false }, tracks: drawOnce([.2, .7], [.45, 1]) }] }),
  oneshot("shape", { id: "plus-burst", name: text("Mais e mais", "Plus burst"), description: text("Uma cruz que gira e se abre em quatro traços.", "A cross that spins and opens into four strokes."), sound: "blip", frames: 20, colors: palette(GOLD),
    layers: [ray("rays", "primary", 20, 80, 4, 14, 0, [0, .4], [.35, .9])] }),
  oneshot("shape", { id: "zigzag-bolt", name: text("Raio elétrico", "Lightning bolt"), description: text("Um raio em zigue-zague que pisca.", "A zigzag bolt that flashes."), sound: "glitch", frames: 16, colors: palette(GOLD, WHITE),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: [[20, -120], [-50, 10], [0, 10], [-20, 120], [50, -10], [0, -10]], closed: true },
      tracks: [track("scale", seg("all", 0, .3, 0, 110, "back"), seg("all", .7, 1, 110, 0, "in")), track("opacity", seg("all", .3, .45, 100, 40, "linear"), seg("all", .45, .6, 40, 100, "linear"))] }] }),
  lasting("shape", { id: "loader-spin", name: text("Carregando", "Loading spinner"), description: text("Arco que gira como indicador de espera.", "An arc that turns like a waiting indicator."), sound: "tick", colors: palette(WHITE, CYAN),
    layers: [
      { type: "shape", id: "track", color: "primary", position: [0, 0], stroke: 10, geometry: { shape: "ellipse", size: [140, 140] }, tracks: [inOut("opacity", 0, 30, 0)] },
      { type: "shape", id: "ring", color: "accent", position: [0, 0], stroke: 10, geometry: { shape: "ellipse", size: [140, 140] },
        tracks: [track("trimEnd", seg("in", 0, 1, 0, 30, "out"), seg("out", 0, 1, 30, 0, "in")), inOut("rotation", -180, 0, 180, [0, 1], [0, 1], ["out", "in"])] }] }),
  lasting("shape", { id: "progress-bar", name: text("Barra de progresso", "Progress bar"), description: text("Trilho com barra que enche até o fim.", "A track whose bar fills to the end."), sound: "slide-up", frames: 30, colors: palette([.25, .25, .3], LIME),
    layers: [
      { type: "shape", id: "track", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [600, 24], roundness: 12 }, tracks: [inOut("scaleX", 0, 100, 0, [0, .3], [.7, 1])] },
      { type: "shape", id: "bar", color: "accent", position: [-300, 0], geometry: { shape: "rect", size: [600, 24], offset: [300, 0], roundness: 12 }, tracks: [inOut("scaleX", 0, 100, 0, [.2, 1], [0, .6], ["in-out", "in"])] }] }),
  lasting("shape", { id: "cross-mark", name: text("Marca de erro", "Cross mark"), description: text("Círculo com um X desenhado.", "A circle with a drawn X."), sound: "thud", frames: 18, colors: palette(CORAL, WHITE),
    layers: [
      { type: "shape", id: "disc", color: "primary", position: [0, 0], geometry: { shape: "ellipse", size: [180, 180] }, tracks: [inOut("scale", 0, 100, 0, [0, .6], [.3, 1], ["back", "in"])] },
      { type: "shape", id: "tick", color: "accent", position: [0, 0], stroke: 16, geometry: { shape: "path", points: [[-36, -36], [36, 36]], closed: false }, tracks: drawInOut([.35, .75], [0, .5]) },
      { type: "shape", id: "tick2", color: "accent", position: [0, 0], stroke: 16, geometry: { shape: "path", points: [[36, -36], [-36, 36]], closed: false }, tracks: drawInOut([.55, .95], [0, .5]) }] }),
  lasting("shape", { id: "alert-mark", name: text("Atenção", "Alert"), description: text("Triângulo de aviso com exclamação.", "A warning triangle with an exclamation mark."), sound: "beep-double", frames: 18, colors: palette(GOLD, INK),
    layers: [
      { type: "shape", id: "shape", color: "primary", position: [0, 10], geometry: { shape: "path", points: polygon(3, 120), closed: true }, tracks: [inOut("scale", 0, 100, 0, [0, .6], [.3, 1], ["back", "in"])] },
      { type: "shape", id: "tick", color: "accent", position: [0, 0], stroke: 16, geometry: { shape: "path", points: [[0, -30], [0, 20]], closed: false }, tracks: drawInOut([.4, .8], [0, .5]) },
      { type: "shape", id: "dot", color: "accent", position: [0, 50], geometry: { shape: "ellipse", size: [18, 18] }, tracks: [inOut("scale", 0, 100, 0, [.6, 1], [0, .4], ["back", "in"])] }] }),
  lasting("shape", { id: "focus-corners", name: text("Cantos de foco", "Focus corners"), description: text("Quatro cantos que fecham sobre um ponto.", "Four corners that close in on a spot."), sound: "beep", frames: 16, colors: palette(WHITE),
    layers: [{ type: "shape", id: "bracket", color: "primary", position: [0, 0], stroke: 8, geometry: { shape: "path", points: [[-120, -60], [-120, -120], [-60, -120]], closed: false },
      repeater: { copies: 4, rotation: 90 }, tracks: [...drawInOut([0, .6], [.4, 1]), inOut("scale", 150, 100, 150, [0, .8], [0, 1])] }] }),
  lasting("shape", { id: "heart-pop", name: text("Coração saltitante", "Popping heart"), description: text("Coração que salta e pulsa uma vez.", "A heart that pops and beats once."), sound: "bubble", frames: 18, colors: palette(CORAL),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: heart(110), closed: true }, tracks: [inOut("scale", 0, 100, 0, [0, .7], [.3, 1], ["back", "in"])] }] }),
  lasting("shape", { id: "star-outline", name: text("Estrela desenhada", "Drawn star"), description: text("Estrela de cinco pontas traçada em uma linha.", "A five-point star traced in one line."), sound: "whoosh", frames: 22, colors: palette(GOLD),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], stroke: 8, geometry: { shape: "path", points: [0, 2, 4, 1, 3, 0].map(i => polygon(5, 120)[i]!), closed: false }, tracks: drawInOut([0, .9], [0, .8]) }] }),
  lasting("shape", { id: "arrow-bounce", name: text("Seta indicadora", "Pointer arrow"), description: text("Seta cheia que aponta para baixo e balança.", "A solid arrow that points down and bobs."), sound: "blip", frames: 18, colors: palette(WHITE),
    layers: [{ type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: [[-26, -90], [26, -90], [26, 0], [64, 0], [0, 80], [-64, 0], [-26, 0]], closed: true },
      tracks: [inOut("y", -160, 0, 120, [0, .8], [0, 1], ["back", "in"]), inOut("opacity", 0, 100, 0, [0, .4], [.5, 1])] }] })
];

// ---- Tracos a mao -----------------------------------------------------------

const scribble = (id: string, name: ElementLocalizedText, description: ElementLocalizedText, points: Array<readonly [number, number]>, colors: MotionElement["defaults"]["colors"], stroke = 10, frames = 20, sound: MotionElement["sound"] = "slide-up"): MotionElement =>
  lasting("drawn", { id, name, description, sound, frames, colors,
    layers: [{ type: "shape", id: "stroke", color: "primary", position: [0, 0], stroke, geometry: { shape: "path", points, closed: false }, tracks: drawInOut([0, 1], [0, 1]) }] });

const DRAWN: readonly MotionElement[] = [
  scribble("drawn-circle-loose", text("Círculo solto", "Loose circle"), text("Volta à mão que passa do ponto de partida.", "A hand-drawn loop that overshoots its start."), wobblyLoop(240, 120, .06, 1.3), palette(CORAL), 9, 22),
  scribble("drawn-circle-double", text("Círculo duplo", "Double loop"), text("Duas voltas rabiscadas em torno de algo.", "Two scribbled loops around something."), wobblyLoop(220, 110, .08, 2.1, 2, 70), palette(GOLD), 7, 26),
  scribble("drawn-oval-tall", text("Oval em pé", "Tall oval"), text("Contorno vertical para marcar uma pessoa ou objeto.", "A vertical outline to mark a person or object."), wobblyLoop(120, 220, .05, 3.7), palette(LIME), 9, 22),
  scribble("drawn-underline-wave", text("Sublinhado ondulado", "Wavy underline"), text("Linha em ondas sob uma palavra.", "A wavy line under a word."), sampled(36, u => [-240 + 480 * u, 14 * Math.sin(u * 6 * Math.PI)]), palette(CYAN), 9, 18),
  scribble("drawn-underline-double", text("Sublinhado duplo", "Double underline"), text("Dois traços de ida e volta sob o texto.", "Two back-and-forth strokes under the text."), [[-230, 0], [-60, -6], [120, 2], [230, -4], [200, 12], [40, 18], [-150, 14], [-220, 20]], palette(GOLD), 9, 20),
  scribble("drawn-zigzag", text("Zigue-zague", "Zigzag"), text("Traço em zigue-zague para dar energia.", "A zigzag stroke for energy."), sampled(12, u => [-240 + 480 * u, (Math.round(u * 12) % 2 ? -1 : 1) * 30]), palette(VIOLET), 10, 16, "swish"),
  scribble("drawn-spiral", text("Espiral", "Spiral"), text("Espiral que se enrola de fora para dentro.", "A spiral that winds from outside in."), sampled(80, u => { const a = u * 6 * Math.PI, r = 150 * (1 - u * .85); return [Math.cos(a) * r, Math.sin(a) * r]; }), palette(CYAN), 7, 30, "reverse-swell"),
  scribble("drawn-cross-out", text("Riscado", "Cross-out"), text("Rabisco que risca uma palavra de ponta a ponta.", "A scribble that strikes a word end to end."), sampled(24, u => [-230 + 460 * u, (u * 24 % 2 < 1 ? -1 : 1) * 16 + (u - .5) * 20]), palette(CORAL), 8, 14, "slide-down"),
  scribble("drawn-arrow-curve", text("Seta curva", "Curved arrow"), text("Seta em arco desenhada à mão.", "A hand-drawn arcing arrow."), [...sampled(24, u => [-200 + 360 * u, -120 * Math.sin(u * Math.PI)]), [160, 0], [130, -40], [160, 0], [118, 22]], palette(WHITE), 9, 22, "whoosh"),
  scribble("drawn-arrow-loop", text("Seta com laço", "Looped arrow"), text("Seta que dá uma volta antes de apontar.", "An arrow that loops once before pointing."), [...sampled(40, u => { const a = u * 2 * Math.PI; return [-200 + 360 * u + 60 * Math.sin(a), 60 * Math.cos(a) - 60]; }), [160, 0], [126, -32], [160, 0], [120, 18]], palette(GOLD), 8, 26, "whoosh"),
  scribble("drawn-check-loose", text("Certo rabiscado", "Scribbled check"), text("Sinal de certo traçado rápido.", "A quickly traced check mark."), [[-90, 0], [-60, 20], [-30, 60], [10, 0], [60, -60], [110, -110]], palette(LIME), 14, 14, "tick"),
  scribble("drawn-x-loose", text("X rabiscado", "Scribbled X"), text("Um X feito com um traço só.", "An X made with a single stroke."), [[-80, -80], [80, 80], [80, 40], [-80, 80], [-60, 60], [80, -80]], palette(CORAL), 12, 16, "tick"),
  scribble("drawn-star-doodle", text("Estrela rabiscada", "Doodled star"), text("Estrela desenhada sem tirar a caneta.", "A star drawn without lifting the pen."), [...[0, 2, 4, 1, 3, 0].map(i => polygon(5, 110)[i]!), [10, -100]], palette(GOLD), 8, 20),
  scribble("drawn-heart-doodle", text("Coração rabiscado", "Doodled heart"), text("Contorno de coração com tremor de mão.", "A heart outline with a hand tremor."), [...heart(100), heart(100)[0]!, [6, -60]], palette(CORAL), 8, 22),
  scribble("drawn-bracket", text("Chave lateral", "Side brace"), text("Chave desenhada para agrupar itens.", "A drawn brace to group items."), [[30, -160], [0, -150], [0, -20], [-24, 0], [0, 20], [0, 150], [30, 160]], palette(WHITE), 8, 18, "tick"),
  scribble("drawn-box", text("Caixa rabiscada", "Scribbled box"), text("Retângulo à mão que fecha com sobra.", "A hand-drawn rectangle that closes with an overlap."), [[-230, -100], [236, -108], [228, 104], [-226, 98], [-238, -116]], palette(CYAN), 8, 22),
  scribble("drawn-cloud", text("Balão de pensamento", "Thought cloud"), text("Nuvem ondulada para um pensamento.", "A wavy cloud for a thought."), sampled(90, u => { const a = u * 2 * Math.PI, r = 1 + .12 * Math.abs(Math.sin(a * 5)); return [Math.cos(a) * 220 * r, Math.sin(a) * 120 * r]; }), palette(WHITE), 7, 26, "drone-air"),
  scribble("drawn-sun", text("Sol rabiscado", "Doodled sun"), text("Círculo com raios curtos, traço contínuo.", "A circle with short rays in one stroke."), sampled(96, u => { const a = u * 2 * Math.PI, r = 90 + (Math.floor(u * 96) % 8 < 2 ? 50 : 0); return [Math.cos(a) * r, Math.sin(a) * r]; }), palette(GOLD), 6, 28, "rise"),
  scribble("drawn-crown", text("Coroa", "Crown"), text("Coroa de três pontas traçada à mão.", "A three-point crown traced by hand."), [[-120, 60], [-130, -60], [-60, 0], [0, -90], [60, 0], [130, -60], [120, 60], [-120, 60]], palette(GOLD), 9, 22, "glass-clink"),
  scribble("drawn-exclaim", text("Exclamações", "Exclamations"), text("Tracinhos de surpresa em leque.", "Surprise marks fanning out."), [[-60, -40], [-110, -120], [-60, -40], [0, -60], [0, -150], [0, -60], [60, -40], [110, -120]], palette(WHITE), 10, 14, "pop"),
  scribble("drawn-swoosh-line", text("Traço de efeito", "Swoosh stroke"), text("Pincelada curva que corta a tela.", "A curved brush stroke across the screen."), sampled(30, u => [-300 + 600 * u, 80 * Math.sin(u * Math.PI) - 40 * u]), palette(VIOLET), 14, 16, "swoosh-deep"),
  scribble("drawn-infinity", text("Infinito", "Infinity"), text("Laço em oito que se desenha sem parar.", "A figure-eight loop that draws continuously."), sampled(70, u => { const a = u * 2 * Math.PI; return [200 * Math.sin(a), 90 * Math.sin(2 * a)]; }), palette(CYAN), 8, 30),
  scribble("drawn-highlight-scrub", text("Rabisco de destaque", "Highlight scrub"), text("Vai e vem largo para pintar um destaque.", "A wide back-and-forth to paint a highlight."), sampled(10, u => [(Math.round(u * 10) % 2 ? 220 : -220) + 10 * u, -40 + 80 * u]), palette(GOLD), 26, 18, "slide-up")
];

// ---- Redes sociais -----------------------------------------------------------

const button = (id: string, name: ElementLocalizedText, label: ElementLocalizedText, fill: ElementRgb, ink: ElementRgb, sound: MotionElement["sound"]): MotionElement =>
  lasting("social", { id, name, description: text("Botão em cápsula que salta e recebe um clique.", "A capsule button that pops in and gets clicked."), sound, frames: 18, colors: palette(fill, WHITE, ink), texts: { title: label },
    layers: [
      { type: "shape", id: "pill", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [260, 90], roundness: 999, fit: { layer: "title", pad: [56, 22, 56, 22], axis: "both" } },
        tracks: [inOut("scale", 0, 100, 0, [0, .6], [.4, 1], ["back", "in"])] },
      textLayer({ position: [0, 0], align: "center", size: 46, tracks: [inOut("opacity", 0, 100, 0, [.3, .7], [0, .4])] }),
      { type: "shape", id: "cursor", color: "accent", position: [40, 30], geometry: { shape: "path", points: [[0, 0], [0, 64], [16, 50], [28, 76], [38, 72], [26, 46], [46, 46]], closed: true },
        tracks: [inOut("x", 160, 0, 160, [.4, 1], [0, .6], ["out", "in"]), inOut("y", 120, 0, 120, [.4, 1], [0, .6], ["out", "in"]), inOut("opacity", 0, 100, 0, [.4, .7], [.3, .6], ["linear", "linear"])] }] });

const SOCIAL: readonly MotionElement[] = [
  button("social-subscribe-red", text("Botão inscrever vermelho", "Red subscribe button"), text("INSCREVER-SE", "SUBSCRIBE"), [.86, .1, .12], WHITE, "click"),
  button("social-subscribe-dark", text("Botão inscrever escuro", "Dark subscribe button"), text("INSCREVER-SE", "SUBSCRIBE"), [.12, .12, .14], WHITE, "click"),
  button("social-follow-blue", text("Botão seguir", "Follow button"), text("SEGUIR", "FOLLOW"), [.1, .46, .95], WHITE, "click"),
  button("social-follow-light", text("Botão seguir claro", "Light follow button"), text("+ SEGUIR", "+ FOLLOW"), WHITE, INK, "click"),
  button("social-link-bio", text("Link na bio", "Link in bio"), text("LINK NA BIO", "LINK IN BIO"), [.62, .3, .95], WHITE, "pop"),
  button("social-shop", text("Botão comprar", "Shop button"), text("COMPRAR AGORA", "SHOP NOW"), [.13, .7, .4], WHITE, "click"),
  lasting("social", { id: "social-like", name: text("Curtida", "Like"), description: text("Coração que enche e solta um anel.", "A heart that fills up and releases a ring."), sound: "bubble", frames: 18, colors: palette(CORAL, WHITE),
    layers: [
      { type: "shape", id: "ring", color: "primary", position: [0, 0], stroke: 6, geometry: { shape: "ellipse", size: [220, 220] }, tracks: [inOut("scale", 0, 100, 140, [0, .6], [0, 1]), inOut("opacity", 100, 0, 0, [.3, .8], [0, .2], ["linear", "linear"])] },
      { type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: heart(90), closed: true }, tracks: [inOut("scale", 0, 100, 0, [.1, .8], [.3, 1], ["back", "in"])] }] }),
  lasting("social", { id: "social-comment", name: text("Balão de comentário", "Comment bubble"), description: text("Balão de fala com três pontos digitando.", "A speech bubble with three typing dots."), sound: "pop", frames: 18, colors: palette(WHITE, [.45, .45, .5]),
    layers: [
      { type: "shape", id: "card", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [220, 120], roundness: 40 }, tracks: [inOut("scale", 0, 100, 0, [0, .6], [.4, 1], ["back", "in"])] },
      { type: "shape", id: "tail", color: "primary", position: [-60, 56], geometry: { shape: "path", points: [[-10, 0], [30, 0], [-30, 40]], closed: true }, tracks: [inOut("scale", 0, 100, 0, [.2, .6], [.3, .8], ["back", "in"])] },
      { type: "shape", id: "dots", color: "accent", position: [-50, 0], geometry: { shape: "ellipse", size: [22, 22] }, tracks: [inOut("scale", 0, 100, 0, [.4, .8], [0, .4], ["back", "in"])] },
      { type: "shape", id: "dot", color: "accent", position: [0, 0], geometry: { shape: "ellipse", size: [22, 22] }, tracks: [inOut("scale", 0, 100, 0, [.5, .9], [0, .4], ["back", "in"])] },
      { type: "shape", id: "glint", color: "accent", position: [50, 0], geometry: { shape: "ellipse", size: [22, 22] }, tracks: [inOut("scale", 0, 100, 0, [.6, 1], [0, .4], ["back", "in"])] }] }),
  lasting("social", { id: "social-bell", name: text("Sininho", "Notification bell"), description: text("Sino que balança com um ponto de aviso.", "A bell that swings with a notice dot."), sound: "glass-clink", frames: 20, colors: palette(WHITE, CORAL),
    layers: [
      { type: "shape", id: "shape", color: "primary", position: [0, 0], geometry: { shape: "path", points: [[0, -90], [40, -70], [55, -20], [60, 40], [80, 60], [-80, 60], [-60, 40], [-55, -20], [-40, -70]], closed: true },
        tracks: [inOut("scale", 0, 100, 0, [0, .5], [.4, 1], ["back", "in"]), inOut("rotation", -25, 0, 20, [0, 1], [0, .8], ["back", "in"])] },
      { type: "shape", id: "disc", color: "primary", position: [0, 80], geometry: { shape: "ellipse", size: [40, 40] }, tracks: [inOut("scale", 0, 100, 0, [.2, .6], [.3, .8], ["back", "in"])] },
      { type: "shape", id: "dot", color: "accent", position: [55, -70], geometry: { shape: "ellipse", size: [44, 44] }, tracks: [inOut("scale", 0, 100, 0, [.6, 1], [0, .4], ["back", "in"])] }] }),
  lasting("social", { id: "social-share", name: text("Compartilhar", "Share"), description: text("Três nós ligados que se conectam.", "Three linked nodes that connect."), sound: "blip", frames: 20, colors: palette(WHITE),
    layers: [
      { type: "shape", id: "stroke", color: "primary", position: [0, 0], stroke: 10, geometry: { shape: "path", points: [[70, -70], [-60, 0], [70, 70]], closed: false }, tracks: drawInOut([.2, .8], [0, .6]) },
      { type: "shape", id: "dot", color: "primary", position: [-60, 0], geometry: { shape: "ellipse", size: [56, 56] }, tracks: [inOut("scale", 0, 100, 0, [0, .4], [.5, 1], ["back", "in"])] },
      { type: "shape", id: "disc", color: "primary", position: [70, -70], geometry: { shape: "ellipse", size: [56, 56] }, tracks: [inOut("scale", 0, 100, 0, [.3, .7], [.3, .8], ["back", "in"])] },
      { type: "shape", id: "glint", color: "primary", position: [70, 70], geometry: { shape: "ellipse", size: [56, 56] }, tracks: [inOut("scale", 0, 100, 0, [.5, .9], [.2, .7], ["back", "in"])] }] }),
  lasting("social", { id: "social-swipe-up", name: text("Arraste para cima", "Swipe up"), description: text("Setas em cascata que convidam a arrastar.", "Cascading chevrons that invite a swipe."), sound: "slide-up", frames: 20, colors: palette(WHITE, WHITE), texts: { title: text("ARRASTE PARA CIMA", "SWIPE UP") },
    layers: [
      { type: "shape", id: "head", color: "primary", position: [0, -60], stroke: 10, geometry: { shape: "path", points: [[-40, 20], [0, -20], [40, 20]], closed: false }, tracks: [...drawInOut([0, .5], [.5, 1]), inOut("y", 40, 0, -40, [0, .6], [.3, 1])] },
      { type: "shape", id: "shaft", color: "primary", position: [0, -20], stroke: 10, geometry: { shape: "path", points: [[-40, 20], [0, -20], [40, 20]], closed: false }, tracks: [...drawInOut([.2, .7], [.3, .9]), inOut("y", 40, 0, -40, [.2, .8], [.1, .8])] },
      textLayer({ position: [0, 60], align: "center", size: 34, tracks: [inOut("opacity", 0, 100, 0, [.4, .9], [0, .4]), track("y", seg("in", .4, 1, 20, 0, "out"))] })] }),
  lasting("social", { id: "social-handle", name: text("Arroba do perfil", "Profile handle"), description: text("Etiqueta com o seu @ e um ponto de cor.", "A tag with your @ and a color dot."), sound: "pop", frames: 18, colors: palette(WHITE, [.1, .46, .95], INK), texts: { title: text("@seuperfil", "@yourhandle") },
    layers: [
      { type: "shape", id: "pill", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [200, 70], roundness: 999, fit: { layer: "title", pad: [64, 16, 28, 16], axis: "both" } }, tracks: [inOut("scaleX", 0, 100, 0, [0, .55], [.35, 1], ["back", "in"])] },
      { type: "shape", id: "dot", color: "accent", position: [32, 0], geometry: { shape: "ellipse", size: [32, 32] }, tracks: [inOut("scale", 0, 100, 0, [.3, .7], [0, .4], ["back", "in"])] },
      textLayer({ position: [64, 0], size: 36, tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .35])] })] , origin: [.08, .85] }),
  lasting("social", { id: "social-live", name: text("Ao vivo", "Live badge"), description: text("Selo de transmissão com ponto que pisca.", "A broadcast badge with a blinking dot."), sound: "beep", frames: 14, colors: palette([.86, .1, .12], WHITE), texts: { title: text("AO VIVO", "LIVE") },
    layers: [
      { type: "shape", id: "box", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [160, 60], roundness: 8, fit: { layer: "title", pad: [52, 12, 20, 12], axis: "both" } }, tracks: [inOut("scaleX", 0, 100, 0, [0, .6], [.4, 1])] },
      { type: "shape", id: "dot", color: "accent", position: [26, 0], geometry: { shape: "ellipse", size: [18, 18] }, tracks: [inOut("opacity", 0, 100, 0, [.4, .6], [.4, .6], ["linear", "linear"])] },
      textLayer({ position: [52, 0], size: 32, tracks: [inOut("opacity", 0, 100, 0, [.35, .8], [0, .35])] })], origin: [.08, .1] }),
  lasting("social", { id: "social-badge-count", name: text("Contador de avisos", "Notice badge"), description: text("Bolinha vermelha com número que salta.", "A red dot with a number that pops."), sound: "blip", frames: 14, colors: palette([.9, .15, .2], WHITE, WHITE), texts: { title: text("3", "3") },
    layers: [
      { type: "shape", id: "disc", color: "primary", position: [0, 0], geometry: { shape: "rect", size: [90, 90], roundness: 999, fit: { layer: "title", pad: [24, 14, 24, 14], axis: "both" } }, tracks: [inOut("scale", 0, 100, 0, [0, .7], [.3, 1], ["back", "in"])] },
      textLayer({ position: [0, 0], align: "center", size: 52, tracks: [inOut("scale", 0, 100, 0, [.2, .9], [0, .6], ["back", "in"])] })] }),
  lasting("social", { id: "social-play", name: text("Botão play", "Play button"), description: text("Círculo com triângulo de reproduzir.", "A circle with a play triangle."), sound: "click", frames: 16, colors: palette(WHITE, INK),
    layers: [
      { type: "shape", id: "disc", color: "primary", position: [0, 0], geometry: { shape: "ellipse", size: [200, 200] }, tracks: [inOut("scale", 0, 100, 0, [0, .6], [.4, 1], ["back", "in"])] },
      { type: "shape", id: "shape", color: "accent", position: [8, 0], geometry: { shape: "path", points: polygon(3, 50, 0), closed: true }, tracks: [inOut("scale", 0, 100, 0, [.3, .9], [0, .5], ["back", "in"])] }] })
];

export const ELEMENT_GRAPHIC_RECIPES: readonly MotionElement[] = [...SHAPES, ...DRAWN, ...SOCIAL];

export const ELEMENT_GRAPHIC_LAYER_NAMES: Readonly<Record<string, ElementLocalizedText>> = {
  halo: text("Halo", "Halo"), twinkle: text("Cintilação", "Twinkle"), dots: text("Pontos", "Dots"), flakes: text("Confetes", "Flakes"),
  shape: text("Forma", "Shape"), streak: text("Rastro", "Streak"), streak2: text("Rastro 2", "Streak 2"), streak3: text("Rastro 3", "Streak 3"),
  track: text("Trilho", "Track"), tick2: text("Traço 2", "Stroke 2"), cursor: text("Cursor", "Cursor"), tail: text("Ponta do balão", "Bubble tail")
};
