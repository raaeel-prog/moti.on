---
name: testing-adobe-hosts
description: "Verifies CrossHost work through build, lint, types, unit tests, command contracts, host fixtures, visual goldens, performance checks, negative cases, and real After Effects and Premiere Pro execution. Use before claiming any feature, refactor, package, or release is complete."
---

# Testing Adobe Hosts

Use this skill after every meaningful change and before any completion claim. Build success proves only that source files can be processed; it does not prove Adobe behavior.

## Verification layers

Run the smallest fast checks continuously, then complete the full stack before handoff:

1. static validation;
2. unit tests;
3. command/serialization contract tests;
4. host-adapter tests;
5. fixture/golden tests;
6. real-host smoke and negative tests;
7. performance and packaging checks when relevant.

## Phase 1 — repository health

Run the repository-defined commands, normally including:

```bash
npm run build
npm run validate
npm run skills:validate
npm test
```

Also run lint/typecheck when configured. Do not silently skip a missing script; report that the gate is not configured.

## Phase 2 — pure-domain tests

Prioritize deterministic logic outside Adobe:

- schemas and migrations;
- command envelopes and error mapping;
- expression escaping;
- time/frame/tick conversion;
- matrix and coordinate math;
- Bézier-to-host easing conversion;
- keyframe serialization;
- seeded randomness;
- caption parsing/segmentation;
- provider normalization and license rules;
- checksums and cache policy.

Use table-driven edge cases and property-based testing for math where practical. Maintain high coverage for pure domain modules; coverage does not replace meaningful assertions.

## Phase 3 — contract tests

Test every boundary independently:

- panel ↔ After Effects ExtendScript;
- panel ↔ Premiere adapter;
- plugin ↔ native worker/addon;
- plugin ↔ backend;
- provider adapter ↔ normalized model;
- preset/schema version negotiation.

Required cases:

- valid result;
- validation error;
- unsupported capability;
- timeout;
- cancellation;
- malformed response;
- stale request/response;
- partial host failure;
- version mismatch.

## Phase 4 — fixture and golden tests

Use small, version-controlled fixtures rather than arbitrary personal projects.

After Effects examples:

- empty project;
- text and nested shapes;
- temporal and spatial keyframes;
- 3D parented layers;
- parallax rig;
- short and long caption comps.

Premiere examples:

- empty project;
- imported assets;
- transcript/caption project;
- MOGRT sequence;
- SFX track;
- multiple frame rates/timebases.

Golden artifacts may include:

- keyframe JSON;
- object graph snapshots;
- transcript/timing JSON;
- render stills with tolerance;
- generated project item counts;
- attribution sidecars.

Update a golden only after reviewing the intended visual or structural change.

## Phase 5 — real-host smoke test

Record:

- host and exact version;
- OS and architecture;
- plugin build/commit;
- fixture;
- starting selection/current time;
- steps executed;
- observed result;
- Undo result;
- reopen/persistence result when applicable;
- screenshot or short capture for visual features.

At minimum test:

- happy path;
- no project/comp/sequence;
- wrong selection;
- locked/unsupported target;
- repeated Apply;
- Cancel where supported;
- Undo after success;
- failure after preflight;
- narrow panel interaction.

## Negative-case catalog

Include relevant cases from this list:

- project not saved;
- missing composition or active sequence;
- layer/property locked;
- existing expression;
- missing third-party effect/font;
- network offline;
- expired token;
- provider rate limit;
- fake MIME or oversized media;
- model checksum mismatch;
- native companion missing/incompatible;
- disk full or read-only path;
- Unicode/long path;
- drop-frame timebase;
- host object becomes stale;
- cancellation during a chunk boundary;
- Undo after a partial internal error.

## Visual review

For panel work, capture compact, standard, and wide widths. Compare:

- hierarchy and first focal point;
- clipping/overflow;
- focus-visible state;
- disabled/loading/error states;
- text at display scaling;
- contrast against `#1D1D1D`;
- absence of accidental density or card proliferation.

For motion output, compare before/after world position, keyframe metadata, and render output as applicable.

## Performance check

Use `optimizing-crosshost-performance` for measured budgets. At minimum, capture timing for the changed path and compare with the prior baseline.

## Verification report

Use this exact structure:

```text
VERIFICATION REPORT

Build:             PASS | FAIL | NOT CONFIGURED
Static validation: PASS | FAIL
Types/Lint:        PASS | FAIL | NOT CONFIGURED
Unit tests:        X/Y passed
Contract tests:    X/Y passed
Golden tests:      PASS | FAIL | NOT APPLICABLE
AE host:           PASS | FAIL | NOT RUN — version/OS/fixture
Premiere host:     PASS | FAIL | NOT RUN — version/OS/fixture
Performance:       PASS | FAIL | NOT MEASURED
Packaging:         PASS | FAIL | NOT APPLICABLE

Overall: READY | NOT READY
Blocking evidence:
- ...
```

“NOT RUN” is honest and preferable to an unsupported claim. It means the feature is not yet fully verified.

## Release rule

A feature is Done only when every applicable item in the master specification Definition of Done is satisfied. A release is Ready only when the complete declared host matrix, signing, installation, upgrade, downgrade, and uninstall gates pass.
