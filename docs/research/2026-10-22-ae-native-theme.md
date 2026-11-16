# Tema nativo do After Effects

Question: synchronize the CEP panel with the current After Effects appearance without rebuilding the UI.
Decision date: 2026-10-22.
Target: After Effects 26.5x89, bundled CSInterface / CEP.
Status: available, runtime feature detection; screenshot palette fallback when unavailable.

| Claim | Symbol | Primary evidence | Notes |
|---|---|---|---|
| Host background colors are available | `getHostEnvironment().appSkinInfo.panelBackgroundColorSRGB.color`, `panelBackgroundColor.color` | [Adobe CSInterface](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/CSInterface.js), bundled `client/lib/CSInterface.js` AppSkinInfo | UIColor contains RGBColor under `color`; prefer sRGB, then regular RGB. |
| Host broadcasts appearance changes | `com.adobe.csxs.events.ThemeColorChanged` | Same official source, THEME_COLOR_CHANGED_EVENT | Subscribe once and remove the same listener on disposal. |
| Highlight may be OS provided | `systemHighlightColor` | Same official source, AppSkinInfo | Use only with sufficient control contrast; otherwise use readable blue. |

Implementation: `host-theme.ts` validates finite RGB channels in 0–255, preserves the exact rounded background and derives restrained surfaces with AA text and 3:1 control/focus contrast. Root CSS variables update without shell rendering or project mutation. Intermediate brightness levels narrow surface variation when necessary to retain contrast.

Fallback: screenshot measured #323232 background, #262626 deep and #393939 raised. Invalid/missing/throwing CEP skin uses it. Manual light/dark removes native inline overrides. Existing AE preferences migrate to automatic unless the new additive `aeTheme` choice was explicitly saved. Premiere continues its prior theme behavior.

Tests: sRGB precedence, regular RGB fallback, invalid input, event updates, manual overrides, listener disposal, preference migration and every gray level 0–255. Browser checks preserve the same numeric input node and draft across a theme event. No new permissions or host command contracts.

Runtime validation is recorded separately in `artifacts/ae-native/host-runtime.json`.
