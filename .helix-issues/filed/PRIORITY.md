---
title: Helix Issues — Top-10 priority for rapid release / hotfix
updated: 2026-05-05
source: synthesized from create-helix-app + figma-tokens audit (Phase 1 of unified renderer-correctness plan)
---

# Helix Issues — Top-10 priority for rapid release / hotfix

The 10 highest-impact issues blocking the figma-tokens + create-helix-app workstream from being a tight, walk-away enterprise / healthcare / WCAG AAA-ready product. Sourced from the Phase 1 audit (Explore agent, 2026-05-05) covering: BST vault Helix planning + audit docs, create-helix-app `.rea/bug-reports/`, figma-tokens renderer source comments, helix repo source, recent commits, wc-storybook integration tests.

Backfill of all 44 surfaced issues lives in this directory's siblings (`HX-001` … `HX-044`). This file ranks the subset that helix-team should treat as the next hotfix / point-release blocker list.

## Ranking

| Rank | Helix issue | Category | Severity | Why this unblocks the most |
|---|---|---|---|---|
| **1** | `accessible-label` migration incomplete (8 components still using `ariaLabel`) | cem-inheritance | critical | Consumers following UPGRADING-TO-3.md get broken behavior. Silent breaking change. Blocks 3.0.0 ship gate. Affected: `hx-button`, `hx-checkbox`, `hx-file-upload`, `hx-icon-button`, `hx-copy-button`, `hx-link`, `hx-menu-item`, `hx-nav-item`, `hx-overflow-menu`, `hx-side-nav`, `hx-toggle-button`, `hx-tooltip`. |
| **2** | CI security audit `\|\|` catch-all hides CVEs | build-release | critical | `pnpm audit` exit code swallows both "vulnerabilities found" AND "endpoint down". Critical CVEs silently pass. Source: `4-20 Audit Findings.md:A5-C1`. |
| **3** | Coverage gate exits 0 on zero-coverage data | build-release | critical | `scripts/check-coverage.mjs:199` lets new untested components bypass the quality gate. Source: `4-20 Audit Findings.md:A4-C1`. |
| **4** | 76/83 components missing `@media (forced-colors: active)` support (WCAG 1.4.11) | accessibility | high | Healthcare + WCAG AAA mandate. Only 7 components have explicit HC support today. Blocks production readiness across the entire library. |
| **5** | Governance policy `review` block contains removed key `push_review` | build-release | critical | `npx rea check` broken since rea 0.4.0 strict schema. 1-line manual fix. Source: `4-20 Audit Findings.md:A7-C1`. |
| **6** | Storybook tests crash deterministically at file 70 from cumulative Chromium memory exhaustion | build-release | high | OOM from uncleaned Web Component listeners + DOM accumulation. CI burns 40+ min per run via watchdog force-kill. Source: `4-20 Audit Findings.md:A6-H1`. |
| **7** | 3 components crash Firefox via invalid `attachInternals()` calls | component-gap | critical | `hx-button-group`, `hx-clinical-status` declare `attachInternals()` while inheriting HelixElement's lazy `_internals` getter — double-call DOMException. Source: `HELiX 3.0.0 Remediation Plan.md:P0-1,P0-2`. |
| **8** | `create-helix-app` scaffold teaches Track 2 (extends ClientElement) instead of Track 1 (extends HelixX) | documentation | high | Wrong extension pattern shipped for months. Every new client starts with the architecturally-wrong inheritance. Source: `Helix Priority Features for Immediate Release.md:F4`. |
| **9** | HC brand-token suppression overly broad (strips non-color tokens too) | token-gap | high | HC mode strips ALL brand tokens — typography, radius, layout — when WCAG only requires color contrast suppression. Low-vision users lose typographic structure. Source: `00-Planning/helix/HC brand-token suppression scope...md`. |
| **10** | `--token-prefix` CLI flag silently drops values starting with `--` | other (create-helix-app) | medium | `--token-prefix=--well` parses as default `--hx`. Breaks parametric brand-layer generation for clients with explicit prefixes. Source: `.rea/bug-reports/incoming/2026-05-05T040500Z-cli-token-prefix-leading-dashes.md`. Only this-list entry that's a create-helix-app fix, not upstream Helix. |

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

- The 4 figma-tokens-side renderer behavior gaps (avatar initials, card real shadows, color-picker gradient, split-panel collapsed) — these are in our queue, not Helix's.
- The Drupal documentation drift items — high-impact but slower-burn; helix-team's docs cycle, not the runtime hotfix path.
- The `mixinDelegatesAria` typo — low-severity API rename, can wait for the next minor.

These are tracked in the per-issue `HX-NNN` files; just not on this acceleration list.
