---
id: HX-XXX
title: hx-button-group has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T18:00:02Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-button-group has no .styles.ts and no own component-tier tokens

## Summary

`hx-button-group` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties. It is a layout shell that hosts
`<hx-button>` instances and inherits their tokens. The Figma renderer
borrows from `hx-button`'s primary VARIANT_SPEC (bg / color) so the
schematic matches the runtime button family.

## Reproduction

1. Search Helix repo for `hx-button-group.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-button-group`
   has zero component-tier tokens.
3. The visible color of any segment is whatever `hx-button` resolves to.

## Expected

Either:
- Document explicitly that `hx-button-group` is a tokenless layout shell
  whose buttons own the color cascade, OR
- Expose `--hx-button-group-divider-color` (etc.) so designers can theme
  the inter-segment dividers without touching every button instance.

## Actual

The Figma renderer mirrors hx-button's primary primitives directly:
- segment bg → `hx-button/--hx-button-bg` → `color/primary/500`
- middle segment bg → `color/primary/600` (acts as inner divider)
- label → `hx-button/--hx-button-color` → `color/neutral/0`

## Source

Helix: missing file `hx-button-group.styles.ts`
figma-tokens: `plugin/renderers/hx-button-group.ts` (this commit)

## Root cause hypothesis

Authoring convention: button-group is a slot-only shell that defers all
visual styling to its buttons. Probably intentional.

## Suggested upstream fix

If kept tokenless, document the inheritance pattern in
`hx-button-group/README.md`. If themable separators are desired, add
`--hx-button-group-divider-color` and `--hx-button-group-radius`.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-button-group.ts` borrows `hx-button`
component-tier intents with primary/500 + primary/600 + neutral/0
fallbacks. Outer corners rounded; segments fused via itemSpacing=0 +
clipsContent.

## Cross-references

- Related issues: (none yet — pattern shared with hx-stack, hx-carousel-item,
  hx-dropdown, hx-menu-divider)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 2 renderer sweep. Workaround in
  place; layout shell — possibly intentional.
