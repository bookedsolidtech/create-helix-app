---
id: HX-021
title: create-helix-app scaffolds Track-2 inheritance (extends ClientElement) — should be Track-1 (extends HelixX)
status: filed
category: documentation
severity: high
reported: 2026-05-05T22:40:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: create-helix-app
related: []
---

# HX-021 — Scaffold pattern teaches Track-2, not the recommended Track-1

## Summary

The Helix architecture docs describe two extension patterns:

- **Track 1** — Consumer extends a concrete `HxButton` /
  `HxCard` / etc. to inherit the full component (including its
  shadow-root template, styles, attribute handling). Use when
  consumer wants to *modify* an existing Helix component.

- **Track 2** — Consumer extends `ClientElement` (the bare
  HelixElement subclass with no template) to author a *new*
  component from scratch using Helix's primitives.

`create-helix-app` (this repo) scaffolds via the Track-2 pattern by
default — every generated client extends `ClientElement` and rebuilds
the template/styles from scratch. For consumers who actually want to
customize an existing Helix component (the more common case in
practice), this is the wrong starting point: they end up
re-implementing what Helix already ships.

This is recorded in the vault as
`Helix Priority Features for Immediate Release.md:F4`.

## Reproduction

1. `cd /Volumes/Development/booked/create-helix-app`.
2. `grep -rn "extends ClientElement\|extends HelixElement" src/scaffold.ts`
   → all matches use `HelixElement` / `ClientElement`, none use a
   concrete `Hx*` base.
3. Run any scaffold (`npx create-helix my-app --framework wc-storybook
   --preset enterprise`) and inspect generated samples — they extend
   `HelixElement`, never `HxButton` or similar.

## Expected

The scaffolder should:

- Default to Track-1 for the "extend an existing Helix component"
  flow — generate samples that extend `HxButton`, `HxCard`,
  `HxAlert` (a curated common-extension list).
- Offer Track-2 as an explicit prompt option for consumers building
  brand-new components from scratch.
- Document the choice in the README of the generated project.

The Helix-side docs should match: a `docs/extension-patterns.md`
explaining both tracks, when to use which, and the inheritance chain
(`ClientHxButton → HxButton → HelixElement → LitElement → HTMLElement`).

## Actual

Every generated client starts on Track 2. Consumers who want to
customize hx-button end up:

1. Extending `HelixElement` (what the scaffold gave them).
2. Re-implementing the button template + styles from scratch.
3. Eventually realizing they could have just `extends HxButton {}`'d
   and overridden a single style block — but only after the project
   is too far along to refactor cleanly.

## Source

- create-helix-app: `src/scaffold.ts:8184-8193` (the BaseClass
  generation)
- create-helix-app: `src/templates.ts:250` (wc-storybook description
  mentions HelixElement)
- Vault: `Helix Priority Features for Immediate Release.md:F4`

## Root cause hypothesis

Track 2 is genuinely simpler to scaffold (no Hx* import, no need to
know the consumer's intent). The plumbing for Track 1 needs a
"choose your extension target" prompt and a per-target template.

## Suggested upstream fix

Two-pass:

1. **Helix side**: write `docs/extension-patterns.md` clarifying
   Track 1 vs Track 2 with concrete examples and the inheritance
   chain. Add a deprecation warning to any docs that recommend
   Track 2 as the default.

2. **create-helix-app side**: add a CLI prompt — "Are you (a)
   customizing an existing Helix component, or (b) building a new
   component using Helix primitives?" Branch the scaffold accordingly.

## Local workaround (if any)

Document the choice in scaffold READMEs today — explicitly call out
that Track 2 is the default and link to a manual Track-1 example. A
follow-up branch (`feature/track1-prompt`) can land the prompt + new
templates.

## Cross-references

- Related issues: (none direct)
- Related vault docs: Helix Priority Features for Immediate Release.md F4

## Status notes

- 2026-05-05: filed during D2-bis backfill. PRIORITY rank #8.
  Cross-cutting issue — scaffolder fix lands here, doc fix lands in
  helix repo.
