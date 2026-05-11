---
id: HX-038
title: hx-toast auto-dismiss timer has no public token — duration unthemable per brand
status: filed
category: token-gap
severity: low
reported: 2026-05-06T00:05:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-036]
---

# HX-038 — Toast auto-dismiss duration is hard-coded

## Summary

`hx-toast`'s auto-dismiss timer (the duration after which a toast
fades and unmounts) is hard-coded as a constant (likely 5000ms) in
`hx-toast.ts`. There's no `--hx-toast-duration` token nor a CEM
attribute that lets consumers override it.

Brand consumers wanting longer/shorter dwell times (e.g. clinical
contexts where critical messages need 10s minimum, or rapid-fire
feedback contexts where 2s is plenty) have to monkey-patch the
component or write a wrapper that re-emits the toast events.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-toast/hx-toast.ts`
   — search for the dismiss timer (likely `setTimeout(..., 5000)`
   or similar).
2. Confirm there's no `@property duration: number` on the host nor
   a `--hx-toast-duration` token reference.

## Expected

Add a `duration` host attribute (typed `number`, default 5000) and
expose `--hx-toast-duration` as a component-tier token (animation
namespace once HX-036 lands). The component reads the attribute
first, then the token, then the default.

## Actual

5000ms hard-coded. Consumers override by writing a wrapper.

## Source

- Helix: `packages/hx-library/src/components/hx-toast/hx-toast.ts`

## Root cause hypothesis

Initial implementation chose a single sensible default; tokenization
deferred.

## Suggested upstream fix

See "Expected" above. Trivial change.

## Local workaround (if any)

figma-tokens doesn't render the timer (visual-only kit). No reach
into runtime behavior.

## Cross-references

- Related issues: HX-036 (animation primitives)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
