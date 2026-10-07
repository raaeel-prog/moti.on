# Moti.on native effects 1.4.0

Development bundle for After Effects on macOS. It requires Apple's Xcode tools
and an extracted official Adobe After Effects SDK; the current build uses SDK
26.5. It contains Glitch Core, Wave Core, Native Transition and Gradient.

```sh
export AESDK_ROOT=/path/to/AdobeAfterEffectsSDK_26.5_MacOS
bash plugin/build.sh
bash plugin/install-dev.sh
```

The build produces `plugin/build-native/MotionCore.plugin` with arm64 and x86_64
slices. Compiling both slices does not establish runtime compatibility on both
architectures. `CMAKE` selects a local CMake executable and `MOTION_BUILD_DIR`
another build directory. The default signature is ad-hoc for development; this
is not a notarized release.

The installer updates the existing user or system Adobe MediaCore installation,
backs it up under `artifacts/install-backups/` and refuses duplicate installations.
An unwritable system installation requires the existing administrator installer.
Save the current project and restart After Effects after replacing the binary.
The installer does not delete preferences or caches.

## Bundle and persistent identity

Rez compiles PiPL as a data-fork resource in
`Contents/Resources/MotionCore.rsrc`, following the SDK Skeleton Resources build
phase. `Contents/MacOS/MotionCore` remains a Mach-O bundle. No ResMerger or custom
Mach-O section is used. `verify-bundle.sh` checks the four PiPL registrations,
entry points, architecture slices and signature. C++ and PiPL share version and
flags in `host/MotionCoreVersion.h`.

| PiPL resource | Entry point | Persistent effect matchName | Parameter disk IDs |
|---|---|---|---|
| 16000 | `GlitchMain` | `CHMS Motion Core` | 1–5 |
| 16001 | `WaveMain` | `CHMS Wave Core` | 1001–1005 |
| 16002 | `TransitionMain` | `Moti.on Native Transition` | 2001–2005 |
| 16003 | `GradientMain` | `Moti.on Gradient` | 3001–3029, 3100–3123, 3999 |

Never change an existing matchName, disk ID or parameter index to evade a cache.
Adding Gradient does not renumber Glitch, Wave or Native Transition. Unfinished
Tile/Neon/Echo stubs remain excluded from the native bundle.

## Glitch Core

| Disk ID / script suffix | Control | Unit / range |
|---|---|---|
| 1 / 0001 | Glitch Intensity | integer 0–100; panel 0–1 |
| 2 / 0002 | Color Split Offset | integer pixels, 0–200 |
| 3 / 0003 | Frequency | changes per second, 0–120; 0 freezes pattern |
| 4 / 0004 | Displacement | pixels, 0–2000 |
| 5 / 0005 | Random Seed | integer 0–1000000 |

Pixels are measured at full layer resolution and scaled for downsampled renders.
Frequency freezes only the spatial pattern, never the source video frame.
Intensity zero is exact bypass; displacement uses transparent pixels beyond
source edges. Channel sampling retains central displaced coverage and accounts
for premultiplied alpha. The effect does not expand the layer bounds.

Glitch and Wave use CPU Legacy Render in 8/16 bpc. Iterate suites handle
cancellation/progress. Neither advertises SmartFX, float-native 32 bpc/HDR, MFR
or GPU. In a 32 bpc project, After Effects may convert pixels for these legacy
effects. The Glitch bridge explicitly rejects temporal frame hold requests.

## Wave Core

`CHMS Wave Core` uses disk IDs 1001–1005, exposed as script match names
`CHMS Wave Core-1001` through `-1005` in the recorded AE 26.5 fixture. Script
indices 1–5 differ from those persistent IDs. After Effects adds its own
compositing-options group, so `numProperties === 5` is not a valid ABI check.

| Disk ID / script suffix | Control | Range |
|---|---|---|
| 1001 | Amplitude | −100000 to 100000 full-resolution pixels |
| 1002 | Wavelength | 1 to 1000 full-resolution pixels |
| 1003 | Direction | degrees; 0 moves horizontally, 90 vertically |
| 1004 | Speed | −1000 to 1000 cycles/sec |
| 1005 | Phase | −36000 to 36000 degrees, float slider |

The organic displacement combines two harmonics. Bilinear sampling handles
premultiplied RGBA, transparent borders, padded rows and downsampling in each
axis. Amplitude zero bypasses exactly, including 1px inputs and the last row
and column. Direction trigonometry is prepared once per render. There is no
hidden chromatic splitting or division by amplitude.

## Native Transition

`Moti.on Native Transition` retains disk IDs 2001–2005 for Amount, Style,
Direction, Flow and Samples. Its six styles are Lateral Whip, Optical Punch,
Soft Vortex, Lens Pulse, Diagonal Smear and Chromatic Prism. It implements CPU
8/16/32 bpc, Legacy Render and SmartFX, and advertises threaded rendering.
Gradient's Metal implementation does not add GPU support to this effect.

## Gradient

`Moti.on Gradient` v1 supplies editable native parameters and the shared
`GradientSettingsV1` contract. The panel applies it to text, shapes, solids and
images using source alpha, or explicitly creates a composition-sized background
solid. Source text and vector data remain editable.

The 54 parameter positions are permanent. Input is native index 0; parameters
1–29 are scalar/popup controls, 30–53 are eight fixed stop triplets, and 54 is
the read-only schema value 1. Enabling, disabling or repositioning a stop does
not move another parameter or its keyframes. After Effects may append its own
compositing-options group.

| Native indices | Disk IDs | Controls |
|---|---|---|
| 1–8 | 3001–3008 | Shape, center X/Y, scale, aspect, rotation, cycles, offset |
| 9–14 | 3009–3014 | Depth, depth radius, bulge, turbulence, turbulence scale, variation |
| 15–18 | 3015–3018 | Glow, glow radius, threshold, highlight protection |
| 19–24 | 3019–3024 | Diffusion, radius, focus X/Y, focus radius, focus softness |
| 25–29 | 3025–3029 | Grain, animation, loop duration, phase, light processing |
| 30–53 | 3100–3123 | Stops 1–8: active, color, position |
| 54 | 3999 | Schema version |

Gradient supports linear, radial and angular fields, alpha-based depth, an
elliptical bulge, seeded turbulence, independent focus diffusion, glow and grain.
Defaults are four active colors, linear geometry, mild depth and glow, diffusion
and grain off, and static animation. Loop mode defaults to four seconds. The
loop phase is periodic in the color field, turbulence and grain.

Palette repetition now traverses stops forward and backward, and angular
coordinates are folded before cycles/offset/deformation. This keeps the first
and last stops connected continuously instead of jumping from the brightest
endpoint to the darkest. Spatial HDR, adjacent loop-frame and fractional angular
seam regressions pass in the CPU/Metal kernel suite.

Aurora is an explicit optical recipe with broader geometry, stronger turbulence,
glow and soft focus diffusion. Contract defaults still have diffusion off and
all eight authored recipes keep animation static until the user enables Loop.
Diffusion uses three separable box passes as a Gaussian approximation, not an
exact Gaussian filter.

Both backends calculate premultiplied RGBA in float. CPU converts SDK ARGB
8/16/32 worlds; final integer output is bounded to its format, while float output
retains HDR and negative RGB. Color parameters come from
`PF_ColorParamSuite1::PF_GetFloatingPointColorFromColorDef`, in the working space
of the effect. Project-space processing is the default. The optional sRGB linear
light mode explicitly decodes/interpolates/filters/encodes sRGB; it is not an
automatic identification of the project's color space.

SmartFX requests the finite dependencies of each output region and expands the
reported bounds for halos, including input expanded by earlier effects. Geometry
uses layer coordinates, downsample in each axis and pixel aspect ratio. Diffusion
and glow filter color and alpha together. Shared formulas in
`host/GradientMath.inc` keep CPU and Metal parameters, seeds and phase consistent.
The blur uses separable finite-support box passes with periodic sum rebasing.

Metal uses the Adobe-supplied device, command queue and GPU allocator, with BGRA
float worlds. GPU setup enables the path only for a compatible Metal device and
successfully created pipelines; CPU remains the available path otherwise.
Pipelines are immutable per device, while parameters, command buffers and scratch
buffers belong to each render. This is the design behind the threaded-rendering
flag; standalone concurrency tests do not prove AE Multi-Frame Rendering behavior.

Kernel scratch is capped at 2 GiB per render, using four float RGBA intermediate
buffers. Adobe-owned worlds and CPU conversion buffers are outside that kernel
cap. Oversized requests return an allocation error without reducing quality.
CPU checks cooperative cancellation during processing. Metal checks before
submission and after completion; submitted work finishes before its buffers are
released. A one-second cancellation deadline is not guaranteed for every frame.

## Verification and compatibility

`build.sh` runs CTest for Glitch, Wave, Native Transition, Gradient CPU and Gradient
Metal. Standalone Gradient tests, sanitizers and five-run 1080p/4K measurements
on the local Apple M5 are recorded in
[`artifacts/native-gradient/kernel/verification.md`](../artifacts/native-gradient/kernel/verification.md).
They include CPU/Metal parity, regional/full output, HDR/alpha, downsample/PAR,
loop continuity, concurrent CPU renders, row pitch and cancellation. They do not
substitute for After Effects rendering tests.

The later palette-continuity revision passed 5/5 CTest suites and ASan/UBSan;
see [CTest](../artifacts/gradient-20261006/ctest-final.log) and
[sanitizers](../artifacts/gradient-20261006/sanitizers-final.log). Earlier timing
measurements describe their measured build, not the newer palette revision.

On 2026-10-06, the real-host Gradient command fixture passed eight scenarios in
After Effects **26.5x89**, macOS arm64 (host-reported OS 27.2.0/64). It covers ABI,
multiple editable text layers, repeated Apply, granular CTI/keyframe changes,
expressions, selection preflight, Effect Controls reads, fixed stop slots,
removal, background creation and five ten-layer application timings. Evidence:
[`artifacts/gradient-20261006/native-results.json`](../artifacts/gradient-20261006/native-results.json).

The separate native lifecycle fixture passed 12/12 checks, including native
Undo/Redo for Apply, Update, Remove and background creation, plus project
save/reopen with all 54 parameters, keys, expressions and IDs preserved. Evidence:
[`artifacts/gradient-20261006/lifecycle-results.json`](../artifacts/gradient-20261006/lifecycle-results.json).

Those command/lifecycle results do not certify native visual output or AE MFR.
Their latest status belongs in the
[Gradient implementation report](../docs/implementation/2026-10-05-gradientes.md).
Only the recorded Mac/AE configuration has command verification. Intel runtime,
other AE/macOS versions, Windows/CUDA and Premiere are not qualified by this
delivery. The deployment target and universal slices are build settings, not a
compatibility claim.

The Gradient effect's internal version was raised from 524289 to 524290 after
the host reused earlier disk-cached pixels in a render revision. Its matchName,
schema, parameter positions and disk IDs are unchanged. The fresh host-render
pass still needs to confirm invalidation; global cache deletion is not used.

SDK evidence and decisions are in
[the Gradient research record](../docs/research/after-effects-native-gradients.md).
Earlier Glitch/Wave evidence remains in `artifacts/native-suite/` and
[`docs/implementation/2026-09-20-native-core/entrega-2026-09-21.md`](../docs/implementation/2026-09-20-native-core/entrega-2026-09-21.md).
