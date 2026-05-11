---
id: HX-XXX
title: hx-toast-stack has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T21:00:02Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-toast-stack has no .styles.ts and no own component-tier tokens

## Summary

`hx-toast-stack` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties of its own. As a structural layout
primitive (CSS fixed positioning + corner anchors), it has no themable
surface — it just hosts `hx-toast` instances at a configured edge/corner.
The Figma renderer therefore has no component-tier tokens to bind against
and falls back to a semantic-only cascade.

## Reproduction

1. Search Helix repo for `hx-toast-stack.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-toast-stack`
   has zero component-tier tokens.
3. The renderer's schematic uses the viewport tinted with semantic
   `color/surface/sunken` (purely for visual demonstration) plus inner
   placeholder toasts using `color/surface/default` + `color/border/default`.
   No component-tier intent registers.

## Expected

Either:
- Confirm and document explicitly that `hx-toast-stack` is a layout-only
  primitive with no themable surface (no token gap to fill), OR
- Expose `--hx-toast-stack-gap` (vertical spacing between stacked toasts)
  and `--hx-toast-stack-inset` (distance from viewport edge) aliases for
  programmatic theming so design-system overrides don't need to reach
  into the parent's CSS.

## Actual

The Figma renderer's schematic uses semantic surface/sunken on the viewport
and surface/default + border/default on placeholder toasts. No component-tier
intent is registered, so the cascade resolver lands on semantic tier only.

## Source

Helix: missing file `hx-toast-stack.styles.ts`
figma-tokens: `plugin/renderers/hx-toast-stack.ts` (this commit)

## Root cause hypothesis

`hx-toast-stack` is a pure positional container — its visible surface IS
the toasts it hosts. No tokens are missing per se; the container just
doesn't surface any of its own.

## Suggested upstream fix

Either add a documented note declaring `hx-toast-stack` as visually
tokenless (placement is the only configuration), or expose `--hx-toast-stack-gap`
and `--hx-toast-stack-inset` so designers can tune stacking spacing
without re-implementing CSS in app code.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-toast-stack.ts` registers no component-tier
intent and uses semantic-only fallbacks (`color/surface/sunken` for viewport
demo tint; `color/surface/default` + `color/border/default` for placeholder
toasts). The schematic IS the demo; structural component, no real surface.

## Cross-references

- Related issues: hx-th, hx-td (same pattern in this commit; also hx-stack,
  hx-button-group, hx-carousel-item, hx-dropdown, hx-menu-divider from
  earlier sweeps)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 cleanup sweep (final batch). Workaround
  in place; structural component — possibly intentional.
