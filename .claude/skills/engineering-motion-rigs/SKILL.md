---
name: engineering-motion-rigs
description: "Engineers motion-design behavior for keyframes, easing, anchor points, expressions, parallax, cameras, shapes, text, procedural effects, rigs, baking, and managed metadata. Use whenever a feature changes animation data or must preserve the visual result and editability."
---

# Engineering Motion Rigs

Use this skill for the mathematical and behavioral core of motion features. A motion tool is successful only when its output is predictable, editable, undoable, and safe in real project structures.

## Core invariants

Every managed motion feature must be:

- deterministic for a given input and seed;
- non-destructive by default;
- idempotent when Apply is repeated;
- editable through clearly named controllers;
- removable without harming unrelated user work;
- bakeable when expressions or live rigs are involved;
- compatible with parenting, dimensions, frame rate, and layer order as declared;
- tagged with stable feature/schema metadata.

## Standard lifecycle

Design each rig with explicit operations:

1. **Create/Apply** — create the smallest managed structure.
2. **Adjust** — update existing managed controls without duplication.
3. **Preview** — optional, bounded, and reversible.
4. **Bake** — convert live behavior to keyframes while preserving the visible result.
5. **Remove** — remove only managed artifacts.
6. **Repair/Migrate** — upgrade metadata or reconnect partially missing managed nodes.

Do not hide destructive replacement behind Apply.

## Managed metadata

Each created controller, effect, expression, marker, layer, or generated asset should record, where the host permits:

- product namespace;
- feature ID;
- rig instance ID;
- schema version;
- role within the rig;
- owning composition/sequence reference when needed;
- creation version;
- user-visible label separate from stable machine identity.

Never identify managed nodes by display name alone.

## Time and frame math

Centralize conversion between:

- seconds;
- frames;
- frame duration;
- Premiere ticks/timebase;
- source time versus composition/sequence time;
- layer in/out/start time;
- marker time.

Rules:

- use tolerances for floating-point comparison;
- snap only when the command contract requests it;
- preserve subframe data when the host supports it;
- explicitly test NTSC and drop-frame scenarios;
- never mix source and comp/sequence coordinates implicitly.

## Keyframe preservation

A keyframe operation must declare which properties it changes and preserve the rest:

- key time;
- value and dimensionality;
- in/out interpolation;
- temporal ease and influence;
- spatial tangents;
- temporal/spatial continuity;
- auto-Bezier state;
- roving state;
- selected state when practical;
- expression state on the property.

Before transformation, serialize the complete relevant keyframe model. After transformation, validate count, ordering, values, and interpolation.

## Editable easing curve

Represent the UI curve independently from host-specific ease objects. The conversion layer must:

- validate handle ranges and monotonic time;
- support separate incoming and outgoing handles;
- map normalized curve slopes to host speed/influence using property dimensionality and value/time deltas;
- handle zero-duration and zero-delta cases safely;
- preserve spatial interpolation unless explicitly changed;
- snapshot curve input and host output in tests.

Do not claim Flow-equivalent behavior without measured comparisons on supported property types.

## Anchor-point alignment

For Normal, Reverse, Convex, Concave, and Random modes:

- define the geometry for every mode in a versioned contract;
- compute bounds from the correct layer/source/shape space;
- account for scale, rotation, parent transforms, 3D state, and collapsed transformations where supported;
- preserve visible world position after anchor change;
- use a deterministic seed for Random;
- handle zero-size bounds and unsupported layer types explicitly.

Golden tests must compare world-space reference points before and after.

## Expression engineering

- Keep expressions small and O(1) or O(n) with a documented bound.
- Use templates and escaped tokens.
- Avoid per-frame traversal of large layer sets.
- Store user-facing controls on a managed controller/effect.
- Use stable effect/property match names where possible.
- Detect and preserve existing expressions.
- Provide a Bake path for delivery or performance-sensitive projects.
- Version expression templates and migrate managed instances.

## Parallax and 3D rigs

A parallax rig must declare:

- layer-role assignment;
- depth coordinate convention;
- camera/controller structure;
- focus target and auto-focus behavior;
- zoom model;
- wiggle domain and seed;
- parent and pre-existing 3D behavior;
- edge handling and overscan;
- Bake and Remove semantics.

Create the minimum number of layers and effects. Reuse a compatible existing managed rig. Never reparent user layers without recording and restoring their original parent state.

## Shapes, vectors, and text

- Preserve path winding, closed state, vertices, tangents, fills, strokes, and group transforms unless intentionally changed.
- Treat multiple contours and nested groups as first-class cases.
- Text-to-vector and Illustrator-to-vector must clearly communicate editability loss and preserve the source unless the user chooses replacement.
- Trim Path, Break Shape, Flip, Tile, Wave, Cube, Cylinder, and Particles need explicit input-type capability checks.
- Generated shapes must use stable naming and metadata, not generic “Shape Layer 1” assumptions.

## Procedural and random effects

For Flicker, Glitch, Particles, Noise, Delay, Kinetic, and related tools:

- expose a seed;
- separate frequency, amplitude, and distribution;
- define temporal continuity;
- avoid nondeterministic `Math.random()` during Apply;
- document whether randomness is evaluated live or baked;
- provide performance-safe defaults.

## Golden evidence

A motion feature requires at least one of:

- keyframe JSON snapshot;
- expression snapshot plus evaluated reference values;
- before/after world-coordinate fixture;
- render still/sequence with tolerance;
- object graph snapshot for managed rigs.

Golden evidence complements, not replaces, real-host interaction testing.

## Review gate

Reject the implementation when:

- repeated Apply duplicates controllers;
- Undo leaves partial artifacts;
- Bake changes the visible result beyond tolerance;
- Remove deletes user-created content;
- parenting or frame-rate assumptions are implicit;
- keyframe metadata is lost without being part of the feature contract;
- random output cannot be reproduced;
- the UI control has no tested mapping to host behavior;
- a visual feature is declared done without golden and host evidence.
