---
id: HX-017
title: Coverage gate exits 0 when coverage data is empty
status: filed
category: build-release
severity: critical
reported: 2026-05-05T22:20:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: [HX-016]
---

# HX-017 — Coverage gate passes on zero-coverage data

## Summary

`scripts/check-coverage.mjs:199` (per the 4-20 audit findings A4-C1)
returns success when the coverage JSON is empty — i.e. when no tests
ran, or when all tests failed before producing coverage data. Result:
a new component shipping with zero tests passes the coverage gate
because the script can't find any data to compare against the
threshold.

## Reproduction

1. Add a new component file in `packages/hx-library/src/components/`
   without a corresponding `.test.ts`.
2. Run the test suite.
3. Open `coverage/coverage-summary.json` — the new component is
   absent (vitest only includes files it imported).
4. Run `node scripts/check-coverage.mjs` — exits 0 because the
   threshold check operates on the (empty) summary, not on the
   "expected files" set.

## Expected

The coverage gate must:

1. Enumerate every `*.ts` file under `packages/hx-library/src/`
   (excluding `__tests__/`, `__screenshots__/`, `*.stories.ts`,
   `*.d.ts`, `index.ts`).
2. Cross-check that each is represented in
   `coverage/coverage-summary.json`.
3. Fail the gate on:
   - Any file in the expected set with no entry in the summary.
   - Any file below the per-file threshold (statements/branches/lines).
   - Any project-wide aggregate below the global threshold.

A simple guard at the top of the script would also help:

```js
const summary = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8'));
if (Object.keys(summary).length === 0) {
  console.error('Coverage summary is empty — refusing to pass the gate.');
  process.exit(1);
}
```

## Actual

Per audit:

> `scripts/check-coverage.mjs:199` lets new untested components bypass
> the quality gate. Exit-0 on empty input.

The check assumes the summary file is populated; an empty object
trivially satisfies "all entries above threshold" (vacuous truth).

## Source

- Helix: `scripts/check-coverage.mjs` (line ~199 per 4-20 audit ref)
- Audit reference: `4-20 Audit Findings.md:A4-C1` (vault)

## Root cause hypothesis

The script was authored when 100% of components had tests — the
"expected vs actual" split wasn't necessary. As the library grew, new
components added without tests slipped through because the check was
conceptually "did the existing files pass?" not "do all files exist
and pass?"

## Suggested upstream fix

See "Expected" above. Add the empty-summary guard as a one-line fix
today; add the file-enumeration cross-check as a follow-up PR (needs a
small glob + de-dupe).

## Local workaround (if any)

create-helix-app's scaffolds always emit a smoke test alongside every
component template, so this gap doesn't bite our generated output. No
reach into Helix's CI.

## Cross-references

- Related issues: HX-016 (security audit — same shape, different gate)
- Related vault docs: 4-20 Audit Findings.md A4-C1

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #3.
