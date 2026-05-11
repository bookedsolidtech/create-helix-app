---
id: HX-036
title: hx-skeleton hard-codes shimmer animation — no animation primitives in tokens
status: filed
category: token-gap
severity: low
reported: 2026-05-05T23:55:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-036 — Skeleton shimmer animation has no token surface

## Summary

`hx-skeleton`'s shimmer animation (the moving gradient that signals
loading state) is implemented with hard-coded `@keyframes` in
`hx-skeleton.styles.ts`. Animation duration, easing, and gradient
direction are not exposed as tokens.

This means:

1. Brand consumers can't slow or disable the shimmer for accessibility
   reasons (`prefers-reduced-motion` is respected by the component
   but consumer can't customize the threshold).
2. Other components that should share the same loading-state
   animation (skeleton variants of card, list-item, table-row) can't
   reference a shared `--hx-animation-shimmer-*` token.

Helix has no `animation` primitive namespace in tokens.json today —
this is the broader gap.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-skeleton/hx-skeleton.styles.ts`
   — confirm `@keyframes shimmer` and `animation: shimmer 1.5s ...`
   are literal.
2. `grep -i animation /Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`
   — confirm no `animation/*` namespace exists.

## Expected

Add an `animation` primitive namespace with at least:

- `animation/duration/fast` (150ms)
- `animation/duration/base` (250ms)
- `animation/duration/slow` (400ms)
- `animation/duration/shimmer` (1500ms)
- `animation/easing/in-out` (cubic-bezier(0.4, 0, 0.2, 1))
- `animation/easing/out` (cubic-bezier(0, 0, 0.2, 1))
- `animation/easing/in` (cubic-bezier(0.4, 0, 1, 1))

Each component's animation rule references the appropriate primitive.

## Actual

Skeleton animation is literal. No shared animation primitives.

## Source

- Helix: `packages/hx-library/src/components/hx-skeleton/hx-skeleton.styles.ts`
- Helix: `packages/hx-tokens/src/tokens.json` (no animation namespace)

## Root cause hypothesis

Animation tokens are unusual in DTCG; the spec doesn't have a
canonical `$type: "animation"`. The library hasn't bothered with a
custom shape.

## Suggested upstream fix

Define a Helix-specific animation primitive shape (custom `$type:
"hx.animation"` extension) and emit the namespace. Refactor
hx-skeleton + any other animated components to consume.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-skeleton.ts` emits a static gradient
(no animation — Figma can't animate variants directly). Visual
approximates the rest state.

## Cross-references

- Related issues: HX-009 (shadow primitives — same shape of "no
  primitive namespace exists")

## Status notes

- 2026-05-05: filed during D2-bis backfill.
