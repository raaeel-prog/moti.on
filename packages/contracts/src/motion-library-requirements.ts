/* eslint-disable no-var -- libraryRequiredEffects is serialized verbatim into the ES3 Adobe host. */
import type { MotionLibraryPreset } from "./motion-library.js";

/**
 * O que um preset da biblioteca exige da camada e da instalação.
 *
 * Fonte única para o host e para o painel. `libraryRequiredEffects` entra no
 * host montado por `toString()` (scripts/build-motion-library.mjs), e o
 * `preflight` de `ae.presets.apply` a chama para sondar cada efeito antes de
 * mutar. A galeria usa a mesma função para mostrar, antes do clique, o que o
 * preset pede. Por ir ao ExtendScript por `toString()`, a função não pode ler
 * nada de fora dela: sem `const`, sem closure, sem helpers.
 */
export function libraryRequiredEffects(p: { effect: string; collection?: string | undefined }): string[] {
  var e = p.effect;
  var r = ["ADBE Slider Control"];
  if (e.indexOf("camera-") === 0) r.push("ADBE Gaussian Blur 2");
  if (e === "camera-dark" || e === "camera-light") r.push("ADBE Tint");
  if (e === "camera-distort" || e === "camera-shake") r.push("ADBE Turbulent Displace");
  if (e === "blur" || e === "blur-wave") r.push("ADBE Gaussian Blur 2");
  if (e === "blur-wave") r.push("ADBE Wave Warp");
  if (e === "duotone" || e === "chroma2") r.push("ADBE Tint");
  if (e === "rgb" || e === "chroma2") r.push("Mettle SkyBox Chromatic Aberrat");
  if (e === "native-rgb" || e === "native-glitch") r.push("CHMS Motion Core");
  if (e === "contrast") { r.push("ADBE Brightness & Contrast 2"); r.push("ADBE HUE SATURATION"); }
  if (e === "turbulent") r.push("ADBE Turbulent Displace");
  if (e === "extrude" || e.indexOf("shadow") === 0) r.push("ADBE Drop Shadow");
  if (e === "shadow-stripes") { r.push("ADBE Venetian Blinds"); r.push("CC Composite"); }
  if (p.collection === "signature") {
    // Mesma tabela de host/src/signature-effects.jsx (LOOKS); o teste
    // tests/preset-requirements.test.mjs cobra a igualdade.
    var looks: Record<string, string[]> = {
      "film-burn": ["ADBE Turbulent Displace", "CC Burn Film", "ADBE Glo2"],
      "light-sweep": ["ADBE Exposure2", "CC Light Sweep"],
      "light-rays": ["CC Light Rays"],
      "bloom": ["ADBE Glo2"],
      "anamorphic": ["ADBE Motion Blur", "ADBE Glo2"],
      "gate-slip": ["ADBE Motion Blur"],
      "ink-bleed": ["ADBE Gaussian Blur 2", "ADBE Simple Choker"],
      "dust": ["CC Scatterize"],
      "smoke": ["ADBE Turbulent Displace", "ADBE Gaussian Blur 2"],
      "projector": ["ADBE Exposure2"],
      "halo": ["ADBE Glo2"]
    };
    var look = Object.prototype.hasOwnProperty.call(looks, e) ? looks[e] : null;
    if (look) for (var i = 0; i < look.length; i++) r.push(look[i] as string);
  }
  return r;
}

/** Efeito do plugin nativo Moti.on Core usado pelos presets de motion. */
export const MOTION_CORE_PRESET_EFFECT = "CHMS Motion Core";

export interface MotionLibraryRequirements {
  /** Tipo de camada que o preset aceita. `composition` é a transição em pré-comp. */
  readonly layer: "text" | "visual" | "composition";
  /** Precisa do plugin nativo Moti.on Core instalado. */
  readonly motionCore: boolean;
  /** Usa efeitos Cycore (incluídos no After Effects, mas desinstaláveis). */
  readonly cycore: boolean;
  /** Preset 3D: com câmera, parent ou pré-comp recolhida, a camada precisa ser 3D. */
  readonly threeD: boolean;
  /** Match names que o host sonda antes de aplicar. */
  readonly effects: readonly string[];
}

export function motionLibraryRequirements(p: MotionLibraryPreset): MotionLibraryRequirements {
  if (p.cameraSpec) {
    return {
      layer: "composition",
      motionCore: Boolean(p.cameraSpec.native),
      cycore: false,
      threeD: false,
      effects: p.cameraSpec.native ? ["ADBE Slider Control", "Moti.on Native Transition"] : []
    };
  }
  const effects = libraryRequiredEffects(p);
  return {
    layer: p.category.startsWith("text-") ? "text" : "visual",
    motionCore: effects.includes(MOTION_CORE_PRESET_EFFECT),
    cycore: effects.some((name) => name.startsWith("CC ")),
    threeD: p.category === "motion-3d",
    effects
  };
}
