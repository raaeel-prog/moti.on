---
name: building-crosshost-panel-ui
description: "Builds the shared HTML, CSS, TypeScript, state, and component layer for CrossHost panels in After Effects CEP and Premiere Pro UXP. Use for UI implementation, component architecture, responsive docking, form behavior, accessibility, localization, client-host communication, and visual regression tests."
---

# Building the CrossHost Panel UI

Use this skill to implement the visual system defined by `designing-adobe-workstation-ui` across the CEP and UXP clients without allowing host-specific details to leak through the component tree.

Before UI implementation, read `docs/ADDENDUM_A_QUICK_UX_SPEC.md` and consume `packages/ui-tokens/src/tokens.css` plus `packages/ui-motion/src/motion.css`. The addendum supersedes older §22.3/§22.4 interaction details; the host base remains `#1D1D1D` through the compatibility alias.

Use the shared `data-motion` IDs and reduced-motion controller from `@motion/ui-motion`. Both hosts expose the internal preference in Settings → Interface; host code may feature-detect storage/media support, but components must not fork the effective `internal OR system` rule.

## Architecture boundary

Organize the UI into four layers:

```text
presentation components
    ↓
feature state/controllers
    ↓
shared command client
    ↓
host adapter (AE CEP or Premiere UXP)
```

Presentation components must not call `evalScript`, `premierepro`, filesystem APIs, network providers, or native workers directly.

## Runtime strategy

- Follow the repository stack. Do not migrate frameworks as a side effect of a feature.
- Prefer standards-based HTML/CSS and TypeScript compiled to the JavaScript level supported by each host.
- Use the intersection of CEP Chromium and UXP capabilities unless a host-specific stylesheet is isolated and tested.
- Feature-detect browser APIs. Never assume Node.js globals in UXP or a modern browser API in CEP.
- Do not load remote scripts, fonts, or executable code.
- Keep a separate host adapter for lifecycle, theme, persistence, filesystem, and command transport.

## Shared component primitives

Build and reuse a small, explicit set:

- `PanelShell`
- `PrimaryNav`
- `ToolBrowser`
- `ToolHeader`
- `DisclosureSection`
- `ControlRow`
- `SliderField`
- `NumberField`
- `SelectField`
- `SegmentedControl`
- `IconButton`
- `ActionBar`
- `InlineNotice`
- `ProgressRow`
- `EmptyState`
- `VirtualAssetGrid`
- `BezierEditor`

Do not create one-off visual variants when a token or composition change is sufficient.

## Component contracts

Every field component must accept:

- stable `id`;
- localized label and optional description;
- value and unit;
- validation rules;
- disabled state with a reason;
- default value and reset behavior;
- change and commit events;
- keyboard behavior;
- optional capability requirement.

Separate continuous preview from committed host mutation:

- `onInput` updates local preview state;
- `onCommit` sends a command after debounce or pointer release;
- expensive operations require explicit Apply;
- repeated events must be cancelable or coalesced.

## State model

Use explicit states instead of scattered booleans:

```ts
type FeatureStatus =
  | 'idle'
  | 'validating'
  | 'ready'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'unsupported';
```

Keep these domains separate:

- navigation state;
- persisted user preferences;
- draft feature inputs;
- host context snapshot;
- capability matrix;
- async job state;
- result/error state.

Do not persist transient host selections or project media paths unless the product contract requires it.

## Command client

All host calls use a typed envelope with:

- command ID;
- request ID;
- schema version;
- host context version when relevant;
- validated payload;
- timeout/cancellation metadata;
- structured result.

The UI must ignore stale responses from superseded requests. Never infer success from the absence of an exception.

## Form behavior

- Validate locally before sending a command.
- Clamp only when the contract explicitly allows it; otherwise show the invalid value.
- Support arrow-key increments and modifier-based fine/coarse increments.
- Preserve user-entered decimal precision when practical.
- Display units beside the editable value.
- Avoid Apply buttons for safe, cheap local preferences; use Apply for host mutations.
- Disable the action while an identical command is running unless concurrency is supported.

## Keyboard and accessibility

- Provide a deterministic tab order.
- Use native controls where possible.
- Add ARIA labels only where the runtime supports them and test actual behavior.
- All icon buttons need accessible names and tooltips.
- Focus must remain visible against `#1D1D1D`.
- Escape closes menus/popovers without losing the current draft.
- Enter commits focused numeric input where expected.
- The Bézier editor must expose keyboard alternatives for handle values.
- Respect reduced motion and high-contrast needs.

## Localization

- Keep all visible text in locale files from the start.
- Support at least `pt-BR` and `en-US`.
- Do not concatenate translated fragments into sentences.
- Keep command IDs, schema keys, match names, and telemetry event names language-neutral.
- Test long labels and decimal separators without changing the internal numeric representation.

## Dock responsiveness

Implement width and height queries in application state or CSS where supported. At minimum:

- 280–339 px: compact, two-column tool grid and full-panel Inspector;
- 340–479 px: default, three-column grid and overlay Inspector;
- 480–719 px: comfort, four-column grid and 320 px Inspector;
- 720 px+: wide split layout with a fixed 360 px Inspector;
- short-height mode: sticky local action bar, scrollable content region.

Never hide a required input only because the panel is narrow. Move it behind a disclosure section or change the composition.

## Performance rules

- Avoid full-tree rerenders during slider drag.
- Debounce search between 250 and 400 ms.
- Virtualize large asset or preset collections.
- Decode thumbnails at display size.
- Remove event listeners in panel lifecycle cleanup.
- Batch host-context refreshes.
- Use one animation frame for coordinated DOM writes.
- Keep first useful paint within the product budget.

## Testing

Required UI tests:

- component state transitions;
- keyboard navigation;
- validation and units;
- stale-response rejection;
- cancellation;
- locale expansion;
- compact/standard/wide screenshots;
- empty/loading/error/unsupported snapshots;
- host theme and scaling smoke tests.

Browser tests are necessary but not sufficient. Repeat visual and interaction checks inside both host runtimes.

## Review gate

A panel change passes only when:

- it follows `docs/UI_FOUNDATION.md` tokens;
- it presents one primary task;
- it works at the minimum width;
- host APIs are accessed only through adapters;
- all asynchronous states are visible and recoverable;
- keyboard and focus behavior work;
- no remote executable asset is introduced;
- visual regression evidence exists for all width classes.
