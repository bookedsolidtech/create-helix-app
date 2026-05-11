---
id: HX-PAGE-BG-section-heading-contrast
title: page-bg section headings render dark-on-dark in light-mode-default files
status: draft
category: token-gap
severity: medium
reported: 2026-05-06T13:30:00Z
helix_version: 3.3.1
upstream_or_workaround: both
discovered_in: figma-tokens
related: []
---

## Helix-team triage 2026-05-07

**Status: FALSE-POSITIVE-FOR-HELIX (existing token solves this, new tokens shouldn't ship as proposed).**

**Three problems with the proposal to publish `color.text.inverse-strong` + `color.surface.inverse-strong`:**

1. **`text.inverse` already does what you need.** Light-mode `text.inverse = neutral-0` (≈ `#FFFFFF`). On your `#121212` chrome surface that's ~16:1 contrast — well over WCAG AAA (7:1). The bug skipped evaluating the obvious existing token and jumped straight to a new-ramp-slot proposal. Try `text.inverse` first; report back if it doesn't resolve correctly.

2. **`*-strong` naming collision with existing contract.** Helix's `surface.{success,danger,warning,info}-strong` are **brand-pinned non-flippers** (success-700 in both modes, etc.). Your proposed `surface.inverse-strong` would be **fundamentally different mode handling** — "static, never flips, always dark in BOTH light and dark" — which contradicts what `*-strong` means in the rest of the namespace. A consumer reading `surface.inverse` (flips light↔dark) and `surface.inverse-strong` (doesn't flip, opposite mode-handling) would reasonably assume the latter is a stronger version of the former. That's a naming-collision footgun.

3. **The `#121212` page background is a literal you chose, not a helix token.** Helix is not obligated to publish semantic tokens to support arbitrary downstream literals. If your chrome surface is meant to be intentionally fixed-dark (no mode flip), that's a Figma-file-internal authoring choice — author file-local paint styles for it. Don't pollute the public semantic API with non-flipping inverse tokens to bail out an authored hex.

**Workaround you can land today:**

For light-mode chrome on `#121212`:
```diff
// section-heading paintStyleName
- 'Color / Text / Strong'   // resolves to neutral-800 (≈ #1F2937) in light = 1.5:1 FAIL
+ 'Color / Text / Inverse'  // resolves to neutral-0 (≈ #FFFFFF) in light = 16:1 AAA PASS
```

If the chrome surface MUST stay dark in dark mode too (so `text.inverse`'s flipped value would now read white-on-light), author the page-bg + heading fill as **Figma file-local paint styles in figma-tokens** that explicitly do not flip. That's a chrome/branding concern, not a semantic-tier concern.

**If a true static-dark chrome surface is justified later** (e.g. for a vendor-mandated brand requirement), propose under a different namespace that doesn't collide with the `*-strong` brand-pinning contract — e.g. `chrome.surface.dark` or `surface.fixed-dark`. That proposal would also require a concrete HC-mode value (not "defer to forced-colors"), full AAA contrast math against the paired text token, and a written rationale.

**Closure:** swap to `text.inverse` first. If that doesn't work for your specific use case, reopen with the empirical contrast ratio and the specific scenario it fails in.

---

# HX-PAGE-BG — page-bg section headings render dark-on-dark in light-mode-default files

## Summary

The Cover and Foundations pages in figma-tokens use a literal dark
SolidPaint as the page background (COVER_PAGE_BG / FOUNDATIONS_PAGE_BG —
both rgb(0.07, 0.07, 0.07) ≈ #121212). Section headings emitted via the
canonical `emitText({role: 'section-heading', ...})` path bind their fill
to `Color/Text/Strong`, which the published Helix Semantics ramp resolves
to `color/neutral/800` (very dark gray) in light mode. In a light-mode-
default Figma file, the heading renders dark-on-dark and is illegible.

The semantic token is correct — `Color/Text/Strong` flips properly with
mode. The mismatch is that the page background does NOT flip; it's a
literal SolidPaint, so the heading's mode-flipping fill desyncs from the
fixed-dark page surface.

## Reproduction

1. Open a Figma file with Helix Semantics in default `Light` mode.
2. Run figma-tokens `Build Helix Web Component Library` → `Refresh
   Reference Pages`.
3. Navigate to the `Cover` or `Foundations` page.
4. Section headings ("At a glance", "How to use this file", "Table of
   Contents", "Modes Preview — Light / Dark / High-Contrast", "Type
   Ramp", "Color Palette", …) appear faint or invisible.

## Expected

Section headings should render with high contrast against the page
background regardless of file mode.

## Actual

Section headings render at `color/neutral/800` (≈ #1f2937) on a
literal `#121212` page background — contrast ratio ≈ 1.5:1, well below
WCAG AA (4.5:1) for body text and AAA (7:1) for headings.

## Source

- `plugin/lib/page-chrome.ts:73` — `'section-heading': { paintStyleName: 'Color / Text / Strong' }`
- `plugin/lib/cover.ts:44-52` — literal `COVER_PAGE_BG` + `COVER_LABEL_FILL`
- `plugin/lib/foundations.ts:40-48` — literal `FOUNDATIONS_PAGE_BG` + `FOUNDATIONS_LABEL_FILL`

## Root cause hypothesis

The Helix Semantics ramp does not publish a `Color/Text/Inverse Strong`
(or equivalent) paint style that ALWAYS renders bright regardless of
mode. The page-chrome surface-context override matrix
(`resolvePaintStyleForContext` in page-chrome.ts) is currently identity —
`page-bg` resolves to the same paint as `card-default`. Until a bright-
on-dark text style exists, every page-bg text emission has to choose
between (a) tracking mode and reading dark-on-dark in light files,
(b) hardcoding a literal light fill and losing mode awareness.

## Suggested upstream fix

Publish either:
- `Color / Text / Inverse Strong` — always-light text fill, paired with
  a hypothetical `Color / Surface / Inverse Strong` always-dark surface
  fill — for designer-readable chrome surfaces that intentionally do not
  flip with mode (e.g. file-level Cover / Foundations branding).
- OR: change the `Color / Text / Strong` semantic to reference a
  primitive that's bright on a dark surface (e.g. `color/neutral/50`
  always) — but this conflicts with the existing card-default / card-
  sunken use of the same token.

The first option is cleaner — it adds a new ramp slot rather than
mutating an existing one.

## Local workaround (if any)

In figma-tokens 0.6.0 (commit referenced below):

- `plugin/lib/cover.ts:emitSectionHeadingOrChrome` — when
  `surfaceContext === 'page-bg'`, bypasses the chrome instance, calls
  canonical `emitText`, then post-overrides `node.fills` with a literal
  light SolidPaint (`COVER_LABEL_FILL` = rgb(0.93, 0.94, 0.96)).
- `plugin/lib/foundations.ts:emitFoundationsSectionHeadingOrChrome` —
  same pattern, overrides with `FOUNDATIONS_LABEL_FILL`.

Both sites carry an `// emitText-exempt:` comment explaining the gap.
The override loses mode-awareness — the heading stays white in dark
mode too — which is the intentional trade-off until the inverse ramp
lands.

## Cross-references

- Related issues: HX-014-forced-colors-gap-93-of-93 (related a11y gap)
- Related rea bugs: none
- Related vault docs: Reference-Shape Replication Strategy.md §1.4 + §7
  ("inverse ramp out of scope")
- Related commits: feature/s3.1-dtcg-default — Session B reload-test
  fix sequence

## Status notes

- **2026-05-06** — Drafted from figma-tokens Session B reload-test
  finding. Workaround landed in cover.ts + foundations.ts. Awaiting
  Helix-team decision on inverse-ramp publication.
