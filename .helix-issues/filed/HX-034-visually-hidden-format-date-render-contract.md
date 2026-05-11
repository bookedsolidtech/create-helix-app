---
id: HX-034
title: hx-visually-hidden + hx-format-date — render-no-style components need same contract as hx-style-scope
status: filed
category: cem-inheritance
severity: low
reported: 2026-05-05T23:45:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-033]
---

# HX-034 — `hx-visually-hidden` + `hx-format-date` need the `@figma-render: false` contract

## Summary

Two more behavioral utility components share `hx-style-scope`'s
problem (HX-033):

- `hx-visually-hidden` — pure CSS clip-path wrapper for screen-reader
  text. No visible chrome.
- `hx-format-date` — i18n date formatter; renders the formatted text
  but has no chrome of its own.

Same fix: mark them `@figma-render: false` in CEM JSDoc.

## Reproduction

1. `ls /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-visually-hidden/`
2. `ls /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-format-date/`
3. Confirm both have full CEM entries but no visible chrome.

## Expected

See HX-033. Add `@figma-render: false` JSDoc to both components.
figma-tokens renderer matrix honors the flag.

## Actual

Renderers emit labeled-frame placeholders.

## Source

- Helix: `packages/hx-library/src/components/hx-visually-hidden/`
- Helix: `packages/hx-library/src/components/hx-format-date/`
- figma-tokens: `plugin/renderers/hx-visually-hidden.ts`,
  `plugin/renderers/hx-format-date.ts`

## Root cause hypothesis

Same as HX-033.

## Suggested upstream fix

Same mechanism as HX-033 — single JSDoc tag per component.

## Local workaround (if any)

Renderers emit placeholders.

## Cross-references

- Related issues: HX-033 (style-scope; same contract)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Same upstream fix as
  HX-033 — group both for a single helix PR.
