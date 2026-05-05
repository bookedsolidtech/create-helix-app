---
id: HX-032
title: hx-avatar slot=image is undocumented — Figma renderer ships initials-only
status: filed
category: documentation
severity: low
reported: 2026-05-05T23:35:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-032 — Avatar `slot="image"` semantics undocumented

## Summary

`hx-avatar` accepts a `slot="image"` for rendering an actual image
(rather than initials). The slot's expected content shape (img? svg?
picture?), aspect-ratio behavior, and fallback when the image fails
to load are not documented in the component's CEM or its README.

The Figma renderer emits initials-only variants because it doesn't
have a contract for how to draw the image slot in a kit.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-avatar/hx-avatar.ts`
   — search for `slot=image` handling.
2. Inspect the component's CEM — confirm the `image` slot is declared
   but its expected content shape is unstated.
3. The figma-tokens renderer
   (`plugin/renderers/hx-avatar.ts:178`) explicitly notes
   "slot=image deferred to a future phase."

## Expected

CEM slot definition for `image` includes:

- Expected element type (`<img>` recommended; `<svg>` accepted).
- Aspect-ratio behavior (square cropped via `object-fit: cover`).
- Failure behavior (fallback to initials when `<img onerror>` fires).
- Render contract for design tooling (a labeled image-tile placeholder
  with a corner indicator showing the avatar shape: circle/square).

## Actual

Slot is declared but its semantics live only in the implementation.
Renderers can't faithfully kit it without reading the source.

## Source

- Helix: `packages/hx-library/src/components/hx-avatar/hx-avatar.ts:261-291`
- figma-tokens: `plugin/renderers/hx-avatar.ts:178`

## Root cause hypothesis

The slot was added without a CEM-level contract; CEM slot
descriptions are still optional/free-form across the library.

## Suggested upstream fix

Add an explicit JSDoc `@slot image` block to `hx-avatar.ts` covering
the four points in "Expected" above. Re-run CEM extraction. Update
`hx-avatar/README.md` with a sample.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-avatar.ts` ships initials-only kit
variants. When the slot semantics are documented, extend the renderer
to emit a labeled image-tile placeholder per shape variant.

## Cross-references

- Related issues: HX-013 (manifest format covers a similar
  "documented contract" theme)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
