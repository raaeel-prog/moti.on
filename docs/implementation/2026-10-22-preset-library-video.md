# Preset library from the supplied video

Reference: `20261023-0035-43.6124353.mp4`, 506 x 512, 30 fps, 95.47 seconds. Contact sheets cover the complete sequence at 1 fps and detailed menu/splitter sequences at 10 fps in `C:/dev/popover-video-study-20261022`. The audio stream is silent; the user's text and confirmed plan determine interaction intent. User instructions supersede the previous hover behavior.

## Implemented interaction

Card/title and adjustment-icon clicks select and open direction choices. Clicking the same origin again closes without deselecting. Hover changes neither selected recipe, direction draft, drawing nor the open menu. Leaving a card/menu keeps it open. Escape, outside click, actual catalogue scroll, category change or another clicked card dismisses/replaces it. The four directions remain bottom/left/right/top. Clicking a direction updates only that preset's local draft; no host mutation is dispatched. "View all" exposes the existing preview tiles and character settings. Drafts survive selection changes.

## Workstation composition

The search field and current Moti.on folder catalogue occupy a persistent left column. The splitter starts at 228 px, clamps to preserve 120 px of folders and 140 px of catalogue, supports mouse drag and keyboard arrows/Home/End, and stores its width in the optional version-1 gallery preference. Old preference records need no migration. Thumbnail sizing reflows 16:9 cards; names truncate to one line and expose compact adjustment/favorite controls. Cards animate through a shared 30 fps scheduler, restricted to visible scenes, with pause/release on inactive/offscreen/reduced-motion states.

The fixed footer places Preset actions at left, thumbnail size in the middle and In/Out/Both at right. Below 440 px, actions use a second row. The three-column Copy/Remove/Paste menu is presentation-only: the workspace owns fresh inspection, stale-target guards and existing commands. Only supported current phase/preset actions are exposed. No command/schema/recipe/host implementation changes were introduced. Dark library colors match the recording: #323232 base, #262626 controls, #535353 attached menu, black previews. Existing theme modes remain available.

## Verification and delivery

- Regression tests cover click-only menus/directions, retained drafts, hover rejection, keyboard/pointer splitter, search/folders, phase actions, fresh inspection, stale copy/remove refusal, preference compatibility and preview lifecycle.
- Browser suite: `apps/after-effects-cep/tests/preset-library-video.browser.mjs`; the former popover entrypoint delegates to it. The suite loads the actual production bundle with explicit CEP/account fixtures. Screenshots/checks cover 506x512, 280/360/480/720 widths, short docks and 100/125/150/200% scaling. Browser evidence is not Adobe evidence.
- Raw results/logs and source/install receipts: `C:/dev/preset-library-video-20261022`. Final summary: `delivery.json`. Browser results: `artifacts/preset-library-video/results.json`.
- The initial unrestricted baseline check exhausted a Node test worker's memory; this is retained as failed baseline evidence. Final repository gates use the same complete test list with serial workers and a 4096 MB heap, alongside lint, types, build, artifact validation, contrast and skill validation. Report final PASS only from completed logs.
- Real Adobe verification, exact version and observed cases are recorded separately in the delivery receipt. No browser/install result substitutes for runtime proof.

Automated results before the final visual refinement: 2,620 complete-suite tests PASS (zero failed/skipped), 164 focused tests PASS after the narrow-search adjustment. Lint, typecheck, build, artifact validation, 282 contrast checks and skill validation PASS. Dependency audit reported zero vulnerabilities.

The user's follow-up screenshot identified an expanding thumbnail slider in narrow panels. It now has one fixed 88 px width, stays alongside Preset actions, and preserves its chosen value across resize. The existing two-row footer remains below 440 px. Footer buttons lose inherited compact-layout margins; slider controls align on their centers. Original directional arrows replace generic placeholders; blue selection marks, focus details and a restrained 98% unfolding animation refine the existing composition. Direction menus enter with the existing 240 ms token and exit with the existing 200 ms token; reduced motion retains its immediate behavior. No hover behavior was added.

After that CSS-only refinement, 548 UI/motion/preset regression tests, the build, lint, artifact validation and 282 contrast checks PASS. The expanded production-bundle browser suite passes 40 checks, including fixed slider width at every viewport, live resizing across 439/440 px without changing its value, and menu entry/exit. Final click samples measured 3.0–3.7 ms against the 100 ms budget. The unchanged host implementation was covered by the completed 2,620-test run above.

Installed rendering was observed inside After Effects 2026 with the real Moti.on panel, active previews, narrow folder search, footer and attached direction menu (`adobe-panel-observed.png` in the external evidence directory). Native input automation stopped when concurrent human input was detected, leaving the panel available to the user. Native scripted click/hover verification and composition mutation/Undo checks remain NOT RUN; the click-only interaction results above come from the production-bundle browser suite.

## Integration and rollback

Work is isolated in `C:/dev/Moti.on-presets-video-20261022`, copied from a SHA-256 snapshot of the current shared source. Integration updates only reviewed files whose primary hashes still match that snapshot. Installed `client/main.js` and `styles/theme.css` are backed up and hash-verified. Preserve host, account, manifest, native binaries and user preference records. For rollback, check for later edits and restore only receipt-listed backups.
