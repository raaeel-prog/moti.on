# After Effects native gradients — API evidence and decisions

Question: can Moti.on provide its own editable gradient effect with float CPU
rendering, Metal acceleration and a CEP editor without flattening the source layer?

Decision date: **2026-10-06**.

Target host/version: **After Effects 26.5x89, macOS arm64**. Headers and samples
inspected: official Adobe After Effects SDK **26.5**, extracted at
`/Users/rael/Documents/ChatGPT/AdobeAfterEffectsSDK_26.5_MacOS`.

Status: **available**, with command integration verified in the recorded host.
Standalone CPU/Metal rendering is verified separately. Native Undo/Redo and
project reopening passed the separate lifecycle fixture. Native host visual
output and AE MFR require their own evidence in the
[implementation report](../implementation/2026-10-05-gradientes.md). No lower host
minimum is inferred from a successful SDK 26.5 build.

## Evidence

Paths below refer to the official SDK root above. The SDK is the primary source
for exact C++ structures, callbacks and ownership rules. Repository code is listed
as the implementation decision, not as proof that Adobe supports an API.

| Claim | Exact symbol or policy | Minimum version / qualification | Primary source | Decision and notes |
|---|---|---|---|---|
| Native effects can process image buffers at 8–32 bit depth | SDK effect extension point | General capability; no runtime matrix implied | [Adobe After Effects developer portal](https://developer.adobe.com/after-effects/) | Use the native effect SDK for rendering; CEP/ExtendScript controls workflow and parameter values. |
| Float color controls are in the effect's working space and may exceed nominal range | `PF_ColorParamSuite1::PF_GetFloatingPointColorFromColorDef` | Suite v1 frozen in AE 7.0, per header; integration tested in 26.5 | `Examples/Headers/AE_EffectSuites.h`, lines 283–305 | Read all eight colors as float. Do not treat every project as sRGB or read only the 8-bit color union. |
| Pixel formats need explicit CPU and GPU handling | `PF_WorldSuite2::PF_GetPixelFormat`; `PF_PixelFormat_ARGB32`, `ARGB64`, `ARGB128`, `GPU_BGRA128` | Present in SDK 26.5; earlier supported minimum not established here | `Examples/Headers/AE_EffectCBSuites.h`; `Examples/Headers/AE_EffectPixelFormat.h`; official `SDK_Invert_ProcAmp` sample | Convert CPU formats to internal premultiplied float; use BGRA float buffers for Metal. Integer conversion occurs at final output. |
| SmartFX declares regional dependencies and output bounds | `PF_Cmd_SMART_PRE_RENDER`; `checkout_layer`; `PF_CheckoutResult::result_rect/max_result_rect`; `PF_Cmd_SMART_RENDER` | Confirmed in SDK 26.5 | `Examples/Headers/AE_Effect.h`; `Examples/Effect/SmartyPants/SmartyPants.cpp` | Request ROI plus finite filter support; keep a parameter snapshot as `pre_render_data`, delete it with its callback, and check in input pixels after render. |
| Legacy effects expand buffers during frame setup | `PF_OutFlag_I_EXPAND_BUFFER`; `PF_Cmd_FRAME_SETUP`; `PF_OutData::width/height/origin` | Confirmed in SDK 26.5 | `Examples/Effect/Resizer/Resizer.cpp`, frame setup; `Examples/Headers/AE_Effect.h` | Keep Legacy Render consistent with the expanded SmartFX result. Account for `output_origin_x/y` and `pre_effect_source_origin_x/y`. |
| Layer coordinates, downsample and pixel aspect are available independently | `PF_EffectWorld::origin_x/origin_y`; `PF_InData::downsample_x/downsample_y/pixel_aspect_ratio` | Smart checkout origins and fields confirmed in SDK 26.5 | `Examples/Headers/AE_Effect.h` | Derive spatial fields from full layer coordinates, scale each filter axis separately and retain non-square pixel geometry. |
| GPU support needs setup, per-render eligibility and a separate render command | `PF_Cmd_GPU_DEVICE_SETUP`; `PF_Cmd_GPU_DEVICE_SETDOWN`; `PF_Cmd_SMART_RENDER_GPU`; `PF_OutFlag2_SUPPORTS_GPU_RENDER_F32`; `PF_RenderOutputFlag_GPU_RENDER_POSSIBLE` | Confirmed in SDK 26.5; earlier minimum not established here | `Examples/Headers/AE_Effect.h`; `Examples/Effect/SDK_Invert_ProcAmp/SDK_Invert_ProcAmp.cpp` | Advertise GPU render only after successful compatible Metal setup and mark eligible SmartFX renders. Unsupported devices retain the CPU path. |
| Metal uses a host device and command queue | `PF_GPUDeviceSuite1::GetDeviceInfo`; `PF_GPUDeviceInfo::compatibleB/devicePV/command_queuePV`; `PF_GPU_Framework_METAL` | Confirmed in SDK 26.5 | `Examples/Headers/AE_EffectGPUSuites.h`; `SDK_Invert_ProcAmp.cpp`, Metal setup/render branches | Reuse the host's `MTLDevice` and `MTLCommandQueue`; only the standalone test harness creates a system device. |
| Device memory belongs under Adobe's GPU accounting | `PF_GPUDeviceSuite1::AllocateDeviceMemory/FreeDeviceMemory/GetGPUWorldData` | Suite v1 in inspected SDK 26.5 | `Examples/Headers/AE_EffectGPUSuites.h`, allocation policy and callbacks | Route scratch buffers through allocator callbacks; obtain host input/output buffers from the suite and never free host-owned worlds. |
| GPU state is effect-owned and requires setdown | `PF_GPUDeviceSetupOutput::gpu_data`; `PF_GPUDeviceSetdownInput::gpu_data` | Confirmed in SDK 26.5 | `Examples/Headers/AE_Effect.h`; official `SDK_Invert_ProcAmp` setup/setdown | Store immutable pipelines per device; release them at setdown. Each render owns its mutable parameters, command buffer and scratch allocations. |
| Concurrent frame rendering is an explicit promise | `PF_OutFlag2_SUPPORTS_THREADED_RENDERING`; `PF_OutFlag2_FLOAT_COLOR_AWARE`; `PF_OutFlag2_SUPPORTS_SMART_RENDER` | Confirmed in SDK 26.5; AE MFR behavior requires host tests | `Examples/Headers/AE_Effect.h`, flag documentation | Set implemented flags and avoid mutable shared render state. CPU concurrency tests are evidence for the kernel, not proof of AE MFR integration. |
| Time-dependent pixels need cache behavior that matches the effect | `PF_OutFlag_NON_PARAM_VARY` | Confirmed in SDK 26.5 | `Examples/Headers/AE_Effect.h`, flag documentation | Set the flag for automatic loops on still layers. Do not set `PF_OutFlag_PIX_INDEPENDENT` because neighboring alpha/color pixels affect filters. |
| A render must poll for user interrupts | `PF_ABORT`; checkout/checkin callbacks; `PF_Interrupt_CANCEL` | Confirmed in SDK 26.5 | `Examples/Headers/AE_Effect.h`; `Examples/Headers/AE_EffectCB.h` | CPU polls inside work. Metal polls before submission and after completion and waits before releasing buffers; no arbitrary in-flight GPU cancellation is claimed. |
| Bundle registrations must preserve effect identity and parameters | PiPL resources; `CodeMacIntel64`; `CodeMacARM64`; parameter disk IDs | Both slice registrations compile; runtime matrix remains separate | `Examples/Template/Skeleton/SkeletonPiPL.r`; `Examples/Template/Skeleton/Mac/Skeleton.xcodeproj/project.pbxproj`; SDK parameter definitions | Add Gradient as PiPL 16003 and `GradientMain`, leaving Glitch, Wave and Native Transition registrations unchanged. |

## Implementation decision

Use `Moti.on Gradient` as a new permanent native matchName in the existing
MotionCore bundle. Its v1 ABI has 54 controls after input: 29 scalar/popup
parameters, eight fixed active/color/position triplets and a read-only schema
version. Disk IDs are 3001–3029, 3100–3123 and 3999. The CEP contract
`GradientSettingsV1` and the ExtendScript adapter share these positions; the
adapter checks the native schema instead of assuming the effect's property count
is exact, because Adobe appends a compositing-options group.

JavaScript-only rendering was rejected because CEP/ExtendScript does not expose
the documented native image-buffer render callbacks. A scripted combination of
built-in effects would have different geometry, alpha, HDR and loop behavior.
The requested tool therefore uses a genuine SDK effect and keeps source text,
vectors and other layer data editable.

CPU and Metal share equations in `GradientMath.inc`. The pipeline calculates
coordinates and smoothed-alpha depth, deforms the field, interpolates the palette,
applies source coverage, filters premultiplied RGBA for diffusion/glow and adds
optional periodic grain. Project-space processing is the default. The explicit
sRGB linear option applies an sRGB transfer function to the palette and final
output; it does not claim to inspect or transform arbitrary ICC working spaces.

Palette repetition uses a reflected cycle, traversing the same stop positions
forward and backward. Angular coordinates are folded before cycles and
deformation, avoiding the branch-cut jump even with fractional repetition.
Diffusion uses three separable box passes as a Gaussian approximation; it is not
an exact Gaussian kernel. Aurora explicitly enables this softer recipe while
the contract defaults retain diffusion off and all authored presets remain
static until Loop is enabled.

The effect's internal version changed from 524289 to 524290 after a host render
revision reused disk-cached pixels from the earlier palette math. MatchName,
schema, disk IDs and parameter indices remain stable. Confirmation that the fresh
host-render pass invalidates those pixels is pending in the implementation
report; no global cache or preference deletion is performed.

The kernels cap four intermediate float RGBA buffers at 2 GiB per render. This
does not include host-owned worlds or the wrapper's CPU conversion buffers.
Allocation errors return an error rather than changing quality. Finite filter
support defines ROI dependencies; separable box passes and sum rebasing bound
rounding drift between full and regional rendering.

The [Cosmic vendor page](https://aescripts.com/cosmic/) and the user-supplied
video are visual references for color within text/shapes, depth, glow, diffusion
and animated variation. They are not an Adobe API source or a specification to
copy. Moti.on uses its own identity, implementation, colors and presets.

## Fallback and capability gate

The native wrapper enables Metal only when the supplied framework is Metal, the
device is compatible and pipeline creation succeeds. CPU remains available when
GPU setup is unavailable. A render allocation or shader execution failure is
reported; it is not silently replaced with a visually different effect.

At the scripting boundary, `ae.effect.gradient.read` returns
`capabilities.nativeAvailable`. The adapter probes `app.effects[].matchName` and
`canAddProperty`, then checks the schema and expected parameter ABI of existing
instances. Missing or incompatible native installation yields
`CAPABILITY_UNAVAILABLE`. Existing unmanaged/ambiguous instances are preserved
and diagnosed as conflicts.

`ae.effect.gradient` preflights the entire selected batch before mutation. It
uses one coherent Undo scope, preserves selection and time, writes only edited
keys during update, protects expression-controlled properties and can roll back
partial changes. These are adapter behaviors, distinct from the image kernel.

## Verification and remaining uncertainty

| Area | Evidence / status on 2026-10-06 |
|---|---|
| Standalone CPU, Metal and ASan/UBSan | **PASS** on local Apple M5, including reflected-palette HDR/spatial/temporal/angular regressions; [CTest](../../artifacts/gradient-20261006/ctest-final.log), [sanitizers](../../artifacts/gradient-20261006/sanitizers-final.log). The [earlier kernel report](../../artifacts/native-gradient/kernel/verification.md) records earlier parity errors and five-run 1080p/4K measurements. |
| Real-host command integration | **PASS**, eight scenarios in AE 26.5x89, macOS arm64; [native results](../../artifacts/gradient-20261006/native-results.json). This covers native identity, editable layers, repeated Apply, granular keyframe writes, expressions, preflight, Effect Controls reads, fixed slots, remove, background and ten-layer application timings. |
| Native Undo/Redo and project reopening | **PASS**, 12/12 lifecycle checks with separate native UI Undo/Redo between snapshots; [results](../../artifacts/gradient-20261006/lifecycle-results.json). |
| Native frame output and AE MFR | Refer to the [implementation report](../implementation/2026-10-05-gradientes.md); not proven by command/lifecycle results. |
| Intel runtime, other AE/macOS releases, Windows/CUDA, Premiere | **NOT RUN** for this Gradient delivery; universal compilation does not qualify them. |
| Earliest supported host version | Not established. Record only versions that actually pass the runtime fixture. |
| Guaranteed GPU cancellation within one second | Not established for all supported dimensions/radii; submitted Metal commands must complete before resource release. |

Tests required for the complete delivery include real AE CPU/Metal output at
8/16/32 bpc, HDR and non-square pixels, Full/Half/Quarter and ROI/full comparisons,
empty/soft/partial alpha, expanded halos, loop seams, serial versus MFR,
Undo/Redo, saving/reopening and missing-native behavior. The implementation report
owns the final PASS/FAIL/NOT RUN matrix and the qualified runtime claim.
