---
id: HX-020
title: hx-button-group + hx-clinical-status crash Firefox via duplicate `attachInternals()` calls
status: filed
category: component-gap
severity: critical
reported: 2026-05-05T22:35:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: []
---

# HX-020 — Duplicate `attachInternals()` crashes Firefox

## Summary

`hx-button-group` and `hx-clinical-status` declare their own
`this.attachInternals()` call in `connectedCallback`, but they
inherit from `HelixElement` which already exposes a lazy `_internals`
getter that calls `attachInternals()` on first access. Firefox throws
a `DOMException: NotSupportedError` on the second call (per the spec,
ElementInternals can only be attached once per element); the host
crashes during construction and the entire ComponentSet fails to
upgrade.

Chromium and WebKit silently return the same internals object on a
second call (out of spec but lenient), which masks the bug in CI
unless Firefox is explicitly tested.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `grep -rn "attachInternals" packages/hx-library/src/components/hx-button-group/ packages/hx-library/src/components/hx-clinical-status/`
   → confirm direct calls.
3. Render either component in Firefox (Storybook, or a minimal test
   page with `<hx-button-group>` connected).
4. Open DevTools console — `DOMException: NotSupportedError: An
   attempt was made to use an object that is not, or is no longer,
   usable.`
5. Compare with `HelixElement` base — its lazy `_internals` getter
   already covers the form-association requirements.

## Expected

Components that need ElementInternals access should:

```ts
class HxButtonGroup extends HelixElement {
  // Use the inherited lazy getter — DO NOT call attachInternals()
  // directly.
  someMethod() {
    this._internals.setFormValue(...);
  }
}
```

The base class's contract is the single attachment point.

## Actual

`hx-button-group.ts` and `hx-clinical-status.ts` both call
`this.attachInternals()` directly (likely copy-pasted boilerplate
from a pre-HelixElement era). Firefox refuses the second attachment
call and the component never upgrades.

## Source

- Helix: `packages/hx-library/src/components/hx-button-group/hx-button-group.ts` (search `attachInternals`)
- Helix: `packages/hx-library/src/components/hx-clinical-status/hx-clinical-status.ts` (search `attachInternals`)
- Helix base: `packages/hx-library/src/base/HelixElement.ts` (the lazy `_internals` getter)
- Audit reference: `HELiX 3.0.0 Remediation Plan.md:P0-1, P0-2` (vault)

## Root cause hypothesis

Both components were authored before the `_internals` lazy getter
landed in `HelixElement`. The migration to the new base wasn't
followed by a sweep to remove now-redundant `attachInternals()` calls.
CI ran on Chromium-only at the time so the Firefox crash didn't
register.

## Suggested upstream fix

Per file:

1. Remove `this.attachInternals()` from
   `hx-button-group.ts:connectedCallback`.
2. Remove `this.attachInternals()` from
   `hx-clinical-status.ts:connectedCallback`.
3. Replace any local `this._internals` assignment with reads through
   the inherited getter.
4. Add a Firefox lane to the Storybook + Playwright test matrix so
   regressions of this shape surface immediately.

## Local workaround (if any)

create-helix-app's scaffolds use the inherited `_internals` getter and
never call `attachInternals()` directly (we ship the correct pattern
in the template). figma-tokens renders both components without
exercising form internals — no Firefox crash in the kit build. No
workaround needed our side.

## Cross-references

- Related issues: (none direct)
- Related vault docs: HELiX 3.0.0 Remediation Plan.md P0-1, P0-2

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #7. Two
  files, one-line removal each.
