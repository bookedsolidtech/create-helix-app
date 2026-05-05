---
id: HX-030
title: hx-image decorative-tile composition uses overlapping children — Figma can't express
status: filed
category: component-gap
severity: low
reported: 2026-05-05T23:25:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-030 — hx-image decorative composition overlaps tile edges

## Summary

`hx-image` supports a "decorative composition" mode (per the
renderer's documentation) where overlay elements (badges, captions,
focal markers) sit on top of the image, sometimes extending past the
tile edges. This is implemented via absolutely-positioned children;
Figma auto-layout can't express overlap nor edge-extending positions.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-image.ts`
   — limitation on lines 18, 109 ("auto-layout cannot express
   overlapping").

## Expected

Restructure decorative composition to non-overlapping nested layout
where overlays sit inside the image tile (not extending past edges)
OR document explicitly that decorative composition is a runtime-only
feature not represented in the design system kit.

## Actual

Renderer falls back to image-only variants; decorative overlays are
not emitted.

## Source

- Helix: `packages/hx-library/src/components/hx-image/hx-image.styles.ts`
- figma-tokens: `plugin/renderers/hx-image.ts:18,109`

## Root cause hypothesis

Decorative composition was a runtime-only feature; design-tooling
consumers weren't considered when the absolute-positioning approach
was chosen.

## Suggested upstream fix

Either:
- Document the gap in `hx-image/README.md` so design tooling can
  skip decorative variants explicitly.
- Refactor decorative overlays to nested children that don't extend
  past tile edges.

## Local workaround (if any)

Renderer emits image-only variants.

## Cross-references

- Related issues: (none direct)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place.
