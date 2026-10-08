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
  anchorGrid,
  button,
  checkboxField,
  clearNode,
  colorField,
  createElement,
  createIcon,
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
  CURVE_PAD, CURVE_PLOT, createCurveEditor, curveToPlot, plotToCurve, speedPathD, valuePathD,
  type CurveCommitReason, type CurveEditor, type CurveEditorLabels, type CurveEditorModel, type CurveEditorOptions, type PlotRange
} from "./curve-editor.js";

export {
  COMPONENT_STATES,
  createBadge,
  type BadgeOptions,
  type BadgeController,
  type FeedbackTone,
  type ToastRegionLabels,
  createActionButton,
  createAlert,
  createChipGroup,
  createDrawer,
  createPopover,
  createQuickTile,
  createQuickTileGrid,
  createSkeleton,
  createSliderField,
  createSpinner,
  createSpinnerContainer, createEmptyState,
  createToastRegion,
  type ActionButtonController,
  type ActionButtonOptions,
  type AlertController,
  type AlertOptions,
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

export {
  createToolBrowser,
  type ToolBrowser,
  type ToolBrowserItem,
  type ToolBrowserOptions,
  type ToolBrowserTexts
} from "./tool-browser.js";

export * from "./asset-components.js";
export * from "./panel-preferences.js";

export * from "./feedback.js";

export { attachCompactNumberEditing, attachScrubbableNumber, type ScrubbableNumberOptions } from "./scrubbable-number.js";
export {
  registerMotiButton,
  type MotiButton,
  type MotiButtonConstructor,
  type ButtonVariant
} from "./elements/moti-button.js";

export { createPanelActionBar, type PanelActionBar, type PanelActionBarOptions } from "./panel-action-bar.js";
export { createDiagnosticsView, type DiagnosticsView, type DiagnosticsViewOptions, type DiagnosticEntry } from "./diagnostics-view.js";

export { registerMotiToast, type MotiToast, type MotiToastConstructor } from "./elements/moti-toast.js";

export { registerMotiDropdown, type MotiDropdown, type MotiDropdownConstructor } from "./elements/moti-dropdown.js";

export { registerMotiAlert, type MotiAlert, type MotiAlertConstructor } from "./elements/moti-alert.js";
export { registerMotiBadge, type MotiBadge, type MotiBadgeConstructor } from "./elements/moti-badge.js";

export { registerMotiSlider, type MotiSlider, type MotiSliderConstructor } from "./elements/moti-slider.js";

export { registerMotiPopover, type MotiPopover, type MotiPopoverConstructor } from "./elements/moti-popover.js";
export { registerMotiDrawer, type MotiDrawer, type MotiDrawerConstructor } from "./elements/moti-drawer.js";

export { ICON_CATALOG, type IconDefinition, type IconId, type IconFamily, type IconGesture } from "./icons.js";

export {
  closeOpenColorPicker, colorSurfaceChrome, configureColorPickers, createColorPicker, hasColorDraft, isColorPickerOpen, resolveColorSurfaceLayout, supportsColorOverlay,
  type ColorPicker, type ColorPickerConfig, type ColorPickerOptions, type ColorSurfaceLayout
} from "./elements/color-view.js";
export { clampHsv, hexToHsv, hexToRgb, hsvToHex, hsvToRgb, rgbToHex, rgbToHsv, type Hsv, type Rgb } from "./color-math.js";
export { pluralCategory } from "./i18n.js";
export { attachActionOverflow, closeOpenActionMenu, type ActionOverflow, type ActionOverflowOptions } from "./action-overflow.js";
