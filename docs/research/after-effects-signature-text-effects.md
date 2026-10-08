# Signature text presets: bundled effects, parameters and text animator properties

Question: Which bundled After Effects effects and text-animator properties can the Signature text collection drive by expression (film burn, light sweep, light rays, scatter, glow, choke, directional blur, exposure), what are their exact parameter match names, and which candidates must be avoided?

Decision date: 2026-10-07

Target host/version: After Effects 26.5x89, macOS 27.2.0 (arm64), Portuguese UI.

Status: parameters, expression capability and resting identity verified on the tested host (`artifacts/signature-text-20261007/`). Other versions, Windows and Intel are not qualified.

## Method

`artifacts/signature-text-20261007/capability-probe.jsx` lists `app.effects` (read-only), then creates a temporary 1920×1080 composition with one text layer inside a single Undo group, adds each effect, records every parameter's index, match name, display name, value type, range and `canSetExpression`, and removes the composition. The user's open project was left with the same item count and active item. Raw output: `capability-probe.txt`.

## Evidence table

| Claim | Exact symbol | Evidence | Notes |
|---|---|---|---|
| Film burn | `CC Burn Film`; `-0001` Burn (0–100), `-0002` Center (point), `-0003` Random Seed (0–5000) | probe | Cycore, installed with AE (`Estilizar`). All three accept expressions. |
| Light sweep | `CC Light Sweep`; `-0001` Center, `-0002` Direction, `-0003` Shape (1–3), `-0004` Width (0–4000), `-0005` Sweep Intensity (0–500), `-0006` Edge Intensity (0–500), `-0007` Edge Thickness (0–20), `-0008` Light Color, `-0009` Light Reception (1–3) | probe | All accept expressions. |
| Light rays | `CC Light Rays`; `-0001` Intensity (0–10000), `-0002` Center, `-0003` Radius, `-0004` Warp Softness, `-0005` Shape, `-0006` Direction, `-0007` Color from Source, `-0010` Allow Brightening, `-0008` Color, `-0009` Transfer Mode | probe | **`-0005` and `-0007` do not accept expressions**: set statically only. Index order differs from match-name order (`-0010` is the 8th child). |
| Scatter | `CC Scatterize`; `-0001` Scatter (−10000–10000), `-0002` Right Twist, `-0003` Left Twist, `-0004` Transfer Mode (1–4) | probe | All accept expressions. |
| Glow | `ADBE Glo2`; `-0001` based on (1–2), `-0002` threshold (0–255), `-0003` radius, `-0004` intensity, `-0005` composite (1–3), `-0006` operation, `-0007` colors (1–3), `-0011` A/B midpoint, `-0012` Color A, `-0013` Color B, `-0014` dimensions (1–3) | probe; also `after-effects-impact-shake-effects.md` | Intensity 0 is byte-identical to bypass (impact-shake research). |
| Choke | `ADBE Simple Choker`; `-0001` view (1–2), `-0002` choke (−100–100) | probe | Used after a Gaussian blur for the liquid ink reveal. |
| Directional blur | `ADBE Motion Blur`; `-0001` direction, `-0002` length (0–1000) | probe | Length 0 identity verified in impact-shake research. |
| Exposure | `ADBE Exposure2-0003` master exposure | probe | Exposure 0 identity verified in impact-shake research. |
| Turbulent displace | `ADBE Turbulent Displace`; `-0002` amount, `-0003` size, `-0005` complexity, `-0006` evolution | probe | Same symbols already used by the library. |
| Avoid: Noise | `ADBE Noise` | `app.effects` category `_Obsolete` | Not used. The projector look uses exposure flicker instead of grain. |
| Text fill per unit | `ADBE Text Fill Color` | probe (added to an animator, expression-capable) | Selector amount 0 restores the source fill exactly; text stays editable. |
| Text blur per axis | `ADBE Text Blur` `[x, y]` | probe | One axis at 0 gives directional per-unit blur. |
| Character offset | `ADBE Text Character Offset` | probe | Deterministic decode and roll. |
| Expressible selector | `ADBE Text Expressible Selector` → `ADBE Text Range Type2`, `ADBE Text Expressible Amount` | probe | Same selector the library already uses. |
| Per-character 3D | `AVLayer.threeDPerChar` | probe (read/write) | Not used in this release: phases would need extra rollback state. |

Parameter match names have no primary Adobe documentation; they were read from the installed runtime. The host resolves each parameter by match name and fails with `CAPABILITY_UNAVAILABLE` when one is absent, instead of writing to a guessed index.

## Implementation decision

- Signature looks use only the effects above. Every layer effect is driven by the transition envelope, so at rest each one returns to its neutral value (burn 0, intensities 0, scatter 0, choke 0, blur 0, exposure 0). The resting text is meant to match the original.
- Effect evolution follows transition progress, not wall-clock time, so a cinematic look keeps its character at any duration.
- The burn, sweep and ray centers are expressions on `sourceRectAtTime`, so editing the text keeps the effect aligned.

## Fallback

A missing effect or parameter refuses the apply with `CAPABILITY_UNAVAILABLE`, naming the symbol. There is no silent substitute, because a substitute would change the visual result.

## Resting identity (render evidence)

Each text layer was rendered at rest before and after its preset (`frames/*-before-rest.png`, `*-after-rest.png`) and compared per channel (`rest-identity.json`):

- 22 of 22 transitions are byte-identical at rest once Effect Opacity follows the envelope.
- **Glow on text is not an identity at intensity 0.** On a transparent text layer, `ADBE Glo2` with intensity 0 still adds a soft alpha halo (max channel difference 64–147 before the fix). The impact-shake research measured identity on an opaque adjustment precomp, which is a different case. Glow's Effect Opacity therefore fades continuously with the same "peak" envelope, so nothing pops on the last frame.
- The Cycore effects (`CC Burn Film`, `CC Light Sweep`, `CC Light Rays`, `CC Scatterize`) and `ADBE Simple Choker` reach identity through their neutral values plus the stepped Effect Opacity guard.

## Residual

- `CC Burn Film` did not open visible burn holes on 150 px text in the rendered frames; the look reads as an amber tint and glow, and needs host tuning.
- A standalone probe that set `CC Burn Film` Burn from 0 to 100 on a text layer with `saveFrameToPng` crashed After Effects 26.5x89 (fatal Sentry event, 2026-10-07 20:07). The three full verification passes that also use the effect finished without a crash. The cause is not isolated; probes of this effect should run only in a saved scratch project.
- `saveFrameToPng` renders asynchronously: a script must wait for a complete file before its next mutation, or a command may run while AE is still rendering.
