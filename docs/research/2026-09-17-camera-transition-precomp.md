# Camera transition overlay precompositions

Question: Can a short generated precomposition above existing footage act as a movable camera transition, with a CUT marker at the playhead, while leaving footage layers intact?

Decision date: 2026-09-17

Target host/version: After Effects CEP/ExtendScript. Native capability probe executed on After Effects 26.5x89, macOS 26.6.2 (64 bit), Portuguese UI.

Status: available on the tested host. Capability evidence is distinct from the final command's acceptance tests.

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary evidence | Notes |
|---|---|---|---|---|
| An adjustment layer processes the composite below it. | `AVLayer.adjustmentLayer = true` | Not established by current Help; verified 26.5x89 | [Adobe: Creating layers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/create-layers/creating-layers.html#adjustment-layers); local native probe | Adobe also describes converting existing layers using the adjustment switch. The probe confirms it works on a precomposition AVLayer. |
| Outer adjustment effects work without collapsed transformations. | `adjustmentLayer=true`, `collapseTransformation=false` | Verified 26.5x89 | `artifacts/camera-precomp-0917/capability-probe.jsx` and rendered evidence | A source comp containing one opaque full-size solid is sufficient; source color is not drawn over the footage. |
| Collapsing transformations changes nesting and effect order. | `collapseTransformation`; `canSetCollapseTransformation` | Verified 26.5x89 | [Adobe: Precomposing and nesting](https://helpx.adobe.com/after-effects/desktop/work-with-compositions/precomposing-and-nesting/precomposing-nesting-pre-rendering.html) | Internal adjustment layers and outer masks/effects introduce flattening boundaries. The chosen architecture avoids this complexity. |
| Transform can move/scale/rotate the composite processed by an adjustment layer. | Effect `ADBE Geometry2` | Verified 26.5x89 | [Adobe: Transform effect](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/distort-effects.html#transform-effect); native render | Ordinary layer Transform would transform the adjustment coverage; the effect transforms its image input. |
| A marker can identify the cut independently of the visible layer bar. | `new MarkerValue('CUT')`, layer `property('ADBE Marker').setValueAtTime(t, marker)` | Verified 26.5x89 | [Adobe: Layer and composition markers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/work-with-layer-and-composition-markers/layer-markers-composition-markers.html); native probe | Marker time uses parent composition seconds. A source composition's markers are copied when nested and are not automatically synchronized later. |
| Marker duration is writable; moving the layer moves its marker. | `MarkerValue.duration`, `Layer.startTime` | Verified 26.5x89 | Native probe, `capability-results.json` | At `startTime=.5`, marker key time was `1`. Changing `startTime` to `.75` moved it to `1.25`. A duration of one second persisted. |

Exact spelling/defaults were read from the installed Adobe runtime. Existing repository declarations cover `adjustmentLayer`, `startTime`, and `MarkerValue.duration`; they are project declarations, not independent Adobe documentation. Adobe's bundled `Scripts/ScriptUI Panels/VR Comp Editor.jsx` also uses `adjustmentLayer` and `collapseTransformation`. The old Adobe-hosted CS6 scripting PDF could not be retrieved; community-maintained scripting mirrors were not used as sole support for this decision.

## Implementation decision

Create one short composition with the parent's width, height, pixel aspect ratio, and frame rate. Put one opaque full-size solid in it. Add that composition above all existing layers as a 2D adjustment AVLayer. Keep `collapseTransformation=false`; apply native Transform/Blur/Tint/Distort effects to the outer layer. This avoids changing, moving, parenting, or precomposing any user footage.

The outer layer owns the cut marker and transition expressions. Express timing relative to the marker or `startTime` plus a stored center offset so dragging the overlay moves the whole transition. Set `startTime` first, then visible in/out points and marker. Near composition boundaries, clip the visible interval without moving the intended CUT time. Preserve the original playhead, selection, layer order relative to other user layers, and composition motion-blur flags.

Use native effect match names, not localized display strings. Available Transform properties, measured in the host:

| Property | Match-name suffix | Default |
|---|---|---|
| Anchor point | `ADBE Geometry2-0001` | Composition center |
| Position | `ADBE Geometry2-0002` | Composition center |
| Uniform scale | `ADBE Geometry2-0011` | 1 |
| Scale height (drives uniform scale) | `ADBE Geometry2-0003` | 100 |
| Scale width | `ADBE Geometry2-0004` | 100 |
| Skew / axis | `-0005` / `-0006` | 0 / 0 |
| Rotation | `ADBE Geometry2-0007` | 0 |
| Opacity | `ADBE Geometry2-0008` | 100 |
| Use composition shutter angle | `ADBE Geometry2-0009` | 1 |
| Shutter angle | `ADBE Geometry2-0010` | 0 |
| Sampling | `ADBE Geometry2-0012` | 1 |

Other measured properties: Gaussian Blur amount `ADBE Gaussian Blur 2-0001`, repeat-edge `-0003`; Tint black `ADBE Tint-0001`, white `-0002`, amount `-0003`; Turbulent Displace amount `ADBE Turbulent Displace-0002`, size `-0003`, evolution `-0006`, random seed `-0010`. Full defaults/ranges are in the probe result.

For centered rotation, avoid uncovered corners using scale factor at least `max(abs(cos θ) + (h/w)*abs(sin θ), abs(cos θ) + (w/h)*abs(sin θ))`, plus a small sampling margin. Translations need additional coverage. This is a geometric implementation requirement inferred from the render, not an Adobe API promise. A 16:9 fixture rotated 18 degrees needs approximately 150% scale; the deliberately tested 145% exposes corners.

Fallback: return a capability error if the required effects or layer settings are unavailable. Preserve the existing explicit apply-to-layers operation. Do not silently substitute that workflow for creating an overlay.

Capability flag: gate using a valid active `CompItem`, `MarkerValue`, project item/layer creation APIs, and required native effect availability. Newly created artifacts must be removed if a later capability check fails. A host version string alone is insufficient.

## Native capability evidence

The isolated fixture used two colored solids below a transition precomp. Four assertions passed: adjustment precomp with collapse off; parent-space marker time; moving layer moves marker; duration persists. Native renders inspected:

- `artifacts/camera-precomp-0917/baseline.png`: original blue field/red rectangle, with an effect-free adjustment precomp above it.
- `artifacts/camera-precomp-0917/transform-peak.png`: lower composite visibly scaled and rotated.
- `artifacts/camera-precomp-0917/tint-peak.png`: lower composite becomes white.
- `artifacts/camera-precomp-0917/blur-peak.png`: lower red rectangle edges are blurred.

The probe removed its generated items and restored the prior composition viewer. This is capability evidence only; no final command lifecycle or Undo acceptance claim is made here.

## Tests needed

1. Create all eight recipes with no layer selected; verify topmost short adjustment precomp, centered CUT marker, original footage identities/transforms/expressions/timing unchanged.
2. Render neutral edges and transition peak for every recipe, including intensity 0 and vertical/wide compositions; confirm original appearance outside the overlay window and no uncovered borders.
3. Repeat with the selected managed overlay and verify adjustment rather than duplicate creation; inspect controls, adjust, bake, remove, and test partially edited ownership metadata.
4. Preserve a mixed selection, selected properties/keys, playhead, project item selection, frame rate, and existing comp flags.
5. One Undo after successful creation must remove overlay, generated composition, solid footage, and any newly created empty managed folder. Redo restores a working transition. One Undo after adjustment restores controls and timing.
6. Inject failure after each creation/effect step; clean up only newly owned items. No active comp, unavailable native effect, invalid input, locked selected overlay, missing source, and invalid metadata must fail clearly.
7. Test 23.976/29.97 and integer frame rates, subframe CTI, first/last frame, nonzero composition display-start time, portrait/pixel-aspect projects, and a duration exceeding the composition.
8. Drag the overlay with its marker, slide the marker alone, duplicate the overlay, save/reopen, and inspect expression behavior and instance ownership.

Open uncertainty: minimum supported AE version, 32-bpc Transform behavior, final command lifecycle, single-step Undo/Redo, and non-default timebase/renderer combinations require final acceptance evidence. Adobe Help describes Transform motion blur as dependent on layer and composition flags; Gaussian blur can supply the intended recipe softness while preserving existing flags.
