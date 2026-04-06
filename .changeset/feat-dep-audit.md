---
'create-helix': minor
---

feat: add dependency vulnerability and license audit before scaffolding

Adds `src/security/dep-audit.ts` that checks template dependencies against
the npm registry advisory API for known vulnerabilities and verifies that all
dependency licenses are enterprise-approved (MIT, Apache-2.0, BSD-\*, ISC, 0BSD)
before writing package.json.

- TUI shows `⚠ pkg@version has N severity vulnerabilities` warnings
- TUI shows `⚠ pkg@version uses non-standard license: GPL-3.0` warnings
- Network failures degrade gracefully — audit is skipped with a notice
- `--skip-audit` flag bypasses the audit entirely (e.g. for offline/CI use)
