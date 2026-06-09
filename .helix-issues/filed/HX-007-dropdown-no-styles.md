---
id: HX-XXX
title: hx-dropdown has no .styles.ts and no own component-tier tokens
status: draft
category: token-gap
severity: medium
reported: 2026-05-05T18:00:04Z
helix_version: 3.3.1
upstream_or_workaround: workaround
discovered_in: figma-tokens
related: []
---

# HX-XXX — hx-dropdown has no .styles.ts and no own component-tier tokens

## Summary

`hx-dropdown` ships without a dedicated `.styles.ts` and exposes no
component-tier custom properties. The Figma renderer falls back to a
semantic-only cascade for both the trigger button and the menu panel.

## Reproduction

1. Search Helix repo for `hx-dropdown.styles.ts` — file does not exist.
2. Inspect `embedded-components.json` (figma-tokens) — `hx-dropdown`
   has zero component-tier tokens.

## Expected

Either:
- Document explicitly that `hx-dropdown` is a tokenless wrapper that
  composes `<hx-button>` + `<hx-menu>`, OR
- Expose `--hx-dropdown-bg` and `--hx-dropdown-border-color` so designers
  can theme the panel chrome independently from `<hx-menu>`.

## Actual

The Figma renderer uses semantic-only intent:
- trigger bg → `color/surface/default`
- trigger border → `color/border/default`
- trigger text + caret → `color/text/primary`
- panel bg → `color/surface/raised`
- panel border → `color/border/default`
- item text → `color/text/primary`

## Source

Helix: missing file `hx-dropdown.styles.ts`
figma-tokens: `plugin/renderers/hx-dropdown.ts` (this commit)

## Root cause hypothesis

`hx-dropdown` is a composition of `<hx-button>` (trigger) + `<hx-menu>`
(panel) and inherits each child's tokens. Probably intentional.

## Suggested upstream fix

Document the composition pattern in `hx-dropdown/README.md`. If
themable panel chrome is wanted, add `--hx-dropdown-{bg,border-color}`.

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-dropdown.ts` registers semantic-only
intent. Trigger uses surface/default; panel uses surface/raised.

## Cross-references

- Related issues: hx-overflow-menu, hx-menu (composition family)
- Related vault docs: Layout Rules — Renderer & Component Authoring Contract
- Related commits: (filled in commit message)

## Status notes

- 2026-05-05: filed during Phase A·1 Cat 2 renderer sweep. Workaround in
  place; composition wrapper — possibly intentional.
