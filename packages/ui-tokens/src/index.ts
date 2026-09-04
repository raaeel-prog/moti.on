/** Tema visual selecionado pelo adapter do host. */
export type UiThemeName = "dark" | "light";

export interface UiThemeTokens {
  readonly bg0: string;
  readonly bg1: string;
  readonly bg2: string;
  readonly bg3: string;
  readonly bg4: string;
  readonly lineHairline: string;
  readonly lineStrong: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentPress: string;
  readonly accentOn: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
}

/**
 * Valores consumiveis por tooling sem precisar interpretar CSS.
 *
 * `textTertiary` e `danger` trazem pequenos ajustes AA em relacao aos valores
 * ilustrativos do Addendum A. A tabela original ficava abaixo do proprio gate
 * de 4.5:1 em superficies permitidas; a acessibilidade normativa prevalece.
 */
export const DARK_THEME_TOKENS = Object.freeze({
  bg0: "#0E1013",
  bg1: "#141619",
  bg2: "#1A1D21",
  bg3: "#22262B",
  bg4: "#2A2F35",
  lineHairline: "#2C3137",
  lineStrong: "#707880",
  textPrimary: "#E9ECEF",
  textSecondary: "#AAB2BB",
  textTertiary: "#8E97A0",
  accent: "#7C8CFF",
  accentHover: "#9AA6FF",
  accentPress: "#6472F0",
  accentOn: "#0E1013",
  success: "#43B77A",
  warning: "#D9A441",
  danger: "#F76750",
  info: "#4CC2E0"
} satisfies UiThemeTokens);

export const LIGHT_THEME_TOKENS = Object.freeze({
  bg0: "#FFFFFF",
  bg1: "#F7F8F9",
  bg2: "#F1F2F4",
  bg3: "#E7E9EC",
  bg4: "#FFFFFF",
  lineHairline: "#DCDFE3",
  lineStrong: "#767E86",
  textPrimary: "#16181B",
  textSecondary: "#4E555C",
  textTertiary: "#626A72",
  accent: "#4A57D8",
  accentHover: "#3A46C4",
  accentPress: "#2F3AAC",
  accentOn: "#FFFFFF",
  success: "#146C43",
  warning: "#8A5A00",
  danger: "#BE382A",
  info: "#0F6E8C"
} satisfies UiThemeTokens);

export const MOTION_TOKENS = Object.freeze({
  duration1: 90,
  duration2: 140,
  duration3: 200,
  duration4: 280,
  duration5: 420,
  press: 60,
  popoverOut: 120,
  drawerOut: 170,
  ripple: 380,
  livePulse: 600,
  liveReduced: 1200,
  skeleton: 1200,
  progress: 0,
  progressReduced: 200,
  reduced: 1,
  stagger: 22,
  noDelay: 0,
  tooltipDelay: 600,
  previewDelay: 2000,
  spinnerDelay: 180,
  appliedDelay: 700,
  easeOut: "cubic-bezier(.16,1,.3,1)",
  easeIn: "cubic-bezier(.4,0,1,1)",
  easeStandard: "cubic-bezier(.2,0,0,1)",
  easePop: "cubic-bezier(.34,1.4,.64,1)",
  easeLinear: "linear",
  easeStepEnd: "steps(1,end)"
});

export function tokensForTheme(theme: UiThemeName): UiThemeTokens {
  return theme === "light" ? LIGHT_THEME_TOKENS : DARK_THEME_TOKENS;
}
