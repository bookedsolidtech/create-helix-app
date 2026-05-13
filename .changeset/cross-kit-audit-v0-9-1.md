---
'create-helix': patch
---

Cross-kit audit harmonization sweep.

**What changed for consumers**

Scaffolded apps across all 4 production kits (react-next, react-vite, astro, svelte-kit) now share a consistent consumer surface:

- Same hero h1: "Build interfaces on web standards."
- Same `<title>`: "{name} — built with create-helix"
- Same theme toggle UI (native `<button>` with aria-label)
- Same `localStorage` key (`helix-theme`)
- Same pre-hydration theme boot pattern (zero flash of unstyled content for dark-mode users)
- Same hero CTA pattern (styled `<a>` elements with `.button` classes — work pre-hydration / no-JS)

**Bugs fixed**

- `pnpm install && pnpm --filter=@scope/web type-check` now succeeds cold for react-next + react-vite (DS package `exports['.']` points at source per the Turborepo internal-packages recipe, eliminating the dist/-doesn't-exist trap).
- SvelteKit apps/web no longer emits a "Cannot find type definition file for 'node'" warning (`@types/node` now declared).
- react-next + react-vite now ship a `<main>` landmark on every route — exactly one per page, never wrapping Navbar/Footer.
- `<hx-progress-bar>` uses the native `label` attribute (was `aria-label`, which axe flagged as `aria-prohibited-attr` on a custom element).
- Footer headings demoted from `<h4>` to `<h3>` (eliminates `heading-order` violations).
- Footer inline links underline by default (passes WCAG 1.4.1 `link-in-text-block`).

**A11y delta**

Total axe-core violations across home + components for all 4 kits: **24 → 1** (only remaining is upstream HELiX `hx-select` placeholder contrast — out of scope, filed upstream).

**Test count**

3,168 passing (8 skipped, E2E-only). No behavior changes for non-monorepo or non-react flows.
