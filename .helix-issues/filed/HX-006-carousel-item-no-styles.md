---
id: HX-XXX
title: hx-carousel-item has no .styles.ts and borrows from carousel chrome
status: draft
category: token-gap
severity: low
reported: 2026-05-05T18:00:03Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-carousel-item has no .styles.ts and borrows from carousel chrome

## Summary

`hx-carousel-item` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties. As a slide fragment of `<hx-carousel>`
it relies on the parent's tokens for chrome. The Figma renderer falls
back to a semantic-only cascade since `<hx-carousel>` itself has only
chrome tokens (button colors), no slide-surface tokens.

## Reproduction

1. Search Helix repo for `hx-carousel-item.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-carousel-item`
   has zero component-tier tokens.

## Expected

Either:
- Document explicitly that `hx-carousel-item` is a tokenless slot, OR
- Expose `--hx-carousel-item-bg` / `--hx-carousel-item-border-color`
  so designers can theme slide chrome.

## Actual

The Figma renderer uses semantic-only intent:
- slide bg → `color/surface/raised`
- slide border → `color/border/default`
- media bg → `color/surface/sunken`
- caption text → `color/text/primary`
- subcaption / glyph → `color/text/muted`

## Source

Helix: missing file `hx-carousel-item.styles.ts`
figma-tokens: `plugin/renderers/hx-carousel-item.ts` (this commit)

## Root cause hypothesis

Authoring convention treats carousel-item as a slot fragment. Same
pattern as hx-accordion-item, hx-menu-divider.

## Suggested upstream fix

Add `--hx-carousel-item-*` aliases or document inheritance.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-carousel-item.ts` uses semantic-only
fallbacks. No component-tier intent registered.

## Cross-references

- Related issues: hx-accordion-item, hx-menu-divider (same slot-fragment pattern)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 2 renderer sweep. Workaround in
  place; not blocking.
