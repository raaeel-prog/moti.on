import type { MotionLibraryPreset } from "./motion-library.js";

/** Impulso / Momentum: original recipes built on three techniques studied in the
 * 2026-10-12 market research (docs/research/2026-10-12-ac4-badfx-rea.md):
 * physical settles tuned live, travel that really leaves the composition and
 * turns around a distant transition center. No third-party preset, expression,
 * name or asset is embedded. Keep IDs stable: projects and favorites persist them.
 *
 * Distances are nominal pixels for a 1080-pixel-high composition. With
 * travel "offscreen" only the authored direction matters; the host measures the
 * distance. Recipes without a fade start invisible by geometry: out of frame or
 * at zero scale on an axis. */
type Recipe = Partial<Omit<MotionLibraryPreset, "text">>;
function recipe(id: string, pt: string, en: string, category: MotionLibraryPreset["category"], config: Recipe): MotionLibraryPreset {
  return {
    id: `momentum-${id}`, name: { "pt-BR": pt, "en-US": en }, category,
    referenceIndex: null, collection: "momentum", mode: "transition", easing: "settle-wave",
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
    fade: false, waveform: "none", effect: "none", effectAmount: 0, effectAngle: 0, pivot: "anchor",
    ...config,
    defaults: { durationFrames: 30, intensity: 100, direction: "preset", staggerFrames: 0, ...config.defaults },
    text: { unit: "all", random: false, decode: false, tracking: 0, skew: 0, mask: false }
  };
}
/** Settle defaults: amplitude or first hop (%), oscillations or hops, damping (%). */
function settle(amount: number, count: number, damping: number): Pick<NonNullable<MotionLibraryPreset["defaults"]>, "settleAmount" | "settleCount" | "settleDamping"> {
  return { settleAmount: amount, settleCount: count, settleDamping: damping };
}

export const MOTION_LIBRARY_MOMENTUM_PRESETS: readonly MotionLibraryPreset[] = [
  recipe("push", "Empurrão", "Push Through", "motion-2d", {
    position: [0, 1000, 0], travel: "offscreen",
    defaults: { durationFrames: 30, ...settle(30, 2, 55) }
  }),
  recipe("push-spin", "Arremesso giratório", "Spin Throw", "motion-2d", {
    position: [-1000, 0, 0], rotation: [0, 0, -120], travel: "offscreen",
    defaults: { durationFrames: 32, ...settle(26, 1.5, 60) }
  }),
  recipe("push-grow", "Salto crescente", "Growing Leap", "motion-2d", {
    position: [0, 1000, 0], scale: [-100, -100, 0], travel: "offscreen", easing: "settle-hop",
    defaults: { durationFrames: 30, ...settle(36, 3, 62) }
  }),
  recipe("push-shrink", "Mergulho de perto", "Close Dive", "motion-2d", {
    position: [0, -1000, 0], scale: [200, 200, 0], travel: "offscreen", fade: true, easing: "velvet",
    defaults: { durationFrames: 26 }
  }),
  recipe("stretch-x", "Estalo na largura", "Width Snap", "motion-2d", {
    scale: [-100, 0, 0], defaults: { durationFrames: 28, ...settle(40, 3, 50) }
  }),
  recipe("stretch-y", "Estalo na altura", "Height Snap", "motion-2d", {
    scale: [0, -100, 0], defaults: { durationFrames: 28, ...settle(40, 3, 50) }
  }),
  recipe("spin", "Giro de chegada", "Arrival Spin", "motion-2d", {
    rotation: [0, 0, -125], fade: true, defaults: { durationFrames: 30, ...settle(30, 2, 55) }
  }),
  recipe("twist", "Torção", "Twist In", "motion-2d", {
    scale: [-100, -100, 0], rotation: [0, 0, -180], easing: "settle-hop",
    defaults: { durationFrames: 30, ...settle(30, 2, 65) }
  }),
  recipe("pendulum", "Pêndulo", "Pendulum Swing", "motion-2d", {
    rotation: [0, 0, -38], fade: true, pivot: "offset", pivotOffset: [0, -2.4],
    defaults: { durationFrames: 40, ...settle(45, 2.5, 40) }
  }),
  recipe("zoom-through", "Atravessar a lente", "Through the Lens", "motion-2d", {
    scale: [200, 200, 0], fade: true, easing: "drift", defaults: { durationFrames: 24 }
  }),
  recipe("tumble-x", "Capotagem", "Forward Tumble", "motion-3d", {
    rotation: [360, 0, 0], fade: true, defaults: { durationFrames: 34, ...settle(25, 1.5, 60) }
  }),
  recipe("tumble-y", "Rodopio", "Turnstile Spin", "motion-3d", {
    rotation: [0, 360, 0], fade: true, defaults: { durationFrames: 34, ...settle(25, 1.5, 60) }
  }),
  recipe("depth-drop", "Queda em profundidade", "Depth Drop", "motion-3d", {
    position: [0, 0, -1400], fade: true, easing: "settle-hop",
    defaults: { durationFrames: 32, ...settle(34, 3, 60) }
  }),
  recipe("deep-pendulum", "Pêndulo profundo", "Deep Pendulum", "motion-3d", {
    rotation: [0, 0, -55], position: [0, 0, 500], fade: true, pivot: "offset", pivotOffset: [0, -3],
    defaults: { durationFrames: 44, ...settle(40, 2, 45) }
  }),
  // Swings in around one of its own edges (Direction picks the edge), with a ricochet.
  recipe("hinge", "Dobradiça", "Hinge Swing", "motion-2d", {
    rotation: [0, 0, -75], fade: true, pivot: "edge",
    defaults: { durationFrames: 34, direction: "left", ...settle(38, 2, 50) }
  }),
  // Loops: a hanging sign swinging around the transition center above it, a heartbeat
  // and a coin turning on its vertical axis in 3D.
  recipe("pendulum-loop", "Pêndulo contínuo", "Swinging Loop", "motion-effects", {
    mode: "continuous", waveform: "cosine", rotation: [0, 0, 14], pivot: "offset", pivotOffset: [0, -2.4], easing: "smooth",
    defaults: { speed: 60 }
  }),
  recipe("heartbeat", "Batida", "Heartbeat", "motion-effects", {
    mode: "continuous", waveform: "heartbeat", scale: [14, 14, 0], easing: "smooth",
    defaults: { speed: 100 }
  }),
  recipe("coin-spin", "Giro de moeda", "Coin Spin", "motion-3d", {
    mode: "continuous", waveform: "spin", rotation: [0, 180, 0], easing: "smooth",
    defaults: { speed: 100 }
  }),
  recipe("spin-loop", "Rotação contínua", "Steady Spin", "motion-effects", {
    mode: "continuous", waveform: "spin", rotation: [0, 0, 90], easing: "smooth",
    defaults: { speed: 100 }
  }),
  recipe("blink", "Piscar", "Blink", "motion-effects", {
    mode: "continuous", waveform: "blink", fade: true, easing: "smooth",
    defaults: { speed: 100 }
  })
];
