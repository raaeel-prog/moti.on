Question: Is there a scriptable API for "Create Shapes from Vector Layer"?
Decision date: 2026-09-02
Target host/version: After Effects (all modern versions)
Status: available

Evidence table:
- Claim: There is no direct DOM API, only `app.executeCommand`.
- Exact symbol or policy: `app.findMenuCommandId("Create Shapes from Vector Layer")` or hardcoded ID `3973`.
- Minimum version: CS6+
- Primary source: Adobe Community / ExtendScript documentation
- Notes: `findMenuCommandId` fails if the UI language is not English unless the localized string is provided. Using the hardcoded ID `3973` is a fallback, but not officially guaranteed across all versions, though widely used in the community.

Implementation decision:
Use `app.findMenuCommandId("Create Shapes from Vector Layer")`. If it returns 0, try known localized strings (e.g., PT-BR "Criar formas a partir de camada de vetor") or fallback to ID `3973`. Validate that the layer is indeed an AVLayer with an Illustrator source before executing. Restore selection post-execution.

Fallback:
Return an error if the command ID resolves to 0 and the hardcoded ID is considered unsafe.

Capability flag:
We can probe if `app.findMenuCommandId("Create Shapes from Vector Layer") !== 0`.

Tests needed:
- Test with English UI.
- Test with PT-BR UI.
- Test error handling when no vector layer is selected.

Open uncertainty:
Behavior of `app.executeCommand` is asynchronous in some contexts, but usually synchronous for this specific command. Need to wrap in `app.beginUndoGroup` carefully, though `executeCommand` often creates its own undo group.
