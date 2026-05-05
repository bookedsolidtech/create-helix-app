---
id: HX-XXX
title: hx-spinner cascade skips the semantic tier — track/arc go straight to primitives
status: draft
category: token-gap
severity: low
reported: 2026-05-05T16:07:02Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-spinner cascade skips the semantic tier

## Summary

`hx-spinner.styles.ts` defines the per-variant track/arc colors with a
cascade of `var(--hx-spinner-track-color, var(--hx-color-neutral-200))` —
the fallback is a primitive, with no semantic intermediate. This makes the
spinner's visible color insensitive to mode flips (e.g. dark mode bound at
the semantic tier).

## Reproduction

1. Open `hx-spinner.styles.ts` in Helix.
2. Inspect the CSS variables for `default`, `primary`, `inverted` variants —
   each binds straight to neutral/* or primary/* primitives with no semantic
   intermediate.
3. Compare with `hx-divider.styles.ts` which DOES use a semantic
   intermediate (`color/border/default`).

## Expected

Spinner colors should cascade through a semantic tier so a Figma file
flipping its mode (light ↔ dark) automatically rebinds the visible
spinner without per-variant intervention. Suggested mapping:
- track: `--hx-color-border-subtle` (semantic) → neutral/200 (primitive)
- arc: `--hx-color-text-secondary` (semantic) → neutral/600 (primitive)

## Actual

The Figma renderer's `bindStroke` resolver lands directly on a primitive
because no semantic key exists in the cascade. This is mirror-faithful to
Helix CSS but means design-system-mode flips don't carry through.

## Source

Helix: `hx-spinner.styles.ts`

## Root cause hypothesis

Spinner is a small atom; semantic intermediates were skipped during initial
authoring because the visual is so subtle. Probably an oversight rather
than intent.

## Suggested upstream fix

Update `hx-spinner.styles.ts` to insert a semantic intermediate:

```
.spinner__track {
  stroke: var(--hx-spinner-track-color, var(--hx-color-border-subtle, var(--hx-color-neutral-200, #e5e5e5)));
}
.spinner__arc {
  stroke: var(--hx-spinner-color, var(--hx-color-text-secondary, var(--hx-color-neutral-600, #525252)));
}
```

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-spinner.ts` is faithful to the current
Helix cascade — only `component` and `primitive` tiers in the
`BindingIntent`. When Helix updates, the renderer can be updated to add a
`semantic:` middle tier.

## Cross-references

- Related issues: (none)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract (Rule 7)
- Related commits: 0d6c04b fix(hx-spinner): Rule 1 + Rule 7

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 1 renderer sweep. Workaround in
  place; renderer matches current Helix CSS. Re-evaluate when Helix
  updates spinner styles.
