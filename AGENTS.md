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

- Keep the UI subtle, minimal and Adobe-native. The After Effects panel follows the host theme: `apps/after-effects-cep/client/src/host-theme.ts` (`hostThemeTokens` + `accentTokens`) is the source of truth, with fallback `#323232` in `packages/ui-tokens/src/after-effects.css`. Onyx `#121212` (approved 2026-10-03, `docs/UI_FOUNDATION.md`) applies only to the shared kit and Premiere (`packages/ui-tokens/src/tokens.css`).
- Accent is the user's choice, default "Follow AE", always at least 4.5:1 over the real surfaces (`accentTokens`). Never write new hex values in AE CSS: use `--ds-*`, `--surface-*`, `--text-*`, `--action-*`.
- Text is never below 11 px. Never hide content behind horizontal scrolling. A disabled control never uses the action color; it shows its reason in the tooltip.
- UI evidence: screenshots at 280/360/480/720 px and 360x380, plus an automated contrast check (axe color-contrast).
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

## Assisting Another Agent (Pair Programming)

When acting in a support role to another active agent:
1. **Clear the Path**: Do not duplicate the other agent's immediate task. Instead, look ahead in `docs/MASTER_BUILD_SPEC.md` and pick up complex tasks that are not yet started (e.g., preparing UI scaffolding, optimizing shared modules, writing tests for completed parts).
2. **Do Not Replace Tools**: Do not modify the build scripts, structural configurations, or tools the other agent relies on, unless specifically requested.
3. **Respect the Briefing**: Always maintain the current architectural patterns, UI guidelines (e.g., current Onyx dark mode), and rules from `AGENTS.md`. 
4. **State Awareness**: Check the current active branches, logs, or task lists to infer what the other agent is currently modifying before making changes.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
