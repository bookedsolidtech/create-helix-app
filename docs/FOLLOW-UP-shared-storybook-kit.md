# Follow-up: `@helixui/storybook-kit` shared package extraction

**Status:** DEFERRED. This doc tracks what would have to change for a shared
package to replace the parallel-maintenance pattern this branch shipped.

## Why this is here

Phases 1-4 of the `feature/wc-storybook-helix-lift` work (landed 2026-05-10)
ported ~30 React helper components + MDX docs from
`helix/apps/storybook/stories/` into `create-helix-app`'s wc-storybook
factory. Both repos are MIT/Clarity House LLC, so the port was license-clean.

The user accepted the parallel-maintenance debt knowingly. Every helix
update to `_components/`, `accessibility/`, or `components/` MDX content
must now be hand-mirrored into `src/scaffold/wc-storybook/{helpers,
audit-stub,mdx-components,mdx-accessibility,mdx-tokens,scenes}.ts`.

## Trigger to escalate

Schedule the extraction when one of these fires:

1. **2+ helix MDX drift events** — if helix's `_components/` or
   `accessibility/` MDXes change in 2+ ways before a future create-helix-app
   release without the changes being mirrored, the parallel-maintenance
   tax has exceeded the extraction tax.
2. **Consumer demand for AAA-AUDIT.md content** — InlineAuditPanel ships
   as opt-in no-op (audit-stub.ts) because per-component AAA-AUDIT.md
   files live at `packages/hx-library/src/components/hx-*/AAA-AUDIT.md`
   inside the helix monorepo and aren't published with @helixui/library.
   Demand for live audit content forces the extraction (or a
   bundle-into-@helixui/library upstream change).
3. **A third codebase wants the same kit** — if any future BST design
   system (or third-party HelixUI consumer) wants the editorial Storybook
   experience, "publish it as a package" beats "ask them to scaffold via
   create-helix-app."

## Sketch of the package

`@helixui/storybook-kit` would ship:

- The 8 React helpers (`TokenSwatchGrid`, `ContrastMatrix`, `RatioCard`,
  `CodeBlock`, `CodeTabs`, `useResolvedToken`, `contrast`, `TokenRef`)
- Base MDX templates with `{{tag}}` / `{{class}}` Mustache-style placeholders
- A runtime audit loader (resolves AAA-AUDIT.md from a configurable path,
  with a fallback to the opt-in no-op)
- Type definitions for the helper components
- Stable subpath exports per category (`@helixui/storybook-kit/helpers`,
  `@helixui/storybook-kit/mdx`, etc.)

Both helix's `apps/storybook/` and create-helix-app's wc-storybook factory
would consume the package instead of maintaining their own copies.

## Coordination required

- Helix team: agree to author MDX templates with placeholder tokens that
  the kit can re-bind at consumer scaffold time. Right now helix's MDXes
  hardcode `hx-` prefixes throughout; the kit needs them parameterized.
- Helix team: decide whether `@helixui/storybook-kit` ships from the helix
  monorepo (sibling to `@helixui/library`, `@helixui/tokens`, `@helixui/icons`)
  or from this repo. Recommend the helix monorepo so it stays in lockstep
  with the CEM and tokens contract.
- create-helix-app: scaffolder switches from emitting source strings to
  installing the package + emitting a thin `helix.storybook.config.ts`
  that points at the kit's exported templates. Net effect: scaffolder
  loses ~5000 LOC of emitter content, gains a config knob.

## Estimated cost

- Helix-side: 1.5-2 weeks (extracting the kit + parameterizing MDX templates
  - republishing tokens with a `contrast-data` subpath if not already
    exported).
- create-helix-app-side: 3-4 days (rewiring scaffold.ts to install +
  emit thin config; deleting the per-emitter modules; refreshing tests).

## Hold conditions

- Do NOT start this work until helix team has bandwidth for the
  parameterization + a 2-week republish window.
- Do NOT start while CEM contract is unstable. The kit's helpers read
  `helixMeta.aaa.*` fields; CEM evolution must settle first.
  (Per `project_helix_aaa_full_compliance.md` memory: CEM stabilization
  expected ~2026-05-11.)
