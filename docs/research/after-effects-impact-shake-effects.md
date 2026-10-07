# Impact shake: effect parameters, neutral identity and edges

Question: Which native parameters can the impact transitions drive by expression on the camera-transition adjustment precomp, are their neutral values pixel-identical to bypass, does Transform render its own motion blur with the composition switches off, and which settings keep the frame edges opaque?

Decision date: 2026-10-06

Target host/version: After Effects 26.5x89, macOS 27.2.0 (arm64), Portuguese UI. 8 bpc unless stated.

Status: verified on the tested host. Other versions, Windows and Intel are not qualified.

## Evidence table

| Claim | Exact symbol | Evidence | Notes |
|---|---|---|---|
| Wave Warp parameters | `ADBE Wave Warp-0001` type (1–9), `-0002` height, `-0003` width, `-0004` direction, `-0005` speed, `-0006` pinning (1–11), `-0007` phase, `-0008` antialiasing (1–3) | `artifacts/impact-shake-20261006/capability-results.json` | Height, direction and phase accept expressions. Speed is set to 0; phase is driven by the expression. |
| Glow parameters | `ADBE Glo2-0002` threshold (0–255), `-0003` radius, `-0004` intensity (0–255) | same | Intensity accepts an expression; defaults kept for based-on, composite and operation. |
| Exposure | `ADBE Exposure2-0003` master exposure (EV) | same | Already used by `camera-spec-exposure-light`. |
| Transform shutter | `ADBE Geometry2-0009` use composition shutter, `-0010` shutter angle (0–360) | same; `probe-transform-shutter-*.png` | With `-0009 = 0`, a non-zero `-0010` renders motion blur while composition and layer motion-blur switches are off. With `-0009 = 1` and composition motion blur off, the frame stays sharp. `-0010` accepts an expression. |
| Neutral identity | Transform identity, Wave height 0, Glow intensity 0, Exposure 0, Gaussian 0, Directional 0 | `probe-neutral-*.png` vs `probe-bypass.png` | Byte-identical PNGs for every effect. |
| Wave Warp edges | `-0006 = 2` | `artifacts/impact-shake-20261006/renders-edge/` | Any non-zero height (even 0.0146 px) with pinning 1 antialiases the layer border (alpha 170). Pinning 2 (and 10) keep every border pixel opaque at 0.0146 px and 8 px. |
| Gaussian edges on an adjustment precomp | `ADBE Gaussian Blur 2-0003 = 1` | `renders-edge/blur-*.png`, `renders-debug160/`, `border-debug.json` | Even with Repeat Edge Pixels, blurriness 3.3 leaves a 2-px translucent fringe (corner alpha 228). After Transform, the fringe lands on the frame edge; before Transform, an overscan of three blur radii pushes it out. |
| Motion blur at the window edges | `-0010` | `zoom-through-edge.png` vs `zoom-through-bypass-edge.png` | A constant shutter samples the first sub-frame of motion and changed the edge frame by up to 3 levels. Opening the shutter with the envelope (`shutter × min(1, 20·w)`) makes both edge frames byte-identical. |

Parameter match names have no primary Adobe documentation; they were read from the installed runtime by index and display name, and the host code still resolves each one by match name and fails with `CAPABILITY_UNAVAILABLE` when absent.

## Implementation decision

Effect order on the overlay: Wave Warp (pinning 2) → Gaussian Blur (repeat edges) → Transform (own shutter) → Exposure → Glow. `cameraImpactSample` adds three blur radii to its corner-coverage gap; Wave Warp needs none. Transform's shutter opens with the transition envelope.

## Residual

At 160 % intensity, Zoom-through left alpha 254 (1/255) on five border pixels at CUT. It needs both Gaussian and Transform, is not explained by geometry (scale 180 %) and is invisible over any background. Default intensity is strictly opaque on all 141 renders.
