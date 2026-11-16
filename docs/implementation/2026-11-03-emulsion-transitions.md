# Emulsion — original film transitions (development)

## Implementation plan and scope

The user requested premium original damaged-film/mixed-media transitions inspired by the supplied video and the public Artifact Transitions previews. The pack must be independent for future sale, temporarily integrated in Moti.on for testing.

- Independent pack: `packs/emulsion/manifest.json`, procedural original alpha media, standalone `Emulsion.jsx`, host runtime and previews. No third-party preset code, textures, branding, footage or preview frames are redistributed.
- Shared contracts: add twelve catalog entries with explicit `filmSpec`; composition-scoped requirements. No command schema migration.
- UI: Emulsion folder and four families; original animated previews use the existing shared preview player. Apply always targets the cut, preserving browsing state.
- Host adapter: reuse the existing allowlisted transition command and dispatcher Undo boundary; the independent runtime owns preflight, managed pair lifecycle, native controls and CUT marker.
- Tests: deterministic media/endpoints, catalog/manifest parity, adapter routing and standalone runtime behavior; real AE smoke, visual render and lifecycle evidence in an isolated disposable project.
- Risks: alpha interpretation, relocated media, time remapping at boundaries, adjustable CUT, owning pair membership, duplicate rig application, partial failures and 24/30/60 fps timing.
- Rollback: pre-existing changed files were copied to `C:/dev/artifact-transitions-study-20261103/integration-before/` before integration. Remove only this task's added files and restore task-specific hunks, preserving other work.

## Baseline

`npm run check`: FAIL before changes. ESLint reports `document` undefined in the pre-existing disposable `scripts/.dom-probe.tmp.mjs:5`. Log: `C:/dev/artifact-transitions-study-20261103/logs/baseline-check.log`.

## Verification

In progress. Development pack; commercial release readiness has not been established.
