---
name: orchestrating-crosshost-work
description: "Orchestrates implementation work for the CrossHost After Effects and Premiere Pro plugin. Use for feature planning, multi-agent coordination, architecture changes, task decomposition, dependency ordering, and any change that must satisfy the master specification and real-host Definition of Done."
---

# Orchestrating CrossHost Work

Use this skill as the routing layer for every non-trivial repository change. It determines which narrower skills must be loaded, prevents agents from inventing Adobe capabilities, and requires evidence before completion claims.

## Canonical product intent

Build a commercial motion-workflow suite for After Effects and Premiere Pro with:

- a restrained, dockable workstation UI;
- After Effects automation through CEP and ExtendScript unless a native effect is required;
- Premiere Pro automation through UXP, with Hybrid C++ only for justified native workloads;
- shared command contracts, presets, licensing, assets, captions, tests, packaging, and release operations;
- non-destructive, undoable, version-aware behavior.

The normative requirements live in `docs/MASTER_BUILD_SPEC.md`. Read the relevant sections before editing code. Do not replace that specification with assumptions from this skill.

## Activation routing

Load the following skills together when the task matches:

| Task | Required skills |
|---|---|
| Unknown or version-sensitive API, permission, provider policy, or packaging rule | `researching-adobe-capabilities` |
| Any visual change | `designing-adobe-workstation-ui`, `building-crosshost-panel-ui` |
| After Effects command | `developing-after-effects-cep`, `engineering-motion-rigs`, `testing-adobe-hosts` |
| Premiere command | `developing-premiere-uxp`, `testing-adobe-hosts` |
| Anchor, easing, parallax, expressions, keyframes | `engineering-motion-rigs`, relevant host skill |
| Assets, API, database, downloads | `integrating-asset-services`, `securing-crosshost-plugins` |
| Captions, transcription, SFX | `building-ai-captions-sfx`, relevant host skill, security, performance |
| Native worker, offline inference or `.uxpaddon` | `engineering-native-media-core`, relevant host skill, security, performance, release |
| Performance regression | `optimizing-crosshost-performance`, `testing-adobe-hosts` |
| Release or packaging | `releasing-adobe-extensions`, security, testing |

Do not load every skill reflexively. Use only the smallest set that completely covers the task.

## Required work sequence

### 1. Establish ground truth

Before coding:

1. Read `AGENTS.md`, `docs/MASTER_BUILD_SPEC.md`, and the selected skill files.
2. Inspect the current implementation, tests, manifests, schemas, and related commands.
3. Identify the exact host, minimum host version, capability requirements, and fallback policy.
4. Activate `researching-adobe-capabilities` and check current primary documentation for any version-sensitive API, permission, manifest rule, provider policy, or packaging behavior. Never trust a remembered method name.
5. State assumptions explicitly. Convert unresolved product or licensing decisions into an ADR instead of improvising.

### 2. Define a vertical slice

A valid slice includes all layers needed for one usable outcome:

- command registry entry;
- input schema and validation;
- UI state and controls;
- host adapter and host implementation;
- error codes and recovery actions;
- Undo/transaction behavior;
- unit and contract tests;
- host fixture or smoke-test procedure;
- documentation and changelog entry.

Do not create a broad shell of placeholders across many features. Finish one vertical slice at a time.

### 3. Plan before mutation

Write a short implementation plan containing:

- files to change;
- invariant and compatibility risks;
- migration or preset-schema impact;
- test strategy;
- real-host evidence required;
- rollback path.

For a change touching shared contracts, assign one agent as the contract owner. Parallel agents may consume a contract, but must not independently edit competing versions of it.

### 4. Implement with capability gates

Every host operation must:

1. validate project/sequence/composition context;
2. validate selection and property types;
3. resolve capabilities for the detected host version;
4. prepare the complete operation before mutation;
5. execute in one coherent Undo/transaction boundary when possible;
6. return a structured result with `ok`, `code`, `message`, `data`, and optional recovery guidance;
7. preserve user selection, current time, and unrelated state when the feature contract requires it.

Never silently degrade to a visually different behavior. Disable the feature or present a precise compatibility explanation.

### 5. Verify before reporting

Run the repository checks plus the task-specific checks from `testing-adobe-hosts`. A feature is not complete merely because:

- TypeScript compiles;
- a browser preview looks correct;
- a mocked host returns success;
- the manifest validates;
- an expression string was generated.

Host-dependent work remains unverified until exercised in the target Adobe application or clearly reported as awaiting that evidence.

## Multi-agent coordination

Use isolated worktrees or branches for parallel agents. Partition ownership by coherent boundaries:

- shared contracts and schemas;
- After Effects host implementation;
- Premiere host implementation;
- UI components and states;
- tests and fixtures;
- release and documentation.

Rules:

- No two agents edit the same shared contract without an explicit owner.
- Agents publish interface changes before downstream work starts.
- Integration happens frequently; do not accumulate long-lived divergent branches.
- Each agent records commands run, test results, and known gaps.
- The integration agent reruns the complete validation suite after merging.

## ADR stop conditions

Create an Architecture Decision Record and stop the affected implementation path when a task requires an unresolved decision about:

- undocumented or private Adobe APIs;
- cloud upload or retention of user media;
- provider terms, attribution, or commercial licensing;
- FFmpeg/libav distribution;
- fonts or model redistribution rights;
- telemetry collection;
- license enforcement policy;
- native companion auto-update;
- hardware Kinect integration;
- any fallback that materially changes the visual output.

Continue unrelated work that does not depend on the decision.

## Completion report

Every implementation response must include:

1. **Implemented:** concrete behavior, not aspirations.
2. **Files changed:** grouped by UI, shared, host, tests, docs.
3. **Verification:** exact commands and results.
4. **Host evidence:** application/version/OS/fixture and observed result, or an explicit statement that real-host execution is still required.
5. **Compatibility:** capability gates and unsupported states.
6. **Risks or follow-up:** only genuine remaining items.

Never use “100% functional” unless the release gate in the master specification has passed on the declared host matrix.
