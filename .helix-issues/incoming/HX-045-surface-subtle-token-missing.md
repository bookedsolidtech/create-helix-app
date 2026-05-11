---
id: HX-045
title: "`color/surface/subtle` semantic token missing — kit-card-on-page contrast forces `surface/raised` substitution"
status: closed-false-positive
category: token-gap
severity: medium
reported: 2026-05-06T20:33:49Z
helix_version: 3.3.1
upstream_or_workaround: both
discovered_in: figma-tokens
related: [HX-009]
---

## Helix-team triage 2026-05-07

**Status: FALSE-POSITIVE-FOR-HELIX (token collision + already-solved by `border.subtle`).**

**Three problems with the proposed `color.surface.subtle` token:**

1. **Token collision.** Proposed light-mode value is `var(--hx-color-neutral-50)`. `surface.raised` already resolves to `var(--hx-color-neutral-50)` in light mode. Two tokens, identical resolved value, opposite semantic intent. The contrast test compares values, so `subtle` and `raised` would be indistinguishable at the gate while semantically forked. That's a token-namespace defect, not a fix.

2. **Missing primitive.** Proposed dark-mode value is `var(--hx-color-neutral-850)`. **There is no `neutral-850` stop in helix's neutral ramp.** The ramp is `0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`. Dark `surface.raised = neutral-800` and dark `surface.default = neutral-900` — there's no primitive between them. Any "hair lighter than dark default" claim has no token to bind to today.

3. **`border.subtle` already encodes "card boundary on page".** `tokens.json` ships `border.subtle` (`neutral-100` light / `neutral-800` dark). Helix collapses "card divider on page" into the **border axis**, not a fill axis. The kit-card-on-page case you're solving for is the canonical use of `border.subtle` + `surface.default` — not a new fill token.

**Workaround you can land today:**

```diff
// kit renderer surfaceVar binding
- color/surface/raised   // overloaded with elevated surfaces (popover, dialog)
+ color/surface/default  // base surface
+ // ALSO bind a 1px border:
+ border: 1px solid var(--hx-color-border-subtle)
```

This is the existing helix idiom for "card sits quietly on the page." Pattern parallels:
- USWDS: `background-default` + `border-base-light`
- Polaris: `surface-default` + `border-divider`
- Material 3: `surface-container-low` + `outline-variant`

The "raised vs subtle" distinction you're trying to encode is actually "filled-card vs bordered-card" in helix's existing namespace.

**If a future genuine elevation-free divider surface is needed** (some chrome that legitimately can't bind a border), propose `surface.container-low` with explicit primitives — and that proposal would require a new `neutral-850` stop in the ramp first, full light/dark/HC pairings, AAA contrast math against text, and a written rationale for why `surface.default + border.subtle` doesn't work. Until then, no new surface token.

**Closure:** swap kit renderer to `surface.default + border.subtle`. No helix change needed.

---

# HX-045 — `color/surface/subtle` semantic token missing — kit-card-on-page contrast forces `surface/raised` substitution

## Summary

Helix 3.3.1 ships nine `color/surface/*` semantic tokens but no
`surface/subtle`. The figma-tokens plugin's family-page surface fix
needed a "card sits one quiet step above the page" surface — the
Material/Tailwind/USWDS-canonical `surface/subtle` semantic — and had
to substitute `surface/raised` instead. `raised` works mode-aware and
solves the user-visible bug, but its semantic meaning is "elevated
above the page" (drop-shadow, popover, overlay-y), not "subtle card
divider on the page." The two roles want different treatments in
high-contrast mode and in dense-content layouts where everything
shouldn't read as elevated.

## Reproduction

1. `cd /Volumes/Development/booked/figma-tokens && grep -i 'color/surface' plugin/embedded-tokens.json | sort -u`
2. Observe the full set of shipping surface semantics:
   - `color/surface/danger-strong`
   - `color/surface/default`
   - `color/surface/info-strong`
   - `color/surface/inverse`
   - `color/surface/on-dark-overlay-default`
   - `color/surface/on-dark-overlay-subtle`
   - `color/surface/overlay`
   - `color/surface/raised`
   - `color/surface/success-strong`
   - `color/surface/sunken`
   - `color/surface/warning-strong`
3. Note the asymmetry: `on-dark-overlay-subtle` exists for the
   inverse-overlay context but no plain `surface/subtle` for the
   primary surface family.

## Expected

A `color/surface/subtle` semantic token alongside `surface/default`
and `surface/raised`. Mode resolutions:

- **Light mode:** a hair darker than `surface/default` (e.g. neutral-50
  vs default's neutral-0) — visible card-on-page divider without
  requiring elevation.
- **Dark mode:** a hair lighter than `surface/default` (e.g. neutral-850
  vs default's neutral-900).
- **High-contrast mode:** matches `surface/default` OR uses the
  forced-colors `Canvas` system color so card boundaries fall back to
  `border` semantics rather than fill differentiation. Defer to the
  forced-colors push (HX-014) for the canonical HC behavior.

The pattern parallels Polaris (`Surface / Surface / Subdued`), Material
3 (`md.sys.color.surface-container-low`), USWDS (background-default
+ background-subtle), and Tailwind (gray-50 / gray-900). All ship a
"quieter card surface" distinct from "elevated surface".

## Actual

`color/surface/subtle` does not exist. Plugin code that needed a
distinct kit-card-on-page surface for the family-page contrast fix
fell back to `color/surface/raised` (the closest semantic neighbor —
"one step above default") to ship a working build.

This works in light/dark mode (raised has the right contrast direction)
but the semantic mismatch surfaces in three places:

1. **Designers reading the Figma Variables panel** see kit cards bound
   to `Color / Surface / Raised` and reasonably infer "these cards are
   elevated" — they're not, they're flat dividers.
2. **Layouts that legitimately need elevated cards** (popover, dialog,
   menu) now share a surface token with non-elevated kit dividers,
   collapsing the elevation hierarchy.
3. **High-contrast mode handling** is unclear: `raised`'s HC mode
   resolution was authored for elevated surfaces; using it for flat
   dividers may produce wrong borders/contrast in HC.

## Source

- helix-tokens: `/Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json` — `color.surface.*` namespace
- figma-tokens (current substitution): kit renderers passing
  `ctx.semanticByName['color/surface/raised']` as `surfaceVar` into
  `createKitFrame()` — see commits on `feature/s3.1-dtcg-default`
  post-`2a3d9bf` (family-page surface fix series)
- figma-tokens (where the user-visible bug surfaced): family page-bg
  bound to `Color/Surface/Default` with no card on top → `hx-avatar`
  swatches and `hx-file-upload` drop area invisible against same-color
  background

## Root cause hypothesis

The current `color/surface/*` ramp was authored for an elevation-only
mental model (`sunken < default < raised < overlay`) without a
sibling axis for "quieter / busier" surface differentiation. The
asymmetric existence of `on-dark-overlay-subtle` (which does exist)
suggests the team has named the concept once already in a sub-context
but not promoted it to the primary surface family.

## Suggested upstream fix

Add `color/surface/subtle` to `helix/packages/hx-tokens/src/tokens.json`
under `color.surface`:

```json
"subtle": {
  "$type": "color",
  "$value": {
    "default": { "$ref": "{color.neutral.50}" },
    "dark":    { "$ref": "{color.neutral.850}" },
    "hc":      { "$ref": "{color.neutral.0}" }
  }
}
```

(Exact ramp values to match the team's existing `surface/default` ↔
`surface/raised` step. Authoring choice: should the contrast step be
`default → subtle → raised` or is `subtle` a per-mode synonym for
`default` and the differentiation is purely chromatic? Designer call.)

After the token lands in helix-tokens:
1. `figma-tokens` re-runs `npm run embed:tokens` to pick up the new
   `color/surface/subtle` slashPath.
2. Kit renderers swap `surfaceVar` lookups from
   `'color/surface/raised'` back to `'color/surface/subtle'`.
3. `surface/raised` reverts to its intended elevation-only role.

## Local workaround (if any)

Plugin-side: kit cards bound to `color/surface/raised` as the closest
existing semantic. Documented in the family-page surface fix commit
series (figma-tokens@`feature/s3.1-dtcg-default`,
post-`2a3d9bf`). Stable; ships the user-visible fix. Revert is a
single-token rename across the kit renderer callsites once
`surface/subtle` lands upstream.

## Cross-references

- Related issues: HX-009 (shadow primitives — adjacent token-tier gap
  in the surface/elevation system); the forced-colors push tracked
  outside the helix-issues directory will need to define HC
  resolution for any new surface token before this lands.
- Related vault docs: `[[Session Restart Handoff — 2026-05-06 (USWDS Adoption Mid-Arc)]]` — context for the family-page fix that surfaced this gap
- Related commits: figma-tokens@`feature/s3.1-dtcg-default` family-page surface fix series (post-`2a3d9bf`)

## Status notes

- 2026-05-06: drafted during family-page surface fix in figma-tokens.
  Sub-agent stopped on the "do not introduce new tokens" guardrail
  when `color/surface/subtle` was confirmed absent. User confirmed
  fallback to `surface/raised` for ship-now; this issue captures the
  semantic-correctness debt for the upstream fix.
