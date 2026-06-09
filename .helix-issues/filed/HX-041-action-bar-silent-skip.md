---
id: HX-041
title: hx-action-bar single-tag rebuild silently skips picker tags missing from ctx
status: filed
category: behavior-gap
severity: low
reported: 2026-05-06T00:20:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-041 — Action-bar curated picker silently drops missing tags

## Summary

`hx-action-bar`'s curated-picker functionality (the slot-instance
swap mechanism that lets designers pick which atom variant
populates the bar's slots) silently skips tags missing from the
build context (`ctx.componentSetByTag`). This happens during a
single-tag rebuild — when only `hx-action-bar` is being rebuilt and
its curated child instances haven't been built yet in the same run.

The skip is documented in
`plugin/renderers/hx-action-bar.ts:285-286` ("tags missing from ctx
(single-tag rebuild) are silently skipped") but there's no error
message visible to the designer running the rebuild, so the
resulting action-bar kit looks mysteriously empty.

## Reproduction

1. Build the full Helix kit once (all renderers run; ctx populated).
2. Modify a single tag (`hx-action-bar` for example) and run
   "Build only hx-action-bar."
3. Observe the rebuilt action-bar kit ships without its curated
   pickers — the slot frames are empty.
4. No error or warning visible to the user.

## Expected

When the renderer detects missing curated-picker tags during a
single-tag rebuild, surface a non-blocking warning:

```
[hx-action-bar] Curated pickers omitted (rebuild only hx-action-bar):
   missing tags from previous build context — hx-button, hx-link.
   Run a full kit build to restore.
```

Or, more aggressively: refuse to single-tag-rebuild components that
have curated picker dependencies on tags not in ctx.

## Actual

Silent skip. Rebuilt kit looks broken to the designer; only the
plugin source code documents why.

## Source

- figma-tokens: `plugin/renderers/hx-action-bar.ts:285-286`

## Root cause hypothesis

Single-tag rebuild is a developer-iteration shortcut; the original
implementation prioritized "don't crash" over "don't surprise."
Silent skip was the wrong default.

## Suggested upstream fix

Helix-side: this is actually a figma-tokens-side fix (workaround
location), but documenting it as a helix-issue because it surfaces a
broader contract gap: components with curated-picker dependencies
should declare them in CEM so consumer tooling knows to load
prerequisites. Add a CEM custom field `requires-tags: string[]` for
components that depend on other tags being build-context-resident.

## Local workaround (if any)

The skip happens silently in
`figma-tokens/plugin/renderers/hx-action-bar.ts:285-286`. A future
plugin patch would add the warning surface.

## Cross-references

- Related issues: (none direct)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place;
  primarily a figma-tokens UX issue rather than a helix-team issue.
