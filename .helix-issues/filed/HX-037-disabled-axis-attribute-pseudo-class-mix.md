---
id: HX-037
title: `disabled` axis inconsistent — some components expose attribute, others rely on CSS pseudo-class only
status: filed
category: cem-inheritance
severity: medium
reported: 2026-05-06T00:00:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-037 — `disabled` exposed inconsistently across the library

## Summary

The figma-tokens plugin folds the `disabled` state into a single
"state" axis on most components (`state ∈ {default, hover, focus,
disabled}`). For this to map back to runtime CSS, every component
needs to expose `[disabled]` as a host attribute that consumers can
toggle. Many do; some don't.

Components that DO expose `disabled` as a host attribute (consistent):
- hx-button, hx-checkbox, hx-radio, hx-switch, hx-toggle-button,
  hx-text-input, hx-textarea, hx-select, hx-combobox,
  hx-date-picker, hx-time-picker, hx-color-picker, hx-slider,
  hx-rating, hx-counter, hx-number-input, hx-file-upload, hx-link,
  hx-icon-button, hx-copy-button, hx-split-button, hx-tab,
  hx-menu-item, hx-tree-item, hx-nav-item, hx-side-nav,
  hx-overflow-menu, hx-checkbox-group, hx-radio-group, hx-form,
  hx-accordion-item, hx-split-panel, hx-data-table.

Components where `disabled` is fuzzy (CSS pseudo-class but no host
attribute, OR not applicable but the renderer assumes it is):
- Some sub-element components (hx-tab-panel, hx-toast-stack) inherit
  parent disabled state without their own attribute.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `grep -rn "@property.*disabled\|disabled = property\|@property.*disabled.*:.*Boolean" packages/hx-library/src/components/`
   — list all explicit disabled properties.
3. Cross-reference with the figma-tokens renderers' `state` axis use
   — find renderers expecting a disabled binding that the component
   doesn't actually expose.

## Expected

A library-wide audit of which components expose `disabled` as a
documented host attribute (with a CEM `@attr disabled` entry). For
each component where the figma-tokens renderer uses a "disabled"
state but the component lacks the attribute, either:

- Add the attribute to the component (preferred for any interactive
  element).
- Remove the disabled state from the renderer's variant axis
  (preferred for static / display-only components like
  hx-tab-panel).

Ship a `docs/disabled-pattern.md` documenting the contract.

## Actual

The `state` folding in the plugin assumes universal disabled support.
Some components silently drop the disabled variant or render an
indistinguishable visual (because the CSS rule has no
`[disabled]` selector to hit).

## Source

- figma-tokens: `plugin/renderers/hx-button.ts:67` (`state` axis with
  disabled), and similar across most renderers
- Helix: variable per-component

## Root cause hypothesis

`disabled` was added per-component as the use case arose. No
library-wide audit ever happened.

## Suggested upstream fix

Two-pass:

1. Audit every component for `@attr disabled` presence + behavior
   contract. Produce a single CSV/MD that's the source of truth.
2. Add the attribute (where missing-but-needed) or drop the renderer
   state (where present-but-not-applicable).

## Local workaround (if any)

`figma-tokens/plugin/renderers/*.ts` declare disabled bindings on
`state` axis; renderers that hit a missing attribute emit a visually
indistinguishable variant (the bumpStats accumulates a "missing"
binding in `plugin/lib/bindings.ts:73`). Verifier reports these.

## Cross-references

- Related issues: HX-013 (manifest format — disabled is
  attribute-side, not token-side, but same "is this declared?"
  question)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Low-severity audit work
  rather than a defect.
