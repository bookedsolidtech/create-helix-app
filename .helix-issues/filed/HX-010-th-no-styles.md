---
id: HX-XXX
title: hx-th has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T21:00:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-th has no .styles.ts and no own component-tier tokens

## Summary

`hx-th` (table header cell atom) ships without a dedicated `.styles.ts`
and exposes no component-tier custom properties of its own. Its visual
treatment is inherited entirely from `hx-table`'s header rules. The Figma
renderer therefore has no component-tier tokens to bind against and falls
back to a semantic-only cascade.

## Reproduction

1. Search Helix repo for `hx-th.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-th` has zero
   component-tier tokens.
3. The renderer paints background → `color/surface/raised`, border →
   `color/border/subtle`, label and sort glyph → `color/text/strong`.
   No component-tier intent registers; the cascade resolver lands on
   semantic only.

## Expected

Either:
- Confirm and document explicitly that `hx-th` is a structural atom whose
  visual treatment is owned by the parent `hx-table` (no token gap), OR
- Expose `--hx-th-bg`, `--hx-th-color`, `--hx-th-border-color`,
  `--hx-th-sort-icon-color` aliases that fall back to the equivalent
  `--hx-table-header-*` tokens, so consumers can target the header cell
  directly without reaching into the table CSS.

## Actual

The Figma renderer's schematic uses semantic surface/raised + border/subtle
+ text/strong. No component-tier intent is registered, so the cascade
resolver lands on semantic tier only.

## Source

Helix: missing file `hx-th.styles.ts`
figma-tokens: `plugin/renderers/hx-th.ts` (this commit)

## Root cause hypothesis

`hx-th` is a structural atom — its visual treatment is owned by the parent
`hx-table`'s header rules (`--hx-table-header-bg`, `--hx-table-header-color`).
No tokens are missing per se; the atom just doesn't surface any of its own.

## Suggested upstream fix

Either add a documented note in the Helix README declaring `hx-th` as
tokenless (style is owned by the parent), or expose a thin alias layer
(`--hx-th-bg` → `var(--hx-table-header-bg, ...)`) so designers can theme
header cells directly without hunting through the table CSS.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-th.ts` registers no component-tier intent
and uses semantic-only fallbacks (`color/surface/raised`, `color/border/subtle`,
`color/text/strong`). Acceptable for the schematic kit; the actual Helix
header cell inherits from `hx-table` at runtime.

## Cross-references

- Related issues: hx-td, hx-toast-stack (same pattern in this commit;
  also hx-stack, hx-button-group, hx-carousel-item, hx-dropdown,
  hx-menu-divider from earlier sweeps)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 cleanup sweep (final batch). Workaround
  in place; structural atom — possibly intentional.
