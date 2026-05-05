---
id: HX-XXX
title: Shadow primitives missing — Figma effect-style emit deferred
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T20:23:52Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-XXX — Shadow primitives missing — Figma effect-style emit deferred

## Summary

Helix 3.3.1 ships zero shadow primitives. The Figma plugin's S1.3
emit pass writes paint styles (Color / Surface / *, Color / Text / *,
etc.) and text styles (Text / Heading / *, Text / Body / *, etc.)
bound to Helix Semantics + Primitives, but cannot emit Figma Effect
Styles because there are no `shadow/*` token paths to walk.

This means designers can pick a "Color / Action / Primary BG" or
"Text / Heading / Lg" from the right rail, but not a corresponding
"Effect / Elevation / Md" — they have to hand-author shadows in
Figma and the design-system loses the round-trip.

## Reproduction

1. `cd /Volumes/Development/booked/figma-tokens && grep -i shadow
   plugin/embedded-tokens.json` — no matches.
2. Inspect Helix tokens source at
   `/Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`
   — no `shadow` namespace at primitive or semantic tier.
3. Open the rebuilt plugin in Figma Desktop, run "Build Helix Web
   Component Library", inspect the Effect Styles panel — empty.

## Expected

A `shadow` primitive ramp covering at least the canonical four
elevations:

- `shadow/elevation/sm`  — 0 1px 2px rgba(0,0,0,0.05)-ish (subtle)
- `shadow/elevation/md`  — 0 4px 6px rgba(0,0,0,0.10)-ish (cards)
- `shadow/elevation/lg`  — 0 10px 15px rgba(0,0,0,0.10)-ish (popover)
- `shadow/elevation/xl`  — 0 20px 25px rgba(0,0,0,0.15)-ish (modal)

Plus a focus-ring shadow primitive (`shadow/focus`) so the focus
treatment is themable too.

DTCG `$type: "shadow"` shape is the canonical export — the plugin
currently doesn't import shadow primitives, but adding the type
mapping in `scripts/embed-tokens.ts` is small once the source ships.

## Actual

Figma Effect Styles count: 0. Effect emit deferred in
`plugin/lib/styles.ts::emitFigmaStyles` — the function returns
`{ effect: 0 }` and logs an explicit deferral note. When shadow
primitives land, extend the function to walk a shadow ramp and call
`figma.createEffectStyle()` with bound x/y/spread/color values.

## Source

- Helix tokens: `/Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`
- figma-tokens: `plugin/lib/styles.ts` (deferral noted in header + at end of `emitFigmaStyles`)

## Root cause hypothesis

Helix's elevation system lives in component-tier CSS (e.g.
`hx-card.styles.ts` hard-codes a `box-shadow`) rather than a shared
shadow ramp. Component-tier CSS is hard to thread into a Figma
Variable / Style without primitives at the foundation tier.

## Suggested upstream fix

Add `shadow/elevation/{sm,md,lg,xl}` and `shadow/focus` as DTCG
`$type: "shadow"` primitives in `helix/packages/hx-tokens/src/tokens.json`.
Component-tier CSS (e.g. `hx-card.styles.ts`) then aliases the new
primitive via `var(--hx-shadow-elevation-md)`.

## Local workaround (if any)

None at the Figma side — designers hand-author shadows on demand.
Tracked as "deferred" in the S1.3 plan; revisit when shadow
primitives land in helix-tokens.

## Cross-references

- Related issues: (none yet)
- Related vault docs: S1.3 Figma Styles emit plan
- Related commits: figma-tokens@HEAD on the S1.3 emit branch

## Status notes

- 2026-05-05: filed during S1.3 implementation. Effect-style emit
  deferred in `lib/styles.ts`; paint + text styles ship in this
  batch. No blockers — paint + text are the high-impact wins
  Charles flagged.
