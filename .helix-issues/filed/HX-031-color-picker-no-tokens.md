---
id: HX-031
title: hx-color-picker has no component-tier tokens — gradient/swatch chrome unthemable
status: filed
category: token-gap
severity: medium
reported: 2026-05-05T23:30:00Z
helix_version: 3.3.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: []
---

# HX-031 — Color-picker chrome lacks themable tokens

## Summary

`hx-color-picker` ships with a `.styles.ts` but exposes no
component-tier tokens for its swatch grid, hue strip, opacity slider
track, or hex-input chrome. The Figma renderer falls back to
primitives + semantics for everything; brand consumers can't restyle
the picker chrome without editing Helix source.

## Reproduction

1. `cat /Volumes/Development/booked/helix/packages/hx-library/src/components/hx-color-picker/hx-color-picker.styles.ts`
   — search for `--hx-color-picker-*` exports. Confirm none exist.
2. `grep '"hx-color-picker"' /Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json`
   — confirm absent from the `component.*` block.
3. The figma-tokens renderer (`plugin/renderers/hx-color-picker.ts`)
   uses primitive/semantic intents only.

## Expected

Add component-tier tokens for the chrome elements:

- `--hx-color-picker-swatch-size`
- `--hx-color-picker-swatch-gap`
- `--hx-color-picker-swatch-border-radius`
- `--hx-color-picker-hue-track-height`
- `--hx-color-picker-opacity-track-height`
- `--hx-color-picker-hex-input-bg`
- `--hx-color-picker-hex-input-color`
- `--hx-color-picker-popover-bg`
- `--hx-color-picker-popover-border-color`

…plus document them in the `component.*` manifest (or the manifest
replacement from HX-013).

## Actual

Renderer uses semantic/primitive intents; no token namespace for the
picker chrome.

## Source

- Helix: `packages/hx-library/src/components/hx-color-picker/hx-color-picker.styles.ts`
- figma-tokens: `plugin/renderers/hx-color-picker.ts`

## Root cause hypothesis

Color-picker is a complex internal component with many sub-elements;
the per-sub-element token surface is large. Authoring it was deferred
in favor of shipping a working picker.

## Suggested upstream fix

Add the token surface listed above. Sequence as a follow-up to
HX-013 (which addresses the manifest format).

## Local workaround (if any)

`figma-tokens/plugin/renderers/hx-color-picker.ts` uses semantic +
primitive bindings. Picker chrome themes via global token overrides
only.

## Cross-references

- Related issues: HX-013 (manifest format)

## Status notes

- 2026-05-05: filed during D2-bis backfill.
