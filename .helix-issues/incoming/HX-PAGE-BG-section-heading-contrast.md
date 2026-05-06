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
