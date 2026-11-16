# Quadradinhos, tema nativo e controles do After Effects

Restores categorized 56 px icon tiles (44 px compact), with separate adjustment and keyboard context menu. Presets exposes persistent Browse/Edit tabs and opens Edit after confirmed application, including phase and personal .ffx application. Failed/no-op applications retain Browse.

The AE theme follows the CEP background and appearance event, with manual light/dark available. The #323232 screenshot palette is the canonical fallback. Premiere appearance and command/Undo contracts are unchanged.

Standard tool numeric inputs reuse existing validation and commit handlers inside the same disclosure controls as preset Edit. Canonical defaults drive local resets on standard tools. Custom editor controls without a canonical parameter default explicitly restore their initial value. Numeric dragging changes drafts until commit; it does not add host auto-application. Control cleanup belongs to each editor lifecycle.

## Verification

- Baseline `npm.cmd run check`: PASS, 2601 tests, zero failures (`baseline-check.log`).
- Focused theme, workspace, navigation and library tests: PASS, 115 cases before the final additional navigation regressions.
- Updated production panel navigation tests: PASS, 37 cases (`home-final.log`).
- Browser comparison: PASS, 44 checks, four widths, 280×280 and display scale 200%, separate host/account fixtures (`browser/results.json`).
- Initial browser filter medians: before 1.7 ms, after 1.8 ms. Absolute 100 ms budget PASS; relative percentage below the 16 ms noise floor is INCONCLUSIVE. Raw repeated samples retained.
- Final `npm.cmd run check`: PASS, 2607 tests, zero failures; lint, types, build, validation, 282 contrast pairs and skills validation passed (`full-check.log`).
- Opening/interaction medians in five measured runs: 11.3/11.0 ms; baseline 13.3/11.7 ms. Absolute budget PASS; relative regression below 16 ms noise floor remains INCONCLUSIVE (`interaction-performance.json`).
- Source: PASS, 30 selected files integrated with backups and SHA-256 guards. All 1615 snapshot input files match the candidate that passed the full check; added files match the receipt. Primary build outputs match the tested candidate.
- Installation: PASS, three reviewed UI outputs verified against the official CEP installation; host hash unchanged.
- Native AE 26.5x89: PASS, actual installed panel, preset Entrada opens Edit, intensity 100→135→Undo 100, application Undo, valid numeric Wiggle Quick, disclosure, draft without auto-application, explicit Apply and Undo, close/reopen. Pixel samples from the native capture: plugin/composition/Effect Controls all #323232.
- NOT RUN in native AE: live appearance preference change, personal external .ffx and every-tool matrix. Those are not inferred from browser evidence.
- Full receipts and case-by-case evidence: `artifacts/ae-native/delivery-status.json` and `host-runtime.json`. The disposable unsaved QA composition remains open for review.

## Integration and rollback

Review changes relative to the captured current checkout, not only Git HEAD. Compare SHA-256 against that snapshot before changing any primary file. Back up every selected source and installed UI file. Abort on concurrent divergence. Install only the reviewed UI outputs; retain host, account, manifests and native binaries. Receipts contain before/after hashes and backup paths. Do not copy a whole checkout over the shared project.
