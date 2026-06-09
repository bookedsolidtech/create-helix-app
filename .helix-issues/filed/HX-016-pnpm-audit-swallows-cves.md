---
id: HX-016
title: CI security audit `||` catch-all hides CVEs from the gate
status: filed
category: build-release
severity: critical
reported: 2026-05-05T22:15:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: other
related: [HX-017]
---

# HX-016 — `pnpm audit || true` swallows CVEs

## Summary

The Helix CI security-audit step uses a `pnpm audit || <fallback>`
pattern that returns success regardless of whether `pnpm audit` exited
because (a) it found vulnerabilities, (b) the registry endpoint timed
out, or (c) the network was unreachable. All three cases get the same
green ✅ on the dashboard, which means a critical CVE introduced via
a transitive dep ships unnoticed.

This was caught in the 4-20 audit findings (A5-C1) but as of the
current Helix 3.3.1 cut the workflow has not been hardened.

## Reproduction

1. Open `.github/workflows/<security-audit-workflow>.yml` in helix
   repo.
2. Find the `pnpm audit` step. Confirm it uses `pnpm audit ||
   <something>` rather than `pnpm audit --audit-level=high`.
3. Inject a deliberate vulnerability (`pnpm add lodash@4.17.20` —
   known CVE) on a feature branch and push.
4. Observe the security-audit job exits 0 even though pnpm audit
   reports the CVE in stdout.

## Expected

The audit step distinguishes between exit codes:

```yaml
- name: pnpm audit
  run: |
    set -e
    pnpm audit --json --audit-level=high > audit-report.json || exit_code=$?
    case "${exit_code:-0}" in
      0)   echo "No vulnerabilities found." ;;
      1)   echo "Vulnerabilities found at audit-level=high — failing the gate."; exit 1 ;;
      *)   echo "pnpm audit failed for non-vulnerability reason (network, etc.) — failing the gate."; exit 1 ;;
    esac
```

`pnpm audit` returns:
- 0 = no vulnerabilities at the requested level
- 1 = vulnerabilities found
- other = registry / network / config error

The gate must NOT treat "registry down" as "no problem."

## Actual

Current pattern (per audit findings) is along the lines of:

```yaml
run: pnpm audit || echo "audit completed"
```

…which throws away the exit code entirely. Vulnerabilities pass.
Network errors pass. Misconfiguration passes.

## Source

- Helix: `.github/workflows/security-audit.yml` (or wherever the
  audit step lives)
- Audit reference: `4-20 Audit Findings.md:A5-C1` (vault)

## Root cause hypothesis

The original author wanted the workflow to not fail on transient
network blips — `pnpm audit` against a busy registry occasionally
returns spurious failures. The `||` was a quick fix that became a
permanent bypass.

## Suggested upstream fix

See "Expected" above. Replace `||` with explicit exit-code switching.
Add one retry on non-1 exit codes (network category). Persist the JSON
report as a workflow artifact for triage.

## Local workaround (if any)

create-helix-app + figma-tokens run their own `npm audit` via Husky
pre-push and CI gates that are stricter (`--audit-level=moderate`).
No reach into the upstream Helix CI.

## Cross-references

- Related issues: HX-017 (coverage gate — same shape of bug)
- Related vault docs: 4-20 Audit Findings.md A5-C1
- Related rea bugs: (none — this is a Helix CI issue, not a rea issue)

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #2. One-file
  fix in the helix CI workflow.
