---
title: Helix Issues — Top-10 priority for rapid release / hotfix
updated: 2026-05-05
source: synthesized from create-helix-app + figma-tokens audit (Phase 1 of unified renderer-correctness plan); D2-bis backfill 2026-05-05
filed_count: 44
---

# Helix Issues — Top-10 priority for rapid release / hotfix

The 10 highest-impact issues blocking the figma-tokens + create-helix-app workstream from being a tight, walk-away enterprise / healthcare / WCAG AAA-ready product. Sourced from the Phase 1 audit (Explore agent, 2026-05-05) covering: BST vault Helix planning + audit docs, create-helix-app `.rea/bug-reports/`, figma-tokens renderer source comments, helix repo source, recent commits, wc-storybook integration tests.

All 44 surfaced issues are now filed (`HX-001` … `HX-044`); the D2-bis backfill (2026-05-05) promoted HX-013 through HX-044 from the audit signal pool. The Top-10 ranking below references the canonical filed entries; cross-referenced HX-NNN ids are added in parentheses.

## Ranking

| Rank | Helix issue | Category | Severity | Why this unblocks the most |
|---|---|---|---|---|
| **1** | `accessible-label` migration incomplete (hx-button + hx-checkbox still using `ariaLabel`) (HX-015) | cem-inheritance | critical | Consumers following UPGRADING-TO-3.md get broken behavior. Silent breaking change. Blocks 3.0.0 ship gate. |
| **2** | CI security audit `\|\|` catch-all hides CVEs (HX-016) | build-release | critical | `pnpm audit` exit code swallows both "vulnerabilities found" AND "endpoint down". Critical CVEs silently pass. Source: `4-20 Audit Findings.md:A5-C1`. |
| **3** | Coverage gate exits 0 on zero-coverage data (HX-017) | build-release | critical | `scripts/check-coverage.mjs:199` lets new untested components bypass the quality gate. Source: `4-20 Audit Findings.md:A4-C1`. |
| **4** | 0/93 components define `@media (forced-colors: active)` (WCAG 1.4.11) (HX-014) | accessibility | high | Healthcare + WCAG AAA mandate. Library-wide gap; blocks production readiness. |
| **5** | Governance policy `review` block contains removed key `push_review` (HX-018) | build-release | critical | `npx rea check` broken since rea 0.4.0 strict schema. 1-line manual fix. Source: `4-20 Audit Findings.md:A7-C1`. |
| **6** | Storybook tests OOM at file 70 from cumulative Chromium memory exhaustion (HX-019) | build-release | high | OOM from uncleaned Web Component listeners + DOM accumulation. CI burns 40+ min per run via watchdog force-kill. Source: `4-20 Audit Findings.md:A6-H1`. |
| **7** | hx-button-group + hx-clinical-status crash Firefox via duplicate `attachInternals()` (HX-020) | component-gap | critical | Both declare `attachInternals()` while inheriting HelixElement's lazy `_internals` getter — double-call DOMException. Source: `HELiX 3.0.0 Remediation Plan.md:P0-1,P0-2`. |
| **8** | `create-helix-app` scaffolds Track 2 (extends ClientElement) instead of Track 1 (extends HelixX) (HX-021) | documentation | high | Wrong extension pattern shipped for months. Every new client starts with the architecturally-wrong inheritance. Source: `Helix Priority Features for Immediate Release.md:F4`. |
| **9** | HC brand-token suppression overly broad (strips non-color tokens too) (HX-022) | token-gap | high | HC mode strips ALL brand tokens — typography, radius, layout — when WCAG only requires color contrast suppression. Low-vision users lose typographic structure. Source: `00-Planning/helix/HC brand-token suppression scope...md`. |
| **10** | `tokens.json` `component.*` block declares 800+ tokens with `value: null` — naive consumers crash (HX-013) | token-gap | critical | The flagship cause of the renderer correctness sweep. 38 ComponentSets silently failed to build because the figma-tokens cascade resolver received `null` from the manifest block. Workaround in plugin; upstream cleanup unblocks any new tooling. |

## Scoring criteria

- **Severity weight** — runtime breakage / CVE / WCAG violation > silent functional gap > naming / deprecation cleanup
- **Affected surface** — gate, library-wide, or single-component
- **Workaround availability** — fixable at our layer or strictly upstream
- **Demo / handoff impact** — would the issue be visible to the design team or external client during the next milestone

## What "shipped" looks like

When helix-team ships a hotfix containing one of these:

1. Update the corresponding `HX-XXX-*.md` front-matter `status:` to `resolved` with the helix release version.
2. Update this file's row to strike through (or move to a "Recently resolved" section at the bottom).
3. Notify in #helix-platform Discord (or wherever the team coordinates) so create-helix-app + figma-tokens can drop any local workaround.

## Out of this list (intentionally)

- The figma-tokens-side renderer behavior gaps (avatar slot=image deferred HX-032, card real shadows HX-028, color-picker tokens HX-031, popup/popover/tooltip arrow rotation HX-023/024/025, dialog/drawer overlay HX-026) — workarounds in place; visual approximation good enough for current designer flow.
- The Drupal documentation drift items (HX-039) — high-impact but slower-burn; helix-team's docs cycle, not the runtime hotfix path.
- The token-shape ergonomics (HX-040 `_comment` recursion, HX-013 manifest format) — workarounds in place at flatten time; cleanup small but not blocking.
- The animation-primitive gap (HX-036, HX-038) — visual-only; no consumer is currently asking for animation tokens.
- Domain-semantic refactors (HX-044 clinical-status) — unblocks healthcare-vertical theming but no specific consumer is gated on it today.
- Layout-pattern refactors (HX-027 tabs stripe, HX-029 progress-bar siblings, HX-030 image overlap) — workarounds visually faithful enough.
- Documentation contracts (HX-033/034 render-no-style, HX-037 disabled axis, HX-041 action-bar silent skip, HX-042 table family, HX-043 tree-view depth) — audit and doc work; not runtime fixes.

These are all tracked in the per-issue `HX-NNN` files; just not on this acceleration list.
