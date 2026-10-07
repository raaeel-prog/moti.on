# Native Glitch — packaging and API evidence

Decision date: 2026-09-20. Target: After Effects 26.5, macOS arm64.
Status: available; capability details require the host verification report.

| Claim | Exact SDK evidence | Decision |
|---|---|---|
| macOS effect is a bundle with compiled PiPL resources | Official SDK 26.5 `Examples/Template/Skeleton/Mac/Skeleton.xcodeproj/project.pbxproj`, `.r in Resources` build phase; `Skeleton.plugin-Info.plist` eFKT/FXTC | Rez data-fork `.rsrc` in bundle Resources; no linker section or ResMerger on Mach-O |
| Stable effect registration | `Skeleton.cpp` exports `PluginDataEntryFunction2`, `PF_REGISTER_EFFECT_EXT2` and `EffectMain`; `SkeletonPiPL.r` declares both macOS architectures | Mirror entry points and centralize effect identity |
| Version/flags must describe implemented paths | `AE_EffectVers.h`: `PF_PLUG_IN_VERSION=13`, `PF_PLUG_IN_SUBVERS=29`; `AE_Effect.h` flags | Shared header for PiPL/runtime; no SmartFX/MFR/GPU flags |
| Spatial neighbor sampling is not pixel-independent | `AE_Effect.h` `PF_OutFlag_PIX_INDEPENDENT` documentation | Do not set this flag for displacement/RGB separation |
| Time-dependent pattern needs cache invalidation | `AE_Effect.h` `PF_OutFlag_NON_PARAM_VARY` | Set bit 2 for time/seed behavior on stills |
| 16 bpc requires separate format | `Skeleton.cpp` branches between Iterate8/16; `PF_MAX_CHAN16` | Implement both, nominal max32768; no float support claim |
| Progress/cancel during iteration | `AE_EffectCB.h` iterate documentation; Iterate8/16 suites | Suite-managed pixel loops over full output, not input opaque extent |
| Source offset and output bounds | `AE_Effect.h` `output_origin_x/y`, `extent_hint` | Sample source relative to origin; transparent bounds; preserve rowbytes |

SDK root inspected: `/Users/rael/Documents/ChatGPT/AdobeAfterEffectsSDK_26.5_MacOS`.
The [Adobe developer portal](https://developer.adobe.com/after-effects/) explicitly
distinguishes scripts/panels for workflow automation from SDK effects for image
buffers (8–32 bit). That distinction guides migration; it does not prove every
bit depth is already implemented here.

Fallback: missing/incompatible native effect returns CAPABILITY_UNAVAILABLE;
legacy rigs receive a conflict diagnosis and are preserved. No automatic visual
substitution. Capability probe: `app.effects[].matchName`, `canAddProperty`, then
the five expected parameter matchNames. Open uncertainty: runtime architectures
and color formats beyond the recorded real-host matrix remain unverified.
