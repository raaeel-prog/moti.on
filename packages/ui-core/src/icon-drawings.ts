/**
 * Onyx Vivo — duotone tool drawings.
 * Revisão 2026-11-19: as ferramentas da grade usam traços simples, de uma cor (preview aprovado);
 * quem ainda tem `fill` mantém o desenho antigo até ser redesenhado.
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
  cutKeys: { base: "M5.4 10.8a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6zM12.6 10.8a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 1 1 0-3.6z", accent: "M6.75 11.25L12.6 2.7M11.25 11.25L5.4 2.7", gesture: "snip" },
  delay: { accent: "M2.7 4.5h5.4M5.4 9h5.4M8.1 13.5h5.4", gesture: "slide" },
  reverseKeys: { fill: "M9 6l3 3-3 3-3-3z", base: "M9 6l3 3-3 3-3-3z", accent: "M3 3.5h11.5l-2-2M15 14.5H3.5l2 2", gesture: "swap" },
  reverseValues: { base: "M2 16h14", accent: "M5.5 2.5v9M3.5 4.5l2-2 2 2M3.5 9.5l2 2 2-2M12.5 2.5v9M10.5 4.5l2-2 2 2M10.5 9.5l2 2 2-2", gesture: "bob" },
  sendToEdge: { base: "M2.5 2.5v13", fill: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", accent: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", gesture: "slide-back" },
  cloneKeys: { base: "M6 6V2.5h9.5V12H12M2.5 6h9.5v9.5H2.5z", fill: "M2.5 6h9.5v9.5H2.5z", accent: "M7.25 8.5v4.5M5 10.75h4.5", gesture: "pop" },
  copyKeys: { fill: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", base: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", accent: "M11.5 8l3.5 3.5-3.5 3.5L8 11.5z", gesture: "slide" },
  pasteKeys: { base: "M4.5 4h9v11.5h-9zM7 2.5h4V5H7z", fill: "M4.5 4h9v11.5h-9z", accent: "M9 7.5l2.5 2.5L9 12.5 6.5 10z", gesture: "drop" },
  timeController: { fill: "M9 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12z", base: "M9 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12zM7 1.5h4M9 1.5V4M14 4.5l1-1", accent: "M9 10V6.25M9 10h.1", gesture: "tick" },
  timeMarkerLoop: { base: "M3.5 6.5V16M14.5 6.5V16M2 2h3v3L3.5 6.5 2 5zM13 2h3v3l-1.5 1.5L13 5z", fill: "M2 2h3v3L3.5 6.5 2 5zM13 2h3v3l-1.5 1.5L13 5z", accent: "M11.5 14H7a2.25 2.25 0 0 1 0-4.5h4.5M9.75 7.75l1.75 1.75-1.75 1.75", gesture: "slide" },

  // Layers
  rename: { base: "M2.7 5.4h8.1M2.7 9h5.4", accent: "M9.9 13.5l4.5-4.5 1.35 1.35-4.5 4.5H9.9z", gesture: "write" },
  reverseOrder: { accent: "M5.4 2.7v12.6l-2.7-2.7M12.6 15.3V2.7l2.7 2.7", gesture: "bob" },
  anchor: { base: "M9 1.5v4M9 12.5v4M1.5 9h4M12.5 9h4", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM9 8.9v.2", gesture: "pop" },
  flip: { base: "M9 1.5v15", fill: "M7 4.5L2.5 13.5H7z", accent: "M11 4.5l4.5 9H11z", gesture: "flip" },
  createNull: { base: "M5.5 5.5h7v7h-7z", fill: "M5.5 5.5h7v7h-7z", accent: "M9 1.5V4M9 14v2.5M1.5 9H4M14 9h2.5", gesture: "spread" },
  parent: { base: "M5.4 3.15a2.25 2.25 0 1 1 0 4.5a2.25 2.25 0 1 1 0-4.5zM12.6 10.35a2.25 2.25 0 1 1 0 4.5a2.25 2.25 0 1 1 0-4.5z", accent: "M7.2 7.2l3.6 3.6", gesture: "drop" },
  fastEdit: { accent: "M9.9 1.8L4.5 9.9h4.5l-.9 6.3 5.4-8.1H9z", gesture: "flash" },

  // Animation
  loopOut: { base: "M3.6 8.1a4.5 4.5 0 0 1 8.1-2.7M14.4 9.9a4.5 4.5 0 0 1-8.1 2.7", accent: "M11.7 2.7v2.7H9M6.3 15.3v-2.7H9", gesture: "spin" },
  smooth: { base: "M2 15.5h14", accent: "M2.7 12.6c2.7 0 2.7-7.2 6.3-7.2s3.6 7.2 6.3 7.2", gesture: "draw" },
  wiggle: { accent: "M1.8 9c1.35-2.7 2.7-2.7 3.6 0s2.25 2.7 3.6 0 2.25-2.7 3.6 0 1.8 2.7 3.6 0", gesture: "shake" },
  flicker: { base: "M9 1.8v2.7M9 13.5v2.7M1.8 9h2.7M13.5 9h2.7M4.5 4.5l1.35 1.35M12.15 12.15l1.35 1.35M4.5 13.5l1.35-1.35M12.15 5.85l1.35-1.35", accent: "M9 6.75a2.25 2.25 0 1 1 0 4.5a2.25 2.25 0 1 1 0-4.5z", gesture: "flash" },
  animateKinetic: { base: "M2.7 5.4h6.3M2.7 9h9M2.7 12.6h5.4", accent: "M12.6 6.3l2.7 2.7-2.7 2.7", gesture: "slide" },
  jump: { base: "M2.7 14.4h12.6", accent: "M4.5 14.4c.9-8.1 8.1-8.1 9 0M9 4.86a1.44 1.44 0 1 1 0 2.88a1.44 1.44 0 1 1 0-2.88z", gesture: "bounce" },
  inertial: { accent: "M1.8 9h2.7c1.8 0 1.8-4.5 3.6-4.5s1.8 8.1 3.6 8.1 1.35-4.5 2.7-4.5h1.8", gesture: "settle" },
  wordReveal: { base: "M2.7 5.4h5.4v7.2H2.7z", accent: "M10.8 7.2h4.5M10.8 10.8h2.7", gesture: "pop" },
  variableMorph: { base: "M3.6 13.5L7.2 4.5l3.6 9M4.95 9.9h4.5", accent: "M12.6 8.1v5.4M12.6 8.1c1.8 0 2.7.9 2.7 2.25S14.4 12.6 12.6 12.6", gesture: "slide" },
  styleSwap: { accent: "M3.6 6.3h9.9l-2.7-2.7M14.4 11.7H4.5l2.7 2.7", gesture: "swap" },
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
  verticalPulse: { base: "M9 1.8v14.4", accent: "M5.4 5.4c1.8 1.8 5.4 1.8 7.2 0M5.4 12.6c1.8-1.8 5.4-1.8 7.2 0", gesture: "pulse" },
  gradient: { base: "M3.6 13.5L7.2 4.5l3.6 9M4.95 9.9h4.5", accent: "M12.6 4.5v1.8M12.6 8.1v1.8M12.6 11.7v1.8", gesture: "slide" },
  wave: { base: "M1.8 6.3h14.4", accent: "M1.8 10.8c1.8-3.6 3.6-3.6 5.4 0s3.6 3.6 5.4 0 2.7-2.7 3.6-.9", gesture: "wave" },
  tile: { base: "M2.7 2.7h5.4v5.4H2.7zM9.9 2.7h5.4v5.4H9.9zM2.7 9.9h5.4v5.4H2.7z", accent: "M9.9 9.9h5.4v5.4H9.9z", gesture: "spread" },
  glitch: { base: "M2.7 4.5h8.1M2.7 9.9h6.3", accent: "M5.4 7.2h9.9M7.2 12.6h8.1", gesture: "glitch" },
  echo: { base: "M7.2 4.5h8.1v9H7.2z", accent: "M5.4 5.4v7.2M3.6 6.3v5.4", gesture: "trail" },
  particles: { base: "M8.1 14.4h.1M10.8 11.7h.1", accent: "M4.5 5.4h.1M9 3.6h.1M12.6 7.2h.1M6.3 9.9h.1", gesture: "burst" },
  neon: { accent: "M4.5 13.5v-9l9 9v-9", gesture: "flash" },

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
