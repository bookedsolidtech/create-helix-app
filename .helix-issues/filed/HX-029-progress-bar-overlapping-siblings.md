---
id: HX-029
title: hx-progress-bar uses overlapping siblings (track + fill) — pattern unrenderable in Figma
status: filed
category: component-gap
severity: low
reported: 2026-05-05T23:20:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-029 — Progress-bar track + fill share xy region

## Summary

`hx-progress-bar` renders the track (full width, gray) and the fill
(partial width, brand color) as overlapping siblings sharing the same
xy origin. Figma auto-layout can't express this; renderer faked the
fill as a child-of-track frame which produces near-identical visual
but gives designers a different layer-panel structure than the
runtime DOM suggests.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-progress-bar.ts`
   — limitation on lines 15, 132 ("cannot express overlapping
   siblings").
2. Inspect runtime DOM — `<div class="track"></div><div
   class="fill"></div>` siblings; CSS positions both at `left: 0`.

## Expected

Restructure to nested layout: `<div class="track"><div class="fill">
</div></div>`. The fill is a child of the track; its width controls
the visual progress. Same visual; expressible in any layout system.

## Actual

Sibling overlap. Figma renderer fakes the parent-child structure to
get a renderable kit.

## Source

- Helix: `packages/hx-library/src/components/hx-progress-bar/hx-progress-bar.styles.ts`
- figma-tokens: `plugin/renderers/hx-progress-bar.ts:15,132`

## Root cause hypothesis

Authoring decision; the sibling structure may have been chosen for
animation reasons (independent transition curves on track + fill).

## Suggested upstream fix

Refactor to nested layout. Verify animations still work — likely they
do, with no perceptible difference.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-progress-bar.ts` emits nested
layout. Visual is faithful; layer panel diverges slightly from
runtime DOM.

## Cross-references

- Related issues: (none direct — same shape as HX-026 but smaller
  blast radius)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place.
