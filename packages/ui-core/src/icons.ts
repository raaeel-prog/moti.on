/** Original Moti.on vector catalog. Presentation only; no host or global DOM. */
const SVG_NS = "http://www.w3.org/2000/svg";
export type IconFamily = "neutral" | "keyframes" | "layers" | "animation" | "spatial" | "shapes" | "effects" | "project";
export type IconGesture = "none" | "reveal" | "align" | "swap" | "oscillate" | "orbit" | "trace";
const ICON_PATHS = {
  close: "M4 4l10 10M14 4L4 14",
  back: "M8 4L3 9l5 5M3 9h12",
  wordReveal: "M2 10h5v5H2zM10 10h6v5h-6zM3 3h3M4.5 3v4M11 3h4M13 3v4",
  variableMorph: "M2 14l4-10 4 10M3.5 10h5M12 4v10M15 4v10M11 9h5",
  styleSwap: "M2 4h8M6 4v7M10 7h6M13 7v8M2 14h6l-2-2M8 14l-2 2",
  verticalPulse: "M4 3h10M9 3v11M6 14h6M3 8c1-2 2-2 3 0s2 2 3 0 2-2 3 0 2 2 3 0",
  search: "M12 7.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0M11 11l4 4",
  favorite: "M9 2l2 4.3 4.7.6-3.4 3.3.8 4.8L9 12.8 4.9 15l.8-4.8L2.3 7l4.7-.7z",
  more: "M4 8.5h.1M9 8.5h.1M14 8.5h.1",
  presets: "M3 3h12v12H3zM7 6l5 3-5 3z",
  home: "M9 1.5L1.5 8h2v7.5h4v-5h3v5h4V8h2z", // Solid filled home with clean cuts
  context: "M2.5 3.5h13v3h-13zM2.5 8.5h5.5v6h-5.5zM9.5 8.5h6v6h-6z", // Blocky premium blocks
  tools: "M2 3h5v5H2zM11 3h5v5h-5zM2 10h5v5H2zM11 10h5v5h-5z", // Perfect grid with strong lines
  loopOut: "M5.5 3a2.5 2.5 0 0 0 0 5h7a2.5 2.5 0 0 1 0 5h-7M7 10.5L4.5 13L7 15.5M11 2.5L13.5 5L11 7.5", // Smooth infinite loop
  smooth: "M1.5 12.5C4 12.5 5 5.5 9 5.5S14 12.5 16.5 12.5", // Elegant bezier
  wiggle: "M2 9l3-5.5l3 10l4-9l4 4.5", // Sharp peak wiggle
  flicker: "M9 1L4 9h4l-1 7l7-9H9z", // Clean electric bolt
  textBox: "M2 4h14v10H2zM5 8h8M5 11h5", // Solid input box
  parent: "M7 2h4v3H7zM9 5v3M3 8h12M3 8v3M15 8v3M1 11h4v4H1zM13 11h4v4h-4z", // Thick node tree
  createNull: "M5 5h8v8H5zM9 1v4M9 13v4M1 9h4M13 9h4", // Crosshair target
  flip: "M9 2.5v13M3 5.5h3.5v7H3zM15 5.5h-3.5v7H15z",
  rename: "M3 5.5h7M3 9h9M3 12.5h5M12 3.5l2.5 2.5-5 5-2.5.5.5-2.5z",
  reverseOrder: "M3.5 4.5h11M3.5 9h11M3.5 13.5h11M12 2.5l2 2-2 2M6 15.5l-2-2 2-2",
  cutKeys: "M9 2.5v13M5 6l-2.5 3 2.5 3M13 6l2.5 3-2.5 3",
  delay: "M2.5 5h4M2.5 9h7M2.5 13h10M13 3.5l2.5 2.5-2.5 2.5",
  anchor: "M9 3.5v11M3.5 9h11M9 6.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z",
  system: "M9 2.5l6 3.5v5l-6 3.5-6-3.5v-5zM6.5 8v2M11.5 8v2",
  diagnostics: "M3.5 4.5h11M3.5 9h11M3.5 13.5h7",
  settings: "M3 5h12M3 9h12M3 13h12M6 3.5v3M12 7.5v3M8 11.5v3",
  ease: "M3 13C6 13 8 5 15 5",
  reverseKeys: "M13.5 6.5l2.5-2.5-2.5-2.5M16 4H2.5M4.5 11.5L2 14l2.5 2.5M2 14h13.5",
  // Duas setas verticais de troca sobre uma linha de tempo fixa: os tempos
  // (o eixo horizontal) não se movem, só o que está em cada um deles.
  // Deliberadamente diferente do ícone de reverseKeys (que move posição) e do
  // de reverseOrder (setas laterais sobre linhas empilhadas).
  reverseValues: "M5 2v9M3.5 4L5 2l1.5 2M3.5 9L5 11l1.5-2M11 2v9M9.5 4L11 2l1.5 2M9.5 9L11 11l1.5-2M2 14h13.5",
  // Tres marcas de keyframe empurradas contra a barra da esquerda: o grupo
  // inteiro encostando na borda, que e literalmente o que o comando faz.
  sendToEdge: "M2 2v12M5 5.5l1.5 2.5L5 10.5 3.5 8zM9 5.5l1.5 2.5L9 10.5 7.5 8zM13 5.5l1.5 2.5L13 10.5 11.5 8zM4.5 8h9",
  // Tubo de neon: um traco fechado com o halo insinuado por dois arcos soltos.
  neon: "M5 11V6a3 3 0 0 1 6 0v5M2.5 4.5A6.5 6.5 0 0 1 2.5 11.5M13.5 4.5a6.5 6.5 0 0 1 0 7M6.5 13.5h3",
  // Barras de nivel de audio, alturas desiguais: e a forma que qualquer
  // editor reconhece como som.
  beat: "M3 9v2M6 6v8M9 2.5v13M12 6v8M15 9v2",
  cloneKeys: "M5.5 5.5v-3h10v10h-3M2.5 5.5h10v10h-10z",
  timeController: "M9 2.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13zM9 5.5v4l2.5 2.5",
  animateKinetic: "M2.5 9h5l2.5-4 5 7-2.5-3z",
  timeMarkerLoop: "M4.5 13.5v-9M13.5 13.5v-9M4.5 9h9l-2.5-2.5M13.5 9l-2.5 2.5",
  inertial: "M2.5 12c2 0 2-6 4-6s2 4.5 3.5 4.5S12.5 8 15.5 8",
  jump: "M2.5 14.5h13M4.5 12.5c1.5-7 7.5-7 9 0",
  copyKeys: "M6.5 2.5h7v9h-7zM4.5 5.5h-2v10h7v-2",
  pasteKeys: "M5.5 3.5h7v11h-7zM7.5 2h3v2.5h-3zM7 9.5h4M7 12h4",
  trimPath: "M2.5 9h4M11.5 9h4M7 6.5l2 2.5-2 2.5M9 9h2.5",
  shapeLibrary: "M2.5 2.5h7v7h-7zM12 9a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z",
  parallax: "M2 4.5h5v9h-5zM8 6h4v6h-4zM13 7.5h3v3h-3z",
  parallaxFull: "M2 4.5h5v9h-5zM8 6h4v6h-4zM13 7.5h3v3h-3zM2 16.5h14",
  // Estes dois convertem para vetor, então desenham a forma com os pontos de
  // ancoragem visíveis. Antes repetiam o ícone de Formas, e as três ferramentas
  // ficavam indistinguíveis no dock estreito, onde o rótulo some.
  aiToVector: "M9 5l5 8H4zM8 4h2v2H8zM3 12h2v2H3zM13 12h2v2h-2z",
  textToVector: "M5.5 5.5h7M9 5.5v7M4.5 4.5h2v2h-2zM11.5 4.5h2v2h-2zM8 11.5h2v2H8z",
  particles: "M3 3h2v2H3z M10 5h2v2H10z M6 10h2v2H6z M12 12h2v2H12z",
  texture: "M2 2h14v14H2zM6 2v14M12 2v14M2 6h14M2 12h14",
  clean: "M5 12l3 3 7-7",
  lookAt: "M2 9c3-4 11-4 14 0c-3 4-11 4-14 0zM9 7a2 2 0 1 1 0 4a2 2 0 1 1 0-4z",
  orbit: "M9 4.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9zM1.5 9c0-1.5 3.4-2.5 7.5-2.5s7.5 1 7.5 2.5-3.4 2.5-7.5 2.5-7.5-1-7.5-2.5z",
  breakShape: "M2.5 2.5h5v5h-5zM10.5 2.5h5v5h-5zM2.5 10.5h5v5h-5zM10.5 10.5h5v5h-5z",
  effector: "M9 9a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3zM9 3.5a7 7 0 1 1 0 14a7 7 0 1 1 0-14zM9 6.5a4 4 0 1 1 0 8a4 4 0 1 1 0-8z",
  cameraTransition: "M2.5 5.5h8v7h-8zM10.5 8l5-2.5v7l-5-2.5",
  cylinder: "M9 2.5c3.6 0 6.5 1 6.5 2.2s-2.9 2.3-6.5 2.3-6.5-1-6.5-2.3S5.4 2.5 9 2.5zM2.5 4.7v8.6c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2V4.7",
  cube: "M9 2l6.5 3.5v7L9 16l-6.5-3.5v-7zM9 2v14M2.5 5.5L9 9l6.5-3.5",
  gradient: "M2 3h14v12H2zM5 4v10M8 4v10M11 4v10M14 4v10",
  wave: "M2 9c2-4 4-4 6 0s4 4 6 0M2 12.5c2-4 4-4 6 0s4 4 6 0",
  tile: "M2.5 2.5h6v6h-6zM9.5 2.5h6v6h-6zM2.5 9.5h6v6h-6zM9.5 9.5h6v6h-6z",
  glitch: "M2.5 5h7M5 8h9M2 11h6M8 14h6M11.5 5h4",
  echo: "M3.5 5.5h4v7h-4zM8.5 6.5h3.5v5h-3.5zM13 7.5h2.5v3H13z",
  fastEdit: "M2.5 3.5h13v11h-13zM2.5 6.5h13M6 3.5v11M12 9l-2.5 2.5L12 14"
} as const;

/** Marcadores distintos para runtimes que nao implementam SVG inline. */
const ICON_FALLBACKS: Record<string, string> = {
  wordReveal: "[T]",
  variableMorph: "Aa~",
  styleSwap: "A>B",
  verticalPulse: "T↕",
  search: "⌕",
  presets: "▶", favorite: "☆", more: "…",
  home: "H",
  context: "C",
  tools: "T",
  loopOut: "L",
  smooth: "~",
  wiggle: "W",
  flicker: "F",
  textBox: "[]",
  parent: "Y",
  createNull: "+",
  flip: "><",
  rename: "Aa",
  reverseOrder: "⇅",
  cutKeys: "✂",
  delay: "≫",
  anchor: "⊕",
  system: "S",
  diagnostics: "!",
  settings: "⚙",
  ease: "∫",
  reverseKeys: "⇆",
  reverseValues: "⇕",
  sendToEdge: "⇤",
  neon: "✦",
  beat: "♪",
  cloneKeys: "⧉",
  timeController: "⏱",
  animateKinetic: "K",
  timeMarkerLoop: "M",
  inertial: "≈",
  jump: "^",
  copyKeys: "⎘",
  pasteKeys: "V",
  trimPath: "⌇",
  shapeLibrary: "◻",
  parallax: "▤",
  parallaxFull: "▥",
  aiToVector: "Ai",
  textToVector: "Tx",
  particles: "∴",
  texture: "▩",
  clean: "✓",
  lookAt: "◉",
  orbit: "◌",
  breakShape: "⊟",
  effector: "◎",
  cameraTransition: "▷",
  cylinder: "⌭",
  cube: "⬢",
  gradient: "◧",
  wave: "∿",
  tile: "⊞",
  glitch: "⌁",
  echo: "≡",
  fastEdit: "⌸"
};

export type IconId = keyof typeof ICON_PATHS;
export interface IconDefinition {
  readonly id: IconId;
  readonly family: IconFamily;
  readonly gesture: IconGesture;
  readonly base: string;
  readonly detail: string;
  readonly staticPath: string;
  readonly fallback: string;
}
const FAMILIES: Partial<Record<IconId, IconFamily>> = {
  cutKeys: "keyframes",
  delay: "keyframes",
  ease: "keyframes",
  reverseKeys: "keyframes",
  reverseValues: "keyframes",
  sendToEdge: "keyframes",
  cloneKeys: "keyframes",
  copyKeys: "keyframes",
  pasteKeys: "keyframes",
  timeController: "keyframes",
  timeMarkerLoop: "keyframes",
  rename: "layers",
  reverseOrder: "layers",
  anchor: "layers",
  flip: "layers",
  createNull: "layers",
  parent: "layers",
  fastEdit: "layers",
  loopOut: "animation",
  smooth: "animation",
  wiggle: "animation",
  flicker: "animation",
  animateKinetic: "animation",
  jump: "animation",
  inertial: "animation",
  lookAt: "spatial",
  orbit: "spatial",
  cylinder: "spatial",
  cube: "spatial",
  cameraTransition: "spatial",
  parallax: "spatial",
  parallaxFull: "spatial",
  breakShape: "shapes",
  shapeLibrary: "shapes",
  trimPath: "shapes",
  textBox: "shapes",
  wordReveal: "animation",
  variableMorph: "animation",
  styleSwap: "animation",
  verticalPulse: "effects",
  effector: "shapes",
  gradient: "effects",
  wave: "effects",
  tile: "effects",
  glitch: "effects",
  echo: "effects",
  particles: "effects",
  neon: "effects",
  beat: "animation",
  aiToVector: "project",
  textToVector: "project",
  texture: "project",
  clean: "project",
};
const GESTURES: Partial<Record<IconId, IconGesture>> = {
  wordReveal: "reveal", variableMorph: "swap", styleSwap: "swap", verticalPulse: "oscillate",
  loopOut: "orbit", wiggle: "oscillate", flicker: "reveal", smooth: "trace",
  anchor: "align", parent: "align", rename: "trace", reverseOrder: "swap", flip: "swap",
  reverseKeys: "swap", reverseValues: "swap", sendToEdge: "align", cutKeys: "align", delay: "align",
  cloneKeys: "reveal", copyKeys: "reveal", pasteKeys: "reveal", timeController: "orbit", timeMarkerLoop: "align",
  orbit: "orbit", lookAt: "align", cameraTransition: "align", parallax: "align", parallaxFull: "align",
  cylinder: "orbit", cube: "orbit", particles: "reveal", glitch: "swap", echo: "align", neon: "reveal",
  beat: "oscillate", jump: "oscillate", inertial: "oscillate", animateKinetic: "align", wave: "oscillate",
  breakShape: "align", trimPath: "trace", shapeLibrary: "reveal", effector: "orbit", textBox: "reveal",
  aiToVector: "reveal", textToVector: "reveal", texture: "reveal", tile: "reveal", clean: "trace", ease: "trace"
};
function describe(id: IconId): IconDefinition {
  const staticPath = ICON_PATHS[id];
  // Each independent subpath remains an exact part of the GM drawing. Animate
  // only the last meaningful segment; geometry is also the static rendition.
  const paths = staticPath.match(/M[^M]+/g) ?? [staticPath];
  const family = FAMILIES[id] ?? "neutral";
  const divided = family !== "neutral" && paths.length > 1;
  return Object.freeze({ id, family, gesture: GESTURES[id] ?? (family === "neutral" ? "none" : "reveal"),
    base: divided ? paths.slice(0, -1).join("") : "",
    detail: divided ? paths[paths.length - 1]! : staticPath,
    staticPath, fallback: ICON_FALLBACKS[id] ?? "?" });
}
export const ICON_CATALOG: Readonly<Record<IconId, IconDefinition>> = Object.freeze(
  Object.fromEntries((Object.keys(ICON_PATHS) as IconId[]).map(id => [id, describe(id)]))
) as Readonly<Record<IconId, IconDefinition>>;

export function createIcon(doc: Document, name: string): Element {
  const definition = ICON_CATALOG[name as IconId];
  function fallback(): HTMLElement {
    const node = doc.createElement("span");
    node.className = "ch-nav__glyph";
    node.textContent = definition?.fallback ?? "?";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-icon", name);
    node.setAttribute("data-icon-family", definition?.family ?? "neutral");
    return node;
  }
  if (!definition || typeof doc.createElementNS !== "function") return fallback();
  try {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ch-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("data-icon", name); svg.setAttribute("data-icon-family", definition.family);
    svg.setAttribute("data-icon-motion", definition.gesture);
    svg.setAttribute("data-motion", "icon-gesture");
    const geometry = doc.createElementNS(SVG_NS, "g");
    geometry.setAttribute("transform", "scale(1.3333333333)");
    geometry.setAttribute("stroke", "currentColor"); geometry.setAttribute("fill", "none");
    geometry.setAttribute("stroke-width", "1.5");
    geometry.setAttribute("stroke-linejoin", "round"); geometry.setAttribute("stroke-linecap", "round");
    for (const [part, path] of [["base", definition.base], ["detail", definition.detail]]) {
      if (!path) continue;
      const group = doc.createElementNS(SVG_NS, "g"); group.setAttribute("class", `ch-icon__${part}`);
      const shape = doc.createElementNS(SVG_NS, "path"); shape.setAttribute("d", path!);
      group.appendChild(shape); geometry.appendChild(group);
    }
    svg.appendChild(geometry);
    return svg;
  } catch { return fallback(); }
}
