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
  COMFORT_MAX,
  anchorGrid,
  DEFAULT_MAX,
  button,
  checkboxField,
  clearNode,
  colorField,
  createElement,
  createShell,
  hint,
  logLine,
  normalizeHexColor,
  notice,
  numberField,
  propertyRow,
  resolveWidthClass,
  sectionTitle,
  searchField,
  selectField,
  textField,
  syncToolGridRoving,
  toolGrid,
  toolTile,
  type ButtonOptions,
  type AnchorGridOptions,
  type CheckboxFieldOptions,
  type ColorFieldOptions,
  type NoticeTone,
  type NumberFieldOptions,
  type RenderRegions,
  type RowTone,
  type SelectFieldOption,
  type SearchFieldOptions,
  type SelectFieldOptions,
  type TextFieldOptions,
  type Shell,
  type ShellOptions,
  type ShellView,
  type StatusState,
  type ToolTileOptions,
  type WidthClass
} from "./shell.js";

export { bezierEditor, type BezierEditorOptions } from "./bezier.js";

export {
  COMPONENT_STATES,
  createActionButton,
  createChipGroup,
  createDrawer,
  createPopover,
  createQuickTile,
  createQuickTileGrid,
  createSliderField,
  createToastRegion,
  type ActionButtonController,
  type ActionButtonOptions,
  type ChipGroupController,
  type ChipGroupOptions,
  type ChipItem,
  type ComponentScheduler,
  type ComponentState,
  type ComponentStateOptions,
  type DisableableController,
  type DisableableOptions,
  type DrawerController,
  type DrawerOptions,
  type OverlayCloseReason,
  type PopoverController,
  type PopoverOptions,
  type QuickTileController,
  type QuickTileGridController,
  type QuickTileGridOptions,
  type QuickTileOptions,
  type SliderFieldController,
  type SliderFieldOptions,
  type StatefulController,
  type ToastAction,
  type ToastHandle,
  type ToastOptions,
  type ToastRegionController,
  type ToastRegionOptions
} from "./components.js";
