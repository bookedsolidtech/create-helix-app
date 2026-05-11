---
id: HX-024
title: hx-tooltip arrow rotation pivot — same Figma-renderer gap as hx-popup
status: filed
category: component-gap
severity: low
reported: 2026-05-05T22:55:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-023, HX-025]
---

# HX-024 — Tooltip arrow rotation pivot can't be expressed in Figma auto-layout

## Summary

`hx-tooltip`'s pointer arrow is implemented identically to `hx-popup`'s
— a 45°-rotated `::before` pseudo-element pinned to the panel edge.
The Figma renderer can't express the rotation pivot in auto-layout
and emits the panel without the arrow.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-tooltip.ts`
   — see the limitation comment on lines 13, 65 ("auto-layout cannot
   express the rotation pivot").
2. Open hx-tooltip's stories — confirm the arrow visual.
3. Build the figma kit — confirm the tooltip variant lacks an arrow.

## Expected

Same fix as HX-023: replace `::before` rotation with an inline SVG
arrow in the shadow-root template, expose `--hx-tooltip-arrow-size`,
`--hx-tooltip-arrow-color`, `--hx-tooltip-arrow-offset` as
component-tier tokens.

## Actual

Tooltip ships with `transform: rotate(45deg)` on the arrow
pseudo-element. Figma kit emits a panel-only variant.

## Source

- Helix: `packages/hx-library/src/components/hx-tooltip/hx-tooltip.styles.ts`
- figma-tokens: `plugin/renderers/hx-tooltip.ts:13,65`

## Root cause hypothesis

Same as HX-023: `transform: rotate()` is the natural runtime primitive
but unrenderable in Figma's constraint solver. Tooltip and popup share
the floating-element-with-pointer pattern.

## Suggested upstream fix

See HX-023 — apply the same SVG-arrow refactor. Both components can
share a `floating-arrow.ts` controller / template fragment.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-tooltip.ts` emits panel-only
variants. Documented as a deferred-work note.

## Cross-references

- Related issues: HX-023 (hx-popup), HX-025 (hx-popover)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Same root cause as HX-023.
