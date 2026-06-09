---
id: HX-042
title: hx-tbody, hx-thead, hx-tfoot, hx-tr — no `.styles.ts` files; cascade undocumented
status: filed
category: token-gap
severity: medium
reported: 2026-05-06T00:25:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: [HX-010, HX-011]
---

# HX-042 — Table sub-element family lacks `.styles.ts`

## Summary

The `hx-table` component decomposes into seven custom elements:
`hx-table`, `hx-thead`, `hx-tbody`, `hx-tfoot`, `hx-tr`, `hx-th`,
`hx-td`. Only `hx-table` has a `.styles.ts` file; the other six are
listed as `.ts` files in `packages/hx-library/src/components/hx-table/`
without their own styles modules.

The expectation appears to be that all sub-elements inherit cascade
from `hx-table.styles.ts` (which uses descendant selectors:
`hx-thead`, `hx-tbody hx-td`, etc.). This is correct for runtime CSS
but design-tooling can't introspect the cascade — each sub-element
has no token surface visible to a Figma renderer.

HX-010 and HX-011 already covered `hx-th` and `hx-td` specifically;
this issue extends the same observation to the rest of the family.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `ls packages/hx-library/src/components/hx-table/` — confirm only
   `hx-table.styles.ts` exists; tbody/thead/tfoot/tr have `.ts`
   only.
3. `grep -E "hx-tbody|hx-thead|hx-tfoot|hx-tr" packages/hx-library/src/components/hx-table/hx-table.styles.ts`
   — confirm cascade rules target sub-elements via descendant
   selectors.

## Expected

Either:

- Add a thin `<sub-element>.styles.ts` file per sub-element that
  re-exports the relevant cascade rules from the parent
  `hx-table.styles.ts`. Each sub-element shadow-root then has its
  own discoverable styles module.
- Document the cascade pattern in `hx-table/README.md` —
  "Sub-elements inherit cascade from `hx-table.styles.ts`. There
  are no `--hx-tbody-*` / `--hx-thead-*` / `--hx-tfoot-*` /
  `--hx-tr-*` tokens; theming happens via the parent's component
  tier."

## Actual

Implicit cascade. Renderers fall back to semantic-only intent for the
sub-elements (see `plugin/renderers/hx-tbody.ts`, `hx-thead.ts`,
`hx-tfoot.ts`, `hx-tr.ts`).

## Source

- Helix: `packages/hx-library/src/components/hx-table/` (file listing
  shows the gap)
- figma-tokens: `plugin/renderers/hx-{tbody,thead,tfoot,tr}.ts`

## Root cause hypothesis

Same as HX-007 (hx-dropdown): table sub-elements are wrapper /
fragment elements; tokenizing each one was deferred in favor of
parent-driven cascade.

## Suggested upstream fix

Recommend the documentation route — adding stub `.styles.ts` files
for each sub-element pollutes the file tree without adding theming
seams. A `hx-table/README.md` section explaining the cascade is
sufficient.

If theming seams ARE wanted (per-row striping by brand, etc.), expose
`--hx-table-row-bg-odd`, `--hx-table-row-bg-even`,
`--hx-table-header-bg`, etc. on `hx-table` itself (not on
sub-elements).

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-{tbody,thead,tfoot,tr}.ts` use
semantic-only intent. Renderers honor parent `hx-table` cascade
where possible.

## Cross-references

- Related issues: HX-010 (hx-th specifically), HX-011 (hx-td
  specifically), HX-007 (hx-dropdown — same composition pattern)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Documentation route
  preferred; one helix PR can close all four issues.
