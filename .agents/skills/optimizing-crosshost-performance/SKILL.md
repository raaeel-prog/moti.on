---
name: optimizing-crosshost-performance
description: "Measures and improves CrossHost performance across panel rendering, CEP or UXP bridges, Adobe DOM operations, expressions, asset grids, captions, native inference, memory, cancellation, and startup. Use for slow interactions, large projects, long jobs, regressions, or performance release gates."
---

# Optimizing CrossHost Performance

Use this skill only with measurements. Do not trade correctness, editability, or project safety for an unmeasured optimization.

## Product budgets

Use the master specification as the normative source. Current working targets include:

- warm first useful paint: at most 1.5 s;
- UI interaction without host work: at most 100 ms;
- common project context refresh: at most 500 ms;
- simple command on 10 layers: about 1 s, subject to host limits;
- asset grid scrolling: visually smooth on the reference machine;
- search debounce: 250–400 ms;
- long job progress visible within 500 ms;
- native cancellation acknowledged within 1 s.

Record reference hardware, host version, fixture size, and percentile or repeated-run method.

## Measurement domains

Measure separately:

1. panel startup and render;
2. UI event-to-feedback;
3. command serialization/transport;
4. host preflight and mutation;
5. expression evaluation/render impact;
6. network and cache;
7. native extraction/inference;
8. import/timeline placement;
9. memory and cleanup.

A single total duration is not enough to find or prevent regressions.

## Panel performance

- Render only the active tool view.
- Avoid loading asset/caption modules on initial paint.
- Virtualize long grids and lists.
- Decode thumbnails near their display size.
- Do not rerender the component tree for every slider pixel.
- Coalesce host-context refreshes.
- Remove listeners and timers during lifecycle cleanup.
- Keep animations transform/opacity based and sparse.
- Split optional modules by feature when the runtime/toolchain supports it.

## Host bridge performance

Bridge crossings are expensive:

- send one validated batch rather than one command per layer/property;
- resolve targets once per command;
- return only required data;
- avoid network calls inside host loops;
- precompute math in the client/shared layer when safe;
- chunk long operations at stable boundaries;
- preserve one coherent Undo/transaction design.

Do not batch so much work that cancellation and UI responsiveness disappear.

## After Effects expression performance

- Avoid scanning all layers every frame.
- Avoid nested loops over keyframes/layers.
- Cache controller references in the expression structure when possible.
- Keep randomness deterministic and bounded.
- Prefer one controller over repeated duplicated calculations.
- Benchmark live expression cost on representative comps.
- Offer Bake for delivery-heavy or large projects.

## Premiere performance

- Minimize repeated project/sequence traversal.
- Re-resolve only objects invalidated by mutations.
- Batch compatible host actions using documented APIs.
- Chunk large MOGRT/caption/SFX insertion jobs.
- Keep progress and cancellation between chunks.
- Avoid holding stale host objects to save a negligible lookup cost.

## Assets and network

- Debounce and cancel obsolete searches.
- Paginate and prefetch conservatively.
- Cache according to provider policy.
- Use thumbnail renditions for browsing.
- Stream downloads to disk with size limits.
- Separate network, checksum, decode, and host import timings.
- Limit concurrent downloads and decodes.

## Native inference

- Keep inference off the UI thread.
- Probe CPU/GPU capabilities once and cache the result.
- Memory-map or reuse models where safe.
- Report model loading separately from inference.
- Support cancellation and process cleanup.
- Bound thread count to avoid starving Adobe.
- Benchmark representative short and long media on each architecture.

## Memory and lifecycle

- Release thumbnails, object URLs, buffers, native handles, and project references.
- Bound caches and expose user controls.
- Clean temp files after failure/cancel.
- Detect leaked event listeners after repeated panel show/hide.
- Test several consecutive jobs, not only a cold run.

## Benchmark method

For every optimization:

1. define fixture and hardware;
2. run a warm-up;
3. capture at least five measured runs for small tasks or an appropriate repeated sample;
4. report median and worst representative value;
5. compare before/after;
6. verify output equivalence;
7. add a regression threshold when stable.

Do not report a percentage without raw values and test conditions.

## Performance report

```text
PERFORMANCE REPORT
Path:
Host/version/OS/architecture:
Fixture:
Build:

Before: median / worst
After:  median / worst
Budget: pass | fail
Output equivalence: pass | fail
Memory/temp cleanup: pass | fail
Cancellation: pass | fail | n/a
Notes:
```

## Rejection criteria

Reject an optimization that:

- changes visual output without product approval;
- drops keyframe metadata or editability;
- bypasses validation or transaction safety;
- introduces stale object bugs;
- removes progress/cancellation;
- violates provider cache terms;
- increases memory without a bound;
- is justified only by intuition.
