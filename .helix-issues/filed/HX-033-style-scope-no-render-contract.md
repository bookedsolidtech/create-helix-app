---
id: HX-033
title: hx-style-scope is a behavioral wrapper — needs explicit "render-no-style" contract
status: filed
category: cem-inheritance
severity: low
reported: 2026-05-05T23:40:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-034]
---

# HX-033 — `hx-style-scope` lacks documented "render-no-style" contract

## Summary

`hx-style-scope` is a behavioral wrapper component that provides
shadow-DOM style isolation for slotted children. It has a `.styles.ts`
file but the file is intentionally minimal (just `:host { display:
contents }` or similar). It produces no visible chrome of its own.

The Figma renderer can't kit this — there's nothing to render. But the
component IS in the CEM inventory, so any CEM-walking tool counts it
as "expected" and reports a missing kit. The contract "this component
intentionally produces no design-tool kit" is undocumented.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-style-scope/hx-style-scope.ts`
2. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-style-scope/AUDIT.md`
3. Confirm the component has CEM entry but no visible visual output.

## Expected

Add a CEM-level boolean tag (`@figma-skip` JSDoc, or
`hx-figma-render: false` in the CEM custom field) to mark components
that intentionally have no design-tool representation. Renderers honor
the flag and skip the component without flagging a "missing kit" error.

Candidate components for this flag (need explicit audit but likely
include): `hx-style-scope`, `hx-visually-hidden`, `hx-format-date`,
`hx-theme`.

## Actual

Renderers either build a placeholder kit (faking some chrome — see
`hx-theme.ts:6` which "approximates what that theme's default fill"
would look like) or silently skip and pollute the verifier's
"expected but missing" list.

## Source

- Helix: `packages/hx-library/src/components/hx-style-scope/`
- figma-tokens: `plugin/renderers/hx-style-scope.ts`,
  `plugin/lib/verify.ts:286,469` (the "no renderer" / "no
  component-tier tokens" branches)

## Root cause hypothesis

The CEM doesn't have a notion of "purely behavioral component." All
custom-elements are assumed to have visible representation. This is
true for the bulk of the library but breaks for utility components.

## Suggested upstream fix

Add a `@figma-render` JSDoc tag (default `true`); set to `false` for
the four candidate components. Update CEM extraction to thread the
value into a custom field. Update figma-tokens renderer matrix to
honor the flag.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-style-scope.ts` and similar emit
labeled-frame placeholders. The verifier's "no component-tier tokens"
branch (verify.ts:469) gracefully skips cascade checks for these
components.

## Cross-references

- Related issues: HX-034 (visually-hidden, format-date — same
  "render-no-style" family)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
