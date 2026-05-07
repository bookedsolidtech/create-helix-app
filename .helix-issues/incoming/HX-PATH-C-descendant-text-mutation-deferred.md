---
id: HX-PATH-C-1
title: Path C cover/foundations — descendant-text mutation deferred to Path B
status: draft
category: component-gap
severity: medium
reported: 2026-05-06T05:00:00Z
helix_version: 3.3.1
upstream_or_workaround: both
discovered_in: figma-tokens
related: []
---

## Helix-team triage 2026-05-07

**Status: PLUGIN-INTERNAL (wrong tracker — belongs in figma-tokens repo).**

**Routing:** "Path B" / "Path C v2" are figma-tokens internal architectural choices about how the plugin mutates Figma instances. Helix has no opinion on which path the plugin takes.

**What this issue actually documents:** Plugin design decision — should the plugin mutate descendant text on hx-card / hx-stat / hx-badge instances, OR push helix to add component-properties to those text slots? Either path is figma-tokens-internal architecture.

**On the helix-side ask, if any:** if Figgy ultimately decides Path B (helix exposes TEXT component-properties on slots), that becomes a separate ticket per component with a concrete API proposal — `hx-card`'s heading slot exposed as a `text` prop, etc. **That's not this ticket.** This ticket is "we deferred the decision plugin-side."

**Helix-side action right now:** None. The decision belongs to the figma-tokens team. Once made, the implementation is either entirely plugin-side (Path C v2) or partially helix-side (Path B) — and only Path B generates real helix tickets, which would land here as new individual issues per component.

**Closure:** Move to figma-tokens internal tracker. Reopen / file new helix-side tickets only after Path B is chosen and specific component APIs are scoped.

---

# HX-PATH-C-1 — Path C cover/foundations: descendant-text mutation deferred to Path B

## Summary

Path C (hybrid: instance structural chrome where renderers expose what we
need, keep emitText for text content) only landed the SIBLING-insertion
slice on cover.ts + foundations.ts. The original plan called for instancing
hx-card / hx-stat / hx-badge as outer chrome on at-a-glance, how-to-use,
toc-family-cards, modes-preview, color-palette, etc. — but every one of
those uses requires DESCENDANT-TEXT MUTATION on an instance, because the
underlying renderers bake placeholder strings ("Card title", "Revenue",
"Badge") into their variants without exposing TEXT component-properties.

Path B (add TEXT props to renderers) is the architecturally honest answer
and is filed at:

- `bst-cto-kb/00-Planning/create-helix-app/Path B — TEXT Component Properties on Helix Renderers.md`

The Path C session shipped:
1. `chrome-instance-text:` exempt sentinel in scripts/test-emit-shape.ts —
   build-time grep accepts it as a second allowlist alongside
   `emitText-exempt:`. Used for sanctioned descendant-text mutation when
   Path C eventually exercises hx-card / hx-stat surface.
2. `plugin/lib/page-chrome-instances.ts` — sibling helper to instances.ts
   that finds + instantiates published hx-* ComponentSets without
   touching the renderer pipeline's protected zone.
3. hx-divider sibling insertions on Cover legend rows, Foundations
   spacing rows, and between top-level sections of both pages.

What was NOT shipped (deferred):
- hx-card on at-a-glance stat cards
- hx-card on how-to-use step cards
- hx-card on TOC family cards
- hx-card on modes-preview cells
- hx-card on color-palette swatches
- hx-stat on at-a-glance metrics
- hx-icon on legend status dots (would force every status to bind to
  color/text/primary instead of per-status semantic)

## Reproduction

Open the published kit in Figma. Verify the chrome on Cover + Foundations:
- ✓ Section separators render hx-divider instances (mode-aware)
- ✓ Legend row separators render hx-divider instances (mode-aware)
- ✓ Spacing row separators render hx-divider instances (mode-aware)
- ✗ At-a-glance stat cards still render literal SolidPaint chrome (not
  bound to color/surface/raised)
- ✗ TOC family cards still render literal SolidPaint chrome
- ✗ How-to-use step cards still render literal SolidPaint chrome

## Expected (Path C v2 or Path B)

Either:
- **Path B (preferred)**: hx-card renderer exposes `title` + `body` as
  TEXT component-properties; cover/foundations instance hx-card and
  override the props. No descendant-mutation needed.
- **Path C v2**: cover/foundations descend into hx-card instances via
  `instance.findOne(layer.name === 'title')` and mutate `.characters`
  on the descendant. Sentinel `// chrome-instance-text:` covers the
  grep allowlist. Requires per-section helper that gracefully degrades
  when the descendant layer naming changes (renderer churn risk).

## Actual

Cover + Foundations chrome surfaces are partially mode-aware. Sections
that need text content keep their literal SolidPaint surface fills;
only horizontal-rule separators are now bound to a mode-aware semantic.

## Source

- `plugin/lib/cover.ts:849-1001` — legend section + cover-content outer
- `plugin/lib/foundations.ts:931-1126` — spacing section + foundations-
  content outer
- `plugin/renderers/hx-card.ts:172-200` — title + body baked into variant

## Root cause hypothesis

The original Helix renderer contract emits placeholder text inside the
variant for designer-side preview, on the assumption that designers will
detach the instance to customize text. For library chrome (cover /
foundations) we want the surface chrome WITHOUT detaching — so we either
need TEXT props (Path B) or a sanctioned descendant-mutation path
(Path C v2).

## Suggested upstream fix

Path B sketch (per the planning doc):
- Add `properties: { title: string, body: string, footer: string }` as
  TEXT component-property declarations on hx-card variant root.
- In each variant's `figma.createComponent()` call, bind the title/body
  TextNode's characters to the TEXT prop:
  `title.componentPropertyReferences = { characters: titlePropKey };`
- Repeat for hx-stat (label / value / trend), hx-badge (label).
- emit-shape suite + chrome-vocabulary-conformance stay green — neither
  cares about descendant-text mutation since the binding goes through
  the property reference, not a raw `.characters` write.

## Local workaround (if any)

Sibling insertion of pure-visual atoms (hx-divider) where it makes
sense; literal SolidPaint elsewhere. Documented in the chrome-instance-
text sentinel comment in scripts/test-emit-shape.ts so a future author
knows the path.

## Cross-references

- Path B planning doc: `bst-cto-kb/00-Planning/create-helix-app/Path B — TEXT Component Properties on Helix Renderers.md`
- HEAD `701de34` — text-overlap thrash + Reference-Shape Replication
  Strategy (closed Phase B precursor)
- Reference-Shape Replication Strategy.md §1.4 + §7 — out-of-scope
  inverse-text ramp gating

## Recommendation for next session

Reload Figma, run `Refresh Reference Pages`, visual-diff Cover +
Foundations vs. HEAD `701de34`. Focus areas:
1. Are hx-divider separators rendering between sections + legend rows
   + spacing rows?
2. Do they flip with the Helix Semantics mode toggle?
3. Does the layoutSizingHorizontal=FILL try/catch ever throw? (Check
   Figma console for the `instance variant disallowed FILL` warning.)

If visuals look good, schedule Path B as a multi-session arc per the
planning doc.
