---
name: designing-adobe-workstation-ui
description: "Designs and reviews the CrossHost plugin interface as a subtle Adobe-style workstation panel. Use for layouts, navigation, visual hierarchy, tokens, controls, responsive docking, iconography, interaction polish, or UI audits. Enforces the #1D1D1D dark direction and prevents crowded dashboard output."
---

# Designing an Adobe Workstation UI

This skill defines the visual taste and interaction discipline for the CrossHost panel. The product must feel like a focused professional tool inside After Effects or Premiere Pro, not a standalone SaaS dashboard.

Before designing or coding, read `docs/UI_FOUNDATION.md`, `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, `shared/product-ui-profile.json`, `packages/ui-tokens/src/tokens.css`, and `packages/ui-motion/src/motion.css`. The addendum is normative for Quick/Advanced interaction, accessibility, breakpoints, color and motion. Use `docs/design-references/target-minimal-parallax.png` only as directional evidence; simplify further whenever the active workflow allows it.

## Mandatory design read

Before producing UI code or a mockup, state internally:

> Reading this as a dockable motion-design workstation for professional editors, with a subtle Adobe-native dark language, minimal visual noise, compact controls, and one active task at a time.

Reference products such as BadFX, Brazu, and Premiere Composer are used to understand workflow density, discoverability, and speed. Do not copy their brand, assets, icon drawings, proprietary presets, or pixel layout.

## Product dials

Use these defaults unless a specific screen requires a documented override:

- `VISUAL_DENSITY: 3/10` — compact but not crowded.
- `LAYOUT_VARIANCE: 2/10` — orderly, predictable, grid-aligned.
- `MOTION_INTENSITY: 2/10` — functional feedback only.
- `HOST_AFFINITY: 9/10` — visually belongs inside Adobe.
- `DECORATION_LEVEL: 1/10` — almost no decoration without function.

Increasing feature count must not increase simultaneous visual density. Use progressive disclosure, search, categories, favorites, and focused tool views.

## Color foundation

The user-selected dashboard base is non-negotiable:

```css
--bg-host: #1D1D1D;
--bg-0: #0E1013;
--bg-1: #141619;
--bg-2: #1A1D21;
--bg-3: #22262B;
--bg-4: #2A2F35;
--accent: #7C8CFF;
```

The complete dark/light palette and AA-corrected implementation values live in `packages/ui-tokens/src/tokens.css`; never retype a partial palette in a component.

Rules:

- Neutral surfaces carry the interface; accent color carries selection and primary action only.
- No “AI glow,” mesh gradient, glassmorphism, or neon halo as a default. The violet-blue accent is semantic and must not become decoration.
- Use a one-pixel border or surface contrast, not both everywhere.
- Avoid pure black and pure white except tiny glyph details.
- Status must never depend on color alone.

## Typography

- Prefer the host/system UI stack; do not ship a decorative font for controls.
- Base size: 12–13 px depending on runtime rendering.
- Section title: 11–12 px, medium weight, subtle tracking only when uppercase.
- Tool title: 13–14 px, semibold.
- Numeric values: tabular numerals when supported.
- Keep labels short. Use tooltips or contextual help for explanation.
- No oversized headlines, marketing copy, or large logo block inside a docked panel.

## Spatial system

Use a 4 px base grid:

- micro gap: 4 px;
- control gap: 8 px;
- section gap: 12 px;
- major separation: 16 px;
- panel padding: 10–12 px in standard mode, 8 px in compact mode;
- control height: 28–30 px;
- icon button: 28–30 px;
- icon size: 16–18 px;
- border radius: 3–5 px;
- large card radius is prohibited.

Do not turn every group into a card. Prefer separators, twirl-down sections, compact rows, and a shared background.

## Information architecture

The default panel exposes only:

1. a narrow primary navigation or top tab row;
2. search when the current surface has enough items to justify it;
3. the active tool title and preset selector;
4. the active tool controls;
5. a small action footer when needed.

Do not show animation tools, assets, captions, presets, timeline preview, layer stack, and settings on one screen.

### Recommended views

- **Tool browser:** icon grid plus optional category rail; no parameter inspector until a tool is selected.
- **Tool editor:** one tool, grouped controls, Apply/Adjust/Bake/Remove actions.
- **Assets:** search, provider/category filters, virtualized result grid, details on selection.
- **Captions:** source → transcript → style → SFX as a staged workflow.
- **Settings:** plain rows and sections; no promotional content.

## Adobe-like control patterns

Prefer:

- twirl-down disclosure sections;
- label + slider + editable numeric value;
- compact dropdowns;
- segmented controls for mutually exclusive modes;
- icon buttons with tooltips for frequent spatial actions;
- explicit Apply, Adjust, Bake, Remove, and Reset actions;
- a subtle active rail or outline rather than a glowing tile;
- indeterminate/progress state next to the operation that owns it.

A slider must support a precise numeric value. A numeric value must define units and valid range. Reset should be local to the parameter or section, not hidden in a global menu.

## Responsive docking

Design and test four width classes:

### Compact: 280–339 px

- one column;
- icon-first navigation;
- labels may collapse only when tooltips remain available;
- no side inspector;
- advanced sections closed by default;
- primary action remains visible without horizontal scroll.

### Default: 340–479 px

- one main column;
- labeled navigation or compact tabs;
- two controls per row only for naturally paired values;
- presets may use two columns when thumbnails are essential.

### Comfort: 480–719 px

- four-column tool grid when the active surface supports it;
- a 320 px overlay Inspector with restrained dimming;
- keep primary actions visible and content order identical to the DOM.

### Wide: 720 px and above

- optional two-column tool editor;
- secondary inspector appears only when it reduces navigation cost;
- never stretch controls across the entire width; cap readable lines and fields.

The panel must also tolerate short heights. Preserve the active action area and scroll only the content region.

## Motion and feedback

Use motion only to explain state:

- consume the stable A6.2 IDs through `data-motion`; do not create component-local motion dialects;
- 90 ms hover/press transitions;
- 140–280 ms disclosure transitions when runtime performance is stable;
- 420 ms is the absolute ceiling for one-shot confirmation feedback;
- no looping decoration;
- no parallax, spring bounce, or animated gradient in the panel shell;
- respect the effective reduced-motion preference (`internal OR system`) and keep its toggle in Settings → Interface;
- animate only `transform` and `opacity` for motion; never animate layout while the user is dragging a slider.

Use inline validation and restrained toasts. Common messages must not open blocking modals.

## Iconography

- Use one consistent outline icon family or an original coherent set.
- Keep stroke weight and optical size consistent.
- Icons must represent actual actions; do not add icons merely to fill space.
- Text labels remain mandatory for uncommon or destructive actions.
- Never reproduce competitor icon paths.

## Required states

Every interactive feature must define:

- default;
- hover;
- focus-visible;
- pressed/active;
- disabled with reason;
- loading/progress;
- empty;
- success;
- warning;
- recoverable error;
- incompatible-host state.

The disabled state should explain what selection, host version, or permission is missing.

## Anti-patterns — reject during review

Reject a UI that contains any of these without a strong task-specific reason:

- a “dashboard” containing most product modules at once;
- card grids around every setting;
- more than one accent color competing for attention;
- gradients, glows, glass, or 3D decoration;
- large header branding in a narrow panel;
- deep nested borders;
- excessive rounded corners;
- labels smaller than the host UI;
- icon-only destructive actions;
- permanent preview areas that consume control space;
- asset thumbnails on non-asset screens;
- dense quick-action strips duplicated across views;
- browser-style navigation that ignores docking dimensions.

## Visual QA gate

Before marking a screen ready, capture and inspect it at:

- 280 × 640;
- 360 × 720;
- 480 × 800;
- 720 × 900;
- high-DPI scaling at 100%, 125%, 150%, and 200% where available.

Review:

- first focal point;
- number of simultaneous decisions;
- contrast and readable labels;
- clipping and horizontal overflow;
- keyboard focus order;
- section density;
- primary action visibility;
- whether the screen still looks native beside After Effects controls.

Use `docs/design-references/` as directional evidence. The target is a calmer, more focused result than the broad dashboard mockups.
