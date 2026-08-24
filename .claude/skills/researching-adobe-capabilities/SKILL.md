---
name: researching-adobe-capabilities
description: "Researches current Adobe and provider capabilities from primary sources before implementation. Use when an API symbol, host version, manifest permission, transcript feature, CEP behavior, native extension point, packaging rule, or provider policy is uncertain or may have changed."
---

# Researching Adobe Capabilities

Resolve capability questions before coding. The output is an evidence-backed implementation decision, not a pile of links.

## Source priority

1. Current official Adobe documentation and API reference.
2. Official Adobe TypeScript declarations, SDK headers, samples and changelogs.
3. Official Adobe-owned GitHub repositories for CEP resources and samples.
4. Official provider documentation for asset APIs and licenses.
5. Primary open-source repository documentation for a native dependency.
6. Community reports only to identify bugs or edge cases; never use them as sole proof of a supported API.

For After Effects scripting, distinguish Adobe-owned CEP material from community-maintained scripting reference mirrors. Mark the provenance clearly.

## Research questions

Translate a vague question into exact checks:

- Does the symbol exist?
- In which host and minimum version?
- Is it a method, property, action factory, event or permission?
- Is it synchronous or asynchronous?
- Is mutation required to run inside a lock or transaction?
- Does it produce a host Undo item?
- Does it require manifest or user-granted permission?
- Is it available in release, beta, experimental or deprecated status?
- Are there known limitations that affect the acceptance criteria?
- What is the supported fallback?

## Required research record

Create or update `docs/research/<topic>.md` using this shape:

```text
Question:
Decision date:
Target host/version:
Status: available | partial | unavailable | experimental | deprecated

Evidence table:
- Claim
- Exact symbol or policy
- Minimum version
- Primary source
- Notes

Implementation decision:
Fallback:
Capability flag:
Tests needed:
Open uncertainty:
```

Use a concrete date. APIs and provider policies change.

## Verification procedure

1. Search the current official reference using the exact product and concept.
2. Open the class or module page, not just a search snippet.
3. Capture exact spelling, casing, parameters, return type and minimum version.
4. Cross-check with official declarations or sample code when available.
5. Check the changelog for introduction, breaking changes or deprecation.
6. Check manifest permissions and runtime restrictions separately from the DOM API.
7. Search official issue trackers for open defects only after support is established.
8. Define an executable smoke test that proves the capability in the host.

## Capability matrix rule

Represent support explicitly. Example shape:

```json
{
  "premiere.transcript.hasTranscript": {
    "status": "supported",
    "minVersion": "26.3",
    "probe": "typeof transcript.hasTranscript === 'function'",
    "fallback": "import transcript segments or run offline transcription"
  }
}
```

Do not infer support from host version alone. Combine version gates with runtime symbol probes where safe.

## Adobe-specific prohibitions

- Do not invent methods based on ExtendScript names when implementing UXP.
- Do not use the legacy Premiere QE DOM unless the product owner explicitly accepts unsupported behavior.
- Do not assume UXP is a full browser.
- Do not assume a Spectrum component or CSS feature works without checking UXP support.
- Do not assume After Effects display names are stable across locales; research `matchName` or stable identifiers.
- Do not request broad filesystem, network or launch permissions when a narrower level is sufficient.
- Do not claim the plugin can trigger Premiere internal transcription unless a current official method proves it.
- Do not extrapolate one provider’s caching, attribution or proxy rules to another provider.

## Handling absent capabilities

When the desired API is absent:

1. state that it is absent or unproven;
2. identify the closest documented capability;
3. propose one or more fallbacks;
4. compare UX, security, performance and distribution impact;
5. update the capability matrix;
6. disable or hide the unsupported control rather than shipping a fake action.

Fallback examples include local media analysis, transcript import, MOGRT output, After Effects Dynamic Link, a signed companion service, manual file picker, or a reduced feature mode. Choose only after evidence.

## Completion gate

Research is complete when an implementer can write the exact code path and fallback without guessing. A list of URLs without symbol, version, decision and test is incomplete.
