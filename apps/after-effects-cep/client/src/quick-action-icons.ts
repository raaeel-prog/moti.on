/**
 * Original duotone drawings for the 18 Quick actions (Onyx Vivo icon language).
 *
 * Same contract as the shared tool catalog (ui-core icons.ts): an 18-unit grid
 * scaled into the 24 view box, three layers (`fill` soft family area, `base`
 * neutral structure, `accent` the meaningful part) and one gesture from the
 * shared catalog that plays once per hover/focus through `data-motion="icon-gesture"`.
 * Kept beside the Quick actions instead of in the tool catalog because these are
 * host shortcuts, not library tools. Presentation only: no host, no global DOM.
 */
import type { QuickAction } from "./quick-actions.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Gestures that already exist in packages/ui-motion/src/motion.css. */
type QuickGesture = "rise" | "pop" | "dolly" | "spin" | "flip" | "slide" | "flash" | "turn"
  | "morph" | "tick" | "look" | "drop" | "bob" | "spread" | "draw";
type QuickFamily = "layers" | "project" | "effects";

interface QuickDrawing {
  readonly fill?: string;
  readonly base?: string;
  readonly accent: string;
  /** Extra stroke pattern for the accent (dashed outlines). */
  readonly accentDash?: string;
  readonly gesture: QuickGesture;
}

const RING = "M9 2.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z";

export const QUICK_ACTION_DRAWINGS: Readonly<Record<QuickAction, QuickDrawing>> = Object.freeze({
  // Layer row: transforms the selection.
  "precompose": { base: "M5.5 5.5V2.5h10v10h-2.5M2.5 5.5h10.5v10H2.5z", fill: "M2.5 5.5h10.5v10H2.5z", accent: "M5 8.5h5.5v4.5H5z", gesture: "rise" },
  "center": { base: "M2.5 2.5h13v13h-13z", fill: "M7.5 7.5h3v3h-3z", accent: "M9 4.5v9M4.5 9h9", gesture: "pop" },
  "fit": { base: "M5.5 5.5h7v7h-7z", fill: "M5.5 5.5h7v7h-7z", accent: "M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4", gesture: "dolly" },
  "freeze": { base: "M7 3.5L9 5l2-1.5M7 14.5L9 13l2 1.5", accent: "M9 2v14M2.9 5.5l12.2 7M2.9 12.5l12.2-7", gesture: "spin" },
  "mirror": { base: "M9 1.5v15", fill: "M7 4.5L2.5 13.5H7z", accent: "M11 4.5l4.5 9H11z", gesture: "flip" },
  "dash-stroke": { base: "M2.5 4h13M2.5 14h13", accent: "M2.5 9h2.5M7.75 9h2.5M13 9h2.5", gesture: "slide" },
  "trim-to-keys": { base: "M2 9h14", fill: "M5 6.5h8v5H5z", accent: "M5 3v12M13 3v12", gesture: "slide" },
  "pin-to-null": { base: "M2.5 11.5h6v5h-6z", accent: "M12.5 1.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5zM12.5 6.5v4M8.5 12l4-1.5", gesture: "tick" },
  // Create row: new layers and the PNG export.
  "create-adjustment": { base: RING, fill: "M9 2.5a6.5 6.5 0 0 1 0 13z", accent: "M9 2.5v13", gesture: "turn" },
  "create-solid": { base: "M3 3h12v12H3z", fill: "M3 3h12v12H3z", accent: "M6.5 11.5l5-5", gesture: "pop" },
  "create-shape": { base: "M1.5 3.5h3v3h-3zM13.5 11.5h3v3h-3z", fill: "M3 5h12v8H3z", accent: "M3 5h12v8H3z", gesture: "morph" },
  "create-null": { base: "M5.5 5.5h7v7h-7z", fill: "M5.5 5.5h7v7h-7z", accent: "M9 1.5V4M9 14v2.5M1.5 9H4M14 9h2.5", gesture: "tick" },
  "create-camera": { base: "M2 5.5h9.5v7H2z", fill: "M2 5.5h9.5v7H2z", accent: "M11.5 8l4.5-2.5v7L11.5 10", gesture: "look" },
  "save-frame": { base: "M2 3.5h14v11H2z", fill: "M2 14.5l4.5-5 3 3 2-2 4.5 4z", accent: "M12 5.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z", gesture: "flash" },
  // Effects row: one native effect each.
  "effect-hue": { base: RING, fill: "M9 9V2.5a6.5 6.5 0 0 1 6.5 6.5z", accent: "M9 9l4.6-4.6", gesture: "spin" },
  "effect-fill": { base: "M3.5 8l5-5 6 6-5 5z", fill: "M3.5 8l5-5 6 6-5 5z", accent: "M15.5 11.5s1.5 1.7 1.5 2.8a1.5 1.5 0 0 1-3 0c0-1.1 1.5-2.8 1.5-2.8z", gesture: "drop" },
  "effect-tint": { base: "M9 2s5 5.2 5 8.8a5 5 0 0 1-10 0C4 7.2 9 2 9 2z", fill: "M9 2s5 5.2 5 8.8a5 5 0 0 1-10 0C4 7.2 9 2 9 2z", accent: "M6.8 11.5a2.3 2.3 0 0 0 2.2 2.2", gesture: "bob" },
  "effect-blur": { fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", base: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: RING, accentDash: "1 2.4", gesture: "spread" },
  "effect-lumetri": { base: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4", gesture: "spin" },
  "effect-curves": { base: "M2.5 2.5v13h13", fill: "M2.5 15.5C8 15.5 7 3 15.5 2.5v13z", accent: "M2.5 15.5C8 15.5 7 3 15.5 2.5", gesture: "draw" }
});

/** Text fallbacks for runtimes without inline SVG. */
const FALLBACK: Readonly<Record<QuickAction, string>> = Object.freeze({
  "precompose": "⧉", "center": "⊕", "fit": "⤢", "freeze": "❄", "mirror": "⇋", "dash-stroke": "┄", "trim-to-keys": "⇤", "pin-to-null": "⌖",
  "create-adjustment": "◐", "create-solid": "■", "create-shape": "▭", "create-null": "□", "create-camera": "▷", "save-frame": "▣",
  "effect-hue": "◔", "effect-fill": "◆", "effect-tint": "●", "effect-blur": "◌", "effect-lumetri": "☼", "effect-curves": "∫"
});

export function quickActionFamily(action: QuickAction): QuickFamily {
  return action.startsWith("effect-") ? "effects" : action.startsWith("create-") || action === "save-frame" ? "project" : "layers";
}

/** Mirrors ui-core createIcon so the shared CSS (family color, gesture pivots) applies unchanged. */
export function createQuickActionIcon(doc: Document, action: QuickAction): Element {
  const drawing = QUICK_ACTION_DRAWINGS[action];
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
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.setAttribute("data-icon", `quick-${action}`); svg.setAttribute("data-icon-family", family);
    svg.setAttribute("data-icon-motion", drawing.gesture);
    svg.setAttribute("data-motion", "icon-gesture");
    const geometry = doc.createElementNS(SVG_NS, "g");
    geometry.setAttribute("transform", "scale(1.3333333333)");
    geometry.setAttribute("stroke", "currentColor"); geometry.setAttribute("fill", "none");
    geometry.setAttribute("stroke-width", "1.5");
    geometry.setAttribute("stroke-linejoin", "round"); geometry.setAttribute("stroke-linecap", "round");
    for (const [part, path] of [["fill", drawing.fill], ["base", drawing.base], ["detail", drawing.accent]] as const) {
      if (!path) continue;
      const group = doc.createElementNS(SVG_NS, "g"); group.setAttribute("class", `ch-icon__${part}`);
      const shape = doc.createElementNS(SVG_NS, "path"); shape.setAttribute("d", path);
      if (part === "fill") { shape.setAttribute("fill", "currentColor"); shape.setAttribute("stroke", "none"); }
      if (part === "detail" && drawing.gesture === "draw") shape.setAttribute("pathLength", "1");
      if (part === "detail" && drawing.accentDash) shape.setAttribute("stroke-dasharray", drawing.accentDash);
      group.appendChild(shape); geometry.appendChild(group);
    }
    svg.appendChild(geometry);
    return svg;
  } catch { return fallback(); }
}
