---
id: HX-023
title: hx-popup arrow uses CSS rotation pivot — not expressible in Figma auto-layout
status: filed
category: component-gap
severity: medium
reported: 2026-05-05T22:50:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-024, HX-025]
---

# HX-023 — Popup arrow rotation pivot can't be expressed in Figma auto-layout

## Summary

`hx-popup`'s arrow indicator is a 45°-rotated square positioned via
absolute placement on one of four edges (top / right / bottom / left
of the panel). The rotation pivot is the square's center; the absolute
xy is the panel-edge midpoint minus half the square's diagonal.

Figma's auto-layout cannot express "rotate child around its own center
while pinned to the parent's edge." A Figma renderer either drops the
arrow entirely or fakes it with four pre-rotated frame variants — the
latter explodes the variant count by 4× and still doesn't render
correctly when designers customize placement.

The clean upstream fix is to expose the arrow as a thin SVG slot that
Figma can render verbatim, OR to provide a CSS-side option that uses
border-image to draw the arrow without needing rotation.

## Reproduction

1. `cd /Volumes/Development/booked/figma-tokens`.
2. `cat plugin/renderers/hx-popup.ts` — see the documented limitation
   on lines 16, 104, 222 ("auto-layout cannot express the rotation
   pivot").
3. Open hx-popup's stories — visually confirm the arrow on each
   placement variant (top/right/bottom/left).
4. The figma-tokens kit emits a placement-aware bar but no arrow
   visual.

## Expected

Helix's arrow rendering uses one of:

- **SVG primitive**: a `<svg>` arrow inside the shadow root, sized
  via CSS `width/height` and rotated via CSS `transform`. Figma
  renderers can extract the SVG path and emit it verbatim.

- **CSS border-image**: a 9-slice border-image with the arrow baked
  into the slice. Figma can emit this as a per-edge stroke pattern.

- **Per-edge pre-rendered class**: `.arrow--top`, `.arrow--right`,
  etc. each with its own background-image or pseudo-element. Figma
  renderers map each edge to a discrete variant.

Documented in a `docs/popup-arrow-rendering.md` so consumer renderers
know which approach to follow.

## Actual

Current Helix implementation uses a `transform: rotate(45deg)` on a
positioned `::before` pseudo-element. This is correct for the runtime
but undiscoverable / unrenderable for design-tooling consumers.

## Source

- Helix: `packages/hx-library/src/components/hx-popup/hx-popup.styles.ts`
  (the `::before` arrow rules)
- figma-tokens: `plugin/renderers/hx-popup.ts:16,104,222` (limitation
  comments)

## Root cause hypothesis

CSS `transform: rotate()` is the natural runtime primitive. Figma
auto-layout's flexbox-like constraint solver doesn't have a
"rotation around child center" axis. The mismatch wasn't apparent
until the figma-tokens kit tried to emit popup variants.

## Suggested upstream fix

Smallest-impact: add a `<svg>` arrow to the shadow-root template
(replace the `::before` rotation with an explicit SVG path). Sized via
CSS variables (`--hx-popup-arrow-size`); positioned via CSS variables
(`--hx-popup-arrow-offset`). Rotation baked into the SVG path, not
applied via `transform` — so each placement gets its own SVG path.

Add `--hx-popup-arrow-size`, `--hx-popup-arrow-offset`, and
`--hx-popup-arrow-color` as documented component-tier tokens.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-popup.ts` builds a placement-aware
bar without the arrow. The kit's popup variants visually convey
direction via panel offset; designers are expected to draw the arrow
manually if needed. Documented as a deferred-work note.

## Cross-references

- Related issues: HX-024 (hx-tooltip same shape), HX-025 (hx-popover
  same shape)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place;
  arrow rendering is deferred.
