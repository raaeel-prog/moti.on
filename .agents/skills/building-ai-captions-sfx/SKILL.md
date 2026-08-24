---
name: building-ai-captions-sfx
description: "Builds automatic captions, offline transcription, transcript import, word timing, segmentation, animated caption styles, MOGRT or After Effects output, and automatic text SFX. Use for caption, speech model, audio extraction, timing, style, or SFX synchronization work."
---

# Building AI Captions and SFX

Use this skill for the complete caption pipeline. The result must be editable, frame-accurate, private by default, and honest about host/API limitations.

Use `engineering-native-media-core` for whisper.cpp, audio extraction, native inference, or worker-process implementation; keep the caption model and user workflow in this skill.

## Pipeline

```text
source selection
  → audio extraction or transcript import
  → transcription/normalization
  → word timing and segmentation
  → review/edit
  → visual style generation
  → semantic/animated host output
  → optional deterministic SFX plan
  → apply, inspect, undo
```

Each stage has a versioned data contract and may be resumed without rerunning earlier stages.

## Input modes

Support three explicit sources:

1. an existing Premiere transcript or caption source exposed by documented APIs;
2. offline transcription from selected media/audio;
3. imported SRT, VTT, or product JSON.

Do not claim that the plugin can start Premiere’s internal transcription unless a documented API for the target version exists and is tested.

## Privacy default

- Offline transcription is the default product promise.
- Do not upload audio, video, transcript text, or word timing without explicit opt-in and a documented cloud mode.
- Explain model size, local disk use, expected processing time, and hardware support before download.
- Keep local logs free of transcript contents unless diagnostic consent is explicit.
- Provide model deletion and cache management.

## Offline engine boundary

Use a native worker/companion for inference, not the panel UI thread. The boundary must support:

- health and API version;
- model manifest and SHA-256 verification;
- language and task options;
- progress by stage;
- cancellation;
- structured errors;
- timestamps at segment and, when available, word level;
- CPU/GPU capability reporting;
- bounded input/output paths;
- process cleanup after cancellation or crash.

Keep the native ABI narrow and versioned. Do not expose arbitrary process execution.

## Audio extraction

- Preserve the selected time range and source offset.
- Normalize sample format only as required by the engine.
- Do not silently alter playback speed or channel interpretation.
- Record exact mapping from extracted audio time to sequence/composition time.
- Clean temporary files after a successful or cancelled job according to policy.
- Treat FFmpeg/libav distribution as a licensing ADR when bundled.

## Canonical caption model

The normalized model should include:

- document/schema version;
- source identity and time origin;
- language and confidence metadata;
- segments with start/end/text;
- words with start/end/text/confidence when available;
- speaker label when supported;
- punctuation and normalization provenance;
- user edits separated from engine output;
- style/SFX references separate from transcript semantics.

Never destroy the original transcript when the user edits segmentation or style.

## Segmentation

Segment using a deterministic combination of:

- maximum characters/words;
- reading rate;
- punctuation and pause duration;
- safe minimum/maximum on-screen time;
- line width and style constraints;
- phrase emphasis;
- frame boundaries.

Expose presets but keep advanced limits editable. Test languages with different word boundaries and long unbroken tokens.

## Animated styles

Each style definition must specify:

- supported hosts;
- layer/MOGRT structure;
- typography and fallback font policy;
- entrance, emphasis, and exit behavior;
- per-word versus per-segment timing;
- maximum line/word count;
- color controls;
- safe-area behavior;
- reduced-motion alternative;
- render/performance budget;
- migration version.

Initial style families may include Clean, Pop, Bounce, Scale Punch, Word Highlight, Karaoke, Slide, Typewriter, Punchline, and Dynamic Emphasis. Do not duplicate competitor assets or proprietary templates.

## After Effects output

- Create a managed composition/layer structure with stable metadata.
- Keep source transcript data separable from visual layers.
- Use controllers for global typography, spacing, color, and animation intensity.
- Support regenerate-after-edit without duplicating layers.
- Preserve user overrides or clearly warn before regeneration.
- Provide Bake/Detach when the user wants independent layers.

## Premiere output

Treat these as separate products:

- **Semantic captions:** editable caption text/timing for accessibility and delivery.
- **Animated visual captions:** managed graphic/MOGRT instances synchronized to segments.

Do not substitute visual graphics for semantic captions without clearly presenting the distinction.

## Automatic SFX

Generate an SFX plan before touching the timeline. The plan is deterministic and includes:

- trigger word/segment;
- category;
- asset ID and license provenance;
- exact target time;
- volume, offset, and ducking settings;
- rule that selected it;
- seed.

Rules must limit density, repetition, overlap, and interference with speech. Provide preview, enable/disable per event, and a dedicated managed track/layer group such as `CHMS SFX`.

Do not download or insert an SFX whose commercial license and attribution status are unknown.

## Timing accuracy

- Convert engine seconds through one tested frame/timebase layer.
- Preserve source and sequence offsets.
- Define rounding policy for in/out frames.
- Ensure no negative duration or overlapping segment is created by rounding.
- Test 23.976, 24, 25, 29.97 drop/non-drop, 30, 50, 59.94, and 60 fps where supported.

## Required tests

- transcript parser fixtures for SRT/VTT/JSON;
- model manifest/checksum failure;
- cancellation at extraction, inference, and host-apply stages;
- word and segment timing snapshots;
- multilingual segmentation;
- frame rounding and source offset;
- style schema migration;
- AE managed-layer regeneration;
- Premiere semantic versus visual output;
- SFX rule determinism and density limits;
- offline/privacy test confirming no network request;
- real-host Undo and long-project performance.

## Completion gate

Do not mark captions complete until a human can:

- select a source;
- generate or import a transcript;
- review/edit text and timing;
- choose a style;
- preview the SFX plan;
- apply the result in the target host;
- undo it coherently;
- reopen the project and adjust the managed result;
- verify no media left the machine in offline mode.
