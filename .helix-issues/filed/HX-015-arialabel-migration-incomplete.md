---
id: HX-015
title: `accessibleLabel` migration incomplete — hx-button + hx-checkbox still read `this.ariaLabel`
status: filed
category: cem-inheritance
severity: critical
reported: 2026-05-05T22:10:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: create-helix-app
related: []
---

# HX-015 — ariaLabel migration incomplete

## Summary

Helix 3.0's UPGRADING-TO-3.md announced the rename of the
component-level `ariaLabel` JS property to `accessibleLabel`. The
intent (per `hx-action-bar.ts:102-104`) is to stop shadowing the native
`HTMLElement.ariaLabel` IDL property — shadowing breaks fallback
browsers and makes it impossible to set an aria-label via the
attribute path while expecting the JS property to reflect.

The migration is incomplete: `hx-button.ts:204` and
`hx-checkbox.ts:201` still read `this.ariaLabel?.trim()` directly as
the second-priority source for the host's accessible name. Consumers
who follow the upgrade guide and stop setting `ariaLabel` get a silent
behavior change (the previously-working ARIA label disappears).

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `grep -rn "this.ariaLabel\b" packages/hx-library/src/components/*/*.ts | grep -v test | grep -v ".d.ts"`
   → returns:
   - `packages/hx-library/src/components/hx-button/hx-button.ts:204`
   - `packages/hx-library/src/components/hx-checkbox/hx-checkbox.ts:201,413,416`
3. Compare with `hx-action-bar.ts:102-125` — that component fully
   migrated to `accessibleLabel || _ariaLabelAttr` (the attribute
   reflection of the *attribute*, not the IDL prop).

## Expected

All components that read an accessible label from a host property
should use:

```ts
this.accessibleLabel?.trim() ||
  this.getAttribute('aria-label')?.trim() ||
  '';
```

Reading the attribute (not the IDL property) avoids the
HTMLElement.ariaLabel shadowing problem. The `accessibleLabel`
component property is the authoritative source.

## Actual

`hx-button.ts:204`:
```ts
return this.accessibleLabel?.trim() || this.ariaLabel?.trim() || '';
```

`hx-checkbox.ts:201`:
```ts
return this.accessibleLabel?.trim() || this.ariaLabel?.trim() || '';
```

Both still chain off the native IDL property `this.ariaLabel`, which
is exactly what the v3 upgrade was supposed to eliminate.

## Source

- Helix: `packages/hx-library/src/components/hx-button/hx-button.ts:204`
- Helix: `packages/hx-library/src/components/hx-checkbox/hx-checkbox.ts:201` (also lines 413, 416)
- Helix (correct pattern): `packages/hx-library/src/components/hx-action-bar/hx-action-bar.ts:102-125`

## Root cause hypothesis

Migration was done family-by-family. hx-action-bar got the full
treatment; hx-button + hx-checkbox were updated for the new
`accessibleLabel` property but the legacy `ariaLabel` fallback was
left in for backward compatibility — without a deprecation warning or
a tracked removal date.

## Suggested upstream fix

Per file:

1. Replace `this.ariaLabel?.trim()` with
   `this.getAttribute('aria-label')?.trim()` (read the attribute, not
   the IDL property).
2. Add a one-time `console.warn` when a consumer-set `ariaLabel` is
   detected, pointing at the migration guide.
3. Update `UPGRADING-TO-3.md` with the per-component migration table so
   the gap is visible.
4. Stretch goal: cover with a unit test in `aria-delegation.test.ts`
   that confirms `accessibleLabel` → host `aria-label` reflection
   works without touching `el.ariaLabel`.

## Local workaround (if any)

create-helix-app scaffolds use `accessibleLabel` consistently in
generated samples (no `ariaLabel` references). figma-tokens doesn't
touch ARIA labels at all (visual-only). No workaround needed our side
— this is purely an upstream cleanup.

## Cross-references

- Related issues: (none direct)
- Related vault docs: UPGRADING-TO-3.md — accessibleLabel migration
- Related commits: hx-action-bar migration (see git blame on lines 102-125)

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #1. Two
  files, mechanical edit. Should be a same-day fix in helix-team's
  next hotfix.
