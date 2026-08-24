---
name: developing-premiere-uxp
description: "Implements Premiere Pro plugin features with UXP and, when justified, Hybrid C++ addons. Use for panels, commands, manifest permissions, Premiere DOM operations, projects, sequences, tracks, clips, captions, transcripts, filesystem access, native addons, capability detection, and Premiere host testing."
---

# Developing Premiere Pro UXP Features

Use this skill for all Premiere Pro panel, command, DOM, manifest, and Hybrid addon work. The documented UXP and Premiere APIs are the source of truth; capability varies by host version.

## Supported architecture

```text
UXP panel/command
    ↓ typed command controller
Premiere host adapter
    ↓ documented Premiere DOM APIs
Premiere project

Optional for justified workloads:
UXP → versioned `.uxpaddon` C++ boundary governed by `engineering-native-media-core`
```

Do not add CEP or ExtendScript to new Premiere features unless the master specification explicitly defines a migration exception.

## API discipline

- Activate `researching-adobe-capabilities` and check the current official Premiere UXP reference, declarations, samples, and changelog before using a version-sensitive method.
- Use `@adobe/premierepro` type definitions or JSDoc types matching the target version.
- Feature-detect methods and capabilities at runtime.
- Never invent a DOM method because an equivalent exists in another Adobe host.
- Do not claim access to internal transcription or UI commands unless a public API is documented and tested.
- Return an explicit `unsupported` result when the host cannot perform the requested operation.

## Entrypoints and lifecycle

- Declare panels and commands in the manifest with stable IDs.
- Register implementations through the documented UXP entrypoint API.
- Keep create/show/hide/destroy logic idempotent.
- Remove listeners and release resources on supported lifecycle paths.
- Account for documented lifecycle limitations in the target Premiere version.
- Define realistic minimum, preferred docked, and preferred floating dimensions.

## Async and transaction behavior

Premiere DOM calls are asynchronous. Every host adapter must:

1. obtain and validate the active project/sequence context;
2. resolve target objects before write operations;
3. use the documented locked-access/action/transaction mechanism required by the target API;
4. await every asynchronous call;
5. surface partial-failure information;
6. restore user context when the feature contract requires it.

Never guess transaction method signatures. Verify them against the target API reference and a working sample.

## State and object validity

- Treat host objects as snapshots that may become stale after project changes.
- Re-resolve objects by stable identifiers where available.
- Do not hold long-lived references to clips, tracks, or project items across unrelated operations.
- Handle project closure, sequence switches, track deletion, and selection changes.
- Normalize timebase, ticks, frames, and seconds through one tested utility layer.

## Filesystem and network

- Use UXP filesystem APIs for standard plugins.
- Do not assume Node `fs`, unrestricted paths, child processes, or arbitrary sockets.
- Declare only required manifest permissions.
- Route provider secrets through the backend.
- Validate downloaded content before import.
- Keep user consent and attribution visible where provider terms require it.

## Hybrid plugin decision

Use a `.uxpaddon` only when at least one is true:

- sustained media/audio processing is not viable in JavaScript;
- a required C/C++ library must be embedded;
- offline speech inference or native hardware integration needs compiled code;
- measured metadata operations exceed the JavaScript budget.

Before adding a Hybrid addon:

- confirm the minimum Premiere and UDT versions in current official docs;
- create a versioned, narrow ABI;
- provide cancellation, progress, error mapping, and health/version checks;
- compile Release builds for every supported platform/architecture;
- sign and notarize required binaries;
- keep the rest of the plugin usable when the addon is absent or incompatible.

Do not use a native addon merely to bypass UXP security boundaries.

## Captions and transcripts

- Separate semantic captions from animated visual captions.
- Treat transcript import/export/availability APIs as version-gated.
- Do not simulate unsupported native transcript creation by driving private UI commands.
- Preserve caption timing and text editability.
- Apply animated visual captions through a documented, testable workflow such as managed MOGRT insertion when supported.
- Use dedicated tracks/bins and stable metadata for generated assets.

## Error model

Map host failures to stable product codes such as:

- no active project;
- no active sequence;
- invalid selection;
- capability unavailable;
- permission denied;
- stale host object;
- media import failed;
- transaction failed;
- addon missing/incompatible;
- cancelled.

Include a user-actionable recovery message. Never collapse all host exceptions into “unknown error.”

## Required tests

- manifest schema and permission validation;
- command contract tests;
- timebase conversion tests, including drop-frame cases;
- stale-response and cancellation tests;
- real Premiere smoke tests with `.prproj` fixtures;
- Undo/transaction validation where exposed;
- track/sequence selection preservation;
- version capability matrix tests;
- clean-system Hybrid addon load tests for every packaged architecture;
- package install/uninstall test.

## Prohibited shortcuts

- undocumented QE/private APIs;
- UI automation masquerading as a supported DOM API;
- Node APIs not available in UXP;
- unawaited host calls;
- long-lived stale host object references;
- hard-coded assumptions about track indexes;
- a production manifest targeting multiple hosts when the packaging rules require one;
- marking a feature complete after browser-only testing.
