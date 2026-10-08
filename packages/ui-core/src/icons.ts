/** Original Moti.on vector catalog. Presentation only; no host or global DOM. */
import { DUOTONE_DRAWINGS, duotoneStaticPath, type DuotoneDrawing, type DuotoneGesture, type DuotoneToolId } from "./icon-drawings.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export type IconFamily = "neutral" | "keyframes" | "layers" | "animation" | "spatial" | "shapes" | "effects" | "project";
/** Onyx Vivo (approved 2026-10-07): one gesture per tool; navigation glyphs do not move. */
export type IconGesture = "none" | DuotoneGesture;
/** Navigation and utility glyphs stay monoline; tool drawings live in icon-drawings.ts. */
const ICON_PATHS = {
  close: "M4 4l10 10M14 4L4 14",
  back: "M8 4L3 9l5 5M3 9h12",
  search: "M12 7.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0M11 11l4 4",
  favorite: "M9 2l2 4.3 4.7.6-3.4 3.3.8 4.8L9 12.8 4.9 15l.8-4.8L2.3 7l4.7-.7z",
  more: "M4 8.5h.1M9 8.5h.1M14 8.5h.1",
  presets: "M3 3h12v12H3zM7 6l5 3-5 3z",
  home: "M9 1.5L1.5 8h2v7.5h4v-5h3v5h4V8h2z",
  context: "M2.5 3.5h13v3h-13zM2.5 8.5h5.5v6h-5.5zM9.5 8.5h6v6h-6z",
  tools: "M2 3h5v5H2zM11 3h5v5h-5zM2 10h5v5H2zM11 10h5v5h-5z",
  system: "M9 2.5l6 3.5v5l-6 3.5-6-3.5v-5zM6.5 8v2M11.5 8v2",
  diagnostics: "M3.5 4.5h11M3.5 9h11M3.5 13.5h7",
  settings: "M3 5h12M3 9h12M3 13h12M6 3.5v3M12 7.5v3M8 11.5v3"
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

export type IconId = keyof typeof ICON_PATHS | DuotoneToolId;
export interface IconDefinition {
  readonly id: IconId;
  readonly family: IconFamily;
  readonly gesture: IconGesture;
  /** Soft family-colored area (duotone); empty for navigation glyphs. */
  readonly fill: string;
  readonly base: string;
  /** The family-colored part that carries the gesture. */
  readonly detail: string;
  /** Layer order fill + base + detail: the identity used by tests and fallbacks. */
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
function describe(id: IconId): IconDefinition {
  const family = FAMILIES[id] ?? "neutral";
  const fallback = ICON_FALLBACKS[id] ?? "?";
  const duotone = (DUOTONE_DRAWINGS as Record<string, DuotoneDrawing>)[id];
  if (duotone) {
    return Object.freeze({ id, family, gesture: duotone.gesture, fill: duotone.fill ?? "", base: duotone.base ?? "",
      detail: duotone.accent, staticPath: duotoneStaticPath(duotone), fallback });
  }
  const staticPath = ICON_PATHS[id as keyof typeof ICON_PATHS];
  return Object.freeze({ id, family, gesture: "none", fill: "", base: "", detail: staticPath, staticPath, fallback });
}
export const ICON_CATALOG: Readonly<Record<IconId, IconDefinition>> = Object.freeze(
  Object.fromEntries(([...Object.keys(ICON_PATHS), ...Object.keys(DUOTONE_DRAWINGS)] as IconId[]).map(id => [id, describe(id)]))
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
    for (const [part, path] of [["fill", definition.fill], ["base", definition.base], ["detail", definition.detail]] as const) {
      if (!path) continue;
      const group = doc.createElementNS(SVG_NS, "g"); group.setAttribute("class", `ch-icon__${part}`);
      const shape = doc.createElementNS(SVG_NS, "path"); shape.setAttribute("d", path);
      if (part === "fill") { shape.setAttribute("fill", "currentColor"); shape.setAttribute("stroke", "none"); }
      // The draw gesture animates stroke-dashoffset over a normalized length.
      if (part === "detail" && definition.gesture === "draw") shape.setAttribute("pathLength", "1");
      group.appendChild(shape); geometry.appendChild(group);
    }
    svg.appendChild(geometry);
    return svg;
  } catch { return fallback(); }
}
