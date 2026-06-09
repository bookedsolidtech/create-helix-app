---
id: HX-027
title: hx-tabs active-stripe overlaps the listbar baseline — not expressible in auto-layout
status: filed
category: component-gap
severity: low
reported: 2026-05-05T23:10:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-027 — Tabs active-stripe + listbar baseline overlap unrenderable

## Summary

`hx-tabs` renders an active-state stripe (a 2-3px line at the bottom
edge of the active tab) that overlaps the listbar's baseline border.
In CSS the stripe is a `::before` or absolutely-positioned element
sitting at `bottom: -2px` of the active tab; the listbar baseline is
a 1px `border-bottom` on the listbar container. They overlap by 1px.

Figma auto-layout can't position the stripe over the baseline — they
have to be siblings in the layout flow. The figma-tokens renderer
emits the stripe as a separate row underneath the listbar, which
visually approximates the active state but loses the
overlap-on-baseline effect.

## Reproduction

1. `cat /Volumes/Development/booked/figma-tokens/plugin/renderers/hx-tabs.ts`
   — limitation on lines 15, 109 ("auto-layout cannot express
   stripe-on-edge overlap with the baseline track").
2. Render hx-tabs in Storybook — confirm the stripe sits over the
   listbar baseline.
3. Build the figma kit — confirm the stripe is below, not over.

## Expected

Either:

- The stripe is implemented as a positive `border-bottom` on the
  active tab (no overlap, just thicker baseline). Visually similar,
  expressible in auto-layout as a per-state border-width.
- Or the listbar baseline is removed when the stripe is present —
  the active tab's stripe IS the baseline.

The visual contract becomes "active tab gets a thick coloured
border-bottom; inactive tabs get the default thin baseline."

## Actual

Stripe sits over baseline via absolute positioning. Figma kit emits
a separated stripe.

## Source

- Helix: `packages/hx-library/src/components/hx-tabs/hx-tabs.styles.ts`
- figma-tokens: `plugin/renderers/hx-tabs.ts:15,109`

## Root cause hypothesis

The visual designer wanted the stripe to "merge with" the baseline.
The CSS implementation went with overlapping absolute positioning —
which is correct at runtime but loses fidelity in design tooling.

## Suggested upstream fix

Refactor to per-state border-width:

```css
.tab { border-bottom: 1px solid var(--hx-color-border-default); }
.tab[active] {
  border-bottom-width: 3px;
  border-bottom-color: var(--hx-color-primary-500);
}
```

…and drop the `::before` stripe element. Same visual, expressible in
any layout system.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-tabs.ts` emits stripe + listbar as
separated siblings. Visually close enough; documented as a known gap.

## Cross-references

- Related issues: (none direct)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place.
