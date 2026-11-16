# Preset card popovers from the supplied video

Reference: local screen recording `20261023-0009-05.7106519.mp4`, 302 x 456, 30 fps, 17.03 seconds. Reviewed the complete sequence at 2 fps and the opening at 10 fps. Contact sheets and original evidence are in `C:/dev/popover-video-study-20261022`. The visible recording supplies appearance and observable behavior; it does not establish the exact original event handlers or delays.

The preset settings now grow directly from the card, at its width and edge, overlaying subsequent rows. The compact list follows the observed bottom/left/right/top order. Hover changes the card preview without changing the application draft. A click chooses the draft; no Adobe command is dispatched. "Ver todas" exposes the existing preview tiles and character options. Moti.on's current host-derived palette, original previews and commands remain in use.

Settings open on click or a short hover over the adjustment control. Crossing between card and menu cancels delayed dismissal. Pointer opening leaves keyboard focus intact; clicking enters a visible option. Escape closes and restores the origin. Scroll closes after an actual offset change; a queued scroll event at the opening offset cannot dismiss a newly opened menu. Menus flip above when space below is insufficient and scroll within the remaining viewport. Reduced motion uses the existing controller. Menus without directional choices retain their relevant controls.

## Scope and rollback

UI: `preset-gallery.ts` and the AE-only `ae-workstation.css`. Tests: `preset-gallery-ui.test.mjs` and the separate explicit browser fixture `preset-popover.browser.mjs`. No preset recipes, host mutations or command contracts change. Premiere styles are not modified.

Work occurred in `C:/dev/Moti.on-popovers-20261022`, based on a SHA-256 snapshot of the current shared source, not just Git HEAD. Selected-file integration and local installation retain per-file backups and receipts under `C:/dev/popover-video-study-20261022`. Restore only receipt-listed files after checking for subsequent changes.

## Verification

- Baseline full `npm.cmd run check`: PASS, 2607 tests.
- Full `npm.cmd run check`: PASS, 2610 tests, zero failures, plus lint, types, build, validation, contrast and skill validation. Subsequent focus/scroll refinements receive the final focused checks below.
- Final UI/navigation/preview-lifecycle checks: see `C:/dev/popover-video-study-20261022/focused.log`, zero failures.
- Final lint and build: PASS.
- Browser checks: see `artifacts/preset-popover/results.json`; actual production bundle with explicit CEP/account fixtures. Includes exact card/menu edges, unchanged grid, hover crossing, local draft choice, all previews, Escape focus, rapid reversal, resize, short docks, reduced motion and scaling. These are browser checks, not Adobe runtime evidence.
- `npm.cmd audit --json`: PASS, zero vulnerabilities.
- Full-check completion and installation hashes: see `C:/dev/popover-video-study-20261022/delivery.json`.
- Native Adobe validation of this revision: NOT RUN. The configured local CEP debug endpoint was unavailable. Reopen the installed panel to review the change in After Effects.

Status: IMPLEMENTED_NOT_HOST_VERIFIED.
