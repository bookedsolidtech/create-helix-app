---
'create-helix': patch
---

Fix the `act-ci.yml` workflow that GitHub was rejecting as malformed

Discovered while shipping v0.9.3 — the `test-full` job's `if:` used
`env.ACT_MATRIX_TESTS == 'true' || …`, but the `env` context is not
available in job-level `if:` (only step-level). GitHub refused to parse
the workflow and showed "workflow file issue" / 0s failure on every push
for weeks.

**Fix:**

- Switch to `vars.X` (which IS allowed at job level) and update
  `scripts/act-ci.sh` to pass `--var` instead of `--env`.
- Change the workflow trigger from `pull_request` to `workflow_dispatch`
  so GitHub never auto-runs this workflow. Without that guard, fixing the
  parse error would have made GitHub start executing duplicate CI on
  every PR (this workflow's jobs are act-local copies of the ones in
  `ci.yml`). `scripts/act-ci.sh` updated to invoke `act workflow_dispatch`
  accordingly.

**Out of scope for this release:**

The `release.yml` SBOM step (also broken — `pnpm run sbom` aborts because
`cyclonedx-npm` calls `pnpm ls --all` which `pnpm` rejects) is **NOT**
fixed here. Attempts to swap in `@cyclonedx/cdxgen` cascaded into
audit-gate failures (cdxgen's transitive dependency tree includes
`sequelize@6.x` with HIGH-severity advisories), and cdxgen's
`--required-only` filter drops production transitives — neither extreme
produced an accurate, ship-safe SBOM. The Generate SBOM + Upload SBOM
steps are removed from `release.yml` so they stop blocking release
notifications, and picking a workable SBOM stack is moved to its own
focused follow-up task. The team's existing manual Discord-notify
workflow is unchanged.

Also: `sbom.json` is added to `.gitignore` as a precaution for the
follow-up SBOM work.
