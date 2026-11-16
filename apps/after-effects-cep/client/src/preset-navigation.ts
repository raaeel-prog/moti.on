import type { MotionLibraryPreset } from "@motion/contracts";

/** Browse-only metadata. Never changes recipe IDs, categories or animation units. */
export const TEXT_PRESET_FAMILIES = [
  ["fade", "Opacidade (Fade)", "Opacity (Fade)"],
  ["position", "Posição", "Position"],
  ["position-scale", "Posição + Escala", "Position + Scale"],
  ["scale", "Escala", "Scale"],
  ["scale-tracking", "Escala + Espaçamento", "Scale + Tracking"],
  ["tracking", "Espaçamento", "Tracking"],
  ["rotation", "Rotação", "Rotation"],
  ["reveal", "Revelação", "Reveal"],
  ["blur", "Desfoque", "Blur"],
  ["effects", "Efeitos", "Effects"],
  ["other", "Outros", "Other"]
] as const;
export type TextPresetFamily = typeof TEXT_PRESET_FAMILIES[number][0];
export type TextPresetCategory = "text-characters" | "text-words" | "text-lines";
export interface TextPresetNavigation { category: TextPresetCategory; family: TextPresetFamily; filter: string; }

/** The authored operation determines the main family, independent of names,
 * locale and the user's draft. Effects/reveals take precedence over supporting
 * transforms; combined transform families take precedence over single axes. */
export function textPresetNavigation(preset: MotionLibraryPreset): TextPresetNavigation | undefined {
  if (!["text-characters", "text-words", "text-lines"].includes(preset.category)) return undefined;
  const position = preset.position.some(value => value !== 0), scale = preset.scale.some(value => value !== 0);
  const rotation = preset.rotation.some(value => value !== 0), tracking = preset.text.tracking !== 0;
  const family: TextPresetFamily = preset.text.decode || preset.text.mask || preset.text.reveal ? "reveal"
    : preset.effect === "blur" || preset.effect === "blur-wave" ? "blur"
    : preset.effect !== "none" || preset.text.fill ? "effects"
    : scale && tracking ? "scale-tracking" : position && scale ? "position-scale"
    : rotation || preset.text.skew !== 0 ? "rotation" : position ? "position" : scale ? "scale"
    : tracking ? "tracking" : preset.text.blur ? "blur" : preset.fade ? "fade" : "other";
  const category = preset.category as TextPresetCategory;
  return { category, family, filter: `${category}/${family}` };
}

/** Subfolders of the motion and cut-transition folders, by what the preset does on screen.
 * Browse-only like the text families: recipe IDs and categories never change. */
export const MOTION_PRESET_FAMILIES = [
  ["movement", "Movimento", "Movement"],
  ["blur", "Desfoque", "Blur"],
  ["reveal", "Revelação", "Reveal"],
  ["color", "Cor e contraste", "Color & contrast"],
  ["depth", "Profundidade e sombra", "Depth & shadow"],
  ["looks", "Looks", "Looks"],
  ["zoom", "Zoom", "Zoom"],
  ["light", "Luz", "Light"],
  ["dark", "Escuridão", "Darkness"],
  ["distort", "Distorção", "Distortion"],
  ["shake", "Tremor", "Shake"],
  ["spin", "Giro", "Spin"],
  ["film", "Película", "Film"],
  ["other", "Outros", "Other"]
] as const;
export type MotionPresetFamily = typeof MOTION_PRESET_FAMILIES[number][0];
export type MotionPresetCategory = "motion-2d" | "motion-3d" | "motion-effects" | "camera-transitions";
export const MOTION_PRESET_CATEGORIES: readonly MotionPresetCategory[] = ["motion-2d", "motion-3d", "motion-effects", "camera-transitions"];
export interface MotionPresetNavigation { category: MotionPresetCategory; family: MotionPresetFamily; filter: string; }
export type PresetBrowseNavigation = TextPresetNavigation | MotionPresetNavigation;

const COLOR_EFFECTS = new Set(["rgb", "native-rgb", "chroma2", "contrast", "duotone", "turbulent"]);

/** The family follows the authored effect; transitions use the gallery category they are shown in. */
export function motionPresetNavigation(preset: MotionLibraryPreset, galleryCategory: string): MotionPresetNavigation | undefined {
  if (!(MOTION_PRESET_CATEGORIES as readonly string[]).includes(galleryCategory)) return undefined;
  const effect = preset.effect;
  const family: MotionPresetFamily = preset.filmSpec ? "film"
    : effect.startsWith("look-") ? "looks"
    : effect.startsWith("reveal-") ? "reveal"
    : effect === "blur" || effect === "blur-wave" ? "blur"
    : COLOR_EFFECTS.has(effect) ? "color"
    : effect === "extrude" || effect.startsWith("shadow") ? "depth"
    : effect === "camera-zoom" ? "zoom" : effect === "camera-light" ? "light" : effect === "camera-dark" ? "dark"
    : effect === "camera-distort" ? "distort" : effect === "camera-shake" ? "shake" : effect === "camera-spin" ? "spin"
    : effect === "none" ? "movement" : "other";
  const category = galleryCategory as MotionPresetCategory;
  return { category, family, filter: `${category}/${family}` };
}
