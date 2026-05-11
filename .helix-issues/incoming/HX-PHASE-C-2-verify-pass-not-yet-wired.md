---
id: HX-PHASE-C-2
title: Idempotency verify check landed but not wired into runRegistryBuild's verify-emit
status: draft
category: build-release
severity: medium
reported: 2026-05-05T18:50:00Z
helix_version: figma-tokens 0.6.0
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: [HX-PHASE-C-1]
---

## Helix-team triage 2026-05-07

**Status: PLUGIN-INTERNAL (wrong tracker — belongs in figma-tokens repo).**

**Routing:** Plugin verify-pass invocation in `code.ts:runRegistryBuild`. All cited paths are figma-tokens internal. Helix has no opinion on the figma-tokens build pipeline ordering.

**What this issue actually documents:** The `checkIdempotencyAgainstPriorSnapshot` function exists in the plugin but isn't called from the registry build's verify-emit phase. Wire-up decision (during cleanup sweep vs. after) is a plugin-side architectural call.

**Helix-side action:** None.

**Closure:** Move to figma-tokens's internal tracker. This is your build pipeline, not ours.

---

# HX-PHASE-C-2 — Idempotency verify check landed but not wired into runRegistryBuild's verify-emit

## Summary

`checkIdempotencyAgainstPriorSnapshot()` (lib/verify.ts) emits the
verify-pass shaped checks for set-id drift, variant-id drift, and
componentProperty key drift — but it isn't called yet from
`runRegistryBuild`'s verify pass. The function is callable; the
single-line wiring was deferred to avoid colliding with concurrent
S3.1 work on code.ts during the Phase C session.

Without wiring, the idempotency check exists as scaffolding only.
Designers won't see "Preserved N/N ComponentSet IDs" in the build
output until wiring lands.

## Reproduction

1. Run "Import Design System" in Figma.
2. Check the run-summary log.
3. Note absence of `idempotency-set-ids` / `idempotency-variant-ids`
   check entries (they would appear if wired).

## Expected

After wiring, every build emits at minimum:
- `idempotency-baseline` (info, first run)
- `idempotency-set-ids` (pass: "Preserved 100/100")
- `idempotency-variant-ids` (pass)
- `idempotency-property-keys` (pass)

Drift would show as fail-level checks with concrete tag/variant lists.

## Actual

Helper exists; not invoked. Verify pass surfaces other checks but no
idempotency entries.

## Source

- `plugin/lib/verify.ts` — `checkIdempotencyAgainstPriorSnapshot()`
- `plugin/code.ts` — `runRegistryBuild()` verify-pass concat (the
  call site that needs the wiring)

## Root cause hypothesis

Concurrent S3.1 work on code.ts during the Phase C session made
adding the wiring risky for merge conflicts. Deferred to the
post-S3.1 reconciliation.

## Suggested upstream fix

Single-line addition in runRegistryBuild's verify-pass concat:

```ts
const pages: PageNode[] = [];
for (let i = 0; i < pagesToSweep.length; i++) {
  const p = await ensurePage(pagesToSweep[i]);
  pages.push(p);
}
const idempotencyChecks = checkIdempotencyAgainstPriorSnapshot(pages, PLUGIN_VERSION);
report.globals.push(...idempotencyChecks);
```

(Adjust the exact concat target based on the verify report shape.)

## Local workaround (if any)

The check still has value standalone — a developer can call it from
the JS console after a build to inspect drift. Not a designer-facing
workflow.

## Cross-references

- HX-PHASE-C-1 — Phase C migration architecture
- `plugin/lib/verify.ts:checkIdempotencyAgainstPriorSnapshot`
