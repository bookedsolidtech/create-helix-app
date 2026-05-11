---
id: HX-044
title: hx-clinical-status uses brand color tokens — should reference clinical-domain semantic namespace
status: filed
category: token-gap
severity: medium
reported: 2026-05-06T00:35:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-044 — Clinical-status maps to brand color, not clinical-domain semantics

## Summary

`hx-clinical-status` (per its `AUDIT.md`) renders patient-status
badges (Critical / Warning / Stable / Improving / etc.) using direct
brand color tokens (`color/error/*`, `color/warning/*`,
`color/success/*`). Clinical contexts have well-established
color-coding conventions distinct from generic UI severity (e.g.
"trauma red" is brighter / more saturated than UI error red; "stable
green" is muted to avoid dominating the chart).

A `clinical/*` semantic namespace would let healthcare consumers
override the clinical-status palette without affecting the rest of
the UI's error/warning/success tokens.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-clinical-status/hx-clinical-status.styles.ts`
2. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-clinical-status/AUDIT.md`
3. Confirm direct brand-color references.

## Expected

Add a `clinical/*` semantic namespace:

- `clinical/critical/bg`, `clinical/critical/fg`
- `clinical/warning/bg`, `clinical/warning/fg`
- `clinical/stable/bg`, `clinical/stable/fg`
- `clinical/improving/bg`, `clinical/improving/fg`
- `clinical/declining/bg`, `clinical/declining/fg`
- `clinical/unknown/bg`, `clinical/unknown/fg`

Each cascades through to the appropriate brand primitive by default;
healthcare consumers override the namespace per their care-domain
convention.

`hx-clinical-status.styles.ts` consumes via component-tier tokens
that reference the clinical semantics:
`--hx-clinical-status-critical-bg → clinical/critical/bg →
color/error/600`.

## Actual

Direct brand color references. Healthcare consumers can't override
clinical color-coding without affecting the broader UI palette.

## Source

- Helix: `packages/hx-library/src/components/hx-clinical-status/`
  (styles + AUDIT.md)
- figma-tokens: `plugin/renderers/hx-clinical-status.ts`

## Root cause hypothesis

Clinical-status was added without a domain-semantic taxonomy. Reusing
brand error/warning/success was the pragmatic shortcut.

## Suggested upstream fix

Introduce the `clinical/*` semantic namespace. Refactor styles to
consume. Document the override pattern in
`hx-clinical-status/README.md`.

This sets a precedent for other clinical-domain components
(hx-patient-banner, hx-phi-field) to expose their own
domain-semantic namespaces (`patient/*`, `phi/*`).

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-clinical-status.ts` binds to brand
color tokens. No workaround for the semantic gap.

## Cross-references

- Related issues: (none direct — sets a pattern for
  hx-patient-banner, hx-phi-field follow-ups)

## Status notes

- 2026-05-05: filed during D2-bis backfill. Domain-semantic
  refactor; not blocking but unblocks healthcare-vertical theming.
