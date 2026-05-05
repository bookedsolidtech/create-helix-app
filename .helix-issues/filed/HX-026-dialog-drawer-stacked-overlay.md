---
id: HX-026
title: hx-dialog + hx-drawer use z-stacked overlay siblings — not expressible in Figma auto-layout
status: filed
category: component-gap
severity: medium
reported: 2026-05-05T23:05:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-026 — Dialog + drawer overlay-on-panel pattern not expressible in auto-layout

## Summary

`hx-dialog` and `hx-drawer` both render a backdrop (semi-transparent
fill covering the viewport) plus a panel (the actual modal content)
that sit at the same z-region but as separate stacked siblings. CSS
expresses this via `position: fixed` on both, with `z-index` ordering
the layers.

Figma's auto-layout cannot express two siblings sharing the same xy
coordinates — auto-layout flows children sequentially. The figma-tokens
renderer emits the panel only (without the backdrop) and documents the
gap.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-dialog.ts`
   — limitation on lines 14, 128 ("z-stacked siblings sharing the same
   xy region — auto-layout cannot express stacked siblings nor edge-
   anchored absolute xy").
2. `cat plugin/renderers/hx-drawer.ts` — same on lines 15, 127.
3. The figma kit emits a panel-only variant for both, with no backdrop
   and no edge-anchored placement.

## Expected

This is a structural mismatch between Helix's runtime contract (CSS
position-fixed siblings) and Figma's authoring model (auto-layout
flow). The cleanest fix is upstream documentation: a
`docs/overlay-pattern.md` describing the dialog+drawer rendering
contract so design-tooling consumers know they need a custom
positioning pass for these molecules.

A more invasive fix would be to refactor dialog/drawer to use a
`<dialog>`-element + the new top-layer + popover API, which moves the
overlay into a browser-managed top layer (no z-stacking concern at the
DOM level). This also fixes a class of focus-trap bugs.

## Actual

Renderers emit panel-only variants. Backdrop is implicit; designers
draw it manually if needed.

## Source

- Helix: `packages/hx-library/src/components/hx-dialog/hx-dialog.styles.ts`
- Helix: `packages/hx-library/src/components/hx-drawer/hx-drawer.styles.ts`
- figma-tokens: `plugin/renderers/hx-dialog.ts:14,128`,
  `plugin/renderers/hx-drawer.ts:15,127`

## Root cause hypothesis

Both components were authored before broad browser support for
`<dialog>` + `popover` attribute. The position-fixed-siblings pattern
is the legacy fallback. Now that `<dialog>` ships in all evergreen
browsers, refactor to use the top layer is feasible.

## Suggested upstream fix

Two-pass:

1. Document the current overlay pattern in
   `docs/overlay-pattern.md` so design-tool consumers can implement
   their own positioning pass.
2. Stretch: refactor hx-dialog to use `<dialog>` + `dialog.showModal()`
   and hx-drawer to use the `popover=manual` API. This fixes the
   z-stacking concern, simplifies focus-trap handling, and gives
   browsers responsibility for the top layer.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-dialog.ts` and `hx-drawer.ts` emit
panel-only variants. Documented as a deferred-work note. Designers can
add a backdrop fill manually.

## Cross-references

- Related issues: (none direct)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place;
  upstream refactor to `<dialog>` is a stretch goal for a future
  helix release.
