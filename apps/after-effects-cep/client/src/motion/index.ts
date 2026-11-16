/** AE motion layer (phase F0): catalog, clock seam and helpers shared by every AE view. */
export { AE_EASINGS, AE_MOTION_CATALOG, aeMotion, aeMotionCurve, aeMotionMs, type AeMotionDefinition, type CubicBezierTuple } from "./catalog.js";
export { browserMotionEnv, frameDriver, isReducedMotion, type MotionEnv } from "./env.js";
export { flip } from "./flip.js";
export { attachReflowGlide, attachReflowGlideTree, type ReflowGlideOptions } from "./reflow.js";
export { attachMicroInteractions, rangeProgress } from "./micro.js";
export { createHeightGlide, type HeightGlide } from "./glide.js";
export { attachWheelSmoothing, scrollDuration, scrollIntoViewSmooth, scrollParent, smoothScrollTo } from "./scroll.js";
export { createSpring, SPRING_GENTLE, SPRING_SNAPPY, type SpringHandle } from "./spring.js";
export { playStagger } from "./stagger.js";
export { swapText } from "./swap.js";
export { suspendTabStops } from "./tab-stops.js";
export { easeAt, tween, type TweenHandle } from "./tween.js";
