/**
 * Ícones Lucide (24 viewBox, stroke 1.5) para cada ação rápida real.
 *
 * Tabela ação → ícone (nome Lucide, ou custom quando não há equivalente):
 *
 *   precompose          copy
 *   center              crosshair
 *   fit                 maximize-2
 *   freeze              snowflake
 *   mirror              flip-horizontal
 *   dash-stroke         dashed-line (custom; Lucide não tem traço tracejado)
 *   trim-to-keys        scissors
 *   pin-to-null         pin
 *   create-adjustment   contrast
 *   create-solid        square
 *   create-shape        rectangle-horizontal
 *   create-null         move
 *   create-camera       camera
 *   save-frame          image
 *   effect-hue          palette
 *   effect-fill         paint-bucket
 *   effect-tint         droplet
 *   effect-blur         blend
 *   effect-lumetri      sun
 *   effect-curves       spline
 *
 * Nenhum ícone se repete. Presentation only: no host, no global DOM.
 */
import type { QuickAction } from "./quick-actions.js";

const SVG_NS = "http://www.w3.org/2000/svg";

type QuickGesture = "rise" | "pop" | "dolly" | "spin" | "flip" | "slide" | "flash" | "turn"
  | "morph" | "tick" | "look" | "drop" | "bob" | "spread" | "draw";
type QuickFamily = "layers" | "project" | "effects";

interface LucideIcon {
  readonly name: string;
  readonly markup: string;
  readonly gesture: QuickGesture;
}

/**
 * Geometria oficial Lucide (0.460), 24 viewBox. `dash-stroke` é o único
 * desenho custom — uma linha tracejada entre duas sólidas, no mesmo traço.
 */
export const QUICK_ACTION_ICONS: Readonly<Record<QuickAction, LucideIcon>> = Object.freeze({
  precompose: {
    name: "copy",
    gesture: "rise",
    markup: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
  },
  center: {
    name: "crosshair",
    gesture: "pop",
    markup: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>'
  },
  fit: {
    name: "maximize-2",
    gesture: "dolly",
    markup: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>'
  },
  freeze: {
    name: "snowflake",
    gesture: "spin",
    markup: '<path d="m10 20-1.25-2.5-2.5 1.25"/><path d="m14 20 1.25-2.5 2.5 1.25"/><path d="M4 10 2.5 9 4 6.75"/><path d="m20 10 1.5-1-1.5-2.25"/><path d="m4 14-1.5 1 1.5 2.25"/><path d="m20 14 1.5 1-1.5 2.25"/><path d="m10 4-1.25 2.5L6.25 5.25"/><path d="m14 4 1.25 2.5 2.5-1.25"/><path d="M10 10 8.5 8.5"/><path d="m14 14 1.5 1.5"/><path d="m14 10 1.5-1.5"/><path d="m10 14-1.5 1.5"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="m2 12 4 0"/><path d="m18 12 4 0"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>'
  },
  mirror: {
    name: "flip-horizontal",
    gesture: "flip",
    markup: '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>'
  },
  "dash-stroke": {
    name: "dashed-line",
    gesture: "slide",
    markup: '<path d="M5 12h2"/><path d="M11 12h2"/><path d="M17 12h2"/><path d="M4 6h16"/><path d="M4 18h16"/>'
  },
  "trim-to-keys": {
    name: "scissors",
    gesture: "slide",
    markup: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 8.6 19 19"/><path d="M8.6 15.4 19 5"/>'
  },
  "pin-to-null": {
    name: "pin",
    gesture: "tick",
    markup: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1V4H8v2h1z"/>'
  },
  "create-adjustment": {
    name: "contrast",
    gesture: "turn",
    markup: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12z"/>'
  },
  "create-solid": {
    name: "square",
    gesture: "pop",
    markup: '<rect width="18" height="18" x="3" y="3" rx="2"/>'
  },
  "create-shape": {
    name: "rectangle-horizontal",
    gesture: "morph",
    markup: '<rect width="20" height="12" x="2" y="6" rx="2"/>'
  },
  "create-null": {
    name: "move",
    gesture: "tick",
    markup: '<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>'
  },
  "create-camera": {
    name: "camera",
    gesture: "look",
    markup: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>'
  },
  "save-frame": {
    name: "image",
    gesture: "flash",
    markup: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'
  },
  "effect-hue": {
    name: "palette",
    gesture: "spin",
    markup: '<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="13" r="2.5"/><circle cx="6" cy="11" r="2.5"/><circle cx="8.5" cy="18" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'
  },
  "effect-fill": {
    name: "paint-bucket",
    gesture: "drop",
    markup: '<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4"/>'
  },
  "effect-tint": {
    name: "droplet",
    gesture: "bob",
    markup: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>'
  },
  "effect-blur": {
    name: "blend",
    gesture: "spread",
    markup: '<circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/>'
  },
  "effect-lumetri": {
    name: "sun",
    gesture: "spin",
    markup: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
  },
  "effect-curves": {
    name: "spline",
    gesture: "draw",
    markup: '<circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>'
  }
});

/** Kept so existing imports of the drawings table still resolve to the Lucide set. */
export const QUICK_ACTION_DRAWINGS = QUICK_ACTION_ICONS;

/** Text fallbacks for runtimes without inline SVG. */
const FALLBACK: Readonly<Record<QuickAction, string>> = Object.freeze({
  "precompose": "⧉", "center": "⊕", "fit": "⤢", "freeze": "❄", "mirror": "⇋", "dash-stroke": "┄", "trim-to-keys": "⇤", "pin-to-null": "⌖",
  "create-adjustment": "◐", "create-solid": "■", "create-shape": "▭", "create-null": "□", "create-camera": "▷", "save-frame": "▣",
  "effect-hue": "◔", "effect-fill": "◆", "effect-tint": "●", "effect-blur": "◌", "effect-lumetri": "☼", "effect-curves": "∫"
});

export function quickActionFamily(action: QuickAction): QuickFamily {
  return action.startsWith("effect-") ? "effects" : action.startsWith("create-") || action === "save-frame" ? "project" : "layers";
}

const ATTR_RE = /([a-zA-Z_:][\w:.-]*)="([^"]*)"/g;
const TAG_RE = /<(path|circle|rect|line|polyline|polygon)([^>]*)\/>/g;

function appendLucideMarkup(doc: Document, parent: Element, markup: string): void {
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(markup))) {
    const node = doc.createElementNS(SVG_NS, match[1]!);
    ATTR_RE.lastIndex = 0;
    let attr: RegExpExecArray | null;
    const attrs = match[2] ?? "";
    while ((attr = ATTR_RE.exec(attrs))) node.setAttribute(attr[1]!, attr[2]!);
    parent.appendChild(node);
  }
}

/** Lucide stroke icon, 16 px, same class contract as ui-core createIcon. */
export function createQuickActionIcon(doc: Document, action: QuickAction): Element {
  const icon = QUICK_ACTION_ICONS[action];
  const family = quickActionFamily(action);
  const fallback = (): HTMLElement => {
    const node = doc.createElement("span");
    node.className = "ch-nav__glyph ch-quick-action__glyph";
    node.textContent = FALLBACK[action];
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-icon-family", family);
    return node;
  };
  if (typeof doc.createElementNS !== "function") return fallback();
  try {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ch-icon ch-quick-action__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("data-icon", `quick-${action}`);
    svg.setAttribute("data-lucide", icon.name);
    svg.setAttribute("data-icon-family", family);
    svg.setAttribute("data-icon-motion", icon.gesture);
    svg.setAttribute("data-motion", "icon-gesture");
    appendLucideMarkup(doc, svg, icon.markup);
    return svg;
  } catch { return fallback(); }
}
