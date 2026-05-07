# NOTES-FOR-FIGGY-DEFAULTS

Recommendations for the figma-tokens (figgy) plugin's parallel "documentation
defaults" workstream, captured while building the wc-storybook docs MDX
defaults in `create-helix-app` (branch `feature/wc-storybook-docs-defaults`).

**Scope:** notes only. This file does NOT modify the figma-tokens repo. It
captures the surface that figgy should ALSO populate so the visual surface
in Figma stays aligned with the Storybook docs surface a developer sees.

**Status:** advisory · not enforced · source of truth for a future figgy
dispatch.

---

## What wc-storybook now ships by default

A new wc-storybook scaffold drops these documentation pages under
`<project>/src/stories/docs/`:

| Page                | What it covers                                                                                  | Bound to which tokens                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Overview.mdx`      | Three-tier token cascade narrative; quick start                                                 | `${prefix}-color-primary-500` etc.                                                         |
| `Accessibility.mdx` | WCAG 2.1 AA contract; focus rings; contrast pairings; keyboard contracts; 21 SCs covered        | `--hx-color-focus-ring`, `--hx-color-text-on-*`                                            |
| `Color.mdx`         | Semantic-tier surfaces / text / actions / status; measured contrast pairings; override patterns | `--hx-color-surface-*`, `--hx-color-action-*`, `--hx-color-{success,warning,error,info}-*` |
| `Typography.mdx`    | Inter + JetBrains Mono; 10-stop scale; six weights                                              | `--hx-font-family-{sans,mono}`, `--hx-font-size-*`, `--hx-font-weight-*`                   |
| `Spacing.mdx`       | 4px-base 15-stop scale; density modes; padding rhythm; vertical rhythm                          | `--hx-space-*`                                                                             |
| `Brand.mdx`         | Override surface; cascade rules (HC suppresses brand); voice; do/don't                          | `${prefix}-color-primary-*`, `${prefix}-color-secondary-*`                                 |
| `Layout.mdx`        | Responsive mode chain (mobile/tablet/desktop); touch target floor; reduced-motion               | `--hx-touch-target-min`; mode-aware density tokens                                         |

Plus the existing live-bound design-token stories (`Colors`, `Borders`,
`Shadows`, `Spacing`) that show real swatches/bars from the consumer's
`tokens.json`.

A new consumer-facing config — `helix.storybook.config.ts` — controls
which Helix components surface as auto-generated catalog stories AND
which docs pages render:

```ts
interface HelixStorybookConfig {
  components: { include: 'all' | string[]; exclude: string[] };
  docs: { include: 'all' | DocsPageId[]; exclude: DocsPageId[] };
}
```

The `DocsPageId` union is stable: `'overview' | 'accessibility' | 'brand' |
'color' | 'typography' | 'spacing' | 'layout'`. **Figgy should align to the
same id set** when it ships its own page surface (see below).

---

## What figgy should mirror

The Figma side and the Storybook side should agree on what a "design system
documentation surface" includes. Right now wc-storybook ships seven pages;
figgy's plugin UI (the Helix Token Suite) should expose equivalent **frames
and Figma documentation pages** so Figma stays as a source of truth, not a
shadow.

### A. Token-export-time documentation frames (figgy → Figma)

When the Custom Helix Exporter writes `tokens.json`, it should ALSO write
or refresh seven frames in a designated Figma "Design System Docs" page,
keyed to the same `DocsPageId` set:

| DocsPageId      | Figma frame name       | Content                                                                                                               |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `overview`      | `Docs / Overview`      | Brand identity at top; three-tier token cascade visualized as 3 columns; primitive → semantic → component swatches    |
| `accessibility` | `Docs / Accessibility` | Contrast pairings as a matrix (AAA / AA / AA-large pills); 4×4 focus-ring sample grid; "never color alone" 3-card row |
| `color`         | `Docs / Color`         | Eight ramps (primary..info), 11 stops each; semantic surface/text/action/status callouts                              |
| `typography`    | `Docs / Typography`    | Two family cards (Inter, JetBrains Mono); type scale with sample text per stop; weights row                           |
| `spacing`       | `Docs / Spacing`       | Bar visualization of all 15 stops; density-mode triple (compact/default/touch) with the same patient-list mock        |
| `brand`         | `Docs / Brand`         | Brand registry tile grid; cascade rule callouts; do/don't pairs                                                       |
| `layout`        | `Docs / Layout`        | Mobile/tablet/desktop comparison strip for one component; reduced-motion note                                         |

These frames already exist in essence as the HELiX Design System HTML
reference at `/Volumes/Development/HELiX Design System/`. Figgy should be
able to **regenerate them from `tokens.json`** rather than relying on
hand-authored Figma frames that drift.

### B. Frame-export round-trip

Every export run should:

1. Walk the docs page set (the `DocsPageId` union, mirrored on both sides).
2. For each page, regenerate the corresponding Figma frame from the latest
   token tree.
3. Annotate each frame with the `DocsPageId` in the frame's plugin-data
   namespace so subsequent runs know which frames they own.
4. Leave non-docs frames untouched.

### C. Don't reinvent the contrast-matrix render

The Accessibility MDX page in wc-storybook computes contrast pairings from
the token semantic tier and renders them as a 4×4 matrix. Figgy should
read the SAME pairing list from `tokens.json` semantic tier (or
`@helixui/tokens` CEM-equivalent) and emit a matching visual matrix in the
`Docs / Accessibility` frame. If figgy and wc-storybook disagree on which
pairings count, the design surface and the implementation surface drift.

### D. Brand-aware documentation pages

The `Brand.mdx` page in wc-storybook surfaces the consumer's `tokenPrefix`
in override examples. Figgy's `Docs / Brand` frame should likewise read
the active brand from the token tree so the override example shown to a
designer matches the override example a developer sees.

### E. Reduced-motion and forced-colors footnotes

Every animated demo in wc-storybook docs is gated on
`prefers-reduced-motion: reduce`. Figgy can't emit motion (Figma frames
are static), but the `Docs / Accessibility` frame should still surface
the forced-colors and reduced-motion callouts as text plus an icon row
so a designer reviewing in Figma sees the same accessibility constraints
a developer reads in Storybook.

---

## Naming + id alignment (CRITICAL)

The `DocsPageId` union in `helix.storybook.config.ts` is the contract:

```ts
type DocsPageId =
  | 'overview'
  | 'accessibility'
  | 'brand'
  | 'color'
  | 'typography'
  | 'spacing'
  | 'layout';
```

When figgy ships its docs-frame regenerator, it MUST use the same id set
(plugin-data key on each frame). Otherwise the wc-storybook-side
`docs.exclude: ['accessibility']` knob can't drive a parallel
"hide this frame in Figma too" behavior in figgy.

**Stretch goal:** figgy reads `<project>/helix.storybook.config.ts` from
the linked workspace and applies the same docs filter to the Figma frame
visibility (e.g. via a "hidden" plugin-data flag, or by moving filtered
frames to a `Docs / _hidden` page).

---

## Out of scope (do NOT do in figgy)

- **Do not generate component stories.** The CEM-driven catalog
  generator on the Storybook side already does this and reads the same
  config knob. Figma keeps showing the brand/token frames; Storybook
  keeps owning component-level documentation.
- **Do not duplicate live token rendering.** The wc-storybook side reads
  `tokens.json` at build time AND consumes CSS custom properties at
  render time. Figma frames are fine to be static snapshots refreshed on
  each export run; do not try to "live-bind" Figma to a CSS variable.
- **Do not introduce new helix-tokens.** Use the existing primitive +
  semantic surface. If a doc frame can't be expressed in current tokens,
  surface that as a feature request on the helix repo, NOT a figgy-side
  workaround.

---

## Coordination checklist for the figgy dispatch

When the figgy parallel-docs work is dispatched:

- [ ] `DocsPageId` union mirrored exactly (same string ids)
- [ ] Seven frames regenerated from `tokens.json` on export
- [ ] Plugin-data namespace tags each frame with its `DocsPageId`
- [ ] Brand override example reads the active brand
- [ ] Forced-colors + reduced-motion callouts present in `Docs / Accessibility`
- [ ] CHANGELOG entry on figgy side; coordinate version bump with helix
- [ ] Test plan: import a fresh wc-storybook scaffold, run figgy export
      on the linked Figma file, confirm frames appear with matching ids

---

## Source

This file is a snapshot of the parallel-docs surface as of branch
`feature/wc-storybook-docs-defaults` in `create-helix-app`. The actual
figgy-side implementation is **not** part of this branch — only the
recommendation set is captured here so a future figgy dispatch lands on
solid ground.
