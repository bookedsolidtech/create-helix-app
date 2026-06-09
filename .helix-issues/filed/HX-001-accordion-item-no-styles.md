---
id: HX-XXX
title: hx-accordion-item has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T16:07:02Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-accordion-item has no .styles.ts and no own component-tier tokens

## Summary

`hx-accordion-item` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties of its own. The Figma renderer must
borrow tokens from the parent `hx-accordion` shell to keep its cascade
faithful to Helix's runtime.

## Reproduction

1. Search Helix repo for `hx-accordion-item.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — only `hx-accordion`
   has component-tier tokens; `hx-accordion-item` has zero.
3. Try to bind `hx-accordion-item`'s trigger row, body, and chevron to
   component-tier vars and they all resolve from `hx-accordion/--hx-accordion-*`.

## Expected

Either:
- Document explicitly that `hx-accordion-item` inherits all component-tier
  tokens from `hx-accordion`, OR
- Expose `--hx-accordion-item-*` aliases that fall through to `--hx-accordion-*`
  so per-item theming overrides are possible without monkey-patching the
  parent.

## Actual

Renderers that target `hx-accordion-item` independently must guess the
parent-tag relationship and reach across via `componentTokenName('hx-accordion', ...)`.
This is the workaround the Figma plugin's `hx-accordion-item.ts` now uses.

## Source

Helix: missing file `hx-accordion-item.styles.ts`
figma-tokens: `plugin/renderers/hx-accordion-item.ts` (this commit)

## Root cause hypothesis

Helix authoring convention treats an accordion-item as a slot fragment of
its parent shell rather than an independently themeable element.

## Suggested upstream fix

Add a thin `hx-accordion-item.styles.ts` that re-exports the parent's
relevant CSS vars under `--hx-accordion-item-*` namespace, OR add a
short README note in `hx-accordion-item/` directing consumers to the
parent's tokens.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-accordion-item.ts` resolves all
component-tier intents through `componentTokenName('hx-accordion', ...)`
with semantic + primitive fallbacks. See the inline cascade comment.

## Cross-references

- Related issues: (none yet)
- Related rea bugs: (none)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: e944b34 fix(hx-accordion-item): Rule 1 + Rule 7

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 1 renderer sweep. Workaround in
  place; not blocking.
