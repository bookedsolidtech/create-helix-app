---
id: HX-025
title: hx-popover arrow rotation pivot — same Figma-renderer gap as hx-popup
status: filed
category: component-gap
severity: low
reported: 2026-05-05T23:00:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-023, HX-024]
---

# HX-025 — Popover arrow rotation pivot can't be expressed in Figma auto-layout

## Summary

`hx-popover`'s pointer arrow shares the rotation-pivot pattern with
`hx-popup` and `hx-tooltip`. Figma renderer omits the arrow.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-popover.ts`
   — limitation comments on lines 18, 89 ("auto-layout cannot express
   the arrow-on-edge rotation pivot").

## Expected

Same SVG-arrow refactor as HX-023. Likely a candidate for a shared
`floating-arrow` template fragment used by hx-popup, hx-popover, and
hx-tooltip.

## Actual

Pop​over ships with rotated `::before` pseudo-element. Figma kit emits
panel-only variants.

## Source

- Helix: `packages/hx-library/src/components/hx-popover/hx-popover.styles.ts`
- figma-tokens: `plugin/renderers/hx-popover.ts:18,89`

## Root cause hypothesis

Same as HX-023.

## Suggested upstream fix

See HX-023. Stretch goal: extract a shared
`packages/hx-library/src/utilities/floating-arrow.ts` that produces
the SVG arrow markup, used by all three floating-element components
to centralize the rotation-free implementation.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-popover.ts` emits panel-only
variants.

## Cross-references

- Related issues: HX-023, HX-024

## Status notes

- 2026-05-05: filed during D2-bis backfill. Same root cause as HX-023;
  consider grouping all three for a single helix PR.
