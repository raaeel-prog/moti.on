---
name: releasing-adobe-extensions
description: "Packages and releases CrossHost for After Effects and Premiere Pro. Use for manifests, builds, versioning, ZXP or CCX packaging, native architectures, code signing, notarization, marketplace compliance, clean-machine testing, upgrades, rollbacks, release notes, and final release gates."
---

# Releasing Adobe Extensions

Use this skill for release engineering. After Effects CEP and Premiere UXP are separate host packages even when they share a product name and backend.

## Release inputs

A release candidate must have:

- immutable source commit/tag;
- declared product version and schema versions;
- exact supported host/OS/architecture matrix;
- changelog and migration notes;
- complete tests and real-host evidence;
- license, privacy, provider, and security review;
- signing identities available through secure CI or release workstation;
- rollback plan.

Do not package uncommitted or generated-but-untracked changes.

## Versioning

Version independently but coherently:

- product version;
- AE extension version;
- Premiere plugin version;
- command/preset schema versions;
- native protocol/addon ABI version;
- backend API version;
- transcription model manifest version.

Define compatibility ranges. A backend or native mismatch must produce a precise disabled state, not project corruption.

## Build reproducibility

- Build from a clean checkout with locked dependencies.
- Generate build metadata containing commit, timestamp policy, host target, and tool versions.
- Exclude source maps, debug ports, test fixtures, private symbols, secrets, and development permissions from production packages.
- Keep notices, licenses, locale files, presets, and required assets.
- Produce checksums and an SBOM.
- Compare package contents against an allowlist.

## After Effects package

For the CEP extension:

- validate `CSXS/manifest.xml` and host/runtime ranges;
- ensure production removes development `.debug` configuration;
- verify bundled `CSInterface.js` notice/version;
- compile host scripts for ExtendScript compatibility;
- sign the ZXP through the approved toolchain/certificate;
- test user-level installation on clean Windows and macOS systems;
- verify panel discovery, first run, network/script preference guidance, and uninstall cleanup.

Do not rely on PlayerDebugMode for production distribution.

## Premiere package

For UXP:

- validate the production manifest and permissions;
- target one production host definition as required by current packaging rules;
- package through the supported UXP toolchain into CCX;
- test install, launch, docking, update, and uninstall;
- verify no development-only permissions or host arrays remain.

For Hybrid plugins:

- include the exact platform/architecture directory layout required by current Adobe docs;
- build Release binaries for all declared architectures;
- verify clean-machine runtime dependencies;
- sign/notarize macOS binaries as required;
- test Windows x64, macOS Intel, and Apple Silicon when claimed;
- ensure the non-native product surface handles a missing addon safely.

## Clean-machine matrix

Test at least:

- fresh install with no development tools;
- upgrade from the prior supported version;
- downgrade behavior or explicit block;
- uninstall and reinstall;
- offline launch;
- expired/revoked entitlement;
- backend unavailable;
- native companion/addon absent;
- non-admin user where supported;
- localized host;
- high-DPI display;
- project created by the prior version.

Record exact host patches. Update the matrix from official Adobe requirements at release time.

## Marketplace and independent distribution

- Use the plugin IDs issued for the chosen channel.
- Keep product claims limited to tested capabilities.
- Provide privacy policy, support, attribution, licenses, and system requirements.
- Verify screenshots reflect the shipped UI.
- Do not imply Adobe endorsement.
- Confirm provider and model redistribution terms for bundled content.
- Document administrator prompts caused by native components.

## Release candidate gate

Run:

- build, validation, typecheck, lint, tests;
- skill validation;
- secret and dependency scans;
- package content audit;
- signature/notarization verification;
- clean install/upgrade/uninstall tests;
- declared host matrix smoke tests;
- performance budgets;
- privacy/provider review;
- recovery/rollback rehearsal.

## Release evidence bundle

Archive privately:

- checksums and SBOM;
- package content manifests;
- CI logs;
- signing/notarization receipts;
- host/OS test matrix;
- screenshots and short captures;
- migration test results;
- known limitations;
- native symbols and crash symbol mapping;
- rollback artifacts.

## Final report

```text
RELEASE CANDIDATE
Version:
Commit:
AE package/checksum:
Premiere package/checksum:
Backend/native versions:
Supported matrix:

Build/tests: PASS | FAIL
Security/privacy: PASS | FAIL
Provider compliance: PASS | FAIL
Signatures: PASS | FAIL
Clean install: PASS | FAIL
Upgrade/downgrade: PASS | FAIL
Host matrix: PASS | FAIL
Performance: PASS | FAIL
Rollback: PASS | FAIL

Decision: RELEASE | HOLD
Blocking items:
```

Never publish when any claimed host/architecture is untested, a package is unsigned where required, provider rights are unresolved, or the release cannot be rolled back safely.
