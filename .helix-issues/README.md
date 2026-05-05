# Helix Issues — local audit + coordination pipeline

Tracks every gap, defect, and missing-feature surfaced by the create-helix-app + figma-tokens work that needs a fix in the upstream `@helixui/library` / `@helixui/tokens` packages, OR a documented workaround at our layer.

## Why this lives here (not in the BST vault directly)

Codex-adversarial review (`/codex-review` and the `codex-adversarial` agent) operates on the current repo's working directory. Issue drafts inside `create-helix-app/.helix-issues/` are visible to codex with zero path arguments. Drafts in the BST vault would require cross-repo MCP gymnastics and would mix vault content into codex's repo-review context.

This directory is the local audit + codex-reviewable store. The BST vault (`bst-cto-kb/Projects/HELiX/Audits/`) is the team-shared canonical record. Promotion path: `incoming/` → codex review → `filed/` → manual port to vault.

Parallel to `.rea/bug-reports/` which serves the same role for `@bookedsolid/rea` issues.

## Directory structure

```
.helix-issues/
├── incoming/           # Drafts. Untriaged. Written by humans, codex, or the cron loop.
├── filed/              # Codex-reviewed + finalized. Naming: HX-XXX-<slug>.md
│   └── PRIORITY.md     # Top-N issues ranked for the next Helix hotfix release.
├── README.md           # This file.
└── TEMPLATE.md         # Template for new issue drafts.
```

## Categories (in front-matter `category:`)

- `token-gap` — semantic tokens missing, color ramps with holes, action.* tier coverage gaps
- `component-gap` — renderer wants a CEM slot mapping that doesn't exist; attribute documented but not implemented; variant axis mismatches with styles.ts
- `cem-inheritance` — JSDoc not flowing inheritance, slot definitions ambiguous, mixin signature drift
- `behavior-gap` — places our renderer commented "doesn't honor visually yet" or similar (e.g. hx-split-panel collapsed state)
- `build-release` — anything in the helix release pipeline that bit us (CI gates, coverage, audit, governance)
- `documentation` — things designers/devs need that aren't documented
- `accessibility` — WCAG / forced-colors / keyboard-nav / ARIA gaps
- `security` — PHI handling, CSP, SVG sanitizer, event composition leakage
- `other` — anything that doesn't fit

## Severities

- `critical` — runtime breakage, CVE exposure, silent failures, ship-blocker
- `high` — substantive functional gap, accessibility violation, dev-experience blocker
- `medium` — behavioral inconsistency, inconvenience, future-cost issue
- `low` — cosmetic, naming, deprecation cleanup
- `nice-to-have` — could be deferred indefinitely without harm

## Workflow

1. **Draft** — write a new file in `incoming/` named `<UTC-timestamp>-<topic>.md` using `TEMPLATE.md` as the starting point. This can come from:
   - Manual observation during create-helix-app or figma-tokens work
   - The cron monitoring loop (extends `.rea/bug-reports/` 1hr scanner; see Phase D4 of the unified renderer-correctness plan)
   - Codex finding during a phase review
2. **Codex review** — run `/codex-review` on the draft. Codex evaluates: is the issue reproducible, is the severity right, is the suggested fix sensible, is upstream-vs-workaround the right call.
3. **Promote** — rename the file to `HX-XXX-<slug>.md` (next sequential ID; check existing `filed/` entries to avoid collisions) and move to `filed/`.
4. **Vault port** (manual, user's keystroke) — copy the filed entry to `bst-cto-kb/Projects/HELiX/Audits/` as the helix-team-facing record.
5. **Resolution** — when helix-team ships a fix, update the entry's `status:` front-matter to `resolved` with the helix release version. Don't delete; the historical record matters.

## PRIORITY.md

Ranks the top-N filed issues by "biggest unblock for rapid Helix release / hotfix." Updated as new issues land or priorities shift. Lives in `filed/` so it's part of the canonical record.

## Cross-references

- `.rea/bug-reports/` — sibling pipeline for rea governance issues
- `bst-cto-kb/Projects/HELiX/Audits/` — vault-facing record (manual port)
- `bst-cto-kb/00-Planning/create-helix-app/Layout Rules — Renderer & Component Authoring Contract.md` — the contract our renderers conform to; gaps surface here
- `bst-cto-kb/00-Planning/create-helix-app/v0.6 — Idempotent ComponentSet Rebuild.md` and `v0.7 — Slot-Based Composition (Real Nested Instances).md` — feature plans that depend on Helix-side fixes tracked here
