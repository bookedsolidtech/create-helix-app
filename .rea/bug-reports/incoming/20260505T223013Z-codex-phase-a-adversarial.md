---
title: "Phase A renderer correctness — adversarial review"
type: review
scope: figma-tokens
created: 2026-05-05
reporter: codex-adversarial-reviewer (gpt-5.4 envelope)
---

# Phase A — adversarial review of renderer correctness sweep

Scope: 86 Phase-A renderers + 5 foundation helpers (`auto-layout.ts`,
`bindings.ts`, `instances.ts`, `verify.ts`, `variants.ts`) plus the
`code.ts` component-tier variable creation. Read-only review against the
Layout Rules contract (2026-05-05).

## Summary

15 findings. **3 HARD-FAIL** (one of them is the actual root cause of
tonight's crash, not the symptom that was fixed); **6 WARN**; **6 advisory**.

The cascade fix shipped tonight (commit 83133a0) is correct but defensive:
it filters cascade output by `expectedType: 'COLOR'`, which prevents the
crash. It does **not** address the underlying defect — the embed pipeline
intentionally creates every component-tier variable as `STRING`, including
the ~600 that are obviously colors. Result: ~600 component-tier color
tokens silently fail to bind on every renderer pass, the cascade falls
through to semantic, and the verify pass reports "x% component-tier
coverage" using denominators that bake in the failure.

---

## Findings

### 1. HARD-FAIL — embed-pipeline discards inferred type, materializes all component tokens as STRING

- **File:** `figma-tokens/plugin/code.ts:1517-1532`
- **Severity:** HARD-FAIL
- **Description:**
  Lines 1517-1527 compute `looksColor` / `looksFloat` / `inferredType`
  for every component-tier variable based on cssVar name heuristics
  (`/(bg|color|border|fill|stroke|...)\b/`). Line 1529 immediately
  discards the result with `void inferredType`. Line 1530 then upserts
  every component variable with literal `'STRING'`.

  Tonight's cascade fix masks the symptom (the crash) but the defect is
  here. Of the 831 component-tier tokens, ~600 are obviously COLOR by
  cssVar name and ~150 are obviously FLOAT (`-radius`, `-padding`,
  `-spacing`, `-size`, `-width`, `-height`). Today every one of them is
  STRING. Every `bindFill` that lists a color-typed component intent
  in its cascade fails the `typeMatches` check and silently falls
  through to semantic — meaning the `-bg`, `-color`, `-border-color`,
  `-icon-color` component tokens that ALL the new Phase A renderers
  cite as the first cascade tier never resolve. The verify
  `rule-7-token-tier` check reports component-tier coverage that's
  artificially capped at the few tokens that DO happen to be STRING-
  typed in Helix CSS (rare).

- **Suggested fix:**
  ```ts
  await upsertVariable(components, t.displayPath, inferredType, {
    legacyName: t.slashPath,
  });
  ```
  Then drop the `void inferredType`. This will cause any existing
  STRING-typed component variables in users' files to be flagged for
  type-mismatch by `upsertVariable`'s type guard (code.ts:1220, 1238) —
  which is the right outcome and forces a clean re-creation.

---

### 2. HARD-FAIL — verify pass `bindings-collection` is performative; doesn't catch tonight's crash class

- **File:** `figma-tokens/plugin/lib/verify.ts:443-452`
- **Severity:** HARD-FAIL
- **Description:**
  The check inspects `unknownVars` — bindings that reference variables
  outside Helix Primitives/Semantics/Components. It catches off-library
  bindings. It does NOT catch type-mismatched bindings inside Helix
  Components. Tonight's crash class — `setBoundVariableForPaint` against
  a STRING-typed component variable — would be allowed by this check
  because the variable IS in Helix Components. The check classifies
  WHERE the binding lives, not WHETHER the binding succeeded.

  Adjacent gap: `rule-7-token-tier` (lines 461-493) computes its
  coverage ratio from `tierComponent / bound`. When the cascade silently
  falls through to semantic because the component-tier var is the wrong
  type, `tierComponent` doesn't increment but `tierSemantic` does, so
  `bound` stays the same. The ratio looks legitimate but is masking
  bypass. Today this would let the embed-pipeline regression of
  finding #1 ship with a green verify pass.

- **Suggested fix:**
  Add a `bindings-execution` check that walks every component-tier
  Figma variable, calls `setBoundVariableForPaint(base, 'color', v)` on
  a throwaway base inside a try/catch, and counts failures. Anything
  > 0 is a hard fail with the variable name. This is the actual
  execution check the cascade fix is reactive to. Costs a single
  in-memory dry run on a temp Paint object — no node creation needed.

---

### 3. HARD-FAIL — Rule 13 violation: `Brand`, `Close`, `Panel`, `Icon`, `Label` slot names break the convention

- **Files:**
  - `figma-tokens/plugin/renderers/hx-top-nav.ts:285` (`Brand`)
  - `figma-tokens/plugin/renderers/hx-drawer.ts:352`, `hx-alert.ts:304`,
    `hx-banner.ts:249` (`Close`)
  - `figma-tokens/plugin/renderers/hx-tabs.ts:293` (`Panel`)
  - `figma-tokens/plugin/renderers/hx-alert.ts:280` (`Icon`)
  - `figma-tokens/plugin/renderers/hx-progress-bar.ts:213`,
    `hx-progress-ring.ts:183` (`Label`)
- **Severity:** HARD-FAIL (per the rule's own ratification text:
  "Rejected alternatives: `primaryAction` — semantic translation
  per-component doesn't scale across 35 compounds; loses the positional
  contract")
- **Description:**
  Rule 13 ratifies `Action 1` → `action1` as the canonical pattern,
  citing the positional contract. The above slot names are semantic
  translations: `Brand`, `Close`, `Panel`, `Icon`, `Label`. Each
  introduces the exact failure mode the rule was written to prevent:
  the React/Lit prop name has no positional grounding (what does
  `brand` mean in code generation? `closeAction`? `iconLeading`?), and
  the convention now needs an exception map per compound.
  
  The current 9 violations are spread across 7 renderers. By the time
  Phase D (Code Connect) lands, that exception map will need 9+
  hand-coded translations — exactly the per-compound semantic mapping
  the rule was ratified to prevent.

- **Suggested fix:**
  Rename to positional: `Brand` → `Brand 1` (or accept it as the canonical
  exception by amending Rule 13 to allow it for known-singleton chrome
  slots — but document explicitly). Same for `Close` → `Action 2` /
  `Action Close` decision, `Icon` → `Icon 1`, `Label` → `Label 1`,
  `Panel` → `Panel 1`. Either way, file BUG against Rule 13 to either
  add the exception list or hold the line.

---

### 4. WARN — `bindNumberProperty` exists but is never called from any renderer

- **File:** `figma-tokens/plugin/lib/bindings.ts:206-228`; consumers: 0
- **Severity:** WARN
- **Description:**
  Helper to bind FLOAT-typed component variables to node properties
  like `cornerRadius`, `paddingLeft`, `itemSpacing`, `strokeWeight`.
  No renderer in `plugin/renderers/` calls it. Every Phase A renderer
  hardcodes its `cornerRadius`, padding, spacing as literal numbers
  (e.g. hx-progress-bar's `h / 2`, hx-button's `BUTTON_RADIUS = 6`,
  hx-card's `CARD_RADIUS = 10`).
  
  Same gap as finding #1 in spirit: the cascade infrastructure exists,
  the renderer side never adopts it. Designers can't override
  `--hx-button-border-radius` because no node references it. Helix
  CSS has dozens of `*-radius`, `*-padding-*`, `*-spacing-*`
  component tokens that materialize as nothing in Figma.

- **Suggested fix:**
  Phase A·2 sweep: replace the literal `cornerRadius = N` and explicit
  padding numbers with `bindNumberProperty(node, 'cornerRadius', { component: componentTokenName(tag, 'border-radius'), primitive: 'space/1' }, ctx, tag)`
  for each renderer. Will fail today (per finding #1) until component
  variables get correct FLOAT typing.

---

### 5. WARN — verify cascade-coverage gate is fixed at 80%; magic-number with no calibration

- **File:** `figma-tokens/plugin/lib/verify.ts:454-493`
- **Severity:** WARN
- **Description:**
  The gate `coverage >= 0.8` is a guess. With finding #1 unresolved,
  almost every renderer fails the 80% gate (because component-tier
  bindings drop to ~0%). With finding #1 fixed, the right gate may be
  95% (since renderers with valid component tokens should hit them
  ~always) or 60% (because semantic-only fallback is a legitimate
  per-property choice in Helix CSS — Rule 7 explicitly allows it). The
  doc says "if the cascade's first hit is the right tier ... the first
  hit wins" — meaning a renderer that legitimately uses
  `{semantic: 'color/border/subtle'}` for a property where Helix has
  no component-tier var is COMPLIANT, but its bound count drags the
  ratio.
  
  The denominator (`bound`) includes EVERY bound paint, including the
  kit-frame chrome (surface + label-color) added by `createKitFrame`.
  Those are semantic-only by design and dilute every ratio.

- **Suggested fix:**
  Two changes: (a) compute coverage on `tierComponent + tierSemantic + tierPrimitive` from the COMPONENT_SET descendants only,
  excluding kit chrome paints (recompute from `componentSet` not the
  full kit frame); (b) derive the gate per-tag from
  `EMBEDDED_COMPONENT_TOKENS` — a tag with 12 component-tier tokens
  defined and 12 cited in the renderer's intents should hit ≥95%; a
  tag with 2 defined tokens should not be expected to hit 80% of total
  bindings (where the cascade legitimately falls through to semantics).
  Threshold = `definedComponentTokens / citedComponentIntents` is more
  honest.

---

### 6. WARN — Overlap Exception scope creep in hx-data-table (`checkCell.layoutMode = 'NONE'` flips a sibling, then resizes)

- **File:** `figma-tokens/plugin/renderers/hx-data-table.ts:367-390`
- **Severity:** WARN
- **Description:**
  Comment at line 365-371 acknowledges the awkwardness: "Simplest:
  nest checkbox inside its own frame and overlay glyph via second
  sibling with matching size + smaller. Since auto-layout doesn't
  overlap, swap to a non-auto inner frame for the checkbox." Then
  line 371 sets `checkCell.layoutMode = 'NONE'` AND line 384 calls
  `checkCell.resize(CHECK_W, ROW_H)` — exactly the "fixed-bounding-box
  wrapper" Rule 1 calls a "sticker" not a component.
  
  The cleaner fix is `figma.createFrame()` for the checkmark wrapper
  with `layoutPositioning = 'ABSOLUTE'` (Figma 2024 API), or stack
  the checkmark INSIDE the cbx rectangle as text with `WIDTH_AND_HEIGHT`.
  Today's path: every selectable+row variant flips its checkCell out of
  auto-layout, breaking the row's CENTER alignment for the column
  width (line 388 explicitly skips `fillCounterAxis` on the NONE
  branch — meaning the cell stops following ROW_H sizing if the row
  ever resizes).
  
  Per Rule 1: "Each instance of this pattern should be filed as a
  candidate for future replacement when Figma adds absolute-positioning-
  inside-auto-layout (the layoutPositioning = 'ABSOLUTE' API,
  available since 2024 — see if it can replace the NONE inner stage
  cleanly)." That escape hatch is already available — use it.

- **Suggested fix:**
  Replace the NONE-cell pattern with a single auto-layout cell
  containing cbx as background + cb-glyph as `layoutPositioning =
  'ABSOLUTE'` overlay. File a separate audit issue against the other
  Overlap Exception inner stages (counted: 33 across renderers; each
  one is a future-ABSOLUTE candidate per the Layout Rules doc).

---

### 7. WARN — `panel-color-marker` zero-pixel ghost rectangle is a verify hack, not a renderer asset

- **File:** `figma-tokens/plugin/renderers/hx-tabs.ts:213-220`
- **Severity:** WARN
- **Description:**
  Lines 213-220 create a 0.01×0.01 zero-opacity rectangle named
  `panel-color-marker`, append it to the stage, and bind its fill
  solely to register the `--hx-tabs-panel-color` cascade with the
  binding stats. That's instrumenting the renderer to satisfy the
  verify pass. The renderer doesn't actually USE that token visually
  (the stage doesn't have a panel — the panel is a separate child
  later). It's a dead binding that exists to turn a verify yellow into
  a verify green.
  
  This is the inverse of finding #2: the verify check is so coarse
  that it accepts dead bindings as "coverage." If 4 renderers do this,
  the cumulative effect is that "x% of tags use --hx-tabs-panel-color"
  is true while no rendered visual references it.

- **Suggested fix:**
  Drop the marker. Either bind the panel slot's static fallback to
  the panel-color (when the slot resolves to a real instance, the
  instance carries its own bindings; when it falls back, the static
  panel placeholder uses the right color), OR don't claim coverage
  for `panel-color`. The cascade-coverage logic shouldn't reward
  dead bindings.

---

### 8. WARN — `componentTokenName` audit comment in lib/bindings.ts:97-104 is incorrect

- **File:** `figma-tokens/plugin/lib/bindings.ts:96-104` (the
  S0.8 audit comment) vs. reality
- **Severity:** WARN
- **Description:**
  The comment claims the `--` prefix is constructed in EXACTLY ONE
  place: `componentTokenName`. Verified across the codebase — that's
  true for the renderer side. But `embed-components.ts:103-110` reads
  `--`-prefixed cssVar names verbatim from `tokens.json` and emits
  `slashPath = componentName + '/' + cssVar` (which already contains
  `--`). So `componentTokenName` doesn't construct the `--` — it just
  re-quotes the cssVar that the embed pipeline already wrote with `--`.
  
  Correct statement: the `--` prefix originates in Helix's
  `tokens.json` source. Both the embed pipeline AND
  `componentTokenName` simply preserve it. There are TWO places that
  flow the prefix through, and three places that have it baked in
  (Helix tokens.json source; embed-components.ts:106; componentTokenName).
  
  This isn't a code defect — but it is an audit-comment lie that hides
  where the truth is. If we ever drop the `--` for designer-facing
  publishing, all three places need to change.

- **Suggested fix:**
  Update the comment to: "The `--` prefix originates in Helix's
  tokens.json. The embed pipeline preserves it (embed-components.ts:106).
  This helper preserves it on the renderer side. Three coordination
  points; do not change one without the others."

---

### 9. WARN — `hx-stack` schematic uses `resizeWithoutConstraints` after `createAutoLayoutComponent({primarySizing: 'FIXED'})` — Rule 2 conflict

- **File:** `figma-tokens/plugin/renderers/hx-stack.ts:131-133`
- **Severity:** WARN
- **Description:**
  `createAutoLayoutComponent` is the rule-1 enforcement factory. Calling
  it with `primarySizing: 'FIXED'` then immediately
  `c.resizeWithoutConstraints(FRAME_W, FRAME_H)` is a sanctioned-by-
  comment exception ("Fixed canvas so designers see the alignment
  effect") but Rule 2 says fixed sizing requires "documented
  justification."
  
  The note in the renderer return (line 281-283) calls out the cut
  was "custom: direction × align × justify"; the resize is mentioned
  as schematic. That's the docstring. Rule 2 says the comment should
  be at the resize call site. Today the renderer is the only one in
  the codebase that uses both FIXED sizing AND resizeWithoutConstraints
  on a `createAutoLayoutComponent` result.

- **Suggested fix:**
  Add a `// Rule 2 exception: fixed schematic canvas to demo the
  align/justify props; not designer-overridable in production.`
  comment at line 133. Or use a sized FrameNode wrapper so the
  ComponentNode itself stays HUG and the outer Frame is the Rule 2
  exception.

---

### 10. WARN — NOISE_FILTERS missing `hx-tab-panel`, `hx-list-item` (interactive only narrowed by hx-list-item, not hx-tab-panel hidden axis)

- **File:** `figma-tokens/plugin/lib/variants.ts:187-333`
- **Severity:** WARN  
- **Description:**
  Audited the CEM inventory for components NOT in NOISE_FILTERS that
  have behavior-only axes:
  - `hx-tab-panel` — has `active` (boolean), `lazy` (boolean), `name`
    (string). lazy is render-defer behavior; should narrow.
  - `hx-tooltip` — has `placement` narrowed but missing `hoist`
    (boolean for floating-ui escape clipping; never visual statically).
  - `hx-popup` — narrows 8 axes but skips `containingBlock` and
    `boundary` if those exist in the CEM (need to confirm in CEM).
  - `hx-skeleton` — has `effect` (none/pulse/wave) — pulse and wave
    are animation curves, both render identical static rectangles.

- **Suggested fix:**
  Cross-reference EMBEDDED_INVENTORY against NOISE_FILTERS once and
  surface every behavior-only-named axis (heuristic: axis names
  matching `/lazy|hoist|persist|trigger|easing|effect|loading/`) that
  isn't narrowed. Run the script as a CI step.

---

### 11. WARN — verify check `figma-styles-emitted` requires a binding on every paint but doesn't validate the binding TYPE

- **File:** `figma-tokens/plugin/lib/verify.ts:191-217`
- **Severity:** WARN
- **Description:**
  Same class as finding #2. The check asserts every Helix paint style
  has SOME `boundVariables.color` — it doesn't verify the bound
  variable's `resolvedType === 'COLOR'`. With finding #1 unresolved,
  emitFigmaStyles could bind a STRING-typed Figma variable to a paint
  style, the binding would resolve to the variable's default
  (whatever that is), and the check would pass.

- **Suggested fix:**
  After the binding presence check, look up each bound var ID in
  `collectionByVarId` then check the underlying Variable's
  `resolvedType === 'COLOR'`. Fail the style-emit check if any bound
  var is non-COLOR.

---

### 12. advisory — `lib/instances.ts` `createInstanceFromTag` swallows partial-success in setProperties

- **File:** `figma-tokens/plugin/lib/instances.ts:75-83`
- **Severity:** advisory
- **Description:**
  When `instance.setProperties(resolved)` throws, the catch block
  warns and continues. The instance is then returned WITHOUT the
  variant overrides applied — caller has no signal that the override
  silently failed. In the Phase A flows this manifests as a card
  with a "primary, sm" requested button instance that actually
  rendered as the default-variant button.
  
  Today this only matters when the user is rebuilding a single tag
  while atoms are stale; in a full Build All it's near-zero. As the
  slot system grows it becomes load-bearing.

- **Suggested fix:**
  Return `{ instance, appliedProps, failedProps }` (or just throw and
  let the renderer fall through to its placeholder). At minimum,
  upgrade the `console.warn` to include the failed props so the user
  can act on it.

---

### 13. advisory — Rule 1 hard-fail check in verify.ts examines outer ComponentNode only; doesn't walk inner frames

- **File:** `figma-tokens/plugin/lib/verify.ts:337-359`
- **Severity:** advisory
- **Description:**
  The check correctly enforces Rule 1 on the variant root
  (ComponentNode). Inner FrameNodes with `layoutMode='NONE'` (the
  legitimate Overlap Exception inner stages) AND inner frames that
  are NOT exception-justified both pass. Today the only non-justified
  inner NONE frame is `hx-data-table:371` (finding #6). Tomorrow,
  without this check, the next renderer author can quietly add
  `frame.layoutMode = 'NONE'` to fix a layout problem and ship.

- **Suggested fix:**
  Add an "advisory" check that walks descendants of each variant
  ComponentNode and counts FrameNodes with `layoutMode='NONE'`. Cross-
  reference against a per-renderer `expect.allowedOverlapExceptions:
  string[]` that lists the named frames the renderer intentionally
  uses the exception for (e.g. `['stage', 'glyph']`). Anything outside
  the allowlist becomes a verify warn.

---

### 14. advisory — hx-progress-bar's hash stripes may overflow `clipsContent = true` stage at extreme rotations

- **File:** `figma-tokens/plugin/renderers/hx-progress-bar.ts:166-178`
- **Severity:** advisory
- **Description:**
  The 35° rotated stripes (line 173) extend `STRIPE_W=8` × `h*2` then
  shift `y = -h/2`. For `lg` (h=12), that's an 8×24 box rotated 35°
  positioned at y=-6. The bounding box of a 35°-rotated 8×24 rect is
  ~21×24 — extending below y=0 by ~6px and above y=h(12) by ~6px.
  `stage.clipsContent = true` clips this. But for `sm` (h=4), the
  stripe is 8×8 at y=-2, bbox ~12×12, which over-extends the 4px
  stage by ~8px on each side — clipped to a tiny visible slice. The
  visual result for `sm + indeterminate=true` is likely sparse
  diamond glyphs rather than diagonal stripes.

- **Suggested fix:**
  Test visually for sm size; if the stripes are unreadable, scale
  STRIPE_W and rotation per `h` (smaller stripes for smaller bars).

---

### 15. advisory — the cascade fix's `expectedType` parameter doesn't get passed for FLOAT bindings, just COLOR

- **File:** `figma-tokens/plugin/lib/bindings.ts:161-202` (bindFill,
  bindStroke, bindTextColor) vs. `bindNumberProperty:206-228`
- **Severity:** advisory
- **Description:**
  All three color helpers pass `'COLOR'` as expected type. Good. But
  `bindNumberProperty` doesn't pass an expected type — it accepts
  whatever the cascade returns, then guards `if (res.variable.resolvedType !== 'FLOAT') return false` AFTER the resolve. That skips the
  same fall-through behavior the COLOR case got in tonight's fix:
  if a component-tier var is STRING (per finding #1) and a semantic
  fallback is FLOAT, the cascade returns the STRING component result
  and bindNumberProperty silently fails — even though the FLOAT
  semantic would have worked.

- **Suggested fix:**
  Pass `'FLOAT'` to `resolveBinding` from `bindNumberProperty`, same
  pattern as the color helpers. Drop the post-resolve type guard
  (it's now redundant). This also makes the helper callable for
  STRING bindings later (e.g. font-family) by parameterizing.

---

## Verify-pass gaps summary (finding #2 enumerated)

Performative checks that classify rather than execute:
1. `bindings-collection` — checks WHERE bindings live (in/out of Helix
   collections), not whether `setBoundVariableForPaint` succeeds.
2. `figma-styles-emitted` — checks presence of `boundVariables.color`,
   not the bound variable's resolvedType.
3. `rule-7-token-tier` — counts cascade tier of resolved variables,
   not whether the cascade's first-tier intent matches what was
   eventually bound (silently bypassed cascades report green).
4. `expect-required-vars` — checks variable PRESENCE in collection,
   not whether the variable's resolvedType matches what callers use
   it for.
5. `cem-axis-values` — checks Figma axis ⊆ CEM enum, not Figma axis
   ⊇ CEM enum (axis-values present only on CEM side surface as
   missing-from-cut, not as a verify failure — this is by design per
   `pickVariantCut` but should be info-logged).

A 6th category: the rule-1 check examines outer ComponentNode but not
inner frames (finding #13).

## Hidden assumptions in shared helpers

- `bindFill` / `bindStroke` / `bindTextColor` assume the node's
  `fills` / `strokes` are mutable and that the property accepts
  variable bindings via `setBoundVariableForPaint`. RECTANGLE,
  ELLIPSE, FRAME, TEXT, COMPONENT all do — verified. VECTOR also
  does. POLYGON, STAR, LINE: not verified in code; the `as unknown`
  cast bypasses type checking.
- `bindNumberProperty`'s `setBoundVariable` call uses an `as unknown`
  cast around a function reflection. If a future Figma API change
  removes the method, the helper returns `false` silently rather than
  throwing. Acceptable, but document it.

## Direct `setBoundVariableForPaint` calls outside helpers

149 call sites across renderers/. Every one of them bypasses the
`expectedType: 'COLOR'` filter and would re-introduce tonight's crash
class if (a) the renderer cites a component-tier intent, and (b) that
component variable resolves to non-COLOR (which is the default state
per finding #1).

These predate Phase A's `lib/bindings.ts` infrastructure — they're
the legacy renderers (hx-toast, hx-alert, hx-clinical-status,
hx-icon, hx-link, hx-style-scope, hx-action-bar, hx-radio-group,
hx-radio, hx-switch, hx-prose, hx-visually-hidden, hx-breadcrumb,
hx-thead, hx-nav-item, hx-combobox, hx-number-input, hx-format-date,
hx-breadcrumb-item) that haven't been swept through the cascade
helper yet.

Rule of thumb: every `figma.variables.setBoundVariableForPaint` call
in `renderers/` is a Phase A·b candidate for migration to
`bindFill` / `bindStroke` / `bindTextColor`. Tracking 149 sites.

---

## Top 5 priorities for fixing

1. **Finding #1** — embed-pipeline STRING-only emission. Until this
   is fixed, the entire token cascade is theatrical.
2. **Finding #2** — verify pass needs a real
   `setBoundVariableForPaint` execution check, not just classification.
3. **Finding #3** — Rule 13 violations (9 sites across 7 renderers).
   Fix or amend the rule.
4. **Finding #5** — the 80% gate is uncalibrated; recompute as a
   per-tag ratio derived from `EMBEDDED_COMPONENT_TOKENS` denominator.
5. **Findings #6, #7** — Overlap Exception scope creep + dead-binding
   coverage hacks; signs the patterns are being adopted defensively
   rather than purposefully.

These five together would change the ground truth such that the next
renderer sweep can rely on the verify pass instead of working around it.
