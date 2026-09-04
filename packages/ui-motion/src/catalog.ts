export type MotionKind = "transition" | "feedback" | "progress";

export type ReducedMotionBehavior =
  | "instant"
  | "opacity-only"
  | "paint-only"
  | "preserve"
  | "shorten"
  | "static"
  | "suppress";

export interface MotionDefinition {
  readonly number: number;
  readonly id: string;
  readonly kind: MotionKind;
  readonly properties: readonly string[];
  readonly durationTokens: readonly string[];
  readonly durationMs: readonly number[];
  readonly easingToken: string | null;
  readonly delayToken: string | null;
  readonly reducedMotion: ReducedMotionBehavior;
}

type MutableMotionDefinition = {
  number: number;
  id: string;
  kind: MotionKind;
  properties: string[];
  durationTokens: string[];
  durationMs: number[];
  easingToken: string | null;
  delayToken?: string;
  reducedMotion: ReducedMotionBehavior;
};

function definition(value: MutableMotionDefinition): MotionDefinition {
  return Object.freeze({
    ...value,
    properties: Object.freeze([...value.properties]),
    durationTokens: Object.freeze([...value.durationTokens]),
    durationMs: Object.freeze([...value.durationMs]),
    delayToken: value.delayToken ?? null
  });
}

/** Catálogo A6.2, na ordem normativa e com IDs estáveis para CSS/tooling. */
export const MOTION_CATALOG: readonly MotionDefinition[] = Object.freeze([
  definition({ number: 1, id: "tile-hover", kind: "transition", properties: ["transform", "background-color"], durationTokens: ["--dur-1"], durationMs: [90], easingToken: "--ease-std", reducedMotion: "paint-only" }),
  definition({ number: 2, id: "tile-press", kind: "transition", properties: ["transform"], durationTokens: ["--dur-press"], durationMs: [60], easingToken: "--ease-in", reducedMotion: "preserve" }),
  definition({ number: 3, id: "tile-advanced", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-1"], durationMs: [90], easingToken: "--ease-out", reducedMotion: "opacity-only" }),
  definition({ number: 4, id: "tooltip-enter", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-2"], durationMs: [140], easingToken: "--ease-out", delayToken: "--delay-tooltip", reducedMotion: "opacity-only" }),
  definition({ number: 5, id: "preview-enter", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-3"], durationMs: [200], easingToken: "--ease-pop", delayToken: "--delay-preview", reducedMotion: "opacity-only" }),
  definition({ number: 6, id: "preview-exit", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-popover-out"], durationMs: [120], easingToken: "--ease-in", reducedMotion: "opacity-only" }),
  definition({ number: 7, id: "drawer-enter", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-4", "--dur-popover-out"], durationMs: [280, 120], easingToken: "--ease-out", reducedMotion: "shorten" }),
  definition({ number: 8, id: "drawer-exit", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-drawer-out"], durationMs: [170], easingToken: "--ease-in", reducedMotion: "opacity-only" }),
  definition({ number: 9, id: "drawer-dimmer", kind: "transition", properties: ["opacity"], durationTokens: ["--dur-4", "--dur-drawer-out"], durationMs: [280, 170], easingToken: "--ease-std", reducedMotion: "preserve" }),
  definition({ number: 10, id: "drawer-stagger", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-2"], durationMs: [140], easingToken: "--ease-out", reducedMotion: "opacity-only" }),
  definition({ number: 11, id: "tab-indicator", kind: "transition", properties: ["transform"], durationTokens: ["--dur-3"], durationMs: [200], easingToken: "--ease-std", reducedMotion: "instant" }),
  definition({ number: 12, id: "view-enter", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-2"], durationMs: [140], easingToken: "--ease-out", reducedMotion: "opacity-only" }),
  definition({ number: 13, id: "toast-enter", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-3"], durationMs: [200], easingToken: "--ease-pop", reducedMotion: "opacity-only" }),
  definition({ number: 14, id: "toast-exit", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-2"], durationMs: [140], easingToken: "--ease-in", reducedMotion: "opacity-only" }),
  definition({ number: 15, id: "confirmation-check", kind: "feedback", properties: ["stroke-dashoffset"], durationTokens: ["--dur-5"], durationMs: [420], easingToken: "--ease-out", reducedMotion: "static" }),
  definition({ number: 16, id: "tile-ripple", kind: "feedback", properties: ["opacity", "transform"], durationTokens: ["--dur-ripple"], durationMs: [380], easingToken: "--ease-out", reducedMotion: "suppress" }),
  definition({ number: 17, id: "live-control-pulse", kind: "feedback", properties: ["box-shadow"], durationTokens: ["--dur-live-pulse", "--dur-live-reduced"], durationMs: [600, 1200], easingToken: "--ease-std", reducedMotion: "static" }),
  definition({ number: 18, id: "slider-knob", kind: "transition", properties: ["transform"], durationTokens: ["--dur-1"], durationMs: [90], easingToken: "--ease-out", reducedMotion: "preserve" }),
  definition({ number: 19, id: "slider-track", kind: "transition", properties: ["transform"], durationTokens: ["--dur-progress", "--dur-1"], durationMs: [0, 90], easingToken: "--ease-std", reducedMotion: "preserve" }),
  definition({ number: 20, id: "asset-skeleton", kind: "progress", properties: ["opacity", "transform"], durationTokens: ["--dur-skeleton"], durationMs: [1200], easingToken: "--ease-linear", reducedMotion: "static" }),
  definition({ number: 21, id: "progress-bar", kind: "progress", properties: ["transform"], durationTokens: ["--dur-progress", "--dur-progress-reduced"], durationMs: [0, 200], easingToken: "--ease-linear", reducedMotion: "preserve" }),
  definition({ number: 22, id: "preset-chip", kind: "transition", properties: ["background-color", "transform"], durationTokens: ["--dur-1"], durationMs: [90], easingToken: "--ease-pop", reducedMotion: "paint-only" }),
  definition({ number: 23, id: "command-palette", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-3"], durationMs: [200], easingToken: "--ease-out", reducedMotion: "opacity-only" }),
  definition({ number: 24, id: "context-alert", kind: "transition", properties: ["background-color"], durationTokens: ["--dur-2"], durationMs: [140], easingToken: "--ease-std", reducedMotion: "preserve" }),
  definition({ number: 25, id: "empty-state", kind: "transition", properties: ["opacity", "transform"], durationTokens: ["--dur-3"], durationMs: [200], easingToken: "--ease-out", reducedMotion: "opacity-only" })
]);
