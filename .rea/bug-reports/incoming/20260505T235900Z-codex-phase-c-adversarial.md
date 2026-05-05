---
title: "Phase C idempotent ComponentSet rebuild — adversarial review"
type: review
scope: figma-tokens
created: 2026-05-05
reporter: codex-adversarial-reviewer (gpt-5.4 envelope)
target_branch: feature/s3.1-dtcg-default
target_commits: f776a97 6789ce9 a9be55e 677c4f3 36bd6d7 855127d fc83a68
---

# Phase C — adversarial review of idempotent ComponentSet rebuild

Scope: `plugin/lib/upsert.ts` (new), `plugin/lib/instances.ts` (3-mode
declareSwapSlot), `plugin/lib/verify.ts` `checkIdempotencyAgainstPriorSnapshot`,
`plugin/code.ts` `runRegistryBuild` cleanup sweep (Option A), the migration
script `scripts/migrate-renderers-phase-c.mjs`, and 5 sample migrated
renderers (button / card / form / stack / tabs).

Read-only review against the v0.6 spec and Layout Rules 11/12/13.

## Summary

**14 findings. 4 HARD-FAIL, 6 WARN, 4 advisory.**

**HX-PHASE-C-3 (already filed) is NOT the most severe bug in this ship.**
Two findings here are at least as bad and one is strictly worse:

- **Finding #1** — the new verify snapshot writes the *broken*
  post-extraction state as the new baseline EVERY run, then on the
  subsequent run those drifted IDs are themselves treated as the prior
  truth. The pass becomes self-confirming: a regression that drifts one
  ID per run will report "0 drift" forever after the first run that
  catches it.
- **Finding #2** — `transplantContent()` does NOT copy
  `componentPropertyReferences` from the donor variant root, so the
  per-variant `mainComponent` slot bindings written by `declareSwapSlot`
  on the FRESHLY-BUILT donor are silently discarded on every idempotent
  rebuild. The kit looks fine; designer slot pickers go dead. This is
  the exact opposite of what Phase C exists to prevent, hidden behind
  a green verify pass.

HX-PHASE-C-3 is severe (visible orphan stack + cross-family drift) but
strictly bounded — observable in the canvas. Findings #1 and #2 are
silent and load-bearing.

---

## Findings

### 1. HARD-FAIL — verify snapshot writes a "new baseline" on every run, including runs with drift; future drift becomes invisible

- **File:** `plugin/lib/verify.ts:958-1106`, especially line 1103
- **Severity:** HARD-FAIL
- **Description:**
  `checkIdempotencyAgainstPriorSnapshot` always calls
  `writeIdempotencySnapshot(current)` at the end, regardless of whether
  any drift was detected. So the flow is:

  1. Run 1 (post-Phase-C ship): captures baseline. Writes snapshot.
  2. Run 2: HX-PHASE-C-3 fires — every cross-family ComponentSet ID
     drifts. Verify reports `idempotency-set-id-drift` for ~85 tags.
     **Then writes the drifted state as the new snapshot.**
  3. Run 3: compares the new (drifted) IDs against themselves →
     "Preserved 100/100 ComponentSet IDs across rebuild." Green pass.
  4. Future regressions of the same class will report drift exactly
     ONCE per regression, then go silent.

  This is worse than no verify check, because it gives green-pass
  cover to a chronic regression. Combined with HX-PHASE-C-3 the
  verify pass actively conceals the bug after the first user-visible
  detach event.

  Subsidiary issue: when `setIdDrift` is non-empty for a tag, the
  per-variant + per-property diffs are skipped (lines 859-863) — so
  the new snapshot still contains the new (post-drift) variant IDs and
  property keys. Every subsequent compare against those will pass
  trivially even if a separate drift surfaces in those dimensions.

- **Suggested fix:**
  Don't update the snapshot on a fail. Either (a) gate the write on
  `if (diff.setIdDrift.length === 0 && diff.variantIdDrift.length === 0
  && diff.propertyKeyDrift.length === 0) writeIdempotencySnapshot(current);`
  OR (b) keep two snapshots (`baseline` written once + `last-clean`
  updated only on a green run) and always compare the current build
  against `baseline` for true regression detection. Option (b) is
  better — it catches slow drift across many runs.

---

### 2. HARD-FAIL — transplantContent() drops componentPropertyReferences on the variant root, breaking Phase B INSTANCE_SWAP slot bindings on every idempotent rebuild

- **File:** `plugin/lib/upsert.ts:451-500`
- **Severity:** HARD-FAIL
- **Description:**
  `transplantContent(src, dst)` copies fills, strokes, layout, padding,
  sizing — but NOT `componentPropertyReferences`. The renderer
  pre-Phase-C wrote per-variant slot bindings via `declareSwapSlot`
  AFTER `combineAsVariants`. Post-Phase-C, the renderer still calls
  `declareSwapSlot(...)` AFTER the upsert call — but on the idempotent
  path:

  - `field1Insts[i]` / `tab1Insts[i]` / `submitInsts[i]` arrays were
    populated with InstanceNode references from the **donor** `c`'s
    construction (renderer body, before `nodes.push(c)`).
  - `transplantContent` reparents those InstanceNodes from donor `c`
    into the existing `dst` variant via `dst.appendChild(child)`. The
    InstanceNode references in the per-variant arrays remain valid
    (Figma reparenting preserves node identity).
  - `declareSwapSlot` then iterates the per-variant InstanceNode array
    and writes `inst.componentPropertyReferences = { mainComponent: key }`.
    Since the InstanceNode is now under `dst`, this DOES set the
    binding on the surviving variant. **So this part actually works.**

  The break is on the OUTGOING side. Consider a renderer that doesn't
  re-declare its slots on every run (none today, but the spec
  documents this as the canonical Phase C+ path — see `instances.ts:130-137`
  "Mode 1"). The donor variant `src` carries the
  `componentPropertyReferences` that the renderer wrote on its
  variant root (e.g. `visible`, `characters`). `transplantContent`
  doesn't propagate those to `dst`. Today no renderer writes refs on
  the variant ROOT (they write on inner instances), so the bug doesn't
  bite — but it's a latent contract violation.

  Worse, more immediate problem: existing variant-root properties on
  `dst` (e.g. variant property values `variant=primary, size=sm` are
  encoded by the `variantProperties` getter; not relevant here) are
  not the issue, but `dst.exportSettings`, `dst.constraints`,
  `dst.effects` (drop shadows, blur), `dst.blendMode`,
  `dst.isMask`, `dst.maskType`, `dst.layoutAlign`, `dst.layoutGrow`,
  `dst.minWidth/maxWidth/minHeight/maxHeight`, `dst.layoutSizingHorizontal`/`Vertical`
  are all NOT mirrored. `transplantContent` only copies a hand-curated
  subset comment-justified as "the properties renderers actually
  write" — but that contract is not enforced anywhere. A renderer
  author who sets `c.effects = [shadow]` on the donor will see the
  shadow vanish on every idempotent rebuild. Silent.

  The comment at line 470-472 explicitly admits this is a
  maintenance burden: "Only the properties renderers actually
  write are mirrored — reading everything would be a maintenance
  burden." It IS, and it IS a foot-gun.

- **Suggested fix:**
  Add `dst.effects = src.effects;` and `dst.componentPropertyReferences = src.componentPropertyReferences;` 
  immediately. Then add a comment-block enumerating EVERY BaseFrameMixin
  property and which are intentionally not mirrored vs which are gaps;
  file follow-ups for the gaps. Better: invert the model — make
  `transplantContent` use `Object.assign`-style copy of every settable
  property except `id`, `name`, and the auto-layout-disallowed ones.
  Best: don't transplant content at all — make the renderer's
  per-combo body operate directly on the existing variant (i.e.,
  migrate to the callback-based `upsertComponentSet` API the new
  helper exposes alongside, drop the from-built adapter).

---

### 3. HARD-FAIL — declareSwapSlot Mode 2 silently leaks duplicate properties when type changes

- **File:** `plugin/lib/instances.ts:182-251`
- **Severity:** HARD-FAIL
- **Description:**
  `findExistingPropertyKey(set, baseName)` matches on base name
  ONLY — it doesn't check the existing property's `type`. If a
  property `Action 1` previously existed as `BOOLEAN` (e.g. an
  earlier renderer version used a boolean toggle for the slot),
  the discover-before-declare path returns the existing
  `'Action 1#xx:yy'` key. Then line 263 does
  `inst.componentPropertyReferences = { mainComponent: suffixedKey }`
  on an INSTANCE_SWAP-shaped reference against a BOOLEAN-typed
  property. Figma will throw or silently swallow — the catch at
  line 269-272 just warns. Caller never knows. Slot picker is dead.

  Same risk on the upsert helper side: `ensureComponentProperties`
  (`upsert.ts:194-225`) uses `existingIndex[spec.name]` keyed by
  base name only, returns the existing key without checking
  `defs[existingKey].type === spec.type`. A renderer migrating
  `Item 1` from VARIANT to INSTANCE_SWAP will get the existing
  VARIANT key back and fail to bind.

  Worse: the comment block at `upsert.ts:189-193` calls out that
  renaming a property creates a fresh property and orphans the old
  one — but doesn't address type mutation, the much more dangerous
  case (rename is visible in code review; type change of an
  existing property name is invisible because it's the same string).

- **Suggested fix:**
  In `findExistingPropertyKey` AND `readPropertyKeyIndex`, also
  return the property type. Compare against the requested type at
  the callsite:
  ```ts
  const existing = existingIndex[spec.name];
  if (existing && existing.type !== spec.type) {
    console.warn('[upsert] property "' + spec.name + '" exists with type ' +
      existing.type + ' but renderer requested ' + spec.type +
      '. Skipping declaration; designer must remove the stale property.');
    continue;
  }
  ```
  Don't auto-recreate — that would break any designer overrides on
  the existing property. Surface it loudly and let the human decide.

---

### 4. HARD-FAIL — cleanup-sweep extraction has no try/finally; mid-extraction throw leaves ComponentSet unlocked permanently

- **File:** `plugin/code.ts:401-419`
- **Severity:** HARD-FAIL
- **Description:**
  ```ts
  for (let j = 0; j < innerSets.length; j++) {
    const csInner = innerSets[j];
    if (csInner.locked) csInner.locked = false;
    fp.appendChild(csInner);
    setsExtracted++;
  }
  ch.remove();
  ```
  If `fp.appendChild(csInner)` throws (e.g. cross-page reparent
  failure on a malformed page state, or Figma sandbox throws on a
  variant-axis-violation), the set is left unlocked AND the kit
  frame is never removed (`ch.remove()` is below the loop). Next
  run: cleanup sweep finds the kit, extracts again, and now you
  have TWO sets on the family page with the same name. The
  `findExistingComponentSet` "duplicates" branch (`upsert.ts:149-156`)
  reports the dupe and removes the second — but the duplicate
  removal path picks an arbitrary winner (whichever appears first
  in `page.children`), so designer instances may have detached if
  the "wrong" one was kept.

  Same gap exists for the post-render `lockLibraryPage` pass at
  line 481 — there's no symmetric "unlock on fail" recovery if the
  next pre-build extraction fails after a partial earlier run.

- **Suggested fix:**
  Wrap the unlock+reparent+remove in try/finally:
  ```ts
  const wasLocked = csInner.locked;
  if (wasLocked) csInner.locked = false;
  try {
    fp.appendChild(csInner);
    setsExtracted++;
  } catch (err) {
    console.error('[runRegistryBuild] extract failed for ' + ch.name +
      ' on page "' + fp.name + '": ' + (err instanceof Error ? err.message : String(err)));
    // Re-lock to avoid leaving designer-editable state.
    if (wasLocked) {
      try { csInner.locked = true; } catch {}
    }
    // Skip this kit's removal — leave it intact so the user sees the failed kit
    // rather than producing an orphan-set scenario.
    continue;
  }
  ```
  Then move `ch.remove()` outside any failure path and inside its
  own try/catch.

---

### 5. WARN — snapshot fingerprint conflates extracted bare sets and kit-wrapped sets, leading to false "tags-removed" / "tags-added" warnings during normal mid-build state

- **File:** `plugin/lib/verify.ts:748-772`
- **Severity:** WARN
- **Description:**
  `captureIdempotencyFingerprint` walks `figma.root.children` and
  picks up COMPONENT_SETs in two shapes: inside `hx-*-kit` frames
  AND bare on the page. The verify call runs AFTER the post-render
  reparent at code.ts:288, by which time the kit frames should
  contain the sets. But if HX-PHASE-C-3 (or any future bug) leaves
  a set extracted-but-not-re-claimed on the wrong page, the
  fingerprint walker captures it ONCE per page-presence — and the
  by-tag map last-write-wins (line 801: `byTag[tag] = entry`).
  Whichever page is iterated last for that tag overwrites prior
  iterations.

  Net effect: the snapshot becomes order-dependent on
  `figma.root.children` page order, and a duplicate-on-extract
  scenario (finding #4) silently picks the dupe's IDs as the
  canonical fingerprint. Combined with finding #1, this means
  recovering from a single bug requires an explicit snapshot reset
  the user can't easily perform.

- **Suggested fix:**
  Track which page each tag was found on; if a tag appears on
  multiple pages (or multiple bare/wrapped instances on one
  page), emit an `info` or `warn` check `idempotency-tag-multi-location`
  with the page list, and SKIP that tag's fingerprint from the
  comparison entirely (preserve the prior snapshot's entry for
  that tag rather than overwriting with potentially-bogus state).
  Provide a Figma menu command "Reset idempotency snapshot" that
  calls `figma.root.setSharedPluginData(NS, KEY, '')`.

---

### 6. WARN — pluginVersion field is captured but never compared; PLUGIN_VERSION bumps don't trigger snapshot reset or migration warning

- **File:** `plugin/lib/verify.ts:721-725, 935-948, 958-1106`
- **Severity:** WARN
- **Description:**
  The snapshot stores `pluginVersion` but `diffIdempotencyFingerprint`
  never reads it. The doc comment at line 722-724 promises "the
  verify pass surfaces a soft-warning if the version differs" —
  the code does not. So when 0.6.0 ships and the file gets stamped
  with a 0.6.0 snapshot, then 0.6.1 ships with (hypothetically) a
  different componentProperty key suffix algorithm, the verify pass
  would report a sea of `propertyKeyDrift` failures with no
  indication that the comparison is unfair across versions.

  Worse: scrutiny axis #6 from the brief asks "what happens when
  PLUGIN_VERSION bumps mid-development?" — the answer is "the
  diff treats it as a regression." The 0.5.x → 0.6.0 transition
  itself will hit this for every developer running rebuilds across
  a version bump. The Phase C ship is the FIRST occasion the
  snapshot gets written; the NEXT plugin upgrade is the first
  victim.

- **Suggested fix:**
  In `checkIdempotencyAgainstPriorSnapshot`:
  ```ts
  if (prior.pluginVersion !== pluginVersion) {
    checks.push({
      name: 'idempotency-version-skew',
      status: 'warn',
      message: 'Snapshot was captured under plugin v' + prior.pluginVersion +
        '; now running v' + pluginVersion + '. Drift may be expected — ' +
        'review once and re-baseline if benign.',
    });
    // Don't compare across versions; just write a fresh baseline.
    writeIdempotencySnapshot(current);
    return checks;
  }
  ```
  Rationale: cross-version IDs SHOULD be stable in principle, but the
  failure mode is too noisy to debug without an explicit re-baseline
  signal.

---

### 7. WARN — variant-order assumption (combineAsVariants preserves input order) is not verified by any test or runtime check

- **File:** `plugin/lib/upsert.ts:248-251`, comment-only
- **Severity:** WARN
- **Description:**
  Line 248: "Order matches `combos` since combineAsVariants
  preserves the input order." This is the comment-asserted
  contract. The migration script's rewrite from `nodes[i]` to
  `(set.children[i] as ComponentNode)` ALSO depends on this — see
  `migrate-renderers-phase-c.mjs:113-116` "set.children mirrors the
  combo order exactly."

  The Figma plugin API docs state combineAsVariants creates
  variants in the order of the input array, but they don't
  guarantee `set.children` order persists across re-opens or
  reparents. On the idempotent path, when a variant is
  `set.appendChild(built)`-ed (new combo), the new variant is
  appended at the END — but the comment in
  `migrate-renderers-phase-c.mjs:111-116` admits "Newly-appended
  variants land at the end" then claims this is fine "because
  when no combos are added/removed, set.children mirrors the
  combo order exactly."

  Fragile: when ONE combo is added (e.g. CEM gets a new variant
  axis value), the new combo's index in `combos[i]` is N (could be
  middle), but its index in `set.children[]` is at the end.
  The renderer's grid-positioning loop then places the new
  combo's content at position N (visually correct based on
  combo iteration index) — but the
  `(set.children[i] as ComponentNode)` lookup grabs the wrong
  variant for index N. **All variants shift by one slot
  visually** when a combo is added between rebuilds.

  This is a latent regression waiting for the first CEM expansion
  to hit. No test catches it because no Phase C test runs the
  "second build with new combo added" scenario.

- **Suggested fix:**
  Either (a) sort `set.children` by combo order after upsert by
  walking combos and calling `set.insertChild(i, variant)` to
  reorder, OR (b) build a name→variant lookup INSIDE the renderer
  positioning loop instead of indexing by `set.children[i]`:
  ```ts
  const variantByName: Record<string, ComponentNode> = {};
  for (const ch of set.children) {
    if (ch.type === 'COMPONENT') variantByName[ch.name] = ch as ComponentNode;
  }
  for (let i = 0; i < combos.length; i++) {
    const node = variantByName[comboToVariantName(combos[i], i)];
    // ... position
  }
  ```
  Option (b) is safer because it doesn't fight Figma's variant
  ordering. The migration script needs a v2 sweep to apply this
  pattern — manual edits in 100 files would be painful.

---

### 8. WARN — empty combos array crashes upsertComponentSetFromBuilt's first-build path

- **File:** `plugin/lib/upsert.ts:506-531`
- **Severity:** WARN
- **Description:**
  When `builtNodes.length === 0` (e.g. NOISE_FILTERS narrowed every
  combo for a renderer), the first-build branch reaches
  `figma.combineAsVariants([], page)` which the Figma API rejects
  with "combineAsVariants requires at least one component." No
  guard on either path. The renderer's outer loop produces zero
  donor nodes; `nodes.push(c)` never fires; the upsert call
  immediately throws.

  Idempotent path with empty combos is also broken: it hits the
  variant-removal block (`existingByName` has all current
  variants, `seenNames` is empty), removes EVERY existing variant,
  then the set has zero variants — Figma allows this state but
  renders the set as an empty box, breaking downstream
  `defaultMainComponentIdFor` lookups (returns `set.defaultVariant`
  which is now null) for any compound that depends on this atom.

- **Suggested fix:**
  Guard at top of both paths:
  ```ts
  if (builtNodes.length === 0) {
    throw new Error('[upsertComponentSetFromBuilt] ' + setName +
      ': no built nodes — renderer produced zero combos. ' +
      'Check NOISE_FILTERS and CEM axis values.');
  }
  ```
  Throw rather than no-op so the renderer surfaces the failure
  loudly. Same guard at top of `firstBuild` and `idempotentBuild`
  in the callback API.

---

### 9. WARN — perVariantInstances arrays in compound renderers are indexed by combo iteration order, not by surviving-variant order; on idempotent rebuild with reordered combos, slot bindings land on wrong variants

- **Files:**
  - `plugin/renderers/hx-tabs.ts:281-309` (tab1Insts, tab2Insts, tab3Insts, panelInsts)
  - `plugin/renderers/hx-form.ts:282-303` (field1Insts, field2Insts, submitInsts)
  - any other compound that calls `declareSwapSlot`
- **Severity:** WARN (severe in compound renderers; ~12 of 100)
- **Description:**
  Per-variant instance arrays are `instArr.push(inst)` during the
  donor build loop, so `instArr[i]` corresponds to `combos[i]`.
  declareSwapSlot's per-variant binding loop assumes
  `perVariantInstances[i]` corresponds to `set.children[i]`. On the
  idempotent path with no combo changes, this holds (per finding
  #7). On a rebuild where a combo was REMOVED (variant pruned by
  CEM update or axis narrowing), `set.children` shrinks BEFORE
  declareSwapSlot runs — but `perVariantInstances` was built from
  the FULL combos array. The two are now off-by-N. Slot bindings
  shift onto the wrong surviving variants.

  Same class of latent bug as finding #7 but compounded by
  declareSwapSlot's own iteration: it walks
  `perVariantInstances` (length = original combos count) and
  binds each one's `mainComponent`. But the InstanceNodes were
  reparented via `transplantContent` from donors that were
  REMOVED at the end of the loop — so for combos whose donor was
  removed (the orphan-removal path), the InstanceNode reference
  is to a now-removed orphan, and setting
  `componentPropertyReferences` on it is a no-op or throws.

- **Suggested fix:**
  Same as finding #7 — index by variant NAME not by integer:
  ```ts
  const instByName: Record<string, InstanceNode | null> = {};
  for (let i = 0; i < combos.length; i++) {
    instByName[comboToVariantName(combos[i], i)] = field1Insts[i];
  }
  // declareSwapSlot consumes name-keyed map instead of positional array
  ```
  Requires a declareSwapSlot signature change to accept a name-keyed
  map alternative. Worth it.

---

### 10. WARN — migration script is NOT idempotent across hand-edits; re-running it after manual edits produces malformed output

- **File:** `scripts/migrate-renderers-phase-c.mjs:50-53, 117-120`
- **Severity:** WARN
- **Description:**
  The "already migrated" gate checks
  `src.indexOf('upsertComponentSetFromBuilt') !== -1`. Fine. But the
  rewrite rules have a sharper failure mode:

  - `nodes[<expr>]` → `(set.children[<expr>] as ComponentNode)` is
    GLOBAL (`/g` flag). If a hand-editor introduced a new `nodes[i]`
    AFTER the migration (e.g. constructing a parallel data-driven
    layout), re-running the script would skip due to the gate —
    but if a developer manually deletes the
    `upsertComponentSetFromBuilt` call to re-test the legacy path,
    the next migration-script run will rewrite EVERY `nodes[i]` in
    the file (including new uses unrelated to the variant flow).

  - Worse: `\bnodes\.length\b` is GLOBAL too. If the renderer
    introduced a separate variable `const nodes = childList`
    elsewhere, the script clobbers its `.length` access too.

  - The migration script doesn't print a diff or backup, doesn't
    write to git, and runs in-place. A botched second invocation
    (e.g. after a hand-edit that introduced a new
    `nodes.length`) silently corrupts the file. Recovery requires
    git checkout, which a non-author of the migration won't know
    to do.

- **Suggested fix:**
  - Refuse to run if `git status --porcelain renderers/` shows
    uncommitted changes (force a clean baseline).
  - Tighten the regex to ONLY rewrite `nodes[i]` accesses
    immediately preceding the renderer's grid-positioning loop —
    anchor on `// Position each variant inside` or similar.
  - Print a unified diff per file and require `--apply` to write.
  - Add a comment marker
    `// PHASE-C-MIGRATED — do not re-run scripts/migrate-renderers-phase-c.mjs against this file`
    so the gate is positive (presence of marker), not the indirect
    `upsertComponentSetFromBuilt` indicator.

---

### 11. WARN — duplicate-set removal in findExistingComponentSet picks an arbitrary winner; no preference for the set with more variants / older creation timestamp / matching variant axes

- **File:** `plugin/lib/upsert.ts:136-159`
- **Severity:** WARN
- **Description:**
  When two ComponentSets on the same page match the requested
  setName (post-extraction state, post-finding-#4 partial failure,
  or designer-side duplication), the first one in iteration order
  becomes the "primary" and the rest get `.remove()`. There's no
  attempt to:
  - prefer the set with more variants (designer instances likely
    point at the richer set);
  - prefer the set whose variant names better match the renderer's
    `combos`;
  - prefer the set with intact componentPropertyDefinitions;
  - merge variant overrides from the discarded into the kept;
  - log which IDs were removed (only a count is logged).

  The "first wins" semantics combined with finding #5
  (page-iteration order dependence) makes the recovery from any
  intermittent failure non-deterministic from the user's
  perspective. A single hiccup can permanently detach designer
  instances on whichever set lost the coin flip.

- **Suggested fix:**
  Pick the duplicate with the MOST variant children (proxy for
  "the one designer instances most likely reference"). Log the
  full IDs of removed duplicates so a designer who reports
  detached instances has a forensic trail:
  ```ts
  if (duplicates.length > 0) {
    const allCandidates = [primary!, ...duplicates];
    const winner = allCandidates.reduce((a, b) =>
      a.children.length >= b.children.length ? a : b);
    const losers = allCandidates.filter(s => s.id !== winner.id);
    primary = winner;
    console.warn('[upsert] ' + setName + ': resolved ' + allCandidates.length +
      ' duplicate sets — kept id=' + winner.id + ' (' + winner.children.length +
      ' variants), removed: ' + losers.map(l => l.id + ' (' + l.children.length + 'v)').join(', '));
    losers.forEach(l => l.remove());
  }
  ```

---

### 12. advisory — kit-frame regeneration name collision: createKitFrame produces 'hx-{tag}-kit'; if a renderer is renamed mid-flight, the cleanup sweep doesn't recognise the old kit name

- **File:** `plugin/lib/kit.ts:43`, `plugin/code.ts:380` (`/^hx-(.+)-kit$/`)
- **Severity:** advisory
- **Description:**
  The cleanup sweep regex matches every `hx-*-kit` frame and
  extracts its inner ComponentSet. If a renderer was renamed
  (e.g. `hx-progress-bar` was once `hx-progress` — hypothetical),
  the old kit on the page is detected, its set is extracted to
  the page, and stays there as orphan because the new renderer
  asks for `hx-progress-bar`-named sets, not `hx-progress`. The
  orphan-with-renderer detection at code.ts:383 (`getRenderer(tag)
  === null`) only triggers when the tag has NO registered
  renderer — but in a rename scenario the OLD tag has no renderer
  while the NEW tag does. Old kit stays as orphan extraction
  trash.

  Same risk for componentSet-name vs kit-frame-name divergence:
  if `applyCategoryPrefixOnPage` re-prefixes a set on a page
  whose kit was already renamed by a different mechanism, the
  cleanup sweep next run won't find the kit by `hx-*-kit`
  pattern and won't extract.

- **Suggested fix:**
  Add a startup migration that walks every page once, collects
  all sets with `hx-*` prefix (with or without category prefix),
  and either re-pairs them to current renderer tags via a
  rename-map (`OLD_TAG_TO_NEW: Record<string, string>`) or
  surfaces them in a verify check `legacy-set-names-detected`
  so designers can audit before the next rebuild detaches.

---

### 13. advisory — focus-ring stroke and shadow effects on variant root will be lost on idempotent rebuild

- **File:** `plugin/renderers/hx-button.ts:227-239`, applies to
  any renderer that calls `c.strokes = ...` or `c.effects = ...`
- **Severity:** advisory
- **Description:**
  Direct read of finding #2's gap. hx-button:227-238 sets
  `c.strokes` (focus ring) on the donor `c` (variant root). On
  the first build path, `combineAsVariants` keeps `c` as the
  variant — strokes survive. On the idempotent path,
  `transplantContent(src=c, dst=existingVariant)` DOES copy
  strokes (line 473-475 — strokes are in the curated mirror
  list). So focus rings ARE preserved.

  But: `dst.strokeWeight = src.strokeWeight` and
  `dst.strokeAlign = src.strokeAlign` are mirrored, while the
  focus-ring path also relies on `dst.cornerRadius` (line 477
  mirrors it) and the binding `setBoundVariableForPaint` is
  in the Paint object (carried with strokes). Stroke binding
  preservation works.

  HOWEVER, no renderer today writes effects on a variant root,
  but as soon as one does (real shadows, blur, drop-shadow for
  elevation per hx-card's note at line 313-316: "Real shadows
  deferred to a future effect-binding pass") the bug bites.
  The deferred shadow work is expected within v0.6.x or v0.7.x.

- **Suggested fix:**
  Add `dst.effects = src.effects;` to transplantContent now —
  zero cost today, prevents tomorrow's regression. (Also flagged
  in finding #2; restating to surface the concrete future
  caller.)

---

### 14. advisory — no Figma sandbox concurrency guard against rapid-fire "Import Design System" invocations

- **File:** `plugin/code.ts:305-499`, `plugin/lib/verify.ts:923-948`
- **Severity:** advisory
- **Description:**
  Scrutiny axis #2 from the brief asks: "what if the user runs
  Import Design System twice rapid-fire?" The plugin sandbox is
  single-threaded (figma.* APIs are synchronous within an
  event-loop turn, but await boundaries yield), so two invocations
  of `runRegistryBuild` interleaved at await points could:
  - both pass the cleanup sweep, both extract sets, second run's
    extracted sets become duplicates (finding #11);
  - both write the snapshot at verify completion, second
    overwrites first;
  - both load fonts, contexts, both write descriptions —
    interleaved character-by-character writes are not a thing in
    Figma but interleaved property writes are (one run sets
    `set.name`, the other re-sets it before the first run reads
    it).

  Today no plugin-level lock prevents the second invocation from
  starting while the first is in flight. The Figma plugin UI
  doesn't disable the menu during an in-flight build.

- **Suggested fix:**
  Add a module-level `let buildInFlight = false;` guard at
  `runRegistryBuild` entry; second concurrent invocation should
  `figma.notify('Build already in progress — please wait')` and
  return. Cheap insurance.

---

## Comparative severity vs HX-PHASE-C-3

HX-PHASE-C-3 is a HARD-FAIL with visible symptoms (orphan stack
on every family page) and a clean fix path (Option 1 from the
issue: lookup walks family pages). It surfaces in the canvas, is
caught by verify, and is reproducible.

Findings #1, #2, #3, #4 are HARD-FAIL with **silent** symptoms:

- #1 — verify pass actively conceals subsequent regressions after
  the first hit; turns the snapshot into a self-confirming
  rationalization.
- #2 — transplantContent loses properties; bugs surface as
  "designer says the focus ring is gone" weeks after the relevant
  rebuild, with no audit trail.
- #3 — type-mismatched property reuse silently bypasses slot
  binding. Same symptom class as the original Phase B failure
  Phase C is supposed to prevent.
- #4 — extraction with no try/finally creates duplicate sets on
  partial failure; combined with #11 (arbitrary winner) makes
  recovery non-deterministic.

**HX-PHASE-C-3 is NOT the most severe bug in the ship.** Findings
#1 and #2 are strictly worse because they hide rather than
surface. Findings #3 and #4 are at parity. Recommend addressing
all four HARD-FAILs before the next user-visible release of
figma-tokens, regardless of HX-PHASE-C-3's fix landing.

---

## Top 5 priorities for fixing

1. **Finding #2** — transplantContent gap. Add `effects` and
   `componentPropertyReferences` mirroring NOW. Document the
   curated-mirror contract or invert to deny-list copy.
2. **Finding #1** — gate snapshot writes on a clean diff so the
   verify pass doesn't whitewash future regressions.
3. **HX-PHASE-C-3** (already filed) — Option 1 cross-page lookup.
4. **Finding #3** — type-aware property reuse in declareSwapSlot
   + ensureComponentProperties.
5. **Finding #4** — try/finally around the extraction loop;
   surface partial-failure to the user instead of leaving silent
   orphans.

Findings #5-9 should land in the same release; finding #10
(migration script) should land BEFORE the next migration sweep,
not before this release.

---

## Process notes

The `migrate-renderers-phase-c.mjs` strategy was correct in spirit
(low-friction adapter migration) but the testing matrix was
incomplete: no test covers the second-build scenario with a CEM
combo addition or removal between runs. That single test would
have surfaced findings #7, #8, #9 simultaneously. Recommend a
"phase-c-second-build.test.ts" mock that:

1. Builds a 4-combo renderer.
2. Removes one combo, adds a different combo.
3. Re-runs build.
4. Asserts: surviving variant IDs stable, removed variant ID
   gone, new variant ID added, slot bindings still bind to the
   right inner instances.

Without that test, this entire ship is taking the verify pass on
faith.
