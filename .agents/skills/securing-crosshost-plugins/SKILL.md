---
name: securing-crosshost-plugins
description: "Performs security and privacy design for the CrossHost plugin. Use for command bridges, expressions, filesystem access, downloads, providers, authentication, licensing, telemetry, native addons, local companions, model files, updates, or any handling of user projects and media."
---

# Securing CrossHost Plugins

Use this skill for threat modeling and implementation review. Adobe project files, downloaded media, provider credentials, and native components are all sensitive boundaries.

## Threat model

Consider at least:

- malicious command payload reaching ExtendScript or Premiere APIs;
- expression or script injection;
- untrusted media/polyglot downloads;
- provider/backend SSRF and redirect abuse;
- leaked API keys, tokens, licenses, or signed URLs;
- path traversal and overwrite;
- tampered model/native binaries;
- insecure local companion communication;
- update-channel compromise;
- telemetry or logs leaking project/media/transcript data;
- dependency or build-pipeline compromise;
- license bypass that weakens legitimate user privacy or stability.

Document trust boundaries and data flows before implementing a new external or native integration.

## Command bridge

- Use an allowlisted command registry.
- Validate envelope schema and payload before dispatch.
- Enforce command-specific input ranges and types.
- Reject unknown fields for sensitive operations when practical.
- Use request IDs, timeouts, and result codes.
- Never evaluate payload strings as JavaScript/ExtendScript.
- Do not expose a generic “run script” production command.
- Limit returned data to what the UI needs.

## Expression safety

- Use reviewed templates.
- Substitute only validated tokens through escaping functions.
- Do not interpolate arbitrary layer names, user text, or code fragments directly.
- Mark and version managed expressions.
- Preserve existing user expressions unless explicit replacement is confirmed.
- Test quotes, backslashes, Unicode, line breaks, and adversarial text.

## Filesystem safety

- Use controlled application/cache/temp roots.
- Canonicalize and validate paths.
- Prevent traversal outside allowed roots for backend/native operations.
- Avoid silent overwrite; use atomic temp-write-and-rename.
- Enforce size and free-space limits.
- Restrict executable extensions and permissions.
- Clean temporary files on success, failure, and cancellation.
- Never log full private paths unless diagnostics explicitly require them.

## Network and media

- Use HTTPS and verify certificates through supported platform mechanisms.
- Store provider secrets on the backend, not in panel bundles.
- Apply timeout, redirect, size, type, and rate limits.
- Verify media signatures and checksum.
- Defend backend fetches against SSRF/private address ranges.
- Do not execute downloaded content.
- Keep provider attribution and provenance.
- Provide a hard offline mode for features that promise local-only behavior.

## Authentication and licensing

- Use short-lived access tokens and secure refresh handling.
- Store tokens only in the best secure storage available to the host/platform.
- Do not put license secrets or private signing keys in the repository.
- Bind device identifiers conservatively and document reset/recovery.
- Avoid invasive anti-tamper techniques that destabilize Adobe or inspect unrelated user data.
- Fail gracefully: licensing outages must not corrupt projects.
- Separate entitlement from project file readability whenever possible.

## Native addons and companions

- Define a narrow, versioned ABI/protocol.
- Authenticate local IPC and restrict it to local interfaces.
- Validate every path and operation server-side.
- Never expose arbitrary shell execution.
- Verify model/addon manifests and hashes.
- Compile release binaries with hardening options.
- Sign/notarize required binaries and updates.
- Archive symbols privately for crash diagnosis.
- Ensure missing/incompatible native code disables only dependent features.

## Updates

- Sign update metadata and packages.
- Use HTTPS and integrity checks.
- Support rollback and staged rollout.
- Never replace native binaries while in use without a coordinated installer/update flow.
- Keep release channels explicit.
- Test downgrade and interrupted update recovery.

## Privacy and telemetry

Default telemetry must exclude:

- project names and paths;
- media contents or hashes that can identify user files;
- transcript/caption text;
- search queries unless explicitly consented and minimized;
- layer names and creative values;
- provider authorization headers;
- device data beyond what is necessary.

Use explicit consent, retention limits, export/delete controls, and a documented event schema. Local diagnostics should be redacted and bounded.

## Dependency and supply-chain review

- Pin and lock dependencies.
- Review licenses and redistribution obligations.
- Generate an SBOM for release.
- Scan for known vulnerabilities and secrets.
- Prefer small, maintained dependencies.
- Do not fetch executable build inputs from mutable URLs without integrity pinning.
- Review vendored Adobe files and preserve notices.

## Security test gate

Run relevant tests for:

- malformed command envelopes;
- code/expression injection payloads;
- path traversal and symlink edge cases;
- MIME spoofing, decompression bombs, oversized media;
- SSRF and redirect chains;
- expired/revoked tokens;
- tampered model/addon package;
- unauthorized local IPC;
- offline mode network denial;
- redaction of logs and crash reports;
- interrupted update and rollback.

## Stop conditions

Do not ship when:

- any secret is embedded in client code;
- arbitrary scripts can cross the command bridge;
- downloaded content is trusted by extension alone;
- native binaries are unsigned where the platform requires signing;
- telemetry collects creative content without explicit consent;
- cloud media retention is undefined;
- provider or model licensing is unresolved;
- a security failure can leave the Adobe project partially corrupted.
