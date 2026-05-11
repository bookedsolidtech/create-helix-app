---
id: HX-043
title: hx-tree-view depth-indent + interactive-depth visual lacks per-depth tokens
status: filed
category: token-gap
severity: low
reported: 2026-05-06T00:30:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-043 — Tree-view depth-indent + per-depth chrome unthemable

## Summary

`hx-tree-view` (and its sub-element `hx-tree-item`) render hierarchical
data with each depth level visually indented. The indent amount is
hard-coded as a `padding-left: calc(var(--depth) * 16px)` or similar
in `hx-tree-item.styles.ts`. There's no `--hx-tree-item-indent` token
nor per-depth tokens (e.g. for visual differentiation at depth 1 vs
depth 2 — useful for clinical lab-result trees where depth carries
semantic meaning).

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-tree-view/hx-tree-item.styles.ts`
   — search for indent calculation.
2. Confirm hard-coded multiplier; no `--hx-tree-item-indent` exposed.

## Expected

Add component-tier tokens:

- `--hx-tree-item-indent` (default 16px; multiplied by depth at
  runtime via CSS calc).
- `--hx-tree-item-depth-line-color` (the vertical hierarchy line —
  if rendered).
- `--hx-tree-item-depth-line-width` (default 1px).
- `--hx-tree-item-toggle-size` (the chevron / disclosure triangle
  size).

Optional: per-depth selectors `[data-depth="0"]`, `[data-depth="1"]`,
etc. for custom per-depth chrome.

## Actual

Hard-coded indent. No theming seam.

## Source

- Helix: `packages/hx-library/src/components/hx-tree-view/hx-tree-item.styles.ts`
- figma-tokens: `plugin/renderers/hx-tree-item.ts`

## Root cause hypothesis

Tree-view was added late in the library lifecycle; the depth-token
surface was deferred.

## Suggested upstream fix

See "Expected." Add tokens + update the styles file to consume.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-tree-item.ts` renders depth-0 only
in the kit (multi-depth would require a custom variant axis).

## Cross-references

- Related issues: (none direct)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
