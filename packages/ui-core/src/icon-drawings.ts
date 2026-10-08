/**
 * Onyx Vivo — duotone tool drawings (proposal; awaiting owner approval).
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
  | "morph" | "settle";

export interface DuotoneDrawing {
  readonly fill?: string;
  readonly base?: string;
  readonly accent: string;
  readonly gesture: DuotoneGesture;
}

export const DUOTONE_DRAWINGS = {
  // Keyframes
  ease: { base: "M2.5 15.5h13M2.5 15.5V2.5", fill: "M2.5 15.5C7 15.5 8 5 15.5 4.5V15.5Z", accent: "M2.5 15.5C7 15.5 8 5 15.5 4.5", gesture: "draw" },
  cutKeys: { fill: "M5 6l3 3-3 3-3-3zM13 6l3 3-3 3-3-3z", base: "M5 6l3 3-3 3-3-3zM13 6l3 3-3 3-3-3z", accent: "M9 1.5v5M9 11.5v5", gesture: "draw" },
  delay: { base: "M2 2v14", fill: "M5.5 2.5l2 2-2 2-2-2zM9.5 7l2 2-2 2-2-2zM13.5 11.5l2 2-2 2-2-2z", accent: "M5.5 2.5l2 2-2 2-2-2zM9.5 7l2 2-2 2-2-2zM13.5 11.5l2 2-2 2-2-2z", gesture: "slide" },
  reverseKeys: { fill: "M9 6l3 3-3 3-3-3z", base: "M9 6l3 3-3 3-3-3z", accent: "M3 3.5h11.5l-2-2M15 14.5H3.5l2 2", gesture: "swap" },
  reverseValues: { base: "M2 16h14", accent: "M5.5 2.5v9M3.5 4.5l2-2 2 2M3.5 9.5l2 2 2-2M12.5 2.5v9M10.5 4.5l2-2 2 2M10.5 9.5l2 2 2-2", gesture: "bob" },
  sendToEdge: { base: "M2.5 2.5v13", fill: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", accent: "M6 7l2 2-2 2-2-2zM10 7l2 2-2 2-2-2zM14 7l2 2-2 2-2-2z", gesture: "slide-back" },
  cloneKeys: { base: "M6 6V2.5h9.5V12H12M2.5 6h9.5v9.5H2.5z", fill: "M2.5 6h9.5v9.5H2.5z", accent: "M7.25 8.5v4.5M5 10.75h4.5", gesture: "pop" },
  copyKeys: { fill: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", base: "M6.5 3l3.5 3.5-3.5 3.5L3 6.5z", accent: "M11.5 8l3.5 3.5-3.5 3.5L8 11.5z", gesture: "slide" },
  pasteKeys: { base: "M4.5 4h9v11.5h-9zM7 2.5h4V5H7z", fill: "M4.5 4h9v11.5h-9z", accent: "M9 7.5l2.5 2.5L9 12.5 6.5 10z", gesture: "drop" },
  timeController: { fill: "M9 2.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z", base: "M9 2.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z", accent: "M9 5.5V9l2.5 2.5", gesture: "tick" },
  timeMarkerLoop: { base: "M3.5 15.5v-13M14.5 15.5v-13", fill: "M3.5 6h11v6h-11z", accent: "M6 11.5a2.5 2.5 0 0 1 0-5h6M10 4.5l2 2-2 2", gesture: "slide" },

  // Layers
  rename: { base: "M2.5 5h6M2.5 9h8M2.5 13h4", fill: "M12.5 3l2.5 2.5-6 6-3 .5.5-3z", accent: "M12.5 3l2.5 2.5-6 6-3 .5.5-3zM11 4.5l2.5 2.5", gesture: "write" },
  reverseOrder: { base: "M2 4h9M2 14h9M2 7.5h9v3H2z", fill: "M2 7.5h9v3H2z", accent: "M14.5 3v12M12.5 5l2-2 2 2M12.5 13l2 2 2-2", gesture: "bob" },
  anchor: { base: "M9 1.5v4M9 12.5v4M1.5 9h4M12.5 9h4", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM9 8.9v.2", gesture: "pop" },
  flip: { base: "M9 1.5v15", fill: "M7 4.5L2.5 13.5H7z", accent: "M11 4.5l4.5 9H11z", gesture: "flip" },
  createNull: { base: "M5.5 5.5h7v7h-7z", fill: "M5.5 5.5h7v7h-7z", accent: "M9 1.5V4M9 14v2.5M1.5 9H4M14 9h2.5", gesture: "spread" },
  parent: { base: "M6.5 2h5v4h-5zM9 6v3M4 9h10M4 9v2.5M14 9v2.5", fill: "M6.5 2h5v4h-5z", accent: "M2 11.5h4v4H2zM12 11.5h4v4h-4z", gesture: "drop" },
  fastEdit: { base: "M2 3.5h14v11H2zM2 6.5h14", fill: "M2 3.5h14v3H2z", accent: "M8.5 8.5l5.5 2.2-2.4.9-.9 2.4z", gesture: "dolly" },

  // Animation
  loopOut: { fill: "M5.5 6a3 3 0 1 0 0 6c2 0 3-1.5 3.5-3S10.5 6 12.5 6a3 3 0 1 1 0 6c-2 0-3-1.5-3.5-3S7.5 6 5.5 6z", accent: "M5.5 6a3 3 0 1 0 0 6c2 0 3-1.5 3.5-3S10.5 6 12.5 6a3 3 0 1 1 0 6c-2 0-3-1.5-3.5-3S7.5 6 5.5 6z", gesture: "draw" },
  smooth: { base: "M1.5 15.5h15", fill: "M1.5 13.5C4 13.5 5 5 9 5s5 8.5 7.5 8.5v2h-15z", accent: "M1.5 13.5C4 13.5 5 5 9 5s5 8.5 7.5 8.5", gesture: "draw" },
  wiggle: { base: "M1.5 9h15", accent: "M2 9l2.5-5 3 10 3-10 3 8 2.5-3", gesture: "shake" },
  flicker: { base: "M15.5 2.5L14 4M2.5 15.5L4 14", fill: "M10 1.5L4 10h4.5L7 16.5 14 8H9.5z", accent: "M10 1.5L4 10h4.5L7 16.5 14 8H9.5z", gesture: "flash" },
  animateKinetic: { base: "M1.5 6h3.5M1.5 9h2.5M1.5 12h3.5", fill: "M7 4.5h4l5 4.5-5 4.5H7l5-4.5z", accent: "M7 4.5h4l5 4.5-5 4.5H7l5-4.5z", gesture: "slide" },
  jump: { base: "M2 16h14M2.5 15C3.6 10.6 5.6 7.6 8.2 6.4", fill: "M12 3a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", accent: "M12 3a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z", gesture: "bounce" },
  inertial: { base: "M1.5 15.5h15", accent: "M1.5 9c1.5 0 1.5-5.5 3.5-5.5s2 9 4 9 1.5-5 3-5 1.5 2.5 2.75 2.5 1.25-1 1.75-1", gesture: "settle" },
  wordReveal: { base: "M2.5 3h4M4.5 3v2.5M11.5 3h4M13.5 3v2.5", fill: "M2 9h6v6.5H2zM10 9h6v6.5h-6z", accent: "M2 9h6v6.5H2zM10 9h6v6.5h-6z", gesture: "rise" },
  variableMorph: { base: "M1.5 15L5 5l3.5 10M2.7 11.5h4.6", fill: "M11 5h4.5v10H11z", accent: "M11 5v10M15.5 5v10M11 10h4.5", gesture: "morph" },
  styleSwap: { base: "M2 3.5h7M5.5 3.5v7M2 15h4.5l-1.5-1.5", fill: "M9.5 7.5h7v8h-7z", accent: "M9.5 7.5h7M13 7.5v8", gesture: "swap" },
  beat: { base: "M1.5 16.5h15", accent: "M3 8.5v2M6 6v7M9 2.5v13M12 6v7M15 8.5v2", gesture: "equalize" },

  // Spatial
  lookAt: { base: "M1.5 9c3-4.5 12-4.5 15 0-3 4.5-12 4.5-15 0z", fill: "M9 6a3 3 0 1 1 0 6a3 3 0 1 1 0-6z", accent: "M9 7.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 1 1 0-2.5z", gesture: "look" },
  orbit: { base: "M9 5.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z", fill: "M9 5.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z", accent: "M2 10.5C1.5 8.5 5 7 9 7s7.5 1.5 7 3.5-3.5 2.5-7 2.5-6.5-.5-7-2.5zM15.5 4v.1", gesture: "spin" },
  cylinder: { base: "M2.5 4.75v8.5c0 1.25 2.9 2.25 6.5 2.25s6.5-1 6.5-2.25v-8.5", fill: "M9 2.5c3.6 0 6.5 1 6.5 2.25S12.6 7 9 7 2.5 6 2.5 4.75 5.4 2.5 9 2.5z", accent: "M9 2.5c3.6 0 6.5 1 6.5 2.25S12.6 7 9 7 2.5 6 2.5 4.75 5.4 2.5 9 2.5z", gesture: "turn" },
  cube: { base: "M2.5 5.5v7L9 16l6.5-3.5v-7M9 9v7", fill: "M9 2l6.5 3.5L9 9 2.5 5.5z", accent: "M9 2l6.5 3.5L9 9 2.5 5.5z", gesture: "turn" },
  cameraTransition: { base: "M2 5.5h9v7H2z", fill: "M11 8l5-2.5v7L11 10z", accent: "M11 8l5-2.5v7L11 10zM4 2.5h5", gesture: "dolly" },
  parallax: { base: "M8 6h4v6H8zM13 7.5h3v3h-3z", fill: "M2 4.5h5v9H2z", accent: "M2 4.5h5v9H2z", gesture: "parallax" },
  parallaxFull: { base: "M8 6h4v6H8zM13 7.5h3v3h-3zM2 16.5h14", fill: "M2 4.5h5v9H2z", accent: "M2 4.5h5v9H2zM2 14.5h5", gesture: "parallax" },

  // Shapes
  breakShape: { base: "M10.5 2.5h5v5h-5zM2.5 10.5h5v5h-5z", fill: "M2.5 2.5h5v5h-5zM10.5 10.5h5v5h-5z", accent: "M2.5 2.5h5v5h-5zM10.5 10.5h5v5h-5z", gesture: "spread" },
  shapeLibrary: { base: "M2.5 2.5h6v6h-6z", fill: "M12.5 9.5a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5z", accent: "M12.5 1.5l3.5 5.5h-7zM12.5 9.5a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5z", gesture: "pop" },
  trimPath: { base: "M2 13C5 4 11 4 16 8M16 8h.1", accent: "M2 13C3.4 8.8 5.6 6.4 8.2 5.6M2 13h.1", gesture: "draw" },
  textBox: { base: "M2 3.5h14v11H2z", fill: "M2 3.5h14v11H2z", accent: "M5 7.5h8M5 10.5h5", gesture: "rise" },
  effector: { base: "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z", fill: "M9 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z", accent: "M9 4.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9z", gesture: "pulse" },

  // Effects
  verticalPulse: { base: "M4 3h10M9 3v7.5", fill: "M9 11.5c3 0 5 1 5 2s-2 2-5 2-5-1-5-2 2-2 5-2z", accent: "M3 13.5c1-2 2-2 3 0s2 2 3 0 2-2 3 0 2 2 3 0", gesture: "pulse" },
  gradient: { base: "M2 2.5h14v9H2z", fill: "M2 11.5L16 2.5v9z", accent: "M2 15.5h14M5 13.5v4M12.5 13.5v4", gesture: "slide" },
  wave: { base: "M2 12.5c2-3 4-3 6 0s4 3 6 0", accent: "M2 6.5c2-3 4-3 6 0s4 3 6 0 2 1.5 2 1.5", gesture: "wave" },
  tile: { fill: "M2.5 2.5H9V9H2.5zM9 9h6.5v6.5H9z", accent: "M2.5 2.5h13v13h-13zM9 2.5v13M2.5 9h13", gesture: "pop" },
  glitch: { base: "M2.5 5h6M5 8.5h9M2 12h6", fill: "M10 3.5h5.5v3H10zM8 10.5h6v3H8z", accent: "M10 3.5h5.5v3H10zM8 10.5h6v3H8z", gesture: "glitch" },
  echo: { base: "M8.5 6.5H12v5H8.5zM13 7.5h2.5v3H13z", fill: "M2.5 5.5H7v7H2.5z", accent: "M2.5 5.5H7v7H2.5z", gesture: "trail" },
  particles: { base: "M5.5 12.5l1.5-1.5", fill: "M5 11a2 2 0 1 1 0 4a2 2 0 1 1 0-4z", accent: "M8.5 8.5h.1M11 5h.1M14.5 3h.1M12.5 9.5h.1M16 7h.1M9 2h.1M15.5 12h.1", gesture: "spread" },
  neon: { base: "M6.5 15h5M2 4.5a7 7 0 0 0 0 7M16 4.5a7 7 0 0 1 0 7", fill: "M5.5 12V7a3.5 3.5 0 0 1 7 0v5z", accent: "M5.5 12V7a3.5 3.5 0 0 1 7 0v5", gesture: "flash" },

  // Project
  aiToVector: { base: "M9 4l5.5 9.5h-11z", fill: "M9 4l5.5 9.5h-11z", accent: "M8 2.5h2v2H8zM2.5 12.5h2v2h-2zM13.5 12.5h2v2h-2z", gesture: "pop" },
  textToVector: { base: "M5 5h8M9 5v8", accent: "M4 4h2v2H4zM12 4h2v2h-2zM8 12h2v2H8z", gesture: "pop" },
  texture: { base: "M2 2h14v14H2z", fill: "M2 2h4.67v4.67H2zM11.33 2H16v4.67h-4.67zM6.67 6.67h4.66v4.66H6.67zM2 11.33h4.67V16H2zM11.33 11.33H16V16h-4.67z", accent: "M6.67 2v14M11.33 2v14M2 6.67h14M2 11.33h14", gesture: "slide" },
  clean: { base: "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z", fill: "M9 1.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z", accent: "M5.5 9.5l2.5 2.5 4.5-5", gesture: "draw" }
} as const satisfies Record<string, DuotoneDrawing>;

export type DuotoneToolId = keyof typeof DUOTONE_DRAWINGS;

/** Static drawing in layer order (fill, base, accent) — the identity used by tests and fallbacks. */
export function duotoneStaticPath(drawing: DuotoneDrawing): string {
  return [drawing.fill ?? "", drawing.base ?? "", drawing.accent].join("");
}
