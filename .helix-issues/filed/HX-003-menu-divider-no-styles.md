---
id: HX-XXX
title: hx-menu-divider has no .styles.ts and borrows tokens from hx-menu
status: draft
category: token-gap
severity: low
reported: 2026-05-05T18:00:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-menu-divider has no .styles.ts and borrows tokens from hx-menu

## Summary

`hx-menu-divider` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties of its own. The Figma renderer borrows
`--hx-menu-divider-color` from the parent `hx-menu` shell so the cascade
matches Helix runtime CSS (which scopes the divider color through the
parent's CSS variable).

## Reproduction

1. Search Helix repo for `hx-menu-divider.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — only `hx-menu` has
   component-tier tokens; `hx-menu-divider` has zero.
3. The visible color of a `<hx-menu-divider>` is controlled by
   `var(--hx-menu-divider-color, var(--hx-color-border-default, ...))`
   on the parent `<hx-menu>`.

## Expected

Either:
- Document explicitly that `hx-menu-divider` inherits from `hx-menu`, OR
- Expose `--hx-menu-divider-color` aliases under `hx-menu-divider` itself
  so per-divider theming is possible without going through the parent.

## Actual

Renderers targeting `hx-menu-divider` independently must reach across via
`componentTokenName('hx-menu', 'divider-color')` with semantic + primitive
fallbacks. This is what the Figma plugin's `hx-menu-divider.ts` now does.

## Source

Helix: missing file `hx-menu-divider.styles.ts`
figma-tokens: `plugin/renderers/hx-menu-divider.ts` (this commit)

## Root cause hypothesis

Authoring convention treats menu-divider as a slot fragment of its parent
shell (same pattern as hx-accordion-item).

## Suggested upstream fix

Add a thin `hx-menu-divider.styles.ts` that re-exports the parent's
`--hx-menu-divider-color` under the divider's own namespace, OR add a
short README note in `hx-menu-divider/` directing consumers to
`hx-menu`'s tokens.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-menu-divider.ts` resolves through
`componentTokenName('hx-menu', 'divider-color')` with semantic
(`color/border/default`) + primitive (`color/neutral/200`) fallbacks.

## Cross-references

- Related issues: HX-XXX (hx-accordion-item — same pattern)
- Related rea bugs: (none)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: 59b3beb fix(hx-menu-divider): Rule 1 + Rule 7

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 2 renderer sweep. Workaround in
  place; not blocking.
