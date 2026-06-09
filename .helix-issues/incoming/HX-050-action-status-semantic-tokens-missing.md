---
id: HX-050
title: "`color/action/{success,info,warning}/bg` semantic tokens missing — accent rotator chrome can't bind to status semantics"
status: closed-false-positive
category: token-gap
severity: medium
reported: 2026-05-07T00:48:41Z
helix_version: 3.4.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-045, HX-049]
source_attribution: "Caught by figma-tokens MCP probe of Helix Web Component Starter Kit `_Docs` page (canvas `434:19224`). 5-up accent-rotator ComponentSets (_docs-stat-card, _docs-step-card, _docs-family-rollup) needed mode-aware binding for success/info/warning/danger accents; only primary + danger semantics exist upstream."
---

## Helix-team triage 2026-05-07

**Status: FALSE-POSITIVE-FOR-HELIX (wrong namespace).** Helix already publishes the tokens you need — they live under `color.surface.*-strong`, not `color.action.*`.

**Existing tokens that solve your case:**

```
color.surface.success-strong   ← exists, mode-flips (success-700 light / success-400 dark / HC override)
color.surface.info-strong      ← exists, mode-flips (primary-600 light / dark override / HC override)
color.surface.warning-strong   ← exists, mode-flips (warning-500 light / dark override / HC override)
color.surface.danger-strong    ← exists, mode-flips (error-600 light / dark override / HC override)
```

These are the `_strong` emphasis-surface family, paired with `text.on-{success,info,warning,error}-strong` for AA contrast. They are exactly the mode-aware semantic tier you described needing.

**Why your proposed binding under `color.action.*` is wrong:**

Helix's namespaces are intentionally split:
- `color.action.*` = **interactive button semantics** — CTAs, destructive actions, hover/active/focus states for things users CLICK
- `color.surface.*-strong` = **non-interactive emphasis surfaces** — high-prominence accent fills for toasts, alerts, banners, status chrome

Your 5-up accent rotators on `_docs-stat-card`, `_docs-step-card`, `_docs-family-rollup` are **non-interactive accent chrome**. That's surface-emphasis, not action. Adding success/info/warning to `color.action.*` would pollute the action namespace with non-action semantics and break the convention `success-strong`/`warning-strong`/`info-strong` already encodes.

**Workaround you can land today (1-line renderer fix):**

```diff
- color/success/500              // primitive — no mode flip, looks flat in dark/HC
+ color/surface/success-strong   // semantic — mode-aware, EXISTS in helix today
```

Same for info and warning. No helix change needed. Mode flip works across light/dark/HC as documented in `helix/packages/hx-tokens/src/tokens.json` (search for `success-strong`).

**If you genuinely need `bg-hover` / `bg-active` variants of these surfaces** that don't exist yet, that's a separate ask we'd consider on its own merits — but `bg` alone is solved.

**Closure:** when you swap the renderers to bind `surface.{success,info,warning}-strong`, this draft moves to `filed/HX-050.../resolved/` (or your equivalent). No helix-side work required.

---

# HX-050 — `color/action/{success,info,warning}/bg` semantic tokens missing

## Summary

Helix 3.4.1 publishes a partial `color/action/*/bg` semantic ramp:

| Semantic | Status |
|---|---|
| `color/action/primary/bg` | ✅ ships |
| `color/action/danger/bg` | ✅ ships |
| `color/action/secondary/{bg-hover, border, fg}` | ✅ ships |
| `color/action/ghost/{bg-hover, fg}` | ✅ ships |
| `color/action/success/bg` | ❌ **missing** |
| `color/action/info/bg` | ❌ **missing** |
| `color/action/warning/bg` | ❌ **missing** |

The plugin's 5-up accent rotators (`_docs-stat-card`, `_docs-step-card`, `_docs-family-rollup`) want a complete `primary / success / info / focus / danger` semantic accent set so chrome can flip cleanly across modes. Without success/info/warning semantics, the renderer falls back to primitive ramp shades (`color/success/500`, `color/info/500`, `color/warning/500`) — these are stable but flat (primitives don't have modes).

## Reproduction

1. `cd /Volumes/Development/booked/figma-tokens`
2. `grep -oE '"slashPath":\s*"color/action/[^"]*"' plugin/embedded-tokens.json | sort -u`
3. Confirm: only `primary`, `danger`, `secondary`, `ghost` namespaces under `color/action/`.
4. Inspect the `_docs-stat-card` accent stripes: success / info / danger fall back to literal hex (pre-fix) or primitive shade (post-fix). Only primary + focus get true semantic binding.

## Expected

Helix publishes `color/action/{success,info,warning}/bg` (and the matching hover/active variants if they fit the system) so chrome rotators can bind a complete semantic accent set:

```jsonc
"color/action/success/bg": {
  "$type": "color",
  "$value": {
    "default": { "$ref": "{primitives.color.success.500}" },
    "dark":    { "$ref": "{primitives.color.success.400}" },
    "hc":      { "$ref": "{primitives.color.success.700}" }
  }
}
```

Similar shape for `info/bg` and `warning/bg`. The naming aligns with the existing `primary/bg` and `danger/bg` published semantics — semantic-tier accent that flips per mode.

## Actual

Plugin renderers fall back to:
- **Pre-fix (today):** literal hex from when the renderer was first authored. Stale, no mode flip, doesn't reflect helix-tokens evolution.
- **Post-fix (HX-018 fix bundle):** primitive ramp shades (`color/success/500`, etc.). Stable, but no mode flip — primitives are mode-less by design.

Mode flip only kicks in for primary + focus + danger accents. Success/info/warning stay flat in dark mode and HC mode.

## Source

- helix-tokens authored: `/Volumes/Development/booked/helix/packages/hx-tokens/src/tokens.json` — `color.action.*` namespace
- figma-tokens consumer: `plugin/renderers/_docs-stat-card.ts`, `_docs-step-card.ts`, `_docs-family-rollup.ts` — accent stripe binding sites
- MCP probe: `wITXImaAPUCpBs2nRPv17k`, `_Docs` canvas `434:19224` — current state of all 13 `_docs-*` ComponentSets

## Root cause hypothesis

The action-namespace was authored around interactive button semantics (primary CTA + destructive danger action) where mode flip was clearly necessary. Status colors (success/info/warning) were treated as informational primitives and never lifted to semantics. As Helix's chrome surface area grows (stat cards, step cards, family rollups, modes preview cells, banners, alerts, callouts), the gap surfaces.

## Suggested upstream fix

Add three semantic tokens to `helix/packages/hx-tokens/src/tokens.json` under `color.action`:

```diff
   "action": {
     "primary": { "bg": { ... } },
     "danger":  { "bg": { ... } },
     "secondary": { ... },
     "ghost": { ... },
+    "success": {
+      "bg": {
+        "$type": "color",
+        "$value": {
+          "default": { "$ref": "{primitives.color.success.500}" },
+          "dark":    { "$ref": "{primitives.color.success.400}" },
+          "hc":      { "$ref": "{primitives.color.success.700}" }
+        }
+      }
+    },
+    "info":    { "bg": { /* similar */ } },
+    "warning": { "bg": { /* similar */ } }
   }
```

The exact mode-resolution shades are a design call — primary/danger's existing patterns are the template. Adjacent additions (`bg-hover`, `bg-active`) would round out the ramp and unlock badge/banner/alert chrome too, but `bg` alone unblocks the 5-up rotators.

## Local workaround

Renderers use primitive shade bindings:
- success → `color/success/500`
- info → `color/info/500`
- warning → `color/warning/500`
- danger → `color/action/danger/bg` (semantic, exists)
- primary → `color/action/primary/bg` (semantic, exists)
- focus → `color/focus/ring` (semantic, exists)

Stable across modes (primitives don't change), but lacks mode-flip. Acceptable until upstream fills the gap. Renderer change is a single-line bind swap when semantics land.

## Cross-references

- Related issues: HX-045 (`surface/subtle` missing — same shape: incomplete semantic ramp), HX-049 (semantic cross-aliases — exemption list still tracking 3 violations from this same authoring surface)
- Related vault docs: Charles' `_brainstorm` page — Pipeline diagram shows action surfaces as a tier; success/info/warning weren't called out specifically but are implied by the 5-up accent rotation pattern Phase A.2 shipped
- Related commits: figma-tokens HEAD will reference HX-050 in the accent-rotator binding fix (post-`ab7077c`)

## Status notes

- **2026-05-07**: drafted after MCP probe of `_Docs` page caught the gap. Renderer fix to use primitive ramps is in flight (figma-tokens fix bundle post-`ab7077c`). Severity medium — primitive-shade binding is a stable workaround; the gap mounts as more chrome surface area depends on full semantic accent rotation.
