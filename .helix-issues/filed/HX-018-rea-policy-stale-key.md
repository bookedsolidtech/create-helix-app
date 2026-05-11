---
id: HX-018
title: Helix `.rea/policy.yaml` contains removed `push_review` key — `rea check` fails
status: filed
category: build-release
severity: critical
reported: 2026-05-05T22:25:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: []
---

# HX-018 — `.rea/policy.yaml` references removed `push_review` key

## Summary

Helix's `.rea/policy.yaml` file declares a `review.push_review:` key
under the `review` block. As of `@bookedsolid/rea` 0.4.0 the policy
schema was tightened (strict mode rejects unknown keys), and the
`push_review` key was renamed to a sibling structure. Result: every
`npx rea check` run inside the helix repo fails immediately with a
schema-validation error and the local governance loop is broken.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `cat .rea/policy.yaml | grep -A1 push_review` → confirm the legacy
   key is present.
3. `npx rea check` → exits non-zero with a schema error pointing at
   the unknown key.
4. Pre-push governance hooks now error-out, blocking developers from
   pushing without `git push --no-verify` (which is policy-prohibited
   in this repo per CLAUDE.md).

## Expected

`.rea/policy.yaml` parses cleanly under rea 0.4.0+. Either:

- Remove the `push_review` key (it's been replaced by per-hook
  policy entries).
- Migrate it to the current schema location (likely under a `hooks.*`
  block; see the rea 0.4.0 changelog for the rename target).

## Actual

`rea check` fails before any policy logic runs. Audit log entries are
not written. The local kill switch (`.rea/HALT`) still works (it's a
separate path) but the standard validation flow is broken.

## Source

- Helix: `.rea/policy.yaml` (the `review.push_review:` line)
- Audit reference: `4-20 Audit Findings.md:A7-C1` (vault)
- rea schema: `node_modules/@bookedsolid/rea/dist/schema/policy.d.ts`

## Root cause hypothesis

Helix's policy file was authored against rea 0.3.x. The 0.4.0 release
tightened schema validation (strict-mode by default, was permissive)
and renamed several keys for consistency. The policy file wasn't
migrated.

## Suggested upstream fix

One-line fix: delete the `push_review:` line (or migrate to the
current key). Bump the rea minimum-version in the helix `package.json`
to make the requirement explicit. Add a CI step that runs
`npx rea check` on every push so future drift is caught immediately.

## Local workaround (if any)

create-helix-app's `.rea/policy.yaml` is on the current schema (this
repo bumped to rea 0.11 recently — see commit 29580ab). No workaround
needed our side.

## Cross-references

- Related issues: (none direct)
- Related rea bugs: (none — this is a Helix consumer issue, not a rea
  bug)
- Related vault docs: 4-20 Audit Findings.md A7-C1
- Related commits: create-helix-app@29580ab (rea 0.11 upgrade)

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #5. One-line
  fix in helix `.rea/policy.yaml`.
