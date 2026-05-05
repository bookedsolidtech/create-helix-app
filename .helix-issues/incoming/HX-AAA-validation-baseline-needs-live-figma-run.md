---
id: HX-AAA-validation-baseline-needs-live-figma-run
title: AAA contrast validation infra shipped — first live run needed to baseline shortfalls
status: draft
category: accessibility
severity: medium
reported: 2026-05-05T23:43:00Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-AAA-validation-baseline-needs-live-figma-run — AAA contrast validation infra shipped — first live run needed to baseline shortfalls

## Summary

DX S3.3 landed `wcag-aaa-contrast` in the figma-tokens plugin verify pass
(commit 9753579 on feature/s3.1-dtcg-default). The check is wired,
typed, builds clean, and ships with the next plugin release. What is
NOT yet known: which specific Helix component pairs fall short of AAA
under the current Light / Dark / High-Contrast semantic ramps. That
baseline only materializes when a designer (or CI-with-Figma-renderer)
runs "Build Helix Web Component Library" + "Verify Components" against
a live Figma file with the Helix Semantics collection loaded.

## Reproduction

1. Pull latest `figma-tokens` (commit 9753579 or later).
2. `pnpm plugin:build`.
3. Open Figma, run the plugin → "Import Design System" → "Build Helix
   Web Component Library".
4. Click "Verify Components".
5. Inspect the global checks panel for `wcag-aaa-contrast` summary +
   per-mode breakdown + top-10 worst sub-AA pairs.

## Expected

A baseline report listing:
- Total text/bg pairs evaluated × 3 modes
- AAA / AA-only / sub-AA / unmeasurable counts per mode
- Top-10 worst sub-AA pairs by ratio (component, variant, text node,
  font-size class, mode, exact ratio, threshold needed)

Marketing posture today is "AA conformant, AAA-ready architecture, AAA
validation in progress." The validation infra now exists; we owe the
team a real number from a real run.

## Actual

(Not yet observed — needs first live execution.)

## Source

- Verify check: `figma-tokens/plugin/lib/verify.ts` — `checkWcagAaaContrast`
- Plan: `~/.claude/plans/well-we-ve-done-massive-hidden-dream.md` § S3.3
- Sprint 4 finding #1: `bst-cto-kb/00-Planning/create-helix-app/Benchmark — S4.2 AAA Accessibility Baseline.md`

## Root cause hypothesis

Not a bug — a missing baseline measurement. The infra ships without
the data because contrast resolution requires live `figma.variables`
API access (no CI-mockable substitute today).

## Suggested upstream fix

After the first live run produces a baseline, file individual draft
helix-issues per failing component cluster using the pattern
`HX-AAA-<component>-<context>.md` so each one becomes triagable.
Likely candidates (UNVERIFIED — these are EDUCATED GUESSES based on
typical design-system AAA gaps, NOT measured failures):

- `color/info/500` text on `color/info/50` bg in alerts/banners
  (info palette is the one most commonly under-saturated for AAA on
  light backgrounds).
- `color/neutral/500` placeholder text in inputs (placeholder text is
  the canonical AA-only-not-AAA failure mode across the industry).
- Any component using `color/accent/500` for body text on white
  (mid-stop accents rarely clear 7:1).
- Disabled-state text — Helix's High-Contrast mode treatment for
  `disabled` may keep AA but miss AAA.

These are NOT confirmed; they are the priors a benchmark reviewer would
expect. The point of the validation infra is to replace educated guesses
with data.

## Local workaround (if any)

The verify check itself classifies sub-AA as WARN (not FAIL) per S3.3
spec — "Don't fail the build on AAA shortfalls — just classify." So
the existing build flow continues unchanged; this issue is purely
about the missing measurement, not a regression.

## Cross-references

- Related commits: 9753579 (figma-tokens) — feat(plugin/verify):
  wcag-aaa-contrast check (DX S3.3)
- Related vault docs: `bst-cto-kb/00-Planning/create-helix-app/Benchmark — S4.2 AAA Accessibility Baseline.md`
- Helix Bug Reports running log entry on forced-colors confirms Helix
  team already in flight on the related work — this issue dovetails.

## Status notes

- 2026-05-05: drafted alongside the S3.3 ship. Awaiting first live
  Figma run to convert this from a meta-issue into N concrete
  per-component AAA shortfall entries.
