# create-helix

## 0.9.4

### Patch Changes

- de1ac9c: Fix the `act-ci.yml` workflow that GitHub was rejecting as malformed

  Discovered while shipping v0.9.3 — the `test-full` job's `if:` used
  `env.ACT_MATRIX_TESTS == 'true' || …`, but the `env` context is not
  available in job-level `if:` (only step-level). GitHub refused to parse
  the workflow and showed "workflow file issue" / 0s failure on every push
  for weeks.

  **Fix:**
  - Switch to `vars.X` (which IS allowed at job level) and update
    `scripts/act-ci.sh` to pass `--var` instead of `--env`.
  - Change the workflow trigger from `pull_request` to `workflow_dispatch`
    so GitHub never auto-runs this workflow. Without that guard, fixing the
    parse error would have made GitHub start executing duplicate CI on
    every PR (this workflow's jobs are act-local copies of the ones in
    `ci.yml`). `scripts/act-ci.sh` updated to invoke `act workflow_dispatch`
    accordingly.

  **Out of scope for this release:**

  The `release.yml` SBOM step (also broken — `pnpm run sbom` aborts because
  `cyclonedx-npm` calls `pnpm ls --all` which `pnpm` rejects) is **NOT**
  fixed here. Attempts to swap in `@cyclonedx/cdxgen` cascaded into
  audit-gate failures (cdxgen's transitive dependency tree includes
  `sequelize@6.x` with HIGH-severity advisories), and cdxgen's
  `--required-only` filter drops production transitives — neither extreme
  produced an accurate, ship-safe SBOM. The Generate SBOM + Upload SBOM
  steps are removed from `release.yml` so they stop blocking release
  notifications, and picking a workable SBOM stack is moved to its own
  focused follow-up task. The team's existing manual Discord-notify
  workflow is unchanged.

  Also: `sbom.json` is added to `.gitignore` as a precaution for the
  follow-up SBOM work.

## 0.9.3

### Patch Changes

- 5d76233: Wire `@helixui/tokens@3.x` into the Drupal scaffold (v0.9.3)

  v0.9.2 deliberately left every Drupal preset pinned to `@helixui/tokens@^0.2.0`
  with carve-outs in `doctor` + `upgrade` so they wouldn't push Drupal
  scaffolds onto an unverified 3.x contract. Investigating that work for
  v0.9.3 surfaced a deeper latent bug: the Drupal scaffold has **always**
  declared `@helixui/tokens` as a dependency but **never** loaded its CSS,
  so every `var(--hx-*, fallback)` reference in the generated theme silently
  resolved to its inline fallback instead of the upstream brand token.

  v0.9.3 closes that loop for **fresh** Drupal scaffolds:
  - The generated `{theme}.libraries.yml` declares a dedicated `helix-tokens`
    library that loads `css/vendor/helix-tokens.css` at `weight: -200`, and
    `global` depends on it — tokens are in place before any theme CSS that
    references them loads.
  - The generated `css/style.css` `@import`s `vendor/helix-tokens.css` FIRST,
    ahead of `helix-responsive.css` and `helix-overrides.css`. Cascade order
    is: upstream tokens → responsive defaults → consumer overrides.
  - **`css/vendor/helix-tokens.css` is vendored at SCAFFOLD time from a
    BUILD-TIME-BUNDLED copy.** `scripts/add-shebang.mjs` runs at every
    create-helix build and copies `@helixui/tokens/dist/tokens.css` into
    `dist/assets/helix-tokens.css`. The published tarball ships that fixed
    copy, and `scaffoldDrupalTheme` reads from it at scaffold time. This
    makes the scaffold output deterministic per create-helix release — the
    same create-helix version always emits the same bytes, independent of
    how the installer's npm/pnpm/yarn resolves transitive deps. (A fallback
    to runtime `require.resolve` of the package's exported CSS subpaths
    covers vitest tests against `src/`, where the dist artifact doesn't
    exist.) Scaffold-time vendoring also matters because Drupal theme users
    typically don't run `npm install` inside the theme directory — the
    documented setup is `cp -r theme/` + `drush theme:enable`, neither of
    which fires a Node install.
  - The scaffold also emits `scripts/copy-helix-tokens.mjs` and wires it to
    the `package.json` postinstall hook. This is the REFRESH path: when a
    developer does run `npm install` in the theme and gets a different
    `@helixui/tokens` version, the vendored copy is kept in sync. The script
    resolves `@helixui/tokens` via Node module resolution (`createRequire` +
    `require.resolve` of the exported CSS subpaths — NOT `package.json`,
    which `@helixui/tokens@3.x`'s exports map doesn't publish), so
    hoisted/workspace installs work the same as flat ones.
  - `src/presets/loader.ts` now imports `HELIX_TOKENS_VERSION` from
    `helix-versions.ts` — Drupal joins every framework template on the
    centralized pin (`^3.9.1`). `create-helix`'s own `@helixui/tokens`
    dependency is bumped to the same range (and both lockfiles refreshed)
    so the build-time bundling picks up the 3.9.1 bytes.

  **`doctor` and `upgrade` exempt `@helixui/tokens` for ALL Drupal scaffolds
  in this release.** The runtime token layer for any Drupal theme is
  `css/vendor/helix-tokens.css`, not the declared range in `package.json`
  or the contents of `node_modules/@helixui/tokens`. Bumping the pin alone
  would advance the declaration while the theme keeps serving stale token
  bytes (the documented `cp -r theme/` + `drush theme:enable` flow doesn't
  run `npm install`, so the theme's postinstall script never fires to
  refresh the vendored CSS). No honest `@helixui/tokens` upgrade exists for
  an existing Drupal theme yet, so both checks skip it. The v0.9.4 follow-up
  will make `runUpgrade` Drupal-theme-aware — refresh `css/vendor/helix-tokens.css`
  from create-helix's bundled copy and, for pre-v0.9.3 themes, also inject
  the wiring files (`scripts/copy-helix-tokens.mjs`, the `helix-tokens`
  library entry, the `style.css` `@import`). At that point the skips can be
  dropped entirely.

## 0.9.2

### Patch Changes

- ed3c93b: Fix HELiX dependency-version drift in scaffold templates + the `upgrade` command

  **The bug (caught by the Pulse implementation test):** every template hardcoded
  its own `@helixui/library` / `@helixui/tokens` range — most at `^1.0.0` / `^0.3.0`,
  two to three majors behind current HELiX (`3.9.1`). The pins were set once and
  never tracked HELiX's releases, so 4 of 5 production templates (`react-next`,
  `react-vite`, `svelte-kit`, `astro`) and every experimental template scaffolded
  apps that started silently stale.

  **What changed for consumers:**
  - New scaffolds now pin `@helixui/library` / `@helixui/tokens` at `^3.9.1` and
    `@helixui/icons` at `^1.0.1`, from a single source of truth (`helix-versions.ts`)
    so future HELiX bumps are a one-line change. Every app template that consumes
    `@helixui/library` now also declares the `@helixui/icons` peer it requires
    under 3.x.
  - App templates (`astro`, `svelte-kit`, `react-next`, `react-vite` — flat and
    monorepo) now self-host the `@helixui/icons` sprite sheets. HELiX 3.x's
    `<hx-icon>` resolves sprites from a cross-origin jsDelivr CDN by default,
    which the browser blocks — every scaffolded page threw console errors.
    The scaffold now emits `scripts/copy-helix-icons.mjs` (a postinstall step
    that copies the sprites into `public/icons/` — `static/icons/` for SvelteKit)
    and calls `setBasePath('/icons')` in the runtime loader before
    `@helixui/library` loads, so icons resolve same-origin.
  - `create-helix doctor` gains `@helixui/library` and `@helixui/tokens` drift
    checks — an existing scaffold that has fallen majors behind now gets told,
    with `create-helix upgrade` named as the fix. The checks follow a monorepo
    scaffold into `apps/web/`, are skipped under `--quick` (they need an
    installed `node_modules`), and `checkHelixIcons` now fails — rather than
    silently skipping — when `@helixui/library@3.x` is present but its required
    `@helixui/icons` peer is not. (Also fixes a latent `checkHelixIcons` bug: it
    resolved `<pkg>/package.json` via `createRequire`, which throws against
    modern `exports`-gated packages.)
  - `create-helix upgrade` is fixed end to end: `--offline` is now honored and
    backed by the on-disk registry cache (graceful degradation when the network
    is down, with partial-failure backfill); `peerDependencies` are read and
    written alongside `dependencies` / `devDependencies` so wc-storybook scaffolds
    stay internally consistent; version comparison is semver-aware and leaves a
    dependency untouched unless it can prove the registry version is strictly
    newer (no downgrades, even for unparseable ranges like `4.x`); and when it
    bumps `@helixui/library` into the 3.x range it adds the now-required
    `@helixui/icons` peer, with a note pointing at the remaining same-origin
    sprite-wiring step.
  - The vanilla template's CDN `<script>` tags are pinned to a concrete version
    instead of `@latest`, for reproducible loads.

  Existing scaffolds are not broken — run `create-helix doctor` to see drift, then
  `create-helix upgrade` to move onto current HELiX.

## 0.9.1

### Patch Changes

- 0a1f20e: Cross-kit audit harmonization sweep.

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

## 0.9.0

### Minor Changes

- 8982616: feat(v0.9.0): SvelteKit joins the production tier

  The Q1 picker now offers **five** production-tier targets: `wc-storybook`,
  `react-next`, `react-vite`, `astro`, and **`svelte-kit`**. Selecting
  `svelte-kit` and keeping the design system (default Y at Q2) emits a real
  **SvelteKit 2 + Svelte 5** monorepo on `adapter-static`:
  - A serious landing page (`apps/web/src/routes/+page.svelte`) with hero,
    feature cards, and a live component showcase — uses `<hx-button>`,
    `<hx-card>`, `<hx-icon>`, `<hx-text-input>`, `<hx-checkbox>`, `<hx-tabs>`
    natively. Svelte 5's compiler treats unknown lowercase-with-dash tags as
    DOM elements first-class — no React-wrapper indirection, no
    `isCustomElement` config required.
  - Browser-native **View Transitions API** integration via SvelteKit's
    `onNavigate` hook (the canonical pattern from the official docs).
    Routes morph GPU-accelerated; falls back silently on Firefox <127 /
    older Safari.
  - `+layout.svelte` carries an `onMount`-gated dynamic
    `import('@helixui/library')` so the HELiX runtime loader runs once on
    hydration in the browser without contaminating the SSR/prerender bundle.
  - A second routed page (`/components`) demonstrates the view-transition
    morph and exercises the same `<hx-*>` registry across navigations.
  - A light/dark `ThemeToggle.svelte` flips `<html data-theme>` and
    persists to `localStorage` (with a sync inline boot script in
    `app.html` to avoid flash-of-incorrect-theme).
  - Visual baselines under `tests/e2e/screenshots/sveltekit/` (3 PNGs:
    home-light, components-light, home-dark) gated behind `E2E_VISUAL=1`,
    same Playwright pattern as v0.8.0 Astro.

  The flat SvelteKit path stays reachable via `--no-design-system` for
  back-compat. The monorepo is the supported shipping target going forward.

  **Counts**: 5 production / 11 experimental / 16 total framework targets.

  **Drive-by fix**: cleared a stale `experimental: true` flag on the
  `astro` template in `src/templates.ts` (left over from the v0.8.0
  elevation — visible only via the `--show-experimental` listing).

  **`@sveltejs/vite-plugin-svelte` bumped to `^6.0.0`** — the v4 line
  peer-requires Vite 5; the repo runs Vite 7. Without this bump, consumer
  `pnpm install` printed `ERR_PNPM_PEER_DEP_ISSUES` and the dev server's
  HMR layer could silently break.

## 0.8.0

### Minor Changes

- 022fb24: v0.8.0 — **Astro joins the production-tier starter kits as a turbo monorepo.**

  The Q1 starter-kit picker now offers four production-tier targets: `wc-storybook`, `react-next`, `react-vite`, and **`astro`**. When the consumer picks Astro and keeps the design system at Q2 (the default Y), `create-helix` emits a turbo + pnpm-workspaces monorepo with `apps/web/` (a real Astro 5 landing page — view transitions, theme toggle, two routed pages, native `<hx-*>` web component consumption) plus the same `packages/{design-system,types,utils}/` triad shipped in v0.7.0.

  **Phases shipped this minor:**
  - **Phase A — scaffolder fork.** `src/scaffolders/astro.ts` forked into `astro/{flat,monorepo,_shared}.ts`. Flat emit preserved byte-for-byte from v0.7.x.
  - **Phase B — dispatch wiring.** Astro added to the starter-kit Q1 picker; the `monorepoMode` / `includeDesignSystem` flags route through the same normalizer Next/Vite already use.
  - **Phase C — Astro monorepo emit.** `apps/web/` ships `name: "@{scope}/web"`, `workspace:*` deps on the workspace packages, an Astro 5 config wired for the workspace setup, a serious landing page (hero + features + tech stack), view transitions, a theme toggle that respects `prefers-color-scheme`, and two routed pages (`/about`, `/docs`). The web components are consumed natively as `<hx-*>` tags — no React-wrapper indirection.
  - **Phase D — Playwright visual gate.** First visual-regression baseline in the project. `tests/e2e/astro-monorepo-visual.test.ts` (gated on `E2E=1`) scaffolds → installs → type-checks → boots the dev server → renders the home / about / docs routes with Playwright → asserts each `hx-*` element upgraded → snapshots three committed PNGs under `tests/e2e/screenshots/astro/`.
  - **Phase E — golden snapshot + integration coverage.** New `astro-monorepo` golden under `tests/golden/` plus integration tests pinning the dispatcher, the workspace layout, and the icon-name choices to FA-free names that actually exist in the Astro icon catalog.
  - **Phase F — docs + changeset.** This entry. Plus the v0.7 → v0.8 section in `MIGRATING.md`, the README rework, and the final smoke that boots Astro 4321 + Storybook 6006 concurrently via `turbo run dev`.

  **Flat Astro deprecated.** The flat Astro scaffolder is still reachable via the API (`scaffold({ framework: 'astro', monorepoMode: false })`) and the `--no-design-system` CLI opt-out for back-compat — same escape valves as Next/Vite carry. But it is no longer the supported shipping target: future Astro investment lands in the monorepo path. New scaffolds should use the monorepo default; existing flat scaffolds keep working unchanged.

  **Visible UX changes consumers will notice immediately:**
  - _Astro in Q1._ BEFORE (v0.7.x): the curated Q1 list was `wc-storybook`, `react-next`, `react-vite`, `drupal-theme`; Astro lived under `--show-experimental` alongside 12 other stubs. AFTER (v0.8.0): the curated Q1 list grows to five entries with Astro added. The same monorepo orchestration that backs Next/Vite now backs Astro.
  - _WC-native consumption pattern._ Unlike Next/Vite (which use generated React wrappers from `packages/design-system/src/react.ts`), the Astro monorepo consumes the design system as `<hx-*>` web components directly. Astro's island architecture is web-component-first — no wrapper indirection needed.
  - _First visual baseline._ `tests/e2e/screenshots/astro/` is the project's first committed Playwright visual baseline. Consumers can preview what the Astro starter looks like before they scaffold.

  See [`MIGRATING.md`](./MIGRATING.md) v0.7 → v0.8 for the flat-Astro deprecation framing and the v0.7.0 manual recipe (which also covers the v0.8.0 Astro monorepo because it follows the same workspace shape).

## 0.8.0

### Minor Changes

- v0.8.0 — **Astro joins the production-tier starter kits as a turbo monorepo.** The Q1 starter-kit picker now offers four production-tier targets: `wc-storybook`, `react-next`, `react-vite`, and **`astro`**. When the consumer picks Astro and keeps the design system at Q2 (the default Y), `create-helix` emits a turbo + pnpm-workspaces monorepo with `apps/web/` (a real Astro 5 landing page — view transitions, theme toggle, two routed pages, native `<hx-*>` web component consumption) plus the same `packages/{design-system,types,utils}/` triad shipped in v0.7.0.

  **Astro monorepo support (new).** `src/scaffolders/astro/monorepo.ts` emits `apps/web/` with `name: "@{scope}/web"`, `workspace:*` deps on the workspace packages, an Astro 5 config wired for the workspace setup, and `tsconfig.json` extending `tsconfig.base.json`. The landing page ships a hero + features + tech-stack stack, a theme toggle that respects `prefers-color-scheme`, view transitions across navigation, and two routed pages (`/about`, `/docs`). The design system is consumed natively as `<hx-*>` tags — no React-wrapper indirection, because Astro's island architecture is web-component-first. The shared workspace shape (`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `packages/{design-system,types,utils}/`) is the same one v0.7.0 introduced for Next/Vite, so the dev lifecycle (`turbo run dev` boots Astro at 4321 and Storybook at 6006 concurrently) is consistent across all three app frameworks.

  **Playwright visual gate (new).** `tests/e2e/astro-monorepo-visual.test.ts` is the first visual-regression baseline in this project. Gated on `E2E=1`, it scaffolds → `pnpm install` → `pnpm type-check` → boots the Astro dev server → uses Playwright to render the home / about / docs routes → asserts every `hx-*` element on the page has upgraded → snapshots three PNGs committed under `tests/e2e/screenshots/astro/`. Combined with the three v0.7.0 monorepo install gates, the v0.8.0 release ships **four E2E gates green** end-to-end.

  **Flat Astro deprecated.** The flat Astro scaffolder is still reachable via the API (`scaffold({ framework: 'astro', monorepoMode: false })`) and the `--no-design-system` CLI opt-out for back-compat — same escape valves as Next/Vite. But it is no longer the supported shipping target: future Astro investment lands in the monorepo path. New scaffolds should use the monorepo default; existing flat scaffolds keep working unchanged. See [`MIGRATING.md`](./MIGRATING.md) v0.7 → v0.8 section.

  **Phases shipped this minor:**
  - **Phase A — scaffolder fork (`eff1a90`).** `src/scaffolders/astro.ts` forked into `astro/{flat,monorepo,_shared}.ts`. Flat emit preserved byte-for-byte from v0.7.x.
  - **Phase B — dispatch wiring (`eff1a90`).** Astro added to the starter-kit Q1 picker; the `monorepoMode` / `includeDesignSystem` flags route through the same normalizer Next/Vite already use.
  - **Phase C — Astro monorepo emit (`03fd7c8`).** `apps/web/` with serious landing page (hero + features + tech stack), view transitions, theme toggle, two routed pages.
  - **Phase C-fix (`c2bba01`).** Scrubbed literal `<script>` tokens from `Layout.astro` JSDoc/comments that broke Vite esbuild parse.
  - **Phase D — Playwright visual gate (`e470c54`).** `tests/e2e/astro-monorepo-visual.test.ts` + 3 committed PNG baselines under `tests/e2e/screenshots/astro/`.
  - **Phase D-fix (`47e6b34`).** Use FA-free icon names that actually exist (`shield-halved`, `palette`, `rocket`) instead of names that resolved to placeholders.
  - **Phase E — golden snapshot + integration coverage (`85d3aa5`).** New `astro-monorepo` golden under `tests/golden/` plus integration tests pinning the dispatcher and workspace layout.
  - **Phase F — docs + changeset (this entry).** Final preflight, MIGRATING.md v0.7 → v0.8 section, README rework, and the live smoke that boots Astro 4321 + Storybook 6006 concurrently via `turbo run dev`.

  **Visible UX changes consumers will notice immediately:**
  - _Astro in Q1._ BEFORE (v0.7.x): the curated Q1 list was `wc-storybook`, `react-next`, `react-vite`, `drupal-theme`; Astro lived under `--show-experimental` alongside 12 other stubs. AFTER (v0.8.0): the curated Q1 list grows to five entries with Astro added. The same monorepo orchestration that backs Next/Vite now backs Astro.
  - _WC-native consumption pattern._ Unlike Next/Vite (which consume the design system via generated React wrappers at `packages/design-system/src/react.ts`), the Astro monorepo consumes `<hx-*>` web components directly. Astro's island architecture is web-component-first — no wrapper indirection needed.
  - _First visual baseline._ `tests/e2e/screenshots/astro/` is the project's first committed Playwright visual baseline. Consumers can preview what the Astro starter looks like before they scaffold.

  **Opt-out paths (preserve flat Astro behavior):**
  - Interactive: answer "n" at Q2.
  - CLI: `--no-design-system`.
  - API: `scaffold({ framework: 'astro', monorepoMode: false })`.

  **NOT breaking.** Existing v0.7.x scaffolds are unaffected. v0.6.x and v0.5.x scaffolds (flat) are unaffected. New scaffolds default to the monorepo shape for `react-next`, `react-vite`, and now `astro`.

## 0.7.0

### Minor Changes

- 85ec829: v0.7.0 — **two-step starter-kit picker + monorepo by default for app frameworks.**

  The interactive prompt now asks two questions instead of one: (1) "What does this project build?" — `wc-storybook`, `react-next`, `react-vite`, or `drupal-theme` — and (2) when the answer is an app framework, "Include `@{scope}/design-system` package?" (Y/n, default **yes**). When the consumer keeps the design system, `create-helix` emits a turbo + pnpm-workspaces monorepo (`apps/web/` + `packages/{design-system,types,utils}/`) modeled on the [shadcn `apps/web` + `packages/ui` precedent](https://github.com/shadcn-ui/ui/tree/main/apps/www). `wc-storybook` continues to scaffold flat — it is the design system, so wrapping it would duplicate the layer.
  - **Phase A — scaffolder fork.** `react-next`, `react-vite`, and `wc-storybook` scaffolders forked into `{flat, monorepo, _shared}.ts` modules. Flat emit preserved byte-for-byte from v0.6.x.
  - **Phase B — two-step prompt + flag plumbing.** New "Pick a starter kit" prompt, `monorepoMode` + `includeDesignSystem` API fields, `--monorepo` / `--no-design-system` CLI flags. Three input paths (interactive / CLI / API) feed a single normalizer.
  - **Phase C — monorepo orchestrator.** `scaffoldMonorepoRoot()` emits `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `tsconfig.json` (project refs), `tsconfig.base.json` (shared compiler options + path aliases), tooling configs, and a monorepo-shaped root README.
  - **Phase D — Next.js apps/web.** `react-next` monorepo emits `apps/web/` with `name: "@{scope}/web"`, `workspace:*` deps, `transpilePackages` for each consumed package, `experimental.externalDir: true`, and a `tsconfig` extending the base + `paths` aliases.
  - **Phase E — Vite apps/web.** `react-vite` monorepo emits `apps/web/` with the same workspace shape plus `optimizeDeps.exclude` and `server.fs.allow: ['..', '../..']` for cross-workspace dev server reads.
  - **Phase F — wc-storybook packages/design-system.** When Q1 picks `wc-storybook`, scaffolds flat. When `react-next` or `react-vite` keeps DS at Q2, the DS emitter ports `wc-storybook`'s Storybook depth into `packages/design-system/` + a React wrappers barrel at `packages/design-system/src/react.ts`. Phases D/E retrofitted to call this DS emitter.
  - **Phase G — packages/types + packages/utils.** Two stub workspace packages. `types` exports `AppEnv`, `Id<TBrand>` branded-string utility, `NonEmptyArray<T>`. `utils` exports `cn`, `isPresent`, `assertNever`. Both ship `tsconfig` extending the base, declared workspace names, and vitest stubs.
  - **Phase H — golden snapshots + E2E install gate.** Three new monorepo golden snapshots (`wc-storybook-monorepo`, `react-next-monorepo`, `react-vite-monorepo`) plus `tests/e2e/monorepo-install.test.ts` gated by `E2E=1` running an actual `pnpm install && pnpm type-check` end-to-end (~33s for all three).
  - **Phase H follow-up — Phase F bug fixes.** Three regressions surfaced by the E2E gate fixed: `packages/design-system/package.json` missing `@lit/react`, `packages/design-system/tsconfig.json` `include` too narrow for the generated catalog, and a `ColorTokens` cast that broke `tsc --noEmit`. Re-verified end-to-end.

  **Visible UX changes consumers will notice immediately:**
  - _Two-step prompt._ BEFORE (v0.6.x): one "Which framework?" prompt produces a flat single-app project. AFTER (v0.7.0): two prompts — "What does this project build?" then "Include design-system package?" — and when the consumer keeps both defaults (`react-next` + yes), the output is a turbo monorepo, not a single-app dir.
  - _Output shape for app frameworks._ BEFORE: `my-project/{src,public,package.json,…}` — flat. AFTER: `my-project/{apps/web,packages/{design-system,types,utils},pnpm-workspace.yaml,turbo.json,tsconfig.base.json,package.json}` — monorepo.
  - _Workspace deps._ BEFORE: a single `package.json` carries every dep directly. AFTER: `apps/web/package.json` carries `"@{scope}/design-system": "workspace:*"` (plus `types`, `utils`); the actual npm deps live in each workspace package.
  - _Dev server lifecycle._ BEFORE: `pnpm dev` runs a single dev server. AFTER: `pnpm dev` at the root runs `turbo run dev` which boots `apps/web` (port 3000) and `packages/design-system` Storybook (port 6006) concurrently. Verified end-to-end in the v0.7.0 final smoke (Next.js `Ready in 257ms`, Storybook `Storybook ready!`, catalog 99 entries).

  **Opt-out paths (preserve v0.6.x behavior):**
  - Interactive: answer "n" at Q2.
  - CLI: `--no-design-system`.
  - API: `scaffold({ framework: 'react-next', monorepoMode: false })`.

  **BREAKING for NEW scaffolds only.** v0.5.x and v0.6.x scaffolds are unaffected — their flat shape is preserved on disk and the CLI does not auto-migrate them. New scaffolds default to the monorepo shape for `react-next` and `react-vite` only.

  See [`MIGRATING.md`](./MIGRATING.md) for the v0.6 → v0.7 mental-model shift and the manual flat → monorepo recipe for early adopters. The `create-helix migrate-to-monorepo` subcommand is deferred to v0.7.1.

## 0.7.0

### Minor Changes

- v0.7.0 — **two-step starter-kit picker + monorepo by default for app frameworks.** The interactive prompt now asks two questions instead of one: (1) "What does this project build?" — `wc-storybook`, `react-next`, `react-vite`, or `drupal-theme` — and (2) when the answer is an app framework, "Include `@{scope}/design-system` package?" (Y/n, default **yes**). When the consumer keeps the design system, `create-helix` emits a turbo + pnpm-workspaces monorepo (`apps/web/` + `packages/{design-system,types,utils}/`) modeled on the [shadcn `apps/web` + `packages/ui` precedent](https://github.com/shadcn-ui/ui/tree/main/apps/www). `wc-storybook` continues to scaffold flat — it is the design system, so wrapping it would duplicate the layer.

  **Phases shipped this minor:**
  - **Phase A — scaffolder fork.** `src/scaffolders/react-next.ts`, `react-vite.ts`, and `wc-storybook.ts` forked into `{flat, monorepo, _shared}.ts` modules. Flat scaffolders preserve the v0.6.x emit byte-for-byte; monorepo scaffolders compose with the new orchestrator; `_shared.ts` holds the cross-cutting helpers (token-prefix derivation, dependency lists, brand wiring).
  - **Phase B — two-step prompt + flag plumbing.** New "Pick a starter kit" prompt (`src/cli/prompts/starter-kit.ts`). New `monorepoMode` and `includeDesignSystem` API fields on `scaffold()`. New CLI flags `--monorepo` / `--no-design-system`. Three input paths (interactive / CLI / API) feed a single normalizer so the downstream scaffolder sees one shape.
  - **Phase C — monorepo orchestrator.** `scaffoldMonorepoRoot()` emits `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (workspace scripts + dev tooling only), `tsconfig.json` (project references), `tsconfig.base.json` (shared compiler options + path aliases), `.editorconfig`, `.prettierrc`, `eslint.config.js`, and a root README that describes the monorepo shape.
  - **Phase D — Next.js apps/web emit.** `react-next` monorepo flavor emits `apps/web/` with `name: "@{scope}/web"`, `workspace:*` deps on the workspace packages, `transpilePackages` for each consumed package, `experimental.externalDir: true`, and `tsconfig.json` that extends `tsconfig.base.json` plus `paths` entries pointing at `../../packages/*/src`.
  - **Phase E — Vite apps/web emit.** `react-vite` monorepo flavor emits `apps/web/` with the same workspace shape plus Vite-specific wiring: `optimizeDeps.exclude` lists the workspace packages and `server.fs.allow: ['..', '../..']` permits the dev server to read across workspace boundaries.
  - **Phase F — wc-storybook packages/design-system emit.** When picked at Q1, `wc-storybook` always scaffolds flat. But when `react-next` or `react-vite` keeps the DS at Q2, the DS emitter ports `wc-storybook`'s Storybook depth (Cover, foundations IA, AAA conformance pages, brand toolbar, catalog auto-generation, ~99-entry hx-\* sidebar) into `packages/design-system/`, plus a React wrappers barrel at `packages/design-system/src/react.ts` so `apps/web` consumes typed React components. Phases D and E were retrofitted to call this DS emitter rather than recreate the depth.
  - **Phase G — packages/types + packages/utils.** Two stub workspace packages. `packages/types/src/index.ts` exports `AppEnv` (`'development' | 'production' | 'test'`), `Id<TBrand>` branded-string utility, and `NonEmptyArray<T>`. `packages/utils/src/index.ts` exports `cn(...classes)` (clsx-style class join), `isPresent<T>(value)` (`!== null && !== undefined`), and `assertNever(value)` (exhaustiveness check). Both packages ship with `tsconfig.json` extending the base, `package.json` declaring the workspace name, and `vitest` stub test files.
  - **Phase H — golden snapshots + E2E install gate.** Three new golden snapshots (`wc-storybook-monorepo`, `react-next-monorepo`, `react-vite-monorepo`) under `tests/golden/`. New `tests/e2e/monorepo-install.test.ts` gated by `E2E=1` runs an actual `pnpm install && pnpm type-check` against each flavor end-to-end (~33s for all three). The E2E gate is opt-in (not in default `pnpm test`) so CI doesn't pay the pnpm-install cost on every run, but every release captain runs it before tagging.
  - **Phase H follow-up — Phase F bug fixes.** Three regressions surfaced by the E2E gate: (1) `packages/design-system/package.json` was missing `@lit/react` despite the React wrappers barrel using `createComponent`; (2) `packages/design-system/tsconfig.json` `include` was too narrow to pick up the generated catalog; (3) the brand-tokens emitter cast `ColorTokens` to a wider union that broke the `tsc --noEmit` strict check. All three fixed and re-verified end-to-end.
  - **Phase I — docs + changeset.** This entry. Plus a final smoke that scaffolds an `aurora-monorepo`, runs `pnpm install` clean (394 packages added, 5.6s), and boots `pnpm dev` — Next.js reports `Ready in 257ms` at `http://localhost:3000`, Storybook reports `Storybook ready!` at `http://localhost:6006/`, and the catalog generator produces 99 entries (10 atoms / 82 molecules / 7 organisms) before the dev servers come up. Plus a new top-level `MIGRATING.md` spelling out the v0.6 → v0.7 mental-model shift and the manual flat → monorepo recipe for early adopters.

  **Visible UX changes consumers will notice immediately:**
  - _Two-step prompt._ BEFORE (v0.6.x): one prompt — "Which framework?" — returns a flat single-app project. AFTER (v0.7.0): two prompts — "What does this project build?" then "Include design-system package?" When the consumer keeps both defaults (`react-next` + yes), the output is a turbo monorepo with `apps/web/` and `packages/{design-system,types,utils}/`, not a single-app dir.
  - _Output shape for app frameworks._ BEFORE: `my-project/{src,public,package.json,…}` — flat. AFTER: `my-project/{apps/web,packages/{design-system,types,utils},pnpm-workspace.yaml,turbo.json,tsconfig.base.json,package.json}` — monorepo. The shape mirrors shadcn's `apps/web` + `packages/ui` precedent.
  - _Workspace deps._ BEFORE: `apps/web/package.json` (the only `package.json`) carries every npm dep directly. AFTER: `apps/web/package.json` carries `"@{scope}/design-system": "workspace:*"` (plus `types`, `utils`) and resolves them through `pnpm-workspace.yaml`; the actual npm deps live in each workspace package's own `package.json`.
  - _Dev server lifecycle._ BEFORE: `pnpm dev` runs a single Next.js/Vite dev server. AFTER: `pnpm dev` at the root runs `turbo run dev`, which boots `apps/web` (port 3000) and `packages/design-system` Storybook (port 6006) concurrently with shared logs.

  **Opt-out paths (preserve v0.6.x behavior):**
  - Interactive: answer "n" at Q2.
  - CLI: `--no-design-system`.
  - API: `scaffold({ framework: 'react-next', monorepoMode: false })`.

  **BREAKING — for NEW scaffolds only.** v0.5.x and v0.6.x scaffolds are unaffected; their flat shape is preserved on disk and the CLI does not auto-migrate them. New scaffolds default to the monorepo shape for `react-next` and `react-vite` only. See [`MIGRATING.md`](./MIGRATING.md) for the manual recipe.

  **Deferred to a future release:**
  - `create-helix migrate-to-monorepo` subcommand → v0.7.1.
  - Publishable design-system package (workspace-internal only in v0.7.0).
  - npm / yarn workspace support (pnpm-only).
  - `docs/FOLLOW-UP-v0.5.1-sync-tokens.md` punch list carries forward.

## 0.6.0

### Minor Changes

- ee08690: v0.6.0 — slim CLI, Iconography port, and `wc-storybook` becomes the default framework.

  The interactive framework prompt now leads with the `wc-storybook` design system factory and ships only the three production-tier templates by default (`wc-storybook`, `react-next`, `react-vite`). The other 13 framework templates are gated behind `--show-experimental` (or `HELIX_SHOW_EXPERIMENTAL=1`), which also controls visibility in the `list` subcommand and validity as `--template <name>` values — triple-consistent across the three discovery surfaces.
  - **Iconography port (Phase B)** — `wc-storybook` factory emits `src/stories/foundations/Iconography.mdx` and wires `@helixui/icons` via `setBasePath('/icons')` in `.storybook/preview.ts` plus `@helixui/icons/dist` in `staticDirs`. Foundations IA grows from 7 → 8 pages.
  - **Slim CLI (Phase C)** — 13 experimental templates hidden behind `--show-experimental`; triple-discoverability across prompt / list / `--template`.
  - **TUI banner polish (Phase D)** — `helixBanner()` extracted to `src/cli/banner.ts` with suppression flags, ANSI 256-color gradient, and version-check footer.
  - **Default framework swap (Phase E)** — `wc-storybook` is now the default interactive selection.
  - **Doctor extension (Phase F)** — six new v0.6.0 surface checks plus a `--quick` flag for CI.
  - **Catalog UX (Phase G)** — `pnpm cem:catalog` auto-runs after `pnpm install` so the ~99-entry hx-\* sidebar populates before the first `pnpm storybook` boot.
  - **Brand-verticals regression suite (Phase H)** — three targeted tests pinning the empty-array default across all three input paths.
  - **React-Vite production landing page** — landed pre-Phase B via the `dev → main` rebase that opened the release branch.

  **Visible UX changes consumers will notice immediately:**
  - _Default framework swap._ BEFORE: hitting Enter through every default produced a `react-next` project. AFTER: hitting Enter through every default produces a `wc-storybook` design system factory scaffold. `--template react-next` and `HELIX_TEMPLATE=react-next` continue to work for non-interactive consumers.
  - _Hidden experimental templates._ BEFORE: 16 frameworks visible in the prompt; experimental ones could be picked by accident. AFTER: 3 curated templates visible; the 13 experimentals are still scaffold-able via `--show-experimental` but no longer pollute the default experience.

## 0.6.0

### Minor Changes

- **Iconography port (Phase B)** — `wc-storybook` factory now emits
  `src/stories/foundations/Iconography.mdx` mirroring the helix
  `apps/storybook` icon catalog. `.storybook/preview.ts` calls
  `setBasePath('/icons')` against the `@helixui/icons` runtime and
  `.storybook/main.ts` adds `@helixui/icons/dist` to `staticDirs` so
  the page resolves icons against the consumer's installed icon
  bundle. Foundations IA grows from 7 → 8 pages.

- **Slim CLI (Phase C)** — the interactive framework prompt now shows
  only the three production-tier templates (`wc-storybook`,
  `react-next`, `react-vite`). The remaining 13 framework templates
  (`remix`, `vue-nuxt`, `vue-vite`, `sveltekit`, `angular`, `astro`,
  `lit-vite`, `solid-vite`, `qwik-vite`, `preact-vite`, `stencil`,
  `ember`, `vanilla`) are hidden behind `--show-experimental` (or
  `HELIX_SHOW_EXPERIMENTAL=1`). The flag also gates them in the `list`
  subcommand and as valid `--template <name>` values, so the surface
  is triple-consistent across prompt / list / direct selection.

  **Visible UX change.** BEFORE: 16 frameworks visible in the prompt;
  experimental ones could be selected by accident. AFTER: 3 curated
  templates visible; the 13 experimentals are still scaffold-able
  via the documented escape valve, but no longer pollute the default
  experience.

- **Default framework swap (Phase E)** — `wc-storybook` is now the
  default selection in the interactive framework prompt.

  **Visible UX change.** BEFORE: hitting Enter through every default
  produced a `react-next` project. AFTER: hitting Enter through every
  default produces a HELiX design system factory scaffold (the
  flagship). Consumers who want `react-next` now pick it explicitly.
  Both `--template react-next` and `HELIX_TEMPLATE=react-next`
  continue to work for non-interactive flows.

- **TUI banner polish (Phase D)** — banner extraction to
  `src/cli/banner.ts` with `helixBanner()` API. Banner suppression
  via `--no-banner` / `HELIX_NO_BANNER=1` / `isQuiet` / `--json`,
  ANSI 256-color gradient on the wordmark when the terminal advertises
  truecolor support (graceful fallback to default cyan otherwise),
  and a version-check footer that surfaces a one-line "newer version
  available" hint without blocking the prompt.

- **Doctor extension (Phase F)** — `helix doctor` gains six new
  surface checks: icons bundle presence, staticDirs wiring, catalog
  populated (warn if `src/stories/catalog/` is empty), preview
  setBasePath wiring, banner suppression flag detection, and an
  experimental-template indicator. New `--quick` flag skips
  filesystem-probe checks for CI use.

- **Catalog UX surfacing (Phase G)** — when scaffolding with
  `--install-deps` (default), the CLI now auto-runs `pnpm cem:catalog`
  (or `npm run cem:catalog` on the npm fallback path) immediately
  after the dependency install completes, so the ~99 hx-\* catalog
  stories are populated BEFORE the consumer boots Storybook the
  first time. When `--no-install` is used, the Next-steps banner
  explicitly pins `pnpm install && pnpm cem:catalog` so the catalog
  populates before first boot. Fixes the "where are the other
  components?" first-boot confusion where only the 8 hand-authored
  conformance pages were visible.

- **Brand-verticals regression suite (Phase H)** — adds three
  targeted tests pinning the empty-array default for `brandVerticals`
  across the prompt path, CLI flag path, and `--yes` path. Catches
  any future regression where a `[]` value gets coerced to a
  non-empty placeholder array.

- **React-Vite production landing page (pre-Phase B merge)** —
  `dev` was rebased onto `main` ahead of v0.6.0, bringing the
  `react-vite` production landing page redesign (commit `2c5ac42`)
  into the release.

### Patch Changes

_(none — all v0.6.0 work was bundled with the minor changes above.)_

## 0.5.0

### Minor Changes

- 817b26c: Add named config profiles support to .helixrc.json with --profile flag and config list-profiles command
- 90806c2: Add retry utility with exponential backoff for network operations.

  Introduces `src/retry.ts` — a generic `withRetry<T>` function that wraps any async operation with up to 3 configurable retry attempts, exponential backoff (initial 1 s, max 30 s) with full jitter, AbortSignal support, and TUI progress output ("Retrying... (attempt 2/3)"). Exhausting all retries throws a `HelixError` with code `HELIX_E010_RETRY_EXHAUSTED`. Applied to npm registry queries in `commands/upgrade.ts` and the network connectivity probe in `doctor.ts`.

- 05cd95a: Add structured logging with configurable levels and JSON output format.

  Introduces `src/logger.ts` — a lightweight singleton logger (no external deps) with four levels (debug, info, warn, error). Output format is JSON when `HELIX_LOG_FORMAT=json` (for log aggregators) and human-readable colored output otherwise. Log level is controlled via the `HELIX_LOG_LEVEL` env var or the `setLogLevel()` function (for `--log-level` flag integration). Debug-level messages capture file writes, template resolution, config loading, and validation steps. Scaffold verbose output and config warnings are now routed through the logger.

- 2d8203a: Add CLI version check that warns when a newer version is available on npm
- eb3320e: Add custom template override support via templateDir

  Enterprises can now point a `templateDir` field in `.helixrc.json` (or set
  `HELIX_TEMPLATE_DIR` env var) to a directory of JSON template definition files.
  Custom templates follow the same `TemplateConfig` interface and are shown in the
  interactive TUI selector with a `[custom]` badge. If a custom template shares an
  ID with a built-in one, the custom version wins.

- a09b12c: feat: add dependency vulnerability and license audit before scaffolding

  Adds `src/security/dep-audit.ts` that checks template dependencies against
  the npm registry advisory API for known vulnerabilities and verifies that all
  dependency licenses are enterprise-approved (MIT, Apache-2.0, BSD-\*, ISC, 0BSD)
  before writing package.json.
  - TUI shows `⚠ pkg@version has N severity vulnerabilities` warnings
  - TUI shows `⚠ pkg@version uses non-standard license: GPL-3.0` warnings
  - Network failures degrade gracefully — audit is skipped with a notice
  - `--skip-audit` flag bypasses the audit entirely (e.g. for offline/CI use)

- 16dcde2: Add programmatic API export (`create-helix/api`) for CI/CD pipelines and build tools. Exports `scaffold()`, `listTemplates()`, `listPresets()`, `getTemplate()`, and `validate()` — all pure functions with no `process.exit` calls and no TUI output.
- 35d8cd3: Add graceful degradation and offline mode support: detect offline state at startup, skip network checks in doctor, use cached registry data in upgrade, and add --offline flag.
- 461532b: Add `wc-storybook` framework — a Lit 3 + Storybook 10 design system factory. Scaffolds a parameterized component library with `HelixElement`-extending base class, Track 1/Track 2 inheritance patterns, full design token pipeline (`tokens.json` → `tokens.css` via `build-tokens.ts`, plus `tokens:sync` for Figma REST integration), and production-ready Storybook setup with a11y, autodocs, themes, and Playwright story tests.

  Two new CLI flags: `--ds-name` (design system codename, e.g. `bolt` → `bolt-button`, `BoltButton`) and `--token-prefix` (CSS custom property prefix, e.g. `--bolt` → `--bolt-color-primary-500`). Both prompt interactively when selecting the `wc-storybook` framework.

- 461532b: Align `wc-storybook` template with Helix 3.0 and ship every `hx-*` component
  in Storybook out of the box.
  - Centralize Helix library/tokens version pins at the top of `src/templates.ts`
    (`HELIX_LIBRARY_VERSION`, `HELIX_TOKENS_VERSION`) and bump wc-storybook to
    `@helixui/library@^3.0.0` + `@helixui/tokens@^3.0.0`. Other 16 framework
    templates intentionally remain on older Helix pins.
  - Ship `src/stories/HelixCatalog.stories.ts` (runtime overview) and
    `src/stories/_catalog-helpers.ts` (CEM walker, tier classifier, argTypes
    derivation, HIPAA exclusion per Figma Build Spec §5) in every scaffold.
  - Ship `scripts/generate-catalog.ts` and a `cem:catalog` package script that
    reads `node_modules/@helixui/library/custom-elements.json` and emits one
    `.stories.ts` file per non-excluded `hx-*` tag under `src/stories/catalog/`.
    Wired to run automatically before `pnpm storybook` and `pnpm build-storybook`
    so designers get the full component catalog from the first run.
  - Fix the Helix 3.0 `size` → `hx-size` attribute rename in the
    `${ds}-button` demo stories.
  - Remove the `${ds}-card/` demo component from the scaffold. `${ds}-button`
    remains as the single minimal extension example; every other Helix
    component renders via the catalog without manual story authoring.
  - Add `docs/figma-workstream.md` documenting the Separation-of-Concerns
    decision to keep Figma integration in the `booked/figma-tokens` sandbox
    until four promotion gates clear.

  **Breaking for consumers who depended on:**
  - `src/components/${ds}-card/` files existing in the scaffold output.
  - `${ClassName}Card` / `${ClassName}CardStyles` exports from the scaffolded
    `src/index.ts`.
  - The literal `size="sm|md|lg"` attribute working on Helix button demo
    stories (bind via `hx-size` in Helix 3.0).

  Consumers should run `pnpm install && pnpm cem:catalog` after upgrade to
  repopulate the catalog stories.

- 461532b: `wc-storybook` factory — port helix's MDX editorial depth + React helpers
  so a freshly scaffolded design system reaches ~277 sidebar entries on
  first boot (up from ~242).

  **New per-component conformance MDXes (`src/stories/components/`).** Seven
  new pages — `{ds}-card`, `{ds}-checkbox`, `{ds}-dialog`, `{ds}-form`,
  `{ds}-select`, `{ds}-tabs`, `{ds}-text-input` — parameterized by `dsName`
  and `tokenPrefix` so the consumer's namespace lands everywhere (e.g.
  `<aurora-card>` / `AuroraCard`). Each page composes the auto-injected
  A11yStatusCard, APGPatternCard, and ConsumerObligations panels.

  **New `Accessibility/*` namespace (`src/stories/accessibility/`).** Eight
  narrative pages: Dashboard, AAA Story Template, Keyboard Contracts,
  Success Criteria, Consumer Obligations, Focus Management, Contrast Deep
  Dive, Forced Colors, plus a `_snippets.ts` constants module. Positioned
  between Foundations and Patterns in `storySort`.

  **New scenes + token deep-dives.** Four cross-domain-neutral scene
  stories — `account-setup`, `team-dashboard`, `settings`, `Tokens`
  playground — and two token MDXes (Borders, Shadows). All scene content
  is generic SaaS/team-tool shaped (no domain-locked sample data).

  **Seven new React helper components (`src/stories/_components/`).**
  TokenSwatchGrid, ContrastMatrix, RatioCard, CodeBlock, CodeTabs,
  useResolvedToken, contrast (APCA util), plus TokenRef transitively.
  Shiki is added as a `devDependency` for syntax highlighting; consumers
  can opt out by deleting the component if they don't want the bundle
  weight.

  **InlineAuditPanel now opt-in.** The component renders nothing by default;
  consumers pass a `markdown` prop to surface AAA audit content. Replaces
  the prior live emission whose `?raw` AAA-AUDIT.md sourcing depended on
  monorepo-internal paths that don't survive a fresh scaffold install.

  **`Foundations/Tokens/*` taxonomy nested.** `storySort` now distinguishes
  `Foundations/<topic>.mdx` (Color, Typography, Spacing, Layout, Brand,
  Accessibility) from `Foundations/Tokens/<topic>.mdx` (Borders, Shadows,
  Playground) plus the existing token swatch stories.

  **Fix:** the wc-storybook scaffold's `tokens.json` fallback copy was
  bypassing the dry-run guard; routed through `safeCopyFile` so
  `scaffold({ dryRun: true })` no longer writes to disk.

  **Follow-up tracked at `docs/FOLLOW-UP-shared-storybook-kit.md`:** the
  deferred `@helixui/storybook-kit` shared-package extraction that would
  replace this hand-mirrored port pattern across helix/apps/storybook and
  create-helix-app. Trigger conditions documented.

  CI test matrix dropped Node 20 (Node 22 + 24 only); standalone jobs and
  `engines` keep their existing pins.

### Patch Changes

- 7abd262: Add comprehensive unit tests for CLI command modules: `info`, `list`, `config-validate`, and `upgrade`. Tests cover command output (TUI and JSON modes), error cases (missing files, network failures), validation logic, and upgrade orchestration.
- 069279e: Add comprehensive unit tests for validation, errors, and args modules
- 5db0ec7: Add performance benchmarks using vitest bench mode for scaffold time (all 15 frameworks), template resolution, project name validation, and config file parsing; includes baseline tracking and CI regression detection (warn-only, >20% threshold)
- e901a78: Deduplicate VALID_FRAMEWORKS and VALID_PRESETS arrays into single canonical definitions in src/validation.ts, eliminating drift risk between config-validator.ts and validation.ts.
- c289222: Add 'Plugins & Hooks' section to --help output documenting hook lifecycle events, .helixrc.json hooks configuration, and helix-plugin-\* auto-discovery.
- 4ae3724: Fix invalid preset error message in args.ts to include ecommerce as a valid preset, using VALID_PRESETS from the single source of truth
- db5f043: Add 'ember' to VALID_FRAMEWORKS array in src/validation.ts to ensure --template ember is accepted by CLI validation.
- 43bcaee: Improve error handling in config, doctor, upgrade, and config-validate to distinguish expected errors from unexpected ones
- 68c4bda: Fix failing upgrade-registry tests by aligning test fixtures with implementation contract
- 6f9f552: Remove vestigial barrel file src/presets/types.ts
- 60f3a5b: Add comprehensive unit tests for `src/cli.ts` (78 tests, 90%+ coverage across all metrics). Removes `cli.ts` from vitest coverage exclusions.
- 1d73ba6: Validate HELIX_TEMPLATE, HELIX_PRESET, and HELIX_BUNDLES environment variables against allowed values; invalid values log a warning and fall through to the interactive prompt.

## 0.4.0 (unreleased)

### Minor Changes

- **wc-storybook factory — brand-storytelling defaults**

  The flagship `wc-storybook` template now ships a fully-staged Storybook
  out of the box — Cover narrative + foundations IA + per-component AAA
  conformance pages + token-driven manager chrome with FOUC prevention.
  Same designer-grade experience the figma-tokens / Helix Web Component
  Starter Kit Figma library delivers in Figma.
  - **3 new brand prompts** — `brandTagline`, `brandVerticals`,
    `heroScenarios` (interactive only). All optional with cross-domain
    neutral defaults so `--yes` and CI flows continue to work.
  - **2 new CLI flags** — `--brand-tagline` and `--brand-verticals`
    (comma-separated). `heroScenarios` is interactive-only for v1.
  - **`helix.storybook.config.ts`** consumer knob with 5 sections:
    `components` / `docs` / `brand` / `aaa` / `narrative`. Default is
    "everything visible".
  - **4 new Storybook addons** matching upstream Helix —
    `@chromatic-com/storybook`, `@storybook/addon-designs`,
    `@storybook/addon-links`, `storybook-addon-pseudo-states`.
  - **5 React docs components** — `ConsumerObligations`,
    `InlineAuditPanel`, `APGPatternCard`, `A11yStatusCard`,
    `HelixDocsPage`. The `A11yStatusCard` auto-injects on every component
    autodocs page via the `HelixDocsPage` global container.
  - **FOUC sync scripts** — `manager-head.html` + `preview-head.html`
    pre-paint resolve theme/brand from URL globals → localStorage →
    `light` default. Same `helix:storybook:globals` localStorage key
    across both surfaces (regression guard test).
  - **Token-driven manager chrome** — `manager-theme.ts` reads
    `tokenEntries`, `darkTokenEntries`, `highContrastTokenEntries`,
    `resolveTokenRef` from `@helixui/tokens` and feeds resolved hex into
    `Storybook create()` ThemeVars. The previous hardcoded `#0066cc`
    primary is replaced with the consumer's per-mode brand color.
  - **3 docs CSS files** (a11y-card, brand-overrides, helix-docs;
    2,400 LOC total) bundled in `assets/wc-storybook/storybook-docs/`
    and copied into the consumer scaffold via `fs.copy`.
  - **10 narrative MDX pages** — `Cover.mdx`, `Overview.mdx`, 7 under
    `foundations/` (Tokens / Color / Typography / Spacing / Layout /
    Brand / Accessibility), and `patterns/Index.mdx`. All live-bind to
    consumer tokens via `var({prefix}-*)`.
  - **Reference per-component MDX** — `{ds}-button.mdx` with hero scene
    consuming `heroScenarios[0]` if matched, else neutral
    "Sign in to your workspace" default. Title resolves to
    `Components/{ClassName}Button/Conformance` to avoid Storybook
    indexer collision with auto-derived `.stories.ts` entries.
  - **Editorial-first storySort** in `preview.ts`:
    Cover → Overview → Accessibility → Foundations → Patterns →
    Playground → Components.
  - **52 new unit tests** in `wc-storybook-brand.test.ts` covering
    emitter outputs, prop-shape contracts, escape round-trip guards,
    FOUC localStorage-key contract, MDX-title disambiguation, brand
    prompt threading, and the 10-narrative-MDX file count.

  Existing `Welcome.stories.ts` + `HelixCatalog.stories.ts` +
  `design-tokens/*.stories.ts` continue to ship — storySort orders
  Cover above Welcome so the editorial flow leads.

- **wc-storybook factory — helix editorial-depth lift**

  Builds on the brand-storytelling foundation by porting the editorial
  depth that lives in HELiX's own `apps/storybook/`. Both repos are MIT
  / Clarity House LLC — port is licence-clean. The scaffolded consumer
  now reaches ~277 Storybook entries (up from ~242), roughly 80% of
  upstream HELiX's editorial depth.
  - **7 React helper components** ported from
    `helix/apps/storybook/stories/_components/` — `TokenSwatchGrid`,
    `ContrastMatrix`, `RatioCard`, `CodeBlock`, `CodeTabs`, plus
    `useResolvedToken` hook and APCA `contrast.ts` util. Each emitter
    lives in its own module under `src/scaffold/wc-storybook/helpers.ts`
    for grep-ability.
  - **7 component conformance MDXes** ported from
    `helix/apps/storybook/stories/components/` — `card`, `checkbox`,
    `dialog`, `form`, `select`, `tabs`, `text-input`. Each MDX
    parameterized by `dsName` so `<aurora-card>`, `<aurora-form>` etc.
    render the consumer's tags. Composition mirrors the existing button
    MDX (A11yStatusCard + APGPatternCard + ConsumerObligations).
  - **8 accessibility narrative MDXes** ported from
    `helix/apps/storybook/stories/accessibility/` — Dashboard, AAA
    Story Template, Keyboard Contracts, Success Criteria, Consumer
    Obligations, Focus Management, Contrast Deep-Dive, Forced Colors.
    Title-namespaced under top-level `Accessibility/*`.
  - **2 token deep-dives** ported from
    `helix/apps/storybook/stories/tokens/` — `Borders.mdx` and
    `Shadows.mdx`. Title-namespaced under `Foundations/Tokens/*`.
  - **3 cross-domain-neutral scene stories** ported from
    `helix/apps/storybook/stories/patterns/scenes/` — `Account Setup`
    (was patient-intake), `Team Dashboard` (was provider-dashboard),
    `Settings`. All healthcare-vertical references stripped per the
    cross-domain-neutral rule.
  - **`Tokens.stories.tsx` playground** ported verbatim from upstream
    `helix/apps/storybook/stories/playground/Tokens.stories.tsx` —
    already domain-neutral.
  - **`InlineAuditPanel` opt-in pattern** — the panel ships as a no-op
    stub rendering `null` by default. Consumers wire their own
    `markdown` prop to surface AAA-AUDIT.md content. The audit source
    lives at `packages/hx-library/src/components/hx-*/AAA-AUDIT.md`
    inside the HELiX monorepo and isn't published with
    `@helixui/library`, so we do not ship live audit rendering. See
    `docs/FOLLOW-UP-shared-storybook-kit.md` for trigger conditions
    that would make this live.
  - **Golden snapshot refresh** in
    `tests/golden/wc-storybook-scaffold/golden.test.ts` covers all
    new Phase 1-4 emitted files plus three new assertions: dsName
    parameterization reaches Phase 2 MDXes, no `<hx-*>` literal tags
    survive the port, and Phase 4 scenes contain no healthcare
    references.

  Adds `docs/FOLLOW-UP-shared-storybook-kit.md` documenting the
  deferred `@helixui/storybook-kit` extraction. Trigger conditions:
  2+ HELiX MDX drift events, consumer demand for live AAA-AUDIT.md
  rendering, or a third codebase wanting the same kit.

## 0.3.0

### Minor Changes

- 3c199f0: Migrate Remix template from @remix-run v2 to React Router v7
  - Replace all @remix-run/_ packages with react-router and @react-router/_ equivalents
  - Add app/routes.ts with file-based routing via @react-router/fs-routes
  - Add react-router.config.ts for SSR configuration
  - Fix tilde alias imports for server build compatibility
  - Remix template now builds correctly out of the box without workarounds

## 0.2.1

### Patch Changes

- 0298524: Fix Angular template TypeScript version range to use tilde (~5.5.0) instead of caret (^5.5.0), ensuring compatibility with Angular 18's TypeScript <5.6 requirement. Add tilde range support to dependency registry validation tests. Add workflow_dispatch trigger to release workflow.

## 0.2.0

### Minor Changes

- aa24cd6: Release v0.2.0: comprehensive CLI improvements, security hardening, and expanded test coverage
  - Add `list` and `info` CLI commands for framework/preset discovery
  - Add input validation with path traversal protection
  - Add ecommerce Drupal preset
  - Add error boundary components for React and Vue scaffolds
  - Add .editorconfig and .prettierrc to generated projects
  - Expand test suite to 1,264 tests (unit, integration, security)
  - Fix release workflow npm authentication

## 0.12.0

### Minor Changes

- feat: error boundary components for React and Vue generated templates
  - React ErrorBoundary.tsx with getDerivedStateFromError + componentDidCatch for react-next, react-vite, remix, preact-vite
  - Vue ErrorBoundary.vue with onErrorCaptured composition API for vue-vite, vue-nuxt
  - 1190+ tests across 52 test files

## 0.11.0

### Minor Changes

- security: input validation hardening and new info/list commands
  - Input validation: path traversal, null byte injection, type guards for framework/preset
  - `create-helix info <template>` command with --json support
  - `create-helix list` extracted to dedicated commands module
  - Comprehensive test coverage: 1100+ tests across 51 files

## 0.10.0

### Minor Changes

- feat: add upgrade command, verbose flag, and ecommerce Drupal preset
  - New `create-helix upgrade` subcommand to update existing HELiX projects
  - `--verbose` flag for detailed scaffolding output
  - New ecommerce Drupal preset with 8 commerce SDCs (product-card, cart-summary, etc.)
  - Integration tests for all Drupal preset scaffolding

## 0.9.0

### Minor Changes

- 2158f41: feat: add config file support (.helixrc.json) for default CLI options
  security: add CSP meta tag and sanitized HTML output in generated templates

## 0.8.1

### Patch Changes

- b3145fe: Refactor: extract CLI argument parser into dedicated `src/args.ts` module for better testability and maintainability.

## 0.8.0

### Minor Changes

- 3f2cc48: Add `create-helix list` subcommand to show available templates and presets (with --json support). Add --quiet/-q flag for CI-friendly minimal output. Add CI Node.js 20+22 version matrix. Add E2E smoke test to CI workflow. Add CLI argument validation unit tests.

## 0.7.4

### Patch Changes

- 12ecb2a: Add unit tests for Drupal preset configuration validation
- 2b0ddfc: Add --output-dir flag to specify custom output directory
- 8cc2cf3: Add unit tests for template configuration validation
- 7933f85: Add post-scaffold success summary with next steps
- b51ec43: Raise test coverage thresholds to 80%

## 0.7.3

### Patch Changes

- 7c24bff: Add --eslint and --no-eslint flags for non-interactive mode

## 0.7.2

### Patch Changes

- 283e2f2: Add --tokens and --no-tokens flags for design tokens in non-interactive mode
- 2fcfeb1: Add --version flag to CLI
- 60ad293: Improve --help output with grouped commands and examples

## 0.7.1

### Patch Changes

- 6211fa9: Add --dark-mode and --no-dark-mode flags for non-interactive mode
- 57a627d: Add Drupal preset integration tests
- e3cbd4b: Add Lit framework integration test
- 3724581: Add React-Vite framework integration test
- e97454a: Add Stencil framework integration test
- ddf4b1c: Add --typescript and --no-typescript flags for non-interactive mode
- d2479f6: Add Vanilla framework integration test
- 7543259: Add Vue-Vite framework integration test

## 0.7.0

### Minor Changes

- 412da5e: Add --bundles flag for non-interactive component bundle selection
- 0117dca: Add Stencil as a 14th framework target. Stencil is a compiler for building standards-based web components created by the Ionic team. It produces vanilla web components that work everywhere without a runtime dependency.

  Scaffolds: stencil.config.ts, src/components/my-component/my-component.tsx, src/components/my-component/my-component.css, and src/index.ts.

### Patch Changes

- 222b518: Add Preact framework integration test
- 6d14050: Expand Vue-Nuxt framework integration test coverage

## 0.6.0

### Minor Changes

- 427fad5: Add --force flag to overwrite existing directories
- 5598d18: Add Preact + Vite as a 13th framework template option for lightweight React-compatible projects

### Patch Changes

- 444bc78: Add graceful error handling for scaffold failures
- 5a77fa6: Add Lit web components integration test
- ad2339e: Add Qwik framework integration test

## 0.5.1

### Patch Changes

- ef0c8e1: Expand Astro framework integration test coverage

## 0.5.0

### Minor Changes

- 00de3a0: Add Lit + Vite as a framework template option. Lit is Google's lightweight library for building fast, reusable web components — a natural fit for HELiX's web component focus.
- 5feae49: Add --preset flag for non-interactive Drupal preset selection

### Patch Changes

- f1253b9: Expand Angular framework integration test coverage
- e9e2c96: Expand SvelteKit framework integration test coverage
- b3c06cd: Raise test coverage thresholds

## 0.4.0

### Minor Changes

- 3c84683: Add --template flag for non-interactive framework selection

### Patch Changes

- 7b7368d: Add input validation for project names
- d2ea4f0: Add --no-install flag to skip dependency installation
- 8e0f5b0: Add CI coverage reporting and README badges

## 0.3.0

### Minor Changes

- 9cdc15a: Add Qwik + Vite as a new framework template option. Qwik uses resumability with zero hydration cost and native web component support.

### Patch Changes

- 8b586cc: Add Remix framework integration test
- 6d99895: Add Solid.js framework integration test

## 0.2.1

### Patch Changes

- 98d03d0: Add `--dry-run` flag that shows files that would be created without writing them

## 0.2.0

### Minor Changes

- 3f0bd66: Add Solid.js + Vite as a new framework target with fine-grained reactivity support, native web component integration, and full feature flag compatibility.

### Patch Changes

- 2dd3335: Add --version / -v and --help / -h CLI flags

## 0.1.1

### Patch Changes

- 1c20f66: fix: ensure dist/index.js has shebang after TypeScript compilation so npm preserves the bin entry and npx create-helix works correctly
