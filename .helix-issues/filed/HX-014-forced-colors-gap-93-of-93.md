---
id: HX-014
title: 0/93 components define `@media (forced-colors: active)` — WCAG 1.4.11 systemic gap
status: filed
category: accessibility
severity: high
reported: 2026-05-05T22:05:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: create-helix-app
related: [HX-018]
---

# HX-014 — Forced-colors media-query absent from every component

## Summary

`grep -lrn "forced-colors" packages/hx-library/src/components/*/*.styles.ts`
returns zero hits across all 93 component `.styles.ts` files in Helix
3.3.1. Windows High-Contrast / forced-colors mode replaces every author
color with the user's chosen system palette; without explicit
`@media (forced-colors: active)` rules, components lose their borders,
focus rings, selected-state indicators, and disabled-state contrast —
a WCAG 1.4.11 (Non-Text Contrast) violation across the entire library.

For a healthcare-leaning consumer base (BST clinical portals,
patient-record dashboards) this is a production-readiness blocker: HC
mode is the assistive layer most relied on by low-vision users in
clinical environments.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `grep -lrn "forced-colors" packages/hx-library/src/components/*/*.styles.ts | wc -l` → 0.
3. `find packages/hx-library/src/components -name "*.styles.ts" | wc -l` → 93.
4. Open any component story in Storybook with Windows HC mode enabled
   (or Chromium `--force-color-profile=srgb` + `prefers-contrast`
   emulation in DevTools): borders flatten to background, focus rings
   disappear, button surfaces become indistinguishable from their
   container.

## Expected

Every interactive component (button, checkbox, radio, select, switch,
toggle, link, menu-item, accordion-item, etc.) ships at least:

```css
@media (forced-colors: active) {
  :host {
    --hx-component-border-color: CanvasText;
    --hx-component-focus-ring-color: Highlight;
  }
  .surface {
    forced-color-adjust: none;       /* opt out for icon containers */
    border: 1px solid CanvasText;
  }
  :host(:focus-visible) {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
  :host([disabled]) {
    color: GrayText;
    border-color: GrayText;
  }
}
```

Non-interactive surface components (card, banner, alert, badge, tag,
divider, dialog chrome) need at minimum a `CanvasText` border so they
remain visually distinguishable from `Canvas`.

## Actual

Zero `@media (forced-colors: active)` rules in any styles file. The
plugin can't paint Figma kits in HC mode either — there's no token
binding to follow.

## Source

- Helix: `packages/hx-library/src/components/**/*.styles.ts` (93 files,
  zero matches).
- figma-tokens: no HC-aware bindings authored; the kit emits in the
  default theme only.

## Root cause hypothesis

HC support was deferred during initial library authoring — the design
system shipped with light + dark theme parity but never grew the third
"system-colors" axis. Adding it now is mechanical (a per-component
media block) but tedious; the systemic gap exists because no single
component shipping it would be useful without the rest.

## Suggested upstream fix

Two-pass approach:

1. **Library-wide HC primer** — add a
   `packages/hx-library/src/styles/forced-colors.css` containing the
   shared `system-color → semantic` mapping (CanvasText, Highlight,
   GrayText, Canvas, ButtonFace, etc.). Each component's styles file
   imports + extends.

2. **Per-component HC media block** — add a `@media (forced-colors:
   active)` rule to every component's `.styles.ts` (sized to the
   component's interactive surface area: focus ring, selected state,
   disabled state, border). 93 files × ~10 lines each → ~930 lines of
   focused CSS. Prioritize interactive families first
   (button/checkbox/radio/select/switch/toggle/menu-item).

## Local workaround (if any)

None at the figma-tokens or create-helix-app layer — HC mode is a
runtime behavior of CSS, not a token lookup. Designer/dev recourse is
to opt out individual components via `forced-color-adjust: none` and
rebuild contrast manually, which defeats the purpose.

## Cross-references

- Related issues: HX-018 (HC brand-token suppression scope — too broad
  on the suppression side, too narrow on the rule side)
- Related vault docs: WCAG AAA Healthcare Audit
- Related commits: (none yet — this is the kickoff issue)

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #4. Blocks
  WCAG AAA / production-healthcare readiness sign-off.
