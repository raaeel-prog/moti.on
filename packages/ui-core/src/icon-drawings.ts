/**
 * Onyx Vivo — duotone tool drawings.
 * Revisão 2026-11-16: cada desenho mostra o objeto que a pessoa procura na grade (Beat é uma caixa de
 * som, Cortar keys uma tesoura, Limpar uma vassoura), e as abas ganharam as mesmas três camadas.
 *
 * Same 18-unit grid as the GM catalog in icons.ts, scaled to the 24 viewBox.
 * Each drawing has up to three layers:
 * - `fill`: a soft area in the tool family color (low opacity);
 * - `base`: neutral structure stroked in the primary text color;
 * - `accent`: the meaningful part, stroked in the family color. It is the only
 *   layer that moves, once per hover/focus, with the tool's own gesture.
 * Presentation only: no host, no global DOM.
 */
export type DuotoneGesture =
  | "draw" | "bounce" | "shake" | "flash" | "spin" | "tick" | "slide" | "slide-back"
  | "swap" | "bob" | "rise" | "drop" | "pop" | "pulse" | "glitch" | "look" | "turn"
  | "flip" | "parallax" | "equalize" | "spread" | "trail" | "write" | "wave" | "dolly"
  | "morph" | "settle" | "snip" | "thump" | "sweep" | "twirl" | "burst";

export interface DuotoneDrawing {
  readonly fill?: string;
  readonly base?: string;
  readonly accent: string;
  readonly gesture: DuotoneGesture;
}

export const DUOTONE_DRAWINGS = {
  // Keyframes
  ease: { base: "M2.5 15.5h4.5M15.5 2.5H11M8.25 14.25a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5zM9.75 1.25a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5z", fill: "M2.5 15.5C9.5 15.5 8.5 2.5 15.5 2.5V15.5z", accent: "M2.5 15.5C9.5 15.5 8.5 2.5 15.5 2.5", gesture: "draw" },
  cutKeys: { fill: "M14.5 6.75l2.25 2.25-2.25 2.25L12.25 9z", base: "M14.5 6.75l2.25 2.25-2.25 2.25L12.25 9z", accent: "M4 2.75a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8zM4 11.45a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8zM5.6 5.75l6.9 6.2M5.6 12.25l6.9-6.2", gesture: "snip" },
  delay: { base: "M2 2v14", fill: "M5.5 2.5l2 2-2 2-2-2zM9.5 7l2 2-2 2-2-2zM13.5 11.5l2 2-2 2-2-2z", accent: "M5.5 2.5l2 2-2 2-2-2zM9.5 7l2 2-2 2-2-2zM13.5 11.5l2 2-2 2-2-2z", gesture: "slide" },
  reverseKeys: { fill: "M9 6l3 3-3 3-3-3z", base: "M9 6l3 3-3 3-3-3z", accent: "M3 3.5h11.5l-2-2M15 14.5H3.5l2 2", gesture: "swap" },
  reverseValues: { base: "M2 16h14", accent: "M5.5 2.5v9M3.5 4.5l2-2 2 2M3.5 9.5l2 2 2-2M12.5 2.5v9M10.5 4.5l2-2 2 2M10.5 9.5l2 2 2-2", gesture: "bob" },
  sendToEdge: { base: "M2.5 2.5v13", fill: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", accent: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", gesture: "slide-back" },
  cloneKeys: { base: "M6 6V2.5h9.5V12H12M2.5 6h9.5v9.5H2.5z", fill: "M2.5 6h9.5v9.5H2.5z", accent: "M7.25 8.5v4.5M5 10.75h4.5", gesture: "pop" },
  copyKeys: { fill: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", base: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", accent: "M11.5 8l3.5 3.5-3.5 3.5L8 11.5z", gesture: "slide" },
  pasteKeys: { base: "M4.5 4h9v11.5h-9zM7 2.5h4V5H7z", fill: "M4.5 4h9v11.5h-9z", accent: "M9 7.5l2.5 2.5L9 12.5 6.5 10z", gesture: "drop" },
  timeController: { fill: "M9 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12z", base: "M9 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM7 1.5h4M9 1.5V4M14 4.5l1-1", accent: "M9 10V6.25M9 10h.1", gesture: "tick" },
  timeMarkerLoop: { base: "M3.5 6.5V16M14.5 6.5V16M2 2h3v3L3.5 6.5 2 5zM13 2h3v3l-1.5 1.5L13 5z", fill: "M2 2h3v3L3.5 6.5 2 5zM13 2h3v3l-1.5 1.5L13 5z", accent: "M11.5 14H7a2.25 2.25 0 0 1 0-4.5h4.5M9.75 7.75l1.75 1.75-1.75 1.75", gesture: "slide" },

  // Layers
  rename: { fill: "M1.5 3h9v12.5h-9z", base: "M2.75 13.5L6 4.5l3.25 9M3.95 10.5h4.1", accent: "M13.75 3.5v11M12 2.5c1 0 1.75.5 1.75 1.5 0-1 .75-1.5 1.75-1.5M12 15.5c1 0 1.75-.5 1.75-1.5 0 1 .75 1.5 1.75 1.5", gesture: "flash" },
  reverseOrder: { base: "M2 4h9M2 14h9M2 7.5h9v3H2z", fill: "M2 7.5h9v3H2z", accent: "M14.5 3v12M12.5 5l2-2 2 2M12.5 13l2 2 2-2", gesture: "bob" },
  anchor: { base: "M9 1.5v4M9 12.5v4M1.5 9h4M12.5 9h4", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM9 8.9v.2", gesture: "pop" },
  flip: { base: "M9 1.5v15", fill: "M7 4.5L2.5 13.5H7z", accent: "M11 4.5l4.5 9H11z", gesture: "flip" },
  createNull: { base: "M5.5 5.5h7v7h-7z", fill: "M5.5 5.5h7v7h-7z", accent: "M9 1.5V4M9 14v2.5M1.5 9H4M14 9h2.5", gesture: "spread" },
  parent: { base: "M6.5 2h5v4h-5zM9 6v3M4 9h10M4 9v2.5M14 9v2.5", fill: "M6.5 2h5v4h-5z", accent: "M2 11.5h4v4H2zM12 11.5h4v4h-4z", gesture: "drop" },
  fastEdit: { base: "M1.5 4h5.5M1.5 7.5h3M10.5 15.5h5", fill: "M13 2.5l2.5 2.5-8 8-3.2.7.7-3.2z", accent: "M13 2.5l2.5 2.5-8 8-3.2.7.7-3.2zM11.25 4.25l2.5 2.5", gesture: "write" },

  // Animation
  loopOut: { fill: "M5.5 6a3 3 0 1 0 0 6c2 0 3-1.5 3.5-3S10.5 6 12.5 6a3 3 0 1 1 0 6c-2 0-3-1.5-3.5-3S7.5 6 5.5 6z", accent: "M5.5 6a3 3 0 1 0 0 6c2 0 3-1.5 3.5-3S10.5 6 12.5 6a3 3 0 1 1 0 6c-2 0-3-1.5-3.5-3S7.5 6 5.5 6z", gesture: "draw" },
  smooth: { base: "M1.5 10.5l1.5-5 2 8 2-9 1.75 5.5", accent: "M8.75 10c1.3-4 2.7-4 4-.5s2.2 3 3.75 0", gesture: "draw" },
  wiggle: { base: "M1.5 9h15", accent: "M2 9l2.5-5 3 10 3-10 3 8 2.5-3", gesture: "shake" },
  flicker: { base: "M15.5 2.5L14 4M2.5 15.5L4 14", fill: "M10 1.5L4 10h4.5L7 16.5 14 8H9.5z", accent: "M10 1.5L4 10h4.5L7 16.5 14 8H9.5z", gesture: "flash" },
  animateKinetic: { base: "M1.5 6h3.5M1.5 9h2.5M1.5 12h3.5", fill: "M7 4.5h4l5 4.5-5 4.5H7l5-4.5z", accent: "M7 4.5h4l5 4.5-5 4.5H7l5-4.5z", gesture: "slide" },
  jump: { base: "M2 16h14M2.5 15C3.6 10.6 5.6 7.6 8.2 6.4", fill: "M12 3a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", accent: "M12 3a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", gesture: "bounce" },
  inertial: { base: "M1.5 15.5h15", accent: "M1.5 9c1.5 0 1.5-5.5 3.5-5.5s2 9 4 9 1.5-5 3-5 1.5 2.5 2.75 2.5 1.25-1 1.75-1", gesture: "settle" },
  wordReveal: { fill: "M2 5h6v8H2z", base: "M2 5h6v8H2z", accent: "M10 13.5l3-9 3 9M11.05 10.5h3.9", gesture: "pop" },
  variableMorph: { base: "M4.75 10.5L9 1.75l4.25 8.75M6.3 7.4h5.4M2 14.5h7M14 14.5h2", fill: "M11.5 12.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z", accent: "M11.5 12.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4z", gesture: "slide" },
  styleSwap: { base: "M2 3h5.5M4.75 3v6.5M3.5 14.5h11M5.5 12.5l-2 2 2 2M12.5 12.5l2 2-2 2", accent: "M10.5 4.5V3H16v1.5M13.25 3v6.5M12 9.5h2.5", gesture: "swap" },
  beat: { base: "M5 1.5h8v15H5zM9 4.75v.1", fill: "M9 7.75a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 7.75a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM9 10.7v.1M2.25 8.5a4.5 4.5 0 0 0 0 4.5M15.75 8.5a4.5 4.5 0 0 1 0 4.5", gesture: "thump" },

  // Spatial
  lookAt: { base: "M1.5 9c3-4.5 12-4.5 15 0-3 4.5-12 4.5-15 0z", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 7.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5z", gesture: "look" },
  orbit: { base: "M9 5.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z", fill: "M9 5.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z", accent: "M2 10.5C1.5 8.5 5 7 9 7s7.5 1.5 7 3.5-3.5 2.5-7 2.5-6.5-.5-7-2.5zM15.5 4v.1", gesture: "spin" },
  cylinder: { base: "M2.5 4.75v8.5c0 1.25 2.9 2.25 6.5 2.25s6.5-1 6.5-2.25v-8.5", fill: "M9 2.5c3.6 0 6.5 1 6.5 2.25S12.6 7 9 7 2.5 6 2.5 4.75 5.4 2.5 9 2.5z", accent: "M9 2.5c3.6 0 6.5 1 6.5 2.25S12.6 7 9 7 2.5 6 2.5 4.75 5.4 2.5 9 2.5z", gesture: "turn" },
  cube: { base: "M2.5 5.5v7L9 16l6.5-3.5v-7M9 9v7", fill: "M9 2l6.5 3.5L9 9 2.5 5.5z", accent: "M9 2l6.5 3.5L9 9 2.5 5.5z", gesture: "turn" },
  cameraTransition: { base: "M2 5.5h9v7H2z", fill: "M11 8l5-2.5v7L11 10z", accent: "M11 8l5-2.5v7L11 10zM4 2.5h5", gesture: "dolly" },
  parallax: { base: "M8 6h4v6H8zM13 7.5h3v3h-3z", fill: "M2 4.5h5v9H2z", accent: "M2 4.5h5v9H2z", gesture: "parallax" },
  parallaxFull: { base: "M8 6h4v6H8zM13 7.5h3v3h-3zM2 16.5h14", fill: "M2 4.5h5v9H2z", accent: "M2 4.5h5v9H2zM2 14.5h5", gesture: "parallax" },

  // Shapes
  breakShape: { fill: "M7.25 3.25a5.75 5.75 0 0 0 0 11.5z", accent: "M7.25 3.25a5.75 5.75 0 0 0 0 11.5zM10.75 3.25a5.75 5.75 0 0 1 0 11.5z", gesture: "spread" },
  shapeLibrary: { base: "M2.5 2.5h6v6h-6z", fill: "M12.5 9.5a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5z", accent: "M12.5 1.5l3.5 5.5h-7zM12.5 9.5a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5z", gesture: "pop" },
  trimPath: { base: "M2 13C5 4 11 4 16 8M16 8h.1", accent: "M2 13C3.4 8.8 5.6 6.4 8.2 5.6M2 13h.1", gesture: "draw" },
  textBox: { base: "M2 4h14v10H2z", fill: "M2 4h14v10H2z", accent: "M6 7.25h6M9 7.25v4.25", gesture: "rise" },
  effector: { base: "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z", fill: "M9 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z", accent: "M9 4.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z", gesture: "pulse" },

  // Effects
  verticalPulse: { base: "M4 3h10M9 3v7.5", fill: "M9 11.5c3 0 5 1 5 2s-2 2-5 2-5-1-5-2 2-2 5-2z", accent: "M3 13.5c1-2 2-2 3 0s2 2 3 0 2-2 3 0 2 2 3 0", gesture: "pulse" },
  gradient: { base: "M2 3h14v6.5H2z", fill: "M2 9.5L16 3v6.5z", accent: "M5 11.5l1.75 1.75v2.5h-3.5v-2.5zM13 11.5l1.75 1.75v2.5h-3.5v-2.5z", gesture: "slide" },
  wave: { base: "M2 12.5c2-3 4-3 6 0s4 3 6 0", accent: "M2 6.5c2-3 4-3 6 0s4 3 6 0 2 1.5 2 1.5", gesture: "wave" },
  tile: { fill: "M2.5 2.5H8V8H2.5z", base: "M2.5 2.5H8V8H2.5z", accent: "M10 4.5v-2h2M13.5 2.5h2v2M15.5 6v2h-2M12 8h-2V6M2.5 12v-2h2M6 10h2v2M8 13.5v2H6M4.5 15.5h-2v-2M10 12v-2h2M13.5 10h2v2M15.5 13.5v2h-2M12 15.5h-2v-2", gesture: "spread" },
  glitch: { base: "M2.5 5h6M5 8.5h9M2 12h6", fill: "M10 3.5h5.5v3H10zM8 10.5h6v3H8z", accent: "M10 3.5h5.5v3H10zM8 10.5h6v3H8z", gesture: "glitch" },
  echo: { base: "M11.5 4.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z", fill: "M11.5 4.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z", accent: "M6.75 5.4a4.5 4.5 0 0 0 0 7.2M3.25 6.6a4.5 4.5 0 0 0 0 4.8", gesture: "trail" },
  particles: { base: "M9 12.75a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5z", fill: "M9 12.75a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5z", accent: "M9 9.5v.1M5.75 10.5h.1M12.25 10.5h.1M3.5 7h.1M14.5 7h.1M7 6h.1M11 6h.1M9 2.5v.1M4.75 3h.1M13.25 3h.1", gesture: "burst" },
  neon: { base: "M6.5 15h5M2 4.5a7 7 0 0 0 0 7M16 4.5a7 7 0 0 1 0 7", fill: "M5.5 12V7a3.5 3.5 0 0 1 7 0v5z", accent: "M5.5 12V7a3.5 3.5 0 0 1 7 0v5", gesture: "flash" },

  // Project
  aiToVector: { base: "M9 16.5L4.75 9.5 7 2.5h4l2.25 7z", fill: "M9 16.5L4.75 9.5 7 2.5h4l2.25 7z", accent: "M9 16.5v-6M9 7.75a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 1 1 0-2.8z", gesture: "drop" },
  textToVector: { base: "M5 5h8M9 5v8", accent: "M4 4h2v2H4zM12 4h2v2h-2zM8 12h2v2H8z", gesture: "pop" },
  texture: { base: "M2 2h14v14H2z", fill: "M2 2h14v14H2z", accent: "M2 8.5L8.5 2M2 14.5L14.5 2M5.5 16L16 5.5M11.5 16l4.5-4.5", gesture: "slide" },
  clean: { base: "M12.5 14.5h.1M15 12.5h.1M14.5 16h.1", fill: "M7.75 6.25l3.5 3.5-2.75 4.75L3 9z", accent: "M15.5 2l-6 6M7.75 6.25l3.5 3.5-2.75 4.75L3 9z", gesture: "sweep" }
} as const satisfies Record<string, DuotoneDrawing>;

export type DuotoneToolId = keyof typeof DUOTONE_DRAWINGS;

/**
 * Abas e utilitários do topo. Mesmas camadas das ferramentas, sem família de cor: a parte `accent`
 * faz um gesto curto quando o ponteiro chega à aba (o diamante gira, o play salta, a lente aproxima).
 */
export const NAV_DRAWINGS = {
  tools: { base: "M2.5 2.5h5v5h-5zM2.5 10.5h5v5h-5zM10.5 10.5h5v5h-5z", fill: "M13 1.5l3.5 3.5L13 8.5 9.5 5z", accent: "M13 1.5l3.5 3.5L13 8.5 9.5 5z", gesture: "twirl" },
  presets: { base: "M5.5 5.5v-3h10v10h-3M2.5 5.5h10v10h-10z", fill: "M2.5 5.5h10v10h-10z", accent: "M6.25 8l3.75 2.5-3.75 2.5z", gesture: "pop" },
  videoCamera: { base: "M2 5h9.5v8H2zM4.5 7.75h.1", fill: "M2 5h9.5v8H2z", accent: "M11.5 8L16 5.5v7L11.5 10z", gesture: "dolly" },
  stock: { base: "M2.5 3.5h13v11h-13zM11.75 6.5h.1", fill: "M2.5 12l3.75-3.5 3 2.75 2.25-2 4 3.25v2h-13z", accent: "M2.5 12l3.75-3.5 3 2.75 2.25-2 4 3.25", gesture: "rise" },
  settings: { base: "M3 5h12M3 9h12M3 13h12", accent: "M6 3.5v3M12 7.5v3M8 11.5v3", gesture: "settle" },
  search: { accent: "M12 7.5a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0M11 11l4 4", gesture: "look" }
} as const satisfies Record<string, DuotoneDrawing>;

export type NavIconId = keyof typeof NAV_DRAWINGS;

/** Static drawing in layer order (fill, base, accent) — the identity used by tests and fallbacks. */
export function duotoneStaticPath(drawing: DuotoneDrawing): string {
  return [drawing.fill ?? "", drawing.base ?? "", drawing.accent].join("");
}
