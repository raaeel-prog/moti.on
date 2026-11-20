/**
 * Interface icons for the AE views (motion upgrade F2). They replace the text glyphs
 * (☆ ★ × ▾ ▸ … ✓) that rendered at a different size and weight in every font.
 * One 16 px grid, a 1.33 px stroke kept at any size (non-scaling stroke), round caps.
 * AE-only on purpose: packages/ui-core/src/icons.ts is shared with Premiere.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

export type UiIconName = "chevron-down" | "chevron-right" | "chevron-left" | "live" | "plus" | "search" | "check" | "star" | "star-filled" | "close" | "more" | "pin" | "info" | "alert" | "grip" | "filter" | "play" | "folder" | "copy" | "sliders" | "clock" | "autoplay" | "keyboard" | "variants" | "speed" | "edit";

interface IconShape { d: string; fill?: true }

const STAR = "M8 2.4l1.7 3.5 3.8.55-2.75 2.68.65 3.78L8 11.13l-3.4 1.78.65-3.78L2.5 6.45l3.8-.55z";
const dot = (x: number, y: number, r = 1.05): string => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

const SHAPES: Readonly<Record<UiIconName, readonly IconShape[]>> = Object.freeze({
  "chevron-down": [{ d: "M4.5 6.25 8 9.75l3.5-3.5" }],
  "chevron-right": [{ d: "M6.25 4.5 9.75 8l-3.5 3.5" }],
  "chevron-left": [{ d: "M9.75 4.5 6.25 8l3.5 3.5" }],
  plus: [{ d: "M8 3.5v9M3.5 8h9" }],
  search: [{ d: "M7.1 11.6a4.5 4.5 0 1 0 0-9a4.5 4.5 0 0 0 0 9zM10.4 10.4l3.1 3.1" }],
  live: [{ d: "M5.35 5.35a3.75 3.75 0 0 0 0 5.3M10.65 5.35a3.75 3.75 0 0 1 0 5.3M3.4 3.4a6.5 6.5 0 0 0 0 9.2M12.6 3.4a6.5 6.5 0 0 1 0 9.2" }, { d: dot(8, 8, 1.35), fill: true }],
  check: [{ d: "M3.75 8.4 6.6 11.2 12.25 4.8" }],
  star: [{ d: STAR }],
  "star-filled": [{ d: STAR, fill: true }],
  close: [{ d: "M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" }],
  more: [{ d: dot(3.75, 8) + dot(8, 8) + dot(12.25, 8), fill: true }],
  pin: [{ d: "M9.6 2.6l3.8 3.8-1.9.95-2.2 2.2.45 2.4-.95.95-5.1-5.1.95-.95 2.4.45 2.2-2.2zM5.2 10.8 2.6 13.4" }],
  info: [{ d: "M8 13.75A5.75 5.75 0 1 0 8 2.25a5.75 5.75 0 0 0 0 11.5zM8 7.4v3.6" }, { d: dot(8, 5.15, 0.8), fill: true }],
  alert: [{ d: "M8 2.75 13.9 12.9H2.1zM8 6.6v3" }, { d: dot(8, 11.15, 0.8), fill: true }],
  grip: [{ d: dot(6, 4) + dot(10, 4) + dot(6, 8) + dot(10, 8) + dot(6, 12) + dot(10, 12), fill: true }],
  filter: [{ d: "M2.75 4.5h10.5M4.75 8h6.5M6.75 11.5h2.5" }],
  play: [{ d: "M5.5 3.6v8.8L12.4 8z", fill: true }],
  folder: [{ d: "M2.5 4.25h3.75l1.25 1.5h6v6.75h-11z" }],
  copy: [{ d: "M5.75 5.75h6.75v6.75H5.75zM3.5 10.25V3.5h6.75" }],
  sliders: [{ d: "M2.75 5h5.5M11.25 5h2M2.75 11h2M7.75 11h5.5" }, { d: dot(9.75, 5, 1.5) + dot(6.25, 11, 1.5), fill: true }],
  clock: [{ d: "M8 13.75A5.75 5.75 0 1 0 8 2.25a5.75 5.75 0 0 0 0 11.5zM8 5v3.25l2.1 1.4" }],
  // Do estudo do design system (grade de 16, traço 1,4).
  autoplay: [{ d: "M2.5 3.5h11v9h-11zM6.8 6l3 2-3 2z" }],
  keyboard: [{ d: "M1.5 4.5h13v7h-13zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6" }],
  variants: [{ d: "M3 5h10M3 8h10M3 11h10" }],
  // Área de velocidade da v6: um pico sobre a linha de base.
  // Lápis do botão Editar (ferramentas de um clique, 2026-11-19).
  edit: [{ d: "M2.75 13.25l.9-3.2 7.1-7.1 2.3 2.3-7.1 7.1zM9.4 4.3l2.3 2.3" }],
  speed: [{ d: "M2.5 13V11.2C5 11.2 6.2 4.5 8 4.5s3 6.7 5.5 6.7V13z", fill: true }]
});

/** A decorative SVG icon (the control carries the accessible name), or null without SVG. */
export function uiIcon(doc: Document, name: UiIconName, size = 16): SVGSVGElement | null {
  if (typeof doc.createElementNS !== "function") return null;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ch-ui-icon");
  svg.setAttribute("data-icon", name);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const shape of SHAPES[name]) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shape.d);
    if (shape.fill) { path.setAttribute("fill", "currentColor"); path.setAttribute("stroke", "none"); }
    else {
      path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "1.33");
      path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("vector-effect", "non-scaling-stroke");
    }
    svg.appendChild(path);
  }
  return svg as SVGSVGElement;
}

/** Puts `name` inside a control in place of its text glyph; keeps the text when SVG is missing. */
export function setUiIcon(control: HTMLElement, name: UiIconName, fallback = ""): void {
  const icon = control.ownerDocument ? uiIcon(control.ownerDocument, name) : null;
  control.textContent = "";
  if (icon) { control.appendChild(icon); control.setAttribute("data-icon", name); }
  else control.textContent = fallback;
}
