---
id: HX-028
title: hx-card hard-codes box-shadow values — should reference shadow primitives
status: filed
category: token-gap
severity: medium
reported: 2026-05-05T23:15:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-009]
---

# HX-028 — Card elevation uses hard-coded box-shadow

## Summary

`hx-card.styles.ts` hard-codes its `box-shadow` value for the
`elevation=raised` and `elevation=floating` variants, rather than
referencing a `--hx-shadow-elevation-*` token from the primitives
tier. This means:

1. Brand-layer overrides can't change card shadows without monkey-
   patching `hx-card`'s styles directly.
2. Other components that should match card's elevation (popover,
   dropdown, dialog) can't share the same shadow source-of-truth.
3. The Figma renderer can't bind a Figma effect-style to the
   shadow because there's no token to thread.

This is the per-component instance of the broader gap tracked in
HX-009 (no shadow primitives at all in tokens.json).

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-card/hx-card.styles.ts`
   — search for `box-shadow`. Confirm the value is a literal
   `0 1px 3px rgba(...)` or similar, not a `var(--hx-shadow-*)`
   reference.
2. `grep -i shadow /Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`
   — confirm no shadow primitive exists.
3. The figma-tokens renderer documents this in
   `plugin/renderers/hx-card.ts:304,367` ("real shadows deferred").

## Expected

Once HX-009 lands shadow primitives, hx-card's styles should reference
them:

```css
:host { --hx-card-shadow: var(--hx-shadow-elevation-md, 0 4px 6px rgba(0,0,0,0.1)); }
:host([elevation="floating"]) { --hx-card-shadow: var(--hx-shadow-elevation-lg, 0 10px 15px rgba(0,0,0,0.15)); }
.card { box-shadow: var(--hx-card-shadow); }
```

## Actual

Box-shadow is a literal value. No token threading.

## Source

- Helix: `packages/hx-library/src/components/hx-card/hx-card.styles.ts`
  (the elevation rules)
- figma-tokens: `plugin/renderers/hx-card.ts:97-108` (renderer fakes
  elevation via surface-tone difference instead)

## Root cause hypothesis

Card was authored before the team had a shared shadow ramp. The
literal value was the pragmatic choice; tokenization was never
revisited.

## Suggested upstream fix

Sequenced after HX-009:

1. Land `--hx-shadow-elevation-{sm,md,lg,xl}` primitives in
   `tokens.json` (HX-009).
2. Refactor `hx-card.styles.ts` to consume them.
3. Apply the same refactor to any other component with a literal
   `box-shadow` value (likely: hx-popover, hx-popup, hx-dropdown,
   hx-menu, hx-dialog, hx-drawer, hx-toast, hx-tooltip).

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-card.ts` fakes elevation by
swapping the surface-tone (`color/surface/raised` for raised,
+border for floating). Visually approximates without a real shadow.
Documented as deferred work pending HX-009.

## Cross-references

- Related issues: HX-009 (no shadow primitives)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Sequenced after HX-009.
