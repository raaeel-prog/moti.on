/** Tema visual selecionado pelo adapter do host. */
export type UiThemeName = "dark" | "light";

export interface UiThemeTokens {
  readonly bg0: string;
  readonly bg1: string;
  readonly bg2: string;
  readonly bg3: string;
  readonly bg4: string;
  readonly surfaceRaised: string;
  readonly surfaceHover: string;
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
  bg0: "#1D1D1D",
  bg1: "#1D1D1D",
  bg2: "#1D1D1D",
  bg3: "#262626",
  bg4: "#303030",
  surfaceRaised: "#262626",
  surfaceHover: "#303030",
  lineHairline: "#454545",
  lineStrong: "#B5B5B5",
  textPrimary: "#F7F7F7",
  textSecondary: "#B5B5B5",
  textTertiary: "#B5B5B5",
  accent: "#FFFFFF",
  accentHover: "#F7F7F7",
  accentPress: "#E0E0E0",
  accentOn: "#1D1D1D",
  success: "#75D5A1",
  warning: "#EFC16C",
  danger: "#FF9C8F",
  info: "#9BD8E8"
} satisfies UiThemeTokens);

export const LIGHT_THEME_TOKENS = Object.freeze({
  bg0: "#FFFFFF",
  bg1: "#F7F8F9",
  bg2: "#F1F2F4",
  bg3: "#E7E9EC",
  bg4: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceHover: "#E7E9EC",
  lineHairline: "#DCDFE3",
  lineStrong: "#767E86",
  textPrimary: "#16181B",
  textSecondary: "#4E555C",
  textTertiary: "#626A72",
  accent: "#343A40",
  accentHover: "#212529",
  accentPress: "#495057",
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
