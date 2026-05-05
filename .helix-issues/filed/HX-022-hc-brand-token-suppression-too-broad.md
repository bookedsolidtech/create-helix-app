---
id: HX-022
title: HC brand-token suppression scope strips non-color tokens (typography, radius, layout)
status: filed
category: token-gap
severity: high
reported: 2026-05-05T22:45:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: [HX-014]
---

# HX-022 — HC brand-token suppression overly broad

## Summary

Helix's high-contrast (HC) mode currently suppresses *all* brand
tokens — typography (font-family, font-size weights), border-radius,
spacing/layout — when WCAG only requires color-contrast suppression.
Low-vision users in HC mode lose typographic structure (heading
hierarchy flattens to system-default) and rounded geometry (UI looks
nothing like the rest of the design system, breaks recognition).

The right scope is: suppress only the brand `color/*` tokens; preserve
typography, radius, spacing, and layout. WCAG 1.4.11 only constrains
non-text contrast, not visual style identity.

## Reproduction

1. Locate the HC suppression mechanism in helix (likely a
   `prefers-contrast: more` or `forced-colors: active` block in the
   tokens file or a brand-overlay file).
2. Inspect what tokens are overridden — confirm typography tokens are
   reset to system defaults.
3. Render any component with HC mode active — confirm headings lose
   their custom font-family + size scale, corners lose their radius.

## Expected

```css
@media (forced-colors: active) {
  :host {
    /* Override ONLY color tokens. */
    --hx-color-primary-500: Highlight;
    --hx-color-text-primary: CanvasText;
    --hx-color-border-default: CanvasText;
    --hx-color-surface-default: Canvas;
    /* DO NOT override: */
    /* --hx-font-family-*  (typography unchanged) */
    /* --hx-radius-*       (geometry unchanged) */
    /* --hx-space-*        (layout unchanged) */
    /* --hx-text-size-*    (font scale unchanged) */
  }
}
```

The contract: HC mode replaces hue + value, not type or shape.

## Actual

Per vault note `00-Planning/helix/HC brand-token suppression scope...md`:
the current HC overlay sweeps brand tokens broadly and resets non-color
tokens (font-family chains drop to system; radius collapses to 0). Low-
vision users get a visually unfamiliar product that's harder, not
easier, to navigate.

## Source

- Helix: HC overlay (likely
  `packages/hx-tokens/src/brand-registry.ts` or
  `packages/hx-library/src/styles/forced-colors.css` if it exists —
  search for `forced-colors` / `prefers-contrast`)
- Vault: `00-Planning/helix/HC brand-token suppression scope and intent.md`

## Root cause hypothesis

Initial HC implementation took a "reset everything to system defaults"
shortcut to ensure WCAG passed. The audit clarified that the
suppression should be color-only.

## Suggested upstream fix

Audit every CSS rule inside HC media queries. Strip any non-color
override. Keep:

- Color tokens: replace with system colors (CanvasText, Highlight,
  Canvas, ButtonFace, GrayText, etc.).
- `forced-color-adjust: none` on icon containers + chart surfaces
  where the default forced-color behavior would destroy meaning.

Remove:

- Any reset of font-family / font-size / line-height / letter-spacing.
- Any reset of border-radius / corner geometry.
- Any reset of padding / margin / gap.

## Local workaround (if any)

None at our layer — HC mode is a runtime CSS behavior. figma-tokens
doesn't emit HC-aware variants in the kit.

## Cross-references

- Related issues: HX-014 (forced-colors absent from all components —
  the broader gap)
- Related vault docs: 00-Planning/helix/HC brand-token suppression scope and intent.md

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #9.
