---
name: developing-after-effects-cep
description: "Implements After Effects features through a CEP panel and ExtendScript host layer. Use for compositions, layers, properties, effects, expressions, keyframes, cameras, shapes, imports, Undo groups, CEP bridges, ExtendScript compatibility, and After Effects host testing."
---

# Developing After Effects CEP Features

Use this skill for any code executed by the After Effects panel or ExtendScript host. Treat the client and host as separate runtimes with a strict command protocol.

Activate `researching-adobe-capabilities` whenever a DOM symbol, CEP behavior, manifest range, scripting preference, packaging rule, or native SDK boundary is uncertain. Distinguish official Adobe-owned CEP material from community-maintained After Effects scripting references.

## Runtime split

```text
CEP client: HTML/CSS/compiled JavaScript
    ↕ CSInterface.evalScript with serialized command envelope
ExtendScript host: conservative ECMAScript 3-compatible code
    ↕ After Effects scripting DOM
After Effects project
```

The CEP client may use modern source code after compilation. The host layer must remain compatible with the supported ExtendScript engine.

## Host-code language rules

In ExtendScript host files:

- use `var` and named functions;
- avoid arrow functions, classes, template literals, promises, modules, optional chaining, and modern collection methods;
- do not depend on native `JSON` unless the project supplies and tests a polyfill;
- avoid locale-dependent property display names;
- avoid implicit globals;
- keep line endings, encoding, and bundling deterministic;
- isolate any polyfills and test them in the actual host.

## Command boundary

The host executes only allowlisted command IDs. Never evaluate arbitrary user-supplied JavaScript or expression source as host code.

A command handler must:

1. parse and validate the envelope;
2. validate the active project, composition, selection, and required property types;
3. resolve every target before mutation;
4. capture state that must be restored;
5. open one named Undo group;
6. perform the operation;
7. close the Undo group in a `finally` path;
8. return a serialized structured result.

Do not return plain strings that require UI-side parsing.

## Undo and failure safety

- Call `app.beginUndoGroup()` only after preflight succeeds.
- Ensure `app.endUndoGroup()` executes exactly once.
- Prefer no mutation over partial mutation.
- When a multi-layer operation can fail mid-run, prepare all target references and values first.
- If rollback is feasible and needed, implement it explicitly; Undo is not a substitute for internal consistency.
- Preserve active item, selected layers/properties, and current time when the command contract says so.

## DOM targeting

- Use stable `matchName` values for effects and properties whenever available.
- Never use translated display names as logic keys.
- Check layer class/type before accessing type-specific properties.
- Respect locked, shy, guide, disabled, parented, 3D, separated-dimension, and expression-enabled states.
- Resolve property dimensions before applying keyframes or expressions.
- Treat missing effects/plugins as a capability error with recovery guidance.

## Expressions

- Store approved expression templates in versioned files.
- Substitute validated numeric/string tokens through an escaping helper.
- Never concatenate untrusted layer names or free-form text into executable expression code.
- Prefix managed expressions with metadata that identifies feature and schema version.
- Preserve an existing user expression unless the user explicitly chooses Replace.
- Support Apply, Adjust, Bake, and Remove as separate operations where applicable.

## Keyframes

When changing keyframes, preserve all data not intentionally changed:

- time and value;
- interpolation type;
- temporal ease;
- spatial tangents;
- temporal/spatial continuity;
- auto-Bezier state;
- roving state;
- selected-key state when practical.

Use frame-rate-aware conversions. Never compare floating-point times for exact equality without tolerance.

## Layers, shapes, and 3D

- Use coordinate-space helpers for anchor, parent, camera, orbit, and look-at operations.
- Preserve the visible result when moving anchor points.
- For shape groups, distinguish layer transforms from group transforms.
- Do not assume one path, one group, or one contour.
- For 3D rigs, document camera, parent, orientation, and world/local space assumptions.
- Tag managed nulls/controllers with stable metadata and reuse them idempotently.

## Long-running operations

`evalScript` work can block the host UI. For heavy jobs:

- split work into bounded chunks;
- report progress between chunks through the client protocol;
- allow cancellation at safe boundaries;
- avoid network requests from the host loop;
- move transcription, media analysis, and other intensive work to a companion/native worker;
- never run an unbounded loop on the UI thread.

## CEP client permissions and security

- Request only required CEP permissions.
- Explain the After Effects scripting/network preference when a feature needs it.
- Keep provider API keys out of the client and host source.
- Validate paths before import or write.
- Do not load remote scripts into the panel.

## Feature implementation layout

```text
feature/
├── definition.ts
├── schema.ts
├── controller.ts
├── host/
│   └── after-effects.ts
├── expressions/
├── presets/
├── tests/
└── README.md
```

ExtendScript bundles should be generated from small host modules rather than one manually edited monolith.

## Required tests

- pure math and serialization tests outside the host;
- command-envelope contract tests;
- ExtendScript syntax compatibility checks;
- mock DOM tests for common failure paths;
- real After Effects smoke test using the relevant `.aep` fixture;
- single-step Undo test;
- selection/current-time preservation test;
- localized UI test when properties/effects are targeted;
- golden project or render evidence for visual features.

## Prohibited shortcuts

- private or undocumented APIs presented as supported;
- hard-coded menu command numbers in feature logic;
- display-name property lookup;
- arbitrary `eval` of payload data;
- mutation before complete validation;
- overwriting user expressions without consent;
- declaring success because the CEP browser preview works;
- marking the feature complete without real-host evidence.
