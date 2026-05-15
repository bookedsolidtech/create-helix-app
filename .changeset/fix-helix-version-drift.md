---
'create-helix': patch
---

Fix HELiX dependency-version drift in scaffold templates + the `upgrade` command

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
