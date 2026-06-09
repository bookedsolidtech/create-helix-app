---
id: HX-013
title: tokens.json `component.*` tier declares 800+ tokens with `value: null` — naive consumers crash
status: filed
category: token-gap
severity: critical
reported: 2026-05-05T22:00:00Z
helix_version: 3.3.1
upstream_or_workaround: both
discovered_in: figma-tokens
related: [HX-014, HX-040]
---

# HX-013 — tokens.json component-tier null declarations crash naive consumers

## Summary

`packages/hx-tokens/src/tokens.json` carries a `component.*` block that
declares ~830 component-tier custom-property names paired with `"value":
null`. The block is intended as a *manifest* of overridable component
tokens (per the `_comment` field on line 886) but is shaped identically
to a real token leaf, so any consumer that flattens DTCG-style trees by
walking `value` keys silently emits broken bindings or — worse — crashes
when it tries to convert `null` to a paint / float.

The Figma plugin tripped this in the renderer-correctness sweep: 38 of
83 ComponentSets were silently failing to build because the
component-tier resolver received `null` instead of either a hex string
or a `var(...)` ref, and the resolver throws.

## Reproduction

1. `cd /Volumes/Development/booked/helix && grep -c 'null' packages/hx-tokens/src/tokens.json` → 831 lines.
2. `grep -n '": null' packages/hx-tokens/src/tokens.json | head -10` → all
   inside the `component.*` block (line 887+).
3. Naive DTCG flattener (anything matching the spec literally) treats
   `{ "value": null }` as a leaf and emits a broken token binding.
4. The figma-tokens plugin had to add a primitive-type filter in
   `scripts/embed-tokens.ts:136` (`isLeaf` rejects non-string/number/bool
   values) to avoid the cascade crash.

## Expected

Either:
- **Drop the block entirely.** Component-tier overridables belong in
  per-component `<tag>.styles.ts` JSDoc + a generated CEM, not in the
  primitive token tree.
- **Move to a sibling file.** `tokens.manifest.json` (or a JSON-Schema
  manifest) preserves the audit value without polluting the
  consumer-facing token export.
- **Use a sentinel `value` shape** that's unambiguously not a leaf —
  e.g. `{ "$manifest": true }` instead of `{ "value": null }`. DTCG
  consumers ignore unknown top-level keys but throw on null leaves.

## Actual

The plugin filters `null` leaves out at flatten-time, but every
downstream tool (Style Dictionary configs, designer-import scripts, the
internal `embedded-tokens.ts` build) has to learn this trick or break.
The `_comment` on line 886 documents intent but is not enforceable by a
JSON schema.

## Source

- Helix: `packages/hx-tokens/src/tokens.json:885-` (start of `component`
  block); ~830 `null`-valued lines through end of file.
- figma-tokens workaround: `scripts/embed-tokens.ts:131-137`
  (`isLeaf` filter).

## Root cause hypothesis

The `component.*` manifest was added to give the Figma kit + audit
tooling a single-source-of-truth for "what tokens does each component
expose?" That intent is correct; the *shape* (re-using the DTCG `value`
key with `null`) makes the manifest indistinguishable from a real
token at the schema layer.

## Suggested upstream fix

Two options, in order of preference:

1. **Promote the manifest to a separate file**
   `packages/hx-tokens/src/component-tokens.manifest.json` with shape
   `{ "<tag>": { "<custom-prop-name>": { "default": null,
   "description": "..." } } }`. Update consumers (Figma kit,
   `component-manifest-sync.test.ts`) to read the new file. Drop the
   `component.*` block from `tokens.json`.

2. **Sentinel-key the manifest entries** — replace
   `"--hx-foo": null` with `"--hx-foo": { "$manifest": true }`. Schema
   validators (Style Dictionary, `dtcg-validator`) accept arbitrary
   top-level keys but reject literal `null` leaves. One-line change in
   `component-manifest-sync.test.ts`.

## Local workaround (if any)

`figma-tokens/scripts/embed-tokens.ts:131-137` filters `null` leaves
in `isLeaf()` so the embedded-tokens build doesn't emit broken
bindings. Renderers continue to pass `null` checks at
`plugin/lib/bindings.ts:73` (the `bumpStats('missing')` path) and the
verifier reports the gap as "no component-tier tokens defined" rather
than crashing.

## Cross-references

- Related issues: HX-014 (forced-colors gap — also a tokens-side issue),
  HX-040 (`_comment` recursion safety)
- Related vault docs: 4-20 Audit Findings → C1 (manifest shape)
- Related commits: figma-tokens@HEAD `embed-tokens.ts` null-filter

## Status notes

- 2026-05-05: filed during D2-bis backfill. Workaround in place; the
  upstream cleanup is small but blocks any new tooling that processes
  `tokens.json` without reading the embed-tokens.ts trick.
