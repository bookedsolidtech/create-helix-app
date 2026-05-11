---
id: HX-XXX
title: hx-td has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T21:00:01Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-td has no .styles.ts and no own component-tier tokens

## Summary

`hx-td` (table data cell atom) ships without a dedicated `.styles.ts` and
exposes no component-tier custom properties. Its visual treatment is owned
by the parent `hx-table`'s body / row-stripe rules. The Figma renderer
therefore has no component-tier tokens to bind against and falls back to a
semantic-only cascade.

## Reproduction

1. Search Helix repo for `hx-td.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-td` has zero
   component-tier tokens.
3. The renderer paints background → `color/surface/default`, border →
   `color/border/subtle`, text → `color/text/primary`. No component-tier
   intent registers; the cascade resolver lands on semantic only.

## Expected

Either:
- Confirm and document explicitly that `hx-td` is a structural atom whose
  visual treatment is owned by the parent `hx-table` (no token gap), OR
- Expose `--hx-td-color`, `--hx-td-bg`, `--hx-td-border-color` aliases
  that fall back to the equivalent table-level tokens, plus optional
  alt-row treatment via `--hx-td-alt-bg` (→ `color/surface/sunken`),
  so consumers can theme cells directly.

## Actual

The Figma renderer's schematic uses semantic surface/default + border/subtle
+ text/primary. No component-tier intent is registered, so the cascade
resolver lands on semantic tier only.

## Source

Helix: missing file `hx-td.styles.ts`
figma-tokens: `plugin/renderers/hx-td.ts` (this commit)

## Root cause hypothesis

`hx-td` is a structural atom — its visual treatment is owned by the parent
`hx-table`'s body rules. No tokens are missing per se; the atom just
doesn't surface any of its own.

## Suggested upstream fix

Either add a documented note declaring `hx-td` as tokenless, or expose a
thin alias layer (`--hx-td-color` → `var(--hx-table-cell-color, ...)`) so
designers can theme data cells directly without reaching into the table
CSS. Also consider an alt-row token for striped tables.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-td.ts` registers no component-tier intent
and uses semantic-only fallbacks (`color/surface/default`, `color/border/subtle`,
`color/text/primary`). Acceptable for the schematic kit; the actual Helix
data cell inherits from `hx-table` at runtime.

## Cross-references

- Related issues: hx-th, hx-toast-stack (same pattern in this commit)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 cleanup sweep (final batch). Workaround
  in place; structural atom — possibly intentional.
