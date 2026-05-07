---
id: HX-049
title: "Semantic cross-alias violations: body/bg, body/color, divider/color chain to other semantics"
status: deferred-design-decision
category: token-gap
severity: medium
reported: 2026-05-06T23:59:51Z
helix_version: 3.4.1
upstream_or_workaround: upstream
discovered_in: figma-tokens
related: [HX-045]
source_attribution: "Caught by figma-tokens semantics-no-cross-alias validator (commit a64fd90 in feature/s3.1-dtcg-default). Rule authored by Charles Attisano (_brainstorm canvas 329:1199): 'Semantics should avoid linking directly to other Semantic values. Semantics handle how things change between different modes.'"
---

## Helix-team triage 2026-05-07

**Status: NEEDS DESIGN DECISION (rule authority not established).** The "no semantic-to-semantic chains" rule is an external recommendation, not a Helix-published design principle. Before we land mechanical token edits, we need to establish whether Helix actually adopts this rule.

**The chain in question is intentional, not accidental.**

`body.bg → color.surface.default` is a **deliberate semantic indirection** that lets downstream theming overlay surface tokens once and propagate across body, cards, modals, etc. Drop the chain (force `body.bg` to alias a primitive directly) and consumers lose that propagation: theme override at the surface tier no longer reaches body. The same applies to `body.color → text.primary` and `divider.color → border.default`. These are the indirections that make our brand-layer overrides work.

**The DTCG `kind: 'alias-semantic'` discriminator** that your validator keys on is exactly that — a discriminator, evidence the embed pipeline knew it was emitting chains and tagged them so consumers could discriminate. It's not a smoking gun proving the chains are unintentional.

**The "fragility under mode flips" claim is speculative.** Helix's chained semantics have mode-flipped correctly for the entire 3.x line. We have no observed regression caused by indirection. If a future mode-axis (e.g. responsive density) breaks one of these chains, the right response is to fix that specific chain, not to flatten the whole semantic layer.

**Workaround for figma-tokens (until / unless we adopt the rule):** keep the `KNOWN_EXEMPTIONS` list in `figma-tokens/scripts/test-semantics-no-cross-alias.ts`. Document the indirection contract on the figgy side: "these specific semantics intentionally chain because Helix uses them as theming hand-off points." The stale-exemption check is a fine guardrail; it'll surface if Helix ever does flatten one of them.

**If Helix ever decides to adopt a flattening rule** (e.g. for downstream consumer interop), it would need to be a deliberate design conversation: which indirections do we keep (theming hand-offs) vs. which do we flatten (pure aliases)? Today that conversation hasn't happened.

**Decision pending:** queueing this for a Helix-team design discussion. No mechanical fix landing in `tokens.json`. The validator's exemption list stays.

---

# HX-049 — Semantic cross-alias violations: body/bg, body/color, divider/color chain to other semantics

## Summary

helix-tokens authored source ships **3 semantic tokens that alias other semantic tokens** instead of dropping to primitives. This violates the design-side rule Charles documented in his `_brainstorm` page. The figma-tokens consumer-side validator (HX-047 implementation) catches them at import; we've added a temporary exemption list with a stale-detection guard so the build stays green while waiting for upstream cleanup.

The DTCG embed pipeline in figma-tokens already TAGGED these as `kind: 'alias-semantic'` (vs normal `kind: 'alias'` which points into primitives) — so the upstream embed step explicitly knew it was emitting cross-aliases. The discriminator suggests this was a recognized labor-saving shortcut, not an unintentional bug, but it still violates the rule Charles wrote.

## Reproduction

1. `cd /Volumes/Development/booked/figma-tokens`
2. `cat plugin/embedded-tokens.json | jq '.semantics.body, .semantics.divider'`
3. Inspect `body/bg`, `body/color`, `divider/color` — confirm each has `light` / `dark` / `high-contrast` mode resolutions whose `kind` is `'alias-semantic'` (not `'alias'`) and whose target path begins with `color/...` (a semantic), not `primitives/...`.
4. `npm run plugin:test:semantics-no-cross-alias` — confirm validator caught all 7 violations (3 tokens × varying modes) before exemption list landed.

## The 3 violating semantics + their alias targets

| Semantic | Modes | Cross-alias target |
|---|---|---|
| `body/bg` | light, dark | `color/surface/default` |
| `body/color` | light, dark | `color/text/primary` |
| `divider/color` | light, dark, high-contrast | `color/border/default` |

Each target IS itself a semantic. Each target's `light` mode aliases a primitive (`color/neutral/0`, `color/neutral/900`, `color/neutral/200`) — so the chain is `body.bg.light → color.surface.default.light → primitives.color.neutral.0`. That's two hops where Charles' rule allows one.

Note: `divider/color`'s high-contrast mode already has a literal rgb fallback (no chained alias) — suggesting that mode was hand-authored carefully while light/dark inherited the labor-saving shortcut. The pattern is fixable.

## Expected (upstream fix)

Each of the 3 semantics should resolve directly to primitives in every mode:

```json
// CURRENT (violates rule)
"body": {
  "bg": {
    "$type": "color",
    "$value": {
      "light": { "$ref": "{color.surface.default}" },   // ← cross-alias
      "dark":  { "$ref": "{color.surface.default}" }    // ← cross-alias
    }
  }
}

// EXPECTED (resolves to primitives)
"body": {
  "bg": {
    "$type": "color",
    "$value": {
      "light": { "$ref": "{primitives.color.neutral.0}" },
      "dark":  { "$ref": "{primitives.color.neutral.900}" }
    }
  }
}
```

The replacement primitive is whatever the chained semantic resolves to in each mode. Mechanical lift — no design judgment needed beyond confirming the resolved primitive matches what the chain currently produces.

## Actual

Upstream `helix/packages/hx-tokens/src/tokens.json` (or whatever the canonical source path is) carries the 3 semantics with `alias-semantic` kind discriminators. The figma-tokens DTCG round-trip preserves them. Components consuming `body/bg`, `body/color`, `divider/color` get correct values today only because the chain happens to resolve cleanly — but Charles' rule exists because chained aliases are FRAGILE under mode flips: when `color/surface/default` adds a new mode, `body/bg` may pick up stale resolution unless the chain is hand-audited.

## Source

- Charles' Flag note (the rule): `wITXImaAPUCpBs2nRPv17k`, `_brainstorm` canvas `329:1199`, Notes instance `379:2413` — "Semantics should avoid linking directly to other Semantic values."
- Validator that caught the violations: `figma-tokens/scripts/test-semantics-no-cross-alias.ts` (commit `a64fd90`)
- Embedded data showing violations: `figma-tokens/plugin/embedded-tokens.json` (current at HEAD `a64fd90+`)
- Upstream source needing fix: `helix/packages/hx-tokens/src/tokens.json` (or canonical path)

## Root cause hypothesis

Labor-saving shortcut during the semantic ramp authoring: `body/bg` and `body/color` are very-high-frequency tokens (every page background, every body text fill); aliasing them once to `color/surface/default` and `color/text/primary` was less work than authoring per-mode primitive aliases. Same for `divider/color`. The DTCG pipeline added `kind: 'alias-semantic'` discriminator to track which aliases were chains — implying the team knew this was different but didn't gate against it.

## Suggested upstream fix

Mechanical replacement in helix-tokens source, ~3 token paths × 2-3 modes each = 7 line edits. Example diff:

```diff
   "body": {
     "bg": {
       "$type": "color",
       "$value": {
-        "light": { "$ref": "{color.surface.default.light}", "kind": "alias-semantic" },
-        "dark":  { "$ref": "{color.surface.default.dark}",  "kind": "alias-semantic" }
+        "light": { "$ref": "{primitives.color.neutral.0}",   "kind": "alias" },
+        "dark":  { "$ref": "{primitives.color.neutral.900}", "kind": "alias" }
       }
     }
   }
```

Once upstream lands the fix and helix-tokens re-publishes:
1. figma-tokens runs `npm run embed:tokens` to pull the new tokens.json
2. `plugin/embedded-tokens.json` regenerates without the cross-aliases
3. The exemption list in `figma-tokens/scripts/test-semantics-no-cross-alias.ts` becomes STALE — the validator's stale-exemption check FAILS the build
4. We remove the exemptions; build green; rule is now actually enforced

## Local workaround

Validator at `figma-tokens/scripts/test-semantics-no-cross-alias.ts` carries an explicit `KNOWN_EXEMPTIONS` set listing the 3 violating paths, each tagged with `// HX-049` reference. Validator skips the exempted paths but logs them as `⚠ EXEMPT: awaiting upstream fix`. NEW violations still fail the build. Stale-exemption check ensures we can't forget to remove entries.

## Cross-references

- Related issues: HX-045 (surface/subtle missing — same source-of-truth file needs additions), HX-014 (forced-colors mode-axis expansion), HX-009 (shadow primitives missing — same authored-source gaps)
- Related vault docs: Charles' brainstorm `_brainstorm` page; Flag note 2 verbatim
- Related commits: figma-tokens `a64fd90` (validator caught violations), exemption-list commit (next)
- Memory: `feedback_consumer_boundary_validation.md` — the framing rule that distinguishes consumer-side validators (ours) from upstream data fixes (helix's). HX-046 and HX-047 were validators (ours). HX-049 is the actual data violation (theirs).

## Status notes

- **2026-05-06**: drafted after consumer-side validator caught real upstream violations. Build briefly failed; exemption list landed to unblock. Awaiting upstream fix in helix-tokens source. Severity medium — current resolution chain happens to work; risk is fragility under future mode-axis changes (e.g. when responsive mode lands per HX-048-equivalent).
