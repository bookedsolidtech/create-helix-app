---
id: HX-PHASE-C-1
title: Phase C renderers use from-built adapter; callback API still required for new renderers
status: draft
category: build-release
severity: low
reported: 2026-05-05T18:50:00Z
helix_version: figma-tokens 0.6.0
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-PHASE-C-1 — Phase C renderers use from-built adapter; callback API still required for new renderers

## Summary

The Phase C migration script (`scripts/migrate-renderers-phase-c.mjs`)
routed all 100 existing renderers through `upsertComponentSetFromBuilt`
(the from-built adapter) rather than `upsertComponentSet` (the
callback-based canonical API). The from-built adapter does the same
idempotency work but is wasteful: it builds N donor ComponentNodes,
then transplants their children into existing variants and removes the
donors. The callback API skips the donor-create-then-discard cost by
populating existing variants in-place.

For 100 × ~50 variants × ~10 children = ~50K transplant operations
per rebuild. Acceptable overhead for now (build is still under a few
seconds), but new renderers should authored with the callback API to
avoid contributing to drift.

## Reproduction

1. Look at any migrated renderer (e.g. `plugin/renderers/hx-button.ts`).
2. Find the `upsertComponentSetFromBuilt({...})` call.
3. Note that it's preceded by a `for combo of combos { figma.createComponent() ... }` loop that builds donors.

## Expected

For new renderers (Phase D and beyond), the canonical pattern is:

```ts
const upsert = await upsertComponentSet({
  page,
  setName: 'hx-foo',
  combos,
  comboToVariantName: (combo) => `axis=${combo.axis}, ...`,
  buildVariantContents: async (combo, variant) => {
    // populate `variant` directly — no donor create/transplant
  },
  componentProperties: [/* INSTANCE_SWAP slots */],
});
```

## Actual

Existing renderers use the from-built adapter (donor pattern). New
renderers risk being authored against the same pattern by precedent.

## Source

- `plugin/lib/upsert.ts` — both APIs documented (callback canonical;
  from-built adapter for legacy migration only)
- `plugin/renderers/*.ts` — 100 renderers using from-built

## Root cause hypothesis

Pragmatic Phase C trade-off: deeply indenting 100 renderer per-combo
loops to fit the callback signature would have been high regression
risk under time pressure. From-built was the safe path.

## Suggested upstream fix

Document the canonical pattern in the renderer-authoring guide. As
existing renderers get touched for unrelated reasons (visual fixes,
slot additions), opportunistically migrate them to the callback API.

## Local workaround (if any)

None needed — the from-built adapter is correct, just slower.

## Cross-references

- `plugin/lib/upsert.ts` header comment
- Phase C deliverable spec
