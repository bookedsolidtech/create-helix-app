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

1. **Pre-filing namespace check** — before drafting, enumerate the FULL relevant helix-tokens namespace. Helix's `_strong` emphasis surfaces, `on-*` text-pairings, and `border.*` siblings often satisfy a "missing token" need. ~89% of our 2026-05-07 batch came back from helix-team as false-positive because we filed without the full sweep. See `feedback_helix_token_namespace_check.md` in user-memory for the cross-validation pattern.
2. **Draft** — write a new file in `incoming/` named `<UTC-timestamp>-<topic>.md` using `TEMPLATE.md`. Sources:
   - Manual observation during create-helix-app or figma-tokens work
   - The cron monitoring loop (extends `.rea/bug-reports/` 1hr scanner)
   - Codex finding during a phase review
   - Direct MCP probe of the live Helix Figma file
3. **Codex review** — run `/codex-review` on the draft.
4. **Promote** — rename to `HX-XXX-<slug>.md` (next sequential ID across BOTH this tracker AND `figma-tokens/.bug-reports/` — they share numbering).
5. **Vault port** — append a curated summary to `bst-cto-kb/Projects/HELiX/Bug Reports/Helix Bug Reports.md` (the helix-team-watching canonical surface).
6. **Helix-team triage** — possible outcomes:
   - `upstream-acked` — helix accepts, will fix
   - `closed-false-positive` — helix points at existing token / pattern that solves the case (per-namespace fix on consumer side)
   - `deferred-design-decision` — queued for helix-team internal discussion
   - `plugin-internal` — wrong tracker, belongs in `figma-tokens/.bug-reports/` instead
   - `resolved` — helix shipped the fix; close with version
7. **Don't delete** — the historical record matters.

## What belongs HERE vs `figma-tokens/.bug-reports/`

This tracker is for **upstream-helix-blocking items** — things that REQUIRE helix-side code or token changes:
- Missing primitives in helix-tokens authored data
- Bugs in helix CSS/JS code
- Broken contracts in helix's published API surface

Plugin-internal items go to `figma-tokens/.bug-reports/`:
- Plugin architecture decisions
- Pipeline ordering bugs
- Renderer-pattern refactors
- Plugin-side bugs even when they affect downstream behavior

When uncertain: ask the user. They've been doing the helix-team correspondence and know what's theirs vs ours. See `feedback_helix_issues_filing_discipline.md` in user-memory.

## PRIORITY.md

Ranks the top-N filed issues by "biggest unblock for rapid Helix release / hotfix." Updated as new issues land or priorities shift. Lives in `filed/` so it's part of the canonical record.

## Cross-references

- `.rea/bug-reports/` — sibling pipeline for rea governance issues
- `bst-cto-kb/Projects/HELiX/Audits/` — vault-facing record (manual port)
- `bst-cto-kb/00-Planning/create-helix-app/Layout Rules — Renderer & Component Authoring Contract.md` — the contract our renderers conform to; gaps surface here
- `bst-cto-kb/00-Planning/create-helix-app/v0.6 — Idempotent ComponentSet Rebuild.md` and `v0.7 — Slot-Based Composition (Real Nested Instances).md` — feature plans that depend on Helix-side fixes tracked here
