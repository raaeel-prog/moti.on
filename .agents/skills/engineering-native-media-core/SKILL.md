---
name: engineering-native-media-core
description: Build native media processing only when JavaScript is insufficient. Use for Premiere .uxpaddon modules, After Effects companion services, whisper.cpp, audio analysis, C/C++ ABI design, IPC, cancellation, crash isolation, signing, and native build matrices.
---

# Engineering the Native Media Core

Native code exists to provide measurable capability or performance that the host scripting runtime cannot safely deliver. It is not a default implementation choice.

## Admission test

Use native code only when at least one is true:

- required API is available only through a native extension point;
- media processing would block or exceed host/runtime budgets;
- a proven native library is required;
- offline ML inference needs native acceleration;
- secure OS integration cannot be implemented in the plugin sandbox.

Document the rejected JavaScript-only alternative.

## Host strategy

Premiere:

- use the current documented hybrid UXP mechanism and supported `.uxpaddon` contract;
- gate by exact Premiere/UXP version;
- keep a non-native product mode when practical.

After Effects:

- use a signed companion process for transcription/media services when CEP/ExtendScript is unsuitable;
- use the After Effects native plug-in SDK only for true effects/importers/exporters or other SDK-defined plug-in types;
- do not inject libraries into the host process outside documented SDK mechanisms.

## Stable boundary

Expose a narrow versioned protocol:

```text
handshake
capabilities
start job
progress event
cancel job
complete result
error
shutdown
```

Requests and responses include protocol version, job ID and bounded payloads. Prefer file references or shared buffers for large media, not huge JSON/base64 messages.

## C ABI and ownership

- Use explicit integer sizes and UTF-8.
- Define who allocates and frees memory.
- Do not throw C++ exceptions across a C ABI.
- Return structured error codes and messages.
- Make ABI version negotiation mandatory.
- Keep third-party types out of public headers.
- Validate every path, length, enum and buffer size at the boundary.

## Process and crash isolation

For companion services:

- launch only with declared permission and user-visible purpose;
- authenticate the local IPC peer;
- bind to local-only transport;
- use random session tokens;
- apply timeouts and heartbeat;
- terminate orphan jobs;
- clean temporary files;
- never accept arbitrary command execution.

A native crash must not corrupt the Adobe project. Return a recoverable error and preserve core plugin functionality.

## Cancellation and progress

- Use cooperative cancellation checked inside long loops.
- Report real units: frames, samples, segments or bytes.
- Guarantee a terminal event once.
- Define cleanup for cancellation and process termination.
- Avoid blocking the UXP/CEP UI thread.

## whisper.cpp integration

- Pin a reviewed commit/release.
- Record upstream license and third-party notices.
- Build per OS/architecture/backend.
- Separate engine binary from downloadable models.
- Verify model checksum and compatibility.
- Expose language, timestamps and optional word timing through the versioned protocol.
- Benchmark representative audio and define memory limits.

## Build matrix

At minimum plan:

```text
Windows x64
macOS x64 when supported by product matrix
macOS arm64
Debug with symbols
Release signed/notarized
CPU baseline
Optional acceleration backends by capability
```

Use reproducible toolchains and locked dependencies. Store symbols separately for crash diagnosis.

## Security

- Threat-model untrusted media files.
- Fuzz parsers and boundary code.
- Apply file size, duration and resource limits.
- Sandbox the companion where possible.
- Verify downloaded binaries/models.
- Sign Windows and macOS artifacts.
- Do not download executable updates outside the signed release channel.

## Tests

- protocol version mismatch;
- malformed and oversized request;
- cancel and timeout;
- crash/restart;
- concurrent jobs and enforced limits;
- Unicode paths;
- missing model/backend;
- checksum failure;
- long audio memory budget;
- clean uninstall;
- host continues after native failure.

## Completion gate

Native work is complete when the ABI/protocol is versioned, crashes are isolated, cancellation works, binaries are reproducible and signed, licenses are recorded, and both host integration and fallback mode are verified.
