# CrossHost Agent Instructions

This repository uses repo-local Agent Skills under `.agents/skills/`.

## Required first read

1. `docs/MASTER_BUILD_SPEC.md` when present.
2. `docs/AGENT_SKILLS_GUIDE.md`.
3. `.agents/skills/orchestrating-crosshost-work/SKILL.md` for every non-trivial change.
4. Only the task-specific skills selected by the activation matrix.

## Mandatory routing

- Unknown/current capability: `$researching-adobe-capabilities`
- UI/design: `$designing-adobe-workstation-ui` + `$building-crosshost-panel-ui`
- After Effects: `$developing-after-effects-cep`
- Premiere Pro: `$developing-premiere-uxp`
- Motion/keyframes/rigs: `$engineering-motion-rigs`
- Assets/backend/providers: `$integrating-asset-services`
- Captions/SFX: `$building-ai-captions-sfx`
- Native/C++/ML/audio: `$engineering-native-media-core`
- Completion proof: `$testing-adobe-hosts`
- Security-sensitive path: `$securing-crosshost-plugins`
- Performance-sensitive path: `$optimizing-crosshost-performance`
- Packaging/release: `$releasing-adobe-extensions`

## Non-negotiable product rules

- Keep the UI subtle, minimal and Adobe-native with base `#1D1D1D`.
- Show one dominant task at a time; never create an all-in-one dashboard.
- Use documented Adobe APIs plus runtime capability gates; never invent methods.
- Keep AE CEP/ExtendScript and Premiere UXP host layers separate.
- Validate all inputs before mutation and use coherent Undo/transaction boundaries.
- Preserve user data, selection, timing and editability unless the feature contract explicitly says otherwise.
- Never use private QE/UI automation as a silent shortcut.
- Do not mark host-dependent work complete without real-host evidence.
- Record tests as PASS, FAIL or NOT RUN; never imply an unexecuted test passed.

## Required checks

After editing skills:

```bash
npm run skills:sync
npm run check
```

After editing product code, run the repository's full check plus task-specific host verification.
