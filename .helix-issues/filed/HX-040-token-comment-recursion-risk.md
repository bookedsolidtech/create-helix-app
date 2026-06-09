---
id: HX-040
title: tokens.json `_comment` annotations on group nodes cause memory blowup in naive consumers
status: filed
category: build-release
severity: medium
reported: 2026-05-06T00:15:00Z
helix_version: 3.3.1
upstream_or_workaround: both
discovered_in: figma-tokens
related: [HX-013]
---

# HX-040 — `_comment` strings on group nodes break naive DTCG flatteners

## Summary

Helix 3.2.x added `_comment` (and `description`) string fields on
group nodes inside `tokens.json` to anchor long-form rationale on
sections like `color.action`, `color.surface`, etc. These strings live
at the same nesting level as actual leaf nodes.

Naive DTCG flatteners that recurse via `Object.keys(node)` and don't
type-check the leaf shape end up iterating into the comment string's
character indices (since `Object.keys("hello")` returns `["0", "1",
"2", "3", "4"]`). The recursion explodes into a per-character flatten
pass; for any non-trivial comment this bumps memory usage by orders of
magnitude or hits the recursion-depth limit.

The figma-tokens plugin caught this with an explicit `SKIP_KEYS` set
in `scripts/embed-tokens.ts:144` and a primitive-type guard at line
155.

## Reproduction

1. `cd /Volumes/Development/booked/helix`.
2. `grep -nE '"_comment"|"description"' packages/hx-tokens/src/tokens.json | head -20`
   — confirm `_comment` strings are present on group nodes.
3. Run a naive DTCG flattener (Style Dictionary's default config
   without an explicit value-type filter) — observe either a
   recursion-depth error or memory ballooning.

## Expected

Either:

- **Stop using string-valued annotations on group nodes.** Move
  `_comment` to a sibling `<group>.meta.json` file or to per-token
  `description` fields (which DTCG spec already supports as a leaf
  field, not a group field).

- **Document the annotation contract.** A `tokens-format.md` in
  `packages/hx-tokens/` explicitly listing `_comment` and
  `description` as group-level annotations to be skipped by
  consumers. Provide a reference flatten implementation.

## Actual

Annotations are present but undocumented as a non-standard group
extension. Each consumer rediscovers the recursion pitfall.

## Source

- Helix: `packages/hx-tokens/src/tokens.json` — `_comment` strings
  on group nodes (e.g. line 886 on the `component.*` block).
- figma-tokens workaround: `scripts/embed-tokens.ts:139-156`
  (`SKIP_KEYS` set + non-object guard).

## Root cause hypothesis

`_comment` was added as a code-comment-equivalent for token authors
(JSON has no comments). The implementation is correct for human
readers but breaks tooling that doesn't know to skip the keys.

## Suggested upstream fix

Preferred: add a `packages/hx-tokens/src/tokens-format.md` describing
the annotation contract:

> The following keys, when present at any group level, are
> annotations and MUST be skipped by token-flattening consumers:
> `_comment`, `description`. Future annotations will use the `_`
> prefix as a convention.

…and provide a reference flatten implementation in
`packages/hx-tokens/src/utils.ts` that consumers can import instead
of writing their own.

Stretch: replace `_comment` with a sibling `tokens.meta.json` file
that mirrors the structure and holds annotations only. Cleaner
separation; consumers ignore the meta file unless they want to read
docs.

## Local workaround (if any)

`figma-tokens/scripts/embed-tokens.ts` filters via `SKIP_KEYS` set
(line 144) and non-object guard (line 155). Ships in every
embed-tokens build.

## Cross-references

- Related issues: HX-013 (component-tier null manifest — same family
  of "tokens.json shape gotcha")

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place;
  documentation fix is small and high-value.
