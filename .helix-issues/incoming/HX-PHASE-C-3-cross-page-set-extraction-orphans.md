---
title: HX-PHASE-C-3 — Cross-page ComponentSet extraction orphans sets at top-of-page
type: bug
severity: high
scope: figma-tokens
component: Phase C cleanup sweep
created: 2026-05-05T23:55Z
status: open
---

## Helix-team triage 2026-05-07

**Status: PLUGIN-INTERNAL (wrong tracker — belongs in figma-tokens repo).**

**Routing:** ComponentSet lookup in `plugin/lib/upsert.ts`. All cited paths are figma-tokens internal. The `findExistingComponentSet` function and the `searchPages` widening are entirely plugin-side concerns.

**What this issue actually documents:** Plugin-side bug where cross-page ComponentSet lookup walks only the seed page (Actions) instead of all family pages. Real bug, but in your repo.

**Helix-side action:** None. No helix code is named anywhere in the diagnosis.

**Suggested plugin-side fix you already proposed:** widen `findExistingComponentSet` to accept `searchPages: ReadonlyArray<PageNode>` or walk `figma.root.children` filtered to non-`_`-prefixed pages. ~20-30 LOC in `upsert.ts`. Self-owned by figma-tokens team.

**Closure:** Move to figma-tokens internal tracker. The fix you've scoped is correct; just land it in your repo.

---

# HX-PHASE-C-3 — Cross-page ComponentSet extraction orphans sets at top-of-page

## Symptom

After running "Import Design System" twice with the new Phase C sweep, family pages (Forms in user's screenshot) show overlapping orphan ComponentSets stacked near the top-left of the page (~y=88), bleeding into the page header text. The fresh kits laid out by `layoutFamilyPage` appear correctly below, but the orphan sets are visible junk overlapping the page banner.

User screenshot 2026-05-05T23:55Z showed:
- Top of Forms page: stack of overlapping component instances/labels (extracted-but-never-reclaimed sets from prior build)
- Bottom of Forms page: properly laid-out `hx-text-input-kit` with axes
- Page banner text being obscured by the orphan stack

## Root cause

`runRegistryBuild` cleanup sweep at `code.ts:368-419` walks every family page (Actions, Forms, Navigation, Feedback, Data Display, Layout, Media, plus Catchall), extracts each kit's inner ComponentSet to the page (sibling of the kit), then removes the kit frame.

Renderers run AFTER cleanup. Each renderer creates its kit on the SEED page (`ctx.page` = `FAMILY_PAGES[0].pageName` = `Actions`). The renderer's `upsertComponentSetFromBuilt` calls `findExistingComponentSet(opts.page, opts.setName)` which walks ONLY `opts.page.children` (the seed page = Actions).

So:
- `hx-text-input` was previously on Forms family page → its set was extracted to Forms page
- Renderer creates a NEW kit on Actions seed page → calls `findExistingComponentSet(Actions, 'hx-text-input')` → returns null
- Renderer creates a brand-NEW ComponentSet (new ID — designer instances detach) → assembles new kit
- Re-parent step at `code.ts:431` moves the new kit to its target family page (Forms)
- Old extracted set on Forms remains parked at extraction position, never claimed

## Impact

1. **Visual:** orphan stack at top of every family page after every rebuild. Page banner unreadable.
2. **Idempotency contract violated:** designer instances of cross-family components STILL detach despite Phase C, because the renderer creates new ComponentSets with new IDs whenever the previous set is on a non-seed family page.
3. The Phase C verify check (`checkIdempotencyAgainstPriorSnapshot`) catches this, but only AFTER the damage is done. Verify reports `idempotency-set-id-drift` for every cross-family component.
4. Renderers that happen to live on the seed page (Actions: `hx-button`, `hx-button-group`, `hx-link`, etc.) DO get their sets correctly reclaimed, so the regression hits ~85 of 100 components.

## Fix candidates

### Option 1 (preferred): renderer's lookup walks all family pages

Update `findExistingComponentSet` in `lib/upsert.ts` to accept either:
- a `searchPages: ReadonlyArray<PageNode>` param (caller passes the family page list)
- OR walks `figma.root.children` filtered to non-`_`-prefixed pages

Cost: small. Cleanest. Doesn't disturb the cleanup-sweep architecture.

### Option 2: cleanup sweep parks sets on a single hidden page

Create a hidden `_extracted-sets` page during pre-cleanup, park all extracted sets there. Renderer's lookup walks that page (deterministic location). After build, page is empty (all sets re-claimed) — leave it as a hidden parking lot.

Cost: medium. Adds a new managed page to the file. Cleaner separation.

### Option 3: re-parent extracted sets to seed page

Modify the cleanup sweep at `code.ts:415` to extract to seed page (Actions) instead of the kit's home page. All renderers find their sets on the seed page.

Cost: low. Pollutes the seed page momentarily but the renderer immediately moves the set into a new kit. Simplest of the three.

## Recommended fix

**Option 1 (lookup walks family pages)** — least invasive, keeps the extraction-on-source-page architecture, fixes the orphan problem at the lookup layer.

## Reproduction

1. Open figma-tokens plugin
2. Run "Import Design System"
3. Wait for completion
4. Run "Import Design System" again
5. Switch to Forms family page (or any non-Actions family page)
6. Observe stack of overlapping component instances at top-left, obscuring page banner

## Verify pass after fix

After fix lands:
- Run Import Design System twice
- Verify pass should report `idempotency-set-ids: pass · Preserved 100/100 ComponentSet IDs across rebuild`
- Family pages should be visually clean — only the page banner + new kits, no orphan stack

## Filed

By: live diagnosis from user screenshot 2026-05-05T23:55Z, see chat session 4b4a8a75-263b-4703-8d89-e8cf9342a50e
