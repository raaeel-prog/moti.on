/**
 * Ponto de entrada de `@motion/ui-core`.
 *
 * Camada de apresentação compartilhada pelos dois painéis. Nada aqui conhece
 * After Effects, Premiere, `evalScript`, filesystem ou rede: o shell recebe
 * regiões para preencher e devolve eventos, e quem liga isso ao host é o `main`
 * de cada app.
 */

export {
  CATALOGS,
  FALLBACK_LOCALE,
  type MessageKey
} from "./locales.js";

export {
  createI18n,
  interpolate,
  normalizeLocale,
  type I18n,
  type I18nOptions,
  type MessageParams
} from "./i18n.js";

export {
  COMPACT_MAX,
  STANDARD_MAX,
  button,
  checkboxField,
  clearNode,
  createElement,
  createShell,
  logLine,
  notice,
  numberField,
  propertyRow,
  resolveWidthClass,
  sectionTitle,
  selectField,
  type ButtonOptions,
  type CheckboxFieldOptions,
  type NoticeTone,
  type NumberFieldOptions,
  type RenderRegions,
  type RowTone,
  type SelectFieldOption,
  type SelectFieldOptions,
  type Shell,
  type ShellOptions,
  type ShellView,
  type StatusState,
  type WidthClass
} from "./shell.js";
