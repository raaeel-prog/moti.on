---
name: integrating-asset-services
description: "Integrates online asset providers, the product backend, database, search, caching, attribution, licensing, downloads, and Adobe-host import. Use for GIF, image, video, audio, overlay, texture, SFX, or music catalogs and any provider/API compliance work."
---

# Integrating Asset Services

Use this skill to build provider-neutral asset discovery while preserving each provider’s terms, attribution, download accounting, and media restrictions.

## Required architecture

```text
panel UI
  ↓ normalized search request
provider service / backend proxy for secrets and policy
  ↓ provider adapter
external provider API
  ↓ normalized asset record
secure download/cache/import pipeline
  ↓ AE or Premiere host adapter
```

Do not call every provider directly from the panel. Direct client calls are allowed only when a provider explicitly requires them and the security/compliance review approves the pattern.

## Provider adapter contract

Each adapter must expose a normalized interface for:

- capabilities;
- search and pagination;
- categories/curation when supported;
- asset details;
- preview URLs;
- downloadable renditions;
- attribution requirements;
- license/usage metadata;
- provider-specific download registration;
- rate-limit state;
- cache policy;
- removal/takedown state.

The normalized model must retain provider identity and original source URL. Never flatten away legal metadata.

## UI separation

- Keep providers visually distinguishable when their terms require it.
- Do not mix results in one grid when a provider prohibits aggregation.
- Show attribution where required, including in details and exported sidecars.
- Explain usage rights in plain language without pretending to provide legal advice.
- Keep search, provider filters, categories, favorites, downloads, and local library focused; do not add unrelated motion controls to the asset view.

## Secrets and backend

- Store provider secrets only in the backend or approved secure configuration.
- Use short-lived product tokens for authenticated panel requests.
- Apply rate limits per account, device, IP, and provider as appropriate.
- Never log API keys, signed URLs, user media, full search history, or authorization headers.
- Rotate keys and support provider disablement without a client release.

## Download security

Before importing any remote asset:

1. validate the URL and allowed protocol;
2. prevent SSRF and private-network redirects on backend fetches;
3. enforce redirect, byte-size, duration, and timeout limits;
4. verify MIME using content signatures, not headers alone;
5. verify declared dimensions/duration when possible;
6. calculate checksum;
7. scan or reject executable/polyglot content;
8. write to a controlled temporary path;
9. import through the host adapter;
10. persist provenance and attribution metadata;
11. clean temporary files according to policy.

Never import HTML, script, or unknown binary content as media.

## Cache policy

The cache must distinguish:

- thumbnails/previews;
- downloaded original media;
- generated proxies;
- attribution metadata;
- user-favorited references;
- provider results that may not be cached.

Each entry needs provider, asset ID, rendition, checksum, size, creation time, last access, expiration, and legal cache policy. Purge removed/takedown assets when notified.

## Taxonomy

Use a product-owned taxonomy independent from provider labels, for example:

- overlay textures;
- light leaks;
- grunge overlays;
- noise;
- film burn;
- dust and scratches;
- transitions;
- SFX;
- music;
- GIFs;
- images;
- video clips.

Map provider categories to this taxonomy in adapters. Do not overwrite provider metadata.

## Host import

### After Effects

- download outside the ExtendScript mutation loop;
- validate path and project availability;
- import through a single Undo group when possible;
- create/reuse a managed folder structure;
- preserve provenance in comments/metadata sidecars;
- avoid duplicate imports by checksum when the user enables deduplication.

### Premiere Pro

- use documented UXP filesystem and import APIs;
- create/reuse managed bins;
- do not assume track insertion is part of import;
- separate download, project import, and timeline placement actions;
- preserve provider/license metadata in a sidecar or supported metadata field.

## Offline and failure states

The asset surface must handle:

- offline mode;
- expired auth;
- provider outage;
- rate limit with retry time;
- removed asset;
- unsupported media type;
- download cancellation;
- disk full;
- checksum mismatch;
- host import failure after successful download.

A failed host import must not lose the downloaded file without informing the user.

## Tests

- adapter normalization contract tests;
- provider-specific attribution and caching rules;
- pagination and cancellation;
- rate-limit/backoff;
- MIME spoof and oversized payload rejection;
- redirect/SSRF defenses;
- checksum and cache eviction;
- offline results and recovery;
- AE and Premiere fixture import;
- provenance sidecar snapshots;
- provider disablement and terms-change migration.

## ADR triggers

Stop and record an ADR before:

- adding a provider with unclear commercial rights;
- caching content against provider terms;
- proxying a provider that requires direct client traffic;
- bundling music/SFX without verified redistribution rights;
- storing user search history or media in the cloud;
- using Freesound or another mixed-license catalog commercially without a defined filter and audit process.
