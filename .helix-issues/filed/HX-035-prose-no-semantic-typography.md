---
id: HX-035
title: hx-prose lacks semantic typography tokens — long-form content cannot be themed
status: filed
category: token-gap
severity: medium
reported: 2026-05-05T23:50:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-035 — Prose component has no semantic typography tokens

## Summary

`hx-prose` is the long-form-content wrapper (renders rich-text:
paragraphs, headings, lists, blockquotes, inline code). Its
`.styles.ts` styles every descendant element directly with primitive
font tokens — there's no semantic intermediate like
`--hx-text-prose-body`, `--hx-text-prose-heading-1`, etc.

Brand consumers wanting to differentiate prose typography from
chrome typography (e.g. richer line-height, different font-family for
editorial content) have to override every primitive selector. The
Figma renderer can't bind a semantic typography style to "Prose Body"
because there's no token for it.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-prose/hx-prose.styles.ts`
2. Confirm direct primitive references throughout (no
   `--hx-text-prose-*` namespace).
3. The figma-tokens renderer
   (`plugin/renderers/hx-prose.ts`) uses primitive intents.

## Expected

Add a `--hx-text-prose-*` semantic namespace:

- `--hx-text-prose-body-font-family`
- `--hx-text-prose-body-font-size`
- `--hx-text-prose-body-line-height`
- `--hx-text-prose-heading-1-font-size`
- `--hx-text-prose-heading-2-font-size`
- (etc. through h6)
- `--hx-text-prose-blockquote-font-style`
- `--hx-text-prose-code-font-family`
- `--hx-text-prose-code-bg`

Each cascades through to existing primitives. Brand consumers override
the prose namespace without touching the broader chrome typography.

## Actual

Direct primitive references everywhere. No prose-specific theming
seam.

## Source

- Helix: `packages/hx-library/src/components/hx-prose/hx-prose.styles.ts`
- figma-tokens: `plugin/renderers/hx-prose.ts`

## Root cause hypothesis

Prose was added as a "render some HTML nicely" utility; the typography
hierarchy was inlined rather than tokenized.

## Suggested upstream fix

Refactor `hx-prose.styles.ts` to consume a `--hx-text-prose-*`
namespace; default cascades to existing primitives. Add the new
tokens to the `component.*` manifest (or HX-013's replacement).

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-prose.ts` emits primitive-bound
text styles. No prose-specific Figma styles in the Effect/Text styles
panel.

## Cross-references

- Related issues: (none direct)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
