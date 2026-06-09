---
id: HX-XXX
title: hx-grid has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T20:00:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-grid has no .styles.ts and no own component-tier tokens

## Summary

`hx-grid` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties. As a structural CSS-Grid layout
primitive it relies entirely on grid CSS without any visual surface of
its own. The Figma renderer therefore has no component-tier tokens to
bind against and falls back to a semantic-only cascade for the schematic
kit.

## Reproduction

1. Search Helix repo for `hx-grid.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-grid` has
   zero component-tier tokens.
3. The renderer's schematic 3×3 cells are tinted with primitive primary
   tones purely for visual demonstration of `gap`/`justify`; no actual
   surface/text/border on a real `<hx-grid>` is bindable.

## Expected

Either:
- Confirm and document explicitly that `hx-grid` is a layout-only
  primitive with no themable surface (no token gap to fill), OR
- Expose `--hx-grid-gap`, `--hx-grid-row-gap`, `--hx-grid-column-gap`,
  and alignment aliases for programmatic theming so design-system
  overrides don't need to reach into the parent's CSS.

## Actual

The Figma renderer uses semantic `color/surface/sunken` (container bg)
+ `color/border/subtle` (container outline) + primitive `color/primary/300`
and `color/primary/500` for the schematic cells. No component-tier
intent is registered, so the cascade resolver lands on semantic +
primitive tiers only.

## Source

Helix: missing file `hx-grid.styles.ts`
figma-tokens: `plugin/renderers/hx-grid.ts` (this commit)

## Root cause hypothesis

`hx-grid` is a pure CSS-Grid layout container and was deliberately kept
visually bare. No tokens are missing — it just doesn't surface any.

## Suggested upstream fix

Add `--hx-grid-gap` (cascade fallback to `--hx-space-md`),
`--hx-grid-row-gap`, `--hx-grid-column-gap`, and alignment aliases so
consumers can theme spacing/alignment without re-implementing the
component. Alternatively, document that hx-grid is explicitly tokenless.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-grid.ts` registers no component-tier
intent and uses semantic-only fallbacks (`color/surface/sunken`,
`color/border/subtle`) plus primitive primary tones for the schematic
cells. Structural component, not a real surface — the schematic IS the
demo.

## Cross-references

- Related issues: hx-stack-no-styles, hx-button-group-no-styles,
  hx-carousel-item-no-styles, hx-dropdown-no-styles, hx-menu-divider-no-styles
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 4 renderer sweep. Workaround in
  place; structural component — possibly intentional.
